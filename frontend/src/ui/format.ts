import { equipmentName } from '@/domain/equipment'
import { formatDuration } from '@/domain/duration'
import type { MasterData, UnitStatus, WorkOrderStatus } from '@/domain/types'

export { formatDuration }

export function percent(ratio: number | null, digits = 0): string {
  return ratio === null ? '—' : `${(ratio * 100).toFixed(digits)}%`
}

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  PLANNED: '계획',
  RELEASED: '하달',
  IN_PROGRESS: '진행',
  HELD: '보류',
  COMPLETED: '완료',
}

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  QUEUED: '대기',
  PROCESSING: '가공',
  COMPLETED: '완료',
  SCRAPPED: '폐기',
}

/** 기준정보에서 id → 이름을 찾는다. 기준정보에 없는 id(예: 실행 중 추가된 설비)는 id를 그대로 쓴다. */
export function createNameLookup(master: MasterData) {
  const items = new Map(master.items.map((i) => [i.id, i.name]))
  const workCenters = new Map(master.workCenters.map((wc) => [wc.id, wc.name]))
  const materials = new Map(master.materials.map((m) => [m.id, m.name]))
  return {
    item: (id: string) => items.get(id) ?? id,
    workCenter: (id: string) => workCenters.get(id) ?? id,
    equipment: (id: string) => equipmentName(master, id),
    material: (id: string) => materials.get(id) ?? id,
  }
}


const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' })

export function formatWon(value: number): string {
  return won.format(value)
}
