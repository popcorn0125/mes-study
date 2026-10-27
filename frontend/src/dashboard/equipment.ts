import type { LatestLog, StatusSeconds } from '@/api/dashboard'
import { PRODUCER_EQUIPMENT, type ProducerEquipment } from '@/producer/equipment'
import type { SensorStatus } from '@/producer/generate'
import { isFresh } from './production'

/** 상태 비율 막대 · 범례에 쓰는 순서 */
export const STATUS_ORDER: readonly SensorStatus[] = ['RUN', 'IDLE', 'WARN', 'DOWN']

/** 설비 상태 카드 하나 */
export interface EquipmentCard {
  equipment: ProducerEquipment
  /** 가장 최근 로그(한 번도 받지 못했으면 undefined) */
  log: LatestLog | undefined
  /** 마지막 로그가 STALE_AFTER_MS보다 오래돼 통신이 끊긴 것으로 보이는지 */
  disconnected: boolean
}

/** 설비 한 대의 최근 상태 비율 */
export interface Utilization {
  equipment: ProducerEquipment
  /** 상태별로 머문 초 */
  seconds: Record<SensorStatus, number>
  /** 로그가 있는 전체 초 */
  totalSeconds: number
  /** 가동률 = RUN 초 / 전체 초(0~1). 로그가 없으면 undefined */
  runRatio: number | undefined
}

/** 라인 순서대로 설비마다 최신 로그와 통신 상태를 붙인다(로그가 없는 설비도 카드는 만든다) */
export function toEquipmentCards(latest: readonly LatestLog[], now: number): EquipmentCard[] {
  return PRODUCER_EQUIPMENT.map((equipment) => {
    const log = latest.find((l) => l.equipmentId === equipment.id)
    return { equipment, log, disconnected: !log || !isFresh(log, now) }
  })
}

/** 상태별 초 집계를 설비마다 묶어 가동률을 계산한다(라인 순서) */
export function toUtilization(summary: readonly StatusSeconds[]): Utilization[] {
  return PRODUCER_EQUIPMENT.map((equipment) => {
    const seconds: Record<SensorStatus, number> = { RUN: 0, IDLE: 0, WARN: 0, DOWN: 0 }
    for (const row of summary) {
      // 정의에 없는 상태는 비율에서 뺀다
      if (row.equipmentId === equipment.id && row.status in seconds) seconds[row.status] += row.seconds
    }
    const totalSeconds = seconds.RUN + seconds.IDLE + seconds.WARN + seconds.DOWN
    return { equipment, seconds, totalSeconds, runRatio: totalSeconds > 0 ? seconds.RUN / totalSeconds : undefined }
  })
}

/** 측정값이 설비의 정상 범위를 벗어났는지 */
export function isOutOfRange(value: number | null, [min, max]: readonly [number, number]): boolean {
  return value !== null && (value < min || value > max)
}

/** 초를 "1시간 2분" · "3분 5초" · "42초"로 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`
  if (m > 0) return sec > 0 ? `${m}분 ${sec}초` : `${m}분`
  return `${sec}초`
}

/** ISO 시각을 브라우저 시간대의 "14:05:09"로 */
export function formatClock(iso: string): string {
  const d = new Date(iso)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}
