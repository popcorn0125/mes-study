<script setup lang="ts">
import { computed } from 'vue'
import type { DefectCount } from '@/api/quality'
import { formatRatio } from './oee'
import ParetoBars from './ParetoBars.vue'
import type { ParetoRow } from './pareto'
import { toParetoBars, VITAL_FEW_RATIO } from './quality'

/** 불량 유형 파레토: 많은 순서의 가로 막대와 막대 옆 "n개 · 누적 n%". 미분류는 회색으로 맨 뒤 */
const props = defineProps<{ defects: readonly DefectCount[] }>()

const bars = computed(() => toParetoBars(props.defects))
const rows = computed<ParetoRow[]>(() => bars.value.map((bar) => ({
  key: bar.defectCode ?? 'unclassified',
  name: bar.defectName,
  note: bar.equipmentName ?? (bar.unclassified ? '유형 기록 전 불량' : null),
  value: `${bar.count}개 · 누적 ${formatRatio(bar.cumulativeRatio)}`,
  share: bar.share,
  vital: bar.vital,
  tone: bar.unclassified ? 'muted' : 'normal',
})))
</script>

<template>
  <ParetoBars
    :rows="rows"
    label="불량 유형 파레토(많은 순)"
  />
  <p class="oee-help">
    <template v-if="bars.some((bar) => bar.vital)">
      굵은 유형까지 더하면 불량의 {{ Math.round(VITAL_FEW_RATIO * 100) }}% 이상입니다. 이 유형부터 줄이면 효과가 큽니다.
    </template>
    미분류는 원인을 모르는 불량(유형 기록 전)이라 개수와 상관없이 맨 뒤에 둡니다.
  </p>
</template>
