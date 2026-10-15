import { breakdownScenario } from './breakdown'
import { createBaselineMaster } from './baseline'
import { DEMO_ORDERS, DEMO_SEED } from './demo'
import { lineBalancingScenario } from './lineBalancing'
import { materialShortageScenario } from './materialShortage'
import type { ScenarioDefinition } from './types'

/** 자유 체험: 기본 공장에서 시간 제한 없이 마음대로 조작한다(결과표 없음) */
export const freeScenario: ScenarioDefinition = {
  id: 'free',
  title: '자유 체험',
  summary: '기본 공장을 시간 제한 없이 둘러보고 조작해 보세요',
  briefing: [
    'BLDC 모터 조립 라인입니다. 표준형 A와 고급형 B 작업지시 5건이 하달된 상태로 시작합니다.',
    '설비·버퍼·Unit·자재를 클릭해 보고, 작업지시를 만들거나 설비를 늘려 보세요.',
  ],
  hints: ['60배속으로 돌리면 1시간 남짓에 CNC 진동 경고가, 1시간 반쯤에 고장이 나옵니다.'],
  lessons: [],
  duration: null,
  seed: DEMO_SEED,
  createMaster: createBaselineMaster,
  setup: (engine) => {
    for (const [itemId, qty] of DEMO_ORDERS) {
      engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId, qty, release: true })
    }
  },
  bestActions: [],
  bestActionsLabel: '',
  metrics: [],
}

export const SCENARIOS: ScenarioDefinition[] = [
  lineBalancingScenario,
  breakdownScenario,
  materialShortageScenario,
  freeScenario,
]
