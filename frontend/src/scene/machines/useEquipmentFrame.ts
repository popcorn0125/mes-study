import { useLoop } from '@tresjs/core'
import type { SensorLog } from '@/producer/generate'
import { findLog, useSensorLogs } from '@/producer/useSensorProducer'

export interface FrameContext {
  /** 지난 프레임부터 흐른 시간(초). 기계 동작 애니메이션을 진행한다. */
  dt: number
  /** 실제 경과 시간(초). 깜박임처럼 이어지는 효과에 쓴다. */
  elapsed: number
}

/** 매 프레임 설비의 최신 더미 로그를 읽어 콜백에 넘긴다. */
export function useEquipmentFrame(equipmentId: string, callback: (log: SensorLog, ctx: FrameContext) => void) {
  const logs = useSensorLogs()
  const { onBeforeRender } = useLoop()
  onBeforeRender(({ delta, elapsed }) => {
    const log = findLog(logs.value, equipmentId)
    if (log) callback(log, { dt: delta, elapsed })
  })
}
