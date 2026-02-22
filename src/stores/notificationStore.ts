import { create } from 'zustand'
import type { PostMatchReviewPayload } from '@/types/postMatch'

export interface MatchToast {
  id: string
  outcome: 'win' | 'loss' | 'draw'
  userScore: number
  opponentScore: number
  opponentName: string
  topScorer: { name: string; goals: number } | null
  timestamp: number
}

interface NotificationState {
  toasts: MatchToast[]
  pendingReview: PostMatchReviewPayload | null
}

interface NotificationActions {
  pushMatchToast: (
    data: Omit<MatchToast, 'id' | 'timestamp'>,
    review: PostMatchReviewPayload,
  ) => void
  dismiss: (id: string) => void
  clearAll: () => void
  claimPendingReview: () => PostMatchReviewPayload | null
}

export const useNotificationStore = create<NotificationState & NotificationActions>((set, get) => ({
  toasts: [],
  pendingReview: null,

  pushMatchToast: (data, review) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    set(s => ({
      // Keep at most 3 toasts stacked
      toasts: [...s.toasts.slice(-2), { ...data, id, timestamp: Date.now() }],
      pendingReview: review,
    }))
  },

  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  clearAll: () => set({ toasts: [] }),

  claimPendingReview: () => {
    const { pendingReview } = get()
    set({ pendingReview: null })
    return pendingReview
  },
}))
