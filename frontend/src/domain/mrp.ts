import type { MasterData, SimState } from './types'

/**
 * 소요량 계산(MRP 기초).
 * - 총소요 = 남은 생산 수량 × BOM 수량
 * - 순소요 = 총소요 + 안전재고 − 현재고 − 입고 예정. 양수면 지금 발주한 것만으로는 모자란다.
 * 남은 생산 수량은 끝나지 않은 작업지시의 미투입 수량에, 라인 안에서 그 자재를 아직 쓰지 않은 제품을 더한 것이다.
 * 폐기된 만큼 다시 만드는 보충 투입은 엔진이 하지 않으므로 넣지 않는다.
 */

export interface BomTreeItem {
  itemId: string
  /** 라인 순서대로, 자재를 쓰는 작업장만 */
  workCenters: { workCenterId: string; lines: { materialId: string; qtyPer: number }[] }[]
}

/** 품목 → 작업장(라인 순) → 자재 × 수량 */
export function bomTree(master: MasterData): BomTreeItem[] {
  return master.items.map((item) => ({
    itemId: item.id,
    workCenters: master.workCenters
      .map((wc) => ({
        workCenterId: wc.id,
        lines: master.bom
          .filter((l) => l.itemId === item.id && l.workCenterId === wc.id)
          .map((l) => ({ materialId: l.materialId, qtyPer: l.qtyPer })),
      }))
      .filter((wc) => wc.lines.length > 0),
  }))
}

/** 품목 1대에 드는 자재 수량(작업장을 합친 값) */
function qtyPerItem(master: MasterData, itemId: string, materialId: string): number {
  return master.bom
    .filter((l) => l.itemId === itemId && l.materialId === materialId)
    .reduce((sum, l) => sum + l.qtyPer, 0)
}

export interface MaterialRequirement {
  materialId: string
  /** 총소요 */
  gross: number
  /** 품목별 총소요 */
  byItem: { itemId: string; qty: number }[]
  onHand: number
  /** 입고 예정 */
  onOrder: number
  safetyStock: number
  /** 순소요(음수면 남는 양) */
  net: number
}

/** 자재별 총소요 · 순소요. 기준정보 순서대로 */
export function materialRequirements(state: SimState, master: MasterData): MaterialRequirement[] {
  // 품목별 아직 투입하지 않은 수량
  const unreleased = new Map<string, number>()
  for (const wo of state.workOrders) {
    if (wo.status === 'COMPLETED') continue
    unreleased.set(wo.itemId, (unreleased.get(wo.itemId) ?? 0) + wo.qty - wo.releasedQty)
  }
  const lineUnits = Object.values(state.units).filter((u) => u.status === 'QUEUED' || u.status === 'PROCESSING')

  return master.materials.map((material) => {
    const byItem = master.items
      .map((item) => {
        const per = qtyPerItem(master, item.id, material.id)
        if (per === 0) return { itemId: item.id, qty: 0 }
        let qty = (unreleased.get(item.id) ?? 0) * per
        for (const unit of lineUnits) {
          if (unit.itemId !== item.id) continue
          const used = unit.materialLots.filter((l) => l.materialId === material.id).reduce((sum, l) => sum + l.qty, 0)
          qty += per - used
        }
        return { itemId: item.id, qty }
      })
      .filter((x) => x.qty > 0)
    const stock = state.materials[material.id]
    const gross = byItem.reduce((sum, x) => sum + x.qty, 0)
    const onOrder = stock.orders.reduce((sum, po) => sum + po.qty, 0)
    return {
      materialId: material.id,
      gross,
      byItem,
      onHand: stock.onHand,
      onOrder,
      safetyStock: material.safetyStock,
      net: gross + material.safetyStock - stock.onHand - onOrder,
    }
  })
}
