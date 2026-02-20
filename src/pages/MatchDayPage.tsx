import { useMemo, useState, useCallback } from 'react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { simulateMatch } from '@/engine/match/simulateMatch'
import type { SimulateMatchInput } from '@/engine/match/simulateMatch'
import { processMatchResults } from '@/engine/season/processResults'
import { LiveMatchView } from '@/components/match/LiveMatchView'
import { MatchReportModal } from '@/components/match/MatchReportModal'
import { getOverallRating } from '@/engine/player/playerRating'
import { VENUES } from '@/data/venues'
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
} from 'lucide-react'

const MATCH_DAY_ORDER: MatchDay[] = [
  'Thursday',
  'Friday',
  'Saturday-Early',
  'Saturday-Twilight',
  'Saturday-Night',
  'Sunday-Early',
  'Sunday-Twilight',
  'Monday',
]

const MATCH_DAY_LABELS: Record<MatchDay, string> = {
  Thursday: 'Thursday Night',
  Friday: 'Friday Night',
  'Saturday-Early': 'Saturday Afternoon',
  'Saturday-Twilight': 'Saturday Twilight',
  'Saturday-Night': 'Saturday Night',
  'Sunday-Early': 'Sunday Early',
  'Sunday-Twilight': 'Sunday Afternoon',
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
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const season = useGameStore((s) => s.season)
  const settings = useGameStore((s) => s.settings)
  const currentRound = useGameStore((s) => s.currentRound)
  const matchResults = useGameStore((s) => s.matchResults)
  const ladder = useGameStore((s) => s.ladder)
  const rngSeed = useGameStore((s) => s.rngSeed)
  const addMatchResult = useGameStore((s) => s.addMatchResult)
  const advanceRound = useGameStore((s) => s.advanceRound)
  const simCurrentRound = useGameStore((s) => s.simCurrentRound)
  const updateFixtureGame = useGameStore((s) => s.updateFixtureGame)
  const moveFixtureInRound = useGameStore((s) => s.moveFixtureInRound)
  const swapFixturesInRound = useGameStore((s) => s.swapFixturesInRound)

  const matchReports = useGameStore((s) => s.history.matchReports)
  const h2hRecords = useGameStore((s) => s.history.h2hRecords ?? {})

  const [lastMatchResult, setLastMatchResult] = useState<Match | null>(null)
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

  const displayRoundIdx = viewingRound ?? currentRound
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
    }
  }, [ladderByClub, matchResults, players, selectedFixture])

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

  const roundPlayed = matchResults.some((m) => m.round === displayRoundIdx && m.result !== null)

  const setDisplayRound = (idx: number) => {
    const clamped = Math.max(0, Math.min(season.rounds.length - 1, idx))
    setViewingRound(clamped === currentRound ? null : clamped)
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
    const results: Match[] = round.fixtures.map((fixture, i) =>
      simulateMatch({
        homeClubId: fixture.homeClubId,
        awayClubId: fixture.awayClubId,
        venue: fixture.venue,
        venueId: fixture.venueId,
        matchDay: fixture.matchDay,
        round: currentRound,
        players,
        clubs,
        seed: rngSeed + currentRound * 100 + i,
        matchRules: settings.matchRules,
        realism: settings.realism,
      }),
    )

    results.forEach((m) => addMatchResult(m))
    processMatchResults(results, useGameStore.getState, useGameStore.setState)

    const userMatch = results.find(
      (m) => m.homeClubId === playerClubId || m.awayClubId === playerClubId,
    )
    if (userMatch) setLastMatchResult(userMatch)

    advanceRound()
  }

  const handlePlayLive = () => {
    setLiveMatchActive(true)
  }

  const handleLiveMatchComplete = useCallback((match: Match) => {
    // Route through the full post-round pipeline via simCurrentRound
    const result = simCurrentRound({ precomputedUserMatch: match })
    setLiveMatchActive(false)
    setLastMatchResult(result.userMatch ?? match)
  }, [simCurrentRound])

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
          {isCurrentRound && !roundPlayed && !liveMatchActive && (
            <>
              {playerFixture && userFixtureSimInput && (
                <Button variant="secondary" onClick={handlePlayLive} className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Play Live
                </Button>
              )}
              <Button onClick={handleSimRound} className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                Simulate Round
              </Button>
            </>
          )}
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
          onCancel={() => setLiveMatchActive(false)}
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
                const played = !!result?.result

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
                        {played ? (
                          <span className="font-mono">
                            {result?.result?.homeTotalScore} - {result?.result?.awayTotalScore}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Upcoming</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{fixture.venue}</span>
                      {result?.result?.simulationContext?.attendance != null && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {result.result.simulationContext.attendance.toLocaleString()}
                        </span>
                      )}
                    </div>
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
  const awayClub = clubs[match.awayClubId]
  const isHome = match.homeClubId === playerClubId

  const userStats = isHome ? result.homePlayerStats : result.awayPlayerStats

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-8">
            <div className="flex flex-col items-center gap-1">
              <div className="h-12 w-12 rounded-full" style={{ backgroundColor: homeClub?.colors.primary }} />
              <span className="font-bold">{homeClub?.abbreviation}</span>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{result.homeTotalScore} - {result.awayTotalScore}</div>
              <div className="mt-1 text-xs text-muted-foreground font-mono">
                {result.homeScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
                <br />
                {result.awayScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="h-12 w-12 rounded-full" style={{ backgroundColor: awayClub?.colors.primary }} />
              <span className="font-bold">{awayClub?.abbreviation}</span>
            </div>
          </div>
          {result.simulationContext && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{match.venue}</span>
              {result.simulationContext.attendance != null && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {result.simulationContext.attendance.toLocaleString()}
                  {result.simulationContext.capacityPct != null && (
                    <span>({result.simulationContext.capacityPct}%)</span>
                  )}
                </span>
              )}
              <span>{result.simulationContext.weather}, {result.simulationContext.groundCondition}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Player Stats</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-center">D</TableHead>
                  <TableHead className="text-center">MIN</TableHead>
                  <TableHead className="text-center">AF</TableHead>
                  <TableHead className="text-center">SC</TableHead>
                  <TableHead className="text-center">K</TableHead>
                  <TableHead className="text-center">HB</TableHead>
                  <TableHead className="text-center">M</TableHead>
                  <TableHead className="text-center">T</TableHead>
                  <TableHead className="text-center">G</TableHead>
                  <TableHead className="text-center">B</TableHead>
                  <TableHead className="text-center">CP</TableHead>
                  <TableHead className="text-center">UP</TableHead>
                  <TableHead className="text-center">CL</TableHead>
                  <TableHead className="text-center">I50</TableHead>
                  <TableHead className="text-center">R50</TableHead>
                  <TableHead className="text-center">HO</TableHead>
                  <TableHead className="text-center">INT</TableHead>
                  <TableHead className="text-center">SI</TableHead>
                  <TableHead className="text-center">GA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...userStats]
                  .sort((a, b) => b.disposals - a.disposals)
                  .map((stat) => {
                    const player = players[stat.playerId]
                    if (!player) return null
                    return (
                      <TableRow key={stat.playerId} className="text-sm">
                        <TableCell className="font-medium whitespace-nowrap">{player.firstName.charAt(0)}. {player.lastName}</TableCell>
                        <TableCell className="text-center">{stat.disposals}</TableCell>
                        <TableCell className="text-center">{stat.minutesPlayed}</TableCell>
                        <TableCell className="text-center font-medium">{stat.aflFantasyPoints ?? 0}</TableCell>
                        <TableCell className="text-center font-medium">{stat.superCoachPoints ?? 0}</TableCell>
                        <TableCell className="text-center">{stat.kicks}</TableCell>
                        <TableCell className="text-center">{stat.handballs}</TableCell>
                        <TableCell className="text-center">{stat.marks}</TableCell>
                        <TableCell className="text-center">{stat.tackles}</TableCell>
                        <TableCell className="text-center font-bold">{stat.goals > 0 ? stat.goals : ''}</TableCell>
                        <TableCell className="text-center">{stat.behinds > 0 ? stat.behinds : ''}</TableCell>
                        <TableCell className="text-center">{stat.contestedPossessions}</TableCell>
                        <TableCell className="text-center">{stat.uncontestedPossessions ?? stat.uncountestedPossessions ?? 0}</TableCell>
                        <TableCell className="text-center">{stat.clearances}</TableCell>
                        <TableCell className="text-center">{stat.insideFifties}</TableCell>
                        <TableCell className="text-center">{stat.rebound50s}</TableCell>
                        <TableCell className="text-center">{stat.hitouts > 0 ? stat.hitouts : ''}</TableCell>
                        <TableCell className="text-center">{stat.intercepts}</TableCell>
                        <TableCell className="text-center">{stat.scoreInvolvements}</TableCell>
                        <TableCell className="text-center">{stat.goalAssists}</TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
