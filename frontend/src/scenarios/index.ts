import { breakdownScenario } from './breakdown'
import { createBaselineMaster } from './baseline'
import { lotDueTimes, splitIntoLots } from '@/domain/production'
import { DEMO_LOT_SIZE, DEMO_PLAN, DEMO_SEED } from './demo'
import { lineBalancingScenario } from './lineBalancing'
import { materialShortageScenario } from './materialShortage'
import type { ScenarioDefinition } from './types'

/** 자유 체험: 기본 공장에서 시간 제한 없이 마음대로 조작한다(결과표 없음) */
export const freeScenario: ScenarioDefinition = {
  id: 'free',
  title: '자유 체험',
  summary: '기본 공장을 시간 제한 없이 둘러보고 조작해 보세요',
  briefing: [
    'BLDC 모터 조립 라인입니다. 8시간 동안 표준형 A 360대 · 고급형 B 120대를 만드는 생산 계획이 있고, 이를 40대씩 나눈 작업지시 12건이 납기와 함께 하달된 상태로 시작합니다.',
    '설비·버퍼·Unit·자재를 클릭해 보고, 작업지시를 만들거나 설비를 늘려 보세요.',
  ],
  hints: ['60배속으로 돌리면 1시간 남짓에 CNC 진동 경고가, 2시간쯤에 고장이 나옵니다.'],
  lessons: [],
  duration: null,
  seed: DEMO_SEED,
  createMaster: createBaselineMaster,
  // 생산 계획을 세우고, 계획을 로트 단위 작업지시로 나눠 납기를 붙여 하달한다
  setup: (engine) => {
    engine.dispatch({ type: 'SET_PRODUCTION_PLAN', plan: DEMO_PLAN })
    const lots = splitIntoLots(DEMO_PLAN.lines, DEMO_LOT_SIZE)
    // 납기 = 계획 속도로 그 로트까지 만들었어야 하는 시각. 라인 능력이 계획보다 약 13% 높아 평소에는 지키고,
    // 고장 직후의 로트는 늦을 수 있다.
    const dueTimes = lotDueTimes(DEMO_PLAN, lots)
    lots.forEach(({ itemId, qty }, i) => {
      engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId, qty, dueTime: dueTimes[i], release: true })
    })
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
