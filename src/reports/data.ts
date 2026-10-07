// Loads report data. Online: the server is the source of truth, plus any of
// this phone's sales not uploaded yet. Offline: this phone's local orders only.
import { db } from '../db/local'
import { supabase } from '../lib/supabase'
import type { InventoryMovement, Order } from '../lib/types'
import { ORDER_COLUMNS, toLocalOrder, type OrderRow } from '../sync/engine'
import { periodInstants, type Period } from './period'

export interface ReportOrders {
  orders: Order[]
  source: 'server' | 'local'
}

const PAGE = 1000

async function localOrders(p: Period): Promise<Order[]> {
  return db.orders.where('business_date').between(p.from, p.to, true, true).toArray()
}

export async function fetchReportOrders(p: Period): Promise<ReportOrders> {
  if (!navigator.onLine) return { orders: await localOrders(p), source: 'local' }

  const server: Order[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_COLUMNS)
      .gte('business_date', p.from)
      .lte('business_date', p.to)
      .order('created_at')
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as unknown as OrderRow[]
    server.push(...rows.map(toLocalOrder))
    if (rows.length < PAGE) break
  }

  // Local versions win for orders with changes still in the outbox (new sales, cancellations).
  const pending = new Set((await db.outbox.orderBy('ref').uniqueKeys()) as string[])
  const local = (await localOrders(p)).filter((o) => pending.has(o.id))
  const byId = new Map(server.map((o) => [o.id, o]))
  for (const o of local) byId.set(o.id, o)
  return { orders: [...byId.values()], source: 'server' }
}

/** Recent ledger entries in the period, across all products (online only). */
export async function fetchPeriodMovements(p: Period, limit = 300): Promise<InventoryMovement[]> {
  const { start, end } = periodInstants(p)
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('id,product_id,quantity_change,movement_type,reference_id,reason,created_at,created_by,device_id')
    .gte('created_at', start)
    .lt('created_at', end)
    .neq('movement_type', 'SALE')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as InventoryMovement[]
}
