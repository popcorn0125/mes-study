import { describe, expect, it } from 'vitest'
import type { MasterData } from '@/domain/types'
import { createBaselineMaster } from '@/scenarios/baseline'
import { STOCK_SAMPLE_INTERVAL, SimEngine } from './engine'

const HOUR = 3600

/** 불량·고장을 뺀 기준정보. 자재 제약만 본다. */
function materialMaster(adjust?: (master: MasterData) => void): MasterData {
  const master = createBaselineMaster()
  for (const routing of master.routings) for (const op of routing.operations) op.defectRate = 0
  for (const eq of master.equipment) delete eq.reliability
  adjust?.(master)
  return master
}

const material = (master: MasterData, id: string) => master.materials.find((m) => m.id === id)!
const assembly = (engine: SimEngine) => engine.state.equipment.find((eq) => eq.id === 'ASSEMBLY-1')!

describe('BOM 자재 소비', () => {
  it('가공을 시작할 때 해당 작업장의 BOM 수량만큼 차감한다', () => {
    const engine = new SimEngine(materialMaster(), { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-B', qty: 3, release: true })
    engine.run(HOUR)
    const stock = engine.state.materials
    expect(stock['HOUSING'].onHand).toBe(200 - 3)
    expect(stock['COIL'].onHand).toBe(200 - 3)
    expect(stock['MAGNET'].onHand).toBe(800 - 3 * 4)
    expect(stock['BEARING-PRM'].onHand).toBe(100 - 3 * 2)
    expect(stock['BEARING-STD'].onHand).toBe(300) // A 전용 자재는 쓰지 않는다
  })

  it('자재가 모자라면 설비는 STARVED_MATERIAL로 멈추고 Unit은 버퍼에 남는다', () => {
    const master = materialMaster((m) => {
      material(m, 'BEARING-PRM').initialStock = 6 // B 3개 분량
      material(m, 'BEARING-PRM').leadTime = 10 * HOUR // 정상 입고는 사실상 없음
    })
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-B', qty: 10, release: true })
    engine.run(2 * HOUR)

    expect(assembly(engine).status).toBe('STARVED_MATERIAL')
    expect(engine.state.workOrders[0].goodQty).toBe(3)
    expect(engine.state.buffers['ASSEMBLY'].length).toBeGreaterThan(0)
    expect(assembly(engine).statusTime.STARVED_MATERIAL).toBeGreaterThan(0)
    expect(engine.state.events.some((e) => e.type === 'MATERIAL_SHORTAGE' && e.refId === 'BEARING-PRM')).toBe(true)
    // 비가동 이력: 자재 부족 정지가 아직 진행 중인 기록으로 남는다
    expect(engine.state.downtimes.at(-1)).toMatchObject({ equipmentId: 'ASSEMBLY-1', reason: 'MATERIAL', end: null, expected: null })
  })

  it('FIFO 라인이라 맨 앞 Unit의 자재가 없으면 뒤의 다른 품목도 기다린다', () => {
    const master = materialMaster((m) => {
      material(m, 'BEARING-PRM').initialStock = 0
      material(m, 'BEARING-PRM').leadTime = 10 * HOUR
    })
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-B', qty: 1, release: true, priority: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 5, release: true })
    engine.run(HOUR)
    expect(engine.state.workOrders[1].goodQty).toBe(0)
    expect(assembly(engine).status).toBe('STARVED_MATERIAL')
  })
})

describe('발주', () => {
  it('재고 + 입고 예정이 발주점 이하면 자동 발주하고, 리드타임 뒤 입고된다', () => {
    const master = materialMaster((m) => {
      const housing = material(m, 'HOUSING')
      housing.initialStock = 101
      housing.reorderPoint = 100
      housing.reorderQty = 50
      housing.leadTime = 600
    })
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 2, release: true })
    engine.tick() // 1개 소비 → 100 → 발주
    const orders = engine.state.materials['HOUSING'].orders
    expect(orders).toHaveLength(1)
    expect(orders[0].eta).toBe(600)

    engine.run(600)
    expect(engine.state.materials['HOUSING'].orders).toHaveLength(0)
    expect(engine.state.materials['HOUSING'].onHand).toBe(100 - 1 + 50)
    expect(engine.state.events.some((e) => e.type === 'MATERIAL_RECEIVED')).toBe(true)
  })

  it('긴급 발주는 리드타임이 짧고 할증 비용이 쌓인다', () => {
    const master = materialMaster()
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'EXPEDITE_MATERIAL', materialId: 'BEARING-PRM', qty: 20 })
    engine.applyPendingCommands()
    const po = engine.state.materials['BEARING-PRM'].orders[0]
    const spec = material(master, 'BEARING-PRM')
    expect(po.expedited).toBe(true)
    expect(po.eta).toBe(spec.expediteLeadTime)
    expect(engine.state.costs.expediteSurcharge).toBe(20 * spec.unitCost * spec.expediteSurcharge)
  })

  it('S3: 자재 부족 시 긴급 발주하면 라인 정지 시간이 줄어든다', () => {
    const scenario = (expedite: boolean) => {
      const master = materialMaster((m) => {
        material(m, 'BEARING-PRM').initialStock = 10
        material(m, 'BEARING-PRM').reorderPoint = 0 // 자동 발주 없음
        material(m, 'BEARING-PRM').safetyStock = 0
      })
      const engine = new SimEngine(master, { seed: 1 })
      engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-B', qty: 30, release: true })
      if (expedite) engine.dispatch({ type: 'EXPEDITE_MATERIAL', materialId: 'BEARING-PRM', qty: 60 })
      engine.run(4 * HOUR)
      return { starved: assembly(engine).statusTime.STARVED_MATERIAL, completedAt: engine.state.workOrders[0].completedAt! }
    }
    const waited = scenario(false)
    const expedited = scenario(true)
    expect(expedited.starved).toBeLessThan(waited.starved)
    // 정상 입고(1.5시간)를 기다리면 작업지시가 그만큼 늦게 끝난다
    expect(expedited.completedAt).toBeLessThan(waited.completedAt)
  })

  it('알 수 없는 자재·설비나 잘못된 수량은 거부한다', () => {
    const engine = new SimEngine(materialMaster(), { seed: 1 })
    expect(() => engine.dispatch({ type: 'EXPEDITE_MATERIAL', materialId: 'NOPE', qty: 1 })).toThrow()
    expect(() => engine.dispatch({ type: 'EXPEDITE_MATERIAL', materialId: 'COIL', qty: 0 })).toThrow()
    expect(() => engine.dispatch({ type: 'REQUEST_MAINTENANCE', equipmentId: 'NOPE' })).toThrow()
  })
})

