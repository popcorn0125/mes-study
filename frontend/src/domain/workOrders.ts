import { compareForDispatch } from './dispatch'
import type { MasterData, SimState, Unit, WorkOrder, WorkOrderStatus } from './types'

/**
 * 작업지시 관리 계산. KPI와 마찬가지로 상태에 저장하지 않고 매번 계산한다.
 */

export const WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = ['PLANNED', 'RELEASED', 'IN_PROGRESS', 'HELD', 'COMPLETED']

/** 상태별 작업지시 건수 */
export function statusCounts(state: SimState): Record<WorkOrderStatus, number> {
  const counts = Object.fromEntries(WORK_ORDER_STATUSES.map((s) => [s, 0])) as Record<WorkOrderStatus, number>
  for (const wo of state.workOrders) counts[wo.status]++
  return counts
}

/** 남은 수량: 아직 양품·불량으로 끝나지 않은 수량(라인 안 + 미투입) */
export function remainingQty(wo: WorkOrder): number {
  return wo.qty - wo.goodQty - wo.scrapQty
}

/** 투입 중이거나 투입을 기다리는 작업지시. 보류·계획 상태는 새로 투입되지 않는다. */
function isActive(wo: WorkOrder): boolean {
  return wo.status === 'RELEASED' || wo.status === 'IN_PROGRESS'
}

export interface OperationProgress {
  seq: number
  workCenterId: string
  /** 이 공정을 양품으로 마친 수 */
  passed: number
  /** 이 공정에서 불량으로 폐기된 수 */
  defect: number
  /** 지금 가공 중인 수 */
  processing: number
  /** 이 공정 입력 버퍼에서 기다리는 수 */
  queued: number
}

/** 라우팅 공정마다 작업지시의 제품이 몇 개 지나갔는지. 작업지시가 라인 어디쯤 있는지 보여 준다. */
export function routingProgress(state: SimState, master: MasterData, workOrderId: string): OperationProgress[] {
  const wo = state.workOrders.find((w) => w.id === workOrderId)
  const routing = wo && master.routings.find((r) => r.itemId === wo.itemId)
  if (!routing) return []
  const rows: OperationProgress[] = routing.operations.map((op) => ({
    seq: op.seq,
    workCenterId: op.workCenterId,
    passed: 0,
    defect: 0,
    processing: 0,
    queued: 0,
  }))
  const indexOfSeq = new Map(routing.operations.map((op, i) => [op.seq, i]))
  for (const unit of Object.values(state.units)) {
    if (unit.workOrderId !== workOrderId) continue
    for (const h of unit.history) {
      const row = rows[indexOfSeq.get(h.opSeq)!]
      if (h.result === 'GOOD') row.passed++
      else row.defect++
    }
    const row = rows[unit.opIndex]
    if (!row) continue
    if (unit.status === 'QUEUED') row.queued++
    // 가공을 마쳤지만 다음 버퍼가 가득 차 설비 위에 남은(BLOCKED) 제품은 이미 passed로 셌다
    else if (unit.status === 'PROCESSING' && !unit.history.some((h) => h.opSeq === row.seq)) row.processing++
  }
  return rows
}

interface ItemFlow {
  /** 병목 공정 인덱스 */
  bottleneckIndex: number
  /** 병목에서 1개를 처리하는 시간(초) = 사이클타임 ÷ 설비 대수의 최댓값 */
  bottleneckTime: number
  /** 마지막 제품이 병목 뒤 공정들을 지나는 시간(초) */
  tailTime: number
}

/** 품목별 병목과 병목 뒤 소요 시간. 사이클타임 변경과 설비 추가를 반영한다. */
function itemFlows(state: SimState, master: MasterData): Map<string, ItemFlow> {
  const equipmentCount = new Map<string, number>()
  for (const eq of state.equipment) equipmentCount.set(eq.workCenterId, (equipmentCount.get(eq.workCenterId) ?? 0) + 1)
  const flows = new Map<string, ItemFlow>()
  for (const routing of master.routings) {
    const times = routing.operations.map((op) => state.cycleTimeOverride[op.workCenterId] ?? op.cycleTime)
    let bottleneckIndex = 0
    let bottleneckTime = 0
    times.forEach((time, i) => {
      const perUnit = time / Math.max(1, equipmentCount.get(routing.operations[i].workCenterId) ?? 0)
      if (perUnit > bottleneckTime) {
        bottleneckIndex = i
        bottleneckTime = perUnit
      }
    })
    const tailTime = times.slice(bottleneckIndex + 1).reduce((sum, t) => sum + t, 0)
    flows.set(routing.itemId, { bottleneckIndex, bottleneckTime, tailTime })
  }
  return flows
}

/** 이 제품이 아직 병목 공정을 거쳐야 하는지 */
function needsBottleneck(unit: Unit, flow: ItemFlow, bottleneckSeq: number): boolean {
  if (unit.opIndex < flow.bottleneckIndex) return true
  if (unit.opIndex > flow.bottleneckIndex) return false
  return !unit.history.some((h) => h.opSeq === bottleneckSeq)
}

