<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, formatDuration, formatWon } from '@/ui/format'
import { clock } from './display'

/**
 * 발주 현황: 발주 대장(최신순). 입고 대기는 남은 시간, 입고 완료는 입고 시각과 만든 로트.
 * 아래 긴급 발주 폼은 엔진에 긴급 발주 명령(EXPEDITE_MATERIAL)을 보낸다.
 */
const props = defineProps<{ materialId: string }>()
const sim = useSimStore()

const onlySelected = ref(true)

const material = computed(() => sim.master.materials.find((m) => m.id === props.materialId))

const rows = computed(() => {
  const names = createNameLookup(sim.master)
  const unitCost = new Map(sim.master.materials.map((m) => [m.id, m]))
  const now = sim.state.time
  return sim.state.purchaseOrders
    .filter((po) => !onlySelected.value || po.materialId === props.materialId)
    .slice()
    .reverse()
    .map((po) => {
      const m = unitCost.get(po.materialId)!
      const cost = po.qty * m.unitCost * (po.expedited ? 1 + m.expediteSurcharge : 1)
      return {
        id: po.id,
        material: names.material(po.materialId),
        qty: po.qty,
        ordered: clock(po.orderedAt),
        leadTime: formatDuration(po.eta - po.orderedAt),
        expedited: po.expedited,
        received: po.receivedAt !== null,
        arrival: po.receivedAt !== null ? `${clock(po.receivedAt)} · ${po.lotId}` : `${formatDuration(po.eta - now)} 남음`,
        cost: formatWon(cost),
      }
    })
})

const expediteQty = ref(material.value?.reorderQty ?? 1)
const error = ref<string | null>(null)
const sent = ref<string | null>(null)
watch(
  () => props.materialId,
  () => {
    expediteQty.value = material.value?.reorderQty ?? 1
    error.value = null
    sent.value = null
  },
)
const preview = computed(() => {
  const m = material.value
  if (!m) return null
  const qty = Math.max(0, Math.floor(expediteQty.value || 0))
  return {
    leadTime: formatDuration(m.expediteLeadTime),
    normalLeadTime: formatDuration(m.leadTime),
    rate: `${Math.round(m.expediteSurcharge * 100)}%`,
    surcharge: formatWon(qty * m.unitCost * m.expediteSurcharge),
  }
})

function expedite() {
  const qty = Math.floor(expediteQty.value || 0)
  error.value = sim.dispatch({ type: 'EXPEDITE_MATERIAL', materialId: props.materialId, qty })
  sent.value = error.value ? null : `${material.value?.name} ${qty}${material.value?.unit} 긴급 발주를 보냈습니다.`
}
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title dash-panel__title--row">
      <span>발주 현황</span>
      <label class="dash-toggle">
        <input
          v-model="onlySelected"
          type="checkbox"
        >
        {{ material?.name }}만
      </label>
    </h2>
    <div class="wo-table-wrap mat-po">
      <table class="dash-table">
        <thead>
          <tr>
            <th scope="col">
              발주
            </th>
            <th
              v-if="!onlySelected"
              scope="col"
            >
              자재
            </th>
            <th scope="col">
              수량
            </th>
            <th scope="col">
              발주 시각
            </th>
            <th scope="col">
              리드타임
            </th>
            <th scope="col">
              입고 (로트)
            </th>
            <th
              scope="col"
              title="수량 × 단가. 긴급 발주는 할증 포함"
            >
              금액
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.id"
          >
            <th scope="row">
              {{ r.id }}
              <span
                v-if="r.expedited"
                class="mat-expedite"
              >긴급</span>
            </th>
            <td v-if="!onlySelected">
              {{ r.material }}
            </td>
            <td>{{ r.qty }}</td>
            <td>{{ r.ordered }}</td>
            <td>{{ r.leadTime }}</td>
            <td :class="r.received ? 'muted' : 'text-warn'">
              {{ r.arrival }}
            </td>
            <td>{{ r.cost }}</td>
          </tr>
          <tr v-if="rows.length === 0">
            <td
              :colspan="onlySelected ? 6 : 7"
              class="muted mat-empty"
            >
              아직 발주가 없습니다. 재고 + 입고 예정이 발주점 이하가 되면 자동 발주합니다.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form
      v-if="material && preview"
      class="mat-expedite-form"
      @submit.prevent="expedite"
    >
      <label>
        <span>{{ material.name }} 긴급 발주 수량({{ material.unit }})</span>
        <input
          v-model.number="expediteQty"
          type="number"
          min="1"
          max="99999"
        >
      </label>
      <button
        type="submit"
        class="btn btn--small"
      >
        긴급 발주
      </button>
      <p class="hint">
        {{ preview.leadTime }} 후 입고(정상 {{ preview.normalLeadTime }}) · 할증 {{ preview.rate }} = {{ preview.surcharge }}
      </p>
    </form>
    <p
      v-if="error"
      class="form-error"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-else-if="sent"
      class="hint"
      role="status"
    >
      {{ sent }}
    </p>
  </section>
</template>
