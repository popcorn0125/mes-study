<script setup lang="ts">
import type { OeeRange } from '@/api/oee'
import { OEE_RANGES } from './oee'

/** OEE 조회 구간 선택(오늘 · 최근 1시간 · 최근 8시간) */
const range = defineModel<OeeRange>({ required: true })
</script>

<template>
  <div
    class="oee-range"
    role="group"
    aria-label="OEE 조회 구간"
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
