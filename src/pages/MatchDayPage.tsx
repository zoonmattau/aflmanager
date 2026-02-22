import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { h2hKey, isRivalryMatch } from '@/engine/history/h2hTracker'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { simulateMatch, previewMatchWeather } from '@/engine/match/simulateMatch'
import type { SimulateMatchInput, WeatherModifiers } from '@/engine/match/simulateMatch'
import { LiveMatchView } from '@/components/match/LiveMatchView'
import { PostMatchBoxScore } from '@/components/match/PostMatchBoxScore'
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
  getBroadcastTierColor,
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
  GripVertical,
  Save,
  ArrowUpDown,
  Settings2,
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

type EditableFixtureForm = {
  homeClubId: string
  awayClubId: string
  matchDay: MatchDay
  scheduledTime: string
  venue: string
}

function toEditableFixtureForm(fixture: Fixture): EditableFixtureForm {
  return {
    homeClubId: fixture.homeClubId,
    awayClubId: fixture.awayClubId,
    matchDay: fixture.matchDay ?? 'Saturday-Twilight',
    scheduledTime: fixture.scheduledTime ?? '',
    venue: fixture.venue ?? '',
  }
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
  const updateFixtureGame = useGameStore((s) => s.updateFixtureGame)
  const moveFixtureInRound = useGameStore((s) => s.moveFixtureInRound)
  const swapFixturesInRound = useGameStore((s) => s.swapFixturesInRound)

  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const weeklyGameplans = useGameStore((s) => s.weeklyGameplans)

  const matchReports = useGameStore((s) => s.history.matchReports)
  const h2hRecords = useGameStore((s) => s.history.h2hRecords) ?? EMPTY_H2H

  const [lastMatchResult, setLastMatchResult] = useState<Match | null>(null)
  const [reviewPayload, setReviewPayload] = useState<PostMatchReviewPayload | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [viewingRound, setViewingRound] = useState<number | null>(null)
  const [selectedFixtureKey, setSelectedFixtureKey] = useState<string | null>(null)
  const [editorFixtureIndex, setEditorFixtureIndex] = useState<number>(0)
  const [editorForm, setEditorForm] = useState<EditableFixtureForm | null>(null)
  const [draggingFixtureIndex, setDraggingFixtureIndex] = useState<number | null>(null)
  const [swapTargetIndex, setSwapTargetIndex] = useState<string>('')
  const [editorNotice, setEditorNotice] = useState<{ type: 'error' | 'success'; message: string } | null>(null)
  const [fixtureEditorOpen, setFixtureEditorOpen] = useState<boolean>(false)
  const [liveMatchActive, setLiveMatchActive] = useState(false)
  // stepThrough mode: quarters now start paused automatically via LiveMatchView
  const [liveOtherMatches, setLiveOtherMatches] = useState<Match[]>([])

  // Per-fixture watch/sim state for non-user matches
  const [resolvedMatches, setResolvedMatches] = useState<Map<string, Match>>(new Map())
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
    setSearchParams({}, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset per-fixture resolved state whenever the round advances
  useEffect(() => {
    setResolvedMatches(new Map())
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
  const canEditFixture = currentRound === 0 && !matchResults.some((m) => m.result !== null)
  const editableRoundFixtures = round?.fixtures ?? []
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

  const venueOptions = useMemo(
    () => Object.values(VENUES).map((v) => v.name).sort((a, b) => a.localeCompare(b)),
    [],
  )
  const normalizedEditorFixtureIndex = Math.min(
    Math.max(editorFixtureIndex, 0),
    Math.max(0, editableRoundFixtures.length - 1),
  )
  const editorSelectedFixture = editableRoundFixtures[normalizedEditorFixtureIndex]
  const activeEditorForm = editorForm ?? (editorSelectedFixture ? toEditableFixtureForm(editorSelectedFixture) : null)

  const homeClubOptionsForEditor = useMemo(() => {
    if (!round || !activeEditorForm) return []
    const locked = new Set<string>()
    round.fixtures.forEach((fixture, idx) => {
      if (idx === normalizedEditorFixtureIndex) return
      locked.add(fixture.homeClubId)
      locked.add(fixture.awayClubId)
    })
    return Object.values(clubs)
      .filter((club) => !locked.has(club.id) || club.id === activeEditorForm.homeClubId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [activeEditorForm, clubs, normalizedEditorFixtureIndex, round])

  const awayClubOptionsForEditor = useMemo(() => {
    if (!round || !activeEditorForm) return []
    const locked = new Set<string>()
    round.fixtures.forEach((fixture, idx) => {
      if (idx === normalizedEditorFixtureIndex) return
      locked.add(fixture.homeClubId)
      locked.add(fixture.awayClubId)
    })
    return Object.values(clubs)
      .filter((club) => club.id !== activeEditorForm.homeClubId && (!locked.has(club.id) || club.id === activeEditorForm.awayClubId))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [activeEditorForm, clubs, normalizedEditorFixtureIndex, round])

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

  const roundPlayed = matchResults.some((m) => m.round === displayRoundIdx && m.result !== null)

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

  const setDisplayRound = (idx: number) => {
    const clamped = Math.max(0, Math.min(season.rounds.length - 1, idx))
    setViewingRound(clamped === defaultRound ? null : clamped)
    setEditorFixtureIndex(0)
    setEditorForm(null)
    setSwapTargetIndex('')
    setEditorNotice(null)
  }

  const handleSelectFixtureForEdit = (fixtureIdx: number) => {
    if (!round?.fixtures[fixtureIdx]) return
    setEditorFixtureIndex(fixtureIdx)
    setEditorForm(toEditableFixtureForm(round.fixtures[fixtureIdx]))
    setSwapTargetIndex('')
    setEditorNotice(null)
  }

  const handleSaveFixtureEdit = () => {
    const form = editorForm ?? activeEditorForm
    if (!form) return
    const result = updateFixtureGame(displayRoundIdx, normalizedEditorFixtureIndex, {
      homeClubId: form.homeClubId,
      awayClubId: form.awayClubId,
      matchDay: form.matchDay,
      scheduledTime: form.scheduledTime,
      venue: form.venue,
    })
    if (!result.success) {
      setEditorNotice({ type: 'error', message: result.error ?? 'Unable to update fixture.' })
      return
    }
    setEditorNotice({ type: 'success', message: 'Fixture updated.' })
    const refreshed = useGameStore.getState().season.rounds[displayRoundIdx]?.fixtures?.[normalizedEditorFixtureIndex]
    if (refreshed) {
      setEditorForm(toEditableFixtureForm(refreshed))
      setSelectedFixtureKey(getFixtureKey(refreshed))
    }
  }

  const handleSwapFixtures = () => {
    if (!swapTargetIndex) return
    const target = parseInt(swapTargetIndex, 10)
    const result = swapFixturesInRound(displayRoundIdx, normalizedEditorFixtureIndex, target)
    if (!result.success) {
      setEditorNotice({ type: 'error', message: result.error ?? 'Unable to swap fixtures.' })
      return
    }
    setEditorNotice({ type: 'success', message: 'Games swapped.' })
    setSwapTargetIndex('')
  }

  const handleDropFixture = (toIndex: number) => {
    if (draggingFixtureIndex === null) return
    const result = moveFixtureInRound(displayRoundIdx, draggingFixtureIndex, toIndex)
    setDraggingFixtureIndex(null)
    if (!result.success) {
      setEditorNotice({ type: 'error', message: result.error ?? 'Unable to move fixture.' })
      return
    }
    setEditorFixtureIndex(toIndex)
    const refreshed = useGameStore.getState().season.rounds[displayRoundIdx]?.fixtures?.[toIndex]
    if (refreshed) setEditorForm(toEditableFixtureForm(refreshed))
    setEditorNotice({ type: 'success', message: 'Fixture order updated.' })
  }

  const handleSimRound = () => {
    const result = simCurrentRound({
      precomputedMatches: resolvedMatches.size > 0 ? [...resolvedMatches.values()] : undefined,
    })
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
        })
        otherMatches.push(match)
      })
      setLiveOtherMatches(otherMatches)
    }
    setLiveMatchActive(true)
  }

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
    })
    setResolvedMatches((prev) => new Map(prev).set(fixtureKey(fixture), match))
  }, [round, currentRound, players, clubs, rngSeed, settings])

  const handleWatchOtherFixture = useCallback((fixture: Fixture) => {
    if (!round) return
    const fixtureIdx = round.fixtures.findIndex(
      (f) => f.homeClubId === fixture.homeClubId && f.awayClubId === fixture.awayClubId,
    )
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
      },
    })
  }, [round, currentRound, players, clubs, rngSeed, settings])

  const handleSpectatorComplete = useCallback((match: Match) => {
    if (!watchingSpectator) return
    setResolvedMatches((prev) => new Map(prev).set(fixtureKey(watchingSpectator.fixture), match))
    setWatchingSpectator(null)
  }, [watchingSpectator])

  const handleLiveMatchComplete = useCallback((match: Match) => {
    // Route through the full post-round pipeline via simCurrentRound
    const result = simCurrentRound({
      precomputedUserMatch: match,
      precomputedMatches: resolvedMatches.size > 0 ? [...resolvedMatches.values()] : undefined,
    })
    setLiveMatchActive(false)
    setLiveOtherMatches([])
    if (result.reviewPayload) {
      setReviewPayload(result.reviewPayload)
    } else {
      setLastMatchResult(result.userMatch ?? match)
    }
  }, [simCurrentRound, resolvedMatches])

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
    if (!playerClubId || !selectedLineup) return {}
    // Only return on-field slots (exclude interchange)
    const result: Record<string, string> = {}
    for (const [slot, pid] of Object.entries(selectedLineup)) {
      if (pid && !slot.startsWith('I')) result[slot] = pid
    }
    return result
  }, [playerClubId, selectedLineup])

  const opponentLineupForField = useMemo<Record<string, string>>(() => {
    if (!opponentClubId) return {}
    const { lineup } = selectBestLineup(Object.values(players), opponentClubId, {
      interchangePlayers: settings.matchRules.interchangePlayers,
      club: clubs[opponentClubId],
    })
    // Only on-field slots
    const result: Record<string, string> = {}
    for (const [slot, pid] of Object.entries(lineup)) {
      if (pid && !slot.startsWith('I')) result[slot] = pid
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
          <Button
            variant="outline"
            onClick={() => setFixtureEditorOpen((v) => !v)}
            className="flex items-center gap-2"
          >
            <Settings2 className="h-4 w-4" />
            {fixtureEditorOpen ? 'Hide Fixture Editor' : 'Edit Fixture'}
          </Button>
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
                {showLive && playerFixture && userFixtureSimInput && (
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
                    {liveSimMode === 'quick-sim' ? 'Quick Simulate' : 'Simulate Round'}
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

      {liveMatchActive && playerFixture && userFixtureSimInput && (
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
        />
      )}

      {watchingSpectator && (
        <LiveMatchView
          simInput={watchingSpectator.simInput}
          userClubId={playerClubId}
          homeClub={clubs[watchingSpectator.fixture.homeClubId]}
          awayClub={clubs[watchingSpectator.fixture.awayClubId]}
          spectatorMode={true}
          onComplete={handleSpectatorComplete}
          onCancel={() => setWatchingSpectator(null)}
        />
      )}

      {fixtureEditorOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpDown className="h-4 w-4" />
              Fixture Editor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canEditFixture ? (
              <>
                <div className="text-xs text-muted-foreground">
                  Available only before the first game of the season. Drag games to reorder, swap games, and edit matchup/day/time/venue.
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  {editableRoundFixtures.map((fixture, idx) => {
                    const home = clubs[fixture.homeClubId]
                    const away = clubs[fixture.awayClubId]
                    const active = idx === normalizedEditorFixtureIndex
                    return (
                      <div
                        key={`edit-fixture-${idx}-${fixture.homeClubId}-${fixture.awayClubId}`}
                        draggable
                        onDragStart={() => setDraggingFixtureIndex(idx)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDropFixture(idx)}
                        className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
                          active ? 'border-primary bg-primary/10' : 'border-border'
                        }`}
                        onClick={() => handleSelectFixtureForEdit(idx)}
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{home?.abbreviation ?? fixture.homeClubId}</span>
                          <span className="text-muted-foreground">vs</span>
                          <span className="font-medium">{away?.abbreviation ?? fixture.awayClubId}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {(fixture.matchDay ?? 'Saturday-Twilight').replace('-', ' ')}{fixture.scheduledTime ? ` · ${fixture.scheduledTime}` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="space-y-3 rounded border p-3">
                  {activeEditorForm && editorSelectedFixture ? (
                    <>
                      <div className="text-sm font-semibold">Edit Game</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Home</div>
                          <Select
                            value={activeEditorForm.homeClubId}
                            onValueChange={(value) => setEditorForm((prev) => ({ ...(prev ?? activeEditorForm), homeClubId: value }))}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {homeClubOptionsForEditor.map((club) => (
                                <SelectItem key={`home-${club.id}`} value={club.id}>
                                  {club.fullName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Away</div>
                          <Select
                            value={activeEditorForm.awayClubId}
                            onValueChange={(value) => setEditorForm((prev) => ({ ...(prev ?? activeEditorForm), awayClubId: value }))}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {awayClubOptionsForEditor.map((club) => (
                                <SelectItem key={`away-${club.id}`} value={club.id}>
                                  {club.fullName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Day</div>
                          <Select
                            value={activeEditorForm.matchDay}
                            onValueChange={(value) => setEditorForm((prev) => ({ ...(prev ?? activeEditorForm), matchDay: value as MatchDay }))}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {MATCH_DAY_ORDER.map((day) => (
                                <SelectItem key={day} value={day}>
                                  {MATCH_DAY_LABELS[day]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Time</div>
                          <Input
                            value={activeEditorForm.scheduledTime}
                            onChange={(event) => setEditorForm((prev) => ({ ...(prev ?? activeEditorForm), scheduledTime: event.target.value }))}
                            placeholder="e.g. 7:20pm"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Venue</div>
                        <Input
                          list="fixture-venue-options"
                          value={activeEditorForm.venue}
                          onChange={(event) => setEditorForm((prev) => ({ ...(prev ?? activeEditorForm), venue: event.target.value }))}
                          placeholder="Venue"
                        />
                        <datalist id="fixture-venue-options">
                          {venueOptions.map((venue) => (
                            <option key={venue} value={venue} />
                          ))}
                        </datalist>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={handleSaveFixtureEdit} className="gap-1">
                          <Save className="h-3.5 w-3.5" />
                          Save Changes
                        </Button>
                        <Select value={swapTargetIndex} onValueChange={setSwapTargetIndex}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Swap with..." />
                          </SelectTrigger>
                          <SelectContent>
                            {editableRoundFixtures.map((fixture, idx) => (
                              <SelectItem key={`swap-${idx}`} value={String(idx)} disabled={idx === normalizedEditorFixtureIndex}>
                                Game {idx + 1}: {(clubs[fixture.homeClubId]?.abbreviation ?? fixture.homeClubId)} vs {(clubs[fixture.awayClubId]?.abbreviation ?? fixture.awayClubId)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={handleSwapFixtures} disabled={!swapTargetIndex}>
                          Swap Games
                        </Button>
                      </div>
                      {editorNotice && (
                        <div className={`rounded border px-2 py-1 text-xs ${
                          editorNotice.type === 'error'
                            ? 'border-red-500/40 text-red-300'
                            : 'border-emerald-500/40 text-emerald-300'
                        }`}>
                          {editorNotice.message}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">Select a game to edit.</div>
                  )}
                </div>
                </div>
              </>
            ) : (
              <div className="rounded border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                Fixture editing is locked after the first game of the season.
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                // During live match, show pre-simulated scores for other games
                const livePreview = !result?.result && !resolvedMatch && liveMatchActive
                  ? liveOtherMatches.find(
                      (m) => m.homeClubId === fixture.homeClubId && m.awayClubId === fixture.awayClubId,
                    )
                  : null
                return (
                  <button
                    type="button"
                    key={`${fixture.homeClubId}-${fixture.awayClubId}-${group.iso}-${idx}`}
                    onClick={() => setSelectedFixtureKey(getFixtureKey(fixture))}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50 ${
                      isSelected ? 'border-primary bg-primary/10' : isUserMatch ? 'border-primary/50 bg-primary/5' : ''
                    }`}
                  >
                    {fixture.isBlockbuster && fixture.blockbusterName && (
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                        <Star className="h-3 w-3 fill-amber-400" />
                        {fixture.blockbusterName}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isUserMatch && <Badge>Your Match</Badge>}
                        {isSelected && <Badge variant="secondary">Previewing</Badge>}
                        {fixture.broadcastChannel && fixture.broadcastChannel !== 'None' && (
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getBroadcastChannelColor(fixture.broadcastChannel)}`}
                            title={`${getBroadcastChannelLabel(fixture.broadcastChannel)} — ${getBroadcastTierLabel(fixture.broadcastTier)}`}
                          >
                            {getBroadcastChannelShort(fixture.broadcastChannel)}
                            {fixture.broadcastTier === 'marquee' && (
                              <Star className="ml-0.5 h-2.5 w-2.5 fill-current" />
                            )}
                          </span>
                        )}
                        {fixture.scheduledTime && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {fixture.scheduledTime}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <TeamBadge club={home} fallback={fixture.homeClubId} />
                        <span className="font-semibold">{home?.abbreviation ?? fixture.homeClubId}</span>
                        <span className="text-muted-foreground">vs</span>
                        <span className="font-semibold">{away?.abbreviation ?? fixture.awayClubId}</span>
                        <TeamBadge club={away} fallback={fixture.awayClubId} />
                      </div>

                      <div className="text-right text-xs">
                        {result?.result ? (
                          <span className="font-mono">
                            {result.result.homeTotalScore} – {result.result.awayTotalScore}
                          </span>
                        ) : resolvedMatch?.result ? (
                          <span className="font-mono text-muted-foreground">
                            {resolvedMatch.result.homeTotalScore} – {resolvedMatch.result.awayTotalScore}
                            <span className="ml-1 text-[10px] text-blue-400 font-semibold">✓</span>
                          </span>
                        ) : livePreview?.result ? (
                          <span className="font-mono text-muted-foreground">
                            {livePreview.result.homeTotalScore} – {livePreview.result.awayTotalScore}
                            <span className="ml-1 text-[10px] text-emerald-500 font-semibold">FT</span>
                          </span>
                        ) : isUserMatch && liveMatchActive ? (
                          <span className="text-[10px] text-primary font-semibold animate-pulse">LIVE</span>
                        ) : (
                          <span className="text-muted-foreground">Upcoming</span>
                        )}
                      </div>
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

                    {isCurrentRound && !roundPlayed && !isUserMatch && !liveMatchActive && !watchingSpectator && (
                      resolvedMatch ? (
                        <div className="mt-1.5 text-[11px] text-muted-foreground">
                          Result locked in — will be committed when you advance the round.
                        </div>
                      ) : (
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
                      )
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {selectedFixture && previewData && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Swords className="h-4 w-4" />
                Matchup Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <TeamBadge club={homeClub} fallback={selectedFixture.homeClubId} size="md" />
                    <span>{homeClub?.fullName ?? selectedFixture.homeClubId}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">vs</div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span>{awayClub?.fullName ?? selectedFixture.awayClubId}</span>
                    <TeamBadge club={awayClub} fallback={selectedFixture.awayClubId} size="md" />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{MATCH_DAY_LABELS[selectedFixture.matchDay ?? 'Saturday-Twilight']}</span>
                  {selectedFixture.scheduledTime ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{selectedFixture.scheduledTime}</span> : null}
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{selectedFixture.venue}</span>
                  {selectedFixture.broadcastChannel && selectedFixture.broadcastChannel !== 'None' && (
                    <span className={`inline-flex items-center gap-1 font-medium ${getBroadcastTierColor(selectedFixture.broadcastTier)}`}>
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getBroadcastChannelColor(selectedFixture.broadcastChannel)}`}
                      >
                        {getBroadcastChannelShort(selectedFixture.broadcastChannel)}
                      </span>
                      {getBroadcastTierLabel(selectedFixture.broadcastTier)} broadcast
                    </span>
                  )}
                  {selectedFixtureResult?.result?.simulationContext?.attendance != null && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {selectedFixtureResult.result.simulationContext.attendance.toLocaleString()}
                      {selectedFixtureResult.result.simulationContext.capacityPct != null && (
                        <span className="text-muted-foreground">({selectedFixtureResult.result.simulationContext.capacityPct}%)</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" />Form (Last 5)</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-2">
                    <div className="flex justify-between"><span>{homeClub?.abbreviation}</span><span className="font-medium">{previewData.homeForm.wins}-{previewData.homeForm.losses}-{previewData.homeForm.draws}</span></div>
                    <div className="flex justify-between"><span>{awayClub?.abbreviation}</span><span className="font-medium">{previewData.awayForm.wins}-{previewData.awayForm.losses}-{previewData.awayForm.draws}</span></div>
                    <div className="text-muted-foreground">Trend: {previewData.homeForm.trend.join(' ') || 'N/A'} / {previewData.awayForm.trend.join(' ') || 'N/A'}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Trophy className="h-3.5 w-3.5" />Ladder Comparison</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-2">
                    <div className="flex justify-between"><span>{homeClub?.abbreviation} Rank</span><span className="font-medium">#{previewData.homeLadder?.rank ?? '-'}</span></div>
                    <div className="flex justify-between"><span>{awayClub?.abbreviation} Rank</span><span className="font-medium">#{previewData.awayLadder?.rank ?? '-'}</span></div>
                    <div className="flex justify-between"><span>Points</span><span className="font-medium">{previewData.homeLadder?.points ?? 0} - {previewData.awayLadder?.points ?? 0}</span></div>
                    <div className="flex justify-between"><span>Percentage</span><span className="font-medium">{(previewData.homeLadder?.percentage ?? 0).toFixed(1)} - {(previewData.awayLadder?.percentage ?? 0).toFixed(1)}</span></div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Target className="h-3.5 w-3.5" />Key Matchups</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {previewData.keyMatchups.map((m) => (
                    <div key={m.title} className="flex items-center justify-between rounded border px-2 py-1.5 text-xs">
                      <div className="w-[42%]">
                        {m.home ? `${m.home.firstName.charAt(0)}. ${m.home.lastName} (${getOverallRating(m.home)})` : 'TBD'}
                      </div>
                      <div className="w-[16%] text-center text-muted-foreground">{m.title}</div>
                      <div className="w-[42%] text-right">
                        {m.away ? `${m.away.firstName.charAt(0)}. ${m.away.lastName} (${getOverallRating(m.away)})` : 'TBD'}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    H2H Record
                    {isRivalryFixture && (
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-red-500/15 text-red-600 border border-red-500/30">
                        Rivalry Match
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {allTimeH2H ? (
                    <div className="mb-2 flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-base font-bold">{allTimeH2H.wins0}</p>
                        <p className="text-[10px] text-muted-foreground">{homeClub?.abbreviation}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-base font-bold text-muted-foreground">{allTimeH2H.draws}</p>
                        <p className="text-[10px] text-muted-foreground">D</p>
                      </div>
                      <div className="text-center">
                        <p className="text-base font-bold">{allTimeH2H.wins1}</p>
                        <p className="text-[10px] text-muted-foreground">{awayClub?.abbreviation}</p>
                      </div>
                      {allTimeH2H.streak && allTimeH2H.streak.length >= 2 && (
                        <div className="ml-auto text-[10px] font-semibold text-muted-foreground">
                          {clubs[allTimeH2H.streak.clubId]?.abbreviation} on {allTimeH2H.streak.length}-game streak
                        </div>
                      )}
                    </div>
                  ) : null}
                  {previewData.meetings.length === 0 ? (
                    <p className="text-muted-foreground">No previous meetings this season.</p>
                  ) : (
                    previewData.meetings.map((m) => {
                      if (!m.result) return null
                      const home = clubs[m.homeClubId]
                      const away = clubs[m.awayClubId]
                      const winner = m.result.homeTotalScore === m.result.awayTotalScore
                        ? 'Draw'
                        : m.result.homeTotalScore > m.result.awayTotalScore
                          ? home?.abbreviation ?? m.homeClubId
                          : away?.abbreviation ?? m.awayClubId
                      return (
                        <div key={m.id} className="flex items-center justify-between rounded border px-2 py-1.5">
                          <span>Round {m.round + 1}: {home?.abbreviation} {m.result.homeTotalScore} - {m.result.awayTotalScore} {away?.abbreviation}</span>
                          <span className="font-medium">{winner}</span>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Win Probability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{homeClub?.abbreviation}</span>
                    <span className="font-semibold">{previewData.winProb.home}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${previewData.winProb.home}%` }} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{awayClub?.abbreviation}</span>
                    <span className="font-semibold">{previewData.winProb.away}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-secondary" style={{ width: `${previewData.winProb.away}%` }} />
                  </div>
                </div>
                <div className="rounded border p-2 text-xs text-muted-foreground">
                  Model factors: ladder points/percentage, recent form, squad strength, and home-ground edge.
                </div>
                <div className="rounded border p-2 text-xs">
                  <div className="flex justify-between"><span>{homeClub?.abbreviation} strength</span><span>{previewData.homeStrength.toFixed(1)}</span></div>
                  <div className="flex justify-between"><span>{awayClub?.abbreviation} strength</span><span>{previewData.awayStrength.toFixed(1)}</span></div>
                </div>
              </CardContent>
            </Card>

            <MatchConditionsCard weather={previewData.weather} venueData={previewData.venueData} />
          </div>
        </div>
      )}

      {lastMatchResult?.result && (() => {
        const matchReport = matchReports?.find((r: import('@/types/history').MatchReport) => r.matchId === lastMatchResult.id)
        return (
          <>
            {matchReport && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setReportOpen(true)}>Read Report</Button>
              </div>
            )}
            <MatchResultView match={lastMatchResult} clubs={clubs} players={players} playerClubId={playerClubId} />
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
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <WeatherIcon className={`h-4 w-4 ${wMeta.color}`} />
          Match Conditions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {/* Weather + Ground badges */}
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${wMeta.bg} ${wMeta.color}`}>
            <WeatherIcon className="h-3 w-3" />
            {wMeta.label}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
            {gMeta.label} ground
          </span>
        </div>

        {/* Ground description */}
        <p className="text-muted-foreground">{gMeta.desc}</p>

        {/* Gameplay impacts from weather */}
        <div className="space-y-1">
          {wMeta.impacts.map((imp) => (
            <div key={imp} className="flex items-start gap-1.5 text-muted-foreground">
              <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${wMeta.color.replace('text-', 'bg-')}`} />
              {imp}
            </div>
          ))}
        </div>

        {/* Multiplier bars for non-clear weather */}
        {weather.condition !== 'clear' && (
          <div className="space-y-1.5 rounded border px-2.5 py-2">
            {[
              { label: 'Mark rate',    value: weather.markMult },
              { label: 'Accuracy',     value: weather.accuracyMult },
              { label: 'Kick efficiency', value: weather.kickingEfficiencyMult },
              { label: 'Disposals',    value: weather.possessionMult },
            ].map(({ label, value }) => {
              const pct = Math.round((value - 1) * 100)
              return (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground w-28 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${value < 1 ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, Math.abs(pct) * 5 + 5)}%`, marginLeft: value < 1 ? 'auto' : 0 }}
                    />
                  </div>
                  <span className={`w-10 text-right font-mono ${pct < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {pct >= 0 ? '+' : ''}{pct}%
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Ground characteristics */}
        {(scoringNote || kickNote || disposalNote || venueData?.dimensions) && (
          <div className="space-y-1 rounded border px-2.5 py-2 text-muted-foreground">
            {venueData?.dimensions && (
              <div className="flex items-center gap-1.5">
                <Ruler className="h-3 w-3 shrink-0" />
                {venueData.dimensions.length}m × {venueData.dimensions.width}m
              </div>
            )}
            {scoringNote  && <div className="flex items-start gap-1.5"><span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />{scoringNote}</div>}
            {kickNote     && <div className="flex items-start gap-1.5"><span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />{kickNote}</div>}
            {disposalNote && <div className="flex items-start gap-1.5"><span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />{disposalNote}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
