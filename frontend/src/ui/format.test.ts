import { describe, expect, it } from 'vitest'
import { createBaselineMaster } from '@/scenarios/baseline'
import { createNameLookup, formatDuration, percent } from './format'

describe('format', () => {
  it('formatDuration은 단위를 자동으로 고른다', () => {
    expect(formatDuration(45)).toBe('45초')
    expect(formatDuration(200)).toBe('3분 20초')
    expect(formatDuration(3900)).toBe('1시간 5분')
  })

  it('percent는 값이 없으면 대시를 표시한다', () => {
    expect(percent(0.256)).toBe('26%')
    expect(percent(null)).toBe('—')
  })

  it('실행 중 추가된 설비는 같은 작업장 설비 이름을 본떠 부르고, 모르는 id는 그대로 돌려준다', () => {
    const names = createNameLookup(createBaselineMaster())
    expect(names.equipment('ASSEMBLY-1')).toBe('조립 셀 #1')
    expect(names.equipment('ASSEMBLY-2')).toBe('조립 셀 #2')
    expect(names.equipment('NOPE-3')).toBe('NOPE-3')
    expect(names.workCenter('INSPECTION')).toBe('검사')
  })
})
