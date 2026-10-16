import { describe, expect, it } from 'vitest'
import { createBaselineMaster } from '@/scenarios/baseline'
import { SimEngine } from '@/sim/engine'
import type { MasterData, WorkOrder } from './types'
import {
  averageWorkOrderLeadTime,
  dueStatus,
  estimateCompletion,
  onTimeRate,
  routingProgress,
  statusCounts,
  workOrderTimes,
} from './workOrders'

const HOUR = 3600

/** 불량·고장·자재 제약을 뺀 기준정보: 예상 완료 계산이 실제와 맞는지 보기 위해 쓴다 */
function idealMaster(): MasterData {
  const master = createBaselineMaster()
  for (const routing of master.routings) {
    for (const op of routing.operations) op.defectRate = 0
  }
  for (const eq of master.equipment) delete eq.reliability
  master.bom = []
  return master
}

function wo(fields: Partial<WorkOrder>): WorkOrder {
  return {
    id: 'WO-001',
    itemId: 'MOTOR-A',
    qty: 10,
    priority: 0,
    dueTime: null,
    status: 'RELEASED',
    statusBeforeHold: null,
    releasedQty: 0,
    goodQty: 0,
    scrapQty: 0,
    createdAt: 0,
    releasedAt: 0,
    startedAt: null,
    completedAt: null,
    ...fields,
  }
}

describe('statusCounts', () => {
  it('상태별 건수를 센다(없는 상태는 0)', () => {
    const engine = new SimEngine(idealMaster(), { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 5 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 5, release: true })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-B', qty: 5, release: true })
    engine.tick()
    expect(statusCounts(engine.state)).toEqual({ PLANNED: 1, RELEASED: 1, IN_PROGRESS: 1, HELD: 0, COMPLETED: 0 })
  })
})

describe('routingProgress', () => {
  it('공정마다 통과·가공 중·대기 수를 세고, 합이 투입 수량과 맞는다', () => {
    const master = idealMaster()
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 20, release: true })
    engine.run(600)
    const rows = routingProgress(engine.state, master, 'WO-001')
    expect(rows.map((r) => r.seq)).toEqual([10, 20, 30, 40, 50])
    const [first, , , , last] = rows
    // 첫 공정: 통과 + 가공 중 + 대기 = 투입 수량
    expect(first.passed + first.processing + first.queued).toBe(engine.state.workOrders[0].releasedQty)
    expect(last.passed).toBe(engine.state.workOrders[0].goodQty)
    // 앞 공정을 통과한 수 = 다음 공정에 있는 수 + 다음 공정을 통과한 수
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].passed).toBe(rows[i].passed + rows[i].processing + rows[i].queued + rows[i].defect)
    }
    expect(routingProgress(engine.state, master, 'WO-999')).toEqual([])
  })

  it('불량은 그 공정의 defect로 센다', () => {
    const master = idealMaster()
    master.routings[0].operations[1].defectRate = 1 // 권선에서 모두 불량
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 3, release: true })
    engine.run(600)
    const rows = routingProgress(engine.state, master, 'WO-001')
    expect(rows[1]).toMatchObject({ passed: 0, defect: 3 })
    expect(rows[2].passed).toBe(0)
  })
})

