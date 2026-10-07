import { Flame, Monitor, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useProfile } from '../../auth/context'
import { Button } from '../../components/Button'
import { registerDevice } from '../../data/admin'
import { errorMessage } from '../../lib/supabase'
import type { DeviceType } from '../../lib/types'
import { useOnline } from '../../lib/useOnline'

/** One-time registration of this phone as a cashier POS or a grill display. */
export function DeviceSetupScreen() {
  const profile = useProfile()
  const online = useOnline()
  const [type, setType] = useState<DeviceType>(profile.role === 'griller' ? 'griller' : 'cashier')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      // Registered device is written to IndexedDB; the app picks it up live.
      await registerDevice(crypto.randomUUID(), name.trim() || (type === 'cashier' ? 'Cashier phone' : 'Grill phone'), type)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const choices: { value: DeviceType; label: string; desc: string; icon: typeof Smartphone; allowed: boolean }[] = [
    { value: 'cashier', label: 'Cashier POS', desc: 'Takes orders and payments', icon: Smartphone, allowed: profile.role !== 'griller' },
    { value: 'griller', label: 'Grill display', desc: 'Shows the grill queue', icon: Monitor, allowed: true },
  ]

  return (
    <div className="pt-safe pb-safe flex min-h-full flex-col bg-char px-5 py-8 text-white">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6">
        <div className="text-center">
          <Flame className="mx-auto size-12 text-ember-500" />
          <h1 className="mt-2 text-2xl font-extrabold">Set up this phone</h1>
          <p className="mt-1 text-stone-400">Done once per phone.</p>
        </div>

        <div className="space-y-3">
          {choices
            .filter((c) => c.allowed)
            .map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setType(c.value)}
                aria-pressed={type === c.value}
                className={`flex min-h-20 w-full items-center gap-4 rounded-2xl border-2 px-4 text-left ${
                  type === c.value ? 'border-ember-500 bg-ember-600/20' : 'border-stone-600 bg-stone-800'
                }`}
              >
                <c.icon className="size-9 shrink-0" />
                <span>
                  <span className="block text-xl font-extrabold uppercase">{c.label}</span>
                  <span className="block text-stone-400">{c.desc}</span>
                </span>
              </button>
            ))}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-bold uppercase tracking-wide text-stone-400">Phone name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'cashier' ? 'Cashier phone' : 'Grill phone'}
            maxLength={40}
            className="min-h-14 w-full rounded-xl border-2 border-stone-600 bg-stone-800 px-4 text-xl outline-none placeholder:text-stone-500 focus:border-ember-500"
          />
        </label>

        {!online && <p className="rounded-xl bg-stone-700 p-3 font-semibold">Setup needs internet. Connect and try again.</p>}
        {error && <p className="rounded-xl bg-red-900/60 p-3 font-semibold text-red-100" role="alert">{error}</p>}

        <Button size="xl" block disabled={busy || !online} onClick={() => void submit()} className="mt-auto">
          {busy ? 'Registering…' : 'Start'}
        </Button>
      </div>
    </div>
  )
}
