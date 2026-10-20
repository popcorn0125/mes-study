import { DISPATCH_RULE_LABEL, compareForDispatch } from '@/domain/dispatch'
import { equipmentName } from '@/domain/equipment'
import type {
  DefectCause,
  DefectCode,
  DowntimeReason,
  DowntimeRecord,
  Equipment,
  EquipmentCounters,
  EquipmentRuntime,
  EquipmentStatus,
  MasterData,
  Material,
  MaterialLot,
  Operation,
  ProductionPlan,
  PurchaseOrder,
  Routing,
  SimEvent,
  SimState,
  StockSample,
  Unit,
  WorkOrder,
} from '@/domain/types'
import type { SimCommand } from './commands'
import { WEAR_AFTER_REPAIR, failureHazard, wearDefectRate } from './failure'
import { sampleRepairTime } from './repair'
import { createRng } from './rng'
import {
  SENSOR_HISTORY_SIZE,
  SENSOR_SAMPLE_INTERVAL,
  clearVibrationAlarm,
  initialReading,
  isWorse,
  nextReading,
} from './sensors'

const MAX_EVENTS = 200
const MAX_DOWNTIMES = 200
/** 재고 이력 기록 간격(초)과 보관 개수(24시간분) */
export const STOCK_SAMPLE_INTERVAL = 60
export const STOCK_HISTORY_SIZE = 24 * 60
/** 설비 누적값 기록 간격(초)과 보관 개수(7일분) */
export const EQUIPMENT_SAMPLE_INTERVAL = 3600
export const EQUIPMENT_HISTORY_SIZE = 7 * 24

/** 난수 스트림을 용도별로 나눠, 한 영역의 변경이 다른 영역의 결과를 흔들지 않게 한다. */
const FAILURE_SEED_OFFSET = 0x9e3779b9
const SENSOR_SEED_OFFSET = 0x85ebca6b
const REPAIR_SEED_OFFSET = 0xc2b2ae35
const QUALITY_SEED_OFFSET = 0x27d4eb2f

/** 설비 상태 → 비가동 이력 사유. 여기 없는 상태는 기록하지 않는다. */
const DOWNTIME_REASON: Partial<Record<EquipmentStatus, DowntimeReason>> = {
  DOWN: 'BREAKDOWN',
  PM: 'PM',
  STARVED_MATERIAL: 'MATERIAL',
}

export interface SimOptions {
  seed: number
}

/**
 * 헤드리스 시뮬레이션 엔진. Vue/three 의존이 없어 테스트에서 그대로 돌릴 수 있다.
 *
 * tick 처리 순서
 *  1. 대기 중인 명령 적용
 *  2. 자재 입고(도착 예정 시각이 된 발주)
 *  3. 설비 상태 갱신: 수리·정비 진행, 마모 누적, 센서 갱신, 고장 판정
 *  4. 가공 완료 처리(하류 설비부터): 품질 판정 → 재작업 유형이면 같은 설비에서 한 번 다시 가공, 그 밖의 불량은 폐기,
 *     양품은 다음 버퍼로(가득 차 있으면 BLOCKED)
 *  5. 작업지시 투입: 투입 순서 규칙(dispatchRule)대로, 첫 공정 버퍼에 빈자리가 있는 만큼 Unit 생성
 *  6. 가공 시작: 정비 요청이 있으면 PM, BOM 자재가 있으면 차감 후 가공, 없으면 STARVED_MATERIAL
 *  7. 자동 발주: 재고 + 입고 예정이 발주점 이하인 자재
 *  8. 비가동 이력 갱신, 설비 상태별 누적 시간 기록 후 시계 진행, 1분마다 재고 · 1시간마다 설비 누적값 기록
 */
export class SimEngine {
  readonly master: MasterData
  readonly state: SimState

  private readonly rng: () => number
  private readonly failureRng: () => number
  private readonly sensorRng: () => number
  private readonly repairRng: () => number
  /** 불량 유형 선택 전용. 불량 여부 판정(rng)과 나눠 유형을 고르는 것이 생산 결과를 바꾸지 않게 한다. */
  private readonly qualityRng: () => number
  private readonly routings = new Map<string, Routing>()
  private readonly workCenterOrder = new Map<string, number>()
  private readonly materials = new Map<string, Material>()
  /** "작업장|원인" → 불량 유형 목록 */
  private readonly defectCodes = new Map<string, DefectCode[]>()
  /** 설비 id → 센서·신뢰성 규격. 실행 중 추가된 설비는 같은 작업장 설비의 규격을 물려받는다. */
  private readonly equipmentSpecs = new Map<string, Equipment>()
  private queue: SimCommand[] = []
  private nextWorkOrderSeq = 1
  private nextUnitSeq = 1
  private nextPurchaseOrderSeq = 1
  private nextPlanSeq = 1
  private nextDowntimeSeq = 1
  private nextLotSeq = 1
  /** 설비 id → 진행 중인 비가동 기록 */
  private readonly openDowntimes = new Map<string, DowntimeRecord>()

