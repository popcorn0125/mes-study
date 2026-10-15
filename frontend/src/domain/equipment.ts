import type { Equipment, MasterData } from './types'

/**
 * 설비 표시 이름. 기준정보에 없는 설비(실행 중 추가, id 형식 `작업장ID-번호`)는
 * 같은 작업장 기존 설비 이름을 본떠 만든다. 예: ASSEMBLY-2 → "조립 셀 #1"을 본떠 "조립 셀 #2"
 */
export function equipmentName(master: MasterData, id: string): string {
  const known = master.equipment.find((eq) => eq.id === id)
  if (known) return known.name
  const match = /^(.+)-(\d+)$/.exec(id)
  if (!match) return id
  const [, workCenterId, number] = match
  const sibling = master.equipment.find((eq) => eq.workCenterId === workCenterId)
  if (!sibling) return id
  return /#\d+$/.test(sibling.name) ? sibling.name.replace(/#\d+$/, `#${number}`) : `${sibling.name} ${number}`
}

/**
 * 설비의 센서·신뢰성 규격. 실행 중 추가된 설비는 같은 작업장 기존 설비의 규격을 물려받는다(엔진과 같은 규칙).
 */
export function equipmentSpec(master: MasterData, id: string, workCenterId: string): Equipment | undefined {
  return (
    master.equipment.find((eq) => eq.id === id) ?? master.equipment.find((eq) => eq.workCenterId === workCenterId)
  )
}
