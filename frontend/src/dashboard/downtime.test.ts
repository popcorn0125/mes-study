import { describe, expect, it } from 'vitest'
import type { DowntimeBar } from '@/api/downtime'
import { groupReasons, toDowntimeParetoRows } from './downtime'

const bar = (kind: DowntimeBar['kind'], code: string | null, seconds: number, cumulativeRatio: number): DowntimeBar => ({
  kind,
  reasonCode: code,
  reasonName: code ?? (kind === 'PENDING' ? '사유 미입력' : '순간 정지'),
  category: code ? '설비 고장' : null,
  seconds,
  count: 2,
  cumulativeRatio,
})

describe('비가동 화면 계산', () => {
  it('파레토는 시간 기준 막대이고, 사유 미입력 · 순간 정지는 강조하지 않고 따로 표시한다', () => {
    const rows = toDowntimeParetoRows([
      bar('REASON', 'BREAKDOWN_MECH', 300, 0.5),
      bar('REASON', 'TOOL_JIG', 60, 0.6),
      bar('PENDING', null, 200, 0.93),
      bar('MICRO', null, 40, 1),
    ])

    expect(rows.map((r) => [r.key, r.vital, r.tone])).toEqual([
      ['BREAKDOWN_MECH', true, 'normal'],
      ['TOOL_JIG', true, 'normal'],
      ['PENDING', false, 'pending'],
      ['MICRO', false, 'muted'],
    ])
    expect(rows[0]).toMatchObject({ share: 1, value: '5분 · 2건 · 누적 50.0%', note: '설비 고장' })
    expect(rows[2].share).toBeCloseTo(2 / 3)
  })

  it('사유는 대분류마다 묶고 서버 순서를 지킨다', () => {
    const groups = groupReasons([
      { reasonCode: 'A', category: '설비 고장', reasonName: 'a' },
      { reasonCode: 'B', category: '설비 고장', reasonName: 'b' },
      { reasonCode: 'C', category: '자재', reasonName: 'c' },
    ])

    expect(groups.map((g) => [g.category, g.reasons.map((r) => r.reasonCode)])).toEqual([
      ['설비 고장', ['A', 'B']],
      ['자재', ['C']],
    ])
  })
})
