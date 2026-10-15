<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { formatDuration } from '@/domain/duration'
import { useScenarioStore } from '@/stores/scenario'

const scenario = useScenarioStore()
const startButton = ref<HTMLButtonElement>()

onMounted(() => startButton.value?.focus())
</script>

<template>
  <div class="overlay">
    <section
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="briefing-title"
    >
      <p class="dialog__eyebrow">
        {{ scenario.current.duration === null ? '자유 체험' : `시나리오 · ${formatDuration(scenario.current.duration)}` }}
      </p>
      <h2 id="briefing-title">
        {{ scenario.current.title }}
      </h2>
      <p
        v-for="(line, i) in scenario.current.briefing"
        :key="i"
        class="dialog__text"
      >
        {{ line }}
      </p>

      <h3>살펴볼 것</h3>
      <ul class="dialog__list">
        <li
          v-for="(hint, i) in scenario.current.hints"
          :key="i"
        >
          {{ hint }}
        </li>
      </ul>

      <details
        v-if="scenario.current.lessons.length"
        class="dialog__details"
      >
        <summary>이 시나리오에서 배우는 것</summary>
        <ul class="dialog__list">
          <li
            v-for="(lesson, i) in scenario.current.lessons"
            :key="i"
          >
            {{ lesson }}
          </li>
        </ul>
      </details>

      <div class="dialog__actions">
        <button
          class="btn"
          @click="scenario.openLanding()"
        >
          다른 시나리오
        </button>
        <button
          ref="startButton"
          class="btn btn--primary"
          @click="scenario.start()"
        >
          {{ scenario.started ? '계속하기' : '▶ 시작' }}
        </button>
      </div>
    </section>
  </div>
</template>
