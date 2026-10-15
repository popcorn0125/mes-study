import { averageLeadTime, averageWip } from '@/domain/kpi'
import { SimEngine } from '@/sim/engine'
import type { ScenarioDefinition, ScenarioMetrics, ScenarioResult, TimedCommand } from './types'

/** 시나리오 초기 상태의 엔진을 만든다. 초기 명령은 바로 적용해 시작 전에도 작업지시가 보이게 한다. */
export function createScenarioEngine(def: ScenarioDefinition): SimEngine {
  const engine = new SimEngine(def.createMaster(), { seed: def.seed })
  def.setup(engine)
  engine.applyPendingCommands()
  return engine
}

/**
 * 시각별 명령을 적용하며 until초까지 화면 없이 실행한다.
 * 명령은 해당 시각의 tick 직전에 넣으므로, 화면에서 같은 시각에 조작한 것과 결과가 같다.
 */
export function runWithActions(engine: SimEngine, actions: TimedCommand[], until: number): SimEngine {
  const pending = [...actions].sort((a, b) => a.time - b.time)
  let next = 0
  while (engine.state.time < until) {
    while (next < pending.length && pending[next].time <= engine.state.time) {
      engine.dispatch(pending[next].command)
      next++
    }
    engine.tick()
  }
  return engine
}

export function metricsOf(engine: SimEngine): ScenarioMetrics {
  const { state } = engine
  const hours = state.time / 3600
  const withDue = state.workOrders.filter((wo) => wo.dueTime !== null)
  return {
    good: state.counters.completed,
    scrap: state.counters.scrapped,
    uph: hours === 0 ? 0 : state.counters.completed / hours,
    avgWip: averageWip(state),
    avgLeadTime: averageLeadTime(state),
    downtime: state.equipment.reduce((sum, eq) => sum + eq.statusTime.DOWN + eq.statusTime.PM, 0),
    failures: state.equipment.reduce((sum, eq) => sum + eq.failureCount, 0),
    materialStop: state.equipment.reduce((sum, eq) => sum + eq.statusTime.STARVED_MATERIAL, 0),
    expediteCost: state.costs.expediteSurcharge,
    onTime: {
      met: withDue.filter((wo) => wo.completedAt !== null && wo.completedAt <= wo.dueTime!).length,
      total: withDue.length,
    },
  }
}

/**
 * 결과표를 만든다. "조치 없음"과 "모범 조치"는 같은 seed로 화면 없이 다시 실행해 비교한다
 * (엔진이 결정적이라 사용자가 겪은 것과 같은 조건이다).
 */
export function buildResult(def: ScenarioDefinition, mine: SimEngine, actions: TimedCommand[]): ScenarioResult {
  const until = def.duration ?? mine.state.time
  const baseline = metricsOf(runWithActions(createScenarioEngine(def), [], until))
  const best = metricsOf(runWithActions(createScenarioEngine(def), def.bestActions, until))
  const result = { baseline, mine: metricsOf(mine), best }
  return { ...result, insights: def.explain?.(result, actions) ?? [] }
}
