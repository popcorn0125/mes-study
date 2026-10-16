import type { DefectCause, DefectCode, Disposition, MasterData, SimState, Unit } from './types'

const HOUR = 3600

/**
 * 품질 지표 계산. 제품(Unit)의 공정 이력을 읽기만 하고 상태에 저장하지 않는다.
 * - 최종 양품률: 끝난 제품(완료 + 폐기) 중 양품으로 완료한 비율. 재작업으로 살린 제품도 양품이다.
 * - 직행률(FPY): 끝난 제품 중 한 번도 불량 없이 완료한 비율. 최종 양품률과의 차이가 재작업으로 살린 제품이다.
 */

function isFinished(unit: Unit): boolean {
  return unit.status === 'COMPLETED' || unit.status === 'SCRAPPED'
}

function hasDefect(unit: Unit): boolean {
  return unit.history.some((h) => h.result === 'DEFECT')
}

export interface QualitySummary {
  /** 끝난 제품 수(완료 + 폐기) */
  finished: number
  good: number
  scrapped: number
  /** 한 번도 불량 없이 완료한 제품 수 */
  firstPassGood: number
  /** 재작업으로 살려 완료한 제품 수 */
  reworkSaved: number
  /** 재작업(다시 가공) 횟수 */
  reworks: number
  finalYield: number | null
  fpy: number | null
  /** 폐기품에 들어간 자재비(원) */
  scrapCost: number
}

export function qualitySummary(state: SimState, master: MasterData): QualitySummary {
  const unitCost = new Map(master.materials.map((m) => [m.id, m.unitCost]))
  let finished = 0
  let good = 0
  let scrapped = 0
  let firstPassGood = 0
  let reworkSaved = 0
  let reworks = 0
  let scrapCost = 0
  for (const unit of Object.values(state.units)) {
    reworks += unit.history.filter((h) => h.rework).length
    if (!isFinished(unit)) continue
    finished++
    if (unit.status === 'COMPLETED') {
      good++
      if (hasDefect(unit)) reworkSaved++
      else firstPassGood++
    } else {
      scrapped++
      for (const lot of unit.materialLots) scrapCost += lot.qty * (unitCost.get(lot.materialId) ?? 0)
    }
  }
  return {
    finished,
    good,
    scrapped,
    firstPassGood,
    reworkSaved,
    reworks,
    finalYield: finished === 0 ? null : good / finished,
    fpy: finished === 0 ? null : firstPassGood / finished,
    scrapCost,
  }
}

export interface OperationYield {
  workCenterId: string
  /** 1차 가공 수(재작업 가공 제외) */
  firstPass: number
  /** 1차 가공에서 합격한 수 */
  firstGood: number
  /** 재작업 가공 수 */
  reworks: number
  /** 재작업에서 합격한 수 */
  reworkGood: number
  /** 이 공정에서 폐기된 수 */
  scrapped: number
  /** 1차 합격률. 1차 가공이 없으면 null */
  firstPassRate: number | null
  /** 재작업에 쓴 설비 시간(초) — 숨은 공장 */
  reworkTime: number
}

export interface OperationYields {
  rows: OperationYield[]
  /** 누적 수율(RTY) = 공정별 1차 합격률의 곱. 1차 가공이 있는 공정만 곱한다 */
  rty: number | null
}

