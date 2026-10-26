import { inject, provide, type InjectionKey } from 'vue'
import { fetchLatestLogs, type LatestLog } from '@/api/dashboard'
import { usePolling, type Polling } from '@/composables/usePolling'

/** 설비별 최신 로그 폴링 하나를 헤더와 페이지가 나눠 쓰는 통로 */
const LATEST_LOGS: InjectionKey<Polling<LatestLog[]>> = Symbol('latestLogs')

/**
 * 대시보드 레이아웃에서 한 번 부른다: 최신 로그를 2초마다 조회하고 하위 컴포넌트에 나눠 준다.
 * 헤더(연결 상태 · 알림)와 페이지(상태 카드 · 가동 설비 수)가 같은 응답을 보므로 요청은 2초에 한 번이다.
 */
export function provideLatestLogs(): Polling<LatestLog[]> {
  const polling = usePolling(fetchLatestLogs)
  provide(LATEST_LOGS, polling)
  return polling
}

/** 레이아웃이 나눠 준 최신 로그 폴링을 꺼낸다 */
export function useLatestLogs(): Polling<LatestLog[]> {
  const polling = inject(LATEST_LOGS)
  if (!polling) throw new Error('provideLatestLogs()가 레이아웃에서 먼저 불려야 합니다')
  return polling
}
