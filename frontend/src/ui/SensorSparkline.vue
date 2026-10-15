<script setup lang="ts">
import { computed } from 'vue'

/** 센서 이력용 작은 선 그래프. 경고·위험 임계값을 가로선으로 함께 그린다. */
const props = defineProps<{
  values: number[]
  warning: number
  critical: number
  label: string
  unit: string
}>()

const WIDTH = 300
const HEIGHT = 56

const chart = computed(() => {
  const values = props.values
  const max = Math.max(props.critical * 1.1, ...values)
  const min = Math.min(0, ...values)
  const y = (v: number) => HEIGHT - ((v - min) / (max - min)) * HEIGHT
  const step = values.length > 1 ? WIDTH / (values.length - 1) : 0
  return {
    points: values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
    warningY: y(props.warning),
    criticalY: y(props.critical),
  }
})
</script>

<template>
  <figure class="sparkline">
    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      preserveAspectRatio="none"
      role="img"
      :aria-label="`${label} 최근 추이, 경고 ${warning}${unit}, 위험 ${critical}${unit}`"
    >
      <line
        x1="0"
        :y1="chart.criticalY"
        :x2="WIDTH"
        :y2="chart.criticalY"
        class="sparkline__critical"
      />
      <line
        x1="0"
        :y1="chart.warningY"
        :x2="WIDTH"
        :y2="chart.warningY"
        class="sparkline__warning"
      />
      <polyline
        v-if="values.length > 1"
        :points="chart.points"
        class="sparkline__line"
      />
    </svg>
    <figcaption>
      {{ label }} — 경고 {{ warning }}{{ unit }} · 위험 {{ critical }}{{ unit }}
      <span v-if="values.length < 2"> (기록 대기 중)</span>
    </figcaption>
  </figure>
</template>
