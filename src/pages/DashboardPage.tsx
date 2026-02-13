import { useState, useMemo, useEffect } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useNavigate } from 'react-router-dom'
import {
  Trophy,
  Play, FastForward, ChevronLeft, ChevronRight, ArrowRight,
  Plus, Moon, X,
  Users, ClipboardList, Shield, BarChart3, Gamepad2,
  Swords, ArrowLeftRight, AlertTriangle, GraduationCap, FileText, Newspaper,
  CheckCheck,
} from 'lucide-react'
import type { Match } from '@/types/match'
import type { Player } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import type { NewsItem } from '@/types/game'
import type { Club } from '@/types/club'
import type { Fixture, LadderEntry } from '@/types/season'
import type { GamePhase } from '@/types/game'
import type { GameEvent, GameEventType, ScheduleSlot, WeekSchedule } from '@/types/calendar'
import type { TrainingFocus, TrainingSession } from '@/engine/training/trainingEngine'
import { runTrainingSessions, applyTrainingResults, getDefaultTrainingWeek } from '@/engine/training/trainingEngine'
import { SeededRNG } from '@/engine/core/rng'
import {
  getEventsForDate,
  getNextEvent,
  addDays,
  formatDate,
} from '@/engine/calendar/calendarEngine'

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
}

const EVENT_LABELS: Record<GameEventType, string> = {
  match: 'Match',
  training: 'Training',
  'contract-deadline': 'Contract',
  'trade-deadline': 'Trade',
  draft: 'Draft',
  'preseason-friendly': 'Friendly',
  bye: 'Bye',
  milestone: 'Event',
}

const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

