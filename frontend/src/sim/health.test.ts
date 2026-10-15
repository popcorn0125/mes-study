import { describe, expect, it } from 'vitest'
import type { MasterData } from '@/domain/types'
import { oee } from '@/domain/kpi'
import { createBaselineMaster } from '@/scenarios/baseline'
import { SimEngine } from './engine'
import { WEAR_AFTER_REPAIR } from './failure'

const HOUR = 3600

/** 불량·자재 제약을 빼고, CNC만 마모·고장이 일어나는 기준정보 */
function cncOnlyMaster(initialWear: number, wearPerRunHour = 0.25): MasterData {
  const master = createBaselineMaster()
  for (const routing of master.routings) for (const op of routing.operations) op.defectRate = 0
  master.bom = []
  for (const eq of master.equipment) {
    if (eq.id === 'MACHINING-1') {
      eq.reliability = { ...eq.reliability!, initialWear, wearPerRunHour, wearDefectRate: 0 }
    } else {
      delete eq.reliability
    }
  }
  return master
}

function start(master: MasterData, qty = 500, seed = 1): SimEngine {
  const engine = new SimEngine(master, { seed })
  engine.dispatch({ type: 'CREATE_WORK_ORDER', itemId: 'MOTOR-A', qty, release: true })
  return engine
}

const cnc = (engine: SimEngine) => engine.state.equipment.find((eq) => eq.id === 'MACHINING-1')!

describe('마모와 센서', () => {
  it('마모는 가동 중에만 쌓인다', () => {
    const idle = new SimEngine(cncOnlyMaster(0.3), { seed: 1 })
    idle.run(HOUR)
    expect(cnc(idle).wear).toBe(0.3)

    const busy = start(cncOnlyMaster(0.3))
    busy.run(HOUR)
    expect(cnc(busy).wear).toBeGreaterThan(0.3 + 0.25 * 0.9) // 1시간 중 거의 대부분 가동
  })

  it('마모가 진행되면 센서가 경고 → 위험으로 올라가고 이벤트를 남긴다', () => {
    const engine = start(cncOnlyMaster(0.6))
    let sawWarningBeforeCritical = false
    for (let i = 0; i < 2 * HOUR && cnc(engine).status !== 'DOWN'; i++) {
      engine.tick()
      if (cnc(engine).sensor!.level === 'WARNING') sawWarningBeforeCritical = true
    }
    const types = engine.state.events.map((e) => e.type)
    expect(sawWarningBeforeCritical).toBe(true)
    expect(types).toContain('SENSOR_WARNING')
    expect(types.indexOf('SENSOR_WARNING')).toBeLessThan(types.indexOf('EQUIPMENT_DOWN'))
  })

  it('센서 이력은 30초 간격으로 최근 1시간만 보관한다', () => {
    const engine = start(cncOnlyMaster(0.1))
    engine.run(2 * HOUR)
    const history = cnc(engine).sensorHistory
    expect(history).toHaveLength(120)
    expect(history[1].time - history[0].time).toBe(30)
  })
})

describe('고장과 수리', () => {
  it('마모도 1이면 고장나고, 가공 중이던 Unit은 수리 후 이어서 가공한다', () => {
    const engine = start(cncOnlyMaster(0.999, 10))
    engine.run(5)
    const eq = cnc(engine)
    expect(eq.status).toBe('DOWN')
    const unitDuringRepair = eq.unitId
    expect(unitDuringRepair).not.toBeNull()
    expect(engine.state.events.some((e) => e.type === 'EQUIPMENT_DOWN')).toBe(true)

    let waited = 0
    while (eq.status === 'DOWN') {
      engine.tick()
      waited++
    }
    expect(waited).toBeLessThanOrEqual(20 * 60)
    // 수리 직후 마모도는 수리 후 값으로 돌아간다(같은 tick에 다시 가동하며 쌓인 1초분만 허용)
    expect(eq.wear).toBeLessThanOrEqual(WEAR_AFTER_REPAIR + 10 / 3600)
    expect(engine.state.events.some((e) => e.type === 'EQUIPMENT_REPAIRED')).toBe(true)
    expect(eq.unitId).toBe(unitDuringRepair) // 같은 Unit을 이어서 가공
    expect(eq.status).toBe('RUN')
    engine.run(60)
    expect(engine.state.units[unitDuringRepair!].history[0]?.equipmentId).toBe('MACHINING-1')
    expect(eq.statusTime.DOWN).toBe(20 * 60)
    expect(oee(eq).availability).toBeLessThan(1)
  })
})

describe('예방정비', () => {
  it('가공 중에 요청하면 현재 Unit을 마친 뒤 PM에 들어가고, 끝나면 마모도가 0이 된다', () => {
    const engine = start(cncOnlyMaster(0.5))
    engine.run(10)
    expect(cnc(engine).status).toBe('RUN')
    engine.dispatch({ type: 'REQUEST_MAINTENANCE', equipmentId: 'MACHINING-1' })
    engine.tick()
    expect(cnc(engine).status).toBe('RUN') // 아직 가공 중
    engine.run(40)
    expect(cnc(engine).status).toBe('PM')
    engine.run(5 * 60)
    expect(cnc(engine).status).not.toBe('PM')
    expect(cnc(engine).wear).toBeLessThan(0.01)
    expect(engine.state.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['MAINTENANCE_REQUESTED', 'MAINTENANCE_STARTED', 'MAINTENANCE_DONE']),
    )
  })

  it('예방정비(계획 정지)는 OEE 가용성을 떨어뜨리지 않는다', () => {
    const engine = start(cncOnlyMaster(0.1))
    engine.dispatch({ type: 'REQUEST_MAINTENANCE', equipmentId: 'MACHINING-1' })
    engine.run(HOUR)
    expect(cnc(engine).statusTime.PM).toBe(5 * 60)
    expect(oee(cnc(engine)).availability).toBe(1)
  })

  it('S2: 전조를 무시하면 예방정비보다 총 정지 시간이 길다', () => {
    const scenario = (maintainEarly: boolean) => {
      const engine = start(cncOnlyMaster(0.6, 0.2), 1000)
      if (maintainEarly) engine.dispatch({ type: 'REQUEST_MAINTENANCE', equipmentId: 'MACHINING-1' })
      engine.run(3 * HOUR)
      const eq = cnc(engine)
      return { stopped: eq.statusTime.DOWN + eq.statusTime.PM, failures: eq.failureCount, good: engine.state.counters.completed }
    }
    const ignored = scenario(false)
    const maintained = scenario(true)
    expect(ignored.failures).toBeGreaterThan(0)
    expect(maintained.failures).toBe(0)
    expect(ignored.stopped).toBeGreaterThan(maintained.stopped)
    expect(maintained.good).toBeGreaterThan(ignored.good)
  })
})
