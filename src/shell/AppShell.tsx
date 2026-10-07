import { BarChart3, Flame, Menu, Package, ReceiptText, ShoppingCart, type LucideIcon } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { lazy, Suspense, useState } from 'react'
import { useProfile } from '../auth/context'
import { Spinner } from '../components/Feedback'
import { StatusPill } from '../components/StatusPill'
import { getMeta } from '../db/local'
import type { Device, Role } from '../lib/types'
import { InventoryScreen } from '../inventory/InventoryScreen'
import { OrdersScreen } from '../orders/OrdersScreen'
import { PosScreen } from '../pos/PosScreen'
import { DeviceContext } from './device'
import { GrillScreen } from '../grill/GrillScreen'
import { SettingsMenu } from '../screens/settings/SettingsMenu'
import { SyncSheet } from './SyncSheet'
import { UpdateBanner } from './UpdateBanner'

// Owner-only and the heaviest screen: loaded on first open (it is still precached for offline).
const ReportsScreen = lazy(() => import('../reports/ReportsScreen').then((m) => ({ default: m.ReportsScreen })))

export type Tab = 'pos' | 'grill' | 'orders' | 'inventory' | 'reports'

const TABS: { id: Tab; label: string; icon: LucideIcon; roles: readonly Role[] }[] = [
  { id: 'pos', label: 'POS', icon: ShoppingCart, roles: ['admin', 'cashier'] },
  { id: 'grill', label: 'Grill', icon: Flame, roles: ['admin', 'cashier', 'griller'] },
  { id: 'orders', label: 'Orders', icon: ReceiptText, roles: ['admin', 'cashier'] },
  { id: 'inventory', label: 'Stock', icon: Package, roles: ['admin', 'cashier'] },
  { id: 'reports', label: 'Reports', icon: BarChart3, roles: ['admin'] },
]

export function AppShell({ device }: { device: Device }) {
  const profile = useProfile()
  const tabs = TABS.filter((t) => t.roles.includes(profile.role))
  const [tab, setTab] = useState<Tab>(() =>
    device.device_type === 'griller' || profile.role === 'griller' ? 'grill' : 'pos',
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const businessName = useLiveQuery(async () => (await getMeta('settings'))?.business_name)

  const active = tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? 'grill')

  return (
    <DeviceContext.Provider value={device}>
      <div className="flex h-full flex-col">
        <header className="pt-safe bg-char text-white">
          <div className="flex min-h-14 items-center gap-2 pl-4 pr-1">
            <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold uppercase tracking-wide">
              {businessName ?? 'Ihaw-Ihaw'}
            </h1>
            <StatusPill onClick={() => setSyncOpen(true)} />
            <button
              onClick={() => setMenuOpen(true)}
              className="flex size-12 items-center justify-center rounded-xl active:bg-stone-700"
              aria-label="Menu"
            >
              <Menu className="size-7" />
            </button>
          </div>
        </header>
        <UpdateBanner />

        <main className="min-h-0 flex-1 overflow-y-auto">
          {active === 'pos' ? (
            <PosScreen />
          ) : active === 'grill' ? (
            <GrillScreen />
          ) : active === 'orders' ? (
            <OrdersScreen />
          ) : active === 'inventory' ? (
            <InventoryScreen />
          ) : (
            <Suspense fallback={<Spinner />}>
              <ReportsScreen />
            </Suspense>
          )}
        </main>

        {tabs.length > 1 && (
          <nav className="pb-safe border-t border-stone-300 bg-white" aria-label="Main">
            <ul className="flex">
              {tabs.map(({ id, label, icon: Icon }) => (
                <li key={id} className="flex-1">
                  <button
                    onClick={() => setTab(id)}
                    aria-current={active === id ? 'page' : undefined}
                    className={`flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-xs font-extrabold uppercase tracking-wide ${
                      active === id ? 'text-ember-700' : 'text-stone-500'
                    }`}
                  >
                    <Icon className="size-7" strokeWidth={active === id ? 2.75 : 2} />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {menuOpen && (
          <SettingsMenu
            device={device}
            onClose={() => setMenuOpen(false)}
            onOpenSync={() => {
              setMenuOpen(false)
              setSyncOpen(true)
            }}
          />
        )}
        {syncOpen && <SyncSheet onClose={() => setSyncOpen(false)} />}
      </div>
    </DeviceContext.Provider>
  )
}
