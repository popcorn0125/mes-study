import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { REPAIR_FACTOR_MAX, REPAIR_FACTOR_MIN, sampleRepairTime } from './repair'

describe('수리 시간 편차', () => {
  it('난수 끝값과 최빈값에서 범위의 양 끝과 표준 시간을 돌려준다', () => {
    expect(sampleRepairTime(1200, 0)).toBe(1200 * REPAIR_FACTOR_MIN)
    expect(sampleRepairTime(1200, 1 / 3)).toBe(1200)
    expect(sampleRepairTime(1200, 0.999999)).toBeCloseTo(1200 * REPAIR_FACTOR_MAX, -1)
  })

  it('표준의 0.75 ~ 1.5배 안에 들고, 평균은 표준보다 조금 길다(오른쪽 꼬리)', () => {
    const rng = createRng(7)
    const samples = Array.from({ length: 5000 }, () => sampleRepairTime(1200, rng()))
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(900)
    expect(Math.max(...samples)).toBeLessThanOrEqual(1800)
    const mean = samples.reduce((s, x) => s + x, 0) / samples.length
    // 삼각분포 평균 = (0.75 + 1 + 1.5) / 3 ≈ 1.083
    expect(mean / 1200).toBeGreaterThan(1.06)
    expect(mean / 1200).toBeLessThan(1.11)
  })
})
