import { ArrowDown, ArrowUp, Package, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { EmptyState, Notice, Spinner } from '../../components/Feedback'
import { Sheet } from '../../components/Sheet'
import { saveProductOrder } from '../../data/admin'
import { useProducts } from '../../data/useProducts'
import { formatPeso } from '../../lib/money'
import { errorMessage } from '../../lib/supabase'
import type { Product } from '../../lib/types'
import { useOnline } from '../../lib/useOnline'
import { ProductForm } from './ProductForm'

export function ProductsAdmin({ onBack }: { onBack: () => void }) {
  const products = useProducts()
  const online = useOnline()
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (editing) {
    return (
      <ProductForm
        product={editing === 'new' ? null : editing}
        nextSortOrder={((products ?? []).reduce((m, p) => Math.max(m, p.sort_order), 0) || 0) + 10}
        onDone={() => setEditing(null)}
      />
    )
  }

  async function move(index: number, delta: -1 | 1) {
    if (!products) return
    const ids = products.map((p) => p.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    setMoving(true)
    setError(null)
    try {
      await saveProductOrder(ids)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setMoving(false)
    }
  }

  return (
    <Sheet
      title="Products"
      closeStyle="back"
      onClose={onBack}
      footer={
        <Button block size="xl" disabled={!online} onClick={() => setEditing('new')}>
          <Plus className="size-6" /> Add product
        </Button>
      }
    >
      <div className="space-y-3">
        {!online && <Notice tone="info">Offline — products can be viewed but changes need internet.</Notice>}
        {error && <Notice>{error}</Notice>}
        {!products ? (
          <Spinner />
        ) : products.length === 0 ? (
          <EmptyState icon={Package} title="No products yet">
            Tap “Add product”.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {products.map((p, i) => {
              const profit = p.selling_price - p.unit_cost
              return (
                <li key={p.id} className={`flex items-stretch gap-1 rounded-2xl bg-white ${p.is_active ? '' : 'opacity-60'}`}>
                  <button onClick={() => setEditing(p)} className="min-w-0 flex-1 rounded-l-2xl p-3 text-left active:bg-stone-100">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-lg font-extrabold uppercase">{p.name}</span>
                      {!p.is_active && <Badge className="bg-stone-500 text-white">Disabled</Badge>}
                      {p.is_sold_out && <Badge className="bg-stone-800 text-white">Sold out</Badge>}
                      {p.unit_cost === 0 && <Badge className="bg-amber-400 text-black">No cost</Badge>}
                      {p.selling_price === 0 && <Badge className="bg-red-600 text-white">No price</Badge>}
                    </span>
                    <span className="mt-1 grid grid-cols-3 gap-2 text-sm">
                      <Stat label="Price" value={formatPeso(p.selling_price)} />
                      <Stat label="Cost" value={formatPeso(p.unit_cost)} />
                      <Stat label="Profit/pc" value={formatPeso(profit)} warn={profit < 0} />
                    </span>
                  </button>
                  <span className="flex flex-col border-l border-stone-100">
                    <IconButton label={`Move ${p.name} up`} disabled={moving || !online || i === 0} onClick={() => void move(i, -1)}>
                      <ArrowUp className="size-6" />
                    </IconButton>
                    <IconButton
                      label={`Move ${p.name} down`}
                      disabled={moving || !online || i === products.length - 1}
                      onClick={() => void move(i, 1)}
                    >
                      <ArrowDown className="size-6" />
                    </IconButton>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Sheet>
  )
}

function Badge({ className, children }: { className: string; children: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-extrabold uppercase ${className}`}>{children}</span>
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <span>
      <span className="block text-xs font-bold uppercase text-stone-500">{label}</span>
      <span className={`block font-bold tabular-nums ${warn ? 'text-red-600' : ''}`}>{value}</span>
    </span>
  )
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex w-14 flex-1 items-center justify-center text-stone-700 active:bg-stone-100 disabled:text-stone-300"
    >
      {children}
    </button>
  )
}
