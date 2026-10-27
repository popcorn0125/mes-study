import { describe, expect, it } from 'vitest'
import type { LatestLog, StatusSeconds } from '@/api/dashboard'
import { formatClock, formatDuration, isOutOfRange, toEquipmentCards, toUtilization } from './equipment'

const NOW = Date.parse('2026-10-26T12:00:00Z')

function log(equipmentId: string, secondsAgo: number): LatestLog {
  return { equipmentId, status: 'RUN', recordedAt: new Date(NOW - secondsAgo * 1000).toISOString(), temperature: 40, vibration: 1.2 }
}

describe('설비 관리 계산', () => {
  it('설비마다 카드를 라인 순서로 만들고, 5초 넘게 수신이 없거나 로그가 없으면 통신 끊김이다', () => {
    const cards = toEquipmentCards([log('PACKER_01', 30), log('CNC_01', 1)], NOW)

    expect(cards.map((c) => c.equipment.id)).toEqual(['CNC_01', 'WINDER_01', 'ASSEMBLY_01', 'INSPECTION_01', 'PACKER_01'])
    expect(cards[0]).toMatchObject({ disconnected: false })
    expect(cards[1]).toMatchObject({ log: undefined, disconnected: true })
    expect(cards[4].disconnected).toBe(true)
  })

  it('상태별 초로 가동률을 계산하고(대기도 전체 시간에 넣는다), 정의에 없는 상태는 뺀다', () => {
    const summary = [
      { equipmentId: 'CNC_01', status: 'RUN', seconds: 90 },
      { equipmentId: 'CNC_01', status: 'DOWN', seconds: 10 },
      { equipmentId: 'CNC_01', status: 'IDLE', seconds: 50 },
      { equipmentId: 'CNC_01', status: 'SETUP', seconds: 7 },
    ] as StatusSeconds[]

    const [cnc, winder] = toUtilization(summary)

    expect(cnc.seconds).toEqual({ RUN: 90, IDLE: 50, WARN: 0, DOWN: 10 })
    expect(cnc.totalSeconds).toBe(150)
    expect(cnc.runRatio).toBeCloseTo(0.6)
    expect(winder.runRatio).toBeUndefined() // 로그 없음
  })

  it('정상 범위를 벗어났는지 본다(값이 없으면 벗어나지 않은 것으로 본다)', () => {
    expect(isOutOfRange(61, [38, 60])).toBe(true)
    expect(isOutOfRange(60, [38, 60])).toBe(false)
    expect(isOutOfRange(null, [38, 60])).toBe(false)
  })

  it('지속 시간 문구', () => {
    expect(formatDuration(42)).toBe('42초')
    expect(formatDuration(185)).toBe('3분 5초')
    expect(formatDuration(120)).toBe('2분')
    expect(formatDuration(3720)).toBe('1시간 2분')
  })

  it('시각은 HH:MM:SS(브라우저 시간대)', () => {
    const at = new Date(2026, 9, 26, 9, 5, 7) // 로컬 09:05:07
    expect(formatClock(at.toISOString())).toBe('09:05:07')
  })
})
