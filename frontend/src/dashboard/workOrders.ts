import type { WorkOrder, WorkOrderAction, WorkOrderDetail, WorkOrderStatus } from '@/api/workOrders'

/** 작업지시 상태 색 · 이름. 색만으로 구분하지 않도록 늘 이름과 함께 쓴다 */
export const WORK_ORDER_STATUS_STYLE: Record<WorkOrderStatus, { color: string; label: string }> = {
  IN_PROGRESS: { color: '#3fb950', label: '진행' },
  RELEASED: { color: '#388bfd', label: '하달' },
  HELD: { color: '#d29922', label: '보류' },
  PLANNED: { color: '#8b949e', label: '계획' },
  COMPLETED: { color: '#a371f7', label: '완료' },
}

/** 목록 · 개수에 쓰는 상태 순서(서버 목록 정렬과 같다) */
export const WORK_ORDER_STATUS_ORDER: readonly WorkOrderStatus[] = ['IN_PROGRESS', 'RELEASED', 'HELD', 'PLANNED', 'COMPLETED']

/** 상태마다 할 수 있는 전환(서버 규칙과 같다) */
const ACTIONS: Record<WorkOrderStatus, readonly WorkOrderAction[]> = {
  PLANNED: ['release'],
  RELEASED: ['hold'],
  IN_PROGRESS: ['hold'],
  HELD: ['resume'],
  COMPLETED: [],
}

export const ACTION_LABEL: Record<WorkOrderAction, string> = {
  release: '하달',
  hold: '보류',
  resume: '보류 해제',
}

export function actionsFor(status: WorkOrderStatus): readonly WorkOrderAction[] {
  return ACTIONS[status]
}

/** 진척률(0~1): 포장 양품 / 지시 수량 */
export function progressOf(workOrder: Pick<WorkOrder, 'completedQty' | 'plannedQty'>): number {
  return Math.min(1, workOrder.completedQty / workOrder.plannedQty)
}

/** 상태별 개수. 완료는 오늘(브라우저 시간대) 완료한 것만 센다 */
export function countByStatus(list: readonly WorkOrder[], now: number): Record<WorkOrderStatus, number> {
  const counts: Record<WorkOrderStatus, number> = { IN_PROGRESS: 0, RELEASED: 0, HELD: 0, PLANNED: 0, COMPLETED: 0 }
  const today = new Date(now).toDateString()
  for (const wo of list) {
    if (wo.status === 'COMPLETED' && (!wo.completedAt || new Date(wo.completedAt).toDateString() !== today)) continue
    counts[wo.status] += 1
  }
  return counts
}

/**
 * 진행 중 지시의 예상 완료 시각(ms). 진행 중이 아니면 undefined.
 * 남은 수량 × 병목(가장 긴 기준 택트). 아직 포장까지 하나도 나오지 않았으면 라인이 차는 시간(나머지 공정 택트 합)을 더한다.
 * 불량으로 다시 만드는 시간은 넣지 않는다(기준 택트 기준 추정).
 */
export function estimateFinish(detail: WorkOrderDetail, now: number): number | undefined {
  if (detail.status !== 'IN_PROGRESS' || detail.performance.length === 0) return undefined
  const remaining = Math.max(0, detail.plannedQty - detail.completedQty)
  const tacts = detail.performance.map((p) => p.standardTactSec)
  const bottleneck = Math.max(...tacts)
  const fill = detail.completedQty === 0 ? tacts.reduce((a, b) => a + b, 0) - bottleneck : 0
  return now + (remaining * bottleneck + (remaining > 0 ? fill : 0)) * 1000
}

/** 납기 판단: 늦음(이미 지났거나 늦게 완료) · 위험(예상 완료가 납기 뒤) · 여유. 납기가 없으면 undefined */
export function dueState(workOrder: WorkOrder, eta: number | undefined, now: number): 'late' | 'risk' | 'ok' | undefined {
  if (!workOrder.dueAt) return undefined
  const due = Date.parse(workOrder.dueAt)
  if (workOrder.status === 'COMPLETED') return workOrder.completedAt && Date.parse(workOrder.completedAt) > due ? 'late' : 'ok'
  if (now > due) return 'late'
  if (eta !== undefined && eta > due) return 'risk'
  return 'ok'
}

/** 공정별 진척 한 줄 */
export interface StageProgress {
  equipmentId: string
  name: string
  goodCount: number
  badCount: number
  /** 양품 / 지시 수량(0~1) */
  ratio: number
  /** 이 공정이 넘겨줬지만 다음 공정이 아직 끝내지 않은 양품(다음 공정 가공 중 포함). 마지막 공정은 undefined */
  waiting: number | undefined
}

export function toStages(detail: WorkOrderDetail): StageProgress[] {
  const perf = detail.performance
  return perf.map((p, i) => ({
    equipmentId: p.equipmentId,
    name: p.equipmentName,
    goodCount: p.goodCount,
    badCount: p.badCount,
    ratio: Math.min(1, p.goodCount / detail.plannedQty),
    waiting: i + 1 < perf.length ? Math.max(0, p.goodCount - perf[i + 1].totalCount) : undefined,
  }))
}

/** ISO 시각을 "10/28 15:12"로(브라우저 시간대). 없으면 "–" */
export function formatDateTime(iso: string | number | null | undefined): string {
  if (iso === null || iso === undefined) return '–'
  const d = new Date(iso)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`
}
