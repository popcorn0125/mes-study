/**
 * MES 도메인 타입.
 * - 기준정보(Master): 시뮬레이션 시작 시 로드되고 실행 중에는 바뀌지 않는다.
 * - 실행 데이터(Execution): 엔진이 매 tick 갱신한다.
 * 시간 단위는 모두 시뮬레이션 초(sec)다.
 */

// ── 기준정보 ──────────────────────────────────────────────

export interface Item {
  id: string
  name: string
}

/** 라우팅의 한 공정. 어느 작업장에서, 표준 몇 초에, 어느 정도 불량률로 가공하는지 정의한다. */
export interface Operation {
  seq: number
  workCenterId: string
  /** 표준 사이클타임(초) */
  cycleTime: number
  /** 공정 불량률 (0~1) */
  defectRate: number
}

export interface Routing {
  itemId: string
  operations: Operation[]
}

/** 작업장(공정). 입력 버퍼 하나와 설비 여러 대를 가진다. */
export interface WorkCenter {
  id: string
  name: string
  /** 입력 버퍼 용량(대기 가능한 Unit 수) */
  inBufferCap: number
}

/** 센서 한 종류의 기준값과 임계값 */
export interface SensorLimits {
  /** 정상 가동 시 기준값 */
  base: number
  warning: number
  critical: number
}

/** 설비 센서 규격: 온도(°C), 진동(mm/s RMS) */
export interface SensorSpec {
  temperature: SensorLimits
  vibration: SensorLimits
}

/**
 * 설비 신뢰성. 마모도(wear, 0~1)는 가동 중에만 쌓이고, 높아질수록 센서 값·불량률·고장 확률이 오른다.
 * 무작위 고장(MTBF) 대신 마모 기반으로 모델링해 고장 전에 전조(센서·품질 저하)가 나타나게 한다.
 */
export interface Reliability {
  /** 가동 1시간당 마모도 증가량 */
  wearPerRunHour: number
  /** 시작 시 마모도 */
  initialWear: number
  /** 표준(예상) 고장 수리 시간(초). 실제 수리 시간은 고장마다 이 값의 0.75 ~ 1.5배에서 정해진다 */
  repairTime: number
  /** 예방정비 시간(초) */
  maintenanceTime: number
  /** 마모도가 최대(1)일 때 공정 불량률에 더해지는 값 */
  wearDefectRate: number
}

export interface Equipment {
  id: string
  name: string
  workCenterId: string
  sensor?: SensorSpec
  reliability?: Reliability
}

/** 구매 자재 */
export interface Material {
  id: string
  name: string
  /** 수량 단위 (예: 개) */
  unit: string
  initialStock: number
  /** 재고 + 입고 예정 수량이 이 값 이하로 내려가면 자동 발주 */
  reorderPoint: number
  /** 자동 발주 수량 */
  reorderQty: number
  /** 정상 발주 리드타임(초) */
  leadTime: number
  /** 긴급 발주 리드타임(초) */
  expediteLeadTime: number
  /** 개당 단가(원) */
  unitCost: number
  /** 긴급 발주 시 단가에 더해지는 비율 (0.5 = 50% 할증) */
  expediteSurcharge: number
}

/** BOM 한 줄: 품목 1개를 만들 때 어느 작업장에서 어떤 자재를 몇 개 쓰는지 */
export interface BomLine {
  itemId: string
  materialId: string
  qtyPer: number
  /** 자재를 소비하는 작업장(가공 시작 시 차감) */
  workCenterId: string
}

export interface MasterData {
  items: Item[]
  routings: Routing[]
  /** 라인 순서대로 나열한다(상류 → 하류). */
  workCenters: WorkCenter[]
  equipment: Equipment[]
  materials: Material[]
  bom: BomLine[]
}

// ── 실행 데이터 ───────────────────────────────────────────

export type WorkOrderStatus = 'PLANNED' | 'RELEASED' | 'IN_PROGRESS' | 'HELD' | 'COMPLETED'

