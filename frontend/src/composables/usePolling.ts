import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue'

/** 대시보드 기본 갱신 주기 */
export const POLL_INTERVAL_MS = 2000

export interface Polling<T> {
  /** 마지막으로 성공한 응답. 실패해도 지우지 않아 화면이 비지 않는다 */
  data: Readonly<ShallowRef<T | undefined>>
  /** 마지막 요청이 실패했으면 그 오류, 성공하면 undefined */
  error: Readonly<ShallowRef<unknown>>
  /** 마지막으로 성공한 시각 */
  updatedAt: Readonly<Ref<Date | undefined>>
  /** 첫 응답(성공 · 실패)이 오기 전이면 true */
  loading: Readonly<Ref<boolean>>
  /** 주기를 기다리지 않고 바로 한 번 다시 부른다(설비 선택을 바꿨을 때 등) */
  refresh: () => Promise<void>
}

/**
 * fetcher를 바로 한 번 부르고 intervalMs마다 다시 부른다.
 * - 앞 요청이 끝나지 않았으면 이번 차례는 건너뛴다(느린 서버에 요청이 쌓이지 않게).
 * - 실패해도 멈추지 않고 다음 차례에 다시 부른다. 서버가 다시 켜지면 저절로 돌아온다.
 * - 컴포넌트(또는 effect scope)가 사라지면 멈춘다.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = POLL_INTERVAL_MS): Polling<T> {
  const data = shallowRef<T>()
  const error = shallowRef<unknown>()
  const updatedAt = ref<Date>()
  const loading = ref(true)
  let inFlight = false
  let stopped = false

  /** 한 번 부르고 결과를 상태에 반영한다. 이미 요청 중이면 아무것도 하지 않는다 */
  async function run() {
    if (inFlight || stopped) return
    inFlight = true
    try {
      const result = await fetcher()
      if (stopped) return
      data.value = result
      error.value = undefined
      updatedAt.value = new Date()
    } catch (e) {
      if (!stopped) error.value = e
    } finally {
      inFlight = false
      loading.value = false
    }
  }

  void run()
  const timer = setInterval(run, intervalMs)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopped = true
      clearInterval(timer)
    })
  }

  // 읽기 전용은 타입으로만 막는다(응답 배열을 readonly 프록시로 감싸지 않게)
  return { data, error, updatedAt, loading, refresh: run }
}
