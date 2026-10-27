<script setup lang="ts">
import { computed, watch } from 'vue'
import { fetchProduction } from '@/api/dashboard'
import { fetchCurrentWorkOrder } from '@/api/workOrders'
import { useNow } from '@/composables/useNow'
import { usePolling } from '@/composables/usePolling'
import { useLatestLogs } from '@/dashboard/latestLogs'
import ConnectionNotice from '@/dashboard/ConnectionNotice.vue'
import ProductionChart from '@/dashboard/ProductionChart.vue'
import {
  formatAgo,
  formatPercent,
  summarize,
  toProductionRows,
} from '@/dashboard/production'
import { estimateFinish, formatDateTime, progressOf } from '@/dashboard/workOrders'
import { fetchOee, fetchOeeTrend } from '@/api/oee'
import OeeRangePicker from '@/dashboard/OeeRangePicker.vue'
import OeeTrendChart from '@/dashboard/OeeTrendChart.vue'
import { explainLine, formatRatio, toTrendSlots, useOeeRange } from '@/dashboard/oee'

/** 생산 현황: 진행 중 작업지시의 진척, 라인 OEE, 작업 실적(누적 수량), 설비 가동 여부를 2초마다 다시 읽어 보여 준다 */
const production = usePolling(fetchProduction)
/** 진행 중 작업지시(서버가 고른 것). 없으면 null */
const current = usePolling(fetchCurrentWorkOrder)

/** 라인 OEE와 추이. 어느 구간 응답인지 함께 들고 와 구간을 바꾼 직후 늦은 응답이 섞이지 않게 한다 */
const range = useOeeRange()
const oee = usePolling(async () => {
  const r = range.value
  const [summary, trend] = await Promise.all([fetchOee(r), fetchOeeTrend(r)])
  return { range: r, summary, trend }
})
watch(range, () => void oee.refresh())
const oeeData = computed(() => (oee.data.value?.range === range.value ? oee.data.value : undefined))
const lineOee = computed(() => oeeData.value?.summary.line)
const trendSlots = computed(() => (oeeData.value ? toTrendSlots(oeeData.value.trend) : []))
// 최신 로그는 레이아웃이 2초마다 한 번 조회한 것을 헤더와 같이 쓴다
const latest = useLatestLogs()

/** "n초 전" 문구가 폴링 사이에도 흐르도록 1초마다 갱신하는 현재 시각 */
const now = useNow()

const workOrder = computed(() => current.data.value ?? undefined)
const workOrderId = computed(() => workOrder.value?.workOrderId)
const eta = computed(() => (workOrder.value ? estimateFinish(workOrder.value, now.value) : undefined))
const rows = computed(() => toProductionRows(production.data.value ?? [], workOrderId.value))
const summary = computed(() => summarize(rows.value, latest.data.value ?? [], now.value))

/** 요청 중 하나라도 실패하면 연결 안내를 띄운다 */
const error = computed(() => production.error.value ?? current.error.value ?? oee.error.value ?? latest.error.value)
const loading = computed(() => production.loading.value || current.loading.value || latest.loading.value)

const numberFormat = new Intl.NumberFormat('ko-KR')
/** 실적을 한 번도 받지 못했으면(서버가 처음부터 꺼져 있음) 0 대신 "–"를 보인다 */
const count = (value: number) => (production.data.value === undefined ? '–' : numberFormat.format(value))
</script>

