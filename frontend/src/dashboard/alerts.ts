import type { LatestLog } from '@/api/dashboard'
import { EQUIPMENT_STATUS_STYLE } from '@/scene/colors'
import { toEquipmentCards } from './equipment'

/** 알림 종류: 경고 · 고장 · 통신 끊김(마지막 수신 5초 초과) · 수신 없음(로그가 한 건도 없음) */
export type AlertKind = 'WARN' | 'DOWN' | 'DISCONNECTED' | 'NO_DATA'

/** 헤더 알림 목록 한 줄 */
export interface EquipmentAlert {
  equipmentId: string
  name: string
  kind: AlertKind
  /** 표시 이름(경고 · 고장 · 통신 끊김 · 수신 없음) */
  label: string
  /** 점 색 */
  color: string
  /** 마지막 로그 시각(ms). 수신 없음이면 undefined */
  at: number | undefined
}

/** 통신 끊김 · 수신 없음 색(상태 색과 겹치지 않는 회색) */
const NO_SIGNAL_COLOR = '#8b949e'

/** 알림 순서: 심한 것부터 */
const SEVERITY: Record<AlertKind, number> = { DOWN: 0, DISCONNECTED: 1, NO_DATA: 2, WARN: 3 }

/**
 * 설비별 최신 로그로 손봐야 할 설비 목록을 만든다(설비 관리 상태 카드와 같은 기준).
 * 고장 → 통신 끊김 → 수신 없음 → 경고 순, 같은 종류는 라인 순서.
 */
export function toAlerts(latest: readonly LatestLog[], now: number): EquipmentAlert[] {
  const alerts: EquipmentAlert[] = []
  for (const { equipment, log, disconnected } of toEquipmentCards(latest, now)) {
    const base = { equipmentId: equipment.id, name: equipment.name, at: log ? Date.parse(log.recordedAt) : undefined }
    if (!log) alerts.push({ ...base, kind: 'NO_DATA', label: '수신 없음', color: NO_SIGNAL_COLOR })
    else if (disconnected) alerts.push({ ...base, kind: 'DISCONNECTED', label: '통신 끊김', color: NO_SIGNAL_COLOR })
    else if (log.status === 'WARN' || log.status === 'DOWN') {
      alerts.push({ ...base, kind: log.status, ...EQUIPMENT_STATUS_STYLE[log.status] })
    }
  }
  // sort는 같은 값끼리 원래(라인) 순서를 지킨다
  return alerts.sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind])
}
