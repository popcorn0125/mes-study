<script setup lang="ts">
import { ref } from 'vue'
import { useSimStore } from '@/stores/sim'
import { clock } from './display'

/** 작업지시 생성: 품목 · 수량 · 우선순위 · 납기(지금부터 N시간 후). 긴급 주문을 넣어 투입 순서 규칙을 시험해 볼 수 있다. */
const emit = defineEmits<{ created: [] }>()
const sim = useSimStore()

const itemId = ref(sim.master.items[0]?.id ?? '')
const qty = ref(20)
const priority = ref(0)
/** 비우면 납기 없음 */
const dueHours = ref<number | ''>(1)
const release = ref(true)
const message = ref<{ text: string; error: boolean } | null>(null)

function submit() {
  const hours = dueHours.value === '' ? null : Number(dueHours.value)
  if (hours !== null && !(hours > 0)) {
    message.value = { text: '납기는 0보다 큰 시간으로 입력하세요(비우면 납기 없음)', error: true }
    return
  }
  const dueTime = hours === null ? undefined : sim.state.time + Math.round(hours * 3600)
  const error = sim.dispatch({
    type: 'CREATE_WORK_ORDER',
    itemId: itemId.value,
    qty: Math.floor(qty.value),
    priority: Math.floor(priority.value),
    dueTime,
    release: release.value,
  })
  message.value = error
    ? { text: error, error: true }
    : {
        text: `작업지시를 만들었습니다${release.value ? '(하달)' : '(계획 상태)'}${dueTime === undefined ? '' : ` · 납기 ${clock(dueTime)}`}`,
        error: false,
      }
  if (!error) emit('created')
}
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      작업지시 생성
    </h2>
    <form
      class="wo-create"
      @submit.prevent="submit"
    >
      <label>
        <span>품목</span>
        <select v-model="itemId">
          <option
            v-for="item in sim.master.items"
            :key="item.id"
            :value="item.id"
          >
            {{ item.name }}
          </option>
        </select>
      </label>
      <label>
        <span>수량</span>
        <input
          v-model.number="qty"
          type="number"
          min="1"
          max="9999"
          required
        >
      </label>
      <label>
        <span>우선순위</span>
        <input
          v-model.number="priority"
          type="number"
          min="-99"
          max="99"
        >
      </label>
      <label>
        <span>납기 (지금부터 시간)</span>
        <input
          v-model.number="dueHours"
          type="number"
          min="0.1"
          step="0.1"
          placeholder="없음"
        >
      </label>
      <label class="dash-toggle wo-create__release">
        <input
          v-model="release"
          type="checkbox"
        >
        바로 하달
      </label>
      <button
        type="submit"
        class="btn btn--primary"
      >
        생성
      </button>
    </form>
    <p
      v-if="message"
      :class="message.error ? 'form-error' : 'dash-panel__note muted'"
      :role="message.error ? 'alert' : 'status'"
    >
      {{ message.text }}
    </p>
    <p class="dash-panel__note muted">
      해 보기: 납기 1시간짜리 긴급 작업지시를 만들고 투입 순서를 "납기 빠른 순"으로 바꿔 보세요. 우선순위 규칙에서는 맨 뒤에 서지만, EDD에서는 앞쪽 작업지시를 제치고 먼저 투입됩니다.
    </p>
  </section>
</template>
