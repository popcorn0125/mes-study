import { beforeAll, describe, expect, it } from 'vitest'
import { freeScenario } from '@/scenarios'
import { createScenarioEngine } from '@/scenarios/runner'
import { SimEngine } from '@/sim/engine'
import { toCsv } from './csv'
import { oee } from './kpi'
import { qualitySummary } from './quality'
import {
  handover,
  hourlyReport,
  itemReport,
  rangeEquipment,
  rangeOutput,
  rangePlan,
  shiftSummary,
  workCenterReport,
} from './report'
import { SHIFT_LENGTH, isClosed, shiftAt, shiftRangeEnd, shiftsUntil } from './shifts'

const HOUR = 3600

/** 자유 체험 1교대(8시간)를 다 돈 결과 */
let engine: SimEngine
beforeAll(() => {
  engine = createScenarioEngine(freeScenario)
  engine.run(8 * HOUR)
})

describe('교대 달력', () => {
  it('8시간씩 하루 3교대, 둘째 날부터 날짜 차수를 붙인다', () => {
    expect(shiftAt(0)).toMatchObject({ label: '1교대', start: 0, end: SHIFT_LENGTH })
    expect(shiftAt(2)).toMatchObject({ label: '3교대', start: 16 * HOUR, end: 24 * HOUR })
    expect(shiftAt(3)).toMatchObject({ label: '2일차 1교대', day: 1, no: 1 })
  })

  it('시작된 교대만 목록에 넣고, 경계 정각에는 새 교대를 아직 넣지 않는다', () => {
    expect(shiftsUntil(0).map((s) => s.index)).toEqual([0])
    expect(shiftsUntil(5 * HOUR).map((s) => s.index)).toEqual([0])
    expect(shiftsUntil(8 * HOUR).map((s) => s.index)).toEqual([0])
    expect(shiftsUntil(8 * HOUR + 1).map((s) => s.index)).toEqual([0, 1])
  })

  it('끝난 교대는 마감, 집계 끝은 교대 끝과 지금 중 이른 쪽', () => {
    expect(isClosed(shiftAt(0), 8 * HOUR)).toBe(true)
    expect(isClosed(shiftAt(0), 8 * HOUR - 1)).toBe(false)
    expect(shiftRangeEnd(shiftAt(0), 3 * HOUR)).toBe(3 * HOUR)
    expect(shiftRangeEnd(shiftAt(0), 9 * HOUR)).toBe(8 * HOUR)
  })
})

describe('구간 집계', () => {
  it('1교대가 끝나면 교대 실적 · 폐기가 전체 누적과 같다', () => {
    const { state, master } = engine
    const summary = shiftSummary(state, shiftAt(0))
    const q = qualitySummary(state, master)
    expect(summary.closed).toBe(true)
    expect(summary.good).toBe(state.counters.completed)
    expect(summary.scrap).toBe(state.counters.scrapped)
    expect(summary.fpy).toBeCloseTo(q.fpy!)
    expect(summary.reworks).toBe(q.reworks)
    expect(summary.plan).toBe(480)
    expect(summary.workOrders.completed).toBe(state.workOrders.filter((wo) => wo.completedAt !== null).length)
  })

  it('교대 구간 설비 시간 · OEE = 시작부터 누적한 값(1교대는 시작 = 교대 시작)', () => {
    const { state } = engine
    const rows = rangeEquipment(state, 0, 8 * HOUR)!
    for (const eq of state.equipment) {
      const row = rows.find((r) => r.equipmentId === eq.id)!
      expect(row.counters.statusTime).toEqual(eq.statusTime)
      expect(row.oee).toBeCloseTo(oee(eq).oee)
    }
  })

  it('구간을 나눠 합하면 전체와 같다(실적 · 계획 · 설비 시간)', () => {
    const { state } = engine
    const whole = rangeOutput(state, 0, 8 * HOUR)
    const a = rangeOutput(state, 0, 3 * HOUR)
    const b = rangeOutput(state, 3 * HOUR, 8 * HOUR)
    expect(a.good + b.good).toBe(whole.good)
    expect(a.scrap + b.scrap).toBe(whole.scrap)
    expect(a.reworks + b.reworks).toBe(whole.reworks)
    expect(rangePlan(state, 0, 3 * HOUR)!.total + rangePlan(state, 3 * HOUR, 8 * HOUR)!.total).toBeCloseTo(480)

    const first = rangeEquipment(state, 0, 3 * HOUR)!
    const second = rangeEquipment(state, 3 * HOUR, 8 * HOUR)!
    for (const eq of state.equipment) {
      const x = first.find((r) => r.equipmentId === eq.id)!.counters
      const y = second.find((r) => r.equipmentId === eq.id)!.counters
      expect(x.statusTime.RUN + y.statusTime.RUN).toBe(eq.statusTime.RUN)
      expect(x.statusTime.DOWN + y.statusTime.DOWN).toBe(eq.statusTime.DOWN)
      expect(x.processedCount + y.processedCount).toBe(eq.processedCount)
    }
  })

  it('진행 중인 구간은 지금 엔진 상태까지로 계산하고, 기록이 없는 시각이면 null', () => {
    const live = createScenarioEngine(freeScenario)
    live.run(2 * HOUR + 600)
    const rows = rangeEquipment(live.state, 2 * HOUR, live.state.time)!
    const total = Object.values(rows[0].counters.statusTime).reduce((a, b) => a + b, 0)
    expect(total).toBe(600)
    expect(rangeEquipment(live.state, 1800, live.state.time)).toBeNull() // 정시가 아닌 시각은 기록이 없다
  })
})