describe('estimateCompletion', () => {
  it('불량·고장이 없으면 실제 완료 시각과 거의 같다', () => {
    const master = idealMaster()
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 20, release: true })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-B', qty: 20, release: true })
    engine.run(900) // 라인이 찬 뒤에 예상한다
    const eta = estimateCompletion(engine.state, master)
    engine.run(3 * HOUR)
    for (const order of engine.state.workOrders) {
      expect(Math.abs(eta.get(order.id)! - order.completedAt!)).toBeLessThan(120)
    }
  })

  it('투입 순서 규칙대로 줄을 세우고, 계획·보류·완료 작업지시는 예상하지 않는다', () => {
    const master = idealMaster()
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 10, release: true })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 10, dueTime: HOUR, release: true })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 10 })
    engine.applyPendingCommands()
    const fifo = estimateCompletion(engine.state, master)
    expect(fifo.get('WO-001')! < fifo.get('WO-002')!).toBe(true)
    expect(fifo.has('WO-003')).toBe(false)

    engine.dispatch({ type: 'SET_DISPATCH_RULE', rule: 'EDD' })
    engine.dispatch({ type: 'HOLD_WORK_ORDER', workOrderId: 'WO-001' })
    engine.applyPendingCommands()
    const edd = estimateCompletion(engine.state, master)
    expect(edd.has('WO-001')).toBe(false)
    // 병목(조립 50초) × 10대 + 병목 뒤 공정(검사 30 + 포장 25초)
    expect(edd.get('WO-002')).toBe(10 * 50 + 55)
  })

  it('병목을 증설하면 예상 완료가 앞당겨진다', () => {
    const master = idealMaster()
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 40, release: true })
    engine.applyPendingCommands()
    const before = estimateCompletion(engine.state, master).get('WO-001')!
    engine.dispatch({ type: 'ADD_EQUIPMENT', workCenterId: 'ASSEMBLY' })
    engine.applyPendingCommands()
    const after = estimateCompletion(engine.state, master).get('WO-001')!
    // 조립 2대 → 병목이 가공(45초)으로 넘어간다. 마지막 1대는 뒤 공정을 한 번씩 지난다(권선 40 + 조립 50 + 검사 30 + 포장 25)
    expect(after).toBe(40 * 45 + 40 + 50 + 30 + 25)
    expect(after).toBeLessThan(before)
  })
})

describe('dueStatus', () => {
  it('완료면 준수·지연 완료, 미완료면 예상 완료와 납기를 비교한다', () => {
    expect(dueStatus(wo({}), 500, 0)).toEqual({ kind: 'NONE', slack: null })
    expect(dueStatus(wo({ dueTime: 1000, completedAt: 900 }), null, 2000)).toEqual({ kind: 'MET', slack: 100 })
    expect(dueStatus(wo({ dueTime: 1000, completedAt: 1100 }), null, 2000)).toEqual({ kind: 'LATE_DONE', slack: -100 })
    expect(dueStatus(wo({ dueTime: 1000 }), 800, 100)).toEqual({ kind: 'ON_TRACK', slack: 200 })
    expect(dueStatus(wo({ dueTime: 1000 }), 1300, 100)).toEqual({ kind: 'AT_RISK', slack: -300 })
    expect(dueStatus(wo({ dueTime: 1000 }), 1300, 1200)).toEqual({ kind: 'OVERDUE', slack: -200 })
    expect(dueStatus(wo({ dueTime: 1000, status: 'HELD' }), null, 400)).toEqual({ kind: 'UNKNOWN', slack: 600 })
  })
})

describe('납기 준수율 · 리드타임', () => {
  it('납기가 있는 완료 작업지시만 센다', () => {
    const engine = new SimEngine(idealMaster(), { seed: 1 })
    expect(onTimeRate(engine.state)).toBeNull()
    expect(averageWorkOrderLeadTime(engine.state)).toBeNull()
    engine.state.workOrders.push(
      wo({ id: 'A', dueTime: 1000, releasedAt: 0, completedAt: 900 }),
      wo({ id: 'B', dueTime: 1000, releasedAt: 100, completedAt: 1200 }),
      wo({ id: 'C', releasedAt: 0, completedAt: 500 }),
      wo({ id: 'D', dueTime: 10 }),
    )
    expect(onTimeRate(engine.state)).toBe(0.5)
    expect(averageWorkOrderLeadTime(engine.state)).toBe((900 + 1100 + 500) / 3)
  })

  it('대기 시간 = 첫 투입 − 하달, 작업 시간 = 완료 − 첫 투입', () => {
    expect(workOrderTimes(wo({ releasedAt: null, status: 'PLANNED' }), 50)).toEqual({ wait: null, work: null, leadTime: null })
    expect(workOrderTimes(wo({ releasedAt: 100 }), 250)).toEqual({ wait: 150, work: null, leadTime: null })
    expect(workOrderTimes(wo({ releasedAt: 100, startedAt: 160 }), 400)).toEqual({ wait: 60, work: 240, leadTime: null })
    expect(workOrderTimes(wo({ releasedAt: 100, startedAt: 160, completedAt: 900 }), 2000)).toEqual({
      wait: 60,
      work: 740,
      leadTime: 800,
    })
  })
})
