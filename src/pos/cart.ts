// Pure cart logic. One line per product; quantities are whole pieces.
import { lineTotal, sumCentavos, type Centavos } from '../lib/money'
import type { Product } from '../lib/types'

export interface CartLine {
  product_id: string
  name: string
  unit_price: Centavos
  unit_cost: Centavos
  quantity: number
}

export type Cart = readonly CartLine[]

export const MAX_LINE_QUANTITY = 999

export function canSell(p: Pick<Product, 'is_active' | 'is_sold_out' | 'selling_price'>): boolean {
  return p.is_active && !p.is_sold_out && p.selling_price > 0
}

/** Adds one piece. Price and cost are captured now (the snapshot used at sale). */
export function addProduct(cart: Cart, p: Product): Cart {
  if (!canSell(p)) return cart
  const existing = cart.find((l) => l.product_id === p.id)
  if (existing) return setQuantity(cart, p.id, existing.quantity + 1)
  return [...cart, { product_id: p.id, name: p.name, unit_price: p.selling_price, unit_cost: p.unit_cost, quantity: 1 }]
}

/** Sets a line's quantity; 0 or less removes the line. */
export function setQuantity(cart: Cart, productId: string, quantity: number): Cart {
  const q = Math.min(Math.trunc(quantity), MAX_LINE_QUANTITY)
  if (q <= 0) return removeLine(cart, productId)
  return cart.map((l) => (l.product_id === productId ? { ...l, quantity: q } : l))
}

export function increment(cart: Cart, productId: string): Cart {
  const line = cart.find((l) => l.product_id === productId)
  return line ? setQuantity(cart, productId, line.quantity + 1) : cart
}

export function decrement(cart: Cart, productId: string): Cart {
  const line = cart.find((l) => l.product_id === productId)
  return line ? setQuantity(cart, productId, line.quantity - 1) : cart
}

export function removeLine(cart: Cart, productId: string): Cart {
  return cart.filter((l) => l.product_id !== productId)
}

export function cartLineTotal(line: CartLine): Centavos {
  return lineTotal(line.unit_price, line.quantity)
}

export function cartTotals(cart: Cart): { pieces: number; total: Centavos } {
  return {
    pieces: cart.reduce((n, l) => n + l.quantity, 0),
    total: sumCentavos(cart.map(cartLineTotal)),
  }
}

/**
 * Re-checks a saved cart against current products: drops lines for products
 * that were disabled / sold out, and refreshes name, price and cost.
 */
export function reconcileCart(cart: Cart, products: readonly Product[]): Cart {
  const byId = new Map(products.map((p) => [p.id, p]))
  const next: CartLine[] = []
  for (const line of cart) {
    const p = byId.get(line.product_id)
    if (!p || !canSell(p)) continue
    next.push({ ...line, name: p.name, unit_price: p.selling_price, unit_cost: p.unit_cost })
  }
  return next
}
