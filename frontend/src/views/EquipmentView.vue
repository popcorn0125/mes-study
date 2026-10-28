<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchRecentLogs, fetchStatusChanges, fetchStatusSummary } from '@/api/dashboard'
import { fetchDowntimeReasons, fetchDowntimes, fetchDowntimeSummary } from '@/api/downtime'
import { fetchOee } from '@/api/oee'
import { currentUser } from '@/auth/session'
import DowntimeList from '@/dashboard/DowntimeList.vue'
import ParetoBars from '@/dashboard/ParetoBars.vue'
import { toDowntimeParetoRows } from '@/dashboard/downtime'
import OeeBreakdown from '@/dashboard/OeeBreakdown.vue'
import OeeRangePicker from '@/dashboard/OeeRangePicker.vue'
import { useOeeRange } from '@/dashboard/oee'
import { useNow } from '@/composables/useNow'
import { usePolling } from '@/composables/usePolling'
import { useLatestLogs } from '@/dashboard/latestLogs'
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
 * 전체 설비의 최근 1시간 가동률, 비가동(정지) 사유 파레토 · 사유 입력을 2초마다 다시 읽어 보여 준다.
 */
const route = useRoute()
const router = useRouter()

/** 주소의 ?equipment= 값이 정의된 설비면 그 ID, 아니면 첫 설비 */
function equipmentFromQuery(value: unknown): string {
  return PRODUCER_EQUIPMENT.some((e) => e.id === value) ? (value as string) : PRODUCER_EQUIPMENT[0].id
}

/** 선택한 설비. 헤더 알림에서 /equipment?equipment=ID로 들어오면 그 설비로 시작한다 */
const selectedId = ref(equipmentFromQuery(route.query.equipment))

// 같은 화면에서 주소만 바뀌면(헤더 알림을 다시 누름) 선택을 따라 바꾸고,
// 카드로 선택을 바꾸면 주소에도 남겨 새로 고침 · 공유해도 같은 설비가 보이게 한다
watch(() => route.query.equipment, (value) => (selectedId.value = equipmentFromQuery(value)))
watch(selectedId, (id) => {
  if (route.query.equipment !== id) void router.replace({ query: { ...route.query, equipment: id } })
})
const selected = computed(() => PRODUCER_EQUIPMENT.find((e) => e.id === selectedId.value)!)

// 최신 로그는 레이아웃이 2초마다 한 번 조회한 것을 헤더와 같이 쓴다
const latest = useLatestLogs()
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
const now = useNow()

const cards = computed(() => toEquipmentCards(latest.data.value ?? [], now.value))
const utilization = computed(() => toUtilization(summary.data.value ?? []))

/** 추이 차트 점: [시각(ms), 값] */
const temperaturePoints = computed(() => (trendRows.value ?? []).map((r) => [Date.parse(r.recordedAt), r.temperature] as const))
const vibrationPoints = computed(() => (trendRows.value ?? []).map((r) => [Date.parse(r.recordedAt), r.vibration] as const))
const trendFrom = computed(() => now.value - TREND_MINUTES * 60_000)

/** 설비별 OEE. 구간은 생산 현황과 같이 쓰고, 어느 구간 응답인지 함께 들고 온다 */
const oeeRange = useOeeRange()
const oee = usePolling(async () => {
  const range = oeeRange.value
  return { range, summary: await fetchOee(range) }
})
watch(oeeRange, () => void oee.refresh())
const oeeEquipment = computed(() => (oee.data.value?.range === oeeRange.value ? oee.data.value.summary.equipment : undefined))

/** 비가동: 구간은 OEE와 같이 쓴다. 요약 · 목록을 함께 읽고 어느 구간 · 거르기 응답인지 들고 온다 */
const pendingOnly = ref(false)
const downtime = usePolling(async () => {
  const range = oeeRange.value
  const pending = pendingOnly.value
  const [report, downtimes] = await Promise.all([fetchDowntimeSummary(range), fetchDowntimes(range, pending)])
  return { range, pending, report, downtimes }
})
watch([oeeRange, pendingOnly], () => void downtime.refresh())
const downtimeData = computed(() => {
  const data = downtime.data.value
  return data?.range === oeeRange.value && data.pending === pendingOnly.value ? data : undefined
})
const downtimeRows = computed(() => toDowntimeParetoRows(downtimeData.value?.report.reasons ?? []))
/** 사유 목록은 기준정보라 1분마다만 다시 읽는다 */
const reasons = usePolling(fetchDowntimeReasons, 60_000)
const reasonList = computed(() => reasons.data.value ?? [])

