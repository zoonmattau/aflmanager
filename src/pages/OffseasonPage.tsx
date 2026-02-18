import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  getOffseasonPhaseLabel,
  PHASE_ORDER,
  getUnsignedPool,
} from '@/engine/season/offseasonFlow'
import {
  getOverallRating,
  getPlayerStarRating,
  getPlayerTier,
  getPlayerTags,
  type PlayerTier,
  type PlayerTagKey,
} from '@/engine/player/playerRating'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { POSITION_LINE } from '@/engine/core/constants'
import { isPlayerEligibleForPositionLine } from '@/engine/player/positionEligibility'
import { calculatePlayerValue } from '@/engine/contracts/negotiation'
import {
  generatePreseasonFixtures,
  simulatePreseasonMatch,
  simulateIntraClubMatch,
} from '@/engine/season/preseasonMatches'
import type { PreseasonMatchResult } from '@/engine/season/preseasonMatches'
import { SeededRNG } from '@/engine/core/rng'
import type { OffseasonState } from '@/engine/season/offseasonFlow'
import type { Player } from '@/types/player'
import type { NewsItem } from '@/types/game'
import { buildOffseasonSummary } from '@/engine/history/summaryEngine'
import type { TradeGradeLetter } from '@/engine/history/summaryEngine'
import { resolveListConstraints, mustDelist } from '@/engine/rules/listRules'
import { validateOffseasonProgression } from '@/engine/offseason/offseasonCalendar'
import { OffseasonStatusDashboard } from '@/components/offseason/OffseasonStatusDashboard'
import { FreeAgencyMarketPanel } from '@/components/offseason/FreeAgencyMarketPanel'
import { PhaseTimeline, PHASE_ICONS } from '@/components/offseason/PhaseTimeline'
import { AlertTriangle as AlertTriangleIcon } from 'lucide-react'
import {
  CheckCircle2,
  ChevronRight,
  Trophy,
  UserMinus,
  ArrowLeftRight,
  Users,
  Dumbbell,
  Swords,
  Rocket,
  Newspaper,
  Clock,
  ExternalLink,
  Star,
  MapPin,
  UserPlus,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_PHASES = PHASE_ORDER

const NEWS_CATEGORY_COLORS: Record<string, string> = {
  match: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  trade: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  injury: 'bg-red-500/15 text-red-400 border-red-500/30',
  discipline: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  draft: 'bg-green-500/15 text-green-400 border-green-500/30',
  contract: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  milestone: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  general: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

// ---------------------------------------------------------------------------
// Shared player rating helpers
// ---------------------------------------------------------------------------

function tierColor(tier: PlayerTier): string {
  switch (tier) {
    case 'elite': return 'text-green-500'
    case 'good': return 'text-emerald-400'
    case 'average': return 'text-yellow-500'
    case 'developing': return 'text-orange-500'
    case 'poor': return 'text-red-500'
  }
}

function tierBorder(tier: PlayerTier): string {
  switch (tier) {
    case 'elite': return 'border-l-2 border-l-green-500'
    case 'good': return 'border-l-2 border-l-emerald-400'
    case 'poor': return 'border-l-2 border-l-red-500'
    default: return ''
  }
}

function tagStyle(key: PlayerTagKey): string {
  switch (key) {
    case 'injured': return 'bg-red-500/15 text-red-600 border-red-500/30'
    case 'suspended': return 'bg-orange-500/15 text-orange-600 border-orange-500/30'
    case 'expiring': return 'bg-amber-500/15 text-amber-600 border-amber-500/30'
    case 'unhappy': return 'bg-orange-500/15 text-orange-600 border-orange-500/30'
    case 'high-potential': return 'bg-blue-500/15 text-blue-600 border-blue-500/30'
    case 'ageing': return 'bg-purple-500/15 text-purple-600 border-purple-500/30'
    case 'trade-listed': return 'bg-rose-500/15 text-rose-600 border-rose-500/30'
  }
}

// PhaseTimeline is now imported from @/components/offseason/PhaseTimeline

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
                {item.media?.reporterName && item.media?.outletName && (
                  <p className="text-[10px] text-muted-foreground/80 leading-snug">
                    Reported by {item.media.reporterName} ({item.media.outletName})
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
  const history = useGameStore((s) => s.history)

  const retirees = useMemo(
    () => retiredPlayerIds.map((id) => players[id]).filter(Boolean),
    [retiredPlayerIds, players],
  )
  const legacyByPlayer = useMemo(() => {
    const out = new Map<string, import('@/types/history').RetirementLegacyEntry>()
    for (const entry of history.retirementLegacies ?? []) {
      if (!retiredPlayerIds.includes(entry.playerId)) continue
      out.set(entry.playerId, entry)
    }
    return out
  }, [history.retirementLegacies, retiredPlayerIds])
  const featuredLegacies = useMemo(
    () =>
      retirees
        .map((p) => legacyByPlayer.get(p.id))
        .filter((entry): entry is import('@/types/history').RetirementLegacyEntry => Boolean(entry))
        .filter((entry) => entry.tier !== 'veteran')
        .sort((a, b) => {
          const scoreA = a.gamesPlayed + a.goals * 0.35 + a.overallAtRetirement * 1.2
          const scoreB = b.gamesPlayed + b.goals * 0.35 + b.overallAtRetirement * 1.2
          return scoreB - scoreA
        }),
    [retirees, legacyByPlayer],
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
      {featuredLegacies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Retirement Ceremony
          </p>
          {featuredLegacies.map((legacy) => (
            <div key={legacy.playerId} className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3">
              <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">{legacy.ceremonyHeadline}</p>
              <p className="mt-1 text-xs text-muted-foreground">{legacy.ceremonySummary}</p>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <Badge variant="outline">{legacy.tier === 'legend' ? 'Legend' : 'Club Great'}</Badge>
                {legacy.hallOfFameEligible && (
                  <Badge className="bg-green-600 text-white">Hall of Fame Eligible</Badge>
                )}
                {legacy.inductedClubHallOfFame && (
                  <Badge className="bg-blue-600 text-white">Inducted</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="divide-y divide-border/50">
        {retirees.map((p) => {
          const legacy = legacyByPlayer.get(p.id)
          const club = legacy ? clubs[legacy.retiredFromClubId] : undefined
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
                    {club?.abbreviation ?? legacy?.retiredFromClubName ?? p.clubId} &middot; Age {p.age} &middot; {p.position.primary}
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
        .sort((a, b) => getOverallRating(a) - getOverallRating(b)),
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
            {delistedPlayers.map((p) => {
              const ovr = getOverallRating(p)
              return (
                <Badge key={p.id} variant="outline" className="text-red-400 border-red-500/30">
                  {p.firstName} {p.lastName}
                  <span className="ml-1 text-muted-foreground">OVR {ovr}</span>
                </Badge>
              )
            })}
          </div>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        Select players from your list to delist. Sorted by overall rating (weakest first). AI clubs have completed their delistings.
        Delisted players enter the unsigned pool and may be signed by any club during free agency.
      </div>

      <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
        {clubPlayers.map((p) => {
          const ovr = getOverallRating(p)
          const tier = getPlayerTier(ovr)
          const stars = getPlayerStarRating(p, ovr)
          const tags = getPlayerTags(p)
          const line = POSITION_LINE[p.position.primary]

          return (
            <div
              key={p.id}
              className={`flex items-center justify-between py-2.5 pr-1 ${tierBorder(tier)}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">
                      {p.firstName} {p.lastName}
                      <span className="ml-1.5 text-muted-foreground font-normal">
                        #{p.jerseyNumber}
                      </span>
                    </p>
                    <PlayerStarRating stars={stars} player={p} overall={ovr} className="scale-[0.85] origin-left" />
                    <span className={`text-xs font-semibold tabular-nums ${tierColor(tier)}`}>
                      {ovr}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      {p.position.primary}
                    </Badge>
                    <span className="text-muted-foreground/60">{line}</span>
                    <span>&middot;</span>
                    <span>Age {p.age}</span>
                    <span>&middot;</span>
                    <span>{p.careerStats.gamesPlayed} gms</span>
                    <span>&middot;</span>
                    <span>{p.careerStats.goals} gls</span>
                    {p.contract.yearsRemaining > 0 && (
                      <>
                        <span>&middot;</span>
                        <span className="font-mono">{p.contract.yearsRemaining}yr / ${(p.contract.aav / 1000).toFixed(0)}k</span>
                      </>
                    )}
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map((tag) => (
                        <Badge key={tag.key} variant="outline" className={`text-[9px] px-1 py-0 ${tagStyle(tag.key)}`}>
                          {tag.label}
                        </Badge>
                      ))}
                    </div>
                  )}
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
          )
        })}
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

function UnsignedPoolPanel({
  players,
  onSign,
}: {
  players: Record<string, Player>
  onSign: (playerId: string, years: number, aav: number) => { success: boolean; error?: string }
}) {
  const [posFilter, setPosFilter] = useState<string>('')
  const [signError, setSignError] = useState<string | null>(null)
  const [signSuccess, setSignSuccess] = useState<string | null>(null)

  const unsignedPlayers = useMemo(
    () =>
      getUnsignedPool(players)
        .filter((p) => posFilter === '' || isPlayerEligibleForPositionLine(p, posFilter as 'DEF' | 'MID' | 'FWD' | 'RK'))
        .sort((a, b) => getOverallRating(b) - getOverallRating(a)),
    [players, posFilter],
  )

  function handleSign(player: Player) {
    const marketValue = calculatePlayerValue(player)
    const years = player.age <= 24 ? 3 : player.age <= 28 ? 2 : 1
    const result = onSign(player.id, years, marketValue)
    if (result.success) {
      setSignError(null)
      setSignSuccess(`${player.firstName} ${player.lastName} signed!`)
      setTimeout(() => setSignSuccess(null), 3000)
    } else {
      setSignError(result.error ?? 'Failed to sign player')
      setSignSuccess(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-cyan-400 uppercase tracking-wide">
          Unsigned Player Pool ({unsignedPlayers.length})
        </div>
        <div className="flex gap-1">
          {['', 'DEF', 'MID', 'FWD', 'RK'].map((pos) => (
            <Button
              key={pos || 'all'}
              variant={posFilter === pos ? 'default' : 'outline'}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setPosFilter(pos)}
            >
              {pos || 'All'}
            </Button>
          ))}
        </div>
      </div>

      {signError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
          <AlertTriangleIcon className="h-3 w-3 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-400">{signError}</p>
        </div>
      )}
      {signSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-2">
          <CheckCircle2 className="h-3 w-3 text-green-400 flex-shrink-0" />
          <p className="text-xs text-green-400">{signSuccess}</p>
        </div>
      )}

      {unsignedPlayers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No unsigned players available.
        </p>
      ) : (
        <div className="divide-y divide-border/50 max-h-[300px] overflow-y-auto">
          {unsignedPlayers.map((p) => {
            const ovr = getOverallRating(p)
            const tier = getPlayerTier(ovr)
            const stars = getPlayerStarRating(p, ovr)
            const tags = getPlayerTags(p)
            const marketValue = calculatePlayerValue(p)
            const suggestedYears = p.age <= 24 ? 3 : p.age <= 28 ? 2 : 1

            return (
              <div
                key={p.id}
                className={`flex items-center justify-between py-2.5 pr-1 ${tierBorder(tier)}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">
                        {p.firstName} {p.lastName}
                      </p>
                      <PlayerStarRating stars={stars} player={p} overall={ovr} className="scale-[0.85] origin-left" />
                      <span className={`text-xs font-semibold tabular-nums ${tierColor(tier)}`}>
                        {ovr}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        {p.position.primary}
                      </Badge>
                      <span>Age {p.age}</span>
                      <span>&middot;</span>
                      <span>{p.careerStats.gamesPlayed} gms</span>
                      <span>&middot;</span>
                      <span>{p.careerStats.goals} gls</span>
                      <span>&middot;</span>
                      <span className="font-mono text-cyan-400">
                        ~{suggestedYears}yr / ${(marketValue / 1000).toFixed(0)}k
                      </span>
                    </div>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {tags.map((tag) => (
                          <Badge key={tag.key} variant="outline" className={`text-[9px] px-1 py-0 ${tagStyle(tag.key)}`}>
                            {tag.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0 ml-2 h-7 text-xs text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
                  onClick={() => handleSign(p)}
                >
                  <UserPlus className="mr-1 h-3 w-3" />
                  Sign
                </Button>
              </div>
            )
          })}
        </div>
      )}
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

function VenueAllocationPanel() {
  const offseasonState = useGameStore((s) => s.offseasonState)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const acceptVenueOffer = useGameStore((s) => s.acceptVenueOffer)
  const rejectVenueOffer = useGameStore((s) => s.rejectVenueOffer)
  const setSecondaryHomeGames = useGameStore((s) => s.setSecondaryHomeGames)

  const offers = offseasonState?.venueOffers ?? []
  const config = offseasonState?.venueConfig
  const club = clubs[playerClubId]
  const fanSat = club?.fanSatisfaction ?? 60

  if (!config) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Venue allocations have been set automatically.</p>
      </div>
    )
  }

  const totalHome = config.homeGamesAtPrimary + config.homeGamesAtSecondary + config.soldHomeGames.length

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Manage your home ground schedule for the upcoming season. You have {totalHome} home games to allocate.
      </p>

      {/* Home Ground Summary */}
      <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Home Ground Allocation
        </h4>
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-md bg-background/50 p-2">
            <div className="text-lg font-bold text-primary">{config.homeGamesAtPrimary}</div>
            <div className="text-xs text-muted-foreground">Primary</div>
          </div>
          {config.secondaryVenueId && (
            <div className="rounded-md bg-background/50 p-2">
              <div className="text-lg font-bold text-amber-400">{config.homeGamesAtSecondary}</div>
              <div className="text-xs text-muted-foreground">Secondary</div>
            </div>
          )}
          <div className="rounded-md bg-background/50 p-2">
            <div className="text-lg font-bold text-red-400">{config.soldHomeGames.length}</div>
            <div className="text-xs text-muted-foreground">Sold Games</div>
          </div>
        </div>
      </div>

      {/* Secondary Venue Slider */}
      {config.secondaryVenueId && (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
          <h4 className="font-medium text-sm">Secondary Venue Games</h4>
          <p className="text-xs text-muted-foreground">
            Adjust how many games to play at your secondary venue (lower HGA but builds regional fan base).
          </p>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-6">0</span>
            <input
              type="range"
              min={0}
              max={4}
              value={config.homeGamesAtSecondary}
              onChange={(e) => setSecondaryHomeGames(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm text-muted-foreground w-6">4</span>
          </div>
          <div className="text-xs text-center text-muted-foreground">
            {config.homeGamesAtSecondary} game{config.homeGamesAtSecondary !== 1 ? 's' : ''} at secondary venue
          </div>
        </div>
      )}

      {/* AFL Sold Game Offers */}
      {offers.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">AFL Home Game Offers</h4>
          <p className="text-xs text-muted-foreground">
            The AFL is offering your club money to play home games at neutral venues.
          </p>
          {offers.map((offer) => (
            <div
              key={offer.id}
              className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{offer.venueName}</div>
                  <div className="text-xs text-muted-foreground">{offer.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-400 font-medium">
                  +${(offer.payment / 1000).toFixed(0)}k
                </span>
                <span className="text-red-400 font-medium">
                  {offer.fanPenalty} fan satisfaction
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-400 border-green-500/30 hover:bg-green-500/10"
                  onClick={() => acceptVenueOffer(offer.id)}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                  onClick={() => rejectVenueOffer(offer.id)}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Impact Preview */}
      <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2">
        <h4 className="font-medium text-sm">Impact Preview</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Sold Game Revenue:</span>
            <span className="ml-2 text-green-400 font-medium">
              ${config.soldHomeGames.reduce((sum, g) => sum + g.payment, 0).toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Fan Satisfaction:</span>
            <span className={cn(
              'ml-2 font-medium',
              fanSat >= 60 ? 'text-green-400' : fanSat >= 40 ? 'text-amber-400' : 'text-red-400',
            )}>
              {fanSat}/100
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground italic">
        Advance to confirm allocations. AI clubs will also finalize their venue schedules.
      </p>
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
  const settings = useGameStore((s) => s.settings)
  const [expanded, setExpanded] = useState(true)

  const summary = useMemo(
    () => buildOffseasonSummary(year, history, tradeHistory, players, clubs, settings),
    [year, history, tradeHistory, players, clubs, settings],
  )
  const retirementLegacyByPlayer = useMemo(() => {
    const out = new Map<string, import('@/types/history').RetirementLegacyEntry>()
    for (const legacy of history.retirementLegacies ?? []) {
      if (legacy.retiredYear === year) out.set(legacy.playerId, legacy)
    }
    return out
  }, [history.retirementLegacies, year])
  const retirementClass = useMemo(
    () =>
      (history.retirementLegacies ?? [])
        .filter((legacy) => legacy.retiredYear === year)
        .sort((a, b) => {
          const scoreA = a.gamesPlayed + a.goals * 0.35 + a.overallAtRetirement * 1.2
          const scoreB = b.gamesPlayed + b.goals * 0.35 + b.overallAtRetirement * 1.2
          return scoreB - scoreA
        }),
    [history.retirementLegacies, year],
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
                    <div className="flex items-center gap-2">
                      <span>{r.playerName}</span>
                      {retirementLegacyByPlayer.get(r.playerId)?.hallOfFameEligible && (
                        <Badge className="bg-green-600 text-white">HOF Eligible</Badge>
                      )}
                    </div>
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

          {/* List Audit Report */}
          {summary.listAudit.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                List Audit Report
              </p>
              <div className="space-y-2">
                {summary.listAudit.slice(0, 8).map((audit) => (
                  <div key={audit.clubId} className="rounded border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{clubs[audit.clubId]?.abbreviation ?? audit.clubName}</span>
                      <Badge className={gradeColor(audit.grade)}>{audit.grade}</Badge>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>List: {audit.total}/{audit.maxTotal} (S {audit.senior}/{audit.maxSenior}, R {audit.rookie}/{audit.maxRookie})</span>
                      <span>Cap: ${Math.round(audit.capSpend / 1000)}k / ${Math.round(audit.capLimit / 1000)}k</span>
                      <span>Errors: {audit.listErrors} • Warnings: {audit.listWarnings}</span>
                      <span>{audit.mustDelistCount > 0 ? `Must delist ${audit.mustDelistCount}` : 'List compliant'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {retirementClass.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Retirement Legacy & Hall Of Fame
              </p>
              <div className="space-y-2">
                {retirementClass.slice(0, 6).map((legacy) => (
                  <div key={legacy.playerId} className="rounded border border-border/60 bg-muted/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{legacy.playerName}</p>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline">{legacy.tier === 'legend' ? 'Legend' : legacy.tier === 'club-great' ? 'Club Great' : 'Veteran'}</Badge>
                        {legacy.hallOfFameEligible && (
                          <Badge className="bg-green-600 text-white">HOF Eligible</Badge>
                        )}
                        {legacy.inductedClubHallOfFame && (
                          <Badge className="bg-blue-600 text-white">Inducted</Badge>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {legacy.gamesPlayed} games, {legacy.goals} goals, overall {legacy.overallAtRetirement}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trade Period Review Report */}
          {summary.tradeReview.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Trade Period Review Report
              </p>
              <div className="space-y-1">
                {summary.tradeReview.slice(0, 10).map((entry) => (
                  <div key={entry.clubId} className="flex items-center justify-between rounded border p-2 text-sm">
                    <div>
                      <span className="font-medium">{clubs[entry.clubId]?.abbreviation ?? entry.clubName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {entry.tradeCount} trade{entry.tradeCount === 1 ? '' : 's'} • net {entry.netValueDiff > 0 ? '+' : ''}{entry.netValueDiff.toFixed(1)}
                      </span>
                    </div>
                    <Badge className={gradeColor(entry.grade)}>{entry.grade}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Draft Review Report */}
          {summary.draftReview.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Draft Review Report
              </p>
              <div className="space-y-1 mb-3">
                {summary.draftReview.slice(0, 10).map((entry) => (
                  <div key={entry.clubId} className="flex items-center justify-between rounded border p-2 text-sm">
                    <div>
                      <span className="font-medium">{clubs[entry.clubId]?.abbreviation ?? entry.clubName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {entry.pickCount} pick{entry.pickCount === 1 ? '' : 's'} • avg value {entry.avgValueDiff > 0 ? '+' : ''}{entry.avgValueDiff.toFixed(1)}
                      </span>
                    </div>
                    <Badge className={gradeColor(entry.grade)}>{entry.grade}</Badge>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Steals</p>
                  <div className="space-y-1">
                    {summary.draftSteals.slice(0, 5).map((steal) => (
                      <div key={steal.playerId} className="flex justify-between text-xs">
                        <span>{steal.playerName} (#{steal.pickNumber})</span>
                        <span className="text-green-500">+{steal.stealScore.toFixed(1)}</span>
                      </div>
                    ))}
                    {summary.draftSteals.length === 0 && (
                      <p className="text-xs text-muted-foreground">No clear steals yet.</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Reaches</p>
                  <div className="space-y-1">
                    {summary.draftReaches.slice(0, 5).map((reach) => (
                      <div key={reach.playerId} className="flex justify-between text-xs">
                        <span>{reach.playerName} (#{reach.pickNumber})</span>
                        <span className="text-red-500">{reach.stealScore.toFixed(1)}</span>
                      </div>
                    ))}
                    {summary.draftReaches.length === 0 && (
                      <p className="text-xs text-muted-foreground">No obvious reaches.</p>
                    )}
                  </div>
                </div>
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
  onSign,
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
  onSign: (playerId: string, years: number, aav: number) => { success: boolean; error?: string }
  onStartSeason: () => void
  advanceError: string | null
  canAdvance: boolean
  settings: import('@/types/game').GameSettings
}) {
  const { currentPhase } = offseasonState
  const isReady = currentPhase === 'ready'
  const simulationActive = useGameStore((s) => s.simulation.active)

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
          <FreeAgencyMarketPanel />
        )}
        {currentPhase === 'national-draft' && (
          <DraftPanel draftType="national" playerClubId={playerClubId} clubs={clubs} />
        )}
        {currentPhase === 'rookie-draft' && (
          <DraftPanel draftType="rookie" playerClubId={playerClubId} clubs={clubs} />
        )}
        {currentPhase === 'supplemental-signing' && (
          <UnsignedPoolPanel players={players} onSign={onSign} />
        )}
        {currentPhase === 'preseason' && <PreseasonPanel />}
        {currentPhase === 'venue-allocation' && <VenueAllocationPanel />}
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
            <Button size="lg" onClick={onStartSeason} className="gap-2" disabled={simulationActive}>
              <Rocket className="h-4 w-4" />
              Start Season {year + 1}
            </Button>
          ) : (
            <Button onClick={onAdvance} disabled={!canAdvance || simulationActive} className="gap-2">
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
  const history = useGameStore((s) => s.history)
  const offseasonState = useGameStore((s) => s.offseasonState)
  const draft = useGameStore((s) => s.draft)
  const negotiations = useGameStore((s) => s.negotiations)
  const tradeInbox = useGameStore((s) => s.tradeInbox)
  const advancePhase = useGameStore((s) => s.advanceOffseasonPhase)
  const delistPlayer = useGameStore((s) => s.delistPlayerOffseason)
  const signUnsignedPlayer = useGameStore((s) => s.signUnsignedPlayer)
  const signSupplementalPlayer = useGameStore((s) => s.signSupplementalPlayer)
  const startNewSeasonAction = useGameStore((s) => s.startNewSeasonAction)
  const simulationActive = useGameStore((s) => s.simulation.active)

  // Validation error state
  const [advanceError, setAdvanceError] = useState<string | null>(null)

  // Compute global offseason progression validity
  const canAdvance = useMemo(() => {
    if (!offseasonState) return false
    return validateOffseasonProgression({
      players,
      playerClubId,
      offseasonState,
      negotiations,
      settings,
      draft,
      tradeInbox,
    }).allowed
  }, [offseasonState, players, playerClubId, negotiations, settings, draft, tradeInbox])

  // Handlers
  const handleAdvancePhase = useCallback(() => {
    if (simulationActive) return
    const result = advancePhase()
    if (!result.success) {
      setAdvanceError(result.error)
    } else {
      setAdvanceError(null)
    }
  }, [advancePhase, simulationActive])

  const handleDelist = useCallback((playerId: string) => {
    delistPlayer(playerId)
    setAdvanceError(null)
  }, [delistPlayer])

  const handleSign = useCallback((playerId: string, years: number, aav: number) => {
    if (offseasonState?.currentPhase === 'supplemental-signing') {
      return signSupplementalPlayer(playerId, years, aav)
    }
    return signUnsignedPlayer(playerId, years, aav)
  }, [signUnsignedPlayer, signSupplementalPlayer, offseasonState?.currentPhase])

  const handleStartSeason = useCallback(() => {
    if (simulationActive) return
    const result = startNewSeasonAction()
    if (!result.success) {
      setAdvanceError(result.error ?? 'Unable to continue to the new season.')
      return
    }
    setAdvanceError(null)
    navigate('/')
  }, [startNewSeasonAction, navigate, simulationActive])

  // Club info for header
  const club = clubs[playerClubId]
  const hasUpcomingDevReport = useMemo(
    () => history.developmentReports.some((r) => r.year === currentYear + 1),
    [history.developmentReports, currentYear],
  )

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
          {offseasonState.currentPhase === 'preseason' && hasUpcomingDevReport && (
            <Button asChild variant="outline" size="sm">
              <Link to="/development-report">
                <ExternalLink className="mr-1 h-3 w-3" />
                Development Report
              </Link>
            </Button>
          )}
          <Badge variant="outline" className="font-mono text-xs">
            <Clock className="mr-1 h-3 w-3" />
            {getOffseasonPhaseLabel(offseasonState.currentPhase)}
          </Badge>
        </div>
      </div>

      {/* Offseason Status Dashboard */}
      <OffseasonStatusDashboard />

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
            onSign={handleSign}
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

