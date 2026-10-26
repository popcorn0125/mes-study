import type { SensorStatus } from '@/producer/generate'
import { apiClient } from './client'

/** 설비별 최신 센서 로그(GET /equipment/latest) */
export interface LatestLog {
  equipmentId: string
  /** ISO 8601 시각 */
  recordedAt: string
  status: SensorStatus
  temperature: number | null
  vibration: number | null
}

/** 설비 하나의 센서 로그 한 행(GET /equipment/{id}/sensor-logs) */
export interface SensorLogPoint {
  recordedAt: string
  status: SensorStatus
  temperature: number | null
  vibration: number | null
}

/** 설비 · 상태별로 머문 시간(GET /equipment/status-summary). 로그 1행이 1초다 */
export interface StatusSeconds {
  equipmentId: string
  status: SensorStatus
  seconds: number
}

/** 상태가 이어진 구간 하나(GET /equipment/{id}/status-changes) */
export interface StatusChange {
  status: SensorStatus
  startedAt: string
  /** 진행 중인 마지막 구간은 null */
  endedAt: string | null
  seconds: number
}

/** 작업지시 · 설비별 누적 실적(GET /production-performance) */
export interface ProductionPerformance {
  workOrderId: string
  equipmentId: string
  totalCount: number
  goodCount: number
  badCount: number
  lastUpdatedAt: string
}

/** 설비마다 가장 최근 로그 1건 */
export async function fetchLatestLogs(): Promise<LatestLog[]> {
  const { data } = await apiClient.get<LatestLog[]>('/equipment/latest')
  return data
}

/** 설비 하나의 최근 minutes분 로그(시간순) */
export async function fetchRecentLogs(equipmentId: string, minutes = 10): Promise<SensorLogPoint[]> {
  const { data } = await apiClient.get<SensorLogPoint[]>(
    `/equipment/${encodeURIComponent(equipmentId)}/sensor-logs`,
    { params: { minutes } },
  )
  return data
}

/** 최근 minutes분 동안 설비 · 상태별로 머문 초 */
export async function fetchStatusSummary(minutes = 60): Promise<StatusSeconds[]> {
  const { data } = await apiClient.get<StatusSeconds[]>('/equipment/status-summary', { params: { minutes } })
  return data
}

/** 설비 하나의 최근 minutes분 상태 변경 구간(최신 구간부터) */
export async function fetchStatusChanges(equipmentId: string, minutes = 60): Promise<StatusChange[]> {
  const { data } = await apiClient.get<StatusChange[]>(
    `/equipment/${encodeURIComponent(equipmentId)}/status-changes`,
    { params: { minutes } },
  )
  return data
}

/** 모든 작업지시 · 설비의 현재 누적 실적 */
export async function fetchProduction(): Promise<ProductionPerformance[]> {
  const { data } = await apiClient.get<ProductionPerformance[]>('/production-performance')
  return data
}
