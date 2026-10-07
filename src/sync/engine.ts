// Sync engine: keeps IndexedDB in step with Supabase.
//   1. push: send outbox entries strictly in FIFO order via idempotent RPCs
//   2. pull: settings, products (stock) and recent orders into IndexedDB
// Runs on start, when the connection returns, on realtime events, after local
// actions, and on a timer. Never blocks the UI; failures only change the pill.
import { useSyncExternalStore } from 'react'
import { db, getMeta, setMeta, type OutboxEntry } from '../db/local'
import { errorMessage, isNetworkError, supabase } from '../lib/supabase'
import { businessDate } from '../lib/time'
import type { BusinessSettings, Order, OrderItem, Product } from '../lib/types'

export type SyncPhase = 'idle' | 'syncing' | 'error'

export interface SyncState {
  phase: SyncPhase
  lastError: string | null
  lastSyncAt: string | null
}

let state: SyncState = { phase: 'idle', lastError: null, lastSyncAt: null }
const listeners = new Set<() => void>()

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

/** Errors worth retrying later (no signal, expired token while offline, server busy). */
export function isTransientError(error: unknown): boolean {
  return isNetworkError(error) || /jwt|timeout|timed out|\b(429|502|503|504)\b/i.test(errorMessage(error))
}

class SyncRejectedError extends Error {}

// ------------------------------------------------------------------ push
const RPC: Record<OutboxEntry['type'], (p: Record<string, unknown>) => [string, Record<string, unknown>]> = {
  sync_order: (p) => ['sync_order', { p_order: p }],
  mark_change_given: (p) => ['mark_change_given', p],
  set_grill_status: (p) => ['set_grill_status', p],
  cancel_order: (p) => ['cancel_order', p],
  record_stock_movement: (p) => ['record_stock_movement', { p }],
  set_product_sold_out: (p) => ['set_product_sold_out', p],
}

/** Movement ids an outbox entry carries, so they can be marked confirmed. */
function movementIdsOf(entry: OutboxEntry): string[] {
  const p = entry.payload
  switch (entry.type) {
    case 'sync_order':
      return ((p.items as { movement_id: string }[] | undefined) ?? []).map((i) => i.movement_id)
    case 'cancel_order':
      return Object.values((p.p_movement_ids as Record<string, string> | undefined) ?? {})
    case 'record_stock_movement':
      return [String(p.id)]
    default:
      return []
  }
}

async function acknowledge(entry: OutboxEntry, result: unknown): Promise<void> {
  const ids = movementIdsOf(entry)
  const alreadyCancelled = entry.type === 'cancel_order' && (result as { result?: string } | null)?.result === 'already_cancelled'
  await db.transaction('rw', db.outbox, db.movements, async () => {
    await db.outbox.delete(entry.seq!)
    if (ids.length === 0) return
    if (alreadyCancelled) {
      // Another device returned the stock first; ours must not count.
      await db.movements.bulkDelete(ids)
    } else {
      await db.movements.where('id').anyOf(ids).modify({ confirmed: 1 })
    }
  })
}

/** Sends the outbox in order. Stops at the first failure so order is never violated. */
export async function pushOutbox(): Promise<void> {
  for (;;) {
    const entry = await db.outbox.orderBy('seq').first()
    if (!entry) return
    const [fn, args] = RPC[entry.type](entry.payload)
    const { data, error } = await supabase.rpc(fn, args)
    if (error) {
      if (isTransientError(error)) throw error
      const message = `${entry.type}: ${errorMessage(error)}`
      await db.outbox.update(entry.seq!, { status: 'error', attempts: entry.attempts + 1, last_error: message })
      throw new SyncRejectedError(message)
    }
    await acknowledge(entry, data)
  }
}

// ------------------------------------------------------------------ pull
const PRODUCT_COLUMNS =
  'id,name,selling_price,unit_cost,stock_quantity,low_stock_threshold,is_active,is_sold_out,sort_order,created_at,updated_at'

export async function pullProducts(): Promise<void> {
  const { data, error } = await supabase.from('products').select(PRODUCT_COLUMNS)
  if (error) throw error
  const rows = (data ?? []) as Product[]
  await db.transaction('rw', db.products, db.movements, db.outbox, async () => {
    // A sold-out toggle still waiting in the outbox wins over the server copy.
    const pending = new Map<string, boolean>()
    await db.outbox.each((e) => {
      if (e.type === 'set_product_sold_out') pending.set(e.ref, Boolean(e.payload.p_sold_out))
    })
    const ids = new Set(rows.map((r) => r.id))
    const stale = (await db.products.toCollection().primaryKeys()).filter((id) => !ids.has(id))
    await db.products.bulkDelete(stale)
    await db.products.bulkPut(rows.map((r) => (pending.has(r.id) ? { ...r, is_sold_out: pending.get(r.id)! } : r)))
    // Movements the server confirmed before this pull are now inside
    // stock_quantity; drop them so they are not applied twice.
    await db.movements.where('confirmed').equals(1).delete()
  })
}

export async function pullSettings(): Promise<void> {
  const { data, error } = await supabase
    .from('settings')
    .select('business_name,business_address,business_phone')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  if (data) await setMeta('settings', data as BusinessSettings)
}

