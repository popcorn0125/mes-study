<script setup lang="ts">
import { MarkAreaComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { CHART_COLORS } from '@/charts/echarts'
import { stockTrend } from '@/domain/materials'
import { useSimStore } from '@/stores/sim'
import { STOCK_STATUS_COLOR, clock } from './display'

/**
 * 재고 추이: 1분 간격 재고(계단선), 발주점 · 안전재고 기준선, 발주 → 입고 구간(조달 리드타임)을 띠로 그린다.
 * 소비로 줄고 입고로 뛰어오르는 톱니 모양이 재고 모형이다.
 */
const props = defineProps<{ materialId: string }>()
const sim = useSimStore()

// 리드타임 띠(markArea)는 이 페이지에서만 쓰므로 여기서 등록한다
use([MarkAreaComponent])

const NORMAL_LEAD = 'rgba(47, 129, 247, 0.12)'
const EXPEDITE_LEAD = 'rgba(210, 153, 34, 0.18)'

const material = computed(() => sim.master.materials.find((m) => m.id === props.materialId))

const option = computed(() => {
  const m = material.value
  if (!m) return {}
  const { points, orders } = stockTrend(sim.state, m.id)
  const now = sim.state.time
  const axisLabel = { color: CHART_COLORS.text }
  // 입고 예정까지 보이도록 축을 늘린다
  const end = Math.max(3600, now, ...orders.filter((po) => po.receivedAt === null).map((po) => po.eta))
  return {
    animation: false,
    grid: { left: 52, right: 24, top: 36, bottom: 28 },
    legend: { top: 0, textStyle: { color: CHART_COLORS.text } },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      formatter: (params: { value: [number, number] }[]) => {
        const [t, v] = params[0].value
        return `${clock(t)}<br/>재고 ${v}${m.unit}`
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: end,
      interval: end > 4 * 3600 ? 3600 : 1800,
      axisLabel: { ...axisLabel, formatter: (v: number) => clock(v) },
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: `재고(${m.unit})`,
      min: 0,
      nameTextStyle: axisLabel,
      axisLabel,
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    series: [
      {
        name: '현재고',
        type: 'line',
        step: 'end',
        showSymbol: false,
        data: points,
        lineStyle: { color: CHART_COLORS.primary, width: 2 },
        itemStyle: { color: CHART_COLORS.primary },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { color: CHART_COLORS.text, formatter: '{b} {c}', position: 'insideEndTop' },
          data: [
            { name: '발주점', yAxis: m.reorderPoint, lineStyle: { color: CHART_COLORS.plan, type: 'dashed' } },
            { name: '안전재고', yAxis: m.safetyStock, lineStyle: { color: STOCK_STATUS_COLOR.BELOW_SAFETY, type: 'dashed' } },
          ],
        },
        markArea: {
          silent: true,
          label: { color: CHART_COLORS.text, fontSize: 11, position: 'insideTop' },
          data: orders.map((po) => [
            {
              name: po.expedited ? '긴급' : '리드타임',
              xAxis: po.orderedAt,
              itemStyle: { color: po.expedited ? EXPEDITE_LEAD : NORMAL_LEAD },
            },
            { xAxis: po.receivedAt ?? po.eta },
          ]),
        },
      },
    ],
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      재고 추이 <small class="muted">{{ material?.name }}</small>
    </h2>
    <VChart
      class="eq-chart"
      :option="option"
      autoresize
      role="img"
      :aria-label="`${material?.name ?? ''} 재고 추이 차트`"
    />
    <p class="dash-panel__note muted">
      파란 띠는 발주부터 입고까지(조달 리드타임), 노란 띠는 긴급 발주입니다. 재고가 발주점에 닿으면 발주가 나가고, 리드타임 동안 안전재고 쪽으로 내려가다 입고로 다시 올라갑니다.
    </p>
  </section>
</template>
