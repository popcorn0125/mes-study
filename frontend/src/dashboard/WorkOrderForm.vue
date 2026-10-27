<script setup lang="ts">
import { ref, watch } from 'vue'
import { createWorkOrder, type Item, type WorkOrderDetail } from '@/api/workOrders'
import { errorMessage } from '@/api/client'

/** 작업지시 등록 폼. 등록하면 계획(PLANNED) 상태로 만들어지고, 하달은 목록에서 따로 한다 */
const props = defineProps<{ items: readonly Item[] }>()
const emit = defineEmits<{ created: [workOrder: WorkOrderDetail]; cancel: [] }>()

const itemCode = ref(props.items[0]?.itemCode ?? '')
const plannedQty = ref(20)
const priority = ref(5)
/** datetime-local 값(브라우저 시간대 "2026-10-28T15:00"). 비우면 납기 없음 */
const dueAt = ref('')
const error = ref('')
const submitting = ref(false)

// 품목 목록이 늦게 오면 첫 품목을 고른다
watch(() => props.items, (items) => {
  if (!itemCode.value && items.length > 0) itemCode.value = items[0].itemCode
})

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    const created = await createWorkOrder({
      itemCode: itemCode.value,
      plannedQty: plannedQty.value,
      priority: priority.value,
      ...(dueAt.value ? { dueAt: new Date(dueAt.value).toISOString() } : {}),
    })
    emit('created', created)
  } catch (e) {
    error.value = errorMessage(e, '등록하지 못했습니다')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form
    class="wo-form"
    @submit.prevent="submit"
  >
    <label class="wo-form__field">
      <span>품목</span>
      <select
        v-model="itemCode"
        required
      >
        <option
          v-for="item in items"
          :key="item.itemCode"
          :value="item.itemCode"
        >
          {{ item.itemName }}
        </option>
      </select>
    </label>
    <label class="wo-form__field">
      <span>지시 수량</span>
      <input
        v-model.number="plannedQty"
        type="number"
        min="1"
        max="10000"
        step="1"
        required
      >
    </label>
    <label class="wo-form__field">
      <span>우선순위 <small>(9가 가장 먼저)</small></span>
      <select v-model.number="priority">
        <option
          v-for="n in 10"
          :key="n - 1"
          :value="n - 1"
        >
          {{ n - 1 }}
        </option>
      </select>
    </label>
    <label class="wo-form__field">
      <span>납기 <small>(선택)</small></span>
      <input
        v-model="dueAt"
        type="datetime-local"
      >
    </label>
    <div class="wo-form__actions">
      <button
        type="submit"
        class="btn btn--primary"
        :disabled="submitting || !itemCode"
      >
        등록
      </button>
      <button
        type="button"
        class="btn"
        @click="emit('cancel')"
      >
        닫기
      </button>
    </div>
    <p
      v-if="error"
      class="wo-form__error"
      role="alert"
    >
      {{ error }}
    </p>
  </form>
</template>
