import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useProfile } from '../auth/context'
import { Button } from '../components/Button'
import { Sheet } from '../components/Sheet'
import { markChangeGiven } from '../data/actions'
import { usePendingChange } from '../data/useOrders'
import { formatPeso } from '../lib/money'
import { formatTime } from '../lib/time'

/** Impossible-to-miss banner: "⚠ 3 CHANGE PENDING · ₱435". Hidden when nothing is owed. */
export function PendingChangeBanner() {
  const pending = usePendingChange()
  const [open, setOpen] = useState(false)
  if (!pending || pending.orders.length === 0) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full shrink-0 items-center gap-3 bg-amber-400 px-4 text-left text-black active:bg-amber-500"
      >
        <AlertTriangle className="size-7 shrink-0" />
        <span className="flex-1 text-lg font-extrabold">{pending.orders.length} CHANGE PENDING</span>
        <span className="text-2xl font-black tabular-nums">{formatPeso(pending.total)}</span>
        <ChevronRight className="size-6" />
      </button>
      {open && <PendingChangeSheet onClose={() => setOpen(false)} />}
    </>
  )
}

export function PendingChangeSheet({ onClose }: { onClose: () => void }) {
  const pending = usePendingChange()
  const profile = useProfile()

  return (
    <Sheet title="Change pending" onClose={onClose}>
      {pending && pending.orders.length === 0 ? (
        <p className="py-10 text-center text-xl font-bold text-green-700">All change has been given. ✓</p>
      ) : (
        <ul className="space-y-2">
          {pending?.orders.map((o) => (
            <li key={o.id} className="space-y-2 rounded-2xl bg-white p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-3xl font-black">
                    #{o.order_number}
                    {o.customer_token_number && (
                      <span className="ml-2 text-lg font-extrabold text-amber-700">TOKEN {o.customer_token_number}</span>
                    )}
                  </p>
                  <p className="text-sm text-stone-500">{formatTime(o.created_at)}</p>
                </div>
                <p className="text-4xl font-black tabular-nums">{formatPeso(o.change_due)}</p>
              </div>
              <Button variant="success" size="lg" block onClick={() => void markChangeGiven(o.id, profile.id)}>
                Change given
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