describe('교대 보고서', () => {
  it('시간대별 실적 합 = 교대 실적, 누적 차이 = 마지막 행 누적 실적 − 누적 계획', () => {
    const { state, master } = engine
    const report = hourlyReport(state, master, shiftAt(0))
    expect(report.rows).toHaveLength(8)
    expect(report.rows.reduce((s, r) => s + r.good, 0)).toBe(report.total.good)
    expect(report.rows.reduce((s, r) => s + r.scrap, 0)).toBe(report.total.scrap)
    expect(report.rows.reduce((s, r) => s + (r.stop ?? 0), 0)).toBe(report.total.stop)
    const last = report.rows.at(-1)!
    expect(last.cumulativeGood).toBe(report.total.good)
    expect(last.cumulativeGap).toBeCloseTo(last.cumulativeGood - last.cumulativePlan!)
    expect(report.rows.every((r) => r.plan === 60)).toBe(true)
  })

  it('고장이 난 시간대 비고에 고장이 적힌다', () => {
    const { state, master } = engine
    const down = state.events.find((e) => e.type === 'EQUIPMENT_DOWN')!
    const row = hourlyReport(state, master, shiftAt(0)).rows.find((r) => down.time >= r.start && down.time < r.end)!
    expect(row.notes).toContain(down)
    expect(row.stop).toBeGreaterThan(0)
  })

  it('진행 중 교대는 지금까지의 시간대만 있고 마지막 시간대는 진행 중', () => {
    const live = createScenarioEngine(freeScenario)
    live.run(2 * HOUR + 600)
    const rows = hourlyReport(live.state, live.master, shiftAt(0)).rows
    expect(rows).toHaveLength(3)
    expect(rows.at(-1)).toMatchObject({ start: 2 * HOUR, end: 2 * HOUR + 600, inProgress: true })
    expect(rows.at(-1)!.plan).toBeCloseTo(10)
  })

  it('품목별 실적 합 = 교대 실적, 계획은 계획 비율대로 나눈다', () => {
    const { state, master } = engine
    const rows = itemReport(state, master, shiftAt(0))
    expect(rows.reduce((s, r) => s + r.good, 0)).toBe(state.counters.completed)
    expect(rows.find((r) => r.itemId === 'MOTOR-A')!.plan).toBe(360)
    expect(rows.find((r) => r.itemId === 'MOTOR-B')!.plan).toBe(120)
  })

  it('공정별 실적: 가공 수 · 불량은 설비 누적과 같고, 정지 시간은 사유별로 나눈다', () => {
    const { state, master } = engine
    const rows = workCenterReport(state, master, shiftAt(0))!
    const machining = rows.find((r) => r.workCenterId === 'MACHINING')!
    const cnc = state.equipment.find((eq) => eq.id === 'MACHINING-1')!
    expect(machining.processed).toBe(cnc.processedCount)
    expect(machining.defects).toBe(cnc.defectCount)
    expect(machining.stops.DOWN).toBe(cnc.statusTime.DOWN)
  })

  it('인수인계: 교대 사건(고장 포함)과, 가장 최근 교대에서만 넘길 일을 만든다', () => {
    const live = createScenarioEngine(freeScenario)
    live.run(5 * HOUR)
    const notes = handover(live.state, live.master, shiftAt(0))
    expect(notes.events.some((e) => e.type === 'EQUIPMENT_DOWN')).toBe(true)
    expect(notes.events.every((e) => e.type !== 'MATERIAL_ORDERED' || e.severity !== 'info')).toBe(true)
    const carry = notes.carryOver!
    expect(carry.workOrders.length).toBe(live.state.workOrders.filter((wo) => wo.status !== 'COMPLETED').length)
    expect(carry.purchaseOrders.every((po) => po.receivedAt === null)).toBe(true)

    live.run(4 * HOUR) // 2교대로 넘어감
    expect(handover(live.state, live.master, shiftAt(0)).carryOver).toBeNull()
    expect(handover(live.state, live.master, shiftAt(1)).carryOver).not.toBeNull()
  })
})

describe('CSV', () => {
  it('BOM + CRLF, 쉼표 · 따옴표 · 줄바꿈이 든 칸은 따옴표로 감싼다, null은 빈칸', () => {
    const csv = toCsv(['시간', '비고'], [
      ['00:00', 'CNC #1 고장, 20분'],
      ['01:00', '말 "따옴표"'],
      ['02:00', null],
      [3, '줄\n바꿈'],
    ])
    expect(csv.startsWith('﻿시간,비고\r\n')).toBe(true)
    expect(csv).toContain('00:00,"CNC #1 고장, 20분"\r\n')
    expect(csv).toContain('01:00,"말 ""따옴표"""\r\n')
    expect(csv).toContain('02:00,\r\n')
    expect(csv).toContain('3,"줄\n바꿈"\r\n')
  })
})
