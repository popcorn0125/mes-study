import { describe, expect, it } from 'vitest'
import { MAX_TICKS_PER_FRAME, advanceClock, formatSimTime } from './clock'

describe('advanceClock', () => {
  it('배속만큼 tick을 만들고 1초 미만 나머지는 이월한다', () => {
    // 60fps, 10배속 → 프레임당 약 0.167 tick
    let carry = 0
    let ticks = 0
    for (let i = 0; i < 60; i++) {
      const r = advanceClock(carry, 1 / 60, 10)
      carry = r.carry
      ticks += r.ticks
    }
    expect(ticks + carry).toBeCloseTo(10, 6)
    expect(ticks).toBeGreaterThanOrEqual(9)
  })

  it('한 프레임 tick 수는 상한을 넘지 않고, 넘친 시간은 버린다', () => {
    const r = advanceClock(0, 30, 60)
    expect(r.ticks).toBe(MAX_TICKS_PER_FRAME)
    expect(r.carry).toBe(0)
  })

  it('음수 경과 시간은 무시한다', () => {
    expect(advanceClock(0.5, -1, 10)).toEqual({ ticks: 0, carry: 0.5 })
  })
})

describe('formatSimTime', () => {
  it('시:분:초와 일 단위를 표시한다', () => {
    expect(formatSimTime(0)).toBe('00:00:00')
    expect(formatSimTime(3725)).toBe('01:02:05')
    expect(formatSimTime(86400 + 61)).toBe('1일 00:01:01')
  })
})
