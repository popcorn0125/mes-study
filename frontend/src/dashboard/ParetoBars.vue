<script setup lang="ts">
import type { ParetoRow } from './pareto'

/**
 * 파레토 가로 막대 목록(품질 불량 유형 · 비가동 사유가 같이 쓴다).
 * 누적 % 선은 그리지 않는다(값과 %를 한 차트에 두면 세로축이 두 개가 된다). 누적 80%에 드는 항목은 굵게 보인다.
 */
defineProps<{ rows: readonly ParetoRow[]; label: string }>()
</script>

<template>
  <ol
    class="pareto"
    :aria-label="label"
  >
    <li
      v-for="row in rows"
      :key="row.key"
      class="pareto__row"
      :class="{
        'pareto__row--vital': row.vital,
        'pareto__row--unclassified': row.tone === 'muted',
        'pareto__row--pending': row.tone === 'pending',
      }"
    >
      <span class="pareto__name">
        {{ row.name }}
        <small v-if="row.note">{{ row.note }}</small>
      </span>
      <span
        class="pareto__track"
        aria-hidden="true"
      ><span :style="{ width: `${Math.max(2, Math.round(row.share * 100))}%` }" /></span>
      <span class="pareto__value">{{ row.value }}</span>
    </li>
  </ol>
</template>
