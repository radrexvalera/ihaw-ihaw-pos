import { createContext, useContext } from 'react'
import type { Profile, Role } from '../lib/types'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | {
      status: 'signed_in'
      userId: string
      email: string
      /** null until loaded (or when offline on a device that never cached it). */
      profile: Profile | null
      profileError: string | null
    }

export interface AuthContextValue {
  state: AuthState
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** The signed-in, active profile. Only call below the auth gate in App. */
export function useProfile(): Profile {
  const { state } = useAuth()
  if (state.status !== 'signed_in' || !state.profile) throw new Error('useProfile used before sign-in completed')
  return state.profile
}

export function can(role: Role, action: 'manage' | 'sell' | 'grill' | 'reports'): boolean {
  switch (action) {
    case 'manage':
    case 'reports':
      return role === 'admin'
    case 'sell':
      return role === 'admin' || role === 'cashier'
    case 'grill':
      return true
  }
}
