import { Check, Undo2 } from 'lucide-react'
import { Button } from '../components/Button'
import { setGrillStatus } from '../data/actions'
import type { Order } from '../lib/types'
import { piecesByProduct, totalPieces } from '../pos/checkout'
import { markDoneWithUndo, undoDone } from './doneUndo'
import { formatWait, waitLevel, waitSeconds } from './queue'

const LEVEL = {
  ok: { bar: 'border-l-stone-400', timer: 'text-stone-700' },
  warn: { bar: 'border-l-amber-500', timer: 'text-amber-700' },
  late: { bar: 'border-l-red-600', timer: 'text-red-600' },
} as const

interface Props {
  order: Order
  now: number
  /** DONE was tapped and is inside its undo window. */
  doneUndo: boolean
  /** Highlight the order that has waited longest. */
  oldest?: boolean
  /** Smaller layout for orders already on the grill. */
  compact?: boolean
}

/** One order on the grill. Deliberately shows NO prices, payment or change. */
export function GrillCard({ order, now, doneUndo, oldest, compact }: Props) {
  // Sizes of a "price varies" product are one thing to the griller: 2 × PITSO.
  const pieces = piecesByProduct(order)
  const seconds = waitSeconds(order.created_at, now)
  const level = LEVEL[waitLevel(seconds)]
  const grilling = order.grill_status === 'grilling'

  return (
    <article
      className={`overflow-hidden rounded-2xl border-l-[10px] bg-white shadow-sm ${level.bar} ${oldest ? 'ring-4 ring-ember-500' : ''} ${doneUndo ? 'opacity-60' : ''}`}
      aria-label={`Order ${order.order_number}`}
    >
      {compact ? (
        <div className="px-3 pb-2 pt-3">
          <div className="flex items-center gap-2">
            <p className="text-3xl font-black leading-none tabular-nums">#{order.order_number}</p>
            {order.customer_token_number && (
              <span className="rounded-md bg-amber-300 px-1.5 py-0.5 text-sm font-black text-black">T{order.customer_token_number}</span>
            )}
            <span className="text-sm font-black text-stone-500">{totalPieces(order)} PCS</span>
            <span className={`ml-auto text-xl font-black tabular-nums ${level.timer}`}>{formatWait(seconds)}</span>
          </div>
          <p className="mt-1 text-lg font-bold uppercase leading-snug">
            {pieces.map((i, idx) => (
              <span key={i.product_id}>
                {idx > 0 && <span className="text-stone-300"> · </span>}
                <span className="text-ember-700 tabular-nums">{i.quantity}×</span> {i.name}
              </span>
            ))}
          </p>
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-start gap-3">
            <p className="text-5xl font-black leading-none tabular-nums">#{order.order_number}</p>
            {order.customer_token_number && (
              <span className="rounded-lg bg-amber-300 px-2 py-1 text-xl font-black text-black">TOKEN {order.customer_token_number}</span>
            )}
            <span className="ml-auto text-right">
              <span className="block text-xs font-extrabold uppercase text-stone-500">{grilling ? 'Grilling' : 'Waiting'}</span>
              <span className={`block text-3xl font-black tabular-nums ${level.timer}`}>{formatWait(seconds)}</span>
            </span>
          </div>

          <ul className="mt-3 space-y-1">
            {pieces.map((i) => (
              <li key={i.product_id} className="text-3xl font-extrabold uppercase leading-tight">
                <span className="text-ember-700 tabular-nums">{i.quantity} ×</span> {i.name}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xl font-black text-stone-600">{totalPieces(order)} PCS</p>
        </div>
      )}

      <div className="px-3 pb-3">
        {doneUndo ? (
          <button
            onClick={() => undoDone(order.id)}
            className={`flex w-full items-center justify-center gap-3 rounded-xl bg-stone-800 font-extrabold uppercase text-white active:bg-stone-900 ${compact ? 'min-h-14 text-xl' : 'min-h-20 text-2xl'}`}
          >
            <Check className="size-6 text-green-400" /> Done · <Undo2 className="size-6" /> Undo
          </button>
        ) : grilling ? (
          <Button variant="success" size={compact ? 'lg' : '2xl'} block onClick={() => markDoneWithUndo(order.id)}>
            Done
          </Button>
        ) : (
          <Button size="2xl" block onClick={() => void setGrillStatus(order.id, 'grilling')}>
            Start grilling
          </Button>
        )}
      </div>
    </article>
  )
}
