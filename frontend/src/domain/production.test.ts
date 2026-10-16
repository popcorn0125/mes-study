import { describe, expect, it } from 'vitest'
import { createBaselineMaster } from '@/scenarios/baseline'
import { SimEngine } from '@/sim/engine'
import { hourlyOutput, lineOee, lotDueTimes, planAttainment, plannedQtyAt, plannedUph, recentAlarms, splitIntoLots } from './production'
import type { ProductionPlan, SimEvent, SimState, Unit } from './types'

const HOUR = 3600
const PLAN: ProductionPlan = {
  id: 'PLAN-001',
  startTime: 0,
  duration: 8 * HOUR,
  lines: [
    { itemId: 'MOTOR-A', targetQty: 360 },
    { itemId: 'MOTOR-B', targetQty: 120 },
  ],
}

function emptyState(): SimState {
  return new SimEngine(createBaselineMaster(), { seed: 1 }).state
}

/** 지정한 시각들에 완료된 양품 Unit을 상태에 넣는다 */
function withCompleted(state: SimState, finishedAts: number[]): SimState {
  finishedAts.forEach((finishedAt, i) => {
    const unit: Unit = {
      id: `U-${i}`,
      workOrderId: 'WO-001',
      itemId: 'MOTOR-A',
      opIndex: 4,
      status: 'COMPLETED',
      releasedAt: 0,
      finishedAt,
      history: [],
    }
    state.units[unit.id] = unit
  })
  state.counters.completed += finishedAts.length
  return state
}

describe('splitIntoLots', () => {
  it('계획을 로트로 나누고, 품목을 목표 비율대로 번갈아 배치한다', () => {
    const lots = splitIntoLots(
      [
        { itemId: 'A', targetQty: 360 },
        { itemId: 'B', targetQty: 120 },
      ],
      40,
    )
    expect(lots).toHaveLength(12)
    expect(lots.every((lot) => lot.qty === 40)).toBe(true)
    expect(lots.map((lot) => lot.itemId).join('')).toBe('ABAAABAAABAA')
  })

  it('나누어 떨어지지 않으면 마지막 로트가 남은 수량만 갖는다', () => {
    expect(splitIntoLots([{ itemId: 'A', targetQty: 90 }], 40)).toEqual([
      { itemId: 'A', qty: 40 },
      { itemId: 'A', qty: 40 },
      { itemId: 'A', qty: 10 },
    ])
  })

  it('로트 크기가 0 이하면 거부한다', () => {
    expect(() => splitIntoLots([{ itemId: 'A', targetQty: 10 }], 0)).toThrow()
  })
})

describe('lotDueTimes', () => {
  it('계획 속도로 그 로트까지 만들었어야 하는 시각을 납기로 한다', () => {
    const lots = splitIntoLots(PLAN.lines, 40)
    const due = lotDueTimes(PLAN, lots)
    expect(due).toHaveLength(12)
    expect(due[0]).toBe(40 * 60) // 시간당 60대 → 40대는 40분
    expect(due[11]).toBe(8 * HOUR)
    expect(lotDueTimes({ ...PLAN, startTime: HOUR }, [{ itemId: 'A', qty: 60 }])).toEqual([2 * HOUR])
  })
})

describe('계획 대비 실적', () => {
  it('계획 수량은 계획 기간 동안 일정한 속도로 늘어난다', () => {
    expect(plannedUph(PLAN)).toBe(60)
    expect(plannedQtyAt(PLAN, 0)).toBe(0)
    expect(plannedQtyAt(PLAN, 2 * HOUR)).toBe(120)
    expect(plannedQtyAt(PLAN, 10 * HOUR)).toBe(480)
    expect(plannedQtyAt({ ...PLAN, startTime: HOUR }, HOUR / 2)).toBe(0)
  })

  it('달성률 = 양품 수 ÷ 지금까지 계획 수량. 계획이 없거나 계획 수량이 0이면 null', () => {
    const state = emptyState()
    expect(planAttainment(state)).toBeNull()
    state.plan = PLAN
    expect(planAttainment(state)).toBeNull()
    state.time = HOUR
    state.counters.completed = 45
    expect(planAttainment(state)).toBe(0.75)
  })
})

describe('hourlyOutput', () => {
  it('완료 시각으로 시간대를 나누고 누적 실적·누적 계획을 계산한다', () => {
    const state = withCompleted(emptyState(), [100, 3600, 3601, 7000])
    state.plan = PLAN
    state.time = 2 * HOUR + 10

    const buckets = hourlyOutput(state)
    expect(buckets).toHaveLength(8)
    expect(buckets.slice(0, 3)).toEqual([
      { hour: 0, good: 2, cumulativeGood: 2, cumulativePlan: 60 },
      { hour: 1, good: 2, cumulativeGood: 4, cumulativePlan: 120 },
      // 진행 중인 시간대는 계획도 지금 시각(2시간 10초) 기준
      { hour: 2, good: 0, cumulativeGood: 4, cumulativePlan: plannedQtyAt(PLAN, 2 * HOUR + 10) },
    ])
    expect(buckets[3]).toEqual({ hour: 3, good: null, cumulativeGood: null, cumulativePlan: 240 })
    expect(buckets[7].cumulativePlan).toBe(480)
  })

  it('계획이 끝난 뒤에도 시간이 흐르면 시간대를 늘리고, 계획이 없으면 계획선은 null', () => {
    const state = emptyState()
    state.plan = PLAN
    state.time = 9 * HOUR + 1
    expect(hourlyOutput(state)).toHaveLength(10)

    state.plan = null
    state.time = 0
    expect(hourlyOutput(state)).toEqual([{ hour: 0, good: null, cumulativeGood: null, cumulativePlan: null }])
  })
})

describe('lineOee', () => {
  it('시간이 흐르기 전에는 null, 이후에는 0~1 사이 값', () => {
    const engine = new SimEngine(createBaselineMaster(), { seed: 1 })
    expect(lineOee(engine.state)).toBeNull()
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 20, release: true })
    engine.run(HOUR)
    const value = lineOee(engine.state)!
    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThanOrEqual(1)
  })
})

describe('recentAlarms', () => {
  it('경고·위험 이벤트만 최신순으로 limit건, 불량 폐기는 뺀다', () => {
    const state = emptyState()
    const event = (time: number, severity: SimEvent['severity'], type: SimEvent['type'] = 'SENSOR_WARNING'): SimEvent => ({
      type,
      time,
      refId: 'X',
      severity,
      message: '',
    })
    state.events = [
      event(1, 'warning'),
      event(2, 'info'),
      event(3, 'critical'),
      event(4, 'warning'),
      event(5, 'warning', 'UNIT_SCRAPPED'),
    ]
    expect(recentAlarms(state, 2).map((e) => e.time)).toEqual([4, 3])
    expect(recentAlarms(state).map((e) => e.time)).toEqual([4, 3, 1])
  })
})
