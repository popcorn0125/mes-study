<script setup lang="ts">
import { computed } from 'vue'
import { averageLeadTime, bottleneck, maxQtyPer, throughputPerHour, wip, yieldRate } from '@/domain/kpi'
import { type Selection, useSelectionStore } from '@/stores/selection'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, formatDuration, percent } from './format'

const sim = useSimStore()
const selection = useSelectionStore()

// 매번 새 객체를 만들어 돌려줘야 엔진이 같은 객체를 고쳐 쓰더라도 화면이 갱신된다.
const kpi = computed(() => {
  const state = sim.state
  const names = createNameLookup(sim.master)
  const constraint = bottleneck(sim.master, state)
  const leadTime = averageLeadTime(state)
  return {
    uph: throughputPerHour(state).toFixed(1),
    wip: wip(state),
    leadTime: leadTime === 0 ? '—' : formatDuration(leadTime),
    yield: percent(yieldRate(state), 1),
    good: state.counters.completed,
    scrap: state.counters.scrapped,
    bottleneckId: constraint?.workCenterId ?? null,
    bottleneck: constraint ? names.workCenter(constraint.workCenterId) : '—',
    bottleneckDetail: constraint
      ? `${Math.round(constraint.effectiveCycleTime)}초/개 · 최대 ${Math.round(constraint.maxUph)} UPH`
      : '',
    alarms: alarmsOf(),
  }
})

/**
 * 경보: 고장 설비, 센서 경고·위험 설비, 결품 자재(BOM 1대분도 안 남음). 클릭하면 가장 급한 대상을 연다.
 * 발주점 이하는 자동 발주가 나가는 정상 흐름이라 경보로 세지 않는다(자재 랙에서 노란색으로만 표시).
 */
function alarmsOf() {
  const state = sim.state
  const down = state.equipment.filter((eq) => eq.status === 'DOWN')
  const sensor = state.equipment.filter((eq) => eq.status !== 'DOWN' && eq.sensor && eq.sensor.level !== 'NORMAL')
  const lowMaterials = sim.master.materials.filter((m) => state.materials[m.id].onHand < maxQtyPer(sim.master, m.id))
  const critical = sensor.find((eq) => eq.sensor!.level === 'CRITICAL')
  const target: Selection | null = down[0]
    ? { kind: 'equipment', id: down[0].id }
    : critical
      ? { kind: 'equipment', id: critical.id }
      : sensor[0]
        ? { kind: 'equipment', id: sensor[0].id }
        : lowMaterials[0]
          ? { kind: 'material', id: lowMaterials[0].id }
          : null
  return { down: down.length, sensor: sensor.length, material: lowMaterials.length, target }
}
</script>

<template>
  <section
    class="panel kpi-bar"
    aria-label="라인 KPI"
  >
    <div
      class="kpi"
      title="최근 1시간 동안 완료된 양품 수를 시간당으로 환산"
    >
      <span class="kpi__label">시간당 생산량</span>
      <span class="kpi__value">{{ kpi.uph }}<small> UPH</small></span>
    </div>
    <div
      class="kpi"
      title="라인 안에 있는 재공품(버퍼 대기 + 가공 중)"
    >
      <span class="kpi__label">재공품(WIP)</span>
      <span class="kpi__value">{{ kpi.wip }}<small> 개</small></span>
    </div>
    <div
      class="kpi"
      title="양품 1개가 투입부터 완료까지 걸린 평균 시간"
    >
      <span class="kpi__label">평균 리드타임</span>
      <span class="kpi__value">{{ kpi.leadTime }}</span>
    </div>
    <div
      class="kpi"
      title="완료된 Unit 중 양품 비율"
    >
      <span class="kpi__label">양품률</span>
      <span class="kpi__value">{{ kpi.yield }}<small> ({{ kpi.good }}/{{ kpi.good + kpi.scrap }})</small></span>
    </div>
    <button
      class="kpi kpi--button"
      title="부하(사이클타임 ÷ 설비 대수)가 가장 큰 작업장. 라인 생산량의 상한을 정합니다. 클릭하면 상세 정보를 엽니다"
      :disabled="!kpi.bottleneckId"
      @click="kpi.bottleneckId && selection.select({ kind: 'workCenter', id: kpi.bottleneckId })"
    >
      <span class="kpi__label">병목 공정</span>
      <span class="kpi__value kpi__value--warn">{{ kpi.bottleneck }}<small> {{ kpi.bottleneckDetail }}</small></span>
    </button>
    <button
      class="kpi kpi--button"
      title="고장 설비 · 센서 경고 설비 · 결품 자재. 클릭하면 가장 급한 대상을 엽니다"
      :disabled="!kpi.alarms.target"
      @click="kpi.alarms.target && selection.select(kpi.alarms.target)"
    >
      <span class="kpi__label">경보</span>
      <span class="kpi__value kpi__alarms">
        <span :class="{ 'text-ng': kpi.alarms.down }">고장 {{ kpi.alarms.down }}</span>
        <span :class="{ 'text-warn': kpi.alarms.sensor }">센서 {{ kpi.alarms.sensor }}</span>
        <span :class="{ 'text-ng': kpi.alarms.material }">결품 {{ kpi.alarms.material }}</span>
      </span>
    </button>
  </section>
</template>
