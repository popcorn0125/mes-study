import { beforeAll, describe, expect, it } from 'vitest'
import { freeScenario } from '@/scenarios'
import { createBaselineMaster } from '@/scenarios/baseline'
import { materialShortageScenario } from '@/scenarios/materialShortage'
import { createScenarioEngine, runWithActions } from '@/scenarios/runner'
import { SimEngine } from '@/sim/engine'
import { consumptionRate, inventorySummary, materialRows, stockCoverage, stockStatus, stockTrend } from './materials'
import { bomTree, materialRequirements } from './mrp'
import type { MasterData } from './types'

const HOUR = 3600

/** 자유 체험 2시간 실행 결과(여러 테스트가 함께 쓴다) */
let engine: SimEngine
beforeAll(() => {
  engine = createScenarioEngine(freeScenario)
  engine.run(2 * HOUR)
})

const material = (master: MasterData, id: string) => master.materials.find((m) => m.id === id)!

describe('재고 상태', () => {
  it('결품(가장 큰 BOM 소요 1개분 미만) → 안전재고 이하 → 발주점 이하 → 정상', () => {
    const master = createBaselineMaster()
    const magnet = material(master, 'MAGNET') // 안전재고 110, 발주점 500, 1대에 4개
    expect(stockStatus(3, magnet, master)).toBe('SHORTAGE')
    expect(stockStatus(4, magnet, master)).toBe('BELOW_SAFETY')
    expect(stockStatus(110, magnet, master)).toBe('BELOW_SAFETY')
    expect(stockStatus(111, magnet, master)).toBe('BELOW_ROP')
    expect(stockStatus(500, magnet, master)).toBe('BELOW_ROP')
    expect(stockStatus(501, magnet, master)).toBe('OK')
  })
})

describe('소비 속도 · 재고 커버', () => {
  it('소비 속도는 최근 1시간 누적 소비 증가량이다(입고와 섞이지 않는다)', () => {
    const { state } = engine
    const hourAgo = state.stockHistory.find((s) => s.time === state.time - HOUR)!
    for (const id of ['HOUSING', 'MAGNET']) {
      expect(consumptionRate(state, id)).toBeCloseTo(state.materials[id].consumed - hourAgo.consumed[id])
    }
  })

  it('시작 직후에는 지난 시간만큼으로 계산하고, 시간이 0이면 null', () => {
    const fresh = createScenarioEngine(freeScenario)
    expect(consumptionRate(fresh.state, 'HOUSING')).toBeNull()
    fresh.run(600)
    const rate = consumptionRate(fresh.state, 'HOUSING')!
    expect(rate).toBeCloseTo((fresh.state.materials['HOUSING'].consumed / 600) * HOUR)
  })

  it('재고 커버 = 현재고 ÷ 시간당 소비, 소비가 없으면 null', () => {
    expect(stockCoverage(100, 50)).toBe(2 * HOUR)
    expect(stockCoverage(100, 0)).toBeNull()
    expect(stockCoverage(100, null)).toBeNull()
  })
})

