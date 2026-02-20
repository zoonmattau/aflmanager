import { useCallback, useRef, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TacticalTimeoutPanel } from '@/components/match/TacticalTimeoutPanel'
import { LiveScoreboard, type PlaybackSpeed } from '@/components/match/LiveScoreboard'
import { CommentaryFeed } from '@/components/match/CommentaryFeed'
import { GoalStoppagePanel } from '@/components/match/GoalStoppagePanel'
import { InjuryStoppagePanel } from '@/components/match/InjuryStoppagePanel'
import { useInterval } from '@/hooks/useInterval'
import {
  createMatchContext,
  simulateQuarter,
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
import { generateQuarterTicks } from '@/engine/match/tickEngine'
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
import { LiveFieldView, type FieldInstruction } from '@/components/match/LiveFieldView'
import { Play, ChevronRight, MapPin, Users, X } from 'lucide-react'

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
}: LiveMatchViewProps) {
  // Core refs
  const ctxRef = useRef<MatchContext | null>(null)
  const finalMatchRef = useRef<Match | null>(null)
  const allInjuriesRef = useRef<QuarterInjury[]>([])
  const allAdjustmentsRef = useRef<MidMatchAdjustment[]>([])
  const quarterSnapshotsRef = useRef<QuarterSnapshot[]>([])
  const currentQInjuriesRef = useRef<QuarterInjury[]>([])

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
  const [activeTab, setActiveTab] = useState<'field' | 'events' | 'stats'>('field')

  const homeAbbr = homeClub?.abbreviation ?? 'HOM'
  const awayAbbr = awayClub?.abbreviation ?? 'AWY'
  const homeColor = homeClub?.colors.primary ?? '#6b7280'
  const awayColor = awayClub?.colors.primary ?? '#9ca3af'
  const snapshots = quarterSnapshotsRef.current

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

    setBreakDisplay(buildBreakDisplay(ctx, events, decisions, qInjuries, allAdjustmentsRef.current, userClubId, suggestions))
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
      if (tick.stoppageType === 'goal') {
        setStoppageState({ type: 'goal', tick })
      } else if (tick.stoppageType === 'injury' && tick.injuryPlayerId) {
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

    simulateQuarter(ctx, quarterIndex)
    pushQuarterSnapshot(ctx)

    // Pre-roll injuries so they appear as stoppages in the tick stream
    const injuries = rollQuarterInjuries(ctx, userClubId, quarterIndex + 1, simInput.injuryFrequency)
    for (const inj of injuries) applyQuarterInjury(ctx, inj)
    allInjuriesRef.current = [...allInjuriesRef.current, ...injuries]
    currentQInjuriesRef.current = injuries

    // Player name lookup
    const playerNames: Record<string, string> = {}
    for (const p of Object.values(simInput.players)) {
      playerNames[p.id] = `${p.firstName} ${p.lastName}`
    }

    // Cumulative score at start of this quarter
    let homeGoalsStart = 0, homeBehindsStart = 0
    let awayGoalsStart = 0, awayBehindsStart = 0
    for (let q = 0; q < quarterIndex; q++) {
      homeGoalsStart += ctx.homeScores[q].goals
      homeBehindsStart += ctx.homeScores[q].behinds
      awayGoalsStart += ctx.awayScores[q].goals
      awayBehindsStart += ctx.awayScores[q].behinds
    }
    const homeStartTotal = homeGoalsStart * 6 + homeBehindsStart
    const awayStartTotal = awayGoalsStart * 6 + awayBehindsStart
    const qHomeScore = ctx.homeScores[quarterIndex]
    const qAwayScore = ctx.awayScores[quarterIndex]

    const displayRng = new SeededRNG(simInput.seed + 9999 + quarterIndex * 1111)
    const ticks = generateQuarterTicks(
      {
        keyEvents: ctx.keyEvents,
        quarterIndex,
        homeClubId: ctx.input.homeClubId,
        awayClubId: ctx.input.awayClubId,
        homeAbbr,
        awayAbbr,
        playerNames,
        homeScoreAtStart: { goals: homeGoalsStart, behinds: homeBehindsStart, total: homeStartTotal },
        awayScoreAtStart: { goals: awayGoalsStart, behinds: awayBehindsStart, total: awayStartTotal },
        quarterHomeScore: qHomeScore,
        quarterAwayScore: qAwayScore,
      },
      displayRng,
    )

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
  }, [simInput, userClubId, homeAbbr, awayAbbr])

  // ---------------------------------------------------------------------------
  // Begin match
  // ---------------------------------------------------------------------------

  const handleBeginMatch = useCallback(() => {
    const ctx = createMatchContext(simInput)
    ctxRef.current = ctx
    allInjuriesRef.current = []
    allAdjustmentsRef.current = []
    quarterSnapshotsRef.current = []
    currentQInjuriesRef.current = []
    beginQuarter(0)
  }, [simInput, beginQuarter])

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
    beginQuarter(nextQ)
  }, [beginQuarter, onComplete])

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
  // Goal stoppage decision (mid-play)
  // ---------------------------------------------------------------------------

  const handleGoalDecision = useCallback((decision: MidMatchDecision) => {
    const ctx = ctxRef.current
    if (!ctx) return
    applyMidMatchDecision(ctx, decision, userClubId)
    allAdjustmentsRef.current = [...ctx.midMatchAdjustments]
    setStoppageState(null)
  }, [userClubId])

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

  // ---------------------------------------------------------------------------
  // Derived values for goal stoppage panel
  // ---------------------------------------------------------------------------

  const goalStoppageInfo = useMemo(() => {
    if (!stoppageState || stoppageState.type !== 'goal') return null
    const tick = stoppageState.tick
    const ctx = ctxRef.current
    const isHome = userClubId === (ctx?.input.homeClubId ?? '')
    const userScore = isHome ? tick.homeScore : tick.awayScore
    const oppScore = isHome ? tick.awayScore : tick.homeScore
    const margin = userScore - oppScore
    const isHomeGoal = tick.clubId === (ctx?.input.homeClubId ?? simInput.homeClubId)
    const scoringName = isHomeGoal ? (homeClub?.name ?? homeAbbr) : (awayClub?.name ?? awayAbbr)
    const scoringColor = isHomeGoal ? homeColor : awayColor
    const leading = userScore > oppScore

    const decisions: MidMatchDecision[] = [
      { id: 'stay-course', type: 'stay-course', label: 'Stay the Course', description: 'Keep current tactics.' },
    ]
    if (leading && margin >= 10) {
      decisions.push({ id: 'protect-lead', type: 'protect-lead', label: 'Protect Lead', description: 'Defensive, slow, low aggression.' })
    }
    if (!leading) {
      decisions.push({ id: 'chase-game', type: 'chase-game', label: 'Chase the Game', description: 'Attacking, fast, high aggression.' })
    }
    decisions.push(
      { id: 'tempo-fast', type: 'change-tempo', label: 'Fast Tempo', description: 'Increase pace.', params: { tempo: 'fast' } },
      { id: 'tempo-slow', type: 'change-tempo', label: 'Slow Tempo', description: 'Slow it down.', params: { tempo: 'slow' } },
    )

    return { scoringName, scoringColor, margin, userIsAhead: leading, decisions }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stoppageState, userClubId, homeAbbr, awayAbbr, homeColor, awayColor])

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
  const userSlotLineup = userIsHome ? (homeSlotLineup ?? {}) : (awaySlotLineup ?? {})
  const opponentSlotLineup = userIsHome ? (awaySlotLineup ?? {}) : (homeSlotLineup ?? {})
  const fieldGameplan = userIsHome ? (homeGameplan ?? null) : (awayGameplan ?? null)
  const fieldMatchupTactics = userIsHome ? (homeMatchupTactics ?? null) : null

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
          Live Match
        </CardTitle>
        {phase !== 'complete' && (
          <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">

        {/* PRE-MATCH */}
        {phase === 'pre-match' && (
          <>
            <div className="rounded-md border p-4 text-center">
              <div className="flex items-center justify-center gap-6">
                <div className="flex flex-col items-center gap-1">
                  <div className="h-10 w-10 rounded-full border border-white/20" style={{ backgroundColor: homeColor }} />
                  <span className="text-sm font-bold">{homeAbbr}</span>
                </div>
                <div className="text-2xl font-bold text-muted-foreground">vs</div>
                <div className="flex flex-col items-center gap-1">
                  <div className="h-10 w-10 rounded-full border border-white/20" style={{ backgroundColor: awayColor }} />
                  <span className="text-sm font-bold">{awayAbbr}</span>
                </div>
              </div>
              <div className="mt-2 flex justify-center text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {simInput.venue}
                </span>
              </div>
            </div>
            <div className="flex justify-center">
              <Button onClick={handleBeginMatch} size="lg" className="gap-2">
                <Play className="h-4 w-4" />
                Begin Match
              </Button>
            </div>
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
            />

            {!spectatorMode && stoppageState?.type === 'goal' && goalStoppageInfo && (
              <GoalStoppagePanel
                scoringTeamName={goalStoppageInfo.scoringName}
                scoringColor={goalStoppageInfo.scoringColor}
                margin={goalStoppageInfo.margin}
                userIsAhead={goalStoppageInfo.userIsAhead}
                decisions={goalStoppageInfo.decisions}
                onDecision={handleGoalDecision}
                onContinue={handleStoppageContinue}
              />
            )}

            {!spectatorMode && stoppageState?.type === 'injury' && (
              <InjuryStoppagePanel
                injury={stoppageState.injury}
                subName={subName}
                subActivated={isSubActivated}
                onActivateSub={handleActivateSub}
                onContinue={handleStoppageContinue}
              />
            )}

            {/* Tab toggle */}
            <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
              {!spectatorMode && (
                <button
                  className={`flex-1 py-1.5 transition-colors ${activeTab === 'field' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted'}`}
                  onClick={() => setActiveTab('field')}
                >
                  Field
                </button>
              )}
              <button
                className={`flex-1 py-1.5 transition-colors ${activeTab === 'events' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted'}`}
                onClick={() => setActiveTab('events')}
              >
                Events
              </button>
              <button
                className={`flex-1 py-1.5 transition-colors ${activeTab === 'stats' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted'}`}
                onClick={() => setActiveTab('stats')}
              >
                Stats
              </button>
            </div>

            {!spectatorMode && activeTab === 'field' && (
              <LiveFieldView
                userSlotLineup={userSlotLineup}
                opponentSlotLineup={opponentSlotLineup}
                players={simInput.players}
                userClub={userIsHome ? homeClub : awayClub}
                opponentClub={userIsHome ? awayClub : homeClub}
                userClubId={userClubId}
                userGameplan={fieldGameplan}
                userMatchupTactics={fieldMatchupTactics}
                matchPhase="simulating-quarter"
                quartersCompleted={liveQuarter - 1}
                recentKeyEvents={[]}
                onInstruction={handleFieldInstruction}
              />
            )}

            {activeTab === 'events' && (
              <CommentaryFeed
                ticks={ticksRef.current}
                currentIndex={displayTickIndex}
                homeColor={homeColor}
                awayColor={awayColor}
                homeClubId={simInput.homeClubId}
              />
            )}

            {activeTab === 'stats' && (
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
              />
            )}
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

            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Match Goals</div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {breakDisplay.keyEvents
                  .filter((e) => e.type === 'goal')
                  .map((e, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px]">Q{e.quarter}</Badge>
                      <span className="text-muted-foreground">{e.description}</span>
                    </div>
                  ))}
              </div>
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
