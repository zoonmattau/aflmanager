import { useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ArrowLeftRight, AlertTriangle, Trophy, Shield, TrendingUp, ArrowUp } from 'lucide-react'
import { FieldSvg } from '@/components/lineup/FieldSvg'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Player, PlayerJumperPreferenceLevel, PlayerPositionType, PlayerTrainingFocus } from '@/types/player'
import {
  PLAYER_TRAINING_FOCUS_LABELS,
  PLAYER_TRAINING_FOCUS_OPTIONS,
} from '@/engine/players/trainingFocus'
import { computeProjectionContext } from '@/lib/trainingProjection'
import { TrainingProjectionPanel } from '@/components/training/TrainingProjectionPanel'
import { getPlayerEligiblePositionTypes } from '@/engine/player/positionEligibility'
import { getOverallRating, getPlayerStarRating, getPlayerPositionRating } from '@/engine/player/playerRating'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { getPositionBadgeClass, getPositionBadgeStrongClass } from '@/lib/positionColor'
import { ShortlistAssignMenu } from '@/components/shortlists/ShortlistManager'
import { ATTR_CATEGORIES, attrColor, attrBgColor } from '@/lib/attributeCategories'
import { matchRatingColorClass } from '@/engine/match/matchRatings'
import { getPlayerRecentGames } from '@/lib/formGuide'
import { getTotalGamesMissed, getRecurringBodyRegions, bodyRegionLabel, getInjuryRiskLevel, injuryRiskDisplay } from '@/lib/injuryRisk'
import { MomentsFeed } from '@/components/player/MomentsFeed'
import { isPlayerRFA } from '@/engine/contracts/freeAgency'
import { cn } from '@/lib/utils'
import { computePlayerArc, ARC_META } from '@/engine/player/storyArc'
import { computeAllTrends } from '@/engine/player/trendEngine'
import type { AttributeTrendData } from '@/engine/player/trendEngine'
import { AttributeTrendBadge } from '@/components/player/AttributeTrendBadge'
import { PossessionHeatmap } from '@/components/player/PossessionHeatmap'

function moraleLabel(morale: number): string {
  if (morale >= 90) return 'Ecstatic'
  if (morale >= 75) return 'Happy'
  if (morale >= 60) return 'Content'
  if (morale >= 45) return 'Unsettled'
  if (morale >= 30) return 'Unhappy'
  return 'Furious'
}

function jumperPreferenceLabel(level: PlayerJumperPreferenceLevel | undefined): string {
  if (level === 'demand') return 'Demands specific jumper number(s)'
  if (level === 'want') return 'Prefers specific jumper number(s)'
  return 'No strong jumper number preference'
}

function getJumperPreferenceMoraleImpact(player: Player): number {
  const preference = player.jumperPreference
  if (!preference || preference.level === 'none' || preference.preferredNumbers.length === 0) return 0

  const hasAssignedNumber = player.jerseyNumber > 0
  const hasPreferredNumber = hasAssignedNumber && preference.preferredNumbers.includes(player.jerseyNumber)
  if (hasPreferredNumber) return preference.level === 'demand' ? 2 : 1
  if (!hasAssignedNumber) return preference.level === 'demand' ? -1 : 0
  return preference.level === 'demand' ? -2 : -1
}

// Landscape coordinates: new_left = 100 - portrait_top, new_top = portrait_left
// (FB defending on left, FF attacking on right)
// FB defending on left, FF attacking on right
const FIELD_POSITION_COORDS: Record<PlayerPositionType, { x: number; y: number }> = {
  FB:  { x:  7.9, y: 50.0 },
  BP:  { x: 13.5, y: 31.5 },
  HBF: { x: 25.7, y: 76.9 },
  CHB: { x: 25.7, y: 50.0 },
  W:   { x: 50.0, y: 15.7 },
  IM:  { x: 44.0, y: 38.5 },
  OM:  { x: 56.0, y: 61.5 },
  RK:  { x: 50.0, y: 50.0 },
  HFF: { x: 74.3, y: 23.1 },
  CHF: { x: 74.3, y: 50.0 },
  FP:  { x: 86.5, y: 68.5 },
  FF:  { x: 92.1, y: 50.0 },
}