const SLOT_FITNESS: Record<'morning' | 'afternoon', number> = {
  morning: 1,    // moderate intensity
  afternoon: 2,  // light intensity
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

// ---------------------------------------------------------------------------
// News category config
// ---------------------------------------------------------------------------
type NewsCategory = NewsItem['category']

const NEWS_CATEGORY_CONFIG: Record<NewsCategory, { icon: React.ElementType; color: string; label: string }> = {
  match:    { icon: Swords,          color: 'bg-blue-500/15 text-blue-400',   label: 'Match' },
  trade:    { icon: ArrowLeftRight,  color: 'bg-purple-500/15 text-purple-400', label: 'Trade' },
  injury:   { icon: AlertTriangle,   color: 'bg-red-500/15 text-red-400',    label: 'Injury' },
  draft:    { icon: GraduationCap,   color: 'bg-green-500/15 text-green-400', label: 'Draft' },
  contract: { icon: FileText,        color: 'bg-amber-500/15 text-amber-400', label: 'Contract' },
  general:  { icon: Newspaper,       color: 'bg-zinc-500/15 text-zinc-400',  label: 'General' },
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

/** Get the Monday of the week containing `dateStr`. */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day // Monday=0 offset
  return addDays(dateStr, diff)
}

// ---------------------------------------------------------------------------
// Schedule Slot Cell (morning / afternoon)
// ---------------------------------------------------------------------------

interface ScheduleSlotCellProps {
  date: string
  slot: ScheduleSlot
  activity: TrainingFocus | 'rest' | null
  isPast: boolean
  onSelect: (activity: TrainingFocus | 'rest' | null) => void
}

function ScheduleSlotCell({ date, slot, activity, isPast, onSelect }: ScheduleSlotCellProps) {
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
  const players = useGameStore((s) => s.players)
  const staff = useGameStore((s) => s.staff)
  const newsLog = useGameStore((s) => s.newsLog)
  const markNewsRead = useGameStore((s) => s.markNewsRead)
  const markAllNewsRead = useGameStore((s) => s.markAllNewsRead)

  const settings = useGameStore((s) => s.settings)
  const enterOffseason = useGameStore((s) => s.enterOffseason)
  const offseasonState = useGameStore((s) => s.offseasonState)

  // Actual game date (season starts from settings, each round is 1 week)
  const seasonStartDate = settings?.seasonStartDate ?? '2026-03-20'
  const gameDate = useMemo(
    () => addDays(seasonStartDate, Math.max(0, currentRound) * 7),
    [seasonStartDate, currentRound],
  )

  const [lastResult, setLastResult] = useState<Match | null>(null)
  const [simming, setSimming] = useState(false)
  const [premierMsg, setPremierMsg] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(() => getWeekStart(gameDate))
  const [expandedNewsId, setExpandedNewsId] = useState<string | null>(null)

  // Auto-scroll calendar to current week when game date changes
  useEffect(() => {
    setWeekStart(getWeekStart(gameDate))
  }, [gameDate])

  // News: latest 10, newest first
  const recentNews = useMemo(() => [...newsLog].reverse().slice(0, 10), [newsLog])
  const unreadCount = useMemo(() => newsLog.filter((n) => !n.read).length, [newsLog])

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

  // Offseason early return
  if (phase === 'offseason') {
    const rosterCount = Object.values(players).filter((p) => p.clubId === playerClubId).length
    const capSpend = Object.values(players)
      .filter((p) => p.clubId === playerClubId)
      .reduce((sum, p) => sum + (p.contract.yearByYear[0] ?? 0), 0)
    const capTotal = settings?.salaryCapAmount ?? 18_300_000

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div
            className="h-12 w-12 rounded-full"
            style={{ backgroundColor: club?.colors.primary ?? '#666' }}
          />
          <div>
            <h1 className="text-2xl font-bold">{club?.fullName}</h1>
            <p className="text-muted-foreground">Offseason</p>
          </div>
        </div>

        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-6 text-center">
            <Moon className="mx-auto h-8 w-8 text-amber-400 mb-2" />
            <p className="text-lg font-bold">Offseason In Progress</p>
            <p className="text-sm text-muted-foreground mt-1">
              Complete offseason activities to start the next season
            </p>
            <Button className="mt-4" onClick={() => navigate('/offseason')}>
              <ArrowRight className="mr-1 h-4 w-4" />
              Go to Offseason
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Roster</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{rosterCount}</p>
              <p className="text-xs text-muted-foreground">players on list</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cap Space</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                ${((capTotal - capSpend) / 1_000_000).toFixed(1)}M
              </p>
              <p className="text-xs text-muted-foreground">
                of ${(capTotal / 1_000_000).toFixed(1)}M available
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Last Season</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {ladderPosition > 0 ? `${ladderPosition}${ordinal(ladderPosition)}` : '-'}
              </p>
              <p className="text-xs text-muted-foreground">final ladder position</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

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

  // Week days for the current view
  const weekDays = useMemo(
    () => buildWeekDays(weekStart, calendar.events, gameDate),
    [weekStart, calendar.events, gameDate],
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

  // Selected date events
  const selectedEvents = useMemo(
    () => (selectedDate ? getEventsForDate(calendar, selectedDate) : []),
    [calendar, selectedDate],
  )

  // Can simulate to selected date?
  const canSimToDate = useMemo(() => {
    if (!selectedDate || phase !== 'regular-season') return false
    return selectedDate > gameDate
  }, [selectedDate, gameDate, phase])

  const handleSimToDate = () => {
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

    // Build sessions from weekSchedule
    const userSessions: TrainingSession[] = []
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

    // Apply user training (if any sessions scheduled)
    if (userSessions.length > 0 && userFacilities) {
      const userResults = runTrainingSessions(userClubPlayers, userSessions, userClubStaff, userFacilities, trainingRng)
      // Apply results to the store's players
      useGameStore.setState((s) => {
        applyTrainingResults(s.players, userResults)
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
      const aiResults = runTrainingSessions(aiPlayers, defaultWeek.sessions, aiStaff, aiFacilities, aiRng)
      useGameStore.setState((s) => {
        applyTrainingResults(s.players, aiResults)
      })
    }

    // Clear the week schedule
    clearWeekSchedule()

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

  // Next match date (same as game date if there's a fixture this round)
  const nextMatchDate = useMemo(() => {
    if (phase === 'finals' || phase === 'post-season') return null
    if (!nextFixture) return null
    return gameDate
  }, [gameDate, phase, nextFixture])

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

  const pendingActions = useMemo(() => {
    const actions: { label: string; path: string }[] = []
    if (phase === 'regular-season' && nextFixture) {
      actions.push({ label: 'Set Lineup', path: '/lineup' })
      actions.push({ label: 'Review Gameplan', path: '/gameplan' })
    }
    if (unreadCount > 0) {
      actions.push({ label: `${unreadCount} Unread`, path: '/inbox' })
    }
    actions.push({ label: 'View Squad', path: '/squad' })
    actions.push({ label: 'Check Calendar', path: '/calendar' })
    return actions
  }, [phase, nextFixture, unreadCount])

  return (
    <div className="space-y-6">
      {/* Header + Date + Continue Button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="h-12 w-12 rounded-full"
            style={{ backgroundColor: club?.colors.primary ?? '#666' }}
          />
          <div>
            <h1 className="text-2xl font-bold">{club?.fullName}</h1>
            <p className="text-muted-foreground">
              {club?.homeGround}
              {nextMatchDate && (
                <span className="ml-2 text-sm">
                  · Next match {formatDate(nextMatchDate)}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Game Date</p>
            <p className="text-lg font-bold">{formatDate(gameDate)}</p>
            <p className="text-xs text-muted-foreground">
              Round {currentRound + 1} of {season.rounds.length}
            </p>
          </div>
          {!seasonComplete && (
            <div className="flex flex-col items-end gap-1">
              <Button
                size="lg"
                className="h-12 px-6 text-base font-bold"
                onClick={handleSimWeek}
                disabled={simming}
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
          )}
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
                onClick={() => setWeekStart(getWeekStart(gameDate))}
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
                    rounded-lg text-left transition-colors border min-h-[100px]
                    flex flex-col cursor-pointer
                    ${day.isToday
                      ? 'border-primary border-2 bg-primary/20 ring-2 ring-primary/50 shadow-lg shadow-primary/25'
                      : isSelected
                        ? 'border-accent-foreground/30 bg-accent'
                        : day.hasMatch
                          ? 'border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10'
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

                  {/* Match day: full cell with event pills */}
                  {day.hasMatch ? (
                    <div className="flex flex-col gap-0.5 mt-auto w-full px-1.5 pb-1.5">
                      {day.events.map((evt) => (
                        <div
                          key={evt.id}
                          className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-white ${EVENT_COLORS[evt.type]}`}
                        >
                          <span className="truncate">{evt.title}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Non-match day: morning/afternoon slots */
                    <div className="flex flex-col flex-1 gap-0.5 px-1.5 pb-1.5 mt-1">
                      <ScheduleSlotCell
                        date={day.date}
                        slot="morning"
                        activity={daySchedule?.morning ?? null}
                        isPast={isPastDay}
                        onSelect={(activity) => setDaySlot(day.date, 'morning', activity)}
                      />
                      <ScheduleSlotCell
                        date={day.date}
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
            <div className="ml-auto flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={handleAutoFillTraining}
              >
                <ClipboardList className="mr-1 h-3 w-3" />
                Assistant Coach Sets Training
              </Button>
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto text-xs"
                onClick={() => navigate('/calendar')}
              >
                Full Calendar <ArrowRight className="ml-0.5 h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Selected date detail */}
          {selectedDate && (
            <div className="mt-3 border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">{formatDate(selectedDate)}</p>
                {canSimToDate && (
                  <Button size="sm" onClick={handleSimToDate} disabled={simming}>
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

      {/* Training Schedule Summary */}
      {scheduleSummary && (
        <Card>
          <CardContent className="py-4 space-y-4">
            {/* Fatigue + Injury Risk — big and clear */}
            <div className="grid grid-cols-2 gap-3">
              {/* Fatigue */}
              <div className={`rounded-lg p-3 ${
                scheduleSummary.fatigueLevel === 'extreme' ? 'bg-red-500/15 border border-red-500/30' :
                scheduleSummary.fatigueLevel === 'high' ? 'bg-orange-500/15 border border-orange-500/30' :
                scheduleSummary.fatigueLevel === 'moderate' ? 'bg-yellow-500/10 border border-yellow-500/20' :
                'bg-green-500/10 border border-green-500/20'
              }`}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Weekly Fatigue</p>
                <p className={`text-xl font-bold ${
                  scheduleSummary.fatigueLevel === 'extreme' ? 'text-red-400' :
                  scheduleSummary.fatigueLevel === 'high' ? 'text-orange-400' :
                  scheduleSummary.fatigueLevel === 'moderate' ? 'text-yellow-400' :
                  'text-green-400'
                }`}>
                  {scheduleSummary.fatigueLevel === 'extreme' ? 'Extreme' :
                   scheduleSummary.fatigueLevel === 'high' ? 'Heavy' :
                   scheduleSummary.fatigueLevel === 'moderate' ? 'Moderate' : 'Light'}
                </p>
                {/* Visual bar */}
                <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      scheduleSummary.fatigueLevel === 'extreme' ? 'bg-red-500' :
                      scheduleSummary.fatigueLevel === 'high' ? 'bg-orange-500' :
                      scheduleSummary.fatigueLevel === 'moderate' ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, (scheduleSummary.totalFatigue / 60) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {scheduleSummary.fatigueLevel === 'extreme'
                    ? 'Players will be exhausted. Expect poor match performance.'
                    : scheduleSummary.fatigueLevel === 'high'
                      ? 'Heavy load. Consider adding recovery sessions.'
                      : scheduleSummary.fatigueLevel === 'moderate'
                        ? 'Solid training week. Players can handle this.'
                        : 'Light week. Good for recovery or pre-match taper.'}
                </p>
              </div>

              {/* Injury Risk */}
              <div className={`rounded-lg p-3 ${
                scheduleSummary.injuryRisk === 'elevated' ? 'bg-red-500/15 border border-red-500/30' :
                scheduleSummary.injuryRisk === 'moderate' ? 'bg-orange-500/15 border border-orange-500/30' :
                'bg-green-500/10 border border-green-500/20'
              }`}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Injury Risk</p>
                <p className={`text-xl font-bold ${
                  scheduleSummary.injuryRisk === 'elevated' ? 'text-red-400' :
                  scheduleSummary.injuryRisk === 'moderate' ? 'text-orange-400' :
                  'text-green-400'
                }`}>
                  {scheduleSummary.injuryRisk === 'elevated' ? 'Elevated' :
                   scheduleSummary.injuryRisk === 'moderate' ? 'Moderate' : 'Low'}
                </p>
                {/* Visual bar */}
                <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      scheduleSummary.injuryRisk === 'elevated' ? 'bg-red-500' :
                      scheduleSummary.injuryRisk === 'moderate' ? 'bg-orange-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: scheduleSummary.injuryRisk === 'elevated' ? '85%' : scheduleSummary.injuryRisk === 'moderate' ? '50%' : '20%' }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {scheduleSummary.injuryRisk === 'elevated'
                    ? 'Too many intense sessions without recovery. Add a rest day.'
                    : scheduleSummary.injuryRisk === 'moderate'
                      ? 'Some risk. A recovery session would help.'
                      : 'Well balanced. Low chance of training injuries.'}
                </p>
              </div>
            </div>

            {/* Development overview — one compact line */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-muted-foreground font-medium">
                {scheduleSummary.training} session{scheduleSummary.training !== 1 ? 's' : ''}
                {scheduleSummary.rest > 0 ? ` + ${scheduleSummary.rest} rest` : ''}
                {' · '}
              </span>
              <span className="text-muted-foreground">Developing</span>
              {scheduleSummary.skillAreas.map((area) => (
                <span key={area} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                  {area}
                </span>
              ))}
              {scheduleSummary.specificGroups.length > 0 && (
                <>
                  <span className="text-muted-foreground">for</span>
                  {scheduleSummary.hitsAll && <span className="text-[10px] font-medium">All</span>}
                  {scheduleSummary.specificGroups.map((g) => (
                    <span key={g} className="text-[10px] font-medium">{g}</span>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3-column row: Inbox | Ladder Position | Pending Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Inbox */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Inbox
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </CardTitle>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={markAllNewsRead}>
                <CheckCheck className="mr-1 h-3 w-3" />
                Read All
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {recentNews.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No messages yet</p>
            ) : (
              <div className="max-h-[250px] overflow-y-auto divide-y divide-border -mx-6">
                {recentNews.map((item) => {
                  const config = NEWS_CATEGORY_CONFIG[item.category]
                  const Icon = config.icon
                  const isUnread = !item.read
                  const isExpanded = expandedNewsId === item.id

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (isUnread) markNewsRead(item.id)
                        setExpandedNewsId(isExpanded ? null : item.id)
                      }}
                      className={`flex w-full flex-col gap-1 px-4 py-2 text-left transition-colors hover:bg-muted/50 ${
                        isExpanded ? 'bg-muted/30' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                        {!isUnread && <span className="w-1.5 flex-shrink-0" />}
                        <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${config.color}`}>
                          <Icon className="h-3 w-3" />
                        </div>
                        <span className={`flex-1 truncate text-xs ${isUnread ? 'font-semibold' : 'text-muted-foreground'}`}>
                          {item.headline}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="ml-7 mt-1">
                          <p className="text-xs text-foreground">{item.body}</p>
                          <span className="text-[10px] text-muted-foreground">{item.date}</span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {newsLog.length > 10 && (
              <div className="mt-2 text-center">
                <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => navigate('/inbox')}>
                  View All <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* MIDDLE: Ladder Position */}
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
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
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

        {/* RIGHT: Pending Actions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingActions.map((action) => (
                <Button
                  key={action.path + action.label}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => navigate(action.path)}
                >
                  <ArrowRight className="mr-2 h-3 w-3" />
                  {action.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Next Matchup Card */}
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
        simming={simming}
        onSimWeek={handleSimWeek}
        onSimToEnd={handleSimToEnd}
        onEnterOffseason={enterOffseason}
        userForm={userForm}
        userLadderEntry={ladderEntry ?? null}
        headToHead={headToHead}
      />

      {/* Last Match Result */}
      {lastResult?.result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Your Last Result</CardTitle>
          </CardHeader>
          <CardContent>
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
            <div className="mt-2 text-center">
              <Button variant="link" size="sm" onClick={() => navigate('/match')}>
                View Full Stats <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Scrollable Ladder */}
      {ladder.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ladder</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {ladder.map((entry, i) => {
                const ladderClub = clubs[entry.clubId]
                const isPlayer = entry.clubId === playerClubId
                return (
                  <div
                    key={entry.clubId}
                    className={`flex items-center justify-between rounded px-3 py-1.5 text-sm ${
                      isPlayer ? 'bg-accent font-semibold' : ''
                    } ${i === 7 ? 'border-b-2 border-dashed border-muted-foreground/30' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-right text-muted-foreground">{i + 1}</span>
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: ladderClub?.colors.primary }}
                      />
                      <span>{ladderClub?.abbreviation}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
  simming: boolean
  onSimWeek: () => void
  onSimToEnd: () => void
  onEnterOffseason: () => void
  userForm: string[]
  userLadderEntry: LadderEntry | null
  headToHead: { userScore: number; oppScore: number } | null
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
  simming,
  onSimWeek,
  onSimToEnd,
  onEnterOffseason,
  userForm,
  userLadderEntry,
  headToHead,
}: MatchupCardProps) {
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

    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center mb-4">
            <p className="text-sm text-muted-foreground">
              Round {currentRound + 1} of {totalRounds}
              {matchDayLabel ? ` · ${matchDayLabel}` : ''}
            </p>
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
