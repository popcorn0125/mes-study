import type { DueStatus, DueStatusKind } from '@/domain/workOrders'
import type { WorkOrderStatus } from '@/domain/types'
import { formatSimTime } from '@/sim/clock'

/** 작업지시 상태 색: 계획 회색, 하달 파랑, 진행 초록, 보류 주황, 완료 흐린 회색 */
export const WORK_ORDER_STATUS_COLOR: Record<WorkOrderStatus, string> = {
  PLANNED: '#8b949e',
  RELEASED: '#2f81f7',
  IN_PROGRESS: '#3fb950',
  HELD: '#db6d28',
  COMPLETED: '#6e7681',
}

/** 납기 상태 글자 색 등급 */
export const DUE_TONE: Record<DueStatusKind, 'ok' | 'warn' | 'bad' | 'muted'> = {
  NONE: 'muted',
  UNKNOWN: 'muted',
  MET: 'ok',
  ON_TRACK: 'ok',
  AT_RISK: 'warn',
  OVERDUE: 'bad',
  LATE_DONE: 'bad',
}

function minutes(sec: number): string {
  return `${Math.round(Math.abs(sec) / 60)}분`
}

/** 납기 여유 표시: "여유 12분", "지연 위험 8분" 등 */
export function dueText(status: DueStatus): string {
  const { kind, slack } = status
  switch (kind) {
    case 'NONE':
      return '—'
    case 'UNKNOWN':
      return '예상 불가'
    case 'MET':
      return `준수 (${minutes(slack!)} 일찍)`
    case 'LATE_DONE':
      return `지연 완료 (${minutes(slack!)})`
    case 'ON_TRACK':
      return `여유 ${minutes(slack!)}`
    case 'AT_RISK':
      return `지연 위험 ${minutes(slack!)}`
    case 'OVERDUE':
      return `납기 지남 ${minutes(slack!)}`
  }
}

/** 시각을 "HH:MM"으로 */
export function clock(sec: number | null): string {
  return sec === null ? '—' : formatSimTime(sec).slice(0, -3)
}
