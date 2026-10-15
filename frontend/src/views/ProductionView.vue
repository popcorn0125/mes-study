<script setup lang="ts">
import { computed } from 'vue'
import { averageLeadTime, averageWip, throughputPerHour, wip, yieldRate } from '@/domain/kpi'
import { lineOee, planAttainment, planTotal, plannedQtyAt, plannedUph } from '@/domain/production'
import { useSimStore } from '@/stores/sim'
import { PRODUCTION_CONCEPTS } from '@/concepts/production'
import AlarmList from '@/dashboard/AlarmList.vue'
import ConceptPanel from '@/dashboard/ConceptPanel.vue'
import KpiCard, { type KpiTone } from '@/dashboard/KpiCard.vue'
import ProductionTrendChart from '@/dashboard/ProductionTrendChart.vue'
import { formatDuration, percent } from '@/ui/format'

/** 생산 현황: 계획대로 만들고 있나 / 라인이 잘 도나 / 지금 문제가 있나 */
const sim = useSimStore()

/** 기준 대비 비율로 상태를 정한다: good 이상이면 정상, warn 이상이면 주의, 그 아래는 미달 */
function toneOf(ratio: number | null, good: number, warn: number): KpiTone {
  if (ratio === null) return 'neutral'
  return ratio >= good ? 'good' : ratio >= warn ? 'warn' : 'bad'
}

// 매번 새 객체를 만들어 돌려줘야 엔진이 같은 객체를 고쳐 쓰더라도 화면이 갱신된다.
const kpi = computed(() => {
  const state = sim.state
  const plan = state.plan
  const attainment = planAttainment(state)
  const uph = throughputPerHour(state)
  const planUph = plan ? plannedUph(plan) : null
  const oee = lineOee(state)
  const yieldValue = yieldRate(state)
  const leadTime = averageLeadTime(state)
  const avgWip = averageWip(state)
  // Little의 법칙: 평균 리드타임 ≈ 평균 WIP ÷ 평균 처리율(라인을 빠져나간 개수/초). 둘 다 시작부터의 평균을 쓴다.
  const exited = state.counters.completed + state.counters.scrapped
  const littleLeadTime = exited > 0 ? avgWip / (exited / state.time) : null

  return {
    plan: {
      value: plan ? `${state.counters.completed} / ${Math.floor(plannedQtyAt(plan, state.time))}` : '—',
      sub: plan
        ? `달성률 ${percent(attainment)} · 총 계획 ${planTotal(plan)}대`
        : '생산 계획 없음',
      tone: toneOf(attainment, 0.95, 0.85),
    },
    uph: {
      value: uph.toFixed(1),
      sub: planUph === null ? '최근 1시간 기준' : `계획 ${planUph.toFixed(0)} · 최근 1시간 기준`,
      tone: planUph === null || state.time < 3600 ? 'neutral' : toneOf(uph / planUph, 0.95, 0.85),
    },
    oee: {
      value: percent(oee, 1),
      sub: '설비 평균 · 세계 수준 85%',
      tone: toneOf(oee, 0.85, 0.6),
    },
    yield: {
      value: percent(yieldValue, 1),
      sub: `양품 ${state.counters.completed} · 불량 ${state.counters.scrapped}`,
      tone: toneOf(yieldValue, 0.98, 0.95),
    },
    wip: {
      value: String(wip(state)),
      sub: `평균 ${avgWip.toFixed(1)}개`,
    },
    leadTime: {
      value: leadTime === 0 ? '—' : formatDuration(leadTime),
      sub: littleLeadTime === null ? 'Little의 법칙 예측 —' : `Little의 법칙 예측 ${formatDuration(littleLeadTime)}`,
    },
  }
})
</script>

<template>
  <div class="production">
    <section
      class="kpi-grid"
      aria-label="핵심 지표"
    >
      <KpiCard
        label="계획 대비 실적"
        :value="kpi.plan.value"
        unit="대"
        :sub="kpi.plan.sub"
        :tone="kpi.plan.tone"
        hint="실적(양품 완료 수) / 지금 시각까지 만들었어야 할 계획 수량"
      />
      <KpiCard
        label="UPH"
        :value="kpi.uph.value"
        unit="대/시"
        :sub="kpi.uph.sub"
        :tone="kpi.uph.tone"
        hint="Units Per Hour: 최근 1시간 동안 완료된 양품 수"
      />
      <KpiCard
        label="OEE"
        :value="kpi.oee.value"
        :sub="kpi.oee.sub"
        :tone="kpi.oee.tone"
        hint="설비종합효율 = 가용성 × 성능 × 품질 (설비별 OEE의 평균)"
      />
      <KpiCard
        label="양품률"
        :value="kpi.yield.value"
        :sub="kpi.yield.sub"
        :tone="kpi.yield.tone"
        hint="완료된 제품 중 양품 비율"
      />
      <KpiCard
        label="WIP"
        :value="kpi.wip.value"
        unit="개"
        :sub="kpi.wip.sub"
        hint="Work In Process: 투입됐지만 아직 완료·폐기되지 않은 재공품 수"
      />
      <KpiCard
        label="리드타임"
        :value="kpi.leadTime.value"
        :sub="kpi.leadTime.sub"
        hint="완료된 양품이 투입부터 완료까지 걸린 평균 시간"
      />
    </section>
    <div class="dash-row">
      <ProductionTrendChart />
    </div>
    <div class="dash-row">
      <AlarmList />
      <ConceptPanel :concepts="PRODUCTION_CONCEPTS" />
    </div>
  </div>
</template>
