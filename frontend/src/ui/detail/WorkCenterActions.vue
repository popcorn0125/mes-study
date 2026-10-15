<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSimStore } from '@/stores/sim'

/** 작업장 단위 조치: 사이클타임 변경, 설비 추가 */
const props = defineProps<{ workCenterId: string }>()
const sim = useSimStore()

const override = computed(() => sim.state.cycleTimeOverride[props.workCenterId] ?? null)
const standard = computed(() => {
  const values = sim.master.routings
    .flatMap((r) => r.operations)
    .filter((op) => op.workCenterId === props.workCenterId)
    .map((op) => op.cycleTime)
  return values.length ? Math.max(...values) : 60
})

const cycleTime = ref(override.value ?? standard.value)
const error = ref<string | null>(null)
watch(
  () => props.workCenterId,
  () => {
    cycleTime.value = override.value ?? standard.value
    error.value = null
  },
)

function applyCycleTime() {
  error.value = sim.dispatch({
    type: 'SET_CYCLE_TIME',
    workCenterId: props.workCenterId,
    cycleTime: Math.floor(cycleTime.value),
  })
}

function addEquipment() {
  error.value = sim.dispatch({ type: 'ADD_EQUIPMENT', workCenterId: props.workCenterId })
}
</script>

<template>
  <div class="detail-section">
    <h3>조치</h3>
    <form
      class="inline-form"
      @submit.prevent="applyCycleTime"
    >
      <label>
        <span>사이클타임(초)</span>
        <input
          v-model.number="cycleTime"
          type="number"
          min="1"
          max="3600"
        >
      </label>
      <button
        type="submit"
        class="btn btn--small"
      >
        적용
      </button>
    </form>
    <p class="hint">
      작업장의 모든 설비·품목에 적용됩니다. 이미 가공 중인 Unit은 기존 시간으로 끝납니다.
    </p>
    <button
      class="btn btn--small"
      @click="addEquipment"
    >
      ＋ 설비 1대 추가
    </button>
    <p
      v-if="error"
      class="form-error"
      role="alert"
    >
      {{ error }}
    </p>
  </div>
</template>