export const ORDER_COLUMNS =
  'id,order_ref,order_number,business_date,customer_token_number,status,total,payment_method,payment_reference,' +
  'amount_received,change_due,change_given,change_given_at,change_given_by,grill_status,grill_started_at,grill_done_at,' +
  'device_id,created_by,created_at,cancelled_at,cancelled_by,cancellation_reason,updated_at,' +
  'order_items(id,product_id,product_name_snapshot,quantity,unit_price,unit_cost,line_total)'

export type OrderRow = Omit<Order, 'items'> & { updated_at: string; order_items: Omit<OrderItem, 'movement_id'>[] }

const PAGE = 500
/** Re-read this far behind the cursor: a row committed late can carry an older updated_at. */
const CURSOR_OVERLAP_MS = 2 * 60_000

export function toLocalOrder(row: OrderRow): Order {
  const { order_items, updated_at: _updatedAt, ...order } = row
  void _updatedAt
  return { ...order, items: order_items.map((i) => ({ ...i, movement_id: '' })) }
}

/** Oldest business date kept locally (yesterday, Manila). */
export function keepFromDate(now: Date = new Date()): string {
  return businessDate(new Date(now.getTime() - 24 * 60 * 60_000))
}

export async function pullOrders(): Promise<void> {
  const keepFrom = keepFromDate()
  let cursor = await getMeta('ordersCursor')
  for (;;) {
    let query = supabase.from('orders').select(ORDER_COLUMNS).order('updated_at').limit(PAGE)
    query = cursor
      ? query.gt('updated_at', new Date(Date.parse(cursor) - CURSOR_OVERLAP_MS).toISOString())
      : query.or(`business_date.gte.${keepFrom},and(status.eq.completed,change_given.is.false)`)
    const { data, error } = await query
    if (error) throw error
    const rows = (data ?? []) as unknown as OrderRow[]
    if (rows.length === 0) break

    const newest = rows[rows.length - 1]!.updated_at
    await db.transaction('rw', db.orders, db.outbox, db.meta, async () => {
      // Orders with local changes still queued are ahead of the server: keep ours.
      const pendingRefs = new Set(await db.outbox.orderBy('ref').uniqueKeys())
      const incoming = rows.filter((r) => !pendingRefs.has(r.id)).map(toLocalOrder)
      // Keep the movement ids of orders created on this device.
      const existing = await db.orders.bulkGet(incoming.map((o) => o.id))
      incoming.forEach((o, i) => {
        const local = existing[i]
        if (local) o.items = o.items.map((it) => ({ ...it, movement_id: local.items.find((l) => l.id === it.id)?.movement_id ?? '' }))
      })
      await db.orders.bulkPut(incoming)
      await setMeta('ordersCursor', newest)
    })
    // A full page means there may be more; stop if the cursor did not move.
    if (rows.length < PAGE || newest === cursor) break
    cursor = newest
  }
  await pruneOrders(keepFrom)
}

/** Drops old, settled, fully-synced orders. Pending-change orders are always kept. */
export async function pruneOrders(keepFrom: string): Promise<void> {
  await db.transaction('rw', db.orders, db.outbox, async () => {
    const pendingRefs = new Set(await db.outbox.orderBy('ref').uniqueKeys())
    await db.orders
      .where('business_date')
      .below(keepFrom)
      .filter((o) => !pendingRefs.has(o.id) && (o.change_given || o.status === 'cancelled') && o.grill_status !== 'new' && o.grill_status !== 'grilling')
      .delete()
  })
}

// ------------------------------------------------------------------ loop
let running: Promise<void> | null = null
let rerun = false

/** Runs one sync pass. Concurrent calls coalesce into at most one follow-up pass. */
export function syncNow(): Promise<void> {
  if (running) {
    rerun = true
    return running
  }
  running = (async () => {
    do {
      rerun = false
      if (!navigator.onLine) {
        setState({ phase: 'idle' })
        return
      }
      setState({ phase: 'syncing' })
      let rejected: string | null = null
      try {
        try {
          await pushOutbox()
        } catch (err) {
          if (!(err instanceof SyncRejectedError)) throw err
          rejected = err.message // keep pulling so this phone still gets updates
        }
        await pullSettings()
        await pullProducts()
        await pullOrders()
        setState(
          rejected
            ? { phase: 'error', lastError: rejected }
            : { phase: 'idle', lastError: null, lastSyncAt: new Date().toISOString() },
        )
      } catch (err) {
        // A dropped connection is not an error worth alarming the cashier about.
        setState(isTransientError(err) ? { phase: 'idle' } : { phase: 'error', lastError: errorMessage(err) })
      }
    } while (rerun)
  })().finally(() => {
    running = null
  })
  return running
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined

/** Schedules a sync shortly (coalesces bursts of taps / realtime events). */
export function requestSync(delayMs = 250): void {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => void syncNow(), delayMs)
}

let started = false

/** Starts background sync. Returns a stop function. */
export function startSync(): () => void {
  if (started) return () => {}
  started = true

  const onOnline = () => requestSync()
  const onVisible = () => {
    if (document.visibilityState === 'visible') requestSync()
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  // Retries pending sales regularly even if no event fires.
  const timer = setInterval(() => requestSync(), 30_000)

  const channel = supabase
    .channel('pos-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => requestSync())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => requestSync(100))
    .subscribe()

  void syncNow()

  return () => {
    started = false
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
    clearTimeout(debounceTimer)
    void supabase.removeChannel(channel)
  }
}
