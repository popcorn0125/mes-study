import { createBaselineMaster } from './baseline'
import {
  HOUR,
  actionsOfType,
  keepReliabilityOnly,
  minutes,
  withoutMaterialConstraints,
} from './helpers'
import type { ScenarioDefinition } from './types'

const CNC = 'MACHINING-1'

/** S2. 설비 돌발 장애: CNC 마모가 이미 진행된 상태에서 시작. 전조를 보고 예방정비할 것인가? */
export const breakdownScenario: ScenarioDefinition = {
  id: 's2-breakdown',
  title: 'S2. 설비 돌발 장애',
  summary: '전조를 볼 것인가, 고장을 맞을 것인가',
  briefing: [
    '야간 교대에서 "CNC #1 소리가 평소와 다르다"는 인수인계가 있었습니다.',
    '오늘 작업지시는 표준형 300대. 하우징 가공은 CNC 한 대뿐이라 멈추면 라인 전체가 멈춥니다.',
    '센서를 지켜보며 3시간 동안 최대한 많이 생산하세요.',
  ],
  hints: [
    'CNC #1을 클릭해 진동·온도 추이와 마모도를 확인하세요.',
    '설비 바닥 링이 노랗게 깜박이면 센서 경고입니다. 경보 타일도 함께 보세요.',
    '예방정비는 5분 계획 정지, 고장 수리는 20분 비계획 정지입니다.',
  ],
  lessons: [
    '계획 정지(예방정비)와 비계획 정지(고장)의 비용 차이',
    '고장 전에는 센서 값과 불량률이 먼저 나빠진다 — 예지보전',
    '단일 설비 공정이 멈추면 상류는 막히고 하류는 굶는다',
  ],
  duration: 3 * HOUR,
  seed: 202,
  createMaster: () => {
    const master = withoutMaterialConstraints(keepReliabilityOnly(createBaselineMaster(), [CNC]))
    const cnc = master.equipment.find((eq) => eq.id === CNC)!
    cnc.reliability = { ...cnc.reliability!, initialWear: 0.55, wearPerRunHour: 0.25 }
    return master
  },
  setup: (engine) => {
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 300, release: true })
  },
  bestActions: [{ time: 0, command: { type: 'REQUEST_MAINTENANCE', equipmentId: CNC } }],
  bestActionsLabel: '시작 즉시 CNC #1 예방정비',
  metrics: [
    { key: 'good', label: '양품 생산량', higherIsBetter: true },
    { key: 'downtime', label: '정지 시간(고장+정비)', higherIsBetter: false },
    { key: 'failures', label: '고장 횟수', higherIsBetter: false },
    { key: 'uph', label: '시간당 생산량', higherIsBetter: true },
  ],
  explain: ({ mine }, actions) => {
    const insights: string[] = []
    const maintenance = actionsOfType(actions, 'REQUEST_MAINTENANCE').filter((a) => a.command.equipmentId === CNC)
    if (maintenance.length > 0 && mine.failures === 0) {
      insights.push(
        `시작 후 ${minutes(maintenance[0].time)} 만에 CNC 예방정비를 해 고장을 막았습니다. ` +
          '5분 계획 정지로 20분 비계획 정지를 피했습니다.',
      )
    } else if (maintenance.length > 0) {
      insights.push('예방정비를 했지만 고장을 완전히 막지는 못했습니다. 진동 경고가 뜬 직후가 정비 적기입니다.')
    } else if (mine.failures > 0) {
      insights.push(
        '진동 경고를 그대로 두어 CNC가 고장났습니다. 수리하는 20분 동안 앞 공정은 막히고 뒤 공정은 일감이 끊겼습니다.',
      )
    } else {
      insights.push('이번에는 운 좋게 고장이 나지 않았습니다. 하지만 마모도가 높을수록 고장 확률은 계속 올라갑니다.')
    }
    insights.push(
      '마모도가 50%를 넘으면 가공 불량률도 함께 오릅니다. 고장 전에 센서 값과 품질이 먼저 나빠지므로, 설비 상세의 마모도 표시선을 기준으로 정비 시점을 잡으세요.',
    )
    return insights
  },
}
