<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { formatDuration } from '@/domain/duration'
import { SCENARIOS } from '@/scenarios'
import { useScenarioStore } from '@/stores/scenario'

const scenario = useScenarioStore()
const firstCard = ref<HTMLButtonElement[]>()

onMounted(() => firstCard.value?.[0]?.focus())
</script>

<template>
  <div class="overlay overlay--landing">
    <section
      class="dialog dialog--landing"
      role="dialog"
      aria-modal="true"
      aria-labelledby="landing-title"
    >
      <p class="dialog__eyebrow">
        생산관리자 체험
      </p>
      <h1 id="landing-title">
        MES 3D 공정 시뮬레이터
      </h1>
      <p class="dialog__lead">
        BLDC 모터 조립 라인의 생산관리자가 되어 보세요. 작업지시를 내리고, 설비·자재·재공품을 지켜보며,
        문제가 생기면 조치합니다. 시나리오가 끝나면 <strong>조치하지 않았을 때</strong>와
        <strong>모범 조치</strong>를 내 결과와 나란히 비교해 줍니다.
      </p>
      <ul class="scenario-cards">
        <li
          v-for="def in SCENARIOS"
          :key="def.id"
        >
          <button
            ref="firstCard"
            class="scenario-card"
            :class="{ 'scenario-card--free': def.duration === null }"
            @click="scenario.choose(def)"
          >
            <strong>{{ def.title }}</strong>
            <span>{{ def.summary }}</span>
            <small>{{ def.duration === null ? '시간 제한 없음' : `${formatDuration(def.duration)} · 결과표` }}</small>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
