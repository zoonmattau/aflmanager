import { useMemo, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Trophy,
  Star,
  TrendingUp,
  AlertTriangle,
  Swords,
  Heart,
  FileText,
  ChevronDown,
  ChevronUp,
  Users,
  Eye,
  Flame,
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
    case 'premiership-contenders': return 'text-amber-400'
    case 'finals-contenders': return 'text-emerald-400'
    case 'mid-table': return 'text-blue-400'
    case 'rebuilding': return 'text-zinc-400'
    default: return 'text-zinc-300'
  }
}

function tierBorder(tier: string): string {
  switch (tier) {
    case 'premiership-contenders': return 'border-amber-500/40'
    case 'finals-contenders': return 'border-emerald-500/40'
    case 'mid-table': return 'border-blue-500/40'
    case 'rebuilding': return 'border-zinc-600'
    default: return 'border-zinc-700'
  }
}

function storyIcon(cat: StorylineCategory) {
  switch (cat) {
    case 'premiership-favourites': return <Trophy className="h-4 w-4 text-amber-400" />
    case 'rebuilding': return <TrendingUp className="h-4 w-4 text-blue-400" />
    case 'breakout-candidates': return <Flame className="h-4 w-4 text-orange-400" />
    case 'coach-hot-seats': return <AlertTriangle className="h-4 w-4 text-red-400" />
    case 'rivalry-rematches': return <Swords className="h-4 w-4 text-purple-400" />
    case 'injury-returns': return <Heart className="h-4 w-4 text-green-400" />
    case 'contract-year': return <FileText className="h-4 w-4 text-cyan-400" />
  }
}

function StarDisplay({ stars }: { stars: number }) {
  const full = Math.floor(stars)
  const half = stars % 1 >= 0.5
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400">
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
      <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
        {preview.headline}
      </h1>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span>Season Preview</span>
        <span>·</span>
        <span>{preview.generatedDate}</span>
      </div>
      <p className="text-sm leading-relaxed text-zinc-300">
        {preview.intro}
      </p>
    </div>
  )
}

function Top50Section({ entries }: { entries: Top50Entry[] }) {
  const [expanded, setExpanded] = useState(false)
  // Show first 10 by default, rest on expand
  const visible = expanded ? entries : entries.slice(0, 10)
  // Display in reverse order (countdown style) — 50 → 1
  const reversed = [...visible].reverse()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-400" />
        <h2 className="text-lg font-bold text-white">Top 50 Players</h2>
        <Badge variant="outline" className="text-xs">{entries.length}</Badge>
      </div>
      <p className="text-xs text-zinc-500">
        The best players in the competition heading into Round 1, ranked from {entries.length} down to No. 1.
      </p>

      <div className="space-y-2">
        {reversed.map((entry) => (
          <Top50Card key={entry.playerId} entry={entry} />
        ))}
      </div>

      {entries.length > 10 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="w-full text-zinc-400 hover:text-white"
        >
          {expanded ? (
            <>Show Less <ChevronUp className="ml-1 h-3 w-3" /></>
          ) : (
            <>Show Full Top 50 Countdown <ChevronDown className="ml-1 h-3 w-3" /></>
          )}
        </Button>
      )}
    </div>
  )
}

