import { describe, expect, it } from 'vitest'
import { businessDate, compactDate, formatAgo, minutesSince } from './time'

describe('businessDate', () => {
  it('uses Manila time, not UTC', () => {
    // 2026-10-07 17:30 UTC is already 01:30 on the 8th in Manila.
    expect(businessDate(new Date('2026-10-07T17:30:00Z'))).toBe('2026-10-08')
    expect(businessDate(new Date('2026-10-07T15:59:00Z'))).toBe('2026-10-07')
  })
  it('compacts for order references', () => {
    expect(compactDate('2026-10-07')).toBe('20261007')
  })
})

describe('minutesSince / formatAgo', () => {
  const now = new Date('2026-10-07T10:10:00+08:00')
  it('counts whole minutes and never goes negative', () => {
    expect(minutesSince('2026-10-07T10:06:30+08:00', now)).toBe(3)
    expect(minutesSince('2026-10-07T10:20:00+08:00', now)).toBe(0)
  })
  it('formats relative times', () => {
    expect(formatAgo(null, now)).toBe('never')
    expect(formatAgo('2026-10-07T10:09:40+08:00', now)).toBe('just now')
    expect(formatAgo('2026-10-07T10:00:00+08:00', now)).toBe('10 min ago')
    expect(formatAgo('2026-10-07T07:00:00+08:00', now)).toBe('3 h ago')
  })
})
