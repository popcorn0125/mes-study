<script setup lang="ts">
import { computed } from 'vue'
import { reliabilityStats } from '@/domain/maintenance'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, formatDuration, percent } from '@/ui/format'

/** 고장 지표: 설비별 고장 횟수, MTBF, MTTR, 고유 가용도 */
const props = defineProps<{ selectedId: string }>()
const emit = defineEmits<{ select: [id: string] }>()
const sim = useSimStore()

const rows = computed(() => {
  const names = createNameLookup(sim.master)
  return sim.state.equipment.map((eq) => {
    const stats = reliabilityStats(sim.state, eq.id)
    return {
      id: eq.id,
      name: names.equipment(eq.id),
      failures: stats.failures,
      mtbf: stats.mtbf === null ? '—' : formatDuration(stats.mtbf),
      mttr: stats.mttr === null ? '—' : formatDuration(stats.mttr),
      availability: stats.availability === null ? '—' : percent(stats.availability, 1),
    }
  })
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      고장 지표
    </h2>
    <table class="dash-table">
      <thead>
        <tr>
          <th scope="col">
            설비
          </th>
          <th scope="col">
            고장
          </th>
          <th
            scope="col"
            title="평균 고장 간격 = 가동 시간 ÷ 고장 횟수"
          >
            MTBF
          </th>
          <th
            scope="col"
            title="평균 수리 시간 = 끝난 수리 시간의 평균"
          >
            MTTR
          </th>
          <th
            scope="col"
            title="MTBF ÷ (MTBF + MTTR)"
          >
            가용도
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in rows"
          :key="r.id"
          :class="{ 'dash-table__row--selected': r.id === props.selectedId }"
          @click="emit('select', r.id)"
        >
          <th scope="row">
            {{ r.name }}
          </th>
          <td>{{ r.failures }}회</td>
          <td>{{ r.mtbf }}</td>
          <td>{{ r.mttr }}</td>
          <td>{{ r.availability }}</td>
        </tr>
      </tbody>
    </table>
    <p class="dash-panel__note muted">
      고장이 한두 번뿐이면 MTBF·MTTR은 믿기 어려운 값입니다. 실무에서는 몇 달 치 고장 이력을 모아 계산합니다.
    </p>
  </section>
</template>
