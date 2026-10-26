<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import '@/charts/echarts'
import { CHART_COLORS, CHART_INK } from '@/charts/theme'
import type { ProductionRow } from './production'

type Option = ComposeOption<BarSeriesOption | GridComponentOption | TooltipComponentOption | LegendComponentOption>

/** 설비별 양품 · 불량 수량을 가로 누적 막대로 그린다(위에서부터 라인 순서) */
const props = defineProps<{ rows: readonly ProductionRow[] }>()

const option = computed<Option>(() => {
  // 가로 막대의 카테고리 축은 아래에서 위로 쌓이므로 뒤집어 넣는다
  const rows = [...props.rows].reverse()
  return {
    animationDuration: 300,
    grid: { left: 8, right: 24, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, textStyle: { color: CHART_INK.secondary }, itemWidth: 12, itemHeight: 12 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'value',
      minInterval: 1, // 수량이라 0.5 같은 눈금은 쓰지 않는다
      axisLabel: { color: CHART_INK.muted },
      splitLine: { lineStyle: { color: CHART_INK.grid } },
    },
    yAxis: {
      type: 'category',
      data: rows.map((row) => row.name),
      axisLabel: { color: CHART_INK.primary },
      axisLine: { lineStyle: { color: CHART_INK.axis } },
      axisTick: { show: false },
    },
    series: [
      {
        name: '양품',
        type: 'bar',
        stack: 'count',
        barWidth: 14,
        data: rows.map((row) => row.goodCount),
        itemStyle: { color: CHART_COLORS.series1, borderColor: CHART_INK.surface, borderWidth: 1 },
      },
      {
        name: '불량',
        type: 'bar',
        stack: 'count',
        data: rows.map((row) => row.badCount),
        itemStyle: { color: CHART_COLORS.series2, borderColor: CHART_INK.surface, borderWidth: 1, borderRadius: [0, 4, 4, 0] },
      },
    ],
  }
})
</script>

<template>
  <VChart
    class="dash-chart"
    :option="option"
    autoresize
    role="img"
    aria-label="설비별 양품 · 불량 수량 막대 차트. 같은 값은 위 표에도 있습니다."
  />
</template>
