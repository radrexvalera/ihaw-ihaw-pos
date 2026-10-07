// Local IndexedDB store. The UI reads ONLY from here (via useLiveQuery), so
// every screen works without a network. The sync engine keeps it in step
// with Supabase.
import Dexie, { type EntityTable } from 'dexie'
import type { BusinessSettings, Device, InventoryMovement, Order, Product, Profile } from '../lib/types'

export type OutboxType =
  | 'sync_order'
  | 'mark_change_given'
  | 'set_grill_status'
  | 'cancel_order'
  | 'record_stock_movement'
  | 'set_product_sold_out'

/** A queued server call. Processed strictly in `seq` order; every call is idempotent. */
export interface OutboxEntry {
  seq?: number
  id: string
  type: OutboxType
  /** Id of the order / product this entry affects (for "is this synced?" checks). */
  ref: string
  payload: Record<string, unknown>
  created_at: string
  attempts: number
  status: 'pending' | 'error'
  last_error: string | null
}

/** A stock movement made on this device that the server has not confirmed yet. */
export interface LocalMovement extends InventoryMovement {
  /** Set once the server accepted it; deleted on the next products pull. */
  confirmed: 0 | 1
}

export interface MetaMap {
  device: Device
  profile: Profile
  settings: BusinessSettings
  /** Server updated_at of the newest order pulled (incremental order pulls). */
  ordersCursor: string
}
export type MetaKey = keyof MetaMap

interface MetaRow {
  key: MetaKey
  value: unknown
}

export class LocalDb extends Dexie {
  products!: EntityTable<Product, 'id'>
  orders!: EntityTable<Order, 'id'>
  movements!: EntityTable<LocalMovement, 'id'>
  outbox!: EntityTable<OutboxEntry, 'seq'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'ihaw-pos') {
    super(name)
    this.version(1).stores({
      products: 'id, sort_order',
      orders: 'id, created_at, business_date, status, grill_status',
      movements: 'id, product_id, confirmed',
      outbox: '++seq, id, status',
      meta: 'key',
    })
    this.version(2).stores({
      outbox: '++seq, id, status, ref',
    })
  }
}

export const db = new LocalDb()

export async function getMeta<K extends MetaKey>(key: K): Promise<MetaMap[K] | undefined> {
  const row = await db.meta.get(key)
  return row?.value as MetaMap[K] | undefined
}

export async function setMeta<K extends MetaKey>(key: K, value: MetaMap[K]): Promise<void> {
  await db.meta.put({ key, value })
}

export async function deleteMeta(key: MetaKey): Promise<void> {
  await db.meta.delete(key)
}
