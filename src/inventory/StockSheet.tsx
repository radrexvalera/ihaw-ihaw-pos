import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardCheck, CloudOff, PackagePlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { can, useProfile } from '../auth/context'
import { Button } from '../components/Button'
import { Notice, Spinner } from '../components/Feedback'
import { Sheet } from '../components/Sheet'
import { setProductSoldOut } from '../data/actions'
import { fetchMovements } from '../data/inventory'
import { isLowStock } from '../data/stock'
import { useProducts } from '../data/useProducts'
import { db } from '../db/local'
import { formatPeso } from '../lib/money'
import { errorMessage } from '../lib/supabase'
import { formatDateTime } from '../lib/time'
import type { InventoryMovement } from '../lib/types'
import { useOnline } from '../lib/useOnline'
import { StockEntrySheet, type StockEntryMode } from './StockEntrySheet'
import { MOVEMENT_LABEL } from './stockLogic'

export function StockSheet({ productId, onClose }: { productId: string; onClose: () => void }) {
  const product = useProducts()?.find((p) => p.id === productId)
  const profile = useProfile()
  const isAdmin = can(profile.role, 'manage')
  const [entry, setEntry] = useState<StockEntryMode | null>(null)

  if (!product) return null
  const low = isLowStock(product)

  return (
    <Sheet title={product.name} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4 text-center">
          <p className="text-sm font-extrabold uppercase text-stone-500">Current stock</p>
          <p className={`text-7xl font-black tabular-nums ${product.stock_quantity <= 0 ? 'text-red-600' : low ? 'text-amber-600' : ''}`}>
            {product.stock_quantity}
          </p>
          <p className="text-stone-600">
            pcs · low alert at {product.low_stock_threshold} · value {formatPeso(Math.max(0, product.stock_quantity) * product.unit_cost)} at cost
          </p>
          {product.stock_quantity < 0 && (
            <p className="mt-2 font-bold text-red-700">Below zero — more was sold than recorded. Count the stock and correct it.</p>
          )}
        </div>

        {isAdmin && (
          <div className="grid grid-cols-2 gap-2">
            <Button size="xl" onClick={() => setEntry('add')}>
              <PackagePlus className="size-6" /> Add stock
            </Button>
            <Button size="xl" variant="secondary" onClick={() => setEntry('count')}>
              <ClipboardCheck className="size-6" /> Count
            </Button>
          </div>
        )}

        <Button
          size="lg"
          block
          variant={product.is_sold_out ? 'success' : 'secondary'}
          onClick={() => void setProductSoldOut(product.id, !product.is_sold_out)}
        >
          {product.is_sold_out ? 'Mark available' : 'Mark sold out'}
        </Button>

        <History productId={product.id} />
      </div>
      {entry && <StockEntrySheet product={product} mode={entry} onClose={() => setEntry(null)} />}
    </Sheet>
  )
}

function History({ productId }: { productId: string }) {
  const online = useOnline()
  const local = useLiveQuery(() => db.movements.where('product_id').equals(productId).toArray(), [productId], [])
  const orderNumbers = useLiveQuery(async () => new Map((await db.orders.toArray()).map((o) => [o.id, o.order_number])), [], new Map<string, number>())
  const [server, setServer] = useState<InventoryMovement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Re-fetch when local movements get confirmed (they then appear server-side).
  const localKey = local.map((m) => m.id + m.confirmed).join()

  useEffect(() => {
    if (!online) return
    let active = true
    fetchMovements(productId)
      .then((rows) => {
        if (!active) return
        setServer(rows)
        setError(null)
      })
      .catch((err: unknown) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [online, productId, localKey])

  const serverIds = new Set(server?.map((m) => m.id))
  const unsynced = local.filter((m) => !serverIds.has(m.id)).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const rows = [...unsynced.map((m) => ({ ...m, unsynced: true })), ...(server ?? []).map((m) => ({ ...m, unsynced: false }))]

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-extrabold uppercase tracking-wide text-stone-600">Stock movements</h3>
      {!online && <Notice tone="info">Offline — showing only changes made on this phone.</Notice>}
      {error && <Notice>{error}</Notice>}
      {online && !server && !error && <Spinner />}
      {rows.length === 0 && (server || !online) ? (
        <p className="py-4 text-center text-stone-500">No movements yet.</p>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white">
          {rows.map((m) => {
            const orderNo = m.reference_id ? orderNumbers.get(m.reference_id) : undefined
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {MOVEMENT_LABEL[m.movement_type]}
                    {orderNo !== undefined && <span className="ml-1 text-stone-500">#{orderNo}</span>}
                    {m.unsynced && <CloudOff className="ml-2 inline size-4 text-amber-600" aria-label="Not yet synced" />}
                  </p>
                  <p className="truncate text-sm text-stone-500">
                    {formatDateTime(m.created_at)}
                    {m.reason && m.movement_type !== 'SALE' ? ` · ${m.reason}` : ''}
                  </p>
                </div>
                <p className={`text-2xl font-black tabular-nums ${m.quantity_change < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {m.quantity_change > 0 ? '+' : ''}
                  {m.quantity_change}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
