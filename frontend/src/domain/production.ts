import { oee } from './kpi'
import type { ProductionPlan, SimEvent, SimState } from './types'

const HOUR = 3600

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

/** 계획 총 목표 수량 */
export function planTotal(plan: ProductionPlan): number {
  return plan.lines.reduce((sum, line) => sum + line.targetQty, 0)
}

/** 계획상 시간당 생산량. 실제 UPH와 비교하는 기준값이다. */
export function plannedUph(plan: ProductionPlan): number {
  return (planTotal(plan) / plan.duration) * HOUR
}

/**
 * time까지 만들었어야 할 누적 수량. 계획 기간 동안 일정한 속도로 만든다고 본다.
 * 계획 시작 전이면 0, 계획이 끝난 뒤면 목표 전체.
 */
export function plannedQtyAt(plan: ProductionPlan, time: number): number {
  const elapsed = Math.min(Math.max(time - plan.startTime, 0), plan.duration)
  return (planTotal(plan) * elapsed) / plan.duration
}

/** 달성률 = 실적(양품 완료 수) ÷ 지금까지 계획 수량. 계획이 없거나 아직 계획 수량이 0이면 null. */
export function planAttainment(state: SimState): number | null {
  if (!state.plan) return null
  const planned = plannedQtyAt(state.plan, state.time)
  return planned === 0 ? null : state.counters.completed / planned
}

export interface HourlyBucket {
  /** 0부터 시작하는 시간대 번호(0 = 첫 1시간) */
  hour: number
  /** 이 시간대에 완료된 양품 수. 아직 오지 않은 시간대면 null */
  good: number | null
  /** 이 시간대 끝(진행 중이면 지금)까지의 누적 양품 수. 아직 오지 않은 시간대면 null */
  cumulativeGood: number | null
  /** 이 시간대 끝(진행 중이면 지금)까지의 누적 계획 수량. 실적과 같은 시점끼리 비교한다. 계획이 없으면 null */
  cumulativePlan: number | null
}

/**
 * 시간대별(1시간 단위) 생산 실적과 누적 계획. 생산 추이 차트의 데이터다.
 * 계획 기간 전체를 보여줘 앞으로 남은 계획선도 보이게 하고, 계획이 끝난 뒤에도 시간이 흐르면 그만큼 늘린다.
 */
export function hourlyOutput(state: SimState): HourlyBucket[] {
  const plan = state.plan
  const planEnd = plan ? plan.startTime + plan.duration : 0
  const elapsedHours = Math.ceil(state.time / HOUR)
  const count = Math.max(Math.ceil(planEnd / HOUR), elapsedHours, 1)

  const good = new Array<number>(count).fill(0)
  for (const unit of Object.values(state.units)) {
    if (unit.status !== 'COMPLETED') continue
    good[Math.min(Math.floor((unit.finishedAt! - 1) / HOUR), count - 1)]++
  }

  let cumulative = 0
  return good.map((qty, hour) => {
    const started = hour < elapsedHours
    const end = (hour + 1) * HOUR
    cumulative += qty
    return {
      hour,
      good: started ? qty : null,
      cumulativeGood: started ? cumulative : null,
      cumulativePlan: plan ? plannedQtyAt(plan, started ? Math.min(end, state.time) : end) : null,
    }
  })
}

/**
 * 라인 OEE: 설비별 OEE의 단순 평균. 아직 시간이 흐르지 않았으면 null.
 * 라인 전체 산출량은 병목 설비가 정하므로, 병목 설비의 OEE를 따로 보는 것이 더 정확할 때도 있다.
 */
export function lineOee(state: SimState): number | null {
  if (state.time === 0 || state.equipment.length === 0) return null
  return state.equipment.reduce((sum, eq) => sum + oee(eq).oee, 0) / state.equipment.length
}

/**
 * 최근 알람: 경고·위험 이벤트를 최신순으로 limit건.
 * 제품 한 개의 불량 폐기는 알람이 아니라 품질 데이터로 보고 뺀다(설비·자재 이상만 알람).
 */
export function recentAlarms(state: SimState, limit = 10): SimEvent[] {
  const alarms: SimEvent[] = []
  for (let i = state.events.length - 1; i >= 0 && alarms.length < limit; i--) {
    const event = state.events[i]
    if (event.severity !== 'info' && event.type !== 'UNIT_SCRAPPED') alarms.push(event)
  }
  return alarms
}
