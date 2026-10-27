<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import '@/charts/echarts'
import { CHART_COLORS, CHART_INK } from '@/charts/theme'
import { formatDuration } from './equipment'
import { formatRatio, type TrendSlot } from './oee'

type Option = ComposeOption<BarSeriesOption | GridComponentOption | TooltipComponentOption>

/** 시각 칸마다 라인 OEE 막대. 작업지시가 없던 칸은 막대 없이 비워 둔다(0%와 다르다) */
const props = defineProps<{ slots: readonly TrendSlot[] }>()

const clock = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const option = computed<Option>(() => ({
  animationDuration: 300,
  grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params) => {
      const index = (Array.isArray(params) ? params[0] : params).dataIndex
      const slot = props.slots[index]
      const point = slot.point
      if (!point) return `${clock(slot.start)}<br/>작업지시 없음`
      return `${clock(slot.start)}<br/>라인 OEE <b>${formatRatio(point.oee)}</b><br/>`
        + `포장 양품 ${point.goodCount}개 · 계획 ${formatDuration(point.plannedSec)}`
    },
  },
  xAxis: {
    type: 'category',
    data: props.slots.map((s) => clock(s.start)),
    axisLabel: { color: CHART_INK.muted },
    axisLine: { lineStyle: { color: CHART_INK.axis } },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 100,
    interval: 25,
    axisLabel: { color: CHART_INK.muted, formatter: '{value}%' },
    splitLine: { lineStyle: { color: CHART_INK.grid } },
  },
  series: [
    {
      name: '라인 OEE',
      type: 'bar',
      barMaxWidth: 24,
      // ECharts는 '-'를 값 없음으로 그린다
      data: props.slots.map((s) => (s.point?.oee == null ? '-' : Math.round(s.point.oee * 1000) / 10)),
      itemStyle: { color: CHART_COLORS.series1, borderRadius: [4, 4, 0, 0] },
    },
  ],
}))

const ariaLabel = computed(() => {
  const filled = props.slots.filter((s) => s.point?.oee != null)
  if (filled.length === 0) return '시간대별 라인 OEE 막대 차트. 작업지시가 있던 시간이 없습니다.'
  const last = filled[filled.length - 1]
  return `시간대별 라인 OEE 막대 차트. 마지막 칸 ${clock(last.start)} ${formatRatio(last.point!.oee)}.`
})
</script>

<template>
  <VChart
    class="dash-chart oee-trend"
    :option="option"
    autoresize
    role="img"
    :aria-label="ariaLabel"
  />
</template>
