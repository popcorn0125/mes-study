import { WEAR_FAILURE_ONSET } from '@/sim/failure'
import type { DowntimeRecord, EquipmentRuntime, EquipmentStatus, Reliability, SimState } from './types'

/**
 * 설비 보전 관련 계산. KPI와 마찬가지로 상태에 저장하지 않고 매번 계산한다.
 *
 * 손실 구분
 * - 비계획 정지: 고장, 자재 부족 → OEE 가용성 손실
 * - 계획 정지: 예방정비 → OEE 손실 아님
 * - 라인 손실: 공급 대기, 막힘 → 설비 탓이 아니라 앞뒤 공정(흐름) 탓. 설비 OEE에는 넣지 않는다
 */
export type LossKind = 'unplanned' | 'planned' | 'line'

export const LOSS_KIND_LABEL: Record<LossKind, string> = {
  unplanned: '비계획 정지',
  planned: '계획 정지',
  line: '라인 손실',
}

/** 비가동으로 보는 설비 상태와 그 사유 이름·손실 구분 */
const STOP_REASONS: { status: EquipmentStatus; label: string; kind: LossKind }[] = [
  { status: 'DOWN', label: '고장', kind: 'unplanned' },
  { status: 'STARVED_MATERIAL', label: '자재 부족', kind: 'unplanned' },
  { status: 'PM', label: '예방정비', kind: 'planned' },
  { status: 'STARVED', label: '공급 대기', kind: 'line' },
  { status: 'BLOCKED', label: '후공정 막힘', kind: 'line' },
]

export interface LossBreakdown {
  run: number
  unplanned: number
  planned: number
  line: number
  idle: number
}

/** 설비 시간(초)을 가동 · 비계획 정지 · 계획 정지 · 라인 손실 · 휴지로 나눈다 */
export function lossBreakdown(eq: EquipmentRuntime): LossBreakdown {
  const t = eq.statusTime
  return {
    run: t.RUN,
    unplanned: t.DOWN + t.STARVED_MATERIAL,
    planned: t.PM,
    line: t.STARVED + t.BLOCKED,
    idle: t.IDLE,
  }
}

export interface ParetoEntry {
  status: EquipmentStatus
  label: string
  kind: LossKind
  /** 라인 전체 설비의 해당 사유 누적 시간(초) */
  seconds: number
  /** 큰 순서로 더한 누적 비율(0~1) */
  cumulative: number
}

/**
 * 라인 전체 비가동 시간을 사유별로 합쳐 큰 순서로 정렬한다(파레토).
 * 진행 중인 정지도 상태별 누적 시간에 들어 있어 지금 시각까지 포함된다. 시간이 0인 사유는 뺀다.
 */
export function downtimePareto(state: SimState): ParetoEntry[] {
  const entries = STOP_REASONS.map((r) => ({
    ...r,
    seconds: state.equipment.reduce((sum, eq) => sum + eq.statusTime[r.status], 0),
  }))
    .filter((e) => e.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
  const total = entries.reduce((sum, e) => sum + e.seconds, 0)
  let acc = 0
  return entries.map((e) => {
    acc += e.seconds
    return { ...e, cumulative: acc / total }
  })
}

export interface ReliabilityStats {
  failures: number
  /** 평균 고장 간격(초) = 가동 시간 ÷ 고장 횟수. 고장이 없으면 null */
  mtbf: number | null
  /** 평균 수리 시간(초) = 끝난 수리 시간의 평균. 끝난 수리가 없으면 null */
  mttr: number | null
  /** 고유 가용도 = MTBF ÷ (MTBF + MTTR). 둘 중 하나라도 없으면 null */
  availability: number | null
}

/**
 * 설비 고장 지표. MTBF의 "가동 시간"은 RUN 시간이다(이 엔진에서 고장은 가동 중에만 난다).
 */
export function reliabilityStats(state: SimState, equipmentId: string): ReliabilityStats {
  const eq = state.equipment.find((e) => e.id === equipmentId)
  if (!eq) throw new Error(`알 수 없는 설비: ${equipmentId}`)
  const repairs = state.downtimes.filter(
    (d) => d.equipmentId === equipmentId && d.reason === 'BREAKDOWN' && d.end !== null,
  )
  const failures = eq.failureCount
  const mtbf = failures > 0 ? eq.statusTime.RUN / failures : null
  const mttr = repairs.length > 0 ? repairs.reduce((sum, d) => sum + d.end! - d.start, 0) / repairs.length : null
  const availability = mtbf !== null && mttr !== null ? mtbf / (mtbf + mttr) : null
  return { failures, mtbf, mttr, availability }
}

/**
 * 지금 마모 속도로 고장 위험 구간(마모도 0.7)까지 남은 가동 시간(시간).
 * 이미 위험 구간이면 0, 신뢰성 정보가 없으면 null.
 */
export function hoursToFailureRisk(eq: EquipmentRuntime, reliability: Reliability | undefined): number | null {
  if (!reliability || !(reliability.wearPerRunHour > 0)) return null
  return Math.max(0, (WEAR_FAILURE_ONSET - eq.wear) / reliability.wearPerRunHour)
}

/** 비가동 이력을 최신순으로. equipmentId를 주면 그 설비만 */
export function downtimeLog(state: SimState, equipmentId: string | null = null, limit = 20): DowntimeRecord[] {
  const result: DowntimeRecord[] = []
  for (let i = state.downtimes.length - 1; i >= 0 && result.length < limit; i--) {
    const d = state.downtimes[i]
    if (equipmentId === null || d.equipmentId === equipmentId) result.push(d)
  }
  return result
}
