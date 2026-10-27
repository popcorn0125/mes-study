import { describe, expect, it } from 'vitest'
import type { LatestLog, ProductionPerformance } from '@/api/dashboard'
import { formatAgo, formatPercent, summarize, toProductionRows } from './production'

const NOW = Date.parse('2026-10-26T12:00:00Z')

function perf(equipmentId: string, total: number, bad: number, workOrderId = 'WO-1', updated = '2026-10-26T11:59:00Z'): ProductionPerformance {
  return { workOrderId, equipmentId, totalCount: total, goodCount: total - bad, badCount: bad, lastUpdatedAt: updated }
}

function log(equipmentId: string, status: LatestLog['status'], secondsAgo: number): LatestLog {
  return { equipmentId, status, recordedAt: new Date(NOW - secondsAgo * 1000).toISOString(), temperature: 40, vibration: 1.2 }
}

describe('생산 현황 계산', () => {
  it('작업지시 하나만 남겨 라인 순서로 정렬하고 이름 · 불량률을 붙인다', () => {
    const rows = toProductionRows(
      [perf('PACKER_01', 10, 0), perf('CNC_01', 20, 1), perf('CNC_01', 99, 9, 'WO-OTHER'), perf('NEW_01', 0, 0)],
      'WO-1',
    )
    expect(rows.map((r) => r.name)).toEqual(['CNC #1', '포장기 #1', 'NEW_01'])
    expect(rows[0].defectRate).toBeCloseTo(0.05)
    expect(rows[2].defectRate).toBe(0) // 총수량 0이면 0
  })

  it('요약: 포장기 수량이 라인 생산량, 불량은 전 설비 합계, 가동은 끊기지 않은 RUN만 센다', () => {
    const rows = toProductionRows([perf('CNC_01', 20, 1), perf('PACKER_01', 10, 2)], 'WO-1')
    const latest = [log('CNC_01', 'RUN', 1), log('WINDER_01', 'WARN', 1), log('PACKER_01', 'RUN', 30)]

    const s = summarize(rows, latest, NOW)

    expect(s.lineOutput).toBe(10)
    expect(s.lineYield).toBeCloseTo(0.8)
    expect(s.totalDefects).toBe(3)
    expect(s.runningCount).toBe(1) // 포장기는 30초째 수신 없음
    expect(s.equipmentCount).toBe(5)
    expect(s.lastReceivedAt).toBe(NOW - 1000)
  })

  it('실적 · 로그가 없으면 0과 빈 값으로 요약한다', () => {
    const s = summarize([], [], NOW)
    expect(s).toMatchObject({ lineOutput: 0, lineYield: undefined, totalDefects: 0, runningCount: 0, lastReceivedAt: undefined })
  })

  it('경과 시간 · 비율 문구', () => {
    expect(formatAgo(undefined, NOW)).toBe('수신 없음')
    expect(formatAgo(NOW - 3_000, NOW)).toBe('3초 전')
    expect(formatAgo(NOW - 125_000, NOW)).toBe('2분 전')
    expect(formatAgo(NOW - 2 * 86_400_000, NOW)).toBe('2일 전')
    expect(formatPercent(0.98234)).toBe('98.2%')
    expect(formatPercent(undefined)).toBe('–')
  })
})
