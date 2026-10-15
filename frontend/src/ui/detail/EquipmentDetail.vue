<script setup lang="ts">
import { computed, ref } from 'vue'
import { equipmentSpec } from '@/domain/equipment'
import { EQUIPMENT_STATUSES } from '@/domain/types'
import { oee, utilization } from '@/domain/kpi'
import { EQUIPMENT_STATUS_STYLE, SENSOR_LEVEL_STYLE } from '@/scene/colors'
import { WEAR_DEFECT_ONSET, WEAR_FAILURE_ONSET } from '@/sim/failure'
import { useSelectionStore } from '@/stores/selection'
import { useSimStore } from '@/stores/sim'
import SensorSparkline from '../SensorSparkline.vue'
import { createNameLookup, formatDuration, percent } from '../format'
import WorkCenterActions from './WorkCenterActions.vue'

const props = defineProps<{ id: string }>()
const sim = useSimStore()
const selection = useSelectionStore()
const actionError = ref<string | null>(null)

const view = computed(() => {
  const eq = sim.state.equipment.find((e) => e.id === props.id)
  if (!eq) return null
  const names = createNameLookup(sim.master)
  const spec = equipmentSpec(sim.master, eq.id, eq.workCenterId)
  const total = EQUIPMENT_STATUSES.reduce((sum, s) => sum + eq.statusTime[s], 0)
  const o = oee(eq)
  return {
    name: names.equipment(eq.id),
    workCenterId: eq.workCenterId,
    workCenter: names.workCenter(eq.workCenterId),
    status: EQUIPMENT_STATUS_STYLE[eq.status],
    unitId: eq.unitId,
    remaining: eq.status === 'RUN' ? eq.remaining : null,
    downtime: eq.status === 'DOWN' || eq.status === 'PM' ? formatDuration(eq.downRemaining) : null,
    utilization: percent(utilization(eq)),
    // 한 번이라도 머문 상태만 보여준다(7가지 상태를 모두 나열하면 읽기 어렵다)
    statusShare: EQUIPMENT_STATUSES.filter((s) => eq.statusTime[s] > 0).map((s) => ({
      status: s,
      ...EQUIPMENT_STATUS_STYLE[s],
      ratio: total === 0 ? 0 : eq.statusTime[s] / total,
    })),
    oee: {
      availability: percent(o.availability),
      performance: percent(o.performance),
      quality: percent(o.quality, 1),
      oee: percent(o.oee),
    },
    processed: eq.processedCount,
    defects: eq.defectCount,
    health: spec?.reliability && {
      wear: eq.wear,
      wearText: percent(eq.wear),
      wearColor: eq.wear >= WEAR_FAILURE_ONSET ? '#f85149' : eq.wear >= WEAR_DEFECT_ONSET ? '#d29922' : '#3fb950',
      failures: eq.failureCount,
      repairTime: formatDuration(spec.reliability.repairTime),
      maintenanceTime: formatDuration(spec.reliability.maintenanceTime),
      maintenanceRequested: eq.maintenanceRequested,
      canRequest: !eq.maintenanceRequested && eq.status !== 'DOWN' && eq.status !== 'PM',
    },
    sensor: eq.sensor &&
      spec?.sensor && {
        temperature: `${eq.sensor.temperature.toFixed(1)}°C`,
        temperatureLevel: SENSOR_LEVEL_STYLE[eq.sensor.temperatureLevel],
        vibration: `${eq.sensor.vibration.toFixed(2)}mm/s`,
        vibrationLevel: SENSOR_LEVEL_STYLE[eq.sensor.vibrationLevel],
        temperatureHistory: eq.sensorHistory.map((h) => h.temperature),
        vibrationHistory: eq.sensorHistory.map((h) => h.vibration),
        limits: spec.sensor,
      },
  }
})

function requestMaintenance() {
  actionError.value = sim.dispatch({ type: 'REQUEST_MAINTENANCE', equipmentId: props.id })
}
</script>

