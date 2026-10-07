import { describe, expect, it } from 'vitest'
import { adjustmentFor, validateMovement } from './stockLogic'

describe('adjustmentFor', () => {
  it('turns a physical count into a signed adjustment', () => {
    expect(adjustmentFor(42, 39)).toEqual({ type: 'ADJUSTMENT_MINUS', quantityChange: -3 })
    expect(adjustmentFor(10, 12)).toEqual({ type: 'ADJUSTMENT_PLUS', quantityChange: 2 })
    expect(adjustmentFor(-4, 0)).toEqual({ type: 'ADJUSTMENT_PLUS', quantityChange: 4 })
    expect(adjustmentFor(7, 7)).toBeNull()
  })
})

describe('validateMovement', () => {
  it('accepts valid movements', () => {
    expect(validateMovement('STOCK_IN', 50, null)).toBeNull()
    expect(validateMovement('OPENING', 100, null)).toBeNull()
    expect(validateMovement('ADJUSTMENT_MINUS', -3, 'Damaged')).toBeNull()
  })
  it('rejects zero, wrong signs and missing adjustment reasons', () => {
    expect(validateMovement('STOCK_IN', 0, null)).toMatch(/quantity/)
    expect(validateMovement('STOCK_IN', -5, null)).toMatch(/sign/)
    expect(validateMovement('ADJUSTMENT_MINUS', 3, 'Damaged')).toMatch(/sign/)
    expect(validateMovement('ADJUSTMENT_PLUS', 2, '  ')).toMatch(/reason/)
  })
})
