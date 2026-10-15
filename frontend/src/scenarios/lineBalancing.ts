import { createBaselineMaster } from './baseline'
import {
  HOUR,
  actionsOfType,
  keepReliabilityOnly,
  minutes,
  percentChange,
  withoutMaterialConstraints,
} from './helpers'
import type { ScenarioDefinition } from './types'

const ASSEMBLY = 'ASSEMBLY'

/** S1. 라인 밸런싱 불균형: 조립이 느려져 라인 전체가 조립 속도에 묶인다 */
export const lineBalancingScenario: ScenarioDefinition = {
  id: 's1-line-balancing',
  title: 'S1. 라인 밸런싱 불균형',
  summary: '모두 바쁘다는데 왜 생산량은 안 나올까?',
  briefing: [
    '조립 공정에 체결 검증 작업이 추가되면서 조립 사이클타임이 50초에서 90초로 늘었습니다.',
    '이번 교대 목표는 시간당 70대입니다. 그런데 현장에서는 "가공도 권선도 쉬지 않고 돌고 있다"고 합니다.',
    '3시간 안에 생산량을 끌어올리세요.',
  ],
  hints: [
    '상단 KPI 바의 "병목 공정"과 이론 최대 UPH를 확인하세요.',
    '하단 "히트맵"을 켜고, 재공품이 어느 버퍼에 쌓이는지 보세요.',
    '작업장이나 설비를 클릭하면 사이클타임 변경·설비 추가를 할 수 있습니다.',
  ],
  lessons: [
    '라인 생산량은 가장 느린 공정(병목)이 정한다 — 제약 이론(TOC)',
    '병목이 아닌 공정을 빠르게 하면 재공품만 늘어난다',
    'Little의 법칙: 재공품 = 처리량 × 리드타임',
  ],
  duration: 3 * HOUR,
  seed: 101,
  createMaster: () => {
    const master = withoutMaterialConstraints(keepReliabilityOnly(createBaselineMaster(), []))
    for (const routing of master.routings) {
      const op = routing.operations.find((o) => o.workCenterId === ASSEMBLY)!
      op.cycleTime = 90
    }
    return master
  },
  setup: (engine) => {
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 400, release: true })
  },
  bestActions: [{ time: 0, command: { type: 'ADD_EQUIPMENT', workCenterId: ASSEMBLY } }],
  bestActionsLabel: '시작 즉시 조립 설비 1대 증설',
  metrics: [
    { key: 'good', label: '양품 생산량', higherIsBetter: true },
    { key: 'uph', label: '시간당 생산량', higherIsBetter: true },
    { key: 'avgWip', label: '평균 재공품', higherIsBetter: false },
    { key: 'avgLeadTime', label: '평균 리드타임', higherIsBetter: false },
  ],
  explain: ({ baseline, mine, best }, actions) => {
    const insights: string[] = []
    const cycleChanges = actionsOfType(actions, 'SET_CYCLE_TIME')
    const additions = actionsOfType(actions, 'ADD_EQUIPMENT')
    const touchedBottleneck =
      additions.some((a) => a.command.workCenterId === ASSEMBLY) ||
      cycleChanges.some((a) => a.command.workCenterId === ASSEMBLY && a.command.cycleTime < 90)
    const touchedOthers =
      additions.some((a) => a.command.workCenterId !== ASSEMBLY) ||
      cycleChanges.some((a) => a.command.workCenterId !== ASSEMBLY)
    const gain = mine.uph / baseline.uph - 1

    if (actions.length === 0) {
      insights.push('아무 조치도 하지 않았습니다. KPI 바의 "병목 공정"을 클릭해 조립 작업장을 열어 보세요.')
    } else if (touchedBottleneck && gain >= 0.2) {
      insights.push(`병목인 조립을 개선해 시간당 생산량이 ${percentChange(baseline.uph, mine.uph)} 늘었습니다.`)
    } else if (touchedOthers && !touchedBottleneck) {
      insights.push(
        '병목이 아닌 공정을 개선했지만 생산량은 거의 그대로입니다. 라인 생산량은 가장 느린 공정이 정합니다.',
      )
    } else if (gain < 0.2) {
      insights.push('조치 효과가 크지 않았습니다. 조치 시점이 늦었거나 병목이 다른 공정으로 옮겨 갔는지 확인해 보세요.')
    }
    insights.push(
      `평균 재공품 ${baseline.avgWip.toFixed(1)} → ${mine.avgWip.toFixed(1)}개, ` +
        `평균 리드타임 ${minutes(baseline.avgLeadTime)} → ${minutes(mine.avgLeadTime)}. ` +
        '리드타임 = 재공품 ÷ 처리량(Little의 법칙)이므로, 처리량이 늘고 재공품이 줄면 리드타임은 크게 짧아집니다.',
    )
    if (mine.uph < best.uph * 0.9) {
      insights.push(`모범 조치(조립 설비 증설)로는 시간당 ${best.uph.toFixed(0)}대까지 나왔습니다.`)
    }
    return insights
  },
}