  constructor(master: MasterData, options: SimOptions) {
    this.master = master
    this.rng = createRng(options.seed)
    this.failureRng = createRng(options.seed ^ FAILURE_SEED_OFFSET)
    this.sensorRng = createRng(options.seed ^ SENSOR_SEED_OFFSET)
    this.repairRng = createRng(options.seed ^ REPAIR_SEED_OFFSET)
    this.qualityRng = createRng(options.seed ^ QUALITY_SEED_OFFSET)

    master.workCenters.forEach((wc, i) => this.workCenterOrder.set(wc.id, i))
    for (const routing of master.routings) {
      for (const op of routing.operations) {
        if (!this.workCenterOrder.has(op.workCenterId)) {
          throw new Error(`라우팅 ${routing.itemId}의 공정 ${op.seq}: 알 수 없는 작업장 ${op.workCenterId}`)
        }
      }
      this.routings.set(routing.itemId, routing)
    }
    for (const material of master.materials) {
      if (!(material.safetyStock >= 0 && material.safetyStock <= material.reorderPoint)) {
        throw new Error(`자재 ${material.id}: 안전재고는 0 이상, 발주점 이하여야 합니다`)
      }
      this.materials.set(material.id, material)
    }
    for (const line of master.bom) {
      if (!this.materials.has(line.materialId)) throw new Error(`BOM: 알 수 없는 자재 ${line.materialId}`)
      if (!this.workCenterOrder.has(line.workCenterId)) throw new Error(`BOM: 알 수 없는 작업장 ${line.workCenterId}`)
    }
    for (const eq of master.equipment) this.equipmentSpecs.set(eq.id, eq)
    this.loadDefectCodes(master)

    const lots: Record<string, MaterialLot> = {}
    for (const m of master.materials) {
      if (m.initialStock <= 0) continue
      const id = `L-${m.id}-000`
      lots[id] = { id, materialId: m.id, qty: m.initialStock, remaining: m.initialStock, receivedAt: 0, purchaseOrderId: null }
    }

    this.state = {
      time: 0,
      workOrders: [],
      units: {},
      buffers: Object.fromEntries(master.workCenters.map((wc) => [wc.id, []])),
      equipment: master.equipment.map((eq) => createEquipmentRuntime(eq)),
      cycleTimeOverride: {},
      materials: Object.fromEntries(
        master.materials.map((m) => [
          m.id,
          {
            materialId: m.id,
            onHand: m.initialStock,
            lots: m.initialStock > 0 ? [`L-${m.id}-000`] : [],
            orders: [],
            consumed: 0,
          },
        ]),
      ),
      records: [],
      events: [],
      counters: { released: 0, completed: 0, scrapped: 0, wipSeconds: 0 },
      costs: { expediteSurcharge: 0 },
      plan: null,
      downtimes: [],
      dispatchRule: 'PRIORITY',
      materialLots: lots,
      purchaseOrders: [],
      stockHistory: [],
      equipmentHistory: [],
    }
    this.recordStock()
    this.recordEquipment()
  }

  /** 명령을 큐에 넣는다. 존재하지 않는 대상을 가리키면 즉시 예외를 던진다. */
  dispatch(command: SimCommand): void {
    switch (command.type) {
      case 'SET_PRODUCTION_PLAN': {
        const { plan } = command
        if (!(plan.duration > 0)) throw new Error('계획 기간은 0보다 커야 합니다')
        if (plan.lines.length === 0) throw new Error('계획에 품목이 없습니다')
        for (const line of plan.lines) {
          if (!this.routings.has(line.itemId)) throw new Error(`라우팅이 없는 품목: ${line.itemId}`)
          if (!(line.targetQty > 0)) throw new Error('계획 수량은 0보다 커야 합니다')
        }
        break
      }
      case 'CREATE_WORK_ORDER':
        if (!this.routings.has(command.itemId)) throw new Error(`라우팅이 없는 품목: ${command.itemId}`)
        if (!(command.qty > 0)) throw new Error('작업지시 수량은 0보다 커야 합니다')
        break
      case 'RELEASE_WORK_ORDER':
      case 'HOLD_WORK_ORDER':
      case 'SET_WORK_ORDER_PRIORITY':
        if (!this.findWorkOrder(command.workOrderId) && !this.isQueuedWorkOrderId(command.workOrderId)) {
          throw new Error(`알 수 없는 작업지시: ${command.workOrderId}`)
        }
        break
      case 'SET_DISPATCH_RULE':
        if (!DISPATCH_RULE_LABEL[command.rule]) throw new Error(`알 수 없는 투입 순서 규칙: ${command.rule}`)
        break
      case 'SET_CYCLE_TIME':
        this.requireWorkCenter(command.workCenterId)
        if (!(command.cycleTime > 0)) throw new Error('사이클타임은 0보다 커야 합니다')
        break
      case 'ADD_EQUIPMENT':
        this.requireWorkCenter(command.workCenterId)
        break
      case 'REQUEST_MAINTENANCE':
        if (!this.findEquipment(command.equipmentId)) throw new Error(`알 수 없는 설비: ${command.equipmentId}`)
        if (!this.equipmentSpecs.get(command.equipmentId)?.reliability) {
          throw new Error('정비 정보가 없는 설비입니다')
        }
        break
      case 'EXPEDITE_MATERIAL':
        if (!this.materials.has(command.materialId)) throw new Error(`알 수 없는 자재: ${command.materialId}`)
        if (!(command.qty > 0)) throw new Error('발주 수량은 0보다 커야 합니다')
        break
    }
    this.queue.push(command)
  }

