import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { Button } from '../components/Button'
import { Notice } from '../components/Feedback'
import { Sheet } from '../components/Sheet'
import { db, type OutboxEntry } from '../db/local'
import { formatAgo, formatTime } from '../lib/time'
import { useOnline } from '../lib/useOnline'
import { syncNow, useSyncState } from '../sync/engine'

const TYPE_LABEL: Record<OutboxEntry['type'], string> = {
  sync_order: 'Sale',
  mark_change_given: 'Change given',
  set_grill_status: 'Grill status',
  cancel_order: 'Cancel order',
  record_stock_movement: 'Stock change',
  set_product_sold_out: 'Sold out / available',
}

/** What is waiting to reach the server, and why anything failed. */
export function SyncSheet({ onClose }: { onClose: () => void }) {
  const online = useOnline()
  const sync = useSyncState()
  const entries = useLiveQuery(() => db.outbox.orderBy('seq').toArray(), [], [])
  const names = useLiveQuery(
    async () => {
      const [orders, products] = await Promise.all([db.orders.toArray(), db.products.toArray()])
      return new Map<string, string>([
        ...orders.map((o) => [o.id, `#${o.order_number}`] as const),
        ...products.map((p) => [p.id, p.name] as const),
      ])
    },
    [],
    new Map<string, string>(),
  )
  const failed = entries.find((e) => e.status === 'error')

  return (
    <Sheet
      title="Sync status"
      onClose={onClose}
      footer={
        <Button size="xl" block disabled={!online || sync.phase === 'syncing'} onClick={() => void syncNow()}>
          <RefreshCw className={`size-6 ${sync.phase === 'syncing' ? 'animate-spin' : ''}`} />
          {sync.phase === 'syncing' ? 'Syncing…' : 'Sync now'}
        </Button>
      }
    >
      <div className="space-y-4">
        <section className="space-y-1 rounded-2xl bg-white p-4 text-lg">
          <p className="flex justify-between">
            <span className="text-stone-500">Connection</span>
            <strong>{online ? 'Online' : 'Offline'}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-stone-500">Last full sync</span>
            <strong>{formatAgo(sync.lastSyncAt)}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-stone-500">Waiting to upload</span>
            <strong className="tabular-nums">{entries.length}</strong>
          </p>
        </section>

        {entries.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-6 text-xl font-bold text-green-700">
            <CheckCircle2 className="size-7" /> Everything is uploaded
          </p>
        ) : (
          <>
            {!online && <Notice tone="info">Sales are safe on this phone and will upload automatically when there is internet.</Notice>}
            {failed && (
              <Notice>
                The server rejected one change, so uploads are paused to keep them in order. Most often this means the
                signed-in account lacks permission (for example a griller account on the cashier phone) — sign in with the
                right account. Details: {failed.last_error}
              </Notice>
            )}
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white">
              {entries.map((e) => (
                <li key={e.seq} className="flex items-center gap-3 px-4 py-3">
                  {e.status === 'error' && <AlertTriangle className="size-5 shrink-0 text-red-600" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">
                      {TYPE_LABEL[e.type]} {names.get(e.ref) ?? ''}
                    </span>
                    <span className="block truncate text-sm text-stone-500">
                      {formatTime(e.created_at)}
                      {e.attempts > 0 ? ` · ${e.attempts} failed attempt${e.attempts === 1 ? '' : 's'}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  )
}
