<script setup lang="ts">
import { EQUIPMENT_STATUS_STYLE } from '@/scene/colors'
import { formatPercent } from './production'
import { STATUS_ORDER, formatDuration, type Utilization } from './equipment'

/**
 * 설비별 최근 상태 비율을 100% 누적 막대로 보여 주고 RUN 비율을 숫자로 붙인다.
 * (작업지시 없는 대기도 분모에 들어가 OEE 가동률과 다르다)
 * 상태 색은 3D 화면과 같고, 범례 · 툴팁(title)에 상태 이름과 시간을 함께 적어 색만으로 읽지 않게 한다.
 */
const props = defineProps<{
  items: readonly Utilization[]
  /** 집계 기간(분), 화면 낭독용 문구에 쓴다 */
  minutes: number
}>()

/** 화면 낭독용 문구: "CNC #1 최근 60분: 가동 58분, 경고 1분, 고장 1분" */
function ariaLabel(item: Utilization): string {
  const parts = STATUS_ORDER.map((s) => `${EQUIPMENT_STATUS_STYLE[s].label} ${formatDuration(item.seconds[s])}`)
  return `${item.equipment.name} 최근 ${props.minutes}분: ${parts.join(', ')}`
}
</script>

<template>
  <div class="util">
    <ul
      class="util__legend"
      aria-label="상태 색"
    >
      <li
        v-for="status in STATUS_ORDER"
        :key="status"
      >
        <i :style="{ background: EQUIPMENT_STATUS_STYLE[status].color }" />{{ EQUIPMENT_STATUS_STYLE[status].label }}
      </li>
    </ul>
    <div
      v-for="item in items"
      :key="item.equipment.id"
      class="util__row"
    >
      <span class="util__name">{{ item.equipment.name }}</span>
      <div
        class="util__bar"
        role="img"
        :aria-label="ariaLabel(item)"
      >
        <template v-if="item.totalSeconds > 0">
          <span
            v-for="status in STATUS_ORDER"
            v-show="item.seconds[status] > 0"
            :key="status"
            class="util__segment"
            :style="{ flexGrow: item.seconds[status], background: EQUIPMENT_STATUS_STYLE[status].color }"
            :title="`${EQUIPMENT_STATUS_STYLE[status].label} ${formatDuration(item.seconds[status])} (${formatPercent(item.seconds[status] / item.totalSeconds)})`"
          />
        </template>
      </div>
      <span class="util__ratio">
        가동 <strong>{{ formatPercent(item.runRatio) }}</strong>
        <small v-if="item.totalSeconds > 0">{{ formatDuration(item.totalSeconds) }} 중</small>
      </span>
    </div>
  </div>
</template>
