<script setup lang="ts">
import { computed, provide } from 'vue'
import { PRODUCER_EQUIPMENT } from '@/producer/equipment'
import { SENSOR_LOGS, findLog, useSensorProducer } from '@/producer/useSensorProducer'
import FactoryScene from '@/scene/FactoryScene.vue'

/**
 * 자동 시뮬레이션: 더미 센서 데이터 발생기(Producer).
 * 서버의 진행 중 작업지시를 생산하며 1초마다 설비 데이터를 보내고, 3D 장면은 그 데이터를 그대로 보여 준다.
 */
const producer = useSensorProducer()
provide(SENSOR_LOGS, producer.logs)

const LAST = PRODUCER_EQUIPMENT[PRODUCER_EQUIPMENT.length - 1]
/** 지금 지시의 실적 = 포장 양품 */
const packed = computed(() => findLog(producer.logs.value, LAST.id)?.production?.goodCount ?? 0)
</script>

<template>
  <FactoryScene />

  <div
    class="sim-hud"
    role="status"
  >
    <template v-if="producer.phase.value === 'connecting'">
      <span class="sim-hud__dot sim-hud__dot--muted" />서버 연결 중…
    </template>
    <template v-else-if="producer.workOrder.value">
      <span class="sim-hud__dot" />
      <span>
        생산 중 <strong>{{ producer.workOrder.value.workOrderId }}</strong>
        · 포장 양품 <strong>{{ packed }}</strong> / {{ producer.workOrder.value.plannedQty }}
      </span>
      <progress
        :value="packed"
        :max="producer.workOrder.value.plannedQty"
        aria-label="작업지시 진척"
      />
    </template>
    <template v-else-if="producer.phase.value === 'running'">
      <span class="sim-hud__dot sim-hud__dot--idle" />진행 중인 작업지시가 없어 설비가 대기 중입니다
    </template>
  </div>

  <div
    v-if="producer.phase.value === 'displaced'"
    class="sim-displaced"
    role="alertdialog"
    aria-labelledby="sim-displaced-title"
  >
    <h2 id="sim-displaced-title">
      다른 탭에서 시뮬레이터가 실행 중입니다
    </h2>
    <p>데이터는 마지막에 연 시뮬레이터 하나만 보낼 수 있어, 이 탭은 전송을 멈췄습니다.</p>
    <button
      type="button"
      @click="producer.restart"
    >
      이 탭에서 다시 시작
    </button>
  </div>
</template>
