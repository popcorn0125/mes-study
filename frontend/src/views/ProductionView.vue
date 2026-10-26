<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { fetchLatestLogs, fetchProduction } from '@/api/dashboard'
import { usePolling } from '@/composables/usePolling'
import ConnectionNotice from '@/dashboard/ConnectionNotice.vue'
import ProductionChart from '@/dashboard/ProductionChart.vue'
import {
  currentWorkOrderId,
  formatAgo,
  formatPercent,
  summarize,
  toProductionRows,
} from '@/dashboard/production'

/** 생산 현황: 작업 실적(누적 수량)과 설비 가동 여부를 2초마다 다시 읽어 보여 준다 */
const production = usePolling(fetchProduction)
const latest = usePolling(fetchLatestLogs)

/** "n초 전" 문구가 폴링 사이에도 흐르도록 1초마다 갱신하는 현재 시각 */
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(clock))

const workOrderId = computed(() => currentWorkOrderId(production.data.value ?? []))
const rows = computed(() => toProductionRows(production.data.value ?? [], workOrderId.value))
const summary = computed(() => summarize(rows.value, latest.data.value ?? [], now.value))

/** 두 요청 중 하나라도 실패하면 연결 안내를 띄운다 */
const error = computed(() => production.error.value ?? latest.error.value)
const loading = computed(() => production.loading.value || latest.loading.value)

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
        아직 실적이 없습니다. 자동 시뮬레이션을 열면 택트 타임마다 수량이 올라갑니다.
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
