import type { ProductionPlan } from '@/domain/types'

export const DEMO_SEED = 2026

/**
 * 자유 체험(대시보드 기본 공장) 생산 계획: 1교대 8시간, 표준형 A 360대 · 고급형 B 120대.
 * 병목인 조립의 능력은 A:B = 3:1일 때 평균 52.5초/대 ≈ 시간당 68대다.
 * 고장·자재 지연 여유를 두고 능력의 약 88%인 시간당 60대로 잡았다.
 */
export const DEMO_PLAN: Omit<ProductionPlan, 'id'> = {
  startTime: 0,
  duration: 8 * 3600,
  lines: [
    { itemId: 'MOTOR-A', targetQty: 360 },
    { itemId: 'MOTOR-B', targetQty: 120 },
  ],
}

/** 계획을 작업지시로 나눌 로트 크기 */
export const DEMO_LOT_SIZE = 40