export interface WorkOrder {
  id: string
  itemId: string
  /** 지시 수량 */
  qty: number
  /** 높을수록 먼저 투입 */
  priority: number
  dueTime: number | null
  status: WorkOrderStatus
  /** HELD 해제 시 돌아갈 상태 */
  statusBeforeHold: WorkOrderStatus | null
  releasedQty: number
  goodQty: number
  scrapQty: number
  createdAt: number
  releasedAt: number | null
  /** 첫 제품을 첫 공정에 투입한 시각. 하달 → 첫 투입이 대기 시간이다 */
  startedAt: number | null
  completedAt: number | null
}

/**
 * 디스패칭 규칙: 다음에 투입할 작업지시를 고르는 기준.
 * FIFO: 하달 순 / PRIORITY: 우선순위 높은 순 → 하달 순 / EDD: 납기 빠른 순 → 하달 순
 */
export type DispatchRule = 'FIFO' | 'PRIORITY' | 'EDD'

export type UnitStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'SCRAPPED'

export interface UnitHistoryEntry {
  opSeq: number
  equipmentId: string
  start: number
  end: number
  result: 'GOOD' | 'DEFECT'
}

/** 라인을 흐르는 재공품(WIP) 1개. */
export interface Unit {
  id: string
  workOrderId: string
  itemId: string
  /** 라우팅의 현재 공정 인덱스 */
  opIndex: number
  status: UnitStatus
  releasedAt: number
  finishedAt: number | null
  history: UnitHistoryEntry[]
}

/**
 * RUN: 가공 중 / IDLE: 할 일 없음(진행 중인 작업지시 없음)
 * STARVED: 작업지시는 있으나 입력 버퍼가 비어 대기 / BLOCKED: 가공은 끝났으나 다음 버퍼가 가득 참
 * STARVED_MATERIAL: 가공할 Unit은 있으나 BOM 자재가 부족 / DOWN: 고장 수리 중 / PM: 예방정비 중
 */
export type EquipmentStatus = 'RUN' | 'IDLE' | 'STARVED' | 'BLOCKED' | 'STARVED_MATERIAL' | 'DOWN' | 'PM'

export const EQUIPMENT_STATUSES: readonly EquipmentStatus[] = [
  'RUN',
  'IDLE',
  'STARVED',
  'BLOCKED',
  'STARVED_MATERIAL',
  'DOWN',
  'PM',
]

export type SensorLevel = 'NORMAL' | 'WARNING' | 'CRITICAL'

export interface SensorReading {
  temperature: number
  vibration: number
  temperatureLevel: SensorLevel
  vibrationLevel: SensorLevel
  /** 두 센서 중 더 나쁜 단계 */
  level: SensorLevel
}

export interface SensorSample {
  time: number
  temperature: number
  vibration: number
}

export interface EquipmentRuntime {
  id: string
  workCenterId: string
  status: EquipmentStatus
  unitId: string | null
  /** 현재 Unit 가공 시작 시각 */
  startedAt: number
  /** 남은 가공 시간(초). BLOCKED면 0 */
  remaining: number
  /** 상태별 누적 시간 */
  statusTime: Record<EquipmentStatus, number>
  /** 가공 완료 수(양품 + 불량) */
  processedCount: number
  defectCount: number
  /** 가공 완료한 Unit들의 표준 사이클타임 합계(OEE 성능 계산용) */
  standardTime: number
  /** 마모도 0~1 */
  wear: number
  /** 센서가 없는 설비는 null */
  sensor: SensorReading | null
  /** 일정 간격으로 기록한 센서 이력(최근 것만 보관) */
  sensorHistory: SensorSample[]
  /** DOWN/PM 남은 시간(초) */
  downRemaining: number
  /** 예방정비 요청됨: 현재 Unit을 마치면 PM에 들어간다 */
  maintenanceRequested: boolean
  failureCount: number
}

export interface PurchaseOrder {
  id: string
  materialId: string
  qty: number
  orderedAt: number
  /** 입고 예정 시각 */
  eta: number
  expedited: boolean
}

