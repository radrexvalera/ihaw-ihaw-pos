import { describe, expect, it } from 'vitest'
import { tileAction } from './tileTap'

const rect = { left: 100, width: 200 } // halves split at x = 200

describe('tileAction', () => {
  it('adds on any tap when the product is not in the order yet', () => {
    expect(tileAction({ x: 110, y: 0 }, rect, 0, true)).toBe('add')
    expect(tileAction({ x: 290, y: 0 }, rect, 0, true)).toBe('add')
  })
  it('left half removes, right half adds once in the order', () => {
    expect(tileAction({ x: 199, y: 0 }, rect, 2, true)).toBe('remove')
    expect(tileAction({ x: 200, y: 0 }, rect, 2, true)).toBe('add')
  })
  it('keyboard activation adds; unsellable products do nothing', () => {
    expect(tileAction(null, rect, 2, true)).toBe('add')
    expect(tileAction({ x: 110, y: 0 }, rect, 2, false)).toBe('none')
  })
})
