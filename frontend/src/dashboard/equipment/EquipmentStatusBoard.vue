<script setup lang="ts">
import { computed, ref } from 'vue'
import { equipmentSpec } from '@/domain/equipment'
import { oee, utilization } from '@/domain/kpi'
import { downtimeLog, hoursToFailureRisk } from '@/domain/maintenance'
import type { EquipmentRuntime } from '@/domain/types'
import { EQUIPMENT_STATUS_STYLE, SENSOR_LEVEL_STYLE } from '@/scene/colors'
import { WEAR_DEFECT_ONSET, WEAR_FAILURE_ONSET } from '@/sim/failure'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, formatDuration, percent } from '@/ui/format'

/**
 * 설비 상태판: 설비마다 현재 상태, OEE, 마모도, 센서 경보, 고장 위험 구간까지 남은 가동 시간.
 * 카드를 누르면 그 설비가 선택되어 센서 추이·비가동 이력이 바뀐다. 예방정비도 여기서 요청한다.
 */
const props = defineProps<{ selectedId: string }>()
const emit = defineEmits<{ select: [id: string] }>()

const sim = useSimStore()
const actionError = ref<string | null>(null)

/**
 * 정지 중 표시. 예방정비는 계획된 시간이라 남은 시간을 알지만,
 * 고장 수리는 끝나야 실제 시간을 알 수 있어 경과 시간과 예상(표준) 시간만 보여 준다.
 */
function stopText(eq: EquipmentRuntime, expected: number | undefined): string | null {
  if (eq.status === 'PM') return `${formatDuration(eq.downRemaining)} 남음`
  if (eq.status !== 'DOWN') return null
  const [latest] = downtimeLog(sim.state, eq.id, 1)
  const elapsed = latest?.end === null ? formatDuration(sim.state.time - latest.start) : '—'
  return expected ? `${elapsed} 경과 · 예상 ${Math.round(expected / 60)}분` : `${elapsed} 경과`
}

const cards = computed(() => {
  const names = createNameLookup(sim.master)
  return sim.state.equipment.map((eq) => {
    const reliability = equipmentSpec(sim.master, eq.id, eq.workCenterId)?.reliability
    const stopped = eq.status === 'DOWN' || eq.status === 'PM'
    const risk = hoursToFailureRisk(eq, reliability)
    return {
      id: eq.id,
      name: names.equipment(eq.id),
      status: EQUIPMENT_STATUS_STYLE[eq.status],
      remaining: stopText(eq, reliability?.repairTime),
      oee: percent(oee(eq).oee, 1),
      utilization: percent(utilization(eq)),
      wear: reliability ? eq.wear : null,
      wearColor: eq.wear >= WEAR_FAILURE_ONSET ? '#f85149' : eq.wear >= WEAR_DEFECT_ONSET ? '#d29922' : '#3fb950',
      sensor: eq.sensor ? SENSOR_LEVEL_STYLE[eq.sensor.level] : null,
      risk: risk === null ? null : risk === 0 ? '고장 위험 구간' : `위험 구간까지 가동 ${risk.toFixed(1)}시간`,
      riskLevel: risk === 0 ? 'bad' : risk !== null && risk < 1 ? 'warn' : 'ok',
      maintenance: !reliability ? null : eq.maintenanceRequested ? '정비 대기 중' : stopped ? null : '예방정비 요청',
      canRequest: !!reliability && !eq.maintenanceRequested && !stopped,
    }
  })
})

function requestMaintenance(id: string) {
  actionError.value = sim.dispatch({ type: 'REQUEST_MAINTENANCE', equipmentId: id })
}
</script>

<template>
  <section aria-label="설비 상태판">
    <ul class="eq-board">
      <li
        v-for="c in cards"
        :key="c.id"
        class="card eq-card"
        :class="{ 'eq-card--selected': c.id === props.selectedId }"
        :style="{ '--status': c.status.color }"
        @click="emit('select', c.id)"
      >
        <button
          class="eq-card__name"
          :aria-pressed="c.id === props.selectedId"
          @click.stop="emit('select', c.id)"
        >
          {{ c.name }}
        </button>
        <p class="eq-card__status">
          <span class="eq-card__dot" />{{ c.status.label }}
          <span
            v-if="c.remaining"
            class="muted"
          >· {{ c.remaining }}</span>
        </p>
        <dl class="eq-card__stats">
          <dt>OEE</dt>
          <dd>{{ c.oee }}</dd>
          <dt>가동률</dt>
          <dd>{{ c.utilization }}</dd>
          <template v-if="c.sensor">
            <dt>센서</dt>
            <dd :style="{ color: c.sensor.color }">
              {{ c.sensor.label }}
            </dd>
          </template>
        </dl>
        <div
          v-if="c.wear !== null"
          class="eq-card__wear"
        >
          <span class="muted">마모도 {{ Math.round(c.wear * 100) }}%</span>
          <div
            class="eq-wear-bar"
            role="meter"
            :aria-valuenow="Math.round(c.wear * 100)"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="마모도"
          >
            <span :style="{ width: `${c.wear * 100}%`, background: c.wearColor }" />
            <i :style="{ left: `${WEAR_DEFECT_ONSET * 100}%` }" />
            <i :style="{ left: `${WEAR_FAILURE_ONSET * 100}%` }" />
          </div>
          <span
            class="eq-card__risk"
            :class="`eq-card__risk--${c.riskLevel}`"
          >{{ c.risk }}</span>
        </div>
        <button
          v-if="c.maintenance"
          class="btn btn--small"
          :disabled="!c.canRequest"
          @click.stop="requestMaintenance(c.id)"
        >
          {{ c.maintenance }}
        </button>
      </li>
    </ul>
    <p
      v-if="actionError"
      class="form-error"
      role="alert"
    >
      {{ actionError }}
    </p>
  </section>
</template>
