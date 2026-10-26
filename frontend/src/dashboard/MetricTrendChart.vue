<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { ComposeOption } from 'echarts/core'
import type { LineSeriesOption } from 'echarts/charts'
import type { GridComponentOption, MarkAreaComponentOption, TooltipComponentOption } from 'echarts/components'
import '@/charts/echarts'
import { CHART_COLORS, CHART_INK } from '@/charts/theme'

type Option = ComposeOption<LineSeriesOption | GridComponentOption | TooltipComponentOption | MarkAreaComponentOption>

/**
 * 측정값 하나(온도 또는 진동)의 최근 추이 선 차트. 정상 범위는 옅은 띠로 깔아 벗어난 구간이 보이게 한다.
 * 온도 · 진동은 단위가 달라 한 차트에 축 두 개로 겹치지 않고 이 컴포넌트를 두 번 쓴다.
 */
const props = defineProps<{
  /** [시각(ms), 값] 목록(시간순). 값이 없는 행은 null */
  points: readonly (readonly [number, number | null])[]
  /** 차트 이름(툴팁 · 접근성 문구) */
  label: string
  unit: string
  /** 정상 범위 [최소, 최대] */
  range: readonly [number, number]
  /** 가로축 시작 · 끝(ms). 데이터가 적어도 같은 기간을 보이게 고정한다 */
  from: number
  to: number
}>()

const option = computed<Option>(() => ({
  animation: false,
  grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
  tooltip: {
    trigger: 'axis',
    valueFormatter: (value) => (typeof value === 'number' ? `${value.toFixed(1)} ${props.unit}` : '–'),
  },
  xAxis: {
    type: 'time',
    min: props.from,
    max: props.to,
    axisLabel: { color: CHART_INK.muted, hideOverlap: true },
    axisLine: { lineStyle: { color: CHART_INK.axis } },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'value',
    scale: true,
    name: props.unit,
    nameTextStyle: { color: CHART_INK.muted, align: 'right' },
    axisLabel: { color: CHART_INK.muted },
    splitLine: { lineStyle: { color: CHART_INK.grid } },
  },
  series: [
    {
      name: props.label,
      type: 'line',
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 2, color: CHART_COLORS.series1 },
      itemStyle: { color: CHART_COLORS.series1 },
      data: props.points.map(([t, v]) => [t, v]),
      markArea: {
        silent: true,
        itemStyle: { color: 'rgba(63, 185, 80, 0.08)' },
        label: { show: true, position: 'insideTopLeft', color: CHART_INK.muted, fontSize: 11, formatter: '정상 범위' },
        data: [[{ yAxis: props.range[0] }, { yAxis: props.range[1] }]],
      },
    },
  ],
}))
</script>

<template>
  <VChart
    class="dash-chart dash-chart--trend"
    :option="option"
    autoresize
    role="img"
    :aria-label="`${label} 최근 추이 선 차트(정상 범위 ${range[0]}~${range[1]} ${unit})`"
  />
</template>
