/**
 * 차트 색. 대시보드는 어두운 테마라 어두운 패널 배경(#161b22)에서 색약 구분 · 대비를 검사한 값을 쓴다.
 * 계열 색은 항목(양품 · 불량 등)을 구분하는 용도이고, 설비 상태(가동 · 경고 · 정지) 색과는 따로 둔다.
 */
export const CHART_COLORS = {
  series1: '#3987e5',
  series2: '#d95926',
} as const

/** 글자 · 축 · 격자 색(패널 배경 기준) */
export const CHART_INK = {
  surface: '#161b22',
  primary: '#e6edf3',
  secondary: '#c9d1d9',
  muted: '#8b949e',
  axis: '#30363d',
  grid: '#21262d',
} as const
