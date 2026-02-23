import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { h2hKey, isRivalryMatch } from '@/engine/history/h2hTracker'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

import { simulateMatch, previewMatchWeather } from '@/engine/match/simulateMatch'
import type { SimulateMatchInput, WeatherModifiers } from '@/engine/match/simulateMatch'
import { LiveMatchView } from '@/components/match/LiveMatchView'
import { PostMatchBoxScore } from '@/components/match/PostMatchBoxScore'
import { ScoreWorm } from '@/components/match/MatchCharts'
import { selectBestLineup } from '@/engine/ai/lineupSelection'
import { MatchReportModal } from '@/components/match/MatchReportModal'
import { PlayByPlayPanel } from '@/components/match/PlayByPlayPanel'
import { TrainingImpactCard } from '@/components/match/TrainingImpactCard'
import { PostMatchReview } from '@/components/match/PostMatchReview'
import type { PostMatchReviewPayload } from '@/types/postMatch'
import { getOverallRating } from '@/engine/player/playerRating'
import { VENUES } from '@/data/venues'
import type { Venue } from '@/types/venue'
import type { Club } from '@/types/club'
import type { Match } from '@/types/match'
import type { Fixture, MatchDay } from '@/types/season'
import { getFixtureDateIso } from '@/engine/season/fixtureDateUtils'
import {
  getBroadcastChannelShort,
  getBroadcastChannelColor,
  getBroadcastTierLabel,
  getBroadcastChannelLabel,
} from '@/engine/season/broadcastEngine'
import type { Player, PlayerPreferredRole } from '@/types/player'
import {
  Swords,
  Play,
  Clock,
  Calendar,
  MapPin,
  Star,
  Trophy,
  BarChart3,
  Target,
  Shield,
  ChevronLeft,
  ChevronRight,
  Users,
  Eye,
  Zap,
  Wind,
  CloudRain,
  Sun,
  Thermometer,
  Droplets,
  Ruler,
  ShieldAlert,
} from 'lucide-react'
import { useNotificationStore } from '@/stores/notificationStore'
import { useNavigationGuard } from '@/hooks/useNavigationGuard'
import { NavigationGuardDialog } from '@/components/common/NavigationGuardDialog'

const EMPTY_H2H: Record<string, import('@/types/history').H2HRecord> = {}

const MATCH_DAY_ORDER: MatchDay[] = [
  'Thursday',
  'Friday',
  'Saturday-Early',
  'Saturday-Afternoon',
  'Saturday-Twilight',
  'Saturday-Night',
  'Sunday-Early',
  'Sunday-Afternoon',
  'Sunday-Twilight',
  'Monday',
]

const MATCH_DAY_LABELS: Record<MatchDay, string> = {
  Tuesday: 'Tuesday',
  Wednesday: 'Wednesday',
  Thursday: 'Thursday Night',
  Friday: 'Friday Night',
  'Saturday-Early': 'Saturday Early',
  'Saturday-Afternoon': 'Saturday Afternoon',
  'Saturday-Twilight': 'Saturday Twilight',
  'Saturday-Night': 'Saturday Night',
  'Sunday-Early': 'Sunday Early',
  'Sunday-Afternoon': 'Sunday Afternoon',
  'Sunday-Twilight': 'Sunday Twilight',
  Monday: 'Monday',
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getMatchDayIndex(day?: MatchDay): number {
  if (!day) return 3
  return MATCH_DAY_ORDER.indexOf(day)
}

function parseScheduledTimeToMinutes(time?: string): number {
  if (!time) return 12 * 60
  const normalized = time.trim().toLowerCase()
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/)
  if (!match) return 12 * 60
  let hour = Number(match[1])
  const minute = Number(match[2])
  const suffix = match[3]
  if (suffix === 'pm' && hour !== 12) hour += 12
  if (suffix === 'am' && hour === 12) hour = 0
  return hour * 60 + minute
}

function formatFixtureDateLabel(seasonStartDate: string, roundIdx: number, matchDay?: MatchDay): string {
  const fixtureDate = getFixtureDateIso(seasonStartDate, roundIdx, matchDay)
  const d = new Date(`${fixtureDate}T00:00:00`)
  return d.toLocaleDateString('en-AU', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
}

function sortRoundFixtures(fixtures: Fixture[]): Fixture[] {
  return [...fixtures].sort((a, b) => {
    const dayDiff = getMatchDayIndex(a.matchDay) - getMatchDayIndex(b.matchDay)
    if (dayDiff !== 0) return dayDiff
    const timeDiff = parseScheduledTimeToMinutes(a.scheduledTime) - parseScheduledTimeToMinutes(b.scheduledTime)
    if (timeDiff !== 0) return timeDiff
    return `${a.homeClubId}-${a.awayClubId}`.localeCompare(`${b.homeClubId}-${b.awayClubId}`)
  })
}

function getFixtureResult(matchResults: Match[], roundIdx: number, fixture: Fixture): Match | undefined {
  return matchResults.find(
    (m) =>
      m.round === roundIdx &&
      m.homeClubId === fixture.homeClubId &&
      m.awayClubId === fixture.awayClubId,
  )
}

function getFixtureKey(fixture: Fixture): string {
  return `${fixture.homeClubId}__${fixture.awayClubId}__${fixture.matchDay ?? 'Saturday-Twilight'}__${fixture.scheduledTime ?? ''}__${fixture.venue}`
}

/** Lightweight key used for the resolved-matches map (unique within a round). */
function fixtureKey(fixture: Fixture): string {
  return `${fixture.homeClubId}-${fixture.awayClubId}`
}


function TeamBadge({
  club,
  fallback,
  size = 'sm',
}: {
  club: Club | undefined | null
  fallback: string
  size?: 'sm' | 'md'
}) {
  const dimension = size === 'md' ? 'h-8 w-8 text-[10px]' : 'h-6 w-6 text-[9px]'
  return (
    <div
      className={`${dimension} inline-flex items-center justify-center rounded-full border border-white/20 font-bold text-white shadow-sm`}
      style={{
        background: `linear-gradient(135deg, ${club?.colors.primary ?? '#666'} 50%, ${club?.colors.secondary ?? '#999'} 50%)`,
      }}
      title={club?.fullName ?? fallback}
    >
      {(club?.abbreviation ?? fallback).slice(0, 3)}
    </div>
  )
}

function InjuryRow({ player }: { player: Player }) {
  const inj = player.injury!
  const sev = inj.severity
  const color =
    sev === 'severe'   ? 'text-red-500' :
    sev === 'major'    ? 'text-red-400' :
    sev === 'moderate' ? 'text-orange-400' : 'text-amber-400'
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[11px]">
        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{player.position.primary}</Badge>
        <span className="flex-1 min-w-0 truncate font-medium">{player.firstName[0]}. {player.lastName}</span>
      </div>
      <div className="flex items-center justify-between gap-1 pl-0.5 text-[10px]">
        <span className="truncate text-muted-foreground">{inj.type}</span>
        <span className={`shrink-0 tabular-nums font-semibold ${color}`}>{inj.weeksRemaining}w</span>
      </div>
    </div>
  )
}

function getRecentClubMatches(matchResults: Match[], clubId: string, limit = 5): Match[] {
  return matchResults
    .filter((m) => m.result && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => b.round - a.round)
    .slice(0, limit)
}

function getClubFormSummary(matchResults: Match[], clubId: string) {
  const recent = getRecentClubMatches(matchResults, clubId, 5)
  let wins = 0
  let losses = 0
  let draws = 0
  const trend: ('W' | 'L' | 'D')[] = []

  for (const m of recent) {
    if (!m.result) continue
    const isHome = m.homeClubId === clubId
    const clubScore = isHome ? m.result.homeTotalScore : m.result.awayTotalScore
    const oppScore = isHome ? m.result.awayTotalScore : m.result.homeTotalScore
    if (clubScore > oppScore) {
      wins++
      trend.push('W')
    } else if (clubScore < oppScore) {
      losses++
      trend.push('L')
    } else {
      draws++
      trend.push('D')
    }
  }

  return {
    wins,
    losses,
    draws,
    played: recent.length,
    trend,
    formPoints: wins * 2 + draws,
  }
}

