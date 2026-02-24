import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TacticalTimeoutPanel } from '@/components/match/TacticalTimeoutPanel'
import { type PlaybackSpeed } from '@/components/match/LiveScoreboard'
import { CompactScoreBar } from '@/components/match/CompactScoreBar'
import { PlayerLeadersMini } from '@/components/match/PlayerLeadersMini'
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
import { usePreGameAnimation, type BannerAnchor } from '@/components/match/usePreGameAnimation'
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
import { Play, ChevronRight, MapPin, Users, X } from 'lucide-react'
import { BenchTacticsPanel, type QueuedRotation } from '@/components/match/BenchTacticsPanel'
import { getOverallRating } from '@/engine/player/playerRating'
import { VENUES } from '@/data/venues'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatchPhase = 'pre-match' | 'pre-game-anim' | 'playing' | 'quarter-break' | 'complete'

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

/** Mirror zone from attacking-team perspective to absolute visual coordinates.
 *  The engine records zones relative to the possessing team (forward50 = their scoring end),
 *  but the visual field is oriented to the user's perspective. When the opponent has the ball,
 *  their forward50 is physically the user's back50 — so we mirror for correct visual placement. */
const ZONE_VISUAL_MIRROR: Record<string, string> = {
  back50: 'forward50', backHalf: 'forwardHalf', midfield: 'midfield',
  forwardHalf: 'backHalf', forward50: 'back50',
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
  // Cumulative goals/behinds from completed quarters (base for live derivation)
  const baseGoalsRef = useRef({ homeGoals: 0, homeBehinds: 0, awayGoals: 0, awayBehinds: 0 })

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

  /** Advance one tick (used by the interval timer during auto-play). */
  const advanceOneTick = useCallback(() => {
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
      if (tick.stoppageType === 'injury' && tick.injuryPlayerId) {
        const inj = currentQInjuriesRef.current.find((i) => i.playerId === tick.injuryPlayerId)
        if (inj && inj.clubId === userClubId) {
          setStoppageState({ type: 'injury', injury: inj })
        }
      }
    }
  }, [handleQuarterComplete, userClubId])

  /** Step button — advances to the next meaningful play.
   *  Batches through centre bounce setup ticks (contest → clearance → exit)
   *  so each click lands on a real possession or scoring event. */
  const advanceTick = useCallback(() => {
    const ticks = ticksRef.current
    let idx = tickIndexRef.current
    if (idx >= ticks.length) {
      handleQuarterComplete()
      return
    }

    // Always advance at least one tick
    const firstTick = ticks[idx]
    const startChainId = firstTick.chainId
    idx++

    // If we just consumed a centre bounce setup tick (contest/clearance at
    // the start of a new chain), keep advancing through the rest of the
    // bounce sequence so the user lands on the first real general-play tick.
    const isBounceSetup = (pt: string) => pt === 'contest' || pt === 'clearance'
    if (isBounceSetup(firstTick.possessionType)) {
      while (idx < ticks.length) {
        const next = ticks[idx]
        // Stop if we've left the same chain or hit a non-bounce tick
        if (next.chainId !== startChainId || !isBounceSetup(next.possessionType)) break
        idx++
      }
    }

    const finalTick = ticks[idx - 1]
    tickIndexRef.current = idx
    setDisplayTickIndex(idx)
    setLiveHomeScore(finalTick.homeScore)
    setLiveAwayScore(finalTick.awayScore)
    setLiveMinute(finalTick.minute)

    if (finalTick.isStoppage && !spectatorMode) {
      if (finalTick.stoppageType === 'injury' && finalTick.injuryPlayerId) {
        const inj = currentQInjuriesRef.current.find((i) => i.playerId === finalTick.injuryPlayerId)
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
      advanceOneTick()
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
    let hg = 0, hb = 0, ag = 0, ab = 0
    for (let q = 0; q < quarterIndex; q++) {
      homeStartTotal += ctx.homeScores[q].total
      awayStartTotal += ctx.awayScores[q].total
      hg += ctx.homeScores[q].goals; hb += ctx.homeScores[q].behinds
      ag += ctx.awayScores[q].goals; ab += ctx.awayScores[q].behinds
    }
    baseGoalsRef.current = { homeGoals: hg, homeBehinds: hb, awayGoals: ag, awayBehinds: ab }

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
    // Transition to pre-game animation instead of directly starting Q1
    setPhase('pre-game-anim')
  }, [simInput, preMatchGameplan, userClubId, plannedRotations])

  // ---------------------------------------------------------------------------
  // Pre-game animation complete — start Q1
  // ---------------------------------------------------------------------------

  const handleAnimComplete = useCallback(() => {
    beginQuarter(0)
  }, [beginQuarter])

  // Pre-game animation hook
  const isImportantMatch = !!(simInput.isFinal || simInput.isBlockbuster || simInput.isRivalry)
  const fieldSlotNames = useMemo(() => new Set(FIELD_SLOTS_LANDSCAPE.map((f) => f.slot as string)), [])
  const preGameUserSlots = useMemo(() => {
    const isHome = userClubId === simInput.homeClubId
    const lineup = isHome
      ? (homeSlotLineup ?? simInput.homeLineupSlots ?? {})
      : (awaySlotLineup ?? simInput.awayLineupSlots ?? {})
    return Object.keys(lineup).filter((s) => fieldSlotNames.has(s))
  }, [userClubId, simInput.homeClubId, homeSlotLineup, awaySlotLineup, simInput.homeLineupSlots, simInput.awayLineupSlots, fieldSlotNames])
  const preGameOppSlots = useMemo(() => {
    const isHome = userClubId === simInput.homeClubId
    const lineup = isHome
      ? (awaySlotLineup ?? simInput.awayLineupSlots ?? {})
      : (homeSlotLineup ?? simInput.homeLineupSlots ?? {})
    return Object.keys(lineup).filter((s) => fieldSlotNames.has(s))
  }, [userClubId, simInput.homeClubId, homeSlotLineup, awaySlotLineup, simInput.homeLineupSlots, simInput.awayLineupSlots, fieldSlotNames])
  const preGameAnim = usePreGameAnimation({
    active: phase === 'pre-game-anim',
    isImportant: isImportantMatch,
    userSlots: preGameUserSlots,
    opponentSlots: preGameOppSlots,
    onComplete: handleAnimComplete,
  })

  const handleSkipAnimation = useCallback(() => {
    beginQuarter(0)
  }, [beginQuarter])

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

  // Save finalized match if the user navigates away before clicking "Continue"
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  useEffect(() => {
    return () => {
      const match = finalMatchRef.current
      if (match) {
        finalMatchRef.current = null
        onCompleteRef.current(match)
      }
    }
  }, [])

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

  // Live stat map — single source of truth built from revealed ticks.
  // Used by both the spectator stat popup AND the player leaders card.
  const livePlayerStats = useMemo(() => {
    const map: Record<string, MatchPlayerStats> = {}
    const tks = ticksRef.current
    function ensure(pid: string) {
      if (!map[pid]) {
        map[pid] = {
          playerId: pid, participated: true, minutesPlayed: 0,
          aflFantasyPoints: 0, superCoachPoints: 0,
          disposals: 0, kicks: 0, handballs: 0, marks: 0, tackles: 0,
          goals: 0, behinds: 0, hitouts: 0,
          contestedPossessions: 0, uncontestedPossessions: 0, clearances: 0,
          insideFifties: 0, rebound50s: 0, freesFor: 0, freesAgainst: 0,
          contestedMarks: 0, scoreInvolvements: 0, metresGained: 0,
          turnovers: 0, intercepts: 0, onePercenters: 0, bounces: 0,
          clangers: 0, goalAssists: 0,
        }
      }
      return map[pid]
    }
    for (let i = 0; i < displayTickIndex; i++) {
      const t = tks[i]
      if (!t?.playerId) continue
      const s = ensure(t.playerId)
      const pt = t.possessionType
      if (pt === 'kick' || pt === 'clearance' || pt === 'out-on-full') { s.kicks++; s.disposals++ }
      if (pt === 'handball') { s.handballs++; s.disposals++ }
      if (pt === 'mark') s.marks++
      if (pt === 'tackle') s.tackles++
      if (pt === 'goal') s.goals++
      if (pt === 'behind') s.behinds++
      if (pt === 'clearance') s.clearances++
      if (pt === 'contest') s.contestedPossessions++
      if (pt === 'free-for') s.freesFor++
      if (pt === 'spoil') s.onePercenters++
      if (t.goalPlayerId && t.goalPlayerId !== t.playerId) {
        ensure(t.goalPlayerId).goals++
      }
    }
    return map
  }, [displayTickIndex])

  // Live goals/behinds — derived from base (completed quarters) + current quarter's revealed ticks.
  const { liveHomeGoals, liveHomeBehinds, liveAwayGoals, liveAwayBehinds } = useMemo(() => {
    const base = baseGoalsRef.current
    let hg = base.homeGoals, hb = base.homeBehinds, ag = base.awayGoals, ab = base.awayBehinds
    const tks = ticksRef.current
    for (let i = 0; i < displayTickIndex; i++) {
      const t = tks[i]
      if (t.possessionType === 'goal') {
        if (t.clubId === simInput.homeClubId) hg++; else ag++
      } else if (t.possessionType === 'behind') {
        if (t.clubId === simInput.homeClubId) hb++; else ab++
      }
    }
    return { liveHomeGoals: hg, liveHomeBehinds: hb, liveAwayGoals: ag, liveAwayBehinds: ab }
  }, [displayTickIndex, simInput.homeClubId])

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
    // Contested actions → stoppage phase so players converge on the ball
    if (possessionType === 'clearance' || possessionType === 'ball-up'
      || possessionType === 'tackle' || possessionType === 'contest'
      || possessionType === 'spoil') return 'stoppage'
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
    const hg = breakDisplay.homeScores.reduce((s, q) => s + q.goals, 0)
    const hb = breakDisplay.homeScores.reduce((s, q) => s + q.behinds, 0)
    const ag = breakDisplay.awayScores.reduce((s, q) => s + q.goals, 0)
    const ab = breakDisplay.awayScores.reduce((s, q) => s + q.behinds, 0)
    return (
      <div className="rounded-md border p-4 text-center">
        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <div className="h-10 w-10 rounded-full border border-white/20" style={{ backgroundColor: homeColor }} />
            <span className="text-sm font-bold">{homeAbbr}</span>
          </div>
          <div>
            <div className="text-3xl font-bold tabular-nums">
              <span className="text-lg font-medium text-muted-foreground">{hg}.{hb}.</span>
              {breakDisplay.homeTotalScore}
              <span className="text-muted-foreground mx-2">–</span>
              <span className="text-lg font-medium text-muted-foreground">{ag}.{ab}.</span>
              {breakDisplay.awayTotalScore}
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

  // ---------------------------------------------------------------------------
  // Pre-game animation phase — full-bleed field with overlay labels
  // ---------------------------------------------------------------------------

  if (phase === 'pre-game-anim') {
    return (
      <div className="flex flex-col h-[calc(100vh-7rem)]">
        {/* Compact score bar showing 0-0 */}
        <CompactScoreBar
          homeAbbr={homeAbbr}
          awayAbbr={awayAbbr}
          homeColor={homeColor}
          awayColor={awayColor}
          homeScore={0}
          awayScore={0}
          homeGoals={0}
          homeBehinds={0}
          awayGoals={0}
          awayBehinds={0}
          quarter={1}
          minute={0}
          speed="paused"
          onSpeedChange={() => {}}
          onSkip={() => {}}
          onStep={() => {}}
        />

        {/* Field with animation overrides */}
        <div className="flex-1 min-h-0 relative mt-1.5">
          <LiveFieldView
            userSlotLineup={userSlotLineup}
            opponentSlotLineup={opponentSlotLineup}
            players={simInput.players}
            userClub={userIsHome ? homeClub : awayClub}
            opponentClub={userIsHome ? awayClub : homeClub}
            userClubId={userClubId}
            userGameplan={null}
            userMatchupTactics={null}
            matchPhase="pre-match"
            quartersCompleted={0}
            recentKeyEvents={[]}
            paused={false}
            teamAttacksRight
            onInstruction={() => {}}
            animTargetOverrides={preGameAnim.targetOverrides}
          />

          {/* Coloured paper banners at the 50m/boundary intersections */}
          {preGameAnim.bannerAnchors && preGameAnim.bannerAnchors.map((anchor: BannerAnchor) => {
            const color = anchor.side === 'user'
              ? (userIsHome ? homeColor : awayColor)
              : (userIsHome ? awayColor : homeColor)
            // Tear effect: as progress advances past ~60%, banner starts to fade/tear
            const tearProgress = Math.max(0, (preGameAnim.progress - 0.5) / 0.5)
            const opacity = 1 - tearProgress * 0.8
            return (
              <div
                key={anchor.side}
                className="absolute pointer-events-none z-15"
                style={{
                  left: `${anchor.left}%`,
                  top: `${anchor.top}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {/* Banner strip — vertical ribbon across the boundary */}
                <div
                  style={{
                    width: 6,
                    height: 48,
                    backgroundColor: color,
                    borderRadius: 3,
                    opacity,
                    boxShadow: `0 0 12px ${color}80, 0 0 24px ${color}40`,
                    transition: 'opacity 0.3s ease-out',
                  }}
                />
                {/* Secondary colour accent stripe */}
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 2,
                    height: 40,
                    backgroundColor: '#ffffff',
                    borderRadius: 1,
                    opacity: opacity * 0.6,
                  }}
                />
              </div>
            )
          })}

          {/* Phase label overlay */}
          {preGameAnim.phaseLabel && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <div className="bg-black/70 backdrop-blur-sm rounded-lg px-6 py-3 text-center">
                <div className="text-white text-sm font-bold tracking-widest uppercase">
                  {preGameAnim.phaseLabel}
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-0.5 w-32 mx-auto rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-white/80 rounded-full transition-all duration-100"
                    style={{ width: `${preGameAnim.progress * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Skip button */}
          <div className="absolute bottom-4 right-4 z-30">
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 opacity-80 hover:opacity-100"
              onClick={handleSkipAnimation}
            >
              Skip
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Playing phase uses a full-bleed command center layout (no Card wrapper).
  // ---------------------------------------------------------------------------

  if (phase === 'playing') {
    return (
      <div className="flex flex-col h-[calc(100vh-7rem)]">
        {/* Compact score bar */}
        <CompactScoreBar
          homeAbbr={homeAbbr}
          awayAbbr={awayAbbr}
          homeColor={homeColor}
          awayColor={awayColor}
          homeScore={liveHomeScore}
          awayScore={liveAwayScore}
          homeGoals={liveHomeGoals}
          homeBehinds={liveHomeBehinds}
          awayGoals={liveAwayGoals}
          awayBehinds={liveAwayBehinds}
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

        {/* Injury stoppage overlay */}
        {!spectatorMode && stoppageState?.type === 'injury' && (
          <InjuryStoppagePanel
            injury={stoppageState.injury}
            subName={subName}
            subActivated={isSubActivated}
            onActivateSub={handleActivateSub}
            onContinue={handleStoppageContinue}
          />
        )}

        {/* ── 3-column command center grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_260px] gap-1.5 flex-1 min-h-0 mt-1.5">

          {/* ═══ LEFT PANEL: Team Stats ═══ */}
          <div className="rounded-md border bg-card overflow-y-auto p-2 hidden lg:block" style={{ maxHeight: 'calc(100vh - 10rem)' }}>
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
              ticks={ticksRef.current}
              homeClubId={simInput.homeClubId}
            />
          </div>

          {/* ═══ CENTER PANEL: Field + Chain + Interchange ═══ */}
          <div className="flex flex-col gap-1.5 min-h-0 overflow-hidden">
            {/* Field view — shrinks to fit, doesn't push chain/interchange off-screen */}
            <div className="min-h-0 overflow-hidden" style={{ flex: '1 1 0%' }}>
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
                ballZone={(() => {
                  const t = ticksRef.current[displayTickIndex - 1]
                  if (!t) return undefined
                  // Mirror zone when opponent has possession — their forward50 is
                  // physically the user's back50 on the visual field.
                  return t.clubId === userClubId ? t.zone : ZONE_VISUAL_MIRROR[t.zone] ?? t.zone
                })()}
                possessionChain={possessionChain}
                chainTeamColor={chainTeamColor}
                livePlayPhase={livePlayPhase}
                teamAttacksRight={teamAttacksRight}
                runningOffAnim={spectatorMode ? null : runningOffAnim}
                paused={speed === 'paused'}
                onInstruction={spectatorMode ? () => {} : handleFieldInstruction}
                matchStats={livePlayerStats}
                currentPossessionType={ticksRef.current[displayTickIndex - 1]?.possessionType}
                isCentreBounce={(() => {
                  // Centre bounce: after a goal or at the very start of a quarter
                  if (displayTickIndex === 0) return true  // start of quarter
                  const t = ticksRef.current[displayTickIndex - 1]
                  if (!t) return false
                  // Current tick is a goal stoppage → teams returning to centre
                  if (t.stoppageType === 'goal') return true
                  // First 2 ticks after a goal (restart from centre bounce)
                  if (displayTickIndex >= 2) {
                    const prev = ticksRef.current[displayTickIndex - 2]
                    if (prev?.stoppageType === 'goal') return true
                  }
                  // First tick of a new quarter (quarter changed from previous tick)
                  if (displayTickIndex >= 2) {
                    const prev = ticksRef.current[displayTickIndex - 2]
                    if (prev && t.quarter !== prev.quarter) return true
                  }
                  return false
                })()}
              />
            </div>

            {/* Possession chain strip */}
            <div className="rounded-md border overflow-hidden shrink-0">
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

            {/* Compact interchange strip — user only */}
            {!spectatorMode && (
              <div className="shrink-0">
                <LiveInterchangePanel
                  slotLineup={userSlotLineup}
                  players={simInput.players}
                  club={userIsHome ? homeClub : awayClub}
                  interchangeCount={simInput.matchRules?.interchangePlayers ?? 4}
                  onInterchange={handleInterchange}
                  compact
                />
              </div>
            )}
          </div>

          {/* ═══ RIGHT PANEL: Commentary + Leaders + Tactics ═══ */}
          <div className="rounded-md border bg-card overflow-y-auto hidden lg:flex lg:flex-col" style={{ maxHeight: 'calc(100vh - 10rem)' }}>

            {/* Commentary feed (top) */}
            <div className="border-b p-2 flex-shrink-0" style={{ maxHeight: spectatorMode ? '55%' : '40%', minHeight: 120 }}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Commentary</div>
              <CommentaryFeed
                ticks={ticksRef.current}
                currentIndex={displayTickIndex}
                homeColor={homeColor}
                awayColor={awayColor}
                homeClubId={simInput.homeClubId}
              />
            </div>

            {/* Player leaders (middle) */}
            <div className={`border-b p-2 ${spectatorMode ? 'flex-1' : 'flex-shrink-0'}`}>
              <PlayerLeadersMini
                ctx={ctxRef.current}
                homeClubId={simInput.homeClubId}
                homeColor={homeColor}
                awayColor={awayColor}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
                players={simInput.players}
                livePlayerStats={livePlayerStats}
                count={spectatorMode ? 7 : 5}
              />
            </div>

            {/* Tactics + bench rotations (bottom) — user only */}
            {!spectatorMode && (
              <div className="p-2 flex-1 overflow-y-auto">
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
                  compact
                />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Non-playing phases: pre-match, quarter-break, complete — Card wrapper
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
