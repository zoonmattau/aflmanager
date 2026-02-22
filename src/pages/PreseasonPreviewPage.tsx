import { useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { generatePreseasonPreview } from '@/engine/narrative/preseasonPreview'
import type {
  PreseasonPreview,
  Top50Entry,
  ProjectedAASlot,
  Storyline,
  LadderPrediction,
  PlayerToWatch,
  StorylineCategory,
} from '@/engine/narrative/preseasonPreview'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Trophy,
  Star,
  TrendingUp,
  AlertTriangle,
  Swords,
  Heart,
  FileText,
  Users,
  Eye,
  Flame,
  Lock,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function posLabel(pos: string): string {
  const labels: Record<string, string> = {
    BP: 'BP', FB: 'FB', HBF: 'HBF', CHB: 'CHB',
    W: 'W', IM: 'IM', OM: 'OM', RK: 'RK',
    HFF: 'HFF', CHF: 'CHF', FP: 'FP', FF: 'FF',
  }
  return labels[pos] ?? pos
}

function tierColor(tier: string): string {
  switch (tier) {
    case 'premiership-contenders': return 'text-amber-500'
    case 'finals-contenders': return 'text-emerald-500'
    case 'mid-table': return 'text-blue-500'
    case 'rebuilding': return 'text-muted-foreground'
    default: return 'text-foreground'
  }
}

function tierBorder(tier: string): string {
  switch (tier) {
    case 'premiership-contenders': return 'border-amber-500/40'
    case 'finals-contenders': return 'border-emerald-500/40'
    case 'mid-table': return 'border-blue-500/40'
    case 'rebuilding': return 'border-border'
    default: return 'border-border'
  }
}

function storyIcon(cat: StorylineCategory) {
  switch (cat) {
    case 'premiership-favourites': return <Trophy className="h-4 w-4 text-amber-500" />
    case 'rebuilding': return <TrendingUp className="h-4 w-4 text-blue-500" />
    case 'breakout-candidates': return <Flame className="h-4 w-4 text-orange-500" />
    case 'coach-hot-seats': return <AlertTriangle className="h-4 w-4 text-red-500" />
    case 'rivalry-rematches': return <Swords className="h-4 w-4 text-purple-500" />
    case 'injury-returns': return <Heart className="h-4 w-4 text-green-500" />
    case 'contract-year': return <FileText className="h-4 w-4 text-cyan-500" />
  }
}

function StarDisplay({ stars }: { stars: number }) {
  const full = Math.floor(stars)
  const half = stars % 1 >= 0.5
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={i} className="h-3 w-3 fill-current" />
      ))}
      {half && <Star className="h-3 w-3 fill-current opacity-50" />}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Section Components
// ---------------------------------------------------------------------------

function IntroSection({ preview }: { preview: PreseasonPreview }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {preview.headline}
      </h1>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>Season Preview</span>
        <span>·</span>
        <span>{preview.generatedDate}</span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {preview.intro}
      </p>
    </div>
  )
}

