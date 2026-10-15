<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WorkOrder } from '@/domain/types'
import { useSelectionStore } from '@/stores/selection'
import { useSimStore } from '@/stores/sim'
import { formatSimTime } from '@/sim/clock'
import { WORK_ORDER_STATUS_LABEL, createNameLookup } from './format'

const sim = useSimStore()
const selection = useSelectionStore()

// ── 생성 폼 ─────────────────────────────────────────────
const newItemId = ref(sim.master.items[0]?.id ?? '')
const newQty = ref(20)
const newPriority = ref(0)
const formError = ref<string | null>(null)

function createWorkOrder(release: boolean) {
  formError.value = sim.dispatch({
    type: 'CREATE_WORK_ORDER',
    itemId: newItemId.value,
    qty: Math.floor(newQty.value),
    priority: Math.floor(newPriority.value),
    release,
  })
}

// ── 목록 ────────────────────────────────────────────────
const rows = computed(() => {
  const names = createNameLookup(sim.master)
  return sim.state.workOrders.map((wo) => {
    const inLine = wo.releasedQty - wo.goodQty - wo.scrapQty
    return {
      id: wo.id,
      item: names.item(wo.itemId),
      status: wo.status,
      statusLabel: WORK_ORDER_STATUS_LABEL[wo.status],
      priority: wo.priority,
      qty: wo.qty,
      good: wo.goodQty,
      scrap: wo.scrapQty,
      // 진행 막대 비율: 양품 / 불량 / 라인 안
      goodPct: (wo.goodQty / wo.qty) * 100,
      scrapPct: (wo.scrapQty / wo.qty) * 100,
      inLinePct: (inLine / wo.qty) * 100,
      due: wo.dueTime === null ? null : formatSimTime(wo.dueTime),
      // 완료 시각 또는 현재 시각이 납기를 넘었으면 지연
      late: wo.dueTime !== null && (wo.completedAt ?? sim.state.time) > wo.dueTime,
      canRelease: wo.status === 'PLANNED' || wo.status === 'HELD',
      canHold: wo.status === 'RELEASED' || wo.status === 'IN_PROGRESS',
      done: wo.status === 'COMPLETED',
    }
  })
})

const activeCount = computed(() => rows.value.filter((r) => !r.done).length)

function release(id: string) {
  sim.dispatch({ type: 'RELEASE_WORK_ORDER', workOrderId: id })
}

function hold(id: string) {
  sim.dispatch({ type: 'HOLD_WORK_ORDER', workOrderId: id })
}

function changePriority(id: string, current: WorkOrder['priority'], delta: number) {
  sim.dispatch({ type: 'SET_WORK_ORDER_PRIORITY', workOrderId: id, priority: current + delta })
}
</script>

<template>
  <section
    class="panel side-panel work-orders"
    aria-labelledby="wo-title"
  >
    <h2 id="wo-title">
      작업지시 <small>진행 {{ activeCount }} / 전체 {{ rows.length }}</small>
    </h2>

    <form
      class="wo-form"
      @submit.prevent="createWorkOrder(false)"
    >
      <label>
        <span>품목</span>
        <select v-model="newItemId">
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
          v-model.number="newQty"
          type="number"
          min="1"
          max="9999"
        >
      </label>
      <label>
        <span>우선순위</span>
        <input
          v-model.number="newPriority"
          type="number"
          min="0"
          max="99"
        >
      </label>
      <div class="wo-form__actions">
        <button
          type="submit"
          class="btn"
        >
          생성
        </button>
        <button
          type="button"
          class="btn btn--primary"
          @click="createWorkOrder(true)"
        >
          생성 후 하달
        </button>
      </div>
      <p
        v-if="formError"
        class="form-error"
        role="alert"
      >
        {{ formError }}
      </p>
    </form>

    <ul class="wo-list">
      <li
        v-for="row in rows"
        :key="row.id"
        class="wo-row"
        :class="{ 'wo-row--selected': selection.isSelected('workOrder', row.id), 'wo-row--done': row.done }"
      >
        <button
          class="wo-row__main"
          @click="selection.select({ kind: 'workOrder', id: row.id })"
        >
          <span class="wo-row__head">
            <strong>{{ row.id }}</strong>
            <span>{{ row.item }}</span>
            <span
              class="badge"
              :class="`badge--wo-${row.status.toLowerCase()}`"
            >{{ row.statusLabel }}</span>
          </span>
          <span
            class="progress"
            role="progressbar"
            :aria-valuenow="row.good + row.scrap"
            :aria-valuemax="row.qty"
            :aria-label="`${row.id} 진척`"
          >
            <span
              class="progress__good"
              :style="{ width: `${row.goodPct}%` }"
            />
            <span
              class="progress__scrap"
              :style="{ width: `${row.scrapPct}%` }"
            />
            <span
              class="progress__inline"
              :style="{ width: `${row.inLinePct}%` }"
            />
          </span>
          <span class="wo-row__meta">
            양품 {{ row.good }} · 불량 {{ row.scrap }} / 지시 {{ row.qty }}
            <span
              v-if="row.due"
              :class="{ 'text-ng': row.late }"
            > · 납기 {{ row.due }}{{ row.late ? ' (지연)' : '' }}</span>
          </span>
        </button>
        <div
          v-if="!row.done"
          class="wo-row__actions"
        >
          <span
            class="priority"
            :aria-label="`우선순위 ${row.priority}`"
          >
            <button
              class="btn btn--icon"
              :aria-label="`${row.id} 우선순위 올리기`"
              @click="changePriority(row.id, row.priority, 1)"
            >▲</button>
            <span>P{{ row.priority }}</span>
            <button
              class="btn btn--icon"
              :aria-label="`${row.id} 우선순위 내리기`"
              :disabled="row.priority <= 0"
              @click="changePriority(row.id, row.priority, -1)"
            >▼</button>
          </span>
          <button
            v-if="row.canRelease"
            class="btn btn--small btn--primary"
            @click="release(row.id)"
          >
            {{ row.status === 'HELD' ? '재하달' : '하달' }}
          </button>
          <button
            v-if="row.canHold"
            class="btn btn--small"
            @click="hold(row.id)"
          >
            보류
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
