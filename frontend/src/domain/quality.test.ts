import { beforeAll, describe, expect, it } from 'vitest'
import { freeScenario } from '@/scenarios'
import { createBaselineMaster } from '@/scenarios/baseline'
import { createScenarioEngine } from '@/scenarios/runner'
import { SimEngine } from '@/sim/engine'
import { defectPareto, hourlyQuality, operationYields, qualitySummary } from './quality'
import { lotUsage, lotsOf, recentDefectUnits, unitTrace } from './traceability'
import type { MasterData, Unit, UnitHistoryEntry } from './types'

const HOUR = 3600

/** 자유 체험 8시간 실행 결과(여러 테스트가 함께 쓴다) */
let engine: SimEngine
beforeAll(() => {
  engine = createScenarioEngine(freeScenario)
  engine.run(8 * HOUR)
})

function step(opSeq: number, result: 'GOOD' | 'DEFECT', fields: Partial<UnitHistoryEntry> = {}): UnitHistoryEntry {
  return { opSeq, equipmentId: 'X', start: 0, end: 50, result, defectCode: null, rework: false, ...fields }
}

/** 손으로 만든 제품 몇 개로 계산을 확인한다 */
function handMade(): { master: MasterData; engine: SimEngine } {
  const master = createBaselineMaster()
  const e = new SimEngine(master, { seed: 1 })
  const unit = (id: string, status: Unit['status'], history: UnitHistoryEntry[], finishedAt = 100): Unit => ({
    id,
    workOrderId: 'WO-001',
    itemId: 'MOTOR-A',
    opIndex: 4,
    status,
    releasedAt: 0,
    finishedAt,
    history,
    materialLots: [{ materialId: 'HOUSING', lotId: 'L-HOUSING-000', qty: 1 }],
  })
  const all = [10, 20, 30, 40, 50]
  const units = [
    // 한 번에 통과
    unit('A', 'COMPLETED', all.map((s) => step(s, 'GOOD'))),
    unit('B', 'COMPLETED', all.map((s) => step(s, 'GOOD'))),
    // 조립에서 체결 토크 불량 → 재작업 성공
    unit('C', 'COMPLETED', [
      step(10, 'GOOD'),
      step(20, 'GOOD'),
      step(30, 'DEFECT', { defectCode: 'AS-TORQUE' }),
      step(30, 'GOOD', { rework: true, start: 50, end: 100 }),
      step(40, 'GOOD'),
      step(50, 'GOOD'),
    ], 4000),
    // 가공에서 표면 찍힘 → 폐기
    unit('D', 'SCRAPPED', [step(10, 'DEFECT', { defectCode: 'MC-DENT' })]),
  ]
  for (const u of units) e.state.units[u.id] = u
  e.state.time = 2 * HOUR
  return { master, engine: e }
}

describe('qualitySummary', () => {
  it('최종 양품률 = 양품 ÷ 끝난 제품, 직행률 = 한 번에 통과 ÷ 끝난 제품, 폐기 손실 = 폐기품 자재비', () => {
    const { master, engine: e } = handMade()
    expect(qualitySummary(e.state, master)).toEqual({
      finished: 4,
      good: 3,
      scrapped: 1,
      firstPassGood: 2,
      reworkSaved: 1,
      reworks: 1,
      finalYield: 0.75,
      fpy: 0.5,
      scrapCost: 12000, // 하우징 소재 1개
    })
  })

  it('자유 체험: 최종 양품률 − 직행률 = 재작업으로 살린 비율, 카운터와 일치', () => {
    const q = qualitySummary(engine.state, engine.master)
    expect(q.good).toBe(engine.state.counters.completed)
    expect(q.scrapped).toBe(engine.state.counters.scrapped)
    expect(q.reworks).toBe(engine.state.workOrders.reduce((sum, wo) => sum + wo.reworkQty, 0))
    expect(q.reworkSaved).toBeGreaterThan(0)
    expect(q.fpy!).toBeLessThan(q.finalYield!)
    expect(q.finalYield! - q.fpy!).toBeCloseTo(q.reworkSaved / q.finished, 10)
  })
})

