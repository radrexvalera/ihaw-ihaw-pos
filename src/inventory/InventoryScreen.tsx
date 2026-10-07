import { ChevronRight, Package } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, Spinner } from '../components/Feedback'
import { isLowStock } from '../data/stock'
import { useProducts } from '../data/useProducts'
import type { Product } from '../lib/types'
import { StockSheet } from './StockSheet'

type Filter = 'all' | 'low' | 'soldout'

/** Current stock per sellable product, with low-stock and sold-out at a glance. */
export function InventoryScreen() {
  const products = useProducts()
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  if (!products) return <Spinner />
  const active = products.filter((p) => p.is_active)
  if (active.length === 0) {
    return (
      <EmptyState icon={Package} title="No products yet">
        The owner can add products in Menu → Products.
      </EmptyState>
    )
  }

  const low = active.filter((p) => isLowStock(p) || p.stock_quantity < 0)
  const soldOut = active.filter((p) => p.is_sold_out)
  const shown = filter === 'low' ? low : filter === 'soldout' ? soldOut : active

  const tabs: { id: Filter; label: string; count: number; tone: string }[] = [
    { id: 'all', label: 'All', count: active.length, tone: 'text-stone-900' },
    { id: 'low', label: 'Low stock', count: low.length, tone: low.length ? 'text-amber-700' : 'text-stone-400' },
    { id: 'soldout', label: 'Sold out', count: soldOut.length, tone: soldOut.length ? 'text-red-700' : 'text-stone-400' },
  ]

  return (
    <div className="pb-4">
      <div className="grid grid-cols-3 gap-2 border-b border-stone-200 bg-white p-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={filter === t.id}
            onClick={() => setFilter(t.id)}
            className={`flex min-h-16 flex-col items-center justify-center rounded-xl border-2 ${filter === t.id ? 'border-char bg-stone-100' : 'border-transparent'}`}
          >
            <span className={`text-2xl font-black tabular-nums ${t.tone}`}>{t.count}</span>
            <span className="text-xs font-extrabold uppercase text-stone-600">{t.label}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={Package} title={filter === 'low' ? 'Nothing is low' : 'Nothing is sold out'} />
      ) : (
        <ul className="mx-auto max-w-3xl divide-y divide-stone-200 bg-white">
          {shown.map((p) => (
            <StockRow key={p.id} product={p} onOpen={() => setOpenId(p.id)} />
          ))}
        </ul>
      )}

      {openId && <StockSheet productId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function StockRow({ product: p, onOpen }: { product: Product; onOpen: () => void }) {
  const low = isLowStock(p)
  return (
    <li>
      <button onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left active:bg-stone-100">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold uppercase">{p.name}</span>
          <span className="flex gap-2 text-xs font-extrabold uppercase">
            {p.is_sold_out && <span className="rounded bg-stone-800 px-1.5 py-0.5 text-white">Sold out</span>}
            {low && p.stock_quantity >= 0 && <span className="rounded bg-amber-500 px-1.5 py-0.5 text-black">Low stock</span>}
            {p.stock_quantity < 0 && <span className="rounded bg-red-600 px-1.5 py-0.5 text-white">Recount</span>}
          </span>
        </span>
        <span className={`text-2xl font-extrabold tabular-nums ${p.stock_quantity <= 0 ? 'text-red-600' : low ? 'text-amber-700' : ''}`}>
          {p.stock_quantity}
          <span className="ml-1 text-sm font-bold text-stone-500">pcs</span>
        </span>
        <ChevronRight className="size-5 text-stone-400" />
      </button>
    </li>
  )
}
