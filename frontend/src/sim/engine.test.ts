import { describe, expect, it } from 'vitest'
import type { MasterData, SimState } from '@/domain/types'
import { averageLeadTime, bottleneck, effectiveCycleTimes, oee, throughputPerHour, wip, yieldRate } from '@/domain/kpi'
import { createBaselineMaster } from '@/scenarios/baseline'
import { SimEngine } from './engine'

const HOUR = 3600

/** 흐름·병목만 보도록 불량, 마모·고장, 자재 제약을 모두 뺀 기준정보 */
function idealMaster(): MasterData {
  const master = createBaselineMaster()
  for (const routing of master.routings) {
    for (const op of routing.operations) op.defectRate = 0
  }
  for (const eq of master.equipment) delete eq.reliability
  master.bom = []
  return master
}

function startEngine(master: MasterData, qty: number, seed = 1): SimEngine {
  const engine = new SimEngine(master, { seed })
  engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty })
  engine.dispatch({ type: 'RELEASE_WORK_ORDER', workOrderId: 'WO-001' })
  return engine
}

/** 실제 Unit 상태를 세어 카운터와 일치하는지, 투입 = 양품 + 폐기 + WIP 가 성립하는지 확인한다. */
function expectConservation(state: SimState) {
  const units = Object.values(state.units)
  const inFlight = units.filter((u) => u.status === 'QUEUED' || u.status === 'PROCESSING').length
  const completed = units.filter((u) => u.status === 'COMPLETED').length
  const scrapped = units.filter((u) => u.status === 'SCRAPPED').length
  expect(units.length).toBe(state.counters.released)
  expect(completed).toBe(state.counters.completed)
  expect(scrapped).toBe(state.counters.scrapped)
  expect(state.counters.released).toBe(completed + scrapped + inFlight)
  expect(wip(state)).toBe(inFlight)
}

/** 일정 구간 동안 매 tick WIP를 샘플링해 평균을 낸다. */
function averageWip(engine: SimEngine, seconds: number): number {
  let sum = 0
  for (let i = 0; i < seconds; i++) {
    engine.tick()
    sum += wip(engine.state)
  }
  return sum / seconds
}

