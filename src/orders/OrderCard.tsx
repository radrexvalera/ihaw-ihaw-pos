import { CloudOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { isChangePending } from '../data/useOrders'
import { formatPeso } from '../lib/money'
import { formatTime } from '../lib/time'
import type { GrillStatus, Order } from '../lib/types'
import { piecesByProduct, totalPieces } from '../pos/checkout'

const GRILL_LABEL: Record<GrillStatus, { text: string; cls: string }> = {
  new: { text: 'NEW', cls: 'bg-sky-100 text-sky-900' },
  grilling: { text: 'GRILLING', cls: 'bg-ember-100 text-ember-800' },
  done: { text: 'DONE', cls: 'bg-stone-200 text-stone-700' },
  cancelled: { text: 'CANCELLED', cls: 'bg-red-100 text-red-800' },
}

export function PaymentBadge({ order }: { order: Order }) {
  if (order.status === 'cancelled') return <Badge cls="bg-red-600 text-white">CANCELLED</Badge>
  if (isChangePending(order)) return <Badge cls="bg-amber-400 text-black">CHANGE PENDING {formatPeso(order.change_due)}</Badge>
  return <Badge cls="bg-green-700 text-white">PAID{order.payment_method === 'gcash' ? ' · GCASH' : ''}</Badge>
}

export function GrillBadge({ status }: { status: GrillStatus }) {
  const g = GRILL_LABEL[status]
  return <Badge cls={g.cls}>{g.text}</Badge>
}

function Badge({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`rounded-md px-2 py-0.5 text-xs font-extrabold tabular-nums ${cls}`}>{children}</span>
}

export function OrderCard({ order, unsynced, onOpen }: { order: Order; unsynced: boolean; onOpen: () => void }) {
  const cancelled = order.status === 'cancelled'
  return (
    <button onClick={onOpen} className={`w-full rounded-2xl bg-white p-3 text-left shadow-sm active:bg-stone-50 ${cancelled ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-2">
        <p className={`text-3xl font-black ${cancelled ? 'line-through' : ''}`}>#{order.order_number}</p>
        {order.customer_token_number && (
          <span className="mt-1 rounded-md bg-amber-100 px-2 py-0.5 text-sm font-extrabold text-amber-900">TOKEN {order.customer_token_number}</span>
        )}
        <span className="ml-auto flex items-center gap-2 text-sm font-semibold text-stone-500">
          {unsynced && <CloudOff className="size-4 text-amber-600" aria-label="Not yet synced" />}
          {formatTime(order.created_at)}
        </span>
      </div>
      <ul className="mt-1 text-lg font-semibold leading-snug">
        {piecesByProduct(order).map((i) => (
          <li key={i.product_id}>
            {i.quantity} {i.name}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-2xl font-black tabular-nums">{formatPeso(order.total)}</span>
        <span className="text-sm font-bold text-stone-500">{totalPieces(order)} pcs</span>
        <span className="ml-auto flex flex-wrap justify-end gap-1">
          <PaymentBadge order={order} />
          {!cancelled && <GrillBadge status={order.grill_status} />}
        </span>
      </div>
    </button>
  )
}
