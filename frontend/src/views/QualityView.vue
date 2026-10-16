<script setup lang="ts">
import { computed, ref } from 'vue'
import { QUALITY_CONCEPTS } from '@/concepts/quality'
import ConceptPanel from '@/dashboard/ConceptPanel.vue'
import KpiCard, { type KpiTone } from '@/dashboard/KpiCard.vue'
import DefectParetoChart from '@/dashboard/quality/DefectParetoChart.vue'
import LotTrace from '@/dashboard/quality/LotTrace.vue'
import OperationYieldTable from '@/dashboard/quality/OperationYieldTable.vue'
import QualityTrendChart from '@/dashboard/quality/QualityTrendChart.vue'
import UnitTrace from '@/dashboard/quality/UnitTrace.vue'
import { operationYields, qualitySummary } from '@/domain/quality'
import { recentDefectUnits } from '@/domain/traceability'
import { useSimStore } from '@/stores/sim'
import { formatDuration, formatWon, percent } from '@/ui/format'

/** 품질 관리: 품질이 얼마나 좋은가 / 무엇 때문에 불량이 나나 / 문제가 생기면 어디까지 영향이 있나 */
const sim = useSimStore()

/** 사용자가 고른 제품. 고르기 전에는 가장 최근 불량 제품을 보여 준다 */
const pickedUnitId = ref<string | null>(null)
const unitId = computed(() => pickedUnitId.value ?? recentDefectUnits(sim.state, 1)[0]?.id ?? null)
const lotId = ref<string | null>(null)

function toneOf(ratio: number | null, good: number, warn: number): KpiTone {
  if (ratio === null) return 'neutral'
  return ratio >= good ? 'good' : ratio >= warn ? 'warn' : 'bad'
}

const kpi = computed(() => {
  const q = qualitySummary(sim.state, sim.master)
  const { rows, rty } = operationYields(sim.state, sim.master)
  const reworkTime = rows.reduce((sum, r) => sum + r.reworkTime, 0)
  return {
    finalYield: percent(q.finalYield, 1),
    finalYieldSub: `양품 ${q.good} · 폐기 ${q.scrapped} (재작업으로 ${q.reworkSaved}대 살림)`,
    finalYieldTone: toneOf(q.finalYield, 0.98, 0.95),
    fpy: percent(q.fpy, 1),
    fpySub: `한 번에 통과 ${q.firstPassGood} / 끝난 제품 ${q.finished}`,
    fpyTone: toneOf(q.fpy, 0.95, 0.9),
    rty: percent(rty, 1),
    reworks: String(q.reworks),
    reworksSub: reworkTime === 0 ? '재작업 시간 없음' : `설비 시간 ${formatDuration(reworkTime)} 사용`,
    scrapped: String(q.scrapped),
    scrapCost: formatWon(q.scrapCost),
  }
})

function selectLot(id: string) {
  lotId.value = id
}
</script>

<template>
  <div class="dash-page">
    <section
      class="kpi-grid"
      aria-label="품질 지표"
    >
      <KpiCard
        label="최종 양품률"
        :value="kpi.finalYield"
        :sub="kpi.finalYieldSub"
        :tone="kpi.finalYieldTone"
        hint="끝난 제품(완료 + 폐기) 중 양품으로 완료한 비율. 재작업으로 살린 제품도 양품"
      />
      <KpiCard
        label="직행률 (FPY)"
        :value="kpi.fpy"
        :sub="kpi.fpySub"
        :tone="kpi.fpyTone"
        hint="First Pass Yield: 끝난 제품 중 한 번도 불량 없이 완료한 비율"
      />
      <KpiCard
        label="RTY"
        :value="kpi.rty"
        sub="공정별 1차 합격률의 곱"
        hint="Rolled Throughput Yield: 모든 공정을 한 번에 통과할 확률"
      />
      <KpiCard
        label="재작업"
        :value="kpi.reworks"
        unit="회"
        :sub="kpi.reworksSub"
        hint="같은 설비에서 다시 가공한 횟수. 그 시간만큼 새 제품을 가공하지 못한다(숨은 공장)"
      />
      <KpiCard
        label="폐기"
        :value="kpi.scrapped"
        unit="개"
        sub="재작업 불가 유형 · 재작업 실패"
      />
      <KpiCard
        label="폐기 손실"
        :value="kpi.scrapCost"
        sub="폐기품에 들어간 자재비"
        hint="품질 비용(COPQ)의 일부. 설비 · 사람 시간은 포함하지 않음"
      />
    </section>
    <div class="dash-row">
      <QualityTrendChart />
      <DefectParetoChart />
    </div>
    <OperationYieldTable />
    <div class="dash-row q-trace-row">
      <UnitTrace
        :unit-id="unitId"
        @select-unit="pickedUnitId = $event"
        @select-lot="selectLot"
      />
      <LotTrace
        :lot-id="lotId"
        @select-lot="selectLot"
        @select-unit="pickedUnitId = $event"
      />
    </div>
    <ConceptPanel :concepts="QUALITY_CONCEPTS" />
  </div>
</template>
