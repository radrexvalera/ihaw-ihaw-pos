import { Monitor, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Notice, Spinner } from '../../components/Feedback'
import { Sheet } from '../../components/Sheet'
import { listDevices } from '../../data/admin'
import { errorMessage } from '../../lib/supabase'
import { formatAgo } from '../../lib/time'
import type { Device } from '../../lib/types'
import { useOnline } from '../../lib/useOnline'

export function DevicesPage({ currentDeviceId, onBack }: { currentDeviceId: string; onBack: () => void }) {
  const online = useOnline()
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!online) return
    let active = true
    listDevices()
      .then((d) => active && setDevices(d))
      .catch((err: unknown) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [online])

  return (
    <Sheet title="Devices" closeStyle="back" onClose={onBack}>
      <div className="space-y-3">
        {!online && <Notice tone="warning">Offline — the device list needs internet.</Notice>}
        {error && <Notice>{error}</Notice>}
        {online && !devices && !error && <Spinner />}
        {devices?.map((d) => {
          const Icon = d.device_type === 'cashier' ? Smartphone : Monitor
          return (
            <div key={d.id} className="flex items-center gap-4 rounded-2xl bg-white p-4">
              <Icon className="size-8 text-stone-600" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold">
                  {d.device_code}{' '}
                  {d.id === currentDeviceId && <span className="text-sm font-bold text-ember-700">(this phone)</span>}
                </p>
                <p className="truncate text-stone-600">{d.device_name}</p>
              </div>
              <p className="text-right text-sm text-stone-500">
                Last seen
                <br />
                <strong className="text-stone-800">{formatAgo(d.last_seen)}</strong>
              </p>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}
