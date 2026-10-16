import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import type { LossKind } from '@/domain/maintenance'
import { CanvasRenderer } from 'echarts/renderers'

/**
 * ECharts는 전체를 불러오면 크기가 커서, 쓰는 차트·컴포넌트만 등록한다.
 * 새 차트 종류(파이, 히트맵 등)를 쓰면 여기에 추가한다.
 * 한 페이지에서만 쓰는 큰 차트(간트용 custom 등)는 그 컴포넌트에서 등록해 첫 화면 번들에 넣지 않는다.
 */
use([BarChart, LineChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer])

/** 대시보드 어두운 배경에 맞춘 공통 색 */
export const CHART_COLORS = {
  text: '#8b949e',
  grid: '#21262d',
  primary: '#2f81f7',
  good: '#3fb950',
  plan: '#c9d1d9',
  warn: '#d29922',
}

/** 설비 손실 구분 색: 비계획 정지 빨강, 계획 정지 파랑, 라인 손실 노랑 */
export const LOSS_KIND_COLOR: Record<LossKind, string> = {
  unplanned: '#f85149',
  planned: '#2f81f7',
  line: '#d29922',
}
