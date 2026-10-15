import { defineStore } from 'pinia'
import { ref, shallowRef, triggerRef } from 'vue'
import type { MasterData, SimState } from '@/domain/types'
import { freeScenario } from '@/scenarios'
import { createScenarioEngine } from '@/scenarios/runner'
import type { ScenarioDefinition, TimedCommand } from '@/scenarios/types'
import { advanceClock } from '@/sim/clock'
import type { SimCommand } from '@/sim/commands'
import type { SimEngine } from '@/sim/engine'

/** UI 패널 갱신 주기(ms). 엔진은 매 프레임 돌지만 Vue 반응성은 이 주기로만 알린다. */
const PUBLISH_INTERVAL_MS = 250

/**
 * 시뮬레이션 실행 스토어.
 * - `master`: 현재 엔진의 기준정보(시나리오를 바꾸면 교체).
 * - `state`: UI 패널용. shallowRef라 Vue가 깊은 객체를 추적하지 않고, 갱신은 PUBLISH_INTERVAL_MS 주기로만 알린다.
 * - `getEngine()`: 3D 장면용. 매 프레임 엔진 상태를 반응성 없이 직접 읽는다.
 * - `timeLimit`: 시나리오 제한 시간. 도달하면 정확히 그 시각에 멈추고 `reachedLimit`을 켠다.
 * - `actionLog`: 사용자가 보낸 명령 기록(결과표의 "내 조치").
 */
export const useSimStore = defineStore('sim', () => {
  let scenario: ScenarioDefinition = freeScenario
  let engine: SimEngine = createScenarioEngine(scenario)
  const master = shallowRef<MasterData>(engine.master)
  const state = shallowRef<SimState>(engine.state)
  const playing = ref(false)
  const speed = ref(10)
  const timeLimit = ref<number | null>(null)
  const reachedLimit = ref(false)
  const actionLog = ref<TimedCommand[]>([])

  let carry = 0
  let rafId: number | null = null
  let lastFrame = 0
  let lastPublish = 0

  function publish() {
    if (state.value === engine.state) triggerRef(state)
    else state.value = engine.state
  }

  function frame(now: number) {
    const result = advanceClock(carry, (now - lastFrame) / 1000, speed.value)
    lastFrame = now
    carry = result.carry
    let ticks = result.ticks
    if (timeLimit.value !== null) ticks = Math.min(ticks, Math.max(0, timeLimit.value - engine.state.time))
    for (let i = 0; i < ticks; i++) engine.tick()

    if (timeLimit.value !== null && engine.state.time >= timeLimit.value) {
      reachedLimit.value = true
      pause()
      return
    }
    if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
      publish()
      lastPublish = now
    }
    rafId = requestAnimationFrame(frame)
  }

  function play() {
    if (playing.value || reachedLimit.value) return
    playing.value = true
    lastFrame = performance.now()
    rafId = requestAnimationFrame(frame)
  }

  function pause() {
    playing.value = false
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    publish()
  }

  function toggle() {
    if (playing.value) pause()
    else play()
  }

  function setSpeed(value: number) {
    speed.value = value
  }

  /** 시나리오를 처음 상태로 불러온다(재시작에도 쓴다). */
  function load(next: ScenarioDefinition) {
    pause()
    scenario = next
    engine = createScenarioEngine(next)
    master.value = engine.master
    timeLimit.value = next.duration
    reachedLimit.value = false
    actionLog.value = []
    carry = 0
    publish()
  }

  function reset() {
    load(scenario)
  }

  /**
   * 사용자 명령 전달. 잘못된 명령이면 오류 메시지를 돌려준다(성공 시 null).
   * 일시정지 중에는 시간을 진행하지 않고 바로 적용해 화면에 반영한다.
   */
  function dispatch(command: SimCommand): string | null {
    try {
      engine.dispatch(command)
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
    actionLog.value = [...actionLog.value, { time: engine.state.time, command }]
    if (!playing.value) {
      engine.applyPendingCommands()
      publish()
    }
    return null
  }

  function getEngine(): SimEngine {
    return engine
  }

  return {
    master,
    state,
    playing,
    speed,
    timeLimit,
    reachedLimit,
    actionLog,
    play,
    pause,
    toggle,
    setSpeed,
    load,
    reset,
    dispatch,
    getEngine,
  }
})
