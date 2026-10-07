import type { Product } from '../lib/types'

/** Minimal shape needed to apply local movements to a product's stock. */
export interface PendingMovement {
  product_id: string
  quantity_change: number
}

/**
 * Stock shown on this device = last stock pulled from the server + movements
 * made on this device that the server has not reflected yet. Confirmed
 * movements are deleted in the same transaction that writes the next pulled
 * stock, so a movement is never counted twice or dropped.
 */
export function withLocalStock<P extends Pick<Product, 'id' | 'stock_quantity'>>(
  products: readonly P[],
  pending: readonly PendingMovement[],
): P[] {
  if (pending.length === 0) return [...products]
  const delta = new Map<string, number>()
  for (const m of pending) delta.set(m.product_id, (delta.get(m.product_id) ?? 0) + m.quantity_change)
  return products.map((p) => {
    const d = delta.get(p.id)
    return d ? { ...p, stock_quantity: p.stock_quantity + d } : p
  })
}

export function isLowStock(p: Pick<Product, 'stock_quantity' | 'low_stock_threshold'>): boolean {
  return p.low_stock_threshold > 0 && p.stock_quantity <= p.low_stock_threshold
}

export function sortProducts<P extends Pick<Product, 'sort_order' | 'name'>>(products: readonly P[]): P[] {
  return [...products].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}
