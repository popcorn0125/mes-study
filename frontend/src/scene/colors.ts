import type { EquipmentStatus, SensorLevel } from '@/domain/types'

/** 설비 상태 색과 표시 이름. 색만으로 구분하지 않도록 라벨에도 이름을 함께 쓴다. */
export const EQUIPMENT_STATUS_STYLE: Record<EquipmentStatus, { color: string; label: string }> = {
  RUN: { color: '#3fb950', label: '가동' },
  IDLE: { color: '#6e7681', label: '유휴' },
  STARVED: { color: '#d29922', label: '대기(공급 없음)' },
  BLOCKED: { color: '#db6d28', label: '막힘(후공정 가득)' },
  STARVED_MATERIAL: { color: '#db61a2', label: '자재 부족' },
  DOWN: { color: '#f85149', label: '고장' },
  PM: { color: '#2f81f7', label: '예방정비' },
}

export const SENSOR_LEVEL_STYLE: Record<SensorLevel, { color: string; label: string }> = {
  NORMAL: { color: '#3fb950', label: '정상' },
  WARNING: { color: '#d29922', label: '경고' },
  CRITICAL: { color: '#f85149', label: '위험' },
}

/** 자재 재고 색: 결품 빨강, 발주점 이하 노랑, 그 외 초록 */
export function stockColor(onHand: number, reorderPoint: number, qtyPer = 1): string {
  if (onHand < qtyPer) return '#f85149'
  if (onHand <= reorderPoint) return '#d29922'
  return '#3fb950'
}

/** 히트맵 색: 0(초록) → 0.5(노랑) → 1(빨강) */
export function heatColor(ratio: number): string {
  const t = Math.min(1, Math.max(0, ratio))
  const hue = 120 * (1 - t)
  return `hsl(${hue.toFixed(0)}, 60%, 32%)`
}

export const ITEM_COLOR: Record<string, string> = {
  'MOTOR-A': '#58a6ff',
  'MOTOR-B': '#bc8cff',
}
export const DEFAULT_ITEM_COLOR = '#c9d1d9'
export const SCRAP_COLOR = '#f85149'
/** 선택된 Unit 강조색 */
export const SELECTED_COLOR = '#ffffff'

/** 버퍼 점유율 색: 50% 미만 초록, 90% 미만 노랑, 그 이상 빨강 */
export function bufferFillColor(ratio: number): string {
  if (ratio < 0.5) return '#3fb950'
  if (ratio < 0.9) return '#d29922'
  return '#f85149'
}
