<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { CHART_COLORS } from '@/charts/echarts'
import { equipmentSpec } from '@/domain/equipment'
import { formatSimTime } from '@/sim/clock'
import { useSimStore } from '@/stores/sim'
import { createNameLookup } from '@/ui/format'

/**
 * 선택한 설비의 센서 추이: 위 칸 온도, 아래 칸 진동(최근 1시간, 30초 간격).
 * 점선은 경고(노랑)·위험(빨강) 임계값이다. 마모가 쌓이면 진동이 먼저 오르고 온도가 뒤따른다.
 */
const props = defineProps<{ equipmentId: string }>()
const sim = useSimStore()

const view = computed(() => {
  const eq = sim.state.equipment.find((e) => e.id === props.equipmentId)
  if (!eq) return null
  const spec = equipmentSpec(sim.master, eq.id, eq.workCenterId)?.sensor
  return { name: createNameLookup(sim.master).equipment(eq.id), history: eq.sensorHistory, spec }
})

function limitLines(limits: { warning: number; critical: number }) {
  return {
    symbol: 'none',
    silent: true,
    label: { color: CHART_COLORS.text, position: 'insideEndTop', fontSize: 10 },
    data: [
      { yAxis: limits.warning, lineStyle: { color: CHART_COLORS.warn, type: 'dashed' }, label: { formatter: '경고' } },
      { yAxis: limits.critical, lineStyle: { color: '#f85149', type: 'dashed' }, label: { formatter: '위험' } },
    ],
  }
}

const option = computed(() => {
  const v = view.value
  if (!v?.spec) return null
  const labels = v.history.map((h) => formatSimTime(h.time).slice(0, 5))
  const axisLabel = { color: CHART_COLORS.text }
  const splitLine = { lineStyle: { color: CHART_COLORS.grid } }
  const axisLine = { lineStyle: { color: CHART_COLORS.grid } }
  // 임계선이 늘 보이도록 위험값보다 조금 위까지 축을 잡는다
  const axisMax = (critical: number) => (extent: { max: number }) => Math.ceil(Math.max(extent.max, critical * 1.1))
  return {
    animation: false,
    grid: [
      { left: 44, right: 16, top: 24, height: '34%' },
      { left: 44, right: 16, bottom: 28, height: '34%' },
    ],
    tooltip: { trigger: 'axis' },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    xAxis: [
      { type: 'category', gridIndex: 0, data: labels, axisLabel: { show: false }, axisLine },
      { type: 'category', gridIndex: 1, data: labels, axisLabel, axisLine },
    ],
    yAxis: [
      { type: 'value', gridIndex: 0, name: '온도(°C)', nameTextStyle: axisLabel, axisLabel, splitLine, scale: true, max: axisMax(v.spec.temperature.critical) },
      { type: 'value', gridIndex: 1, name: '진동(mm/s)', nameTextStyle: axisLabel, axisLabel, splitLine, min: 0, max: axisMax(v.spec.vibration.critical) },
    ],
    series: [
      {
        name: '온도',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: v.history.map((h) => Number(h.temperature.toFixed(1))),
        symbol: 'none',
        lineStyle: { color: '#ff7b72' },
        itemStyle: { color: '#ff7b72' },
        markLine: limitLines(v.spec.temperature),
      },
      {
        name: '진동',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: v.history.map((h) => Number(h.vibration.toFixed(2))),
        symbol: 'none',
        lineStyle: { color: CHART_COLORS.primary },
        itemStyle: { color: CHART_COLORS.primary },
        markLine: limitLines(v.spec.vibration),
      },
    ],
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      센서 추이 <span
        v-if="view"
        class="muted"
      >· {{ view.name }}</span>
    </h2>
    <p
      v-if="!option"
      class="muted"
    >
      이 설비에는 센서가 없습니다.
    </p>
    <VChart
      v-else
      class="eq-chart eq-chart--tall"
      :option="option"
      autoresize
      role="img"
      :aria-label="`${view?.name} 온도와 진동 최근 1시간 추이, 경고·위험 임계선 포함`"
    />
  </section>
</template>