<template>
  <div class="dash-page">
    <ConnectionNotice
      :error="error"
      :updated-at="production.updatedAt.value"
    />

    <section
      class="dash-card wo-current"
      aria-label="진행 중 작업지시"
    >
      <template v-if="workOrder">
        <div class="wo-current__head">
          <span class="wo-current__label">진행 중 작업지시</span>
          <RouterLink
            class="wo-link"
            :to="{ name: 'work-orders', query: { workOrder: workOrder.workOrderId } }"
          >
            {{ workOrder.workOrderId }}
          </RouterLink>
          <span>{{ workOrder.itemName }}</span>
          <span
            v-if="eta !== undefined"
            class="wo-current__eta"
          >예상 완료 <strong>{{ formatDateTime(eta) }}</strong></span>
        </div>
        <div class="wo-current__progress">
          <span class="wo-bar wo-bar--wide"><span :style="{ width: `${Math.round(progressOf(workOrder) * 100)}%` }" /></span>
          <span><strong>{{ numberFormat.format(workOrder.completedQty) }}</strong> / {{ numberFormat.format(workOrder.plannedQty) }}개
            ({{ Math.round(progressOf(workOrder) * 100) }}%)</span>
        </div>
      </template>
      <p
        v-else-if="current.data.value === null"
        class="dash-empty"
      >
        진행 중인 작업지시가 없어 라인이 대기 중입니다.
        <RouterLink
          class="wo-link"
          :to="{ name: 'work-orders' }"
        >
          작업지시 관리에서 하달하기
        </RouterLink>
      </p>
      <p
        v-else
        class="dash-empty"
      >
        {{ current.loading.value ? '불러오는 중…' : '작업지시를 받지 못했습니다.' }}
      </p>
    </section>

    <section
      class="dash-card"
      aria-label="라인 OEE"
    >
      <header class="dash-card__header">
        <h2>라인 OEE</h2>
        <OeeRangePicker v-model="range" />
      </header>
      <div class="oee-line">
        <strong class="oee-line__value">{{ lineOee ? formatRatio(lineOee.oee) : '–' }}</strong>
        <span
          v-if="lineOee && lineOee.plannedSec > 0"
          class="oee-line__explain"
        >{{ explainLine(lineOee) }}</span>
        <span
          v-else-if="lineOee"
          class="oee-line__explain"
        >이 구간에는 작업지시가 진행된 시간이 없습니다.</span>
        <span
          v-else
          class="oee-line__explain"
        >{{ oee.loading.value ? '불러오는 중…' : 'OEE를 받지 못했습니다.' }}</span>
      </div>
      <OeeTrendChart
        v-if="oeeData"
        :slots="trendSlots"
      />
    </section>

    <section
      class="dash-kpis"
      aria-label="생산 요약"
    >
      <div class="dash-kpi">
        <span class="dash-kpi__label">총 생산 (포장기)</span>
        <strong class="dash-kpi__value">{{ count(summary.lineOutput) }}<small>개</small></strong>
      </div>
      <div class="dash-kpi">
        <span class="dash-kpi__label">양품률 (포장기)</span>
        <strong class="dash-kpi__value">{{ formatPercent(summary.lineYield) }}</strong>
      </div>
      <div class="dash-kpi">
        <span class="dash-kpi__label">불량 합계 (전 공정)</span>
        <strong class="dash-kpi__value">{{ count(summary.totalDefects) }}<small>개</small></strong>
      </div>
      <div class="dash-kpi">
        <span class="dash-kpi__label">가동 설비</span>
        <strong class="dash-kpi__value">{{ latest.data.value === undefined ? '–' : summary.runningCount }}<small> / {{ summary.equipmentCount }}</small></strong>
      </div>
      <div class="dash-kpi">
        <span class="dash-kpi__label">마지막 센서 수신</span>
        <strong class="dash-kpi__value dash-kpi__value--text">{{ formatAgo(summary.lastReceivedAt, now) }}</strong>
      </div>
    </section>

    <section class="dash-card">
      <header class="dash-card__header">
        <h2>설비별 실적</h2>
        <span v-if="workOrderId">작업지시 {{ workOrderId }}</span>
      </header>
      <p
        v-if="loading"
        class="dash-empty"
      >
        불러오는 중…
      </p>
      <p
        v-else-if="production.data.value === undefined"
        class="dash-empty"
      >
        실적을 받지 못했습니다.
      </p>
      <p
        v-else-if="rows.length === 0"
        class="dash-empty"
      >
        {{ workOrderId ? '아직 실적이 없습니다. 자동 시뮬레이션을 열면 택트 타임마다 수량이 올라갑니다.' : '진행 중인 작업지시가 없습니다.' }}
      </p>
      <table
        v-else
        class="dash-table"
      >
        <thead>
          <tr>
            <th scope="col">
              설비
            </th>
            <th scope="col">
              총수량
            </th>
            <th scope="col">
              양품
            </th>
            <th scope="col">
              불량
            </th>
            <th scope="col">
              불량률
            </th>
            <th scope="col">
              마지막 갱신
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.equipmentId"
          >
            <th scope="row">
              {{ row.name }}
            </th>
            <td>{{ numberFormat.format(row.totalCount) }}</td>
            <td>{{ numberFormat.format(row.goodCount) }}</td>
            <td>{{ numberFormat.format(row.badCount) }}</td>
            <td>{{ formatPercent(row.defectRate) }}</td>
            <td>{{ formatAgo(Date.parse(row.lastUpdatedAt), now) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section
      v-if="rows.length > 0"
      class="dash-card"
    >
      <header class="dash-card__header">
        <h2>설비별 양품 · 불량</h2>
      </header>
      <ProductionChart :rows="rows" />
    </section>
  </div>
</template>
