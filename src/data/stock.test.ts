import { describe, expect, it } from 'vitest'
import { isLowStock, sortProducts, withLocalStock } from './stock'

const products = [
  { id: 'bbq', name: 'BBQ', stock_quantity: 85, sort_order: 10, low_stock_threshold: 20 },
  { id: 'isaw', name: 'Isaw Manok', stock_quantity: 40, sort_order: 20, low_stock_threshold: 10 },
]

describe('withLocalStock', () => {
  it('applies unsynced local movements on top of server stock', () => {
    const result = withLocalStock(products, [
      { product_id: 'bbq', quantity_change: -3 },
      { product_id: 'bbq', quantity_change: -2 },
      { product_id: 'isaw', quantity_change: 50 },
    ])
    expect(result.map((p) => p.stock_quantity)).toEqual([80, 90])
  })
  it('does not mutate the input', () => {
    withLocalStock(products, [{ product_id: 'bbq', quantity_change: -3 }])
    expect(products[0]!.stock_quantity).toBe(85)
  })
})

describe('isLowStock', () => {
  it('flags at or below threshold, ignoring a zero threshold', () => {
    expect(isLowStock({ stock_quantity: 8, low_stock_threshold: 10 })).toBe(true)
    expect(isLowStock({ stock_quantity: 10, low_stock_threshold: 10 })).toBe(true)
    expect(isLowStock({ stock_quantity: 11, low_stock_threshold: 10 })).toBe(false)
    expect(isLowStock({ stock_quantity: 0, low_stock_threshold: 0 })).toBe(false)
  })
})

describe('sortProducts', () => {
  it('sorts by sort_order then name', () => {
    const sorted = sortProducts([
      { name: 'B', sort_order: 2 },
      { name: 'C', sort_order: 1 },
      { name: 'A', sort_order: 2 },
    ])
    expect(sorted.map((p) => p.name)).toEqual(['C', 'A', 'B'])
  })
})
