import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  getOffseasonPhaseLabel,
  PHASE_ORDER,
} from '@/engine/season/offseasonFlow'
import {
  generatePreseasonFixtures,
  simulatePreseasonMatch,
  simulateIntraClubMatch,
} from '@/engine/season/preseasonMatches'
import type { PreseasonMatchResult } from '@/engine/season/preseasonMatches'
import { SeededRNG } from '@/engine/core/rng'
import type { OffseasonPhase, OffseasonState } from '@/engine/season/offseasonFlow'
import type { Player } from '@/types/player'
import type { NewsItem } from '@/types/game'
import { buildOffseasonSummary } from '@/engine/history/summaryEngine'
import type { TradeGradeLetter } from '@/engine/history/summaryEngine'
import { resolveListConstraints, validateClubList, mustDelist } from '@/engine/rules/listRules'
import { AlertTriangle as AlertTriangleIcon } from 'lucide-react'
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  Trophy,
  UserMinus,
  ArrowLeftRight,
  FileText,
  Users,
  Dumbbell,
  Swords,
  Rocket,
  Newspaper,
  Clock,
  ExternalLink,
  XCircle,
  Star,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_PHASES = PHASE_ORDER

const PHASE_ICONS: Record<OffseasonPhase, React.ReactNode> = {
  'season-end': <Trophy className="h-4 w-4" />,
  retirements: <UserMinus className="h-4 w-4" />,
  delistings: <XCircle className="h-4 w-4" />,
  'trade-period': <ArrowLeftRight className="h-4 w-4" />,
  'free-agency': <FileText className="h-4 w-4" />,
  'national-draft': <Users className="h-4 w-4" />,
  'rookie-draft': <Users className="h-4 w-4" />,
  preseason: <Dumbbell className="h-4 w-4" />,
  'practice-matches': <Swords className="h-4 w-4" />,
  ready: <Rocket className="h-4 w-4" />,
}

