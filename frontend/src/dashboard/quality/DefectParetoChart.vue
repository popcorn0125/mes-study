<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { CHART_COLORS } from '@/charts/echarts'
import { defectPareto } from '@/domain/quality'
import { useSimStore } from '@/stores/sim'
import { createNameLookup } from '@/ui/format'
import { CAUSE_4M, CAUSE_LABEL, DISPOSITION_COLOR, DISPOSITION_LABEL } from './display'

/** 불량 유형 파레토: 유형별 건수를 큰 순서로, 재작업 · 폐기를 색으로 나누고 누적 비율을 겹친다. */
const sim = useSimStore()

const pareto = computed(() => defectPareto(sim.state, sim.master))

const option = computed(() => {
  const entries = pareto.value
  const names = createNameLookup(sim.master)
  const axisLabel = { color: CHART_COLORS.text }
  const splitLine = { lineStyle: { color: CHART_COLORS.grid } }
  return {
    animationDurationUpdate: 300,
    grid: { left: 40, right: 44, top: 24, bottom: 64 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: { dataIndex: number }[]) => {
        const { code, count, cumulative } = entries[params[0].dataIndex]
        return [
          `<b>${code.name}</b> ${count}건 · 누적 ${(cumulative * 100).toFixed(0)}%`,
          `공정: ${names.workCenter(code.workCenterId)}`,
          `원인: ${CAUSE_LABEL[code.cause]} (${CAUSE_4M[code.cause]})`,
          `처리: ${DISPOSITION_LABEL[code.disposition]}`,
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'category',
      data: entries.map((e) => e.code.name),
      axisLabel: { ...axisLabel, interval: 0, rotate: 30 },
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    yAxis: [
      { type: 'value', name: '건', minInterval: 1, nameTextStyle: axisLabel, axisLabel, splitLine },
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
        name: '불량 건수',
        type: 'bar',
        data: entries.map((e) => ({
          value: e.count,
          itemStyle: { color: DISPOSITION_COLOR[e.code.disposition], borderRadius: [3, 3, 0, 0] },
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
      불량 유형 파레토
    </h2>
    <p
      v-if="pareto.length === 0"
      class="muted"
    >
      아직 불량이 없습니다.
    </p>
    <template v-else>
      <VChart
        class="eq-chart"
        :option="option"
        autoresize
        role="img"
        aria-label="불량 유형별 건수와 누적 비율 파레토 차트"
      />
      <ul class="loss-legend">
        <li
          v-for="(label, disposition) in DISPOSITION_LABEL"
          :key="disposition"
          :style="{ '--tone': DISPOSITION_COLOR[disposition] }"
        >
          {{ label }} 유형
        </li>
      </ul>
    </template>
  </section>
</template>
