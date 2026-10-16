<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { CHART_COLORS, LOSS_KIND_COLOR } from '@/charts/echarts'
import { lossBreakdown } from '@/domain/maintenance'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, formatDuration } from '@/ui/format'

/**
 * 설비별 시간 구성: 가동 · 비계획 정지 · 계획 정지 · 라인 손실 · 휴지를 100% 누적 막대로 그린다.
 * OEE가 높은 설비도 라인 손실(공급 대기·막힘)이 크면 그 설비가 아니라 흐름(병목)이 문제다.
 */
const sim = useSimStore()

const PARTS = [
  { key: 'run', name: '가동', color: CHART_COLORS.good },
  { key: 'unplanned', name: '비계획 정지', color: LOSS_KIND_COLOR.unplanned },
  { key: 'planned', name: '계획 정지', color: LOSS_KIND_COLOR.planned },
  { key: 'line', name: '라인 손실', color: LOSS_KIND_COLOR.line },
  { key: 'idle', name: '휴지', color: '#6e7681' },
] as const

const option = computed(() => {
  const names = createNameLookup(sim.master)
  const rows = sim.state.equipment.map((eq) => {
    const parts = lossBreakdown(eq)
    const total = Object.values(parts).reduce((s, v) => s + v, 0) || 1
    return { name: names.equipment(eq.id), parts, total }
  })
  const axisLabel = { color: CHART_COLORS.text }
  return {
    animationDurationUpdate: 300,
    grid: { left: 76, right: 16, top: 36, bottom: 24 },
    legend: { top: 0, textStyle: { color: CHART_COLORS.text } },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: { dataIndex: number }[]) => {
        const row = rows[params[0].dataIndex]
        return [
          row.name,
          ...PARTS.map(
            (p) => `${p.name} ${((row.parts[p.key] / row.total) * 100).toFixed(1)}% (${formatDuration(row.parts[p.key])})`,
          ),
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'value',
      max: 100,
      axisLabel: { ...axisLabel, formatter: '{value}%' },
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((r) => r.name),
      axisLabel,
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    series: PARTS.map((p) => ({
      name: p.name,
      type: 'bar',
      stack: 'time',
      data: rows.map((r) => Number(((r.parts[p.key] / r.total) * 100).toFixed(1))),
      itemStyle: { color: p.color },
      barMaxWidth: 18,
    })),
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      설비별 시간 구성
    </h2>
    <VChart
      class="eq-chart"
      :option="option"
      autoresize
      role="img"
      aria-label="설비별 가동, 비계획 정지, 계획 정지, 라인 손실, 휴지 시간 비율 누적 막대 차트"
    />
    <p class="dash-panel__note muted">
      라인 손실(공급 대기·막힘)은 설비 OEE에 들어가지 않습니다. 설비 탓이 아니라 앞뒤 공정의 흐름 탓이기 때문입니다.
    </p>
  </section>
</template>
