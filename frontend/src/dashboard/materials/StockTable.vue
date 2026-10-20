<script setup lang="ts">
import { computed } from 'vue'
import { STOCK_STATUS_LABEL, materialRows } from '@/domain/materials'
import { useSimStore } from '@/stores/sim'
import { formatDuration, formatWon } from '@/ui/format'
import { STOCK_STATUS_COLOR, perHour } from './display'

/**
 * 자재 재고 현황: 현재고 게이지(안전재고 · 발주점 눈금), 입고 예정, 소비 속도, 재고 커버, 상태.
 * 행을 누르면 재고 추이 · 발주 현황이 그 자재로 바뀐다.
 */
defineProps<{ selectedId: string }>()
const emit = defineEmits<{ select: [id: string] }>()
const sim = useSimStore()

const rows = computed(() =>
  materialRows(sim.state, sim.master).map((r) => {
    const m = r.material
    // 게이지 눈금: 발주점 + 발주량(입고 직후 대략 최대)을 끝으로 잡는다
    const scale = Math.max(m.reorderPoint + m.reorderQty, r.onHand, 1)
    const pct = (v: number) => `${Math.min(100, (v / scale) * 100).toFixed(1)}%`
    return {
      id: m.id,
      name: m.name,
      unit: m.unit,
      onHand: r.onHand,
      safety: m.safetyStock,
      rop: m.reorderPoint,
      ropHint: `발주점 ${m.reorderPoint} = 리드타임(${formatDuration(m.leadTime)}) 동안 예상 소요 ${r.leadTimeDemand} + 안전재고 ${m.safetyStock}`,
      onOrder: r.onOrder,
      rate: perHour(r.ratePerHour, ''),
      coverage: r.coverage === null ? '소비 없음' : formatDuration(r.coverage),
      atRisk: r.atRisk,
      riskHint: r.atRisk
        ? r.nextArrival === null
          ? `입고 예정이 없고, 지금 발주해도 ${formatDuration(m.leadTime)} 뒤에 옵니다`
          : `다음 입고(${formatDuration(r.nextArrival)} 후) 전에 바닥날 수 있습니다`
        : undefined,
      status: STOCK_STATUS_LABEL[r.status],
      color: STOCK_STATUS_COLOR[r.status],
      value: formatWon(r.value),
      gauge: { fill: pct(r.onHand), safety: pct(m.safetyStock), rop: pct(m.reorderPoint) },
    }
  }),
)
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      자재 재고 현황
    </h2>
    <div class="wo-table-wrap">
      <table class="dash-table mat-table">
        <thead>
          <tr>
            <th scope="col">
              자재
            </th>
            <th
              scope="col"
              class="mat-gauge-col"
            >
              현재고
            </th>
            <th scope="col">
              안전재고
            </th>
            <th
              scope="col"
              title="재고 + 입고 예정이 이 값 이하로 내려가면 자동 발주. 리드타임 동안 예상 소요 + 안전재고"
            >
              발주점
            </th>
            <th scope="col">
              입고 예정
            </th>
            <th
              scope="col"
              title="최근 1시간 동안 쓴 양(시간당)"
            >
              시간당 소요
            </th>
            <th
              scope="col"
              title="현재고 ÷ 시간당 소요. 지금 속도로 버틸 수 있는 시간. 다음 입고 전에 바닥날 것 같으면 ⚠"
            >
              재고 커버
            </th>
            <th scope="col">
              상태
            </th>
            <th scope="col">
              재고 금액
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.id"
            :class="{ 'dash-table__row--selected': r.id === selectedId }"
            @click="emit('select', r.id)"
          >
            <th scope="row">
              <button
                class="link-btn"
                :aria-pressed="r.id === selectedId"
                @click.stop="emit('select', r.id)"
              >
                {{ r.name }}
              </button>
            </th>
            <td class="mat-gauge-col">
              <div class="mat-gauge">
                <span class="mat-gauge__value">{{ r.onHand }}</span>
                <span
                  class="mat-gauge__bar"
                  aria-hidden="true"
                >
                  <span :style="{ width: r.gauge.fill, background: r.color }" />
                  <i
                    class="mat-gauge__tick mat-gauge__tick--safety"
                    :style="{ left: r.gauge.safety }"
                  />
                  <i
                    class="mat-gauge__tick"
                    :style="{ left: r.gauge.rop }"
                  />
                </span>
              </div>
            </td>
            <td>{{ r.safety }}</td>
            <td :title="r.ropHint">
              {{ r.rop }}
            </td>
            <td>{{ r.onOrder || '—' }}</td>
            <td>{{ r.rate }}</td>
            <td
              :class="{ 'text-ng': r.atRisk }"
              :title="r.riskHint"
            >
              {{ r.coverage }}<span v-if="r.atRisk"> ⚠</span>
            </td>
            <td>
              <span
                class="mat-status"
                :style="{ color: r.color, borderColor: r.color }"
              >{{ r.status }}</span>
            </td>
            <td>{{ r.value }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="dash-panel__note muted">
      게이지의 흰 눈금은 발주점, 주황 눈금은 안전재고입니다. 발주점에 마우스를 올리면 "리드타임 소요 + 안전재고"로 나눈 값이 보입니다.
    </p>
  </section>
</template>
