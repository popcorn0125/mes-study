import axios from 'axios'
import { inject, onBeforeUnmount, onMounted, ref, shallowRef, type InjectionKey, type Ref, type ShallowRef } from 'vue'
import { fetchWorkOrder, postSensorLogs, startProducerRun, type BulkResult, type WorkOrderDetail } from '@/api/workOrders'
import { PRODUCER_EQUIPMENT } from './equipment'
import { initialState, toLog, type SensorLog } from './generate'
import { stepLine, type LineWorkOrder } from './line'

export const SEND_INTERVAL_MS = 1000
/** 서버가 꺼져 있어 시작하지 못했을 때 다시 시도하는 간격 */
export const RETRY_START_MS = 3000

/** 3D 장면이 최신 로그를 읽는 통로 */
export const SENSOR_LOGS: InjectionKey<ShallowRef<SensorLog[]>> = Symbol('sensorLogs')

/** connecting: 서버에 시작 요청 중 · running: 전송 중 · displaced: 다른 탭이 넘겨받아 전송을 멈춤 */
export type ProducerPhase = 'connecting' | 'running' | 'displaced'

export interface SensorProducer {
  /** 1초마다 바뀌는 설비별 최신 로그 */
  logs: ShallowRef<SensorLog[]>
  /** 지금 생산하는 작업지시(없으면 null, 모든 설비 대기) */
  workOrder: ShallowRef<LineWorkOrder | null>
  phase: Ref<ProducerPhase>
  /** 밀려난 뒤 이 탭에서 다시 시작(넘겨받기) */
  restart: () => void
}

/**
 * 더미 센서 데이터 발생기.
 * - 시작할 때 서버에서 실행 ID와 진행 중 작업지시 · 설비별 저장 수량을 받아 그 수량부터 이어 센다.
 * - 1초마다 라인을 한 걸음 진행해 로그를 보낸다. 응답에 담긴 진행 중 지시가 바뀌면 그 지시의 저장 수량을 받아 갈아탄다.
 * - 409(다른 탭이 넘겨받음)를 받으면 전송을 멈춘다. 그 밖의 전송 오류는 무시한다(서버가 꺼져도 화면은 계속 돈다).
 */
export function useSensorProducer(): SensorProducer {
  let states = PRODUCER_EQUIPMENT.map((eq) => initialState(eq))
  const logs = shallowRef<SensorLog[]>([])
  const workOrder = shallowRef<LineWorkOrder | null>(null)
  const phase = ref<ProducerPhase>('connecting')
  let runId: string | undefined
  /** 작업지시를 갈아타는 중(저장 수량을 받는 중)이면 응답의 지시 변경을 다시 처리하지 않는다 */
  let switching = false
  /** 설비 상태를 다시 만들 때마다 늘린다. 그 전에 보낸 요청의 응답(옛 지시 정보)은 무시한다 */
  let generation = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  /** 지시의 저장 수량으로 설비 상태를 다시 만든다(측정값은 이어 간다). 지시가 없으면 수량 0 · 대기 */
  function apply(detail: WorkOrderDetail | null) {
    generation += 1
    states = PRODUCER_EQUIPMENT.map((eq, i) => {
      const saved = detail?.performance.find((p) => p.equipmentId === eq.id)
      const production = saved
        ? { totalCount: saved.totalCount, goodCount: saved.goodCount, badCount: saved.badCount }
        : undefined
      return { ...initialState(eq, production), metrics: states[i].metrics }
    })
    workOrder.value = detail ? { workOrderId: detail.workOrderId, plannedQty: detail.plannedQty } : null
  }

  async function start() {
    clearTimeout(retry)
    phase.value = 'connecting'
    workOrder.value = null
    try {
      const started = await startProducerRun()
      if (disposed) return
      runId = started.runId
      apply(started.workOrder)
      phase.value = 'running'
    } catch {
      if (!disposed) retry = setTimeout(start, RETRY_START_MS)
    }
  }

  /** 서버가 알려 준 진행 중 지시가 지금 것과 다르면 갈아탄다 */
  async function follow(current: BulkResult['workOrder']) {
    if (switching || (current?.workOrderId ?? null) === (workOrder.value?.workOrderId ?? null)) return
    switching = true
    workOrder.value = null // 저장 수량을 받기 전에는 투입하지 않는다
    try {
      apply(current ? await fetchWorkOrder(current.workOrderId) : null)
    } catch {
      // 다음 응답에서 다시 시도한다
    } finally {
      switching = false
    }
  }

  function tick() {
    states = stepLine(PRODUCER_EQUIPMENT, states, workOrder.value, Math.random)
    const now = new Date()
    logs.value = states.map((state) => toLog(state, workOrder.value?.workOrderId, now))
    if (phase.value !== 'running' || !runId) return
    const sentAt = generation
    postSensorLogs(runId, logs.value)
      .then((result) => {
        if (sentAt === generation) void follow(result.workOrder)
      })
      .catch((error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          phase.value = 'displaced'
          workOrder.value = null
        }
      })
  }

  onMounted(() => {
    void start()
    tick()
    timer = setInterval(tick, SEND_INTERVAL_MS)
  })
  onBeforeUnmount(() => {
    disposed = true
    clearInterval(timer)
    clearTimeout(retry)
  })

  return { logs, workOrder, phase, restart: () => void start() }
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