/** 공정(작업장)별 1차 합격률 · 재작업 · 폐기, 그리고 RTY. 라인 순서대로 돌려준다. */
export function operationYields(state: SimState, master: MasterData): OperationYields {
  const workCenterOf = new Map<string, string>()
  for (const routing of master.routings) {
    for (const op of routing.operations) workCenterOf.set(`${routing.itemId}|${op.seq}`, op.workCenterId)
  }
  const rows = new Map<string, OperationYield>(
    master.workCenters.map((wc) => [
      wc.id,
      { workCenterId: wc.id, firstPass: 0, firstGood: 0, reworks: 0, reworkGood: 0, scrapped: 0, firstPassRate: null, reworkTime: 0 },
    ]),
  )
  for (const unit of Object.values(state.units)) {
    for (const h of unit.history) {
      const row = rows.get(workCenterOf.get(`${unit.itemId}|${h.opSeq}`)!)!
      if (h.rework) {
        row.reworks++
        row.reworkTime += h.end - h.start
        if (h.result === 'GOOD') row.reworkGood++
      } else {
        row.firstPass++
        if (h.result === 'GOOD') row.firstGood++
      }
    }
    const last = unit.history.at(-1)
    if (unit.status === 'SCRAPPED' && last) rows.get(workCenterOf.get(`${unit.itemId}|${last.opSeq}`)!)!.scrapped++
  }
  let rty: number | null = null
  for (const row of rows.values()) {
    if (row.firstPass === 0) continue
    row.firstPassRate = row.firstGood / row.firstPass
    rty = (rty ?? 1) * row.firstPassRate
  }
  return { rows: [...rows.values()], rty }
}

export interface DefectParetoEntry {
  code: DefectCode
  count: number
  /** 누적 비율(0~1) */
  cumulative: number
}

/** 불량 유형별 건수(재작업 가공의 불량 포함)를 큰 순서로, 누적 비율과 함께 */
export function defectPareto(state: SimState, master: MasterData): DefectParetoEntry[] {
  const codes = new Map(master.defectCodes.map((c) => [c.id, c]))
  const counts = new Map<string, number>()
  for (const unit of Object.values(state.units)) {
    for (const h of unit.history) {
      if (h.defectCode) counts.set(h.defectCode, (counts.get(h.defectCode) ?? 0) + 1)
    }
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
  let running = 0
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => {
      running += count
      return { code: codes.get(id)!, count, cumulative: running / total }
    })
}

export interface HourlyQuality {
  hour: number
  /** 원인별 불량 수(재작업 가공의 불량 포함) */
  defects: Record<DefectCause, number>
  /** 처리별 불량 수 */
  byDisposition: Record<Disposition, number>
  /** 이 시간대에 끝난 제품의 직행률. 끝난 제품이 없으면 null */
  fpy: number | null
}

/** 시간대별(1시간) 불량 수와 직행률. 불량은 발생 시각, 직행률은 제품이 끝난 시각 기준이다. */
export function hourlyQuality(state: SimState, master: MasterData): HourlyQuality[] {
  const codes = new Map(master.defectCodes.map((c) => [c.id, c]))
  const count = Math.max(Math.ceil(state.time / HOUR), 1)
  const bucket = (time: number) => Math.min(Math.max(Math.floor((time - 1) / HOUR), 0), count - 1)
  const rows = Array.from({ length: count }, (_, hour) => ({
    hour,
    defects: { PROCESS: 0, WEAR: 0 } as Record<DefectCause, number>,
    byDisposition: { REWORK: 0, SCRAP: 0 } as Record<Disposition, number>,
    finished: 0,
    firstPass: 0,
  }))
  for (const unit of Object.values(state.units)) {
    for (const h of unit.history) {
      if (!h.defectCode) continue
      const code = codes.get(h.defectCode)!
      const row = rows[bucket(h.end)]
      row.defects[code.cause]++
      // 재작업 가공에서 또 불량이면 유형과 관계없이 폐기된다
      row.byDisposition[h.rework ? 'SCRAP' : code.disposition]++
    }
    if (isFinished(unit)) {
      const row = rows[bucket(unit.finishedAt!)]
      row.finished++
      if (unit.status === 'COMPLETED' && !hasDefect(unit)) row.firstPass++
    }
  }
  return rows.map(({ hour, defects, byDisposition, finished, firstPass }) => ({
    hour,
    defects,
    byDisposition,
    fpy: finished === 0 ? null : firstPass / finished,
  }))
}
