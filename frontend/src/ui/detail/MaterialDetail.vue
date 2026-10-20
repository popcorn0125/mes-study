<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { maxQtyPer } from '@/domain/kpi'
import { stockColor } from '@/scene/colors'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, formatDuration, formatWon } from '../format'

const props = defineProps<{ id: string }>()
const sim = useSimStore()

const view = computed(() => {
  const material = sim.master.materials.find((m) => m.id === props.id)
  if (!material) return null
  const stock = sim.state.materials[material.id]
  const names = createNameLookup(sim.master)
  const lines = sim.master.bom.filter((l) => l.materialId === material.id)
  return {
    material,
    onHand: stock.onHand,
    color: stockColor(stock.onHand, material.reorderPoint, maxQtyPer(sim.master, material.id)),
    usage: lines.map((l) => ({
      key: `${l.itemId}-${l.workCenterId}`,
      item: names.item(l.itemId),
      workCenter: names.workCenter(l.workCenterId),
      qtyPer: l.qtyPer,
      // 지금 재고로 만들 수 있는 수량
      coverage: Math.floor(stock.onHand / l.qtyPer),
    })),
    orders: stock.orders.map((po) => ({
      id: po.id,
      qty: po.qty,
      eta: formatDuration(po.eta - sim.state.time),
      expedited: po.expedited,
    })),
    leadTime: formatDuration(material.leadTime),
    expediteLeadTime: formatDuration(material.expediteLeadTime),
    unitCost: formatWon(material.unitCost),
    surchargeRate: `${Math.round(material.expediteSurcharge * 100)}%`,
    totalSurcharge: formatWon(sim.state.costs.expediteSurcharge),
  }
})

const expediteQty = ref(view.value?.material.reorderQty ?? 1)
const error = ref<string | null>(null)
watch(
  () => props.id,
  () => {
    expediteQty.value = view.value?.material.reorderQty ?? 1
    error.value = null
  },
)
const surchargePreview = computed(() => {
  const m = view.value?.material
  return m ? formatWon(Math.max(0, expediteQty.value) * m.unitCost * m.expediteSurcharge) : ''
})

function expedite() {
  error.value = sim.dispatch({ type: 'EXPEDITE_MATERIAL', materialId: props.id, qty: Math.floor(expediteQty.value) })
}
</script>

<template>
  <div v-if="view">
    <header class="detail-header">
      <span class="detail-kind">자재</span>
      <h2>{{ view.material.name }}</h2>
    </header>

    <dl class="kv">
      <dt>현재 재고</dt>
      <dd>
        <strong :style="{ color: view.color }">{{ view.onHand }}{{ view.material.unit }}</strong>
      </dd>
      <dt>안전재고</dt>
      <dd>{{ view.material.safetyStock }}{{ view.material.unit }}</dd>
      <dt>발주점 / 발주량</dt>
      <dd>{{ view.material.reorderPoint }} / {{ view.material.reorderQty }}{{ view.material.unit }}</dd>
      <dt>리드타임</dt>
      <dd>정상 {{ view.leadTime }} · 긴급 {{ view.expediteLeadTime }}</dd>
      <dt>단가</dt>
      <dd>{{ view.unitCost }}</dd>
    </dl>
    <p class="hint">
      재고 + 입고 예정 수량이 발주점 이하로 내려가면 발주량만큼 자동 발주합니다.
      발주점 = 리드타임 동안 예상 소요 + 안전재고입니다.
    </p>

    <div class="detail-section">
      <h3>사용처 (BOM)</h3>
      <table class="mini-table">
        <thead>
          <tr>
            <th>품목</th>
            <th>작업장</th>
            <th>소요</th>
            <th>생산 가능</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="u in view.usage"
            :key="u.key"
          >
            <td>{{ u.item }}</td>
            <td>{{ u.workCenter }}</td>
            <td>{{ u.qtyPer }}{{ view.material.unit }}</td>
            <td :class="{ 'text-ng': u.coverage === 0 }">
              {{ u.coverage }}대
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="detail-section">
      <h3>입고 예정</h3>
      <table
        v-if="view.orders.length"
        class="mini-table"
      >
        <thead>
          <tr>
            <th>발주</th>
            <th>수량</th>
            <th>입고까지</th>
            <th>구분</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="po in view.orders"
            :key="po.id"
          >
            <td>{{ po.id }}</td>
            <td>{{ po.qty }}</td>
            <td>{{ po.eta }}</td>
            <td :class="{ 'text-warn': po.expedited }">
              {{ po.expedited ? '긴급' : '정상' }}
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-else
        class="hint"
      >
        없음
      </p>
    </div>

    <div class="detail-section">
      <h3>긴급 발주</h3>
      <form
        class="inline-form"
        @submit.prevent="expedite"
      >
        <label>
          <span>수량({{ view.material.unit }})</span>
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
      </form>
      <p class="hint">
        {{ view.expediteLeadTime }} 후 입고 · 할증 {{ view.surchargeRate }} (이번 발주 {{ surchargePreview }}) · 누적 할증 {{ view.totalSurcharge }}
      </p>
      <p
        v-if="error"
        class="form-error"
        role="alert"
      >
        {{ error }}
      </p>
    </div>
  </div>
</template>
