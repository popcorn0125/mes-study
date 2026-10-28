import type { DefectCount } from '@/api/quality'
import { markVitalFew } from './pareto'

export { VITAL_FEW_RATIO } from './pareto'

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
  return markVitalFew(defects, (d) => d.count, (d) => d.cumulativeRatio, (d) => d.defectCode === null)
    .map(({ item, share, vital }) => ({ ...item, share, vital, unclassified: item.defectCode === null }))
}
