import { bottleneck, oee } from './kpi'
import { stockStatus } from './materials'
import { plannedQtyAt, planTotal } from './production'
import { isClosed, shiftRangeEnd, shiftsUntil, type Shift } from './shifts'
import {
  EQUIPMENT_STATUSES,
  type EquipmentCounters,
  type EquipmentStatus,
  type MasterData,
  type SimEvent,
  type SimEventType,
  type SimState,
  type WorkOrder,
} from './types'
import { dueStatus, estimateCompletion } from './workOrders'

const HOUR = 3600

/**
 * 실적 리포트 계산: 구간 [from, to)를 집계한다(교대 또는 1시간, 진행 중이면 to = 지금).
 * - 실적 · 품질: 제품이 끝난(완료 · 폐기) 시각이 구간 안(from < 시각 ≤ to)이면 그 구간 실적이다.
 *   생산 현황의 시간대별 실적과 같은 기준이다.
 * - 계획: 계획선(plannedQtyAt)의 구간 차이
 * - 설비 시간 · 가공 수 · OEE: 정시마다 기록한 설비 누적값의 차이. 기록이 보관 범위 밖이면 null
 */

/** 이번 교대 주요 사건으로 보는 이벤트(인수인계 · 시간대별 비고) */
const KEY_EVENTS: ReadonlySet<SimEventType> = new Set<SimEventType>([
  'EQUIPMENT_DOWN',
  'EQUIPMENT_REPAIRED',
  'MAINTENANCE_STARTED',
  'MAINTENANCE_DONE',
  'SENSOR_WARNING',
  'SENSOR_CRITICAL',
  'MATERIAL_SHORTAGE',
  'MATERIAL_BELOW_SAFETY',
  'WORK_ORDER_HELD',
  'EQUIPMENT_ADDED',
  'CYCLE_TIME_CHANGED',
  'DISPATCH_RULE_CHANGED',
])

function isKeyEvent(event: SimEvent): boolean {
  // 발주는 긴급 발주(경고)만 사건으로 본다. 자동 발주는 정상 흐름이다.
  return KEY_EVENTS.has(event.type) || (event.type === 'MATERIAL_ORDERED' && event.severity !== 'info')
}

function inRange(time: number, from: number, to: number): boolean {
  return time > from && time <= to
}

// ── 실적 · 품질 ───────────────────────────────────────────

export interface RangeOutput {
  good: number
  scrap: number
  /** 한 번도 불량 없이 완료한 수 */
  firstPassGood: number
  /** 재작업 가공 횟수(구간 안에서 끝난 재작업) */
  reworks: number
  byItem: Map<string, { good: number; scrap: number }>
}

export function rangeOutput(state: SimState, from: number, to: number): RangeOutput {
  const out: RangeOutput = { good: 0, scrap: 0, firstPassGood: 0, reworks: 0, byItem: new Map() }
  for (const unit of Object.values(state.units)) {
    for (const h of unit.history) if (h.rework && inRange(h.end, from, to)) out.reworks++
    if (unit.finishedAt === null || !inRange(unit.finishedAt, from, to)) continue
    const item = out.byItem.get(unit.itemId) ?? { good: 0, scrap: 0 }
    if (unit.status === 'COMPLETED') {
      out.good++
      item.good++
      if (unit.history.every((h) => h.result === 'GOOD')) out.firstPassGood++
    } else if (unit.status === 'SCRAPPED') {
      out.scrap++
      item.scrap++
    }
    out.byItem.set(unit.itemId, item)
  }
  return out
}

/** 구간 계획 수량(품목별 포함). 계획이 없으면 null */
export function rangePlan(state: SimState, from: number, to: number): { total: number; byItem: Map<string, number> } | null {
  const plan = state.plan
  if (!plan) return null
  const total = plannedQtyAt(plan, to) - plannedQtyAt(plan, from)
  const all = planTotal(plan)
  return { total, byItem: new Map(plan.lines.map((l) => [l.itemId, (total * l.targetQty) / all])) }
}

// ── 설비 ─────────────────────────────────────────────────

function countersOf(eq: EquipmentCounters): EquipmentCounters {
  return {
    statusTime: { ...eq.statusTime },
    processedCount: eq.processedCount,
    defectCount: eq.defectCount,
    standardTime: eq.standardTime,
  }
}

function zeroCounters(): EquipmentCounters {
  return {
    statusTime: Object.fromEntries(EQUIPMENT_STATUSES.map((s) => [s, 0])) as Record<EquipmentStatus, number>,
    processedCount: 0,
    defectCount: 0,
    standardTime: 0,
  }
}

