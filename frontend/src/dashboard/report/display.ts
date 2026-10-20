import type { CsvCell } from '@/domain/csv'
import type { HourlyReport } from '@/domain/report'
import type { Shift } from '@/domain/shifts'
import type { SimEvent } from '@/domain/types'
import { formatSimTime } from '@/sim/clock'

/** 시각을 "01:23"(시:분)으로. 하루가 넘으면 "1일 01:23" */
export function hhmm(sec: number): string {
  return formatSimTime(sec).slice(0, -3)
}

/** "1교대 (00:00 ~ 08:00)" */
export function shiftTitle(shift: Shift): string {
  return `${shift.label} (${hhmm(shift.start)} ~ ${hhmm(shift.end)})`
}

/** 수량: 정수면 그대로, 아니면 소수 한 자리(진행 중 시간대의 계획은 소수가 된다) */
export function qty(value: number | null): string {
  if (value === null) return '—'
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** 차이: 양수는 +를 붙인다 */
export function signed(value: number | null): string {
  if (value === null) return '—'
  const text = qty(value)
  return value > 0.05 ? `+${text}` : text
}

/** 정지 시간(초) → 분 */
export function minutes(sec: number | null): string {
  return sec === null ? '—' : String(Math.round(sec / 60))
}

export function noteText(event: SimEvent): string {
  return `${hhmm(event.time)} ${event.message}`
}

/** 시간대별 실적표 → CSV 칸 */
export function hourlyCsvRows(report: HourlyReport, bottleneckName: string): { header: string[]; rows: CsvCell[][] } {
  const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10)
  const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10)
  return {
    header: [
      '시간',
      '계획',
      '실적',
      '차이',
      '누적 계획',
      '누적 실적',
      '누적 차이',
      '폐기',
      '재작업',
      '설비 정지(분)',
      `${bottleneckName} 가동률(%)`,
      '비고',
    ],
    rows: [
      ...report.rows.map((r) => [
        `${hhmm(r.start)}~${hhmm(r.end)}`,
        round1(r.plan),
        r.good,
        round1(r.gap),
        round1(r.cumulativePlan),
        r.cumulativeGood,
        round1(r.cumulativeGap),
        r.scrap,
        r.reworks,
        r.stop === null ? null : Math.round(r.stop / 60),
        pct(r.bottleneckUtilization),
        r.notes.map(noteText).join(' / '),
      ]),
      [
        '합계',
        round1(report.total.plan),
        report.total.good,
        round1(report.total.gap),
        null,
        null,
        null,
        report.total.scrap,
        report.total.reworks,
        report.total.stop === null ? null : Math.round(report.total.stop / 60),
        pct(report.total.bottleneckUtilization),
        null,
      ],
    ],
  }
}