  tick(dt = 1): void {
    this.applyPendingCommands()
    this.receiveMaterials()
    this.updateEquipmentHealth(dt)
    this.finishProcessing(dt)
    this.releaseWorkOrders()
    this.startProcessing()
    this.replenishMaterials()
    this.trackDowntimes()
    for (const eq of this.state.equipment) eq.statusTime[eq.status] += dt
    const { released, completed, scrapped } = this.state.counters
    this.state.counters.wipSeconds += (released - completed - scrapped) * dt
    this.state.time += dt
    if (this.state.time % STOCK_SAMPLE_INTERVAL === 0) this.recordStock()
    if (this.state.time % EQUIPMENT_SAMPLE_INTERVAL === 0) this.recordEquipment()
  }

  /** seconds초 동안 1초 단위로 진행한다. */
  run(seconds: number): void {
    for (let i = 0; i < seconds; i++) this.tick()
  }

  // ── 1. 명령 ─────────────────────────────────────────────

  /** 대기 중인 명령을 시간 진행 없이 적용한다. tick 시작 시 호출되며, 일시정지 중 즉시 반영할 때도 쓴다. */
  applyPendingCommands(): void {
    const commands = this.queue
    this.queue = []
    for (const command of commands) {
      switch (command.type) {
        case 'SET_PRODUCTION_PLAN': {
          const plan: ProductionPlan = {
            ...command.plan,
            lines: command.plan.lines.map((line) => ({ ...line })),
            id: formatPlanId(this.nextPlanSeq++),
          }
          this.state.plan = plan
          const total = plan.lines.reduce((sum, line) => sum + line.targetQty, 0)
          const detail = plan.lines.map((line) => `${line.itemId} ${line.targetQty}`).join(' · ')
          this.emit('PLAN_SET', plan.id, 'info', `생산 계획 ${plan.id} 설정: ${total}대 (${detail})`)
          break
        }
        case 'CREATE_WORK_ORDER': {
          const wo: WorkOrder = {
            id: formatWorkOrderId(this.nextWorkOrderSeq++),
            itemId: command.itemId,
            qty: command.qty,
            priority: command.priority ?? 0,
            dueTime: command.dueTime ?? null,
            status: 'PLANNED',
            statusBeforeHold: null,
            releasedQty: 0,
            goodQty: 0,
            scrapQty: 0,
            reworkQty: 0,
            createdAt: this.state.time,
            releasedAt: null,
            startedAt: null,
            completedAt: null,
          }
          this.state.workOrders.push(wo)
          this.emit('WORK_ORDER_CREATED', wo.id, 'info', `작업지시 ${wo.id} 생성 (${wo.itemId} × ${wo.qty})`)
          if (command.release) this.releaseWorkOrder(wo)
          break
        }
        case 'RELEASE_WORK_ORDER': {
          const wo = this.findWorkOrder(command.workOrderId)
          if (wo) this.releaseWorkOrder(wo)
          break
        }
        case 'HOLD_WORK_ORDER': {
          const wo = this.findWorkOrder(command.workOrderId)
          if (!wo || (wo.status !== 'RELEASED' && wo.status !== 'IN_PROGRESS')) break
          wo.statusBeforeHold = wo.status
          wo.status = 'HELD'
          this.emit('WORK_ORDER_HELD', wo.id, 'warning', `작업지시 ${wo.id} 보류 — 신규 투입 중단`)
          break
        }
        case 'SET_WORK_ORDER_PRIORITY': {
          const wo = this.findWorkOrder(command.workOrderId)
          if (!wo || wo.status === 'COMPLETED' || wo.priority === command.priority) break
          wo.priority = command.priority
          this.emit('WORK_ORDER_PRIORITY_CHANGED', wo.id, 'info', `작업지시 ${wo.id} 우선순위 ${command.priority}로 변경`)
          break
        }
        case 'SET_DISPATCH_RULE':
          if (this.state.dispatchRule === command.rule) break
          this.state.dispatchRule = command.rule
          this.emit('DISPATCH_RULE_CHANGED', command.rule, 'info', `투입 순서 규칙: ${DISPATCH_RULE_LABEL[command.rule]}`)
          break
        case 'SET_CYCLE_TIME':
          this.state.cycleTimeOverride[command.workCenterId] = command.cycleTime
          this.emit(
            'CYCLE_TIME_CHANGED',
            command.workCenterId,
            'info',
            `${this.workCenterName(command.workCenterId)} 사이클타임 ${command.cycleTime}초로 변경`,
          )
          break
        case 'ADD_EQUIPMENT': {
          const count = this.state.equipment.filter((eq) => eq.workCenterId === command.workCenterId).length
          const id = `${command.workCenterId}-${count + 1}`
          // 같은 작업장 기존 설비의 센서·신뢰성 규격을 물려받는다(새 설비이므로 마모도는 0에서 시작).
          const sibling = this.master.equipment.find((eq) => eq.workCenterId === command.workCenterId)
          const spec: Equipment = {
            id,
            name: equipmentName(this.master, id),
            workCenterId: command.workCenterId,
            sensor: sibling?.sensor,
            reliability: sibling?.reliability && { ...sibling.reliability, initialWear: 0 },
          }
          this.equipmentSpecs.set(id, spec)
          this.state.equipment.push(createEquipmentRuntime(spec))
          this.emit('EQUIPMENT_ADDED', id, 'info', `${this.workCenterName(command.workCenterId)}에 ${spec.name} 추가`)
          break
        }
        case 'REQUEST_MAINTENANCE': {
          const eq = this.findEquipment(command.equipmentId)!
          if (eq.maintenanceRequested || eq.status === 'PM' || eq.status === 'DOWN') break
          eq.maintenanceRequested = true
          this.emit(
            'MAINTENANCE_REQUESTED',
            eq.id,
            'info',
            `${this.equipmentName(eq.id)} 예방정비 요청${eq.unitId ? ' — 현재 Unit 완료 후 시작' : ''}`,
          )
          break
        }
        case 'EXPEDITE_MATERIAL': {
          const material = this.materials.get(command.materialId)!
          const surcharge = command.qty * material.unitCost * material.expediteSurcharge
          this.state.costs.expediteSurcharge += surcharge
          this.placeOrder(material, command.qty, true)
          break
        }
      }
    }
  }