const NEWS_CATEGORY_COLORS: Record<string, string> = {
  match: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  trade: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  injury: 'bg-red-500/15 text-red-400 border-red-500/30',
  draft: 'bg-green-500/15 text-green-400 border-green-500/30',
  contract: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  general: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

// ---------------------------------------------------------------------------
// Phase Timeline (vertical stepper)
// ---------------------------------------------------------------------------

function PhaseTimeline({
  currentPhase,
  completedPhases,
}: {
  currentPhase: OffseasonPhase
  completedPhases: OffseasonPhase[]
}) {
  const completedSet = new Set(completedPhases)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium tracking-wide uppercase text-muted-foreground">
          Offseason Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative flex flex-col gap-0">
          {ALL_PHASES.map((phase, idx) => {
            const isCompleted = completedSet.has(phase)
            const isCurrent = phase === currentPhase
            const isFuture = !isCompleted && !isCurrent
            const isLast = idx === ALL_PHASES.length - 1

            return (
              <div key={phase} className="relative flex items-start gap-3">
                {/* Vertical connector line */}
                {!isLast && (
                  <div
                    className={cn(
                      'absolute left-[11px] top-6 h-full w-0.5',
                      isCompleted
                        ? 'bg-green-500/60'
                        : isCurrent
                          ? 'bg-primary/30'
                          : 'bg-muted-foreground/15',
                    )}
                  />
                )}

                {/* Node indicator */}
                <div className="relative z-10 flex-shrink-0 mt-0.5">
                  {isCompleted ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : isCurrent ? (
                    <div className="relative">
                      <Circle className="h-6 w-6 text-primary" />
                      <span className="absolute inset-0 h-6 w-6 animate-ping rounded-full bg-primary/30" />
                    </div>
                  ) : (
                    <Circle className="h-6 w-6 text-muted-foreground/30" />
                  )}
                </div>

                {/* Phase label + icon */}
                <div
                  className={cn(
                    'flex items-center gap-2 pb-5 pt-0.5 text-sm leading-tight',
                    isCompleted && 'text-green-500',
                    isCurrent && 'text-foreground font-semibold',
                    isFuture && 'text-muted-foreground/50',
                  )}
                >
                  <span
                    className={cn(
                      isCurrent && 'text-primary',
                      isCompleted && 'text-green-500/70',
                      isFuture && 'text-muted-foreground/30',
                    )}
                  >
                    {PHASE_ICONS[phase]}
                  </span>
                  <span>{getOffseasonPhaseLabel(phase)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// News Feed Sidebar
// ---------------------------------------------------------------------------

function NewsFeed({ newsLog }: { newsLog: NewsItem[] }) {
  // Show latest 20 items, newest first
  const recentNews = useMemo(
    () => [...newsLog].reverse().slice(0, 20),
    [newsLog],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase text-muted-foreground">
          <Newspaper className="h-4 w-4" />
          News Feed
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recentNews.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No news items yet.
          </p>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {recentNews.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] px-1.5 py-0 leading-4 capitalize',
                      NEWS_CATEGORY_COLORS[item.category] ?? '',
                    )}
                  >
                    {item.category}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {item.date}
                  </span>
                </div>
                <p className="text-xs font-semibold leading-snug">
                  {item.headline}
                </p>
                {item.body && (
                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                    {item.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Phase Content Panels
// ---------------------------------------------------------------------------

function SeasonEndPanel({ year, ladder, clubs }: {
  year: number
  ladder: { clubId: string; wins: number; losses: number; draws: number; points: number; percentage: number }[]
  clubs: Record<string, { fullName: string; abbreviation: string; colors: { primary: string } }>
}) {
  const top4 = ladder.slice(0, 4)
  const premier = ladder[0]

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Season {year} has concluded. Review awards and finalize stats.
      </p>

      {premier && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-4">
          <Trophy className="h-8 w-8 text-yellow-500 flex-shrink-0" />
          <div>
            <p className="font-bold text-lg">
              {clubs[premier.clubId]?.fullName ?? premier.clubId}
            </p>
            <p className="text-sm text-muted-foreground">
              {year} Premiers &mdash; {premier.wins}W {premier.losses}L {premier.draws}D ({premier.percentage.toFixed(1)}%)
            </p>
          </div>
        </div>
      )}

      <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide mt-2">
        Final Top 4
      </div>
      <div className="space-y-1">
        {top4.map((entry, i) => {
          const c = clubs[entry.clubId]
          return (
            <div
              key={entry.clubId}
              className="flex items-center justify-between rounded px-3 py-2 bg-muted/40 border border-border/50"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground w-5 text-right">
                  {i + 1}
                </span>
                <div
                  className="h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c?.colors.primary ?? '#666' }}
                />
                <span className="font-medium text-sm">{c?.fullName ?? entry.clubId}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                <span>{entry.wins}W {entry.losses}L {entry.draws}D</span>
                <Badge variant="secondary" className="w-8 justify-center">
                  {entry.points}
                </Badge>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RetirementsPanel({
  retiredPlayerIds,
  players,
  clubs,
}: {
  retiredPlayerIds: string[]
  players: Record<string, Player>
  clubs: Record<string, { abbreviation: string; colors: { primary: string } }>
}) {
  const retirees = useMemo(
    () => retiredPlayerIds.map((id) => players[id]).filter(Boolean),
    [retiredPlayerIds, players],
  )

  if (retirees.length === 0) {
    return (
      <div className="py-8 text-center">
        <UserMinus className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground font-medium">No retirements</p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          All players have chosen to continue their careers.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {retirees.length} player{retirees.length !== 1 ? 's' : ''} announced retirement.
      </p>
      <div className="divide-y divide-border/50">
        {retirees.map((p) => {
          const club = clubs[p.clubId]
          return (
            <div
              key={p.id}
              className="flex items-center justify-between py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                />
                <div>
                  <p className="font-medium text-sm">
                    {p.firstName} {p.lastName}
                    <span className="ml-2 text-muted-foreground">
                      #{p.jerseyNumber}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {club?.abbreviation ?? p.clubId} &middot; Age {p.age} &middot; {p.position.primary}
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground font-mono">
                <p>{p.careerStats.gamesPlayed} games</p>
                <p>{p.careerStats.goals} goals</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DelistingsPanel({
  playerClubId,
  players,
  delistedPlayerIds,
  onDelist,
  settings,
}: {
  playerClubId: string
  players: Record<string, Player>
  delistedPlayerIds: string[]
  onDelist: (playerId: string) => void
  settings: import('@/types/game').GameSettings
}) {
  const delistedSet = useMemo(() => new Set(delistedPlayerIds), [delistedPlayerIds])

  const clubPlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId && !delistedSet.has(p.id))
        .sort((a, b) => {
          // Sort by overall value: age-weighted and games played
          const aVal = a.careerStats.gamesPlayed
          const bVal = b.careerStats.gamesPlayed
          return aVal - bVal
        }),
    [players, playerClubId, delistedSet],
  )

  const delistedPlayers = useMemo(
    () => delistedPlayerIds.map((id) => players[id]).filter(Boolean),
    [delistedPlayerIds, players],
  )

  const constraints = useMemo(() => resolveListConstraints(settings), [settings])
  const excess = useMemo(() => mustDelist(players, playerClubId, constraints), [players, playerClubId, constraints])

  return (
    <div className="space-y-4">
      {/* Validation banner */}
      {excess > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <AlertTriangleIcon className="h-4 w-4 text-red-400 flex-shrink-0" />
          <p className="text-sm font-medium text-red-400">
            You must delist {excess} more player{excess !== 1 ? 's' : ''} to meet the {constraints.maxTotal}-player roster limit.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
          <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
          <p className="text-sm font-medium text-green-400">
            Your roster meets all list requirements.
          </p>
        </div>
      )}

      {delistedPlayers.length > 0 && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-xs font-medium text-red-400 uppercase tracking-wide mb-2">
            Delisted ({delistedPlayers.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {delistedPlayers.map((p) => (
              <Badge key={p.id} variant="outline" className="text-red-400 border-red-500/30">
                {p.firstName} {p.lastName}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        Select players from your list to delist. AI clubs have completed their delistings.
      </div>

      <div className="divide-y divide-border/50 max-h-[400px] overflow-y-auto">
        {clubPlayers.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between py-2.5 pr-1"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">
                  {p.firstName} {p.lastName}
                  <span className="ml-1.5 text-muted-foreground font-normal">
                    #{p.jerseyNumber}
                  </span>
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{p.position.primary}</span>
                  <span>&middot;</span>
                  <span>Age {p.age}</span>
                  <span>&middot;</span>
                  <span>{p.careerStats.gamesPlayed} gms</span>
                  {p.contract.yearsRemaining > 0 && (
                    <>
                      <span>&middot;</span>
                      <span>{p.contract.yearsRemaining}yr @ ${(p.contract.aav / 1000).toFixed(0)}k</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="flex-shrink-0 ml-2 h-7 text-xs"
              onClick={() => onDelist(p.id)}
            >
              Delist
            </Button>
          </div>
        ))}
        {clubPlayers.length === 0 && (
          <p className="text-center text-muted-foreground py-6 text-sm">
            No players available to delist.
          </p>
        )}
      </div>
    </div>
  )
}

function TradePeriodPanel() {
  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        The trade period is now open. Complete any trades before advancing to the next phase.
      </p>

      <div className="flex items-center gap-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
        <ArrowLeftRight className="h-8 w-8 text-purple-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Trade Centre</p>
          <p className="text-sm text-muted-foreground">
            Negotiate and finalise trades with other clubs.
          </p>
        </div>
        <Button onClick={() => navigate('/trades')} className="flex-shrink-0">
          Go to Trades
          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function FreeAgencyPanel({
  playerClubId,
  players,
}: {
  playerClubId: string
  players: Record<string, Player>
}) {
  const navigate = useNavigate()

  const expiringContracts = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId && p.contract.yearsRemaining <= 1)
        .sort((a, b) => b.contract.aav - a.contract.aav),
    [players, playerClubId],
  )

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Review players with expiring contracts and manage free agency signings.
      </p>

      {expiringContracts.length > 0 ? (
        <>
          <div className="text-xs font-medium text-amber-400 uppercase tracking-wide">
            Expiring Contracts ({expiringContracts.length})
          </div>
          <div className="divide-y divide-border/50 max-h-[250px] overflow-y-auto">
            {expiringContracts.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.position.primary} &middot; Age {p.age} &middot; {p.careerStats.gamesPlayed} gms
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="text-amber-400 border-amber-500/30 font-mono text-xs">
                    ${(p.contract.aav / 1000).toFixed(0)}k/yr
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {p.contract.isRestricted ? 'Restricted FA' : 'Unrestricted FA'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No expiring contracts on your list.
        </p>
      )}

      <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <FileText className="h-8 w-8 text-amber-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Contract Management</p>
          <p className="text-sm text-muted-foreground">
            Re-sign players or let them walk to free agency.
          </p>
        </div>
        <Button onClick={() => navigate('/contracts')} className="flex-shrink-0">
          Go to Contracts
          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function DraftPanel({
  draftType,
  playerClubId,
  clubs,
}: {
  draftType: 'national' | 'rookie'
  playerClubId: string
  clubs: Record<string, { draftPicks: { year: number; round: number; originalClubId: string; currentClubId: string; pickNumber?: number }[] }>
}) {
  const navigate = useNavigate()
  const club = clubs[playerClubId]

  const userPicks = useMemo(() => {
    if (!club) return []
    return club.draftPicks.filter((p) => p.currentClubId === playerClubId)
  }, [club, playerClubId])

  const label = draftType === 'national' ? 'National Draft' : 'Rookie Draft'

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        The {label} is underway. Select the best available talent for your club.
      </p>

      {userPicks.length > 0 && (
        <>
          <div className="text-xs font-medium text-green-400 uppercase tracking-wide">
            Your Draft Picks ({userPicks.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {userPicks.map((pick, i) => (
              <Badge
                key={`${pick.round}-${pick.originalClubId}-${i}`}
                variant="outline"
                className="text-green-400 border-green-500/30 font-mono"
              >
                Rd {pick.round}
                {pick.pickNumber ? ` (#${pick.pickNumber})` : ''}
                {pick.originalClubId !== playerClubId && (
                  <span className="ml-1 text-muted-foreground">
                    via {clubs[pick.originalClubId] ? pick.originalClubId.slice(0, 4).toUpperCase() : pick.originalClubId}
                  </span>
                )}
              </Badge>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
        <Users className="h-8 w-8 text-green-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">
            View the full draft board and make your selections.
          </p>
        </div>
        <Button onClick={() => navigate('/draft')} className="flex-shrink-0">
          Go to Draft
          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function PreseasonPanel() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Animate preseason progress bar
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer)
          return 100
        }
        return prev + 2
      })
    }, 60)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Running pre-season training camp...
      </p>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Training Camp Progress</span>
          <span className="font-mono text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-3" />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
          <Dumbbell className="h-5 w-5 mx-auto text-blue-400 mb-1" />
          <p className="text-xs text-muted-foreground">Fitness Testing</p>
          <p className="text-sm font-medium mt-0.5">
            {progress >= 33 ? 'Complete' : 'In Progress'}
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
          <Users className="h-5 w-5 mx-auto text-green-400 mb-1" />
          <p className="text-xs text-muted-foreground">Team Drills</p>
          <p className="text-sm font-medium mt-0.5">
            {progress >= 66 ? 'Complete' : progress >= 33 ? 'In Progress' : 'Pending'}
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
          <Star className="h-5 w-5 mx-auto text-amber-400 mb-1" />
          <p className="text-xs text-muted-foreground">Match Sims</p>
          <p className="text-sm font-medium mt-0.5">
            {progress >= 100 ? 'Complete' : progress >= 66 ? 'In Progress' : 'Pending'}
          </p>
        </div>
      </div>
    </div>
  )
}

function PracticeMatchesPanel({
  playerClubId,
  players,
  clubs,
}: {
  playerClubId: string
  players: Record<string, Player>
  clubs: Record<string, { homeGround: string; fullName: string; abbreviation: string; colors: { primary: string } }>
}) {
  const [results, setResults] = useState<PreseasonMatchResult[]>([])
  const [simSeed] = useState(() => Date.now())

  const handleFriendly = () => {
    const rng = new SeededRNG(simSeed + results.length * 113)
    const fixtures = generatePreseasonFixtures(clubs as Record<string, import('@/types/club').Club>, playerClubId, 1, simSeed + results.length)
    if (fixtures.length > 0) {
      const f = fixtures[0]
      const result = simulatePreseasonMatch(f.homeClubId, f.awayClubId, f.venue, players, rng)
      setResults((prev) => [...prev, result])
    }
  }

  const handleIntraClub = () => {
    const rng = new SeededRNG(simSeed + results.length * 997)
    const result = simulateIntraClubMatch(playerClubId, players, clubs as Record<string, import('@/types/club').Club>, rng)
    setResults((prev) => [...prev, result])
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Schedule practice matches to prepare your squad for the season.
      </p>

      <div className="flex gap-3">
        <Button variant="default" onClick={handleFriendly} disabled={results.length >= 4}>
          <Swords className="mr-1.5 h-4 w-4" />
          Schedule Friendly
        </Button>
        <Button variant="outline" onClick={handleIntraClub} disabled={results.length >= 4}>
          <Users className="mr-1.5 h-4 w-4" />
          Intra-Club Match
        </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Results ({results.length})
          </p>
          {results.map((r, i) => {
            const homeClub = clubs[r.homeClubId]
            const awayClub = r.isIntraClub ? null : clubs[r.awayClubId]
            return (
              <div key={i} className="flex items-center justify-between rounded border border-border/50 bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: homeClub?.colors.primary ?? '#666' }}
                  />
                  <span className="text-sm font-medium">
                    {r.isIntraClub ? 'Team A' : (homeClub?.abbreviation ?? r.homeClubId)}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold font-mono">
                    {r.homeScore.goals}.{r.homeScore.behinds} ({r.homeScore.total}) - {r.awayScore.goals}.{r.awayScore.behinds} ({r.awayScore.total})
                  </span>
                  <p className="text-[10px] text-muted-foreground">{r.venue}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {r.isIntraClub ? 'Team B' : (awayClub?.abbreviation ?? r.awayClubId)}
                  </span>
                  {!r.isIntraClub && (
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: awayClub?.colors.primary ?? '#666' }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {results.length === 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Matches Played</p>
            <p className="text-lg font-bold mt-1">0</p>
            <p className="text-xs text-muted-foreground">Schedule some matches above</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Max Matches</p>
            <p className="text-lg font-bold mt-1">4</p>
            <p className="text-xs text-muted-foreground">Friendlies + intra-club</p>
          </div>
        </div>
      )}
    </div>
  )
}

function gradeColor(grade: TradeGradeLetter): string {
  if (grade.startsWith('A')) return 'bg-green-600 text-white'
  if (grade.startsWith('B')) return 'bg-yellow-500 text-black'
  if (grade === 'C') return 'bg-yellow-600 text-white'
  return 'bg-red-500 text-white'
}

function SeasonReviewPanel({
  year,
}: {
  year: number
}) {
  const history = useGameStore((s) => s.history)
  const tradeHistory = useGameStore((s) => s.tradeHistory)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const [expanded, setExpanded] = useState(true)

  const summary = useMemo(
    () => buildOffseasonSummary(year, history, tradeHistory, players, clubs),
    [year, history, tradeHistory, players, clubs],
  )

  if (!summary.premierClubId && summary.draftPicks.length === 0) return null

  return (
    <Card className="border-primary/30">
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Season {year} Review
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {expanded ? 'Collapse' : 'Expand'}
          </Badge>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {/* Premier */}
          {summary.premierClubId && (
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-3">
              <Trophy className="h-6 w-6 text-yellow-500 flex-shrink-0" />
              <div>
                <p className="font-bold">{summary.premierClubName}</p>
                {summary.grandFinalScore && (
                  <p className="text-sm text-muted-foreground">
                    Grand Final: {summary.grandFinalScore.home} - {summary.grandFinalScore.away}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Retirements */}
          {summary.retirements.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Retirements ({summary.retirements.length})
              </p>
              <div className="space-y-1">
                {summary.retirements.slice(0, 5).map((r) => (
                  <div key={r.playerId} className="flex justify-between text-sm">
                    <span>{r.playerName}</span>
                    <span className="text-muted-foreground font-mono">
                      {r.careerGames} gms, {r.careerGoals} gls
                    </span>
                  </div>
                ))}
                {summary.retirements.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    +{summary.retirements.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Key Trades */}
          {summary.trades.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Key Trades ({summary.trades.length})
              </p>
              <div className="space-y-2">
                {summary.trades.slice(0, 5).map((trade) => (
                  <div key={trade.id} className="flex items-center justify-between rounded border p-2 text-sm">
                    <span>
                      {clubs[trade.clubA]?.abbreviation ?? trade.clubA}{' '}
                      &harr;{' '}
                      {clubs[trade.clubB]?.abbreviation ?? trade.clubB}
                    </span>
                    {trade.grade && (
                      <div className="flex gap-1">
                        <Badge className={gradeColor(trade.grade.clubAGrade)}>
                          {trade.grade.clubAGrade}
                        </Badge>
                        <Badge className={gradeColor(trade.grade.clubBGrade)}>
                          {trade.grade.clubBGrade}
                        </Badge>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Draft Picks */}
          {summary.draftPicks.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Draft Picks ({summary.draftPicks.length})
              </p>
              <div className="space-y-1">
                {summary.draftPicks.slice(0, 8).map((pick) => (
                  <div key={`${pick.year}-${pick.pickNumber}`} className="flex justify-between text-sm">
                    <span className="font-mono text-muted-foreground">#{pick.pickNumber}</span>
                    <span>{pick.playerName}</span>
                    <Badge variant="outline" className="text-xs">{pick.position}</Badge>
                    <span className="text-muted-foreground">
                      {clubs[pick.clubId]?.abbreviation ?? pick.clubId}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Draft Steals */}
          {summary.draftSteals.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Draft Steals
              </p>
              <div className="space-y-1">
                {summary.draftSteals.slice(0, 5).map((steal) => (
                  <div key={steal.playerId} className="flex justify-between text-sm">
                    <span>{steal.playerName} (Pick #{steal.pickNumber})</span>
                    <span className="font-mono text-green-500">OVR {steal.currentOverall}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function ReadyPanel({ year }: { year: number }) {
  return (
    <div className="space-y-6">
      <SeasonReviewPanel year={year} />

      <div className="flex flex-col items-center justify-center py-8 space-y-6 text-center">
        <div className="relative">
          <Rocket className="h-16 w-16 text-primary" />
          <span className="absolute -top-1 -right-1 h-5 w-5 animate-ping rounded-full bg-green-500/40" />
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-green-500" />
        </div>

        <div>
          <h2 className="text-2xl font-bold">
            Ready for Season {year + 1}!
          </h2>
          <p className="text-muted-foreground mt-2 max-w-md">
            The offseason is complete. Your squad is assembled, contracts are signed,
            and the fixture awaits. Time to compete.
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Current Phase Panel (main content area)
// ---------------------------------------------------------------------------

function CurrentPhasePanel({
  offseasonState,
  year,
  playerClubId,
  players,
  clubs,
  ladder,
  onAdvance,
  onDelist,
  onStartSeason,
  advanceError,
  canAdvance,
  settings,
}: {
  offseasonState: OffseasonState
  year: number
  playerClubId: string
  players: Record<string, Player>
  clubs: Record<string, {
    fullName: string
    abbreviation: string
    name: string
    homeGround: string
    colors: { primary: string }
    draftPicks: { year: number; round: number; originalClubId: string; currentClubId: string; pickNumber?: number }[]
  }>
  ladder: { clubId: string; wins: number; losses: number; draws: number; points: number; percentage: number }[]
  onAdvance: () => void
  onDelist: (playerId: string) => void
  onStartSeason: () => void
  advanceError: string | null
  canAdvance: boolean
  settings: import('@/types/game').GameSettings
}) {
  const { currentPhase } = offseasonState
  const isReady = currentPhase === 'ready'

  return (
    <Card className="flex-1">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              {PHASE_ICONS[currentPhase]}
            </div>
            <div>
              <CardTitle>{getOffseasonPhaseLabel(currentPhase)}</CardTitle>
              <CardDescription className="mt-0.5">
                Phase {ALL_PHASES.indexOf(currentPhase) + 1} of {ALL_PHASES.length}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className="text-primary border-primary/30 uppercase text-[10px] tracking-wider"
          >
            Current Phase
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Phase-specific content */}
        {currentPhase === 'season-end' && (
          <SeasonEndPanel year={year} ladder={ladder} clubs={clubs} />
        )}
        {currentPhase === 'retirements' && (
          <RetirementsPanel
            retiredPlayerIds={offseasonState.retiredPlayerIds}
            players={players}
            clubs={clubs}
          />
        )}
        {currentPhase === 'delistings' && (
          <DelistingsPanel
            playerClubId={playerClubId}
            players={players}
            delistedPlayerIds={offseasonState.delistedPlayerIds}
            onDelist={onDelist}
            settings={settings}
          />
        )}
        {currentPhase === 'trade-period' && <TradePeriodPanel />}
        {currentPhase === 'free-agency' && (
          <FreeAgencyPanel playerClubId={playerClubId} players={players} />
        )}
        {currentPhase === 'national-draft' && (
          <DraftPanel draftType="national" playerClubId={playerClubId} clubs={clubs} />
        )}
        {currentPhase === 'rookie-draft' && (
          <DraftPanel draftType="rookie" playerClubId={playerClubId} clubs={clubs} />
        )}
        {currentPhase === 'preseason' && <PreseasonPanel />}
        {currentPhase === 'practice-matches' && (
          <PracticeMatchesPanel
            playerClubId={playerClubId}
            players={players}
            clubs={clubs}
          />
        )}
        {currentPhase === 'ready' && <ReadyPanel year={year} />}

        {/* Error display */}
        {advanceError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <AlertTriangleIcon className="h-4 w-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{advanceError}</p>
          </div>
        )}

        {/* Advance / Start Season button */}
        <div className="flex items-center justify-end pt-2 border-t border-border/50">
          {isReady ? (
            <Button size="lg" onClick={onStartSeason} className="gap-2">
              <Rocket className="h-4 w-4" />
              Start Season {year + 1}
            </Button>
          ) : (
            <Button onClick={onAdvance} disabled={!canAdvance} className="gap-2">
              Advance Phase
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function OffseasonPage() {
  const navigate = useNavigate()

  // Store selectors
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const newsLog = useGameStore((s) => s.newsLog)
  const currentYear = useGameStore((s) => s.currentYear)
  const ladder = useGameStore((s) => s.ladder)
  const settings = useGameStore((s) => s.settings)
  const offseasonState = useGameStore((s) => s.offseasonState)
  const advancePhase = useGameStore((s) => s.advanceOffseasonPhase)
  const delistPlayer = useGameStore((s) => s.delistPlayerOffseason)
  const startNewSeasonAction = useGameStore((s) => s.startNewSeasonAction)

  // Validation error state
  const [advanceError, setAdvanceError] = useState<string | null>(null)

  // Compute canAdvance for delistings phase
  const canAdvance = useMemo(() => {
    if (!offseasonState) return false
    if (offseasonState.currentPhase === 'delistings') {
      const constraints = resolveListConstraints(settings)
      const validation = validateClubList(players, playerClubId, constraints)
      return validation.valid
    }
    return true
  }, [offseasonState, players, playerClubId, settings])

  // Handlers
  const handleAdvancePhase = useCallback(() => {
    const result = advancePhase()
    if (!result.success) {
      setAdvanceError(result.error)
    } else {
      setAdvanceError(null)
    }
  }, [advancePhase])

  const handleDelist = useCallback((playerId: string) => {
    delistPlayer(playerId)
    setAdvanceError(null)
  }, [delistPlayer])

  const handleStartSeason = useCallback(() => {
    startNewSeasonAction()
    navigate('/')
  }, [startNewSeasonAction, navigate])

  // Club info for header
  const club = clubs[playerClubId]

  // Null guard: no offseason in progress
  if (!offseasonState) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-lg text-muted-foreground">No offseason in progress.</p>
        <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <div
          className="h-12 w-12 rounded-full flex-shrink-0"
          style={{ backgroundColor: club?.colors.primary ?? '#666' }}
        />
        <div>
          <h1 className="text-2xl font-bold">
            {currentYear} Offseason
          </h1>
          <p className="text-muted-foreground">
            {club?.fullName ?? 'Unknown Club'} &middot; Offseason Management
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            <Clock className="mr-1 h-3 w-3" />
            {getOffseasonPhaseLabel(offseasonState.currentPhase)}
          </Badge>
        </div>
      </div>

      {/* Two-column layout: 2/3 main panel, 1/3 timeline + news */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Current Phase Panel (2/3) */}
        <div className="lg:col-span-2">
          <CurrentPhasePanel
            offseasonState={offseasonState}
            year={currentYear}
            playerClubId={playerClubId}
            players={players}
            clubs={clubs}
            ladder={ladder}
            onAdvance={handleAdvancePhase}
            onDelist={handleDelist}
            onStartSeason={handleStartSeason}
            advanceError={advanceError}
            canAdvance={canAdvance}
            settings={settings}
          />
        </div>

        {/* Right: Timeline + News Feed (1/3) */}
        <div className="space-y-6">
          <PhaseTimeline
            currentPhase={offseasonState.currentPhase}
            completedPhases={offseasonState.completedPhases}
          />
          <NewsFeed newsLog={newsLog} />
        </div>
      </div>
    </div>
  )
}
