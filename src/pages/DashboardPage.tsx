import { useState, useMemo, useEffect } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useNavigate } from 'react-router-dom'
import {
  Trophy,
  Play, FastForward, SkipForward, ChevronLeft, ChevronRight, ArrowRight,
  Plus, Moon, X,
  Users, ClipboardList, Shield, BarChart3, Gamepad2,
  AlertTriangle, GraduationCap, Scale, Mail, FileText, Cog, DollarSign,
  Newspaper, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import type { Match } from '@/types/match'
import type { Player, PlayerPositionType } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import type { Club } from '@/types/club'
import type { Fixture, LadderEntry } from '@/types/season'
import type { GamePhase } from '@/types/game'
import type { GameEvent, GameEventType, ScheduleSlot } from '@/types/calendar'
import type { TrainingFocus, TrainingSession } from '@/engine/training/trainingEngine'
import {
  runTrainingSessions,
  applyTrainingResults,
  getDefaultTrainingWeek,
  weekPlanToSessions,
  advanceClubUpskilling,
} from '@/engine/training/trainingEngine'
import { SeededRNG } from '@/engine/core/rng'
import { getClubBudgetAllocation, getBudgetMultiplier } from '@/engine/clubs/budgetEngine'
import {
  getMediaPressureLabel,
  getPressureLabelColor,
  getPressureBarColor,
  getPressureTrend,
  getMediaPressureMoraleEffect,
} from '@/engine/media/pressureEngine'
import {
  getNextEvent,
  addDays,
  formatDate,
  getDeadlineCountdowns,
} from '@/engine/calendar/calendarEngine'
import { getFixtureDateIso } from '@/engine/season/fixtureDateUtils'
import {
  getOffseasonPhaseLabel,
} from '@/engine/season/offseasonFlow'
import { getFinalsFormatById, hasTopFourDoubleChanceAdvantage } from '@/engine/season/finalsFormats'
import {
  formatOffseasonDateTime,
} from '@/engine/offseason/offseasonCalendar'
import { RecommendedActions } from '@/components/dashboard/RecommendedActions'
import { ClubListNeedsCard } from '@/components/dashboard/ClubListNeedsCard'
import { OffseasonPhaseCard } from '@/components/dashboard/OffseasonPhaseCard'
import { PhaseProgressCard } from '@/components/dashboard/PhaseProgressCard'
import { OffseasonCalendarOverlay } from '@/components/dashboard/OffseasonCalendarOverlay'
import { MatchupFieldPreview } from '@/components/lineup/MatchupFieldPreview'
import { selectBestLineup } from '@/engine/ai/lineupSelection'
import { getLineupSlots } from '@/engine/core/constants'
import { calculateClubSalaryTotal, calculateLuxuryTax } from '@/engine/contracts/negotiation'
import { isPlayerSuspended } from '@/engine/players/availability'
import { canBeSelectedForAfl } from '@/engine/players/contracts'
import { PLAYER_TRAINING_FOCUS_LABELS } from '@/engine/players/trainingFocus'
import { applyMediaCoverage, deriveMediaStories } from '@/engine/media/mediaFeedEngine'

// ---------------------------------------------------------------------------
// Calendar constants
// ---------------------------------------------------------------------------
const EVENT_COLORS: Record<GameEventType, string> = {
  match: 'bg-blue-500',
  training: 'bg-green-500',
  'contract-deadline': 'bg-orange-500',
  'trade-deadline': 'bg-purple-500',
  draft: 'bg-yellow-500',
  'preseason-friendly': 'bg-teal-500',
  bye: 'bg-gray-400',
  milestone: 'bg-pink-500',
  'special-event': 'bg-amber-500',
  tribunal: 'bg-orange-500',
}

const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const POSITION_LABELS: Record<PlayerPositionType, string> = {
  BP: 'Back Pocket',
  FB: 'Full Back',
  HBF: 'Half Back Flank',
  CHB: 'Centre Half Back',
  W: 'Wing',
  IM: 'Inside Mid',
  OM: 'Outside Mid',
  RK: 'Ruckman',
  HFF: 'Half Forward Flank',
  CHF: 'Centre Half Forward',
  FP: 'Forward Pocket',
  FF: 'Full Forward',
}

// ---------------------------------------------------------------------------
// Training focus picker options
// ---------------------------------------------------------------------------
const TRAINING_FOCUS_OPTIONS: { value: TrainingFocus | 'rest'; label: string; color: string }[] = [
  { value: 'kicking',       label: 'Kicking',        color: 'bg-green-600' },
  { value: 'handball',      label: 'Handball',       color: 'bg-green-500' },
  { value: 'marking',       label: 'Marking',        color: 'bg-green-700' },
  { value: 'physical',      label: 'Physical',       color: 'bg-blue-600' },
  { value: 'contested',     label: 'Contested',      color: 'bg-blue-500' },
  { value: 'game-sense',    label: 'Game Sense',     color: 'bg-green-400' },
  { value: 'offensive',     label: 'Offensive',      color: 'bg-green-600' },
  { value: 'defensive',     label: 'Defensive',      color: 'bg-blue-700' },
  { value: 'ruck',          label: 'Ruck',           color: 'bg-blue-400' },
  { value: 'mental',        label: 'Mental',         color: 'bg-purple-500' },
  { value: 'set-pieces',    label: 'Ball Up / Throw In', color: 'bg-purple-400' },
  { value: 'match-fitness', label: 'Match Fitness',  color: 'bg-blue-500' },
  { value: 'recovery',      label: 'Recovery',       color: 'bg-gray-500' },
  { value: 'rest',          label: 'Rest',           color: 'bg-gray-400' },
]

// Position group benefit mapping
type PositionGroup = 'Forwards' | 'Midfielders' | 'Defenders' | 'Rucks' | 'All'

const FOCUS_POSITION_GROUPS: Record<TrainingFocus, PositionGroup[]> = {
  kicking:        ['All'],
  handball:       ['Midfielders', 'Forwards'],
  marking:        ['Forwards', 'Defenders'],
  physical:       ['All'],
  contested:      ['Midfielders'],
  'game-sense':   ['Midfielders', 'Forwards'],
  offensive:      ['Forwards'],
  defensive:      ['Defenders'],
  ruck:           ['Rucks'],
  mental:         ['All'],
  'set-pieces':   ['Midfielders', 'Rucks'],
  'match-fitness': ['All'],
  recovery:       ['All'],
}

// Fatigue cost per intensity (from trainingEngine constants)
const SLOT_FATIGUE: Record<'morning' | 'afternoon', number> = {
  morning: 8,    // moderate intensity
  afternoon: 3,  // light intensity
}

// Broad skill area that each training focus contributes to
type SkillArea = 'Disposal' | 'Contested' | 'Physical' | 'Tactical' | 'Mental' | 'Set Play' | 'Recovery'

const FOCUS_SKILL_AREA: Record<TrainingFocus, SkillArea> = {
  kicking:        'Disposal',
  handball:       'Disposal',
  marking:        'Contested',
  physical:       'Physical',
  contested:      'Contested',
  'game-sense':   'Tactical',
  offensive:      'Tactical',
  defensive:      'Tactical',
  ruck:           'Contested',
  mental:         'Mental',
  'set-pieces':   'Set Play',
  'match-fitness': 'Physical',
  recovery:       'Recovery',
}

function getSlotColor(activity: TrainingFocus | 'rest'): string {
  return TRAINING_FOCUS_OPTIONS.find((o) => o.value === activity)?.color ?? 'bg-gray-500'
}

function getSlotLabel(activity: TrainingFocus | 'rest'): string {
  return TRAINING_FOCUS_OPTIONS.find((o) => o.value === activity)?.label ?? activity
}

function formatMoneyShort(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}m`
  return `$${Math.round(value / 1000)}k`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

function computeForm(matchResults: Match[], clubId: string): string[] {
  return matchResults
    .filter(
      (m) =>
        m.result &&
        !m.isFinal &&
        (m.homeClubId === clubId || m.awayClubId === clubId),
    )
    .slice(-5)
    .map((m) => {
      const isHome = m.homeClubId === clubId
      const myScore = isHome ? m.result!.homeTotalScore : m.result!.awayTotalScore
      const theirScore = isHome ? m.result!.awayTotalScore : m.result!.homeTotalScore
      if (myScore > theirScore) return 'W'
      if (myScore < theirScore) return 'L'
      return 'D'
    })
}

/** Build 7 day objects for a given week starting on `startDate` (a Monday). */
function buildWeekDays(startDate: string, events: GameEvent[], currentDate: string) {
  // Index events by date
  const eventsByDate = new Map<string, GameEvent[]>()
  for (const evt of events) {
    const existing = eventsByDate.get(evt.date)
    if (existing) existing.push(evt)
    else eventsByDate.set(evt.date, [evt])
  }

  const days: {
    date: string
    dayOfWeek: number
    dayNum: number
    monthShort: string
    events: GameEvent[]
    isToday: boolean
    isPast: boolean
    hasMatch: boolean
    hasMilestone: boolean
  }[] = []

  for (let i = 0; i < 7; i++) {
    const dateStr = addDays(startDate, i)
    const d = new Date(dateStr + 'T00:00:00')
    const dayEvents = eventsByDate.get(dateStr) ?? []
    days.push({
      date: dateStr,
      dayOfWeek: d.getDay(),
      dayNum: d.getDate(),
      monthShort: d.toLocaleDateString('en-AU', { month: 'short' }),
      events: dayEvents,
      isToday: dateStr === currentDate,
      isPast: dateStr < currentDate,
      hasMatch: dayEvents.some((e) => e.type === 'match'),
      hasMilestone: dayEvents.some((e) => e.type === 'milestone'),
    })
  }

  return days
}

function hashCode(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

/** Return yesterday so "today" is always the second column from the left. */
function getWeekStart(dateStr: string): string {
  return addDays(dateStr, -1)
}

type MatchupOption =
  | {
      key: string
      kind: 'match'
      round: number
      roundDate: string
      opponentId: string
      homeAway: 'home' | 'away'
      venue: string
    }
  | {
      key: string
      kind: 'bye'
      round: number
      roundDate: string
    }

function sanitizePreviewLineup(
  rawLineup: Record<string, string>,
  players: Record<string, Player>,
  clubId: string,
  interchangePlayers: number,
): Record<string, string> {
  const validSlots = new Set<string>(getLineupSlots(interchangePlayers))
  const next: Record<string, string> = {}
  const seen = new Set<string>()
  for (const [slot, playerId] of Object.entries(rawLineup)) {
    if (!validSlots.has(slot)) continue
    if (!playerId || seen.has(playerId)) continue
    const player = players[playerId]
    if (!player) continue
    if (player.clubId !== clubId) continue
    if (!canBeSelectedForAfl(player)) continue
    if (player.injury || isPlayerSuspended(player) || player.fitness < 50) continue
    next[slot] = playerId
    seen.add(playerId)
  }
  return next
}

// ---------------------------------------------------------------------------
// Schedule Slot Cell (morning / afternoon)
// ---------------------------------------------------------------------------

interface ScheduleSlotCellProps {
  slot: ScheduleSlot
  activity: TrainingFocus | 'rest' | null
  isPast: boolean
  onSelect: (activity: TrainingFocus | 'rest' | null) => void
}

function ScheduleSlotCell({ slot, activity, isPast, onSelect }: ScheduleSlotCellProps) {
  const label = slot === 'morning' ? 'AM' : 'PM'

  if (isPast) {
    // Past days: show what was scheduled (or empty), not interactive
    return (
      <div className="flex items-center gap-1 rounded px-1 py-0.5 min-h-[22px] bg-muted/30">
        <span className="text-[8px] text-muted-foreground w-4 flex-shrink-0">{label}</span>
        {activity ? (
          <span className={`text-[9px] font-medium text-white rounded px-1 ${getSlotColor(activity)}`}>
            {getSlotLabel(activity)}
          </span>
        ) : (
          <span className="text-[9px] text-muted-foreground">—</span>
        )}
      </div>
    )
  }

  // Scheduled: show pill with clear button
  if (activity) {
    return (
      <div className="flex items-center gap-1 rounded px-1 py-0.5 min-h-[22px] group">
        <span className="text-[8px] text-muted-foreground w-4 flex-shrink-0">{label}</span>
        <span className={`text-[9px] font-medium text-white rounded px-1 flex-1 truncate ${getSlotColor(activity)}`}>
          {getSlotLabel(activity)}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(null) }}
          className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    )
  }

  // Empty: show clickable add button with popover
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 rounded px-1 py-0.5 min-h-[22px] hover:bg-muted/50 transition-colors group"
        >
          <span className="text-[8px] text-muted-foreground w-4 flex-shrink-0">{label}</span>
          <Plus className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start" side="bottom">
        <p className="text-[10px] font-medium text-muted-foreground mb-1.5 px-1">
          {slot === 'morning' ? 'Morning' : 'Afternoon'} Session
        </p>
        <div className="grid grid-cols-2 gap-1">
          {TRAINING_FOCUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(opt.value) }}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-muted/50 transition-colors"
            >
              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${opt.color}`} />
              <span className="text-[11px] truncate">{opt.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const ladder = useGameStore((s) => s.ladder)
  const currentRound = useGameStore((s) => s.currentRound)
  const season = useGameStore((s) => s.season)
  const phase = useGameStore((s) => s.phase)
  const simCurrentRound = useGameStore((s) => s.simCurrentRound)
  const simToEnd = useGameStore((s) => s.simToEnd)
  const simFinalsRound = useGameStore((s) => s.simFinalsRound)
  const matchResults = useGameStore((s) => s.matchResults)
  const calendar = useGameStore((s) => s.calendar)
  const weekSchedule = useGameStore((s) => s.weekSchedule)
  const setDaySlot = useGameStore((s) => s.setDaySlot)
  const clearWeekSchedule = useGameStore((s) => s.clearWeekSchedule)
  const clearTrainingWeekPlan = useGameStore((s) => s.clearTrainingWeekPlan)
  const players = useGameStore((s) => s.players)
  const newsLog = useGameStore((s) => s.newsLog)
  const emailLog = useGameStore((s) => s.emailLog)
  const manager = useGameStore((s) => s.manager)
  const boardInstability = useGameStore((s) => s.boardInstability)
  const reserves = useGameStore((s) => s.reserves)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const selectedSubstituteId = useGameStore((s) => s.selectedSubstituteId)
  const trainingWeekPlan = useGameStore((s) => s.trainingWeekPlan)
  const currentDate = useGameStore((s) => s.currentDate)
  const simulationActive = useGameStore((s) => s.simulation.active)

  const settings = useGameStore((s) => s.settings)
  const enterOffseason = useGameStore((s) => s.enterOffseason)
  const offseasonState = useGameStore((s) => s.offseasonState)

  // Offseason sim controls
  const simHalfDay = useGameStore((s) => s.simOffseasonHalfDay)
  const simFullDay = useGameStore((s) => s.simOffseasonFullDay)
  const simToMilestone = useGameStore((s) => s.simOffseasonToMilestone)

  // Offseason derived state
  const isOffseason = phase === 'offseason'
  const offseasonDate = offseasonState?.calendarState?.currentDate ?? currentDate
  const effectiveDate = isOffseason ? offseasonDate : currentDate

  const [lastResult, setLastResult] = useState<Match | null>(null)
  const [simming, setSimming] = useState(false)
  const [premierMsg, setPremierMsg] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(() => getWeekStart(effectiveDate))

  // Auto-scroll calendar to current week when effective date changes
  useEffect(() => {
    setWeekStart(getWeekStart(effectiveDate))
  }, [effectiveDate])

  const unreadCount = useMemo(
    () => newsLog.filter((n) => !n.read).length + emailLog.filter((n) => !n.read).length,
    [newsLog, emailLog],
  )

  const club = clubs[playerClubId]
  const ladderEntry = ladder.find((e) => e.clubId === playerClubId)
  const ladderPosition = ladder.findIndex((e) => e.clubId === playerClubId) + 1

  // Migration safety net: if phase is offseason but offseasonState is missing,
  // run enterOffseason to populate it (handles old saves)
  useEffect(() => {
    if (phase === 'offseason' && !offseasonState) {
      enterOffseason()
    }
  }, [phase, offseasonState, enterOffseason])

  // User & opponent form
  const userForm = useMemo(() => computeForm(matchResults, playerClubId), [matchResults, playerClubId])

  // Next match
  const nextRound = phase === 'finals' ? null : season?.rounds?.[currentRound]
  const nextFixture = nextRound?.fixtures?.find(
    (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  )
  const opponentId = nextFixture
    ? nextFixture.homeClubId === playerClubId ? nextFixture.awayClubId : nextFixture.homeClubId
    : null
  const opponent = opponentId ? clubs[opponentId] : null
  const isHome = nextFixture?.homeClubId === playerClubId

  const opponentLadderEntry = opponentId ? ladder.find((e) => e.clubId === opponentId) : null
  const opponentLadderPosition = opponentId ? ladder.findIndex((e) => e.clubId === opponentId) + 1 : 0
  const opponentForm = useMemo(
    () => (opponentId ? computeForm(matchResults, opponentId) : []),
    [matchResults, opponentId],
  )

  // Head-to-head
  const headToHead = useMemo(() => {
    if (!opponentId) return null
    const meetings = matchResults.filter(
      (m) =>
        m.result && !m.isFinal &&
        ((m.homeClubId === playerClubId && m.awayClubId === opponentId) ||
          (m.homeClubId === opponentId && m.awayClubId === playerClubId)),
    )
    if (meetings.length === 0) return null
    const m = meetings[meetings.length - 1]
    const isUserHome = m.homeClubId === playerClubId
    return {
      userScore: isUserHome ? m.result!.homeTotalScore : m.result!.awayTotalScore,
      oppScore: isUserHome ? m.result!.awayTotalScore : m.result!.homeTotalScore,
    }
  }, [matchResults, playerClubId, opponentId])

  const isBye = ((nextRound?.byeClubIds ?? []).includes(playerClubId))
    || (nextRound && !nextFixture && phase === 'regular-season')

  const potentialMatchups = useMemo(() => {
    if (phase !== 'regular-season') return [] as MatchupOption[]
    const out: MatchupOption[] = []
    for (let idx = currentRound; idx < Math.min(season.rounds.length, currentRound + 5); idx++) {
      const round = season.rounds[idx]
      if (!round) continue
      if ((round.byeClubIds ?? []).includes(playerClubId)) {
        out.push({
          key: `bye-${idx}`,
          kind: 'bye',
          round: idx + 1,
          roundDate: getFixtureDateIso(settings.seasonStartDate, idx),
        })
        continue
      }
      const fixture = round.fixtures.find((f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId)
      if (!fixture) continue
      const oppId = fixture.homeClubId === playerClubId ? fixture.awayClubId : fixture.homeClubId
      out.push({
        key: `match-${idx}-${oppId}`,
        kind: 'match',
        round: idx + 1,
        roundDate: getFixtureDateIso(settings.seasonStartDate, idx, fixture.matchDay),
        opponentId: oppId,
        homeAway: fixture.homeClubId === playerClubId ? 'home' : 'away',
        venue: fixture.venue,
      })
    }
    return out
  }, [phase, currentRound, season.rounds, settings.seasonStartDate, playerClubId])

  // Week days for the current view
  // During offseason, inject milestone events into the week — but skip milestones
  // whose date already has a matching calendar event to avoid duplicates (e.g.
  // buildSeasonCalendar already creates offseason events (draft, trade-deadline,
  // etc.) that overlap with offseason milestones. Deduplicate by normalised title
  // and map milestone labels to the correct event type so colours match the legend.
  const effectiveEvents = useMemo(() => {
    if (!isOffseason || !offseasonState?.calendarState?.milestones) return calendar.events

    // Map milestone labels → correct GameEventType
    const labelTypeMap: Record<string, GameEventType> = {
      'National Draft': 'draft',
      'Rookie Draft': 'draft',
      'Trade Period Opens': 'trade-deadline',
      'Trade Period Closes': 'trade-deadline',
      'Free Agency Opens': 'contract-deadline',
      'Free Agency Closes': 'contract-deadline',
    }

    // Normalised titles already in calendar.events (lowercase, trimmed)
    const existingTitles = new Set(
      calendar.events.map((e) => e.title.toLowerCase().trim()),
    )

    const milestoneEvents: GameEvent[] = offseasonState.calendarState.milestones
      .filter((m) => !existingTitles.has(m.label.toLowerCase().trim()))
      .map((m) => ({
        id: m.id,
        date: m.date,
        type: labelTypeMap[m.label] ?? ('milestone' as const),
        title: m.label,
        description: `Offseason: ${m.label}`,
        resolved: m.date < effectiveDate,
      }))
    return [...calendar.events, ...milestoneEvents]
  }, [isOffseason, offseasonState?.calendarState?.milestones, calendar.events, effectiveDate])

  const weekDays = useMemo(
    () => buildWeekDays(weekStart, effectiveEvents, effectiveDate),
    [weekStart, effectiveEvents, effectiveDate],
  )

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6)
    const s = new Date(weekStart + 'T00:00:00')
    const e = new Date(end + 'T00:00:00')
    const sMonth = s.toLocaleDateString('en-AU', { month: 'short' })
    const eMonth = e.toLocaleDateString('en-AU', { month: 'short' })
    if (sMonth === eMonth) {
      return `${s.getDate()} – ${e.getDate()} ${sMonth}`
    }
    return `${s.getDate()} ${sMonth} – ${e.getDate()} ${eMonth}`
  }, [weekStart])

  // Selected date events — use effectiveEvents so offseason milestones are included
  const selectedEvents = useMemo(
    () => (selectedDate ? effectiveEvents.filter((e) => e.date === selectedDate) : []),
    [effectiveEvents, selectedDate],
  )

  // Can simulate to selected date?
  const canSimToDate = useMemo(() => {
    if (!selectedDate || phase !== 'regular-season') return false
    return selectedDate > effectiveDate
  }, [selectedDate, effectiveDate, phase])

  const handleSimToDate = () => {
    if (simulationActive) return
    if (!selectedDate || phase !== 'regular-season') return
    setSimming(true)
    setLastResult(null)
    setPremierMsg(null)

    const matchEventsToSim = calendar.events.filter(
      (e) => e.type === 'match' && !e.resolved && e.date <= selectedDate && e.data?.roundIndex !== undefined,
    )

    let lastUserMatch: Match | null = null
    for (const _evt of matchEventsToSim) {
      const state = useGameStore.getState()
      if (state.phase !== 'regular-season') break
      const { userMatch } = state.simCurrentRound()
      if (userMatch) lastUserMatch = userMatch
    }

    if (lastUserMatch) setLastResult(lastUserMatch)
    setSimming(false)
  }

  const handleSimWeek = () => {
    if (simulationActive) return
    setSimming(true)
    setLastResult(null)
    setPremierMsg(null)

    // --- Apply weekly training before match simulation ---
    const state = useGameStore.getState()
    const trainingRng = new SeededRNG(state.rngSeed + state.currentRound * 5003)

    // User's club: convert scheduled slots to TrainingSession[]
    const userClubPlayers: Record<string, Player> = {}
    for (const [pid, p] of Object.entries(state.players)) {
      if (p.clubId === state.playerClubId) userClubPlayers[pid] = p
    }
    const userClubStaff: Record<string, StaffMember> = {}
    for (const [sid, s] of Object.entries(state.staff)) {
      if (s.clubId === state.playerClubId) userClubStaff[sid] = s
    }
    const userFacilities = state.clubs[state.playerClubId]?.facilities

    // Build sessions: prefer enhanced training plan, fall back to weekSchedule
    let userSessions: TrainingSession[]
    if (state.trainingWeekPlan && Object.keys(state.trainingWeekPlan.slots).length > 0) {
      userSessions = weekPlanToSessions(state.trainingWeekPlan)
    } else {
      userSessions = []
      let sessionCounter = 0
      for (const [_dateStr, daySched] of Object.entries(state.weekSchedule)) {
        for (const slot of ['morning', 'afternoon'] as const) {
          const activity = daySched[slot]
          if (activity && activity !== 'rest') {
            userSessions.push({
              id: `user-sched-${sessionCounter++}`,
              focus: activity,
              intensity: slot === 'morning' ? 'moderate' : 'light',
              assignedCoachId: null,
              assignedPlayerIds: [],
            })
          }
        }
      }
    }

    // Apply user training (if any sessions scheduled)
    if (userSessions.length > 0 && userFacilities) {
      const userClub = state.clubs[state.playerClubId]
      const userBudget = userClub ? getClubBudgetAllocation(userClub) : undefined
      const userTrainingBudgetMul = userBudget
        ? (getBudgetMultiplier(userBudget, 'facilities') + getBudgetMultiplier(userBudget, 'coaching')) / 2
        : undefined
      const userResults = runTrainingSessions(userClubPlayers, userSessions, userClubStaff, userFacilities, trainingRng, userTrainingBudgetMul)
      // Apply results to the store's players
      useGameStore.setState((s) => {
        applyTrainingResults(s.players, userResults)
        const clubPlayersForUpskill: Record<string, Player> = {}
        for (const [pid, p] of Object.entries(s.players)) {
          if (p.clubId === s.playerClubId) clubPlayersForUpskill[pid] = p
        }
        const completions = advanceClubUpskilling(
          clubPlayersForUpskill,
          userSessions,
          userClubStaff,
          trainingRng,
          s.currentRound,
          s.currentDate,
        )
        for (const completion of completions) {
          const player = s.players[completion.playerId]
          if (!player) continue

          let targetLabel = completion.targetLabel
          if (completion.type === 'position') {
            const pos = completion.targetLabel as PlayerPositionType
            targetLabel = POSITION_LABELS[pos] ?? completion.targetLabel
          } else {
            targetLabel = PLAYER_TRAINING_FOCUS_LABELS[completion.targetLabel as keyof typeof PLAYER_TRAINING_FOCUS_LABELS] ?? completion.targetLabel
          }

          const baseNews = applyMediaCoverage({
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${player.firstName} ${player.lastName} completed ${targetLabel} upskilling`,
            body: completion.type === 'position'
              ? `${player.firstName} ${player.lastName} has completed position upskilling for ${targetLabel}. Review line-up flexibility and secondary role usage.`
              : `${player.firstName} ${player.lastName} has completed ${targetLabel} skill upskilling and received a targeted attribute boost.`,
            category: 'milestone',
            clubIds: [s.playerClubId],
            playerIds: [player.id],
          })
          if (!s.newsLog.some((item) => item.id === baseNews.id)) {
            s.newsLog.push(baseNews)
          }
          for (const derived of deriveMediaStories(baseNews)) {
            if (!s.newsLog.some((item) => item.id === derived.id)) {
              s.newsLog.push(derived)
            }
          }
        }
      })
    }

    // AI clubs: apply default training
    const clubIds = Object.keys(state.clubs)
    for (const cid of clubIds) {
      if (cid === state.playerClubId) continue
      const aiPlayers: Record<string, Player> = {}
      for (const [pid, p] of Object.entries(state.players)) {
        if (p.clubId === cid) aiPlayers[pid] = p
      }
      const aiStaff: Record<string, StaffMember> = {}
      for (const [sid, s] of Object.entries(state.staff)) {
        if (s.clubId === cid) aiStaff[sid] = s
      }
      const aiFacilities = state.clubs[cid]?.facilities
      if (!aiFacilities) continue

      const aiRng = new SeededRNG(state.rngSeed + state.currentRound * 5003 + hashCode(cid))
      const defaultWeek = getDefaultTrainingWeek()
      const aiClubObj = state.clubs[cid]
      const aiBudget = aiClubObj ? getClubBudgetAllocation(aiClubObj) : undefined
      const aiTrainingBudgetMul = aiBudget
        ? (getBudgetMultiplier(aiBudget, 'facilities') + getBudgetMultiplier(aiBudget, 'coaching')) / 2
        : undefined
      const aiResults = runTrainingSessions(aiPlayers, defaultWeek.sessions, aiStaff, aiFacilities, aiRng, aiTrainingBudgetMul)
      useGameStore.setState((s) => {
        applyTrainingResults(s.players, aiResults)
        const aiPlayersForUpskill: Record<string, Player> = {}
        for (const [pid, p] of Object.entries(s.players)) {
          if (p.clubId === cid) aiPlayersForUpskill[pid] = p
        }
        advanceClubUpskilling(
          aiPlayersForUpskill,
          defaultWeek.sessions,
          aiStaff,
          aiRng,
          s.currentRound,
          s.currentDate,
        )
      })
    }

    // Clear the week schedule and training plan
    clearWeekSchedule()
    clearTrainingWeekPlan()

    // --- Now simulate the round ---
    if (phase === 'regular-season') {
      const { userMatch } = simCurrentRound()
      setLastResult(userMatch)
    } else if (phase === 'finals') {
      const { userMatch, seasonOver } = simFinalsRound()
      setLastResult(userMatch)
      if (seasonOver) {
        const news = useGameStore.getState().newsLog
        const premNews = news.find((n) => n.headline.includes('Premiership'))
        if (premNews) setPremierMsg(premNews.headline)
      }
    }

    setSimming(false)
  }

  const handleSimToEnd = () => {
    if (simulationActive) return
    setSimming(true)
    setLastResult(null)
    simToEnd()
    setSimming(false)
  }

  const handleAutoFillTraining = () => {
    // Rotation of focuses the assistant coach picks, balanced across position groups
    const rotation: (TrainingFocus | 'rest')[] = [
      'match-fitness', 'contested', 'kicking', 'defensive',
      'offensive', 'game-sense', 'physical', 'mental',
      'marking', 'handball', 'set-pieces', 'ruck',
    ]

    let rotIndex = 0
    for (const day of weekDays) {
      if (day.hasMatch || (day.isPast && !day.isToday)) continue

      // Morning: training from rotation
      const morningFocus = rotation[rotIndex % rotation.length]
      setDaySlot(day.date, 'morning', morningFocus)
      rotIndex++

      // Afternoon: lighter session or recovery
      // Every 3rd day gets recovery, rest get a different focus
      if (rotIndex % 3 === 0) {
        setDaySlot(day.date, 'afternoon', 'recovery')
      } else {
        const afternoonFocus = rotation[rotIndex % rotation.length]
        setDaySlot(day.date, 'afternoon', afternoonFocus)
        rotIndex++
      }
    }
  }

  const seasonComplete = phase === 'post-season'

  // Next event context for the subtitle
  const nextEvent = useMemo(() => getNextEvent(calendar), [calendar])

  // Next match date derived from the season start and round schedule
  const nextMatchDate = useMemo(() => {
    if (phase === 'finals' || phase === 'post-season') return null
    if (!nextFixture) return null
    return getFixtureDateIso(settings.seasonStartDate, currentRound, nextFixture.matchDay)
  }, [settings.seasonStartDate, currentRound, phase, nextFixture])

  const daysToNextMatch = useMemo(() => {
    if (!nextMatchDate) return null
    const now = new Date(effectiveDate + 'T00:00:00').getTime()
    const then = new Date(nextMatchDate + 'T00:00:00').getTime()
    return Math.max(0, Math.round((then - now) / 86_400_000))
  }, [effectiveDate, nextMatchDate])

  // Pending actions
  // Training schedule summary
  const scheduleSummary = useMemo(() => {
    const sessions: { focus: TrainingFocus | 'rest'; slot: 'morning' | 'afternoon' }[] = []
    for (const [_dateStr, daySched] of Object.entries(weekSchedule)) {
      for (const slot of ['morning', 'afternoon'] as const) {
        const activity = daySched[slot]
        if (activity) {
          sessions.push({ focus: activity, slot })
        }
      }
    }
    if (sessions.length === 0) return null

    const trainingSessions = sessions.filter((s) => s.focus !== 'rest')
    const restCount = sessions.filter((s) => s.focus === 'rest').length

    // Fatigue
    let totalFatigue = 0
    for (const s of sessions) {
      if (s.focus === 'rest') continue
      totalFatigue += SLOT_FATIGUE[s.slot]
      if (s.focus === 'recovery') totalFatigue -= SLOT_FATIGUE[s.slot] * 0.5
    }

    let fatigueLevel: 'low' | 'moderate' | 'high' | 'extreme'
    if (totalFatigue <= 10) fatigueLevel = 'low'
    else if (totalFatigue <= 25) fatigueLevel = 'moderate'
    else if (totalFatigue <= 45) fatigueLevel = 'high'
    else fatigueLevel = 'extreme'

    // Injury risk
    const hasRecovery = sessions.some((s) => s.focus === 'recovery')
    const moderateSessions = sessions.filter((s) => s.slot === 'morning' && s.focus !== 'rest').length
    let injuryRisk: 'low' | 'moderate' | 'elevated'
    if (moderateSessions >= 4 && !hasRecovery) injuryRisk = 'elevated'
    else if (moderateSessions >= 3 && !hasRecovery) injuryRisk = 'moderate'
    else injuryRisk = 'low'

    // Broad skill areas being developed
    const skillAreas = new Set<SkillArea>()
    for (const s of trainingSessions) {
      skillAreas.add(FOCUS_SKILL_AREA[s.focus as TrainingFocus])
    }

    // Position groups targeted
    const groupSet = new Set<PositionGroup>()
    for (const s of trainingSessions) {
      for (const g of FOCUS_POSITION_GROUPS[s.focus as TrainingFocus]) {
        groupSet.add(g)
      }
    }
    const hitsAll = groupSet.has('All')
    const specificGroups = (['Forwards', 'Midfielders', 'Defenders', 'Rucks'] as PositionGroup[])
      .filter((g) => groupSet.has(g))

    return {
      training: trainingSessions.length,
      rest: restCount,
      totalFatigue: Math.round(totalFatigue),
      fatigueLevel,
      injuryRisk,
      skillAreas: Array.from(skillAreas),
      hitsAll,
      specificGroups,
    }
  }, [weekSchedule])

  const clubPlayers = useMemo(
    () => Object.values(players).filter((p) => p.clubId === playerClubId),
    [players, playerClubId],
  )

  const seniorPlayers = useMemo(
    () => clubPlayers.filter((p) => p.listStatus !== 'reserves'),
    [clubPlayers],
  )
  const reservePlayers = useMemo(
    () => clubPlayers.filter((p) => p.listStatus === 'reserves'),
    [clubPlayers],
  )
  const injuredPlayers = useMemo(
    () => clubPlayers.filter((p) => Boolean(p.injury)),
    [clubPlayers],
  )
  const suspendedPlayers = useMemo(
    () => clubPlayers.filter((p) => isPlayerSuspended(p)),
    [clubPlayers],
  )

  const selectedLineupIds = useMemo(
    () => new Set(Object.values(selectedLineup ?? {}).filter((id): id is string => Boolean(id))),
    [selectedLineup],
  )

  const availablePlayers = useMemo(
    () => clubPlayers.filter((p) => !p.injury && !isPlayerSuspended(p)),
    [clubPlayers],
  )
  const availableNotSelected = useMemo(
    () => availablePlayers.filter((p) => !selectedLineupIds.has(p.id)),
    [availablePlayers, selectedLineupIds],
  )

  const avgFitness = useMemo(
    () => (clubPlayers.length ? Math.round(clubPlayers.reduce((sum, p) => sum + p.fitness, 0) / clubPlayers.length) : 0),
    [clubPlayers],
  )
  const avgFatigue = useMemo(
    () => (clubPlayers.length ? Math.round(clubPlayers.reduce((sum, p) => sum + p.fatigue, 0) / clubPlayers.length) : 0),
    [clubPlayers],
  )
  const avgMorale = useMemo(
    () => (clubPlayers.length ? Math.round(clubPlayers.reduce((sum, p) => sum + p.morale, 0) / clubPlayers.length) : 0),
    [clubPlayers],
  )
  const avgForm = useMemo(
    () => (clubPlayers.length ? Math.round(clubPlayers.reduce((sum, p) => sum + p.form, 0) / clubPlayers.length) : 0),
    [clubPlayers],
  )

  const youngCoreCount = useMemo(() => clubPlayers.filter((p) => p.age <= 22).length, [clubPlayers])
  const veteranCount = useMemo(() => clubPlayers.filter((p) => p.age >= 30).length, [clubPlayers])

  const salaryCapAmount = settings.salaryCapAmount
  const softCapEnabled = settings.realism.softCapSpending
  const totalSpend = useMemo(
    () => calculateClubSalaryTotal(clubPlayers, playerClubId),
    [clubPlayers, playerClubId],
  )
  const capRatio = salaryCapAmount > 0 ? totalSpend / salaryCapAmount : 0
  const effectiveCap = softCapEnabled ? salaryCapAmount * 1.1 : salaryCapAmount
  const capSpace = Math.round(effectiveCap - totalSpend)
  const luxuryTax = useMemo(
    () => (softCapEnabled ? calculateLuxuryTax(clubPlayers, playerClubId, salaryCapAmount) : 0),
    [softCapEnabled, clubPlayers, playerClubId, salaryCapAmount],
  )

  const jobSecurity = Math.round(manager.jobSecurity)
  const boardStatus = jobSecurity >= 75
    ? 'Stable'
    : jobSecurity >= 55
      ? 'Watch'
      : jobSecurity >= 35
        ? 'Under Pressure'
        : 'Critical'

  const boardStatusClass = jobSecurity >= 75
    ? 'text-green-400'
    : jobSecurity >= 55
      ? 'text-yellow-400'
      : jobSecurity >= 35
        ? 'text-orange-400'
        : 'text-red-400'

  const upcomingWeekEvents = useMemo(() => {
    const weekEnd = addDays(effectiveDate, 6)
    return effectiveEvents.filter((e) => e.date >= effectiveDate && e.date <= weekEnd)
  }, [effectiveEvents, effectiveDate])

  const deadlineCountdowns = useMemo(
    () => getDeadlineCountdowns(effectiveEvents, effectiveDate, 5),
    [effectiveEvents, effectiveDate],
  )
  const urgentDeadlineCount = deadlineCountdowns.filter((d) => d.urgency === 'urgent').length

  const scheduledSlotCount = useMemo(() => {
    let count = 0
    for (const day of Object.values(weekSchedule)) {
      if (day.morning) count++
      if (day.afternoon) count++
    }
    return count
  }, [weekSchedule])

  const plannedGroupCount = useMemo(() => {
    if (!trainingWeekPlan) return 0
    let count = 0
    for (const day of Object.values(trainingWeekPlan.slots)) {
      count += day.morning.groups.length + day.afternoon.groups.length
    }
    return count
  }, [trainingWeekPlan])

  const reservesTopRating = useMemo(() => {
    const ownPerformances = reserves.lastRoundPerformances
      .filter((p) => p.clubId === playerClubId)
      .sort((a, b) => b.rating - a.rating)
    return ownPerformances[0]?.rating ?? null
  }, [reserves.lastRoundPerformances, playerClubId])

  const expiringContractsCount = useMemo(
    () => clubPlayers.filter((p) => p.contract.yearsRemaining <= 1).length,
    [clubPlayers],
  )
  const rookieCount = useMemo(
    () => clubPlayers.filter((p) => p.isRookie).length,
    [clubPlayers],
  )
  const facilitiesAverage = useMemo(() => {
    const f = club?.facilities
    if (!f) return 0
    const vals = [f.trainingGround, f.gym, f.medicalCentre, f.recoveryPool, f.analysisSuite, f.youthAcademy]
    return vals.reduce((sum, v) => sum + v, 0) / vals.length
  }, [club?.facilities])

  const finalsQualifyingTeams = useMemo(() => {
    const finals = getFinalsFormatById(settings.finals.finalsFormat, settings.finals.customFinalsFormat)
    const fallback = settings.finals.finalsQualifyingTeams
    const count = finals.qualifyingTeams ?? fallback
    return Math.max(0, Math.min(ladder.length, count))
  }, [settings.finals, ladder.length])

  const hasTop4FinalsAdvantage = useMemo(() => {
    const finals = getFinalsFormatById(settings.finals.finalsFormat, settings.finals.customFinalsFormat)
    return hasTopFourDoubleChanceAdvantage(finals)
  }, [settings.finals])


  return (
    <div className="space-y-6">
      {/* Header + Date + Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div
            className="h-12 w-12 rounded-full"
            style={{ backgroundColor: club?.colors.primary ?? '#666' }}
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{club?.fullName}</h1>
              <Button size="sm" className="h-7 px-3">
                Dashboard
              </Button>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-3" onClick={() => navigate('/inbox')}>
                <Mail className="h-3.5 w-3.5" />
                Inbox
                {unreadCount > 0 && (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                    {unreadCount}
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => navigate('/game-settings')}
                aria-label="Open game settings"
              >
                <Cog className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-muted-foreground">
              {isOffseason ? (
                <>Offseason · {offseasonState ? getOffseasonPhaseLabel(offseasonState.currentPhase) : 'In Progress'}</>
              ) : seasonComplete ? (
                <>Season Complete</>
              ) : phase === 'finals' ? (
                <>{club?.homeGround} · Finals Week {season.finalsRounds.length + 1}</>
              ) : (
                <>
                  {club?.homeGround}
                  {nextMatchDate && (
                    <span className="ml-2 text-sm">
                      · Next match {formatDate(nextMatchDate)}
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {isOffseason ? 'Offseason Date' : 'Game Date'}
            </p>
            <p className="text-lg font-bold">{formatDate(effectiveDate)}</p>
            <p className="text-xs text-muted-foreground">
              {isOffseason && offseasonState?.calendarState
                ? formatOffseasonDateTime(offseasonState.calendarState)
                : nextFixture
                  ? `${nextFixture.matchDay} ${nextFixture.scheduledTime} · ${daysToNextMatch === null ? 'TBC' : daysToNextMatch === 0 ? 'Game day' : `${daysToNextMatch} day${daysToNextMatch === 1 ? '' : 's'} to match`}`
                  : `Round ${currentRound + 1} of ${season.rounds.length}`
              }
            </p>
          </div>
          {isOffseason ? (
            /* Offseason sim controls */
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-1">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="lg" className="h-11 px-3.5" onClick={simHalfDay}>
                        <Play className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sim Half Day</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="lg" variant="outline" className="h-11 px-3.5" onClick={simFullDay}>
                        <FastForward className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sim Full Day</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="lg" variant="outline" className="h-11 px-3.5" onClick={simToMilestone}>
                        <SkipForward className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sim to Next Milestone</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          ) : !seasonComplete ? (
            <div className="flex flex-col items-end gap-1">
              <Button
                size="lg"
                className="h-11 px-5 text-base font-bold"
                onClick={handleSimWeek}
                disabled={simming || simulationActive}
              >
                <Play className="mr-2 h-5 w-5" />
                Continue
              </Button>
              {nextEvent && (
                <span className="text-[10px] text-muted-foreground">
                  Next: {nextEvent.title}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Premier message */}
      {premierMsg && (
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardContent className="py-4 text-center">
            <Trophy className="mx-auto h-8 w-8 text-yellow-500 mb-2" />
            <p className="text-lg font-bold">{premierMsg}</p>
          </CardContent>
        </Card>
      )}

      {/* Week Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">{weekLabel}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6"
                onClick={() => setWeekStart(getWeekStart(effectiveDate))}
              >
                Today
              </Button>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const isSelected = day.date === selectedDate
              const daySchedule = weekSchedule[day.date]
              const isPastDay = day.isPast && !day.isToday

              return (
                <div
                  key={day.date}
                  onClick={() => setSelectedDate(day.date === selectedDate ? null : day.date)}
                  className={`
                    rounded-lg text-left transition-colors border min-h-[84px]
                    flex flex-col cursor-pointer
                    ${day.isToday
                      ? 'border-primary border-2 bg-primary/20 ring-2 ring-primary/50 shadow-lg shadow-primary/25'
                      : isSelected
                        ? 'border-accent-foreground/30 bg-accent'
                        : day.hasMatch
                          ? 'border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10'
                          : day.hasMilestone
                            ? 'border-pink-500/40 bg-pink-500/5 hover:bg-pink-500/10'
                            : 'border-border hover:bg-accent/50'
                    }
                    ${isPastDay ? 'opacity-40' : ''}
                  `}
                >
                  {/* Day header */}
                  <div className="flex items-baseline justify-between w-full px-2 pt-1.5">
                    <span className={`text-[10px] font-medium ${day.isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                      {day.isToday ? 'TODAY' : SHORT_DAY_NAMES[day.dayOfWeek]}
                    </span>
                    <span className={`text-lg font-bold leading-none ${day.isToday ? 'text-primary' : ''}`}>
                      {day.dayNum}
                      {day.dayNum === 1 && (
                        <span className="text-[9px] font-normal text-muted-foreground ml-0.5">
                          {day.monthShort}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Day content: events, training slots, or offseason overlay */}
                  {day.events.some((e) => e.type !== 'training') ? (
                    <div className="flex flex-col gap-0.5 my-auto w-full px-1.5">
                      {day.events.filter((e) => e.type !== 'training').map((evt) => (
                        <div
                          key={evt.id}
                          className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-white ${EVENT_COLORS[evt.type]}`}
                        >
                          <span className="truncate">{evt.title}</span>
                        </div>
                      ))}
                    </div>
                  ) : isOffseason ? (
                    /* Offseason: show phase overlay instead of training */
                    <div className="flex flex-col flex-1 px-1.5 pb-1.5 mt-1">
                      <OffseasonCalendarOverlay
                        date={day.date}
                        milestones={offseasonState?.calendarState?.milestones ?? []}
                        currentPhase={offseasonState?.currentPhase ?? 'season-end'}
                      />
                    </div>
                  ) : (
                    /* Non-match day: morning/afternoon slots */
                    <div className="flex flex-col flex-1 gap-0.5 px-1.5 pb-1.5 mt-1">
                      <ScheduleSlotCell
                        slot="morning"
                        activity={daySchedule?.morning ?? null}
                        isPast={isPastDay}
                        onSelect={(activity) => setDaySlot(day.date, 'morning', activity)}
                      />
                      <ScheduleSlotCell
                        slot="afternoon"
                        activity={daySchedule?.afternoon ?? null}
                        isPast={isPastDay}
                        onSelect={(activity) => setDaySlot(day.date, 'afternoon', activity)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
            {isOffseason ? (
              <>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-pink-500" />
                  <span>Milestone</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-purple-500" />
                  <span>Trade</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span>Draft</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <span>Match</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span>Training</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-orange-500" />
                  <span>Other</span>
                </div>
              </>
            )}
            <div className="ml-auto flex items-center gap-3">
              {!isOffseason && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={handleAutoFillTraining}
                >
                  <ClipboardList className="mr-1 h-3 w-3" />
                  Assistant Coach Sets Training
                </Button>
              )}
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto text-xs"
                onClick={() => navigate(isOffseason ? '/offseason' : '/calendar')}
              >
                {isOffseason ? 'View Offseason' : 'Full Calendar'} <ArrowRight className="ml-0.5 h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Selected date detail */}
          {selectedDate && (
            <div className="mt-3 border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">{formatDate(selectedDate)}</p>
                {canSimToDate && (
                  <Button size="sm" onClick={handleSimToDate} disabled={simming || simulationActive}>
                    <FastForward className="mr-1 h-3.5 w-3.5" />
                    Simulate To
                  </Button>
                )}
              </div>
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No events on this day.</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedEvents.map((evt) => (
                    <div key={evt.id} className="flex items-start gap-2">
                      <div className={`h-2 w-2 rounded-full mt-1 flex-shrink-0 ${EVENT_COLORS[evt.type]}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{evt.title}</p>
                        {evt.description && (
                          <p className="text-xs text-muted-foreground">{evt.description}</p>
                        )}
                        <Badge
                          variant={evt.resolved ? 'secondary' : 'outline'}
                          className="text-[10px] mt-0.5"
                        >
                          {evt.resolved ? 'Completed' : 'Upcoming'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Priority Row: Match Focus + Decision Support */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8">
          {isOffseason ? (
            <OffseasonPhaseCard />
          ) : (
            <MatchupCard
              phase={phase}
              seasonComplete={seasonComplete}
              currentRound={currentRound}
              totalRounds={season.rounds.length}
              finalsWeek={season.finalsRounds.length + 1}
              isBye={!!isBye}
              nextFixture={nextFixture ?? null}
              club={club}
              opponent={opponent}
              isHome={isHome}
              opponentLadderPosition={opponentLadderPosition}
              opponentLadderEntry={opponentLadderEntry ?? null}
              opponentForm={opponentForm}
          ladderPosition={ladderPosition}
          matchDay={nextFixture?.matchDay ?? null}
          nextMatchDate={nextMatchDate}
          currentDate={effectiveDate}
          simming={simming || simulationActive}
              onSimWeek={handleSimWeek}
              onSimToEnd={handleSimToEnd}
              onEnterOffseason={enterOffseason}
              userForm={userForm}
              userLadderEntry={ladderEntry ?? null}
              headToHead={headToHead}
              playerClubId={playerClubId}
              players={players}
              clubs={clubs}
              selectedLineup={selectedLineup}
              selectedSubstituteId={selectedSubstituteId}
              interchangePlayers={settings.matchRules.interchangePlayers}
              substitutesEnabled={settings.matchRules.enableSubstitutes}
              potentialMatchups={potentialMatchups}
            />
          )}
        </div>
        <div className="xl:col-span-4 space-y-4">
          {isOffseason ? (
            <PhaseProgressCard />
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ladder Position</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-4xl font-bold">
                    {ladderPosition > 0 ? `${ladderPosition}${ordinal(ladderPosition)}` : '-'}
                  </div>
                  {ladderEntry ? (
                    <div className="mt-2.5 space-y-1 text-sm text-muted-foreground">
                      <p>
                        <span className="font-semibold text-foreground">{ladderEntry.points}</span> pts
                        {' · '}
                        <span className="font-semibold text-foreground">{ladderEntry.percentage.toFixed(1)}%</span>
                      </p>
                      <p>{ladderEntry.pointsFor} PF / {ladderEntry.pointsAgainst} PA</p>
                      <p>{ladderEntry.wins}W {ladderEntry.draws}D {ladderEntry.losses}L</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Season not started</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          <RecommendedActions />
          {/* Club Finances Card */}
          {club && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Club Finances</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Balance</span>
                    <span className={`font-semibold ${club.finances.balance < 0 ? 'text-red-500' : ''}`}>
                      {formatMoneyShort(club.finances.balance)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Season P&L</span>
                    <span className={`font-semibold ${
                      club.finances.seasonPnL != null
                        ? club.finances.seasonPnL >= 0
                          ? 'text-green-500'
                          : 'text-red-500'
                        : ''
                    }`}>
                      {club.finances.seasonPnL != null
                        ? `${club.finances.seasonPnL >= 0 ? '+' : ''}${formatMoneyShort(club.finances.seasonPnL)}`
                        : 'In progress'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Revenue Trend</span>
                    <span className="font-semibold">
                      {(() => {
                        const m = club.finances.momentumModifier ?? 0
                        if (m > 0.05) return 'Rising'
                        if (m < -0.03) return 'Declining'
                        return 'Stable'
                      })()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {/* Media Pressure Card */}
          {club && (() => {
            const pressure = club.mediaPressure
            const score = pressure?.score ?? 0
            const label = getMediaPressureLabel(score)
            const barColor = getPressureBarColor(label)
            const textColor = getPressureLabelColor(label)
            const trend = pressure ? getPressureTrend(pressure) : 'stable'
            const moraleEffect = getMediaPressureMoraleEffect(score)
            const TrendIcon = trend === 'rising' ? TrendingUp : trend === 'falling' ? TrendingDown : Minus
            const stories = pressure?.activeStories ?? []
            const recentStories = [...stories].reverse().slice(0, 3)

            return (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Media Pressure</CardTitle>
                  <Newspaper className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${textColor}`}>{label}</span>
                    <div className="flex items-center gap-1">
                      <TrendIcon className={`h-3.5 w-3.5 ${trend === 'rising' ? 'text-red-500' : trend === 'falling' ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <span className="text-xs font-mono text-muted-foreground">{score}/100</span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  {moraleEffect !== 0 && (
                    <p className="text-[11px] text-red-500">
                      Squad morale: {moraleEffect}/round
                    </p>
                  )}
                  {recentStories.length > 0 ? (
                    <div className="space-y-1 pt-1">
                      {recentStories.map((s) => (
                        <p key={s.id} className="text-[10px] text-muted-foreground leading-snug truncate">
                          · {s.headline}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">No active stories</p>
                  )}
                </CardContent>
              </Card>
            )
          })()}
          <ClubListNeedsCard />
        </div>
      </div>

      {/* Secondary: Ladder + Hub */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Ladder Snapshot</CardTitle>
              <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => navigate('/ladder')}>
                Full Ladder <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              {hasTop4FinalsAdvantage && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-cyan-500/60" />
                  Top 4
                </span>
              )}
              {finalsQualifyingTeams > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-emerald-500/50" />
                  Finals
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
              {ladder.map((entry, i) => {
                const ladderClub = clubs[entry.clubId]
                const isPlayer = entry.clubId === playerClubId
                const inFinalsZone = i < finalsQualifyingTeams
                const inTop4Zone = hasTop4FinalsAdvantage && i < 4
                const inLowerFinalsZone = inFinalsZone && !inTop4Zone
                const isTop4CutLine = hasTop4FinalsAdvantage && i === 3
                const isFinalsCutLine = finalsQualifyingTeams > 0 && i === finalsQualifyingTeams - 1
                return (
                  <div
                    key={entry.clubId}
                    className={`flex items-center justify-between rounded px-3 py-1 text-sm ${
                      inTop4Zone ? 'bg-cyan-500/12' : ''
                    } ${
                      inLowerFinalsZone ? 'bg-emerald-500/5' : ''
                    } ${isPlayer ? 'bg-accent font-semibold' : ''} ${
                      isTop4CutLine ? 'border-b-2 border-dashed border-cyan-500/50' : ''
                    } ${
                      isFinalsCutLine ? 'border-b-2 border-dashed border-emerald-500/40' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-right text-muted-foreground">{i + 1}</span>
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: ladderClub?.colors.primary }}
                      />
                      <span>{ladderClub?.abbreviation}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{entry.wins}-{entry.draws}-{entry.losses}</span>
                      <span className="w-12 text-right">{entry.percentage.toFixed(1)}%</span>
                      <Badge variant="secondary" className="w-8 justify-center">
                        {entry.points}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Training Overview</CardTitle>
            <p className="text-xs text-muted-foreground">
              Weekly load, risk, and focus coverage for your high performance staff.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {isOffseason ? (
              <div className="rounded border px-3 py-2 text-xs text-muted-foreground">
                Offseason mode: run sessions from the offseason planner.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border px-2 py-1.5">
                  <p className="text-muted-foreground">Scheduled Slots</p>
                  <p className="font-semibold">{scheduledSlotCount}</p>
                </div>
                <div className="rounded border px-2 py-1.5">
                  <p className="text-muted-foreground">Training Groups</p>
                  <p className="font-semibold">{plannedGroupCount}</p>
                </div>
                <div className="rounded border px-2 py-1.5">
                  <p className="text-muted-foreground">Weekly Load</p>
                  <p className="font-semibold">
                    {scheduleSummary ? scheduleSummary.fatigueLevel : 'Not set'}
                  </p>
                </div>
                <div className="rounded border px-2 py-1.5">
                  <p className="text-muted-foreground">Injury Risk</p>
                  <p className="font-semibold">
                    {scheduleSummary ? scheduleSummary.injuryRisk : 'Not set'}
                  </p>
                </div>
                <div className="rounded border px-2 py-1.5 col-span-2">
                  <p className="text-muted-foreground">Focus Areas</p>
                  <p className="font-semibold truncate">
                    {scheduleSummary && scheduleSummary.skillAreas.length > 0
                      ? scheduleSummary.skillAreas.join(', ')
                      : 'No focus areas configured'}
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/training')}>
                Open Planner
              </Button>
              {!isOffseason && (
                <Button variant="outline" size="sm" onClick={handleAutoFillTraining}>
                  Auto-fill Week
                </Button>
              )}
              {isOffseason && (
                <Button variant="outline" size="sm" onClick={() => navigate('/offseason')}>
                  Open Offseason
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => navigate('/lineup')}>
                Review Selection
              </Button>
            </div>
            {!isOffseason && (
              <div className="text-xs text-muted-foreground">
                Week events in next 7 days: {upcomingWeekEvents.length}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Compact club intelligence cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => navigate('/squad')}>
          <CardContent className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Team Pulse</p>
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">{clubPlayers.length} listed</p>
            <p className="text-xs text-muted-foreground">
              {seniorPlayers.length} senior · {reservePlayers.length} reserves
            </p>
            <p className="text-xs text-muted-foreground">
              Avg fit {avgFitness} · form {avgForm} · morale {avgMorale}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => navigate('/salary-cap')}>
          <CardContent className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Salary Cap</p>
              <Scale className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">{(capRatio * 100).toFixed(1)}% used</p>
            <p className="text-xs text-muted-foreground">
              {formatMoneyShort(totalSpend)} / {formatMoneyShort(salaryCapAmount)}
            </p>
            <p className="text-xs text-muted-foreground">
              {capSpace >= 0 ? `${formatMoneyShort(capSpace)} space` : `${formatMoneyShort(Math.abs(capSpace))} over`}
              {luxuryTax > 0 ? ` · Tax ${formatMoneyShort(luxuryTax)}` : ''}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => navigate('/club')}>
          <CardContent className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Board Room</p>
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className={`text-sm font-semibold ${boardStatusClass}`}>{boardStatus} ({jobSecurity}%)</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{manager.seasonExpectation}</p>
            {settings.realism.boardPolitics && boardInstability && (
              <div className="flex items-center gap-2 pt-0.5">
                <div
                  className={`h-1.5 rounded-full flex-1 ${
                    boardInstability.score >= 70 ? 'bg-red-500'
                    : boardInstability.score >= 50 ? 'bg-amber-500'
                    : boardInstability.score >= 30 ? 'bg-yellow-500'
                    : 'bg-green-500/70'
                  }`}
                  style={{ width: `${boardInstability.score}%`, maxWidth: '100%' }}
                />
                <span className={`text-[10px] font-medium ${
                  boardInstability.score >= 70 ? 'text-red-400'
                  : boardInstability.score >= 50 ? 'text-amber-400'
                  : boardInstability.score >= 30 ? 'text-yellow-400'
                  : 'text-green-400'
                }`}>
                  {boardInstability.score >= 70 ? 'High pressure'
                  : boardInstability.score >= 50 ? 'Elevated'
                  : boardInstability.score >= 30 ? 'Moderate'
                  : 'Stable'}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => navigate('/contracts')}>
          <CardContent className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Contract Watch</p>
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">{expiringContractsCount} expiring</p>
            <p className="text-xs text-muted-foreground">Deals ending this season</p>
            <p className="text-xs text-muted-foreground">Review before trade and free agency</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => navigate('/club')}>
          <CardContent className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Facilities</p>
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">{facilitiesAverage.toFixed(1)} / 5.0 average</p>
            <p className="text-xs text-muted-foreground">
              Training {club?.facilities.trainingGround ?? '-'} · Medical {club?.facilities.medicalCentre ?? '-'}
            </p>
            <p className="text-xs text-muted-foreground">
              Recovery {club?.facilities.recoveryPool ?? '-'} · Academy {club?.facilities.youthAcademy ?? '-'}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => navigate('/reserves')}>
          <CardContent className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reserves</p>
              <Gamepad2 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">
              {reserves.delegationEnabled ? 'Delegated' : 'Manual control'}
            </p>
            <p className="text-xs text-muted-foreground">
              Watchlist {reserves.promotionWatchlist.length} · lineup {reserves.managedLineupPlayerIds.length}/23
            </p>
            <p className="text-xs text-muted-foreground">
              Top reserves rating {reservesTopRating ? reservesTopRating.toFixed(1) : '-'}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => navigate('/lineup')}>
          <CardContent className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Selection Status</p>
              <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">{availablePlayers.length} available</p>
            <p className="text-xs text-muted-foreground">
              Injured {injuredPlayers.length} · Suspended {suspendedPlayers.length}
            </p>
            <p className="text-xs text-muted-foreground">
              Unselected available {availableNotSelected.length} · avg fatigue {avgFatigue}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => navigate('/squad')}>
          <CardContent className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">List Mix</p>
              <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">
              Youth {youngCoreCount} · vets {veteranCount}
            </p>
            <p className="text-xs text-muted-foreground">
              List limits: {seniorPlayers.length}/{settings.listRules.seniorListSize} senior
            </p>
            <p className="text-xs text-muted-foreground">
              Rookies {rookieCount}/{settings.listRules.rookieListSize}
            </p>
          </CardContent>
        </Card>
      </div>
      {/* Upcoming Deadlines */}
      {deadlineCountdowns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">Upcoming Deadlines</CardTitle>
              {urgentDeadlineCount > 0 && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                  {urgentDeadlineCount} urgent
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-0.5">
              {deadlineCountdowns.map((dl) => (
                <button
                  key={dl.eventId}
                  onClick={() => navigate(dl.linkTo)}
                  className="w-full flex items-center justify-between rounded px-2 py-1.5 hover:bg-accent/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${EVENT_COLORS[dl.type]}`} />
                    <span className="text-sm truncate">{dl.title}</span>
                  </div>
                  <span className={`text-xs font-semibold flex-shrink-0 ml-2 ${
                    dl.urgency === 'urgent' ? 'text-red-500'
                    : dl.urgency === 'warning' ? 'text-amber-500'
                    : 'text-muted-foreground'
                  }`}>
                    {dl.daysUntil === 0 ? 'Today' : dl.daysUntil === 1 ? 'Tomorrow' : `${dl.daysUntil}d`}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last Match Result (hidden during offseason) */}
      {!isOffseason && lastResult?.result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Your Last Result</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center gap-2">
                <div
                  className="h-8 w-8 rounded-full"
                  style={{ backgroundColor: clubs[lastResult.homeClubId]?.colors.primary }}
                />
                <span className="font-bold">{clubs[lastResult.homeClubId]?.abbreviation}</span>
              </div>
              <div className="text-center">
                <span className="text-xl font-bold font-mono">
                  {lastResult.result.homeTotalScore} - {lastResult.result.awayTotalScore}
                </span>
                <div className="text-xs text-muted-foreground font-mono">
                  {lastResult.result.homeScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{clubs[lastResult.awayClubId]?.abbreviation}</span>
                <div
                  className="h-8 w-8 rounded-full"
                  style={{ backgroundColor: clubs[lastResult.awayClubId]?.colors.primary }}
                />
              </div>
            </div>
            <div className="mt-1.5 text-center">
              <Button variant="link" size="sm" onClick={() => navigate('/fixture')}>
                View Full Stats <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}

// ---------------------------------------------------------------------------
// Matchup Card
// ---------------------------------------------------------------------------

interface MatchupCardProps {
  phase: GamePhase
  seasonComplete: boolean
  currentRound: number
  totalRounds: number
  finalsWeek: number
  isBye: boolean
  nextFixture: Fixture | null
  club: Club | undefined
  opponent: Club | null | undefined
  isHome: boolean
  opponentLadderPosition: number
  opponentLadderEntry: LadderEntry | null
  opponentForm: string[]
  ladderPosition: number
  matchDay: string | null
  nextMatchDate: string | null
  currentDate: string
  simming: boolean
  onSimWeek: () => void
  onSimToEnd: () => void
  onEnterOffseason: () => void
  userForm: string[]
  userLadderEntry: LadderEntry | null
  headToHead: { userScore: number; oppScore: number } | null
  playerClubId: string
  players: Record<string, Player>
  clubs: Record<string, Club>
  selectedLineup: Record<string, string> | null
  selectedSubstituteId: string | null
  interchangePlayers: number
  substitutesEnabled: boolean
  potentialMatchups: MatchupOption[]
}

function FormBadges({ form }: { form: string[] }) {
  if (form.length === 0) return <span className="text-xs text-muted-foreground">-</span>
  return (
    <div className="flex gap-0.5">
      {form.map((result, i) => (
        <span
          key={i}
          className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${
            result === 'W'
              ? 'bg-green-600'
              : result === 'L'
                ? 'bg-red-600'
                : 'bg-gray-500'
          }`}
        >
          {result}
        </span>
      ))}
    </div>
  )
}

function MatchupCard({
  phase,
  seasonComplete,
  currentRound,
  totalRounds,
  finalsWeek,
  isBye,
  nextFixture,
  club,
  opponent,
  isHome,
  opponentLadderPosition,
  opponentLadderEntry,
  opponentForm,
  ladderPosition,
  matchDay,
  nextMatchDate,
  currentDate,
  simming,
  onSimWeek,
  onSimToEnd,
  onEnterOffseason,
  userForm,
  userLadderEntry,
  headToHead,
  playerClubId,
  players,
  clubs,
  selectedLineup,
  selectedSubstituteId,
  interchangePlayers,
  substitutesEnabled,
  potentialMatchups,
}: MatchupCardProps) {
  const [showStrategies, setShowStrategies] = useState(false)
  const [showPotential, setShowPotential] = useState(false)
  const [selectedPotentialKey, setSelectedPotentialKey] = useState<string | null>(null)
  const selectedPotential = useMemo(() => {
    if (potentialMatchups.length === 0) return null
    if (selectedPotentialKey) {
      const found = potentialMatchups.find((opt) => opt.key === selectedPotentialKey)
      if (found) return found
    }
    return potentialMatchups[0]
  }, [potentialMatchups, selectedPotentialKey])
  const userPreviewLineup = useMemo(() => {
    const fallback = selectBestLineup(
      Object.values(players),
      playerClubId,
      { interchangePlayers, club: clubs[playerClubId] },
    ).lineup
    return sanitizePreviewLineup(selectedLineup ?? fallback, players, playerClubId, interchangePlayers)
  }, [players, playerClubId, selectedLineup, interchangePlayers, clubs])
  const oppositionPreviewLineup = useMemo(() => {
    if (!selectedPotential || selectedPotential.kind !== 'match') return {}
    return selectBestLineup(
      Object.values(players),
      selectedPotential.opponentId,
      { interchangePlayers, club: clubs[selectedPotential.opponentId] },
    ).lineup
  }, [players, selectedPotential, interchangePlayers, clubs])
  const previewCountdown = useMemo(() => {
    if (!selectedPotential) return null
    const now = new Date(currentDate + 'T00:00:00').getTime()
    const then = new Date(selectedPotential.roundDate + 'T00:00:00').getTime()
    return Math.max(0, Math.round((then - now) / 86_400_000))
  }, [selectedPotential, currentDate])

  if (seasonComplete) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Trophy className="mx-auto h-10 w-10 text-yellow-500 mb-3" />
          <p className="text-lg font-bold">Season Complete</p>
          <p className="text-sm text-muted-foreground mt-1">
            Final ladder position: {ladderPosition > 0 ? `${ladderPosition}${ordinal(ladderPosition)}` : '-'}
          </p>
          <Button className="mt-4" onClick={onEnterOffseason}>
            <Moon className="mr-1.5 h-4 w-4" />
            Enter Offseason
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (phase === 'finals') {
    const inFinals = ladderPosition >= 1 && ladderPosition <= 8
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">
              Finals Series &mdash; Week {finalsWeek}
            </p>
            <Trophy className="mx-auto h-8 w-8 text-yellow-500 mb-2" />
            <p className="text-lg font-bold">
              {inFinals ? 'In Finals Contention' : 'Season Over — Eliminated'}
            </p>
          </div>
          {inFinals && (
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={onSimWeek} disabled={simming}>
                <Play className="mr-1 h-4 w-4" />
                Sim Finals Week
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  if (isBye) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">
              Round {currentRound + 1} of {totalRounds}
            </p>
            <p className="text-lg font-bold">Bye Week</p>
            <p className="text-sm text-muted-foreground mt-1">No match this round</p>
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={onSimWeek} disabled={simming}>
              <Play className="mr-1 h-4 w-4" />
              Sim Week
            </Button>
            <Button variant="outline" onClick={onSimToEnd} disabled={simming}>
              <FastForward className="mr-1 h-4 w-4" />
              Sim to Finals
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (opponent && nextFixture) {
    const matchDayLabel = matchDay?.replace('-', ' ') ?? ''

    const userPfPg = userLadderEntry && userLadderEntry.played > 0
      ? (userLadderEntry.pointsFor / userLadderEntry.played).toFixed(0)
      : '-'
    const userPaPg = userLadderEntry && userLadderEntry.played > 0
      ? (userLadderEntry.pointsAgainst / userLadderEntry.played).toFixed(0)
      : '-'
    const oppPfPg = opponentLadderEntry && opponentLadderEntry.played > 0
      ? (opponentLadderEntry.pointsFor / opponentLadderEntry.played).toFixed(0)
      : '-'
    const oppPaPg = opponentLadderEntry && opponentLadderEntry.played > 0
      ? (opponentLadderEntry.pointsAgainst / opponentLadderEntry.played).toFixed(0)
      : '-'
    const daysToGame = (() => {
      if (!nextMatchDate) return null
      const now = new Date(currentDate + 'T00:00:00').getTime()
      const then = new Date(nextMatchDate + 'T00:00:00').getTime()
      const days = Math.round((then - now) / 86_400_000)
      return Math.max(0, days)
    })()
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center mb-4">
            <div className="mb-2 flex justify-start gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowPotential((v) => !v)}
              >
                {showPotential ? 'Hide' : 'Show'} Potential Matchups
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowStrategies((v) => !v)}
              >
                {showStrategies ? 'Hide' : 'Show'} Strategies
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Round {currentRound + 1} of {totalRounds}
              {matchDayLabel ? ` · ${matchDayLabel}` : ''}
            </p>
            {nextMatchDate && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatDate(nextMatchDate)} · {nextFixture.scheduledTime}
              </p>
            )}
            {daysToGame !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                {daysToGame === 0 ? 'Game day' : `${daysToGame} day${daysToGame === 1 ? '' : 's'} to game`}
              </p>
            )}
          </div>

          {/* Teams */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <div
                className="h-12 w-12 rounded-full"
                style={{ backgroundColor: (isHome ? club : opponent)?.colors.primary ?? '#666' }}
              />
              <span className="text-sm font-bold">
                {(isHome ? club : opponent)?.abbreviation}
              </span>
              <Badge variant="secondary" className="text-[10px]">HOME</Badge>
            </div>
            <span className="text-xl font-bold text-muted-foreground">vs</span>
            <div className="flex flex-col items-center gap-2">
              <div
                className="h-12 w-12 rounded-full"
                style={{ backgroundColor: (isHome ? opponent : club)?.colors.primary ?? '#666' }}
              />
              <span className="text-sm font-bold">
                {(isHome ? opponent : club)?.abbreviation}
              </span>
              <Badge variant="outline" className="text-[10px]">AWAY</Badge>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-3">
            {nextFixture.venue}
          </p>

          {showStrategies && (
            <div className="mt-3 rounded border p-2.5 space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Strategy Notes</p>
              <p className="text-xs text-muted-foreground">
                {opponentLadderPosition > 0 && opponentLadderPosition <= 4
                  ? 'Top-tier opposition: prioritise territory control and reduce turnover risk.'
                  : 'Mid/lower ladder opposition: back your pressure game and attack corridor transition.'}
              </p>
              <p className="text-xs text-muted-foreground">
                {Number(oppPfPg) > Number(userPaPg)
                  ? 'Defensive focus: set stronger team defence and limit forward-half entries.'
                  : 'Attacking focus: commit more overlap run to expose their defensive setup.'}
              </p>
              <p className="text-xs text-muted-foreground">
                {opponentForm.filter((r) => r === 'W').length >= 3
                  ? 'Opponent is in form: start conservatively, then open up once control is established.'
                  : 'Opponent form is mixed: pressure early and force selection/tactical changes.'}
              </p>
            </div>
          )}

          {showPotential && (
            <div className="mt-3 rounded border p-2.5 space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {potentialMatchups.map((opt) => (
                  <Button
                    key={opt.key}
                    variant={selectedPotential?.key === opt.key ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setSelectedPotentialKey(opt.key)}
                  >
                    R{opt.round}{opt.kind === 'bye' ? ' BYE' : ` ${clubs[opt.opponentId]?.abbreviation ?? opt.opponentId}`}
                  </Button>
                ))}
              </div>
              <div className="max-h-[560px] overflow-y-auto pr-1">
                {!selectedPotential ? (
                  <p className="text-xs text-muted-foreground">No upcoming matchups available.</p>
                ) : selectedPotential.kind === 'bye' ? (
                  <div className="rounded border bg-muted/20 p-2 text-xs text-muted-foreground">
                    Round {selectedPotential.round} is a bye
                    {previewCountdown !== null && ` · ${previewCountdown === 0 ? 'current week' : `${previewCountdown} day${previewCountdown === 1 ? '' : 's'} away`}`}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded border bg-muted/20 p-2 text-xs text-muted-foreground">
                      {formatDate(selectedPotential.roundDate)} · {selectedPotential.homeAway.toUpperCase()} · {selectedPotential.venue}
                      {previewCountdown !== null && ` · ${previewCountdown === 0 ? 'game week' : `${previewCountdown} day${previewCountdown === 1 ? '' : 's'} to game`}`}
                    </div>
                    <MatchupFieldPreview
                      userLineup={userPreviewLineup}
                      opponentLineup={oppositionPreviewLineup}
                      players={players}
                      userClub={clubs[playerClubId]}
                      opponentClub={clubs[selectedPotential.opponentId]}
                      interchangeCount={interchangePlayers}
                      substitutesEnabled={substitutesEnabled}
                      userSubstituteId={selectedSubstituteId}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats comparison */}
          <div className="mt-4 border-t pt-4">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="font-medium text-muted-foreground">{club?.abbreviation}</div>
              <div className="font-medium text-muted-foreground">Stat</div>
              <div className="font-medium text-muted-foreground">{opponent?.abbreviation}</div>

              <div className="font-semibold">
                {ladderPosition > 0 ? `${ladderPosition}${ordinal(ladderPosition)}` : '-'}
              </div>
              <div className="text-muted-foreground">Position</div>
              <div className="font-semibold">
                {opponentLadderPosition > 0 ? `${opponentLadderPosition}${ordinal(opponentLadderPosition)}` : '-'}
              </div>

              <div>
                {userLadderEntry
                  ? `${userLadderEntry.wins}-${userLadderEntry.draws}-${userLadderEntry.losses}`
                  : '-'}
              </div>
              <div className="text-muted-foreground">W-D-L</div>
              <div>
                {opponentLadderEntry
                  ? `${opponentLadderEntry.wins}-${opponentLadderEntry.draws}-${opponentLadderEntry.losses}`
                  : '-'}
              </div>

              <div className="flex justify-center"><FormBadges form={userForm} /></div>
              <div className="text-muted-foreground">Form</div>
              <div className="flex justify-center"><FormBadges form={opponentForm} /></div>

              <div>{userPfPg} / {userPaPg}</div>
              <div className="text-muted-foreground">Avg PF/PA</div>
              <div>{oppPfPg} / {oppPaPg}</div>
            </div>

            {headToHead && (
              <div className="mt-3 text-center text-xs text-muted-foreground border-t pt-2">
                <span className="font-medium">H2H this season: </span>
                <span className="font-semibold text-foreground">{headToHead.userScore}</span>
                {' - '}
                <span className="font-semibold text-foreground">{headToHead.oppScore}</span>
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={onSimWeek} disabled={simming}>
              <Play className="mr-1 h-4 w-4" />
              Sim Match
            </Button>
            <Button variant="outline" onClick={onSimToEnd} disabled={simming}>
              <FastForward className="mr-1 h-4 w-4" />
              Sim to Finals
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-6 text-center">
        <p className="text-muted-foreground">No upcoming match</p>
      </CardContent>
    </Card>
  )
}
