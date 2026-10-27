<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { errorMessage } from '@/api/client'
import {
  changeWorkOrder,
  fetchItems,
  fetchWorkOrder,
  fetchWorkOrders,
  type WorkOrder,
  type WorkOrderAction,
  type WorkOrderDetail,
  type WorkOrderStatus,
} from '@/api/workOrders'
import { fetchWorkOrderOee } from '@/api/oee'
import OeeBreakdown from '@/dashboard/OeeBreakdown.vue'
import { explainLine, formatRatio } from '@/dashboard/oee'
import { useNow } from '@/composables/useNow'
import { usePolling } from '@/composables/usePolling'
import ConnectionNotice from '@/dashboard/ConnectionNotice.vue'
import WorkOrderForm from '@/dashboard/WorkOrderForm.vue'
import {
  ACTION_LABEL,
  WORK_ORDER_STATUS_ORDER,
  WORK_ORDER_STATUS_STYLE,
  actionsFor,
  countByStatus,
  dueState,
  estimateFinish,
  formatDateTime,
  progressOf,
  toStages,
} from '@/dashboard/workOrders'

/**
 * 작업지시 관리: 작업지시를 등록 · 하달 · 보류하고, 진척과 공정별 진행을 2초마다 다시 읽어 보여 준다.
 * 진행 중 지시는 서버가 고른다(라인이 비면 하달된 지시 중 우선순위 높은 순 → 하달 빠른 순).
 */
const route = useRoute()
const router = useRouter()
const now = useNow()

const list = usePolling(() => fetchWorkOrders())
const items = usePolling(fetchItems, 30_000)

/** 상태 칸을 누르면 그 상태만 본다(다시 누르면 전체) */
const filter = ref<WorkOrderStatus>()
const counts = computed(() => countByStatus(list.data.value ?? [], now.value))
const rows = computed(() => (list.data.value ?? []).filter((wo) => !filter.value || wo.status === filter.value))

// 선택한 지시는 주소(?workOrder=)에 남겨 새로 고침 · 공유해도 같은 지시가 보이게 한다
const selectedId = ref(typeof route.query.workOrder === 'string' ? route.query.workOrder : undefined)
watch(() => route.query.workOrder, (value) => (selectedId.value = typeof value === 'string' ? value : undefined))
watch(selectedId, (id) => {
  if (id && route.query.workOrder !== id) void router.replace({ query: { ...route.query, workOrder: id } })
})
// 처음에는 목록 맨 위(진행 중이 있으면 그것)를 고른다
watch(() => list.data.value, (data) => {
  if (!selectedId.value && data && data.length > 0) selectedId.value = data[0].workOrderId
})

/** 선택한 지시 상세. 어느 지시 응답인지 함께 들고 와 선택을 바꾼 직후 늦은 응답이 섞이지 않게 한다 */
const detail = usePolling(async () => {
  const id = selectedId.value
  return id ? { id, data: await fetchWorkOrder(id) } : undefined
})
watch(selectedId, () => void detail.refresh())
const selected = computed<WorkOrderDetail | undefined>(() =>
  detail.data.value?.id === selectedId.value ? detail.data.value?.data : undefined,
)
const stages = computed(() => (selected.value ? toStages(selected.value) : []))

/** 선택한 지시의 OEE(그 지시가 진행 중이던 시간만). 상세와 같은 이유로 어느 지시 응답인지 들고 온다 */
const oee = usePolling(async () => {
  const id = selectedId.value
  return id ? { id, data: await fetchWorkOrderOee(id) } : undefined
})
watch(selectedId, () => void oee.refresh())
const selectedOee = computed(() => (oee.data.value?.id === selectedId.value ? oee.data.value?.data : undefined))
const eta = computed(() => (selected.value ? estimateFinish(selected.value, now.value) : undefined))

const showForm = ref(false)
function onCreated(created: WorkOrderDetail) {
  showForm.value = false
  selectedId.value = created.workOrderId
  void list.refresh()
}

/** 전환 요청 중인 지시(버튼을 잠깐 막는다)와 마지막 실패 이유 */
const pending = ref<string>()
const actionError = ref('')
async function act(workOrder: WorkOrder, action: WorkOrderAction) {
  pending.value = workOrder.workOrderId
  actionError.value = ''
  try {
    await changeWorkOrder(workOrder.workOrderId, action)
  } catch (e) {
    actionError.value = errorMessage(e, `${ACTION_LABEL[action]}하지 못했습니다`)
  } finally {
    pending.value = undefined
    void list.refresh()
    void detail.refresh()
  }
}

