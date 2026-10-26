import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'

/**
 * intervalMs마다 갱신되는 현재 시각(ms). "n초 전" 문구 · 통신 끊김 판정이 폴링 사이에도 흐르게 한다.
 * 컴포넌트(또는 effect scope)가 사라지면 멈춘다.
 */
export function useNow(intervalMs = 1000): Readonly<Ref<number>> {
  const now = ref(Date.now())
  const timer = setInterval(() => (now.value = Date.now()), intervalMs)
  if (getCurrentScope()) onScopeDispose(() => clearInterval(timer))
  return now
}
