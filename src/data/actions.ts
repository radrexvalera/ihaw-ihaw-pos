// Local-first actions. Each one writes IndexedDB AND queues an outbox entry in
// a single Dexie transaction (all or nothing), then nudges the sync engine.
// Nothing here waits for the network.
import { db, type LocalMovement, type OutboxEntry, type OutboxType } from '../db/local'
import { businessDate } from '../lib/time'
import type { Device, GrillStatus, Order } from '../lib/types'
import { validateMovement, type ManualMovementType } from '../inventory/stockLogic'
import { buildSale, syncOrderPayload, type SaleInput } from '../pos/checkout'
import { requestSync } from '../sync/engine'

function outboxEntry(type: OutboxType, ref: string, payload: Record<string, unknown>): OutboxEntry {
  return {
    id: crypto.randomUUID(),
    type,
    ref,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
    last_error: null,
  }
}

/** Next display number (#27) for this device today. Survives app restarts. */
export async function nextOrderNumber(deviceId: string, date: string): Promise<number> {
  let max = 0
  await db.orders
    .where('business_date')
    .equals(date)
    .each((o) => {
      if (o.device_id === deviceId && o.order_number > max) max = o.order_number
    })
  return max + 1
}

export type CompleteSaleInput = Omit<SaleInput, 'businessDate' | 'orderNumber' | 'now' | 'uuid'>

/** Records a completed sale locally: order + SALE movements + outbox, atomically. */
export async function completeSale(input: CompleteSaleInput): Promise<Order> {
  const now = new Date()
  const date = businessDate(now)
  const order = await db.transaction('rw', db.orders, db.movements, db.outbox, async () => {
    const orderNumber = await nextOrderNumber(input.device.id, date)
    const { order, movements } = buildSale({
      ...input,
      businessDate: date,
      orderNumber,
      now,
      uuid: () => crypto.randomUUID(),
    })
    await db.orders.add(order)
    await db.movements.bulkAdd(movements)
    await db.outbox.add(outboxEntry('sync_order', order.id, syncOrderPayload(order)))
    return order
  })
  requestSync()
  return order
}

export async function markChangeGiven(orderId: string, userId: string): Promise<void> {
  const at = new Date().toISOString()
  await db.transaction('rw', db.orders, db.outbox, async () => {
    const order = await db.orders.get(orderId)
    if (!order || order.change_given) return
    await db.orders.update(orderId, { change_given: true, change_given_at: at, change_given_by: userId })
    await db.outbox.add(
      outboxEntry('mark_change_given', orderId, { p_order_id: orderId, p_given_at: at, p_given_by: userId }),
    )
  })
  requestSync()
}

const GRILL_RANK: Record<GrillStatus, number> = { new: 0, grilling: 1, done: 2, cancelled: 3 }

/** Forward-only, same rule as the server. */
export async function setGrillStatus(orderId: string, status: 'grilling' | 'done'): Promise<void> {
  const at = new Date().toISOString()
  await db.transaction('rw', db.orders, db.outbox, async () => {
    const order = await db.orders.get(orderId)
    if (!order || order.status !== 'completed' || GRILL_RANK[status] <= GRILL_RANK[order.grill_status]) return
    await db.orders.update(orderId, {
      grill_status: status,
      grill_started_at: order.grill_started_at ?? at,
      grill_done_at: status === 'done' ? at : order.grill_done_at,
    })
    await db.outbox.add(outboxEntry('set_grill_status', orderId, { p_order_id: orderId, p_status: status, p_at: at }))
  })
  requestSync()
}

/** Admin only (enforced by the server). Keeps the order; returns its stock once. */
export async function cancelOrder(orderId: string, reason: string, userId: string, device: Pick<Device, 'id'>): Promise<void> {
  const trimmed = reason.trim()
  if (!trimmed) throw new Error('A reason is required.')
  const at = new Date().toISOString()
  await db.transaction('rw', db.orders, db.movements, db.outbox, async () => {
    const order = await db.orders.get(orderId)
    if (!order || order.status === 'cancelled') return
    const returns: LocalMovement[] = order.items.map((item) => ({
      id: crypto.randomUUID(),
      product_id: item.product_id,
      quantity_change: item.quantity,
      movement_type: 'CANCELLED_SALE_RETURN',
      reference_id: orderId,
      reason: trimmed,
      created_at: at,
      created_by: userId,
      device_id: device.id,
      confirmed: 0,
    }))
    await db.orders.update(orderId, {
      status: 'cancelled',
      grill_status: 'cancelled',
      cancelled_at: at,
      cancelled_by: userId,
      cancellation_reason: trimmed,
    })
    await db.movements.bulkAdd(returns)
    await db.outbox.add(
      outboxEntry('cancel_order', orderId, {
        p_order_id: orderId,
        p_reason: trimmed,
        p_at: at,
        p_device_id: device.id,
        p_movement_ids: Object.fromEntries(returns.map((m) => [m.product_id, m.id])),
      }),
    )
  })
  requestSync()
}

/** Quick SOLD OUT / AVAILABLE toggle (cashier or admin), works offline. */
export async function setProductSoldOut(productId: string, soldOut: boolean): Promise<void> {
  await db.transaction('rw', db.products, db.outbox, async () => {
    const product = await db.products.get(productId)
    if (!product || product.is_sold_out === soldOut) return
    await db.products.update(productId, { is_sold_out: soldOut })
    await db.outbox.add(
      outboxEntry('set_product_sold_out', productId, { p_product_id: productId, p_sold_out: soldOut }),
    )
  })
  requestSync()
}

/** Opening stock, stock in, or a counted adjustment (admin; enforced by the server). Works offline. */
export async function recordStockMovement(input: {
  productId: string
  type: ManualMovementType
  quantityChange: number
  reason: string | null
  userId: string
  device: Pick<Device, 'id'>
}): Promise<void> {
  const reason = input.reason?.trim() || null
  const problem = validateMovement(input.type, input.quantityChange, reason)
  if (problem) throw new Error(problem)
  const movement: LocalMovement = {
    id: crypto.randomUUID(),
    product_id: input.productId,
    quantity_change: input.quantityChange,
    movement_type: input.type,
    reference_id: null,
    reason,
    created_at: new Date().toISOString(),
    created_by: input.userId,
    device_id: input.device.id,
    confirmed: 0,
  }
  await db.transaction('rw', db.movements, db.outbox, async () => {
    await db.movements.add(movement)
    await db.outbox.add(
      outboxEntry('record_stock_movement', input.productId, {
        id: movement.id,
        product_id: movement.product_id,
        quantity_change: movement.quantity_change,
        movement_type: movement.movement_type,
        reason: movement.reason,
        created_at: movement.created_at,
        device_id: movement.device_id,
      }),
    )
  })
  requestSync()
}
