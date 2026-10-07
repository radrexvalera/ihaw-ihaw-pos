import { useEffect, useState } from 'react'
import { useProfile } from '../../auth/context'
import { Segmented, ToggleRow } from '../../components/Field'
import { Notice, Spinner } from '../../components/Feedback'
import { Sheet } from '../../components/Sheet'
import { listProfiles, updateProfileAccess } from '../../data/admin'
import { errorMessage } from '../../lib/supabase'
import type { Profile, Role } from '../../lib/types'
import { useOnline } from '../../lib/useOnline'

const ROLE_OPTIONS = [
  { value: 'cashier', label: 'Cashier' },
  { value: 'griller', label: 'Griller' },
  { value: 'admin', label: 'Admin' },
] as const satisfies readonly { value: Role; label: string }[]

export function UsersPage({ onBack }: { onBack: () => void }) {
  const me = useProfile()
  const online = useOnline()
  const [users, setUsers] = useState<Profile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Bumped after each change to re-fetch the list.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!online) return
    let active = true
    listProfiles()
      .then((list) => {
        if (!active) return
        setUsers(list)
        setError(null)
      })
      .catch((err: unknown) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [online, version])

  async function change(user: Profile, patch: { role?: Role; is_active?: boolean }) {
    setSavingId(user.id)
    setError(null)
    try {
      await updateProfileAccess(user.id, patch)
      setVersion((v) => v + 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Sheet title="Users" closeStyle="back" onClose={onBack}>
      <div className="space-y-4">
        <Notice tone="info">
          To add a person, create their login in Supabase → Authentication → Users. They appear here as inactive; activate
          them and choose their role.
        </Notice>
        {!online && <Notice tone="warning">Offline — user management needs internet.</Notice>}
        {error && <Notice>{error}</Notice>}
        {online && !users && !error && <Spinner />}
        {users?.map((u) => {
          const isMe = u.id === me.id
          const busy = savingId === u.id
          return (
            <section key={u.id} className="space-y-3 rounded-2xl bg-white p-4">
              <p className="text-lg font-extrabold">
                {u.display_name || 'Unnamed'} {isMe && <span className="text-sm font-bold text-stone-500">(you)</span>}
              </p>
              <Segmented
                label="Role"
                value={u.role}
                options={ROLE_OPTIONS}
                disabled={isMe || busy}
                onChange={(role) => void change(u, { role })}
              />
              <ToggleRow
                label="Active"
                description={u.is_active ? 'Can use the app' : 'Cannot use the app'}
                checked={u.is_active}
                disabled={isMe || busy}
                onChange={(is_active) => void change(u, { is_active })}
              />
            </section>
          )
        })}
      </div>
    </Sheet>
  )
}