const error = computed(() => latest.error.value ?? summary.error.value ?? oee.error.value ?? downtime.error.value
  ?? trend.error.value ?? changes.error.value)
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
        <h2>설비별 OEE</h2>
        <OeeRangePicker v-model="oeeRange" />
      </header>
      <p
        v-if="oeeEquipment === undefined"
        class="dash-empty"
      >
        {{ oee.loading.value ? '불러오는 중…' : 'OEE를 받지 못했습니다.' }}
      </p>
      <OeeBreakdown
        v-else
        :equipment="oeeEquipment"
      />
    </section>

    <section
      class="dash-card"
      aria-label="비가동"
    >
      <header class="dash-card__header">
        <h2>비가동</h2>
        <OeeRangePicker
          v-model="oeeRange"
          label="비가동 조회 구간"
        />
      </header>
      <div class="dash-kpis">
        <div class="dash-kpi">
          <span class="dash-kpi__label">정지 시간 (고장 DOWN 전체)</span>
          <strong class="dash-kpi__value">{{ downtimeData ? formatDuration(downtimeData.report.summary.downSec) : '–' }}</strong>
        </div>
        <div class="dash-kpi">
          <span class="dash-kpi__label">정지 수 (60초 이상)</span>
          <strong class="dash-kpi__value">{{ downtimeData?.report.summary.stopCount ?? '–' }}<small>건</small></strong>
        </div>
        <div
          class="dash-kpi"
          :class="{ 'dash-kpi--attention': (downtimeData?.report.summary.pendingCount ?? 0) > 0 }"
        >
          <span class="dash-kpi__label">사유 미입력</span>
          <strong class="dash-kpi__value">{{ downtimeData?.report.summary.pendingCount ?? '–' }}<small>건</small></strong>
        </div>
        <div class="dash-kpi">
          <span class="dash-kpi__label">순간 정지 (60초 미만)</span>
          <strong class="dash-kpi__value">{{ downtimeData ? formatDuration(downtimeData.report.summary.microSec) : '–' }}</strong>
        </div>
      </div>
      <p
        v-if="!downtimeData"
        class="dash-empty"
      >
        {{ downtime.loading.value ? '불러오는 중…' : '비가동 데이터를 받지 못했습니다.' }}
      </p>
      <div
        v-else
        class="eq-bottom downtime-body"
      >
        <div>
          <h3>사유 파레토 <span>정지 시간 많은 순</span></h3>
          <p
            v-if="downtimeRows.length === 0"
            class="dash-empty"
          >
            이 구간에는 정지가 없습니다.
          </p>
          <template v-else>
            <ParetoBars
              :rows="downtimeRows"
              label="비가동 사유 파레토(정지 시간 많은 순)"
            />
            <p class="oee-help">
              굵은 사유부터 줄이면 가동률이 가장 많이 오릅니다. 사유 미입력은 오른쪽 목록에서 사유를 넣으면 해당 사유로 옮겨 갑니다.
              순간 정지(60초 미만, 주로 불량 뒤 정지)는 사유를 받지 않습니다.
            </p>
          </template>
        </div>
        <div>
          <h3 class="downtime-list__head">
            정지 목록 <span>60초 이상 · 진행 중 먼저</span>
            <label class="downtime-filter">
              <input
                v-model="pendingOnly"
                type="checkbox"
              >
              사유 입력 대기만
            </label>
          </h3>
          <p
            v-if="downtimeData.downtimes.length === 0"
            class="dash-empty"
          >
            {{ pendingOnly ? '사유를 기다리는 정지가 없습니다.' : '이 구간에는 60초 이상 정지가 없습니다.' }}
          </p>
          <DowntimeList
            v-else
            :downtimes="downtimeData.downtimes"
            :reasons="reasonList"
            :entered-by="currentUser?.name"
            @saved="downtime.refresh()"
          />
        </div>
      </div>
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
          <h2>설비별 상태 비율</h2>
          <span>최근 {{ STATUS_MINUTES }}분 · 작업지시 없는 대기 포함 · 로그 1건 = 1초</span>
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
