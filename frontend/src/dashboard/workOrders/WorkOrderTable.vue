<script setup lang="ts">
import { computed, ref } from 'vue'
import { DISPATCH_RULES, DISPATCH_RULE_LABEL } from '@/domain/dispatch'
import type { DispatchRule, WorkOrder, WorkOrderStatus } from '@/domain/types'
import { type WorkOrderForecast, dueStatus, remainingQty } from '@/domain/workOrders'
import { useSimStore } from '@/stores/sim'
import { WORK_ORDER_STATUS_LABEL, createNameLookup } from '@/ui/format'
import { DUE_TONE, WORK_ORDER_STATUS_COLOR, clock, dueText } from './display'

/**
 * 작업지시 목록: 완료 예정 순서(라인 안 제품 → 투입 순서 규칙)대로 보여 주고,
 * 하달 · 보류 · 우선순위 조정과 투입 순서 규칙 변경을 여기서 한다.
 */
const props = defineProps<{
  etas: Map<string, WorkOrderForecast>
  filter: WorkOrderStatus | null
  selectedId: string | null
}>()
const emit = defineEmits<{ select: [id: string] }>()

const sim = useSimStore()
const actionError = ref<string | null>(null)

/** 정렬 그룹: 진행·하달(예상 완료 순) → 보류 → 계획 → 완료(최근 순) */
const GROUP: Record<WorkOrderStatus, number> = { IN_PROGRESS: 0, RELEASED: 0, HELD: 1, PLANNED: 2, COMPLETED: 3 }

function sortKey(wo: WorkOrder): number {
  if (wo.status === 'COMPLETED') return -wo.completedAt!
  return props.etas.get(wo.id)?.end ?? wo.createdAt
}

const rows = computed(() => {
  const names = createNameLookup(sim.master)
  const now = sim.state.time
  const orders = [...sim.state.workOrders].sort(
    (a, b) => GROUP[a.status] - GROUP[b.status] || sortKey(a) - sortKey(b),
  )
  let queuePosition = 0
  return orders
    .map((wo) => {
      const eta = props.etas.get(wo.id)?.end ?? null
      const due = dueStatus(wo, eta, now)
      const inLine = wo.releasedQty - wo.goodQty - wo.scrapQty
      return {
        id: wo.id,
        status: wo.status,
        position: eta === null ? null : ++queuePosition,
        item: names.item(wo.itemId),
        qty: wo.qty,
        good: wo.goodQty,
        remaining: remainingQty(wo),
        goodPct: (wo.goodQty / wo.qty) * 100,
        scrapPct: (wo.scrapQty / wo.qty) * 100,
        inLinePct: (inLine / wo.qty) * 100,
        statusLabel: WORK_ORDER_STATUS_LABEL[wo.status],
        statusColor: WORK_ORDER_STATUS_COLOR[wo.status],
        priority: wo.priority,
        due: clock(wo.dueTime),
        eta: wo.status === 'COMPLETED' ? clock(wo.completedAt) : eta === null ? '—' : clock(eta),
        dueText: dueText(due),
        dueTone: DUE_TONE[due.kind],
        canRelease: wo.status === 'PLANNED' || wo.status === 'HELD',
        canHold: wo.status === 'RELEASED' || wo.status === 'IN_PROGRESS',
        done: wo.status === 'COMPLETED',
      }
    })
    .filter((row) => props.filter === null || row.status === props.filter)
})

const rule = computed({
  get: () => sim.state.dispatchRule,
  set: (value: DispatchRule) => run({ type: 'SET_DISPATCH_RULE', rule: value }),
})

