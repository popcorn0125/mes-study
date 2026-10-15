import type { SensorLevel, SensorLimits, SensorReading, SensorSpec } from '@/domain/types'

/** 온도가 목표값을 따라가는 시정수(초). 온도는 진동보다 늦게 반응한다. */
export const TEMPERATURE_TIME_CONSTANT = 300
/** 센서 이력 기록 간격(초)과 보관 개수(= 최근 1시간) */
export const SENSOR_SAMPLE_INTERVAL = 30
export const SENSOR_HISTORY_SIZE = 120
/** 진동 측정 잡음(±) */
const VIBRATION_NOISE = 0.03
/**
 * 경보 히스테리시스: 단계가 내려가려면 이전 단계 임계값보다 8% 이상 낮아져야 한다.
 * 잡음(±3%) 때문에 임계값 근처에서 경고가 켜졌다 꺼졌다 반복하는 것을 막는다.
 * 잡음 폭(약 6%)보다 커야 마모가 진행되는 동안(목표값이 계속 오르는 동안) 다시 꺼지지 않는다.
 */
export const LEVEL_HYSTERESIS = 0.08

const LEVEL_ORDER: Record<SensorLevel, number> = { NORMAL: 0, WARNING: 1, CRITICAL: 2 }

export function levelOf(value: number, limits: SensorLimits): SensorLevel {
  if (value >= limits.critical) return 'CRITICAL'
  if (value >= limits.warning) return 'WARNING'
  return 'NORMAL'
}

/** 이전 단계를 고려한 단계 판정. 나빠지는 쪽은 즉시, 좋아지는 쪽은 히스테리시스만큼 내려가야 반영한다. */
export function levelWithHysteresis(value: number, limits: SensorLimits, prev: SensorLevel): SensorLevel {
  const raw = levelOf(value, limits)
  if (LEVEL_ORDER[raw] >= LEVEL_ORDER[prev]) return raw
  const prevThreshold = prev === 'CRITICAL' ? limits.critical : limits.warning
  return value < prevThreshold * (1 - LEVEL_HYSTERESIS) ? raw : prev
}

export function worseLevel(a: SensorLevel, b: SensorLevel): SensorLevel {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b
}

export function isWorse(next: SensorLevel, prev: SensorLevel): boolean {
  return LEVEL_ORDER[next] > LEVEL_ORDER[prev]
}

/**
 * 진동 목표값: 가동 중이면 기준값, 정지 중이면 기준값의 20%.
 * 마모도의 제곱에 비례해 오른다 — 마모도 약 0.65에서 경고, 0.93 이상에서 위험 구간에 들어간다.
 */
export function targetVibration(limits: SensorLimits, wear: number, running: boolean): number {
  const idle = running ? limits.base : limits.base * 0.2
  return idle + wear ** 2 * (limits.critical - limits.base) * 1.15
}

/** 온도 목표값: 가동 중 +8°C, 마모도의 1.5제곱에 비례해 오른다. */
export function targetTemperature(limits: SensorLimits, wear: number, running: boolean): number {
  return limits.base + (running ? 8 : 0) + wear ** 1.5 * (limits.critical - limits.base) * 0.9
}

export function initialReading(spec: SensorSpec): SensorReading {
  return readingOf(spec, spec.temperature.base, spec.vibration.base * 0.2)
}

/**
 * dt초 뒤 센서 값. 온도는 1차 지연으로 목표값을 따라가고, 진동은 즉시 반응하되 잡음이 섞인다.
 * noise는 [0, 1) 난수.
 */
export function nextReading(
  spec: SensorSpec,
  prev: SensorReading,
  wear: number,
  running: boolean,
  dt: number,
  noise: number,
): SensorReading {
  const tempTarget = targetTemperature(spec.temperature, wear, running)
  const temperature = prev.temperature + (tempTarget - prev.temperature) * (1 - Math.exp(-dt / TEMPERATURE_TIME_CONSTANT))
  const vibration = targetVibration(spec.vibration, wear, running) * (1 + (noise * 2 - 1) * VIBRATION_NOISE)
  return readingOf(spec, temperature, vibration, prev, running)
}

/** 수리·예방정비 후 진동 경보를 해제한다(정지 중에는 진동 단계를 유지하므로 명시적으로 풀어야 한다). */
export function clearVibrationAlarm(reading: SensorReading): SensorReading {
  return { ...reading, vibrationLevel: 'NORMAL', level: reading.temperatureLevel }
}

function readingOf(
  spec: SensorSpec,
  temperature: number,
  vibration: number,
  prev?: SensorReading,
  running = true,
): SensorReading {
  const temperatureLevel = levelWithHysteresis(temperature, spec.temperature, prev?.temperatureLevel ?? 'NORMAL')
  const prevVibration = prev?.vibrationLevel ?? 'NORMAL'
  // 진동은 부하가 걸린 상태에서만 의미가 있다. 정지 중(막힘·대기)에는 값이 떨어져도 단계를 유지해,
  // 가동을 재개할 때마다 같은 경보가 반복되지 않게 한다.
  const vibrationLevel = running
    ? levelWithHysteresis(vibration, spec.vibration, prevVibration)
    : worseLevel(levelOf(vibration, spec.vibration), prevVibration)
  return {
    temperature,
    vibration,
    temperatureLevel,
    vibrationLevel,
    level: worseLevel(temperatureLevel, vibrationLevel),
  }
}
