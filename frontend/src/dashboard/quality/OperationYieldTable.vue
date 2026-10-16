<script setup lang="ts">
import { computed } from 'vue'
import { operationYields } from '@/domain/quality'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, formatDuration, percent } from '@/ui/format'

/** 공정별 수율: 1차 합격률 · 재작업 · 폐기 · 재작업 시간(숨은 공장), 맨 아래에 RTY를 곱셈식으로 보여 준다. */
const sim = useSimStore()

const view = computed(() => {
  const names = createNameLookup(sim.master)
  const { rows, rty } = operationYields(sim.state, sim.master)
  const shown = rows.filter((r) => r.firstPass > 0)
  return {
    rows: rows.map((r) => ({
      ...r,
      name: names.workCenter(r.workCenterId),
      rate: percent(r.firstPassRate, 1),
      reworkTime: r.reworkTime === 0 ? '—' : formatDuration(r.reworkTime),
    })),
    rty: percent(rty, 1),
    formula: shown.map((r) => `${names.workCenter(r.workCenterId)} ${percent(r.firstPassRate, 1)}`).join(' × '),
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      공정별 수율
    </h2>
    <div class="wo-table-wrap">
      <table class="dash-table q-yield">
        <thead>
          <tr>
            <th scope="col">
              공정
            </th>
            <th
              scope="col"
              title="재작업 가공을 뺀 첫 가공 수"
            >
              1차 가공
            </th>
            <th scope="col">
              1차 합격
            </th>
            <th
              scope="col"
              title="1차 합격 ÷ 1차 가공"
            >
              1차 합격률
            </th>
            <th scope="col">
              재작업 (성공)
            </th>
            <th scope="col">
              폐기
            </th>
            <th
              scope="col"
              title="재작업에 쓴 설비 시간. 이 시간만큼 새 제품을 가공하지 못했다(숨은 공장)"
            >
              재작업 시간
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in view.rows"
            :key="r.workCenterId"
          >
            <th scope="row">
              {{ r.name }}
            </th>
            <td>{{ r.firstPass }}</td>
            <td>{{ r.firstGood }}</td>
            <td>{{ r.rate }}</td>
            <td>{{ r.reworks }} ({{ r.reworkGood }})</td>
            <td :class="{ 'text-ng': r.scrapped > 0 }">
              {{ r.scrapped }}
            </td>
            <td>{{ r.reworkTime }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="q-rty">
      <strong>RTY {{ view.rty }}</strong>
      <span
        v-if="view.formula"
        class="muted"
      >= {{ view.formula }}</span>
    </p>
  </section>
</template>
