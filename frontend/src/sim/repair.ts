/** 수리 시간 배수 범위: 표준 수리 시간 × [최소, 최빈, 최대] */
export const REPAIR_FACTOR_MIN = 0.75
export const REPAIR_FACTOR_MODE = 1
export const REPAIR_FACTOR_MAX = 1.5

/**
 * 이번 고장의 실제 수리 시간(초).
 * 표준 수리 시간에 삼각분포(0.75 ~ 1.5, 최빈 1.0) 배수를 곱한다.
 * 대부분 표준 근처에서 끝나지만 가끔 길어지는(부품 수배 등) 오른쪽 꼬리를 흉내 낸다.
 * u는 [0, 1) 난수다.
 */
export function sampleRepairTime(standard: number, u: number): number {
  const a = REPAIR_FACTOR_MIN
  const c = REPAIR_FACTOR_MODE
  const b = REPAIR_FACTOR_MAX
  // 삼각분포의 역누적분포함수
  const split = (c - a) / (b - a)
  const factor = u < split ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c))
  return Math.max(1, Math.round(standard * factor))
}

/** 실제 수리 시간이 나올 수 있는 범위(초) */
export function repairTimeRange(standard: number): [number, number] {
  return [standard * REPAIR_FACTOR_MIN, standard * REPAIR_FACTOR_MAX]
}
