<script setup lang="ts">
import { computed } from 'vue'
import { hourlyReport } from '@/domain/report'
import type { Shift } from '@/domain/shifts'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, percent } from '@/ui/format'
import { hhmm, minutes, noteText, qty, signed } from './display'

/**
 * 시간대별 실적표(시간당 생산 관리표): 시간마다 계획 · 실적 · 차이와 누적, 폐기 · 재작업, 설비 정지, 병목 가동률, 비고.
 * 비고는 그 시간에 일어난 주요 사건(고장 · 정비 · 자재 부족 · 센서 경고 …)을 자동으로 적는다.
 */
const props = defineProps<{ shift: Shift }>()
const sim = useSimStore()

const NOTES_SHOWN = 2

const view = computed(() => {
  const report = hourlyReport(sim.state, sim.master, props.shift)
  const names = createNameLookup(sim.master)
  return {
    bottleneck: report.bottleneckId ? names.workCenter(report.bottleneckId) : '병목',
    rows: report.rows.map((r) => ({
      key: r.start,
      time: `${hhmm(r.start)}~${hhmm(r.end)}`,
      inProgress: r.inProgress,
      plan: qty(r.plan),
      good: r.good,
      gap: signed(r.gap),
      behind: r.gap !== null && r.gap < -0.5,
      cumulativePlan: qty(r.cumulativePlan),
      cumulativeGood: r.cumulativeGood,
      cumulativeGap: signed(r.cumulativeGap),
      cumulativeBehind: r.cumulativeGap !== null && r.cumulativeGap < -0.5,
      scrap: r.scrap,
      reworks: r.reworks,
      stop: minutes(r.stop),
      utilization: percent(r.bottleneckUtilization),
      notes: r.notes.slice(0, NOTES_SHOWN).map(noteText),
      more: Math.max(0, r.notes.length - NOTES_SHOWN),
      allNotes: r.notes.map(noteText).join('\n'),
    })),
    total: {
      plan: qty(report.total.plan),
      good: report.total.good,
      gap: signed(report.total.gap),
      behind: report.total.gap !== null && report.total.gap < -0.5,
      scrap: report.total.scrap,
      reworks: report.total.reworks,
      stop: minutes(report.total.stop),
      utilization: percent(report.total.bottleneckUtilization),
    },
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      시간대별 실적표 <small class="muted">시간당 생산 관리표</small>
    </h2>
    <div class="wo-table-wrap">
      <table class="dash-table rp-table">
        <thead>
          <tr>
            <th scope="col">
              시간
            </th>
            <th scope="col">
              계획
            </th>
            <th scope="col">
              실적
            </th>
            <th scope="col">
              차이
            </th>
            <th scope="col">
              누적 계획
            </th>
            <th scope="col">
              누적 실적
            </th>
            <th scope="col">
              누적 차이
            </th>
            <th scope="col">
              폐기
            </th>
            <th scope="col">
              재작업
            </th>
            <th
              scope="col"
              title="설비별 고장 · 예방정비 · 자재 부족 정지 시간의 합(분)"
            >
              설비 정지(분)
            </th>
            <th
              scope="col"
              title="병목 작업장(현재 기준) 설비의 가동률(가동 시간 ÷ 시간대 길이)"
            >
              {{ view.bottleneck }} 가동률
            </th>
            <th
              scope="col"
              class="rp-notes"
            >
              비고
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in view.rows"
            :key="r.key"
          >
            <th scope="row">
              {{ r.time }}
              <span
                v-if="r.inProgress"
                class="rp-live"
              >진행 중</span>
            </th>
            <td>{{ r.plan }}</td>
            <td>{{ r.good }}</td>
            <td :class="{ 'text-ng': r.behind }">
              {{ r.gap }}
            </td>
            <td>{{ r.cumulativePlan }}</td>
            <td>{{ r.cumulativeGood }}</td>
            <td :class="{ 'text-ng': r.cumulativeBehind }">
              {{ r.cumulativeGap }}
            </td>
            <td :class="{ 'text-ng': r.scrap > 0 }">
              {{ r.scrap }}
            </td>
            <td>{{ r.reworks }}</td>
            <td :class="{ 'text-warn': r.stop !== '0' && r.stop !== '—' }">
              {{ r.stop }}
            </td>
            <td>{{ r.utilization }}</td>
            <td
              class="rp-notes"
              :title="r.allNotes || undefined"
            >
              <span
                v-for="(n, i) in r.notes"
                :key="i"
                class="rp-note"
              >{{ n }}</span>
              <span
                v-if="r.more"
                class="muted"
              >외 {{ r.more }}건</span>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">
              합계
            </th>
            <td>{{ view.total.plan }}</td>
            <td>{{ view.total.good }}</td>
            <td :class="{ 'text-ng': view.total.behind }">
              {{ view.total.gap }}
            </td>
            <td />
            <td />
            <td />
            <td>{{ view.total.scrap }}</td>
            <td>{{ view.total.reworks }}</td>
            <td>{{ view.total.stop }}</td>
            <td>{{ view.total.utilization }}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="dash-panel__note muted">
      실적은 양품으로 마지막 공정(포장)을 끝낸 시각에 잡습니다. 라인 안에 있는 제품(재공)은 실적이 아닙니다. 차이가 음수인 칸은 빨간색입니다.
    </p>
  </section>
</template>
