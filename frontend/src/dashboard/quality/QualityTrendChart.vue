<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { CHART_COLORS } from '@/charts/echarts'
import { hourlyQuality } from '@/domain/quality'
import { useSimStore } from '@/stores/sim'
import { CAUSE_COLOR, CAUSE_LABEL } from './display'

/**
 * 시간대별 품질 추이: 1시간마다 불량 수를 원인(공정 산포 / 설비 마모)으로 나눠 쌓고, 직행률을 선으로 겹친다.
 * CNC 마모가 쌓이는 구간에 설비 마모 불량이 늘었다가 수리 · 정비 뒤 줄어드는 것이 보인다.
 */
const sim = useSimStore()

const option = computed(() => {
  const rows = hourlyQuality(sim.state, sim.master)
  // 직행률 축은 가장 낮은 값을 10% 단위로 내린 곳에서 시작한다(소수 오차가 축 계산을 깨지 않게 반올림)
  const fpys = rows.flatMap((r) => (r.fpy === null ? [] : [r.fpy]))
  const fpyMin = fpys.length === 0 ? 0.8 : Math.max(0, Math.round((Math.floor(Math.min(...fpys) * 10) - 1)) / 10)
  const axisLabel = { color: CHART_COLORS.text }
  const splitLine = { lineStyle: { color: CHART_COLORS.grid } }
  return {
    animationDurationUpdate: 300,
    grid: { left: 44, right: 48, top: 36, bottom: 28 },
    legend: { top: 0, textStyle: { color: CHART_COLORS.text } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: rows.map((r) => `${r.hour}~${r.hour + 1}시`),
      axisLabel,
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    yAxis: [
      { type: 'value', name: '불량 수', minInterval: 1, nameTextStyle: axisLabel, axisLabel, splitLine },
      {
        type: 'value',
        name: '직행률',
        min: fpyMin,
        max: 1,
        nameTextStyle: axisLabel,
        axisLabel: { ...axisLabel, formatter: (v: number) => `${Math.round(v * 100)}%` },
        splitLine: { show: false },
      },
    ],
    series: [
      ...(['PROCESS', 'WEAR'] as const).map((cause) => ({
        name: `불량 · ${CAUSE_LABEL[cause]}`,
        type: 'bar',
        stack: 'defects',
        data: rows.map((r) => r.defects[cause]),
        itemStyle: { color: CAUSE_COLOR[cause] },
        barMaxWidth: 36,
      })),
      {
        name: '직행률(FPY)',
        type: 'line',
        yAxisIndex: 1,
        data: rows.map((r) => (r.fpy === null ? null : Number(r.fpy.toFixed(4)))),
        connectNulls: true,
        symbolSize: 6,
        lineStyle: { color: CHART_COLORS.good },
        itemStyle: { color: CHART_COLORS.good },
        tooltip: { valueFormatter: (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`) },
      },
    ],
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      시간대별 품질 추이
    </h2>
    <VChart
      class="eq-chart"
      :option="option"
      autoresize
      role="img"
      aria-label="시간대별 원인별 불량 수와 직행률 차트"
    />
    <p class="dash-panel__note muted">
      불량은 발생 시각, 직행률은 제품이 끝난(완료 · 폐기) 시각 기준입니다. 직행률 축은 0이 아닌 값에서 시작합니다.
    </p>
  </section>
</template>
