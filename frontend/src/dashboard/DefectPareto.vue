<script setup lang="ts">
import { computed } from 'vue'
import type { DefectCount } from '@/api/quality'
import { formatRatio } from './oee'
import { toParetoBars, VITAL_FEW_RATIO } from './quality'

/**
 * 불량 유형 파레토: 많은 순서의 가로 막대와 막대 옆 "n개 · 누적 n%".
 * 누적 % 선은 그리지 않는다(개수와 %를 한 차트에 두면 세로축이 두 개가 된다). 누적 80%에 드는 유형은 굵게 보인다.
 */
const props = defineProps<{ defects: readonly DefectCount[] }>()

const bars = computed(() => toParetoBars(props.defects))
</script>

<template>
  <ol
    class="pareto"
    aria-label="불량 유형 파레토(많은 순)"
  >
    <li
      v-for="bar in bars"
      :key="bar.defectCode ?? 'unclassified'"
      class="pareto__row"
      :class="{ 'pareto__row--vital': bar.vital, 'pareto__row--unclassified': bar.unclassified }"
    >
      <span class="pareto__name">
        {{ bar.defectName }}
        <small v-if="bar.equipmentName">{{ bar.equipmentName }}</small>
        <small v-else-if="bar.unclassified">유형 기록 전 불량</small>
      </span>
      <span
        class="pareto__track"
        aria-hidden="true"
      ><span :style="{ width: `${Math.max(2, Math.round(bar.share * 100))}%` }" /></span>
      <span class="pareto__value">{{ bar.count }}개 · 누적 {{ formatRatio(bar.cumulativeRatio) }}</span>
    </li>
  </ol>
  <p class="oee-help">
    <template v-if="bars.some((bar) => bar.vital)">
      굵은 유형까지 더하면 불량의 {{ Math.round(VITAL_FEW_RATIO * 100) }}% 이상입니다. 이 유형부터 줄이면 효과가 큽니다.
    </template>
    미분류는 원인을 모르는 불량(유형 기록 전)이라 개수와 상관없이 맨 뒤에 둡니다.
  </p>
</template>
