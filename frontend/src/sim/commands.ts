/**
 * 사용자 조작은 엔진 상태를 직접 바꾸지 않고 Command로 전달한다.
 * 다음 tick 시작 시 적용되며, 일시정지 중에는 applyPendingCommands()로 시간 진행 없이 바로 적용할 수 있다.
 */
export type SimCommand =
  /** release가 true면 생성과 동시에 하달한다. */
  | { type: 'CREATE_WORK_ORDER'; itemId: string; qty: number; priority?: number; dueTime?: number; release?: boolean }
  | { type: 'RELEASE_WORK_ORDER'; workOrderId: string }
  | { type: 'HOLD_WORK_ORDER'; workOrderId: string }
  | { type: 'SET_WORK_ORDER_PRIORITY'; workOrderId: string; priority: number }
  | { type: 'SET_CYCLE_TIME'; workCenterId: string; cycleTime: number }
  | { type: 'ADD_EQUIPMENT'; workCenterId: string }
  /** 현재 Unit을 마친 뒤 예방정비에 들어간다 */
  | { type: 'REQUEST_MAINTENANCE'; equipmentId: string }
  /** 긴급 발주: 리드타임이 짧은 대신 할증이 붙는다 */
  | { type: 'EXPEDITE_MATERIAL'; materialId: string; qty: number }
