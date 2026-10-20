import type { StockStatus } from '@/domain/materials'
import { formatSimTime } from '@/sim/clock'

/** 재고 상태 색: 결품 빨강, 안전재고 이하 주황, 발주점 이하 노랑, 정상 초록 */
export const STOCK_STATUS_COLOR: Record<StockStatus, string> = {
  SHORTAGE: '#f85149',
  BELOW_SAFETY: '#db6d28',
  BELOW_ROP: '#d29922',
  OK: '#3fb950',
}

/** 시각을 "01:23"(시:분)으로 */
export function clock(sec: number): string {
  return formatSimTime(sec).slice(0, -3)
}

/** 시간당 수량. 10 미만은 소수 한 자리까지 */
export function perHour(rate: number | null, unit: string): string {
  if (rate === null) return '—'
  return `${rate > 0 && rate < 10 ? rate.toFixed(1) : Math.round(rate)}${unit}/h`
}
