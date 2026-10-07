import { describe, expect, it } from 'vitest'
import type { GrillStatus, OrderStatus } from '../lib/types'
import { formatWait, grillQueue, waitLevel, waitSeconds } from './queue'

function o(id: string, created_at: string, grill_status: GrillStatus, status: OrderStatus = 'completed') {
  return { id, created_at, grill_status, status }
}

describe('grillQueue', () => {
  it('shows only active orders, oldest first, split into waiting and grilling', () => {
    const q = grillQueue([
      o('29', '2026-10-07T10:03:00Z', 'new'),
      o('27', '2026-10-07T10:01:00Z', 'new'),
      o('25', '2026-10-07T09:58:00Z', 'grilling'),
      o('24', '2026-10-07T09:55:00Z', 'done'),
      o('28', '2026-10-07T10:02:00Z', 'cancelled', 'cancelled'),
      o('26', '2026-10-07T10:00:00Z', 'new', 'cancelled'),
    ])
    expect(q.waiting.map((x) => x.id)).toEqual(['27', '29'])
    expect(q.grilling.map((x) => x.id)).toEqual(['25'])
  })
})

describe('wait time', () => {
  const now = Date.parse('2026-10-07T10:10:00Z')
  it('counts seconds and never goes negative', () => {
    expect(waitSeconds('2026-10-07T10:06:30Z', now)).toBe(210)
    expect(waitSeconds('2026-10-07T10:11:00Z', now)).toBe(0)
  })
  it('escalates at 5 and 10 minutes', () => {
    expect(waitLevel(299)).toBe('ok')
    expect(waitLevel(300)).toBe('warn')
    expect(waitLevel(600)).toBe('late')
  })
  it('formats like a timer', () => {
    expect(formatWait(42)).toBe('0:42')
    expect(formatWait(245)).toBe('4:05')
    expect(formatWait(3730)).toBe('1:02:10')
  })
})
