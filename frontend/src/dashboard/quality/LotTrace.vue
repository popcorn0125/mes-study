<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { lotUsage, lotsOf } from '@/domain/traceability'
import { formatSimTime } from '@/sim/clock'
import { useSimStore } from '@/stores/sim'

/**
 * 자재 로트 추적(정추적): 자재 → 로트 목록 → 로트를 쓴 제품 · 작업지시와 그중 불량 · 폐기 수.
 * 제품 번호를 누르면 역추적(제품 이력 조회)으로 넘어간다.
 */
const props = defineProps<{ lotId: string | null }>()
const emit = defineEmits<{ 'select-lot': [id: string]; 'select-unit': [id: string] }>()
const sim = useSimStore()

const UNITS_SHOWN = 12

const materialId = ref(sim.master.materials[0]?.id ?? '')
// 다른 패널에서 로트를 고르면 그 로트의 자재로 바꾼다
watch(
  () => props.lotId,
  (id) => {
    const lot = id ? sim.state.materialLots[id] : null
    if (lot) materialId.value = lot.materialId
  },
  { immediate: true },
)

const lots = computed(() =>
  lotsOf(sim.state, materialId.value).map((lot) => ({
    id: lot.id,
    received: formatSimTime(lot.receivedAt),
    po: lot.purchaseOrderId ?? '시작 재고',
    qty: lot.qty,
    used: lot.qty - lot.remaining,
    remaining: lot.remaining,
  })),
)

const usage = computed(() => {
  const lot = props.lotId ? sim.state.materialLots[props.lotId] : null
  if (!lot || lot.materialId !== materialId.value) return null
  const u = lotUsage(sim.state, lot.id)
  return { ...u, id: lot.id, shown: u.unitIds.slice(-UNITS_SHOWN).reverse() }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title dash-panel__title--row">
      <span>자재 로트 추적 <small class="muted">정추적</small></span>
      <label class="dash-toggle">
        자재
        <select v-model="materialId">
          <option
            v-for="m in sim.master.materials"
            :key="m.id"
            :value="m.id"
          >
            {{ m.name }}
          </option>
        </select>
      </label>
    </h2>
    <div class="wo-table-wrap q-lots">
      <table class="dash-table">
        <thead>
          <tr>
            <th scope="col">
              로트
            </th>
            <th scope="col">
              입고
            </th>
            <th scope="col">
              발주
            </th>
            <th scope="col">
              입고 수량
            </th>
            <th scope="col">
              사용
            </th>
            <th scope="col">
              남음
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="l in lots"
            :key="l.id"
            :class="{ 'dash-table__row--selected': l.id === lotId }"
            @click="emit('select-lot', l.id)"
          >
            <th scope="row">
              <button
                class="link-btn"
                :aria-pressed="l.id === lotId"
                @click.stop="emit('select-lot', l.id)"
              >
                {{ l.id }}
              </button>
            </th>
            <td>{{ l.received }}</td>
            <td>{{ l.po }}</td>
            <td>{{ l.qty }}</td>
            <td>{{ l.used }}</td>
            <td>{{ l.remaining }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p
      v-if="!usage"
      class="dash-panel__note muted"
    >
      로트를 고르면 그 로트가 들어간 제품과 작업지시가 보입니다(리콜 · 출하 정지 범위).
    </p>
    <div
      v-else
      class="q-usage"
    >
      <p>
        <strong>{{ usage.id }}</strong> → 제품 <strong>{{ usage.unitIds.length }}</strong>개에 {{ usage.qtyUsed }}개 사용
        <span class="muted">
          (완료 {{ usage.completed }} · 폐기 {{ usage.scrapped }} · 라인 안 {{ usage.inProcess }} · 불량 경험 {{ usage.withDefect }})
        </span>
      </p>
      <p>
        <span class="muted">작업지시:</span>
        <span
          v-for="w in usage.byWorkOrder"
          :key="w.workOrderId"
          class="q-chip"
        >{{ w.workOrderId }} {{ w.units }}개</span>
      </p>
      <p v-if="usage.shown.length">
        <span class="muted">최근 제품:</span>
        <button
          v-for="id in usage.shown"
          :key="id"
          class="link-btn q-chip"
          :title="`${id} 이력 보기(역추적)`"
          @click="emit('select-unit', id)"
        >
          {{ id }}
        </button>
      </p>
    </div>
  </section>
</template>
