<script setup lang="ts">
import { computed } from 'vue'
import { recentAlarms } from '@/domain/production'
import { formatSimTime } from '@/sim/clock'
import { useSimStore } from '@/stores/sim'

/** 최근 알람: 경고·위험 이벤트를 최신순으로 보여준다 */
const sim = useSimStore()

const SEVERITY_LABEL = { critical: '위험', warning: '경고', info: '정보' } as const

const alarms = computed(() =>
  recentAlarms(sim.state, 10).map((e, i) => ({
    key: `${e.time}-${e.type}-${e.refId}-${i}`,
    time: formatSimTime(e.time),
    severity: e.severity,
    label: SEVERITY_LABEL[e.severity],
    message: e.message,
  })),
)
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      최근 알람
    </h2>
    <p
      v-if="alarms.length === 0"
      class="muted"
    >
      알람이 없습니다.
    </p>
    <ul
      v-else
      class="alarm-list"
    >
      <li
        v-for="a in alarms"
        :key="a.key"
        class="alarm"
        :class="`alarm--${a.severity}`"
      >
        <span class="alarm__badge">{{ a.label }}</span>
        <time class="alarm__time">{{ a.time }}</time>
        <span>{{ a.message }}</span>
      </li>
    </ul>
  </section>
</template>