function run(command: Parameters<typeof sim.dispatch>[0]) {
  actionError.value = sim.dispatch(command)
}
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title dash-panel__title--row">
      작업지시 목록
      <label class="dash-toggle">
        투입 순서
        <select v-model="rule">
          <option
            v-for="r in DISPATCH_RULES"
            :key="r"
            :value="r"
          >
            {{ DISPATCH_RULE_LABEL[r] }}
          </option>
        </select>
      </label>
    </h2>
    <div class="wo-table-wrap">
      <table class="dash-table wo-table">
        <thead>
          <tr>
            <th scope="col">
              작업지시
            </th>
            <th
              scope="col"
              title="예상 완료 순서. 라인 안 제품을 먼저, 그다음 투입 순서 규칙대로"
            >
              순서
            </th>
            <th
              scope="col"
              class="wo-table__item"
            >
              품목
            </th>
            <th
              scope="col"
              class="wo-table__progress"
            >
              진척 (양품 / 지시)
            </th>
            <th scope="col">
              상태
            </th>
            <th scope="col">
              우선순위
            </th>
            <th scope="col">
              납기
            </th>
            <th
              scope="col"
              title="완료 시각, 또는 표준 능력 기준 예상 완료 시각(지금 멈춘 설비만 반영)"
            >
              완료 / 예상
            </th>
            <th scope="col">
              납기 여유
            </th>
            <th scope="col">
              조작
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.id"
            :class="{ 'dash-table__row--selected': r.id === selectedId, 'wo-table__row--done': r.done }"
            @click="emit('select', r.id)"
          >
            <th scope="row">
              <button
                class="link-btn"
                :aria-pressed="r.id === selectedId"
                @click.stop="emit('select', r.id)"
              >
                {{ r.id }}
              </button>
            </th>
            <td>{{ r.position ?? '—' }}</td>
            <td class="wo-table__item">
              {{ r.item }}
            </td>
            <td class="wo-table__progress">
              <div
                class="progress"
                role="img"
                :aria-label="`양품 ${r.good} / 지시 ${r.qty}`"
              >
                <span
                  class="progress__good"
                  :style="{ width: `${r.goodPct}%` }"
                />
                <span
                  class="progress__scrap"
                  :style="{ width: `${r.scrapPct}%` }"
                />
                <span
                  class="progress__inline"
                  :style="{ width: `${r.inLinePct}%` }"
                />
              </div>
              <span class="muted">{{ r.good }} / {{ r.qty }}</span>
            </td>
            <td>
              <span
                class="wo-status"
                :style="{ '--tone': r.statusColor }"
              >{{ r.statusLabel }}</span>
            </td>
            <td>
              <span class="wo-priority">
                <button
                  class="btn btn--small btn--icon"
                  :disabled="r.done"
                  :aria-label="`${r.id} 우선순위 낮추기`"
                  @click.stop="run({ type: 'SET_WORK_ORDER_PRIORITY', workOrderId: r.id, priority: r.priority - 1 })"
                >
                  −
                </button>
                {{ r.priority }}
                <button
                  class="btn btn--small btn--icon"
                  :disabled="r.done"
                  :aria-label="`${r.id} 우선순위 높이기`"
                  @click.stop="run({ type: 'SET_WORK_ORDER_PRIORITY', workOrderId: r.id, priority: r.priority + 1 })"
                >
                  +
                </button>
              </span>
            </td>
            <td>{{ r.due }}</td>
            <td>{{ r.eta }}</td>
            <td :class="`wo-due--${r.dueTone}`">
              {{ r.dueText }}
            </td>
            <td>
              <button
                v-if="r.canRelease"
                class="btn btn--small btn--primary"
                @click.stop="run({ type: 'RELEASE_WORK_ORDER', workOrderId: r.id })"
              >
                {{ r.status === 'HELD' ? '해제' : '하달' }}
              </button>
              <button
                v-else-if="r.canHold"
                class="btn btn--small"
                @click.stop="run({ type: 'HOLD_WORK_ORDER', workOrderId: r.id })"
              >
                보류
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p
      v-if="rows.length === 0"
      class="muted"
    >
      해당 상태의 작업지시가 없습니다.
    </p>
    <p
      v-if="actionError"
      class="form-error"
      role="alert"
    >
      {{ actionError }}
    </p>
    <p class="dash-panel__note muted">
      진척 막대: 초록 양품 · 빨강 불량 · 파랑 라인 안. 예상 완료는 남은 수량 × 병목 처리 시간을 투입 순서대로 쌓은 근사값입니다. 지금 멈춘 설비는 반영하지만 앞으로의 고장·불량은 반영하지 않습니다.
    </p>
  </section>
</template>
