import { describe, expect, it } from 'vitest'
import type { EquipmentOee, OeeTrend } from '@/api/oee'
import { biggestLoss, explainLine, formatRatio, toTrendSlots } from './oee'

function equipment(loss: EquipmentOee['loss']): EquipmentOee {
  return {
    equipmentId: 'CNC_01',
    equipmentName: 'CNC #1',
    lineOrder: 1,
    standardTactSec: 45,
    plannedSec: 1000,
    runSec: 900,
    downSec: loss.downSec,
    idleSec: loss.idleSec,
    totalCount: 20,
    goodCount: 18,
    badCount: 2,
    availability: 0.9,
    performance: 1,
    quality: 0.9,
    oee: 0.81,
    loss,
  }
}

describe('OEE 화면 계산', () => {
  it('비율이 없으면(분모 0) "–"로 보인다', () => {
    expect(formatRatio(0.923)).toBe('92.3%')
    expect(formatRatio(0)).toBe('0.0%')
    expect(formatRatio(null)).toBe('–')
  })

  it('가장 큰 손실을 고르고, 손실이 없으면 없다', () => {
    expect(biggestLoss(equipment({ downSec: 40, idleSec: 240, speedSec: 60, defectSec: 90 }))).toEqual({ label: '대기', seconds: 240 })
    expect(biggestLoss(equipment({ downSec: 0, idleSec: 0, speedSec: 0, defectSec: 0 }))).toBeUndefined()
  })

  it('라인 OEE 근거 문구', () => {
    expect(explainLine({ oee: 0.62, plannedSec: 3600, goodCount: 45, bottleneckEquipmentId: 'ASSEMBLY_01', bottleneckTactSec: 50 }))
      .toBe('포장 양품 45개 × 병목 50초 ÷ 계획 1시간')
  })

  it('추이는 구간 처음부터 지금까지 칸을 채우고, 지시가 없던 칸은 비워 둔다', () => {
    const point = { oee: 0.5, plannedSec: 300, goodCount: 3, bottleneckEquipmentId: 'ASSEMBLY_01', bottleneckTactSec: 50 }
    const trend: OeeTrend = {
      from: '2026-10-28T02:12:40Z',
      to: '2026-10-28T03:12:40Z',
      bucketSec: 300,
      // 서버는 서울 시각으로 준다: 11:15+09:00 = 02:15Z
      points: [{ ...point, bucketStart: '2026-10-28T11:15:00+09:00' }],
    }

    const slots = toTrendSlots(trend)

    // 02:10 ~ 03:10 칸 13개(첫 칸은 구간 시작이 걸친 칸)
    expect(slots).toHaveLength(13)
    expect(slots[0]).toEqual({ start: Date.parse('2026-10-28T02:10:00Z'), point: undefined })
    expect(slots[1]).toEqual({ start: Date.parse('2026-10-28T02:15:00Z'), point: trend.points[0] })
    expect(slots.filter((s) => s.point)).toHaveLength(1)
  })
})
