import { Eye, Zap, Play, ClipboardList, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Club } from '@/types/club'
import type { LiveSimMode } from '@/types/game'
import { formatDate } from '@/engine/calendar/calendarEngine'

export interface MatchEngagementBannerProps {
  /** Days until the next match (0 = today, 1 = tomorrow, etc.). null = no upcoming match. */
  daysToMatch: number | null
  matchDate: string | null
  opponent: Club | null
  isHome: boolean
  roundName: string | null
  isFinals: boolean
  liveSimMode: LiveSimMode
  opponentColor?: string
  onGoToMatchDay: () => void
  onGoToLineup: () => void
  onSimulate: () => void
}

export function MatchEngagementBanner({
  daysToMatch,
  matchDate,
  opponent,
  isHome,
  roundName,
  isFinals,
  liveSimMode,
  opponentColor,
  onGoToMatchDay,
  onGoToLineup,
  onSimulate,
}: MatchEngagementBannerProps) {
  if (daysToMatch === null || daysToMatch > 3) return null

  const isToday    = daysToMatch === 0
  const isTomorrow = daysToMatch === 1

  // Urgency-driven colours
  const border = isToday
    ? 'border-amber-500/65'
    : isTomorrow
    ? 'border-yellow-500/50'
    : 'border-blue-500/40'
  const bg = isToday
    ? 'bg-amber-500/[0.07]'
    : isTomorrow
    ? 'bg-yellow-500/[0.06]'
    : 'bg-blue-500/[0.05]'
  const badgeBg = isToday ? 'bg-amber-500' : isTomorrow ? 'bg-yellow-500' : 'bg-blue-500'

  const headingText = isToday
    ? 'Match Day'
    : isTomorrow
    ? 'Match Tomorrow'
    : `${daysToMatch} Days Away`

  // For "today": which primary action to offer?
  const showLiveBtn = isToday && (
    liveSimMode === 'always-live' ||
    (liveSimMode === 'finals-only' && isFinals)
  )
  const showSimBtn = isToday && (
    liveSimMode === 'quick-sim' ||
    (liveSimMode === 'finals-only' && !isFinals)
  )
  // delegate → no primary action (dashboard auto-resolves), just show link

  const opponentLabel = opponent
    ? `${isHome ? 'vs' : '@'} ${opponent.fullName}`
    : 'Finals Match'

  return (
    <div className={`rounded-xl border ${border} ${bg} px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap`}>

      {/* ─── Left: badge + match info ─── */}
      <div className="flex items-center gap-3 min-w-0">
        <span className={`${badgeBg} text-white text-[11px] font-semibold px-2 py-0.5 rounded shrink-0`}>
          {headingText}
        </span>

        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {opponentColor && (
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-black/10"
              style={{ backgroundColor: opponentColor }}
            />
          )}
          <span className="text-sm font-medium truncate">{opponentLabel}</span>
          {roundName && (
            <span className="text-xs text-muted-foreground hidden sm:inline">· {roundName}</span>
          )}
          {!isToday && matchDate && (
            <span className="text-xs text-muted-foreground hidden md:inline">· {formatDate(matchDate)}</span>
          )}
        </div>
      </div>

      {/* ─── Right: action buttons ─── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Today: primary action */}
        {showLiveBtn && (
          <Button size="sm" className="h-7 gap-1.5" onClick={onGoToMatchDay}>
            <Eye className="h-3.5 w-3.5" />
            {isFinals ? 'Begin Final' : 'Play Live'}
          </Button>
        )}
        {showSimBtn && (
          <Button size="sm" className="h-7 gap-1.5" onClick={onSimulate}>
            <Zap className="h-3.5 w-3.5" />
            Quick Simulate
          </Button>
        )}
        {isToday && !showLiveBtn && !showSimBtn && (
          /* delegate or unhandled: just link to match day */
          <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={onGoToMatchDay}>
            <Play className="h-3.5 w-3.5" />
            Go to Match Day
          </Button>
        )}

        {/* Tomorrow: lineup CTA */}
        {isTomorrow && (
          <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={onGoToLineup}>
            <ClipboardList className="h-3.5 w-3.5" />
            Set Lineup
          </Button>
        )}

        {/* Secondary / ghost link to Match Day page */}
        {isToday && (showLiveBtn || showSimBtn) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-0.5 text-muted-foreground text-xs"
            onClick={onGoToMatchDay}
          >
            Match Day <ArrowRight className="h-3 w-3" />
          </Button>
        )}
        {!isToday && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-0.5 text-muted-foreground text-xs"
            onClick={onGoToMatchDay}
          >
            Match Day <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}
