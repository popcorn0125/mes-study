import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { usePolling } from './usePolling'

/** 대기 중인 Promise 처리(then · finally)를 모두 끝낸다 */
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('usePolling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('바로 한 번 부르고 주기마다 다시 부른다', async () => {
    const fetcher = vi.fn().mockResolvedValue([1])
    const scope = effectScope()
    const p = scope.run(() => usePolling(fetcher, 2000))!

    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(p.data.value).toEqual([1])
    expect(p.loading.value).toBe(false)
    expect(p.updatedAt.value).toBeInstanceOf(Date)

    await vi.advanceTimersByTimeAsync(4000)
    expect(fetcher).toHaveBeenCalledTimes(3)
    scope.stop()
  })

  it('실패하면 오류를 남기고 직전 데이터는 지우지 않으며, 다음 성공에서 오류가 지워진다', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce('again')
    const scope = effectScope()
    const p = scope.run(() => usePolling(fetcher, 2000))!

    await flush()
    await vi.advanceTimersByTimeAsync(2000)
    expect(p.error.value).toBeInstanceOf(Error)
    expect(p.data.value).toBe('first')

    await vi.advanceTimersByTimeAsync(2000)
    expect(p.error.value).toBeUndefined()
    expect(p.data.value).toBe('again')
    scope.stop()
  })

  it('앞 요청이 끝나지 않았으면 이번 차례는 건너뛴다', async () => {
    let resolve: (v: string) => void = () => {}
    const fetcher = vi.fn(() => new Promise<string>((r) => (resolve = r)))
    const scope = effectScope()
    scope.run(() => usePolling(fetcher, 2000))

    await vi.advanceTimersByTimeAsync(6000) // 첫 요청이 6초째 응답 없음
    expect(fetcher).toHaveBeenCalledTimes(1)

    resolve('late')
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('scope가 끝나면 더 부르지 않고, 늦게 온 응답도 반영하지 않는다', async () => {
    let resolve: (v: string) => void = () => {}
    const fetcher = vi.fn(() => new Promise<string>((r) => (resolve = r)))
    const scope = effectScope()
    const p = scope.run(() => usePolling(fetcher, 2000))!

    scope.stop()
    resolve('after stop')
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(p.data.value).toBeUndefined()
  })

  it('refresh는 주기를 기다리지 않고 바로 부른다', async () => {
    const fetcher = vi.fn().mockResolvedValue('x')
    const scope = effectScope()
    const p = scope.run(() => usePolling(fetcher, 2000))!
    await flush()

    await p.refresh()
    expect(fetcher).toHaveBeenCalledTimes(2)
    scope.stop()
  })
})
