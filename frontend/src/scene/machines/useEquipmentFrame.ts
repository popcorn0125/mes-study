import { useLoop } from '@tresjs/core'
import type { EquipmentRuntime } from '@/domain/types'
import { useSimStore } from '@/stores/sim'

export interface FrameContext {
  /** 시뮬레이션이 일시정지면 0. 기계 동작 애니메이션은 이 값으로 진행해 정지 중에는 멈춰 있게 한다. */
  dt: number
  /** 실제 경과 시간(초). 깜박임처럼 정지 중에도 이어지는 효과에 쓴다. */
  elapsed: number
}

/** 매 프레임 설비 실행 상태를 반응성 없이 읽어 콜백에 넘긴다. */
export function useEquipmentFrame(equipmentId: string, callback: (eq: EquipmentRuntime, ctx: FrameContext) => void) {
  const sim = useSimStore()
  const { onBeforeRender } = useLoop()
  onBeforeRender(({ delta, elapsed }) => {
    const eq = sim.getEngine().state.equipment.find((e) => e.id === equipmentId)
    if (eq) callback(eq, { dt: sim.playing ? delta : 0, elapsed })
  })
}
