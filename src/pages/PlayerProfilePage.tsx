import { useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ArrowLeftRight, Heart, Zap, TrendingUp, Shield, AlertTriangle, Trophy, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Player, PlayerJumperPreferenceLevel, PlayerPositionType, PlayerTrainingFocus } from '@/types/player'
import {
  PLAYER_TRAINING_FOCUS_LABELS,
  PLAYER_TRAINING_FOCUS_OPTIONS,
} from '@/engine/players/trainingFocus'
import { computeProjectionContext } from '@/lib/trainingProjection'
import { TrainingProjectionPanel } from '@/components/training/TrainingProjectionPanel'
import { getPlayerEligiblePositionTypes } from '@/engine/player/positionEligibility'
import { getOverallRating, getPlayerStarRating } from '@/engine/player/playerRating'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { getPositionBadgeClass } from '@/lib/positionColor'
import { ShortlistAssignMenu } from '@/components/shortlists/ShortlistManager'
import { ATTR_CATEGORIES, attrColor, attrBgColor } from '@/lib/attributeCategories'
import { matchRatingColorClass } from '@/engine/match/matchRatings'
import { getPlayerRecentGames } from '@/lib/formGuide'
import { getTotalGamesMissed, getRecurringBodyRegions, bodyRegionLabel, getInjuryRiskLevel, injuryRiskDisplay } from '@/lib/injuryRisk'
import { FormDots } from '@/components/player/FormDots'

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

function formatSignedDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
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

const FIELD_POSITION_COORDS: Record<PlayerPositionType, { x: number; y: number }> = {
  BP: { x: 20, y: 86 },
  FB: { x: 50, y: 90 },
  HBF: { x: 80, y: 86 },
  CHB: { x: 50, y: 72 },
  W: { x: 16, y: 50 },
  IM: { x: 42, y: 50 },
  OM: { x: 58, y: 50 },
  RK: { x: 50, y: 50 },
  HFF: { x: 20, y: 14 },
  CHF: { x: 50, y: 28 },
  FP: { x: 80, y: 14 },
  FF: { x: 50, y: 10 },
}

