import { equipmentName } from '@/domain/equipment'
import { formatDuration } from '@/domain/duration'
import type { MasterData, UnitStatus, WorkOrderStatus } from '@/domain/types'
import type { MetricKey, ScenarioMetrics } from '@/scenarios/types'
import type { SimCommand } from '@/sim/commands'

export { formatDuration }

export function percent(ratio: number | null, digits = 0): string {
  return ratio === null ? '—' : `${(ratio * 100).toFixed(digits)}%`
}

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  PLANNED: '계획',
  RELEASED: '하달',
  IN_PROGRESS: '진행',
  HELD: '보류',
  COMPLETED: '완료',
}

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  QUEUED: '대기',
  PROCESSING: '가공',
  COMPLETED: '완료',
  SCRAPPED: '폐기',
}

/** 기준정보에서 id → 이름을 찾는다. 기준정보에 없는 id(예: 실행 중 추가된 설비)는 id를 그대로 쓴다. */
export function createNameLookup(master: MasterData) {
  const items = new Map(master.items.map((i) => [i.id, i.name]))
  const workCenters = new Map(master.workCenters.map((wc) => [wc.id, wc.name]))
  const materials = new Map(master.materials.map((m) => [m.id, m.name]))
  return {
    item: (id: string) => items.get(id) ?? id,
    workCenter: (id: string) => workCenters.get(id) ?? id,
    equipment: (id: string) => equipmentName(master, id),
    material: (id: string) => materials.get(id) ?? id,
  }
}


const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' })

export function formatWon(value: number): string {
  return won.format(value)
}

/** 결과표 지표 값 표시 */
export function formatMetric(key: MetricKey, metrics: ScenarioMetrics): string {
  switch (key) {
    case 'good':
      return `${metrics.good}대`
    case 'scrap':
      return `${metrics.scrap}개`
    case 'uph':
      return `${metrics.uph.toFixed(1)}대/시`
    case 'avgWip':
      return `${metrics.avgWip.toFixed(1)}개`
    case 'avgLeadTime':
    case 'downtime':
    case 'materialStop':
      return formatDuration(metrics[key])
    case 'failures':
      return `${metrics.failures}회`
    case 'expediteCost':
      return formatWon(metrics.expediteCost)
    case 'onTime':
      return `${metrics.onTime.met} / ${metrics.onTime.total}건`
  }
}

/** 지표를 비교 가능한 숫자로 바꾼다(납기 준수는 비율) */
export function metricValue(key: MetricKey, metrics: ScenarioMetrics): number {
  if (key === 'onTime') return metrics.onTime.total === 0 ? 0 : metrics.onTime.met / metrics.onTime.total
  return metrics[key]
}

/** 사용자 조치 기록 표시용 문장 */
export function describeCommand(command: SimCommand, names: ReturnType<typeof createNameLookup>): string {
  switch (command.type) {
    case 'SET_PRODUCTION_PLAN':
      return `생산 계획 설정: ${command.plan.lines.map((l) => `${names.item(l.itemId)} ${l.targetQty}대`).join(', ')}`
    case 'CREATE_WORK_ORDER':
      return `작업지시 생성${command.release ? '·하달' : ''}: ${names.item(command.itemId)} ${command.qty}대`
    case 'RELEASE_WORK_ORDER':
      return `작업지시 ${command.workOrderId} 하달`
    case 'HOLD_WORK_ORDER':
      return `작업지시 ${command.workOrderId} 보류`
    case 'SET_WORK_ORDER_PRIORITY':
      return `작업지시 ${command.workOrderId} 우선순위 ${command.priority}`
    case 'SET_CYCLE_TIME':
      return `${names.workCenter(command.workCenterId)} 사이클타임 ${command.cycleTime}초`
    case 'ADD_EQUIPMENT':
      return `${names.workCenter(command.workCenterId)} 설비 1대 추가`
    case 'REQUEST_MAINTENANCE':
      return `${names.equipment(command.equipmentId)} 예방정비 요청`
    case 'EXPEDITE_MATERIAL':
      return `${names.material(command.materialId)} ${command.qty}개 긴급 발주`
  }
}