function SidebarStatusRow({ label, value, sub, inverted }: { label: string; value: number; sub?: string; inverted?: boolean }) {
  const eff = inverted ? 100 - value : value
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
          <span className={cn('text-xs font-mono font-bold w-6 text-right', attrColor(eff))}>{value}</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', attrBgColor(eff))} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function PlayerProfilePage() {
  const { playerId: playerIdParam } = useParams<{ playerId?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const staff = useGameStore((s) => s.staff)
  const history = useGameStore((s) => s.history)
  const currentYear = useGameStore((s) => s.currentYear)
  const awards = useGameStore((s) => s.awards)
  const brownlowTracker = useGameStore((s) => s.brownlowTracker)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const phase = useGameStore((s) => s.phase)
  const commissionerMode = useGameStore((s) => s.settings.commissionerMode)
  const currentDate = useGameStore((s) => s.currentDate)
  const offseasonState = useGameStore((s) => s.offseasonState)
  const tradeBlock = useGameStore((s) => s.tradeBlock)
  const startContractNegotiation = useGameStore((s) => s.startContractNegotiation)
  const setPlayerTradeAvailability = useGameStore((s) => s.setPlayerTradeAvailability)
  const clearPlayerTradeAvailability = useGameStore((s) => s.clearPlayerTradeAvailability)
  const delistPlayerOffseason = useGameStore((s) => s.delistPlayerOffseason)
  const matchResults = useGameStore((s) => s.matchResults)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [previewFocus, setPreviewFocus] = useState<PlayerTrainingFocus | null | '__current__'>('__current__')
  const [trendWindow, setTrendWindow] = useState<1 | 2 | 3>(1)
  const [ybyMode, setYbyMode] = useState<'avg' | 'total'>('avg')
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [heatmapScope, setHeatmapScope] = useState<'season' | 'career'>('season')
  const setPlayerTrainingFocus = useGameStore((s) => s.setPlayerTrainingFocus)

  const playerId = useMemo(() => {
    const candidates = [
      playerIdParam,
      searchParams.get('playerId'),
      searchParams.get('id'),
    ]
    for (const raw of candidates) {
      if (!raw) continue
      const trimmed = raw.trim()
      if (!trimmed) continue
      try {
        return decodeURIComponent(trimmed)
      } catch {
        return trimmed
      }
    }
    return null
  }, [playerIdParam, searchParams])

  const hasAnyPlayers = useMemo(() => Object.keys(players).length > 0, [players])
  const player = playerId ? players[playerId] : null

  // Projection context (coaching + facilities for the player's club) — must be
  // before any early returns to satisfy Rules of Hooks
  const projCtx = useMemo(() => {
    if (!player) return null
    const playerClub = clubs[player.clubId]
    if (!playerClub) return null
    const clubStaff = Object.values(staff).filter((s) => s.clubId === player.clubId)
    return computeProjectionContext(playerClub, clubStaff)
  }, [clubs, staff, player])

  // Story arc — must be before early returns to satisfy Rules of Hooks
  const storyArc = useMemo(() => {
    if (!player) return null
    const playerClub = clubs[player.clubId]
    const leadership = playerClub?.leadership
    const isLeader = !!(
      leadership?.captainId === player.id ||
      leadership?.viceCaptainId === player.id ||
      leadership?.leadershipGroupIds?.includes(player.id)
    )
    return computePlayerArc(player, { isLeader, currentDate })
  }, [player, clubs, currentDate])

  // Attribute trends (historical + projected) — all computed upfront so badges render inline
  const allTrends = useMemo(
    () => (player ? computeAllTrends(player, currentYear, trendWindow) : null),
    [player, currentYear, trendWindow],
  )

  // Last 10 games for this player
  const recentGames = useMemo(
    () => (playerId ? getPlayerRecentGames(playerId, matchResults, 10) : []),
    [playerId, matchResults],
  )

  // Find draft info from history
  const draftInfo = useMemo(() => {
    if (!playerId) return null
    return history.draftHistory.find((d) => d.playerId === playerId) ?? null
  }, [history.draftHistory, playerId])

  // Honours
  const honours = useMemo(() => {
    if (!playerId) return { brownlowVotes: 0, brownlowWins: 0, colemanWins: 0, risingStarWins: 0, allAustralianCount: 0, bnfWins: 0 }
    let brownlowVotes = 0
    for (const round of brownlowTracker) {
      for (const v of round.votes) {
        if (v.playerId === playerId) brownlowVotes += v.votes
      }
    }
    let brownlowWins = 0
    let colemanWins = 0
    let risingStarWins = 0
    let allAustralianCount = 0
    let bnfWins = 0
    for (const a of awards) {
      if (a.brownlowMedal?.playerId === playerId) brownlowWins++
      if (a.colemanMedal?.playerId === playerId) colemanWins++
      if (a.risingStar?.playerId === playerId) risingStarWins++
      if (a.allAustralian.includes(playerId)) allAustralianCount++
      if (Object.values(a.clubBestAndFairest).includes(playerId)) bnfWins++
    }
    return { brownlowVotes, brownlowWins, colemanWins, risingStarWins, allAustralianCount, bnfWins }
  }, [playerId, brownlowTracker, awards])

  if (!playerId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground">No player id was provided.</p>
      </div>
    )
  }

  if (!hasAnyPlayers) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground">Loading player profile...</p>
      </div>
    )
  }

  if (!player) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground">Player not found for id: {playerId}</p>
      </div>
    )
  }

  const club = clubs[player.clubId]
  const overall = getOverallRating(player)
  const ss = player.seasonStats
  const cs = player.careerStats
  const historicalSeasonRows = [...(history.playerSeasonStats ?? [])]
    .filter((entry) => entry.playerId === player.id)
    .sort((a, b) => b.year - a.year)
  const hasCurrentSeasonSnapshot = historicalSeasonRows.some((entry) => entry.year === currentYear)
  // Pre-game season stats history from generation (years before game started)
  const preGameRows = (player.seasonStatsHistory ?? [])
    .filter((h) => !historicalSeasonRows.some((r) => r.year === h.year))
    .map((h) => ({
      playerId: player.id,
      playerName: `${player.firstName} ${player.lastName}`,
      year: h.year,
      clubId: player.clubId,
      age: player.age - (currentYear - h.year),
      position: player.position.primary,
      overall,
      stats: h.stats,
      inProgress: false,
    }))
  const yearByYearRows = hasCurrentSeasonSnapshot
    ? [...historicalSeasonRows.map((entry) => ({ ...entry, inProgress: false })), ...preGameRows].sort((a, b) => b.year - a.year)
    : [
        {
          playerId: player.id,
          playerName: `${player.firstName} ${player.lastName}`,
          year: currentYear,
          clubId: player.clubId,
          age: player.age,
          position: player.position.primary,
          overall,
          stats: { ...ss },
          inProgress: true,
        },
        ...historicalSeasonRows.map((entry) => ({ ...entry, inProgress: false })),
        ...preGameRows,
      ].sort((a, b) => b.year - a.year)
  const secondaryPositions = new Set(player.position.secondary)
  const alternatePositions = getPlayerEligiblePositionTypes(player, { includeRated: false }).filter(
    (pos) => pos !== player.position.primary,
  )
  const jumperPreferenceImpact = getJumperPreferenceMoraleImpact(player)
  const jumperHistory = [...player.jumperHistory].sort((a, b) => b.year - a.year)
  const isUserClubPlayer = player.clubId === playerClubId
  const tradeListing = tradeBlock.listings[player.id]

  const inDelistingsPhase = phase === 'offseason' && offseasonState?.currentPhase === 'delistings'

  function setSuccess(message: string) {
    setActionError(null)
    setActionSuccess(message)
  }

  function setError(message: string) {
    setActionSuccess(null)
    setActionError(message)
  }

  function handleStartNegotiation() {
    const currentPlayer = player
    if (!currentPlayer) return
    const result = startContractNegotiation(currentPlayer.id)
    if (!result.success) {
      setError(result.error ?? 'Failed to start negotiation.')
      return
    }
    setSuccess('Negotiation started. Open Contracts to continue the offer flow.')
  }

  function handleSetAvailability(availability: 'available' | 'reluctant' | 'salary-dump') {
    const currentPlayer = player
    if (!currentPlayer) return
    const result = setPlayerTradeAvailability(currentPlayer.id, availability)
    if (!result.success) {
      setError(result.error ?? 'Failed to update trade availability.')
      return
    }
    setSuccess(`Trade availability set to ${availability}.`)
  }

  function handleDelist() {
    const currentPlayer = player
    if (!currentPlayer) return
    if (!inDelistingsPhase) {
      setError('Delisting is only available during offseason delistings.')
      return
    }
    if (!window.confirm(`Delist ${currentPlayer.firstName} ${currentPlayer.lastName}? This cannot be undone.`)) {
      return
    }
    delistPlayerOffseason(currentPlayer.id)
    setSuccess(`${currentPlayer.firstName} ${currentPlayer.lastName} has been delisted.`)
  }

  // RFA matching rights
  const rfaMatchingRight = offseasonState?.rfaMatchingRights?.find(
    (r) => r.playerId === player.id && r.status === 'pending'
  )

  // FA status
  const faStatusBadge = player.contract.yearsRemaining > 0
    ? <Badge variant="outline" className="text-[10px]">Under Contract</Badge>
    : isPlayerRFA(player, currentYear)
      ? <Badge variant="secondary" className="text-[10px]">RFA</Badge>
      : <Badge variant="outline" className="text-[10px]">UFA</Badge>

  // Inline field heat map helpers
  const eligiblePositions = new Set<PlayerPositionType>(
    getPlayerEligiblePositionTypes(player, { includeRated: false }),
  )

  function getChipStyle(pos: PlayerPositionType): string {
    const base = getPositionBadgeStrongClass(pos)
    if (pos === player!.position.primary) return `${base} ring-2 ring-white`
    if (secondaryPositions.has(pos)) return base
    return `${base} opacity-70`
  }

  // Key stats for overview
  const gp = ss.gamesPlayed

  return (
    <div className="flex items-start gap-0">
      {/* ── SIDEBAR ────────────────────────────────────────────────────── */}
      <div className="w-60 shrink-0 border-r border-border pr-4 space-y-4">

        {/* Club color strip */}
        <div className="h-[3px] rounded-full" style={{ backgroundColor: club?.colors.primary ?? '#666' }} />

        {/* Back + Compare */}
        <div className="flex items-center justify-between pt-1">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => navigate(`/compare/${player.id}`)}>
            <ArrowLeftRight className="h-3 w-3 mr-1" /> Compare
          </Button>
        </div>

        {/* Jersey + Name + Club */}
        <div className="flex items-center gap-3">
          <div
            className="h-14 w-14 shrink-0 rounded-full flex items-center justify-center text-white font-bold text-xl"
            style={{ backgroundColor: club?.colors.primary ?? '#666' }}
          >
            {player.jerseyNumber}
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight truncate">
              {player.firstName} {player.lastName}
            </h1>
            <p className="text-xs text-muted-foreground truncate">{club?.name}</p>
          </div>
        </div>

        {/* Position badges */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className={cn('text-xs', getPositionBadgeClass(player.position.primary))}>
            {player.position.primary}
          </Badge>
          {alternatePositions.map((pos) => (
            <Badge
              key={pos}
              variant="outline"
              className={cn('text-xs', getPositionBadgeClass(pos), !secondaryPositions.has(pos) && 'opacity-75')}
            >
              {pos}
            </Badge>
          ))}
        </div>

        {/* Age / physical / home state */}
        <p className="text-xs text-muted-foreground">
          Age {player.age} &middot; {player.height}cm / {player.weight}kg
          {player.homeState ? ` \u00b7 ${player.homeState}` : ''}
        </p>

        {/* Overall + Stars */}
        <div className="flex items-center gap-3">
          <span className="text-5xl font-black tabular-nums">{overall}</span>
          <div>
            <PlayerStarRating stars={getPlayerStarRating(player, overall)} player={player} overall={overall} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Overall</p>
          </div>
        </div>

        {/* Story arc badge */}
        {storyArc && (() => {
          const meta = ARC_META[storyArc.arc]
          return (
            <div className="rounded-lg border border-border bg-muted/40 p-2.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${meta.colour}`}>
                  {meta.icon} {meta.label}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{storyArc.blurb}</p>
            </div>
          )
        })()}

        {/* Status rows */}
        <div className="space-y-1.5">
          <SidebarStatusRow label="Morale" value={player.morale} sub={moraleLabel(player.morale)} />
          <SidebarStatusRow label="Fitness" value={player.fitness} />
          <SidebarStatusRow label="Form" value={player.form} />
          <SidebarStatusRow label="Fatigue" value={player.fatigue} inverted />
        </div>

        {/* Contract panel */}
        <div className="rounded-lg border border-border p-2.5 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Contract</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-mono font-semibold">
              ${(player.contract.aav / 1000).toFixed(0)}k / yr
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{player.contract.yearsRemaining}yr</span>
              {faStatusBadge}
            </div>
          </div>
          {player.contract.yearByYear.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {player.contract.yearByYear.map((y, i) => (
                <span
                  key={i}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono tabular-nums"
                >
                  ${(y / 1000).toFixed(0)}k
                </span>
              ))}
            </div>
          )}
          {rfaMatchingRight && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px]">
              <p className="font-medium text-amber-700 dark:text-amber-400">Matching Rights Pending</p>
              <p className="text-muted-foreground mt-0.5">
                {clubs[rfaMatchingRight.holdingClubId]?.name ?? rfaMatchingRight.holdingClubId} holds rights on a {rfaMatchingRight.years}-yr offer
                from {clubs[rfaMatchingRight.offeringClubId]?.name ?? rfaMatchingRight.offeringClubId} at ${(rfaMatchingRight.aav / 1000).toFixed(0)}k/yr
              </p>
              {rfaMatchingRight.holdingClubId === playerClubId && (
                <p className="text-amber-600 dark:text-amber-500 mt-0.5 font-medium">Go to Contracts → RFA Matching</p>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-2">
          {isUserClubPlayer ? (
            <>
              <ShortlistAssignMenu targetType="player" targetId={player.id} buttonLabel="Add to Shortlist" buttonVariant="outline" />
              <Button size="sm" className="w-full" onClick={handleStartNegotiation}>
                Negotiate Contract
              </Button>
              <div className="space-y-1.5">
                <Select
                  value={tradeListing?.availability ?? '__none__'}
                  onValueChange={(v) => {
                    if (v === '__none__') {
                      clearPlayerTradeAvailability(player.id)
                      setSuccess('Player removed from trade block.')
                    } else {
                      handleSetAvailability(v as 'available' | 'reluctant' | 'salary-dump')
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs w-full">
                    <SelectValue placeholder="Set trade availability..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not listed</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="reluctant">Reluctant</SelectItem>
                    <SelectItem value="salary-dump">Salary Dump</SelectItem>
                  </SelectContent>
                </Select>
                {tradeListing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs h-7"
                    onClick={() => { clearPlayerTradeAvailability(player.id); setSuccess('Player removed from trade block.') }}
                  >
                    Remove Trade Listing
                  </Button>
                )}
              </div>
              {inDelistingsPhase && (
                <Button size="sm" variant="destructive" className="w-full" onClick={handleDelist}>
                  Delist Player
                </Button>
              )}
              {actionError && <p className="text-xs text-red-500">{actionError}</p>}
              {actionSuccess && <p className="text-xs text-green-600">{actionSuccess}</p>}
            </>
          ) : (
            <>
              <ShortlistAssignMenu targetType="player" targetId={player.id} buttonLabel="Add to Shortlist" buttonVariant="outline" />
              <Button size="sm" variant="outline" className="w-full" onClick={() => navigate('/trade')}>
                Request Trade
              </Button>
              <p className="text-xs text-muted-foreground text-center">Rival player — view-only</p>
            </>
          )}
        </div>

        {/* Bio */}
        {player.bio && (
          <p className="text-xs text-muted-foreground leading-relaxed">{player.bio}</p>
        )}
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 pl-5 space-y-4">

        {/* Injury / suspension alert — prominent above tabs */}
        {(player.suspension?.weeksRemaining ?? 0) > 0 ? (
          <div className="rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2.5 text-xs space-y-0.5">
            <div className="flex items-center gap-1.5 font-semibold text-orange-600">
              <Shield className="h-3.5 w-3.5" />
              Suspended — {player.suspension?.weeksRemaining ?? 0}w remaining
            </div>
            {player.suspension?.reason && (
              <p className="text-muted-foreground">{player.suspension.reason}</p>
            )}
          </div>
        ) : player.injury ? (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs space-y-0.5">
            <div className="flex items-center gap-1.5 font-semibold text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {player.injury.type} — {player.injury.weeksRemaining}w
            </div>
            {player.injury.severity && (
              <p className="text-muted-foreground capitalize">
                {player.injury.severity}{player.injury.recurring ? ' · recurring' : ''}
                {player.injury.recoveryProgress !== undefined ? ` · ${Math.round(player.injury.recoveryProgress)}% recovered` : ''}
              </p>
            )}
          </div>
        ) : null}

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attributes">Attributes</TabsTrigger>
            <TabsTrigger value="development">Development</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* ── TAB: OVERVIEW ─────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4">

            {/* ── Row A: compact hero tiles ────────────────────────────── */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <div className="rounded-xl border border-border bg-card p-2.5 text-center">
                <div className="text-2xl font-bold tabular-nums">{gp}</div>
                <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">Games</div>
              </div>
              {(
                [
                  { label: 'Disp/G',    value: gp ? ss.disposals / gp : 0 },
                  { label: 'Goals/G',   value: gp ? ss.goals / gp     : 0 },
                  { label: 'Marks/G',   value: gp ? ss.marks / gp     : 0 },
                  { label: 'Tackles/G', value: gp ? ss.tackles / gp   : 0 },
                ] as { label: string; value: number }[]
              ).map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-2.5 text-center">
                  <div className="text-2xl font-bold font-mono tabular-nums">
                    {gp > 0 ? stat.value.toFixed(1) : '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">{stat.label}</div>
                </div>
              ))}
              <div className="rounded-xl border border-border bg-card p-2.5 text-center">
                <div className={cn('text-2xl font-bold font-mono tabular-nums', matchRatingColorClass(player.lastMatchRating ?? 0))}>
                  {player.lastMatchRating != null && player.lastMatchRating > 0
                    ? player.lastMatchRating.toFixed(1)
                    : '—'}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">Last Rating</div>
              </div>
            </div>

            {/* ── Row B: 3-column snapshot cards ──────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

              {/* Key Overall Stats */}
              <Card>
                <CardHeader className="py-2.5 px-3">
                  <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Key Attributes</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  {(() => {
                    const catDataMap = Object.fromEntries(
                      ATTR_CATEGORIES.map((cat) => [cat.label, cat])
                    )
                    const catMap = Object.fromEntries(
                      ATTR_CATEGORIES.map((cat) => [
                        cat.label,
                        Math.round(cat.attrs.reduce((s, a) => s + (player.attributes[a.key] ?? 0), 0) / cat.attrs.length),
                      ])
                    )
                    const groups: { label: string; cats: string[] }[] = [
                      { label: 'Ball Skills',        cats: ['Kicking', 'Handball', 'Marking'] },
                      { label: 'Physical',           cats: ['Physical'] },
                      { label: 'Contest & Midfield', cats: ['Contested', 'Game Sense', 'Set Pieces'] },
                      { label: 'Attack & Defence',   cats: ['Offensive', 'Defensive'] },
                      { label: 'Character',          cats: ['Mental', 'Ruck'] },
                    ]
                    return (
                      <TooltipProvider delayDuration={100}>
                        <div className="space-y-3">
                          {groups.map((group) => (
                            <div key={group.label}>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
                                {group.label}
                              </p>
                              <div className="space-y-1">
                                {group.cats.map((catLabel) => {
                                  const avg = catMap[catLabel] ?? 0
                                  const catData = catDataMap[catLabel]
                                  return (
                                    <Tooltip key={catLabel}>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2 cursor-pointer rounded hover:bg-muted/50 -mx-1 px-1 py-0.5 transition-colors">
                                          <span className="w-20 shrink-0 text-[10px] text-muted-foreground">{catLabel}</span>
                                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div
                                              className={cn('h-full rounded-full', attrBgColor(avg))}
                                              style={{ width: `${avg}%` }}
                                            />
                                          </div>
                                          <span className={cn('w-6 shrink-0 text-right text-[11px] font-mono font-semibold tabular-nums', attrColor(avg))}>
                                            {avg}
                                          </span>
                                        </div>
                                      </TooltipTrigger>
                                      {catData && (
                                        <TooltipContent side="left" className="p-2 space-y-1 min-w-[140px]">
                                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{catLabel}</p>
                                          {catData.attrs.map(({ key, label }) => {
                                            const val = player.attributes[key] ?? 0
                                            return (
                                              <div key={key} className="flex items-center justify-between gap-3">
                                                <span className="text-xs text-muted-foreground">{label}</span>
                                                <span className={cn('text-xs font-mono font-bold tabular-nums', attrColor(val))}>{val}</span>
                                              </div>
                                            )
                                          })}
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </TooltipProvider>
                    )
                  })()}
                </CardContent>
              </Card>

              {/* Player Snapshot — position map */}
              <Card>
                <CardHeader className="py-2.5 px-3">
                  <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Position Map</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={cn('text-xs', getPositionBadgeClass(player.position.primary))}>
                      {player.position.primary}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {getPlayerPositionRating(player, player.position.primary)} rating
                    </span>
                  </div>
                  <div className="w-full aspect-[35/27] relative">
                    <FieldSvg idPrefix="player-overview-heatmap" landscape />
                    {(Object.keys(FIELD_POSITION_COORDS) as PlayerPositionType[])
                      .filter((pos) => eligiblePositions.has(pos))
                      .map((pos) => {
                        const coords = FIELD_POSITION_COORDS[pos]
                        const rating = player.position.ratings[pos] ?? getPlayerPositionRating(player, pos)
                        return (
                          <div
                            key={pos}
                            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded border px-1 py-0.5 text-[8px] font-bold shadow leading-none ${getChipStyle(pos)}`}
                            style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
                          >
                            <div className="tracking-wide">{pos}</div>
                            <div className="text-center font-mono opacity-90">{rating}</div>
                          </div>
                        )
                      })}
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    <span className={`rounded border px-1.5 py-0.5 ${getPositionBadgeClass('DEF')}`}>DEF</span>
                    <span className={`rounded border px-1.5 py-0.5 ${getPositionBadgeClass('MID')}`}>MID</span>
                    <span className={`rounded border px-1.5 py-0.5 ${getPositionBadgeClass('FWD')}`}>FWD</span>
                    <span className={`rounded border px-1.5 py-0.5 ${getPositionBadgeClass('RK')}`}>RK</span>
                  </div>
                </CardContent>
              </Card>

              {/* Season & Career Key Stats */}
              <Card>
                <CardHeader className="py-2.5 px-3">
                  <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Season &amp; Career</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="space-y-1 text-xs">
                    <div className="grid grid-cols-3 gap-1 pb-1 border-b border-border/40">
                      <span className="text-muted-foreground" />
                      <span className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Season</span>
                      <span className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Career</span>
                    </div>
                    {([
                      { label: 'Games',    season: gp,                                         career: cs.gamesPlayed },
                      { label: 'Disp/G',   season: gp ? ss.disposals / gp : null,              career: cs.gamesPlayed ? cs.disposals / cs.gamesPlayed : null },
                      { label: 'Goals/G',  season: gp ? ss.goals / gp : null,                 career: cs.gamesPlayed ? cs.goals / cs.gamesPlayed : null },
                      { label: 'Marks/G',  season: gp ? ss.marks / gp : null,                 career: cs.gamesPlayed ? cs.marks / cs.gamesPlayed : null },
                      { label: 'Tackles/G',season: gp ? ss.tackles / gp : null,               career: cs.gamesPlayed ? cs.tackles / cs.gamesPlayed : null },
                      { label: 'AF/G',     season: gp ? ss.aflFantasyPoints / gp : null,       career: cs.gamesPlayed ? cs.aflFantasyPoints / cs.gamesPlayed : null },
                      { label: 'SC/G',     season: gp ? ss.superCoachPoints / gp : null,       career: cs.gamesPlayed ? cs.superCoachPoints / cs.gamesPlayed : null },
                    ] as { label: string; season: number | null; career: number | null }[]).map(({ label, season, career }) => (
                      <div key={label} className="grid grid-cols-3 gap-1">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="text-center font-mono font-semibold tabular-nums">
                          {season === null ? '—' : label === 'Games' ? season : season.toFixed(1)}
                        </span>
                        <span className="text-center font-mono tabular-nums text-muted-foreground">
                          {career === null ? '—' : label === 'Games' ? career : career.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* ── Possession Heatmap ─────────────────────────────────── */}
            {(() => {
              const selectedGame = selectedGameId
                ? recentGames.find((g) => g.matchId === selectedGameId)
                : null
              const heatmapData = selectedGame
                ? selectedGame.stats.zonePossessions
                : heatmapScope === 'career'
                  ? player.careerStats.zonePossessions
                  : player.seasonStats.zonePossessions
              const hasAnyZoneData = heatmapData && Object.values(heatmapData).some((v) => (v ?? 0) > 0)
              const heatmapLabel = selectedGame
                ? `${selectedGame.isFinal ? (selectedGame.finalType ?? 'F') : `Rd ${selectedGame.round + 1}`} vs ${clubs[selectedGame.opponentClubId]?.abbreviation ?? '???'}`
                : heatmapScope === 'career' ? 'Career' : 'Season'

              return hasAnyZoneData ? (
                <Card>
                  <CardHeader className="py-2.5 px-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Possession Heatmap
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {selectedGame ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-[10px]"
                          onClick={() => setSelectedGameId(null)}
                        >
                          Clear
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant={heatmapScope === 'season' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-5 px-2 text-[10px]"
                            onClick={() => setHeatmapScope('season')}
                          >
                            Season
                          </Button>
                          <Button
                            variant={heatmapScope === 'career' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-5 px-2 text-[10px]"
                            onClick={() => setHeatmapScope('career')}
                          >
                            Career
                          </Button>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <PossessionHeatmap
                      zonePossessions={heatmapData}
                      label={heatmapLabel}
                    />
                  </CardContent>
                </Card>
              ) : null
            })()}

            {/* ── Career Moments feed ──────────────────────────────────── */}
            {(player.moments && player.moments.length > 0) && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-0.5">
                  Career Moments
                </p>
                <MomentsFeed moments={player.moments} clubs={clubs} />
              </div>
            )}

            {/* ── Row C: Recent games ──────────────────────────────────── */}
            {recentGames.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-0.5">
                  Recent Games
                </p>
                <div className="rounded-lg border border-border/50 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40 bg-muted/30 text-muted-foreground">
                        <th className="px-3 py-1.5 text-left font-medium">Rd</th>
                        <th className="px-2 py-1.5 text-left font-medium">Opp</th>
                        <th className="px-2 py-1.5 text-center font-medium">Score</th>
                        <th className="px-2 py-1.5 text-center font-medium">D</th>
                        <th className="px-2 py-1.5 text-center font-medium">K</th>
                        <th className="px-2 py-1.5 text-center font-medium">HB</th>
                        <th className="px-2 py-1.5 text-center font-medium">M</th>
                        <th className="px-2 py-1.5 text-center font-medium">G</th>
                        <th className="px-2 py-1.5 text-center font-medium">T</th>
                        <th className="px-2 py-1.5 text-center font-medium">CL</th>
                        <th className="px-2 py-1.5 text-center font-medium">HO</th>
                        <th className="px-2 py-1.5 text-center font-medium">FF</th>
                        <th className="px-2 py-1.5 text-center font-medium">FA</th>
                        <th className="px-2 py-1.5 text-center font-medium">AF</th>
                        <th className="px-2 py-1.5 text-center font-medium">SC</th>
                        <th className="px-2 py-1.5 text-center font-medium">Rtg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentGames.map((g, idx) => {
                        const opp = clubs[g.opponentClubId]
                        const rating = g.stats.matchRating
                        const isEven = idx % 2 === 0
                        const isSelected = selectedGameId === g.matchId
                        return (
                          <tr
                            key={g.matchId}
                            className={cn(
                              'border-b border-border/20 last:border-0 cursor-pointer transition-colors hover:bg-muted/30',
                              isSelected ? 'bg-amber-500/10 border-l-2 border-l-amber-500' : isEven ? 'bg-muted/10' : '',
                            )}
                            onClick={() => setSelectedGameId(isSelected ? null : g.matchId)}
                          >
                            {/* Round */}
                            <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                              {g.isFinal ? (g.finalType ?? 'F') : `Rd ${g.round + 1}`}
                            </td>
                            {/* Opponent + H/A + W/L */}
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className={cn(
                                  'font-bold text-[10px] w-3 shrink-0',
                                  g.won === true ? 'text-green-500' : g.won === false ? 'text-red-400' : 'text-zinc-400',
                                )}>
                                  {g.won === true ? 'W' : g.won === false ? 'L' : 'D'}
                                </span>
                                <div
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: opp?.colors.primary ?? '#888' }}
                                />
                                <span className="font-semibold">{opp?.abbreviation ?? '???'}</span>
                                <span className="text-muted-foreground/50 text-[10px]">{g.isHome ? 'H' : 'A'}</span>
                              </div>
                            </td>
                            {/* Score */}
                            <td className="px-2 py-1.5 text-center font-mono whitespace-nowrap">
                              <span className={g.won === true ? 'font-bold' : 'text-muted-foreground'}>{g.playerScore}</span>
                              <span className="text-muted-foreground/40 mx-0.5">–</span>
                              <span className={g.won === false ? 'font-bold' : 'text-muted-foreground'}>{g.opponentScore}</span>
                            </td>
                            {/* Stats */}
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums font-semibold">{g.stats.disposals}</td>
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums text-muted-foreground">{g.stats.kicks}</td>
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums text-muted-foreground">{g.stats.handballs}</td>
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums">{g.stats.marks}</td>
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums">
                              {g.stats.goals > 0 ? <span className="text-emerald-400 font-bold">{g.stats.goals}</span> : <span className="text-muted-foreground/40">–</span>}
                            </td>
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums">{g.stats.tackles}</td>
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums text-muted-foreground">{g.stats.clearances}</td>
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums text-muted-foreground">
                              {g.stats.hitouts > 0 ? g.stats.hitouts : <span className="text-muted-foreground/30">–</span>}
                            </td>
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums text-muted-foreground">
                              {g.stats.freesFor > 0 ? g.stats.freesFor : <span className="text-muted-foreground/30">–</span>}
                            </td>
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums text-muted-foreground">
                              {g.stats.freesAgainst > 0 ? g.stats.freesAgainst : <span className="text-muted-foreground/30">–</span>}
                            </td>
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums text-muted-foreground">{g.stats.aflFantasyPoints}</td>
                            <td className="px-2 py-1.5 text-center font-mono tabular-nums text-muted-foreground">{g.stats.superCoachPoints}</td>
                            {/* Rating */}
                            <td className="px-2 py-1.5 text-center">
                              <span className={cn('font-mono font-bold tabular-nums', matchRatingColorClass(rating ?? 0))}>
                                {rating !== undefined ? rating.toFixed(1) : '—'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </TabsContent>

          {/* ── TAB: ATTRIBUTES ───────────────────────────────────────── */}
          <TabsContent value="attributes" className="space-y-3">
            {/* Trend window selector + legend */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Compare to:</span>
                {([1, 2, 3] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setTrendWindow(w)}
                    className={cn(
                      'px-2 py-0.5 text-[11px] rounded-full border transition-colors',
                      trendWindow === w
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {w === 1 ? '1 season' : `${w} seasons`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 ml-auto">
                <span className="flex items-center gap-0.5 text-green-500"><TrendingUp className="h-3 w-3" /> actual change</span>
                <span className="flex items-center gap-0.5 text-blue-400"><ArrowUp className="h-2.5 w-2.5" /><span>P</span> staff projection</span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ATTR_CATEGORIES.map((cat) => {
                const catAvg = Math.round(cat.attrs.reduce((s, a) => s + (player.attributes[a.key] ?? 0), 0) / cat.attrs.length)
                return (
                  <div key={cat.label} className="rounded-lg border border-border bg-card overflow-hidden">
                    {/* Category header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/30">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/70">{cat.label}</p>
                      <span className={cn('text-xs font-mono font-bold tabular-nums', attrColor(catAvg))}>{catAvg}</span>
                    </div>
                    {/* Attribute rows */}
                    <div className="px-3 py-2 space-y-2">
                      {cat.attrs.map(({ key, label }) => {
                        const val = player.attributes[key] ?? 0
                        const trendData: AttributeTrendData | undefined = allTrends?.[key]
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <span className="w-28 shrink-0 text-[11px] text-muted-foreground truncate">{label}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className={cn('h-full rounded-full transition-all', attrBgColor(val))} style={{ width: `${val}%` }} />
                            </div>
                            <span className={cn('w-7 shrink-0 text-right text-[11px] font-mono font-bold tabular-nums', attrColor(val))}>
                              {val}
                            </span>
                            {trendData && <AttributeTrendBadge trend={trendData} />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Hidden attributes card — commish mode only */}
              {commissionerMode && <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/70">Hidden / Estimated</p>
                </div>
                <div className="px-3 py-2 space-y-2">
                  {([
                    { label: 'Durability', val: player.hiddenAttributes.durability, display: player.hiddenAttributes.durability },
                    { label: 'Inj. Proneness', val: 100 - player.hiddenAttributes.injuryProneness, display: player.hiddenAttributes.injuryProneness },
                    { label: 'Consistency', val: player.attributes.consistency, display: player.attributes.consistency },
                  ] as { label: string; val: number; display: number }[]).map(({ label, val, display }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-[11px] text-muted-foreground truncate">{label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={cn('h-full rounded-full', attrBgColor(val))} style={{ width: `${val}%` }} />
                      </div>
                      <span className={cn('w-7 shrink-0 text-right text-[11px] font-mono font-bold tabular-nums', attrColor(val))}>
                        {display}
                      </span>
                    </div>
                  ))}
                </div>
              </div>}
            </div>
          </TabsContent>

          {/* ── TAB: DEVELOPMENT ──────────────────────────────────────── */}
          <TabsContent value="development" className="space-y-4">
            {projCtx ? (
              <div className="grid gap-4 md:grid-cols-2">
                {/* Focus selector */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Development Focus</CardTitle>
                    <CardDescription className="text-xs">
                      {isUserClubPlayer
                        ? 'Assign a focus to prioritise growth in specific skill areas.'
                        : "Preview what this player's development would look like under different focuses."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium">
                        {isUserClubPlayer ? 'Assigned Focus' : 'Preview Focus'}
                      </label>
                      {isUserClubPlayer ? (
                        <Select
                          value={player.trainingFocus ?? '__none__'}
                          onValueChange={(v) => {
                            const nextFocus = v === '__none__' ? null : (v as PlayerTrainingFocus)
                            setPlayerTrainingFocus(player.id, nextFocus)
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select focus..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No assigned focus</SelectItem>
                            {PLAYER_TRAINING_FOCUS_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {PLAYER_TRAINING_FOCUS_LABELS[option]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select
                          value={
                            previewFocus === '__current__'
                              ? (player.trainingFocus ?? '__none__')
                              : (previewFocus ?? '__none__')
                          }
                          onValueChange={(v) => {
                            setPreviewFocus(v === '__none__' ? null : (v as PlayerTrainingFocus))
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select focus to preview..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No focus</SelectItem>
                            {PLAYER_TRAINING_FOCUS_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {PLAYER_TRAINING_FOCUS_LABELS[option]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Current focus badge */}
                    {player.trainingFocus && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Current:</span>
                        <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-xs">
                          {PLAYER_TRAINING_FOCUS_LABELS[player.trainingFocus]}
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Projection panel */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Offseason Projection</CardTitle>
                    <CardDescription className="text-xs">
                      Expected attribute changes after one offseason cycle.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TrainingProjectionPanel
                      player={player}
                      selectedFocus={
                        isUserClubPlayer
                          ? (player.trainingFocus ?? null)
                          : (previewFocus === '__current__' ? (player.trainingFocus ?? null) : previewFocus)
                      }
                      ctx={projCtx}
                    />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="py-6 text-center text-muted-foreground text-sm">
                  Development projection unavailable — club data not found.
                </CardContent>
              </Card>
            )}

            {/* Personality */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Personality</p>
              {(
                [
                  { label: 'Ambition', value: player.personality.ambition },
                  { label: 'Loyalty', value: player.personality.loyalty },
                  { label: 'Professionalism', value: player.personality.professionalism },
                  { label: 'Temperament', value: player.personality.temperament },
                ] as { label: string; value: number }[]
              ).map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className={cn('text-sm font-bold font-mono tabular-nums', attrColor(value))}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Jumper preference details */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Jumper Preference</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Preference</span>
                <span className="text-xs font-medium">{jumperPreferenceLabel(player.jumperPreference?.level)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Preferred Numbers</span>
                <span className="text-xs font-medium font-mono">
                  {player.jumperPreference?.preferredNumbers?.length
                    ? player.jumperPreference.preferredNumbers.map((n) => `#${n}`).join(', ')
                    : 'None'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Current Number</span>
                <span className="text-xs font-medium font-mono">
                  {player.jerseyNumber > 0 ? `#${player.jerseyNumber}` : 'Unassigned'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Morale Impact</span>
                <span className={cn('text-xs font-medium', attrColor(50 + jumperPreferenceImpact * 15))}>
                  {jumperPreferenceImpact === 0
                    ? 'Neutral'
                    : `${jumperPreferenceImpact > 0 ? '+' : ''}${jumperPreferenceImpact}`}
                </span>
              </div>
            </div>
          </TabsContent>

          {/* ── TAB: HISTORY ──────────────────────────────────────────── */}
          <TabsContent value="history" className="space-y-4">

            {/* Season + Career stat summaries */}
            <div className="grid gap-4 md:grid-cols-2">
              <OverviewStatsPanel title={`${currentYear} Season`} stats={ss} />
              <OverviewStatsPanel title="Career" stats={cs} />
            </div>

            {/* Year-by-year stats */}
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Year-by-Year Stats</CardTitle>
                  <div className="flex gap-1">
                    <Button size="sm" variant={ybyMode === 'avg' ? 'default' : 'outline'} className="h-6 px-2 text-xs" onClick={() => setYbyMode('avg')}>Avg</Button>
                    <Button size="sm" variant={ybyMode === 'total' ? 'default' : 'outline'} className="h-6 px-2 text-xs" onClick={() => setYbyMode('total')}>Total</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {yearByYearRows.length === 0 ? (
                  <p className="px-4 pb-4 text-sm text-muted-foreground">No season history recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-muted-foreground">
                          <th className="sticky left-0 bg-card px-3 py-2 font-medium">Year</th>
                          <th className="px-2 py-2 font-medium">Club</th>
                          <th className="px-2 py-2 text-center font-medium">Age</th>
                          <th className="px-2 py-2 text-center font-medium">OVR</th>
                          <th className="px-2 py-2 text-center font-medium">GP</th>
                          <th className="px-2 py-2 text-center font-medium">D</th>
                          <th className="px-2 py-2 text-center font-medium">K</th>
                          <th className="px-2 py-2 text-center font-medium">HB</th>
                          <th className="px-2 py-2 text-center font-medium">G</th>
                          <th className="px-2 py-2 text-center font-medium">B</th>
                          <th className="px-2 py-2 text-center font-medium">M</th>
                          <th className="px-2 py-2 text-center font-medium">T</th>
                          <th className="px-2 py-2 text-center font-medium">HO</th>
                          <th className="px-2 py-2 text-center font-medium">CL</th>
                          <th className="px-2 py-2 text-center font-medium">I50</th>
                          <th className="px-2 py-2 text-center font-medium">AF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearByYearRows.map((entry, idx) => {
                          const gp = Math.max(1, entry.stats.gamesPlayed)
                          const fmt = (n: number) => ybyMode === 'avg' ? (n / gp).toFixed(1) : String(n)
                          const fmtZ = (n: number) => n === 0 ? '—' : fmt(n)
                          // OVR delta vs previous year (rows sorted newest→oldest, so idx+1 is older)
                          const olderEntry = yearByYearRows[idx + 1]
                          const ovrDelta = olderEntry ? entry.overall - olderEntry.overall : null
                          return (
                            <tr
                              key={`${entry.year}-${entry.playerId}`}
                              className={cn(
                                'border-b border-border/40 last:border-0 transition-colors hover:bg-muted/30',
                                entry.inProgress && 'bg-primary/5',
                              )}
                            >
                              <td className="sticky left-0 bg-inherit px-3 py-1.5 font-medium">
                                <div className="flex items-center gap-1.5">
                                  {entry.year}
                                  {entry.inProgress && <Badge variant="secondary" className="h-4 px-1 py-0 text-[9px]">Live</Badge>}
                                </div>
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: clubs[entry.clubId]?.colors.primary ?? '#888' }} />
                                  <span className="text-muted-foreground">{clubs[entry.clubId]?.abbreviation ?? entry.clubId}</span>
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-center text-muted-foreground">{entry.age ?? '—'}</td>
                              <td className="px-2 py-1.5 text-center">
                                <div className="flex flex-col items-center leading-none gap-0.5">
                                  <span className="font-mono font-semibold">{entry.overall}</span>
                                  {ovrDelta !== null && (
                                    <span className={cn('text-[10px]', ovrDelta > 0 ? 'text-green-600' : ovrDelta < 0 ? 'text-red-500' : 'text-muted-foreground')}>
                                      {ovrDelta > 0 ? `+${ovrDelta}` : ovrDelta === 0 ? '—' : String(ovrDelta)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-center font-mono">{entry.stats.gamesPlayed}</td>
                              <td className="px-2 py-1.5 text-center font-mono font-medium">{fmt(entry.stats.disposals)}</td>
                              <td className="px-2 py-1.5 text-center font-mono">{fmt(entry.stats.kicks)}</td>
                              <td className="px-2 py-1.5 text-center font-mono">{fmt(entry.stats.handballs)}</td>
                              <td className="px-2 py-1.5 text-center font-mono">{fmt(entry.stats.goals)}</td>
                              <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">{fmt(entry.stats.behinds)}</td>
                              <td className="px-2 py-1.5 text-center font-mono">{fmt(entry.stats.marks)}</td>
                              <td className="px-2 py-1.5 text-center font-mono">{fmt(entry.stats.tackles)}</td>
                              <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">{fmtZ(entry.stats.hitouts)}</td>
                              <td className="px-2 py-1.5 text-center font-mono">{fmt(entry.stats.clearances)}</td>
                              <td className="px-2 py-1.5 text-center font-mono">{fmt(entry.stats.insideFifties)}</td>
                              <td className="px-2 py-1.5 text-center font-mono">{fmt(entry.stats.aflFantasyPoints)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Honours / Awards */}
            {(honours.brownlowVotes > 0 || honours.brownlowWins > 0 || honours.colemanWins > 0 || honours.risingStarWins > 0 || honours.allAustralianCount > 0 || honours.bnfWins > 0) && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    Honours
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {honours.brownlowWins > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Brownlow Medals</span>
                      <span className="font-mono font-bold text-yellow-500">{honours.brownlowWins}</span>
                    </div>
                  )}
                  {honours.brownlowVotes > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Brownlow Votes (current season)</span>
                      <span className="font-mono font-medium">{honours.brownlowVotes}</span>
                    </div>
                  )}
                  {honours.colemanWins > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Coleman Medals</span>
                      <span className="font-mono font-bold text-yellow-500">{honours.colemanWins}</span>
                    </div>
                  )}
                  {honours.risingStarWins > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rising Star Awards</span>
                      <span className="font-mono font-bold">{honours.risingStarWins}</span>
                    </div>
                  )}
                  {honours.allAustralianCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">All-Australian Selections</span>
                      <span className="font-mono font-bold">{honours.allAustralianCount}</span>
                    </div>
                  )}
                  {honours.bnfWins > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Club Best &amp; Fairest</span>
                      <span className="font-mono font-bold">{honours.bnfWins}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Injury history */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Injury History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {player.injuryHistory.length === 0 ? (
                  <p className="text-muted-foreground">No recorded injuries.</p>
                ) : (() => {
                  const totalMissed = getTotalGamesMissed(player)
                  const recurringRegions = getRecurringBodyRegions(player)
                  const riskLevel = getInjuryRiskLevel(player)
                  const { label: riskLabel, bgClass } = injuryRiskDisplay(riskLevel)
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium', bgClass)}>
                          {riskLabel}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {player.injuryHistory.length} career injur{player.injuryHistory.length === 1 ? 'y' : 'ies'}
                          {totalMissed > 0 && ` · ${totalMissed} game${totalMissed !== 1 ? 's' : ''} missed`}
                        </span>
                      </div>
                      {recurringRegions.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>Recurring {recurringRegions.map(bodyRegionLabel).join(' & ')} issues</span>
                        </div>
                      )}
                      {[...player.injuryHistory].slice(-8).reverse().map((h, idx) => (
                        <div key={`${h.occurredOn}-${h.type}-${idx}`} className="flex items-center justify-between border-b border-border/40 pb-1 last:border-0">
                          <div>
                            <p className="font-medium">
                              {h.type}
                              {h.recurring ? <span className="text-red-500"> (recurring)</span> : null}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {h.occurredOn}{h.recoveredOn ? ` to ${h.recoveredOn}` : ' to present'}
                            </p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="font-mono">{h.initialWeeks}w</p>
                            <p className="text-muted-foreground">{h.gamesMissed} games missed</p>
                          </div>
                        </div>
                      ))}
                    </>
                  )
                })()}
              </CardContent>
            </Card>

            {/* Milestones */}
            {(() => {
              const playerMilestones = (history.milestones ?? [])
                .filter((m) => m.playerId === playerId)
                .sort((a, b) => b.year - a.year || b.round - a.round)
              return playerMilestones.length > 0 ? (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Milestones</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {playerMilestones.map((m) => (
                      <div key={m.id} className="flex items-center justify-between border-b border-border/40 pb-1 last:border-0">
                        <div>
                          <p className="font-medium">{m.threshold} {m.type === 'games-played' ? 'Games' : m.type === 'career-goals' ? 'Goals' : m.type === 'career-disposals' ? 'Disposals' : m.type === 'career-marks' ? 'Marks' : m.type === 'career-tackles' ? 'Tackles' : m.type}</p>
                          <p className="text-xs text-muted-foreground">{m.year}, Round {m.round}</p>
                        </div>
                        <span className="font-mono text-xs">{m.value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null
            })()}

            {/* Contract history */}
            {(player.contractHistory && player.contractHistory.length > 0) && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Contract History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {[...player.contractHistory].reverse().map((entry, idx) => (
                    <div key={idx} className="flex items-center justify-between border-b border-border/40 pb-1 last:border-0">
                      <div>
                        <p className="font-medium capitalize">{entry.type.replace(/-/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">{entry.note}</p>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{entry.date}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Jumper number history */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Jumper Number History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {jumperHistory.length === 0 ? (
                  <p className="text-muted-foreground">No jumper history recorded yet.</p>
                ) : (
                  jumperHistory.map((entry, idx) => (
                    <div key={`${entry.year}-${entry.clubId}-${idx}`} className="flex items-center justify-between border-b border-border/40 pb-1 last:border-0">
                      <div>
                        <p className="font-medium">{entry.year}</p>
                        <p className="text-xs text-muted-foreground">{clubs[entry.clubId]?.name ?? entry.clubId}</p>
                      </div>
                      <Badge variant="outline" className="font-mono">#{entry.jumperNumber}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Draft + career milestones */}
            {(draftInfo || cs.gamesPlayed > 0) && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Career</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {draftInfo && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Draft</span>
                      <span className="font-medium">
                        Drafted by {clubs[draftInfo.clubId]?.name ?? draftInfo.clubId} in {draftInfo.year}, Pick #{draftInfo.pickNumber}
                      </span>
                    </div>
                  )}
                  {cs.gamesPlayed > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Career Games</span>
                        <span className="font-mono font-medium">{cs.gamesPlayed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Career Goals</span>
                        <span className="font-mono font-medium">{cs.goals}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Career Disposals</span>
                        <span className="font-mono font-medium">{cs.disposals}</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function OverviewStatsPanel({
  title,
  stats,
}: {
  title: string
  stats: import('@/types/player').PlayerCareerStats
}) {
  const gp = stats.gamesPlayed
  const avg = (v: number) => (gp > 0 ? (v / gp).toFixed(1) : '—')

  if (gp === 0) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No stats recorded yet.</p>
        </CardContent>
      </Card>
    )
  }

  const groups: { label: string; rows: { label: string; total: number }[] }[] = [
    {
      label: 'Scoring',
      rows: [
        { label: 'Goals',              total: stats.goals },
        { label: 'Behinds',            total: stats.behinds },
        { label: 'Goal Assists',        total: stats.goalAssists },
        { label: 'Score Involvements', total: stats.scoreInvolvements },
        { label: 'Inside 50s',         total: stats.insideFifties },
      ],
    },
    {
      label: 'Possession',
      rows: [
        { label: 'Disposals',          total: stats.disposals },
        { label: 'Kicks',              total: stats.kicks },
        { label: 'Handballs',          total: stats.handballs },
        { label: 'Marks',              total: stats.marks },
        { label: 'Contested Marks',    total: stats.contestedMarks },
        { label: 'Clearances',         total: stats.clearances },
        { label: 'Hitouts',            total: stats.hitouts },
      ],
    },
    {
      label: 'Pressure & Defence',
      rows: [
        { label: 'Tackles',            total: stats.tackles },
        { label: 'Contested Poss',     total: stats.contestedPossessions },
        { label: 'Intercepts',         total: stats.intercepts },
        { label: 'Rebound 50s',        total: stats.rebound50s },
        { label: 'One Percenters',     total: stats.onePercenters },
        { label: 'Turnovers',          total: stats.turnovers },
        { label: 'Clangers',           total: stats.clangers },
      ],
    },
    {
      label: 'Fantasy & Metres',
      rows: [
        { label: 'AFL Fantasy',        total: stats.aflFantasyPoints },
        { label: 'SuperCoach',         total: stats.superCoachPoints },
        { label: 'Metres Gained',      total: stats.metresGained },
      ],
    },
  ]

  // Filter out rows with no recorded value and groups that become empty
  const activeGroups = groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => r.total > 0) }))
    .filter((g) => g.rows.length > 0)

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
          <span className="text-xs text-muted-foreground">{gp} games</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeGroups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{row.label}</span>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="text-muted-foreground/50">{row.total}</span>
                    <span className="font-semibold w-10 text-right">
                      {avg(row.total)}
                      <span className="text-muted-foreground/40 font-normal">/g</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

