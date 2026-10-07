import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useEffect } from 'react'
import { useProfile } from '../auth/context'
import { Button } from '../components/Button'
import { markChangeGiven } from '../data/actions'
import { isChangePending, useOrder } from '../data/useOrders'
import { formatPeso } from '../lib/money'

const AUTO_CLOSE_MS = 1800

/**
 * Big order number after checkout ("Number 27 po."). Closes by itself unless
 * change is still owed — then the cashier must choose CHANGE GIVEN or LEAVE PENDING.
 */
export function SaleComplete({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const order = useOrder(orderId)
  const profile = useProfile()
  const pending = order ? isChangePending(order) : false

  const loaded = Boolean(order)

  // Depends on booleans only, so a background sync refreshing the order does not restart the timer.
  useEffect(() => {
    if (!loaded || pending) return
    const t = setTimeout(onClose, AUTO_CLOSE_MS)
    return () => clearTimeout(t)
  }, [loaded, pending, onClose])

  if (!order) return null

  return (
    <div
      className="pt-safe pb-safe fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-char p-6 text-center text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Order number ${order.order_number}`}
      onClick={pending ? undefined : onClose}
    >
      <p className="flex items-center gap-2 text-xl font-extrabold text-green-400">
        <CheckCircle2 className="size-7" /> SALE RECORDED
      </p>
      <div>
        <p className="text-xl font-bold uppercase tracking-widest text-stone-400">Order</p>
        <p className="text-[9rem] font-black leading-none tabular-nums">#{order.order_number}</p>
        {order.customer_token_number && (
          <p className="mt-2 text-3xl font-extrabold text-amber-300">TOKEN {order.customer_token_number}</p>
        )}
      </div>
      <p className="text-2xl font-bold">
        Total {formatPeso(order.total)}
        <span className="ml-2 text-base font-bold uppercase text-stone-400">{order.payment_method === 'gcash' ? 'GCash' : 'Cash'}</span>
      </p>

      {pending ? (
        <div className="w-full max-w-sm space-y-3">
          <div className="rounded-2xl bg-amber-400 p-4 text-black">
            <p className="flex items-center justify-center gap-2 text-xl font-extrabold">
              <AlertTriangle className="size-6" /> CHANGE PENDING
            </p>
            <p className="text-6xl font-black tabular-nums">{formatPeso(order.change_due)}</p>
          </div>
          <Button variant="success" size="xl" block onClick={() => void markChangeGiven(order.id, profile.id)}>
            Change given
          </Button>
          <Button variant="ghostDark" size="xl" block onClick={onClose}>
            Leave pending
          </Button>
        </div>
      ) : (
        <>
          {order.change_due > 0 && (
            <p className="text-3xl font-extrabold text-green-400">
              CHANGE {formatPeso(order.change_due)} ✓ GIVEN
            </p>
          )}
          <p className="text-stone-400">Tap anywhere for the next order</p>
        </>
      )}
    </div>
  )
}
