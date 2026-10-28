/** 파레토에서 "먼저 손볼 항목"으로 굵게 보이는 누적 비율 기준 */
export const VITAL_FEW_RATIO = 0.8

/** 파레토 막대 한 줄(화면 표시용) */
export interface ParetoRow {
  key: string
  name: string
  /** 이름 아래 작은 글씨(설비 · 대분류 등). 없으면 null */
  note: string | null
  /** 막대 옆 글자("3개 · 누적 33%") */
  value: string
  /** 막대 길이(가장 큰 항목 = 1) */
  share: number
  /** 누적 80%를 채우는 데 드는 항목 */
  vital: boolean
  /** normal: 보통 · muted: 회색(미분류 · 순간 정지) · pending: 할 일이 남은 항목(사유 미입력) */
  tone: 'normal' | 'muted' | 'pending'
}

/**
 * 서버 파레토(많은 순, 개선 순서에 넣지 않는 항목은 뒤)에 막대 길이와 강조 여부를 붙인다.
 * 강조: 앞에서부터 더해 80%에 처음 닿는 항목까지. excluded 항목은 강조하지 않는다.
 */
export function markVitalFew<T>(
  items: readonly T[],
  amount: (item: T) => number,
  cumulativeRatio: (item: T) => number | null,
  excluded: (item: T) => boolean,
): { item: T; share: number; vital: boolean }[] {
  const max = Math.max(0, ...items.map(amount))
  let before = 0
  return items.map((item) => {
    // 이 줄 앞까지의 누적이 80% 미만이면 이 줄이 80%를 채우는 데 든다
    const vital = !excluded(item) && before < VITAL_FEW_RATIO
    before = cumulativeRatio(item) ?? before
    return { item, share: max > 0 ? amount(item) / max : 0, vital }
  })
}
