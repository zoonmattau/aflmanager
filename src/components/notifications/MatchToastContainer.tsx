import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Eye } from 'lucide-react'
import { useNotificationStore, type MatchToast } from '@/stores/notificationStore'
import { cn } from '@/lib/utils'

const AUTO_DISMISS_MS = 8000

function MatchToastCard({ toast }: { toast: MatchToast }) {
  const dismiss = useNotificationStore(s => s.dismiss)
  const navigate = useNavigate()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [toast.id, dismiss])

  const handleViewMatch = () => {
    dismiss(toast.id)
    navigate('/match?review=pending')
  }

  const outcomeBg =
    toast.outcome === 'win'  ? 'bg-green-500/15 border-green-500/30' :
    toast.outcome === 'loss' ? 'bg-red-500/15 border-red-500/30'    :
                               'bg-yellow-500/15 border-yellow-500/30'

  const outcomeLabel =
    toast.outcome === 'win'  ? 'W' :
    toast.outcome === 'loss' ? 'L' : 'D'

  const outcomeLabelColor =
    toast.outcome === 'win'  ? 'text-green-400 bg-green-500/20' :
    toast.outcome === 'loss' ? 'text-red-400 bg-red-500/20'     :
                               'text-yellow-400 bg-yellow-500/20'

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 rounded-lg border p-3 shadow-lg',
        'bg-card text-card-foreground w-72',
        'animate-in slide-in-from-right-full duration-300',
        outcomeBg,
      )}
    >
      {/* Dismiss button */}
      <button
        onClick={() => dismiss(toast.id)}
        className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/50"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Header row */}
      <div className="flex items-center gap-2 pr-5">
        <span className={cn('rounded px-1.5 py-0.5 text-xs font-bold tabular-nums', outcomeLabelColor)}>
          {outcomeLabel}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {toast.userScore}–{toast.opponentScore}
        </span>
        <span className="text-sm text-muted-foreground truncate">
          vs {toast.opponentName}
        </span>
      </div>

      {/* Top scorer */}
      {toast.topScorer && (
        <p className="text-xs text-muted-foreground">
          {toast.topScorer.goals} goal{toast.topScorer.goals !== 1 ? 's' : ''}: {toast.topScorer.name}
        </p>
      )}

      {/* View match link */}
      <button
        onClick={handleViewMatch}
        className="flex items-center gap-1.5 self-start rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
      >
        <Eye className="h-3 w-3" />
        View Match
      </button>
    </div>
  )
}

export function MatchToastContainer() {
  const toasts = useNotificationStore(s => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <MatchToastCard toast={toast} />
        </div>
      ))}
    </div>
  )
}
