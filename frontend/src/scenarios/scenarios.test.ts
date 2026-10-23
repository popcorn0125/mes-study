import { describe, expect, it } from 'vitest'
import { freeScenario } from './index'
import { createScenarioEngine } from './runner'

describe('자유 체험 공장', () => {
  it('생산 계획을 세우고, 계획 수량만큼 작업지시를 나눠 하달한다', () => {
    const { state } = createScenarioEngine(freeScenario)
    expect(state.plan?.lines).toEqual([
      { itemId: 'MOTOR-A', targetQty: 360 },
      { itemId: 'MOTOR-B', targetQty: 120 },
    ])
    expect(state.workOrders).toHaveLength(12)
    expect(state.workOrders.every((wo) => wo.status === 'RELEASED')).toBe(true)
    const totalOf = (itemId: string) =>
      state.workOrders.filter((wo) => wo.itemId === itemId).reduce((sum, wo) => sum + wo.qty, 0)
    expect(totalOf('MOTOR-A')).toBe(360)
    expect(totalOf('MOTOR-B')).toBe(120)
  })
})
