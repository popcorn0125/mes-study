<script setup lang="ts">
import type {
  CustomSeriesRenderItemAPI,
  CustomSeriesRenderItemParams,
  CustomSeriesRenderItemReturn,
  ECElementEvent,
} from 'echarts'
import { CustomChart } from 'echarts/charts'
import { use } from 'echarts/core'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { CHART_COLORS } from '@/charts/echarts'
import type { WorkOrderForecast } from '@/domain/workOrders'
import { useSimStore } from '@/stores/sim'
import { WORK_ORDER_STATUS_COLOR, clock } from './display'

/**
 * 작업지시 일정(간트): 작업지시마다 대기(하달 → 첫 투입) · 작업(첫 투입 → 완료 또는 지금)을 실선 막대로,
 * 예상(예상 시작 → 예상 완료)을 점선 막대로, 납기를 ◆로 그린다.
 */
const props = defineProps<{ etas: Map<string, WorkOrderForecast>; selectedId: string | null }>()

// 간트용 custom 시리즈는 이 페이지에서만 쓰므로 여기서 등록한다(작업지시 페이지를 열 때 함께 불러온다)
use([CustomChart])
const emit = defineEmits<{ select: [id: string] }>()
const sim = useSimStore()

const HOUR = 3600
const WAIT_COLOR = '#3d444d'
const FORECAST_COLOR = 'rgba(47, 129, 247, 0.18)'

interface Segment {
  value: [row: number, start: number, end: number]
  name: string
  color: string
  forecast: boolean
  opacity: number
}
interface DueMark {
  value: [row: number, time: number]
  color: string
}

/** 하달된 작업지시만 그린다(계획 상태는 일정이 없다) */
const orders = computed(() => sim.state.workOrders.filter((wo) => wo.releasedAt !== null))

const option = computed(() => {
  const now = sim.state.time
  const list = orders.value
  const segments: Segment[] = []
  const dues: DueMark[] = []
  let end = sim.state.plan ? sim.state.plan.startTime + sim.state.plan.duration : HOUR

  list.forEach((wo, row) => {
    const opacity = props.selectedId !== null && wo.id !== props.selectedId ? 0.45 : 1
    const started = wo.startedAt ?? now
    if (started > wo.releasedAt!) {
      segments.push({ value: [row, wo.releasedAt!, started], name: '대기', color: WAIT_COLOR, forecast: false, opacity })
    }
    if (wo.startedAt !== null) {
      const color = WORK_ORDER_STATUS_COLOR[wo.status === 'COMPLETED' ? 'IN_PROGRESS' : wo.status]
      segments.push({ value: [row, wo.startedAt, wo.completedAt ?? now], name: '작업', color, forecast: false, opacity })
    }
    const forecast = props.etas.get(wo.id)
    if (forecast) {
      segments.push({ value: [row, forecast.start, forecast.end], name: '예상', color: FORECAST_COLOR, forecast: true, opacity })
      end = Math.max(end, forecast.end)
    }
    if (wo.dueTime !== null) {
      const late = (wo.completedAt ?? forecast?.end ?? now) > wo.dueTime
      dues.push({ value: [row, wo.dueTime], color: late ? '#f85149' : CHART_COLORS.plan })
      end = Math.max(end, wo.dueTime)
    }
  })
  end = Math.ceil(Math.max(end, now) / HOUR) * HOUR

  function bar(params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI): CustomSeriesRenderItemReturn {
    const seg = segments[params.dataIndex]
    const [x1, y] = api.coord([seg.value[1], seg.value[0]])
    const [x2] = api.coord([seg.value[2], seg.value[0]])
    const height = (api.size!([0, 1]) as number[])[1] * 0.56
    return {
      type: 'rect',
      shape: { x: x1, y: y - height / 2, width: Math.max(x2 - x1, 1), height },
      style: seg.forecast
        ? { fill: seg.color, stroke: CHART_COLORS.primary, lineWidth: 1, lineDash: [4, 3], opacity: seg.opacity }
        : { fill: seg.color, opacity: seg.opacity },
    }
  }

  function diamond(params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI): CustomSeriesRenderItemReturn {
    const mark = dues[params.dataIndex]
    const [x, y] = api.coord([mark.value[1], mark.value[0]])
    const r = 6
    return {
      type: 'polygon',
      shape: { points: [[x, y - r], [x + r, y], [x, y + r], [x - r, y]] },
      style: { fill: mark.color },
    }
  }

  const axisLabel = { color: CHART_COLORS.text }
  return {
    animation: false,
    grid: { left: 64, right: 16, top: 24, bottom: 28 },
    tooltip: {
      formatter: (p: { seriesIndex: number; dataIndex: number }) => {
        if (p.seriesIndex === 0) {
          const seg = segments[p.dataIndex]
          return `${list[seg.value[0]].id} ${seg.name}<br/>${clock(seg.value[1])} → ${clock(seg.value[2])}`
        }
        const mark = dues[p.dataIndex]
        return `${list[mark.value[0]].id} 납기 ${clock(mark.value[1])}`
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: end,
      interval: HOUR,
      axisLabel: { ...axisLabel, formatter: (v: number) => clock(v) },
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: list.map((wo) => wo.id),
      axisLabel: {
        ...axisLabel,
        formatter: (id: string) => (id === props.selectedId ? `{sel|${id}}` : id),
        rich: { sel: { color: '#e6edf3', fontWeight: 'bold' } },
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    series: [
      {
        type: 'custom',
        renderItem: bar,
        encode: { x: [1, 2], y: 0 },
        data: segments.map((seg) => seg.value),
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: CHART_COLORS.primary, type: 'solid' },
          // y축을 뒤집어(inverse) 그려서 start 쪽이 차트 위다
          label: { formatter: '지금', color: CHART_COLORS.primary, position: 'start' },
          data: [{ xAxis: now }],
        },
      },
      {
        type: 'custom',
        renderItem: diamond,
        encode: { x: 1, y: 0 },
        data: dues.map((mark) => mark.value),
        z: 3,
      },
    ],
  }
})

const height = computed(() => `${Math.max(orders.value.length, 4) * 26 + 48}px`)

function onClick(p: ECElementEvent) {
  const wo = Array.isArray(p.value) ? orders.value[p.value[0] as number] : undefined
  if (wo) emit('select', wo.id)
}
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      작업지시 일정
    </h2>
    <p
      v-if="orders.length === 0"
      class="muted"
    >
      하달된 작업지시가 없습니다.
    </p>
    <template v-else>
      <VChart
        :style="{ height }"
        :option="option"
        autoresize
        role="img"
        aria-label="작업지시별 대기·작업·예상 구간과 납기를 보여 주는 간트 차트"
        @click="onClick"
      />
      <ul class="loss-legend">
        <li :style="{ '--tone': WAIT_COLOR }">
          대기 (하달 → 첫 투입)
        </li>
        <li :style="{ '--tone': WORK_ORDER_STATUS_COLOR.IN_PROGRESS }">
          작업 (첫 투입 → 완료)
        </li>
        <li
          class="wo-legend-forecast"
          :style="{ '--tone': FORECAST_COLOR }"
        >
          예상 (표준 능력 기준)
        </li>
        <li class="wo-legend-due">
          ◆ 납기 (빨강: 넘김·넘길 예상)
        </li>
      </ul>
    </template>
  </section>
</template>
