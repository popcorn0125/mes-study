<script setup lang="ts">
import type { OeeRange } from '@/api/oee'
import { OEE_RANGES } from './oee'

/** 조회 구간 선택(오늘 · 최근 1시간 · 최근 8시간). 품질 화면도 같은 구간을 쓴다 */
const range = defineModel<OeeRange>({ required: true })
withDefaults(defineProps<{ label?: string }>(), { label: 'OEE 조회 구간' })
</script>

<template>
  <div
    class="oee-range"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="option in OEE_RANGES"
      :key="option.value"
      type="button"
      class="btn btn--small"
      :class="{ 'oee-range--active': range === option.value }"
      :aria-pressed="range === option.value"
      @click="range = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
