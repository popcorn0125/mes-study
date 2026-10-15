import { describe, expect, it } from 'vitest'
import type { SensorSpec } from '@/domain/types'
import { WEAR_FAILURE_ONSET, failureHazard, wearDefectRate } from './failure'
import {
  clearVibrationAlarm,
  initialReading,
  levelOf,
  levelWithHysteresis,
  nextReading,
  targetVibration,
  worseLevel,
} from './sensors'

const spec: SensorSpec = {
  temperature: { base: 40, warning: 65, critical: 80 },
  vibration: { base: 2, warning: 4.5, critical: 7.1 },
}

describe('센서 모델', () => {
  it('임계값으로 단계를 판정하고, 두 센서 중 나쁜 쪽을 대표값으로 쓴다', () => {
    expect(levelOf(3, spec.vibration)).toBe('NORMAL')
    expect(levelOf(5, spec.vibration)).toBe('WARNING')
    expect(levelOf(8, spec.vibration)).toBe('CRITICAL')
    expect(worseLevel('WARNING', 'CRITICAL')).toBe('CRITICAL')
  })

  it('새 설비는 정상, 마모도가 높아지면 진동이 경고·위험 구간으로 올라간다', () => {
    expect(levelOf(targetVibration(spec.vibration, 0, true), spec.vibration)).toBe('NORMAL')
    expect(levelOf(targetVibration(spec.vibration, 0.75, true), spec.vibration)).toBe('WARNING')
    expect(levelOf(targetVibration(spec.vibration, 0.98, true), spec.vibration)).toBe('CRITICAL')
  })

  it('히스테리시스: 경고는 임계값을 넘으면 바로 켜지고, 8% 아래로 내려가야 꺼진다', () => {
    const limits = spec.vibration // 경고 4.5
    expect(levelWithHysteresis(4.6, limits, 'NORMAL')).toBe('WARNING')
    expect(levelWithHysteresis(4.3, limits, 'WARNING')).toBe('WARNING') // 잡음 수준 하락은 무시
    expect(levelWithHysteresis(4.1, limits, 'WARNING')).toBe('NORMAL') // 4.5 × 0.92 = 4.14 미만
    expect(levelWithHysteresis(7.0, limits, 'CRITICAL')).toBe('CRITICAL')
    expect(levelWithHysteresis(6.0, limits, 'CRITICAL')).toBe('WARNING')
  })

  it('마모가 임계값을 천천히 넘어가는 동안 잡음이 섞여도 경고가 한 번만 켜진다', () => {
    // 목표 진동이 경고 임계값 아래에서 위로 천천히 지나가도록 마모도를 0.60 → 0.70으로 올린다
    let reading = initialReading(spec)
    let transitions = 0
    for (let i = 0; i < 3600; i++) {
      const wear = 0.6 + (0.1 * i) / 3600
      const next = nextReading(spec, reading, wear, true, 1, (i * 0.618) % 1)
      if (next.vibrationLevel !== reading.vibrationLevel) transitions++
      reading = next
    }
    expect(transitions).toBeLessThanOrEqual(1)
  })

  it('정지 중에는 진동 단계를 유지하고, 수리·정비 후 해제한다', () => {
    let reading = initialReading(spec)
    reading = nextReading(spec, reading, 0.8, true, 1, 0.5) // 가동 중 경고
    expect(reading.vibrationLevel).toBe('WARNING')
    reading = nextReading(spec, reading, 0.8, false, 1, 0.5) // 정지: 값은 떨어지지만 단계 유지
    expect(reading.vibration).toBeLessThan(spec.vibration.warning)
    expect(reading.vibrationLevel).toBe('WARNING')
    expect(clearVibrationAlarm(reading).vibrationLevel).toBe('NORMAL')
  })

  it('온도는 목표값을 천천히 따라간다(1차 지연)', () => {
    let reading = initialReading(spec)
    const first = nextReading(spec, reading, 0.9, true, 1, 0.5)
    expect(first.temperature - reading.temperature).toBeLessThan(1)
    for (let i = 0; i < 3600; i++) reading = nextReading(spec, reading, 0.9, true, 1, 0.5)
    expect(reading.temperatureLevel).not.toBe('NORMAL')
  })
})

describe('고장 모델', () => {
  it('고장 확률은 마모도 0.7 미만에서 0, 이후 증가, 1에서 확정', () => {
    expect(failureHazard(WEAR_FAILURE_ONSET - 0.01)).toBe(0)
    expect(failureHazard(0.85)).toBeGreaterThan(failureHazard(0.75))
    expect(failureHazard(1)).toBe(1)
  })

  it('마모 불량률은 0.5 이후 선형으로 증가한다', () => {
    const rel = { wearPerRunHour: 0, initialWear: 0, repairTime: 0, maintenanceTime: 0, wearDefectRate: 0.2 }
    expect(wearDefectRate(0.5, rel)).toBe(0)
    expect(wearDefectRate(0.75, rel)).toBeCloseTo(0.1)
    expect(wearDefectRate(1, rel)).toBeCloseTo(0.2)
    expect(wearDefectRate(1, undefined)).toBe(0)
  })
})
