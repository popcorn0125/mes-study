import type { SensorLog } from '@/producer/generate'
import { apiClient } from './client'

/** PLANNED 계획 · RELEASED 하달 · IN_PROGRESS 진행 · HELD 보류 · COMPLETED 완료 */
export type WorkOrderStatus = 'PLANNED' | 'RELEASED' | 'IN_PROGRESS' | 'HELD' | 'COMPLETED'

/** 품목(GET /items) */
export interface Item {
  itemCode: string
  itemName: string
}

/** 작업지시 목록 한 행(GET /work-orders). 시각은 ISO 8601, 없으면 null */
export interface WorkOrder {
  workOrderId: string
  itemCode: string
  itemName: string
  plannedQty: number
  status: WorkOrderStatus
  /** 0~9, 클수록 먼저 */
  priority: number
  dueAt: string | null
  createdAt: string
  releasedAt: string | null
  startedAt: string | null
  completedAt: string | null
  /** 마지막 공정(포장) 양품 수 = 실적 */
  completedQty: number
}

/** 설비 한 대의 작업지시 수량(라인 순서) */
export interface EquipmentPerformance {
  equipmentId: string
  equipmentName: string
  lineOrder: number
  standardTactSec: number
  totalCount: number
  goodCount: number
  badCount: number
}

/** 작업지시 상세(GET /work-orders/{id}, /work-orders/current) */
export interface WorkOrderDetail extends WorkOrder {
  performance: EquipmentPerformance[]
}

/** 등록 본문(POST /work-orders). dueAt은 ISO 8601 */
export interface NewWorkOrder {
  itemCode: string
  plannedQty: number
  priority: number
  dueAt?: string
}

export type WorkOrderAction = 'release' | 'hold' | 'resume'

export async function fetchItems(): Promise<Item[]> {
  return (await apiClient.get<Item[]>('/items')).data
}

/** 목록. 상태를 주지 않으면 전체 */
export async function fetchWorkOrders(statuses: readonly WorkOrderStatus[] = []): Promise<WorkOrder[]> {
  // ?status=A&status=B 형식(axios 기본은 status[]=A)
  const params = new URLSearchParams()
  statuses.forEach((status) => params.append('status', status))
  return (await apiClient.get<WorkOrder[]>('/work-orders', { params })).data
}

export async function fetchWorkOrder(workOrderId: string): Promise<WorkOrderDetail> {
  return (await apiClient.get<WorkOrderDetail>(`/work-orders/${encodeURIComponent(workOrderId)}`)).data
}

/** 진행 중 작업지시. 없으면(204) null */
export async function fetchCurrentWorkOrder(): Promise<WorkOrderDetail | null> {
  const response = await apiClient.get<WorkOrderDetail | ''>('/work-orders/current')
  return response.status === 204 || !response.data ? null : response.data
}

export async function createWorkOrder(body: NewWorkOrder): Promise<WorkOrderDetail> {
  return (await apiClient.post<WorkOrderDetail>('/work-orders', body)).data
}

/** 하달 · 보류 · 보류 해제. 지금 상태에서 할 수 없으면 409 */
export async function changeWorkOrder(workOrderId: string, action: WorkOrderAction): Promise<WorkOrderDetail> {
  return (await apiClient.post<WorkOrderDetail>(`/work-orders/${encodeURIComponent(workOrderId)}/${action}`)).data
}

// ── 시뮬레이터 전용 ─────────────────────────────────────

/** 1초 전송에 붙이는 실행 ID 헤더 */
export const RUN_ID_HEADER = 'X-Producer-Run-Id'

/** 시뮬레이터 시작(POST /producer/runs). 이전에 실행 중이던 탭은 밀려난다 */
export async function startProducerRun(): Promise<{ runId: string; workOrder: WorkOrderDetail | null }> {
  return (await apiClient.post('/producer/runs')).data
}

/** 1초 전송 응답: 저장 건수와 지금 진행 중인 작업지시 */
export interface BulkResult {
  sensorLogs: number
  productions: number
  workOrder: { workOrderId: string; plannedQty: number } | null
}

export async function postSensorLogs(runId: string, logs: readonly SensorLog[]): Promise<BulkResult> {
  return (await apiClient.post<BulkResult>('/sensor-logs/bulk', logs, { headers: { [RUN_ID_HEADER]: runId } })).data
}
