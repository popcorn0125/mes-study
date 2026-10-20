import { EQUIPMENT_STATUSES, type EquipmentCounters, type EquipmentRuntime, type MasterData, type SimState, type Unit } from './types'

/**
 * KPI는 상태에 저장하지 않고 스냅샷에서 매번 계산한다.
 */

/** 라인 안에 있는 재공품 수(투입 − 양품 완료 − 폐기). */
export function wip(state: SimState): number {
  const { released, completed, scrapped } = state.counters
  return released - completed - scrapped
}

/** 시작부터 지금까지의 평균 WIP */
export function averageWip(state: SimState): number {
  return state.time === 0 ? 0 : state.counters.wipSeconds / state.time
}

/** 최근 windowSec 동안 완료된 양품 수를 시간당 생산량(UPH)으로 환산한다. */
export function throughputPerHour(state: SimState, windowSec = 3600): number {
  const window = Math.min(windowSec, state.time)
  if (window <= 0) return 0
  const since = state.time - window
  let count = 0
  for (const unit of Object.values(state.units)) {
    if (unit.status === 'COMPLETED' && unit.finishedAt! > since) count++
  }
  return (count / window) * 3600
}

/** 완료된 양품의 평균 리드타임(투입 → 완료, 초). */
export function averageLeadTime(state: SimState): number {
  let sum = 0
  let count = 0
  for (const unit of Object.values(state.units)) {
    if (unit.status !== 'COMPLETED') continue
    sum += unit.finishedAt! - unit.releasedAt
    count++
  }
  return count === 0 ? 0 : sum / count
}

function totalTime(eq: EquipmentCounters): number {
  return EQUIPMENT_STATUSES.reduce((sum, s) => sum + eq.statusTime[s], 0)
}

/** 설비 가동률: 전체 시간 중 RUN 비율. */
export function utilization(eq: EquipmentRuntime): number {
  const total = totalTime(eq)
  return total === 0 ? 0 : eq.statusTime.RUN / total
}

export interface Oee {
  availability: number
  performance: number
  quality: number
  oee: number
}

/**
 * OEE = 가용성 × 성능 × 품질.
 * - 가용성: 계획 가동 시간(전체 − 예방정비) 중 비계획 정지(고장, 자재 부족)를 뺀 비율.
 *   예방정비(PM)는 계획된 정지라 손실로 보지 않는다.
 * - 성능: 표준 사이클타임 기준 기대 가공시간 / 실제 RUN 시간. 사이클타임이 표준보다 느려지면 떨어진다.
 * - 품질: 양품 / 가공 수.
 */
export function oee(eq: EquipmentCounters): Oee {
  const planned = totalTime(eq) - eq.statusTime.PM
  const unplannedStops = eq.statusTime.DOWN + eq.statusTime.STARVED_MATERIAL
  const availability = planned <= 0 ? 0 : (planned - unplannedStops) / planned
  const performance = eq.statusTime.RUN === 0 ? 0 : Math.min(1, eq.standardTime / eq.statusTime.RUN)
  const quality = eq.processedCount === 0 ? 0 : (eq.processedCount - eq.defectCount) / eq.processedCount
  return { availability, performance, quality, oee: availability * performance * quality }
}

/** 작업장 가동률: 소속 설비 가동률의 평균. */
export function workCenterUtilization(state: SimState, workCenterId: string): number {
  const list = state.equipment.filter((eq) => eq.workCenterId === workCenterId)
  if (list.length === 0) return 0
  return list.reduce((sum, eq) => sum + utilization(eq), 0) / list.length
}

/**
 * 작업장별 실효 사이클타임(초/개) = 현재 사이클타임 ÷ 설비 대수.
 * 품목마다 사이클타임이 다르므로, 진행 중인 작업지시의 남은 수량 비율로 가중 평균한다(남은 작업이 없으면 품목 균등).
 */
export function effectiveCycleTimes(master: MasterData, state: SimState): Map<string, number> {
  const weights = new Map<string, number>()
  for (const wo of state.workOrders) {
    if (wo.status === 'COMPLETED' || wo.status === 'PLANNED') continue
    const remaining = wo.qty - wo.goodQty - wo.scrapQty
    weights.set(wo.itemId, (weights.get(wo.itemId) ?? 0) + remaining)
  }
  if (weights.size === 0) for (const item of master.items) weights.set(item.id, 1)

  const result = new Map<string, number>()
  for (const wc of master.workCenters) {
    let weighted = 0
    let totalWeight = 0
    for (const routing of master.routings) {
      const weight = weights.get(routing.itemId) ?? 0
      const op = routing.operations.find((o) => o.workCenterId === wc.id)
      if (!op || weight === 0) continue
      weighted += weight * (state.cycleTimeOverride[wc.id] ?? op.cycleTime)
      totalWeight += weight
    }
    const equipmentCount = state.equipment.filter((eq) => eq.workCenterId === wc.id).length
    if (totalWeight > 0 && equipmentCount > 0) result.set(wc.id, weighted / totalWeight / equipmentCount)
  }
  return result
}

export interface Bottleneck {
  workCenterId: string
  /** 실효 사이클타임(초/개) */
  effectiveCycleTime: number
  /** 이 병목이 허용하는 이론 최대 시간당 생산량 */
  maxUph: number
}

/**
 * 병목 작업장: 실효 사이클타임이 가장 긴(부하가 가장 큰) 작업장.
 * 누적 가동률로 판단하면 시작 직후 투입 버퍼가 늘 차 있는 첫 공정이 병목처럼 보이므로, 능력 기준으로 판단한다.
 */
export function bottleneck(master: MasterData, state: SimState): Bottleneck | null {
  let best: Bottleneck | null = null
  for (const [workCenterId, effectiveCycleTime] of effectiveCycleTimes(master, state)) {
    if (!best || effectiveCycleTime > best.effectiveCycleTime) {
      best = { workCenterId, effectiveCycleTime, maxUph: 3600 / effectiveCycleTime }
    }
  }
  return best
}

/** 양품률: 완료된 Unit 중 양품 비율. 아직 완료된 Unit이 없으면 null. */
export function yieldRate(state: SimState): number | null {
  const { completed, scrapped } = state.counters
  const finished = completed + scrapped
  return finished === 0 ? null : completed / finished
}

/** Unit이 현재 위치(버퍼)에서 기다리기 시작한 시각: 직전 공정 종료 시각, 없으면 투입 시각. */
export function waitingSince(unit: Unit): number {
  return unit.history.at(-1)?.end ?? unit.releasedAt
}

/** 이 자재를 쓰는 BOM 줄 중 가장 큰 소요량. 재고가 이보다 적으면 어떤 품목도 1대 만들 수 없는 결품이다. */
export function maxQtyPer(master: MasterData, materialId: string): number {
  return Math.max(1, ...master.bom.filter((l) => l.materialId === materialId).map((l) => l.qtyPer))
}
