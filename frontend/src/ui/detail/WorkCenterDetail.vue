<script setup lang="ts">
import { computed } from 'vue'
import { utilization, waitingSince, workCenterUtilization } from '@/domain/kpi'
import { EQUIPMENT_STATUS_STYLE, bufferFillColor } from '@/scene/colors'
import { useSelectionStore } from '@/stores/selection'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, formatDuration, percent } from '../format'
import WorkCenterActions from './WorkCenterActions.vue'

const props = defineProps<{ id: string }>()
const sim = useSimStore()
const selection = useSelectionStore()

const view = computed(() => {
  const wc = sim.master.workCenters.find((w) => w.id === props.id)
  if (!wc) return null
  const state = sim.state
  const names = createNameLookup(sim.master)
  const queue = state.buffers[wc.id]
  const override = state.cycleTimeOverride[wc.id]
  return {
    name: wc.name,
    count: queue.length,
    capacity: wc.inBufferCap,
    fillColor: bufferFillColor(queue.length / wc.inBufferCap),
    utilization: percent(workCenterUtilization(state, wc.id)),
    cycleTimes: sim.master.routings.flatMap((r) =>
      r.operations
        .filter((op) => op.workCenterId === wc.id)
        .map((op) => ({ item: names.item(r.itemId), standard: op.cycleTime, actual: override ?? op.cycleTime })),
    ),
    equipment: state.equipment
      .filter((eq) => eq.workCenterId === wc.id)
      .map((eq) => ({
        id: eq.id,
        name: names.equipment(eq.id),
        status: EQUIPMENT_STATUS_STYLE[eq.status],
        utilization: percent(utilization(eq)),
      })),
    queue: queue.map((unitId) => {
      const unit = state.units[unitId]
      return { id: unitId, item: names.item(unit.itemId), waiting: formatDuration(state.time - waitingSince(unit)) }
    }),
  }
})
</script>

<template>
  <div v-if="view">
    <header class="detail-header">
      <span class="detail-kind">작업장</span>
      <h2>{{ view.name }}</h2>
    </header>

    <dl class="kv">
      <dt>입력 버퍼</dt>
      <dd>
        <span :style="{ color: view.fillColor }">■</span> {{ view.count }} / {{ view.capacity }}
      </dd>
      <dt>평균 가동률</dt>
      <dd>{{ view.utilization }}</dd>
    </dl>

    <div class="detail-section">
      <h3>사이클타임</h3>
      <table class="mini-table">
        <thead>
          <tr>
            <th>품목</th>
            <th>표준</th>
            <th>현재</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="ct in view.cycleTimes"
            :key="ct.item"
          >
            <td>{{ ct.item }}</td>
            <td>{{ ct.standard }}초</td>
            <td :class="{ 'text-warn': ct.actual !== ct.standard }">
              {{ ct.actual }}초
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="detail-section">
      <h3>설비 {{ view.equipment.length }}대</h3>
      <ul class="link-list">
        <li
          v-for="eq in view.equipment"
          :key="eq.id"
        >
          <button
            class="link-btn"
            @click="selection.select({ kind: 'equipment', id: eq.id })"
          >
            {{ eq.name }}
          </button>
          <span :style="{ color: eq.status.color }">● {{ eq.status.label }}</span>
          <span class="muted">가동률 {{ eq.utilization }}</span>
        </li>
      </ul>
    </div>

    <div class="detail-section">
      <h3>대기 중인 Unit</h3>
      <ul
        v-if="view.queue.length"
        class="link-list"
      >
        <li
          v-for="u in view.queue"
          :key="u.id"
        >
          <button
            class="link-btn"
            @click="selection.select({ kind: 'unit', id: u.id })"
          >
            {{ u.id }}
          </button>
          <span>{{ u.item }}</span>
          <span class="muted">{{ u.waiting }} 대기</span>
        </li>
      </ul>
      <p
        v-else
        class="hint"
      >
        비어 있음
      </p>
    </div>

    <WorkCenterActions :work-center-id="props.id" />
  </div>
</template>
