import type { DefectCause, Disposition } from '@/domain/types'

/** 불량 원인: 공정 산포(노랑) / 설비 마모(빨강) */
export const CAUSE_LABEL: Record<DefectCause, string> = { PROCESS: '공정 산포', WEAR: '설비 마모' }
export const CAUSE_COLOR: Record<DefectCause, string> = { PROCESS: '#d29922', WEAR: '#f85149' }

/** 불량 처리: 재작업(파랑) / 폐기(빨강) */
export const DISPOSITION_LABEL: Record<Disposition, string> = { REWORK: '재작업', SCRAP: '폐기' }
export const DISPOSITION_COLOR: Record<Disposition, string> = { REWORK: '#2f81f7', SCRAP: '#f85149' }

/** 4M 분류: 이 공장의 원인을 사람 · 설비 · 자재 · 방법 중 어디로 볼지 */
export const CAUSE_4M: Record<DefectCause, string> = { PROCESS: '방법(Method) · 사람(Man)', WEAR: '설비(Machine)' }
