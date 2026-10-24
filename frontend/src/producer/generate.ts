import type { ProducerEquipment, Range } from './equipment'

/** RUN: 가동, WARN: 경고, DOWN: 고장/정지 */
export type SensorStatus = 'RUN' | 'WARN' | 'DOWN'

export interface Metrics {
  temperature: number
  vibration: number
}

export interface ProductionCount {
  totalCount: number
  goodCount: number
  badCount: number
}

/** 전송 페이로드 한 건(설비 1대) */
export interface SensorLog {
  equipmentId: string
  timestamp: string
  status: SensorStatus
  workOrderId: string
  metrics: Metrics
  production: ProductionCount
}

/** 설비 1대의 내부 상태. 1초마다 한 걸음씩 진행한다. */
export interface EquipmentState {
  equipmentId: string
  status: SensorStatus
  /** WARN · DOWN이 앞으로 유지될 초. 0이 되면 RUN으로 돌아온다. */
  statusRemaining: number
  /** 마지막 완성 뒤 흐른 가동 시간(초). 택트 타임에 이르면 1개를 완성한다. */
  tactElapsed: number
  metrics: Metrics
  production: ProductionCount
}

/** 0 이상 1 미만 난수 */
export type Random = () => number

/** 1개 완성 시 불량일 확률 */
export const BAD_RATE = 0.05
/** 불량이 나면 WARN 또는 DOWN을 유지하는 시간(초): 3 ~ 5 */
export const ALERT_SECONDS: Range = [3, 5]
/** 측정값이 1초에 움직이는 최대 폭(정상 범위 폭에 대한 비율) */
export const METRIC_STEP_RATIO = 0.05

const round1 = (value: number) => Math.round(value * 10) / 10

/** 범위 가운데 값에서 RUN · 수량 0으로 시작한다 */
export function initialState(eq: ProducerEquipment): EquipmentState {
  const mid = ([min, max]: Range) => round1((min + max) / 2)
  return {
    equipmentId: eq.id,
    status: 'RUN',
    statusRemaining: 0,
    tactElapsed: 0,
    metrics: { temperature: mid(eq.temperature), vibration: mid(eq.vibration) },
    production: { totalCount: 0, goodCount: 0, badCount: 0 },
  }
}

/** 직전 값에서 범위 폭의 ±METRIC_STEP_RATIO 안으로 움직이고, 범위를 벗어나지 않는다(소수점 첫째 자리) */
export function driftIn(value: number, [min, max]: Range, random: Random): number {
  const step = (max - min) * METRIC_STEP_RATIO * (random() * 2 - 1)
  return round1(Math.min(max, Math.max(min, value + step)))
}

/**
 * 1초 진행.
 * - WARN · DOWN은 남은 시간이 다하면 RUN으로 돌아온다.
 * - DOWN이 아니면 택트 타이머가 흐르고, 택트 타임마다 1개를 완성한다(95% 양품, 5% 불량).
 *   택트 사이에는 수량을 그대로 둔다.
 * - 불량이 나면 WARN 또는 DOWN(반반)으로 3~5초 바뀐다. DOWN 동안은 택트 타이머가 멈춘다.
 * - 온도 · 진동은 매초 조금씩 움직인다.
 */
export function step(eq: ProducerEquipment, prev: EquipmentState, random: Random): EquipmentState {
  let status = prev.status
  let statusRemaining = prev.statusRemaining
  if (status !== 'RUN') {
    statusRemaining -= 1
    if (statusRemaining <= 0) {
      status = 'RUN'
      statusRemaining = 0
    }
  }

  let tactElapsed = prev.tactElapsed
  let production = prev.production
  if (status !== 'DOWN') {
    tactElapsed += 1
    if (tactElapsed >= eq.tactTime) {
      tactElapsed -= eq.tactTime
      const bad = random() < BAD_RATE
      production = {
        totalCount: production.totalCount + 1,
        goodCount: production.goodCount + (bad ? 0 : 1),
        badCount: production.badCount + (bad ? 1 : 0),
      }
      if (bad) {
        status = random() < 0.5 ? 'WARN' : 'DOWN'
        const [min, max] = ALERT_SECONDS
        statusRemaining = min + Math.floor(random() * (max - min + 1))
      }
    }
  }

  return {
    equipmentId: prev.equipmentId,
    status,
    statusRemaining,
    tactElapsed,
    metrics: {
      temperature: driftIn(prev.metrics.temperature, eq.temperature, random),
      vibration: driftIn(prev.metrics.vibration, eq.vibration, random),
    },
    production,
  }
}

/** 전송용 로그(스키마 필드만) */
export function toLog(state: EquipmentState, workOrderId: string, now: Date): SensorLog {
  return {
    equipmentId: state.equipmentId,
    timestamp: now.toISOString(),
    status: state.status,
    workOrderId,
    metrics: state.metrics,
    production: state.production,
  }
}
