<script setup lang="ts">
import { computed, ref } from 'vue'
import { WORK_ORDER_CONCEPTS } from '@/concepts/workOrders'
import ConceptPanel from '@/dashboard/ConceptPanel.vue'
import KpiCard, { type KpiTone } from '@/dashboard/KpiCard.vue'
import WorkOrderCreateForm from '@/dashboard/workOrders/WorkOrderCreateForm.vue'
import WorkOrderGanttChart from '@/dashboard/workOrders/WorkOrderGanttChart.vue'
import WorkOrderInspector from '@/dashboard/workOrders/WorkOrderInspector.vue'
import WorkOrderLifecycle from '@/dashboard/workOrders/WorkOrderLifecycle.vue'
import WorkOrderTable from '@/dashboard/workOrders/WorkOrderTable.vue'
import type { WorkOrderStatus } from '@/domain/types'
import {
  averageWorkOrderLeadTime,
  dueStatus,
  estimateCompletion,
  onTimeRate,
  statusCounts,
  workOrderTimes,
} from '@/domain/workOrders'
import { useSimStore } from '@/stores/sim'
import { formatDuration, percent } from '@/ui/format'

/** 작업지시 관리: 어디까지 진행됐나 / 납기를 지킬 수 있나 / 무엇을 먼저 만들까 */
const sim = useSimStore()

const filter = ref<WorkOrderStatus | null>(null)
/** 사용자가 고른 작업지시. 고르기 전에는 지금 진행 중인 작업지시를 따라간다 */
const pickedId = ref<string | null>(null)
const selectedId = computed(
  () =>
    pickedId.value ??
    sim.state.workOrders.find((wo) => wo.status === 'IN_PROGRESS')?.id ??
    sim.state.workOrders[0]?.id ??
    null,
)

/** 예상 완료는 목록·일정 차트가 함께 쓰므로 한 번만 계산한다 */
const etas = computed(() => estimateCompletion(sim.state, sim.master))

const kpi = computed(() => {
  const state = sim.state
  const counts = statusCounts(state)
  const otd = onTimeRate(state)
  const late = state.workOrders.filter((wo) => {
    const kind = dueStatus(wo, etas.value.get(wo.id)?.end ?? null, state.time).kind
    return kind === 'AT_RISK' || kind === 'OVERDUE'
  })
  const done = state.workOrders.filter((wo) => wo.completedAt !== null)
  const avg = (pick: (t: ReturnType<typeof workOrderTimes>) => number | null) =>
    done.length === 0 ? null : done.reduce((sum, wo) => sum + (pick(workOrderTimes(wo, state.time)) ?? 0), 0) / done.length
  const leadTime = averageWorkOrderLeadTime(state)
  const wait = avg((t) => t.wait)
  const work = avg((t) => t.work)
  const otdTone: KpiTone = otd === null ? 'neutral' : otd >= 0.95 ? 'good' : otd >= 0.85 ? 'warn' : 'bad'
  return {
    counts,
    total: state.workOrders.length,
    otd: percent(otd),
    otdSub: otd === null ? '완료된 납기 작업지시 없음' : `${done.filter((wo) => wo.dueTime !== null).length}건 기준 · 목표 95%`,
    otdTone,
    late: late.length,
    lateSub: late.length === 0 ? '없음' : late.map((wo) => wo.id).join(', '),
    lateTone: (late.length === 0 ? 'good' : 'bad') as KpiTone,
    leadTime: leadTime === null ? '—' : formatDuration(leadTime),
    leadTimeSub: wait === null || work === null ? '완료된 작업지시 없음' : `대기 ${Math.round(wait / 60)}분 + 작업 ${Math.round(work / 60)}분`,
  }
})

function selectLatest() {
  pickedId.value = sim.state.workOrders.at(-1)?.id ?? pickedId.value
}
</script>

<template>
  <div class="dash-page">
    <section
      class="kpi-grid"
      aria-label="작업지시 지표"
    >
      <KpiCard
        label="진행 중"
        :value="String(kpi.counts.IN_PROGRESS)"
        unit="건"
        :sub="`하달 대기 ${kpi.counts.RELEASED} · 계획 ${kpi.counts.PLANNED}`"
        hint="제품이 라인에 투입되어 진행 중인 작업지시"
      />
      <KpiCard
        label="완료"
        :value="`${kpi.counts.COMPLETED} / ${kpi.total}`"
        unit="건"
        sub="전체 작업지시 중 완료"
      />
      <KpiCard
        label="보류"
        :value="String(kpi.counts.HELD)"
        unit="건"
        :tone="kpi.counts.HELD > 0 ? 'warn' : 'neutral'"
        sub="새 투입을 멈춘 작업지시"
      />
      <KpiCard
        label="납기 준수율"
        :value="kpi.otd"
        :sub="kpi.otdSub"
        :tone="kpi.otdTone"
        hint="OTD: 납기가 있는 완료 작업지시 중 납기 안에 끝낸 비율"
      />
      <KpiCard
        label="지연 위험"
        :value="String(kpi.late)"
        unit="건"
        :sub="kpi.lateSub"
        :tone="kpi.lateTone"
        hint="예상 완료가 납기를 넘거나 이미 납기가 지난 미완료 작업지시"
      />
      <KpiCard
        label="작업지시 리드타임"
        :value="kpi.leadTime"
        :sub="kpi.leadTimeSub"
        hint="완료된 작업지시의 평균 하달 → 완료 시간 = 대기(하달 → 첫 투입) + 작업(첫 투입 → 완료)"
      />
    </section>
    <WorkOrderLifecycle
      :counts="kpi.counts"
      :filter="filter"
      @filter="filter = $event"
    />
    <WorkOrderTable
      :etas="etas"
      :filter="filter"
      :selected-id="selectedId"
      @select="pickedId = $event"
    />
    <div class="dash-row">
      <WorkOrderGanttChart
        :etas="etas"
        :selected-id="selectedId"
        @select="pickedId = $event"
      />
      <WorkOrderInspector :work-order-id="selectedId" />
    </div>
    <div class="dash-row">
      <WorkOrderCreateForm @created="selectLatest" />
      <ConceptPanel :concepts="WORK_ORDER_CONCEPTS" />
    </div>
  </div>
</template>
