<script setup lang="ts">
import { computed } from 'vue'
import { useSelectionStore } from '@/stores/selection'
import { useSimStore } from '@/stores/sim'
import { formatSimTime } from '@/sim/clock'
import { UNIT_STATUS_LABEL, WORK_ORDER_STATUS_LABEL, createNameLookup, formatDuration } from '../format'

const props = defineProps<{ id: string }>()
const sim = useSimStore()
const selection = useSelectionStore()

const view = computed(() => {
  const state = sim.state
  const wo = state.workOrders.find((w) => w.id === props.id)
  if (!wo) return null
  const names = createNameLookup(sim.master)
  const inLine = Object.values(state.units)
    .filter((u) => u.workOrderId === wo.id && (u.status === 'QUEUED' || u.status === 'PROCESSING'))
    .map((u) => ({ id: u.id, status: UNIT_STATUS_LABEL[u.status] }))
  const start = wo.releasedAt
  return {
    item: names.item(wo.itemId),
    status: WORK_ORDER_STATUS_LABEL[wo.status],
    priority: wo.priority,
    qty: wo.qty,
    released: wo.releasedQty,
    good: wo.goodQty,
    scrap: wo.scrapQty,
    createdAt: formatSimTime(wo.createdAt),
    releasedAt: start === null ? '—' : formatSimTime(start),
    completedAt: wo.completedAt === null ? '—' : formatSimTime(wo.completedAt),
    elapsed: start === null ? '—' : formatDuration((wo.completedAt ?? state.time) - start),
    inLine,
  }
})
</script>

<template>
  <div v-if="view">
    <header class="detail-header">
      <span class="detail-kind">작업지시</span>
      <h2>{{ props.id }}</h2>
      <span class="badge">{{ view.status }}</span>
    </header>

    <dl class="kv">
      <dt>품목</dt>
      <dd>{{ view.item }}</dd>
      <dt>우선순위</dt>
      <dd>P{{ view.priority }}</dd>
      <dt>지시 / 투입</dt>
      <dd>{{ view.qty }} / {{ view.released }}</dd>
      <dt>양품 / 불량</dt>
      <dd>{{ view.good }} / {{ view.scrap }}</dd>
      <dt>생성</dt>
      <dd>{{ view.createdAt }}</dd>
      <dt>하달</dt>
      <dd>{{ view.releasedAt }}</dd>
      <dt>완료</dt>
      <dd>{{ view.completedAt }}</dd>
      <dt>소요 시간</dt>
      <dd>{{ view.elapsed }}</dd>
    </dl>

    <div class="detail-section">
      <h3>라인 안의 Unit {{ view.inLine.length }}개</h3>
      <ul
        v-if="view.inLine.length"
        class="chip-list"
      >
        <li
          v-for="u in view.inLine"
          :key="u.id"
        >
          <button
            class="chip"
            @click="selection.select({ kind: 'unit', id: u.id })"
          >
            {{ u.id }} · {{ u.status }}
          </button>
        </li>
      </ul>
      <p
        v-else
        class="hint"
      >
        없음
      </p>
    </div>
  </div>
</template>
