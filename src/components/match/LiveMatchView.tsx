import { useCallback, useRef, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TacticalTimeoutPanel } from '@/components/match/TacticalTimeoutPanel'
import { LiveScoreboard, type PlaybackSpeed } from '@/components/match/LiveScoreboard'
import { CommentaryFeed } from '@/components/match/CommentaryFeed'
import { InjuryStoppagePanel } from '@/components/match/InjuryStoppagePanel'
import { SpeechSystem } from '@/components/matchviewer/SpeechSystem'
import { useInterval } from '@/hooks/useInterval'
import {
  createMatchContext,
  simulateQuarterLive,
  finalizeMatch,
} from '@/engine/match/simulateMatch'
import type { MatchContext, SimulateMatchInput } from '@/engine/match/simulateMatch'
import {
  detectTacticalEvents,
  rollQuarterInjuries,
  applyQuarterInjury,
  getAvailableDecisions,
  applyMidMatchDecision,
  generateCoachSuggestions,
  applyGameplanSliders,
} from '@/engine/match/interactiveMatch'
import { SeededRNG } from '@/engine/core/rng'
import type { Match, MatchKeyEvent, MatchPlayerStats } from '@/types/match'
import type { MatchTick } from '@/types/matchTick'
import { ScoreWorm, QuarterMomentumBars } from '@/components/match/MatchCharts'
import { QuarterStatsSummary, type QuarterSnapshot } from '@/components/match/QuarterStatsSummary'
import { QuarterBreakPanel } from '@/components/match/QuarterBreakPanel'
import { PostMatchBoxScore } from '@/components/match/PostMatchBoxScore'
import { LiveStatsDashboard } from '@/components/match/LiveStatsDashboard'
import type { Club, ClubGameplan } from '@/types/club'
import type {
  TacticalEvent,
  MidMatchDecision,
  QuarterInjury,
  MidMatchAdjustment,
  CoachSuggestion,
  GameplanSliders,
} from '@/types/matchEvent'
import type { WeeklyMatchupTactics } from '@/types/game'
import type { SpeechTone, SpeechEffect, SpeechDelivery } from '@/engine/coach/speechEngine'
import { LiveFieldView, type FieldInstruction, type PlayPhase } from '@/components/match/LiveFieldView'
import { LiveInterchangePanel } from '@/components/match/LiveInterchangePanel'
import { FIELD_SLOTS_LANDSCAPE } from '@/components/lineup/fieldConstants'
import { PossessionChainView } from '@/components/match/PossessionChainView'
import { PreMatchLineupEditor } from '@/components/lineup/PreMatchLineupEditor'
import { PreMatchStrategyPanel, DEFAULT_GAMEPLAN } from '@/components/match/PreMatchStrategyPanel'
import { PreGameScreen } from '@/components/matchviewer/PreGameScreen'
import { generateMatchWeather } from '@/engine/match/weatherEngine'
import { venueHasRoof } from '@/data/venues'
import type { MatchWeatherData } from '@/engine/match/weatherEngine'
import type { H2HRecord } from '@/types/history'
import { Play, ChevronRight, MapPin, Users, X, BarChart3, UserRound, Wrench, MessageSquare } from 'lucide-react'
import { BenchTacticsPanel, type QueuedRotation } from '@/components/match/BenchTacticsPanel'
import { getOverallRating } from '@/engine/player/playerRating'
import { VENUES } from '@/data/venues'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatchPhase = 'pre-match' | 'playing' | 'quarter-break' | 'complete'

type StoppageState =
  | null
  | { type: 'goal'; tick: MatchTick }
  | { type: 'injury'; injury: QuarterInjury }

