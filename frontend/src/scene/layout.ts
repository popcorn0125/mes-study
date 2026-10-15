/**
 * 3D 배치 계산. 좌표계: x = 라인 진행 방향(왼쪽 → 오른쪽), y = 위, z = 깊이.
 * 순수 함수로만 구성해 장면 컴포넌트와 테스트에서 함께 쓴다.
 */
export type Vec3 = [number, number, number]

/** 작업장 사이 간격 */
export const WORK_CENTER_SPACING = 5
/** 같은 작업장 안에서 설비 사이 간격(z 방향) */
export const EQUIPMENT_SPACING = 2.2
export const EQUIPMENT_SIZE: Vec3 = [1.4, 1, 1.2]
export const UNIT_SIZE = 0.34

const SHELF_OFFSET_X = -2
const SHELF_TOP_Y = 0.35
const SLOT_COLUMNS = 2
const SLOT_GAP = 0.42

export function workCenterX(index: number, count: number): number {
  return (index - (count - 1) / 2) * WORK_CENTER_SPACING
}

/** 작업장 입력 버퍼 선반의 기준 위치(설비 왼쪽) */
export function shelfPosition(wcIndex: number, wcCount: number): Vec3 {
  return [workCenterX(wcIndex, wcCount) + SHELF_OFFSET_X, 0, 0]
}

/** 버퍼 안 slot번째 Unit 위치. 2열로 위로 쌓아 WIP가 높이로 보이게 한다. */
export function bufferSlotPosition(wcIndex: number, wcCount: number, slot: number): Vec3 {
  const [x] = shelfPosition(wcIndex, wcCount)
  const col = slot % SLOT_COLUMNS
  const level = Math.floor(slot / SLOT_COLUMNS)
  return [x + (col - (SLOT_COLUMNS - 1) / 2) * SLOT_GAP, SHELF_TOP_Y + UNIT_SIZE / 2 + level * SLOT_GAP, 0]
}

/** 선반 높이: 용량을 다 채웠을 때 Unit이 쌓이는 높이 */
export function shelfHeight(capacity: number): number {
  return Math.ceil(capacity / SLOT_COLUMNS) * SLOT_GAP
}

/** 작업장 안 eqIndex번째 설비 위치(설비 여러 대는 z 방향으로 나란히) */
export function equipmentPosition(wcIndex: number, wcCount: number, eqIndex: number, eqCount: number): Vec3 {
  return [
    workCenterX(wcIndex, wcCount) + 0.6,
    EQUIPMENT_SIZE[1] / 2,
    (eqIndex - (eqCount - 1) / 2) * EQUIPMENT_SPACING,
  ]
}

/** 설비 위에서 가공 중인 Unit 위치 */
export function unitOnEquipmentPosition(equipment: Vec3): Vec3 {
  return [equipment[0], EQUIPMENT_SIZE[1] + UNIT_SIZE / 2, equipment[2]]
}

/** 자재 창고(투입 시작점), 출하장(양품 완료), 폐기함(불량) */
export function warehousePosition(wcCount: number): Vec3 {
  return [workCenterX(0, wcCount) - WORK_CENTER_SPACING, UNIT_SIZE / 2, 0]
}

export function shippingPosition(wcCount: number): Vec3 {
  return [workCenterX(wcCount - 1, wcCount) + WORK_CENTER_SPACING, UNIT_SIZE / 2, 0]
}

export function scrapPosition(): Vec3 {
  return [0, UNIT_SIZE / 2, 6]
}

/** 설비 id → 위치. 작업장별로 설비 대수를 세어 z 방향으로 나란히 놓는다(설비 추가 시 자동 재배치). */
export function equipmentPositions(
  workCenterIds: readonly string[],
  equipment: readonly { id: string; workCenterId: string }[],
): Map<string, Vec3> {
  const result = new Map<string, Vec3>()
  workCenterIds.forEach((wcId, wcIndex) => {
    const inWorkCenter = equipment.filter((eq) => eq.workCenterId === wcId)
    inWorkCenter.forEach((eq, i) => {
      result.set(eq.id, equipmentPosition(wcIndex, workCenterIds.length, i, inWorkCenter.length))
    })
  })
  return result
}

// ── 장식(컨베이어·통로) ─────────────────────────────────────

/** 컨베이어 벨트 윗면 높이 */
export const CONVEYOR_TOP_Y = 0.6
/** 자재 운반 AGV가 다니는 앞쪽 통로(z) */
export const AISLE_Z = 4.4

const SHELF_HALF_WIDTH = 0.55
const EQUIPMENT_HALF_WIDTH = EQUIPMENT_SIZE[0] / 2
const DOCK_HALF_WIDTH = 0.8

/**
 * 컨베이어 구간 [시작 x, 끝 x] 목록.
 * 자재 창고 → 버퍼 → 설비 → 다음 버퍼 … → 출하장 사이의 빈 곳을 잇는다(선반·설비와 겹치지 않음).
 */
export function conveyorSegments(wcCount: number): [number, number][] {
  const warehouseX = warehousePosition(wcCount)[0]
  const stops: [number, number][] = [[warehouseX - DOCK_HALF_WIDTH, warehouseX + DOCK_HALF_WIDTH]]
  for (let i = 0; i < wcCount; i++) {
    const shelfX = shelfPosition(i, wcCount)[0]
    const eqX = workCenterX(i, wcCount) + 0.6
    stops.push([shelfX - SHELF_HALF_WIDTH, shelfX + SHELF_HALF_WIDTH])
    stops.push([eqX - EQUIPMENT_HALF_WIDTH, eqX + EQUIPMENT_HALF_WIDTH])
  }
  const shipX = shippingPosition(wcCount)[0]
  stops.push([shipX - DOCK_HALF_WIDTH, shipX + DOCK_HALF_WIDTH])

  const segments: [number, number][] = []
  for (let i = 0; i + 1 < stops.length; i++) {
    const start = stops[i][1]
    const end = stops[i + 1][0]
    if (end - start > 0.1) segments.push([start, end])
  }
  return segments
}