function getClubAverageOverall(players: Record<string, Player>, clubId: string): number {
  const squad = Object.values(players)
    .filter((p) => p.clubId === clubId && !p.injury)
    .map((p) => getOverallRating(p))
    .sort((a, b) => b - a)
    .slice(0, 22)

  if (squad.length === 0) return 50
  return squad.reduce((sum, v) => sum + v, 0) / squad.length
}

function getHeadToHeadMeetings(matchResults: Match[], homeClubId: string, awayClubId: string, limit = 5): Match[] {
  return matchResults
    .filter(
      (m) =>
        m.result &&
        ((m.homeClubId === homeClubId && m.awayClubId === awayClubId) ||
          (m.homeClubId === awayClubId && m.awayClubId === homeClubId)),
    )
    .sort((a, b) => b.round - a.round)
    .slice(0, limit)
}

function getRoleBucket(role: PlayerPreferredRole): 'mid' | 'fwd' | 'def' | 'ruck' {
  if (role === 'ruck') return 'ruck'
  if (role === 'inside-mid' || role === 'outside-mid' || role === 'wing-runner') return 'mid'
  if (role === 'key-forward' || role === 'small-forward' || role === 'pressure-forward') return 'fwd'
  return 'def'
}

function getTopByBucket(players: Player[], bucket: 'mid' | 'fwd' | 'def' | 'ruck'): Player[] {
  return players
    .filter((p) => getRoleBucket(p.preferredRole) === bucket && !p.injury)
    .sort((a, b) => getOverallRating(b) - getOverallRating(a))
}

function getFallbackTop(players: Player[]): Player[] {
  return [...players]
    .filter((p) => !p.injury)
    .sort((a, b) => getOverallRating(b) - getOverallRating(a))
}

function buildKeyMatchups(
  players: Record<string, Player>,
  homeClubId: string,
  awayClubId: string,
): Array<{ title: string; home: Player | null; away: Player | null }> {
  const homePlayers = Object.values(players).filter((p) => p.clubId === homeClubId)
  const awayPlayers = Object.values(players).filter((p) => p.clubId === awayClubId)

  const homeMids = getTopByBucket(homePlayers, 'mid')
  const awayMids = getTopByBucket(awayPlayers, 'mid')
  const homeFwds = getTopByBucket(homePlayers, 'fwd')
  const awayDefs = getTopByBucket(awayPlayers, 'def')
  const homeRucks = getTopByBucket(homePlayers, 'ruck')
  const awayRucks = getTopByBucket(awayPlayers, 'ruck')

  const homeFallback = getFallbackTop(homePlayers)
  const awayFallback = getFallbackTop(awayPlayers)

  return [
    {
      title: 'Midfield Battle',
      home: homeMids[0] ?? homeFallback[0] ?? null,
      away: awayMids[0] ?? awayFallback[0] ?? null,
    },
    {
      title: 'Forward vs Defender',
      home: homeFwds[0] ?? homeFallback[1] ?? null,
      away: awayDefs[0] ?? awayFallback[1] ?? null,
    },
    {
      title: 'Ruck Contest',
      home: homeRucks[0] ?? homeFallback[2] ?? null,
      away: awayRucks[0] ?? awayFallback[2] ?? null,
    },
  ]
}

function computeWinProbabilities(args: {
  homeLadder: { points: number; percentage: number } | null
  awayLadder: { points: number; percentage: number } | null
  homeFormPoints: number
  awayFormPoints: number
  homeStrength: number
  awayStrength: number
}) {
  const {
    homeLadder,
    awayLadder,
    homeFormPoints,
    awayFormPoints,
    homeStrength,
    awayStrength,
  } = args

  const pointsDiff = (homeLadder?.points ?? 0) - (awayLadder?.points ?? 0)
  const pctDiff = (homeLadder?.percentage ?? 100) - (awayLadder?.percentage ?? 100)
  const formDiff = homeFormPoints - awayFormPoints
  const strengthDiff = homeStrength - awayStrength

  const raw = 50 + pointsDiff * 0.9 + pctDiff * 0.08 + formDiff * 2.2 + strengthDiff * 0.7 + 4
  const home = clamp(Math.round(raw), 5, 95)
  return { home, away: 100 - home }
}

