import { create } from 'zustand'

interface MatchReadyState {
  dismissed: boolean
  setDismissed: (dismissed: boolean) => void
}

export const useMatchReadyStore = create<MatchReadyState>()((set) => ({
  dismissed: false,
  setDismissed: (dismissed) => set({ dismissed }),
}))
