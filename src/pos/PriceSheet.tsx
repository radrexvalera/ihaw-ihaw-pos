import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../components/Button'
import { Keypad } from '../components/Keypad'
import { Sheet } from '../components/Sheet'
import { db } from '../db/local'
import { applyKey } from '../lib/keypad'
import { formatPeso, type Centavos } from '../lib/money'
import { businessDate } from '../lib/time'
import type { Product } from '../lib/types'

const MAX_CHIPS = 6

/** Prices this product sold at today, most used first (sizes repeat, so this is the fast path). */
function useRecentPrices(productId: string): Centavos[] {
  return useLiveQuery(
    async () => {
      const counts = new Map<Centavos, number>()
      await db.orders
        .where('business_date')
        .equals(businessDate())
        .each((o) => {
          if (o.status !== 'completed') return
          for (const i of o.items) if (i.product_id === productId) counts.set(i.unit_price, (counts.get(i.unit_price) ?? 0) + i.quantity)
        })
      return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([price]) => price)
    },
    [productId],
    [],
  )
}

/** Price pad for "price varies" products: one tap on a known price, or type a new one. */
export function PriceSheet({
  product,
  lastPrice,
  onAdd,
  onClose,
}: {
  product: Product
  lastPrice: Centavos | null
  onAdd: (price: Centavos) => void
  onClose: () => void
}) {
  const recent = useRecentPrices(product.id)
  const [typed, setTyped] = useState('')
  const typedPrice = typed ? Number(typed) * 100 : null

  const chips = [...new Set([lastPrice, product.selling_price || null, ...recent].filter((p): p is Centavos => p !== null && p > 0))]
    .slice(0, MAX_CHIPS)
    .sort((a, b) => a - b)

  return (
    <Sheet
      title={product.name}
      onClose={onClose}
      footer={
        <Button size="xl" block disabled={!typedPrice} onClick={() => typedPrice && onAdd(typedPrice)}>
          {typedPrice ? `Add 1 × ${formatPeso(typedPrice)}` : 'Enter the price'}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-lg font-bold text-stone-600">Price depends on size. Choose or type the price for 1 piece.</p>
        {chips.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {chips.map((price) => (
              <button
                key={price}
                onClick={() => onAdd(price)}
                className={`min-h-16 rounded-xl border-2 text-2xl font-black tabular-nums active:bg-ember-100 ${
                  price === lastPrice ? 'border-ember-600 bg-ember-600 text-white' : 'border-ember-600 bg-ember-50 text-ember-800'
                }`}
              >
                {formatPeso(price)}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-2xl border-2 border-stone-300 bg-white p-3 text-center">
          <p className="text-xs font-extrabold uppercase text-stone-500">Other price</p>
          <p className="text-5xl font-black tabular-nums">{typedPrice ? formatPeso(typedPrice) : '₱—'}</p>
        </div>
        <Keypad onKey={(k) => setTyped((t) => applyKey(t, k, 5))} label="Price keypad" />
      </div>
    </Sheet>
  )
}
