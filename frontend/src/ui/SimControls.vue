<script setup lang="ts">
import { computed } from 'vue'
import { useScenarioStore } from '@/stores/scenario'
import { useSimStore } from '@/stores/sim'
import { useViewStore } from '@/stores/view'
import { SPEED_OPTIONS, formatSimTime } from '@/sim/clock'

const sim = useSimStore()
const scenario = useScenarioStore()
const view = useViewStore()
const clock = computed(() => formatSimTime(sim.state.time))
</script>

<template>
  <p
    class="camera-hint"
    aria-hidden="true"
  >
    🖱 왼쪽 드래그: 회전 · 휠: 마우스 위치로 확대/축소 · 오른쪽 드래그: 이동
  </p>
  <div
    class="panel sim-controls"
    role="toolbar"
    aria-label="시뮬레이션 제어"
  >
    <button
      class="btn btn--primary"
      :aria-pressed="sim.playing"
      :disabled="sim.reachedLimit"
      @click="sim.toggle()"
    >
      {{ sim.reachedLimit ? '■ 종료' : sim.playing ? '⏸ 일시정지' : '▶ 시작' }}
    </button>
    <div
      class="speed-group"
      role="group"
      aria-label="배속"
    >
      <button
        v-for="option in SPEED_OPTIONS"
        :key="option"
        class="btn"
        :class="{ 'btn--active': sim.speed === option }"
        :aria-pressed="sim.speed === option"
        @click="sim.setSpeed(option)"
      >
        {{ option }}×
      </button>
    </div>
    <button
      class="btn"
      title="이 시나리오를 처음부터 다시 시작합니다"
      @click="scenario.restart()"
    >
      ↺ 다시 하기
    </button>
    <button
      class="btn"
      :class="{ 'btn--active': view.heatmap }"
      :aria-pressed="view.heatmap"
      title="작업장 바닥을 평균 가동률로 칠합니다"
      @click="view.toggleHeatmap()"
    >
      ▦ 히트맵
    </button>
    <button
      class="btn"
      title="카메라를 처음 시점으로 되돌립니다"
      @click="view.resetCamera()"
    >
      ⟲ 시점
    </button>
    <span
      class="clock"
      aria-label="시뮬레이션 시각"
    >🕒 {{ clock }}</span>
  </div>
</template>