export function MatchDayPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const claimPendingReview = useNotificationStore(s => s.claimPendingReview)

  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const season = useGameStore((s) => s.season)
  const settings = useGameStore((s) => s.settings)
  const currentRound = useGameStore((s) => s.currentRound)
  const leadershipPending = useGameStore((s) => s.leadershipPending)
  const matchResults = useGameStore((s) => s.matchResults)
  const ladder = useGameStore((s) => s.ladder)
  const rngSeed = useGameStore((s) => s.rngSeed)
  const currentDate = useGameStore((s) => s.currentDate)
  const simCurrentRound = useGameStore((s) => s.simCurrentRound)
  const commitSingleFixture = useGameStore((s) => s.commitSingleFixture)

  const clearPendingMatchResults = useGameStore((s) => s.clearPendingMatchResults)
  const pendingMatchResults = useGameStore((s) => s.pendingMatchResults)

  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const setSelectedLineup = useGameStore((s) => s.setSelectedLineup)
  const weeklyGameplans = useGameStore((s) => s.weeklyGameplans)
  const setWeeklyMatchupTactics = useGameStore((s) => s.setWeeklyMatchupTactics)

  const matchReports = useGameStore((s) => s.history.matchReports)
  const h2hRecords = useGameStore((s) => s.history.h2hRecords) ?? EMPTY_H2H
  const bettingMarkets = useGameStore((s) => s.bettingMarkets)
  const bettingEnabled = useGameStore((s) => s.settings.betting?.enabled ?? false)

  const [lastMatchResult, setLastMatchResult] = useState<Match | null>(null)
  const [reviewPayload, setReviewPayload] = useState<PostMatchReviewPayload | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  // Round and fixture selection live in URL params so back-navigation restores the exact spot.
  const viewingRoundParam = searchParams.get('round')
  const viewingRound: number | null = viewingRoundParam !== null ? parseInt(viewingRoundParam, 10) : null
  const selectedFixtureKey: string | null = searchParams.get('fixture')

  const [liveMatchActive, setLiveMatchActive] = useState(false)
  // stepThrough mode: quarters now start paused automatically via LiveMatchView
  const [liveOtherMatches, setLiveOtherMatches] = useState<Match[]>([])

  // Block navigation while a live match is in progress — prevents losing match state
  const navGuard = useNavigationGuard(liveMatchActive)

  // Per-fixture watch/sim state for non-user matches
  const resolvedMatches = useMemo(() => {
    const map = new Map<string, Match>()
    for (const m of pendingMatchResults) map.set(fixtureKey(m), m)
    return map
  }, [pendingMatchResults])
  const [watchingSpectator, setWatchingSpectator] = useState<{
    fixture: Fixture
    fixtureIndex: number
    simInput: SimulateMatchInput
  } | null>(null)

  // Auto-trigger live/step mode when navigated here from the MatchReadyModal
  const autoMode = (location.state as { autoMode?: string } | null)?.autoMode ?? null
  const roundPlayedForAutoMode = matchResults.some((m) => m.round === currentRound && m.result !== null)

  useEffect(() => {
    if (!autoMode || roundPlayedForAutoMode) return
    if (autoMode === 'live' || autoMode === 'step') {
      setLiveMatchActive(true)
    }
    // Clear navigation state so back-navigation doesn't re-trigger
    navigate('/fixture', { replace: true, state: {} })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode])

  // Claim a pending review from the notification store when navigated here via toast "View Match"
  useEffect(() => {
    if (searchParams.get('review') !== 'pending') return
    const pending = claimPendingReview()
    if (pending) setReviewPayload(pending)
    setSearchParams((prev) => { prev.delete('review'); return prev }, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset per-fixture resolved state whenever the round advances
  useEffect(() => {
    clearPendingMatchResults()
    setWatchingSpectator(null)
  }, [currentRound])

  // Default to the last played round when the current round hasn't started yet.
  // After simCurrentRound(), currentRound advances to the next (unplayed) round —
  // we want users to see the results they just generated, not the empty upcoming round.
  const currentRoundHasResults = matchResults.some((m) => m.round === currentRound && m.result !== null)
  const defaultRound = !currentRoundHasResults && currentRound > 0 ? currentRound - 1 : currentRound

  const displayRoundIdx = viewingRound ?? defaultRound
  const round = season?.rounds?.[displayRoundIdx]
  const isCurrentRound = displayRoundIdx === currentRound

  const playerFixture = round?.fixtures.find(
    (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  )
  const sortedFixtures = useMemo(
    () => (round ? sortRoundFixtures(round.fixtures) : []),
    [round],
  )
  const selectedFixture = useMemo(() => {
    if (sortedFixtures.length === 0) return null
    if (!selectedFixtureKey) return playerFixture ?? sortedFixtures[0]
    return sortedFixtures.find((f) => getFixtureKey(f) === selectedFixtureKey) ?? playerFixture ?? sortedFixtures[0]
  }, [playerFixture, selectedFixtureKey, sortedFixtures])
  const homeClub = selectedFixture ? clubs[selectedFixture.homeClubId] : null
  const awayClub = selectedFixture ? clubs[selectedFixture.awayClubId] : null
  const selectedFixtureResult = selectedFixture ? getFixtureResult(matchResults, displayRoundIdx, selectedFixture) : null

  const ladderByClub = useMemo(() => {
    const map = new Map<string, { rank: number; points: number; percentage: number }>()
    ladder.forEach((entry, idx) => {
      map.set(entry.clubId, {
        rank: idx + 1,
        points: entry.points,
        percentage: entry.percentage,
      })
    })
    return map
  }, [ladder])

  const isRivalryFixture = useMemo(
    () => selectedFixture ? isRivalryMatch(selectedFixture.homeClubId, selectedFixture.awayClubId, clubs) : false,
    [selectedFixture, clubs],
  )

  const allTimeH2H = useMemo(() => {
    if (!selectedFixture) return null
    const key = h2hKey(selectedFixture.homeClubId, selectedFixture.awayClubId)
    return h2hRecords[key] ?? null
  }, [selectedFixture, h2hRecords])

  const previewData = useMemo(() => {
    if (!selectedFixture) return null

    const homeForm = getClubFormSummary(matchResults, selectedFixture.homeClubId)
    const awayForm = getClubFormSummary(matchResults, selectedFixture.awayClubId)
    const homeLadder = ladderByClub.get(selectedFixture.homeClubId) ?? null
    const awayLadder = ladderByClub.get(selectedFixture.awayClubId) ?? null

    const homeStrength = getClubAverageOverall(players, selectedFixture.homeClubId)
    const awayStrength = getClubAverageOverall(players, selectedFixture.awayClubId)

    const winProb = computeWinProbabilities({
      homeLadder,
      awayLadder,
      homeFormPoints: homeForm.formPoints,
      awayFormPoints: awayForm.formPoints,
      homeStrength,
      awayStrength,
    })

    const meetings = getHeadToHeadMeetings(
      matchResults,
      selectedFixture.homeClubId,
      selectedFixture.awayClubId,
      5,
    )

    const keyMatchups = buildKeyMatchups(players, selectedFixture.homeClubId, selectedFixture.awayClubId)

    // Weather forecast — same seed formula as advanceRound so preview matches sim
    const fixtureIdx = round?.fixtures.findIndex(
      (f) => f.homeClubId === selectedFixture.homeClubId && f.awayClubId === selectedFixture.awayClubId,
    ) ?? 0
    const weatherSeed = rngSeed + currentRound * 100 + fixtureIdx
    const venueId = selectedFixture.venueId ?? VENUES[selectedFixture.venue]?.id
    const month = currentDate ? parseInt(currentDate.split('-')[1]) : undefined
    const weather = previewMatchWeather(weatherSeed, venueId, selectedFixture.matchDay, month)
    const venueData = venueId ? VENUES[venueId] : undefined

    const homeInjuries = Object.values(players)
      .filter((p) => p.clubId === selectedFixture.homeClubId && p.injury !== null)
      .sort((a, b) => getOverallRating(b) - getOverallRating(a))
      .slice(0, 4)
    const awayInjuries = Object.values(players)
      .filter((p) => p.clubId === selectedFixture.awayClubId && p.injury !== null)
      .sort((a, b) => getOverallRating(b) - getOverallRating(a))
      .slice(0, 4)

    return {
      homeForm,
      awayForm,
      homeLadder,
      awayLadder,
      homeStrength,
      awayStrength,
      winProb,
      meetings,
      keyMatchups,
      weather,
      venueData,
      homeInjuries,
      awayInjuries,
    }
  }, [ladderByClub, matchResults, players, selectedFixture, round, rngSeed, currentRound, currentDate])

  const fixturesByDate = useMemo(() => {
    const groups = new Map<string, { iso: string; label: string; fixtures: Fixture[] }>()
    for (const fixture of sortedFixtures) {
      const iso = getFixtureDateIso(settings.seasonStartDate, displayRoundIdx, fixture.matchDay)
      const label = formatFixtureDateLabel(settings.seasonStartDate, displayRoundIdx, fixture.matchDay)
      const existing = groups.get(iso)
      if (existing) {
        existing.fixtures.push(fixture)
      } else {
        groups.set(iso, { iso, label, fixtures: [fixture] })
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.iso.localeCompare(b.iso))
  }, [displayRoundIdx, settings.seasonStartDate, sortedFixtures])


  // The earliest match in this round (Thursday games start the week)
  const earliestRoundMatchDate = useMemo(() => {
    if (!round?.fixtures?.length || !settings?.seasonStartDate) return null
    const dates = round.fixtures.map((f) =>
      getFixtureDateIso(settings.seasonStartDate, displayRoundIdx, f.matchDay),
    )
    return dates.reduce((min, d) => (d < min ? d : min))
  }, [round, displayRoundIdx, settings?.seasonStartDate])

  // Buttons are live only when the game date has reached the first match of this round
  const isMatchDay = earliestRoundMatchDate ? (currentDate ?? '') >= earliestRoundMatchDate : true
  // Block simulation for Round 1 if player hasn't appointed leadership yet
  const isLeadershipBlocked = leadershipPending && currentRound === 0
  const canSimulate = isMatchDay && !isLeadershipBlocked

  // Gate the Play Live button to the player's own match day specifically.
  // The round's earliest game (e.g. Thursday) should not make Play Live available
  // for a team whose game is not until Saturday.
  const playerMatchDate =
    playerFixture && settings?.seasonStartDate
      ? getFixtureDateIso(settings.seasonStartDate, displayRoundIdx, playerFixture.matchDay)
      : null
  const isPlayerMatchDay = playerMatchDate ? (currentDate ?? '') >= playerMatchDate : isMatchDay

  // ── Hooks above early-returns (Rules of Hooks) ─────────────────────────
  const handleSimOtherFixture = useCallback((fixture: Fixture) => {
    if (!round) return
    const fixtureIdx = round.fixtures.findIndex(
      (f) => f.homeClubId === fixture.homeClubId && f.awayClubId === fixture.awayClubId,
    )
    const match = simulateMatch({
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
      venue: fixture.venue,
      venueId: fixture.venueId,
      matchDay: fixture.matchDay,
      month: currentDate ? parseInt(currentDate.split('-')[1]) : undefined,
      round: currentRound,
      players,
      clubs,
      seed: rngSeed + currentRound * 100 + fixtureIdx,
      matchRules: settings.matchRules,
      realism: settings.realism,
      injuryFrequency: settings.injuryFrequency,
      venueRoofOverrides: settings.venueRoofOverrides,
      customStadiums: settings.customStadiums,
    })
    const result = commitSingleFixture(match, false)
    if (result.reviewPayload) setReviewPayload(result.reviewPayload)
  }, [round, currentRound, players, clubs, rngSeed, settings, commitSingleFixture])

  const handleWatchOtherFixture = useCallback((fixture: Fixture) => {
    if (!round) return
    const fixtureIdx = round.fixtures.findIndex(
      (f) => f.homeClubId === fixture.homeClubId && f.awayClubId === fixture.awayClubId,
    )
    const opts = { interchangePlayers: settings.matchRules.interchangePlayers }
    const homeLineupSlots = selectBestLineup(Object.values(players), fixture.homeClubId, { ...opts, club: clubs[fixture.homeClubId] }).lineup
    const awayLineupSlots = selectBestLineup(Object.values(players), fixture.awayClubId, { ...opts, club: clubs[fixture.awayClubId] }).lineup
    setWatchingSpectator({
      fixture,
      fixtureIndex: fixtureIdx,
      simInput: {
        homeClubId: fixture.homeClubId,
        awayClubId: fixture.awayClubId,
        venue: fixture.venue,
        venueId: fixture.venueId,
        matchDay: fixture.matchDay,
        month: currentDate ? parseInt(currentDate.split('-')[1]) : undefined,
        round: currentRound,
        players,
        clubs,
        seed: rngSeed + currentRound * 100 + fixtureIdx,
        matchRules: settings.matchRules,
        realism: settings.realism,
        injuryFrequency: settings.injuryFrequency,
        homeLineupSlots,
        awayLineupSlots,
      },
    })
  }, [round, currentRound, players, clubs, rngSeed, settings])

  const handleSpectatorComplete = useCallback((match: Match) => {
    if (!watchingSpectator) return
    const result = commitSingleFixture(match, false)
    setWatchingSpectator(null)
    if (result.reviewPayload) setReviewPayload(result.reviewPayload)
  }, [watchingSpectator, commitSingleFixture])

  const handleLiveMatchComplete = useCallback((match: Match) => {
    // Commit the user's match via commitSingleFixture.
    // If all other fixtures are done, this triggers full round finalization.
    const result = commitSingleFixture(match, true)
    setLiveMatchActive(false)
    setLiveOtherMatches([])
    if (result.reviewPayload) {
      setReviewPayload(result.reviewPayload)
    } else {
      setLastMatchResult(result.userMatch ?? match)
    }
  }, [commitSingleFixture, resolvedMatches])

  // Build SimulateMatchInput for the user's fixture (used by LiveMatchView)
  const userFixtureSimInput: SimulateMatchInput | null = useMemo(() => {
    if (!playerFixture || !round) return null
    const fixtureIndex = round.fixtures.indexOf(playerFixture)
    return {
      homeClubId: playerFixture.homeClubId,
      awayClubId: playerFixture.awayClubId,
      venue: playerFixture.venue,
      venueId: playerFixture.venueId,
      matchDay: playerFixture.matchDay,
      round: currentRound,
      players,
      clubs,
      seed: rngSeed + currentRound * 100 + (fixtureIndex >= 0 ? fixtureIndex : 0),
      matchRules: settings.matchRules,
      realism: settings.realism,
      injuryFrequency: settings.injuryFrequency,
    }
  }, [playerFixture, round, currentRound, players, clubs, rngSeed, settings])

  // Lineup data for the field view
  const opponentClubId = playerFixture
    ? playerFixture.homeClubId === playerClubId
      ? playerFixture.awayClubId
      : playerFixture.homeClubId
    : null

  const userLineupForField = useMemo<Record<string, string>>(() => {
    if (!playerClubId) return {}
    // Mirror getLineupForClub: user's selections first, then fill any missing slots
    // (especially interchange/bench) from selectBestLineup so bench is never empty.
    const result: Record<string, string> = {}
    for (const [slot, pid] of Object.entries(selectedLineup ?? {})) {
      if (pid) result[slot] = pid
    }
    const best = selectBestLineup(Object.values(players), playerClubId, {
      interchangePlayers: settings.matchRules.interchangePlayers,
      club: clubs[playerClubId],
    }).lineup
    const usedIds = new Set(Object.values(result).filter(Boolean))
    for (const [slot, pid] of Object.entries(best)) {
      if (!result[slot] && pid && !usedIds.has(pid)) {
        result[slot] = pid
        usedIds.add(pid)
      }
    }
    return result
  }, [playerClubId, selectedLineup, players, clubs, settings.matchRules.interchangePlayers])

  const opponentLineupForField = useMemo<Record<string, string>>(() => {
    if (!opponentClubId) return {}
    const { lineup } = selectBestLineup(Object.values(players), opponentClubId, {
      interchangePlayers: settings.matchRules.interchangePlayers,
      club: clubs[opponentClubId],
    })
    const result: Record<string, string> = {}
    for (const [slot, pid] of Object.entries(lineup)) {
      if (pid) result[slot] = pid
    }
    return result
  }, [opponentClubId, players, settings.matchRules.interchangePlayers, clubs])

  const userIsHomeForField = playerClubId === playerFixture?.homeClubId
  const homeSlotLineupForField = userIsHomeForField ? userLineupForField : opponentLineupForField
  const awaySlotLineupForField = userIsHomeForField ? opponentLineupForField : userLineupForField

  const userWeeklyGameplan = playerClubId ? weeklyGameplans[playerClubId] : undefined
  const userGameplanForField = playerClubId ? clubs[playerClubId]?.gameplan ?? null : null
  const opponentGameplanForField = opponentClubId ? clubs[opponentClubId]?.gameplan ?? null : null
  const userMatchupTacticsForField = userWeeklyGameplan?.matchupTactics ?? null

  // The round is "played" only when ALL fixtures have been committed to matchResults.
  // This ensures the "Simulate Remaining" button stays visible until the last game is done,
  // and the post-match box score only appears once the round is fully finalized.
  const roundPlayed = useMemo(() => {
    if (!round || displayRoundIdx !== currentRound) return false
    return round.fixtures.every((f) =>
      matchResults.some(
        (m) =>
          m.round === displayRoundIdx &&
          m.result !== null &&
          ((m.homeClubId === f.homeClubId && m.awayClubId === f.awayClubId) ||
            (m.homeClubId === f.awayClubId && m.awayClubId === f.homeClubId)),
      ),
    )
  }, [round, displayRoundIdx, currentRound, matchResults])

  // Fall back to the persisted store result when lastMatchResult is cleared by navigation.
  // This means the box score survives clicking into a player profile and pressing Back.
  const effectiveLastMatch = useMemo(() => {
    if (lastMatchResult) return lastMatchResult
    if (!playerFixture || !roundPlayed) return null
    return getFixtureResult(matchResults, displayRoundIdx, playerFixture) ?? null
  }, [lastMatchResult, playerFixture, roundPlayed, matchResults, displayRoundIdx])

  // ─────────────────────────────────────────────────────────────────────────

  if (!season?.rounds?.length || !round) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Fixture</h1>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No more matches to play this season.
          </CardContent>
        </Card>
      </div>
    )
  }

  // Post-match review gate — renders instead of fixture list until dismissed
  if (reviewPayload) {
    return (
      <PostMatchReview
        payload={reviewPayload}
        clubs={clubs}
        players={players}
        playerClubId={playerClubId}
        onContinue={() => setReviewPayload(null)}
      />
    )
  }

  const setDisplayRound = (idx: number) => {
    const clamped = Math.max(0, Math.min(season.rounds.length - 1, idx))
    setSearchParams((prev) => {
      if (clamped === defaultRound) {
        prev.delete('round')
      } else {
        prev.set('round', String(clamped))
      }
      // Changing round resets fixture selection
      prev.delete('fixture')
      return prev
    }, { replace: true })
  }


  const handleSimRound = () => {
    const result = simCurrentRound()
    if (result.reviewPayload) {
      setReviewPayload(result.reviewPayload)
    } else if (result.userMatch) {
      setLastMatchResult(result.userMatch)
    }
  }

  const handlePlayLive = () => {
    // Pre-simulate all other fixtures in this round so the user can see concurrent
    // scores while playing their own game live. Uses the exact same seeds that
    // simCurrentRound will use, so results will match when the round is committed.
    if (round) {
      const otherMatches: Match[] = []
      round.fixtures.forEach((fixture, i) => {
        if (fixture.homeClubId === playerClubId || fixture.awayClubId === playerClubId) return
        const match = simulateMatch({
          homeClubId: fixture.homeClubId,
          awayClubId: fixture.awayClubId,
          venue: fixture.venue,
          venueId: fixture.venueId,
          matchDay: fixture.matchDay,
          month: currentDate ? parseInt(currentDate.split('-')[1]) : undefined,
          round: currentRound,
          players,
          clubs,
          seed: rngSeed + currentRound * 100 + i,
          matchRules: settings.matchRules,
          realism: settings.realism,
          injuryFrequency: settings.injuryFrequency,
          venueRoofOverrides: settings.venueRoofOverrides,
          customStadiums: settings.customStadiums,
        })
        otherMatches.push(match)
      })
      setLiveOtherMatches(otherMatches)
    }
    setLiveMatchActive(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Fixture</h1>
          <Badge variant="secondary">{round.name}</Badge>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDisplayRound(displayRoundIdx - 1)}
            disabled={displayRoundIdx <= 0}
            aria-label="Previous round"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select
            value={String(displayRoundIdx)}
            onValueChange={(val) => {
              setDisplayRound(parseInt(val, 10))
            }}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {season.rounds.map((r, i) => (
                <SelectItem key={i} value={String(i)}>
                  {r.name}{i === currentRound ? ' (current)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDisplayRound(displayRoundIdx + 1)}
            disabled={displayRoundIdx >= season.rounds.length - 1}
            aria-label="Next round"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {isCurrentRound && !roundPlayed && !liveMatchActive && (() => {
            const liveSimMode = settings.notifications.liveSimMode ?? 'always-live'
            const isFinalsRound = round?.isFinals ?? false
            // Determine which buttons to show based on Live Sim Mode
            const showLive =
              liveSimMode === 'always-live' ||
              liveSimMode === 'delegate' ||
              (liveSimMode === 'finals-only' && isFinalsRound)
            const showSim =
              liveSimMode !== 'always-live' ||
              !playerFixture  // always allow sim if no player fixture
            const liveIsPrimary =
              liveSimMode === 'always-live' ||
              (liveSimMode === 'finals-only' && isFinalsRound)
            const simTitle = isLeadershipBlocked
              ? 'Leadership appointment required before Round 1'
              : !isMatchDay
                ? `Match day not yet reached (${earliestRoundMatchDate})`
                : undefined
            return (
              <>
                {isLeadershipBlocked && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    Leadership appointment required.{' '}
                    <button
                      className="underline hover:no-underline"
                      onClick={() => navigate('/preseason-leadership')}
                    >
                      Appoint now →
                    </button>
                  </div>
                )}
                {showLive && isPlayerMatchDay && playerFixture && userFixtureSimInput && (
                  <Button
                    variant={liveIsPrimary ? 'default' : 'secondary'}
                    onClick={handlePlayLive}
                    disabled={!canSimulate}
                    title={simTitle}
                    className="flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    {liveSimMode === 'finals-only' && isFinalsRound ? 'Begin Final' : 'Play Live'}
                  </Button>
                )}
                {showSim && (
                  <Button
                    variant={liveIsPrimary ? 'secondary' : 'default'}
                    onClick={handleSimRound}
                    disabled={!canSimulate}
                    title={simTitle}
                    className="flex items-center gap-2"
                  >
                    <Play className="h-4 w-4" />
                    {liveSimMode === 'quick-sim' ? 'Quick Simulate' : 'Simulate Remaining'}
                  </Button>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {(round.byeClubIds ?? []).length > 0 && (
        <Card>
          <CardContent className="py-3 text-xs text-muted-foreground">
            <span className="font-medium">Teams on Bye: </span>
            {(round.byeClubIds ?? []).map((id) => clubs[id]?.abbreviation ?? id).join(', ')}
          </CardContent>
        </Card>
      )}

      {liveMatchActive && playerFixture && userFixtureSimInput && (() => {
        const fixtureMarket = bettingEnabled
          ? Object.values(bettingMarkets?.matchMarkets ?? {}).find(
              (m) =>
                m.roundIndex === currentRound &&
                m.homeClubId === playerFixture.homeClubId &&
                m.awayClubId === playerFixture.awayClubId,
            )
          : null
        return (
          <LiveMatchView
            simInput={userFixtureSimInput}
            userClubId={playerClubId}
            homeClub={clubs[playerFixture.homeClubId]}
            awayClub={clubs[playerFixture.awayClubId]}
            onComplete={handleLiveMatchComplete}
            onCancel={() => { setLiveMatchActive(false); setLiveOtherMatches([]) }}
            homeSlotLineup={homeSlotLineupForField}
            awaySlotLineup={awaySlotLineupForField}
            homeGameplan={userIsHomeForField ? userGameplanForField : opponentGameplanForField}
            awayGameplan={userIsHomeForField ? opponentGameplanForField : userGameplanForField}
            homeMatchupTactics={userIsHomeForField ? userMatchupTacticsForField : null}
            matchResults={matchResults}
            h2hRecords={h2hRecords}
            showOdds={bettingEnabled && !!fixtureMarket}
            homeOdds={fixtureMarket?.homeOdds}
            awayOdds={fixtureMarket?.awayOdds}
            line={fixtureMarket?.line}
            homeLineOdds={fixtureMarket?.homeLineOdds}
            awayLineOdds={fixtureMarket?.awayLineOdds}
            totalLine={fixtureMarket?.totalLine}
            overOdds={fixtureMarket?.overOdds}
            underOdds={fixtureMarket?.underOdds}
            onPreMatchLineupChange={(newLineup) => setSelectedLineup(newLineup)}
            preMatchMatchupTactics={userMatchupTacticsForField}
            onPreMatchMatchupTactics={(tactics) => setWeeklyMatchupTactics(tactics)}
          />
        )
      })()}

      {watchingSpectator && (
        <LiveMatchView
          simInput={watchingSpectator.simInput}
          userClubId={playerClubId}
          homeClub={clubs[watchingSpectator.fixture.homeClubId]}
          awayClub={clubs[watchingSpectator.fixture.awayClubId]}
          spectatorMode={true}
          onComplete={handleSpectatorComplete}
          onCancel={() => setWatchingSpectator(null)}
          matchResults={matchResults}
          h2hRecords={h2hRecords}
        />
      )}


      {/* ── Two-column main layout ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">

        {/* LEFT: Full Round Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Full Round Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fixturesByDate.map((group) => (
              <div key={group.iso} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                {group.fixtures.map((fixture, idx) => {
                  const home = clubs[fixture.homeClubId]
                  const away = clubs[fixture.awayClubId]
                  const isUserMatch = fixture === playerFixture
                  const isSelected = selectedFixture ? getFixtureKey(fixture) === getFixtureKey(selectedFixture) : false
                  const result = getFixtureResult(matchResults, displayRoundIdx, fixture)
                  const fKey = fixtureKey(fixture)
                  const resolvedMatch = !result?.result ? resolvedMatches.get(fKey) : undefined
                  const livePreview = !result?.result && !resolvedMatch && liveMatchActive
                    ? liveOtherMatches.find(
                        (m) => m.homeClubId === fixture.homeClubId && m.awayClubId === fixture.awayClubId,
                      )
                    : null
                  const fixtureDate = getFixtureDateIso(settings.seasonStartDate, displayRoundIdx, fixture.matchDay)
                  const fixtureReached = !!fixtureDate && (currentDate ?? '') >= fixtureDate
                  return (
                    <button
                      type="button"
                      key={`${fixture.homeClubId}-${fixture.awayClubId}-${group.iso}-${idx}`}
                      onClick={() => setSearchParams((prev) => { prev.set('fixture', getFixtureKey(fixture)); return prev }, { replace: true })}
                      className={`w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50 ${
                        isSelected ? 'border-primary bg-primary/10' : ''
                      }`}
                    >
                      {fixture.isBlockbuster && fixture.blockbusterName && (
                        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                          <Star className="h-3 w-3 fill-amber-400" />
                          {fixture.blockbusterName}
                        </div>
                      )}

                      {/* Meta: broadcast + time */}
                      {(fixture.broadcastChannel && fixture.broadcastChannel !== 'None') || fixture.scheduledTime ? (
                        <div className="flex items-center gap-2 mb-1">
                          {fixture.broadcastChannel && fixture.broadcastChannel !== 'None' && (
                            <span
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getBroadcastChannelColor(fixture.broadcastChannel)}`}
                              title={`${getBroadcastChannelLabel(fixture.broadcastChannel)} — ${getBroadcastTierLabel(fixture.broadcastTier)}`}
                            >
                              {getBroadcastChannelShort(fixture.broadcastChannel)}
                              {fixture.broadcastTier === 'marquee' && <Star className="ml-0.5 h-2.5 w-2.5 fill-current" />}
                            </span>
                          )}
                          {fixture.scheduledTime && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {fixture.scheduledTime}
                            </span>
                          )}
                        </div>
                      ) : null}

                      {/* Teams */}
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-1.5">
                          <TeamBadge club={home} fallback={fixture.homeClubId} />
                          <span className="font-semibold">{home?.abbreviation ?? fixture.homeClubId}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">vs</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{away?.abbreviation ?? fixture.awayClubId}</span>
                          <TeamBadge club={away} fallback={fixture.awayClubId} />
                        </div>
                      </div>

                      {/* Score — below team names */}
                      <div className="text-center text-xs mt-0.5 font-mono">
                        {result?.result ? (
                          <>
                            <span className={result.result.homeTotalScore > result.result.awayTotalScore ? 'font-bold' : 'text-muted-foreground'}>{result.result.homeTotalScore}</span>
                            <span className="text-muted-foreground mx-1">–</span>
                            <span className={result.result.awayTotalScore > result.result.homeTotalScore ? 'font-bold' : 'text-muted-foreground'}>{result.result.awayTotalScore}</span>
                          </>
                        ) : resolvedMatch?.result ? (
                          <>
                            <span className={resolvedMatch.result.homeTotalScore > resolvedMatch.result.awayTotalScore ? 'font-bold' : 'text-muted-foreground'}>{resolvedMatch.result.homeTotalScore}</span>
                            <span className="text-muted-foreground mx-1">–</span>
                            <span className={resolvedMatch.result.awayTotalScore > resolvedMatch.result.homeTotalScore ? 'font-bold' : 'text-muted-foreground'}>{resolvedMatch.result.awayTotalScore}</span>
                          </>
                        ) : livePreview?.result ? (
                          <span className="text-muted-foreground">
                            {livePreview.result.homeTotalScore} – {livePreview.result.awayTotalScore}
                            <span className="ml-1 text-[10px] text-emerald-500 font-semibold">FT</span>
                          </span>
                        ) : isUserMatch && liveMatchActive ? (
                          <span className="text-[10px] text-primary font-semibold animate-pulse">LIVE</span>
                        ) : null}
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{fixture.venue}</span>
                        {(result?.result?.simulationContext?.attendance ?? resolvedMatch?.result?.simulationContext?.attendance ?? livePreview?.result?.simulationContext?.attendance) != null && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {(result?.result?.simulationContext?.attendance ?? resolvedMatch?.result?.simulationContext?.attendance ?? livePreview?.result?.simulationContext?.attendance)!.toLocaleString()}
                          </span>
                        )}
                      </div>

                      {isCurrentRound && fixtureReached && !result?.result && !resolvedMatch && !isUserMatch && !liveMatchActive && !watchingSpectator && !isLeadershipBlocked && (
                        <div className="mt-1.5 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={(e) => { e.stopPropagation(); handleWatchOtherFixture(fixture) }}
                          >
                            <Eye className="h-3 w-3 mr-1" />Watch
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={(e) => { e.stopPropagation(); handleSimOtherFixture(fixture) }}
                          >
                            <Zap className="h-3 w-3 mr-1" />Sim
                          </Button>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* RIGHT: Match info + Ladder (sticky) */}
        <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">

          {/* Match info panel */}
          {selectedFixture && selectedFixtureResult?.result ? (
            // ── Result overview ──
            <Card>
              <CardHeader className="px-3 pt-3 pb-1">
                <CardTitle className="text-sm text-muted-foreground font-normal uppercase tracking-wide">
                  {round?.name ?? `Round ${displayRoundIdx + 1}`} · Result
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-3 pb-3 pt-0">
                {(() => {
                  const r = selectedFixtureResult.result!
                  const homeWon = r.homeTotalScore > r.awayTotalScore
                  const awayWon = r.awayTotalScore > r.homeTotalScore
                  const quarters = r.homeScores.length
                  return (
                    <>
                      {/* Score */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: homeClub?.colors.primary ?? '#666' }} />
                            <span className={`text-sm font-semibold truncate ${homeWon ? '' : 'text-muted-foreground'}`}>{homeClub?.abbreviation ?? selectedFixture.homeClubId}</span>
                          </div>
                          <div className={`text-2xl font-bold tabular-nums mt-0.5 ${homeWon ? '' : 'text-muted-foreground'}`}>{r.homeTotalScore}</div>
                        </div>
                        <div className="text-xs text-muted-foreground font-medium shrink-0">FINAL</div>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className={`text-sm font-semibold truncate ${awayWon ? '' : 'text-muted-foreground'}`}>{awayClub?.abbreviation ?? selectedFixture.awayClubId}</span>
                            <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: awayClub?.colors.primary ?? '#666' }} />
                          </div>
                          <div className={`text-2xl font-bold tabular-nums mt-0.5 ${awayWon ? '' : 'text-muted-foreground'}`}>{r.awayTotalScore}</div>
                        </div>
                      </div>

                      {/* Quarter by quarter */}
                      {quarters > 0 && (
                        <div className="rounded-md border overflow-hidden">
                          <table className="w-full text-xs tabular-nums font-mono">
                            <thead>
                              <tr className="border-b bg-muted/40">
                                <th className="py-1.5 pl-3 text-left text-muted-foreground font-normal" />
                                {r.homeScores.map((_, qi) => (
                                  <th key={qi} className="py-1.5 text-center text-muted-foreground font-normal">Q{qi + 1}</th>
                                ))}
                                <th className="py-1.5 text-center text-muted-foreground font-semibold">Final</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className={homeWon ? 'font-semibold' : 'text-muted-foreground'}>
                                <td className="py-1.5 pl-3">
                                  <div className="flex items-center gap-1">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: homeClub?.colors.primary ?? '#666' }} />
                                    {homeClub?.abbreviation}
                                  </div>
                                </td>
                                {r.homeScores.map((q, qi) => (
                                  <td key={qi} className="py-1.5 text-center">
                                    {q.goals}.{q.behinds}
                                    <span className="opacity-50 ml-0.5">({q.total})</span>
                                  </td>
                                ))}
                                <td className="py-1.5 text-center font-bold" style={{ color: homeWon ? (homeClub?.colors.primary ?? 'inherit') : undefined }}>
                                  {r.homeScores.reduce((s, q) => s + q.goals, 0)}.{r.homeScores.reduce((s, q) => s + q.behinds, 0)}
                                  <span className="ml-0.5">({r.homeTotalScore})</span>
                                </td>
                              </tr>
                              <tr className={awayWon ? 'font-semibold' : 'text-muted-foreground'}>
                                <td className="py-1.5 pl-3">
                                  <div className="flex items-center gap-1">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: awayClub?.colors.primary ?? '#666' }} />
                                    {awayClub?.abbreviation}
                                  </div>
                                </td>
                                {r.awayScores.map((q, qi) => (
                                  <td key={qi} className="py-1.5 text-center">
                                    {q.goals}.{q.behinds}
                                    <span className="opacity-50 ml-0.5">({q.total})</span>
                                  </td>
                                ))}
                                <td className="py-1.5 text-center font-bold" style={{ color: awayWon ? (awayClub?.colors.primary ?? 'inherit') : undefined }}>
                                  {r.awayScores.reduce((s, q) => s + q.goals, 0)}.{r.awayScores.reduce((s, q) => s + q.behinds, 0)}
                                  <span className="ml-0.5">({r.awayTotalScore})</span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Score worm */}
                      {r.keyEvents && r.keyEvents.length > 0 && (
                        <ScoreWorm
                          keyEvents={r.keyEvents}
                          homeScores={r.homeScores}
                          awayScores={r.awayScores}
                          homeClubId={selectedFixture.homeClubId}
                          homeColor={homeClub?.colors.primary ?? '#3b82f6'}
                          awayColor={awayClub?.colors.primary ?? '#ef4444'}
                          homeAbbr={homeClub?.abbreviation ?? 'HM'}
                          awayAbbr={awayClub?.abbreviation ?? 'AW'}
                          quartersCompleted={r.homeScores.length}
                          height={110}
                        />
                      )}

                      {/* Venue + attendance */}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{selectedFixture.venue}</span>
                        {r.simulationContext?.attendance != null && (
                          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{r.simulationContext.attendance.toLocaleString()}</span>
                        )}
                      </div>

                      {/* Full box score */}
                      <ScrollArea className="max-h-[60vh]">
                        <PostMatchBoxScore
                          match={selectedFixtureResult}
                          clubs={clubs}
                          players={players}
                          playerClubId={playerClubId ?? ''}
                        />
                      </ScrollArea>
                    </>
                  )
                })()}
              </CardContent>
            </Card>
          ) : selectedFixture && previewData ? (
            <div className="space-y-2">
              <Card>
                <CardHeader className="px-3 pt-3 pb-1">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Swords className="h-3.5 w-3.5" />
                    Matchup Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-3 pb-3 pt-0">
                  <div className="rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <TeamBadge club={homeClub} fallback={selectedFixture.homeClubId} size="md" />
                        <span>{homeClub?.fullName ?? selectedFixture.homeClubId}</span>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">vs</div>
                      <div className="flex items-center gap-1.5 text-sm font-semibold justify-end">
                        <span>{awayClub?.fullName ?? selectedFixture.awayClubId}</span>
                        <TeamBadge club={awayClub} fallback={selectedFixture.awayClubId} size="md" />
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{MATCH_DAY_LABELS[selectedFixture.matchDay ?? 'Saturday-Twilight']}</span>
                      {selectedFixture.scheduledTime ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{selectedFixture.scheduledTime}</span> : null}
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{selectedFixture.venue}</span>
                      {selectedFixture.broadcastChannel && selectedFixture.broadcastChannel !== 'None' && (
                        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getBroadcastChannelColor(selectedFixture.broadcastChannel)}`}>
                          {getBroadcastChannelShort(selectedFixture.broadcastChannel)}
                        </span>
                      )}
                      {selectedFixtureResult?.result?.simulationContext?.attendance != null && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {selectedFixtureResult.result.simulationContext.attendance.toLocaleString()}
                          {selectedFixtureResult.result.simulationContext.capacityPct != null && (
                            <span>({selectedFixtureResult.result.simulationContext.capacityPct}%)</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 grid-cols-3">
                    <Card>
                      <CardHeader className="px-2.5 pt-2 pb-1"><CardTitle className="text-xs flex items-center gap-1"><BarChart3 className="h-3 w-3" />Form</CardTitle></CardHeader>
                      <CardContent className="px-2.5 pb-2 pt-0 text-xs space-y-1">
                        <div className="flex justify-between"><span>{homeClub?.abbreviation}</span><span className="font-medium">{previewData.homeForm.wins}-{previewData.homeForm.losses}-{previewData.homeForm.draws}</span></div>
                        <div className="flex justify-between"><span>{awayClub?.abbreviation}</span><span className="font-medium">{previewData.awayForm.wins}-{previewData.awayForm.losses}-{previewData.awayForm.draws}</span></div>
                        <div className="text-muted-foreground text-[10px]">{previewData.homeForm.trend.join('') || '–'} / {previewData.awayForm.trend.join('') || '–'}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="px-2.5 pt-2 pb-1"><CardTitle className="text-xs flex items-center gap-1"><Trophy className="h-3 w-3" />Ladder</CardTitle></CardHeader>
                      <CardContent className="px-2.5 pb-2 pt-0 text-xs space-y-1">
                        <div className="flex justify-between"><span>{homeClub?.abbreviation}</span><span className="font-medium">#{previewData.homeLadder?.rank ?? '-'}</span></div>
                        <div className="flex justify-between"><span>{awayClub?.abbreviation}</span><span className="font-medium">#{previewData.awayLadder?.rank ?? '-'}</span></div>
                        <div className="flex justify-between text-muted-foreground text-[10px]"><span>{previewData.homeLadder?.points ?? 0}pts</span><span>{previewData.awayLadder?.points ?? 0}pts</span></div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="px-2.5 pt-2 pb-1">
                        <CardTitle className="text-xs flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          H2H
                          {isRivalryFixture && <span className="ml-auto text-[10px] text-red-500">★</span>}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-2.5 pb-2 pt-0 text-xs">
                        {allTimeH2H ? (
                          <div className="flex items-center justify-around text-center">
                            <div>
                              <p className="text-sm font-bold">{allTimeH2H.wins0}</p>
                              <p className="text-[10px] text-muted-foreground">{homeClub?.abbreviation}</p>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-muted-foreground">{allTimeH2H.draws}</p>
                              <p className="text-[10px] text-muted-foreground">D</p>
                            </div>
                            <div>
                              <p className="text-sm font-bold">{allTimeH2H.wins1}</p>
                              <p className="text-[10px] text-muted-foreground">{awayClub?.abbreviation}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-[10px]">No history</p>
                        )}
                        {allTimeH2H?.streak && allTimeH2H.streak.length >= 2 && (
                          <p className="text-[10px] text-muted-foreground mt-1 text-center">{clubs[allTimeH2H.streak.clubId]?.abbreviation} {allTimeH2H.streak.length}-streak</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Card>
                      <CardHeader className="px-2.5 pt-2 pb-1"><CardTitle className="text-xs flex items-center gap-1"><Target className="h-3 w-3" />Key Matchups</CardTitle></CardHeader>
                      <CardContent className="px-2.5 pb-2 pt-0 space-y-1">
                        {previewData.keyMatchups.map((m) => (
                          <div key={m.title} className="rounded border px-2 py-1.5 space-y-0.5">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.title}</div>
                            <div className="flex items-center justify-between gap-1 text-[11px]">
                              <div className="flex items-center gap-1 min-w-0">
                                <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: homeClub?.colors.primary ?? '#666' }} />
                                <span className="text-[9px] text-muted-foreground shrink-0">{homeClub?.abbreviation}</span>
                                {m.home ? (
                                  <button className="truncate font-medium hover:underline hover:text-primary transition-colors text-left" onClick={() => navigate(`/player/${m.home!.id}`)}>
                                    {m.home.firstName.charAt(0)}. {m.home.lastName}
                                  </button>
                                ) : <span className="truncate">TBD</span>}
                              </div>
                              <span className="shrink-0 text-muted-foreground text-[10px]">{m.home ? `${m.home.position.primary} ${getOverallRating(m.home)}` : ''}</span>
                            </div>
                            <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                              <div className="flex items-center gap-1 min-w-0">
                                <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: awayClub?.colors.primary ?? '#666' }} />
                                <span className="text-[9px] shrink-0">{awayClub?.abbreviation}</span>
                                {m.away ? (
                                  <button className="truncate hover:underline hover:text-primary transition-colors text-left" onClick={() => navigate(`/player/${m.away!.id}`)}>
                                    {m.away.firstName.charAt(0)}. {m.away.lastName}
                                  </button>
                                ) : <span className="truncate">TBD</span>}
                              </div>
                              <span className="shrink-0 text-[10px]">{m.away ? `${m.away.position.primary} ${getOverallRating(m.away)}` : ''}</span>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="px-2.5 pt-2 pb-1">
                        <CardTitle className="text-xs flex items-center gap-1">
                          <ShieldAlert className="h-3 w-3" />
                          Key Injuries
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-2.5 pb-2 pt-0">
                        <div className="grid grid-cols-2 gap-x-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 mb-0.5">
                              <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: homeClub?.colors.primary ?? '#666' }} />
                              <span className="text-[10px] text-muted-foreground font-medium">{homeClub?.abbreviation}</span>
                            </div>
                            {previewData.homeInjuries.length === 0
                              ? <p className="text-[10px] text-muted-foreground/50">None</p>
                              : previewData.homeInjuries.map((p) => <InjuryRow key={p.id} player={p} />)
                            }
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 mb-0.5">
                              <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: awayClub?.colors.primary ?? '#666' }} />
                              <span className="text-[10px] text-muted-foreground font-medium">{awayClub?.abbreviation}</span>
                            </div>
                            {previewData.awayInjuries.length === 0
                              ? <p className="text-[10px] text-muted-foreground/50">None</p>
                              : previewData.awayInjuries.map((p) => <InjuryRow key={p.id} player={p} />)
                            }
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="px-3 pt-2.5 pb-1">
                  <CardTitle className="text-sm">Win Probability</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-3 pb-3 pt-0">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span>{homeClub?.abbreviation}</span>
                      <span className="font-semibold">{previewData.winProb.home}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${previewData.winProb.home}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span>{awayClub?.abbreviation}</span>
                      <span className="font-semibold">{previewData.winProb.away}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-secondary" style={{ width: `${previewData.winProb.away}%` }} />
                    </div>
                  </div>
                  <div className="rounded border px-2 py-1 text-xs">
                    <div className="flex justify-between text-muted-foreground"><span>{homeClub?.abbreviation} strength</span><span>{previewData.homeStrength.toFixed(1)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>{awayClub?.abbreviation} strength</span><span>{previewData.awayStrength.toFixed(1)}</span></div>
                  </div>
                </CardContent>
              </Card>

              <MatchConditionsCard weather={previewData.weather} venueData={previewData.venueData} />
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground text-sm gap-2">
                <BarChart3 className="h-8 w-8 opacity-30" />
                <p>Select a match to view details</p>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {effectiveLastMatch?.result && (() => {
        const matchReport = matchReports?.find((r: import('@/types/history').MatchReport) => r.matchId === effectiveLastMatch.id)
        return (
          <>
            {matchReport && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setReportOpen(true)}>Read Report</Button>
              </div>
            )}
            <MatchResultView match={effectiveLastMatch} clubs={clubs} players={players} playerClubId={playerClubId} />
            {matchReport && (
              <MatchReportModal
                report={matchReport}
                clubs={clubs}
                players={players}
                open={reportOpen}
                onClose={() => setReportOpen(false)}
              />
            )}
          </>
        )
      })()}

      <NavigationGuardDialog
        {...navGuard}
        title="Match In Progress"
        description="A live match is in progress. Leaving now will abandon the match and your results will be lost."
        confirmLabel="Abandon match"
        cancelLabel="Return to match"
      />
    </div>
  )
}

function MatchResultView({
  match,
  clubs,
  players,
  playerClubId,
}: {
  match: Match
  clubs: Record<string, import('@/types/club').Club>
  players: Record<string, Player>
  playerClubId: string
}) {
  const result = match.result!
  const homeClub = clubs[match.homeClubId]
  const [showCommentary, setShowCommentary] = useState(false)

  const userClub = clubs[playerClubId]

  return (
    <div className="space-y-4">
      <PostMatchBoxScore
        match={match}
        clubs={clubs}
        players={players}
        playerClubId={playerClubId}
      />

      {result.trainingImpactSummary && (
        <TrainingImpactCard
          summary={result.trainingImpactSummary}
          clubName={userClub?.abbreviation}
        />
      )}

      {result.playByPlay && result.playByPlay.length > 0 && (
        <>
          <Button
            size="sm"
            variant={showCommentary ? 'default' : 'outline'}
            onClick={() => setShowCommentary((v) => !v)}
          >
            {showCommentary ? 'Hide Commentary' : 'Show Commentary'}
          </Button>
          {showCommentary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Match Commentary</CardTitle>
              </CardHeader>
              <CardContent>
                <PlayByPlayPanel
                  events={result.playByPlay}
                  homeClubId={match.homeClubId}
                  awayClubId={match.awayClubId}
                  homeClubName={homeClub?.name ?? match.homeClubId}
                  awayClubName={clubs[match.awayClubId]?.name ?? match.awayClubId}
                  players={players}
                  maxHeight="max-h-[600px]"
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

    </div>
  )
}

// ── Match Conditions Card ─────────────────────────────────────────────────────

const WEATHER_META: Record<string, {
  label: string
  icon: React.ElementType
  color: string
  bg: string
  impacts: string[]
}> = {
  clear:  {
    label: 'Clear',
    icon: Sun,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    impacts: ['Ideal conditions', 'Full disposal & marking rates', 'Set shots rewarded'],
  },
  windy:  {
    label: 'Windy',
    icon: Wind,
    color: 'text-sky-400',
    bg: 'bg-sky-400/10',
    impacts: ['Marking more difficult', 'Kick accuracy reduced', 'More turnovers expected'],
  },
  wet:    {
    label: 'Wet',
    icon: CloudRain,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    impacts: ['Slippery conditions', 'Low accuracy & high turnovers', 'Contested play favoured'],
  },
  hot:    {
    label: 'Hot',
    icon: Thermometer,
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    impacts: ['Fatigue factor elevated', 'Disposal count may dip', 'Fit squads gain edge'],
  },
  humid:  {
    label: 'Humid',
    icon: Droplets,
    color: 'text-teal-400',
    bg: 'bg-teal-400/10',
    impacts: ['Sticky ball, kicking affected', 'Higher contested rate', 'Stamina more critical'],
  },
}

const GROUND_META: Record<string, { label: string; desc: string }> = {
  firm:  { label: 'Firm',  desc: 'Fast surface, true bounce' },
  dewy:  { label: 'Dewy',  desc: 'Slippery underfoot, night-game feel' },
  soft:  { label: 'Soft',  desc: 'Slower game, harder running' },
  heavy: { label: 'Heavy', desc: 'Saturated ground, physicality wins' },
  muddy: { label: 'Muddy', desc: 'Worst conditions — handball-first football' },
}

function MatchConditionsCard({
  weather,
  venueData,
}: {
  weather: WeatherModifiers
  venueData: Venue | undefined
}) {
  const wMeta = WEATHER_META[weather.condition] ?? WEATHER_META.clear
  const gMeta = GROUND_META[weather.groundCondition] ?? GROUND_META.firm
  const WeatherIcon = wMeta.icon

  const scoringNote =
    venueData && Math.abs(venueData.scoringCoefficient - 1) > 0.04
      ? venueData.scoringCoefficient > 1
        ? `Compact ground — shots convert well (+${Math.round((venueData.scoringCoefficient - 1) * 100)}%)`
        : `Open ground — conversion harder (${Math.round((venueData.scoringCoefficient - 1) * 100)}%)`
      : null

  const kickNote =
    venueData && Math.abs(venueData.kickToHandballRatio - 1) > 0.07
      ? venueData.kickToHandballRatio > 1
        ? 'Wide corridors reward long kicking'
        : 'Compact shape drives handball game'
      : null

  const disposalNote =
    venueData && Math.abs(venueData.disposalCoefficient - 1) > 0.04
      ? venueData.disposalCoefficient > 1
        ? `High-disposal ground (+${Math.round((venueData.disposalCoefficient - 1) * 100)}%)`
        : `Low-disposal ground (${Math.round((venueData.disposalCoefficient - 1) * 100)}%)`
      : null

  return (
    <Card>
      <CardHeader className="px-3 pt-2.5 pb-1">
        <CardTitle className="text-sm flex items-center gap-2">
          <WeatherIcon className={`h-3.5 w-3.5 ${wMeta.color}`} />
          Match Conditions
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 text-xs">
        <div className="grid grid-cols-2 gap-x-4">

          {/* ── Left: weather & condition ── */}
          <div className="space-y-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${wMeta.bg} ${wMeta.color}`}>
              <WeatherIcon className="h-3 w-3" />
              {wMeta.label}
            </span>
            <div className="space-y-0.5 text-muted-foreground">
              {wMeta.impacts.map((imp) => (
                <div key={imp} className="flex items-start gap-1">
                  <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${wMeta.color.replace('text-', 'bg-')}`} />
                  <span>{imp}</span>
                </div>
              ))}
            </div>
            {weather.condition !== 'clear' && (
              <div className="space-y-0.5">
                {[
                  { label: 'Mark rate', value: weather.markMult },
                  { label: 'Accuracy',  value: weather.accuracyMult },
                  { label: 'Kick eff.', value: weather.kickingEfficiencyMult },
                  { label: 'Disposals', value: weather.possessionMult },
                ].map(({ label, value }) => {
                  const pct = Math.round((value - 1) * 100)
                  return (
                    <div key={label} className="flex items-center justify-between gap-1">
                      <span className="text-muted-foreground/70">{label}</span>
                      <span className={`font-mono font-semibold tabular-nums ${pct < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {pct >= 0 ? '+' : ''}{pct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Right: ground & venue ── */}
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
              {gMeta.label} ground
            </span>
            <p className="text-muted-foreground/70">{gMeta.desc}</p>
            {venueData?.dimensions && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Ruler className="h-3 w-3 shrink-0" />
                <span>{venueData.dimensions.length}m × {venueData.dimensions.width}m</span>
              </div>
            )}
            <div className="space-y-0.5 text-muted-foreground">
              {[scoringNote, kickNote, disposalNote].filter(Boolean).map((note) => (
                <div key={note} className="flex items-start gap-1">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  )
}
