import { describe, expect, it } from 'vitest'
import type { Product } from '../lib/types'
import { addProduct, cartTotals, decrement, increment, reconcileCart, removeLine, setQuantity, type Cart } from './cart'

function product(id: string, price: number, extra: Partial<Product> = {}): Product {
  return {
    id,
    name: id.toUpperCase(),
    selling_price: price,
    unit_cost: Math.round(price / 2),
    stock_quantity: 50,
    low_stock_threshold: 5,
    is_active: true,
    is_sold_out: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...extra,
  }
}

const bbq = product('bbq', 2500)
const isaw = product('isaw', 1000)
const tenga = product('tenga', 2000)

describe('cart', () => {
  it('adds one per tap and merges into one line per product', () => {
    let cart: Cart = []
    cart = addProduct(cart, bbq)
    cart = addProduct(cart, bbq)
    cart = addProduct(cart, bbq)
    cart = addProduct(cart, isaw)
    cart = addProduct(cart, isaw)
    cart = addProduct(cart, tenga)
    expect(cart.map((l) => [l.product_id, l.quantity])).toEqual([
      ['bbq', 3],
      ['isaw', 2],
      ['tenga', 1],
    ])
    // 3 × 25 + 2 × 10 + 1 × 20 = 115
    expect(cartTotals(cart)).toEqual({ pieces: 6, total: 11500 })
  })

  it('+ / - / remove update quantities; minus at 1 removes the line', () => {
    let cart: Cart = addProduct([], bbq)
    cart = increment(cart, 'bbq')
    expect(cart[0]!.quantity).toBe(2)
    cart = decrement(cart, 'bbq')
    cart = decrement(cart, 'bbq')
    expect(cart).toEqual([])
    cart = removeLine(addProduct(cart, isaw), 'isaw')
    expect(cart).toEqual([])
  })

  it('caps and truncates quantities', () => {
    const cart = setQuantity(addProduct([], bbq), 'bbq', 5000)
    expect(cart[0]!.quantity).toBe(999)
    expect(setQuantity(cart, 'bbq', 2.7)[0]!.quantity).toBe(2)
  })

  it('never adds sold-out, inactive or unpriced products', () => {
    expect(addProduct([], product('x', 2000, { is_sold_out: true }))).toEqual([])
    expect(addProduct([], product('x', 2000, { is_active: false }))).toEqual([])
    expect(addProduct([], product('x', 0))).toEqual([])
  })

  it('does not mutate the previous cart', () => {
    const before = addProduct([], bbq)
    increment(before, 'bbq')
    expect(before[0]!.quantity).toBe(1)
  })

  it('reconciles a saved cart with current products', () => {
    const cart = addProduct(addProduct([], bbq), tenga)
    const next = reconcileCart(cart, [{ ...bbq, selling_price: 3000 }, { ...tenga, is_sold_out: true }])
    expect(next).toEqual([{ ...cart[0]!, unit_price: 3000 }])
  })
})
