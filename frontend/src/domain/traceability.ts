import type { DefectCode, MaterialLot, MasterData, SimState, Unit, UnitHistoryEntry, UnitMaterialLot } from './types'

/**
 * 추적성(Traceability).
 * - 역추적(Backward): 제품 하나 → 어느 작업지시 · 어느 설비 · 언제 · 어떤 자재 로트로 만들었나
 * - 정추적(Forward): 자재 로트 하나 → 그 로트가 들어간 제품 · 작업지시는 무엇인가(리콜 범위)
 */

export interface TraceStep extends UnitHistoryEntry {
  workCenterId: string
  defect: DefectCode | null
}

export interface UnitTrace {
  unit: Unit
  steps: TraceStep[]
  lots: (UnitMaterialLot & { lot: MaterialLot })[]
}

/** 제품 이력(역추적). 없는 제품이면 null */
export function unitTrace(state: SimState, master: MasterData, unitId: string): UnitTrace | null {
  const unit = state.units[unitId]
  if (!unit) return null
  const operations = master.routings.find((r) => r.itemId === unit.itemId)?.operations ?? []
  const codes = new Map(master.defectCodes.map((c) => [c.id, c]))
  return {
    unit,
    steps: unit.history.map((h) => ({
      ...h,
      workCenterId: operations.find((op) => op.seq === h.opSeq)?.workCenterId ?? '',
      defect: h.defectCode ? (codes.get(h.defectCode) ?? null) : null,
    })),
    lots: unit.materialLots.map((l) => ({ ...l, lot: state.materialLots[l.lotId] })),
  }
}

/** 자재의 로트 목록(입고 순) */
export function lotsOf(state: SimState, materialId: string): MaterialLot[] {
  return Object.values(state.materialLots)
    .filter((lot) => lot.materialId === materialId)
    .sort((a, b) => a.receivedAt - b.receivedAt || a.id.localeCompare(b.id))
}

export interface LotUsage {
  /** 이 로트를 쓴 제품 id */
  unitIds: string[]
  /** 이 로트에서 쓴 수량 */
  qtyUsed: number
  /** 작업지시별 제품 수 */
  byWorkOrder: { workOrderId: string; units: number }[]
  completed: number
  scrapped: number
  /** 아직 라인 안 */
  inProcess: number
  /** 불량이 한 번이라도 난 제품 수(재작업 · 폐기 포함) */
  withDefect: number
}

/** 로트 사용처(정추적) */
export function lotUsage(state: SimState, lotId: string): LotUsage {
  const usage: LotUsage = { unitIds: [], qtyUsed: 0, byWorkOrder: [], completed: 0, scrapped: 0, inProcess: 0, withDefect: 0 }
  const byWorkOrder = new Map<string, number>()
  for (const unit of Object.values(state.units)) {
    const used = unit.materialLots.filter((l) => l.lotId === lotId).reduce((sum, l) => sum + l.qty, 0)
    if (used === 0) continue
    usage.unitIds.push(unit.id)
    usage.qtyUsed += used
    byWorkOrder.set(unit.workOrderId, (byWorkOrder.get(unit.workOrderId) ?? 0) + 1)
    if (unit.status === 'COMPLETED') usage.completed++
    else if (unit.status === 'SCRAPPED') usage.scrapped++
    else usage.inProcess++
    if (unit.history.some((h) => h.result === 'DEFECT')) usage.withDefect++
  }
  usage.byWorkOrder = [...byWorkOrder].map(([workOrderId, units]) => ({ workOrderId, units }))
  return usage
}

/** 최근 불량이 난 제품(재작업으로 살린 제품 포함)을 최신순으로. 제품 이력 조회 목록에 쓴다. */
export function recentDefectUnits(state: SimState, limit = 20): Unit[] {
  const lastDefect = (unit: Unit) => Math.max(...unit.history.filter((h) => h.result === 'DEFECT').map((h) => h.end))
  return Object.values(state.units)
    .filter((unit) => unit.history.some((h) => h.result === 'DEFECT'))
    .sort((a, b) => lastDefect(b) - lastDefect(a))
    .slice(0, limit)
}
