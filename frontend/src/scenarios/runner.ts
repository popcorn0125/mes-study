import { SimEngine } from '@/sim/engine'
import type { ScenarioDefinition } from './types'

/** 시나리오 초기 상태의 엔진을 만든다. 초기 명령은 바로 적용해 시작 전에도 작업지시가 보이게 한다. */
export function createScenarioEngine(def: ScenarioDefinition): SimEngine {
  const engine = new SimEngine(def.createMaster(), { seed: def.seed })
  def.setup(engine)
  engine.applyPendingCommands()
  return engine
}
