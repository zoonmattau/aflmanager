import { useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { buildCareerTimeline } from '@/engine/career/careerTimeline'
import type { CareerSeasonSummary, TimelineEvent, TimelineEventKind } from '@/engine/career/careerTimeline'
import { Badge } from '@/components/ui/badge'
import {
  Trophy,
  Medal,
  Star,
  ArrowLeftRight,
  UserMinus,
  TrendingUp,
  Award,
  Repeat,
  ClipboardList,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Icons per event kind
// ---------------------------------------------------------------------------

const EVENT_ICONS: Record<TimelineEventKind, React.ElementType> = {
  'premiership': Trophy,
  'runners-up': Medal,
  'finals-exit': TrendingUp,
  'ladder-position': TrendingUp,
  'award-brownlow': Award,
  'award-coleman': Award,
  'award-rising-star': Star,
  'award-all-australian': Star,
  'award-best-and-fairest': Star,
  'trade': ArrowLeftRight,
  'draft-pick': ClipboardList,
  'milestone': Repeat,
  'retirement': UserMinus,
  'coaching-change': Medal,
}

const EVENT_COLORS: Record<TimelineEventKind, string> = {
  'premiership': 'text-yellow-500',
  'runners-up': 'text-slate-400',
  'finals-exit': 'text-blue-400',
  'ladder-position': 'text-muted-foreground',
  'award-brownlow': 'text-purple-400',
  'award-coleman': 'text-orange-400',
  'award-rising-star': 'text-emerald-400',
  'award-all-australian': 'text-sky-400',
  'award-best-and-fairest': 'text-amber-400',
  'trade': 'text-muted-foreground',
  'draft-pick': 'text-muted-foreground',
  'milestone': 'text-cyan-400',
  'retirement': 'text-rose-400',
  'coaching-change': 'text-indigo-400',
}

// ---------------------------------------------------------------------------
// Result badge
// ---------------------------------------------------------------------------

function ResultBadge({ season }: { season: CareerSeasonSummary }) {
  if (season.finalsRound === 'premier') {
    return (
      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/40 gap-1">
        <Trophy className="h-3 w-3" />
        Premier
      </Badge>
    )
  }
  if (season.finalsRound === 'runners-up') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Medal className="h-3 w-3" />
        Runners-up
      </Badge>
    )
  }
  if (season.finalsRound === 'preliminary') {
    return <Badge variant="outline">Prelim Final</Badge>
  }
  if (season.finalsRound === 'semi') {
    return <Badge variant="outline">Semi Final</Badge>
  }
  if (season.finalsRound === 'elimination') {
    return <Badge variant="outline">Elim Final</Badge>
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Missed Finals
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Ladder position indicator
// ---------------------------------------------------------------------------

function LadderBadge({ pos, total }: { pos: number | null; total: number | null }) {
  if (pos === null || total === null) return null
  const top8 = pos <= 8
  const top4 = pos <= 4

  return (
    <span
      className={
        'text-sm font-semibold tabular-nums ' +
        (top4 ? 'text-yellow-400' : top8 ? 'text-blue-400' : 'text-muted-foreground')
      }
    >
      {pos}
      <span className="text-xs font-normal text-muted-foreground">/{total}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Season card
// ---------------------------------------------------------------------------

function SeasonCard({ season, isLatest }: { season: CareerSeasonSummary; isLatest: boolean }) {
  const highEvents = season.events.filter((e) => e.importance === 'high')
  const medEvents = season.events.filter((e) => e.importance === 'medium')
  const lowEvents = season.events.filter((e) => e.importance === 'low')

  // Sort: high → medium → low
  const orderedEvents: TimelineEvent[] = [...highEvents, ...medEvents, ...lowEvents]

  const isPremier = season.finalsRound === 'premier'

  return (
    <div className="relative flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        {/* Dot */}
        <div
          className={
            'mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ' +
            (isPremier
              ? 'border-yellow-500 bg-yellow-500/20 text-yellow-400'
              : isLatest
              ? 'border-primary bg-primary/20 text-primary'
              : 'border-border bg-muted text-muted-foreground')
          }
        >
          {isPremier ? <Trophy className="h-4 w-4" /> : season.year.toString().slice(2)}
        </div>
        {/* Connector line (not on last) */}
        {!isLatest && <div className="w-px flex-1 bg-border" />}
      </div>

      {/* Card */}
      <div
        className={
          'mb-6 flex-1 rounded-lg border p-4 ' +
          (isPremier
            ? 'border-yellow-500/40 bg-yellow-500/5'
            : 'border-border bg-card')
        }
      >
        {/* Header row */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold">{season.year}</span>
          <span className="text-sm text-muted-foreground">{season.clubName}</span>
          <div className="ml-auto flex items-center gap-2">
            <LadderBadge pos={season.ladderPosition} total={season.teamCount} />
            <ResultBadge season={season} />
          </div>
        </div>

        {/* Events */}
        {orderedEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No notable events recorded.</p>
        ) : (
          <div className="space-y-1.5">
            {orderedEvents.map((event, i) => {
              const Icon = EVENT_ICONS[event.kind]
              const colorClass = EVENT_COLORS[event.kind]
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${colorClass}`} />
                  <div className="min-w-0">
                    <span
                      className={
                        event.importance === 'high'
                          ? 'font-semibold'
                          : event.importance === 'medium'
                          ? 'font-medium'
                          : 'text-muted-foreground'
                      }
                    >
                      {event.headline}
                    </span>
                    {event.detail && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        — {event.detail}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary stats bar
// ---------------------------------------------------------------------------

function CareerSummaryBar({ seasons }: { seasons: CareerSeasonSummary[] }) {
  const premierships = seasons.filter((s) => s.finalsRound === 'premier').length
  const runnersUp = seasons.filter((s) => s.finalsRound === 'runners-up').length
  const finalsAppearances = seasons.filter(
    (s) => s.finalsRound && s.finalsRound !== 'missed',
  ).length
  const totalSeasons = seasons.length

  const stats = [
    { label: 'Seasons', value: totalSeasons },
    { label: 'Finals', value: finalsAppearances },
    { label: 'Runners-up', value: runnersUp },
    { label: 'Premierships', value: premierships },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border bg-card p-3 text-center">
          <div
            className={
              s.label === 'Premierships' && s.value > 0
                ? 'text-2xl font-bold text-yellow-400'
                : 'text-2xl font-bold'
            }
          >
            {s.value}
          </div>
          <div className="text-xs text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CareerTimelinePage() {
  const gameState = useGameStore((s) => s)
  const managerName = useGameStore((s) => s.manager?.name ?? 'Manager')
  const currentYear = useGameStore((s) => s.currentYear)

  const timeline = useMemo(() => buildCareerTimeline(gameState), [gameState])

  // Show newest first
  const reversedTimeline = useMemo(() => [...timeline].reverse(), [timeline])

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Trophy className="h-12 w-12 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold">No career history yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Complete your first season to start building your career timeline.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Career Timeline</h1>
        <p className="text-sm text-muted-foreground">
          {managerName} · {currentYear} season
        </p>
      </div>

      {/* Summary stats */}
      <CareerSummaryBar seasons={timeline} />

      {/* Timeline */}
      <div className="pt-2">
        {reversedTimeline.map((season, i) => (
          <SeasonCard
            key={season.year}
            season={season}
            isLatest={i === reversedTimeline.length - 1}
          />
        ))}
      </div>
    </div>
  )
}
