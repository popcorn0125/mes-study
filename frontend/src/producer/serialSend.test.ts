import { describe, expect, it, vi } from 'vitest'
import { createSerialSender } from './serialSend'

/** 대기 중인 Promise 처리(then)를 모두 끝낸다 */
const flush = () => new Promise((r) => setTimeout(r, 0))

/** 부를 때마다 끝내기 함수를 쌓아 두는 send */
function deferredSend() {
  const calls: { items: number[]; resolve: () => void; reject: () => void }[] = []
  const send = vi.fn(
    (items: number[]) => new Promise<void>((resolve, reject) => calls.push({ items, resolve, reject: () => reject(new Error('x')) })),
  )
  return { send, calls }
}

describe('createSerialSender', () => {
  it('보내는 중이 아니면 바로 보낸다', () => {
    const { send, calls } = deferredSend()
    createSerialSender(send).push([1])
    expect(calls.map((c) => c.items)).toEqual([[1]])
  })

  it('앞 요청이 끝나기 전에는 보내지 않고, 끝나면 그동안 쌓인 것을 한 번에 보낸다', async () => {
    const { send, calls } = deferredSend()
    const sender = createSerialSender(send)
    sender.push([1])
    sender.push([2])
    sender.push([3])
    expect(send).toHaveBeenCalledTimes(1)

    calls[0].resolve()
    await flush()
    expect(calls.map((c) => c.items)).toEqual([[1], [2, 3]])
  })

  it('실패해도 다음 묶음은 이어서 보낸다', async () => {
    const { send, calls } = deferredSend()
    const sender = createSerialSender(send)
    sender.push([1])
    sender.push([2])
    calls[0].reject()
    await flush()
    expect(calls.map((c) => c.items)).toEqual([[1], [2]])
  })

  it('clear하면 아직 보내지 않은 것은 버린다', async () => {
    const { send, calls } = deferredSend()
    const sender = createSerialSender(send)
    sender.push([1])
    sender.push([2])
    sender.clear()
    calls[0].resolve()
    await flush()
    expect(send).toHaveBeenCalledTimes(1)
  })
})
