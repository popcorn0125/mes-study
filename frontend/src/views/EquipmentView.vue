<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { fetchLatestLogs, fetchRecentLogs, fetchStatusChanges, fetchStatusSummary } from '@/api/dashboard'
import { usePolling } from '@/composables/usePolling'
import ConnectionNotice from '@/dashboard/ConnectionNotice.vue'
import EquipmentStatusCard from '@/dashboard/EquipmentStatusCard.vue'
import MetricTrendChart from '@/dashboard/MetricTrendChart.vue'
import UtilizationBars from '@/dashboard/UtilizationBars.vue'
import { formatClock, formatDuration, toEquipmentCards, toUtilization } from '@/dashboard/equipment'
import { PRODUCER_EQUIPMENT } from '@/producer/equipment'
import { EQUIPMENT_STATUS_STYLE } from '@/scene/colors'

/** 추이 차트 기간(분) */
const TREND_MINUTES = 10
/** 상태 비율 · 변경 이력 기간(분) */
const STATUS_MINUTES = 60

/**
 * 설비 관리: 설비 5대의 현재 상태 카드, 선택한 설비의 온도 · 진동 추이와 상태 변경 이력,
 * 전체 설비의 최근 1시간 가동률을 2초마다 다시 읽어 보여 준다.
 */
const selectedId = ref(PRODUCER_EQUIPMENT[0].id)
const selected = computed(() => PRODUCER_EQUIPMENT.find((e) => e.id === selectedId.value)!)

const latest = usePolling(fetchLatestLogs)
const summary = usePolling(() => fetchStatusSummary(STATUS_MINUTES))

/**
 * 선택한 설비의 조회는 어느 설비 응답인지 함께 들고 온다.
 * 선택을 바꾼 직후 앞 설비의 응답이 늦게 도착해도 화면에 섞이지 않게 하려는 것이다.
 */
const trend = usePolling(async () => {
  const equipmentId = selectedId.value
  return { equipmentId, rows: await fetchRecentLogs(equipmentId, TREND_MINUTES) }
})
const changes = usePolling(async () => {
  const equipmentId = selectedId.value
  return { equipmentId, rows: await fetchStatusChanges(equipmentId, STATUS_MINUTES) }
})

/** 선택한 설비의 응답만 꺼낸다(아직 오지 않았으면 undefined) */
const trendRows = computed(() => (trend.data.value?.equipmentId === selectedId.value ? trend.data.value.rows : undefined))
const changeRows = computed(() => (changes.data.value?.equipmentId === selectedId.value ? changes.data.value.rows : undefined))

// 설비를 바꾸면 2초를 기다리지 않고 바로 다시 부른다
watch(selectedId, () => {
  void trend.refresh()
  void changes.refresh()
})

/** 통신 끊김 판정 · "n초 전" · 추이 가로축 끝에 쓰는 현재 시각(1초마다 갱신) */
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(clock))

const cards = computed(() => toEquipmentCards(latest.data.value ?? [], now.value))
const utilization = computed(() => toUtilization(summary.data.value ?? []))

/** 추이 차트 점: [시각(ms), 값] */
const temperaturePoints = computed(() => (trendRows.value ?? []).map((r) => [Date.parse(r.recordedAt), r.temperature] as const))
const vibrationPoints = computed(() => (trendRows.value ?? []).map((r) => [Date.parse(r.recordedAt), r.vibration] as const))
const trendFrom = computed(() => now.value - TREND_MINUTES * 60_000)

const error = computed(() => latest.error.value ?? summary.error.value ?? trend.error.value ?? changes.error.value)
</script>

<template>
  <div class="dash-page">
    <ConnectionNotice
      :error="error"
      :updated-at="latest.updatedAt.value"
    />

    <section
      class="eq-cards"
      aria-label="설비 상태"
    >
      <EquipmentStatusCard
        v-for="card in cards"
        :key="card.equipment.id"
        :card="card"
        :selected="card.equipment.id === selectedId"
        :now="now"
        @select="selectedId = $event"
      />
    </section>

    <section class="dash-card">
      <header class="dash-card__header">
        <h2>{{ selected.name }} 온도 · 진동 추이</h2>
        <span>최근 {{ TREND_MINUTES }}분 · 카드를 눌러 설비를 바꿉니다</span>
      </header>
      <p
        v-if="trendRows === undefined"
        class="dash-empty"
      >
        불러오는 중…
      </p>
      <p
        v-else-if="trendRows.length === 0"
        class="dash-empty"
      >
        최근 {{ TREND_MINUTES }}분 동안 받은 로그가 없습니다. 자동 시뮬레이션을 열면 1초마다 쌓입니다.
      </p>
      <div
        v-else
        class="eq-trends"
      >
        <div>
          <h3>온도</h3>
          <MetricTrendChart
            :points="temperaturePoints"
            label="온도"
            unit="°C"
            :range="selected.temperature"
            :from="trendFrom"
            :to="now"
          />
        </div>
        <div>
          <h3>진동</h3>
          <MetricTrendChart
            :points="vibrationPoints"
            label="진동"
            unit="mm/s"
            :range="selected.vibration"
            :from="trendFrom"
            :to="now"
          />
        </div>
      </div>
    </section>

    <div class="eq-bottom">
      <section class="dash-card">
        <header class="dash-card__header">
          <h2>설비별 가동률</h2>
          <span>최근 {{ STATUS_MINUTES }}분 · 로그 1건 = 1초</span>
        </header>
        <p
          v-if="summary.data.value === undefined"
          class="dash-empty"
        >
          불러오는 중…
        </p>
        <UtilizationBars
          v-else
          :items="utilization"
          :minutes="STATUS_MINUTES"
        />
      </section>

      <section class="dash-card">
        <header class="dash-card__header">
          <h2>{{ selected.name }} 상태 변경 이력</h2>
          <span>최근 {{ STATUS_MINUTES }}분 · 최신 순</span>
        </header>
        <p
          v-if="changeRows === undefined"
          class="dash-empty"
        >
          불러오는 중…
        </p>
        <p
          v-else-if="changeRows.length === 0"
          class="dash-empty"
        >
          최근 {{ STATUS_MINUTES }}분 동안 받은 로그가 없습니다.
        </p>
        <div
          v-else
          class="eq-history"
        >
          <table class="dash-table">
            <thead>
              <tr>
                <th scope="col">
                  상태
                </th>
                <th scope="col">
                  시작
                </th>
                <th scope="col">
                  끝
                </th>
                <th scope="col">
                  지속
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="change in changeRows"
                :key="change.startedAt"
              >
                <th scope="row">
                  <span
                    aria-hidden="true"
                    :style="{ color: EQUIPMENT_STATUS_STYLE[change.status]?.color }"
                  >●</span> {{ EQUIPMENT_STATUS_STYLE[change.status]?.label ?? change.status }}
                </th>
                <td>{{ formatClock(change.startedAt) }}</td>
                <td>{{ change.endedAt ? formatClock(change.endedAt) : '진행 중' }}</td>
                <td>{{ formatDuration(change.seconds) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
