<script setup lang="ts">
import { computed } from 'vue'
import type { SimEvent } from '@/domain/types'
import { formatSimTime } from '@/sim/clock'
import { type Selection, useSelectionStore } from '@/stores/selection'
import { useSimStore } from '@/stores/sim'

const MAX_SHOWN = 50

const sim = useSimStore()
const selection = useSelectionStore()

/** 이벤트가 가리키는 대상. 클릭하면 상세 패널로 연다. */
function targetOf(event: SimEvent): Selection | null {
  switch (event.type) {
    case 'UNIT_SCRAPPED':
      return { kind: 'unit', id: event.refId }
    case 'EQUIPMENT_ADDED':
    case 'SENSOR_WARNING':
    case 'SENSOR_CRITICAL':
    case 'EQUIPMENT_DOWN':
    case 'EQUIPMENT_REPAIRED':
    case 'MAINTENANCE_REQUESTED':
    case 'MAINTENANCE_STARTED':
    case 'MAINTENANCE_DONE':
      return { kind: 'equipment', id: event.refId }
    case 'MATERIAL_SHORTAGE':
    case 'MATERIAL_LOW':
    case 'MATERIAL_ORDERED':
    case 'MATERIAL_RECEIVED':
      return { kind: 'material', id: event.refId }
    case 'CYCLE_TIME_CHANGED':
      return { kind: 'workCenter', id: event.refId }
    case 'PLAN_SET':
    case 'DISPATCH_RULE_CHANGED':
      return null
    case 'WORK_ORDER_CREATED':
    case 'WORK_ORDER_RELEASED':
    case 'WORK_ORDER_HELD':
    case 'WORK_ORDER_PRIORITY_CHANGED':
    case 'WORK_ORDER_COMPLETED':
      return { kind: 'workOrder', id: event.refId }
  }
}

const entries = computed(() => {
  const events = sim.state.events
  const result = []
  for (let i = events.length - 1; i >= 0 && result.length < MAX_SHOWN; i--) {
    const e = events[i]
    result.push({ key: `${i}-${e.time}-${e.refId}`, time: formatSimTime(e.time), severity: e.severity, message: e.message, target: targetOf(e) })
  }
  return result
})
</script>

<template>
  <section
    class="panel side-panel event-log"
    aria-labelledby="event-log-title"
  >
    <h2 id="event-log-title">
      이벤트 로그
    </h2>
    <ol
      v-if="entries.length"
      aria-live="polite"
    >
      <li
        v-for="e in entries"
        :key="e.key"
        :class="`event--${e.severity}`"
      >
        <button
          class="event-row"
          :disabled="!e.target"
          @click="e.target && selection.select(e.target)"
        >
          <time>{{ e.time }}</time>
          <span>{{ e.message }}</span>
        </button>
      </li>
    </ol>
    <p
      v-else
      class="hint"
    >
      아직 이벤트가 없습니다.
    </p>
  </section>
</template>
