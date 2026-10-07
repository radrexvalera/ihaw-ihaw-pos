import { Minus, Plus } from 'lucide-react'
import { useRef } from 'react'
import { isLowStock } from '../data/stock'
import { formatPeso } from '../lib/money'
import type { Product } from '../lib/types'
import { useLongPress } from '../lib/useLongPress'
import { canSell } from './cart'
import { tileAction } from './tileTap'

interface Props {
  product: Product
  quantityInCart: number
  onAdd: () => void
  onRemove: () => void
  onLongPress: () => void
}

/** Tap adds; once in the order the left half removes one and the right half adds one. */
export function ProductTile({ product: p, quantityInCart, onAdd, onRemove, onLongPress }: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const sellable = canSell(p)
  const press = useLongPress((point) => {
    const action = tileAction(point, ref.current?.getBoundingClientRect() ?? null, quantityInCart, sellable)
    if (action === 'add') onAdd()
    else if (action === 'remove') onRemove()
  }, onLongPress)
  const low = isLowStock(p)
  const inCart = quantityInCart > 0 && sellable

  return (
    <button
      ref={ref}
      type="button"
      {...press}
      aria-disabled={!sellable}
      aria-label={`${p.name}, ${formatPeso(p.selling_price)}${p.is_sold_out ? ', sold out' : ''}${
        inCart ? `, ${quantityInCart} in order. Tap left side to remove one, right side to add one` : ''
      }`}
      className={`relative flex min-h-24 select-none flex-col justify-between rounded-2xl border-2 p-3 text-left transition-transform active:scale-[0.98] ${
        !sellable
          ? 'border-stone-300 bg-stone-200 text-stone-500'
          : inCart
            ? 'border-ember-600 bg-ember-50 shadow-md'
            : 'border-stone-300 bg-white shadow-sm'
      }`}
      style={{ WebkitTouchCallout: 'none' }}
    >
      {inCart ? (
        <>
          <span className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-lg font-extrabold uppercase leading-tight">{p.name}</span>
            <span className="shrink-0 text-base font-bold tabular-nums text-stone-600">{formatPeso(p.selling_price)}</span>
          </span>
          {/* Left half = remove, right half = add (see tileAction). */}
          <span className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1" aria-hidden="true">
            <span className="flex h-10 items-center justify-center rounded-xl border-2 border-ember-600 bg-white text-ember-700">
              <Minus className="size-6" strokeWidth={3} />
            </span>
            <span className="min-w-10 text-center text-3xl font-black tabular-nums text-ember-800">{quantityInCart}</span>
            <span className="flex h-10 items-center justify-center rounded-xl bg-ember-600 text-white">
              <Plus className="size-6" strokeWidth={3} />
            </span>
          </span>
        </>
      ) : (
        <>
          <span className="line-clamp-2 text-lg font-extrabold uppercase leading-tight">{p.name}</span>
          <span className="mt-1 flex items-end justify-between gap-1">
            {p.is_sold_out ? (
              <span className="rounded-md bg-stone-700 px-2 py-0.5 text-sm font-extrabold text-white">SOLD OUT</span>
            ) : p.selling_price === 0 ? (
              <span className="text-sm font-bold">NO PRICE</span>
            ) : (
              <span className="text-2xl font-extrabold tabular-nums">{formatPeso(p.selling_price)}</span>
            )}
            {sellable && low && (
              <span className={`text-xs font-extrabold ${p.stock_quantity <= 0 ? 'text-red-600' : 'text-amber-700'}`}>
                {p.stock_quantity} LEFT
              </span>
            )}
          </span>
        </>
      )}
    </button>
  )
}