<template>
  <div v-if="view">
    <header class="detail-header">
      <span class="detail-kind">설비</span>
      <h2>{{ view.name }}</h2>
      <span
        class="badge"
        :style="{ borderColor: view.status.color, color: view.status.color }"
      >● {{ view.status.label }}<template v-if="view.downtime"> · {{ view.downtime }} 남음</template></span>
    </header>

    <dl class="kv">
      <dt>작업장</dt>
      <dd>
        <button
          class="link-btn"
          @click="selection.select({ kind: 'workCenter', id: view.workCenterId })"
        >
          {{ view.workCenter }}
        </button>
      </dd>
      <dt>가공 중</dt>
      <dd>
        <button
          v-if="view.unitId"
          class="link-btn"
          @click="selection.select({ kind: 'unit', id: view.unitId })"
        >
          {{ view.unitId }}
        </button>
        <span v-else>—</span>
        <span v-if="view.remaining !== null"> (남은 {{ view.remaining }}초)</span>
      </dd>
      <dt>가공 / 불량</dt>
      <dd>{{ view.processed }} / {{ view.defects }}</dd>
    </dl>

    <div
      v-if="view.sensor"
      class="detail-section"
    >
      <h3>센서</h3>
      <dl class="kv kv--compact">
        <dt>온도</dt>
        <dd>
          {{ view.sensor.temperature }}
          <span :style="{ color: view.sensor.temperatureLevel.color }">● {{ view.sensor.temperatureLevel.label }}</span>
        </dd>
        <dt>진동</dt>
        <dd>
          {{ view.sensor.vibration }}
          <span :style="{ color: view.sensor.vibrationLevel.color }">● {{ view.sensor.vibrationLevel.label }}</span>
        </dd>
      </dl>
      <SensorSparkline
        :values="view.sensor.vibrationHistory"
        :warning="view.sensor.limits.vibration.warning"
        :critical="view.sensor.limits.vibration.critical"
        label="진동"
        unit="mm/s"
      />
      <SensorSparkline
        :values="view.sensor.temperatureHistory"
        :warning="view.sensor.limits.temperature.warning"
        :critical="view.sensor.limits.temperature.critical"
        label="온도"
        unit="°C"
      />
      <p class="hint">
        최근 1시간, 30초 간격 기록. 온도는 진동보다 늦게 반응합니다.
        진동은 가동 중에만 판정하므로, 정지 중에는 값이 낮아도 직전 경보 단계가 유지되고 수리·예방정비 후 해제됩니다.
      </p>
    </div>

    <div
      v-if="view.health"
      class="detail-section"
    >
      <h3>설비 상태(마모도) {{ view.health.wearText }}</h3>
      <div
        class="wear-bar"
        role="meter"
        aria-label="마모도"
        :aria-valuenow="Math.round(view.health.wear * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="wear-bar__fill"
          :style="{ width: `${view.health.wear * 100}%`, background: view.health.wearColor }"
        />
        <span
          class="wear-bar__mark"
          :style="{ left: `${WEAR_DEFECT_ONSET * 100}%` }"
        />
        <span
          class="wear-bar__mark"
          :style="{ left: `${WEAR_FAILURE_ONSET * 100}%` }"
        />
      </div>
      <p class="hint">
        {{ WEAR_DEFECT_ONSET * 100 }}%부터 불량률이 오르고, {{ WEAR_FAILURE_ONSET * 100 }}%부터 고장 확률이 생깁니다.
      </p>
      <dl class="kv kv--compact">
        <dt>고장 횟수</dt>
        <dd>{{ view.health.failures }}회</dd>
        <dt>수리 시간</dt>
        <dd>{{ view.health.repairTime }} (고장 시)</dd>
        <dt>정비 시간</dt>
        <dd>{{ view.health.maintenanceTime }} (예방정비 시)</dd>
      </dl>
      <button
        class="btn btn--small"
        :disabled="!view.health.canRequest"
        @click="requestMaintenance"
      >
        🔧 {{ view.health.maintenanceRequested ? '예방정비 대기 중 (현재 Unit 완료 후)' : '예방정비 요청' }}
      </button>
      <p
        v-if="actionError"
        class="form-error"
        role="alert"
      >
        {{ actionError }}
      </p>
    </div>

    <div class="detail-section">
      <h3>가동률 {{ view.utilization }}</h3>
      <div
        class="stack-bar"
        role="img"
        :aria-label="view.statusShare.map((s) => `${s.label} ${percent(s.ratio)}`).join(', ')"
      >
        <span
          v-for="s in view.statusShare"
          :key="s.status"
          :style="{ width: `${s.ratio * 100}%`, background: s.color }"
        />
      </div>
      <ul class="stack-legend">
        <li
          v-for="s in view.statusShare"
          :key="s.status"
        >
          <i :style="{ background: s.color }" />{{ s.label }} {{ percent(s.ratio) }}
        </li>
      </ul>
    </div>

    <div class="detail-section">
      <h3>OEE {{ view.oee.oee }}</h3>
      <dl class="kv kv--compact">
        <dt>가용성</dt>
        <dd>{{ view.oee.availability }}</dd>
        <dt>성능</dt>
        <dd>{{ view.oee.performance }}</dd>
        <dt>품질</dt>
        <dd>{{ view.oee.quality }}</dd>
      </dl>
      <p class="hint">
        가용성은 고장·자재 부족 시간을 뺀 비율이며, 예방정비(계획 정지)는 손실로 보지 않습니다.
        성능 = 표준 사이클타임 기준 기대 시간 ÷ 실제 가동 시간.
      </p>
    </div>

    <WorkCenterActions :work-center-id="view.workCenterId" />
  </div>
  <p
    v-else
    class="hint"
  >
    설비를 찾을 수 없습니다.
  </p>
</template>
