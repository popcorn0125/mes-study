import axios from 'axios'
import { inject, onBeforeUnmount, onMounted, shallowRef, type InjectionKey, type ShallowRef } from 'vue'
import { PRODUCER_EQUIPMENT, WORK_ORDER_ID } from './equipment'
import { initialState, step, toLog, type SensorLog } from './generate'

export const SENSOR_LOG_ENDPOINT = 'http://localhost:8080/api/v1/sensor-logs/bulk'
export const SEND_INTERVAL_MS = 1000

/** 3D 장면이 최신 로그를 읽는 통로 */
export const SENSOR_LOGS: InjectionKey<ShallowRef<SensorLog[]>> = Symbol('sensorLogs')

/**
 * 더미 센서 데이터 발생기: 1초마다 설비별 상태를 한 걸음 진행해 로그를 만들고 서버로 보낸다.
 * 서버가 꺼져 있어도 화면이 멈추지 않도록 전송 오류는 무시한다.
 */
export function useSensorProducer(): ShallowRef<SensorLog[]> {
  let states = PRODUCER_EQUIPMENT.map(initialState)
  const logs = shallowRef<SensorLog[]>([])
  let timer: ReturnType<typeof setInterval> | undefined

  function tick() {
    states = states.map((state, i) => step(PRODUCER_EQUIPMENT[i], state, Math.random))
    const now = new Date()
    logs.value = states.map((state) => toLog(state, WORK_ORDER_ID, now))
    axios.post(SENSOR_LOG_ENDPOINT, logs.value).catch(() => {})
  }

  onMounted(() => {
    tick()
    timer = setInterval(tick, SEND_INTERVAL_MS)
  })
  onBeforeUnmount(() => clearInterval(timer))

  return logs
}

/** 장면 컴포넌트에서 최신 로그 목록을 꺼낸다 */
export function useSensorLogs(): ShallowRef<SensorLog[]> {
  const logs = inject(SENSOR_LOGS)
  if (!logs) throw new Error('SENSOR_LOGS가 provide되지 않았습니다')
  return logs
}

export function findLog(logs: readonly SensorLog[], equipmentId: string): SensorLog | undefined {
  return logs.find((log) => log.equipmentId === equipmentId)
}
