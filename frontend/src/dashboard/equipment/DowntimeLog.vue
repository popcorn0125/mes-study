<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DowntimeReason } from '@/domain/types'
import { downtimeLog } from '@/domain/maintenance'
import { formatSimTime } from '@/sim/clock'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, formatDuration } from '@/ui/format'

/** 비가동 이력: 고장 · 예방정비 · 자재 부족 정지를 최신순으로. 고장은 실제 수리 시간과 표준 시간을 함께 보여 준다. */
const props = defineProps<{ selectedId: string }>()
const sim = useSimStore()
const onlySelected = ref(false)

const REASON: Record<DowntimeReason, { label: string; kind: string; tone: string }> = {
  BREAKDOWN: { label: '고장', kind: '비계획', tone: 'critical' },
  MATERIAL: { label: '자재 부족', kind: '비계획', tone: 'critical' },
  PM: { label: '예방정비', kind: '계획', tone: 'info' },
}

const entries = computed(() => {
  const names = createNameLookup(sim.master)
  const now = sim.state.time
  return downtimeLog(sim.state, onlySelected.value ? props.selectedId : null, 30).map((d) => ({
    id: d.id,
    start: formatSimTime(d.start),
    equipment: names.equipment(d.equipmentId),
    reason: REASON[d.reason],
    duration: d.end === null ? `진행 중 ${formatDuration(now - d.start)}` : formatDuration(d.end - d.start),
    expected: d.expected === null ? null : `표준 ${Math.round(d.expected / 60)}분`,
  }))
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title dash-panel__title--row">
      비가동 이력
      <label class="dash-toggle">
        <input
          v-model="onlySelected"
          type="checkbox"
        >
        선택한 설비만
      </label>
    </h2>
    <p
      v-if="entries.length === 0"
      class="muted"
    >
      기록된 비가동이 없습니다.
    </p>
    <ul
      v-else
      class="alarm-list"
    >
      <li
        v-for="e in entries"
        :key="e.id"
        class="alarm downtime"
        :class="`alarm--${e.reason.tone}`"
      >
        <span class="alarm__badge">{{ e.reason.kind }}</span>
        <time class="alarm__time">{{ e.start }}</time>
        <span>
          {{ e.equipment }} {{ e.reason.label }} · {{ e.duration }}
          <span
            v-if="e.expected"
            class="muted"
          >({{ e.expected }})</span>
        </span>
      </li>
    </ul>
  </section>
</template>