describe('operationYields', () => {
  it('공정별 1차 합격률 · 재작업 · 폐기를 세고, RTY는 1차 합격률의 곱이다', () => {
    const { master, engine: e } = handMade()
    const { rows, rty } = operationYields(e.state, master)
    expect(rows.map((r) => r.workCenterId)).toEqual(['MACHINING', 'WINDING', 'ASSEMBLY', 'INSPECTION', 'PACKING'])
    expect(rows[0]).toMatchObject({ firstPass: 4, firstGood: 3, scrapped: 1, firstPassRate: 0.75 })
    expect(rows[2]).toMatchObject({ firstPass: 3, firstGood: 2, reworks: 1, reworkGood: 1, reworkTime: 50 })
    expect(rty).toBeCloseTo(0.75 * 1 * (2 / 3) * 1 * 1, 10)
  })

  it('자유 체험: 공정별 폐기 합 = 전체 폐기, RTY = 1차 합격률의 곱', () => {
    const { rows, rty } = operationYields(engine.state, engine.master)
    expect(rows.reduce((sum, r) => sum + r.scrapped, 0)).toBe(engine.state.counters.scrapped)
    expect(rty).toBeCloseTo(rows.reduce((p, r) => p * (r.firstPassRate ?? 1), 1), 10)
  })
})

describe('defectPareto', () => {
  it('유형별 건수를 큰 순서로, 누적 비율은 1로 끝난다', () => {
    const pareto = defectPareto(engine.state, engine.master)
    expect(pareto.length).toBeGreaterThan(3)
    for (let i = 1; i < pareto.length; i++) expect(pareto[i - 1].count).toBeGreaterThanOrEqual(pareto[i].count)
    expect(pareto.at(-1)!.cumulative).toBeCloseTo(1, 10)
    const defects = Object.values(engine.state.units).flatMap((u) => u.history).filter((h) => h.result === 'DEFECT')
    expect(pareto.reduce((sum, p) => sum + p.count, 0)).toBe(defects.length)
  })
})

describe('hourlyQuality', () => {
  it('불량은 발생 시각, 직행률은 끝난 시각으로 시간대를 나눈다. 재작업 가공의 불량은 폐기로 센다', () => {
    const { master, engine: e } = handMade()
    const rows = hourlyQuality(e.state, master)
    expect(rows).toHaveLength(2)
    expect(rows[0].defects).toEqual({ PROCESS: 2, WEAR: 0 })
    expect(rows[0].byDisposition).toEqual({ REWORK: 1, SCRAP: 1 })
    expect(rows[0].fpy).toBe(2 / 3) // A · B 통과, D 폐기
    expect(rows[1].fpy).toBe(0) // C(재작업)
  })

  it('자유 체험: CNC 마모 불량은 첫 고장 전 시간대에 몰린다', () => {
    const rows = hourlyQuality(engine.state, engine.master)
    expect(rows).toHaveLength(8)
    const firstFailure = engine.state.downtimes.find((d) => d.reason === 'BREAKDOWN')!.start
    const before = rows.filter((r) => (r.hour + 1) * HOUR <= firstFailure + HOUR).reduce((s, r) => s + r.defects.WEAR, 0)
    expect(before).toBeGreaterThan(0)
  })
})

describe('추적성', () => {
  it('역추적: 제품의 공정별 설비 · 불량 유형 · 자재 로트를 보여 준다', () => {
    const [unit] = recentDefectUnits(engine.state, 1)
    const trace = unitTrace(engine.state, engine.master, unit.id)!
    expect(trace.steps.length).toBe(unit.history.length)
    expect(trace.steps.some((s) => s.defect !== null)).toBe(true)
    expect(trace.steps[0].workCenterId).toBe('MACHINING')
    expect(trace.lots.every((l) => l.lot.materialId === l.materialId)).toBe(true)
    expect(unitTrace(engine.state, engine.master, 'U-99999')).toBeNull()
  })

  it('정추적: 로트를 쓴 제품 수와 쓴 수량이 로트 입고 − 남은 수량과 맞는다', () => {
    const lots = lotsOf(engine.state, 'MAGNET')
    expect(lots[0].id).toBe('L-MAGNET-000')
    expect(lots.length).toBeGreaterThan(1)
    for (const lot of lots) {
      const usage = lotUsage(engine.state, lot.id)
      expect(usage.qtyUsed).toBe(lot.qty - lot.remaining)
      expect(usage.completed + usage.scrapped + usage.inProcess).toBe(usage.unitIds.length)
      expect(usage.byWorkOrder.reduce((sum, w) => sum + w.units, 0)).toBe(usage.unitIds.length)
    }
  })

  it('최근 불량 제품은 마지막 불량 시각의 최신순이다', () => {
    const units = recentDefectUnits(engine.state, 5)
    const last = (u: Unit) => Math.max(...u.history.filter((h) => h.result === 'DEFECT').map((h) => h.end))
    for (let i = 1; i < units.length; i++) expect(last(units[i - 1])).toBeGreaterThanOrEqual(last(units[i]))
  })
})
