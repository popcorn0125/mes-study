<script setup lang="ts">
import type { WorkOrderStatus } from '@/domain/types'
import { WORK_ORDER_STATUS_LABEL } from '@/ui/format'
import { WORK_ORDER_STATUS_COLOR } from './display'

/**
 * 작업지시 생명주기: 계획 → 하달 → 진행 → 완료, 보류. 상태마다 건수를 보여 주고,
 * 누르면 목록을 그 상태로 거른다(다시 누르면 해제).
 */
defineProps<{
  counts: Record<WorkOrderStatus, number>
  filter: WorkOrderStatus | null
}>()
const emit = defineEmits<{ filter: [status: WorkOrderStatus | null] }>()

const MAIN_FLOW: WorkOrderStatus[] = ['PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED']
const STEP_HINT: Record<WorkOrderStatus, string> = {
  PLANNED: '생성됐지만 아직 하달 전',
  RELEASED: '하달됐고 첫 투입을 기다리는 중',
  IN_PROGRESS: '제품이 라인에 투입되어 진행 중',
  HELD: '새 투입을 멈춤(라인 안 제품은 계속 흐름)',
  COMPLETED: '지시 수량이 모두 양품·불량으로 끝남',
}
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      작업지시 상태 흐름
    </h2>
    <div class="wo-flow">
      <ol class="wo-flow__main">
        <li
          v-for="status in MAIN_FLOW"
          :key="status"
        >
          <button
            class="wo-flow__step"
            :class="{ 'wo-flow__step--active': filter === status }"
            :style="{ '--tone': WORK_ORDER_STATUS_COLOR[status] }"
            :aria-pressed="filter === status"
            :title="STEP_HINT[status]"
            @click="emit('filter', filter === status ? null : status)"
          >
            <span class="wo-flow__label">{{ WORK_ORDER_STATUS_LABEL[status] }}</span>
            <strong>{{ counts[status] }}</strong>
          </button>
        </li>
      </ol>
      <div class="wo-flow__hold">
        <span
          class="muted"
          aria-hidden="true"
        >하달·진행 ⇄</span>
        <button
          class="wo-flow__step"
          :class="{ 'wo-flow__step--active': filter === 'HELD' }"
          :style="{ '--tone': WORK_ORDER_STATUS_COLOR.HELD }"
          :aria-pressed="filter === 'HELD'"
          :title="STEP_HINT.HELD"
          @click="emit('filter', filter === 'HELD' ? null : 'HELD')"
        >
          <span class="wo-flow__label">{{ WORK_ORDER_STATUS_LABEL.HELD }}</span>
          <strong>{{ counts.HELD }}</strong>
        </button>
      </div>
    </div>
    <p class="dash-panel__note muted">
      상태를 누르면 목록이 그 상태만 보여 줍니다. 마우스를 올리면 상태의 뜻이 보입니다.
    </p>
  </section>
</template>
