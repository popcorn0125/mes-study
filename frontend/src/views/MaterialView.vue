<script setup lang="ts">
import { computed, ref } from 'vue'
import { MATERIAL_CONCEPTS } from '@/concepts/materials'
import ConceptPanel from '@/dashboard/ConceptPanel.vue'
import KpiCard, { type KpiTone } from '@/dashboard/KpiCard.vue'
import BomRequirement from '@/dashboard/materials/BomRequirement.vue'
import PurchaseOrderList from '@/dashboard/materials/PurchaseOrderList.vue'
import StockTable from '@/dashboard/materials/StockTable.vue'
import StockTrendChart from '@/dashboard/materials/StockTrendChart.vue'
import { inventorySummary } from '@/domain/materials'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, formatDuration, formatWon } from '@/ui/format'

/** 자재 / 재고: 지금 재고가 충분한가 / 앞으로 얼마나 더 필요한가 / 들어올 자재는 언제 오나 */
const sim = useSimStore()

const materialId = ref(sim.master.materials[0]?.id ?? '')

const kpi = computed(() => {
  const s = inventorySummary(sim.state, sim.master)
  const names = createNameLookup(sim.master)
  const lead = s.minCoverage ? sim.master.materials.find((m) => m.id === s.minCoverage!.materialId)!.leadTime : 0
  let coverageTone: KpiTone = 'neutral'
  if (s.minCoverage) coverageTone = s.minCoverage.seconds >= lead ? 'good' : s.minCoverage.seconds >= lead / 2 ? 'warn' : 'bad'
  return {
    value: formatWon(s.totalValue),
    coverage: s.minCoverage ? formatDuration(s.minCoverage.seconds) : '—',
    coverageSub: s.minCoverage ? `${names.material(s.minCoverage.materialId)} · 리드타임 ${formatDuration(lead)}` : '소비 중인 자재 없음',
    coverageTone,
    belowSafety: String(s.belowSafety),
    belowSafetyTone: (s.belowSafety === 0 ? 'good' : 'warn') as KpiTone,
    pending: String(s.pendingOrders),
    pendingSub: s.nextArrival === null ? '입고 대기 없음' : `가장 빠른 입고 ${formatDuration(s.nextArrival)} 후`,
    materialStop: formatDuration(s.materialStop),
    materialStopTone: (s.materialStop === 0 ? 'good' : 'bad') as KpiTone,
    surcharge: formatWon(s.expediteSurcharge),
  }
})
</script>

<template>
  <div class="dash-page">
    <section
      class="kpi-grid"
      aria-label="재고 지표"
    >
      <KpiCard
        label="재고 금액"
        :value="kpi.value"
        sub="현재고 × 단가 합계"
        hint="재고에 묶인 돈. 많을수록 결품 위험은 줄지만 자금 · 보관 비용이 든다"
      />
      <KpiCard
        label="최소 재고 커버"
        :value="kpi.coverage"
        :sub="kpi.coverageSub"
        :tone="kpi.coverageTone"
        hint="자재별 현재고 ÷ 최근 1시간 소비 속도 중 가장 짧은 값. 조달 리드타임보다 짧으면 주의"
      />
      <KpiCard
        label="안전재고 이하"
        :value="kpi.belowSafety"
        unit="종"
        sub="결품 포함"
        :tone="kpi.belowSafetyTone"
        hint="현재고가 안전재고 이하인 자재 수. 완충 재고를 쓰고 있다는 뜻"
      />
      <KpiCard
        label="입고 대기 발주"
        :value="kpi.pending"
        unit="건"
        :sub="kpi.pendingSub"
      />
      <KpiCard
        label="자재 부족 정지"
        :value="kpi.materialStop"
        sub="설비별 자재 부족 상태 누적"
        :tone="kpi.materialStopTone"
        hint="자재가 없어 설비가 멈춘 시간(비계획 정지). 설비 고장과 원인이 다르다"
      />
      <KpiCard
        label="긴급 발주 할증"
        :value="kpi.surcharge"
        sub="누계"
        hint="긴급 발주로 더 낸 비용. 자재 부족 정지 손실과 비교해 판단한다"
      />
    </section>
    <StockTable
      :selected-id="materialId"
      @select="materialId = $event"
    />
    <div class="dash-row mat-row">
      <StockTrendChart :material-id="materialId" />
      <PurchaseOrderList :material-id="materialId" />
    </div>
    <BomRequirement @select="materialId = $event" />
    <ConceptPanel :concepts="MATERIAL_CONCEPTS" />
  </div>
</template>
