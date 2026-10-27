import { describe, expect, it } from 'vitest'
import type { DefectCount } from '@/api/quality'
import { toParetoBars } from './quality'

const defect = (code: string | null, count: number, cumulativeRatio: number): DefectCount => ({
  defectCode: code,
  defectName: code ?? '미분류',
  equipmentId: code ? 'ASSEMBLY_01' : null,
  equipmentName: code ? '조립 셀 #1' : null,
  count,
  cumulativeRatio,
})

describe('품질 화면 계산', () => {
  it('파레토 막대 길이는 가장 많은 유형 기준이고, 누적 80%를 채우는 유형까지 강조한다', () => {
    const bars = toParetoBars([
      defect('A', 6, 0.6),
      defect('B', 3, 0.9), // 앞까지 60% → 80%를 채우는 데 든다
      defect('C', 1, 1.0), // 앞까지 90% → 들지 않는다
    ])

    expect(bars.map((b) => b.share)).toEqual([1, 0.5, 1 / 6])
    expect(bars.map((b) => b.vital)).toEqual([true, true, false])
  })

  it('미분류는 개수가 많아도 강조하지 않는다', () => {
    const bars = toParetoBars([defect('A', 1, 0.2), defect(null, 4, 1.0)])

    expect(bars.map((b) => [b.vital, b.unclassified])).toEqual([[true, false], [false, true]])
    expect(bars[1].share).toBe(1)
  })

  it('불량이 없으면 빈 목록이다', () => {
    expect(toParetoBars([])).toEqual([])
  })
})
