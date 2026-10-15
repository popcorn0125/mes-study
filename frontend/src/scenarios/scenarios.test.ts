import { describe, expect, it } from 'vitest'
import { breakdownScenario } from './breakdown'
import { SCENARIOS, freeScenario } from './index'
import { lineBalancingScenario } from './lineBalancing'
import { materialShortageScenario } from './materialShortage'
import { buildResult, createScenarioEngine, metricsOf, runWithActions } from './runner'
import type { ScenarioDefinition, TimedCommand } from './types'

const timed = SCENARIOS.filter((s): s is ScenarioDefinition & { duration: number } => s.duration !== null)

function compare(def: ScenarioDefinition & { duration: number }) {
  const baseline = metricsOf(runWithActions(createScenarioEngine(def), [], def.duration))
  const best = metricsOf(runWithActions(createScenarioEngine(def), def.bestActions, def.duration))
  return { baseline, best }
}

describe('시나리오 정의', () => {
  it.each(timed)('$title: 시작 시 작업지시가 있고, 제한 시간에 정확히 멈춘다', (def) => {
    const engine = createScenarioEngine(def)
    expect(engine.state.workOrders.length).toBeGreaterThan(0)
    expect(engine.state.time).toBe(0)
    runWithActions(engine, [], def.duration)
    expect(engine.state.time).toBe(def.duration)
  })

  it('자유 체험은 시간 제한과 결과표가 없다', () => {
    expect(freeScenario.duration).toBeNull()
    expect(freeScenario.metrics).toHaveLength(0)
  })

  it('자유 체험은 생산 계획을 세우고, 계획 수량만큼 작업지시를 나눠 하달한다', () => {
    const { state } = createScenarioEngine(freeScenario)
    expect(state.plan?.lines).toEqual([
      { itemId: 'MOTOR-A', targetQty: 360 },
      { itemId: 'MOTOR-B', targetQty: 120 },
    ])
    expect(state.workOrders).toHaveLength(12)
    expect(state.workOrders.every((wo) => wo.status === 'RELEASED')).toBe(true)
    const totalOf = (itemId: string) =>
      state.workOrders.filter((wo) => wo.itemId === itemId).reduce((sum, wo) => sum + wo.qty, 0)
    expect(totalOf('MOTOR-A')).toBe(360)
    expect(totalOf('MOTOR-B')).toBe(120)
  })
})

describe('모범 조치는 조치 없음보다 낫다', () => {
  it('S1: 병목 증설로 시간당 생산량이 크게 늘고 재공품·리드타임이 줄어든다', () => {
    const { baseline, best } = compare(lineBalancingScenario as ScenarioDefinition & { duration: number })
    expect(best.uph).toBeGreaterThan(baseline.uph * 1.5)
    expect(best.avgWip).toBeLessThan(baseline.avgWip)
    expect(best.avgLeadTime).toBeLessThan(baseline.avgLeadTime)
  })

  it('S2: 예방정비로 고장을 막고 정지 시간이 줄며 생산량이 늘어난다', () => {
    const { baseline, best } = compare(breakdownScenario as ScenarioDefinition & { duration: number })
    expect(baseline.failures).toBeGreaterThan(0)
    expect(best.failures).toBe(0)
    expect(best.downtime).toBeLessThan(baseline.downtime)
    expect(best.good).toBeGreaterThan(baseline.good)
  })

  it('S3: 긴급 발주로 자재 부족 정지가 줄고 납기를 지킨다(대신 할증이 든다)', () => {
    const { baseline, best } = compare(materialShortageScenario as ScenarioDefinition & { duration: number })
    expect(best.materialStop).toBeLessThan(baseline.materialStop / 2)
    expect(baseline.onTime).toEqual({ met: 0, total: 1 })
    expect(best.onTime).toEqual({ met: 1, total: 1 })
    expect(best.good).toBeGreaterThan(baseline.good)
    expect(best.expediteCost).toBeGreaterThan(0)
  })
})

describe('결과표', () => {
  it('화면에서 중간에 조치한 결과와, 기록된 조치를 다시 실행한 결과가 같다', () => {
    const def = lineBalancingScenario as ScenarioDefinition & { duration: number }
    const action: TimedCommand = { time: 1800, command: { type: 'ADD_EQUIPMENT', workCenterId: 'ASSEMBLY' } }

    // 화면: 1800초까지 진행 → 일시정지 중 조치(즉시 적용) → 끝까지 진행
    const live = createScenarioEngine(def)
    live.run(action.time)
    live.dispatch(action.command)
    live.applyPendingCommands()
    live.run(def.duration - action.time)

    const replay = runWithActions(createScenarioEngine(def), [action], def.duration)
    expect(metricsOf(live)).toEqual(metricsOf(replay))
  })

  it('조치 없음 / 내 결과 / 모범 조치와 해설을 만든다', () => {
    const def = breakdownScenario as ScenarioDefinition & { duration: number }
    const mine = runWithActions(createScenarioEngine(def), [], def.duration)
    const result = buildResult(def, mine, [])
    expect(result.mine).toEqual(result.baseline) // 아무것도 안 했으면 조치 없음과 같다
    expect(result.best.failures).toBe(0)
    expect(result.insights.length).toBeGreaterThan(0)
    expect(result.insights[0]).toContain('고장')
  })

  it('S1 해설: 비병목만 개선하면 그 점을 짚는다', () => {
    const def = lineBalancingScenario as ScenarioDefinition & { duration: number }
    const actions: TimedCommand[] = [
      { time: 0, command: { type: 'SET_CYCLE_TIME', workCenterId: 'MACHINING', cycleTime: 30 } },
    ]
    const mine = runWithActions(createScenarioEngine(def), actions, def.duration)
    const result = buildResult(def, mine, actions)
    // 비병목 개선은 생산량을 거의 바꾸지 못한다(불량 난수에 따른 몇 대 차이만 허용)
    expect(Math.abs(result.mine.uph / result.baseline.uph - 1)).toBeLessThan(0.05)
    expect(result.insights[0]).toContain('병목이 아닌 공정')
  })
})
