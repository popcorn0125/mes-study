<script setup lang="ts">
import { computed } from 'vue'
import KpiCard, { type KpiTone } from '@/dashboard/KpiCard.vue'
import { plannedUph } from '@/domain/production'
import { shiftSummary } from '@/domain/report'
import type { Shift } from '@/domain/shifts'
import { useSimStore } from '@/stores/sim'
import { formatDuration, percent } from '@/ui/format'

/** 교대 요약 KPI: 계획 대비 실적, 양품률, 라인 OEE, UPH, 설비 정지, 작업지시 */
const props = defineProps<{ shift: Shift }>()
const sim = useSimStore()

function toneOf(ratio: number | null, good: number, warn: number): KpiTone {
  if (ratio === null) return 'neutral'
  return ratio >= good ? 'good' : ratio >= warn ? 'warn' : 'bad'
}

const kpi = computed(() => {
  const s = shiftSummary(sim.state, props.shift)
  const planUph = sim.state.plan ? plannedUph(sim.state.plan) : null
  const stopTotal = s.stops ? s.stops.DOWN + s.stops.PM + s.stops.STARVED_MATERIAL : null
  return {
    output: s.plan === null ? String(s.good) : `${s.good} / ${Math.floor(s.plan)}`,
    outputSub: s.plan === null ? '생산 계획 없음' : `달성률 ${percent(s.attainment)}${s.closed ? '' : ' · 지금까지 계획 대비'}`,
    outputTone: toneOf(s.attainment, 0.95, 0.85),
    yield: percent(s.finalYield, 1),
    yieldSub: `FPY ${percent(s.fpy, 1)} · 폐기 ${s.scrap} · 재작업 ${s.reworks}`,
    yieldTone: toneOf(s.finalYield, 0.98, 0.95),
    oee: percent(s.lineOee, 1),
    oeeTone: toneOf(s.lineOee, 0.85, 0.6),
    uph: s.uph === null ? '—' : s.uph.toFixed(1),
    uphSub: planUph === null ? '교대 평균' : `계획 ${planUph.toFixed(0)} · 교대 평균`,
    uphTone: planUph === null || s.uph === null ? ('neutral' as KpiTone) : toneOf(s.uph / planUph, 0.95, 0.85),
    stop: stopTotal === null ? '—' : formatDuration(stopTotal),
    stopSub: s.stops
      ? `고장 ${formatDuration(s.stops.DOWN)} · 정비 ${formatDuration(s.stops.PM)} · 자재 ${formatDuration(s.stops.STARVED_MATERIAL)}`
      : '설비 기록 보관 범위 밖',
    workOrders: String(s.workOrders.completed),
    workOrdersSub: s.workOrders.withDue === 0 ? '납기 있는 완료 없음' : `납기 준수 ${s.workOrders.onTime} / ${s.workOrders.withDue}`,
    workOrdersTone:
      s.workOrders.withDue === 0 ? ('neutral' as KpiTone) : s.workOrders.onTime === s.workOrders.withDue ? ('good' as KpiTone) : ('bad' as KpiTone),
  }
})
</script>

<template>
  <section
    class="kpi-grid"
    aria-label="교대 요약"
  >
    <KpiCard
      label="계획 대비 실적"
      :value="kpi.output"
      unit="대"
      :sub="kpi.outputSub"
      :tone="kpi.outputTone"
      hint="교대 구간의 양품 완료 수 ÷ 계획 수량(진행 중이면 지금까지의 계획)"
    />
    <KpiCard
      label="양품률"
      :value="kpi.yield"
      :sub="kpi.yieldSub"
      :tone="kpi.yieldTone"
      hint="교대 안에 끝난 제품(완료 + 폐기) 중 양품 비율. FPY는 한 번에 통과한 비율"
    />
    <KpiCard
      label="라인 OEE"
      :value="kpi.oee"
      sub="교대 구간 · 설비 평균"
      :tone="kpi.oeeTone"
      hint="설비별 교대 구간 OEE(가용성 × 성능 × 품질)의 평균"
    />
    <KpiCard
      label="UPH"
      :value="kpi.uph"
      unit="대/h"
      :sub="kpi.uphSub"
      :tone="kpi.uphTone"
      hint="교대 실적 ÷ 교대 경과 시간"
    />
    <KpiCard
      label="설비 정지"
      :value="kpi.stop"
      :sub="kpi.stopSub"
      hint="설비별 고장 · 예방정비 · 자재 부족 정지 시간의 합(설비 2대가 10분씩 서면 20분)"
    />
    <KpiCard
      label="작업지시 완료"
      :value="kpi.workOrders"
      unit="건"
      :sub="kpi.workOrdersSub"
      :tone="kpi.workOrdersTone"
    />
  </section>
</template>
