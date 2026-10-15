<script setup lang="ts">
import { computed } from 'vue'
import { formatDuration } from '@/domain/duration'
import { useScenarioStore } from '@/stores/scenario'
import { useSimStore } from '@/stores/sim'

/** 좌상단 제목 영역: 현재 시나리오, 남은 시간, 안내·선택 버튼 */
const sim = useSimStore()
const scenario = useScenarioStore()

const progress = computed(() => {
  const duration = scenario.current.duration
  if (duration === null) return null
  const time = Math.min(sim.state.time, duration)
  return { ratio: time / duration, remaining: formatDuration(duration - time) }
})
</script>

<template>
  <header class="app-title">
    <h1>MES 3D 공정 시뮬레이터</h1>
    <div class="scenario-bar">
      <div class="scenario-bar__info">
        <strong>{{ scenario.current.title }}</strong>
        <template v-if="progress">
          <span
            class="scenario-bar__progress"
            role="progressbar"
            :aria-valuenow="Math.round(progress.ratio * 100)"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="시나리오 진행"
          >
            <span :style="{ width: `${progress.ratio * 100}%` }" />
          </span>
          <span class="muted">{{ sim.reachedLimit ? '종료' : `남은 ${progress.remaining}` }}</span>
        </template>
      </div>
      <div class="scenario-bar__actions">
        <button
          class="btn btn--small"
          @click="scenario.openBriefing()"
        >
          안내
        </button>
        <button
          v-if="scenario.result"
          class="btn btn--small"
          @click="scenario.phase = 'result'"
        >
          결과 보기
        </button>
        <button
          class="btn btn--small"
          @click="scenario.openLanding()"
        >
          시나리오 선택
        </button>
      </div>
    </div>
  </header>
</template>
