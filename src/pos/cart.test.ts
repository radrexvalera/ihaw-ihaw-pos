import { describe, expect, it } from 'vitest'
import type { Product } from '../lib/types'
import {
  addProduct,
  cartTotals,
  decrement,
  increment,
  lastPriceOf,
  quantityOfProduct,
  reconcileCart,
  removeLine,
  removeOneOfProduct,
  setQuantity,
  type Cart,
} from './cart'

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
    is_variable_price: false,
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

describe('price varies (priced by size)', () => {
  const pitso = product('pitso', 0, { is_variable_price: true, unit_cost: 6000 })

  it('needs a typed price, keeps one line per price and merges equal prices', () => {
    expect(addProduct([], pitso)).toEqual([]) // no price given
    let cart: Cart = addProduct([], pitso, 9000)
    cart = addProduct(cart, pitso, 13000)
    cart = addProduct(cart, pitso, 9000)
    expect(cart.map((l) => [l.line_key, l.quantity, l.unit_price])).toEqual([
      ['pitso@9000', 2, 9000],
      ['pitso@13000', 1, 13000],
    ])
    expect(quantityOfProduct(cart, 'pitso')).toBe(3)
    expect(cartTotals(cart).total).toBe(31000)
    expect(lastPriceOf(cart, 'pitso')).toBe(13000)
  })

  it('tile minus removes from the most recently added size', () => {
    let cart: Cart = addProduct(addProduct([], pitso, 9000), pitso, 13000)
    cart = removeOneOfProduct(cart, 'pitso')
    expect(cart.map((l) => l.line_key)).toEqual(['pitso@9000'])
  })

  it('reconcile keeps typed prices but refreshes cost', () => {
    const cart = addProduct([], pitso, 9000)
    const next = reconcileCart(cart, [{ ...pitso, unit_cost: 6500, selling_price: 10000 }])
    expect(next[0]).toMatchObject({ unit_price: 9000, unit_cost: 6500 })
  })

  it('a fixed product switched to "price varies" drops its line (needs a typed price)', () => {
    const cart = addProduct([], bbq)
    expect(reconcileCart(cart, [{ ...bbq, is_variable_price: true }])).toEqual([])
  })

  it('upgrades carts saved without line keys', () => {
    const old = [{ product_id: 'bbq', name: 'BBQ', unit_price: 2500, unit_cost: 1250, quantity: 2 }] as unknown as Cart
    expect(reconcileCart(old, [bbq])[0]).toMatchObject({ line_key: 'bbq', quantity: 2 })
  })
})
