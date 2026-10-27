import type { ProducerEquipment } from './equipment'
import { step, type EquipmentState, type Random } from './generate'

/** 라인이 지금 생산하는 작업지시(서버의 진행 중 지시) */
export interface LineWorkOrder {
  workOrderId: string
  plannedQty: number
}

/** 투입했지만 아직 완성하지 않은 수(가공 중이면 1) */
const started = (state: EquipmentState) => state.production.totalCount + (state.inProcess ? 1 : 0)

/**
 * 첫 공정이 더 투입할 수 있는 수.
 * 첫 공정 양품 중 뒤 공정에서 불량으로 버려지지 않은 것은 결국 완성품이 되므로,
 * "살아 있는 양품 + 가공 중"이 지시 수량에 이를 때까지만 투입한다. 불량이 나면 그만큼 더 투입하게 된다.
 */
function firstSupply(states: readonly EquipmentState[], plannedQty: number): number {
  const [first, ...rest] = states
  const scrappedDownstream = rest.reduce((sum, s) => sum + s.production.badCount, 0)
  const alive = first.production.goodCount - scrappedDownstream + (first.inProcess ? 1 : 0)
  return Math.max(0, plannedQty - alive)
}

/**
 * 라인 전체 1초 진행(라인 순서대로).
 * - 작업지시가 없으면 아무것도 투입하지 않는다(모두 대기).
 * - 첫 공정은 지시 수량을 채울 만큼만, 뒤 공정은 앞 공정이 넘겨준 양품(앞 공정 양품 − 내가 투입한 수)만큼만 투입한다.
 *   앞 공정이 이번 초에 완성한 양품은 이번 초에 바로 가져갈 수 있다.
 * - 공정 사이 재공은 누적 수량만으로 정해지므로, 서버에 저장된 수량에서 다시 시작해도 그대로 이어진다.
 */
export function stepLine(
  line: readonly ProducerEquipment[],
  states: readonly EquipmentState[],
  workOrder: LineWorkOrder | null,
  random: Random,
): EquipmentState[] {
  const next: EquipmentState[] = []
  states.forEach((state, i) => {
    let supply = 0
    if (workOrder) {
      supply = i === 0 ? firstSupply(states, workOrder.plannedQty) : next[i - 1].production.goodCount - started(state)
    }
    next.push(step(line[i], state, random, supply))
  })
  return next
}

/** 공정 사이에 쌓인 재공: i번째 값 = i번째 공정이 넘겨줬지만 다음 공정이 아직 투입하지 않은 양품 수(마지막 공정은 0) */
export function waitingBetween(states: readonly EquipmentState[]): number[] {
  return states.map((state, i) => (i + 1 < states.length ? state.production.goodCount - started(states[i + 1]) : 0))
}