/**
 * 작업지시별 예상 완료 시각(표준 능력 기준 근사). 하달·진행 중인 미완료 작업지시만 계산한다.
 *
 * 1. 라인 안의 제품은 투입된 순서대로(라인은 FIFO) 병목을 지난다고 본다.
 * 2. 그 뒤 아직 투입하지 않은 수량을 투입 순서 규칙대로 줄 세운다.
 * 3. 병목 처리 시간을 차례로 누적하고, 작업지시의 마지막 제품이 병목을 지난 시각에 병목 뒤 공정 시간을 더한다.
 * 고장·자재 부족·불량은 반영하지 않는다.
 */
export function estimateCompletion(state: SimState, master: MasterData): Map<string, number> {
  const flows = itemFlows(state, master)
  const bottleneckSeq = new Map(
    master.routings.map((r) => [r.itemId, r.operations[flows.get(r.itemId)!.bottleneckIndex].seq]),
  )
  const active = new Set(state.workOrders.filter(isActive).map((wo) => wo.id))
  const lastBottleneckExit = new Map<string, number>()
  let elapsed = 0

  // 1. 라인 안의 제품. Unit은 만든 순서대로 들어 있다.
  for (const unit of Object.values(state.units)) {
    if (unit.status !== 'QUEUED' && unit.status !== 'PROCESSING') continue
    const flow = flows.get(unit.itemId)!
    if (needsBottleneck(unit, flow, bottleneckSeq.get(unit.itemId)!)) elapsed += flow.bottleneckTime
    if (active.has(unit.workOrderId)) lastBottleneckExit.set(unit.workOrderId, elapsed)
  }

  // 2. 아직 투입하지 않은 수량
  const queue = state.workOrders.filter((wo) => isActive(wo) && wo.releasedQty < wo.qty)
  queue.sort(compareForDispatch(state.dispatchRule))
  for (const wo of queue) {
    elapsed += (wo.qty - wo.releasedQty) * flows.get(wo.itemId)!.bottleneckTime
    lastBottleneckExit.set(wo.id, elapsed)
  }

  const result = new Map<string, number>()
  for (const wo of state.workOrders) {
    if (!active.has(wo.id) || remainingQty(wo) === 0) continue
    result.set(wo.id, state.time + (lastBottleneckExit.get(wo.id) ?? 0) + flows.get(wo.itemId)!.tailTime)
  }
  return result
}

/**
 * 납기 상태
 * - NONE: 납기 없음 / MET: 납기 안에 완료 / LATE_DONE: 늦게 완료
 * - ON_TRACK: 예상 완료가 납기 안 / AT_RISK: 예상 완료가 납기를 넘음 / OVERDUE: 미완료인데 납기가 지남
 * - UNKNOWN: 계획·보류 상태라 예상할 수 없음
 */
export type DueStatusKind = 'NONE' | 'MET' | 'LATE_DONE' | 'ON_TRACK' | 'AT_RISK' | 'OVERDUE' | 'UNKNOWN'

export interface DueStatus {
  kind: DueStatusKind
  /** 납기 − (완료 또는 예상 완료 또는 지금) (초). 음수면 늦음. 납기가 없으면 null */
  slack: number | null
}

export function dueStatus(wo: WorkOrder, eta: number | null, now: number): DueStatus {
  const due = wo.dueTime
  if (due === null) return { kind: 'NONE', slack: null }
  if (wo.completedAt !== null) {
    const slack = due - wo.completedAt
    return { kind: slack >= 0 ? 'MET' : 'LATE_DONE', slack }
  }
  if (now > due) return { kind: 'OVERDUE', slack: due - now }
  if (eta === null) return { kind: 'UNKNOWN', slack: due - now }
  return { kind: eta > due ? 'AT_RISK' : 'ON_TRACK', slack: due - eta }
}

/** 납기 준수율(OTD): 납기가 있는 완료 작업지시 중 납기 안에 끝낸 비율. 없으면 null */
export function onTimeRate(state: SimState): number | null {
  const done = state.workOrders.filter((wo) => wo.completedAt !== null && wo.dueTime !== null)
  if (done.length === 0) return null
  return done.filter((wo) => wo.completedAt! <= wo.dueTime!).length / done.length
}

export interface WorkOrderTimes {
  /** 하달 → 첫 투입(투입 전이면 지금까지) */
  wait: number | null
  /** 첫 투입 → 완료(진행 중이면 지금까지) */
  work: number | null
  /** 하달 → 완료. 완료 전이면 null */
  leadTime: number | null
}

export function workOrderTimes(wo: WorkOrder, now: number): WorkOrderTimes {
  if (wo.releasedAt === null) return { wait: null, work: null, leadTime: null }
  return {
    wait: (wo.startedAt ?? now) - wo.releasedAt,
    work: wo.startedAt === null ? null : (wo.completedAt ?? now) - wo.startedAt,
    leadTime: wo.completedAt === null ? null : wo.completedAt - wo.releasedAt,
  }
}

/** 완료된 작업지시의 평균 리드타임(하달 → 완료). 없으면 null */
export function averageWorkOrderLeadTime(state: SimState): number | null {
  const done = state.workOrders.filter((wo) => wo.completedAt !== null && wo.releasedAt !== null)
  if (done.length === 0) return null
  return done.reduce((sum, wo) => sum + wo.completedAt! - wo.releasedAt!, 0) / done.length
}