  /** PLANNED면 하달, HELD면 보류 전 상태로 되돌린다. 그 외 상태는 무시한다. */
  private releaseWorkOrder(wo: WorkOrder): void {
    if (wo.status === 'PLANNED') {
      wo.status = 'RELEASED'
      wo.releasedAt = this.state.time
    } else if (wo.status === 'HELD') {
      wo.status = wo.statusBeforeHold ?? 'RELEASED'
      wo.statusBeforeHold = null
    } else {
      return
    }
    this.emit('WORK_ORDER_RELEASED', wo.id, 'info', `작업지시 ${wo.id} 하달`)
  }

  // ── 2. 자재 입고 ────────────────────────────────────────

  private receiveMaterials(): void {
    for (const stock of Object.values(this.state.materials)) {
      if (stock.orders.length === 0) continue
      const arrived = stock.orders.filter((po) => po.eta <= this.state.time)
      if (arrived.length === 0) continue
      stock.orders = stock.orders.filter((po) => po.eta > this.state.time)
      for (const po of arrived) {
        stock.onHand += po.qty
        const lot: MaterialLot = {
          id: `L-${String(this.nextLotSeq++).padStart(4, '0')}`,
          materialId: stock.materialId,
          qty: po.qty,
          remaining: po.qty,
          receivedAt: this.state.time,
          purchaseOrderId: po.id,
        }
        this.state.materialLots[lot.id] = lot
        stock.lots.push(lot.id)
        po.receivedAt = this.state.time
        po.lotId = lot.id
        const material = this.materials.get(stock.materialId)!
        this.emit(
          'MATERIAL_RECEIVED',
          material.id,
          'info',
          `${material.name} ${po.qty}${material.unit} 입고${po.expedited ? ' (긴급)' : ''} — 재고 ${stock.onHand}`,
        )
      }
    }
  }

  // ── 3. 설비 상태: 수리·정비, 마모, 센서, 고장 ───────────

  private updateEquipmentHealth(dt: number): void {
    for (const eq of this.state.equipment) {
      const spec = this.equipmentSpecs.get(eq.id)
      const reliability = spec?.reliability

      if (eq.status === 'DOWN' || eq.status === 'PM') {
        eq.downRemaining = Math.max(0, eq.downRemaining - dt)
        if (eq.downRemaining === 0) this.finishDowntime(eq)
      }

      const running = eq.status === 'RUN'
      if (running && reliability) {
        eq.wear = Math.min(1, eq.wear + (reliability.wearPerRunHour * dt) / 3600)
      }

      if (spec?.sensor && eq.sensor) {
        const prevLevel = eq.sensor.level
        eq.sensor = nextReading(spec.sensor, eq.sensor, eq.wear, running, dt, this.sensorRng())
        if (isWorse(eq.sensor.level, prevLevel)) {
          const critical = eq.sensor.level === 'CRITICAL'
          const which = eq.sensor.vibrationLevel === eq.sensor.level ? '진동' : '온도'
          const value =
            which === '진동' ? `${eq.sensor.vibration.toFixed(1)}mm/s` : `${eq.sensor.temperature.toFixed(0)}°C`
          this.emit(
            critical ? 'SENSOR_CRITICAL' : 'SENSOR_WARNING',
            eq.id,
            critical ? 'critical' : 'warning',
            `${this.equipmentName(eq.id)} ${which} ${critical ? '위험' : '경고'} ${value}`,
          )
        }
        if (this.state.time % SENSOR_SAMPLE_INTERVAL === 0) {
          eq.sensorHistory.push({
            time: this.state.time,
            temperature: eq.sensor.temperature,
            vibration: eq.sensor.vibration,
          })
          if (eq.sensorHistory.length > SENSOR_HISTORY_SIZE) eq.sensorHistory.shift()
        }
      }

      // 고장은 가동 중에만 일어난다. 가공 중이던 Unit은 설비에 남아 수리 후 이어서 가공한다.
      if (running && reliability && this.failureRng() < failureHazard(eq.wear) * dt) {
        // 실제 수리 시간은 고장마다 다르다. 고장 직후에는 표준(예상) 시간만 알린다.
        eq.status = 'DOWN'
        eq.downRemaining = sampleRepairTime(reliability.repairTime, this.repairRng())
        eq.failureCount++
        this.emit(
          'EQUIPMENT_DOWN',
          eq.id,
          'critical',
          `${this.equipmentName(eq.id)} 고장 — 수리 약 ${Math.round(reliability.repairTime / 60)}분 예상`,
        )
      }
    }
  }