describe('작업지시 흐름', () => {
  it('하달된 작업지시가 5개 공정을 순서대로 거쳐 완료된다', () => {
    const engine = startEngine(idealMaster(), 10)
    engine.run(1000)

    const wo = engine.state.workOrders[0]
    expect(wo.status).toBe('COMPLETED')
    expect(wo.goodQty).toBe(10)
    expect(wo.scrapQty).toBe(0)
    for (const unit of Object.values(engine.state.units)) {
      expect(unit.history.map((h) => h.opSeq)).toEqual([10, 20, 30, 40, 50])
    }
    // 표준 사이클타임 합(45+40+50+30+25=190초)보다 빨리 끝날 수는 없다.
    expect(averageLeadTime(engine.state)).toBeGreaterThanOrEqual(190)
  })

  it('하달 전(PLANNED)에는 투입되지 않고 설비는 IDLE이다', () => {
    const engine = new SimEngine(idealMaster(), { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 5 })
    engine.run(100)
    expect(engine.state.counters.released).toBe(0)
    expect(engine.state.equipment.every((eq) => eq.status === 'IDLE')).toBe(true)
  })

  it('보류하면 신규 투입이 멈추고, 재하달하면 다시 투입된다', () => {
    const engine = startEngine(idealMaster(), 50)
    engine.run(100)
    engine.dispatch({ type: 'HOLD_WORK_ORDER', workOrderId: 'WO-001' })
    engine.tick()
    const releasedAtHold = engine.state.workOrders[0].releasedQty
    expect(engine.state.workOrders[0].status).toBe('HELD')

    engine.run(600)
    expect(engine.state.workOrders[0].releasedQty).toBe(releasedAtHold)

    engine.dispatch({ type: 'RELEASE_WORK_ORDER', workOrderId: 'WO-001' })
    engine.run(300)
    expect(engine.state.workOrders[0].status).toBe('IN_PROGRESS')
    expect(engine.state.workOrders[0].releasedQty).toBeGreaterThan(releasedAtHold)
  })

  it('우선순위가 높은 작업지시가 먼저 투입된다', () => {
    const engine = new SimEngine(idealMaster(), { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 20, priority: 0 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-B', qty: 20, priority: 5 })
    engine.dispatch({ type: 'RELEASE_WORK_ORDER', workOrderId: 'WO-001' })
    engine.dispatch({ type: 'RELEASE_WORK_ORDER', workOrderId: 'WO-002' })
    engine.tick()
    const firstUnits = Object.values(engine.state.units)
    expect(firstUnits.length).toBeGreaterThan(0)
    expect(firstUnits.every((u) => u.workOrderId === 'WO-002')).toBe(true)
  })

  it('우선순위를 바꾸면 다음 투입부터 반영된다', () => {
    const engine = new SimEngine(idealMaster(), { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 50 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-B', qty: 50 })
    engine.dispatch({ type: 'RELEASE_WORK_ORDER', workOrderId: 'WO-001' })
    engine.dispatch({ type: 'RELEASE_WORK_ORDER', workOrderId: 'WO-002' })
    engine.run(300)
    expect(engine.state.workOrders[1].releasedQty).toBe(0) // 같은 우선순위면 먼저 하달된 WO-001부터

    engine.dispatch({ type: 'SET_WORK_ORDER_PRIORITY', workOrderId: 'WO-002', priority: 10 })
    engine.run(300)
    expect(engine.state.workOrders[1].priority).toBe(10)
    expect(engine.state.workOrders[1].releasedQty).toBeGreaterThan(0)
    expect(engine.state.events.some((e) => e.type === 'WORK_ORDER_PRIORITY_CHANGED')).toBe(true)
  })

  it('투입 순서 규칙: FIFO는 하달 순, EDD는 납기 빠른 순(우선순위 무시)', () => {
    const firstWorkOrder = (rule: 'FIFO' | 'EDD') => {
      const engine = new SimEngine(idealMaster(), { seed: 1 })
      engine.dispatch({ type: 'SET_DISPATCH_RULE', rule })
      engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 20, dueTime: 3 * HOUR, release: true })
      engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 20, priority: 9, release: true })
      engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-B', qty: 20, dueTime: HOUR, release: true })
      engine.tick()
      const owners = new Set(Object.values(engine.state.units).map((u) => u.workOrderId))
      expect(owners.size).toBe(1)
      return [...owners][0]
    }
    expect(firstWorkOrder('FIFO')).toBe('WO-001')
    expect(firstWorkOrder('EDD')).toBe('WO-003')
  })

  it('기본 규칙은 우선순위이고, 규칙을 바꾸면 이벤트를 남긴다(같은 규칙이면 무시)', () => {
    const engine = new SimEngine(idealMaster(), { seed: 1 })
    expect(engine.state.dispatchRule).toBe('PRIORITY')
    engine.dispatch({ type: 'SET_DISPATCH_RULE', rule: 'PRIORITY' })
    engine.dispatch({ type: 'SET_DISPATCH_RULE', rule: 'EDD' })
    engine.applyPendingCommands()
    expect(engine.state.dispatchRule).toBe('EDD')
    expect(engine.state.events.filter((e) => e.type === 'DISPATCH_RULE_CHANGED')).toHaveLength(1)
  })

  it('첫 제품을 투입한 시각을 startedAt에 남긴다', () => {
    const engine = new SimEngine(idealMaster(), { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 50, release: true })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 5, release: true })
    engine.run(10)
    const [first, second] = engine.state.workOrders
    expect(first.startedAt).toBe(0)
    expect(second.startedAt).toBeNull() // 앞 작업지시가 첫 버퍼를 채우고 있어 아직 대기
    engine.run(3000)
    expect(second.startedAt).toBeGreaterThan(second.releasedAt!)
    expect(second.completedAt).toBeGreaterThan(second.startedAt!)
  })

  it('release 옵션으로 생성하면 바로 하달된다', () => {
    const engine = new SimEngine(idealMaster(), { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 5, release: true })
    engine.tick()
    expect(engine.state.workOrders[0].status).toBe('IN_PROGRESS')
    expect(engine.state.counters.released).toBe(5)
  })

  it('applyPendingCommands는 시간을 진행하지 않고 명령만 적용한다', () => {
    const engine = new SimEngine(idealMaster(), { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 5 })
    engine.dispatch({ type: 'RELEASE_WORK_ORDER', workOrderId: 'WO-001' })
    engine.applyPendingCommands()
    expect(engine.state.time).toBe(0)
    expect(engine.state.workOrders[0].status).toBe('RELEASED')
    expect(engine.state.counters.released).toBe(0) // 투입은 tick에서 일어난다
  })

  it('불량은 폐기되고, 양품+폐기가 지시 수량에 도달하면 작업지시가 완료된다', () => {
    const master = idealMaster()
    master.routings[0].operations[3].defectRate = 1 // 검사에서 전량 불량
    const engine = startEngine(master, 5)
    engine.run(1000)
    const wo = engine.state.workOrders[0]
    expect(wo.status).toBe('COMPLETED')
    expect(wo.scrapQty).toBe(5)
    expect(wo.goodQty).toBe(0)
    expect(yieldRate(engine.state)).toBe(0)
    expect(engine.state.events.some((e) => e.type === 'UNIT_SCRAPPED')).toBe(true)
  })
})

