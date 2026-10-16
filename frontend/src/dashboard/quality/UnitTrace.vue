<script setup lang="ts">
import { computed, ref } from 'vue'
import { recentDefectUnits, unitTrace } from '@/domain/traceability'
import { formatSimTime } from '@/sim/clock'
import { useSimStore } from '@/stores/sim'
import { UNIT_STATUS_LABEL, createNameLookup } from '@/ui/format'
import { DISPOSITION_LABEL } from './display'

/**
 * 제품 이력 조회(역추적): 제품 하나 → 작업지시, 공정별 설비 · 시각 · 결과 · 불량 유형, 사용 자재 로트.
 * 로트를 누르면 정추적(자재 로트 추적)으로 넘어간다.
 */
const props = defineProps<{ unitId: string | null }>()
const emit = defineEmits<{ 'select-unit': [id: string]; 'select-lot': [id: string] }>()
const sim = useSimStore()

const query = ref('')
const queryError = ref<string | null>(null)

const recent = computed(() => {
  const codes = new Map(sim.master.defectCodes.map((c) => [c.id, c.name]))
  return recentDefectUnits(sim.state, 20).map((u) => {
    const defects = u.history.filter((h) => h.defectCode).map((h) => codes.get(h.defectCode!))
    return { id: u.id, label: `${u.id} · ${UNIT_STATUS_LABEL[u.status]} · ${defects.join(', ')}` }
  })
})

const trace = computed(() => {
  if (!props.unitId) return null
  const t = unitTrace(sim.state, sim.master, props.unitId)
  if (!t) return null
  const names = createNameLookup(sim.master)
  const time = (sec: number | null) => (sec === null ? '—' : formatSimTime(sec))
  return {
    id: t.unit.id,
    item: names.item(t.unit.itemId),
    workOrderId: t.unit.workOrderId,
    status: UNIT_STATUS_LABEL[t.unit.status],
    statusTone: t.unit.status === 'SCRAPPED' ? 'text-ng' : t.unit.status === 'COMPLETED' ? 'text-ok' : '',
    released: time(t.unit.releasedAt),
    finished: time(t.unit.finishedAt),
    steps: t.steps.map((s, i) => ({
      key: i,
      op: `${s.opSeq} ${names.workCenter(s.workCenterId)}`,
      equipment: names.equipment(s.equipmentId),
      span: `${time(s.start)} ~ ${time(s.end)}`,
      result: s.result === 'GOOD' ? '양품' : (s.defect?.name ?? '불량'),
      // 재작업 가공의 불량은 유형과 관계없이 폐기
      disposition: s.defect ? DISPOSITION_LABEL[s.rework ? 'SCRAP' : s.defect.disposition] : null,
      rework: s.rework,
      defect: s.result === 'DEFECT',
    })),
    lots: t.lots.map((l) => ({
      key: `${l.materialId}-${l.lotId}`,
      material: names.material(l.materialId),
      lotId: l.lotId,
      qty: l.qty,
      received: time(l.lot.receivedAt),
      po: l.lot.purchaseOrderId ?? '시작 재고',
    })),
  }
})

function search() {
  const id = query.value.trim().toUpperCase()
  if (!id) return
  // "123"처럼 숫자만 넣어도 찾을 수 있게 한다
  const unitId = /^\d+$/.test(id) ? `U-${id.padStart(5, '0')}` : id
  if (!sim.state.units[unitId]) {
    queryError.value = `${unitId} 제품이 없습니다`
    return
  }
  queryError.value = null
  emit('select-unit', unitId)
}
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      제품 이력 조회 <small class="muted">역추적</small>
    </h2>
    <div class="q-search">
      <label>
        <span class="muted">최근 불량 제품</span>
        <select
          :value="unitId ?? ''"
          @change="emit('select-unit', ($event.target as HTMLSelectElement).value)"
        >
          <option
            v-if="recent.length === 0 && !unitId"
            value=""
          >
            아직 불량 제품이 없습니다
          </option>
          <option
            v-if="unitId && !recent.some((r) => r.id === unitId)"
            :value="unitId"
          >
            {{ unitId }} (직접 조회)
          </option>
          <option
            v-for="r in recent"
            :key="r.id"
            :value="r.id"
          >
            {{ r.label }}
          </option>
        </select>
      </label>
      <form @submit.prevent="search">
        <label>
          <span class="muted">제품 번호</span>
          <input
            v-model="query"
            placeholder="U-00123 또는 123"
          >
        </label>
        <button
          type="submit"
          class="btn btn--small"
        >
          조회
        </button>
      </form>
    </div>
    <p
      v-if="queryError"
      class="form-error"
      role="alert"
    >
      {{ queryError }}
    </p>
    <p
      v-if="!trace"
      class="muted"
    >
      제품을 고르면 공정 이력과 사용 자재 로트가 보입니다.
    </p>
    <template v-else>
      <p class="wo-detail__head">
        <strong>{{ trace.id }}</strong>
        {{ trace.item }}
        <span class="muted">작업지시 {{ trace.workOrderId }}</span>
        <span :class="trace.statusTone">{{ trace.status }}</span>
        <span class="muted">투입 {{ trace.released }} · 종료 {{ trace.finished }}</span>
      </p>
      <div class="wo-table-wrap">
        <table class="dash-table q-trace">
          <thead>
            <tr>
              <th scope="col">
                공정
              </th>
              <th scope="col">
                설비
              </th>
              <th scope="col">
                시각
              </th>
              <th scope="col">
                결과
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in trace.steps"
              :key="s.key"
            >
              <th scope="row">
                {{ s.op }}
                <span
                  v-if="s.rework"
                  class="q-badge"
                >재작업</span>
              </th>
              <td>{{ s.equipment }}</td>
              <td>{{ s.span }}</td>
              <td :class="{ 'text-ng': s.defect }">
                {{ s.result }}<span
                  v-if="s.disposition"
                  class="muted"
                > → {{ s.disposition }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3 class="wo-detail__sub">
        사용 자재 로트
      </h3>
      <p
        v-if="trace.lots.length === 0"
        class="muted"
      >
        아직 자재를 쓰지 않았습니다.
      </p>
      <table
        v-else
        class="dash-table q-trace"
      >
        <thead>
          <tr>
            <th scope="col">
              자재
            </th>
            <th scope="col">
              로트
            </th>
            <th scope="col">
              수량
            </th>
            <th scope="col">
              입고
            </th>
            <th scope="col">
              발주
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="l in trace.lots"
            :key="l.key"
          >
            <th scope="row">
              {{ l.material }}
            </th>
            <td>
              <button
                class="link-btn"
                :title="`${l.lotId}가 들어간 제품 찾기(정추적)`"
                @click="emit('select-lot', l.lotId)"
              >
                {{ l.lotId }}
              </button>
            </td>
            <td>{{ l.qty }}</td>
            <td>{{ l.received }}</td>
            <td>{{ l.po }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>
