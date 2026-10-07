import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import { sumCentavos } from '../lib/money'
import type { Order } from '../lib/types'

export function isChangePending(o: Pick<Order, 'status' | 'change_given' | 'change_due'>): boolean {
  return o.status === 'completed' && !o.change_given && o.change_due > 0
}

/** Orders still owed change, oldest first (the customer waiting longest is on top). */
export function usePendingChange(): { orders: Order[]; total: number } | undefined {
  return useLiveQuery(async () => {
    const orders = (await db.orders.orderBy('created_at').toArray()).filter(isChangePending)
    return { orders, total: sumCentavos(orders.map((o) => o.change_due)) }
  })
}

/** All local orders, newest first. */
export function useAllOrders(): Order[] | undefined {
  return useLiveQuery(() => db.orders.orderBy('created_at').reverse().toArray())
}

export function useOrder(id: string | null): Order | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.orders.get(id)) ?? null) : null), [id])
}

/** Ids of orders/products with changes not yet accepted by the server. */
export function useUnsyncedRefs(): Set<string> {
  return useLiveQuery(async () => new Set((await db.outbox.orderBy('ref').uniqueKeys()) as string[]), [], new Set<string>())
}
