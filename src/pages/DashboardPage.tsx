import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useDashboardConfig } from '@/hooks/useDashboardConfig'
import type { DashboardWidgetId } from '@/hooks/useDashboardConfig'
import { DashboardCustomizeSheet } from '@/components/dashboard/DashboardCustomizeSheet'
import { h2hKey, isRivalryMatch, h2hPerspective } from '@/engine/history/h2hTracker'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/ConfirmButton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useNavigate } from 'react-router-dom'
import {
  Trophy, Calendar,
  Play, FastForward, SkipForward, ChevronLeft, ChevronRight, ArrowRight,
  Plus, Moon, X,
  Users, ClipboardList, Shield, ShieldAlert, BarChart3, Gamepad2,
  AlertTriangle, GraduationCap, Scale, Mail, FileText, Cog, DollarSign,
  Newspaper, TrendingUp, TrendingDown, Minus, LayoutGrid,
  Flame, CheckCircle2, Zap,
  Sun, CloudRain, Wind, Thermometer, Droplets,
} from 'lucide-react'
import type { Match } from '@/types/match'
import type { Player, PlayerPositionType } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import type { Club } from '@/types/club'
import type { Fixture, LadderEntry } from '@/types/season'
import type { GamePhase } from '@/types/game'
import type { GameEvent, GameEventType, ScheduleSlot } from '@/types/calendar'
import type { TrainingFocus, TrainingSession, TrainingResult } from '@/engine/training/trainingEngine'
import {
  runTrainingSessions,
  applyTrainingResults,
  getDefaultTrainingWeek,
  weekPlanToSessions,
  advanceClubUpskilling,
} from '@/engine/training/trainingEngine'
import { generateSquadPulseNotes } from '@/engine/training/squadPulseEngine'
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
import { MatchEngagementBanner } from '@/components/dashboard/MatchEngagementBanner'
import { RecommendedActions } from '@/components/dashboard/RecommendedActions'
import { PlayerStorylinesWidget } from '@/components/dashboard/PlayerStorylinesWidget'
import { DynastyQuestCard } from '@/components/dashboard/DynastyQuestCard'
import { ClubListNeedsCard } from '@/components/dashboard/ClubListNeedsCard'
import { OffseasonPhaseCard } from '@/components/dashboard/OffseasonPhaseCard'
import { PhaseProgressCard } from '@/components/dashboard/PhaseProgressCard'
import { OffseasonCalendarOverlay } from '@/components/dashboard/OffseasonCalendarOverlay'
import { calculateClubSalaryTotal, calculateLuxuryTax } from '@/engine/contracts/negotiation'
import { isPlayerSuspended } from '@/engine/players/availability'
import { canBeSelectedForAfl } from '@/engine/players/contracts'
import { PLAYER_TRAINING_FOCUS_LABELS } from '@/engine/players/trainingFocus'
import { applyMediaCoverage, deriveMediaStories } from '@/engine/media/mediaFeedEngine'
import { LiveMatchView } from '@/components/match/LiveMatchView'
import { MatchupFieldPreview } from '@/components/lineup/MatchupFieldPreview'
import { TrainingReportCard } from '@/components/training/TrainingReportCard'
import { buildSpecialEventSimInput } from '@/engine/specialEvents/specialEventSimInput'
import type { SimulateMatchInput } from '@/engine/match/simulateMatch'
import type { SpecialEventInstance } from '@/types/specialEvents'
import { NewChallengeModal } from '@/components/legacy/NewChallengeModal'
import { buildLegacyRating } from '@/engine/legacy/legacyEngine'
import type { BettingMarketsState } from '@/types/betting'
import { computeLeadershipStabilityPct } from '@/engine/leadership/leadershipChangeEngine'
import { generateRivalScoutReport } from '@/engine/match/rivalScoutEngine'
import { generateMatchWeather, windDirectionArrow, windStrengthLabel } from '@/engine/match/weatherEngine'
import type { MatchWeatherData } from '@/engine/match/weatherEngine'
import { buildSquadStorylines } from '@/engine/player/storyArc'
import { cn } from '@/lib/utils'

// Stable fallback for optional h2hRecords (avoids new-reference-per-render in selector)
const EMPTY_H2H: Record<string, import('@/types/history').H2HRecord> = {}

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

// ---------------------------------------------------------------------------
// Training slot colour helpers (used in Training Overview card)
// ---------------------------------------------------------------------------
const SLOT_ABBREV: Record<string, string> = {
  rest: '−', recovery: 'Rc', physical: 'Ph', contested: 'Co',
  'match-fitness': 'MF', kicking: 'Kk', handball: 'Hb', marking: 'Mk',
  'game-sense': 'GS', offensive: 'Of', defensive: 'Df',
  'set-pieces': 'SP', 'video-review': 'VR', mental: 'Mn', ruck: 'Rk',
}

function getSlotBgClass(focus: TrainingFocus | 'rest'): string {
  switch (focus) {
    case 'rest': return 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
    case 'recovery': return 'bg-teal-500/20 text-teal-700 dark:text-teal-300'
    case 'physical': case 'contested': case 'match-fitness':
      return 'bg-red-500/20 text-red-700 dark:text-red-300'
    case 'kicking': case 'handball': case 'marking':
      return 'bg-green-500/20 text-green-700 dark:text-green-300'
    case 'game-sense': case 'offensive': case 'defensive': case 'set-pieces':
      return 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
    case 'video-review': return 'bg-zinc-500/20 text-zinc-700 dark:text-zinc-300'
    case 'mental': return 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
    case 'ruck': return 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
    default: return 'bg-muted/40 text-muted-foreground'
  }
}

function getSlotDotClass(focus: TrainingFocus | 'rest'): string {
  switch (focus) {
    case 'rest': return 'bg-sky-400'
    case 'recovery': return 'bg-teal-400'
    case 'physical': case 'contested': case 'match-fitness': return 'bg-red-400'
    case 'kicking': case 'handball': case 'marking': return 'bg-green-400'
    case 'game-sense': case 'offensive': case 'defensive': case 'set-pieces': return 'bg-purple-400'
    case 'video-review': return 'bg-zinc-400'
    case 'mental': return 'bg-blue-400'
    case 'ruck': return 'bg-amber-400'
    default: return 'bg-muted'
  }
}

function getLoadBarClass(level: string): string {
  switch (level) {
    case 'low': return 'bg-green-500'
    case 'moderate': return 'bg-yellow-500'
    case 'high': return 'bg-orange-500'
    case 'extreme': return 'bg-red-600'
    default: return 'bg-muted'
  }
}

function getLoadBarWidth(level: string): string {
  switch (level) {
    case 'low': return '25%'
    case 'moderate': return '50%'
    case 'high': return '75%'
    case 'extreme': return '100%'
    default: return '0%'
  }
}

function getLoadTextClass(level: string): string {
  switch (level) {
    case 'low': return 'text-green-600 dark:text-green-400'
    case 'moderate': return 'text-yellow-600 dark:text-yellow-400'
    case 'high': return 'text-orange-600 dark:text-orange-400'
    case 'extreme': return 'text-red-600 dark:text-red-400'
    default: return 'text-muted-foreground'
  }
}

function getRiskDotClass(risk: string): string {
  switch (risk) {
    case 'low': return 'bg-green-500'
    case 'moderate': return 'bg-yellow-500'
    case 'elevated': return 'bg-red-500'
    default: return 'bg-muted'
  }
}

function getRiskTextClass(risk: string): string {
  switch (risk) {
    case 'low': return 'text-green-600 dark:text-green-400'
    case 'moderate': return 'text-yellow-600 dark:text-yellow-400'
    case 'elevated': return 'text-red-600 dark:text-red-400'
    default: return 'text-muted-foreground'
  }
}

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
  const specialEvents = useGameStore((s) => s.specialEvents)
