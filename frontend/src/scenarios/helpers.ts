import type { MasterData } from '@/domain/types'
import { formatDuration } from '@/domain/duration'
import type { TimedCommand } from './types'

export const HOUR = 3600

/** 지정한 설비 외에는 마모·고장을 없앤다(시나리오가 다루는 문제만 남기기 위해). */
export function keepReliabilityOnly(master: MasterData, equipmentIds: string[]): MasterData {
  for (const eq of master.equipment) {
    if (!equipmentIds.includes(eq.id)) delete eq.reliability
  }
  return master
}

/** 자재 제약을 없앤다(BOM 비움). 자재가 주제가 아닌 시나리오에서 다른 원인이 섞이지 않게 한다. */
export function withoutMaterialConstraints(master: MasterData): MasterData {
  master.bom = []
  return master
}

export function percentChange(from: number, to: number): string {
  if (from === 0) return '—'
  const change = ((to - from) / from) * 100
  return `${change >= 0 ? '+' : ''}${change.toFixed(0)}%`
}

export function minutes(sec: number): string {
  return formatDuration(sec)
}

export function actionsOfType<T extends TimedCommand['command']['type']>(actions: TimedCommand[], type: T) {
  return actions.filter((a) => a.command.type === type) as Array<
    TimedCommand & { command: Extract<TimedCommand['command'], { type: T }> }
  >
}
