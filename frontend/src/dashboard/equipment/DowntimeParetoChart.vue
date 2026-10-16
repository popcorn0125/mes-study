<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { CHART_COLORS, LOSS_KIND_COLOR } from '@/charts/echarts'
import { LOSS_KIND_LABEL, downtimePareto } from '@/domain/maintenance'
import { useSimStore } from '@/stores/sim'
import { formatDuration } from '@/ui/format'

/**
 * 비가동 사유 파레토: 라인 전체 비가동 시간을 사유별로 큰 순서로 그리고 누적 비율을 겹친다.
 * 막대 색으로 비계획 정지 · 계획 정지 · 라인 손실을 구분한다.
 */
const sim = useSimStore()

const pareto = computed(() => downtimePareto(sim.state))

const option = computed(() => {
  const entries = pareto.value
  const axisLabel = { color: CHART_COLORS.text }
  const splitLine = { lineStyle: { color: CHART_COLORS.grid } }
  return {
    animationDurationUpdate: 300,
    grid: { left: 52, right: 44, top: 24, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: { dataIndex: number }[]) => {
        const e = entries[params[0].dataIndex]
        return `${e.label} (${LOSS_KIND_LABEL[e.kind]})<br/>${formatDuration(e.seconds)} · 누적 ${(e.cumulative * 100).toFixed(0)}%`
      },
    },
    xAxis: {
      type: 'category',
      data: entries.map((e) => e.label),
      axisLabel,
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    yAxis: [
      { type: 'value', name: '분', nameTextStyle: axisLabel, axisLabel, splitLine },
      {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { ...axisLabel, formatter: '{value}%' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '비가동 시간',
        type: 'bar',
        data: entries.map((e) => ({
          value: Math.round(e.seconds / 60),
          itemStyle: { color: LOSS_KIND_COLOR[e.kind], borderRadius: [3, 3, 0, 0] },
        })),
        barMaxWidth: 40,
      },
      {
        name: '누적 비율',
        type: 'line',
        yAxisIndex: 1,
        data: entries.map((e) => Math.round(e.cumulative * 100)),
        symbolSize: 6,
        lineStyle: { color: CHART_COLORS.plan },
        itemStyle: { color: CHART_COLORS.plan },
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: CHART_COLORS.text, type: 'dashed' },
          label: { formatter: '80%', color: CHART_COLORS.text, position: 'insideEndTop' },
          data: [{ yAxis: 80 }],
        },
      },
    ],
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      비가동 사유 파레토
    </h2>
    <p
      v-if="pareto.length === 0"
      class="muted"
    >
      아직 비가동 시간이 없습니다.
    </p>
    <template v-else>
      <VChart
        class="eq-chart"
        :option="option"
        autoresize
        role="img"
        aria-label="비가동 사유별 시간과 누적 비율 파레토 차트"
      />
      <ul class="loss-legend">
        <li
          v-for="(label, kind) in LOSS_KIND_LABEL"
          :key="kind"
          :style="{ '--tone': LOSS_KIND_COLOR[kind] }"
        >
          {{ label }}
        </li>
      </ul>
    </template>
  </section>
</template>
