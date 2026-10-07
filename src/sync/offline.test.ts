// Offline-first behaviour: local sale creation, outbox, retries and duplicate
// prevention — with a scripted Supabase standing in for the network.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '../lib/types'

type RpcResult = { data: unknown; error: { message: string; code?: string } | null }
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
let rpcScript: ((fn: string, args: Record<string, unknown>) => RpcResult) | null = null
let serverProducts: Product[] = []

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return rpcScript ? rpcScript(fn, args) : { data: { result: 'created' }, error: null }
    },
    from: () => ({ select: async () => ({ data: serverProducts, error: null }) }),
  },
  isNetworkError: (e: unknown) => /fetch/i.test(String((e as { message?: string })?.message ?? e)),
  errorMessage: (e: unknown) => String((e as { message?: string })?.message ?? e),
}))

vi.mock('./engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./engine')>()),
  requestSync: vi.fn(),
}))

const { db } = await import('../db/local')
const { completeSale, markChangeGiven, cancelOrder, setGrillStatus, setProductSoldOut, recordStockMovement } = await import('../data/actions')
const { pushOutbox, pullProducts } = await import('./engine')
const { withLocalStock } = await import('../data/stock')

const device = { id: 'dev-1', device_code: 'POS01' }
const USER = 'user-1'

function product(id: string, price: number, stock: number): Product {
  return {
    id,
    name: id.toUpperCase(),
    selling_price: price,
    unit_cost: 1000,
    stock_quantity: stock,
    low_stock_threshold: 5,
    is_active: true,
    is_sold_out: false,
    is_variable_price: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  }
}

function line(p: Product, quantity: number) {
  return { line_key: p.id, variable_price: false, product_id: p.id, name: p.name, unit_price: p.selling_price, unit_cost: p.unit_cost, quantity }
}

const bbq = product('bbq', 2500, 100)
const isaw = product('isaw', 1000, 40)

async function stock(id: string) {
  const [products, movements] = await Promise.all([db.products.toArray(), db.movements.toArray()])
  return withLocalStock(products, movements).find((p) => p.id === id)!.stock_quantity
}

function sell(received = 50000, items = [line(bbq, 3), line(isaw, 2)]) {
  return completeSale({
    cart: items,
    paymentMethod: 'cash',
    amountReceived: received,
    paymentReference: null,
    customerToken: null,
    device,
    userId: USER,
  })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.products.bulkPut([bbq, isaw])
  serverProducts = [bbq, isaw]
  rpcCalls.length = 0
  rpcScript = null
})

describe('offline sale', () => {
  it('records order, stock deduction and outbox entry with no network', async () => {
    const order = await sell()
    expect(order.change_due).toBe(40500) // 500 - 95
    expect(order.change_given).toBe(false)
    expect(await db.orders.count()).toBe(1)
    expect(await stock('bbq')).toBe(97)
    expect(await stock('isaw')).toBe(38)
    const outbox = await db.outbox.toArray()
    expect(outbox.map((e) => [e.type, e.ref])).toEqual([['sync_order', order.id]])
    expect(rpcCalls).toHaveLength(0)
  })

  it('numbers orders #1, #2, #3 per device per day', async () => {
    const numbers = [(await sell()).order_number, (await sell()).order_number, (await sell()).order_number]
    expect(numbers).toEqual([1, 2, 3])
  })

  it('mark change given is local, queued once, and idempotent', async () => {
    const order = await sell()
    await markChangeGiven(order.id, USER)
    await markChangeGiven(order.id, USER)
    const saved = await db.orders.get(order.id)
    expect(saved).toMatchObject({ change_given: true, change_given_by: USER })
    expect((await db.outbox.toArray()).map((e) => e.type)).toEqual(['sync_order', 'mark_change_given'])
  })

  it('grill status only moves forward', async () => {
    const order = await sell()
    await setGrillStatus(order.id, 'done')
    await setGrillStatus(order.id, 'grilling')
    expect((await db.orders.get(order.id))!.grill_status).toBe('done')
    const grillEntries = (await db.outbox.toArray()).filter((e) => e.type === 'set_grill_status')
    expect(grillEntries.map((e) => e.payload.p_status)).toEqual(['done'])
  })

  it('cancelling returns stock exactly once', async () => {
    const order = await sell()
    await cancelOrder(order.id, 'Customer left', USER, device)
    await cancelOrder(order.id, 'Customer left', USER, device)
    expect(await stock('bbq')).toBe(100)
    expect((await db.orders.get(order.id))!.status).toBe('cancelled')
    await expect(cancelOrder(order.id, '  ', USER, device)).rejects.toThrow(/reason/)
  })

  it('sold-out toggle survives a pull until it is synced', async () => {
    await setProductSoldOut('bbq', true)
    await pullProducts() // server still says available
    expect((await db.products.get('bbq'))!.is_sold_out).toBe(true)
  })
})