const DUE_LABEL = { late: '지연', risk: '지연 위험', ok: '' } as const
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`
const numberFormat = new Intl.NumberFormat('ko-KR')
</script>

<template>
  <div class="dash-page">
    <ConnectionNotice
      :error="list.error.value"
      :updated-at="list.updatedAt.value"
    />

    <section
      class="dash-kpis"
      aria-label="상태별 작업지시 수 (누르면 그 상태만 봅니다)"
    >
      <button
        v-for="status in WORK_ORDER_STATUS_ORDER"
        :key="status"
        type="button"
        class="dash-kpi wo-count"
        :class="{ 'wo-count--active': filter === status }"
        :aria-pressed="filter === status"
        @click="filter = filter === status ? undefined : status"
      >
        <span class="dash-kpi__label">
          <i
            class="wo-dot"
            :style="{ background: WORK_ORDER_STATUS_STYLE[status].color }"
          />{{ status === 'COMPLETED' ? '오늘 완료' : WORK_ORDER_STATUS_STYLE[status].label }}
        </span>
        <strong class="dash-kpi__value">{{ list.data.value === undefined ? '–' : counts[status] }}<small>건</small></strong>
      </button>
    </section>

    <section class="dash-card">
      <header class="dash-card__header">
        <h2>
          작업지시 목록
          <span v-if="filter">· {{ WORK_ORDER_STATUS_STYLE[filter].label }}만</span>
        </h2>
        <button
          v-if="!showForm"
          type="button"
          class="btn btn--primary"
          @click="showForm = true"
        >
          + 작업지시 등록
        </button>
      </header>

      <WorkOrderForm
        v-if="showForm"
        :items="items.data.value ?? []"
        @created="onCreated"
        @cancel="showForm = false"
      />

      <p
        v-if="actionError"
        class="wo-form__error"
        role="alert"
      >
        {{ actionError }}
      </p>

      <p
        v-if="list.loading.value"
        class="dash-empty"
      >
        불러오는 중…
      </p>
      <p
        v-else-if="list.data.value === undefined"
        class="dash-empty"
      >
        작업지시를 받지 못했습니다.
      </p>
      <p
        v-else-if="rows.length === 0"
        class="dash-empty"
      >
        {{ filter ? '이 상태인 작업지시가 없습니다.' : '작업지시가 없습니다. 등록한 뒤 하달하면 시뮬레이터 라인이 생산을 시작합니다.' }}
      </p>
      <div
        v-else
        class="wo-table-wrap"
      >
        <table class="dash-table wo-table">
          <thead>
            <tr>
              <th scope="col">
                번호
              </th>
              <th scope="col">
                품목
              </th>
              <th scope="col">
                진척 (포장 양품 / 지시)
              </th>
              <th scope="col">
                우선
              </th>
              <th scope="col">
                납기
              </th>
              <th scope="col">
                상태
              </th>
              <th scope="col">
                <span class="visually-hidden">작업</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="wo in rows"
              :key="wo.workOrderId"
              :class="{ 'wo-row--selected': wo.workOrderId === selectedId }"
              @click="selectedId = wo.workOrderId"
            >
              <th scope="row">
                <button
                  type="button"
                  class="wo-link"
                  :aria-current="wo.workOrderId === selectedId ? 'true' : undefined"
                  @click.stop="selectedId = wo.workOrderId"
                >
                  {{ wo.workOrderId }}
                </button>
              </th>
              <td class="wo-left">
                {{ wo.itemName }}
              </td>
              <td>
                <span class="wo-progress">
                  <span class="wo-bar"><span :style="{ width: percent(progressOf(wo)) }" /></span>
                  {{ numberFormat.format(wo.completedQty) }} / {{ numberFormat.format(wo.plannedQty) }}
                </span>
              </td>
              <td>{{ wo.priority }}</td>
              <td>
                {{ formatDateTime(wo.dueAt) }}
                <em
                  v-if="dueState(wo, undefined, now) === 'late'"
                  class="wo-due wo-due--late"
                >{{ DUE_LABEL.late }}</em>
              </td>
              <td>
                <span class="wo-status"><i
                  class="wo-dot"
                  :style="{ background: WORK_ORDER_STATUS_STYLE[wo.status].color }"
                />{{ WORK_ORDER_STATUS_STYLE[wo.status].label }}</span>
              </td>
              <td class="wo-actions">
                <button
                  v-for="action in actionsFor(wo.status)"
                  :key="action"
                  type="button"
                  class="btn btn--small"
                  :disabled="pending === wo.workOrderId"
                  @click.stop="act(wo, action)"
                >
                  {{ ACTION_LABEL[action] }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section
      v-if="selected"
      class="dash-card"
      aria-live="polite"
    >
      <header class="dash-card__header">
        <h2>
          {{ selected.workOrderId }} · {{ selected.itemName }}
          <span class="wo-status"><i
            class="wo-dot"
            :style="{ background: WORK_ORDER_STATUS_STYLE[selected.status].color }"
          />{{ WORK_ORDER_STATUS_STYLE[selected.status].label }}</span>
        </h2>
        <span v-if="eta !== undefined">
          예상 완료 <strong>{{ formatDateTime(eta) }}</strong> (기준 택트)
          <em
            v-if="dueState(selected, eta, now) === 'risk'"
            class="wo-due wo-due--risk"
          >{{ DUE_LABEL.risk }}</em>
        </span>
      </header>

      <dl class="wo-meta">
        <div><dt>지시 수량</dt><dd>{{ numberFormat.format(selected.plannedQty) }}개</dd></div>
        <div><dt>실적 (포장 양품)</dt><dd>{{ numberFormat.format(selected.completedQty) }}개 · {{ percent(progressOf(selected)) }}</dd></div>
        <div><dt>우선순위</dt><dd>{{ selected.priority }}</dd></div>
        <div><dt>납기</dt><dd>{{ formatDateTime(selected.dueAt) }}</dd></div>
        <div><dt>등록</dt><dd>{{ formatDateTime(selected.createdAt) }}</dd></div>
        <div><dt>하달</dt><dd>{{ formatDateTime(selected.releasedAt) }}</dd></div>
        <div><dt>시작</dt><dd>{{ formatDateTime(selected.startedAt) }}</dd></div>
        <div><dt>완료</dt><dd>{{ formatDateTime(selected.completedAt) }}</dd></div>
      </dl>

      <h3 class="wo-subtitle">
        공정별 진척 <small>양품 / 지시 수량 · 재공 = 넘겨줬지만 다음 공정이 아직 끝내지 않은 양품</small>
      </h3>
      <ol class="wo-stages">
        <li
          v-for="stage in stages"
          :key="stage.equipmentId"
        >
          <div class="wo-stage">
            <span class="wo-stage__name">{{ stage.name }}</span>
            <span class="wo-bar wo-bar--wide"><span :style="{ width: percent(stage.ratio) }" /></span>
            <span class="wo-stage__count">
              {{ numberFormat.format(stage.goodCount) }} / {{ numberFormat.format(selected.plannedQty) }}
              <small v-if="stage.badCount > 0"> · 불량 {{ stage.badCount }}</small>
            </span>
          </div>
          <p
            v-if="stage.waiting !== undefined"
            class="wo-stage__waiting"
          >
            ↓ 재공 {{ stage.waiting }}
          </p>
        </li>
      </ol>

      <h3 class="wo-subtitle">
        OEE <small>이 작업지시가 진행 중이던 시간만{{ selected.status === 'IN_PROGRESS' ? ' · 지금까지' : '' }}</small>
      </h3>
      <p
        v-if="!selectedOee"
        class="dash-empty"
      >
        {{ oee.loading.value ? '불러오는 중…' : 'OEE를 받지 못했습니다.' }}
      </p>
      <p
        v-else-if="selectedOee.line.plannedSec === 0"
        class="dash-empty"
      >
        아직 생산한 시간이 없습니다.
      </p>
      <template v-else>
        <div class="oee-line oee-line--small">
          <strong class="oee-line__value">{{ formatRatio(selectedOee.line.oee) }}</strong>
          <span class="oee-line__explain">라인 OEE · {{ explainLine(selectedOee.line) }}</span>
        </div>
        <OeeBreakdown :equipment="selectedOee.equipment" />
      </template>
    </section>
  </div>
</template>
