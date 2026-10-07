// Pure cart logic. Fixed-price products have one line each; "price varies"
// products (priced by size) get one line per price entered at sale.
import { lineTotal, sumCentavos, type Centavos } from '../lib/money'
import type { Product } from '../lib/types'

export interface CartLine {
  /** product_id for fixed-price products, `${product_id}@${price}` for price-varies ones. */
  line_key: string
  product_id: string
  name: string
  unit_price: Centavos
  unit_cost: Centavos
  quantity: number
  /** Price was typed at sale (keep it when product prices refresh). */
  variable_price: boolean
}

export type Cart = readonly CartLine[]

export const MAX_LINE_QUANTITY = 999

export function canSell(p: Pick<Product, 'is_active' | 'is_sold_out' | 'selling_price' | 'is_variable_price'>): boolean {
  return p.is_active && !p.is_sold_out && (p.is_variable_price || p.selling_price > 0)
}

export function lineKey(p: Pick<Product, 'id' | 'is_variable_price'>, price: Centavos): string {
  return p.is_variable_price ? `${p.id}@${price}` : p.id
}

/**
 * Adds one piece. Price and cost are captured now (the snapshot used at sale).
 * `price` is required for "price varies" products and ignored for the rest.
 */
export function addProduct(cart: Cart, p: Product, price?: Centavos): Cart {
  if (!canSell(p)) return cart
  const unitPrice = p.is_variable_price ? price : p.selling_price
  if (unitPrice === undefined || !Number.isSafeInteger(unitPrice) || unitPrice <= 0) return cart
  const key = lineKey(p, unitPrice)
  const existing = cart.find((l) => l.line_key === key)
  if (existing) return setQuantity(cart, key, existing.quantity + 1)
  return [
    ...cart,
    {
      line_key: key,
      product_id: p.id,
      name: p.name,
      unit_price: unitPrice,
      unit_cost: p.unit_cost,
      quantity: 1,
      variable_price: p.is_variable_price,
    },
  ]
}

/** Sets a line's quantity; 0 or less removes the line. */
export function setQuantity(cart: Cart, key: string, quantity: number): Cart {
  const q = Math.min(Math.trunc(quantity), MAX_LINE_QUANTITY)
  if (q <= 0) return removeLine(cart, key)
  return cart.map((l) => (l.line_key === key ? { ...l, quantity: q } : l))
}

export function increment(cart: Cart, key: string): Cart {
  const line = cart.find((l) => l.line_key === key)
  return line ? setQuantity(cart, key, line.quantity + 1) : cart
}

export function decrement(cart: Cart, key: string): Cart {
  const line = cart.find((l) => l.line_key === key)
  return line ? setQuantity(cart, key, line.quantity - 1) : cart
}

export function removeLine(cart: Cart, key: string): Cart {
  return cart.filter((l) => l.line_key !== key)
}

/** Removes one piece of a product from its most recently added line (tile left-half tap). */
export function removeOneOfProduct(cart: Cart, productId: string): Cart {
  const last = [...cart].reverse().find((l) => l.product_id === productId)
  return last ? decrement(cart, last.line_key) : cart
}

export function quantityOfProduct(cart: Cart, productId: string): number {
  return cart.reduce((n, l) => (l.product_id === productId ? n + l.quantity : n), 0)
}

/** Price of the most recently added line of a product (pre-selects the price pad). */
export function lastPriceOf(cart: Cart, productId: string): Centavos | null {
  return [...cart].reverse().find((l) => l.product_id === productId)?.unit_price ?? null
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
 * that were disabled / sold out, refreshes name and cost, and refreshes the
 * price of fixed-price lines (typed prices are kept). Also upgrades carts
 * saved by older versions of the app (no line_key).
 */
export function reconcileCart(cart: Cart, products: readonly Product[]): Cart {
  const byId = new Map(products.map((p) => [p.id, p]))
  const next: CartLine[] = []
  for (const line of cart) {
    const p = byId.get(line.product_id)
    if (!p || !canSell(p)) continue
    const variable = Boolean(line.variable_price) && p.is_variable_price
    const unitPrice = variable ? line.unit_price : p.selling_price
    if (!p.is_variable_price && unitPrice <= 0) continue
    if (p.is_variable_price && !variable) continue // was fixed-price, now varies: needs a typed price
    const key = lineKey(p, unitPrice)
    const merged = next.find((l) => l.line_key === key)
    if (merged) {
      merged.quantity = Math.min(merged.quantity + line.quantity, MAX_LINE_QUANTITY)
      continue
    }
    next.push({ ...line, line_key: key, name: p.name, unit_price: unitPrice, unit_cost: p.unit_cost, variable_price: variable })
  }
  return next
}
