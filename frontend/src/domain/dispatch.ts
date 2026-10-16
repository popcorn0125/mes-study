import type { DispatchRule, WorkOrder } from './types'

/**
 * 디스패칭(투입 순서) 규칙. 엔진의 실제 투입과 화면의 예상 완료 계산이 같은 비교 함수를 써서
 * 목록 순서와 실제 투입 순서가 어긋나지 않게 한다.
 * 규칙은 첫 공정에 무엇을 먼저 넣을지만 정한다. 투입된 뒤에는 라인이 FIFO라 순서가 바뀌지 않는다.
 */

export const DISPATCH_RULES: readonly DispatchRule[] = ['FIFO', 'PRIORITY', 'EDD']

export const DISPATCH_RULE_LABEL: Record<DispatchRule, string> = {
  FIFO: '하달 순 (FIFO)',
  PRIORITY: '우선순위',
  EDD: '납기 빠른 순 (EDD)',
}

/** 하달 순 → 생성 순. 아직 하달 전이면 맨 뒤 */
function byRelease(a: WorkOrder, b: WorkOrder): number {
  return (a.releasedAt ?? Infinity) - (b.releasedAt ?? Infinity) || a.createdAt - b.createdAt
}

/** 규칙에 맞는 비교 함수. 앞에 올수록 먼저 투입한다. */
export function compareForDispatch(rule: DispatchRule): (a: WorkOrder, b: WorkOrder) => number {
  switch (rule) {
    case 'FIFO':
      return byRelease
    case 'PRIORITY':
      return (a, b) => b.priority - a.priority || byRelease(a, b)
    case 'EDD':
      // 납기가 없는 작업지시는 납기가 있는 것보다 뒤
      return (a, b) => (a.dueTime ?? Infinity) - (b.dueTime ?? Infinity) || byRelease(a, b)
  }
}
