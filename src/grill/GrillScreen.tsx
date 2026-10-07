import { useLiveQuery } from 'dexie-react-hooks'
import { Flame, Volume2, VolumeX, WifiOff } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Spinner } from '../components/Feedback'
import { db } from '../db/local'
import { useOnline } from '../lib/useOnline'
import { useDevice } from '../shell/device'
import { usePendingDone } from './doneUndo'
import { GrillCard } from './GrillCard'
import { beep, unlockAudio, useNewIdAlert, useNow, useWakeLock } from './hooks'
import { grillQueue } from './queue'

const SOUND_KEY = 'ihaw-pos.grill-sound'

function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export function GrillScreen() {
  const device = useDevice()
  const online = useOnline()
  const now = useNow()
  const pendingDone = usePendingDone()
  const [sound, setSound] = useState(readSoundPref)
  useWakeLock()

  const orders = useLiveQuery(() => db.orders.where('grill_status').anyOf('new', 'grilling').toArray())
  const queue = useMemo(() => (orders ? grillQueue(orders) : null), [orders])
  const waitingIds = useMemo(() => queue?.waiting.map((o) => o.id), [queue])

  const alert = useCallback(() => {
    if (sound) beep()
  }, [sound])
  useNewIdAlert(waitingIds, alert)

  function toggleSound() {
    const next = !sound
    setSound(next)
    try {
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
    } catch {
      // Preference just will not persist.
    }
    if (next) {
      unlockAudio()
      beep()
    }
  }

  if (!queue) return <Spinner />
  const oldestId = queue.waiting[0]?.id

  return (
    // Any tap unlocks audio so new-order beeps can play.
    <div className="flex min-h-full flex-col" onPointerDown={unlockAudio}>
      <div className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b border-stone-300 bg-white px-4">
        <p className="flex-1 text-lg font-black uppercase">
          <span className="text-sky-700">{queue.waiting.length} waiting</span>
          <span className="mx-2 text-stone-300">·</span>
          <span className="text-ember-700">{queue.grilling.length} grilling</span>
        </p>
        <button
          onClick={toggleSound}
          aria-label={sound ? 'Turn new-order sound off' : 'Turn new-order sound on'}
          aria-pressed={sound}
          className="flex size-12 items-center justify-center rounded-xl border-2 border-stone-300 active:bg-stone-100"
        >
          {sound ? <Volume2 className="size-7" /> : <VolumeX className="size-7 text-stone-400" />}
        </button>
      </div>

      {!online && device.device_type === 'griller' && (
        <div className="flex items-center gap-3 bg-stone-800 px-4 py-3 font-bold text-white">
          <WifiOff className="size-6 shrink-0" />
          No internet — new orders from the cashier phone will appear when the connection returns.
        </div>
      )}

      {queue.waiting.length === 0 && queue.grilling.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-stone-400">
          <Flame className="size-20" />
          <p className="text-3xl font-black text-stone-500">No orders to grill</p>
          <p className="text-lg">New orders appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-6 p-3">
          {queue.waiting.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-xl font-black uppercase tracking-wide text-sky-800">Waiting · oldest first</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {queue.waiting.map((o) => (
                  <GrillCard key={o.id} order={o} now={now} doneUndo={false} oldest={o.id === oldestId && queue.waiting.length > 1} />
                ))}
              </div>
            </section>
          )}
          {queue.grilling.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-xl font-black uppercase tracking-wide text-ember-800">On the grill</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {queue.grilling.map((o) => (
                  <GrillCard key={o.id} order={o} now={now} doneUndo={pendingDone.has(o.id)} compact />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
