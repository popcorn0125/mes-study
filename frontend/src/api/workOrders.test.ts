import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, errorMessage } from './client'
import { RUN_ID_HEADER, changeWorkOrder, fetchCurrentWorkOrder, fetchWorkOrders, postSensorLogs } from './workOrders'

describe('작업지시 API 함수', () => {
  afterEach(() => vi.restoreAllMocks())

  it('상태는 ?status=A&status=B로 보낸다(서버 @RequestParam List 형식)', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] })

    await fetchWorkOrders(['RELEASED', 'HELD'])

    const params = get.mock.calls[0][1]?.params as URLSearchParams
    expect(params.toString()).toBe('status=RELEASED&status=HELD')
  })

  it('진행 중 지시가 없으면(204) null을 돌려준다', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ status: 204, data: '' })

    await expect(fetchCurrentWorkOrder()).resolves.toBeNull()
  })

  it('상태 전환은 /work-orders/{id}/{동작}으로, 1초 전송은 실행 ID 헤더를 붙여 보낸다', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} })

    await changeWorkOrder('WO-20261028-001', 'hold')
    await postSensorLogs('run-1', [])

    expect(post).toHaveBeenNthCalledWith(1, '/work-orders/WO-20261028-001/hold')
    expect(post).toHaveBeenNthCalledWith(2, '/sensor-logs/bulk', [], { headers: { [RUN_ID_HEADER]: 'run-1' } })
  })

  it('오류 문구는 서버가 보낸 이유를 쓰고, 응답이 없으면 연결 실패로 알린다', () => {
    const conflict = new AxiosError('409', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      data: { message: '완료 상태인 작업지시는 보류할 수 없습니다' },
      headers: {},
      config: { headers: new AxiosHeaders() },
    })

    expect(errorMessage(conflict, '보류하지 못했습니다')).toBe('완료 상태인 작업지시는 보류할 수 없습니다')
    expect(errorMessage(new AxiosError('Network Error'), '보류하지 못했습니다')).toBe('보류하지 못했습니다: 서버에 연결할 수 없습니다')
    expect(errorMessage(new Error('x'), '보류하지 못했습니다')).toBe('보류하지 못했습니다')
  })
})