// Snapshot used for quarter-break / complete rendering
interface BreakDisplayState {
  homeClubId: string
  awayClubId: string
  venue: string
  weather: string
  groundCondition: string
  quartersCompleted: number
  homeScores: Array<{ goals: number; behinds: number; total: number }>
  awayScores: Array<{ goals: number; behinds: number; total: number }>
  homeTotalScore: number
  awayTotalScore: number
  keyEvents: MatchKeyEvent[]
  tacticalEvents: TacticalEvent[]
  availableDecisions: MidMatchDecision[]
  quarterInjuries: QuarterInjury[]
  subAvailable: boolean
  subActivated: boolean
  adjustmentsMade: MidMatchAdjustment[]
  attendance?: number
  coachSuggestions: CoachSuggestion[]
  userGameplanSnapshot: {
    tempo: 'fast' | 'medium' | 'slow'
    centreTactic: 'spread' | 'balanced' | 'cluster'
    defensiveLine: 'press' | 'zone' | 'hold' | 'run'
    stoppageTactic: 'spread' | 'balanced' | 'cluster'
  } | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBreakDisplay(
  ctx: MatchContext,
  events: TacticalEvent[],
  decisions: MidMatchDecision[],
  injuries: QuarterInjury[],
  adjustments: MidMatchAdjustment[],
  userClubId: string,
  coachSuggestions: CoachSuggestion[] = [],
): BreakDisplayState {
  const isHome = userClubId === ctx.input.homeClubId
  const sub = isHome ? ctx.homeSubstitute : ctx.awaySubstitute
  const gp = isHome ? ctx.resolvedHomeGameplan : ctx.resolvedAwayGameplan
  return {
    homeClubId: ctx.input.homeClubId,
    awayClubId: ctx.input.awayClubId,
    venue: ctx.input.venue,
    weather: ctx.weather.condition,
    groundCondition: ctx.weather.groundCondition,
    quartersCompleted: ctx.quartersCompleted,
    homeScores: [...ctx.homeScores],
    awayScores: [...ctx.awayScores],
    homeTotalScore: ctx.currentHomeTotal,
    awayTotalScore: ctx.currentAwayTotal,
    keyEvents: [...ctx.keyEvents],
    tacticalEvents: events,
    availableDecisions: decisions,
    quarterInjuries: injuries,
    subAvailable: !!sub && ctx.substitutesEnabled && !ctx.userSubActivated,
    subActivated: ctx.userSubActivated,
    adjustmentsMade: adjustments,
    coachSuggestions,
    userGameplanSnapshot: {
      tempo: gp.tempo ?? 'medium',
      centreTactic: (gp.centreTactic ?? 'balanced') as 'spread' | 'balanced' | 'cluster',
      defensiveLine: (gp.defensiveLine ?? 'hold') as 'press' | 'zone' | 'hold' | 'run',
      stoppageTactic: (gp.stoppageTactic ?? 'balanced') as 'spread' | 'balanced' | 'cluster',
    },
    attendance: ctx.attendanceResult?.attendance,
  }
}

function emptyBreakDisplay(): BreakDisplayState {
  return {
    homeClubId: '', awayClubId: '', venue: '', weather: '', groundCondition: '',
    quartersCompleted: 0, homeScores: [], awayScores: [],
    homeTotalScore: 0, awayTotalScore: 0, keyEvents: [],
    tacticalEvents: [], availableDecisions: [], quarterInjuries: [],
    subAvailable: false, subActivated: false, adjustmentsMade: [],
    coachSuggestions: [], userGameplanSnapshot: null,
  }
}

function QuarterScoreBar({
  homeScores, awayScores, homeAbbr, awayAbbr,
}: {
  homeScores: Array<{ goals: number; behinds: number; total: number }>
  awayScores: Array<{ goals: number; behinds: number; total: number }>
  homeAbbr: string
  awayAbbr: string
}) {
  if (homeScores.length === 0) return null
  return (
    <div className="mt-2 text-xs font-mono text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="w-10 text-right font-medium">{homeAbbr}</span>
        {homeScores.map((q, i) => (
          <span key={`h-${i}`} className="w-10 text-center">{q.goals}.{q.behinds}</span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-10 text-right font-medium">{awayAbbr}</span>
        {awayScores.map((q, i) => (
          <span key={`a-${i}`} className="w-10 text-center">{q.goals}.{q.behinds}</span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LiveMatchViewProps {
  simInput: SimulateMatchInput
  userClubId: string
  homeClub: Club | undefined
  awayClub: Club | undefined
  onComplete: (match: Match) => void
  onCancel: () => void
  /** When true, suppress the tactical timeout panel at quarter breaks (spectator/exhibition mode). */
  spectatorMode?: boolean
  /** Slot lineups for the interactive field view (slot → playerId). */
  homeSlotLineup?: Record<string, string>
  awaySlotLineup?: Record<string, string>
  homeGameplan?: ClubGameplan | null
  awayGameplan?: ClubGameplan | null
  homeMatchupTactics?: WeeklyMatchupTactics | null
  /** All season match results — used for form guide in the pre-game screen. */
  matchResults?: Match[]
  /** H2H records for the pre-game screen. */
  h2hRecords?: Record<string, H2HRecord>
  /** Show betting odds in the pre-game screen (only when betting is enabled). */
  showOdds?: boolean
  homeOdds?: number
  awayOdds?: number
  line?: number
  homeLineOdds?: number
  awayLineOdds?: number
  totalLine?: number
  overOdds?: number
  underOdds?: number
  /** Called whenever the user changes the lineup in the pre-match editor. */
  onPreMatchLineupChange?: (lineup: Record<string, string>) => void
  /** Current matchup tactics (tags/physical) for pre-match strategy tab. */
  preMatchMatchupTactics?: WeeklyMatchupTactics | null
  /** Called when the user changes matchup tactics in the pre-match strategy tab. */
  onPreMatchMatchupTactics?: (tactics: WeeklyMatchupTactics) => void
}

const SPEED_MS: Record<PlaybackSpeed, number | null> = {
  paused: null,
  slow: 1500,
  normal: 500,
  fast: 100,
}

export function LiveMatchView({
  simInput,
  userClubId,
  homeClub,
  awayClub,
  onComplete,
  onCancel,
  spectatorMode = false,
  homeSlotLineup,
  awaySlotLineup,
  homeGameplan,
  awayGameplan,
  homeMatchupTactics,
  matchResults,
  h2hRecords,
  showOdds = false,
  homeOdds,
  awayOdds,
  line,
  homeLineOdds,
  awayLineOdds,
  totalLine,
  overOdds,
  underOdds,
  onPreMatchLineupChange,
  preMatchMatchupTactics,
  onPreMatchMatchupTactics,
}: LiveMatchViewProps) {
  // Core refs
  const ctxRef = useRef<MatchContext | null>(null)
  const finalMatchRef = useRef<Match | null>(null)
  const allInjuriesRef = useRef<QuarterInjury[]>([])
  const allAdjustmentsRef = useRef<MidMatchAdjustment[]>([])
  const quarterSnapshotsRef = useRef<QuarterSnapshot[]>([])
  const currentQInjuriesRef = useRef<QuarterInjury[]>([])
  const quarterBreakPlayerIdsRef = useRef<string[]>([])

  // Tick playback refs (mutated at high frequency — not state)
  const ticksRef = useRef<MatchTick[]>([])
  const tickIndexRef = useRef(0)

  // React state
  const [phase, setPhase] = useState<MatchPhase>('pre-match')
  const [completeMatch, setCompleteMatch] = useState<Match | null>(null)
  const [breakDisplay, setBreakDisplay] = useState<BreakDisplayState>(emptyBreakDisplay)
  const [speed, setSpeed] = useState<PlaybackSpeed>('normal')
  const [displayTickIndex, setDisplayTickIndex] = useState(0)
  const [liveHomeScore, setLiveHomeScore] = useState(0)
  const [liveAwayScore, setLiveAwayScore] = useState(0)
  const [liveMinute, setLiveMinute] = useState(0)
  const [liveQuarter, setLiveQuarter] = useState(1)
  const [stoppageState, setStoppageState] = useState<StoppageState>(null)
  const [preMatchTab, setPreMatchTab] = useState<'overview' | 'lineup' | 'strategy'>('overview')
  const [coinTossFlipped, setCoinTossFlipped] = useState(false)
  // Which team kicked with the wind in Q1 (= coin toss winner). Null until match begins.
  const [kickingEndState, setKickingEndState] = useState<'home' | 'away' | null>(null)
  // Pre-match gameplan override — user sets it in the Strategy tab, applied when match begins
  const [preMatchGameplan, setPreMatchGameplan] = useState<ClubGameplan | null>(
    () => (userClubId === simInput.homeClubId ? homeGameplan : awayGameplan) ?? null,
  )
  // Rotations planned pre-game — seeded into queuedRotations when the match starts
  const [plannedRotations, setPlannedRotations] = useState<QueuedRotation[]>([])
  // Live match tactical state — applied at the next quarter break via handleContinue
  const [queuedRotations, setQueuedRotations] = useState<QueuedRotation[]>([])
  const [pendingSliders, setPendingSliders] = useState<GameplanSliders | null>(null)
  // Sidebar tab for the playing phase command panel
  type SidebarTab = 'stats' | 'players' | 'tactics' | 'commentary'
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('stats')
  // Speech system state
  const [breakSubStage, setBreakSubStage] = useState<'speech' | 'strategy'>('speech')
  const [toneHistory, setToneHistory] = useState<Partial<Record<SpeechTone, number>>>({})

  const homeAbbr = homeClub?.abbreviation ?? 'HOM'
  const awayAbbr = awayClub?.abbreviation ?? 'AWY'
  const homeColor = homeClub?.colors.primary ?? '#6b7280'
  const awayColor = awayClub?.colors.primary ?? '#9ca3af'
  const snapshots = quarterSnapshotsRef.current

  // Pre-game weather — same seed offset as MatchViewerPage so conditions are consistent
  const weatherData = useMemo<MatchWeatherData | null>(() => {
    const rng = new SeededRNG(simInput.seed + 8888)
    return generateMatchWeather(rng, simInput.venueId, venueHasRoof(simInput.venueId, simInput.venueRoofOverrides, simInput.venue, simInput.customStadiums))
  }, [simInput.seed, simInput.venueId, simInput.venue, simInput.customStadiums])

  const venueEnds = simInput.venueId ? VENUES[simInput.venueId]?.ends : undefined

  const matchClubs = useMemo(() => {
    const c: Record<string, typeof homeClub & object> = {}
    if (homeClub) c[simInput.homeClubId] = homeClub
    if (awayClub) c[simInput.awayClubId] = awayClub
    return c as Record<string, import('@/types/club').Club>
  }, [homeClub, awayClub, simInput.homeClubId, simInput.awayClubId])

  // ---------------------------------------------------------------------------
  // Quarter snapshot
  // ---------------------------------------------------------------------------

  function pushQuarterSnapshot(ctx: MatchContext) {
    quarterSnapshotsRef.current = [
      ...quarterSnapshotsRef.current,
      {
        home: ctx.homeStats.map((s: MatchPlayerStats) => ({ ...s })),
        away: ctx.awayStats.map((s: MatchPlayerStats) => ({ ...s })),
      },
    ]
  }

  // ---------------------------------------------------------------------------
  // Quarter complete (ticks exhausted)
  // ---------------------------------------------------------------------------

  const handleQuarterComplete = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return

    const isHome = userClubId === ctx.input.homeClubId
    const gp = isHome ? ctx.resolvedHomeGameplan : ctx.resolvedAwayGameplan
    ctx.effectiveAggressionQuarters.push(gp.aggression ?? 'medium')

    if (ctx.quartersCompleted >= ctx.quartersPerMatch) {
      const match = finalizeMatch(ctx, ctx.userSubActivated ? (isHome ? 'home' : 'away') : undefined)
      const d = buildBreakDisplay(ctx, [], [], currentQInjuriesRef.current, allAdjustmentsRef.current, userClubId)
      setBreakDisplay({
        ...d,
        homeTotalScore: match.result?.homeTotalScore ?? ctx.currentHomeTotal,
        awayTotalScore: match.result?.awayTotalScore ?? ctx.currentAwayTotal,
      })
      finalMatchRef.current = match
      setCompleteMatch(match)
      setPhase('complete')
      return
    }

    const qNum = ctx.quartersCompleted
    const events = detectTacticalEvents(ctx, userClubId, qNum)
    const decisions = getAvailableDecisions(ctx, events, userClubId)
    const suggestions = generateCoachSuggestions(ctx, userClubId)
    const qInjuries = currentQInjuriesRef.current

    // Capture active player IDs for speech system
    const isHomeUser = userClubId === ctx.input.homeClubId
    const userStats = isHomeUser ? ctx.homeStats : ctx.awayStats
    quarterBreakPlayerIdsRef.current = userStats.map((s: MatchPlayerStats) => s.playerId)

    setBreakDisplay(buildBreakDisplay(ctx, events, decisions, qInjuries, allAdjustmentsRef.current, userClubId, suggestions))
    setBreakSubStage('speech')
    setPhase('quarter-break')
  }, [userClubId])

  // ---------------------------------------------------------------------------
  // Advance one tick
  // ---------------------------------------------------------------------------

  const advanceTick = useCallback(() => {
    const ticks = ticksRef.current
    const idx = tickIndexRef.current
    if (idx >= ticks.length) {
      handleQuarterComplete()
      return
    }
    const tick = ticks[idx]
    tickIndexRef.current = idx + 1
    setDisplayTickIndex(idx + 1)
    setLiveHomeScore(tick.homeScore)
    setLiveAwayScore(tick.awayScore)
    setLiveMinute(tick.minute)

    if (tick.isStoppage && !spectatorMode) {
      // Goal stoppages no longer trigger a decision panel — just let play continue.
      if (tick.stoppageType === 'injury' && tick.injuryPlayerId) {
        const inj = currentQInjuriesRef.current.find((i) => i.playerId === tick.injuryPlayerId)
        if (inj && inj.clubId === userClubId) {
          setStoppageState({ type: 'injury', injury: inj })
        }
      }
    }
  }, [handleQuarterComplete, userClubId])

  // ---------------------------------------------------------------------------
  // Skip to quarter end
  // ---------------------------------------------------------------------------

  const skipToQuarterEnd = useCallback(() => {
    const ticks = ticksRef.current
    if (ticks.length === 0) return
    const last = ticks[ticks.length - 1]
    tickIndexRef.current = ticks.length
    setDisplayTickIndex(ticks.length)
    setLiveHomeScore(last.homeScore)
    setLiveAwayScore(last.awayScore)
    setLiveMinute(30)
    setStoppageState(null)
    handleQuarterComplete()
  }, [handleQuarterComplete])

  // ---------------------------------------------------------------------------
  // Interval
  // ---------------------------------------------------------------------------

  useInterval(
    () => {
      if (stoppageState) return
      advanceTick()
    },
    phase === 'playing' ? SPEED_MS[speed] : null,
  )

  // ---------------------------------------------------------------------------
  // Begin quarter: simulate + pre-roll injuries + generate ticks
  // ---------------------------------------------------------------------------

  const beginQuarter = useCallback((quarterIndex: number) => {
    const ctx = ctxRef.current
    if (!ctx) return

    // Pre-roll injuries so they appear as stoppages in the tick stream
    const injuries = rollQuarterInjuries(ctx, userClubId, quarterIndex + 1, simInput.injuryFrequency)
    for (const inj of injuries) applyQuarterInjury(ctx, inj)
    allInjuriesRef.current = [...allInjuriesRef.current, ...injuries]
    currentQInjuriesRef.current = injuries

    // Unified chain engine: simulates the quarter AND produces ticks directly
    const ticks = simulateQuarterLive(ctx, quarterIndex)
    pushQuarterSnapshot(ctx)

    // Cumulative score at start of this quarter (for initial display)
    let homeStartTotal = 0, awayStartTotal = 0
    for (let q = 0; q < quarterIndex; q++) {
      homeStartTotal += ctx.homeScores[q].total
      awayStartTotal += ctx.awayScores[q].total
    }

    ticksRef.current = ticks
    tickIndexRef.current = 0
    setDisplayTickIndex(0)
    setLiveHomeScore(homeStartTotal)
    setLiveAwayScore(awayStartTotal)
    setLiveMinute(0)
    setLiveQuarter(quarterIndex + 1)
    setStoppageState(null)
    // Start paused — user chooses when to begin playback
    setSpeed(quarterIndex === 0 ? 'normal' : 'paused')
    setPhase('playing')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simInput, userClubId])

  // ---------------------------------------------------------------------------
  // Begin match
  // ---------------------------------------------------------------------------

  const handleBeginMatch = useCallback((kickingEnd?: 'home' | 'away') => {
    setKickingEndState(kickingEnd ?? null)
    const inputWithOverride: SimulateMatchInput = preMatchGameplan
      ? {
          ...simInput,
          gameplanOverrides: {
            ...simInput.gameplanOverrides,
            [userClubId]: preMatchGameplan,
          },
        }
      : simInput
    const ctx = createMatchContext(inputWithOverride)
    ctxRef.current = ctx
    allInjuriesRef.current = []
    allAdjustmentsRef.current = []
    quarterSnapshotsRef.current = []
    currentQInjuriesRef.current = []
    // Seed BenchTacticsPanel's queue with any rotations planned in the Strategy tab
    setQueuedRotations(plannedRotations)
    beginQuarter(0)
  }, [simInput, beginQuarter, preMatchGameplan, userClubId, plannedRotations])

  // ---------------------------------------------------------------------------
  // Quarter-break: continue
  // ---------------------------------------------------------------------------

  const handleContinue = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const nextQ = ctx.quartersCompleted
    if (nextQ >= ctx.quartersPerMatch) {
      const match = finalMatchRef.current
      finalMatchRef.current = null
      if (match) onComplete(match)
      return
    }

    // Apply any rotations queued from the Bench & Tactics panel
    if (queuedRotations.length > 0) {
      const isHome = ctx.input.homeClubId === userClubId
      const activeArr = isHome ? ctx.homeActivePlayers : ctx.awayActivePlayers
      for (const { onId, offId } of queuedRotations) {
        const offIdx = activeArr.findIndex((p) => p.id === offId)
        if (offIdx >= 0) {
          const onPlayer = Object.values(ctx.input.players).find((p) => p.id === onId)
          if (onPlayer) activeArr[offIdx] = onPlayer
        }
      }
      setQueuedRotations([])
    }

    // Apply pending gameplan slider changes from the Bench & Tactics panel
    if (pendingSliders) {
      applyGameplanSliders(ctx, pendingSliders, userClubId)
      setPendingSliders(null)
    }

    beginQuarter(nextQ)
  }, [beginQuarter, onComplete, queuedRotations, pendingSliders, userClubId])

  // ---------------------------------------------------------------------------
  // Final continue
  // ---------------------------------------------------------------------------

  const handleFinalContinue = useCallback(() => {
    const match = finalMatchRef.current
    finalMatchRef.current = null
    if (match) onComplete(match)
  }, [onComplete])

  // ---------------------------------------------------------------------------
  // Quarter-break decisions
  // ---------------------------------------------------------------------------

  const handleDecision = useCallback((decision: MidMatchDecision) => {
    const ctx = ctxRef.current
    if (!ctx) return
    applyMidMatchDecision(ctx, decision, userClubId)
    allAdjustmentsRef.current = [...ctx.midMatchAdjustments]
    const events = detectTacticalEvents(ctx, userClubId, ctx.quartersCompleted)
    const decisions = getAvailableDecisions(ctx, events, userClubId)
    const suggestions = generateCoachSuggestions(ctx, userClubId)
    setBreakDisplay(buildBreakDisplay(ctx, events, decisions, currentQInjuriesRef.current, allAdjustmentsRef.current, userClubId, suggestions))
  }, [userClubId])

  const handleApplySliders = useCallback((sliders: GameplanSliders) => {
    const ctx = ctxRef.current
    if (!ctx) return
    applyGameplanSliders(ctx, sliders, userClubId)
    allAdjustmentsRef.current = [...ctx.midMatchAdjustments]
    const events = detectTacticalEvents(ctx, userClubId, ctx.quartersCompleted)
    const decisions = getAvailableDecisions(ctx, events, userClubId)
    const suggestions = generateCoachSuggestions(ctx, userClubId)
    setBreakDisplay(buildBreakDisplay(ctx, events, decisions, currentQInjuriesRef.current, allAdjustmentsRef.current, userClubId, suggestions))
  }, [userClubId])

  // ---------------------------------------------------------------------------
  // Speech system handlers
  // ---------------------------------------------------------------------------

  const handleSpeechDeliver = useCallback((effects: SpeechEffect[], delivery: SpeechDelivery) => {
    void effects // effects shown by SpeechSystem itself; parent just tracks tone history
    setToneHistory((prev) => {
      const updated = { ...prev }
      for (const speech of delivery.speeches) {
        updated[speech.tone] = (updated[speech.tone] ?? 0) + 1
      }
      return updated
    })
  }, [])

  const handleSpeechContinue = useCallback(() => {
    setBreakSubStage('strategy')
  }, [])

  // ---------------------------------------------------------------------------
  // Injury stoppage actions
  // ---------------------------------------------------------------------------

  const handleActivateSub = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx || ctx.userSubActivated) return
    const isHome = userClubId === ctx.input.homeClubId
    const sub = isHome ? ctx.homeSubstitute : ctx.awaySubstitute
    if (!sub) return
    const subDecision: MidMatchDecision = {
      id: 'activate-sub',
      type: 'activate-sub',
      label: 'Activate Sub',
      description: `Bring on ${sub.firstName} ${sub.lastName}.`,
    }
    applyMidMatchDecision(ctx, subDecision, userClubId)
    allAdjustmentsRef.current = [...ctx.midMatchAdjustments]
    setStoppageState(null)
  }, [userClubId])

  const handleStoppageContinue = useCallback(() => {
    setStoppageState(null)
  }, [])

  // Sub name for injury panel
  const subName = useMemo(() => {
    const ctx = ctxRef.current
    if (!ctx) return null
    const isHome = userClubId === ctx.input.homeClubId
    const sub = isHome ? ctx.homeSubstitute : ctx.awaySubstitute
    return sub ? `${sub.firstName} ${sub.lastName}` : null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userClubId, stoppageState])

  const isSubActivated = ctxRef.current?.userSubActivated ?? false

  // ---------------------------------------------------------------------------
  // Field view derived props
  // ---------------------------------------------------------------------------

  const userIsHome = userClubId === simInput.homeClubId
  // Fall back to simInput slot maps so spectator matches still have players on the field
  const baseUserSlotLineup = userIsHome
    ? (homeSlotLineup ?? simInput.homeLineupSlots ?? {})
    : (awaySlotLineup ?? simInput.awayLineupSlots ?? {})

  // Live interchange overrides — track swaps made during the match
  const [liveLineupOverrides, setLiveLineupOverrides] = useState<Record<string, string>>({})
  const [runningOffAnim, setRunningOffAnim] = useState<{ top: number; left: number; color: string } | null>(null)

  // Effective lineup merges base with any live interchanges
  const userSlotLineup = useMemo(
    () => ({ ...baseUserSlotLineup, ...liveLineupOverrides }),
    [baseUserSlotLineup, liveLineupOverrides],
  )

  // Handle drag-drop interchange from LiveInterchangePanel
  const handleInterchange = useCallback((slotA: string, slotB: string) => {
    const playerA = userSlotLineup[slotA]
    const playerB = userSlotLineup[slotB]
    if (!playerA || !playerB) return

    // Find the field slot (not bench) for the running-off animation
    const fieldSlotId = FIELD_SLOTS_LANDSCAPE.find((s) => s.slot === slotA || s.slot === slotB)
      ?.slot === slotA ? slotA : slotB
    const fieldSlotPos = FIELD_SLOTS_LANDSCAPE.find((s) => s.slot === fieldSlotId)
    if (fieldSlotPos) {
      setRunningOffAnim({
        top: fieldSlotPos.top,
        left: fieldSlotPos.left,
        color: userIsHome ? homeColor : awayColor,
      })
      setTimeout(() => setRunningOffAnim(null), 1100)
    }

    setLiveLineupOverrides((prev) => ({ ...prev, [slotA]: playerB, [slotB]: playerA }))
  }, [userSlotLineup, userIsHome, homeColor, awayColor])

  // Derive current possession chain for field overlay
  const latestChainTick = ticksRef.current[displayTickIndex - 1] ?? null
  const currentChainId = latestChainTick?.chainId ?? -1
  const possessionChain: MatchTick[] = displayTickIndex > 0
    ? ticksRef.current
        .slice(0, displayTickIndex)
        .filter((t) =>
          t.chainId === currentChainId &&
          t.possessionType !== 'goal' &&
          t.possessionType !== 'behind' &&
          t.possessionType !== 'injury' &&
          t.possessionType !== 'interchange',
        )
    : []
  const chainTeamColor = latestChainTick
    ? (latestChainTick.clubId === simInput.homeClubId ? homeColor : awayColor)
    : undefined

  // Derive play phase from current tick zone — drives player drift and zone overlays
  const livePlayPhase: PlayPhase = (() => {
    if (!latestChainTick) return 'midfield'
    const { possessionType, zone, clubId } = latestChainTick
    if (possessionType === 'clearance' || possessionType === 'ball-up') return 'stoppage'
    const isUserPossession = clubId === userClubId
    if (zone === 'forward50' || zone === 'forwardHalf') {
      return isUserPossession ? 'attack' : 'defense'
    }
    if (zone === 'back50' || zone === 'backHalf') {
      return isUserPossession ? 'defense' : 'attack'
    }
    return 'midfield'
  })()
  const opponentSlotLineup = userIsHome
    ? (awaySlotLineup ?? simInput.awayLineupSlots ?? {})
    : (homeSlotLineup ?? simInput.homeLineupSlots ?? {})
  const fieldGameplan = userIsHome ? (homeGameplan ?? null) : (awayGameplan ?? null)
  const fieldMatchupTactics = userIsHome ? (homeMatchupTactics ?? null) : null

  // Attacking direction: coin toss winner kicks with wind in Q1. We map the winner's team to
  // "attacks right" in Q1 and flip each subsequent quarter (teams swap ends after every quarter).
  const userAttacksRightQ1 = kickingEndState === null
    ? true // default before coin toss resolves
    : (userIsHome ? kickingEndState === 'home' : kickingEndState === 'away')
  const teamAttacksRight = userAttacksRightQ1 === (liveQuarter % 2 === 1)

  // Players for strategy panel — user's assigned starters + bench, and opposition lineup
  const userLineupPlayersForStrategy = useMemo(() => {
    return Object.values(userSlotLineup)
      .filter(Boolean)
      .map((id) => simInput.players[id])
      .filter((p): p is NonNullable<typeof p> => !!p)
  }, [userSlotLineup, simInput.players])

  const oppositionPlayersForStrategy = useMemo(() => {
    const oppClubId = userIsHome ? simInput.awayClubId : simInput.homeClubId
    return Object.values(simInput.players)
      .filter((p) => p.clubId === oppClubId && !p.injury)
      .sort((a, b) => {
        // Starters first (in opponentSlotLineup), then bench, then rest by OVR
        const aInLineup = Object.values(opponentSlotLineup).includes(a.id)
        const bInLineup = Object.values(opponentSlotLineup).includes(b.id)
        if (aInLineup !== bInLineup) return aInLineup ? -1 : 1
        return getOverallRating(b) - getOverallRating(a)
      })
  }, [simInput.players, simInput.awayClubId, simInput.homeClubId, userIsHome, opponentSlotLineup])

  const emptyMatchupTactics = useMemo<WeeklyMatchupTactics>(
    () => ({ hardTags: [], physicalAttention: [], roleAssignments: [] }),
    [],
  )

  const handleFieldInstruction = useCallback((adj: FieldInstruction) => {
    const quarter = ctxRef.current?.quartersCompleted ?? liveQuarter
    allAdjustmentsRef.current = [
      ...allAdjustmentsRef.current,
      {
        quarter,
        decisionType: adj.type === 'tag-change'
          ? 'tag-switch'
          : adj.type === 'position-swap'
            ? 'move-player-forward'
            : 'stay-course',
        description: adj.note,
      },
    ]
  }, [liveQuarter])

  // Chart props for quarter-break / complete
  const wormProps = useMemo(() => ({
    keyEvents: breakDisplay.keyEvents,
    homeScores: breakDisplay.homeScores,
    awayScores: breakDisplay.awayScores,
    homeClubId: breakDisplay.homeClubId,
    homeColor, awayColor, homeAbbr, awayAbbr,
    quartersCompleted: breakDisplay.quartersCompleted,
  }), [breakDisplay.keyEvents, breakDisplay.homeScores, breakDisplay.awayScores,
      breakDisplay.homeClubId, homeColor, awayColor, homeAbbr, awayAbbr,
      breakDisplay.quartersCompleted])

  // ---------------------------------------------------------------------------
  // Score header (shared between quarter-break and complete)
  // ---------------------------------------------------------------------------

  function renderScoreHeader(labelBadge: React.ReactNode) {
    return (
      <div className="rounded-md border p-4 text-center">
        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <div className="h-10 w-10 rounded-full border border-white/20" style={{ backgroundColor: homeColor }} />
            <span className="text-sm font-bold">{homeAbbr}</span>
          </div>
          <div>
            <div className="text-3xl font-bold tabular-nums">
              {breakDisplay.homeTotalScore} – {breakDisplay.awayTotalScore}
            </div>
            {labelBadge}
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="h-10 w-10 rounded-full border border-white/20" style={{ backgroundColor: awayColor }} />
            <span className="text-sm font-bold">{awayAbbr}</span>
          </div>
        </div>
        <QuarterScoreBar
          homeScores={breakDisplay.homeScores}
          awayScores={breakDisplay.awayScores}
          homeAbbr={homeAbbr}
          awayAbbr={awayAbbr}
        />
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
          {breakDisplay.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {breakDisplay.venue}
            </span>
          )}
          {breakDisplay.weather && <span>{breakDisplay.weather}, {breakDisplay.groundCondition}</span>}
          {breakDisplay.attendance != null && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {breakDisplay.attendance.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Card className="border-primary/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Play className="h-4 w-4" />
          {phase === 'pre-match' ? 'Pre-Match' : 'Live Match'}
        </CardTitle>
        {phase === 'pre-match' && (
          <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">

        {/* PRE-MATCH — Overview | Lineup | Strategy tabs */}
        {phase === 'pre-match' && (
          <>
            {/* Tab bar — extra tabs only for the user's own match */}
            {!spectatorMode && (
              <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
                {(['overview', 'lineup', 'strategy'] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`flex-1 py-1.5 capitalize transition-colors ${preMatchTab === tab ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted'}`}
                    onClick={() => setPreMatchTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}

            {/* Overview tab — form guide, H2H, conditions, coin toss */}
            {(spectatorMode || preMatchTab === 'overview') && (
              <PreGameScreen
                homeClubId={simInput.homeClubId}
                awayClubId={simInput.awayClubId}
                venue={simInput.venue}
                round={(simInput.round ?? 0) + 1}
                isUserMatch={!spectatorMode}
                userClubId={userClubId}
                clubs={simInput.clubs}
                players={simInput.players}
                matchResults={matchResults ?? []}
                h2hRecords={h2hRecords ?? {}}
                weatherData={weatherData}
                seed={simInput.seed}
                showOdds={showOdds}
                homeOdds={homeOdds}
                awayOdds={awayOdds}
                line={line}
                homeLineOdds={homeLineOdds}
                awayLineOdds={awayLineOdds}
                totalLine={totalLine}
                overOdds={overOdds}
                underOdds={underOdds}
                venueEnds={venueEnds}
                onKickOff={handleBeginMatch}
                onBack={onCancel}
                coinTossFlipped={coinTossFlipped}
                onCoinTossFlipped={() => setCoinTossFlipped(true)}
              />
            )}

            {/* Lineup tab — landscape field (with bench) + squad list sidebar */}
            {!spectatorMode && preMatchTab === 'lineup' && (
              <div className="space-y-3">
                <PreMatchLineupEditor
                  lineup={userSlotLineup}
                  players={simInput.players}
                  clubs={matchClubs}
                  userClubId={userClubId}
                  interchangeCount={simInput.matchRules?.interchangePlayers ?? 5}
                  oppositionClubId={userIsHome ? simInput.awayClubId : simInput.homeClubId}
                  onLineupChange={(newLineup) => onPreMatchLineupChange?.(newLineup)}
                  matchupTactics={preMatchMatchupTactics ?? emptyMatchupTactics}
                  onMatchupTacticsChange={(tactics) => onPreMatchMatchupTactics?.(tactics)}
                />
                <div className="flex justify-center pt-1">
                  <button
                    className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    onClick={() => setPreMatchTab('overview')}
                  >
                    Proceed to Kick-Off →
                  </button>
                </div>
              </div>
            )}

            {/* Strategy tab — hard tags + physical pressure assignments */}
            {!spectatorMode && preMatchTab === 'strategy' && (
              <div className="space-y-3">
                <PreMatchStrategyPanel
                  userLineupPlayers={userLineupPlayersForStrategy}
                  oppositionPlayers={oppositionPlayersForStrategy}
                  matchupTactics={preMatchMatchupTactics ?? emptyMatchupTactics}
                  onTacticsChange={(tactics) => onPreMatchMatchupTactics?.(tactics)}
                  gameplan={preMatchGameplan ?? DEFAULT_GAMEPLAN}
                  onGameplanChange={setPreMatchGameplan}
                  userSlotLineup={userSlotLineup}
                  interchangeCount={simInput.matchRules?.interchangePlayers ?? 5}
                  plannedRotations={plannedRotations}
                  onPlannedRotationsChange={setPlannedRotations}
                />
                <div className="flex justify-center pt-1">
                  <button
                    className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    onClick={() => setPreMatchTab('overview')}
                  >
                    Proceed to Kick-Off →
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* PLAYING — live tick view */}
        {phase === 'playing' && (
          <>
            <LiveScoreboard
              homeName={homeClub?.name ?? homeAbbr}
              awayName={awayClub?.name ?? awayAbbr}
              homeAbbr={homeAbbr}
              awayAbbr={awayAbbr}
              homeColor={homeColor}
              awayColor={awayColor}
              homeScore={liveHomeScore}
              awayScore={liveAwayScore}
              quarter={liveQuarter}
              minute={liveMinute}
              speed={stoppageState ? 'paused' : speed}
              onSpeedChange={(s) => {
                setSpeed(s)
                if (stoppageState) setStoppageState(null)
              }}
              onSkip={skipToQuarterEnd}
              onStep={advanceTick}
            />

            {/* Possession chain + commentary banner — merged into one compact row */}
            <div className="flex flex-col lg:flex-row rounded-md border overflow-hidden">
              <div className="flex-[3] min-w-0">
                <PossessionChainView
                  ticks={ticksRef.current}
                  currentIndex={displayTickIndex}
                  homeClubId={simInput.homeClubId}
                  homeColor={homeColor}
                  awayColor={awayColor}
                  homeAbbr={homeAbbr}
                  awayAbbr={awayAbbr}
                  noBorder
                />
              </div>
              {latestChainTick && (
                <div
                  key={displayTickIndex}
                  className="flex-[2] min-w-0 border-t lg:border-t-0 lg:border-l px-3 py-2"
                  style={{ borderLeftWidth: 3, borderLeftColor: chainTeamColor ?? '#6b7280' }}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: chainTeamColor ?? '#6b7280' }}
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {latestChainTick.clubId === simInput.homeClubId ? homeAbbr : awayAbbr}
                      {' · Q'}{latestChainTick.quarter} {latestChainTick.minute}'
                    </span>
                  </div>
                  <p className="text-xs font-medium leading-snug line-clamp-2">{latestChainTick.commentary}</p>
                </div>
              )}
            </div>

            {!spectatorMode && stoppageState?.type === 'injury' && (
              <InjuryStoppagePanel
                injury={stoppageState.injury}
                subName={subName}
                subActivated={isSubActivated}
                onActivateSub={handleActivateSub}
                onContinue={handleStoppageContinue}
              />
            )}

            {/* ── Main play area: field (left) + tabbed command panel (right) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-2 items-start">

              {/* Left column: animated field view */}
              <div>
                <LiveFieldView
                  userSlotLineup={userSlotLineup}
                  opponentSlotLineup={opponentSlotLineup}
                  players={simInput.players}
                  userClub={userIsHome ? homeClub : awayClub}
                  opponentClub={userIsHome ? awayClub : homeClub}
                  userClubId={userClubId}
                  userGameplan={fieldGameplan}
                  userMatchupTactics={spectatorMode ? null : fieldMatchupTactics}
                  matchPhase="simulating-quarter"
                  quartersCompleted={liveQuarter - 1}
                  recentKeyEvents={[]}
                  ballCarrierPlayerId={ticksRef.current[displayTickIndex - 1]?.playerId}
                  ballZone={ticksRef.current[displayTickIndex - 1]?.zone}
                  possessionChain={possessionChain}
                  chainTeamColor={chainTeamColor}
                  livePlayPhase={livePlayPhase}
                  teamAttacksRight={teamAttacksRight}
                  runningOffAnim={spectatorMode ? null : runningOffAnim}
                  paused={speed === 'paused'}
                  onInstruction={spectatorMode ? () => {} : handleFieldInstruction}
                />

                {/* Interchange panel — below the field, user only */}
                {!spectatorMode && (
                  <LiveInterchangePanel
                    slotLineup={userSlotLineup}
                    players={simInput.players}
                    club={userIsHome ? homeClub : awayClub}
                    interchangeCount={simInput.matchRules?.interchangePlayers ?? 4}
                    onInterchange={handleInterchange}
                  />
                )}
              </div>

              {/* Right column: tabbed command panel */}
              <div className="rounded-md border bg-card overflow-hidden lg:sticky lg:top-2 flex flex-col" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
                {/* Tab bar */}
                <div className="flex border-b text-[11px] font-medium shrink-0">
                  {([
                    { id: 'stats' as const, icon: BarChart3, label: 'Stats' },
                    { id: 'players' as const, icon: UserRound, label: 'Players' },
                    ...(!spectatorMode ? [{ id: 'tactics' as const, icon: Wrench, label: 'Tactics' }] : []),
                    { id: 'commentary' as const, icon: MessageSquare, label: 'Feed' },
                  ] as Array<{ id: SidebarTab; icon: typeof BarChart3; label: string }>).map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSidebarTab(id)}
                      className={[
                        'flex-1 py-1.5 flex items-center justify-center gap-1 transition-colors',
                        sidebarTab === id
                          ? 'bg-muted/60 text-foreground border-b-2 border-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                      ].join(' ')}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab content — fills available height with scrolling */}
                <div className="flex-1 overflow-y-auto p-2.5">
                  {/* Stats tab */}
                  {sidebarTab === 'stats' && (
                    <LiveStatsDashboard
                      ctx={ctxRef.current}
                      liveQuarter={liveQuarter}
                      liveMinute={liveMinute}
                      displayTickIndex={displayTickIndex}
                      totalTicks={ticksRef.current.length}
                      quarterSnapshots={snapshots}
                      homeClub={homeClub}
                      awayClub={awayClub}
                      homeColor={homeColor}
                      awayColor={awayColor}
                      homeAbbr={homeAbbr}
                      awayAbbr={awayAbbr}
                      userClubId={userClubId}
                      players={simInput.players}
                      activeView="match"
                    />
                  )}

                  {/* Players tab */}
                  {sidebarTab === 'players' && (
                    <LiveStatsDashboard
                      ctx={ctxRef.current}
                      liveQuarter={liveQuarter}
                      liveMinute={liveMinute}
                      displayTickIndex={displayTickIndex}
                      totalTicks={ticksRef.current.length}
                      quarterSnapshots={snapshots}
                      homeClub={homeClub}
                      awayClub={awayClub}
                      homeColor={homeColor}
                      awayColor={awayColor}
                      homeAbbr={homeAbbr}
                      awayAbbr={awayAbbr}
                      userClubId={userClubId}
                      players={simInput.players}
                      activeView="players"
                    />
                  )}

                  {/* Tactics tab (user matches only) */}
                  {sidebarTab === 'tactics' && !spectatorMode && (
                    <BenchTacticsPanel
                      ctx={ctxRef.current}
                      userIsHome={userIsHome}
                      userSlotLineup={userSlotLineup}
                      players={simInput.players}
                      interchangeCount={simInput.matchRules?.interchangePlayers ?? 5}
                      homeColor={homeColor}
                      awayColor={awayColor}
                      homeAbbr={homeAbbr}
                      awayAbbr={awayAbbr}
                      queuedRotations={queuedRotations}
                      onQueueRotation={(onId, offId) =>
                        setQueuedRotations((prev) => [...prev, { onId, offId }])
                      }
                      onCancelRotation={(idx) =>
                        setQueuedRotations((prev) => prev.filter((_, i) => i !== idx))
                      }
                      pendingSliders={pendingSliders}
                      onSlidersChange={setPendingSliders}
                      embedded
                    />
                  )}

                  {/* Commentary tab */}
                  {sidebarTab === 'commentary' && (
                    <CommentaryFeed
                      ticks={ticksRef.current}
                      currentIndex={displayTickIndex}
                      homeColor={homeColor}
                      awayColor={awayColor}
                      homeClubId={simInput.homeClubId}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* QUARTER-BREAK */}
        {phase === 'quarter-break' && (
          <>
            {renderScoreHeader(
              <Badge variant="secondary" className="mt-1">
                {breakDisplay.quartersCompleted === 1 ? 'Quarter Time' :
                 breakDisplay.quartersCompleted === 2 ? 'Half Time' :
                 breakDisplay.quartersCompleted === 3 ? 'Three Quarter Time' : 'Break'}
              </Badge>
            )}

            {breakDisplay.quartersCompleted > 0 && (
              <QuarterBreakPanel
                snapshots={snapshots}
                quartersCompleted={breakDisplay.quartersCompleted}
                keyEvents={breakDisplay.keyEvents}
                homeScores={breakDisplay.homeScores}
                awayScores={breakDisplay.awayScores}
                players={simInput.players}
                homeClubId={breakDisplay.homeClubId}
                awayClubId={breakDisplay.awayClubId}
                homeColor={homeColor}
                awayColor={awayColor}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
              />
            )}

            {spectatorMode ? (
              <div className="flex justify-center pt-2">
                <Button onClick={handleContinue} className="px-8">
                  <Play className="mr-2 h-4 w-4" />
                  {breakDisplay.quartersCompleted >= 4 ? 'Full Time' : 'Continue'}
                </Button>
              </div>
            ) : breakSubStage === 'speech' ? (
              <SpeechSystem
                quarter={breakDisplay.quartersCompleted}
                homeScore={breakDisplay.homeTotalScore}
                awayScore={breakDisplay.awayTotalScore}
                userIsHome={userIsHome}
                userClubId={userClubId}
                players={simInput.players}
                userActivePlayerIds={quarterBreakPlayerIdsRef.current}
                seed={simInput.seed}
                toneHistory={toneHistory}
                onDeliver={handleSpeechDeliver}
                onContinue={handleSpeechContinue}
              />
            ) : (
              <TacticalTimeoutPanel
                quarter={breakDisplay.quartersCompleted}
                keyEvents={breakDisplay.keyEvents}
                tacticalEvents={breakDisplay.tacticalEvents}
                decisions={breakDisplay.availableDecisions}
                injuries={breakDisplay.quarterInjuries}
                adjustmentsMade={breakDisplay.adjustmentsMade}
                subAvailable={breakDisplay.subAvailable}
                subActivated={breakDisplay.subActivated}
                coachSuggestions={breakDisplay.coachSuggestions}
                userGameplanSnapshot={breakDisplay.userGameplanSnapshot}
                snapshots={snapshots}
                players={simInput.players}
                homeClubId={breakDisplay.homeClubId}
                awayClubId={breakDisplay.awayClubId}
                homeColor={homeColor}
                awayColor={awayColor}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
                homeQScore={breakDisplay.homeScores[breakDisplay.quartersCompleted - 1]}
                awayQScore={breakDisplay.awayScores[breakDisplay.quartersCompleted - 1]}
                onDecision={handleDecision}
                onApplySliders={handleApplySliders}
                onContinue={handleContinue}
                quartersPerMatch={4}
              />
            )}
          </>
        )}

        {/* COMPLETE */}
        {phase === 'complete' && (
          <>
            {renderScoreHeader(<Badge className="mt-1">Full Time</Badge>)}

            <ScoreWorm {...wormProps} />

            <QuarterMomentumBars
              homeScores={breakDisplay.homeScores}
              awayScores={breakDisplay.awayScores}
              homeColor={homeColor}
              awayColor={awayColor}
              homeAbbr={homeAbbr}
              awayAbbr={awayAbbr}
            />

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quarter Breakdown</div>
              {[1, 2, 3, 4].map((q) =>
                snapshots[q - 1] ? (
                  <QuarterStatsSummary
                    key={q}
                    snapshots={snapshots}
                    quarterNumber={q}
                    players={simInput.players}
                    homeClubId={breakDisplay.homeClubId}
                    awayClubId={breakDisplay.awayClubId}
                    homeColor={homeColor}
                    awayColor={awayColor}
                    homeAbbr={homeAbbr}
                    awayAbbr={awayAbbr}
                    homeQScore={breakDisplay.homeScores[q - 1]}
                    awayQScore={breakDisplay.awayScores[q - 1]}
                  />
                ) : null,
              )}
            </div>


            {breakDisplay.adjustmentsMade.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tactical Changes</div>
                {breakDisplay.adjustmentsMade.map((adj, i) => (
                  <div key={i} className="rounded border border-border/50 px-2 py-1 text-xs text-muted-foreground">
                    Q{adj.quarter}: {adj.description}
                  </div>
                ))}
              </div>
            )}

            {completeMatch && completeMatch.result && (
              <PostMatchBoxScore
                match={completeMatch}
                clubs={matchClubs}
                players={simInput.players}
                playerClubId={userClubId}
              />
            )}

            <div className="flex justify-end">
              <Button onClick={handleFinalContinue} className="gap-2">
                <ChevronRight className="h-4 w-4" />
                Continue
              </Button>
            </div>
          </>
        )}

      </CardContent>
    </Card>
  )
}
