/**
 * authStore – manages Supabase Auth session state.
 *
 * Call `initialize()` once on app boot to restore any existing session from
 * localStorage.  The store then stays in sync via the Supabase auth listener.
 */

import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { CloudSyncState } from '@/types/cloud'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthState {
  user: User | null
  session: Session | null
  /** True while the initial session check is running */
  loading: boolean
  /** Cloud sync status for the most-recent upload in this session */
  cloudSync: CloudSyncState
}

interface AuthActions {
  /** Restore existing session and subscribe to auth changes. Call once on app init. */
  initialize: () => Promise<void>
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** Called by appStore after a successful cloud upload */
  setCloudSync: (state: Partial<CloudSyncState>) => void
}

export type AuthStore = AuthState & AuthActions

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  session: null,
  loading: true,
  cloudSync: { status: 'idle', lastSyncedAt: null, lastError: null },

  initialize: async () => {
    // 1. Grab whatever session Supabase already has in localStorage
    const {
      data: { session },
    } = await supabase.auth.getSession()

    set({
      session,
      user: session?.user ?? null,
      loading: false,
    })

    // 2. Keep the store in sync with future auth events
    supabase.auth.onAuthStateChange((_event, newSession) => {
      set({
        session: newSession,
        user: newSession?.user ?? null,
      })
    })
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error?.message ?? null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({
      user: null,
      session: null,
      cloudSync: { status: 'idle', lastSyncedAt: null, lastError: null },
    })
  },

  setCloudSync: (partial) =>
    set((s) => ({ cloudSync: { ...s.cloudSync, ...partial } })),
}))
