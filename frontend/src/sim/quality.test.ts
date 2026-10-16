import { describe, expect, it } from 'vitest'
import type { MasterData, SimState } from '@/domain/types'
import { freeScenario } from '@/scenarios'
import { createBaselineMaster } from '@/scenarios/baseline'
import { createScenarioEngine } from '@/scenarios/runner'
import { SimEngine } from './engine'

const HOUR = 3600

/** 자재 로트 남은 수량의 합이 재고와 같은지 확인한다 */
function expectLotsMatchStock(state: SimState) {
  for (const stock of Object.values(state.materials)) {
    const sum = stock.lots.reduce((total, id) => total + state.materialLots[id].remaining, 0)
    expect(sum).toBe(stock.onHand)
    expect(stock.lots.every((id) => state.materialLots[id].remaining > 0)).toBe(true)
  }
}

describe('불량 유형', () => {
  it('불량마다 그 공정의 유형 코드를 남기고, 마모 불량은 마모 원인 유형이다', () => {
    const engine = createScenarioEngine(freeScenario)
    engine.run(3 * HOUR)
    const master = engine.master
    const codes = new Map(master.defectCodes.map((c) => [c.id, c]))
    const defects = Object.values(engine.state.units).flatMap((u) =>
      u.history.filter((h) => h.result === 'DEFECT').map((h) => ({ h, unit: u })),
    )
    expect(defects.length).toBeGreaterThan(0)
    for (const { h, unit } of defects) {
      const code = codes.get(h.defectCode!)!
      const op = master.routings.find((r) => r.itemId === unit.itemId)!.operations.find((o) => o.seq === h.opSeq)!
      expect(code.workCenterId).toBe(op.workCenterId)
    }
    // 양품 이력에는 유형이 없다
    const good = Object.values(engine.state.units).flatMap((u) => u.history.filter((h) => h.result === 'GOOD'))
    expect(good.every((h) => h.defectCode === null)).toBe(true)
  })

  it('불량률 중 공정 불량률을 넘는 부분은 설비 마모 불량(마모 원인 유형)이다', () => {
    const master = createBaselineMaster()
    master.routings[0].operations[0].defectRate = 0 // 가공의 공정 불량을 없애 마모 불량만 남긴다
    const cnc = master.equipment[0].reliability!
    cnc.initialWear = 0.9
    cnc.wearDefectRate = 1
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 10, release: true })
    engine.run(600)
    const cncDefects = engine.state.records.filter((r) => r.equipmentId === 'MACHINING-1' && r.result === 'DEFECT')
    expect(cncDefects.length).toBeGreaterThan(0)
    expect(cncDefects.every((r) => r.defectCode === 'MC-DIM')).toBe(true)
  })

  it('같은 seed면 같은 유형이 나온다', () => {
    const codesOf = () => {
      const engine = createScenarioEngine(freeScenario)
      engine.run(2 * HOUR)
      return engine.state.records.filter((r) => r.result === 'DEFECT').map((r) => r.defectCode)
    }
    expect(codesOf()).toEqual(codesOf())
  })

  it('불량이 날 수 있는 공정에 유형이 없으면 엔진 생성 시 거부한다', () => {
    const noProcessCode = createBaselineMaster()
    noProcessCode.defectCodes = noProcessCode.defectCodes.filter((c) => !(c.workCenterId === 'WINDING' && c.cause === 'PROCESS'))
    expect(() => new SimEngine(noProcessCode, { seed: 1 })).toThrow(/WINDING/)

    const noWearCode = createBaselineMaster()
    noWearCode.defectCodes = noWearCode.defectCodes.filter((c) => c.id !== 'MC-DIM')
    expect(() => new SimEngine(noWearCode, { seed: 1 })).toThrow(/MACHINING/)
  })
})

describe('자재 로트', () => {
  /** 불량·고장을 뺀 기준정보 */
  function lotMaster(adjust?: (master: MasterData) => void): MasterData {
    const master = createBaselineMaster()
    for (const routing of master.routings) for (const op of routing.operations) op.defectRate = 0
    for (const eq of master.equipment) delete eq.reliability
    adjust?.(master)
    return master
  }

  it('시작 재고는 로트 하나이고, 입고마다 발주 번호가 붙은 로트가 생긴다', () => {
    const engine = new SimEngine(lotMaster(), { seed: 1 })
    expect(engine.state.materials['MAGNET'].lots).toEqual(['L-MAGNET-000'])
    expect(engine.state.materialLots['L-MAGNET-000']).toMatchObject({ qty: 800, remaining: 800, purchaseOrderId: null })

    engine.dispatch({ type: 'EXPEDITE_MATERIAL', materialId: 'MAGNET', qty: 100 })
    engine.run(21 * 60)
    const lotId = engine.state.materials['MAGNET'].lots[1]
    expect(engine.state.materialLots[lotId]).toMatchObject({ materialId: 'MAGNET', qty: 100, remaining: 100 })
    expect(engine.state.materialLots[lotId].purchaseOrderId).toMatch(/^PO-/)
  })

  it('먼저 들어온 로트부터 쓰고, 두 로트에 걸치면 둘 다 제품에 기록한다', () => {
    const master = lotMaster((m) => {
      const magnet = m.materials.find((x) => x.id === 'MAGNET')!
      magnet.initialStock = 6 // 4개씩 쓰므로 두 번째 제품은 두 로트에 걸친다
      magnet.reorderPoint = 0
    })
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'EXPEDITE_MATERIAL', materialId: 'MAGNET', qty: 100 })
    engine.run(21 * 60) // 긴급 입고 후
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 3, release: true })
    engine.run(HOUR)

    const units = Object.values(engine.state.units)
    const magnetLots = (i: number) => units[i].materialLots.filter((l) => l.materialId === 'MAGNET')
    const second = engine.state.materials['MAGNET'].lots[0]
    expect(magnetLots(0)).toEqual([{ materialId: 'MAGNET', lotId: 'L-MAGNET-000', qty: 4 }])
    expect(magnetLots(1)).toEqual([
      { materialId: 'MAGNET', lotId: 'L-MAGNET-000', qty: 2 },
      { materialId: 'MAGNET', lotId: second, qty: 2 },
    ])
    expect(magnetLots(2)).toEqual([{ materialId: 'MAGNET', lotId: second, qty: 4 }])
    expect(engine.state.materialLots['L-MAGNET-000'].remaining).toBe(0)
    expectLotsMatchStock(engine.state)
  })

  it('자유 체험 8시간 동안 로트 남은 수량의 합이 늘 재고와 같다', () => {
    const engine = createScenarioEngine(freeScenario)
    for (let i = 0; i < 16; i++) {
      engine.run(HOUR / 2)
      expectLotsMatchStock(engine.state)
    }
    // 제품마다 BOM 수량만큼 로트가 기록된다(A: 하우징 1 + 코일 1 + 자석 4 + 베어링 2)
    const done = Object.values(engine.state.units).find((u) => u.status === 'COMPLETED' && u.itemId === 'MOTOR-A')!
    expect(done.materialLots.reduce((sum, l) => sum + l.qty, 0)).toBe(8)
  })
})
