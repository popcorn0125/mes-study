import type { LatestLog, ProductionPerformance } from '@/api/dashboard'
import { PRODUCER_EQUIPMENT } from '@/producer/equipment'

/** 마지막 로그가 이보다 오래되면 통신이 끊긴 것으로 본다(Producer는 1초마다 보낸다) */
export const STALE_AFTER_MS = 5000

/** 실적 표 한 줄: 설비 이름 · 라인 순서와 불량률을 붙인 실적 */
export interface ProductionRow extends ProductionPerformance {
  /** 화면에 보일 설비 이름(정의에 없는 설비는 ID 그대로) */
  name: string
  /** 불량 / 총수량(0~1). 총수량이 0이면 0 */
  defectRate: number
}

/** 화면 상단 요약 숫자 */
export interface ProductionSummary {
  /** 라인 마지막 공정(포장기)의 총수량 = 라인 완성품 */
  lineOutput: number
  /** 포장기 기준 양품률(0~1). 아직 생산이 없으면 undefined */
  lineYield: number | undefined
  /** 모든 설비의 불량 합계 */
  totalDefects: number
  /** 지금 RUN 상태로 로그를 보내고 있는 설비 수 */
  runningCount: number
  /** 전체 설비 수 */
  equipmentCount: number
  /** 가장 최근 센서 로그 시각(ms). 로그가 없으면 undefined */
  lastReceivedAt: number | undefined
}

/** 라인의 마지막 공정: 이 설비의 완성 수량이 라인 생산량이다 */
const LINE_OUTPUT_ID = PRODUCER_EQUIPMENT[PRODUCER_EQUIPMENT.length - 1].id

/** 정의된 라인 순서(정의에 없는 설비는 맨 뒤) */
function lineOrder(equipmentId: string): number {
  const i = PRODUCER_EQUIPMENT.findIndex((e) => e.id === equipmentId)
  return i === -1 ? PRODUCER_EQUIPMENT.length : i
}

/** 설비 ID를 화면 이름으로 바꾼다 */
export function equipmentName(equipmentId: string): string {
  return PRODUCER_EQUIPMENT.find((e) => e.id === equipmentId)?.name ?? equipmentId
}

/** 한 작업지시의 실적을 라인 순서로 정렬하고 이름 · 불량률을 붙인다 */
export function toProductionRows(rows: readonly ProductionPerformance[], workOrderId: string | undefined): ProductionRow[] {
  return rows
    .filter((row) => row.workOrderId === workOrderId)
    .map((row) => ({
      ...row,
      name: equipmentName(row.equipmentId),
      defectRate: row.totalCount > 0 ? row.badCount / row.totalCount : 0,
    }))
    .sort((a, b) => lineOrder(a.equipmentId) - lineOrder(b.equipmentId))
}

/** 로그가 끊기지 않았는지(마지막 로그가 STALE_AFTER_MS 안인지) */
export function isFresh(log: LatestLog, now: number): boolean {
  return now - Date.parse(log.recordedAt) <= STALE_AFTER_MS
}

/** 실적 표와 설비별 최신 로그로 상단 요약 숫자를 만든다 */
export function summarize(rows: readonly ProductionRow[], latest: readonly LatestLog[], now: number): ProductionSummary {
  const output = rows.find((row) => row.equipmentId === LINE_OUTPUT_ID)
  const receivedTimes = latest.map((log) => Date.parse(log.recordedAt))
  return {
    lineOutput: output?.totalCount ?? 0,
    lineYield: output && output.totalCount > 0 ? output.goodCount / output.totalCount : undefined,
    totalDefects: rows.reduce((sum, row) => sum + row.badCount, 0),
    runningCount: latest.filter((log) => log.status === 'RUN' && isFresh(log, now)).length,
    equipmentCount: PRODUCER_EQUIPMENT.length,
    lastReceivedAt: receivedTimes.length > 0 ? Math.max(...receivedTimes) : undefined,
  }
}

/** "3초 전" · "2분 전" 같은 경과 시간 문구 */
export function formatAgo(at: number | undefined, now: number): string {
  if (at === undefined) return '수신 없음'
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return `${seconds}초 전`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`
  return `${Math.floor(seconds / 86400)}일 전`
}

/** 0~1 비율을 "98.2%"로 */
export function formatPercent(ratio: number | undefined): string {
  return ratio === undefined ? '–' : `${(ratio * 100).toFixed(1)}%`
}
