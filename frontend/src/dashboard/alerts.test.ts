import { describe, expect, it } from 'vitest'
import type { LatestLog } from '@/api/dashboard'
import { toAlerts } from './alerts'

const NOW = Date.parse('2026-10-27T12:00:00Z')

function log(equipmentId: string, status: LatestLog['status'], secondsAgo = 1): LatestLog {
  return { equipmentId, status, recordedAt: new Date(NOW - secondsAgo * 1000).toISOString(), temperature: 40, vibration: 1.2 }
}

describe('헤더 설비 알림', () => {
  it('모두 가동 중이고 수신이 이어지면 알림이 없다', () => {
    const latest = ['CNC_01', 'WINDER_01', 'ASSEMBLY_01', 'INSPECTION_01', 'PACKER_01'].map((id) => log(id, 'RUN'))
    expect(toAlerts(latest, NOW)).toEqual([])
  })

  it('고장 → 통신 끊김 → 수신 없음 → 경고 순으로, 같은 종류는 라인 순서로 모은다', () => {
    const latest = [
      log('CNC_01', 'WARN'),
      log('WINDER_01', 'RUN', 30), // 30초째 수신 없음 → 통신 끊김(상태가 RUN이어도)
      log('ASSEMBLY_01', 'DOWN'),
      log('INSPECTION_01', 'WARN'),
      // PACKER_01은 로그가 없음 → 수신 없음
    ]

    const alerts = toAlerts(latest, NOW)

    expect(alerts.map((a) => `${a.name}:${a.label}`)).toEqual([
      '조립 셀 #1:고장',
      '권선기 #1:통신 끊김',
      '포장기 #1:수신 없음',
      'CNC #1:경고',
      '검사기 #1:경고',
    ])
    expect(alerts[0]).toMatchObject({ equipmentId: 'ASSEMBLY_01', kind: 'DOWN', at: NOW - 1000 })
    expect(alerts[2].at).toBeUndefined()
  })
})
