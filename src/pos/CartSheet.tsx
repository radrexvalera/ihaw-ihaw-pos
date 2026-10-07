import { Minus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Sheet } from '../components/Sheet'
import { formatPeso } from '../lib/money'
import { cartLineTotal, cartTotals, decrement, increment, removeLine } from './cart'
import { updateCart, useCart } from './cartStore'

export function CartSheet({ onClose, onCheckout }: { onClose: () => void; onCheckout: () => void }) {
  const cart = useCart()
  const { pieces, total } = cartTotals(cart)
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <Sheet
      title="Current order"
      onClose={onClose}
      footer={
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold uppercase text-stone-600">{pieces} items</span>
            <span className="text-4xl font-extrabold tabular-nums">{formatPeso(total)}</span>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <Button variant="secondary" size="xl" disabled={cart.length === 0} onClick={() => setConfirmClear(true)}>
              Clear
            </Button>
            <Button size="xl" disabled={cart.length === 0} onClick={onCheckout}>
              Checkout
            </Button>
          </div>
        </div>
      }
    >
      {cart.length === 0 ? (
        <p className="py-10 text-center text-xl font-bold text-stone-500">No items yet.</p>
      ) : (
        <ul className="space-y-2">
          {cart.map((line) => (
            <li key={line.product_id} className="rounded-2xl bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xl font-extrabold uppercase">{line.name}</p>
                  <p className="text-stone-600 tabular-nums">
                    {line.quantity} × {formatPeso(line.unit_price)}
                  </p>
                </div>
                <p className="text-2xl font-extrabold tabular-nums">{formatPeso(cartLineTotal(line))}</p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  aria-label={`Remove one ${line.name}`}
                  onClick={() => updateCart((c) => decrement(c, line.product_id))}
                  className="flex size-14 items-center justify-center rounded-xl border-2 border-stone-300 active:bg-stone-100"
                >
                  <Minus className="size-7" />
                </button>
                <span className="w-14 text-center text-3xl font-extrabold tabular-nums">{line.quantity}</span>
                <button
                  aria-label={`Add one ${line.name}`}
                  onClick={() => updateCart((c) => increment(c, line.product_id))}
                  className="flex size-14 items-center justify-center rounded-xl bg-ember-600 text-white active:bg-ember-700"
                >
                  <Plus className="size-7" />
                </button>
                <button
                  aria-label={`Remove ${line.name} from order`}
                  onClick={() => updateCart((c) => removeLine(c, line.product_id))}
                  className="ml-auto flex size-14 items-center justify-center rounded-xl text-red-600 active:bg-red-50"
                >
                  <Trash2 className="size-7" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {confirmClear && (
        <ConfirmDialog
          title="Clear this order?"
          confirmLabel="Clear"
          danger
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            updateCart(() => [])
            setConfirmClear(false)
            onClose()
          }}
        >
          All {pieces} items will be removed.
        </ConfirmDialog>
      )}
    </Sheet>
  )
}