  private finishDowntime(eq: EquipmentRuntime): void {
    if (eq.sensor) eq.sensor = clearVibrationAlarm(eq.sensor)
    if (eq.status === 'DOWN') {
      eq.wear = Math.min(eq.wear, WEAR_AFTER_REPAIR)
      this.emit('EQUIPMENT_REPAIRED', eq.id, 'info', `${this.equipmentName(eq.id)} 수리 완료`)
    } else {
      eq.wear = 0
      eq.maintenanceRequested = false
      this.emit('MAINTENANCE_DONE', eq.id, 'info', `${this.equipmentName(eq.id)} 예방정비 완료 — 마모도 초기화`)
    }
    // 가공 중이던 Unit이 있으면 이어서 가공하거나(BLOCKED였으면) 다시 이동을 시도한다.
    // Unit이 없으면 이번 tick의 가공 시작 단계에서 상태가 정해진다.
    eq.status = eq.unitId ? (eq.remaining > 0 ? 'RUN' : 'BLOCKED') : 'IDLE'
  }

  // ── 4. 가공 완료 ────────────────────────────────────────

  private finishProcessing(dt: number): void {
    // 하류 설비가 먼저 비워져야 같은 tick 안에 상류 Unit이 이동할 수 있다.
    const downstreamFirst = [...this.state.equipment].sort(
      (a, b) => this.workCenterOrder.get(b.workCenterId)! - this.workCenterOrder.get(a.workCenterId)!,
    )
    for (const eq of downstreamFirst) {
      if (!eq.unitId || eq.status === 'DOWN' || eq.status === 'PM') continue
      const unit = this.state.units[eq.unitId]

      if (eq.status === 'RUN') {
        eq.remaining = Math.max(0, eq.remaining - dt)
        if (eq.remaining > 0) continue

        const op = this.currentOperation(unit)
        // 난수 한 번으로 불량 여부를 정하고, 그 값이 공정 불량률 안이면 공정 산포, 넘으면 설비 마모 불량으로 본다.
        const draw = this.rng()
        const wearRate = wearDefectRate(eq.wear, this.equipmentSpecs.get(eq.id)?.reliability)
        const result = draw < op.defectRate + wearRate ? 'DEFECT' : 'GOOD'
        const defect = result === 'DEFECT' ? this.pickDefectCode(op.workCenterId, draw < op.defectRate ? 'PROCESS' : 'WEAR') : null
        const rework = unit.history.some((h) => h.opSeq === op.seq)
        eq.processedCount++
        eq.standardTime += op.cycleTime
        unit.history.push({
          opSeq: op.seq,
          equipmentId: eq.id,
          start: eq.startedAt,
          end: this.state.time,
          result,
          defectCode: defect?.id ?? null,
          rework,
        })
        this.state.records.push({
          unitId: unit.id,
          workOrderId: unit.workOrderId,
          opSeq: op.seq,
          equipmentId: eq.id,
          result,
          defectCode: defect?.id ?? null,
          rework,
          time: this.state.time,
        })
        if (result === 'DEFECT') {
          eq.defectCount++
          if (defect!.disposition === 'REWORK' && !rework) {
            // 재작업: 같은 설비에서 한 번 다시 가공한다. 그동안 설비는 새 제품을 받지 못한다(숨은 공장).
            this.findWorkOrder(unit.workOrderId)!.reworkQty++
            eq.startedAt = this.state.time
            eq.remaining = this.cycleTimeOf(unit)
            continue
          }
          eq.unitId = null
          this.scrap(unit, op, defect!)
          continue
        }
      }

      // 양품: RUN에서 막 끝났거나, BLOCKED 상태에서 재시도
      if (this.moveToNextOperation(unit)) {
        eq.unitId = null
      } else {
        eq.status = 'BLOCKED'
      }
    }
  }

  /** 다음 공정 버퍼로 옮기거나 마지막 공정이면 완료 처리한다. 버퍼가 가득 차면 false. */
  private moveToNextOperation(unit: Unit): boolean {
    const operations = this.routings.get(unit.itemId)!.operations
    const nextIndex = unit.opIndex + 1
    if (nextIndex >= operations.length) {
      unit.opIndex = nextIndex
      this.complete(unit)
      return true
    }
    const nextWorkCenterId = operations[nextIndex].workCenterId
    if (!this.hasBufferSpace(nextWorkCenterId)) return false
    unit.opIndex = nextIndex
    unit.status = 'QUEUED'
    this.state.buffers[nextWorkCenterId].push(unit.id)
    return true
  }

  private complete(unit: Unit): void {
    unit.status = 'COMPLETED'
    unit.finishedAt = this.state.time
    this.state.counters.completed++
    const wo = this.findWorkOrder(unit.workOrderId)!
    wo.goodQty++
    this.closeWorkOrderIfDone(wo)
  }

  private scrap(unit: Unit, op: Operation, defect: DefectCode): void {
    unit.status = 'SCRAPPED'
    unit.finishedAt = this.state.time
    this.state.counters.scrapped++
    const wo = this.findWorkOrder(unit.workOrderId)!
    wo.scrapQty++
    this.emit(
      'UNIT_SCRAPPED',
      unit.id,
      'warning',
      `${unit.id} 불량 폐기 — ${defect.name} (${this.workCenterName(op.workCenterId)})`,
    )
    this.closeWorkOrderIfDone(wo)
  }

