import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { Notice, Spinner } from '../../components/Feedback'
import { Sheet } from '../../components/Sheet'
import { updateBusinessSettings } from '../../data/admin'
import { getMeta } from '../../db/local'
import { errorMessage } from '../../lib/supabase'
import type { BusinessSettings } from '../../lib/types'
import { useOnline } from '../../lib/useOnline'

export function BusinessPage({ onBack }: { onBack: () => void }) {
  // `null` = loaded but nothing cached yet.
  const settings = useLiveQuery(async () => (await getMeta('settings')) ?? null)
  return (
    <Sheet title="Business" closeStyle="back" onClose={onBack}>
      {settings === undefined ? <Spinner /> : <BusinessForm initial={settings} onSaved={onBack} />}
    </Sheet>
  )
}

function BusinessForm({ initial, onSaved }: { initial: BusinessSettings | null; onSaved: () => void }) {
  const online = useOnline()
  const [name, setName] = useState(initial?.business_name ?? '')
  const [address, setAddress] = useState(initial?.business_address ?? '')
  const [phone, setPhone] = useState(initial?.business_phone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Business name is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateBusinessSettings({
        business_name: name.trim(),
        business_address: address.trim() || null,
        business_phone: phone.trim() || null,
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Business name" value={name} onChange={setName} maxLength={60} />
      <Field label="Address (optional)" value={address} onChange={setAddress} maxLength={120} />
      <Field label="Phone (optional)" value={phone} onChange={setPhone} inputMode="tel" maxLength={30} />
      {!online && <Notice tone="info">Offline — connect to save.</Notice>}
      {error && <Notice>{error}</Notice>}
      <Button type="submit" size="xl" block disabled={busy || !online}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}
