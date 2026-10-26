import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

/**
 * 대시보드가 쓰는 ECharts 기능만 등록한다(전체를 불러오면 번들이 커진다).
 * 선(온도 · 진동 추이) · 막대(실적 · 상태 비율)와 축 · 툴팁 · 범례만 쓴다.
 * 차트를 그리는 컴포넌트는 이 파일을 import한 뒤 vue-echarts의 VChart를 쓴다.
 */
use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])
