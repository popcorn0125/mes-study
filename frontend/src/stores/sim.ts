import { defineStore } from 'pinia'
import { ref, shallowRef, triggerRef } from 'vue'
import type { MasterData, SimState } from '@/domain/types'
import { freeScenario } from '@/scenarios'
import { createScenarioEngine } from '@/scenarios/runner'
import { advanceClock } from '@/sim/clock'
import type { SimCommand } from '@/sim/commands'
import type { SimEngine } from '@/sim/engine'

/** UI 패널 갱신 주기(ms). 엔진은 매 프레임 돌지만 Vue 반응성은 이 주기로만 알린다. */
const PUBLISH_INTERVAL_MS = 250

/**
 * 시뮬레이션 실행 스토어.
 * 엔진은 자유 체험 공장(기본 공장) 하나뿐이다.
 * - `master`: 엔진의 기준정보.
 * - `state`: UI 패널용. shallowRef라 Vue가 깊은 객체를 추적하지 않고, 갱신은 PUBLISH_INTERVAL_MS 주기로만 알린다.
 */
export const useSimStore = defineStore('sim', () => {
  const engine: SimEngine = createScenarioEngine(freeScenario)
  const master = shallowRef<MasterData>(engine.master)
  const state = shallowRef<SimState>(engine.state)
  const playing = ref(false)
  const speed = ref(10)

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
    for (let i = 0; i < result.ticks; i++) engine.tick()

    if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
      publish()
      lastPublish = now
    }
    rafId = requestAnimationFrame(frame)
  }

  function play() {
    if (playing.value) return
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
    if (!playing.value) {
      engine.applyPendingCommands()
      publish()
    }
    return null
  }

  return {
    master,
    state,
    playing,
    speed,
    play,
    pause,
    toggle,
    setSpeed,
    dispatch,
  }
})
