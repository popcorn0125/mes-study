import { describe, expect, it } from 'vitest'
import type { EquipmentPerformance, WorkOrder, WorkOrderDetail } from '@/api/workOrders'
import { actionsFor, countByStatus, dueState, estimateFinish, progressOf, toStages } from './workOrders'

const NOW = Date.parse('2026-10-28T06:00:00Z')

function workOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    workOrderId: 'WO-20261028-001',
    itemCode: 'MOTOR_A',
    itemName: 'BLDC 모터 표준형 A',
    plannedQty: 20,
    status: 'IN_PROGRESS',
    priority: 5,
    dueAt: null,
    createdAt: '2026-10-28T05:00:00Z',
    releasedAt: '2026-10-28T05:00:00Z',
    startedAt: '2026-10-28T05:00:00Z',
    completedAt: null,
    completedQty: 0,
    ...overrides,
  }
}

/** 설비 5대(기준 택트 45 · 40 · 50 · 30 · 25초)의 양품 수 */
function detail(goods: number[], overrides: Partial<WorkOrder> = {}): WorkOrderDetail {
  const tacts = [45, 40, 50, 30, 25]
  const performance: EquipmentPerformance[] = goods.map((good, i) => ({
    equipmentId: `EQ_${i}`,
    equipmentName: `설비 ${i}`,
    lineOrder: i + 1,
    standardTactSec: tacts[i],
    totalCount: good + (i === 0 ? 1 : 0),
    goodCount: good,
    badCount: i === 0 ? 1 : 0,
    defects: {},
  }))
  return { ...workOrder({ completedQty: goods[goods.length - 1], ...overrides }), performance }
}

describe('작업지시 화면 계산', () => {
  it('상태마다 서버가 허용하는 전환만 버튼으로 보인다', () => {
    expect(actionsFor('PLANNED')).toEqual(['release'])
    expect(actionsFor('IN_PROGRESS')).toEqual(['hold'])
    expect(actionsFor('HELD')).toEqual(['resume'])
    expect(actionsFor('COMPLETED')).toEqual([])
  })

  it('진척률은 포장 양품 / 지시 수량이고 100%를 넘지 않는다', () => {
    expect(progressOf({ completedQty: 5, plannedQty: 20 })).toBe(0.25)
    expect(progressOf({ completedQty: 21, plannedQty: 20 })).toBe(1)
  })

  it('상태별로 세고, 완료는 오늘 완료한 것만 센다', () => {
    const list = [
      workOrder(),
      workOrder({ status: 'RELEASED' }),
      workOrder({ status: 'RELEASED' }),
      workOrder({ status: 'COMPLETED', completedAt: new Date(NOW - 60_000).toISOString() }),
      workOrder({ status: 'COMPLETED', completedAt: new Date(NOW - 3 * 86_400_000).toISOString() }),
    ]

    expect(countByStatus(list, NOW)).toEqual({ IN_PROGRESS: 1, RELEASED: 2, HELD: 0, PLANNED: 0, COMPLETED: 1 })
  })

  it('예상 완료 = 남은 수량 × 병목 택트, 포장이 아직 0개면 라인이 차는 시간을 더한다', () => {
    expect(estimateFinish(detail([12, 11, 10, 10, 10]), NOW)).toBe(NOW + 10 * 50 * 1000)
    // 45 + 40 + 30 + 25 = 140초(병목 50초를 뺀 나머지)
    expect(estimateFinish(detail([1, 0, 0, 0, 0]), NOW)).toBe(NOW + (20 * 50 + 140) * 1000)
    expect(estimateFinish(detail([0, 0, 0, 0, 0], { status: 'RELEASED' }), NOW)).toBeUndefined()
  })

  it('납기: 지났거나 늦게 완료하면 늦음, 예상 완료가 납기 뒤면 위험', () => {
    const due = new Date(NOW + 3_600_000).toISOString()
    expect(dueState(workOrder(), NOW, NOW)).toBeUndefined()
    expect(dueState(workOrder({ dueAt: due }), NOW + 60_000, NOW)).toBe('ok')
    expect(dueState(workOrder({ dueAt: due }), NOW + 7_200_000, NOW)).toBe('risk')
    expect(dueState(workOrder({ dueAt: new Date(NOW - 1).toISOString() }), undefined, NOW)).toBe('late')
    expect(dueState(workOrder({ dueAt: due, status: 'COMPLETED', completedAt: new Date(NOW + 7_200_000).toISOString() }), undefined, NOW)).toBe('late')
  })

  it('공정별 진척에 다음 공정이 아직 끝내지 않은 재공을 붙인다', () => {
    const stages = toStages(detail([12, 11, 8, 8, 7]))

    expect(stages.map((s) => s.waiting)).toEqual([1, 3, 0, 1, undefined])
    expect(stages[0]).toMatchObject({ goodCount: 12, badCount: 1, ratio: 0.6 })
  })
})
