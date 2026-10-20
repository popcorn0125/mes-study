<script setup lang="ts">
import { computed, ref } from 'vue'
import { REPORT_CONCEPTS } from '@/concepts/report'
import ConceptPanel from '@/dashboard/ConceptPanel.vue'
import HandoverNotes from '@/dashboard/report/HandoverNotes.vue'
import HourlyReportTable from '@/dashboard/report/HourlyReportTable.vue'
import ItemReportTable from '@/dashboard/report/ItemReportTable.vue'
import ShiftSummary from '@/dashboard/report/ShiftSummary.vue'
import WorkCenterReportTable from '@/dashboard/report/WorkCenterReportTable.vue'
import { hourlyCsvRows, shiftTitle } from '@/dashboard/report/display'
import { toCsv } from '@/domain/csv'
import { hourlyReport } from '@/domain/report'
import { isClosed, shiftsUntil } from '@/domain/shifts'
import { useSimStore } from '@/stores/sim'
import { createNameLookup } from '@/ui/format'

/** 실적 리포트: 교대 생산 보고서(교대 요약 · 시간대별 실적 · 품목별 · 공정별 · 인수인계), CSV 내보내기 · 인쇄 */
const sim = useSimStore()

const shifts = computed(() => shiftsUntil(sim.state.time))
/** 사용자가 고른 교대. 고르지 않았으면(null) 가장 최근 교대를 따라간다 */
const picked = ref<number | null>(null)
const shift = computed(() => shifts.value.find((s) => s.index === picked.value) ?? shifts.value.at(-1)!)
const selectedIndex = computed({
  get: () => shift.value.index,
  set: (index: number) => {
    picked.value = index === shifts.value.at(-1)!.index ? null : index
  },
})
const closed = computed(() => isClosed(shift.value, sim.state.time))

function downloadCsv() {
  const report = hourlyReport(sim.state, sim.master, shift.value)
  const names = createNameLookup(sim.master)
  const { header, rows } = hourlyCsvRows(report, report.bottleneckId ? names.workCenter(report.bottleneckId) : '병목')
  const blob = new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `시간대별실적_${shift.value.label.replace(/\s/g, '')}${closed.value ? '' : '_마감전'}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function print() {
  window.print()
}
</script>

<template>
  <div class="dash-page rp-page">
    <section
      class="card rp-toolbar"
      aria-label="보고서 선택"
    >
      <label class="rp-toolbar__shift">
        <span class="muted">교대</span>
        <select v-model="selectedIndex">
          <option
            v-for="s in shifts"
            :key="s.index"
            :value="s.index"
          >
            {{ shiftTitle(s) }}
          </option>
        </select>
      </label>
      <span
        class="rp-state"
        :class="closed ? 'rp-state--closed' : 'rp-state--open'"
      >{{ closed ? '마감' : '진행 중 · 마감 전' }}</span>
      <h2 class="rp-print-title">
        교대 생산 보고서 — {{ shiftTitle(shift) }}
      </h2>
      <div class="rp-toolbar__actions">
        <button
          class="btn btn--small"
          type="button"
          @click="downloadCsv"
        >
          CSV 내보내기
        </button>
        <button
          class="btn btn--small"
          type="button"
          @click="print"
        >
          인쇄
        </button>
      </div>
    </section>
    <ShiftSummary :shift="shift" />
    <HourlyReportTable :shift="shift" />
    <div class="dash-row rp-row">
      <ItemReportTable :shift="shift" />
      <WorkCenterReportTable :shift="shift" />
    </div>
    <HandoverNotes :shift="shift" />
    <ConceptPanel
      class="rp-no-print"
      :concepts="REPORT_CONCEPTS"
    />
  </div>
</template>
