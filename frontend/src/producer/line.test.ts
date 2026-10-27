import { describe, expect, it } from 'vitest'
import { PRODUCER_EQUIPMENT } from './equipment'
import { initialState, type EquipmentState, type Random } from './generate'
import { stepLine, waitingBetween, type LineWorkOrder } from './line'
import { createRng } from './rng'

const LINE = PRODUCER_EQUIPMENT
const WO: LineWorkOrder = { workOrderId: 'WO-20261028-001', plannedQty: 30 }
const fresh = () => LINE.map((eq) => initialState(eq))
const packed = (states: readonly EquipmentState[]) => states[states.length - 1].production.goodCount

/** n초 진행. 매초 공정 연결 규칙(뒤 공정 투입 ≤ 앞 공정 양품)을 확인한다 */
function run(states: EquipmentState[], seconds: number, workOrder: LineWorkOrder | null, random: Random): EquipmentState[] {
  for (let t = 0; t < seconds; t++) {
    states = stepLine(LINE, states, workOrder, random)
    for (let i = 1; i < states.length; i++) {
      const taken = states[i].production.totalCount + (states[i].inProcess ? 1 : 0)
      expect(taken).toBeLessThanOrEqual(states[i - 1].production.goodCount)
    }
  }
  return states
}

describe('라인 생산(공정 연결)', () => {
  it('작업지시가 없으면 모든 설비가 대기이고 수량이 늘지 않는다', () => {
    const states = run(fresh(), 200, null, createRng(1))

    expect(states.map((s) => s.status)).toEqual(['IDLE', 'IDLE', 'IDLE', 'IDLE', 'IDLE'])
    expect(states.every((s) => s.production.totalCount === 0)).toBe(true)
  })

  it('처음에는 첫 공정만 가동하고, 뒤 공정은 앞 공정 양품이 넘어올 때까지 대기한다', () => {
    const states = run(fresh(), 10, WO, () => 0.5)

    expect(states.map((s) => s.status)).toEqual(['RUN', 'IDLE', 'IDLE', 'IDLE', 'IDLE'])
  })

  it('불량이 나도 포장 양품이 지시 수량을 정확히 채우고, 그 뒤로는 모두 대기한다', () => {
    let states = run(fresh(), 4000, WO, createRng(7))

    expect(packed(states)).toBe(WO.plannedQty)
    const bad = states.reduce((sum, s) => sum + s.production.badCount, 0)
    expect(bad).toBeGreaterThan(0) // 이 시드에서는 불량이 나서 첫 공정이 그만큼 더 투입했다
    expect(states[0].production.totalCount).toBe(WO.plannedQty + bad)

    states = run(states, 500, WO, createRng(8))
    expect(packed(states)).toBe(WO.plannedQty)
    expect(states.every((s) => s.status === 'IDLE' || s.status === 'WARN' || s.status === 'DOWN')).toBe(true)
  })

  it('가장 느린 조립(50초)이 병목이라 뒤 공정은 자주 대기한다', () => {
    const big: LineWorkOrder = { workOrderId: 'WO-BIG', plannedQty: 1000 }
    let states = run(fresh(), 600, big, () => 0.5) // 라인이 찰 때까지
    const idle = new Array(LINE.length).fill(0)
    for (let t = 0; t < 3000; t++) {
      states = stepLine(LINE, states, big, () => 0.5)
      states.forEach((s, i) => (idle[i] += s.status === 'IDLE' ? 1 : 0))
    }
    const assembly = LINE.findIndex((eq) => eq.id === 'ASSEMBLY_01')

    expect(idle[assembly]).toBe(0)
    expect(idle[LINE.length - 1]).toBeGreaterThan(1000) // 포장(25초)은 절반쯤 기다린다
    expect(waitingBetween(states)[assembly - 1]).toBeGreaterThan(0) // 조립 앞에 재공이 쌓인다
  })

  it('저장된 수량에서 다시 시작해도 재공이 이어지고 지시 수량을 정확히 채운다', () => {
    let states = run(fresh(), 900, WO, createRng(3))
    const waiting = waitingBetween(states)
    const inProcess = states.map((s) => s.inProcess)
    // 시뮬레이터를 다시 연 것처럼 저장된 수량만으로 다시 만든다.
    // 가공 중이던 1개는 가공을 처음부터 다시 하도록 앞 재공으로 돌아간다(없어지지 않는다).
    states = LINE.map((eq, i) => initialState(eq, states[i].production))

    expect(waitingBetween(states)).toEqual(waiting.map((w, i) => w + (inProcess[i + 1] ? 1 : 0)))
    states = run(states, 4000, WO, createRng(4))
    expect(packed(states)).toBe(WO.plannedQty)
  })
})
