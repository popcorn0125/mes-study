/** 배속 옵션: 실제 1초에 진행할 시뮬레이션 초 */
export const SPEED_OPTIONS = [1, 5, 10, 30, 60] as const

/** 한 프레임에 처리할 최대 tick 수. 탭이 잠깐 멈췄다 돌아와도 한꺼번에 몰아서 돌지 않게 막는다. */
export const MAX_TICKS_PER_FRAME = 240

/**
 * 실제 경과 시간(초)과 배속으로 이번 프레임에 돌릴 tick 수를 계산한다.
 * 1초에 못 미치는 나머지는 다음 프레임으로 넘긴다.
 */
export function advanceClock(
  carry: number,
  realDeltaSec: number,
  speed: number,
): { ticks: number; carry: number } {
  const total = carry + Math.max(0, realDeltaSec) * speed
  const ticks = Math.min(Math.floor(total), MAX_TICKS_PER_FRAME)
  // 상한에 걸려 버린 시간은 이월하지 않는다(따라잡기 폭주 방지).
  const rest = ticks === MAX_TICKS_PER_FRAME ? 0 : total - ticks
  return { ticks, carry: rest }
}

/** 시뮬레이션 초를 "D일 HH:MM:SS" 형식으로 표시한다. */
export function formatSimTime(sec: number): string {
  const day = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const hms = [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
  return day > 0 ? `${day}일 ${hms}` : hms
}
