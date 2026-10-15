/** 경과 시간(초)을 "1시간 5분", "3분 20초", "45초" 형태로 표시한다. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}시간 ${m}분`
  if (m > 0) return `${m}분 ${r}초`
  return `${r}초`
}
