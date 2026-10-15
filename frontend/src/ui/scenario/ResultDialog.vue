<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { formatSimTime } from '@/sim/clock'
import { useScenarioStore } from '@/stores/scenario'
import { useSimStore } from '@/stores/sim'
import { createNameLookup, describeCommand, formatMetric, metricValue } from '../format'

const sim = useSimStore()
const scenario = useScenarioStore()
const closeButton = ref<HTMLButtonElement>()
onMounted(() => closeButton.value?.focus())

const COLUMNS = [
  { key: 'baseline', label: '조치 없음' },
  { key: 'mine', label: '내 결과' },
  { key: 'best', label: '모범 조치' },
] as const

const rows = computed(() => {
  const result = scenario.result
  if (!result) return []
  return scenario.current.metrics.map((spec) => {
    const values = COLUMNS.map((c) => metricValue(spec.key, result[c.key]))
    const bestValue = spec.higherIsBetter ? Math.max(...values) : Math.min(...values)
    return {
      ...spec,
      cells: COLUMNS.map((c, i) => ({
        key: c.key,
        text: formatMetric(spec.key, result[c.key]),
        best: values[i] === bestValue,
      })),
    }
  })
})

const actions = computed(() => {
  const names = createNameLookup(sim.master)
  return sim.actionLog.map((a, i) => ({ key: i, time: formatSimTime(a.time), text: describeCommand(a.command, names) }))
})
</script>

<template>
  <div class="overlay">
    <section
      v-if="scenario.result"
      class="dialog dialog--wide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
    >
      <p class="dialog__eyebrow">
        시나리오 결과
      </p>
      <h2 id="result-title">
        {{ scenario.current.title }}
      </h2>

      <table class="result-table">
        <thead>
          <tr>
            <th scope="col">
              지표
            </th>
            <th
              v-for="c in COLUMNS"
              :key="c.key"
              scope="col"
              :class="{ 'result-table__mine': c.key === 'mine' }"
            >
              {{ c.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.key"
          >
            <th scope="row">
              {{ row.label }}
            </th>
            <td
              v-for="cell in row.cells"
              :key="cell.key"
              :class="{ 'result-table__best': cell.best, 'result-table__mine': cell.key === 'mine' }"
            >
              {{ cell.text }}<span
                v-if="cell.best"
                class="visually-hidden"
              > (가장 좋음)</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="hint">
        초록색이 가장 좋은 값입니다. "조치 없음"과 "모범 조치"는 같은 조건(같은 seed)으로 다시 실행한 결과입니다.
        모범 조치: {{ scenario.current.bestActionsLabel }}.
      </p>

      <h3>해설</h3>
      <ul class="dialog__list">
        <li
          v-for="(line, i) in scenario.result.insights"
          :key="i"
        >
          {{ line }}
        </li>
      </ul>

      <h3>내가 한 조치</h3>
      <ol
        v-if="actions.length"
        class="action-log"
      >
        <li
          v-for="a in actions"
          :key="a.key"
        >
          <time>{{ a.time }}</time> {{ a.text }}
        </li>
      </ol>
      <p
        v-else
        class="hint"
      >
        조치 없이 진행했습니다.
      </p>

      <div class="dialog__actions">
        <button
          class="btn"
          @click="scenario.openLanding()"
        >
          다른 시나리오
        </button>
        <button
          class="btn"
          @click="scenario.restart()"
        >
          ↺ 다시 하기
        </button>
        <button
          ref="closeButton"
          class="btn btn--primary"
          @click="scenario.closeResult()"
        >
          화면 둘러보기
        </button>
      </div>
    </section>
  </div>
</template>