function Top50Card({ entry }: { entry: Top50Entry }) {
  const isTop10 = entry.rank <= 10
  const isTop3 = entry.rank <= 3

  return (
    <Card className={cn(
      'border-zinc-700 bg-zinc-800/60',
      isTop3 && 'border-amber-500/50 bg-amber-500/5',
      isTop10 && !isTop3 && 'border-zinc-600',
    )}>
      <CardContent className="flex gap-3 p-3">
        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold tabular-nums',
          isTop3 ? 'bg-amber-500/20 text-amber-400 text-lg' :
          isTop10 ? 'bg-zinc-700 text-zinc-200 text-base' :
          'bg-zinc-800 text-zinc-400 text-sm',
        )}>
          {entry.rank}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/player/${entry.playerId}`}
              className="truncate font-semibold text-white hover:text-amber-400 hover:underline"
            >
              {entry.playerName}
            </Link>
            <StarDisplay stars={entry.stars} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
            <Link to={`/club/${entry.clubId}`} className="hover:text-zinc-200">
              {entry.clubName}
            </Link>
            <span>·</span>
            <span>{posLabel(entry.position)}</span>
            <span>·</span>
            <span>{entry.age}yo</span>
            <span>·</span>
            <span className="font-medium text-zinc-300">{entry.overall} OVR</span>
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">
            {entry.writeup}
          </p>
        </div>
      </CardContent>
    </Card>
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
        <Users className="h-5 w-5 text-cyan-400" />
        <h2 className="text-lg font-bold text-white">Projected All-Australian</h2>
      </div>
      <p className="text-xs text-zinc-500">
        Our predicted 22-player All-Australian squad based on pre-season ratings and form.
      </p>

      <div className="space-y-3">
        {order.map((position) => {
          const group = groups[position]
          if (!group || group.length === 0) return null
          return (
            <div key={position}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {position}s ({group.length})
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((slot) => (
                  <div
                    key={slot.playerId}
                    className={cn(
                      'flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/40 px-2.5 py-1.5',
                      slot.playerId === captainId && 'border-amber-500/50',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/player/${slot.playerId}`}
                          className="truncate text-xs font-medium text-white hover:text-amber-400"
                        >
                          {slot.playerName}
                        </Link>
                        {slot.playerId === captainId && (
                          <Badge className="h-4 bg-amber-500/20 px-1 text-[9px] text-amber-400">C</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
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
        <Eye className="h-5 w-5 text-purple-400" />
        <h2 className="text-lg font-bold text-white">Season Storylines</h2>
      </div>
      <p className="text-xs text-zinc-500">
        The narratives that will shape the season. From flag contenders to coaching pressure, here's what to watch.
      </p>

      <div className="space-y-2">
        {storylines.map((story, i) => (
          <Card key={i} className="border-zinc-700 bg-zinc-800/60">
            <CardContent className="p-3">
              <div className="mb-1.5 flex items-center gap-2">
                {storyIcon(story.category)}
                <h3 className="text-sm font-semibold text-white">
                  {story.title}
                </h3>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">
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
        <TrendingUp className="h-5 w-5 text-emerald-400" />
        <h2 className="text-lg font-bold text-white">Predicted Ladder Tiers</h2>
      </div>
      <p className="text-xs text-zinc-500">
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
                    className="min-w-[100px] shrink-0 text-xs font-medium text-white hover:text-amber-400"
                  >
                    {club.clubName}
                  </Link>
                  <span className="text-[11px] leading-relaxed text-zinc-500">
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
        <Flame className="h-5 w-5 text-orange-400" />
        <h2 className="text-lg font-bold text-white">Players to Watch</h2>
      </div>
      <p className="text-xs text-zinc-500">
        Ten players from across the league who could define the season — for different reasons.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {players.map((pw) => (
          <Card key={pw.playerId} className="border-zinc-700 bg-zinc-800/60">
            <CardContent className="p-2.5">
              <div className="flex items-center gap-1.5">
                <Link
                  to={`/player/${pw.playerId}`}
                  className="truncate text-xs font-semibold text-white hover:text-amber-400"
                >
                  {pw.playerName}
                </Link>
                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                  {posLabel(pw.position)}
                </Badge>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                <Link to={`/club/${pw.clubId}`} className="hover:text-zinc-300">
                  {pw.clubName}
                </Link>
                <span>·</span>
                <span>{pw.age}yo</span>
                <span>·</span>
                <span>{pw.overall} OVR</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
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

  const preview = useMemo<PreseasonPreview>(
    () => generatePreseasonPreview(players, clubs, ladder, history, currentYear, currentDate, rngSeed),
    [players, clubs, ladder, history, currentYear, currentDate, rngSeed],
  )

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <IntroSection preview={preview} />

      <hr className="border-zinc-800" />
      <Top50Section entries={preview.top50} />

      <hr className="border-zinc-800" />
      <AllAustralianSection
        slots={preview.projectedAA.slots}
        captainId={preview.projectedAA.captainId}
      />

      <hr className="border-zinc-800" />
      <StorylinesSection storylines={preview.storylines} />

      <hr className="border-zinc-800" />
      <LadderPredictionsSection predictions={preview.ladderPredictions} />

      <hr className="border-zinc-800" />
      <PlayersToWatchSection players={preview.playersToWatch} />

      <div className="py-4 text-center text-[10px] text-zinc-600">
        Generated pre-Round 1, {currentYear} season. All projections are based on current player
        ratings, form, fitness, and club composition.
      </div>
    </div>
  )
}
