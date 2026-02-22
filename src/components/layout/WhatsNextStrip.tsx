import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, AlertTriangle, Info, CheckCircle2, ArrowRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import {
  computeWhatsNext,
  type WhatsNextSeverity,
} from '@/engine/whatsnext/whatsNextEngine'

// ---------------------------------------------------------------------------
// Styling maps
// ---------------------------------------------------------------------------

const STRIP_BG: Record<WhatsNextSeverity, string> = {
  critical: 'bg-red-500/8 border-red-500/25',
  warning:  'bg-amber-500/8 border-amber-500/25',
  info:     'bg-blue-500/8 border-blue-500/25',
  ok:       'bg-green-500/8 border-green-500/25',
}

const ACCENT: Record<WhatsNextSeverity, string> = {
  critical: 'border-l-red-500',
  warning:  'border-l-amber-500',
  info:     'border-l-blue-500',
  ok:       'border-l-green-500',
}

const LABEL_COLOR: Record<WhatsNextSeverity, string> = {
  critical: 'text-red-700 dark:text-red-400',
  warning:  'text-amber-700 dark:text-amber-400',
  info:     'text-blue-700 dark:text-blue-400',
  ok:       'text-green-700 dark:text-green-400',
}

const DETAIL_COLOR: Record<WhatsNextSeverity, string> = {
  critical: 'text-red-600/70 dark:text-red-400/60',
  warning:  'text-amber-600/70 dark:text-amber-400/60',
  info:     'text-blue-600/70 dark:text-blue-400/60',
  ok:       'text-green-600/70 dark:text-green-400/60',
}

const CTA_CLASS: Record<WhatsNextSeverity, string> = {
  critical: 'border-red-500/40 text-red-700 hover:bg-red-500/15 dark:text-red-400',
  warning:  'border-amber-500/40 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400',
  info:     'border-blue-500/40 text-blue-700 hover:bg-blue-500/15 dark:text-blue-400',
  ok:       'border-green-500/40 text-green-700 hover:bg-green-500/15 dark:text-green-400',
}

const ICON_COLOR: Record<WhatsNextSeverity, string> = {
  critical: 'text-red-500',
  warning:  'text-amber-500',
  info:     'text-blue-500',
  ok:       'text-green-500',
}

function SeverityIcon({ severity, className }: { severity: WhatsNextSeverity; className?: string }) {
  const cls = cn('h-3.5 w-3.5 flex-shrink-0', ICON_COLOR[severity], className)
  switch (severity) {
    case 'critical': return <AlertCircle className={cls} />
    case 'warning':  return <AlertTriangle className={cls} />
    case 'info':     return <Info className={cls} />
    case 'ok':       return <CheckCircle2 className={cls} />
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WhatsNextStrip() {
  const navigate = useNavigate()
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  // Pull only the fields the engine needs — individual selectors = fine-grained re-renders
  const phase            = useGameStore((s) => s.phase)
  const playerClubId     = useGameStore((s) => s.playerClubId)
  const currentRound     = useGameStore((s) => s.currentRound)
  const currentDate      = useGameStore((s) => s.currentDate)
  const players          = useGameStore((s) => s.players)
  const settings         = useGameStore((s) => s.settings)
  const calendar         = useGameStore((s) => s.calendar)
  const selectedLineup   = useGameStore((s) => s.selectedLineup)
  const tradeInbox       = useGameStore((s) => s.tradeInbox)
  const tribunalInbox    = useGameStore((s) => s.tribunalInbox)
  const offseasonState   = useGameStore((s) => s.offseasonState)
  const leadershipPending = useGameStore((s) => s.leadershipPending)
  const jumperManagement = useGameStore((s) => s.jumperManagement)
  const simulationActive = useGameStore((s) => s.simulation.active)

  const action = useMemo(
    () =>
      computeWhatsNext({
        phase,
        playerClubId,
        currentRound,
        currentDate,
        players,
        settings,
        calendar,
        selectedLineup,
        tradeInbox,
        tribunalInbox,
        offseasonState,
        leadershipPending,
        jumperManagement,
        simulationActive,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      phase, playerClubId, currentRound, currentDate,
      players, settings, calendar, selectedLineup,
      tradeInbox, tribunalInbox, offseasonState,
      leadershipPending, jumperManagement, simulationActive,
    ],
  )

  // Don't render when no action, or user has dismissed this specific action
  if (!action || action.id === dismissedId) return null

  const { severity, label, detail, ctaLabel, linkTo } = action

  const handleCta = () => {
    navigate(linkTo)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-l-[3px] px-4 py-1.5 text-sm',
        STRIP_BG[severity],
        ACCENT[severity],
      )}
      role="status"
      aria-live="polite"
    >
      {/* Icon */}
      <SeverityIcon severity={severity} />

      {/* Text */}
      <div className="flex flex-1 items-baseline gap-2 min-w-0 overflow-hidden">
        <span className={cn('font-semibold leading-none whitespace-nowrap flex-shrink-0', LABEL_COLOR[severity])}>
          {label}
        </span>
        <span className={cn('text-xs hidden sm:inline truncate', DETAIL_COLOR[severity])}>
          {detail}
        </span>
      </div>

      {/* CTA button */}
      <Button
        variant="outline"
        size="sm"
        className={cn('h-6 gap-1 border px-2.5 text-xs font-semibold flex-shrink-0 bg-transparent', CTA_CLASS[severity])}
        onClick={handleCta}
      >
        {ctaLabel}
        <ArrowRight className="h-3 w-3" />
      </Button>

      {/* Dismiss */}
      <button
        type="button"
        aria-label="Dismiss"
        className="flex-shrink-0 rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity"
        onClick={() => setDismissedId(action.id)}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
