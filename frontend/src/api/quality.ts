import { apiClient } from './client'
import type { OeeRange } from './oee'
import type { WorkOrderStatus } from './workOrders'

/** 구간 요약. 비율(0~1)은 분모가 0이면 null */
export interface QualitySummary {
  /** 직행률 = 생산이 있는 공정들의 합격률 곱 */
  fpy: number | null
  /** 양품률 = 완성품 ÷ (완성품 + 불량) */
  yield: number | null
  /** 전 공정 불량 수 */
  badCount: number
  /** 완성품 = 포장기(마지막 공정) 양품 */
  finishedCount: number
}

/** 공정(설비) 하나의 합격률 */
export interface EquipmentQuality {
  equipmentId: string
  equipmentName: string
  lineOrder: number
  totalCount: number
  goodCount: number
  badCount: number
  passRate: number | null
}

/** 파레토 한 줄(많은 순, 미분류는 맨 뒤 · 코드 null) */
export interface DefectCount {
  defectCode: string | null
  defectName: string
  equipmentId: string | null
  equipmentName: string | null
  count: number
  /** 이 줄까지 더한 불량 ÷ 전체 불량 */
  cumulativeRatio: number | null
}

/** 구간 안에 생산이 있던 작업지시의 불량 */
export interface WorkOrderQuality {
  workOrderId: string
  itemCode: string
  status: WorkOrderStatus
  finishedCount: number
  badCount: number
  /** 유형 있는 불량이 없으면 null */
  topDefectName: string | null
}

/** GET /quality */
export interface QualityReport {
  from: string
  to: string
  summary: QualitySummary
  equipment: EquipmentQuality[]
  defects: DefectCount[]
  workOrders: WorkOrderQuality[]
}

/** 시각 칸 하나의 불량률(전 공정 불량 ÷ 전 공정 생산) */
export interface DefectRatePoint {
  bucketStart: string
  totalCount: number
  badCount: number
  defectRate: number | null
}

/** GET /quality/trend. 생산이 없던 칸은 points에 없다 */
export interface DefectRateTrend {
  from: string
  to: string
  bucketSec: number
  points: DefectRatePoint[]
}

export async function fetchQuality(range: OeeRange): Promise<QualityReport> {
  const { data } = await apiClient.get<QualityReport>('/quality', { params: { range } })
  return data
}

export async function fetchQualityTrend(range: OeeRange): Promise<DefectRateTrend> {
  const { data } = await apiClient.get<DefectRateTrend>('/quality/trend', { params: { range } })
  return data
}
