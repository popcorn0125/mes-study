import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { PRODUCER_EQUIPMENT, type ProducerEquipment } from './equipment'
import { driftIn, initialState, step, toLog, type EquipmentState, type Random } from './generate'

const CNC = PRODUCER_EQUIPMENT[0]
/** 가운데 값(0.5)이면 측정값이 움직이지 않는다 */
const steady: Random = () => 0.5

/** 앞의 값들을 차례로 돌려주고, 다 쓰면 0.5를 돌려주는 난수 */
function queue(...values: number[]): Random {
  return () => values.shift() ?? 0.5
}

/** 투입할 것이 계속 있는 상태(supply 무한)로 n초 진행 */
function run(eq: ProducerEquipment, state: EquipmentState, seconds: number, random: Random = steady): EquipmentState {
  for (let i = 0; i < seconds; i++) state = step(eq, state, random, Infinity)
  return state
}

describe('더미 센서 데이터', () => {
  it('대기 · 수량 0 · 정상 범위 가운데 값에서 시작하고, 저장된 수량을 주면 그 값부터 시작한다', () => {
    expect(initialState(CNC)).toEqual({
      equipmentId: 'CNC_01',
      status: 'IDLE',
      statusRemaining: 0,
      inProcess: false,
      tactElapsed: 0,
      metrics: { temperature: 49, vibration: 2.5 },
      production: { totalCount: 0, goodCount: 0, badCount: 0 },
    })
    expect(initialState(CNC, { totalCount: 7, goodCount: 6, badCount: 1 }).production).toEqual({ totalCount: 7, goodCount: 6, badCount: 1 })
  })

  it('측정값은 1초에 범위 폭의 5% 안에서 움직이고, 범위를 벗어나지 않는다', () => {
    expect(driftIn(49, [38, 60], () => 1)).toBe(50.1)
    expect(driftIn(49, [38, 60], () => 0)).toBe(47.9)
    expect(driftIn(59.5, [38, 60], () => 1)).toBe(60)
    expect(driftIn(38.2, [38, 60], () => 0)).toBe(38)
    const random = createRng(1)
    let state = initialState(CNC)
    for (let i = 0; i < 500; i++) {
      const next = step(CNC, state, random, Infinity)
      expect(Math.abs(next.metrics.temperature - state.metrics.temperature)).toBeLessThanOrEqual(1.1 + 0.05)
      expect(next.metrics.temperature).toBeGreaterThanOrEqual(38)
      expect(next.metrics.temperature).toBeLessThanOrEqual(60)
      expect(next.metrics.vibration).toBeGreaterThanOrEqual(1.5)
      expect(next.metrics.vibration).toBeLessThanOrEqual(3.5)
      state = next
    }
  })

  it('택트 타임 사이에는 수량을 그대로 두고, 택트 타임마다 1개를 완성한다', () => {
    const before = run(CNC, initialState(CNC), CNC.tactTime - 1)
    expect(before.production).toEqual({ totalCount: 0, goodCount: 0, badCount: 0 })
    const first = step(CNC, before, steady, Infinity)
    expect(first.production).toEqual({ totalCount: 1, goodCount: 1, badCount: 0 })
    expect(first.status).toBe('RUN')
    expect(run(CNC, first, CNC.tactTime - 1).production.totalCount).toBe(1)
    expect(run(CNC, first, CNC.tactTime).production.totalCount).toBe(2)
  })

  it('투입할 것이 없으면 대기(IDLE)이고 수량이 늘지 않는다', () => {
    let state = initialState(CNC)
    for (let i = 0; i < CNC.tactTime * 2; i++) state = step(CNC, state, steady, 0)
    expect(state.status).toBe('IDLE')
    expect(state.inProcess).toBe(false)
    expect(state.production.totalCount).toBe(0)
  })

  it('1개만 투입할 수 있으면 1개를 완성하고 대기로 돌아간다. 가공 중이던 것은 supply가 0이 돼도 끝까지 만든다', () => {
    let state = step(CNC, initialState(CNC), steady, 1) // 투입
    expect(state).toMatchObject({ status: 'RUN', inProcess: true, tactElapsed: 1 })
    for (let i = 1; i < CNC.tactTime; i++) state = step(CNC, state, steady, 0)
    expect(state.production.totalCount).toBe(1)
    expect(state.status).toBe('IDLE')
  })

  it('불량이 나면 WARN 또는 DOWN으로 3~5초 바뀌었다가 RUN으로 돌아온다', () => {
    const before = run(CNC, initialState(CNC), CNC.tactTime - 1)
    // 불량(0.01 < 5%) → WARN(0.2 < 0.5) → 3초(0)
    const warn = step(CNC, before, queue(0.01, 0.2, 0), Infinity)
    expect(warn.production).toEqual({ totalCount: 1, goodCount: 0, badCount: 1 })
    expect(warn.status).toBe('WARN')
    expect(run(CNC, warn, 2).status).toBe('WARN')
    expect(run(CNC, warn, 3).status).toBe('RUN')

    // 불량 → DOWN(0.7) → 5초(0.99)
    const down = step(CNC, before, queue(0.01, 0.7, 0.99), Infinity)
    expect(down.status).toBe('DOWN')
    expect(run(CNC, down, 4).status).toBe('DOWN')
    expect(run(CNC, down, 5).status).toBe('RUN')
  })

  it('DOWN 동안은 택트 타이머가 멈춘다', () => {
    const before = run(CNC, initialState(CNC), CNC.tactTime - 1)
    const down = step(CNC, before, queue(0.01, 0.7, 0), Infinity) // DOWN 3초
    expect(down.tactElapsed).toBe(0)
    const stopped = run(CNC, down, 2)
    expect(stopped.status).toBe('DOWN')
    expect(stopped.tactElapsed).toBe(0)
    const resumed = step(CNC, stopped, steady, Infinity)
    expect(resumed.status).toBe('RUN')
    expect(resumed.tactElapsed).toBe(1)
  })

  it('경고(WARN) 중에는 1초에 0.75초분만 가공해 같은 1개에 더 오래 걸린다', () => {
    const before = run(CNC, initialState(CNC), CNC.tactTime - 1)
    const warn = step(CNC, before, queue(0.01, 0.2, 0.99), Infinity) // 불량 → WARN 5초
    expect(warn.status).toBe('WARN')
    // 다음 1개: WARN 4초 동안 3초분, 그 뒤 RUN에서 나머지 42초 → 46초째에 완성(경고 없으면 45초)
    expect(run(CNC, warn, 4).tactElapsed).toBe(3)
    expect(run(CNC, warn, CNC.tactTime).production.totalCount).toBe(1)
    expect(run(CNC, warn, CNC.tactTime + 1).production.totalCount).toBe(2)
  })

  it('가공 중 가끔 30~60초짜리 속도 저하 경고가 생기고, 가공하지 않을 때는 생기지 않는다', () => {
    const started = step(CNC, initialState(CNC), steady, Infinity) // 투입
    // 속도 저하(0.001 < 1/300) → 30초(0)
    const slow = step(CNC, started, queue(0.001, 0), Infinity)
    expect(slow).toMatchObject({ status: 'WARN', statusRemaining: 30, tactElapsed: 2 })
    expect(run(CNC, slow, 29).status).toBe('WARN')
    expect(run(CNC, slow, 30).status).toBe('RUN')

    const idle = step(CNC, initialState(CNC), queue(0.001, 0), 0)
    expect(idle.status).toBe('IDLE')
  })

  it('불량률은 약 5%다', () => {
    let state = initialState(CNC)
    state = run(CNC, state, CNC.tactTime * 4000, createRng(2026))
    const { totalCount, badCount, goodCount } = state.production
    expect(goodCount + badCount).toBe(totalCount)
    expect(badCount / totalCount).toBeGreaterThan(0.04)
    expect(badCount / totalCount).toBeLessThan(0.06)
  })

  it('전송 로그에는 스키마 필드만 담고, 작업지시가 없으면 수량을 빼고 보낸다', () => {
    const at = new Date('2026-10-24T23:37:12.451Z')
    expect(toLog(initialState(CNC), undefined, at)).toEqual({
      equipmentId: 'CNC_01',
      timestamp: '2026-10-24T23:37:12.451Z',
      status: 'IDLE',
      metrics: { temperature: 49, vibration: 2.5 },
    })
    const log = toLog(initialState(CNC), 'WO-20261024-001', at)
    expect(log).toEqual({
      equipmentId: 'CNC_01',
      timestamp: '2026-10-24T23:37:12.451Z',
      status: 'IDLE',
      workOrderId: 'WO-20261024-001',
      metrics: { temperature: 49, vibration: 2.5 },
      production: { totalCount: 0, goodCount: 0, badCount: 0 },
    })
  })
})
