<script setup lang="ts">
import { computed } from 'vue'
import { itemReport } from '@/domain/report'
import type { Shift } from '@/domain/shifts'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, percent } from '@/ui/format'
import { qty } from './display'

/** 품목별 실적: 교대 계획(계획 비율대로 나눈 값) · 실적 · 달성률 · 폐기 · 양품률 */
const props = defineProps<{ shift: Shift }>()
const sim = useSimStore()

const rows = computed(() => {
  const names = createNameLookup(sim.master)
  return itemReport(sim.state, sim.master, props.shift).map((r) => ({
    ...r,
    name: names.item(r.itemId),
    planText: qty(r.plan),
    attainmentText: percent(r.attainment),
    behind: r.attainment !== null && r.attainment < 0.95,
    yieldText: percent(r.finalYield, 1),
  }))
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      품목별 실적
    </h2>
    <div class="wo-table-wrap">
      <table class="dash-table q-yield">
        <thead>
          <tr>
            <th scope="col">
              품목
            </th>
            <th scope="col">
              계획
            </th>
            <th scope="col">
              실적
            </th>
            <th scope="col">
              달성률
            </th>
            <th scope="col">
              폐기
            </th>
            <th scope="col">
              양품률
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.itemId"
          >
            <th scope="row">
              {{ r.name }}
            </th>
            <td>{{ r.planText }}</td>
            <td>{{ r.good }}</td>
            <td :class="{ 'text-ng': r.behind }">
              {{ r.attainmentText }}
            </td>
            <td :class="{ 'text-ng': r.scrap > 0 }">
              {{ r.scrap }}
            </td>
            <td>{{ r.yieldText }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="dash-panel__note muted">
      품목별 계획은 교대 계획을 생산 계획의 품목 목표 비율대로 나눈 값입니다.
    </p>
  </section>
</template>