const h2hRecords = useGameStore((s) => s.history.h2hRecords) ?? EMPTY_H2H
  const seasonArchives = useGameStore((s) => s.history.seasonArchives)
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
  const lastTrainingReport = useGameStore((s) => s.lastTrainingReport)
  const currentDate = useGameStore((s) => s.currentDate)
  const simulationActive = useGameStore((s) => s.simulation.active)

  const settings = useGameStore((s) => s.settings)
  const bettingMarkets = useGameStore((s) => s.bettingMarkets)
  const enterOffseason = useGameStore((s) => s.enterOffseason)
  const offseasonState = useGameStore((s) => s.offseasonState)
  const legacyState = useGameStore((s) => s.legacyState)
  const dynastyQuests = useGameStore((s) => s.dynastyQuests ?? [])
  const careerObjectives = useGameStore((s) => s.careerObjectives)
  const leadershipPending = useGameStore((s) => s.leadershipPending)
  const leadershipDisruptions = useGameStore((s) => s.leadershipDisruptions)

  // Offseason sim controls
  const simHalfDay = useGameStore((s) => s.simOffseasonHalfDay)
  const simFullDay = useGameStore((s) => s.simOffseasonFullDay)
  const simToMilestone = useGameStore((s) => s.simOffseasonToMilestone)
  const simSpecialEvent = useGameStore((s) => s.simSpecialEvent)
  const advanceDateToNextCalendarEvent = useGameStore((s) => s.advanceDateToNextCalendarEvent)
  const advanceOneDay = useGameStore((s) => s.advanceOneDay)

  // Offseason derived state
  const isOffseason = phase === 'offseason'
  const offseasonDate = offseasonState?.calendarState?.currentDate ?? currentDate
  const effectiveDate = isOffseason ? offseasonDate : currentDate

  const { widgets, setVisible, reorder, reset } = useDashboardConfig()
  const [customiseOpen, setCustomiseOpen] = useState(false)

  const [lastResult, setLastResult] = useState<Match | null>(null)
  const [lastSpecialResult, _setLastSpecialResult] = useState<import('@/types/specialEvents').SpecialEventMatchResult | null>(null)
  const [lastSpecialEventTitle, setLastSpecialEventTitle] = useState<string | null>(null)
  const [simming, setSimming] = useState(false)
  const [premierMsg, setPremierMsg] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(() => getWeekStart(effectiveDate))
  const [matchBlockDialog, setMatchBlockDialog] = useState<import('@/types/calendar').GameEvent | null>(null)
  const [liveSpecialEvent, setLiveSpecialEvent] = useState<{
    instance: SpecialEventInstance
    simInput: SimulateMatchInput
  } | null>(null)

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

  const matchScoutReport = useMemo(() => {
    if (!opponent) return null
    return generateRivalScoutReport(opponent, players)
  }, [opponent, players])

  const myMatchStorylines = useMemo(() => {
    const leadership = clubs[playerClubId]?.leadership
    const leaderIds = new Set([
      ...(leadership?.captainId ? [leadership.captainId] : []),
      ...(leadership?.viceCaptainId ? [leadership.viceCaptainId] : []),
      ...(leadership?.leadershipGroupIds ?? []),
    ])
    const myPlayers = Object.values(players).filter((p) => p.clubId === playerClubId)
    const myArcs = buildSquadStorylines(myPlayers, leaderIds, currentDate, 3)
    const oppArcs = opponent
      ? buildSquadStorylines(
          Object.values(players).filter((p) => p.clubId === opponent.id),
          new Set<string>(),
          currentDate,
          3,
        )
      : []
    return [...myArcs, ...oppArcs].sort((a, b) => b.priority - a.priority).slice(0, 2)
  }, [players, playerClubId, clubs, currentDate, opponent])

  const forecastWeather = useMemo(() => {
    if (!nextFixture) return null
    const seed = Math.abs(
      nextFixture.round * 31337 ^
      (nextFixture.homeClubId.charCodeAt(0) * 1997) ^
      (nextFixture.awayClubId.charCodeAt(0) * 997),
    )
    return generateMatchWeather(new SeededRNG(seed), (nextFixture as { venueId?: string }).venueId)
  }, [nextFixture])

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

  // Ladder position after each completed regular-season round
  const ladderProgressionData = useMemo(() => {
    if (!matchResults.length) return [] as { round: number; position: number }[]
    const played = matchResults.filter((m) => m.result && !m.isFinal)
    if (!played.length) return []
    const maxRound = Math.max(...played.map((m) => m.round))
    const result: { round: number; position: number }[] = []
    for (let r = 1; r <= maxRound; r++) {
      const roundMatches = played.filter((m) => m.round <= r)
      const totals: Record<string, { pts: number; pf: number; pa: number }> = {}
      for (const m of roundMatches) {
        const res = m.result!
        if (!totals[m.homeClubId]) totals[m.homeClubId] = { pts: 0, pf: 0, pa: 0 }
        if (!totals[m.awayClubId]) totals[m.awayClubId] = { pts: 0, pf: 0, pa: 0 }
        const homeWin = res.homeTotalScore > res.awayTotalScore
        const draw = res.homeTotalScore === res.awayTotalScore
        totals[m.homeClubId].pts += homeWin ? 4 : draw ? 2 : 0
        totals[m.awayClubId].pts += homeWin ? 0 : draw ? 2 : 4
        totals[m.homeClubId].pf += res.homeTotalScore
        totals[m.homeClubId].pa += res.awayTotalScore
        totals[m.awayClubId].pf += res.awayTotalScore
        totals[m.awayClubId].pa += res.homeTotalScore
      }
      const sorted = Object.entries(totals).sort(([, a], [, b]) => {
        if (b.pts !== a.pts) return b.pts - a.pts
        const aPct = a.pa > 0 ? a.pf / a.pa : a.pf > 0 ? 999 : 0
        const bPct = b.pa > 0 ? b.pf / b.pa : b.pf > 0 ? 999 : 0
        return bPct - aPct
      })
      const pos = sorted.findIndex(([id]) => id === playerClubId) + 1
      if (pos > 0) result.push({ round: r, position: pos })
    }
    return result
  }, [matchResults, playerClubId])

  // Historical end-of-season ladder position per year
  const historicalPositionData = useMemo(() => {
    if (!seasonArchives?.length) return [] as { year: number; position: number }[]
    return seasonArchives
      .map((archive) => {
        const pos = archive.ladder.findIndex((e) => e.clubId === playerClubId) + 1
        return pos > 0 ? { year: archive.year, position: pos } : null
      })
      .filter((d): d is { year: number; position: number } => d !== null)
      .sort((a, b) => a.year - b.year)
  }, [seasonArchives, playerClubId])

  const isRivalry = useMemo(
    () => opponentId ? isRivalryMatch(playerClubId, opponentId, clubs) : false,
    [opponentId, playerClubId, clubs],
  )

  const allTimeH2H = useMemo(() => {
    if (!opponentId) return null
    const key = h2hKey(playerClubId, opponentId)
    const record = h2hRecords[key]
    if (!record) return null
    return h2hPerspective(record, playerClubId)
  }, [playerClubId, opponentId, h2hRecords])

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
    let userTrainingResults: TrainingResult[] = []
    if (userSessions.length > 0 && userFacilities) {
      const userClub = state.clubs[state.playerClubId]
      const userBudget = userClub ? getClubBudgetAllocation(userClub) : undefined
      const userTrainingBudgetMul = userBudget
        ? (getBudgetMultiplier(userBudget, 'facilities') + getBudgetMultiplier(userBudget, 'coaching')) / 2
        : undefined
      userTrainingResults = runTrainingSessions(userClubPlayers, userSessions, userClubStaff, userFacilities, trainingRng, userTrainingBudgetMul)
      const userResults = userTrainingResults
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

        // Build and store the weekly training report
        const topImprovers = userResults
          .filter((r) => Object.values(r.attributeChanges).some((v) => (v as number) > 0))
          .map((r) => {
            const player = s.players[r.playerId]
            const totalGain = Object.values(r.attributeChanges).reduce(
              (sum, v) => sum + Math.max(0, v as number),
              0,
            )
            const topEntry = Object.entries(r.attributeChanges)
              .filter(([, v]) => (v as number) > 0)
              .sort(([, a], [, b]) => (b as number) - (a as number))[0]
            return {
              playerId: r.playerId,
              name: player ? `${player.firstName} ${player.lastName}` : r.playerId,
              totalGain,
              topAttr: topEntry?.[0] ?? '',
              topGain: (topEntry?.[1] as number) ?? 0,
            }
          })
          .sort((a, b) => b.totalGain - a.totalGain)
          .slice(0, 5)

        const nonZeroResults = userResults.filter((r) => r.fatigueChange !== 0 || r.fitnessChange !== 0)
        const avgFatigueChange =
          nonZeroResults.length > 0
            ? nonZeroResults.reduce((sum, r) => sum + r.fatigueChange, 0) / nonZeroResults.length
            : 0
        const avgFitnessChange =
          nonZeroResults.length > 0
            ? nonZeroResults.reduce((sum, r) => sum + r.fitnessChange, 0) / nonZeroResults.length
            : 0

        // Detect overtrained players: those whose fatigue has crossed the overtraining threshold
        const OVERTRAINING_THRESHOLD = 72
        const overtrained = Object.values(s.players)
          .filter((p) => p.clubId === s.playerClubId && !p.injury && p.fatigue >= OVERTRAINING_THRESHOLD)
          .map((p) => ({ playerId: p.id, name: `${p.firstName} ${p.lastName}`, fatigue: p.fatigue }))
          .sort((a, b) => b.fatigue - a.fatigue)

        const loadLevel: import('@/types/game').TrainingWeekReport['loadLevel'] =
          avgFatigueChange > 12 ? 'excessive' :
          avgFatigueChange > 6  ? 'heavy' :
          avgFatigueChange > 2  ? 'moderate' :
          'light'

        s.lastTrainingReport = {
          round: s.currentRound,
          date: s.currentDate,
          sessionCount: userSessions.length,
          topImprovers,
          avgFatigueChange,
          avgFitnessChange,
          injuryScarePlayers: userResults
            .filter((r) => r.injuryRisk)
            .map((r) => {
              const p = s.players[r.playerId]
              return p ? `${p.firstName} ${p.lastName}` : r.playerId
            }),
          upskillCompletions: completions.map((c) => {
            const p = s.players[c.playerId]
            let targetLabel = c.targetLabel
            if (c.type === 'position') {
              targetLabel = POSITION_LABELS[c.targetLabel as PlayerPositionType] ?? c.targetLabel
            } else {
              targetLabel =
                PLAYER_TRAINING_FOCUS_LABELS[
                  c.targetLabel as keyof typeof PLAYER_TRAINING_FOCUS_LABELS
                ] ?? c.targetLabel
            }
            return {
              playerName: p ? `${p.firstName} ${p.lastName}` : c.playerId,
              targetLabel,
              type: c.type,
            }
          }),
          overtrained,
          loadLevel,
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

    // Generate Squad Pulse notes for user club (always, even if no training planned)
    useGameStore.setState((s) => {
      const pulseRng = new SeededRNG(s.rngSeed + s.currentRound * 6673)
      const clubPlayersForPulse = Object.values(s.players).filter(
        (p) => p.clubId === s.playerClubId && !p.injury,
      )
      const pulseEntries = generateSquadPulseNotes(
        clubPlayersForPulse,
        userTrainingResults,
        pulseRng,
        s.currentRound,
        s.currentDate,
      )
      for (const { playerId, note } of pulseEntries) {
        const p = s.players[playerId]
        if (!p) continue
        if (!p.pulseNotes) p.pulseNotes = []
        p.pulseNotes.push(note)
        // Rolling window — keep last 10 notes
        if (p.pulseNotes.length > 10) p.pulseNotes.splice(0, 1)
      }
    })

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

  const openSpecialEventLiveView = (eventInstanceId: string, eventTitle: string) => {
    const state = useGameStore.getState()
    const instance = state.specialEvents?.events.find((e) => e.id === eventInstanceId)
    if (!instance || instance.status !== 'scheduled') return
    const simInput = buildSpecialEventSimInput(instance, state.players, state.rngSeed)
    setLastSpecialEventTitle(eventTitle)
    setLiveSpecialEvent({ instance, simInput })
  }

  const handleSimPreseasonEvent = () => {
    if (!nextEvent || nextEvent.type !== 'special-event') return
    const eventInstanceId = nextEvent.data?.specialEventId as string | undefined
    if (!eventInstanceId) return
    openSpecialEventLiveView(eventInstanceId, nextEvent.title)
  }

  // Unresolved special-event (e.g. SOO) that falls on or before the current date
  // while in the offseason phase — user should be able to simulate it directly.
  const pendingOffseasonSpecialEvent = useMemo(() => {
    if (!isOffseason) return null
    return calendar.events.find(
      (e) => !e.resolved && e.type === 'special-event' && e.date <= currentDate,
    ) ?? null
  }, [isOffseason, calendar.events, currentDate])

  const handleSimOffseasonSpecialEvent = () => {
    const evt = pendingOffseasonSpecialEvent
    if (!evt) return
    const eventInstanceId = evt.data?.specialEventId as string | undefined
    if (!eventInstanceId) return
    openSpecialEventLiveView(eventInstanceId, evt.title)
  }

  // Only 'delegate' mode silently auto-resolves. All other modes block and let the user decide.
  const autoResolveMatches = (settings.notifications.liveSimMode ?? 'always-live') === 'delegate'

  // --- Match-skip guard for day-advance actions ---
  // Returns the first unresolved match/special-event that would be skipped if
  // the calendar were advanced to proposedDate (i.e. its date falls strictly
  // between currentDate and proposedDate).
  const findSkippedMatch = useCallback(
    (proposedDate: string): import('@/types/calendar').GameEvent | null => {
      return (
        calendar.events.find(
          (e) =>
            !e.resolved &&
            (e.type === 'match' || e.type === 'special-event') &&
            e.date >= currentDate &&
            e.date < proposedDate,
        ) ?? null
      )
    },
    [calendar, currentDate],
  )

  const handleAdvanceOneDay = useCallback(() => {
    if (simming || simulationActive) return
    const proposed = addDays(currentDate, 1)
    const blocked = findSkippedMatch(proposed)
    if (blocked) {
      if (autoResolveMatches) {
        handleSimWeek()
      } else {
        setMatchBlockDialog(blocked)
      }
      return
    }
    advanceOneDay()
  }, [simming, simulationActive, currentDate, findSkippedMatch, autoResolveMatches, advanceOneDay])

  const handleSkipToNextEvent = useCallback(() => {
    if (simming || simulationActive) return
    const nextCalEvent = calendar.events.find((e) => !e.resolved && e.date > currentDate)
    const proposed = nextCalEvent?.date ?? currentDate
    const blocked = findSkippedMatch(proposed)
    if (blocked) {
      if (autoResolveMatches) {
        handleSimWeek()
      } else {
        setMatchBlockDialog(blocked)
      }
      return
    }
    advanceDateToNextCalendarEvent()
  }, [simming, simulationActive, calendar, currentDate, findSkippedMatch, autoResolveMatches, advanceDateToNextCalendarEvent])

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
  // True when the next thing to do is a preseason special event (before Round 1)
  const isPreseasonSpecialEvent = useMemo(() => {
    if (!nextEvent || nextEvent.type !== 'special-event') return false
    const seasonStart = settings.seasonStartDate ?? '2026-03-20'
    return nextEvent.date < seasonStart
  }, [nextEvent, settings.seasonStartDate])

  // Next match date derived from the season start and round schedule
  const nextMatchDate = useMemo(() => {
    if (phase === 'finals' || phase === 'post-season') return null
    if (!nextFixture) return null
    return getFixtureDateIso(settings.seasonStartDate, currentRound, nextFixture.matchDay)
  }, [settings.seasonStartDate, currentRound, phase, nextFixture])

  // For finals phase, derive the next match date from the calendar events
  const finalsMatchDate = useMemo(() => {
    if (phase !== 'finals') return null
    return (
      calendar.events.find(
        (e) => !e.resolved && e.type === 'match' && e.date >= effectiveDate,
      )?.date ?? null
    )
  }, [phase, calendar.events, effectiveDate])

  // Combined upcoming match date covering both regular season and finals
  const upcomingMatchDate = nextMatchDate ?? finalsMatchDate

  const daysToNextMatch = useMemo(() => {
    if (!upcomingMatchDate) return null
    const now  = new Date(effectiveDate      + 'T00:00:00').getTime()
    const then = new Date(upcomingMatchDate  + 'T00:00:00').getTime()
    return Math.max(0, Math.round((then - now) / 86_400_000))
  }, [effectiveDate, upcomingMatchDate])

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

  const squadPulseSummary = useMemo(() => {
    let primed = 0
    let concern = 0
    for (const p of Object.values(players)) {
      if (p.clubId !== playerClubId || p.injury) continue
      const lastNote = p.pulseNotes?.[p.pulseNotes.length - 1]
      if (!lastNote) continue
      if (lastNote.modifier >= 0.02) primed++
      else if (lastNote.modifier <= -0.025) concern++
    }
    return { primed, concern }
  }, [players, playerClubId])

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
    <div className="space-y-4">
      {/* Leadership Appointment Required banner */}
      {leadershipPending && (
        <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  Leadership Appointment Required
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Appoint your captain and leadership group before Round 1. Round simulation is blocked until complete.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate('/preseason-leadership')}>
              Appoint Now
            </Button>
          </CardContent>
        </Card>
      )}

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
                size="sm"
                className="h-7 w-7 px-0"
                onClick={() => setCustomiseOpen(true)}
                title="Customise dashboard"
              >
                <LayoutGrid className="h-4 w-4" />
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
                  ? `vs ${opponent?.abbreviation ?? opponentId} · #${ladderPosition} v #${opponentLadderPosition || '—'} · ${daysToNextMatch === null ? 'TBC' : daysToNextMatch === 0 ? 'Game day' : `${daysToNextMatch}d away`}`
                  : `Round ${currentRound + 1} of ${season.rounds.length}`
              }
            </p>
          </div>
          {!seasonComplete && (
            /* Unified time-advance controls — always visible */
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-1">
                <TooltipProvider delayDuration={300}>
                  {/* ½ Day (offseason) or 1 Day (regular) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="lg"
                        className="h-11 px-3.5"
                        onClick={isOffseason ? simHalfDay : handleAdvanceOneDay}
                        disabled={simming || simulationActive}
                      >
                        <Play className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isOffseason ? 'Sim Half Day' : 'Advance 1 Day'}</TooltipContent>
                  </Tooltip>
                  {/* Full Day (offseason) or Skip to Next Event (regular) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-11 px-3.5"
                        onClick={isOffseason ? simFullDay : handleSkipToNextEvent}
                        disabled={simming || simulationActive}
                      >
                        <FastForward className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isOffseason ? 'Sim Full Day' : 'Skip to Next Event'}</TooltipContent>
                  </Tooltip>
                  {/* To Next Milestone (offseason) or Simulate Round (regular) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-11 px-3.5"
                        onClick={isOffseason ? simToMilestone : handleSimWeek}
                        disabled={simming || simulationActive}
                      >
                        <SkipForward className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isOffseason ? 'Sim to Next Milestone' : 'Simulate Round'}</TooltipContent>
                  </Tooltip>
                  {/* Special event button — shown when an event is ready to simulate */}
                  {(pendingOffseasonSpecialEvent || isPreseasonSpecialEvent) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="lg"
                          className="h-11 px-3.5 bg-amber-600 hover:bg-amber-700"
                          onClick={pendingOffseasonSpecialEvent ? handleSimOffseasonSpecialEvent : handleSimPreseasonEvent}
                          disabled={simming || simulationActive}
                        >
                          <Moon className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Simulate: {pendingOffseasonSpecialEvent?.title ?? nextEvent?.title}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TooltipProvider>
              </div>
              {(pendingOffseasonSpecialEvent || isPreseasonSpecialEvent) ? (
                <span className="text-[10px] text-amber-500 font-medium">
                  Event ready: {pendingOffseasonSpecialEvent?.title ?? nextEvent?.title}
                </span>
              ) : nextEvent ? (
                <span className="text-[10px] text-muted-foreground">
                  Next: {nextEvent.title}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Match-skip block dialog */}
      <Dialog open={matchBlockDialog !== null} onOpenChange={(open) => { if (!open) setMatchBlockDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Match Resolution Required
            </DialogTitle>
            <DialogDescription>
              You have a match scheduled on <strong>{matchBlockDialog ? formatDate(matchBlockDialog.date) : ''}</strong> that must be resolved before you can advance past this point.
              <br /><br />
              Use <strong>Simulate Round</strong> to quick-resolve it now, or switch to <strong>Delegate</strong> mode in Live Sim Settings to allow automatic resolution.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => { setMatchBlockDialog(null); navigate('/game-settings') }}
            >
              <Cog className="h-4 w-4" />
              Settings
            </Button>
            <Button
              onClick={() => { setMatchBlockDialog(null); handleSimWeek() }}
            >
              <SkipForward className="mr-1.5 h-4 w-4" />
              Simulate Round
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Premier message */}
      {premierMsg && (
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardContent className="py-4 text-center">
            <Trophy className="mx-auto h-8 w-8 text-yellow-500 mb-2" />
            <p className="text-lg font-bold">{premierMsg}</p>
          </CardContent>
        </Card>
      )}

      {/* Match Engagement Reminder */}
      {!isOffseason && !seasonComplete && !isBye && (
        <MatchEngagementBanner
          daysToMatch={daysToNextMatch}
          matchDate={upcomingMatchDate}
          opponent={opponent}
          isHome={isHome}
          roundName={nextRound?.name ?? (phase === 'finals' ? `Finals Week ${season.finalsRounds.length + 1}` : null)}
          isFinals={phase === 'finals'}
          liveSimMode={settings.notifications.liveSimMode ?? 'always-live'}
          opponentColor={opponent?.colors.primary}
          onGoToMatchDay={() => navigate('/match-day')}
          onGoToLineup={() => navigate('/lineup')}
          onSimulate={handleSimWeek}
        />
      )}

      {/* Week Calendar */}
      <Card>
        <div className="flex items-center justify-between px-3 pt-0 pb-0">
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <p className="text-base font-semibold">{weekLabel}</p>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs font-medium"
              onClick={() => setWeekStart(getWeekStart(effectiveDate))}
            >
              Today
            </Button>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <CardContent className="px-4 pb-0 pt-0">
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const isSelected = day.date === selectedDate
              const daySchedule = weekSchedule[day.date]
              const isPastDay = day.isPast && !day.isToday

              return (
                <div
                  key={day.date}
                  onClick={() => setSelectedDate(day.date === selectedDate ? null : day.date)}
                  className={`
                    rounded-lg text-left transition-colors border min-h-[68px]
                    flex flex-col cursor-pointer
                    ${day.isToday
                      ? 'border-primary border-2 bg-primary/20 ring-2 ring-primary/50 shadow-lg shadow-primary/25'
                      : isSelected
                        ? 'border-accent-foreground/30 bg-accent'
                        : day.date === upcomingMatchDate && !isPastDay
                          ? 'border-amber-500/60 bg-amber-500/8 hover:bg-amber-500/12'
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
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
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
                  variant={scheduledSlotCount === 0 ? 'default' : 'outline'}
                  size="sm"
                  className={
                    scheduledSlotCount === 0
                      ? 'h-6 text-[10px] px-2 bg-amber-500 hover:bg-amber-600 text-white border-0 animate-pulse'
                      : 'h-6 text-[10px] px-2'
                  }
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
            <div className="mt-2 border-t pt-2">
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
                <div className="space-y-2">
                  {selectedEvents.map((evt) => {
                    // Find the played match for this calendar event
                    const playedMatch = evt.type === 'match' && evt.resolved
                      ? matchResults.find((m) =>
                          m.date === evt.date && m.result !== null &&
                          (m.homeClubId === playerClubId || m.awayClubId === playerClubId
                            ? true
                            : clubs[m.homeClubId] && clubs[m.awayClubId]),
                        )
                      : null

                    // Find the SOO instance for special-event types
                    const sooInstance = evt.type === 'special-event' && evt.data?.specialEventId
                      ? specialEvents?.events.find((e) => e.id === (evt.data?.specialEventId as string))
                      : null

                    return (
                      <div key={evt.id} className="rounded-md border bg-muted/20 p-2.5">
                        <div className="flex items-start gap-2">
                          <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${EVENT_COLORS[evt.type]}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-tight">{evt.title}</p>
                            {evt.description && (
                              <p className="text-xs text-muted-foreground">{evt.description}</p>
                            )}

                            {/* Past match score */}
                            {playedMatch?.result && (() => {
                              const isHome = playedMatch.homeClubId === playerClubId
                              const userScore = isHome ? playedMatch.result.homeTotalScore : playedMatch.result.awayTotalScore
                              const oppScore = isHome ? playedMatch.result.awayTotalScore : playedMatch.result.homeTotalScore
                              const won = userScore > oppScore
                              const lost = userScore < oppScore
                              return (
                                <div className="mt-1.5 space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-bold font-mono ${won ? 'text-green-500' : lost ? 'text-red-500' : 'text-muted-foreground'}`}>
                                      {won ? 'W' : lost ? 'L' : 'D'}
                                    </span>
                                    <span className="text-sm font-mono font-bold">
                                      {clubs[playedMatch.homeClubId]?.abbreviation} {playedMatch.result.homeTotalScore} – {playedMatch.result.awayTotalScore} {clubs[playedMatch.awayClubId]?.abbreviation}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    {playedMatch.result.homeScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
                                    {' vs '}
                                    {playedMatch.result.awayScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
                                  </div>
                                  <Button variant="link" size="sm" className="h-5 px-0 text-xs" onClick={() => navigate('/fixture')}>
                                    Full stats <ChevronRight className="ml-0.5 h-3 w-3" />
                                  </Button>
                                </div>
                              )
                            })()}

                            {/* Past SOO score */}
                            {sooInstance?.result && (() => {
                              const { teamAScore, teamBScore, bestOnGround } = sooInstance.result
                              const bog = bestOnGround ? players[bestOnGround] : null
                              return (
                                <div className="mt-1.5 space-y-0.5">
                                  <div className="text-sm font-mono font-bold">
                                    {sooInstance.teamA.name} {teamAScore.total} – {teamBScore.total} {sooInstance.teamB.name}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {teamAScore.goals}.{teamAScore.behinds} — {teamBScore.goals}.{teamBScore.behinds}
                                    {bog && ` · BOG: ${bog.firstName} ${bog.lastName}`}
                                  </div>
                                  <Button variant="link" size="sm" className="h-5 px-0 text-xs" onClick={() => navigate('/state-of-origin')}>
                                    View series <ChevronRight className="ml-0.5 h-3 w-3" />
                                  </Button>
                                </div>
                              )
                            })()}

                            {/* Fallback badge for non-match resolved events */}
                            {!playedMatch?.result && !sooInstance?.result && (
                              <Badge variant={evt.resolved ? 'secondary' : 'outline'} className="text-[10px] mt-0.5">
                                {evt.resolved ? 'Completed' : 'Upcoming'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Priority Row: Match Focus + Match Preview */}
      <div className="-mt-3 grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8">
      {isOffseason ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
          <OffseasonPhaseCard />
          <PhaseProgressCard />
        </div>
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
              isRivalry={isRivalry}
              allTimeH2H={allTimeH2H}
              playerClubId={playerClubId}
              clubs={clubs}
              matchResults={matchResults}
              bettingMarkets={bettingMarkets}
              bettingEnabled={settings.betting?.enabled ?? false}
              matchScoutReport={matchScoutReport}
              myMatchStorylines={myMatchStorylines}
              forecastWeather={forecastWeather}
            />
          )}
        </div>
        <div className="xl:col-span-4">
          {isOffseason ? (
            <PhaseProgressCard />
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pt-3 pb-2">
                <CardTitle className="text-sm font-medium">Ladder Position</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex items-center justify-center gap-3">
                  <div className="text-3xl font-bold tabular-nums">
                    {ladderPosition > 0 ? `${ladderPosition}${ordinal(ladderPosition)}` : '-'}
                  </div>
                  {ladderEntry ? (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>
                        <span className="font-semibold text-foreground">{ladderEntry.wins}W {ladderEntry.draws}D {ladderEntry.losses}L</span>
                        {' · '}
                        <span className="font-semibold text-foreground">{ladderEntry.points}</span> pts
                      </p>
                      <p>{ladderEntry.percentage.toFixed(1)}% · {ladderEntry.pointsFor} PF / {ladderEntry.pointsAgainst} PA</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Season not started</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          {/* Ladder progression sparkline — always visible */}
          {(() => {
            const hasData = ladderProgressionData.length >= 2
            const totalRoundsInSeason = season.rounds.filter((r) => !r.isFinals).length
            const h = 52
            const w = 240
            const padX = 4
            const innerW = w - padX * 2
            const innerH = h - 4
            const toY = (p: number) => 2 + ((p - 1) / 17) * innerH
            const toX = (r: number) => padX + ((r - 1) / (Math.max(totalRoundsInSeason - 1, 1))) * innerW
            const finalsLine = toY(8.5)
            const last = hasData ? ladderProgressionData[ladderProgressionData.length - 1] : null
            const first = hasData ? ladderProgressionData[0] : null
            const trending = hasData && last && first
              ? last.position < first.position ? 'up' : last.position > first.position ? 'down' : 'flat'
              : 'flat'
            const strokeColor = trending === 'up' ? '#22c55e' : trending === 'down' ? '#ef4444' : '#6b7280'
            const pts = hasData
              ? ladderProgressionData.map((d) => `${toX(d.round)},${toY(d.position)}`).join(' ')
              : ''
            return (
              <Card className="mt-2">
                <CardHeader className="py-2 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs text-muted-foreground font-medium">
                      {isOffseason ? 'Completed Season' : 'Season Position'}
                    </CardTitle>
                    {hasData && first && last && (
                      <span className="text-[10px] text-muted-foreground">R{first.round}–R{last.round}</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3 px-4">
                  {hasData ? (
                    <>
                      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }}>
                        <line x1={padX} y1={finalsLine} x2={w - padX} y2={finalsLine}
                          stroke="#22c55e" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
                        <line x1={padX} y1={toY(4.5)} x2={w - padX} y2={toY(4.5)}
                          stroke="#06b6d4" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
                        <polyline points={pts} fill="none" stroke={strokeColor} strokeWidth="1.8"
                          strokeLinecap="round" strokeLinejoin="round" />
                        {last && (
                          <>
                            <circle cx={toX(last.round)} cy={toY(last.position)} r="3" fill={strokeColor} />
                            <text x={toX(last.round) + 5} y={toY(last.position) + 1}
                              fontSize="8" fill={strokeColor} dominantBaseline="middle">
                              {last.position}{['st','nd','rd'][last.position - 1] ?? 'th'}
                            </text>
                          </>
                        )}
                        <text x={padX} y={toY(1)} fontSize="7" fill="currentColor" opacity="0.3" dominantBaseline="middle">1</text>
                        <text x={padX} y={toY(18)} fontSize="7" fill="currentColor" opacity="0.3" dominantBaseline="middle">18</text>
                      </svg>
                      <div className="flex gap-3 mt-1 text-[9px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-cyan-500/60 inline-block" />Top 4</span>
                        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-green-500/60 inline-block" />Finals</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground py-3 text-center">No games played yet</p>
                  )}
                </CardContent>
              </Card>
            )
          })()}
          {/* Historical position graph — always visible */}
          {(() => {
            const hasHistory = historicalPositionData.length >= 1
            const h = 52
            const w = 240
            const padX = 4
            const innerW = w - padX * 2
            const innerH = h - 4
            const toY = (p: number) => 2 + ((p - 1) / 17) * innerH
            const toX = (i: number) =>
              historicalPositionData.length <= 1
                ? w / 2
                : padX + (i / (historicalPositionData.length - 1)) * innerW
            const last = hasHistory ? historicalPositionData[historicalPositionData.length - 1] : null
            const avgPos = hasHistory
              ? historicalPositionData.reduce((s, d) => s + d.position, 0) / historicalPositionData.length
              : 0
            const finalsCount = historicalPositionData.filter((d) => d.position <= 8).length
            return (
              <Card className="mt-2">
                <CardHeader className="py-2 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs text-muted-foreground font-medium">Historical Position</CardTitle>
                    {hasHistory && last && (
                      <span className="text-[10px] text-muted-foreground">
                        {historicalPositionData.length === 1
                          ? String(historicalPositionData[0].year)
                          : `${historicalPositionData[0].year}–${last.year}`}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3 px-4">
                  {hasHistory ? (
                    <>
                      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }}>
                        <line x1={padX} y1={toY(8.5)} x2={w - padX} y2={toY(8.5)}
                          stroke="#22c55e" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
                        <line x1={padX} y1={toY(4.5)} x2={w - padX} y2={toY(4.5)}
                          stroke="#06b6d4" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
                        {historicalPositionData.length >= 2 && (
                          <>
                            <polyline
                              points={[
                                `${toX(0)},${h}`,
                                ...historicalPositionData.map((d, i) => `${toX(i)},${toY(d.position)}`),
                                `${toX(historicalPositionData.length - 1)},${h}`,
                              ].join(' ')}
                              fill="currentColor" className="text-primary/10"
                            />
                            <polyline
                              points={historicalPositionData.map((d, i) => `${toX(i)},${toY(d.position)}`).join(' ')}
                              fill="none" stroke="currentColor"
                              className="text-primary" strokeWidth="1.6"
                              strokeLinecap="round" strokeLinejoin="round"
                            />
                          </>
                        )}
                        {historicalPositionData.map((d, i) => (
                          <circle key={d.year} cx={toX(i)} cy={toY(d.position)} r="2.8"
                            fill="currentColor" className="text-primary" />
                        ))}
                        {historicalPositionData.map((d, i) => (
                          <text key={`yr-${d.year}`} x={toX(i)} y={h - 0.5}
                            fontSize="6.5" fill="currentColor" opacity="0.4"
                            textAnchor="middle" dominantBaseline="auto">{d.year}</text>
                        ))}
                        <text x={padX} y={toY(1)} fontSize="7" fill="currentColor" opacity="0.3" dominantBaseline="middle">1</text>
                        <text x={padX} y={toY(18)} fontSize="7" fill="currentColor" opacity="0.3" dominantBaseline="middle">18</text>
                      </svg>
                      <div className="flex gap-3 mt-1 text-[9px] text-muted-foreground">
                        <span>Avg: {avgPos.toFixed(1)}</span>
                        <span>Finals: {finalsCount}/{historicalPositionData.length}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground py-3 text-center">Complete a season to see history</p>
                  )}
                </CardContent>
              </Card>
            )
          })()}
        </div>
      </div>

      {/* Secondary: Ladder + Hub */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        {(() => {
          const userLadderIdx = ladder.findIndex((e) => e.clubId === playerClubId)
          const visibleItems = ladder.map((e, i) => ({ entry: e, idx: i }))
          const eighth = finalsQualifyingTeams > 0 ? ladder[finalsQualifyingTeams - 1] : null
          const ninth = finalsQualifyingTeams > 0 ? ladder[finalsQualifyingTeams] : null
          const userIsInFinalsZone = userLadderIdx >= 0 && userLadderIdx < finalsQualifyingTeams
          const userEntry = ladder[userLadderIdx]
          const ptGap = userEntry && eighth && ninth
            ? userIsInFinalsZone
              ? userEntry.points - (ninth?.points ?? 0)
              : (eighth?.points ?? 0) - userEntry.points
            : null
          return (
            <Card className="cursor-pointer" onClick={() => navigate('/ladder')}>
              <CardHeader className="px-4 pt-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Ladder Snapshot</CardTitle>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    Full Ladder <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  {hasTop4FinalsAdvantage && (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm bg-cyan-500/60" />Top 4
                    </span>
                  )}
                  {finalsQualifyingTeams > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm bg-emerald-500/50" />Finals
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-0.5 max-h-72 overflow-y-auto">
                  {visibleItems.map(({ entry, idx }, vi) => {
                    const ladderClub = clubs[entry.clubId]
                    const isPlayer = entry.clubId === playerClubId
                    const inFinalsZone = idx < finalsQualifyingTeams
                    const inTop4Zone = hasTop4FinalsAdvantage && idx < 4
                    const inLowerFinalsZone = inFinalsZone && !inTop4Zone
                    const isTop4CutLine = hasTop4FinalsAdvantage && idx === 3
                    const isFinalsCutLine = finalsQualifyingTeams > 0 && idx === finalsQualifyingTeams - 1
                    const isGapRow = vi > 0 && visibleItems[vi - 1].idx < idx - 1
                    return (
                      <div key={entry.clubId}>
                        {isGapRow && (
                          <div className="py-0.5 text-center text-[10px] text-muted-foreground">· · ·</div>
                        )}
                        <div
                          className={[
                            'flex items-center justify-between rounded px-2 py-1 text-sm',
                            inTop4Zone ? 'bg-cyan-500/10' : '',
                            inLowerFinalsZone ? 'bg-emerald-500/5' : '',
                            isPlayer ? 'bg-primary/10 ring-1 ring-primary/30 font-semibold' : '',
                            isTop4CutLine ? 'border-b border-dashed border-cyan-500/50' : '',
                            isFinalsCutLine ? 'border-b border-dashed border-emerald-500/40' : '',
                          ].join(' ')}
                        >
                          <div className="flex items-center gap-1">
                            <span className="w-5 text-right text-xs text-muted-foreground">{idx + 1}</span>
                            <div
                              className="h-3 w-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: ladderClub?.colors.primary }}
                            />
                            <span className="text-xs">{ladderClub?.abbreviation}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="tabular-nums">{entry.wins}-{entry.draws}-{entry.losses}</span>
                            <span className="w-11 text-right tabular-nums">{entry.percentage.toFixed(1)}%</span>
                            <span className="w-6 text-right font-semibold tabular-nums text-foreground">{entry.points}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Gap to finals boundary */}
                {ptGap !== null && finalsQualifyingTeams > 0 && ladder.length > finalsQualifyingTeams && (
                  <div className={`mt-2 text-center text-xs rounded px-2 py-1 ${userIsInFinalsZone ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'}`}>
                    {userIsInFinalsZone
                      ? `${ptGap} pts clear of ${finalsQualifyingTeams + 1}th`
                      : ptGap === 0
                        ? `Equal on points with ${finalsQualifyingTeams}th (percentage decides)`
                        : `${ptGap} pts behind ${finalsQualifyingTeams}th`}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })()}

        <div className="space-y-3">
        <Card>
          <CardHeader className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Upcoming Deadlines</CardTitle>
              {urgentDeadlineCount > 0 && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                  {urgentDeadlineCount} urgent
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {deadlineCountdowns.length > 0 ? (
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
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <span className={`text-xs font-semibold ${
                        dl.urgency === 'urgent' ? 'text-red-500'
                        : dl.urgency === 'warning' ? 'text-amber-500'
                        : 'text-muted-foreground'
                      }`}>
                        {dl.daysUntil === 0 ? 'Today' : dl.daysUntil === 1 ? 'Tomorrow' : `${dl.daysUntil}d`}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">
                        {new Date(dl.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">No upcoming deadlines</p>
            )}
          </CardContent>
        </Card>

        {/* Leadership Stability Meter — shown only when an active disruption exists */}
        {(() => {
          const disruption = leadershipDisruptions[playerClubId]
          if (!disruption) return null
          const stabilityPct = computeLeadershipStabilityPct(
            disruption.disruptionLevel,
            disruption.roundsRemaining,
            disruption.roundsToRecover,
          )
          const barColor = stabilityPct >= 70 ? 'bg-green-500' : stabilityPct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
          const textColor = stabilityPct >= 70 ? 'text-green-600 dark:text-green-400' : stabilityPct >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
          return (
            <Card
              className="cursor-pointer border-amber-500/40 hover:bg-accent/30 transition-colors"
              onClick={() => navigate(`/club/${playerClubId}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Leadership Stability
                  </CardTitle>
                  <span className={`text-sm font-bold tabular-nums ${textColor}`}>
                    {stabilityPct}%
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${stabilityPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {disruption.changeType === 'captain' ? 'Captaincy change'
                      : disruption.changeType === 'vice-captain' ? 'VC change'
                      : disruption.changeType === 'both' ? 'Full leadership reshuffle'
                      : 'Leadership group change'}
                    {disruption.incomingCaptainName && ` — ${disruption.incomingCaptainName} named captain`}
                  </span>
                  <span className="font-medium">
                    {disruption.roundsRemaining} rd{disruption.roundsRemaining !== 1 ? 's' : ''} left
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  On-field cohesion penalty active · Tap to manage leadership
                </p>
              </CardContent>
            </Card>
          )
        })()}
        </div>
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

      {/* Info Row: Recommended Actions + Finances + Media + Needs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
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

      {/* Preseason Special Event Result */}
      {lastSpecialResult && lastSpecialEventTitle && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{lastSpecialEventTitle}</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="flex items-center justify-center gap-6">
              <span className="font-bold">{lastSpecialResult.teamAScore.goals}.{lastSpecialResult.teamAScore.behinds}</span>
              <div className="text-center">
                <span className="text-xl font-bold font-mono">
                  {lastSpecialResult.teamAScore.total} – {lastSpecialResult.teamBScore.total}
                </span>
              </div>
              <span className="font-bold">{lastSpecialResult.teamBScore.goals}.{lastSpecialResult.teamBScore.behinds}</span>
            </div>
            {lastSpecialResult.userClubParticipants.length > 0 && (
              <p className="mt-1.5 text-center text-xs text-muted-foreground">
                {lastSpecialResult.userClubParticipants.length} of your players represented
              </p>
            )}
            <div className="mt-2 text-center">
              <Button variant="link" size="sm" onClick={() => navigate('/state-of-origin')}>
                View Series <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
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

      {/* Legacy & Dynasty widget */}
      {(phase === 'regular-season' || phase === 'finals' || phase === 'post-season') && legacyState.seasonsManaged > 0 && (() => {
        const { label, colour } = buildLegacyRating(legacyState.totalPoints)
        const activeGoal = careerObjectives.find((o) => o.status === 'active')
        const pct = activeGoal && activeGoal.targetValue > 0
          ? Math.min(100, (activeGoal.currentValue / activeGoal.targetValue) * 100)
          : 0
        return (
          <Card
            className="cursor-pointer hover:bg-accent/40 transition-colors"
            onClick={() => navigate('/legacy')}
          >
            <CardContent className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-400" />
                  <span className="text-sm font-semibold">Legacy &amp; Dynasty</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${colour}`}>{label}</span>
                  <Badge variant="outline" className="text-xs">
                    {legacyState.totalPoints.toLocaleString()} pts
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>🏆 {legacyState.premiershipsWon} flags</span>
                <span>{legacyState.allTimeWins}W career</span>
                {legacyState.currentWinStreak >= 3 && (
                  <span className="text-green-400">{legacyState.currentWinStreak}-game streak</span>
                )}
              </div>
              {activeGoal && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate">{activeGoal.title}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {activeGoal.currentValue}/{activeGoal.targetValue}
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* Post-premiership challenge modal */}
      <NewChallengeModal />

      {/* Live special event viewer — fullscreen overlay */}
      {liveSpecialEvent && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background/95 p-4">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-lg font-bold">{lastSpecialEventTitle}</h2>
            </div>
            <LiveMatchView
              simInput={liveSpecialEvent.simInput}
              userClubId={liveSpecialEvent.simInput.homeClubId}
              homeClub={liveSpecialEvent.simInput.clubs[liveSpecialEvent.simInput.homeClubId]}
              awayClub={liveSpecialEvent.simInput.clubs[liveSpecialEvent.simInput.awayClubId]}
              spectatorMode
              onComplete={(match) => {
                const r = match.result
                if (r) {
                  const inst = liveSpecialEvent.instance
                  const precomputed: import('@/types/specialEvents').SpecialEventMatchResult = {
                    teamAScore: {
                      goals: r.homeScores.reduce((s, q) => s + q.goals, 0),
                      behinds: r.homeScores.reduce((s, q) => s + q.behinds, 0),
                      total: r.homeTotalScore,
                    },
                    teamBScore: {
                      goals: r.awayScores.reduce((s, q) => s + q.goals, 0),
                      behinds: r.awayScores.reduce((s, q) => s + q.behinds, 0),
                      total: r.awayTotalScore,
                    },
                    userClubParticipants: [...inst.teamA.playerIds, ...inst.teamB.playerIds],
                    bestOnGround: [...r.homePlayerStats, ...r.awayPlayerStats]
                      .sort((a, b) =>
                        (b.goals * 6 + b.disposals + b.marks + b.tackles) -
                        (a.goals * 6 + a.disposals + a.marks + a.tackles)
                      )[0]?.playerId,
                  }
                  simSpecialEvent(inst.id, precomputed)
                }
                setLiveSpecialEvent(null)
              }}
              onCancel={() => setLiveSpecialEvent(null)}
            />
          </div>
        </div>
      )}

    </div>
  )
}

// ---------------------------------------------------------------------------
// Venue Popover
// ---------------------------------------------------------------------------

function VenuePopover({
  venue,
  playerClubId,
  matchResults,
  clubs,
}: {
  venue: string
  playerClubId: string
  matchResults: Match[]
  clubs: Record<string, Club>
}) {
  const venueMatches = matchResults
    .filter((m) => m.venue === venue && m.result !== null)
    .sort((a, b) => b.round - a.round)

  const userMatches = venueMatches.filter(
    (m) => m.homeClubId === playerClubId || m.awayClubId === playerClubId,
  )

  let w = 0, d = 0, l = 0
  for (const m of userMatches) {
    const isHome = m.homeClubId === playerClubId
    const userScore = isHome ? m.result!.homeTotalScore : m.result!.awayTotalScore
    const oppScore = isHome ? m.result!.awayTotalScore : m.result!.homeTotalScore
    if (userScore > oppScore) w++
    else if (userScore === oppScore) d++
    else l++
  }

  const recentGames = venueMatches.slice(0, 5)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="mt-3 mx-auto flex items-center gap-1.5 rounded px-2 py-0.5 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors">
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
          {venue}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="center">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-semibold">{venue}</p>
          <p className="text-xs text-muted-foreground">{venueMatches.length} game{venueMatches.length !== 1 ? 's' : ''} played here</p>
        </div>

        {userMatches.length > 0 && (
          <div className="border-b px-3 py-2.5">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Your record here</p>
            <div className="flex gap-4 text-sm font-semibold">
              <span className="text-green-500">{w}W</span>
              {d > 0 && <span className="text-muted-foreground">{d}D</span>}
              <span className="text-red-500">{l}L</span>
              <span className="ml-auto text-xs text-muted-foreground font-normal">
                {userMatches.length} game{userMatches.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        {recentGames.length > 0 ? (
          <div className="px-3 py-2.5 space-y-1.5">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Recent games here</p>
            {recentGames.map((m) => {
              const home = clubs[m.homeClubId]
              const away = clubs[m.awayClubId]
              const userInvolved = m.homeClubId === playerClubId || m.awayClubId === playerClubId
              return (
                <div key={m.id} className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${userInvolved ? 'bg-primary/8 font-medium' : ''}`}>
                  <span className="w-5 text-[10px] text-muted-foreground font-mono">R{m.round}</span>
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: home?.colors.primary ?? '#888' }}
                  />
                  <span className="flex-1 truncate">{home?.abbreviation ?? '?'}</span>
                  <span className="font-mono tabular-nums">
                    {m.result!.homeTotalScore}–{m.result!.awayTotalScore}
                  </span>
                  <span className="flex-1 truncate text-right">{away?.abbreviation ?? '?'}</span>
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: away?.colors.primary ?? '#888' }}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No games played at this venue yet
          </div>
        )}
      </PopoverContent>
    </Popover>
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
  isRivalry: boolean
  allTimeH2H: import('@/engine/history/h2hTracker').H2HPerspective | null
  playerClubId: string
  clubs: Record<string, Club>
  matchResults: Match[]
  matchScoutReport: import('@/engine/match/rivalScoutEngine').RivalScoutReport | null
  myMatchStorylines: import('@/engine/player/storyArc').PlayerStoryArc[]
  forecastWeather: MatchWeatherData | null
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
  isRivalry,
  allTimeH2H,
  playerClubId,
  clubs,
  matchResults,
  bettingMarkets,
  bettingEnabled,
  matchScoutReport,
  myMatchStorylines,
  forecastWeather,
}: MatchupCardProps) {
  const navigate = useNavigate()

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
          <div className="mt-4 space-y-2">
            <div className="flex justify-center gap-2">
              <Button onClick={onSimWeek} disabled={simming}>
                <Play className="mr-1 h-4 w-4" />
                Sim Week
              </Button>
              <ConfirmButton variant="outline" onConfirm={onSimToEnd} disabled={simming} confirmLabel="Click again to sim to finals">
                <FastForward className="mr-1 h-4 w-4" />
                Sim to Finals
              </ConfirmButton>
            </div>
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
    // Stats grid display order: home team always on left, away on right
    const leftPos    = isHome ? ladderPosition         : opponentLadderPosition
    const rightPos   = isHome ? opponentLadderPosition : ladderPosition
    const leftEntry  = isHome ? userLadderEntry        : opponentLadderEntry
    const rightEntry = isHome ? opponentLadderEntry    : userLadderEntry
    const leftForm   = isHome ? userForm               : opponentForm
    const rightForm  = isHome ? opponentForm           : userForm
    const leftPfPg   = isHome ? userPfPg               : oppPfPg
    const leftPaPg   = isHome ? userPaPg               : oppPaPg
    const rightPfPg  = isHome ? oppPfPg                : userPfPg
    const rightPaPg  = isHome ? oppPaPg                : userPaPg
    const daysToGame = (() => {
      if (!nextMatchDate) return null
      const now = new Date(currentDate + 'T00:00:00').getTime()
      const then = new Date(nextMatchDate + 'T00:00:00').getTime()
      const days = Math.round((then - now) / 86_400_000)
      return Math.max(0, days)
    })()
    const matchId = `match-${currentRound}-${nextFixture.homeClubId}-${nextFixture.awayClubId}`
    const market = bettingMarkets?.matchMarkets[matchId] ?? null
    const homeClub = clubs[nextFixture.homeClubId]
    const awayClub = clubs[nextFixture.awayClubId]

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        {/* Left: Match Focus */}
        <Card className="h-full flex flex-col">
          <CardHeader className="px-4 pt-3 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-sm font-medium">
                  Round {currentRound + 1} of {totalRounds}
                  {matchDayLabel ? ` · ${matchDayLabel}` : ''}
                </CardTitle>
                {nextMatchDate && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(nextMatchDate)} · {nextFixture.scheduledTime}
                    {daysToGame !== null && ` · ${daysToGame === 0 ? 'Game day' : `${daysToGame}d to go`}`}
                  </p>
                )}
              </div>
              {forecastWeather && (() => {
                const cond = forecastWeather.quarterWeather[0]?.condition ?? 'clear'
                const condIcon = cond === 'wet' ? <CloudRain className="h-3 w-3" />
                  : cond === 'windy' ? <Wind className="h-3 w-3" />
                  : cond === 'hot' ? <Thermometer className="h-3 w-3" />
                  : cond === 'humid' ? <Droplets className="h-3 w-3" />
                  : <Sun className="h-3 w-3" />
                const condLabel = cond.charAt(0).toUpperCase() + cond.slice(1)
                const rainfallMm = cond === 'wet'
                  ? ({ calm: 2, light: 5, moderate: 10, strong: 15, gale: 25 } as Record<string, number>)[forecastWeather.windStrength] ?? 5
                  : 0
                const windLabel = forecastWeather.windStrength === 'calm'
                  ? ''
                  : `${windStrengthLabel(forecastWeather.windStrength)} ${windDirectionArrow(forecastWeather.windDirection)}`
                return (
                  <div className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground shrink-0">
                    {condIcon}
                    <span>{condLabel}</span>
                    {rainfallMm > 0 && <span className="opacity-70">· {rainfallMm}mm</span>}
                    {windLabel && <span className="opacity-70">· {windLabel}</span>}
                  </div>
                )
              })()}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {/* Teams */}
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="h-10 w-10 rounded-full"
                  style={{ backgroundColor: (isHome ? club : opponent)?.colors.primary ?? '#666' }}
                />
                <span className="text-sm font-bold">
                  {(isHome ? club : opponent)?.abbreviation}
                </span>
                <Badge variant="secondary" className="text-[10px]">HOME</Badge>
              </div>
              <span className="text-xl font-bold text-muted-foreground">vs</span>
              <div className="flex flex-col items-center gap-1">
                <div
                  className="h-10 w-10 rounded-full"
                  style={{ backgroundColor: (isHome ? opponent : club)?.colors.primary ?? '#666' }}
                />
                <span className="text-sm font-bold">
                  {(isHome ? opponent : club)?.abbreviation}
                </span>
                <Badge variant="outline" className="text-[10px]">AWAY</Badge>
              </div>
            </div>

            <div className="flex justify-center mt-2">
              <VenuePopover
                venue={nextFixture.venue}
                playerClubId={playerClubId}
                matchResults={matchResults}
                clubs={clubs}
              />
            </div>

            {isRivalry && (
              <div className="mt-3 flex items-center justify-center gap-2 rounded border border-red-500/30 bg-red-500/8 px-3 py-2 text-xs font-semibold text-red-600">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                Rivalry Match
              </div>
            )}

            {/* Stats comparison — home team always on left */}
            <div className="mt-3 border-t pt-3">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="font-medium text-muted-foreground">{(isHome ? club : opponent)?.abbreviation}</div>
                <div className="font-medium text-muted-foreground">Stat</div>
                <div className="font-medium text-muted-foreground">{(isHome ? opponent : club)?.abbreviation}</div>

                <div className="font-semibold">
                  {leftPos > 0 ? `${leftPos}${ordinal(leftPos)}` : '-'}
                </div>
                <div className="text-muted-foreground">Position</div>
                <div className="font-semibold">
                  {rightPos > 0 ? `${rightPos}${ordinal(rightPos)}` : '-'}
                </div>

                <div>
                  {leftEntry
                    ? `${leftEntry.wins}-${leftEntry.draws}-${leftEntry.losses}`
                    : '-'}
                </div>
                <div className="text-muted-foreground">W-D-L</div>
                <div>
                  {rightEntry
                    ? `${rightEntry.wins}-${rightEntry.draws}-${rightEntry.losses}`
                    : '-'}
                </div>

                <div className="flex justify-center"><FormBadges form={leftForm} /></div>
                <div className="text-muted-foreground">Form</div>
                <div className="flex justify-center"><FormBadges form={rightForm} /></div>

                <div>{leftPfPg} / {leftPaPg}</div>
                <div className="text-muted-foreground">Avg PF/PA</div>
                <div>{rightPfPg} / {rightPaPg}</div>
              </div>

              {allTimeH2H && allTimeH2H.played > 0 && (
                <div className="mt-3 text-center text-xs text-muted-foreground border-t pt-2">
                  <span className="font-medium">All-time H2H: </span>
                  <span className="font-semibold text-green-600">{allTimeH2H.wins}W</span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span className="font-semibold">{allTimeH2H.draws}D</span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span className="font-semibold text-red-600">{allTimeH2H.losses}L</span>
                  {allTimeH2H.streak && allTimeH2H.streak.length >= 2 && (
                    <span className="ml-2 font-semibold">({allTimeH2H.streak.length}{allTimeH2H.streak.type} streak)</span>
                  )}
                </div>
              )}
              {headToHead && (
                <div className="mt-1 text-center text-xs text-muted-foreground">
                  <span className="font-medium">Last meeting: </span>
                  <span className="font-semibold text-foreground">{headToHead.userScore}</span>
                  {' - '}
                  <span className="font-semibold text-foreground">{headToHead.oppScore}</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <Button size="sm" onClick={() => navigate('/fixture')} variant="default" className="h-7 text-xs px-2.5">
                <Calendar className="mr-1 h-3.5 w-3.5" />
                Match Day
              </Button>
              <Button size="sm" onClick={onSimWeek} disabled={simming} variant="outline" className="h-7 text-xs px-2.5">
                <SkipForward className="mr-1 h-3.5 w-3.5" />
                Auto-Simulate
              </Button>
              <ConfirmButton size="sm" variant="ghost" onConfirm={onSimToEnd} disabled={simming} className="h-7 text-xs px-2.5 text-muted-foreground hover:text-foreground" confirmLabel="Click again to sim to finals">
                <FastForward className="mr-1 h-3.5 w-3.5" />
                Sim to Finals
              </ConfirmButton>
            </div>
          </CardContent>
        </Card>

        {/* Right: Media Match Preview */}
        <Card className="h-full flex flex-col">
          <CardHeader className="px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Match Preview</CardTitle>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate('/matchup-preview')}>
                Full Preview <ArrowRight className="ml-0.5 h-3 w-3 inline" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {homeClub?.abbreviation} (H) vs {awayClub?.abbreviation} (A) · {nextFixture.venue}
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {/* Win probability bar */}
            {(() => {
              let homeProb: number
              if (market) {
                const rawHome = 1 / market.homeOdds
                const rawTotal = rawHome + (1 / market.awayOdds)
                homeProb = rawHome / rawTotal
              } else {
                const homePos = isHome ? ladderPosition : opponentLadderPosition
                const awayPos = isHome ? opponentLadderPosition : ladderPosition
                const homeStr = Math.max(1, 19 - (homePos > 0 ? homePos : 9))
                const awayStr = Math.max(1, 19 - (awayPos > 0 ? awayPos : 9))
                homeProb = homeStr / (homeStr + awayStr)
              }
              const awayProb = 1 - homeProb
              const homeColor = homeClub?.colors?.primary ?? '#6b7280'
              const awayColor = awayClub?.colors?.primary ?? '#6b7280'
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>{homeClub?.abbreviation}</span>
                    <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wide">Win Probability</span>
                    <span>{awayClub?.abbreviation}</span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full border">
                    <div style={{ width: `${(homeProb * 100).toFixed(0)}%`, backgroundColor: homeColor }} />
                    <div style={{ width: `${(awayProb * 100).toFixed(0)}%`, backgroundColor: awayColor }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-semibold tabular-nums">{(homeProb * 100).toFixed(0)}%</span>
                    <span className="font-semibold tabular-nums">{(awayProb * 100).toFixed(0)}%</span>
                  </div>
                </div>
              )
            })()}

            {/* Compact betting odds */}
            {bettingEnabled && market && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Markets</p>
                <div className="rounded border divide-x grid text-center text-xs"
                  style={{ gridTemplateColumns: market.line !== 0 ? '1fr 1fr 1fr' : '1fr 1fr' }}>
                  <div className="px-2 py-1.5">
                    <p className="text-muted-foreground text-[10px] mb-0.5">{homeClub?.abbreviation}</p>
                    <p className="font-mono font-semibold tabular-nums">${market.homeOdds.toFixed(2)}</p>
                  </div>
                  {market.line !== 0 && (
                    <div className="px-2 py-1.5">
                      <p className="text-muted-foreground text-[10px] mb-0.5">Line</p>
                      <p className="font-mono font-semibold tabular-nums">
                        {market.line > 0 ? `-${market.line}` : `+${Math.abs(market.line)}`}
                      </p>
                    </div>
                  )}
                  <div className="px-2 py-1.5">
                    <p className="text-muted-foreground text-[10px] mb-0.5">{awayClub?.abbreviation}</p>
                    <p className="font-mono font-semibold tabular-nums">${market.awayOdds.toFixed(2)}</p>
                  </div>
                </div>
                {market.totalLine !== null && market.overOdds !== null && market.underOdds !== null && (
                  <div className="rounded border divide-x grid grid-cols-2 text-center text-xs">
                    <div className="px-2 py-1">
                      <span className="text-muted-foreground">O{market.totalLine} </span>
                      <span className="font-mono font-semibold tabular-nums">{market.overOdds.toFixed(2)}</span>
                    </div>
                    <div className="px-2 py-1">
                      <span className="text-muted-foreground">U{market.totalLine} </span>
                      <span className="font-mono font-semibold tabular-nums">{market.underOdds.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Scout report */}
            {matchScoutReport && (() => {
              const oppColor = opponent ? (clubs[opponent.id]?.colors.primary ?? '#6b7280') : '#6b7280'
              return (
              <div className="border-t pt-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Scout</p>
                <div className="flex items-start gap-2 text-xs">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-muted-foreground">{matchScoutReport.headline}</span>
                </div>
                {matchScoutReport.keyThreats[0] && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: oppColor }} />
                    <span className="text-muted-foreground">
                      <button
                        className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/70"
                        onClick={() => navigate(`/player/${matchScoutReport.keyThreats[0]!.playerId}`)}
                      >
                        {matchScoutReport.keyThreats[0].playerName}
                      </button>
                      {' — '}{matchScoutReport.keyThreats[0].reason}
                    </span>
                  </div>
                )}
              </div>
              )
            })()}

            {/* Media storylines */}
            {myMatchStorylines.length > 0 && (() => {
              const myColor = clubs[playerClubId]?.colors.primary ?? '#6b7280'
              return (
              <div className="border-t pt-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Media</p>
                {myMatchStorylines.slice(0, 2).map((arc) => {
                  const [firstName, ...restParts] = arc.playerName.split(' ')
                  const lastName = restParts.join(' ')
                  // Find earliest occurrence of full name, then last, then first
                  const candidates = [arc.playerName, lastName, firstName].filter(Boolean)
                  let nameStr = ''
                  let nameIdx = -1
                  for (const n of candidates) {
                    const i = arc.blurb.indexOf(n)
                    if (i !== -1 && (nameIdx === -1 || i < nameIdx)) {
                      nameStr = n
                      nameIdx = i
                    }
                  }
                  const before = nameIdx >= 0 ? arc.blurb.slice(0, nameIdx) : ''
                  const after = nameIdx >= 0 ? arc.blurb.slice(nameIdx + nameStr.length) : arc.blurb
                  return (
                    <div key={arc.playerId} className="flex items-start gap-2 text-xs">
                      <span
                        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: myColor }}
                      />
                      <span className="text-muted-foreground">
                        {before}
                        <button
                          className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/70"
                          onClick={() => navigate(`/player/${arc.playerId}`)}
                        >
                          {nameStr || arc.playerName}
                        </button>
                        {after}
                      </span>
                    </div>
                  )
                })}
              </div>
              )
            })()}

          </CardContent>
        </Card>
      </div>
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
