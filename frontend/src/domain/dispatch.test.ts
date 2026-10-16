import { describe, expect, it } from 'vitest'
import { compareForDispatch } from './dispatch'
import type { WorkOrder } from './types'

function wo(id: string, fields: Partial<WorkOrder>): WorkOrder {
  return {
    id,
    itemId: 'A',
    qty: 10,
    priority: 0,
    dueTime: null,
    status: 'RELEASED',
    statusBeforeHold: null,
    releasedQty: 0,
    goodQty: 0,
    scrapQty: 0,
    reworkQty: 0,
    createdAt: 0,
    releasedAt: 0,
    startedAt: null,
    completedAt: null,
    ...fields,
  }
}

const orders = [
  wo('W1', { releasedAt: 100, createdAt: 0 }),
  wo('W2', { releasedAt: 50, createdAt: 10, dueTime: 900 }),
  wo('W3', { releasedAt: 50, createdAt: 20, priority: 3, dueTime: 500 }),
  wo('W4', { releasedAt: null, createdAt: 5, priority: 9, dueTime: 100 }),
]
const order = (rule: Parameters<typeof compareForDispatch>[0]) =>
  [...orders].sort(compareForDispatch(rule)).map((w) => w.id)

describe('compareForDispatch', () => {
  it('FIFO: 하달 순 → 생성 순, 하달 전은 맨 뒤', () => {
    expect(order('FIFO')).toEqual(['W2', 'W3', 'W1', 'W4'])
  })

  it('PRIORITY: 우선순위 높은 순, 같으면 하달 순', () => {
    expect(order('PRIORITY')).toEqual(['W4', 'W3', 'W2', 'W1'])
  })

  it('EDD: 납기 빠른 순, 납기 없으면 뒤로 가고 그 안에서는 하달 순', () => {
    expect(order('EDD')).toEqual(['W4', 'W3', 'W2', 'W1'])
    const noDue = [wo('X', { releasedAt: 30 }), wo('Y', { releasedAt: 20 }), wo('Z', { releasedAt: 90, dueTime: 1 })]
    expect(noDue.sort(compareForDispatch('EDD')).map((w) => w.id)).toEqual(['Z', 'Y', 'X'])
  })
})
