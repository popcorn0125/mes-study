import type { ProducerEquipment, Range } from './equipment'

/** RUN: 가동, WARN: 경고, DOWN: 고장/정지, IDLE: 대기(만들 것이 없음) */
export type SensorStatus = 'RUN' | 'WARN' | 'DOWN' | 'IDLE'

export interface Metrics {
  temperature: number
  vibration: number
}

export interface ProductionCount {
  totalCount: number
  goodCount: number
  badCount: number
}

/** 전송 페이로드 한 건(설비 1대). 진행 중 작업지시가 없으면 workOrderId · production을 뺀다 */
export interface SensorLog {
  equipmentId: string
  timestamp: string
  status: SensorStatus
  workOrderId?: string
  metrics: Metrics
  production?: ProductionCount
}

/** 설비 1대의 내부 상태. 1초마다 한 걸음씩 진행한다. */
export interface EquipmentState {
  equipmentId: string
  status: SensorStatus
  /** WARN · DOWN이 앞으로 유지될 초. 0이 되면 RUN(가공 중) 또는 IDLE(대기)로 돌아온다. */
  statusRemaining: number
  /** 지금 1개를 가공하고 있는지(투입했고 아직 완성 전) */
  inProcess: boolean
  /** 지금 가공 중인 1개에 쓴 가동 시간(초). 택트 타임에 이르면 완성한다. */
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
/** 경고(WARN) 중 1초에 진행하는 가공 시간(초). 택트가 약 1.33배로 늘어 OEE 성능 손실이 된다 */
export const WARN_SPEED = 0.75
/** 가공 중 1초마다 속도 저하 경고가 시작될 확률(평균 가공 300초에 한 번) */
export const SLOWDOWN_CHANCE = 1 / 300
/** 속도 저하 경고가 이어지는 시간(초): 30 ~ 60 */
export const SLOWDOWN_SECONDS: Range = [30, 60]
/** 측정값이 1초에 움직이는 최대 폭(정상 범위 폭에 대한 비율) */
export const METRIC_STEP_RATIO = 0.05

const round1 = (value: number) => Math.round(value * 10) / 10

export const ZERO_COUNT: ProductionCount = { totalCount: 0, goodCount: 0, badCount: 0 }

/** 범위 가운데 값, 대기(IDLE)에서 시작한다. 수량은 서버에 저장된 값이 있으면 그 값부터 */
export function initialState(eq: ProducerEquipment, production: ProductionCount = ZERO_COUNT): EquipmentState {
  const mid = ([min, max]: Range) => round1((min + max) / 2)
  return {
    equipmentId: eq.id,
    status: 'IDLE',
    statusRemaining: 0,
    inProcess: false,
    tactElapsed: 0,
    metrics: { temperature: mid(eq.temperature), vibration: mid(eq.vibration) },
    production,
  }
}

/** 직전 값에서 범위 폭의 ±METRIC_STEP_RATIO 안으로 움직이고, 범위를 벗어나지 않는다(소수점 첫째 자리) */
export function driftIn(value: number, [min, max]: Range, random: Random): number {
  const step = (max - min) * METRIC_STEP_RATIO * (random() * 2 - 1)
  return round1(Math.min(max, Math.max(min, value + step)))
}

/**
 * 1초 진행. supply는 지금 새로 투입할 수 있는 개수다(앞 공정이 넘겨준 양품 등, line.ts가 계산한다).
 * - WARN · DOWN은 남은 시간이 다하면 끝난다.
 * - 가공 중이 아니고 supply가 있으면 1개를 투입한다. DOWN 동안은 투입도 가공도 멈춘다.
 * - 가공 중이면 가동 시간이 흐르고, 택트 타임에 이르면 1개를 완성한다(95% 양품, 5% 불량).
 *   불량이 나면 WARN 또는 DOWN(반반)으로 3~5초 바뀐다.
 * - WARN 동안은 느리게 가공한다(1초에 WARN_SPEED초분).
 * - 경고 · 고장 없이 가공 중이면 가끔(SLOWDOWN_CHANCE) 30~60초짜리 속도 저하 경고(WARN)가 시작된다.
 * - 경고 · 고장이 아니면 가공 중일 때 RUN, 만들 것이 없으면 IDLE이다.
 * - 온도 · 진동은 매초 조금씩 움직인다.
 */
export function step(eq: ProducerEquipment, prev: EquipmentState, random: Random, supply: number): EquipmentState {
  let statusRemaining = prev.statusRemaining
  let alert: SensorStatus | undefined = prev.status === 'WARN' || prev.status === 'DOWN' ? prev.status : undefined
  if (alert) {
    statusRemaining -= 1
    if (statusRemaining <= 0) {
      alert = undefined
      statusRemaining = 0
    }
  }

  let inProcess = prev.inProcess
  let tactElapsed = prev.tactElapsed
  let production = prev.production
  if (alert !== 'DOWN') {
    if (!inProcess && supply > 0) {
      inProcess = true
      tactElapsed = 0
    }
    if (inProcess) {
      tactElapsed += alert === 'WARN' ? WARN_SPEED : 1
      if (tactElapsed >= eq.tactTime) {
        inProcess = false
        tactElapsed = 0
        const bad = random() < BAD_RATE
        production = {
          totalCount: production.totalCount + 1,
          goodCount: production.goodCount + (bad ? 0 : 1),
          badCount: production.badCount + (bad ? 1 : 0),
        }
        if (bad) {
          alert = random() < 0.5 ? 'WARN' : 'DOWN'
          const [min, max] = ALERT_SECONDS
          statusRemaining = min + Math.floor(random() * (max - min + 1))
        }
      }
    }
    // 완성한 초에는 굴리지 않는다(불량 판정과 난수 순서가 섞이지 않게)
    if (inProcess && !alert && random() < SLOWDOWN_CHANCE) {
      alert = 'WARN'
      const [min, max] = SLOWDOWN_SECONDS
      statusRemaining = min + Math.floor(random() * (max - min + 1))
    }
  }

  // 방금 1개를 완성했어도 다음 1개가 기다리고 있으면 다음 초에 바로 투입하므로 가동으로 본다.
  // (supply는 가공 중이던 1개를 뺀 수라, 완성 뒤에도 그대로 "더 투입할 수 있는 수"다)
  const busy = inProcess || (production !== prev.production && supply > 0)
  return {
    equipmentId: prev.equipmentId,
    status: alert ?? (busy ? 'RUN' : 'IDLE'),
    statusRemaining,
    inProcess,
    tactElapsed,
    metrics: {
      temperature: driftIn(prev.metrics.temperature, eq.temperature, random),
      vibration: driftIn(prev.metrics.vibration, eq.vibration, random),
    },
    production,
  }
}

/** 전송용 로그(스키마 필드만). 작업지시가 없으면 수량을 보내지 않는다 */
export function toLog(state: EquipmentState, workOrderId: string | undefined, now: Date): SensorLog {
  const log: SensorLog = {
    equipmentId: state.equipmentId,
    timestamp: now.toISOString(),
    status: state.status,
    metrics: state.metrics,
  }
  if (workOrderId) {
    log.workOrderId = workOrderId
    log.production = state.production
  }
  return log
}
