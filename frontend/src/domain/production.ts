import type { ProductionPlan } from './types'

/**
 * 생산 계획 관련 계산. KPI와 마찬가지로 상태에 저장하지 않고 매번 계산한다.
 */

export interface Lot {
  itemId: string
  qty: number
}

/**
 * 계획을 로트(작업지시 단위)로 나눈다. 실제 MES의 "생산 계획 → 작업지시 분할"에 해당한다.
 * 품목이 한쪽으로 몰리지 않도록, 지금까지 나눈 비율(나눈 수량 ÷ 목표)이 가장 낮은 품목부터 번갈아 뽑는다.
 * 마지막 로트는 남은 수량만큼이라 lotSize보다 작을 수 있다.
 */
export function splitIntoLots(lines: ProductionPlan['lines'], lotSize: number): Lot[] {
  if (!(lotSize > 0)) throw new Error('로트 크기는 0보다 커야 합니다')
  const issued = lines.map(() => 0)
  const lots: Lot[] = []
  for (;;) {
    let pick = -1
    for (let i = 0; i < lines.length; i++) {
      if (issued[i] >= lines[i].targetQty) continue
      if (pick === -1 || issued[i] / lines[i].targetQty < issued[pick] / lines[pick].targetQty) pick = i
    }
    if (pick === -1) return lots
    const qty = Math.min(lotSize, lines[pick].targetQty - issued[pick])
    issued[pick] += qty
    lots.push({ itemId: lines[pick].itemId, qty })
  }
}
