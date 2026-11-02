import { describe, expect, it } from 'vitest'
import { conveyorSegments, equipmentPosition, workCenterX } from './layout'

const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('layout', () => {
  it('작업장은 원점을 중심으로 좌우 대칭으로 놓인다', () => {
    expect(workCenterX(0, 5)).toBe(-workCenterX(4, 5))
    expect(workCenterX(2, 5)).toBe(0)
  })

  it('같은 작업장의 설비 여러 대는 서로 다른 위치에 놓인다', () => {
    const a = equipmentPosition(2, 5, 0, 2)
    const b = equipmentPosition(2, 5, 1, 2)
    expect(distance(a, b)).toBeGreaterThan(1)
  })
})

describe('conveyorSegments', () => {
  it('구간은 왼쪽에서 오른쪽으로 이어지고 서로 겹치지 않는다', () => {
    const segments = conveyorSegments(5)
    // 창고→첫 버퍼(1) + 작업장마다 버퍼→설비(5) + 설비→다음 버퍼(4) + 마지막 설비→출하장(1)
    expect(segments).toHaveLength(11)
    for (const [start, end] of segments) expect(end).toBeGreaterThan(start)
    for (let i = 1; i < segments.length; i++) expect(segments[i][0]).toBeGreaterThan(segments[i - 1][1])
  })

  it('설비 위치와 겹치지 않는다', () => {
    const segments = conveyorSegments(5)
    for (let wc = 0; wc < 5; wc++) {
      const [x] = equipmentPosition(wc, 5, 0, 1)
      for (const [start, end] of segments) expect(x < start || x > end).toBe(true)
    }
  })
})
