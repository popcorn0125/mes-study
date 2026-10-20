<script setup lang="ts">
import { computed } from 'vue'
import { workCenterReport } from '@/domain/report'
import type { Shift } from '@/domain/shifts'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, percent } from '@/ui/format'
import { minutes } from './display'

/** 공정별 실적: 가공 수 · 불량 · 가동률 · 정지 시간(사유별) · OEE(교대 구간) */
const props = defineProps<{ shift: Shift }>()
const sim = useSimStore()

const rows = computed(() => {
  const names = createNameLookup(sim.master)
  return workCenterReport(sim.state, sim.master, props.shift)?.map((r) => ({
    ...r,
    name: names.workCenter(r.workCenterId),
    utilizationText: percent(r.utilization),
    oeeText: percent(r.oee, 1),
    down: minutes(r.stops.DOWN),
    pm: minutes(r.stops.PM),
    material: minutes(r.stops.STARVED_MATERIAL),
  }))
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      공정별 실적
    </h2>
    <div
      v-if="rows"
      class="wo-table-wrap"
    >
      <table class="dash-table q-yield">
        <thead>
          <tr>
            <th scope="col">
              공정
            </th>
            <th scope="col">
              가공
            </th>
            <th scope="col">
              불량
            </th>
            <th
              scope="col"
              title="가동 시간 ÷ 교대 경과 시간"
            >
              가동률
            </th>
            <th
              scope="col"
              title="고장 / 예방정비 / 자재 부족 정지(분)"
            >
              정지(분) 고장 · 정비 · 자재
            </th>
            <th scope="col">
              OEE
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.workCenterId"
          >
            <th scope="row">
              {{ r.name }}
              <small
                v-if="r.equipmentCount > 1"
                class="muted"
              >×{{ r.equipmentCount }}</small>
            </th>
            <td>{{ r.processed }}</td>
            <td :class="{ 'text-ng': r.defects > 0 }">
              {{ r.defects }}
            </td>
            <td>{{ r.utilizationText }}</td>
            <td>
              <span :class="{ 'text-ng': r.down !== '0' }">{{ r.down }}</span>
              · {{ r.pm }} ·
              <span :class="{ 'text-ng': r.material !== '0' }">{{ r.material }}</span>
            </td>
            <td>{{ r.oeeText }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p
      v-else
      class="hint"
    >
      이 교대의 설비 기록이 보관 범위(최근 7일) 밖입니다.
    </p>
    <p class="dash-panel__note muted">
      가공 · 불량은 재작업 가공을 포함한 설비 기준입니다. 병목이 아닌 공정의 가동률이 낮은 것은 정상입니다(공급 대기).
    </p>
  </section>
</template>