describe('불변식', () => {
  it('모든 tick에서 투입 = 양품 + 폐기 + WIP (보존 법칙)', () => {
    const engine = startEngine(createBaselineMaster(), 200, 7)
    for (let i = 0; i < 4 * HOUR; i++) {
      engine.tick()
      expectConservation(engine.state)
    }
    expect(engine.state.counters.scrapped).toBeGreaterThan(0)
  })

  it('같은 seed와 같은 명령이면 결과가 같고, seed가 다르면 달라진다', () => {
    const run = (seed: number) => {
      const engine = startEngine(createBaselineMaster(), 200, seed)
      engine.run(4 * HOUR)
      return JSON.stringify(engine.state)
    }
    expect(run(42)).toBe(run(42))
    expect(run(42)).not.toBe(run(43))
  })
})

describe('설비 상태와 병목', () => {
  it('조립이 느리면 상류는 BLOCKED, 하류는 STARVED 시간이 생긴다', () => {
    const engine = startEngine(idealMaster(), 1000)
    engine.dispatch({ type: 'SET_CYCLE_TIME', workCenterId: 'ASSEMBLY', cycleTime: 90 })
    engine.run(2 * HOUR)

    const eq = (id: string) => engine.state.equipment.find((e) => e.id === id)!
    expect(eq('WINDING-1').statusTime.BLOCKED).toBeGreaterThan(0)
    expect(eq('INSPECTION-1').statusTime.STARVED).toBeGreaterThan(0)
    expect(bottleneck(engine.master, engine.state)?.workCenterId).toBe('ASSEMBLY')
  })

  it('S1: 병목(조립)을 증설하면 UPH가 오르고 WIP가 줄지만, 비병목(가공)을 빠르게 해도 UPH는 그대로다', () => {
    const scenario = (action?: (engine: SimEngine) => void) => {
      const engine = startEngine(idealMaster(), 2000)
      engine.dispatch({ type: 'SET_CYCLE_TIME', workCenterId: 'ASSEMBLY', cycleTime: 90 })
      action?.(engine)
      engine.run(HOUR) // 워밍업
      const avgWip = averageWip(engine, 2 * HOUR)
      return { uph: throughputPerHour(engine.state), avgWip }
    }

    const before = scenario()
    const fasterMachining = scenario((e) =>
      e.dispatch({ type: 'SET_CYCLE_TIME', workCenterId: 'MACHINING', cycleTime: 30 }),
    )
    const addAssembly = scenario((e) => e.dispatch({ type: 'ADD_EQUIPMENT', workCenterId: 'ASSEMBLY' }))

    // 병목 사이클타임 90초 → 이론 UPH 40
    expect(before.uph).toBeCloseTo(40, 0)
    // 비병목 개선: 생산량은 그대로, WIP는 줄지 않는다
    expect(fasterMachining.uph).toBeCloseTo(before.uph, 0)
    expect(fasterMachining.avgWip).toBeGreaterThanOrEqual(before.avgWip - 0.5)
    // 병목 증설: 조립 실효 CT 45초 → 다음 병목인 가공(45초)과 같아져 UPH ≈ 80
    expect(addAssembly.uph).toBeGreaterThan(before.uph * 1.8)
    expect(addAssembly.avgWip).toBeLessThan(before.avgWip)
  })

  it('병목은 부하(사이클타임 ÷ 설비 대수) 기준이며, 병목을 증설하면 다음 병목으로 넘어간다', () => {
    const engine = startEngine(idealMaster(), 100)
    engine.tick()
    // 시작 직후에도 첫 공정이 아니라 가장 느린 조립(50초)이 병목
    expect(bottleneck(engine.master, engine.state)).toEqual({ workCenterId: 'ASSEMBLY', effectiveCycleTime: 50, maxUph: 72 })

    engine.dispatch({ type: 'ADD_EQUIPMENT', workCenterId: 'ASSEMBLY' })
    engine.tick()
    // 조립 실효 CT 25초 → 하우징 가공(45초)이 새 병목
    expect(bottleneck(engine.master, engine.state)?.workCenterId).toBe('MACHINING')
  })

  it('품목별 사이클타임은 남은 작업지시 수량으로 가중 평균한다', () => {
    const engine = new SimEngine(idealMaster(), { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 10, release: true }) // 조립 50초
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-B', qty: 30, release: true }) // 조립 60초
    engine.applyPendingCommands()
    expect(effectiveCycleTimes(engine.master, engine.state).get('ASSEMBLY')).toBeCloseTo((10 * 50 + 30 * 60) / 40)
  })

  it('표준보다 느린 사이클타임은 OEE 성능을 떨어뜨린다', () => {
    const engine = startEngine(idealMaster(), 1000)
    engine.dispatch({ type: 'SET_CYCLE_TIME', workCenterId: 'ASSEMBLY', cycleTime: 100 })
    engine.run(2 * HOUR)
    const assembly = oee(engine.state.equipment.find((e) => e.id === 'ASSEMBLY-1')!)
    expect(assembly.performance).toBeCloseTo(50 / 100, 1)
    expect(assembly.quality).toBe(1)
  })
})