describe('outbox push', () => {
  it('sends entries in FIFO order and confirms movements without double counting', async () => {
    const order = await sell()
    await markChangeGiven(order.id, USER)
    await pushOutbox()
    expect(rpcCalls.map((c) => c.fn)).toEqual(['sync_order', 'mark_change_given'])
    expect(await db.outbox.count()).toBe(0)
    expect(await stock('bbq')).toBe(97) // still 97 before the pull

    serverProducts = [product('bbq', 2500, 97), product('isaw', 1000, 38)]
    await pullProducts()
    expect(await db.movements.count()).toBe(0)
    expect(await stock('bbq')).toBe(97)
  })

  it('a duplicate response (retry after a lost ack) counts as success', async () => {
    await sell()
    rpcScript = () => ({ data: { result: 'duplicate' }, error: null })
    await pushOutbox()
    expect(await db.outbox.count()).toBe(0)
  })

  it('keeps everything queued when the network drops, then retries the same ids', async () => {
    const order = await sell()
    rpcScript = () => ({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    await expect(pushOutbox()).rejects.toThrow(/fetch/)
    expect(await db.outbox.count()).toBe(1)

    rpcScript = null
    await pushOutbox()
    const sent = rpcCalls.map((c) => (c.args.p_order as { id: string }).id)
    expect(sent).toEqual([order.id, order.id]) // same UUID both times → server dedupes
    expect(await db.outbox.count()).toBe(0)
  })

  it('a server rejection is marked as an error and blocks later entries (order kept)', async () => {
    const order = await sell()
    await markChangeGiven(order.id, USER)
    rpcScript = (fn) =>
      fn === 'sync_order' ? { data: null, error: { message: 'Order total does not match', code: 'P0001' } } : { data: {}, error: null }
    await expect(pushOutbox()).rejects.toThrow(/does not match/)
    expect(rpcCalls.map((c) => c.fn)).toEqual(['sync_order'])
    const [first, second] = await db.outbox.orderBy('seq').toArray()
    expect(first).toMatchObject({ status: 'error', attempts: 1 })
    expect(second).toMatchObject({ status: 'pending' })
  })

  it('drops local return movements when another device already cancelled', async () => {
    const order = await sell()
    await pushOutbox()
    await cancelOrder(order.id, 'Wrong order', USER, device)
    rpcScript = () => ({ data: { result: 'already_cancelled' }, error: null })
    await pushOutbox()
    const returns = (await db.movements.toArray()).filter((m) => m.movement_type === 'CANCELLED_SALE_RETURN')
    expect(returns).toEqual([])
  })
})

describe('stock movements', () => {
  const move = (type: 'STOCK_IN' | 'OPENING' | 'ADJUSTMENT_PLUS' | 'ADJUSTMENT_MINUS', quantityChange: number, reason: string | null = null) =>
    recordStockMovement({ productId: 'bbq', type, quantityChange, reason, userId: USER, device })

  it('stock in and a count adjustment apply offline and sync once', async () => {
    await move('STOCK_IN', 50) // 100 → 150
    await sell(50000, [line(bbq, 3)]) // → 147
    await move('ADJUSTMENT_MINUS', -2, 'Damaged') // counted 145
    expect(await stock('bbq')).toBe(145)

    await pushOutbox()
    const stockCall = rpcCalls.find((c) => c.fn === 'record_stock_movement')!
    expect(stockCall.args.p).toMatchObject({ product_id: 'bbq', quantity_change: 50, movement_type: 'STOCK_IN' })

    serverProducts = [product('bbq', 2500, 145), isaw]
    await pullProducts()
    expect(await db.movements.count()).toBe(0)
    expect(await stock('bbq')).toBe(145)
  })

  it('rejects invalid movements before they reach the outbox', async () => {
    await expect(move('ADJUSTMENT_MINUS', -2, null)).rejects.toThrow(/reason/)
    await expect(move('STOCK_IN', -5)).rejects.toThrow(/sign/)
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('price varies offline', () => {
  it('two sizes deduct and return stock once per product', async () => {
    const pitso = { ...product('pitso', 0, 20), is_variable_price: true }
    await db.products.put(pitso)
    const sizes = [
      { ...line(pitso, 1), line_key: 'pitso@9000', variable_price: true, unit_price: 9000 },
      { ...line(pitso, 2), line_key: 'pitso@13000', variable_price: true, unit_price: 13000 },
    ]
    const order = await sell(50000, sizes)
    expect(await stock('pitso')).toBe(17)
    expect(await db.movements.count()).toBe(1)
    await cancelOrder(order.id, 'Wrong size', USER, device)
    expect(await stock('pitso')).toBe(20)
    const cancel = (await db.outbox.toArray()).find((e) => e.type === 'cancel_order')!
    expect(Object.keys(cancel.payload.p_movement_ids as object)).toEqual(['pitso'])
  })
})
