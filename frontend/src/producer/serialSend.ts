/**
 * 요청을 한 번에 하나만 보낸다. 앞 요청이 끝나기 전에 들어온 항목은 모아 두었다가, 끝나자마자 한 번에 보낸다.
 * 서버는 설비마다 마지막으로 받은 시각 이하인 행을 재전송으로 보고 버리므로,
 * 1초 전송이 겹쳐 뒤 요청이 먼저 처리되면 앞 요청의 초가 통째로 사라진다. 그래서 겹치지 않게 줄을 세운다.
 * send는 실패해도 다음 묶음은 이어서 보낸다(실패한 묶음은 다시 보내지 않는다).
 */
export function createSerialSender<T>(send: (items: T[]) => Promise<unknown>) {
  let queued: T[] = []
  let inFlight = false

  function flush() {
    if (inFlight || queued.length === 0) return
    const batch = queued
    queued = []
    inFlight = true
    const done = () => {
      inFlight = false
      flush()
    }
    send(batch).then(done, done)
  }

  return {
    push(items: readonly T[]) {
      queued.push(...items)
      flush()
    },
    /** 아직 보내지 않은 항목을 버린다(다시 시작 · 밀려남) */
    clear() {
      queued = []
    },
  }
}