/** time 시점 설비 누적값. 지금이면 엔진 상태, 아니면 정시 기록. 기록이 없으면 null */
function countersAt(state: SimState, time: number): Record<string, EquipmentCounters> | null {
  if (time === state.time) return Object.fromEntries(state.equipment.map((eq) => [eq.id, countersOf(eq)]))
  return state.equipmentHistory.find((s) => s.time === time)?.equipment ?? null
}

export interface EquipmentRange {
  equipmentId: string
  workCenterId: string
  /** 구간 동안의 상태별 시간 · 가공 수 · 불량 · 표준 시간 */
  counters: EquipmentCounters
  /** 구간 가동률(RUN ÷ 구간 시간). 구간 시간이 0이면 null */
  utilization: number | null
  /** 구간 OEE. 구간 시간이 0이면 null */
  oee: number | null
}

/** 구간 설비 실적. 설비 누적값 기록이 보관 범위 밖이면 null */
export function rangeEquipment(state: SimState, from: number, to: number): EquipmentRange[] | null {
  const start = countersAt(state, from)
  const end = countersAt(state, to)
  if (!start || !end) return null
  const rows: EquipmentRange[] = []
  for (const eq of state.equipment) {
    const b = end[eq.id]
    if (!b) continue // 구간이 끝난 뒤 증설한 설비
    const a = start[eq.id] ?? zeroCounters() // 구간 중간에 증설한 설비
    const counters: EquipmentCounters = {
      statusTime: Object.fromEntries(EQUIPMENT_STATUSES.map((s) => [s, b.statusTime[s] - a.statusTime[s]])) as Record<
        EquipmentStatus,
        number
      >,
      processedCount: b.processedCount - a.processedCount,
      defectCount: b.defectCount - a.defectCount,
      standardTime: b.standardTime - a.standardTime,
    }
    const total = EQUIPMENT_STATUSES.reduce((sum, s) => sum + counters.statusTime[s], 0)
    rows.push({
      equipmentId: eq.id,
      workCenterId: eq.workCenterId,
      counters,
      utilization: total === 0 ? null : counters.statusTime.RUN / total,
      oee: total === 0 ? null : oee(counters).oee,
    })
  }
  return rows
}

export interface StopTimes {
  /** 고장 */
  DOWN: number
  /** 예방정비 */
  PM: number
  /** 자재 부족 */
  STARVED_MATERIAL: number
}

function stopTimes(rows: EquipmentRange[]): StopTimes {
  const stops: StopTimes = { DOWN: 0, PM: 0, STARVED_MATERIAL: 0 }
  for (const r of rows) for (const k of Object.keys(stops) as (keyof StopTimes)[]) stops[k] += r.counters.statusTime[k]
  return stops
}

function stopTotal(stops: StopTimes): number {
  return stops.DOWN + stops.PM + stops.STARVED_MATERIAL
}

function average(values: (number | null)[]): number | null {
  const list = values.filter((v): v is number => v !== null)
  return list.length === 0 ? null : list.reduce((a, b) => a + b, 0) / list.length
}

/** 작업장 가동률: 소속 설비 구간 가동률의 평균 */
function workCenterUtilization(rows: EquipmentRange[], workCenterId: string): number | null {
  return average(rows.filter((r) => r.workCenterId === workCenterId).map((r) => r.utilization))
}

// ── 교대 요약 ─────────────────────────────────────────────

export interface ShiftSummary {
  shift: Shift
  closed: boolean
  from: number
  to: number
  /** 계획 수량(진행 중이면 지금까지). 계획이 없으면 null */
  plan: number | null
  good: number
  scrap: number
  /** 달성률 = 실적 ÷ 계획 */
  attainment: number | null
  /** 최종 양품률 = 양품 ÷ (양품 + 폐기) */
  finalYield: number | null
  fpy: number | null
  reworks: number
  /** 설비별 구간 OEE의 평균(생산 현황의 라인 OEE와 같은 방식) */
  lineOee: number | null
  uph: number | null
  /** 설비 정지 시간(설비별 합, 초). 기록이 없으면 null */
  stops: StopTimes | null
  workOrders: { completed: number; withDue: number; onTime: number }
}

