import { describe, expect, it } from 'vitest'
import { createBaselineMaster } from '@/scenarios/baseline'
import { SimEngine } from '@/sim/engine'
import { downtimeLog, downtimePareto, hoursToFailureRisk, lossBreakdown, reliabilityStats } from './maintenance'
import type { DowntimeRecord, SimState } from './types'

function emptyState(): SimState {
  return new SimEngine(createBaselineMaster(), { seed: 1 }).state
}

const eqOf = (state: SimState, id: string) => state.equipment.find((eq) => eq.id === id)!

function downtime(partial: Partial<DowntimeRecord>): DowntimeRecord {
  return { id: 'DT', equipmentId: 'MACHINING-1', reason: 'BREAKDOWN', start: 0, end: null, expected: 1200, ...partial }
}

describe('손실 구분', () => {
  it('설비 시간을 가동 · 비계획 · 계획 · 라인 손실 · 휴지로 나눈다', () => {
    const state = emptyState()
    const eq = eqOf(state, 'MACHINING-1')
    Object.assign(eq.statusTime, { RUN: 100, DOWN: 20, STARVED_MATERIAL: 5, PM: 10, STARVED: 7, BLOCKED: 3, IDLE: 1 })
    expect(lossBreakdown(eq)).toEqual({ run: 100, unplanned: 25, planned: 10, line: 10, idle: 1 })
  })
})

describe('비가동 파레토', () => {
  it('설비 전체 사유별 시간을 큰 순서로 정렬하고 누적 비율을 붙인다. 0인 사유는 뺀다', () => {
    const state = emptyState()
    eqOf(state, 'MACHINING-1').statusTime.DOWN = 600
    eqOf(state, 'PACKING-1').statusTime.STARVED = 300
    eqOf(state, 'WINDING-1').statusTime.STARVED = 100
    eqOf(state, 'ASSEMBLY-1').statusTime.PM = 200
    const pareto = downtimePareto(state)
    expect(pareto.map((p) => [p.label, p.seconds, p.kind])).toEqual([
      ['고장', 600, 'unplanned'],
      ['공급 대기', 400, 'line'],
      ['예방정비', 200, 'planned'],
    ])
    expect(pareto.map((p) => p.cumulative)).toEqual([0.5, 1000 / 1200, 1])
  })

  it('비가동이 없으면 빈 목록', () => {
    expect(downtimePareto(emptyState())).toEqual([])
  })
})

describe('MTBF · MTTR', () => {
  it('MTBF = 가동 시간 ÷ 고장 횟수, MTTR = 끝난 수리의 평균, 가용도 = MTBF ÷ (MTBF + MTTR)', () => {
    const state = emptyState()
    const eq = eqOf(state, 'MACHINING-1')
    eq.statusTime.RUN = 7200
    eq.failureCount = 2
    state.downtimes.push(
      downtime({ start: 1000, end: 2000 }),
      downtime({ reason: 'PM', start: 3000, end: 3300 }), // 정비는 MTTR에 넣지 않는다
      downtime({ start: 5000, end: 6400 }),
      downtime({ equipmentId: 'WINDING-1', start: 0, end: 5000 }), // 다른 설비
    )
    const stats = reliabilityStats(state, 'MACHINING-1')
    expect(stats.failures).toBe(2)
    expect(stats.mtbf).toBe(3600)
    expect(stats.mttr).toBe(1200)
    expect(stats.availability).toBeCloseTo(3600 / 4800)
  })

  it('고장이 없으면 MTBF, 끝난 수리가 없으면 MTTR이 null', () => {
    const state = emptyState()
    const eq = eqOf(state, 'MACHINING-1')
    expect(reliabilityStats(state, 'MACHINING-1')).toEqual({ failures: 0, mtbf: null, mttr: null, availability: null })
    eq.statusTime.RUN = 3600
    eq.failureCount = 1
    state.downtimes.push(downtime({ start: 3600, end: null })) // 수리 중
    expect(reliabilityStats(state, 'MACHINING-1')).toMatchObject({ mtbf: 3600, mttr: null, availability: null })
  })
})

describe('고장 위험 구간까지 남은 시간', () => {
  it('(0.7 − 마모도) ÷ 시간당 마모, 이미 넘었으면 0, 신뢰성 정보가 없으면 null', () => {
    const state = emptyState()
    const eq = eqOf(state, 'MACHINING-1')
    const reliability = createBaselineMaster().equipment[0].reliability!
    eq.wear = 0.4
    expect(hoursToFailureRisk(eq, reliability)).toBeCloseTo(1) // (0.7 − 0.4) ÷ 0.3
    eq.wear = 0.8
    expect(hoursToFailureRisk(eq, reliability)).toBe(0)
    expect(hoursToFailureRisk(eq, undefined)).toBeNull()
  })
})

describe('비가동 이력', () => {
  it('최신순으로, 설비를 지정하면 그 설비만, limit까지', () => {
    const state = emptyState()
    state.downtimes.push(
      downtime({ id: 'DT-1' }),
      downtime({ id: 'DT-2', equipmentId: 'WINDING-1' }),
      downtime({ id: 'DT-3' }),
      downtime({ id: 'DT-4' }),
    )
    expect(downtimeLog(state).map((d) => d.id)).toEqual(['DT-4', 'DT-3', 'DT-2', 'DT-1'])
    expect(downtimeLog(state, 'MACHINING-1', 2).map((d) => d.id)).toEqual(['DT-4', 'DT-3'])
  })
})