describe('명령 검증', () => {
  it('존재하지 않는 대상이나 잘못된 값은 dispatch 시점에 거부한다', () => {
    const engine = new SimEngine(createBaselineMaster(), { seed: 1 })
    expect(() => engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'NOPE', qty: 1 })).toThrow()
    expect(() => engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 0 })).toThrow()
    expect(() => engine.dispatch({ type: 'RELEASE_WORK_ORDER', workOrderId: 'WO-999' })).toThrow()
    expect(() => engine.dispatch({ type: 'SET_CYCLE_TIME', workCenterId: 'ASSEMBLY', cycleTime: 0 })).toThrow()
    expect(() => engine.dispatch({ type: 'ADD_EQUIPMENT', workCenterId: 'NOPE' })).toThrow()
  })

  it('알 수 없는 작업장을 참조하는 라우팅은 엔진 생성 시 거부한다', () => {
    const master = createBaselineMaster()
    master.routings[0].operations[0].workCenterId = 'NOPE'
    expect(() => new SimEngine(master, { seed: 1 })).toThrow()
  })
})

describe('생산 계획', () => {
  const PLAN = { startTime: 0, duration: 8 * HOUR, lines: [{ itemId: 'MOTOR-A', targetQty: 360 }, { itemId: 'MOTOR-B', targetQty: 120 }] }

  it('계획을 저장하고 이벤트를 남기며, 다시 설정하면 교체한다', () => {
    const engine = new SimEngine(createBaselineMaster(), { seed: 1 })
    expect(engine.state.plan).toBeNull()

    engine.dispatch({ type: 'SET_PRODUCTION_PLAN', plan: PLAN })
    engine.applyPendingCommands()
    expect(engine.state.plan).toEqual({ id: 'PLAN-001', ...PLAN })
    expect(engine.state.events.at(-1)).toMatchObject({ type: 'PLAN_SET', refId: 'PLAN-001', severity: 'info' })

    engine.dispatch({ type: 'SET_PRODUCTION_PLAN', plan: { ...PLAN, lines: [{ itemId: 'MOTOR-A', targetQty: 100 }] } })
    engine.applyPendingCommands()
    expect(engine.state.plan?.id).toBe('PLAN-002')
    expect(engine.state.plan?.lines).toEqual([{ itemId: 'MOTOR-A', targetQty: 100 }])
  })

  it('명령 객체를 나중에 고쳐도 저장된 계획은 바뀌지 않는다', () => {
    const engine = new SimEngine(createBaselineMaster(), { seed: 1 })
    const plan = structuredClone(PLAN)
    engine.dispatch({ type: 'SET_PRODUCTION_PLAN', plan })
    engine.applyPendingCommands()
    plan.lines[0].targetQty = 1
    expect(engine.state.plan?.lines[0].targetQty).toBe(360)
  })

  it('계획은 기준값일 뿐 생산 동작을 바꾸지 않는다', () => {
    const withoutPlan = startEngine(createBaselineMaster(), 50, 7)
    const withPlan = startEngine(createBaselineMaster(), 50, 7)
    withPlan.dispatch({ type: 'SET_PRODUCTION_PLAN', plan: PLAN })
    withoutPlan.run(2 * HOUR)
    withPlan.run(2 * HOUR)
    expect(withPlan.state.records).toEqual(withoutPlan.state.records)
    expect(withPlan.state.counters).toEqual(withoutPlan.state.counters)
  })

  it('잘못된 계획은 dispatch 시점에 거부한다', () => {
    const engine = new SimEngine(createBaselineMaster(), { seed: 1 })
    const dispatchPlan = (plan: typeof PLAN) => () => engine.dispatch({ type: 'SET_PRODUCTION_PLAN', plan })
    expect(dispatchPlan({ ...PLAN, duration: 0 })).toThrow()
    expect(dispatchPlan({ ...PLAN, lines: [] })).toThrow()
    expect(dispatchPlan({ ...PLAN, lines: [{ itemId: 'NOPE', targetQty: 10 }] })).toThrow()
    expect(dispatchPlan({ ...PLAN, lines: [{ itemId: 'MOTOR-A', targetQty: 0 }] })).toThrow()
  })
})
