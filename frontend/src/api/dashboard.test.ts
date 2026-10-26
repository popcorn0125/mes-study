import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL, apiClient } from './client'
import {
  fetchLatestLogs,
  fetchProduction,
  fetchRecentLogs,
  fetchStatusChanges,
  fetchStatusSummary,
} from './dashboard'

/** 서버 대신 apiClient.get을 가로채 부른 경로 · 파라미터를 확인한다 */
function mockGet(data: unknown = []) {
  return vi.spyOn(apiClient, 'get').mockResolvedValue({ data })
}

describe('조회 API 함수', () => {
  afterEach(() => vi.restoreAllMocks())

  it('백엔드 /api/v1을 기준 주소로 쓴다', () => {
    expect(apiClient.defaults.baseURL).toBe(API_BASE_URL)
    expect(API_BASE_URL).toBe('http://localhost:8080/api/v1')
  })

  it('최신 로그 · 실적은 경로만 부르고 응답 본문을 그대로 돌려준다', async () => {
    const get = mockGet([{ equipmentId: 'CNC_01' }])

    await expect(fetchLatestLogs()).resolves.toEqual([{ equipmentId: 'CNC_01' }])
    await fetchProduction()

    expect(get).toHaveBeenNthCalledWith(1, '/equipment/latest')
    expect(get).toHaveBeenNthCalledWith(2, '/production-performance')
  })

  it('기간을 주지 않으면 추이 10분, 상태 60분으로 부른다', async () => {
    const get = mockGet()

    await fetchRecentLogs('CNC_01')
    await fetchStatusSummary()
    await fetchStatusChanges('CNC_01')

    expect(get).toHaveBeenNthCalledWith(1, '/equipment/CNC_01/sensor-logs', { params: { minutes: 10 } })
    expect(get).toHaveBeenNthCalledWith(2, '/equipment/status-summary', { params: { minutes: 60 } })
    expect(get).toHaveBeenNthCalledWith(3, '/equipment/CNC_01/status-changes', { params: { minutes: 60 } })
  })

  it('설비 ID는 경로에 넣을 때 인코딩한다', async () => {
    const get = mockGet()

    await fetchRecentLogs('LINE A/01', 30)

    expect(get).toHaveBeenCalledWith('/equipment/LINE%20A%2F01/sensor-logs', { params: { minutes: 30 } })
  })
})
