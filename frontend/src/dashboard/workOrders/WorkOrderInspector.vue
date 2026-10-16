<script setup lang="ts">
import { computed } from 'vue'
import { routingProgress, workOrderTimes } from '@/domain/workOrders'
import { useSimStore } from '@/stores/sim'
import { WORK_ORDER_STATUS_LABEL, createNameLookup, formatDuration } from '@/ui/format'
import { WORK_ORDER_STATUS_COLOR, clock } from './display'

/** 작업지시 상세: 주요 시각(생성 · 하달 · 첫 투입 · 완료)과 라우팅 공정별 진행 */
const props = defineProps<{ workOrderId: string | null }>()
const sim = useSimStore()

const detail = computed(() => {
  const wo = sim.state.workOrders.find((w) => w.id === props.workOrderId)
  if (!wo) return null
  const names = createNameLookup(sim.master)
  const times = workOrderTimes(wo, sim.state.time)
  const ongoing = wo.completedAt === null
  const span = (sec: number | null, running: boolean) =>
    sec === null ? '—' : `${formatDuration(sec)}${running ? ' (진행 중)' : ''}`
  return {
    id: wo.id,
    title: `${names.item(wo.itemId)} × ${wo.qty}`,
    status: WORK_ORDER_STATUS_LABEL[wo.status],
    statusColor: WORK_ORDER_STATUS_COLOR[wo.status],
    priority: wo.priority,
    milestones: [
      { label: '생성', time: clock(wo.createdAt) },
      { label: '하달', time: clock(wo.releasedAt) },
      { label: '첫 투입', time: clock(wo.startedAt) },
      { label: '완료', time: clock(wo.completedAt) },
    ],
    wait: span(times.wait, wo.releasedAt !== null && wo.startedAt === null),
    work: span(times.work, wo.startedAt !== null && ongoing),
    leadTime: span(times.leadTime, false),
    good: wo.goodQty,
    scrap: wo.scrapQty,
    operations: routingProgress(sim.state, sim.master, wo.id).map((op) => ({
      ...op,
      name: names.workCenter(op.workCenterId),
      passedPct: (op.passed / wo.qty) * 100,
      activePct: ((op.processing + op.queued) / wo.qty) * 100,
    })),
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      작업지시 상세
    </h2>
    <p
      v-if="!detail"
      class="muted"
    >
      목록에서 작업지시를 고르세요.
    </p>
    <template v-else>
      <p class="wo-detail__head">
        <strong>{{ detail.id }}</strong>
        {{ detail.title }}
        <span
          class="wo-status"
          :style="{ '--tone': detail.statusColor }"
        >{{ detail.status }}</span>
        <span class="muted">우선순위 {{ detail.priority }}</span>
      </p>
      <ol class="wo-milestones">
        <li
          v-for="m in detail.milestones"
          :key="m.label"
          :class="{ 'wo-milestones__done': m.time !== '—' }"
        >
          <span class="muted">{{ m.label }}</span>
          <time>{{ m.time }}</time>
        </li>
      </ol>
      <dl class="wo-times">
        <dt title="하달 → 첫 투입">
          대기 시간
        </dt>
        <dd>{{ detail.wait }}</dd>
        <dt title="첫 투입 → 완료">
          작업 시간
        </dt>
        <dd>{{ detail.work }}</dd>
        <dt title="하달 → 완료">
          리드타임
        </dt>
        <dd>{{ detail.leadTime }}</dd>
        <dt>양품 / 불량</dt>
        <dd>{{ detail.good }} / {{ detail.scrap }}</dd>
      </dl>
      <h3 class="wo-detail__sub">
        공정별 진행 (라우팅)
      </h3>
      <table class="dash-table wo-ops">
        <thead>
          <tr>
            <th scope="col">
              공정
            </th>
            <th
              scope="col"
              class="wo-ops__bar"
            >
              진행률
            </th>
            <th scope="col">
              통과
            </th>
            <th scope="col">
              가공·대기
            </th>
            <th scope="col">
              불량
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="op in detail.operations"
            :key="op.seq"
          >
            <th scope="row">
              {{ op.seq }} {{ op.name }}
            </th>
            <td class="wo-ops__bar">
              <div
                class="progress"
                aria-hidden="true"
              >
                <span
                  class="progress__good"
                  :style="{ width: `${op.passedPct}%` }"
                />
                <span
                  class="progress__inline"
                  :style="{ width: `${op.activePct}%` }"
                />
              </div>
            </td>
            <td>{{ op.passed }}</td>
            <td>{{ op.processing + op.queued }}</td>
            <td :class="{ 'text-ng': op.defect > 0 }">
              {{ op.defect }}
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>