function Top50Section({ entries }: { entries: Top50Entry[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-bold text-foreground">Top 50 Players</h2>
        <Badge variant="outline" className="text-xs">{entries.length}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        The best players in the competition heading into Round 1.
      </p>

      <div className="grid grid-cols-5 gap-1.5">
        {entries.map((entry) => (
          <Top50Cell key={entry.playerId} entry={entry} />
        ))}
      </div>
    </div>
  )
}

const POSITION_COLOURS: Record<string, { border: string; bg: string; text: string }> = {
  FB:  { border: 'border-sky-500/40',    bg: 'bg-sky-500/5',    text: 'text-sky-500' },
  BP:  { border: 'border-sky-500/40',    bg: 'bg-sky-500/5',    text: 'text-sky-500' },
  CHB: { border: 'border-sky-500/40',    bg: 'bg-sky-500/5',    text: 'text-sky-500' },
  HBF: { border: 'border-sky-500/40',    bg: 'bg-sky-500/5',    text: 'text-sky-500' },
  W:   { border: 'border-green-500/40',  bg: 'bg-green-500/5',  text: 'text-green-500' },
  IM:  { border: 'border-green-500/40',  bg: 'bg-green-500/5',  text: 'text-green-500' },
  OM:  { border: 'border-green-500/40',  bg: 'bg-green-500/5',  text: 'text-green-500' },
  RK:  { border: 'border-purple-500/40', bg: 'bg-purple-500/5', text: 'text-purple-500' },
  HFF: { border: 'border-orange-500/40', bg: 'bg-orange-500/5', text: 'text-orange-500' },
  CHF: { border: 'border-orange-500/40', bg: 'bg-orange-500/5', text: 'text-orange-500' },
  FP:  { border: 'border-orange-500/40', bg: 'bg-orange-500/5', text: 'text-orange-500' },
  FF:  { border: 'border-orange-500/40', bg: 'bg-orange-500/5', text: 'text-orange-500' },
}

function Top50Cell({ entry }: { entry: Top50Entry }) {
  const isTop3 = entry.rank <= 3
  const colours = POSITION_COLOURS[entry.position] ?? { border: 'border-border', bg: '', text: 'text-muted-foreground' }

  return (
    <div className={cn(
      'flex flex-col rounded-md border px-2 py-1.5',
      isTop3 ? 'border-amber-500/50 bg-amber-500/5' : cn(colours.border, colours.bg),
    )}>
      <div className="flex items-center justify-between gap-1">
        <span className={cn(
          'text-[10px] font-bold tabular-nums leading-none',
          isTop3 ? 'text-amber-500' : 'text-muted-foreground',
        )}>
          #{entry.rank}
        </span>
        <span className={cn('text-[9px] font-semibold uppercase leading-none', isTop3 ? 'text-amber-500/70' : colours.text)}>
          {entry.position}
        </span>
      </div>
      <Link
        to={`/player/${entry.playerId}`}
        className="mt-0.5 truncate text-xs font-semibold text-foreground hover:text-amber-500"
      >
        {entry.playerName}
      </Link>
      <div className="flex items-center justify-between gap-1 mt-0.5">
        <span className="truncate text-[10px] text-muted-foreground">{entry.clubName}</span>
        <span className="shrink-0 text-[10px] font-bold tabular-nums text-foreground">{entry.overall}</span>
      </div>
    </div>
  )
}

function AllAustralianSection({
  slots,
  captainId,
}: {
  slots: ProjectedAASlot[]
  captainId: string
}) {
  const groups: Record<string, ProjectedAASlot[]> = {}
  for (const slot of slots) {
    const g = groups[slot.position] ?? []
    g.push(slot)
    groups[slot.position] = g
  }

  const order = ['Defender', 'Midfielder', 'Ruck', 'Forward', 'Interchange']

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-cyan-500" />
        <h2 className="text-lg font-bold text-foreground">Projected All-Australian</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Our predicted 22-player All-Australian squad based on pre-season ratings and form.
      </p>

      <div className="space-y-3">
        {order.map((position) => {
          const group = groups[position]
          if (!group || group.length === 0) return null
          return (
            <div key={position}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {position}s ({group.length})
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((slot) => (
                  <div
                    key={slot.playerId}
                    className={cn(
                      'flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5',
                      slot.playerId === captainId ? 'border-amber-500/50' : 'border-border',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/player/${slot.playerId}`}
                          className="truncate text-xs font-medium text-foreground hover:text-amber-500"
                        >
                          {slot.playerName}
                        </Link>
                        {slot.playerId === captainId && (
                          <Badge className="h-4 bg-amber-500/20 px-1 text-[9px] text-amber-500">C</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{slot.clubName}</span>
                        <span>·</span>
                        <span>{slot.overall} OVR</span>
                        <StarDisplay stars={slot.stars} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StorylinesSection({ storylines }: { storylines: Storyline[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Eye className="h-5 w-5 text-purple-500" />
        <h2 className="text-lg font-bold text-foreground">Season Storylines</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        The narratives that will shape the season. From flag contenders to coaching pressure, here's what to watch.
      </p>

      <div className="space-y-2">
        {storylines.map((story, i) => (
          <Card key={i} className="border-border">
            <CardContent className="p-3">
              <div className="mb-1.5 flex items-center gap-2">
                {storyIcon(story.category)}
                <h3 className="text-sm font-semibold text-foreground">
                  {story.title}
                </h3>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {story.body}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function LadderPredictionsSection({ predictions }: { predictions: LadderPrediction[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-emerald-500" />
        <h2 className="text-lg font-bold text-foreground">Predicted Ladder Tiers</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Where we expect each club to land at season's end, grouped by projected finishing range.
      </p>

      <div className="space-y-3">
        {predictions.map((pred) => (
          <div key={pred.tier} className={cn('rounded-lg border p-3', tierBorder(pred.tier))}>
            <h3 className={cn('mb-2 text-sm font-bold', tierColor(pred.tier))}>
              {pred.tierLabel}
            </h3>
            <div className="space-y-1.5">
              {pred.clubs.map((club) => (
                <div key={club.clubId} className="flex items-start gap-2">
                  <Link
                    to={`/club/${club.clubId}`}
                    className="min-w-[100px] shrink-0 text-xs font-medium text-foreground hover:text-amber-500"
                  >
                    {club.clubName}
                  </Link>
                  <span className="text-[11px] leading-relaxed text-muted-foreground">
                    {club.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlayersToWatchSection({ players }: { players: PlayerToWatch[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-orange-500" />
        <h2 className="text-lg font-bold text-foreground">Players to Watch</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Ten players from across the league who could define the season — for different reasons.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {players.map((pw) => (
          <Card key={pw.playerId} className="border-border">
            <CardContent className="p-2.5">
              <div className="flex items-center gap-1.5">
                <Link
                  to={`/player/${pw.playerId}`}
                  className="truncate text-xs font-semibold text-foreground hover:text-amber-500"
                >
                  {pw.playerName}
                </Link>
                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                  {posLabel(pw.position)}
                </Badge>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Link to={`/club/${pw.clubId}`} className="hover:text-foreground">
                  {pw.clubName}
                </Link>
                <span>·</span>
                <span>{pw.age}yo</span>
                <span>·</span>
                <span>{pw.overall} OVR</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {pw.reason}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function PreseasonPreviewPage() {
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const ladder = useGameStore((s) => s.ladder)
  const history = useGameStore((s) => s.history)
  const currentYear = useGameStore((s) => s.currentYear)
  const currentDate = useGameStore((s) => s.currentDate)
  const rngSeed = useGameStore((s) => s.rngSeed)
  const phase = useGameStore((s) => s.phase)
  const currentRound = useGameStore((s) => s.currentRound)
  const newsLog = useGameStore((s) => s.newsLog)
  const addNewsItem = useGameStore((s) => s.addNewsItem)
  const sentEventRef = useRef(false)

  // Keep the preview available until after Round 2 is complete
  const isPreSeason = phase !== 'regular-season' || currentRound <= 2

  const preview = useMemo<PreseasonPreview | null>(
    () => isPreSeason
      ? generatePreseasonPreview(players, clubs, ladder, history, currentYear, currentDate, rngSeed)
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPreSeason],
  )

  // Fire inbox event once when the preview is first viewed pre-season
  useEffect(() => {
    if (!isPreSeason || !preview || sentEventRef.current) return
    const eventId = `preseason-preview-${currentYear}`
    if (newsLog.some((n) => n.id === eventId)) return
    sentEventRef.current = true
    addNewsItem({
      id: eventId,
      date: currentDate,
      headline: `${currentYear} Season Preview Published`,
      body: `The annual pre-season player rankings and season outlook are now available. Check the Top 50 countdown, projected All-Australian team, and our predicted ladder tiers heading into Round 1.`,
      category: 'general',
      clubIds: [],
      playerIds: [],
    })
  }, [isPreSeason, preview, currentYear, currentDate, newsLog, addNewsItem])

  // Gate: season already started
  if (!isPreSeason) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Lock className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-base font-semibold text-foreground">Season preview unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The pre-season preview is only available through Round 2.
          </p>
        </div>
      </div>
    )
  }

  if (!preview) return null

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <IntroSection preview={preview} />

      <hr className="border-border" />
      <Top50Section entries={preview.top50} />

      <hr className="border-border" />
      <AllAustralianSection
        slots={preview.projectedAA.slots}
        captainId={preview.projectedAA.captainId}
      />

      <hr className="border-border" />
      <StorylinesSection storylines={preview.storylines} />

      <hr className="border-border" />
      <LadderPredictionsSection predictions={preview.ladderPredictions} />

      <hr className="border-border" />
      <PlayersToWatchSection players={preview.playersToWatch} />

      <div className="py-4 text-center text-[10px] text-muted-foreground/50">
        Generated pre-Round 1, {currentYear} season. All projections are based on current player
        ratings, form, fitness, and club composition.
      </div>
    </div>
  )
}