export function shiftSummary(state: SimState, shift: Shift): ShiftSummary {
  const from = shift.start
  const to = shiftRangeEnd(shift, state.time)
  const output = rangeOutput(state, from, to)
  const plan = rangePlan(state, from, to)
  const equipment = rangeEquipment(state, from, to)
  const finished = output.good + output.scrap
  const completed = state.workOrders.filter((wo) => wo.completedAt !== null && inRange(wo.completedAt, from, to))
  const withDue = completed.filter((wo) => wo.dueTime !== null)
  return {
    shift,
    closed: isClosed(shift, state.time),
    from,
    to,
    plan: plan?.total ?? null,
    good: output.good,
    scrap: output.scrap,
    attainment: plan && plan.total > 0 ? output.good / plan.total : null,
    finalYield: finished === 0 ? null : output.good / finished,
    fpy: finished === 0 ? null : output.firstPassGood / finished,
    reworks: output.reworks,
    lineOee: equipment ? average(equipment.map((r) => r.oee)) : null,
    uph: to > from ? (output.good / (to - from)) * HOUR : null,
    stops: equipment ? stopTimes(equipment) : null,
    workOrders: {
      completed: completed.length,
      withDue: withDue.length,
      onTime: withDue.filter((wo) => wo.completedAt! <= wo.dueTime!).length,
    },
  }
}

// ── 시간대별 실적표 ───────────────────────────────────────

export interface HourlyReportRow {
  start: number
  end: number
  /** 아직 끝나지 않은 시간대(지금 진행 중) */
  inProgress: boolean
  plan: number | null
  good: number
  /** 실적 − 계획 */
  gap: number | null
  cumulativePlan: number | null
  cumulativeGood: number
  cumulativeGap: number | null
  scrap: number
  reworks: number
  /** 설비 정지 시간 합(고장 · 정비 · 자재, 초). 기록이 없으면 null */
  stop: number | null
  /** 병목 작업장 가동률 */
  bottleneckUtilization: number | null
  /** 그 시간에 일어난 주요 사건 */
  notes: SimEvent[]
}

export interface HourlyReport {
  /** 가동률을 보여 줄 병목 작업장(현재 기준) */
  bottleneckId: string | null
  rows: HourlyReportRow[]
  total: Omit<HourlyReportRow, 'start' | 'end' | 'inProgress' | 'cumulativePlan' | 'cumulativeGood' | 'cumulativeGap' | 'notes'>
}

export function hourlyReport(state: SimState, master: MasterData, shift: Shift): HourlyReport {
  const to = shiftRangeEnd(shift, state.time)
  const bottleneckId = bottleneck(master, state)?.workCenterId ?? null
  const rows: HourlyReportRow[] = []
  let cumulativePlan: number | null = state.plan ? 0 : null
  let cumulativeGood = 0
  for (let start = shift.start; start < to; start += HOUR) {
    const end = Math.min(start + HOUR, to)
    const output = rangeOutput(state, start, end)
    const plan = rangePlan(state, start, end)?.total ?? null
    const equipment = rangeEquipment(state, start, end)
    cumulativeGood += output.good
    if (cumulativePlan !== null && plan !== null) cumulativePlan += plan
    rows.push({
      start,
      end,
      inProgress: end === state.time && end < start + HOUR,
      plan,
      good: output.good,
      gap: plan === null ? null : output.good - plan,
      cumulativePlan,
      cumulativeGood,
      cumulativeGap: cumulativePlan === null ? null : cumulativeGood - cumulativePlan,
      scrap: output.scrap,
      reworks: output.reworks,
      stop: equipment ? stopTotal(stopTimes(equipment)) : null,
      bottleneckUtilization: equipment && bottleneckId ? workCenterUtilization(equipment, bottleneckId) : null,
      notes: state.events.filter((e) => e.time >= start && e.time < end && isKeyEvent(e)),
    })
  }
  const summary = shiftSummary(state, shift)
  const equipment = rangeEquipment(state, shift.start, to)
  return {
    bottleneckId,
    rows,
    total: {
      plan: summary.plan,
      good: summary.good,
      gap: summary.plan === null ? null : summary.good - summary.plan,
      scrap: summary.scrap,
      reworks: summary.reworks,
      stop: summary.stops ? stopTotal(summary.stops) : null,
      bottleneckUtilization: equipment && bottleneckId ? workCenterUtilization(equipment, bottleneckId) : null,
    },
  }
}

// ── 품목별 · 공정별 ───────────────────────────────────────

export interface ItemReportRow {
  itemId: string
  plan: number | null
  good: number
  scrap: number
  attainment: number | null
  finalYield: number | null
}

