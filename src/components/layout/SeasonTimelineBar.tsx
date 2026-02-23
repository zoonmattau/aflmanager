import { useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { GamePhase } from '@/types/game'
import type { GameEvent } from '@/types/calendar'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Trophy, ArrowLeftRight, ClipboardList, Zap } from 'lucide-react'
import { addDays, diffDays } from '@/engine/calendar/calendarEngine'

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const PRESEASON_LEAD_DAYS = 56 // how many days before Round 1 the bar "starts" (approx pre-season)
const POSTSEASON_TRAIL_DAYS = 7 // days to append after "Pre-Season Begins" event

function toPct(spanDays: number, dayOffset: number): number {
  return Math.max(0, Math.min(100, (dayOffset / spanDays) * 100))
}

function dateOffset(spanStart: string, date: string): number {
  return diffDays(spanStart, date)
}

function friendlyDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function friendlyDateRange(start: string, end: string): string {
  return `${friendlyDate(start)} – ${friendlyDate(end)}`
}

// ---------------------------------------------------------------------------
// Milestone configuration (only these events get icons on the bar)
// ---------------------------------------------------------------------------

type MilestoneCfg = {
  Icon: React.ComponentType<{ className?: string }>
  colorClass: string
  label: string
}

const MILESTONE_CONFIG: Record<string, MilestoneCfg> = {
  'Season Awards Night': {
    Icon: Trophy,
    colorClass: 'text-amber-500',
    label: 'Awards Night',
  },
  'Trade Period Opens': {
    Icon: ArrowLeftRight,
    colorClass: 'text-sky-500',
    label: 'Trades Open',
  },
  'National Draft': {
    Icon: ClipboardList,
    colorClass: 'text-violet-500',
    label: 'Draft',
  },
  'Pre-Season Begins': {
    Icon: Zap,
    colorClass: 'text-emerald-500',
    label: 'Pre-Season',
  },
}

// ---------------------------------------------------------------------------
// Timeline data model
// ---------------------------------------------------------------------------

interface SegmentBounds {
  startPct: number
  endPct: number
}

interface RoundPin {
  index: number // 0-based
  date: string
  pct: number
  isBye: boolean
}

interface MilestonePin {
  id: string
  title: string
  date: string
  pct: number
  cfg: MilestoneCfg
}

interface Timeline {
  spanStart: string
  spanDays: number
  pre: SegmentBounds
  regular: SegmentBounds
  finals: SegmentBounds
  offseason: SegmentBounds
  rounds: RoundPin[]
  milestones: MilestonePin[]
  toPct: (date: string) => number
  regularStartDate: string
  regularEndDate: string
  finalsStartDate: string | null
  finalsEndDate: string | null
}

