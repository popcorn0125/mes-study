<script setup lang="ts">
import { computed, watch } from 'vue'
import { fetchQuality, fetchQualityTrend } from '@/api/quality'
import { usePolling } from '@/composables/usePolling'
import ConnectionNotice from '@/dashboard/ConnectionNotice.vue'
import DefectPareto from '@/dashboard/DefectPareto.vue'
import DefectRateChart from '@/dashboard/DefectRateChart.vue'
import OeeRangePicker from '@/dashboard/OeeRangePicker.vue'
import { formatRatio, OEE_RANGES, toTrendSlots, useOeeRange } from '@/dashboard/oee'
import { WORK_ORDER_STATUS_STYLE } from '@/dashboard/workOrders'

/**
 * 품질 관리: 직행률 · 양품률 · 불량 유형 파레토 · 시간대별 불량률 · 공정별 합격률 · 작업지시별 불량.
 * 구간은 생산 현황 · 설비 관리의 OEE 구간과 같은 값을 쓴다. 어느 구간 응답인지 함께 들고 와 늦은 응답이 섞이지 않게 한다.
 */
const range = useOeeRange()
const quality = usePolling(async () => {
  const r = range.value
  const [report, trend] = await Promise.all([fetchQuality(r), fetchQualityTrend(r)])
  return { range: r, report, trend }
})
watch(range, () => void quality.refresh())
const data = computed(() => (quality.data.value?.range === range.value ? quality.data.value : undefined))
const report = computed(() => data.value?.report)
const trendSlots = computed(() => (data.value ? toTrendSlots(data.value.trend) : []))
const rangeLabel = computed(() => OEE_RANGES.find((r) => r.value === range.value)?.label)
const hasProduction = computed(() => (report.value?.equipment ?? []).some((eq) => eq.totalCount > 0))

const numberFormat = new Intl.NumberFormat('ko-KR')
const count = (value: number | undefined) => (value === undefined ? '–' : numberFormat.format(value))
const width = (ratio: number | null) => `${Math.round((ratio ?? 0) * 100)}%`
</script>

<template>
  <div class="dash-page">
    <ConnectionNotice
      :error="quality.error.value"
      :updated-at="quality.updatedAt.value"
    />

    <section
      class="dash-card"
      aria-label="품질 조회 구간"
    >
      <header class="dash-card__header quality-head">
        <h2>품질 요약 <span>{{ rangeLabel }}</span></h2>
        <OeeRangePicker
          v-model="range"
          label="품질 조회 구간"
        />
      </header>
      <div class="dash-kpis">
        <div class="dash-kpi">
          <span class="dash-kpi__label">직행률 (공정별 합격률의 곱)</span>
          <strong class="dash-kpi__value">{{ report ? formatRatio(report.summary.fpy) : '–' }}</strong>
        </div>
        <div class="dash-kpi">
          <span class="dash-kpi__label">양품률 (완성품 ÷ 완성품 + 불량)</span>
          <strong class="dash-kpi__value">{{ report ? formatRatio(report.summary.yield) : '–' }}</strong>
        </div>
        <div class="dash-kpi">
          <span class="dash-kpi__label">불량 수 (전 공정)</span>
          <strong class="dash-kpi__value">{{ count(report?.summary.badCount) }}<small>개</small></strong>
        </div>
        <div class="dash-kpi">
          <span class="dash-kpi__label">완성품 (포장 양품)</span>
          <strong class="dash-kpi__value">{{ count(report?.summary.finishedCount) }}<small>개</small></strong>
        </div>
      </div>
      <p
        v-if="!report"
        class="dash-empty"
      >
        {{ quality.loading.value ? '불러오는 중…' : '품질 데이터를 받지 못했습니다.' }}
      </p>
      <p
        v-else-if="!hasProduction"
        class="dash-empty"
      >
        이 구간에는 생산한 것이 없습니다. 작업지시를 하달하고 자동 시뮬레이션을 열면 채워집니다.
      </p>
    </section>

    <div
      v-if="report"
      class="eq-bottom"
    >
      <section
        class="dash-card"
        aria-label="불량 유형 파레토"
      >
        <header class="dash-card__header">
          <h2>불량 유형 파레토</h2>
          <span>많은 순서</span>
        </header>
        <DefectPareto
          v-if="report.defects.length > 0"
          :defects="report.defects"
        />
        <p
          v-else
          class="dash-empty"
        >
          이 구간에는 불량이 없습니다.
        </p>
      </section>

      <section
        class="dash-card"
        aria-label="시간대별 불량률"
      >
        <header class="dash-card__header">
          <h2>시간대별 불량률</h2>
          <span>전 공정 불량 ÷ 생산</span>
        </header>
        <DefectRateChart :slots="trendSlots" />
      </section>
    </div>

    <section
      v-if="report"
      class="dash-card"
    >
      <header class="dash-card__header">
        <h2>공정별 합격률</h2>
        <span>합격률 = 양품 ÷ 생산 · 곱하면 직행률</span>
      </header>
      <div class="wo-table-wrap">
        <table class="dash-table quality-table">
          <thead>
            <tr>
              <th scope="col">
                공정
              </th>
              <th scope="col">
                생산
              </th>
              <th scope="col">
                양품
              </th>
              <th scope="col">
                불량
              </th>
              <th scope="col">
                합격률
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="eq in report.equipment"
              :key="eq.equipmentId"
            >
              <th scope="row">
                {{ eq.equipmentName }}
              </th>
              <td>{{ numberFormat.format(eq.totalCount) }}</td>
              <td>{{ numberFormat.format(eq.goodCount) }}</td>
              <td>{{ numberFormat.format(eq.badCount) }}</td>
              <td>
                <span class="oee-factor">
                  <span
                    class="wo-bar oee-bar"
                    aria-hidden="true"
                  ><span :style="{ width: width(eq.passRate) }" /></span>
                  {{ formatRatio(eq.passRate) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section
      v-if="report"
      class="dash-card"
    >
      <header class="dash-card__header">
        <h2>작업지시별 불량</h2>
        <span>이 구간에 생산한 지시</span>
      </header>
      <p
        v-if="report.workOrders.length === 0"
        class="dash-empty"
      >
        이 구간에 생산한 작업지시가 없습니다.
      </p>
      <div
        v-else
        class="wo-table-wrap"
      >
        <table class="dash-table quality-table">
          <thead>
            <tr>
              <th scope="col">
                작업지시
              </th>
              <th scope="col">
                품목
              </th>
              <th scope="col">
                상태
              </th>
              <th scope="col">
                완성품
              </th>
              <th scope="col">
                불량
              </th>
              <th scope="col">
                가장 많은 유형
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="wo in report.workOrders"
              :key="wo.workOrderId"
            >
              <th scope="row">
                <RouterLink
                  class="wo-link"
                  :to="{ name: 'work-orders', query: { workOrder: wo.workOrderId } }"
                >
                  {{ wo.workOrderId }}
                </RouterLink>
              </th>
              <td>{{ wo.itemCode }}</td>
              <td>
                <span class="wo-status"><i
                  class="wo-dot"
                  :style="{ background: WORK_ORDER_STATUS_STYLE[wo.status].color }"
                />{{ WORK_ORDER_STATUS_STYLE[wo.status].label }}</span>
              </td>
              <td>{{ numberFormat.format(wo.finishedCount) }}</td>
              <td>{{ numberFormat.format(wo.badCount) }}</td>
              <td>{{ wo.topDefectName ?? (wo.badCount > 0 ? '미분류' : '–') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
