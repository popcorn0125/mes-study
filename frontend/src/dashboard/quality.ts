import type { DefectCount } from '@/api/quality'

/** 파레토에서 "먼저 손볼 유형"으로 굵게 보이는 누적 비율 기준 */
export const VITAL_FEW_RATIO = 0.8

/** 파레토 막대 한 줄 */
export interface ParetoBar extends DefectCount {
  /** 막대 길이(가장 많은 유형 = 1) */
  share: number
  /** 누적 80%에 드는 유형(앞에서부터 더해 80%에 처음 닿는 유형까지). 미분류는 넣지 않는다 */
  vital: boolean
  unclassified: boolean
}

/** 서버 파레토(많은 순 · 미분류 맨 뒤)에 막대 길이와 강조 여부를 붙인다 */
export function toParetoBars(defects: readonly DefectCount[]): ParetoBar[] {
  const max = Math.max(0, ...defects.map((d) => d.count))
  let before = 0
  return defects.map((d) => {
    const unclassified = d.defectCode === null
    // 이 줄 앞까지의 누적이 80% 미만이면 이 줄이 80%를 채우는 데 든다
    const vital = !unclassified && before < VITAL_FEW_RATIO
    before = d.cumulativeRatio ?? before
    return { ...d, share: max > 0 ? d.count / max : 0, vital, unclassified }
  })
}
