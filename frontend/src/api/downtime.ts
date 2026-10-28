import { apiClient } from './client'
import type { OeeRange } from './oee'

/** 비가동 사유(작업자가 고르는 목록, 대분류 순서대로) */
export interface DowntimeReason {
  reasonCode: string
  category: string
  reasonName: string
}

/** 파레토 묶음: REASON(사유 있음) · PENDING(60초 이상인데 사유 없음) · MICRO(60초 미만 순간 정지) */
export type DowntimeKind = 'REASON' | 'PENDING' | 'MICRO'

/** 파레토 한 줄(사유는 시간 많은 순, 그 뒤 사유 미입력, 맨 뒤 순간 정지) */
export interface DowntimeBar {
  kind: DowntimeKind
  /** 사유 미입력 · 순간 정지는 null */
  reasonCode: string | null
  reasonName: string
  category: string | null
  /** 구간 안에 멈춘 초 */
  seconds: number
  count: number
  /** 이 줄까지 더한 시간 ÷ 전체 정지 시간 */
  cumulativeRatio: number | null
}

export interface DowntimeSummary {
  /** 구간 안 전체 정지 시간(초) */
  downSec: number
  /** 60초 이상 정지 수(사유 있는 정지 포함) */
  stopCount: number
  pendingCount: number
  pendingSec: number
  /** 순간 정지 시간(초) */
  microSec: number
  reasonSec: number
}

/** GET /downtimes/summary */
export interface DowntimeReport {
  from: string
  to: string
  summary: DowntimeSummary
  reasons: DowntimeBar[]
}

/** 정지 한 건 */
export interface Downtime {
  id: number
  equipmentId: string
  equipmentName: string
  workOrderId: string | null
  startedAt: string
  lastSeenAt: string
  /** 멈춘 초(받은 DOWN 로그 수) */
  durationSec: number
  /** 마지막 로그가 10초 안이면 아직 멈춰 있다 */
  ongoing: boolean
  alarmCode: string | null
  alarmName: string | null
  reasonCode: string | null
  reasonName: string | null
  category: string | null
  /** AUTO: 알람으로 자동 · MANUAL: 작업자 입력 · null: 사유 없음 */
  reasonSource: 'AUTO' | 'MANUAL' | null
  reasonBy: string | null
  reasonAt: string | null
}

export async function fetchDowntimeReasons(): Promise<DowntimeReason[]> {
  const { data } = await apiClient.get<DowntimeReason[]>('/downtime-reasons')
  return data
}

export async function fetchDowntimeSummary(range: OeeRange): Promise<DowntimeReport> {
  const { data } = await apiClient.get<DowntimeReport>('/downtimes/summary', { params: { range } })
  return data
}

/** 60초 이상이거나 진행 중인 정지(진행 중 먼저 · 최근 시작 순). pending이면 사유 없는 것만 */
export async function fetchDowntimes(range: OeeRange, pending: boolean): Promise<Downtime[]> {
  const { data } = await apiClient.get<{ downtimes: Downtime[] }>('/downtimes', { params: { range, pending } })
  return data.downtimes
}

/** 사유를 넣거나 고친다(작업자 입력). 고친 정지를 돌려준다 */
export async function saveDowntimeReason(id: number, reasonCode: string, enteredBy: string): Promise<Downtime> {
  const { data } = await apiClient.put<Downtime>(`/downtimes/${id}/reason`, { reasonCode, enteredBy })
  return data
}
