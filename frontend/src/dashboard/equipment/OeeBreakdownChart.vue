<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { CHART_COLORS } from '@/charts/echarts'
import { oee } from '@/domain/kpi'
import { useSimStore } from '@/stores/sim'
import { createNameLookup } from '@/ui/format'

/**
 * 설비별 OEE 분해: 가용성 · 성능 · 품질 · OEE를 나란히 그려 어느 요소가 OEE를 깎는지 본다.
 * 값이 대부분 90% 이상이라 0부터 그리면 차이가 안 보여, 세로축은 가장 낮은 값 근처에서 시작한다.
 */
const sim = useSimStore()

const SERIES = [
  { key: 'availability', name: '가용성', color: CHART_COLORS.primary },
  { key: 'performance', name: '성능', color: '#a371f7' },
  { key: 'quality', name: '품질', color: CHART_COLORS.good },
  { key: 'oee', name: 'OEE', color: CHART_COLORS.warn },
] as const

const option = computed(() => {
  const names = createNameLookup(sim.master)
  const rows = sim.state.equipment.map((eq) => ({ name: names.equipment(eq.id), ...oee(eq) }))
  // 가장 낮은 값을 10% 단위로 내린 곳에서 세로축을 시작한다
  const lowest = Math.min(1, ...rows.flatMap((r) => SERIES.map((s) => r[s.key])))
  const min = Math.min(90, Math.floor(lowest * 10) * 10)
  const axisLabel = { color: CHART_COLORS.text }
  return {
    animationDurationUpdate: 300,
    grid: { left: 44, right: 12, top: 36, bottom: 28 },
    legend: { top: 0, textStyle: { color: CHART_COLORS.text } },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v.toFixed(1)}%` },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.name),
      axisLabel,
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    yAxis: {
      type: 'value',
      min,
      max: 100,
      axisLabel: { ...axisLabel, formatter: '{value}%' },
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    series: SERIES.map((s) => ({
      name: s.name,
      type: 'bar',
      data: rows.map((r) => Number((r[s.key] * 100).toFixed(1))),
      itemStyle: { color: s.color, borderRadius: [2, 2, 0, 0] },
      barMaxWidth: 14,
    })),
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      설비별 OEE 분해
    </h2>
    <VChart
      class="eq-chart"
      :option="option"
      autoresize
      role="img"
      aria-label="설비별 가용성, 성능, 품질, OEE 막대 차트"
    />
    <p class="dash-panel__note muted">
      세로축은 0이 아니라 가장 낮은 값 근처에서 시작합니다.
    </p>
  </section>
</template>
