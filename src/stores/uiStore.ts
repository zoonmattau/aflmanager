import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

// ---------------------------------------------------------------------------
// UI state types
// ---------------------------------------------------------------------------
type Theme = 'light' | 'dark' | 'system'

interface UIState {
  sidebarOpen: boolean
  theme: Theme
  currentView: string
}

interface UIActions {
  toggleSidebar: () => void
  setTheme: (theme: Theme) => void
  setCurrentView: (view: string) => void
}

type UIStore = UIState & UIActions

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export const useUIStore = create<UIStore>()(
  persist(
    immer((set) => ({
      // ---- State ----
      sidebarOpen: true,
      theme: 'system' as Theme,
      currentView: 'dashboard',

      // ---- Actions ----
      toggleSidebar: () => {
        set((state) => {
          state.sidebarOpen = !state.sidebarOpen
        })
      },

      setTheme: (theme: Theme) => {
        set((state) => {
          state.theme = theme
        })
      },

      setCurrentView: (view: string) => {
        set((state) => {
          state.currentView = view
        })
      },
    })),
    {
      name: 'afl-manager-ui',
    },
  ),
)
