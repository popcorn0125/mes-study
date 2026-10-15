import { createBaselineMaster } from './baseline'
import { HOUR, actionsOfType, keepReliabilityOnly, minutes } from './helpers'
import type { ScenarioDefinition } from './types'

const BEARING = 'BEARING-PRM'

/** S3. 자재 부족: 고급 베어링이 B 10대분뿐인데 B 긴급 수주 40대 */
export const materialShortageScenario: ScenarioDefinition = {
  id: 's3-material-shortage',
  title: 'S3. 자재 부족',
  summary: 'BOM 한 줄이 라인을 멈춘다',
  briefing: [
    '고급형 B 40대 긴급 수주가 들어왔습니다. 납기는 2시간 뒤입니다. 표준형 A 80대도 이어서 생산해야 합니다.',
    '그런데 B에만 들어가는 고급 베어링 재고가 20개(B 10대분)뿐입니다. 정상 발주로는 2시간 뒤에야 입고됩니다.',
    '3시간 동안 납기를 지키며 최대한 많이 생산하세요.',
  ],
  hints: [
    '좌측 자재 창고의 고급 베어링 막대를 클릭해 재고·입고 예정·긴급 발주를 확인하세요.',
    '라인은 선입선출(FIFO)입니다. 맨 앞 Unit의 자재가 없으면 뒤의 다른 품목도 기다립니다.',
    '작업지시 패널에서 순서(우선순위)와 보류도 바꿀 수 있습니다.',
  ],
  lessons: [
    'BOM ↔ 자재 소요 ↔ 작업지시 일정의 연결',
    '자재 부족 정지는 설비 고장처럼 보이지만 원인이 다르다',
    '긴급 발주 비용과 납기 지연 비용의 트레이드오프',
  ],
  duration: 3 * HOUR,
  seed: 303,
  createMaster: () => {
    const master = keepReliabilityOnly(createBaselineMaster(), [])
    const bearing = master.materials.find((m) => m.id === BEARING)!
    bearing.initialStock = 20
    bearing.leadTime = 2 * HOUR
    return master
  },
  setup: (engine) => {
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-B', qty: 40, dueTime: 2 * HOUR, release: true })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 80, release: true })
  },
  bestActions: [{ time: 0, command: { type: 'EXPEDITE_MATERIAL', materialId: BEARING, qty: 60 } }],
  bestActionsLabel: '시작 즉시 고급 베어링 60개 긴급 발주',
  metrics: [
    { key: 'good', label: '양품 생산량', higherIsBetter: true },
    { key: 'onTime', label: '납기 준수', higherIsBetter: true },
    { key: 'materialStop', label: '자재 부족 정지', higherIsBetter: false },
    { key: 'expediteCost', label: '긴급 발주 할증', higherIsBetter: false },
  ],
  explain: ({ baseline, mine }, actions) => {
    const insights: string[] = []
    const expedites = actionsOfType(actions, 'EXPEDITE_MATERIAL').filter((a) => a.command.materialId === BEARING)
    const resequenced =
      actionsOfType(actions, 'SET_WORK_ORDER_PRIORITY').length + actionsOfType(actions, 'HOLD_WORK_ORDER').length > 0

    if (expedites.length > 0) {
      insights.push(
        `시작 후 ${minutes(expedites[0].time)} 만에 긴급 발주해 자재 부족 정지를 ` +
          `${minutes(baseline.materialStop)} → ${minutes(mine.materialStop)}로 줄였습니다 ` +
          `(할증 ${mine.expediteCost.toLocaleString('ko-KR')}원).`,
      )
    }
    if (resequenced) {
      insights.push(
        '작업지시 순서를 바꿔 A를 먼저 흘렸습니다. 다만 이미 라인에 들어간 B Unit은 선입선출이라 자재가 올 때까지 조립을 막습니다.',
      )
    }
    if (actions.length === 0) {
      insights.push(
        '고급 베어링이 떨어지자 조립 맨 앞의 B Unit이 멈췄고, 뒤의 A Unit까지 정상 입고(2시간)를 기다렸습니다.',
      )
    }
    insights.push(
      mine.onTime.met === mine.onTime.total
        ? 'B 긴급 수주 납기를 지켰습니다.'
        : 'B 긴급 수주 납기를 놓쳤습니다. 자재 입고 시점이 납기를 결정했습니다.',
    )
    return insights
  },
}
