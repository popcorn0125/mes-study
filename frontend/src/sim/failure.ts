import type { Reliability } from '@/domain/types'

/** 이 마모도부터 고장 확률이 생긴다 */
export const WEAR_FAILURE_ONSET = 0.7
/** 마모도 1에 가까울 때의 평균 고장 시간(초) 기준 */
const HAZARD_SCALE_SEC = 600
/** 이 마모도부터 불량률이 오르기 시작한다 */
export const WEAR_DEFECT_ONSET = 0.5
/** 고장 수리 후 남는 마모도(수리는 완전 정비가 아니다). 예방정비는 0으로 되돌린다. */
export const WEAR_AFTER_REPAIR = 0.2

/**
 * 마모도에 따른 초당 고장 확률.
 * 0.7 미만이면 0, 이후 제곱으로 증가하고 마모도 1이면 반드시 고장(1)이다.
 */
export function failureHazard(wear: number): number {
  if (wear < WEAR_FAILURE_ONSET) return 0
  if (wear >= 1) return 1
  return ((wear - WEAR_FAILURE_ONSET) / (1 - WEAR_FAILURE_ONSET)) ** 2 / HAZARD_SCALE_SEC
}

/** 마모로 인해 공정 불량률에 더해지는 값. 0.5 이상부터 선형으로 wearDefectRate까지 오른다. */
export function wearDefectRate(wear: number, reliability: Reliability | undefined): number {
  if (!reliability || wear <= WEAR_DEFECT_ONSET) return 0
  return ((Math.min(wear, 1) - WEAR_DEFECT_ONSET) / (1 - WEAR_DEFECT_ONSET)) * reliability.wearDefectRate
}