describe('재고 현황 · 요약', () => {
  it('발주점을 리드타임 소요 몫과 안전재고로 나누고, 입고 예정 · 재고 금액을 계산한다', () => {
    const { state, master } = engine
    const rows = materialRows(state, master)
    expect(rows.map((r) => r.material.id)).toEqual(master.materials.map((m) => m.id))
    for (const row of rows) {
      expect(row.leadTimeDemand + row.material.safetyStock).toBe(row.material.reorderPoint)
      expect(row.onOrder).toBe(state.materials[row.material.id].orders.reduce((s, po) => s + po.qty, 0))
      expect(row.value).toBe(row.onHand * row.material.unitCost)
    }
  })

  it('요약: 재고 금액 합계, 가장 짧은 재고 커버, 입고 대기 발주', () => {
    const { state, master } = engine
    const rows = materialRows(state, master)
    const summary = inventorySummary(state, master)
    expect(summary.totalValue).toBe(rows.reduce((s, r) => s + r.value, 0))
    const shortest = Math.min(...rows.filter((r) => r.coverage !== null).map((r) => r.coverage!))
    expect(summary.minCoverage?.seconds).toBe(shortest)
    const pending = state.purchaseOrders.filter((po) => po.receivedAt === null)
    expect(summary.pendingOrders).toBe(pending.length)
    if (pending.length > 0) expect(summary.nextArrival).toBe(Math.min(...pending.map((p) => p.eta)) - state.time)
  })

  it('S3(자재 부족): 고급 베어링이 결품되고 자재 부족 정지가 쌓이며, 모범 조치(긴급 발주)는 할증이 보인다', () => {
    const none = runWithActions(createScenarioEngine(materialShortageScenario), [], HOUR)
    const prm = materialRows(none.state, none.master).find((r) => r.material.id === 'BEARING-PRM')!
    expect(prm.status).toBe('SHORTAGE')
    expect(inventorySummary(none.state, none.master).materialStop).toBeGreaterThan(0)

    const best = runWithActions(createScenarioEngine(materialShortageScenario), materialShortageScenario.bestActions, HOUR)
    const summary = inventorySummary(best.state, best.master)
    expect(summary.expediteSurcharge).toBeGreaterThan(0)
    expect(best.state.purchaseOrders.some((po) => po.expedited && po.receivedAt !== null)).toBe(true)
  })

  it('재고 추이는 1분 기록에 현재 시각 점을 더하고, 그 자재의 발주만 담는다', () => {
    const fresh = createScenarioEngine(freeScenario)
    fresh.run(90)
    const trend = stockTrend(fresh.state, 'HOUSING')
    expect(trend.points.map((p) => p[0])).toEqual([0, 60, 90])
    expect(trend.points.at(-1)![1]).toBe(fresh.state.materials['HOUSING'].onHand)
    const twoHours = stockTrend(engine.state, 'MAGNET')
    expect(twoHours.orders.length).toBeGreaterThan(0)
    expect(twoHours.orders.every((po) => po.materialId === 'MAGNET')).toBe(true)
  })
})

describe('BOM 전개 · 소요량', () => {
  it('BOM 트리: 품목 → 자재를 쓰는 작업장(라인 순) → 자재 × 수량', () => {
    const tree = bomTree(createBaselineMaster())
    const a = tree.find((t) => t.itemId === 'MOTOR-A')!
    expect(a.workCenters.map((w) => w.workCenterId)).toEqual(['MACHINING', 'WINDING', 'ASSEMBLY'])
    expect(a.workCenters[2].lines).toEqual([
      { materialId: 'MAGNET', qtyPer: 4 },
      { materialId: 'BEARING-STD', qtyPer: 2 },
    ])
  })

  it('시작 시 총소요 = 작업지시 수량 × BOM 수량, 순소요 = 총소요 + 안전재고 − 현재고 − 입고 예정', () => {
    const { state, master } = createScenarioEngine(freeScenario) // A 360 · B 120
    const req = new Map(materialRequirements(state, master).map((r) => [r.materialId, r]))
    expect(req.get('HOUSING')!.gross).toBe(480)
    expect(req.get('MAGNET')!.gross).toBe(480 * 4)
    expect(req.get('BEARING-STD')!.byItem).toEqual([{ itemId: 'MOTOR-A', qty: 720 }])
    expect(req.get('BEARING-PRM')!.gross).toBe(240)
    const housing = req.get('HOUSING')!
    expect(housing.net).toBe(480 + 30 - 200 - 0)
  })

  it('라인 안의 제품은 그 자재를 아직 안 쓴 것만 센다 → 총소요 = 앞으로 소비할 양', () => {
    const { state, master } = engine
    // 계획 수량 × BOM − 지금까지 쓴 양 = 남은 총소요(폐기된 제품이 쓴 자재는 다시 채우지 않으므로 그대로 뺀다)
    for (const r of materialRequirements(state, master)) {
      const total = state.workOrders.reduce(
        (sum, wo) => sum + wo.qty * master.bom.filter((l) => l.itemId === wo.itemId && l.materialId === r.materialId).reduce((s, l) => s + l.qtyPer, 0),
        0,
      )
      const scrappedUnconsumed = Object.values(state.units)
        .filter((u) => u.status === 'SCRAPPED')
        .reduce((sum, u) => {
          const per = master.bom.filter((l) => l.itemId === u.itemId && l.materialId === r.materialId).reduce((s, l) => s + l.qtyPer, 0)
          const used = u.materialLots.filter((l) => l.materialId === r.materialId).reduce((s, l) => s + l.qty, 0)
          return sum + per - used
        }, 0)
      expect(r.gross).toBe(total - state.materials[r.materialId].consumed - scrappedUnconsumed)
    }
  })
})
