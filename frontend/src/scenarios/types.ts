import type { MasterData } from '@/domain/types'
import type { SimEngine } from '@/sim/engine'

export interface ScenarioDefinition {
  id: string
  seed: number
  createMaster: () => MasterData
  /** 엔진 생성 직후 초기 작업지시 등 설정 */
  setup: (engine: SimEngine) => void
}
