import { maxQtyPer } from './kpi'
import type { MasterData, Material, PurchaseOrder, SimState } from './types'

const HOUR = 3600

/**
 * 재고 지표 계산. 엔진 상태를 읽기만 한다.
 * - 재고 상태: 결품(어떤 품목도 1대 만들 수 없음) → 안전재고 이하 → 발주점 이하 → 정상
 * - 소비 속도: 재고 이력의 누적 소비량 차이 ÷ 기간. 입고와 섞이지 않는다.
 * - 재고 커버: 현재고 ÷ 소비 속도 = 지금 속도로 버틸 수 있는 시간
 */

export type StockStatus = 'SHORTAGE' | 'BELOW_SAFETY' | 'BELOW_ROP' | 'OK'

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  SHORTAGE: '결품',
  BELOW_SAFETY: '안전재고 이하',
  BELOW_ROP: '발주점 이하',
  OK: '정상',
}

export function stockStatus(onHand: number, material: Material, master: MasterData): StockStatus {
  if (onHand < maxQtyPer(master, material.id)) return 'SHORTAGE'
  if (onHand <= material.safetyStock) return 'BELOW_SAFETY'
  if (onHand <= material.reorderPoint) return 'BELOW_ROP'
  return 'OK'
}

/** 최근 windowSec 동안의 소비 속도(시간당). 지난 시간이 없으면 null */
export function consumptionRate(state: SimState, materialId: string, windowSec = HOUR): number | null {
  const since = state.time - Math.min(windowSec, state.time)
  // 기간 시작 시각 이후의 첫 기록(기록은 시각 순)
  const from = state.stockHistory.find((s) => s.time >= since)
  if (!from || state.time <= from.time) return null
  const used = state.materials[materialId].consumed - from.consumed[materialId]
  return (used / (state.time - from.time)) * HOUR
}

/** 재고 커버(초). 소비가 없으면 null */
export function stockCoverage(onHand: number, ratePerHour: number | null): number | null {
  if (!ratePerHour) return null
  return (onHand / ratePerHour) * HOUR
}

export interface MaterialRow {
  material: Material
  onHand: number
  /** 발주점 중 리드타임 동안 예상 소요 몫(발주점 − 안전재고) */
  leadTimeDemand: number
  /** 입고 예정 수량 */
  onOrder: number
  ratePerHour: number | null
  coverage: number | null
  status: StockStatus
  /** 재고 금액(원) */
  value: number
}

/** 재고 현황 표: 기준정보 순서대로 */
export function materialRows(state: SimState, master: MasterData): MaterialRow[] {
  return master.materials.map((material) => {
    const stock = state.materials[material.id]
    const ratePerHour = consumptionRate(state, material.id)
    return {
      material,
      onHand: stock.onHand,
      leadTimeDemand: material.reorderPoint - material.safetyStock,
      onOrder: stock.orders.reduce((sum, po) => sum + po.qty, 0),
      ratePerHour,
      coverage: stockCoverage(stock.onHand, ratePerHour),
      status: stockStatus(stock.onHand, material, master),
      value: stock.onHand * material.unitCost,
    }
  })
}

export interface InventorySummary {
  /** 재고 금액 합계(원) */
  totalValue: number
  /** 재고 커버가 가장 짧은 자재. 소비 중인 자재가 없으면 null */
  minCoverage: { materialId: string; seconds: number } | null
  /** 안전재고 이하(결품 포함) 자재 수 */
  belowSafety: number
  /** 입고 대기 발주 수 */
  pendingOrders: number
  /** 가장 빠른 입고까지 남은 시간(초). 입고 대기가 없으면 null */
  nextArrival: number | null
  /** 설비들의 자재 부족 정지 누적 시간(초) */
  materialStop: number
  expediteSurcharge: number
}

export function inventorySummary(state: SimState, master: MasterData): InventorySummary {
  const rows = materialRows(state, master)
  let minCoverage: InventorySummary['minCoverage'] = null
  for (const row of rows) {
    if (row.coverage === null) continue
    if (!minCoverage || row.coverage < minCoverage.seconds) {
      minCoverage = { materialId: row.material.id, seconds: row.coverage }
    }
  }
  const pending = state.purchaseOrders.filter((po) => po.receivedAt === null)
  return {
    totalValue: rows.reduce((sum, r) => sum + r.value, 0),
    minCoverage,
    belowSafety: rows.filter((r) => r.status === 'SHORTAGE' || r.status === 'BELOW_SAFETY').length,
    pendingOrders: pending.length,
    nextArrival: pending.length === 0 ? null : Math.min(...pending.map((po) => po.eta)) - state.time,
    materialStop: state.equipment.reduce((sum, eq) => sum + eq.statusTime.STARVED_MATERIAL, 0),
    expediteSurcharge: state.costs.expediteSurcharge,
  }
}

export interface StockTrend {
  /** [시각, 재고]. 마지막 점은 현재 시각 */
  points: [number, number][]
  /** 이 자재의 발주(발주 순) */
  orders: PurchaseOrder[]
}

/** 재고 추이 차트 데이터 */
export function stockTrend(state: SimState, materialId: string): StockTrend {
  const points: [number, number][] = state.stockHistory.map((s) => [s.time, s.onHand[materialId]])
  if (points.at(-1)?.[0] !== state.time) points.push([state.time, state.materials[materialId].onHand])
  return { points, orders: state.purchaseOrders.filter((po) => po.materialId === materialId) }
}