describe('안전재고 · 발주 대장 · 재고 이력', () => {
  it('재고가 안전재고 이하로 처음 내려갈 때 한 번 경고하고, 입고로 회복하면 다시 경고할 수 있다', () => {
    const master = materialMaster((m) => {
      const housing = material(m, 'HOUSING')
      housing.initialStock = 6
      housing.safetyStock = 4
      housing.reorderPoint = 4
      housing.reorderQty = 10
      housing.leadTime = 1800
    })
    const engine = new SimEngine(master, { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 20, release: true })
    const warnings = () => engine.state.events.filter((e) => e.type === 'MATERIAL_BELOW_SAFETY')
    engine.run(1200) // 6 → 4 이하로 내려간 뒤에도 계속 소비
    expect(warnings()).toHaveLength(1)
    expect(warnings()[0]).toMatchObject({ refId: 'HOUSING', severity: 'warning' })
    engine.run(HOUR) // 입고(10개)로 안전재고 위로 회복 → 다시 내려감
    expect(warnings()).toHaveLength(2)
  })

  it('안전재고가 음수이거나 발주점보다 크면 기준정보 오류다', () => {
    const tooBig = materialMaster((m) => {
      material(m, 'COIL').safetyStock = material(m, 'COIL').reorderPoint + 1
    })
    expect(() => new SimEngine(tooBig, { seed: 1 })).toThrow(/안전재고/)
    const negative = materialMaster((m) => {
      material(m, 'COIL').safetyStock = -1
    })
    expect(() => new SimEngine(negative, { seed: 1 })).toThrow(/안전재고/)
  })

  it('발주 대장에 입고 완료 발주도 남고, 입고 시각과 만든 로트를 기록한다', () => {
    const engine = new SimEngine(materialMaster(), { seed: 1 })
    engine.dispatch({ type: 'EXPEDITE_MATERIAL', materialId: 'COIL', qty: 30 })
    engine.applyPendingCommands()
    const po = engine.state.purchaseOrders[0]
    expect(po).toMatchObject({ materialId: 'COIL', qty: 30, expedited: true, receivedAt: null, lotId: null })
    engine.run(po.eta + 1)
    expect(engine.state.materials['COIL'].orders).toHaveLength(0)
    expect(engine.state.purchaseOrders).toHaveLength(1)
    expect(po.receivedAt).toBe(po.eta)
    expect(engine.state.materialLots[po.lotId!]).toMatchObject({ qty: 30, purchaseOrderId: po.id })
  })

  it('누적 소비량은 쓴 수량의 합이고, 1분마다 재고 · 누적 소비를 기록한다', () => {
    const engine = new SimEngine(materialMaster(), { seed: 1 })
    engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty: 5, release: true })
    engine.run(HOUR)
    const stocks = engine.state.materials
    expect(stocks['MAGNET'].consumed).toBe(5 * 4)
    expect(stocks['BEARING-STD'].consumed).toBe(5 * 2)
    expect(stocks['BEARING-PRM'].consumed).toBe(0)

    const history = engine.state.stockHistory
    expect(history[0]).toMatchObject({ time: 0, onHand: { HOUSING: 200 }, consumed: { HOUSING: 0 } })
    expect(history).toHaveLength(HOUR / STOCK_SAMPLE_INTERVAL + 1)
    expect(history.every((s, i) => s.time === i * STOCK_SAMPLE_INTERVAL)).toBe(true)
    expect(history.at(-1)).toMatchObject({ time: HOUR, onHand: { MAGNET: 800 - 20 }, consumed: { MAGNET: 20 } })
  })
})
