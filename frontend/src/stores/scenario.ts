import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import { freeScenario } from '@/scenarios'
import { buildResult } from '@/scenarios/runner'
import type { ScenarioDefinition, ScenarioResult } from '@/scenarios/types'
import { useSelectionStore } from './selection'
import { useSimStore } from './sim'

/**
 * 화면 단계: 랜딩(시나리오 선택) → 브리핑(상황 설명) → 진행 → 결과(제한 시간 도달 시).
 * 결과 화면을 닫으면 멈춘 상태로 화면을 둘러볼 수 있다.
 */
export type ScenarioPhase = 'landing' | 'briefing' | 'running' | 'result'

export const useScenarioStore = defineStore('scenario', () => {
  const sim = useSimStore()
  const selection = useSelectionStore()

  const current = shallowRef<ScenarioDefinition>(freeScenario)
  const phase = ref<ScenarioPhase>('landing')
  /** 브리핑을 진행 중에 다시 연 것인지(버튼 문구가 "시작"이 아니라 "계속"이 된다) */
  const started = ref(false)
  const result = shallowRef<ScenarioResult | null>(null)

  function choose(def: ScenarioDefinition) {
    sim.load(def)
    selection.clear()
    current.value = def
    result.value = null
    started.value = false
    phase.value = 'briefing'
  }

  function start() {
    phase.value = 'running'
    if (!started.value) {
      started.value = true
      sim.play()
    }
  }

  function restart() {
    choose(current.value)
  }

  function openBriefing() {
    sim.pause()
    phase.value = 'briefing'
  }

  function openLanding() {
    sim.pause()
    phase.value = 'landing'
  }

  function closeResult() {
    phase.value = 'running'
  }

  // 제한 시간에 도달하면 결과표를 만든다("조치 없음"·"모범 조치"는 같은 seed로 다시 실행해 비교).
  watch(
    () => sim.reachedLimit,
    (reached) => {
      if (!reached || current.value.duration === null) return
      result.value = buildResult(current.value, sim.getEngine(), sim.actionLog)
      phase.value = 'result'
    },
  )

  return { current, phase, started, result, choose, start, restart, openBriefing, openLanding, closeResult }
})
