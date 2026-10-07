import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import { useOnline } from '../lib/useOnline'
import { useSyncState } from '../sync/engine'

/** Always-visible connection indicator: ONLINE / OFFLINE / SYNCING / SYNC ERROR (+ unsynced count). */
export function StatusPill({ onClick }: { onClick?: () => void }) {
  const online = useOnline()
  const sync = useSyncState()
  const unsynced = useLiveQuery(() => db.outbox.count(), [], 0)

  const [label, dot, style] = !online
    ? ['OFFLINE', 'bg-stone-400', 'bg-stone-700 text-stone-100']
    : sync.phase === 'error'
      ? ['SYNC ERROR', 'bg-red-400', 'bg-red-700 text-white']
      : sync.phase === 'syncing' || unsynced > 0
        ? ['SYNCING', 'bg-amber-300 animate-pulse', 'bg-stone-800 text-amber-200']
        : ['ONLINE', 'bg-green-400', 'bg-stone-800 text-green-200']

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-extrabold tracking-wider ${style}`}
      aria-label={`Connection: ${label}${unsynced ? `, ${unsynced} not yet synced` : ''}`}
      title={sync.phase === 'error' ? (sync.lastError ?? undefined) : undefined}
    >
      <span className={`size-2.5 rounded-full ${dot}`} />
      {label}
      {unsynced > 0 && <span className="rounded-full bg-white/20 px-1.5 tabular-nums">{unsynced}</span>}
    </button>
  )
}