export interface MaterialStock {
  materialId: string
  onHand: number
  /** 입고 대기 중인 발주 */
  orders: PurchaseOrder[]
}

export interface ProductionRecord {
  unitId: string
  workOrderId: string
  opSeq: number
  equipmentId: string
  result: 'GOOD' | 'DEFECT'
  time: number
}

export type SimEventType =
  | 'PLAN_SET'
  | 'WORK_ORDER_CREATED'
  | 'WORK_ORDER_RELEASED'
  | 'WORK_ORDER_HELD'
  | 'WORK_ORDER_PRIORITY_CHANGED'
  | 'WORK_ORDER_COMPLETED'
  | 'DISPATCH_RULE_CHANGED'
  | 'UNIT_SCRAPPED'
  | 'EQUIPMENT_ADDED'
  | 'CYCLE_TIME_CHANGED'
  | 'SENSOR_WARNING'
  | 'SENSOR_CRITICAL'
  | 'EQUIPMENT_DOWN'
  | 'EQUIPMENT_REPAIRED'
  | 'MAINTENANCE_REQUESTED'
  | 'MAINTENANCE_STARTED'
  | 'MAINTENANCE_DONE'
  | 'MATERIAL_SHORTAGE'
  | 'MATERIAL_LOW'
  | 'MATERIAL_ORDERED'
  | 'MATERIAL_RECEIVED'

export interface SimEvent {
  type: SimEventType
  time: number
  refId: string
  severity: 'info' | 'warning' | 'critical'
  message: string
}

/**
 * 생산 계획: 한 교대 동안 품목별로 몇 대를 만들지 정한 목표.
 * 실제 MES에서는 ERP·APS에서 받아오는 값이다. 엔진은 기준값으로 보관만 하고, 실제 생산은 작업지시가 움직인다.
 */
export interface ProductionPlan {
  id: string
  /** 계획 시작 시각(시뮬 초) */
  startTime: number
  /** 계획 기간(초) */
  duration: number
  /** 품목별 목표 수량 */
  lines: { itemId: string; targetQty: number }[]
}

/** 비가동 사유: 고장(비계획), 예방정비(계획), 자재 부족(비계획) */
export type DowntimeReason = 'BREAKDOWN' | 'PM' | 'MATERIAL'

/**
 * 비가동 한 건: 설비가 멈춘 구간.
 * 공급 대기·막힘은 가공마다 몇 초씩 생기는 라인 흐름 손실이라 한 건씩 기록하지 않는다(상태별 누적 시간으로 본다).
 */
export interface DowntimeRecord {
  id: string
  equipmentId: string
  reason: DowntimeReason
  start: number
  /** 아직 멈춰 있으면 null */
  end: number | null
  /** 고장·정비의 표준(예상) 시간(초). 자재 부족은 null */
  expected: number | null
}

export interface SimState {
  time: number
  workOrders: WorkOrder[]
  units: Record<string, Unit>
  /** 작업장별 입력 버퍼(Unit id FIFO 큐) */
  buffers: Record<string, string[]>
  equipment: EquipmentRuntime[]
  /** 작업장별 사이클타임 덮어쓰기(사용자 조치). 없으면 라우팅 표준값 사용 */
  cycleTimeOverride: Record<string, number>
  /** 자재별 재고 */
  materials: Record<string, MaterialStock>
  records: ProductionRecord[]
  events: SimEvent[]
  counters: {
    released: number
    completed: number
    scrapped: number
    /** WIP × 시간(초)의 누적값. 경과 시간으로 나누면 평균 WIP */
    wipSeconds: number
  }
  costs: {
    /** 긴급 발주 할증 누계(원) */
    expediteSurcharge: number
  }
  /** 현재 생산 계획. 계획 없이 작업지시만으로도 돌 수 있다 */
  plan: ProductionPlan | null
  /** 비가동 이력(최근 것만 보관) */
  downtimes: DowntimeRecord[]
  /** 작업지시 투입 순서 규칙 */
  dispatchRule: DispatchRule
}
