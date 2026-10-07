import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, CloudUpload, Download, History, LogOut, Package, Smartphone, Store, Users, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { can, useAuth, useProfile } from '../../auth/context'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Notice } from '../../components/Feedback'
import { Sheet } from '../../components/Sheet'
import { db } from '../../db/local'
import type { Device } from '../../lib/types'
import { isIos, isStandalone, promptInstall, usePwa } from '../../pwa/pwa'
import { AuditLogPage } from './AuditLogPage'
import { BusinessPage } from './BusinessPage'
import { DevicesPage } from './DevicesPage'
import { ProductsAdmin } from './ProductsAdmin'
import { UsersPage } from './UsersPage'

type Page = 'products' | 'business' | 'users' | 'devices' | 'audit'

const ITEMS: { id: Page; label: string; icon: LucideIcon; hint: string }[] = [
  { id: 'products', label: 'Products', icon: Package, hint: 'Prices, costs, sold out, order' },
  { id: 'business', label: 'Business', icon: Store, hint: 'Name, address, phone' },
  { id: 'users', label: 'Users', icon: Users, hint: 'Roles and access' },
  { id: 'devices', label: 'Devices', icon: Smartphone, hint: 'Registered phones' },
  { id: 'audit', label: 'Audit log', icon: History, hint: 'Price, cost, stock and order changes' },
]

export function SettingsMenu({ device, onClose, onOpenSync }: { device: Device; onClose: () => void; onOpenSync: () => void }) {
  const profile = useProfile()
  const { signOut } = useAuth()
  const { canInstall } = usePwa()
  const unsynced = useLiveQuery(() => db.outbox.count(), [], 0)
  const [page, setPage] = useState<Page | null>(null)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const installed = isStandalone()
  const back = () => setPage(null)

  if (page === 'products') return <ProductsAdmin onBack={back} />
  if (page === 'business') return <BusinessPage onBack={back} />
  if (page === 'users') return <UsersPage onBack={back} />
  if (page === 'devices') return <DevicesPage currentDeviceId={device.id} onBack={back} />
  if (page === 'audit') return <AuditLogPage onBack={back} />

  return (
    <Sheet title="Menu" onClose={onClose}>
      <div className="space-y-4">
        <section className="rounded-2xl bg-white p-4">
          <p className="text-lg font-extrabold">{profile.display_name || 'Signed in'}</p>
          <p className="text-sm font-bold uppercase tracking-wide text-ember-700">{profile.role}</p>
          <p className="mt-2 text-sm text-stone-600">
            This phone: <strong>{device.device_code}</strong> · {device.device_name} ·{' '}
            {device.device_type === 'cashier' ? 'Cashier POS' : 'Grill display'}
          </p>
        </section>

        {can(profile.role, 'manage') && (
          <nav className="overflow-hidden rounded-2xl bg-white" aria-label="Settings">
            {ITEMS.map(({ id, label, icon: Icon, hint }) => (
              <button
                key={id}
                onClick={() => setPage(id)}
                className="flex min-h-16 w-full items-center gap-4 border-b border-stone-100 px-4 text-left last:border-0 active:bg-stone-100"
              >
                <Icon className="size-7 text-stone-600" />
                <span className="flex-1">
                  <span className="block text-lg font-bold">{label}</span>
                  <span className="block text-sm text-stone-500">{hint}</span>
                </span>
                <ChevronRight className="size-6 text-stone-400" />
              </button>
            ))}
          </nav>
        )}

        <nav className="overflow-hidden rounded-2xl bg-white" aria-label="App">
          <MenuRow icon={CloudUpload} label="Sync status" hint={unsynced ? `${unsynced} waiting to upload` : 'Everything uploaded'} onClick={onOpenSync} />
          {canInstall && !installed && (
            <MenuRow icon={Download} label="Install app" hint="Add to home screen — opens without internet" onClick={() => void promptInstall()} />
          )}
        </nav>

        {!canInstall && !installed && isIos() && (
          <Notice tone="info">
            To install on iPhone: tap the Share button in Safari, then <strong>Add to Home Screen</strong>.
          </Notice>
        )}

        <Button variant="secondary" block onClick={() => (unsynced ? setConfirmSignOut(true) : void signOut())}>
          <LogOut className="size-5" /> Sign out
        </Button>
      </div>
      {confirmSignOut && (
        <ConfirmDialog
          title="Sign out with unsynced changes?"
          confirmLabel="Sign out"
          danger
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={() => void signOut()}
        >
          {unsynced} change{unsynced === 1 ? ' is' : 's are'} still waiting to upload. They stay on this phone and upload when the
          next person signs in here with a cashier or admin account.
        </ConfirmDialog>
      )}
    </Sheet>
  )
}

function MenuRow({ icon: Icon, label, hint, onClick }: { icon: LucideIcon; label: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex min-h-16 w-full items-center gap-4 border-b border-stone-100 px-4 text-left last:border-0 active:bg-stone-100">
      <Icon className="size-7 text-stone-600" />
      <span className="flex-1">
        <span className="block text-lg font-bold">{label}</span>
        <span className="block text-sm text-stone-500">{hint}</span>
      </span>
      <ChevronRight className="size-6 text-stone-400" />
    </button>
  )
}
