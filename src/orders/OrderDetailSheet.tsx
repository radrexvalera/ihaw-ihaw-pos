import { useState } from 'react'
import { can, useProfile } from '../auth/context'
import { Button } from '../components/Button'
import { Notice } from '../components/Feedback'
import { Sheet } from '../components/Sheet'
import { cancelOrder, markChangeGiven } from '../data/actions'
import { isChangePending, useOrder, useUnsyncedRefs } from '../data/useOrders'
import { formatPeso } from '../lib/money'
import { errorMessage } from '../lib/supabase'
import { formatDateTime, formatTime } from '../lib/time'
import type { Order } from '../lib/types'
import { totalPieces } from '../pos/checkout'
import { useDevice } from '../shell/device'
import { GrillBadge, PaymentBadge } from './OrderCard'

const REASONS = ['Wrong order', 'Customer left', 'Duplicate entry', 'Items not available'] as const

export function OrderDetailSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const order = useOrder(orderId)
  const profile = useProfile()
  const unsynced = useUnsyncedRefs().has(orderId)
  const [cancelling, setCancelling] = useState(false)

  if (order === undefined) return null
  if (order === null) {
    return (
      <Sheet title="Order" onClose={onClose}>
        <Notice tone="info">This order is no longer stored on this phone.</Notice>
      </Sheet>
    )
  }

  const pending = isChangePending(order)
  const canCancel = order.status === 'completed' && can(profile.role, 'manage')

  return (
    <Sheet
      title={`Order #${order.order_number}`}
      onClose={onClose}
      footer={
        pending || canCancel ? (
          <div className="space-y-2">
            {pending && (
              <Button variant="success" size="xl" block onClick={() => void markChangeGiven(order.id, profile.id)}>
                Change given · {formatPeso(order.change_due)}
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" size="lg" block onClick={() => setCancelling(true)}>
                Cancel order
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <PaymentBadge order={order} />
          {order.status === 'completed' && <GrillBadge status={order.grill_status} />}
          {order.customer_token_number && (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-900">
              TOKEN {order.customer_token_number}
            </span>
          )}
          {unsynced && <span className="rounded-md bg-stone-200 px-2 py-0.5 text-xs font-extrabold text-stone-700">NOT YET SYNCED</span>}
        </div>

        <section className="rounded-2xl bg-white p-4">
          <ul className="divide-y divide-stone-100">
            {order.items.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-2 py-2">
                <span className="text-lg font-bold">
                  {i.quantity} × {i.product_name_snapshot}
                  <span className="ml-2 text-sm font-semibold text-stone-500">@ {formatPeso(i.unit_price)}</span>
                </span>
                <span className="text-lg font-bold tabular-nums">{formatPeso(i.line_total)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-baseline justify-between border-t-2 border-stone-200 pt-2">
            <span className="font-bold uppercase text-stone-600">Total · {totalPieces(order)} pcs</span>
            <span className="text-3xl font-black tabular-nums">{formatPeso(order.total)}</span>
          </div>
        </section>

        <section className="space-y-1 rounded-2xl bg-white p-4 text-lg">
          <Row label="Payment" value={order.payment_method === 'gcash' ? 'GCash' : 'Cash'} />
          {order.payment_reference && <Row label="GCash ref" value={order.payment_reference} />}
          <Row label="Received" value={formatPeso(order.amount_received)} />
          <Row label="Change" value={formatPeso(order.change_due)} />
          {order.change_due > 0 && (
            <Row
              label="Change status"
              value={order.change_given ? `Given${order.change_given_at ? ' ' + formatTime(order.change_given_at) : ''}` : 'PENDING'}
            />
          )}
        </section>

        <section className="space-y-1 rounded-2xl bg-white p-4 text-lg">
          <Row label="Time" value={formatDateTime(order.created_at)} />
          <Row label="Reference" value={order.order_ref} />
          {order.cancelled_at && <Row label="Cancelled" value={formatDateTime(order.cancelled_at)} />}
          {order.cancellation_reason && <Row label="Reason" value={order.cancellation_reason} />}
        </section>
      </div>

      {cancelling && <CancelDialog order={order} onClose={() => setCancelling(false)} />}
    </Sheet>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-stone-500">{label}</span>
      <span className="text-right font-bold">{value}</span>
    </p>
  )
}

function CancelDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const profile = useProfile()
  const device = useDevice()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // What actually left the cash box: the total, or everything received if change was never handed back.
  const refund = order.change_given ? order.total : order.amount_received

  async function confirm() {
    setBusy(true)
    try {
      await cancelOrder(order.id, reason, profile.id, device)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Sheet title={`Cancel #${order.order_number}?`} onClose={onClose}>
      <div className="space-y-4">
        <Notice tone="warning">
          The order is kept and marked CANCELLED. Stock is returned. Give the customer back{' '}
          <strong>{formatPeso(refund)}</strong>
          {order.payment_method === 'gcash' ? ' via GCash' : ''}.
        </Notice>
        <p className="text-sm font-bold uppercase tracking-wide text-stone-600">Reason (required)</p>
        <div className="grid grid-cols-2 gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              aria-pressed={reason === r}
              className={`min-h-14 rounded-xl border-2 px-2 font-bold ${reason === r ? 'border-red-600 bg-red-600 text-white' : 'border-stone-300 bg-white'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <input
          value={REASONS.includes(reason as (typeof REASONS)[number]) ? '' : reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Or type a reason"
          maxLength={120}
          className="min-h-14 w-full rounded-xl border-2 border-stone-300 bg-white px-3 text-lg outline-none focus:border-red-600"
        />
        {error && <Notice>{error}</Notice>}
        <Button variant="danger" size="xl" block disabled={busy || !reason.trim()} onClick={() => void confirm()}>
          {busy ? 'Cancelling…' : 'Cancel order'}
        </Button>
      </div>
    </Sheet>
  )
}