export function itemReport(state: SimState, master: MasterData, shift: Shift): ItemReportRow[] {
  const to = shiftRangeEnd(shift, state.time)
  const output = rangeOutput(state, shift.start, to)
  const plan = rangePlan(state, shift.start, to)
  return master.items.map((item) => {
    const { good, scrap } = output.byItem.get(item.id) ?? { good: 0, scrap: 0 }
    const planned = plan ? (plan.byItem.get(item.id) ?? 0) : null
    return {
      itemId: item.id,
      plan: planned,
      good,
      scrap,
      attainment: planned ? good / planned : null,
      finalYield: good + scrap === 0 ? null : good / (good + scrap),
    }
  })
}

export interface WorkCenterReportRow {
  workCenterId: string
  equipmentCount: number
  processed: number
  defects: number
  utilization: number | null
  stops: StopTimes
  oee: number | null
}

/** 공정별 실적. 설비 누적값 기록이 보관 범위 밖이면 null */
export function workCenterReport(state: SimState, master: MasterData, shift: Shift): WorkCenterReportRow[] | null {
  const equipment = rangeEquipment(state, shift.start, shiftRangeEnd(shift, state.time))
  if (!equipment) return null
  return master.workCenters.map((wc) => {
    const rows = equipment.filter((r) => r.workCenterId === wc.id)
    return {
      workCenterId: wc.id,
      equipmentCount: rows.length,
      processed: rows.reduce((s, r) => s + r.counters.processedCount, 0),
      defects: rows.reduce((s, r) => s + r.counters.defectCount, 0),
      utilization: average(rows.map((r) => r.utilization)),
      stops: stopTimes(rows),
      oee: average(rows.map((r) => r.oee)),
    }
  })
}

// ── 인수인계 ─────────────────────────────────────────────

export interface Handover {
  /** 이번 교대 주요 사건(시각순) */
  events: SimEvent[]
  /** 다음 교대로 넘길 일. 가장 최근 교대에서만 만든다(지난 교대 끝 시점의 상태는 남아 있지 않다) */
  carryOver: {
    workOrders: { workOrder: WorkOrder; done: number; atRisk: boolean }[]
    /** 입고 대기 발주 */
    purchaseOrders: SimState['purchaseOrders']
    /** 고장 · 정비 중이거나 센서 경고 · 마모가 높은 설비 */
    equipment: { equipmentId: string; reason: string }[]
    /** 안전재고 이하(결품 포함) 자재 */
    materials: { materialId: string; onHand: number; safetyStock: number }[]
  } | null
}

/** 다음 교대에 넘길 만큼 마모가 높다고 보는 기준(이 값부터 불량률이 오른다) */
const WEAR_HANDOVER = 0.5

export function handover(state: SimState, master: MasterData, shift: Shift): Handover {
  const to = shiftRangeEnd(shift, state.time)
  const events = state.events.filter((e) => e.time >= shift.start && e.time < to && isKeyEvent(e))
  const latest = shiftsUntil(state.time).at(-1)!.index === shift.index
  if (!latest) return { events, carryOver: null }

  const etas = estimateCompletion(state, master)
  const workOrders = state.workOrders
    .filter((wo) => wo.status !== 'COMPLETED')
    .map((wo) => {
      const kind = dueStatus(wo, etas.get(wo.id)?.end ?? null, state.time).kind
      return { workOrder: wo, done: wo.goodQty + wo.scrapQty, atRisk: kind === 'AT_RISK' || kind === 'OVERDUE' }
    })

  const equipment: { equipmentId: string; reason: string }[] = []
  for (const eq of state.equipment) {
    const reasons: string[] = []
    if (eq.status === 'DOWN') reasons.push('고장 수리 중')
    if (eq.status === 'PM') reasons.push('예방정비 중')
    if (eq.sensor && eq.sensor.level !== 'NORMAL') reasons.push(eq.sensor.level === 'CRITICAL' ? '센서 위험' : '센서 경고')
    if (eq.wear >= WEAR_HANDOVER) reasons.push(`마모도 ${eq.wear.toFixed(2)}`)
    if (reasons.length > 0) equipment.push({ equipmentId: eq.id, reason: reasons.join(' · ') })
  }

  const materials = master.materials
    .filter((m) => {
      const status = stockStatus(state.materials[m.id].onHand, m, master)
      return status === 'SHORTAGE' || status === 'BELOW_SAFETY'
    })
    .map((m) => ({ materialId: m.id, onHand: state.materials[m.id].onHand, safetyStock: m.safetyStock }))

  return {
    events,
    carryOver: {
      workOrders,
      purchaseOrders: state.purchaseOrders.filter((po) => po.receivedAt === null),
      equipment,
      materials,
    },
  }
}
