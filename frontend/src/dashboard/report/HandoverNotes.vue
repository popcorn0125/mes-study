<script setup lang="ts">
import { computed } from 'vue'
import { handover } from '@/domain/report'
import type { Shift } from '@/domain/shifts'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, formatDuration } from '@/ui/format'
import { hhmm } from './display'

/**
 * 인수인계 메모(자동 생성): 이번 교대 주요 사건과 다음 교대로 넘길 일.
 * 넘길 일은 지금 상태로 만들므로 가장 최근 교대에서만 보여 준다.
 */
const props = defineProps<{ shift: Shift }>()
const sim = useSimStore()

const view = computed(() => {
  const notes = handover(sim.state, sim.master, props.shift)
  const names = createNameLookup(sim.master)
  const now = sim.state.time
  const carry = notes.carryOver
  return {
    events: notes.events.map((e, i) => ({
      key: `${e.time}-${i}`,
      time: hhmm(e.time),
      message: e.message,
      severity: e.severity,
    })),
    carry: carry && {
      workOrders: carry.workOrders.map(({ workOrder: wo, done, atRisk }) => ({
        id: wo.id,
        text: `${names.item(wo.itemId)} ${done}/${wo.qty}`,
        atRisk,
        held: wo.status === 'HELD',
      })),
      purchaseOrders: carry.purchaseOrders.map((po) => ({
        id: po.id,
        text: `${names.material(po.materialId)} ${po.qty} · ${formatDuration(po.eta - now)} 후 입고${po.expedited ? ' (긴급)' : ''}`,
      })),
      equipment: carry.equipment.map((e) => ({ id: e.equipmentId, text: `${names.equipment(e.equipmentId)} — ${e.reason}` })),
      materials: carry.materials.map((m) => ({
        id: m.materialId,
        text: `${names.material(m.materialId)} 재고 ${m.onHand} (안전재고 ${m.safetyStock})`,
      })),
    },
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      인수인계 메모 <small class="muted">자동 생성</small>
    </h2>
    <div class="rp-handover">
      <div>
        <h3 class="rp-handover__title">
          이번 교대 주요 사건
        </h3>
        <ol
          v-if="view.events.length"
          class="rp-events"
        >
          <li
            v-for="e in view.events"
            :key="e.key"
            :class="`rp-events__item--${e.severity}`"
          >
            <span class="alarm__time">{{ e.time }}</span> {{ e.message }}
          </li>
        </ol>
        <p
          v-else
          class="hint"
        >
          특이 사항 없음
        </p>
      </div>
      <div>
        <h3 class="rp-handover__title">
          다음 교대로 넘길 일 <small class="muted">지금 기준</small>
        </h3>
        <p
          v-if="!view.carry"
          class="hint"
        >
          지난 교대입니다. 넘길 일은 교대가 끝난 시점의 상태로 만들어야 하는데, 그 시점의 상태는 남아 있지 않아 가장 최근 교대에서만 보여 줍니다.
        </p>
        <dl
          v-else
          class="rp-carry"
        >
          <dt>진행 중 작업지시</dt>
          <dd>
            <template v-if="view.carry.workOrders.length">
              <span
                v-for="w in view.carry.workOrders"
                :key="w.id"
                class="q-chip"
                :class="{ 'text-ng': w.atRisk, 'text-warn': w.held }"
              >{{ w.id }} {{ w.text }}{{ w.atRisk ? ' · 지연 위험' : '' }}{{ w.held ? ' · 보류' : '' }}</span>
            </template>
            <span
              v-else
              class="muted"
            >없음 — 이번 교대에 모두 끝냄</span>
          </dd>
          <dt>입고 예정 발주</dt>
          <dd>
            <template v-if="view.carry.purchaseOrders.length">
              <span
                v-for="p in view.carry.purchaseOrders"
                :key="p.id"
                class="q-chip"
              >{{ p.id }} {{ p.text }}</span>
            </template>
            <span
              v-else
              class="muted"
            >없음</span>
          </dd>
          <dt>설비 주의</dt>
          <dd>
            <template v-if="view.carry.equipment.length">
              <span
                v-for="e in view.carry.equipment"
                :key="e.id"
                class="q-chip text-warn"
              >{{ e.text }}</span>
            </template>
            <span
              v-else
              class="muted"
            >없음</span>
          </dd>
          <dt>자재 주의</dt>
          <dd>
            <template v-if="view.carry.materials.length">
              <span
                v-for="m in view.carry.materials"
                :key="m.id"
                class="q-chip text-warn"
              >{{ m.text }}</span>
            </template>
            <span
              v-else
              class="muted"
            >없음</span>
          </dd>
        </dl>
      </div>
    </div>
  </section>
</template>