  /** 지시 수량이 모두 양품 또는 폐기로 끝나면 작업지시를 완료한다. 폐기분은 재투입하지 않는다. */
  private closeWorkOrderIfDone(wo: WorkOrder): void {
    if (wo.goodQty + wo.scrapQty < wo.qty) return
    wo.status = 'COMPLETED'
    wo.completedAt = this.state.time
    this.emit(
      'WORK_ORDER_COMPLETED',
      wo.id,
      'info',
      `작업지시 ${wo.id} 완료 (양품 ${wo.goodQty} / 불량 ${wo.scrapQty})`,
    )
  }

  // ── 5. 투입 ─────────────────────────────────────────────

  private releaseWorkOrders(): void {
    const candidates = this.state.workOrders
      .filter((wo) => (wo.status === 'RELEASED' || wo.status === 'IN_PROGRESS') && wo.releasedQty < wo.qty)
      .sort(compareForDispatch(this.state.dispatchRule))

    for (const wo of candidates) {
      const firstWorkCenterId = this.routings.get(wo.itemId)!.operations[0].workCenterId
      while (wo.releasedQty < wo.qty && this.hasBufferSpace(firstWorkCenterId)) {
        const unit: Unit = {
          id: formatUnitId(this.nextUnitSeq++),
          workOrderId: wo.id,
          itemId: wo.itemId,
          opIndex: 0,
          status: 'QUEUED',
          releasedAt: this.state.time,
          finishedAt: null,
          history: [],
          materialLots: [],
        }
        this.state.units[unit.id] = unit
        this.state.buffers[firstWorkCenterId].push(unit.id)
        this.state.counters.released++
        wo.releasedQty++
        wo.startedAt ??= this.state.time
        wo.status = 'IN_PROGRESS'
      }
    }
  }

  // ── 6. 가공 시작 ────────────────────────────────────────

  private startProcessing(): void {
    let demand: Set<string> | null = null
    for (const eq of this.state.equipment) {
      if (eq.unitId || eq.status === 'DOWN' || eq.status === 'PM') continue

      if (eq.maintenanceRequested) {
        eq.status = 'PM'
        eq.downRemaining = this.equipmentSpecs.get(eq.id)!.reliability!.maintenanceTime
        this.emit('MAINTENANCE_STARTED', eq.id, 'info', `${this.equipmentName(eq.id)} 예방정비 시작`)
        continue
      }

      const buffer = this.state.buffers[eq.workCenterId]
      const head = buffer[0]
      if (head) {
        const unit = this.state.units[head]
        // 라인은 FIFO다. 맨 앞 Unit의 자재가 없으면 뒤 Unit도 기다린다.
        const missing = this.missingMaterial(unit.itemId, eq.workCenterId)
        if (missing) {
          if (eq.status !== 'STARVED_MATERIAL') {
            this.emit(
              'MATERIAL_SHORTAGE',
              missing,
              'critical',
              `${this.equipmentName(eq.id)} 자재 부족으로 정지 — ${this.materials.get(missing)!.name}`,
            )
          }
          eq.status = 'STARVED_MATERIAL'
          continue
        }
        this.consumeMaterials(unit, eq.workCenterId)
        buffer.shift()
        unit.status = 'PROCESSING'
        eq.unitId = head
        eq.startedAt = this.state.time
        eq.remaining = this.cycleTimeOf(unit)
        eq.status = 'RUN'
        continue
      }
      demand ??= this.workCentersWithPendingDemand()
      eq.status = demand.has(eq.workCenterId) ? 'STARVED' : 'IDLE'
    }
  }

  /** 앞으로 Unit이 도착할 예정인 작업장 집합. 여기에 속한 빈 설비는 STARVED, 아니면 IDLE. */
  private workCentersWithPendingDemand(): Set<string> {
    const result = new Set<string>()
    for (const wo of this.state.workOrders) {
      if ((wo.status === 'RELEASED' || wo.status === 'IN_PROGRESS') && wo.releasedQty < wo.qty) {
        for (const op of this.routings.get(wo.itemId)!.operations) result.add(op.workCenterId)
      }
    }
    // 라인 안의 Unit은 버퍼나 설비 위에만 있다. 완료된 Unit까지 훑지 않도록 이 둘만 본다.
    const addRemaining = (unitId: string, from: number) => {
      const operations = this.routings.get(this.state.units[unitId].itemId)!.operations
      for (let i = from; i < operations.length; i++) result.add(operations[i].workCenterId)
    }
    for (const queue of Object.values(this.state.buffers)) {
      for (const unitId of queue) addRemaining(unitId, this.state.units[unitId].opIndex)
    }
    for (const eq of this.state.equipment) {
      if (eq.unitId) addRemaining(eq.unitId, this.state.units[eq.unitId].opIndex + 1)
    }
    return result
  }

  // ── 자재 ────────────────────────────────────────────────

  /** 이 작업장에서 품목 1개를 가공하는 데 모자란 자재 id. 모두 있으면 null. */
  private missingMaterial(itemId: string, workCenterId: string): string | null {
    for (const line of this.master.bom) {
      if (line.itemId !== itemId || line.workCenterId !== workCenterId) continue
      if (this.state.materials[line.materialId].onHand < line.qtyPer) return line.materialId
    }
    return null
  }