function buildTimeline(calendarEvents: GameEvent[], totalRounds: number): Timeline | null {
  if (calendarEvents.length === 0) return null

  // Separate regular-season events from finals
  const regularEvents = calendarEvents
    .filter(e => (e.type === 'match' || e.type === 'bye') && !e.data?.['finalsWeek'])
    .sort((a, b) => a.date.localeCompare(b.date))

  const finalsEvents = calendarEvents
    .filter(e => e.type === 'match' && !!e.data?.['finalsWeek'])
    .sort((a, b) => a.date.localeCompare(b.date))

  if (regularEvents.length === 0) return null

  const regularStartDate = regularEvents[0].date
  const regularEndDate = regularEvents[regularEvents.length - 1].date
  const finalsStartDate = finalsEvents[0]?.date ?? null
  const finalsEndDate = finalsEvents[finalsEvents.length - 1]?.date ?? null

  // The bar starts PRESEASON_LEAD_DAYS before Round 1
  const spanStart = addDays(regularStartDate, -PRESEASON_LEAD_DAYS)

  // The bar ends a few days after "Pre-Season Begins" next year
  const preseasonBeginsEvt = calendarEvents.find(
    e => e.type === 'milestone' && e.title === 'Pre-Season Begins',
  )
  const spanEnd = preseasonBeginsEvt
    ? addDays(preseasonBeginsEvt.date, POSTSEASON_TRAIL_DAYS)
    : addDays(regularEndDate, 130)

  const spanDays = diffDays(spanStart, spanEnd)
  if (spanDays <= 0) return null

  const toPct = (date: string) => toPct_(spanStart, spanDays, date)

  // Segment bounds
  const regularEndSlot = addDays(regularEndDate, 6) // include the last round's full week
  const finalsEndSlot = finalsEndDate ? addDays(finalsEndDate, 6) : null

  const pre: SegmentBounds = {
    startPct: 0,
    endPct: toPct(regularStartDate),
  }
  const regular: SegmentBounds = {
    startPct: toPct(regularStartDate),
    endPct: toPct(regularEndSlot),
  }
  const finals: SegmentBounds = {
    startPct: finalsStartDate ? toPct(finalsStartDate) : toPct(addDays(regularEndDate, 7)),
    endPct: finalsEndSlot ? toPct(finalsEndSlot) : toPct(addDays(regularEndDate, 35)),
  }
  const offseason: SegmentBounds = {
    startPct: finals.endPct,
    endPct: 100,
  }

  // Round pins — one per round (0-based index)
  const rounds: RoundPin[] = []
  for (let i = 0; i < totalRounds; i++) {
    // Try to find the calendar event for this round index
    const evt = regularEvents.find(
      e => typeof e.data?.['roundIndex'] === 'number' && e.data['roundIndex'] === i,
    )
    if (evt) {
      rounds.push({ index: i, date: evt.date, pct: toPct(evt.date), isBye: evt.type === 'bye' })
    }
  }

  // Milestone pins
  const milestones: MilestonePin[] = calendarEvents
    .filter(e => {
      const cfg = MILESTONE_CONFIG[e.title]
      return cfg &&
        (e.type === 'milestone' || e.type === 'trade-deadline' || e.type === 'draft')
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({
      id: e.id,
      title: e.title,
      date: e.date,
      pct: toPct(e.date),
      cfg: MILESTONE_CONFIG[e.title]!,
    }))

  return {
    spanStart,
    spanDays,
    pre,
    regular,
    finals,
    offseason,
    rounds,
    milestones,
    toPct,
    regularStartDate,
    regularEndDate,
    finalsStartDate,
    finalsEndDate,
  }
}

// Standalone pure version (avoids closure recursion)
function toPct_(spanStart: string, spanDays: number, date: string): number {
  return toPct(spanDays, dateOffset(spanStart, date))
}

// ---------------------------------------------------------------------------
// Phase-aware computed values
// ---------------------------------------------------------------------------

function computeCurrentPct(
  tl: Timeline,
  _phase: GamePhase,
  currentDate: string,
): number {
  return tl.toPct(currentDate)
}

function computeRegularCompletedEnd(
  tl: Timeline,
  phase: GamePhase,
  currentPct: number,
): number {
  if (phase === 'finals' || phase === 'post-season' || phase === 'offseason') {
    return tl.regular.endPct
  }
  if (phase === 'regular-season') {
    return Math.max(tl.regular.startPct, Math.min(tl.regular.endPct, currentPct))
  }
  return tl.regular.startPct
}

function phaseTooltip(
  phase: GamePhase,
  currentRound: number,
  totalRounds: number,
  currentDate: string,
): string {
  switch (phase) {
    case 'preseason':      return `Pre-Season · ${friendlyDate(currentDate)}`
    case 'regular-season': return `Round ${currentRound + 1} of ${totalRounds} · ${friendlyDate(currentDate)}`
    case 'finals':         return `Finals · ${friendlyDate(currentDate)}`
    case 'post-season':    return `Post-Season · ${friendlyDate(currentDate)}`
    case 'offseason':      return `Off-Season · ${friendlyDate(currentDate)}`
    default:               return friendlyDate(currentDate)
  }
}

// ---------------------------------------------------------------------------
// Segment tooltip labels
// ---------------------------------------------------------------------------

function SegmentTooltip({
  label,
  dateRange,
  children,
  side = 'bottom',
}: {
  label: string
  dateRange?: string
  children: React.ReactNode
  side?: 'bottom' | 'top'
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="text-xs">
        <p className="font-medium">{label}</p>
        {dateRange && <p className="text-muted-foreground">{dateRange}</p>}
      </TooltipContent>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SeasonTimelineBar() {
  const phase          = useGameStore(s => s.phase)
  const season         = useGameStore(s => s.season)
  const currentRound   = useGameStore(s => s.currentRound)
  const currentDate    = useGameStore(s => s.currentDate)
  const calendarEvents = useGameStore(s => s.calendar.events)

  // Hooks must come before any early returns
  const tl = useMemo(
    () => buildTimeline(calendarEvents, season.rounds.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calendarEvents, season.rounds.length],
  )

  // Hide before the game is running
  if (phase === 'setup' || !currentDate) return null

  if (!tl) return null

  const totalRounds = season.rounds.length
  const currentPct = computeCurrentPct(tl, phase, currentDate)
  const regularCompletedEnd = computeRegularCompletedEnd(tl, phase, currentPct)
  const finalsActive = phase === 'finals'
  const finalsComplete = phase === 'post-season' || phase === 'offseason'

  // Cap the current position dot so it never overflows the bar
  const clampedPct = Math.max(0.3, Math.min(99.7, currentPct))

  return (
    <TooltipProvider delayDuration={200}>
      <div className="border-b bg-background/95">
        {/* Inner drawing canvas — mx-4 gives horizontal breathing room */}
        <div className="mx-4 relative" style={{ height: '30px' }}>

          {/* ── Track background ────────────────────────────────────────── */}
          <div
            className="absolute rounded-full bg-muted/40"
            style={{ top: '17px', left: 0, right: 0, height: '6px' }}
          />

          {/* ── Pre-season segment ──────────────────────────────────────── */}
          <SegmentTooltip
            label="Pre-Season"
            dateRange={friendlyDateRange(tl.spanStart, tl.regularStartDate)}
          >
            <div
              className="absolute rounded-l-full bg-sky-400/25 hover:bg-sky-400/40 transition-colors cursor-default"
              style={{
                top: '17px', height: '6px',
                left: `${tl.pre.startPct}%`,
                width: `${tl.pre.endPct - tl.pre.startPct}%`,
              }}
            />
          </SegmentTooltip>

          {/* ── Regular season: completed portion ───────────────────────── */}
          <div
            className="absolute bg-emerald-500 transition-all duration-500"
            style={{
              top: '17px', height: '6px',
              left: `${tl.regular.startPct}%`,
              width: `${Math.max(0, regularCompletedEnd - tl.regular.startPct)}%`,
            }}
          />

          {/* ── Regular season: remaining portion ───────────────────────── */}
          <SegmentTooltip
            label={phase === 'regular-season'
              ? `Regular Season (Round ${currentRound + 1} / ${totalRounds})`
              : 'Regular Season'}
            dateRange={friendlyDateRange(tl.regularStartDate, tl.regularEndDate)}
          >
            <div
              className="absolute bg-emerald-500/18 hover:bg-emerald-500/28 transition-colors cursor-default"
              style={{
                top: '17px', height: '6px',
                left: `${regularCompletedEnd}%`,
                width: `${Math.max(0, tl.regular.endPct - regularCompletedEnd)}%`,
              }}
            />
          </SegmentTooltip>

          {/* ── Finals segment ──────────────────────────────────────────── */}
          {tl.finals.endPct > tl.finals.startPct && (
            <SegmentTooltip
              label="Finals Series"
              dateRange={tl.finalsStartDate && tl.finalsEndDate
                ? friendlyDateRange(tl.finalsStartDate, tl.finalsEndDate)
                : undefined}
            >
              <div
                className={cn(
                  'absolute transition-colors cursor-default',
                  finalsComplete
                    ? 'bg-amber-400/80'
                    : finalsActive
                      ? 'bg-amber-400/50 hover:bg-amber-400/60'
                      : 'bg-amber-400/20 hover:bg-amber-400/30',
                )}
                style={{
                  top: '17px', height: '6px',
                  left: `${tl.finals.startPct}%`,
                  width: `${tl.finals.endPct - tl.finals.startPct}%`,
                }}
              />
            </SegmentTooltip>
          )}

          {/* ── Finals: active progress fill ────────────────────────────── */}
          {finalsActive && (
            <div
              className="absolute bg-amber-500 transition-all duration-500"
              style={{
                top: '17px', height: '6px',
                left: `${tl.finals.startPct}%`,
                width: `${Math.max(0, clampedPct - tl.finals.startPct)}%`,
              }}
            />
          )}

          {/* ── Offseason segment ───────────────────────────────────────── */}
          <SegmentTooltip label="Post-Season / Off-Season">
            <div
              className="absolute rounded-r-full bg-muted/30 hover:bg-muted/50 transition-colors cursor-default"
              style={{
                top: '17px', height: '6px',
                left: `${tl.offseason.startPct}%`,
                width: `${tl.offseason.endPct - tl.offseason.startPct}%`,
              }}
            />
          </SegmentTooltip>

          {/* ── Round tick marks ────────────────────────────────────────── */}
          {tl.rounds.map((r) => (
            <div
              key={r.index}
              className={cn(
                'absolute pointer-events-none',
                r.isBye ? 'bg-background/20' : 'bg-background/35',
              )}
              style={{
                top: '15px',
                height: '10px',
                width: '1px',
                left: `${r.pct}%`,
                transform: 'translateX(-50%)',
              }}
            />
          ))}

          {/* ── Segment boundary lines (pre/regular, regular/finals, finals/off) ── */}
          {[tl.pre.endPct, tl.finals.startPct, tl.finals.endPct].map((pct, i) => (
            pct > 1 && pct < 99 ? (
              <div
                key={i}
                className="absolute bg-border/60 pointer-events-none"
                style={{ top: '14px', height: '12px', width: '1px', left: `${pct}%` }}
              />
            ) : null
          ))}

          {/* ── Milestone icons (above track) ───────────────────────────── */}
          {tl.milestones.map((m) => {
            const { Icon, colorClass, label } = m.cfg
            return (
              <Tooltip key={m.id}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'absolute flex items-center justify-center cursor-default transition-opacity',
                      colorClass,
                      // dim future milestones slightly
                      m.date > currentDate ? 'opacity-50 hover:opacity-100' : 'opacity-90 hover:opacity-100',
                    )}
                    style={{
                      top: '2px',
                      left: `${m.pct}%`,
                      transform: 'translateX(-50%)',
                      width: '14px',
                      height: '12px',
                    }}
                  >
                    <Icon className="h-2.5 w-2.5" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p className="font-semibold">{label}</p>
                  <p className="text-muted-foreground">{friendlyDate(m.date)}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}

          {/* ── Current position marker ─────────────────────────────────── */}
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Clickable area slightly wider than the visual */}
              <div
                className="absolute cursor-default group"
                style={{
                  top: 0,
                  bottom: 0,
                  left: `${clampedPct}%`,
                  width: '12px',
                  transform: 'translateX(-50%)',
                }}
              >
                {/* Vertical line spanning the whole bar height */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-0.5 rounded-full bg-foreground shadow-sm group-hover:bg-foreground/70 transition-colors"
                  style={{ top: '4px', bottom: '2px' }}
                />
                {/* Diamond on top */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-foreground shadow-md group-hover:bg-foreground/70 transition-colors"
                  style={{ top: '1px' }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p className="font-semibold">
                {phaseTooltip(phase, currentRound, totalRounds, currentDate)}
              </p>
            </TooltipContent>
          </Tooltip>

        </div>
      </div>
    </TooltipProvider>
  )
}
