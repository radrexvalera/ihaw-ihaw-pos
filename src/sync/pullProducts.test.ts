import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '../lib/types'

const serverProducts: Product[] = []

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: serverProducts, error: null }) }),
  },
  isNetworkError: () => false,
  errorMessage: (e: unknown) => String(e),
}))

const { db } = await import('../db/local')
const { pullProducts } = await import('./engine')
const { withLocalStock } = await import('../data/stock')

function product(id: string, stock: number): Product {
  return {
    id,
    name: id,
    selling_price: 2500,
    unit_cost: 1400,
    stock_quantity: stock,
    low_stock_threshold: 10,
    is_active: true,
    is_sold_out: false,
    is_variable_price: false,
    sort_order: 10,
    created_at: '2026-10-07T00:00:00Z',
    updated_at: '2026-10-07T00:00:00Z',
  }
}

async function displayedStock(id: string) {
  const [products, movements] = await Promise.all([db.products.toArray(), db.movements.toArray()])
  return withLocalStock(products, movements).find((p) => p.id === id)?.stock_quantity
}

function sale(id: string, qty: number, confirmed: 0 | 1) {
  return {
    id,
    product_id: 'bbq',
    quantity_change: -qty,
    movement_type: 'SALE' as const,
    reference_id: 'order-' + id,
    reason: null,
    created_at: '2026-10-07T10:00:00Z',
    created_by: null,
    device_id: null,
    confirmed,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  serverProducts.length = 0
})

describe('pullProducts', () => {
  it('never counts a confirmed movement twice and keeps unconfirmed ones', async () => {
    // Server had 100; this phone sold 3 (synced) and 2 (still offline-pending).
    await db.products.put(product('bbq', 100))
    await db.movements.bulkPut([sale('m1', 3, 1), sale('m2', 2, 0)])
    expect(await displayedStock('bbq')).toBe(95)

    // Server now reflects the synced sale of 3 → 97.
    serverProducts.push(product('bbq', 97))
    await pullProducts()

    expect(await displayedStock('bbq')).toBe(95)
    expect((await db.movements.toArray()).map((m) => m.id)).toEqual(['m2'])
  })

  it('removes products deleted on the server and is safe to repeat', async () => {
    await db.products.bulkPut([product('bbq', 10), product('gone', 5)])
    serverProducts.push(product('bbq', 10))
    await pullProducts()
    await pullProducts()
    expect(await db.products.toCollection().primaryKeys()).toEqual(['bbq'])
  })
})