  /** BOM 자재를 차감한다. 먼저 들어온 로트부터 쓰고(FIFO), 쓴 로트를 제품에 기록한다(추적성). */
  private consumeMaterials(unit: Unit, workCenterId: string): void {
    for (const line of this.master.bom) {
      if (line.itemId !== unit.itemId || line.workCenterId !== workCenterId) continue
      const stock = this.state.materials[line.materialId]
      const material = this.materials.get(line.materialId)!
      const before = stock.onHand
      stock.onHand -= line.qtyPer
      stock.consumed += line.qtyPer
      let need = line.qtyPer
      while (need > 0 && stock.lots.length > 0) {
        const lot = this.state.materialLots[stock.lots[0]]
        const take = Math.min(need, lot.remaining)
        lot.remaining -= take
        need -= take
        unit.materialLots.push({ materialId: line.materialId, lotId: lot.id, qty: take })
        if (lot.remaining === 0) stock.lots.shift()
      }
      if (before > material.reorderPoint && stock.onHand <= material.reorderPoint) {
        // 발주점 이하는 자동 발주가 나가는 정상 흐름이라 정보로만 남긴다. 실제 위험은 MATERIAL_SHORTAGE.
        this.emit('MATERIAL_LOW', material.id, 'info', `${material.name} 재고 ${stock.onHand}${material.unit} — 발주점 이하`)
      }
      if (material.safetyStock > 0 && before > material.safetyStock && stock.onHand <= material.safetyStock) {
        this.emit(
          'MATERIAL_BELOW_SAFETY',
          material.id,
          'warning',
          `${material.name} 재고 ${stock.onHand}${material.unit} — 안전재고(${material.safetyStock}) 이하`,
        )
      }
    }
  }

  // ── 7. 자동 발주 ────────────────────────────────────────

  private replenishMaterials(): void {
    for (const material of this.materials.values()) {
      const stock = this.state.materials[material.id]
      const pipeline = stock.onHand + stock.orders.reduce((sum, po) => sum + po.qty, 0)
      if (pipeline <= material.reorderPoint) this.placeOrder(material, material.reorderQty, false)
    }
  }

  private placeOrder(material: Material, qty: number, expedited: boolean): void {
    const leadTime = expedited ? material.expediteLeadTime : material.leadTime
    const po: PurchaseOrder = {
      id: `PO-${String(this.nextPurchaseOrderSeq++).padStart(4, '0')}`,
      materialId: material.id,
      qty,
      orderedAt: this.state.time,
      eta: this.state.time + leadTime,
      expedited,
      receivedAt: null,
      lotId: null,
    }
    this.state.materials[material.id].orders.push(po)
    this.state.purchaseOrders.push(po)
    this.emit(
      'MATERIAL_ORDERED',
      material.id,
      expedited ? 'warning' : 'info',
      `${material.name} ${qty}${material.unit} ${expedited ? '긴급 ' : ''}발주 — ${Math.round(leadTime / 60)}분 후 입고`,
    )
  }

  /** 자재별 재고 · 누적 소비를 기록한다(재고 추이 · 소비 속도 계산용) */
  private recordStock(): void {
    const sample: StockSample = { time: this.state.time, onHand: {}, consumed: {} }
    for (const stock of Object.values(this.state.materials)) {
      sample.onHand[stock.materialId] = stock.onHand
      sample.consumed[stock.materialId] = stock.consumed
    }
    this.state.stockHistory.push(sample)
    if (this.state.stockHistory.length > STOCK_HISTORY_SIZE) this.state.stockHistory.shift()
  }

  /** 설비별 누적값을 기록한다(구간 가동률 · OEE 계산용) */
  private recordEquipment(): void {
    const equipment: Record<string, EquipmentCounters> = {}
    for (const eq of this.state.equipment) {
      equipment[eq.id] = {
        statusTime: { ...eq.statusTime },
        processedCount: eq.processedCount,
        defectCount: eq.defectCount,
        standardTime: eq.standardTime,
      }
    }
    this.state.equipmentHistory.push({ time: this.state.time, equipment })
    if (this.state.equipmentHistory.length > EQUIPMENT_HISTORY_SIZE) this.state.equipmentHistory.shift()
  }

  // ── 보조 ────────────────────────────────────────────────

  private currentOperation(unit: Unit): Operation {
    return this.routings.get(unit.itemId)!.operations[unit.opIndex]
  }

  private cycleTimeOf(unit: Unit): number {
    const op = this.currentOperation(unit)
    return this.state.cycleTimeOverride[op.workCenterId] ?? op.cycleTime
  }

  private hasBufferSpace(workCenterId: string): boolean {
    const wc = this.master.workCenters[this.workCenterOrder.get(workCenterId)!]
    return this.state.buffers[workCenterId].length < wc.inBufferCap
  }

  /**
   * 불량 유형을 "작업장|원인"별로 묶고 검증한다.
   * 불량률이 있는 공정에는 공정 원인 유형이, 마모 불량이 생길 수 있는 설비의 작업장에는 마모 원인 유형이 있어야 한다.
   */
  private loadDefectCodes(master: MasterData): void {
    for (const code of master.defectCodes) {
      if (!this.workCenterOrder.has(code.workCenterId)) throw new Error(`불량 유형 ${code.id}: 알 수 없는 작업장 ${code.workCenterId}`)
      if (!(code.weight > 0)) throw new Error(`불량 유형 ${code.id}: 비중은 0보다 커야 합니다`)
      const key = `${code.workCenterId}|${code.cause}`
      this.defectCodes.set(key, [...(this.defectCodes.get(key) ?? []), code])
    }
    for (const routing of master.routings) {
      for (const op of routing.operations) {
        if (op.defectRate > 0 && !this.defectCodes.has(`${op.workCenterId}|PROCESS`)) {
          throw new Error(`불량 유형 없음: ${op.workCenterId} 공정 불량`)
        }
      }
    }
    for (const eq of master.equipment) {
      if (eq.reliability && eq.reliability.wearDefectRate > 0 && !this.defectCodes.has(`${eq.workCenterId}|WEAR`)) {
        throw new Error(`불량 유형 없음: ${eq.workCenterId} 마모 불량`)
      }
    }
  }

