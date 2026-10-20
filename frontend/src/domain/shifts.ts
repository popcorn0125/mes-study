const HOUR = 3600

/**
 * 교대 달력. 시뮬레이션 경과 시각을 8시간씩(하루 3교대) 나눈다.
 * 1교대 00:00 ~ 08:00, 2교대 08:00 ~ 16:00, 3교대 16:00 ~ 24:00, 다음 날 1교대 …
 * 실제 공장 시각(예: 주간 06:00 시작)은 쓰지 않는다(계획서 8장 결정 2).
 */

export const SHIFT_LENGTH = 8 * HOUR
export const SHIFTS_PER_DAY = 3

export interface Shift {
  /** 0부터 세는 교대 번호(전체) */
  index: number
  /** 0부터 세는 날짜 차수 */
  day: number
  /** 그날의 몇 번째 교대(1 ~ 3) */
  no: number
  /** "1교대", 둘째 날부터 "2일차 1교대" */
  label: string
  start: number
  end: number
}

export function shiftAt(index: number): Shift {
  const day = Math.floor(index / SHIFTS_PER_DAY)
  const no = (index % SHIFTS_PER_DAY) + 1
  return {
    index,
    day,
    no,
    label: day === 0 ? `${no}교대` : `${day + 1}일차 ${no}교대`,
    start: index * SHIFT_LENGTH,
    end: (index + 1) * SHIFT_LENGTH,
  }
}

/**
 * 지금까지 시작된 교대 목록(오래된 순). 교대 경계 정각에는 새 교대가 아직 0초라 넣지 않는다.
 * 시작 전(time = 0)에도 첫 교대는 넣는다.
 */
export function shiftsUntil(time: number): Shift[] {
  const count = Math.max(1, Math.ceil(time / SHIFT_LENGTH))
  return Array.from({ length: count }, (_, i) => shiftAt(i))
}

/** 교대가 끝났는지(마감) */
export function isClosed(shift: Shift, now: number): boolean {
  return now >= shift.end
}

/** 집계 구간 끝: 끝난 교대는 교대 끝, 진행 중이면 지금 */
export function shiftRangeEnd(shift: Shift, now: number): number {
  return Math.min(shift.end, Math.max(now, shift.start))
}
