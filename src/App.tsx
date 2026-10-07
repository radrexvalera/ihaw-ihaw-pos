import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/context'
import { registerDevice } from './data/admin'
import { getMeta } from './db/local'
import { isSupabaseConfigured } from './lib/supabase'
import type { Device } from './lib/types'
import { useOnline } from './lib/useOnline'
import { DeviceSetupScreen } from './screens/gate/DeviceSetupScreen'
import { AccessScreen, ConfigErrorScreen, LoginScreen, SplashScreen } from './screens/gate/GateScreens'
import { AppShell } from './shell/AppShell'
import { startSync } from './sync/engine'

export default function App() {
  if (!isSupabaseConfigured) return <ConfigErrorScreen />
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

/** Login → account active → phone registered → app. */
function Gate() {
  const { state } = useAuth()
  const online = useOnline()
  // `null` = loaded, not registered yet; `undefined` = still reading IndexedDB.
  const device = useLiveQuery(async () => (await getMeta('device')) ?? null)

  if (state.status === 'loading' || device === undefined) return <SplashScreen />
  if (state.status === 'signed_out') return <LoginScreen />
  if (!state.profile) {
    if (state.profileError) return <AccessScreen reason="error" />
    return online ? <SplashScreen /> : <AccessScreen reason="needs_online" />
  }
  if (!state.profile.is_active) return <AccessScreen reason="inactive" />
  if (!device) return <DeviceSetupScreen />
  return <Running device={device} />
}

function Running({ device }: { device: Device }) {
  const online = useOnline()

  useEffect(() => startSync(), [])

  // Refresh last_seen (and pick up a renamed device) whenever we are online.
  useEffect(() => {
    if (online) void registerDevice(device.id, device.device_name, device.device_type).catch(() => {})
    // Only re-run when connectivity changes, not when the device record refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, device.id])

  return <AppShell device={device} />
}
