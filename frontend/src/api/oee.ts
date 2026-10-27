import { apiClient } from './client'

/** OEE 조회 구간: 오늘(서울 00시 ~ 지금) · 최근 1시간 · 최근 8시간 */
export type OeeRange = 'today' | '1h' | '8h'

/** 손실 시간(초): 고장 · 앞 공정 기다림 · 속도 저하 · 불량을 만드느라 쓴 시간 */
export interface OeeLoss {
  downSec: number
  idleSec: number
  speedSec: number
  defectSec: number
}

/** 설비 한 대의 OEE 분해. 비율(0~1)은 분모가 0이면 null */
export interface EquipmentOee {
  equipmentId: string
  equipmentName: string
  lineOrder: number
  standardTactSec: number
  /** 계획 가동 시간 = 작업지시가 있던 초 */
  plannedSec: number
  /** RUN + WARN 초 */
  runSec: number
  downSec: number
  idleSec: number
  totalCount: number
  goodCount: number
  badCount: number
  availability: number | null
  performance: number | null
  quality: number | null
  oee: number | null
  loss: OeeLoss
}

/** 라인 OEE = 포장기 양품 × 병목 기준 택트 ÷ 라인 계획 가동 시간 */
export interface LineOee {
  oee: number | null
  plannedSec: number
  /** 포장기(마지막 공정) 양품 수 */
  goodCount: number
  bottleneckEquipmentId: string
  bottleneckTactSec: number
}

/** GET /oee */
export interface OeeSummary {
  from: string
  to: string
  line: LineOee
  equipment: EquipmentOee[]
}

/** 시각 칸 하나의 라인 OEE */
export interface OeeTrendPoint extends LineOee {
  bucketStart: string
}

/** GET /oee/trend. 작업지시가 없던 칸은 points에 없다 */
export interface OeeTrend {
  from: string
  to: string
  bucketSec: number
  points: OeeTrendPoint[]
}

/** GET /work-orders/{id}/oee. from = 시작, to = 완료(진행 중이면 null) */
export interface WorkOrderOee {
  workOrderId: string
  from: string | null
  to: string | null
  line: LineOee
  equipment: EquipmentOee[]
}

export async function fetchOee(range: OeeRange): Promise<OeeSummary> {
  const { data } = await apiClient.get<OeeSummary>('/oee', { params: { range } })
  return data
}

export async function fetchOeeTrend(range: OeeRange): Promise<OeeTrend> {
  const { data } = await apiClient.get<OeeTrend>('/oee/trend', { params: { range } })
  return data
}

export async function fetchWorkOrderOee(workOrderId: string): Promise<WorkOrderOee> {
  const { data } = await apiClient.get<WorkOrderOee>(`/work-orders/${encodeURIComponent(workOrderId)}/oee`)
  return data
}
