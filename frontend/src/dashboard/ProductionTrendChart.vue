<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { CHART_COLORS } from '@/charts/echarts'
import { hourlyOutput, plannedUph } from '@/domain/production'
import { useSimStore } from '@/stores/sim'

/**
 * 시간대별 생산 추이. 같은 시간축을 쓰는 두 칸으로 나눈다.
 * - 위: 누적 계획 vs 누적 실적. 실적선이 계획선 아래로 벌어지면 계획 미달이다.
 * - 아래: 시간대별 양품 수. 점선은 시간당 계획 수량.
 */
const sim = useSimStore()

const option = computed(() => {
  const state = sim.state
  const buckets = hourlyOutput(state)
  const hourlyPlan = state.plan ? plannedUph(state.plan) : null
  const labels = buckets.map((b) => `${b.hour + 1}시간`)
  const axisLabel = { color: CHART_COLORS.text }
  const splitLine = { lineStyle: { color: CHART_COLORS.grid } }
  const axisLine = { lineStyle: { color: CHART_COLORS.grid } }

  return {
    animationDurationUpdate: 300,
    grid: [
      { left: 48, right: 16, top: 36, height: '46%' },
      { left: 48, right: 16, bottom: 28, height: '26%' },
    ],
    tooltip: { trigger: 'axis' },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    legend: { top: 0, textStyle: { color: CHART_COLORS.text } },
    xAxis: [
      { type: 'category', gridIndex: 0, data: labels, axisLabel: { show: false }, axisLine },
      { type: 'category', gridIndex: 1, data: labels, axisLabel, axisLine },
    ],
    yAxis: [
      { type: 'value', gridIndex: 0, name: '누적(대)', nameTextStyle: axisLabel, axisLabel, splitLine },
      {
        type: 'value',
        gridIndex: 1,
        name: '대/시간',
        nameTextStyle: axisLabel,
        axisLabel,
        splitLine,
        splitNumber: 3,
        // 막대가 낮아도 시간당 계획선이 축 안에 보이도록
        max: (extent: { max: number }) => Math.ceil(Math.max(extent.max, (hourlyPlan ?? 0) * 1.2)),
      },
    ],
    series: [
      {
        name: '누적 계획',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: buckets.map((b) => (b.cumulativePlan === null ? null : Math.round(b.cumulativePlan))),
        symbol: 'none',
        lineStyle: { color: CHART_COLORS.plan, type: 'dashed' },
        itemStyle: { color: CHART_COLORS.plan },
      },
      {
        name: '누적 실적',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: buckets.map((b) => b.cumulativeGood),
        symbolSize: 6,
        lineStyle: { color: CHART_COLORS.good, width: 2 },
        itemStyle: { color: CHART_COLORS.good },
      },
      {
        name: '시간대별 양품',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: buckets.map((b) => b.good),
        itemStyle: { color: CHART_COLORS.primary, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 36,
        markLine:
          hourlyPlan === null
            ? undefined
            : {
                symbol: 'none',
                silent: true,
                lineStyle: { color: CHART_COLORS.warn, type: 'dashed' },
                label: { formatter: `계획 ${hourlyPlan.toFixed(0)}`, color: CHART_COLORS.warn, position: 'insideEndTop' },
                data: [{ yAxis: hourlyPlan }],
              },
      },
    ],
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      시간대별 생산 추이
    </h2>
    <VChart
      class="trend-chart"
      :option="option"
      autoresize
      role="img"
      aria-label="시간대별 양품 수와 누적 계획 대비 누적 실적 차트"
    />
  </section>
</template>
