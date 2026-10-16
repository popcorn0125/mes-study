<script setup lang="ts">
import { computed } from 'vue'
import { useSelectionStore } from '@/stores/selection'
import { useSimStore } from '@/stores/sim'
import { formatSimTime } from '@/sim/clock'
import { UNIT_STATUS_LABEL, createNameLookup, formatDuration } from '../format'

const props = defineProps<{ id: string }>()
const sim = useSimStore()
const selection = useSelectionStore()

const view = computed(() => {
  const state = sim.state
  const unit = state.units[props.id]
  if (!unit) return null
  const names = createNameLookup(sim.master)
  const operations = sim.master.routings.find((r) => r.itemId === unit.itemId)?.operations ?? []

  let location: { text: string; target: { kind: 'equipment' | 'workCenter'; id: string } | null }
  const onEquipment = state.equipment.find((eq) => eq.unitId === unit.id)
  if (onEquipment) {
    const verb = onEquipment.status === 'BLOCKED' ? '에서 후공정 대기' : '에서 가공 중'
    location = { text: `${names.equipment(onEquipment.id)}${verb}`, target: { kind: 'equipment', id: onEquipment.id } }
  } else if (unit.status === 'QUEUED') {
    const wcId = operations[unit.opIndex].workCenterId
    location = { text: `${names.workCenter(wcId)} 버퍼 대기`, target: { kind: 'workCenter', id: wcId } }
  } else {
    location = { text: unit.status === 'COMPLETED' ? '출하 완료' : '폐기', target: null }
  }

  const end = unit.finishedAt ?? state.time
  const codes = new Map(sim.master.defectCodes.map((c) => [c.id, c.name]))
  // 재작업하면 같은 공정이 두 번 기록되므로, 양품으로 마친 공정 수로 진행도를 센다
  const passed = new Set(unit.history.filter((h) => h.result === 'GOOD').map((h) => h.opSeq)).size
  return {
    workOrderId: unit.workOrderId,
    item: names.item(unit.itemId),
    status: UNIT_STATUS_LABEL[unit.status],
    location,
    releasedAt: formatSimTime(unit.releasedAt),
    elapsed: formatDuration(end - unit.releasedAt),
    finished: unit.finishedAt !== null,
    progress: `${passed} / ${operations.length}`,
    history: unit.history.map((h) => ({
      key: `${h.opSeq}-${h.start}`,
      op: `${h.opSeq} ${names.workCenter(operations.find((o) => o.seq === h.opSeq)?.workCenterId ?? '')}`,
      equipment: names.equipment(h.equipmentId),
      start: formatSimTime(h.start),
      duration: formatDuration(h.end - h.start),
      ok: h.result === 'GOOD',
      result: h.result === 'GOOD' ? '양품' : (codes.get(h.defectCode ?? '') ?? '불량'),
      rework: h.rework,
    })),
  }
})
</script>

<template>
  <div v-if="view">
    <header class="detail-header">
      <span class="detail-kind">Unit (재공품)</span>
      <h2>{{ props.id }}</h2>
      <span class="badge">{{ view.status }}</span>
    </header>

    <dl class="kv">
      <dt>작업지시</dt>
      <dd>
        <button
          class="link-btn"
          @click="selection.select({ kind: 'workOrder', id: view.workOrderId })"
        >
          {{ view.workOrderId }}
        </button>
      </dd>
      <dt>품목</dt>
      <dd>{{ view.item }}</dd>
      <dt>현재 위치</dt>
      <dd>
        <button
          v-if="view.location.target"
          class="link-btn"
          @click="selection.select(view.location.target)"
        >
          {{ view.location.text }}
        </button>
        <span v-else>{{ view.location.text }}</span>
      </dd>
      <dt>공정 진행</dt>
      <dd>{{ view.progress }}</dd>
      <dt>투입 시각</dt>
      <dd>{{ view.releasedAt }}</dd>
      <dt>{{ view.finished ? '리드타임' : '경과 시간' }}</dt>
      <dd>{{ view.elapsed }}</dd>
    </dl>

    <div class="detail-section">
      <h3>공정 이력 (추적성)</h3>
      <table
        v-if="view.history.length"
        class="mini-table"
      >
        <thead>
          <tr>
            <th>공정</th>
            <th>설비</th>
            <th>시작</th>
            <th>소요</th>
            <th>판정</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="h in view.history"
            :key="h.key"
          >
            <td>{{ h.op }}<span v-if="h.rework"> (재작업)</span></td>
            <td>{{ h.equipment }}</td>
            <td>{{ h.start }}</td>
            <td>{{ h.duration }}</td>
            <td :class="h.ok ? 'text-ok' : 'text-ng'">
              {{ h.result }}
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-else
        class="hint"
      >
        아직 완료한 공정이 없습니다.
      </p>
    </div>
  </div>
  <p
    v-else
    class="hint"
  >
    Unit을 찾을 수 없습니다.
  </p>
</template>
