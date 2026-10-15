<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { bottleneck } from '@/domain/kpi'
import { EQUIPMENT_STATUS_STYLE } from '@/scene/colors'
import { useSimStore } from '@/stores/sim'
import { createNameLookup } from '@/ui/format'

/**
 * 라인 현황: 3D 공장 축소판 + 병목 + 설비별 상태.
 * three.js가 커서(약 1MB) 대시보드 첫 화면 로딩이 느려지지 않도록 3D 장면은 따로 불러온다.
 */
const FactoryScene = defineAsyncComponent(() => import('@/scene/FactoryScene.vue'))

const sim = useSimStore()

const line = computed(() => {
  const names = createNameLookup(sim.master)
  const constraint = bottleneck(sim.master, sim.state)
  return {
    bottleneck: constraint
      ? `${names.workCenter(constraint.workCenterId)} · ${Math.round(constraint.effectiveCycleTime)}초/대 · 최대 ${Math.round(constraint.maxUph)} UPH`
      : '—',
    equipment: sim.state.equipment.map((eq) => ({
      id: eq.id,
      name: names.equipment(eq.id),
      ...EQUIPMENT_STATUS_STYLE[eq.status],
    })),
  }
})
</script>

<template>
  <section class="card dash-panel line-widget">
    <h2 class="dash-panel__title">
      라인 현황
    </h2>
    <div class="line-widget__scene">
      <Suspense>
        <FactoryScene embedded />
        <template #fallback>
          <p class="muted line-widget__loading">
            3D 화면을 불러오는 중…
          </p>
        </template>
      </Suspense>
    </div>
    <p class="line-widget__bottleneck">
      <strong>병목</strong> {{ line.bottleneck }}
    </p>
    <ul
      class="line-widget__equipment"
      aria-label="설비 상태"
    >
      <li
        v-for="eq in line.equipment"
        :key="eq.id"
        :style="{ '--status': eq.color }"
      >
        <span class="line-widget__dot" />
        {{ eq.name }} <span class="muted">{{ eq.label }}</span>
      </li>
    </ul>
  </section>
</template>
