import { describe, expect, it } from 'vitest'
import { splitIntoLots } from './production'

describe('splitIntoLots', () => {
  it('계획을 로트로 나누고, 품목을 목표 비율대로 번갈아 배치한다', () => {
    const lots = splitIntoLots(
      [
        { itemId: 'A', targetQty: 360 },
        { itemId: 'B', targetQty: 120 },
      ],
      40,
    )
    expect(lots).toHaveLength(12)
    expect(lots.every((lot) => lot.qty === 40)).toBe(true)
    expect(lots.map((lot) => lot.itemId).join('')).toBe('ABAAABAAABAA')
  })

  it('나누어 떨어지지 않으면 마지막 로트가 남은 수량만 갖는다', () => {
    expect(splitIntoLots([{ itemId: 'A', targetQty: 90 }], 40)).toEqual([
      { itemId: 'A', qty: 40 },
      { itemId: 'A', qty: 40 },
      { itemId: 'A', qty: 10 },
    ])
  })

  it('로트 크기가 0 이하면 거부한다', () => {
    expect(() => splitIntoLots([{ itemId: 'A', targetQty: 10 }], 0)).toThrow()
  })
})