  /** 그 공정 · 원인의 불량 유형 중 하나를 비중대로 고른다(qualityRng) */
  private pickDefectCode(workCenterId: string, cause: DefectCause): DefectCode {
    const codes = this.defectCodes.get(`${workCenterId}|${cause}`)
    if (!codes) throw new Error(`불량 유형 없음: ${workCenterId} ${cause}`)
    let r = this.qualityRng() * codes.reduce((sum, c) => sum + c.weight, 0)
    for (const code of codes) {
      r -= code.weight
      if (r < 0) return code
    }
    return codes[codes.length - 1]
  }

  private findWorkOrder(id: string): WorkOrder | undefined {
    return this.state.workOrders.find((wo) => wo.id === id)
  }

  private findEquipment(id: string): EquipmentRuntime | undefined {
    return this.state.equipment.find((eq) => eq.id === id)
  }

  /** 아직 적용 전인 CREATE 명령으로 만들어질 작업지시 id인지 확인한다(같은 tick에 생성+하달 허용). */
  private isQueuedWorkOrderId(id: string): boolean {
    const pendingCreates = this.queue.filter((c) => c.type === 'CREATE_WORK_ORDER').length
    for (let i = 0; i < pendingCreates; i++) {
      if (formatWorkOrderId(this.nextWorkOrderSeq + i) === id) return true
    }
    return false
  }

  private requireWorkCenter(id: string): void {
    if (!this.workCenterOrder.has(id)) throw new Error(`알 수 없는 작업장: ${id}`)
  }

  private workCenterName(id: string): string {
    return this.master.workCenters[this.workCenterOrder.get(id)!].name
  }

  private equipmentName(id: string): string {
    return this.equipmentSpecs.get(id)?.name ?? equipmentName(this.master, id)
  }

  // ── 8. 비가동 이력 ──────────────────────────────────────

  /**
   * 설비 상태가 고장·정비·자재 부족으로 바뀌면 기록을 열고, 벗어나면 닫는다.
   * 상태를 바꾸는 코드가 여러 곳이라 tick 끝에서 한 번에 비교한다.
   * 이번 tick부터 그 상태의 시간이 쌓이므로 start·end는 현재 시각이다.
   */
  private trackDowntimes(): void {
    const now = this.state.time
    for (const eq of this.state.equipment) {
      const reason = DOWNTIME_REASON[eq.status] ?? null
      const open = this.openDowntimes.get(eq.id)
      if (open?.reason === reason) continue
      if (open) {
        open.end = now
        this.openDowntimes.delete(eq.id)
      }
      if (!reason) continue
      const reliability = this.equipmentSpecs.get(eq.id)?.reliability
      const expected =
        reason === 'BREAKDOWN' ? (reliability?.repairTime ?? null) : reason === 'PM' ? (reliability?.maintenanceTime ?? null) : null
      const record: DowntimeRecord = {
        id: `DT-${String(this.nextDowntimeSeq++).padStart(4, '0')}`,
        equipmentId: eq.id,
        reason,
        start: now,
        end: null,
        expected,
      }
      this.openDowntimes.set(eq.id, record)
      const downtimes = this.state.downtimes
      downtimes.push(record)
      if (downtimes.length > MAX_DOWNTIMES) downtimes.splice(0, downtimes.length - MAX_DOWNTIMES)
    }
  }

  private emit(type: SimEvent['type'], refId: string, severity: SimEvent['severity'], message: string): void {
    const events = this.state.events
    events.push({ type, time: this.state.time, refId, severity, message })
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
  }
}

function createEquipmentRuntime(spec: Equipment): EquipmentRuntime {
  return {
    id: spec.id,
    workCenterId: spec.workCenterId,
    status: 'IDLE',
    unitId: null,
    startedAt: 0,
    remaining: 0,
    statusTime: {
      RUN: 0,
      IDLE: 0,
      STARVED: 0,
      BLOCKED: 0,
      STARVED_MATERIAL: 0,
      DOWN: 0,
      PM: 0,
    } satisfies Record<EquipmentStatus, number>,
    processedCount: 0,
    defectCount: 0,
    standardTime: 0,
    wear: spec.reliability?.initialWear ?? 0,
    sensor: spec.sensor ? initialReading(spec.sensor) : null,
    sensorHistory: [],
    downRemaining: 0,
    maintenanceRequested: false,
    failureCount: 0,
  }
}

function formatPlanId(seq: number): string {
  return `PLAN-${String(seq).padStart(3, '0')}`
}

export function formatWorkOrderId(seq: number): string {
  return `WO-${String(seq).padStart(3, '0')}`
}

function formatUnitId(seq: number): string {
  return `U-${String(seq).padStart(5, '0')}`
}
