import { ref } from 'vue'
import type { EquipmentOee, LineOee, OeeLoss, OeeRange, OeeTrend, OeeTrendPoint } from '@/api/oee'
import { formatDuration } from './equipment'
import { formatPercent } from './production'

/** 구간 선택 버튼 순서와 이름 */
export const OEE_RANGES: readonly { value: OeeRange; label: string }[] = [
  { value: 'today', label: '오늘' },
  { value: '1h', label: '최근 1시간' },
  { value: '8h', label: '최근 8시간' },
]

/** 생산 현황 · 설비 관리가 같이 쓰는 구간 선택(화면을 옮겨도 유지된다) */
const selectedRange = ref<OeeRange>('today')
export function useOeeRange() {
  return selectedRange
}

/** 0~1 비율(null = 분모 0)을 "92.3%" 또는 "–"로 */
export function formatRatio(ratio: number | null | undefined): string {
  return formatPercent(ratio ?? undefined)
}

export const LOSS_LABEL: Record<keyof OeeLoss, string> = {
  downSec: '고장',
  idleSec: '대기',
  speedSec: '속도 저하',
  defectSec: '불량',
}

/** 가장 큰 손실(같으면 LOSS_LABEL 순서가 앞인 것). 손실이 없으면 undefined */
export function biggestLoss(equipment: EquipmentOee): { label: string; seconds: number } | undefined {
  let best: { label: string; seconds: number } | undefined
  for (const key of Object.keys(LOSS_LABEL) as (keyof OeeLoss)[]) {
    const seconds = equipment.loss[key]
    if (seconds > 0 && (!best || seconds > best.seconds)) best = { label: LOSS_LABEL[key], seconds }
  }
  return best
}

/** 라인 OEE 계산 근거 문구: "포장 양품 45개 × 병목 50초 ÷ 계획 1시간" */
export function explainLine(line: LineOee): string {
  return `포장 양품 ${line.goodCount}개 × 병목 ${line.bottleneckTactSec}초 ÷ 계획 ${formatDuration(line.plannedSec)}`
}

/** 추이 막대 한 칸. point가 없으면 작업지시가 없던 칸(0%와 구분해 비워 둔다) */
export interface TrendSlot {
  /** 칸 시작(ms) */
  start: number
  point: OeeTrendPoint | undefined
}

/**
 * 구간 처음부터 지금까지 빈 칸까지 채운 칸 목록.
 * 서버는 서울 기준 정각 · 5분으로 칸을 맞추는데, 서울은 UTC+9 정각이라 epoch를 칸 크기로 내림해도 같다.
 */
export function toTrendSlots(trend: OeeTrend): TrendSlot[] {
  const size = trend.bucketSec * 1000
  const byStart = new Map(trend.points.map((p) => [Date.parse(p.bucketStart), p]))
  const first = Math.floor(Date.parse(trend.from) / size) * size
  const last = Date.parse(trend.to)
  const slots: TrendSlot[] = []
  for (let start = first; start <= last; start += size) slots.push({ start, point: byStart.get(start) })
  return slots
}
