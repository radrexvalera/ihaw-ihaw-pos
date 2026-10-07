import { ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, Spinner } from '../components/Feedback'
import { isChangePending, useAllOrders, useUnsyncedRefs } from '../data/useOrders'
import { businessDate } from '../lib/time'
import { OrderCard } from './OrderCard'
import { OrderDetailSheet } from './OrderDetailSheet'
import { PendingChangeBanner } from './PendingChange'

type Filter = 'recent' | 'pending' | 'all'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'recent', label: 'Today' },
  { id: 'pending', label: 'Change pending' },
  { id: 'all', label: 'All' },
]

export function OrdersScreen() {
  const orders = useAllOrders()
  const unsynced = useUnsyncedRefs()
  const [filter, setFilter] = useState<Filter>('recent')
  const [openId, setOpenId] = useState<string | null>(null)

  const today = businessDate()
  const shown =
    orders?.filter((o) =>
      filter === 'recent' ? o.business_date === today : filter === 'pending' ? isChangePending(o) : true,
    ) ?? []

  return (
    <div className="flex h-full flex-col">
      <PendingChangeBanner />
      <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-stone-200 bg-white p-2" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-12 rounded-xl text-sm font-extrabold uppercase ${filter === f.id ? 'bg-char text-white' : 'bg-stone-100 text-stone-600'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!orders ? (
          <Spinner />
        ) : shown.length === 0 ? (
          <EmptyState icon={ReceiptText} title={filter === 'pending' ? 'No change pending' : 'No orders yet'}>
            {filter === 'all' ? 'This phone keeps today’s and yesterday’s orders, plus any with change pending.' : null}
          </EmptyState>
        ) : (
          <ul className="mx-auto max-w-3xl space-y-2">
            {shown.map((o) => (
              <li key={o.id}>
                <OrderCard order={o} unsynced={unsynced.has(o.id)} onOpen={() => setOpenId(o.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {openId && <OrderDetailSheet orderId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
