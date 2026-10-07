import { Flame, LogOut, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/context'
import { Button } from '../../components/Button'
import { FullScreenMessage, Spinner } from '../../components/Feedback'
import { errorMessage } from '../../lib/supabase'

export function SplashScreen() {
  return (
    <FullScreenMessage>
      <Flame className="size-16 text-ember-500" />
      <Spinner label="Starting…" />
    </FullScreenMessage>
  )
}

export function ConfigErrorScreen() {
  return (
    <FullScreenMessage>
      <ShieldAlert className="size-16 text-amber-400" />
      <h1 className="text-2xl font-extrabold">App not configured</h1>
      <p className="max-w-sm text-stone-300">
        Set <code className="text-amber-300">VITE_SUPABASE_URL</code> and <code className="text-amber-300">VITE_SUPABASE_ANON_KEY</code>{' '}
        (see <code>.env.example</code>) and rebuild.
      </p>
    </FullScreenMessage>
  )
}

export function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="pt-safe pb-safe flex min-h-full flex-col bg-char px-6 py-10 text-white">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8">
        <div className="text-center">
          <Flame className="mx-auto size-16 text-ember-500" />
          <h1 className="mt-3 text-3xl font-extrabold tracking-wide">IHAW-IHAW POS</h1>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-bold uppercase tracking-wide text-stone-400">Email</span>
            <input
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-14 w-full rounded-xl border-2 border-stone-600 bg-stone-800 px-4 text-xl outline-none focus:border-ember-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold uppercase tracking-wide text-stone-400">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-14 w-full rounded-xl border-2 border-stone-600 bg-stone-800 px-4 text-xl outline-none focus:border-ember-500"
            />
          </label>
          {error && <p className="rounded-xl bg-red-900/60 p-3 font-semibold text-red-100" role="alert">{error}</p>}
          <Button type="submit" size="xl" block disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="text-center text-sm text-stone-400">Accounts are created by the owner. Ask them for your login.</p>
      </div>
    </div>
  )
}

/** Signed in, but the profile is missing (offline first login) or inactive. */
export function AccessScreen({ reason }: { reason: 'inactive' | 'needs_online' | 'error' }) {
  const { signOut, refreshProfile, state } = useAuth()
  const [busy, setBusy] = useState(false)
  const email = state.status === 'signed_in' ? state.email : ''

  const content = {
    inactive: {
      icon: <ShieldAlert className="size-16 text-amber-400" />,
      title: 'Waiting for approval',
      text: `${email} is signed in but not activated yet. Ask the owner to activate your account and assign your role, then tap Check again.`,
    },
    needs_online: {
      icon: <WifiOff className="size-16 text-stone-400" />,
      title: 'Connect to the internet',
      text: 'The first sign-in on this phone needs internet to load your account. After that the app works offline.',
    },
    error: {
      icon: <ShieldAlert className="size-16 text-red-400" />,
      title: 'Could not load your account',
      text: state.status === 'signed_in' ? (state.profileError ?? '') : '',
    },
  }[reason]

  return (
    <FullScreenMessage>
      {content.icon}
      <h1 className="text-2xl font-extrabold">{content.title}</h1>
      <p className="max-w-sm text-lg text-stone-300">{content.text}</p>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button
          size="xl"
          block
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await refreshProfile()
            setBusy(false)
          }}
        >
          <RefreshCw className="size-6" /> {busy ? 'Checking…' : 'Check again'}
        </Button>
        <Button variant="ghostDark" size="lg" block onClick={() => void signOut()}>
          <LogOut className="size-5" /> Sign out
        </Button>
      </div>
    </FullScreenMessage>
  )
}