function PositionHeatMapCard({ player }: { player: Player }) {
  const secondary = new Set(player.position.secondary)
  const eligible = new Set<PlayerPositionType>(
    getPlayerEligiblePositionTypes(player),
  )

  function getChipStyle(pos: PlayerPositionType): string {
    const base = getPositionBadgeClass(pos)
    if (pos === player.position.primary) return `${base} ring-1 ring-white/60`
    if (secondary.has(pos)) return base
    return `${base} opacity-85`
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Position Heat Map</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="mx-auto w-full max-w-sm aspect-[3/4] rounded-[40%] border border-emerald-600/50 bg-gradient-to-b from-emerald-600/30 via-emerald-700/25 to-emerald-800/25 p-3">
          <div className="relative h-full w-full rounded-[42%] border border-emerald-400/35">
            <div className="absolute left-1/2 top-1/2 h-[38%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
            <div className="absolute left-1/2 top-1/2 h-[15%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
            <div className="absolute left-1/2 top-0 h-[18%] w-[42%] -translate-x-1/2 border-b border-white/25" />
            <div className="absolute left-1/2 bottom-0 h-[18%] w-[42%] -translate-x-1/2 border-t border-white/25" />

            {(Object.keys(FIELD_POSITION_COORDS) as PlayerPositionType[])
              .filter((pos) => eligible.has(pos))
              .map((pos) => {
                const coords = FIELD_POSITION_COORDS[pos]
                return (
                  <div
                    key={pos}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded border px-2 py-0.5 text-[10px] font-bold tracking-wide shadow ${getChipStyle(pos)}`}
                    style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
                  >
                    {pos}
                  </div>
                )
              })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded border px-2 py-0.5 ${getPositionBadgeClass('DEF')}`}>Defenders</span>
          <span className={`rounded border px-2 py-0.5 ${getPositionBadgeClass('MID')}`}>Midfielders</span>
          <span className={`rounded border px-2 py-0.5 ${getPositionBadgeClass('FWD')}`}>Forwards</span>
          <span className={`rounded border px-2 py-0.5 ${getPositionBadgeClass('RK')}`}>Rucks</span>
        </div>
      </CardContent>
    </Card>
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
  const yearByYearRows = hasCurrentSeasonSnapshot
    ? historicalSeasonRows.map((entry) => ({ ...entry, inProgress: false }))
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
      ]
  const ratingProgressionRows = [...yearByYearRows]
    .sort((a, b) => a.year - b.year)
    .map((entry, index, list) => {
      const prev = index > 0 ? list[index - 1] : null
      return {
        ...entry,
        overallDelta: prev ? entry.overall - prev.overall : null,
      }
    })
    .reverse()
  const secondaryPositions = new Set(player.position.secondary)
  const alternatePositions = getPlayerEligiblePositionTypes(player).filter(
    (pos) => pos !== player.position.primary,
  )
  const jumperPreferenceImpact = getJumperPreferenceMoraleImpact(player)
  const jumperHistory = [...player.jumperHistory].sort((a, b) => b.year - a.year)
  const isUserClubPlayer = player.clubId === playerClubId
  const tradeListing = tradeBlock.listings[player.id]

  // Projection context (coaching + facilities for the player's club)
  const projCtx = useMemo(() => {
    const playerClub = clubs[player.clubId]
    if (!playerClub) return null
    const clubStaff = Object.values(staff).filter((s) => s.clubId === player.clubId)
    return computeProjectionContext(playerClub, clubStaff)
  }, [clubs, staff, player.clubId])
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div
          className="h-14 w-14 rounded-full flex items-center justify-center text-white font-bold text-xl"
          style={{ backgroundColor: club?.colors.primary ?? '#666' }}
        >
          {player.jerseyNumber}
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {player.firstName} {player.lastName}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{club?.name}</span>
            <span>&middot;</span>
            <Badge variant="outline" className={getPositionBadgeClass(player.position.primary)}>{player.position.primary}</Badge>
            {alternatePositions.map((pos) => (
              <Badge
                key={pos}
                variant="outline"
                className={`text-xs ${getPositionBadgeClass(pos)} ${secondaryPositions.has(pos) ? '' : 'opacity-85'}`}
              >
                {pos}
              </Badge>
            ))}
            <span>&middot;</span>
            <span>Age {player.age}</span>
            <span>&middot;</span>
            <span>{player.height}cm / {player.weight}kg</span>
            <span>&middot;</span>
            {(player.suspension?.weeksRemaining ?? 0) > 0 ? (
              <Badge variant="outline" className="text-[10px] border-orange-500/30 bg-orange-500/15 text-orange-700">
                Suspended ({player.suspension?.weeksRemaining ?? 0}w)
              </Badge>
            ) : player.injury ? (
              <Badge variant="outline" className="text-[10px] border-red-500/30 bg-red-500/15 text-red-600">
                {player.injury.type} ({player.injury.weeksRemaining}w)
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-green-500/30 bg-green-500/15 text-green-600">
                Fit
              </Badge>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(`/compare/${player.id}`)}>
            <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" /> Compare
          </Button>
          <div className="text-right">
            <div className="text-3xl font-bold">{overall}</div>
            <PlayerStarRating stars={getPlayerStarRating(player, overall)} player={player} overall={overall} className="justify-end" />
            <p className="text-xs text-muted-foreground">Overall</p>
          </div>
        </div>
      </div>

      {/* Status gauges */}
      <div className="grid gap-4 md:grid-cols-5">
        <StatusCard icon={Heart} label="Morale" value={player.morale} sub={moraleLabel(player.morale)} />
        <StatusCard icon={Zap} label="Fitness" value={player.fitness} />
        <StatusCard icon={TrendingUp} label="Form" value={player.form} />
        <StatusCard icon={Shield} label="Fatigue" value={player.fatigue} inverted />
        {player.injury ? (
          <Card className="border-red-500/50">
            <CardContent className="py-3 text-center">
              <AlertTriangle className="mx-auto h-5 w-5 text-red-500 mb-1" />
              <p className="text-sm font-semibold text-red-500">{player.injury.type}</p>
              <p className="text-xs text-muted-foreground">{player.injury.weeksRemaining} weeks</p>
              {player.injury.severity && (
                <p className="text-[11px] text-muted-foreground capitalize">
                  {player.injury.severity} {player.injury.recurring ? '• recurring' : ''}
                </p>
              )}
              {player.injury.recoveryProgress !== undefined && (
                <p className="text-[11px] text-muted-foreground">
                  Recovery {Math.round(player.injury.recoveryProgress)}%
                </p>
              )}
            </CardContent>
          </Card>
        ) : (player.suspension?.weeksRemaining ?? 0) > 0 ? (
          <Card className="border-orange-500/50">
            <CardContent className="py-3 text-center">
              <Shield className="mx-auto h-5 w-5 text-orange-500 mb-1" />
              <p className="text-sm font-semibold text-orange-600">Suspended</p>
              <p className="text-xs text-muted-foreground">{player.suspension?.weeksRemaining ?? 0} weeks remaining</p>
              <p className="text-[11px] text-muted-foreground">{player.suspension?.reason}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-3 text-center">
              <Shield className="mx-auto h-5 w-5 text-green-500 mb-1" />
              <p className="text-sm font-semibold text-green-500">Healthy</p>
              <p className="text-xs text-muted-foreground">No injury</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Injury History Summary ───────────────────────────────────────── */}
      {(player.injuryHistory?.length ?? 0) > 0 && (() => {
        const totalMissed = getTotalGamesMissed(player)
        const recurringRegions = getRecurringBodyRegions(player)
        const riskLevel = getInjuryRiskLevel(player)
        const { label: riskLabel, bgClass } = injuryRiskDisplay(riskLevel)
        const recent = [...(player.injuryHistory ?? [])].reverse().slice(0, 5)
        return (
          <Card>
            <CardContent className="py-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">Injury History</p>
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${bgClass}`}>
                  {riskLabel}
                </span>
                <span className="text-xs text-muted-foreground">
                  {player.injuryHistory!.length} career injur{player.injuryHistory!.length === 1 ? 'y' : 'ies'}
                  {totalMissed > 0 && ` · ${totalMissed} game${totalMissed !== 1 ? 's' : ''} missed`}
                </span>
              </div>

              {recurringRegions.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Recurring {recurringRegions.map(bodyRegionLabel).join(' & ')} issues</span>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {recent.map((h, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1 rounded border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px]"
                  >
                    <span className="font-medium">{h.type}</span>
                    <span className="text-muted-foreground capitalize">{h.severity}</span>
                    <span className="text-muted-foreground">{h.initialWeeks}w</span>
                    {(h.gamesMissed ?? 0) > 0 && (
                      <span className="text-muted-foreground">{h.gamesMissed} gm</span>
                    )}
                    {h.recurring && (
                      <span className="text-amber-600 font-semibold">↩</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })()}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Profile Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isUserClubPlayer ? (
            <>
              <div className="flex flex-wrap gap-2">
                <ShortlistAssignMenu targetType="player" targetId={player.id} buttonLabel="Add to Shortlist" buttonVariant="outline" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleStartNegotiation}>Start Contract Negotiation</Button>
                <Button size="sm" variant="outline" onClick={() => navigate('/contracts')}>Open Contracts</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={tradeListing?.availability === 'available' ? 'default' : 'outline'}
                  onClick={() => handleSetAvailability('available')}
                >
                  Trade: Available
                </Button>
                <Button
                  size="sm"
                  variant={tradeListing?.availability === 'reluctant' ? 'default' : 'outline'}
                  onClick={() => handleSetAvailability('reluctant')}
                >
                  Trade: Reluctant
                </Button>
                <Button
                  size="sm"
                  variant={tradeListing?.availability === 'salary-dump' ? 'default' : 'outline'}
                  onClick={() => handleSetAvailability('salary-dump')}
                >
                  Trade: Salary Dump
                </Button>
                {tradeListing ? (
                  <Button size="sm" variant="ghost" onClick={() => { clearPlayerTradeAvailability(player.id); setSuccess('Player removed from trade block.') }}>
                    Remove Trade Listing
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="destructive" onClick={handleDelist}>
                  Delist Player
                </Button>
                <span className="text-xs text-muted-foreground">
                  {inDelistingsPhase ? 'Delistings phase active.' : 'Delistings available only during offseason delistings.'}
                </span>
              </div>
              {actionError ? <p className="text-sm text-red-500">{actionError}</p> : null}
              {actionSuccess ? <p className="text-sm text-green-600">{actionSuccess}</p> : null}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <ShortlistAssignMenu targetType="player" targetId={player.id} buttonLabel="Add to Shortlist" buttonVariant="outline" />
              <p className="text-sm text-muted-foreground">Club actions are only available for players at your club.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="stats" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-7">
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="ratings">Ratings</TabsTrigger>
          <TabsTrigger value="development">Development</TabsTrigger>
          <TabsTrigger value="contract">Contract</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="awards">Awards</TabsTrigger>
          <TabsTrigger value="personality">Personality</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-4">
          {/* Last 10 games table */}
          {recentGames.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-3">
                  Last {recentGames.length} Games
                  <FormDots ratings={player.matchRatingHistory} />
                  {player.lastMatchRating !== undefined && (
                    <span className={`text-base font-mono font-bold tabular-nums ${matchRatingColorClass(player.lastMatchRating)}`}>
                      {player.lastMatchRating.toFixed(1)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs space-y-0">
                  <div className="grid grid-cols-[3.5rem_3.5rem_2rem_3rem_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem_3rem] gap-x-2 text-muted-foreground font-medium pb-1 border-b border-border/50">
                    <span>Round</span>
                    <span>Opp</span>
                    <span></span>
                    <span className="text-right">Disp</span>
                    <span className="text-right">G</span>
                    <span className="text-right">M</span>
                    <span className="text-right">T</span>
                    <span className="text-right">HO</span>
                    <span className="text-right">CL</span>
                    <span className="text-right">Rating</span>
                  </div>
                  {recentGames.map((g) => {
                    const opp = clubs[g.opponentClubId]
                    const rating = g.stats.matchRating
                    return (
                      <div
                        key={g.matchId}
                        className="grid grid-cols-[3.5rem_3.5rem_2rem_3rem_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem_3rem] gap-x-2 items-center py-1 border-b border-border/30 last:border-0 hover:bg-muted/30"
                      >
                        <span className="text-muted-foreground">
                          {g.isFinal ? 'Final' : `Rd ${g.round + 1}`}
                        </span>
                        <span className="font-medium truncate">{opp?.abbreviation ?? '???'}</span>
                        <span>
                          {g.won === true
                            ? <span className="font-bold text-green-500">W</span>
                            : g.won === false
                              ? <span className="font-bold text-red-500">L</span>
                              : <span className="font-bold text-zinc-500">D</span>}
                        </span>
                        <span className="text-right tabular-nums font-mono">{g.stats.disposals}</span>
                        <span className="text-right tabular-nums font-mono">{g.stats.goals}</span>
                        <span className="text-right tabular-nums font-mono">{g.stats.marks}</span>
                        <span className="text-right tabular-nums font-mono">{g.stats.tackles}</span>
                        <span className="text-right tabular-nums font-mono">{g.stats.hitouts}</span>
                        <span className="text-right tabular-nums font-mono">{g.stats.clearances}</span>
                        <span className={`text-right tabular-nums font-mono font-bold ${matchRatingColorClass(rating)}`}>
                          {rating !== undefined ? rating.toFixed(1) : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Season Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <StatsTable stats={ss} gamesPlayed={ss.gamesPlayed} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Career Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <StatsTable stats={cs} gamesPlayed={cs.gamesPlayed} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ratings" className="space-y-4">
          <PositionHeatMapCard player={player} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ATTR_CATEGORIES.map((cat) => (
              <Card key={cat.label}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">{cat.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {cat.attrs.map(({ key, label }) => {
                    const val = player.attributes[key]
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="w-28 text-xs text-muted-foreground truncate">{label}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${attrBgColor(val)}`}
                            style={{ width: `${val}%` }}
                          />
                        </div>
                        <span className={`w-7 text-right text-xs font-mono font-bold ${attrColor(val)}`}>
                          {val}
                        </span>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

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
                      : 'Preview what this player\'s development would look like under different focuses.'}
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
        </TabsContent>

        <TabsContent value="contract">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Contract Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Years Remaining</span>
                <span className="font-medium">{player.contract.yearsRemaining}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">AAV</span>
                <span className="font-medium">${(player.contract.aav / 1000).toFixed(0)}k</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Year-by-Year</span>
                <span className="font-medium font-mono text-xs">
                  {player.contract.yearByYear.map((y) => `$${(y / 1000).toFixed(0)}k`).join(', ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={player.contract.isRestricted ? 'secondary' : 'outline'}>
                  {player.contract.isRestricted ? 'Restricted FA' : 'Unrestricted FA'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">List</span>
                <Badge variant={player.isRookie ? 'secondary' : 'default'}>
                  {player.isRookie ? 'Rookie' : 'Senior'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Durability</span>
                <span className={`font-mono font-medium ${attrColor(player.hiddenAttributes.durability)}`}>
                  {player.hiddenAttributes.durability}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Injury Proneness</span>
                <span className={`font-mono font-medium ${attrColor(100 - player.hiddenAttributes.injuryProneness)}`}>
                  {player.hiddenAttributes.injuryProneness}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Year-by-Year Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {yearByYearRows.length === 0 ? (
                <p className="text-muted-foreground">No season history recorded yet.</p>
              ) : (
                yearByYearRows.map((entry) => (
                  <div key={`${entry.year}-${entry.playerId}`} className="rounded border border-border/60 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{entry.year}</span>
                        <Badge variant="outline">{clubs[entry.clubId]?.abbreviation ?? entry.clubId}</Badge>
                        {entry.inProgress ? <Badge variant="secondary">In Progress</Badge> : null}
                      </div>
                      <span className="font-mono text-xs">OVR {entry.overall}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-xs">
                      <span className="text-muted-foreground">GP: <span className="font-mono text-foreground">{entry.stats.gamesPlayed}</span></span>
                      <span className="text-muted-foreground">G: <span className="font-mono text-foreground">{entry.stats.goals}</span></span>
                      <span className="text-muted-foreground">D: <span className="font-mono text-foreground">{entry.stats.disposals}</span></span>
                      <span className="text-muted-foreground">M: <span className="font-mono text-foreground">{entry.stats.marks}</span></span>
                      <span className="text-muted-foreground">T: <span className="font-mono text-foreground">{entry.stats.tackles}</span></span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Rating Progression</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {ratingProgressionRows.length === 0 ? (
                <p className="text-muted-foreground">No rating progression recorded yet.</p>
              ) : (
                ratingProgressionRows.map((entry) => (
                  <div key={`rating-${entry.year}-${entry.playerId}`} className="flex items-center justify-between border-b border-border/40 pb-1 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.year}</span>
                      {entry.inProgress ? <Badge variant="secondary">In Progress</Badge> : null}
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-medium">{entry.overall}</p>
                      <p className={`text-xs ${entry.overallDelta == null ? 'text-muted-foreground' : entry.overallDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {entry.overallDelta == null ? 'Baseline' : formatSignedDelta(entry.overallDelta)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {(draftInfo || cs.gamesPlayed > 0) ? (
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
          ) : null}

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
                        <p className="text-xs text-muted-foreground">
                          {m.year}, Round {m.round}
                        </p>
                      </div>
                      <span className="font-mono text-xs">{m.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null
          })()}

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Injury History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {player.injuryHistory.length === 0 ? (
                <p className="text-muted-foreground">No recorded injuries.</p>
              ) : (
                [...player.injuryHistory]
                  .slice(-8)
                  .reverse()
                  .map((h, idx) => (
                    <div key={`${h.occurredOn}-${h.type}-${idx}`} className="flex items-center justify-between border-b border-border/40 pb-1 last:border-0">
                      <div>
                        <p className="font-medium">
                          {h.type}
                          {h.recurring ? <span className="text-red-500"> (recurring)</span> : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {h.occurredOn}
                          {h.recoveredOn ? ` to ${h.recoveredOn}` : ' to present'}
                        </p>
                      </div>
                      <div className="text-right text-xs">
                        <p className="font-mono">{h.initialWeeks}w</p>
                        <p className="text-muted-foreground">{h.gamesMissed} games missed</p>
                      </div>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>

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
        </TabsContent>

        <TabsContent value="awards">
          {(honours.brownlowVotes > 0 || honours.brownlowWins > 0 || honours.colemanWins > 0 || honours.risingStarWins > 0 || honours.allAustralianCount > 0 || honours.bnfWins > 0) ? (
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
                    <span className="text-muted-foreground">Club Best & Fairest</span>
                    <span className="font-mono font-bold">{honours.bnfWins}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">No major awards recorded yet.</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="personality" className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Jumper Number Preference</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Preference</span>
                <span className="font-medium">{jumperPreferenceLabel(player.jumperPreference?.level)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Preferred Numbers</span>
                <span className="font-medium font-mono">
                  {player.jumperPreference?.preferredNumbers?.length
                    ? player.jumperPreference.preferredNumbers.map((n) => `#${n}`).join(', ')
                    : 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Number</span>
                <span className="font-medium font-mono">
                  {player.jerseyNumber > 0 ? `#${player.jerseyNumber}` : 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Morale Impact</span>
                <span className={`font-medium ${attrColor(50 + jumperPreferenceImpact * 15)}`}>
                  {jumperPreferenceImpact === 0
                    ? 'Neutral'
                    : `${jumperPreferenceImpact > 0 ? '+' : ''}${jumperPreferenceImpact}`}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Personality Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <PersonalityBar label="Ambition" value={player.personality.ambition} />
              <PersonalityBar label="Loyalty" value={player.personality.loyalty} />
              <PersonalityBar label="Professionalism" value={player.personality.professionalism} />
              <PersonalityBar label="Temperament" value={player.personality.temperament} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatusCard({
  icon: Icon,
  label,
  value,
  sub,
  inverted,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  sub?: string
  inverted?: boolean
}) {
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <Icon className={`mx-auto h-5 w-5 mb-1 ${attrColor(inverted ? 100 - value : value)}`} />
        <p className={`text-2xl font-bold ${attrColor(inverted ? 100 - value : value)}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-xs font-medium mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function PersonalityBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/60"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-6 text-right text-xs font-mono">{value}</span>
    </div>
  )
}

function StatsTable({
  stats,
  gamesPlayed,
}: {
  stats: import('@/types/player').PlayerCareerStats
  gamesPlayed: number
}) {
  if (gamesPlayed === 0) {
    return <p className="text-sm text-muted-foreground">No stats recorded.</p>
  }

  const rows: { code: string; label: string; desc: string; total: number; avg: number | null; formatTotal?: (v: number) => string }[] = [
    { code: 'GP', label: 'Games Played', desc: 'Matches played.', total: gamesPlayed, avg: null },
    { code: 'AF', label: 'AFL Fantasy', desc: 'AFL Fantasy points total.', total: stats.aflFantasyPoints, avg: stats.aflFantasyPoints / gamesPlayed },
    { code: 'SC', label: 'SuperCoach', desc: 'SuperCoach-style points total.', total: stats.superCoachPoints, avg: stats.superCoachPoints / gamesPlayed },
    { code: 'G', label: 'Goals', desc: '6-point scoring shots.', total: stats.goals, avg: stats.goals / gamesPlayed },
    { code: 'B', label: 'Behinds', desc: '1-point scoring shots.', total: stats.behinds, avg: stats.behinds / gamesPlayed },
    { code: 'D', label: 'Disposals', desc: 'Kicks + handballs.', total: stats.disposals, avg: stats.disposals / gamesPlayed },
    { code: 'K', label: 'Kicks', desc: 'Total kicks.', total: stats.kicks, avg: stats.kicks / gamesPlayed },
    { code: 'HB', label: 'Handballs', desc: 'Total handballs.', total: stats.handballs, avg: stats.handballs / gamesPlayed },
    {
      code: 'K:H',
      label: 'K:H Ratio',
      desc: 'Kicks per handball — higher means more kick-dominant style. Season average.',
      total: stats.handballs > 0 ? stats.kicks / stats.handballs : 0,
      avg: null,
      formatTotal: (v: number) => stats.handballs > 0 ? `${v.toFixed(1)}:1` : '-',
    },
    { code: 'M', label: 'Marks', desc: 'Total marks.', total: stats.marks, avg: stats.marks / gamesPlayed },
    { code: 'CM', label: 'Contested Marks', desc: 'Marks taken under physical pressure.', total: stats.contestedMarks, avg: stats.contestedMarks / gamesPlayed },
    { code: 'T', label: 'Tackles', desc: 'Successful tackles.', total: stats.tackles, avg: stats.tackles / gamesPlayed },
    { code: 'HO', label: 'Hitouts', desc: 'Ruck hitouts won.', total: stats.hitouts, avg: stats.hitouts / gamesPlayed },
    { code: 'CP', label: 'Contested Poss', desc: 'Possessions won in contest.', total: stats.contestedPossessions, avg: stats.contestedPossessions / gamesPlayed },
    { code: 'UP', label: 'Uncontested Poss', desc: 'Possessions won without direct contest.', total: stats.uncontestedPossessions, avg: stats.uncontestedPossessions / gamesPlayed },
    { code: 'CL', label: 'Clearances', desc: 'First effective possession from stoppage.', total: stats.clearances, avg: stats.clearances / gamesPlayed },
    { code: 'I50', label: 'Inside 50s', desc: 'Entries into forward 50.', total: stats.insideFifties, avg: stats.insideFifties / gamesPlayed },
    { code: 'R50', label: 'Rebound 50s', desc: 'Possessions exiting defensive 50.', total: stats.rebound50s, avg: stats.rebound50s / gamesPlayed },
    { code: 'FF', label: 'Frees For', desc: 'Free kicks received.', total: stats.freesFor, avg: stats.freesFor / gamesPlayed },
    { code: 'FA', label: 'Frees Against', desc: 'Free kicks conceded.', total: stats.freesAgainst, avg: stats.freesAgainst / gamesPlayed },
    { code: 'GA', label: 'Goal Assists', desc: 'Final pass/chain contribution to a goal.', total: stats.goalAssists, avg: stats.goalAssists / gamesPlayed },
    { code: 'SI', label: 'Score Involvements', desc: 'Involvement in scoring chains.', total: stats.scoreInvolvements, avg: stats.scoreInvolvements / gamesPlayed },
    { code: 'MG', label: 'Metres Gained', desc: 'Net territory gained from possessions.', total: stats.metresGained, avg: stats.metresGained / gamesPlayed },
    { code: 'INT', label: 'Intercepts', desc: 'Possessions won from opposition ball movement.', total: stats.intercepts, avg: stats.intercepts / gamesPlayed },
    { code: '1%', label: 'One Percenters', desc: 'Spoils, smothers, knock-ons and similar team acts.', total: stats.onePercenters, avg: stats.onePercenters / gamesPlayed },
    { code: 'TO', label: 'Turnovers', desc: 'Possessions lost to opposition.', total: stats.turnovers, avg: stats.turnovers / gamesPlayed },
    { code: 'CLG', label: 'Clangers', desc: 'Significant errors leading to negative outcomes.', total: stats.clangers, avg: stats.clangers / gamesPlayed },
    { code: 'BO', label: 'Bounces', desc: 'Running bounces with possession.', total: stats.bounces, avg: stats.bounces / gamesPlayed },
  ]

  return (
    <TooltipProvider delayDuration={120}>
      <div className="text-sm space-y-0.5">
        <div className="flex text-xs text-muted-foreground font-medium mb-1">
          <span className="flex-1 flex items-center gap-1.5">
            Stat
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-semibold">Stat Abbreviations</p>
                  <p>`GP` Games Played, `AF` AFL Fantasy, `SC` SuperCoach</p>
                  <p>`D` Disposals, `K` Kicks, `HB` Handballs, `M` Marks</p>
                  <p>`CP` Contested Possessions, `UP` Uncontested Possessions, `CL` Clearances</p>
                  <p>`I50` Inside 50s, `R50` Rebound 50s, `FF/FA` Frees For/Against</p>
                  <p>`GA` Goal Assists, `SI` Score Involvements, `INT` Intercepts, `1%` One Percenters</p>
                  <p>`TO` Turnovers, `CLG` Clangers, `BO` Bounces, `MG` Metres Gained</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </span>
          <span className="w-14 text-right">Total</span>
          <span className="w-14 text-right">Avg</span>
        </div>
        {rows.map((r) => (
          <div key={r.code} className="flex">
            <span className="flex-1 text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">{r.code} - {r.label}</span>
                </TooltipTrigger>
                <TooltipContent side="right">{r.desc}</TooltipContent>
              </Tooltip>
            </span>
            <span className="w-14 text-right font-mono">
              {r.formatTotal ? r.formatTotal(r.total) : r.total}
            </span>
            <span className="w-14 text-right font-mono text-muted-foreground">
              {r.avg !== null ? r.avg.toFixed(1) : '-'}
            </span>
          </div>
        ))}
      </div>
    </TooltipProvider>
  )
}
