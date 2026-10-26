import type { SensorStatus } from '@/producer/generate'

/** 설비 상태 색과 표시 이름(3D 라벨 · 대시보드 공용). 색만으로 구분하지 않도록 이름을 함께 쓴다. */
export const EQUIPMENT_STATUS_STYLE: Record<SensorStatus, { color: string; label: string }> = {
  RUN: { color: '#3fb950', label: '가동' },
  WARN: { color: '#d29922', label: '경고' },
  DOWN: { color: '#f85149', label: '고장' },
}

type SensorLevel = 'NORMAL' | 'WARNING' | 'CRITICAL'

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

/** 버퍼 점유율 색: 50% 미만 초록, 90% 미만 노랑, 그 이상 빨강 */
export function bufferFillColor(ratio: number): string {
  if (ratio < 0.5) return '#3fb950'
  if (ratio < 0.9) return '#d29922'
  return '#f85149'
}
