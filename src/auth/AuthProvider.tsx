import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { deleteMeta, getMeta, setMeta } from '../db/local'
import { errorMessage, isNetworkError, supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { AuthContext, type AuthState } from './context'

async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,role,is_active')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('This login has no staff profile yet. Ask the owner to check Supabase → profiles.')
  return data as Profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  // Profile (role) comes from cache first so the app opens offline, then is
  // refreshed from the server whenever we can reach it.
  const loadProfile = useCallback(async (userId: string, email: string) => {
    const cached = await getMeta('profile')
    const usable = cached?.id === userId ? cached : null
    setState({ status: 'signed_in', userId, email, profile: usable, profileError: null })
    try {
      const fresh = await fetchProfile(userId)
      await setMeta('profile', fresh)
      setState({ status: 'signed_in', userId, email, profile: fresh, profileError: null })
    } catch (err) {
      setState({
        status: 'signed_in',
        userId,
        email,
        profile: usable,
        profileError: isNetworkError(err) ? null : errorMessage(err),
      })
    }
  }, [])

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const user = data.session?.user
      if (user) void loadProfile(user.id, user.email ?? '')
      else setState({ status: 'signed_out' })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setState({ status: 'signed_out' })
      else if (event === 'SIGNED_IN' && session?.user) void loadProfile(session.user.id, session.user.email ?? '')
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(isNetworkError(error) ? 'No internet connection. First sign-in needs internet.' : error.message)
  }, [])

  const signOut = useCallback(async () => {
    // Local scope works offline; the device registration and any unsynced
    // sales stay on this phone for the next person who signs in.
    await supabase.auth.signOut({ scope: 'local' })
    await deleteMeta('profile')
    setState({ status: 'signed_out' })
  }, [])

  const refreshProfile = useCallback(async () => {
    if (state.status === 'signed_in') await loadProfile(state.userId, state.email)
  }, [state, loadProfile])

  const value = useMemo(() => ({ state, signIn, signOut, refreshProfile }), [state, signIn, signOut, refreshProfile])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
