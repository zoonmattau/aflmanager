import { useCallback, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TacticalEventPanel } from '@/components/match/TacticalEventPanel'
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
} from '@/engine/match/interactiveMatch'
import type { Match, MatchKeyEvent } from '@/types/match'
import type { Club } from '@/types/club'
import type {
  TacticalEvent,
  MidMatchDecision,
  QuarterInjury,
  MidMatchAdjustment,
} from '@/types/matchEvent'

interface LiveMatchDisplayState {
  phase: 'pre-match' | 'simulating-quarter' | 'quarter-break' | 'complete'
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
}
import {
  Play,
  ChevronRight,
  MapPin,
  Users,
  X,
} from 'lucide-react'

interface LiveMatchViewProps {
  simInput: SimulateMatchInput
  userClubId: string
  homeClub: Club | undefined
  awayClub: Club | undefined
  onComplete: (match: Match) => void
  onCancel: () => void
}

function buildDisplayState(
  ctx: MatchContext | null,
  phase: LiveMatchDisplayState['phase'],
  events: TacticalEvent[],
  decisions: MidMatchDecision[],
  injuries: QuarterInjury[],
  adjustments: MidMatchAdjustment[],
  userClubId: string,
): LiveMatchDisplayState {
  if (!ctx) {
    return {
      phase,
      homeClubId: '',
      awayClubId: '',
      venue: '',
      weather: '',
      groundCondition: '',
      quartersCompleted: 0,
      homeScores: [],
      awayScores: [],
      homeTotalScore: 0,
      awayTotalScore: 0,
      keyEvents: [],
      tacticalEvents: [],
      availableDecisions: [],
      quarterInjuries: [],
      subAvailable: false,
      subActivated: false,
      adjustmentsMade: [],
    }
  }

  const isHome = userClubId === ctx.input.homeClubId
  const sub = isHome ? ctx.homeSubstitute : ctx.awaySubstitute

  return {
    phase,
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
    attendance: ctx.attendanceResult?.attendance,
  }
}

function QuarterScoreBar({
  homeScores,
  awayScores,
  homeAbbr,
  awayAbbr,
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

function KeyEventsLog({ events, quartersCompleted }: { events: MatchKeyEvent[]; quartersCompleted: number }) {
  // Show events from the most recently completed quarter, or all for final
  const relevantEvents = events.filter((e) =>
    e.type === 'goal' && e.quarter === quartersCompleted,
  )
  if (relevantEvents.length === 0) return null
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Q{quartersCompleted} Goals</div>
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {relevantEvents.map((e, i) => (
          <div key={i} className="text-xs text-muted-foreground">
            {e.minute}' — {e.description}
          </div>
        ))}
      </div>
    </div>
  )
}

export function LiveMatchView({
  simInput,
  userClubId,
  homeClub,
  awayClub,
  onComplete,
  onCancel,
}: LiveMatchViewProps) {
  const ctxRef = useRef<MatchContext | null>(null)
  const finalMatchRef = useRef<Match | null>(null)
  const [display, setDisplay] = useState<LiveMatchDisplayState>(() =>
    buildDisplayState(null, 'pre-match', [], [], [], [], userClubId),
  )
  // Accumulated injuries and adjustments across all quarters
  const allInjuriesRef = useRef<QuarterInjury[]>([])
  const allAdjustmentsRef = useRef<MidMatchAdjustment[]>([])

  const handleBeginMatch = useCallback(() => {
    const ctx = createMatchContext(simInput)
    ctxRef.current = ctx
    setDisplay(buildDisplayState(ctx, 'pre-match', [], [], [], [], userClubId))

    // Immediately simulate Q1
    setTimeout(() => {
      setDisplay((prev) => ({ ...prev, phase: 'simulating-quarter' }))

      setTimeout(() => {
        simulateQuarter(ctx, 0)

        // Roll injuries
        const injuries = rollQuarterInjuries(ctx, userClubId, 1, simInput.injuryFrequency)
        for (const inj of injuries) applyQuarterInjury(ctx, inj)
        allInjuriesRef.current = [...allInjuriesRef.current, ...injuries]

        // Track aggression
        const isHome = userClubId === ctx.input.homeClubId
        const gp = isHome ? ctx.resolvedHomeGameplan : ctx.resolvedAwayGameplan
        ctx.effectiveAggressionQuarters.push(gp.aggression ?? 'medium')

        // Detect events
        const events = detectTacticalEvents(ctx, userClubId, 1)
        const decisions = getAvailableDecisions(ctx, events, userClubId)

        setDisplay(buildDisplayState(ctx, 'quarter-break', events, decisions, injuries, allAdjustmentsRef.current, userClubId))
      }, 400)
    }, 100)
  }, [simInput, userClubId])

  const handleContinue = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return

    const nextQ = ctx.quartersCompleted
    if (nextQ >= ctx.quartersPerMatch) {
      // Match complete — finalize
      const isHome = userClubId === ctx.input.homeClubId
      const match = finalizeMatch(ctx, ctx.userSubActivated ? (isHome ? 'home' : 'away') : undefined)
      setDisplay(buildDisplayState(ctx, 'complete', [], [], [], allAdjustmentsRef.current, userClubId))

      // Store final match for later retrieval
      ctxRef.current = null
      setTimeout(() => onComplete(match), 0)
      return
    }

    // Simulating next quarter
    setDisplay((prev) => ({ ...prev, phase: 'simulating-quarter' }))

    setTimeout(() => {
      simulateQuarter(ctx, nextQ)

      const injuries = rollQuarterInjuries(ctx, userClubId, nextQ + 1, simInput.injuryFrequency)
      for (const inj of injuries) applyQuarterInjury(ctx, inj)
      allInjuriesRef.current = [...allInjuriesRef.current, ...injuries]

      // Track aggression
      const isHome = userClubId === ctx.input.homeClubId
      const gp = isHome ? ctx.resolvedHomeGameplan : ctx.resolvedAwayGameplan
      ctx.effectiveAggressionQuarters.push(gp.aggression ?? 'medium')

      if (ctx.quartersCompleted >= ctx.quartersPerMatch) {
        // Final quarter just finished — show complete screen then finalize
        const match = finalizeMatch(ctx, ctx.userSubActivated ? (isHome ? 'home' : 'away') : undefined)

        setDisplay({
          ...buildDisplayState(ctx, 'complete', [], [], injuries, allAdjustmentsRef.current, userClubId),
          // Override scores from finalized match
          homeTotalScore: match.result?.homeTotalScore ?? ctx.currentHomeTotal,
          awayTotalScore: match.result?.awayTotalScore ?? ctx.currentAwayTotal,
        })

        ctxRef.current = null
        // Don't auto-complete — wait for user to click Continue
        finalMatchRef.current = match
        return
      }

      const events = detectTacticalEvents(ctx, userClubId, nextQ + 1)
      const decisions = getAvailableDecisions(ctx, events, userClubId)

      setDisplay(buildDisplayState(ctx, 'quarter-break', events, decisions, injuries, allAdjustmentsRef.current, userClubId))
    }, 400)
  }, [userClubId, simInput.injuryFrequency, onComplete])

  const handleDecision = useCallback((decision: MidMatchDecision) => {
    const ctx = ctxRef.current
    if (!ctx) return
    applyMidMatchDecision(ctx, decision, userClubId)
    allAdjustmentsRef.current = [...ctx.midMatchAdjustments]
    // Refresh display
    const events = detectTacticalEvents(ctx, userClubId, ctx.quartersCompleted)
    const decisions = getAvailableDecisions(ctx, events, userClubId)
    setDisplay(buildDisplayState(ctx, 'quarter-break', events, decisions, [], allAdjustmentsRef.current, userClubId))
  }, [userClubId])

  const handleFinalContinue = useCallback(() => {
    const match = finalMatchRef.current
    finalMatchRef.current = null
    if (match) onComplete(match)
  }, [onComplete])

  const homeAbbr = homeClub?.abbreviation ?? display.homeClubId.slice(0, 3).toUpperCase()
  const awayAbbr = awayClub?.abbreviation ?? display.awayClubId.slice(0, 3).toUpperCase()

  return (
    <Card className="border-primary/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Play className="h-4 w-4" />
          Live Match
        </CardTitle>
        {display.phase !== 'complete' && (
          <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Score header */}
        <div className="rounded-md border p-4 text-center">
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-1">
              <div
                className="h-10 w-10 rounded-full border border-white/20"
                style={{ backgroundColor: homeClub?.colors.primary ?? '#666' }}
              />
              <span className="text-sm font-bold">{homeAbbr}</span>
            </div>
            <div>
              <div className="text-3xl font-bold tabular-nums">
                {display.homeTotalScore} - {display.awayTotalScore}
              </div>
              {display.phase === 'simulating-quarter' && (
                <div className="mt-1 text-xs text-muted-foreground animate-pulse">
                  Simulating Q{display.quartersCompleted + 1}...
                </div>
              )}
              {display.phase === 'quarter-break' && (
                <Badge variant="secondary" className="mt-1">
                  {display.quartersCompleted === 1 ? 'Quarter Time' :
                   display.quartersCompleted === 2 ? 'Half Time' :
                   display.quartersCompleted === 3 ? 'Three Quarter Time' : 'Break'}
                </Badge>
              )}
              {display.phase === 'complete' && (
                <Badge className="mt-1">Full Time</Badge>
              )}
            </div>
            <div className="flex flex-col items-center gap-1">
              <div
                className="h-10 w-10 rounded-full border border-white/20"
                style={{ backgroundColor: awayClub?.colors.primary ?? '#999' }}
              />
              <span className="text-sm font-bold">{awayAbbr}</span>
            </div>
          </div>

          <QuarterScoreBar
            homeScores={display.homeScores}
            awayScores={display.awayScores}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
          />

          <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {display.venue || simInput.venue}
            </span>
            {display.weather && (
              <span>{display.weather}, {display.groundCondition}</span>
            )}
            {display.attendance != null && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {display.attendance.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Pre-match */}
        {display.phase === 'pre-match' && (
          <div className="flex justify-center">
            <Button onClick={handleBeginMatch} size="lg" className="gap-2">
              <Play className="h-4 w-4" />
              Begin Match
            </Button>
          </div>
        )}

        {/* Quarter break — tactical panel */}
        {display.phase === 'quarter-break' && (
          <>
            <KeyEventsLog events={display.keyEvents} quartersCompleted={display.quartersCompleted} />

            <TacticalEventPanel
              events={display.tacticalEvents}
              decisions={display.availableDecisions}
              injuries={display.quarterInjuries}
              adjustmentsMade={display.adjustmentsMade}
              subAvailable={display.subAvailable}
              subActivated={display.subActivated}
              onDecision={handleDecision}
            />

            <div className="flex justify-end">
              <Button onClick={handleContinue} className="gap-2">
                <ChevronRight className="h-4 w-4" />
                {display.quartersCompleted < 4
                  ? `Continue to Q${display.quartersCompleted + 1}`
                  : 'See Final Result'}
              </Button>
            </div>
          </>
        )}

        {/* Complete */}
        {display.phase === 'complete' && (
          <>
            {/* Show all goals */}
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Match Goals</div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {display.keyEvents
                  .filter((e) => e.type === 'goal')
                  .map((e, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px]">Q{e.quarter}</Badge>
                      <span className="text-muted-foreground">{e.description}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Adjustments summary */}
            {display.adjustmentsMade.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tactical Changes</div>
                {display.adjustmentsMade.map((adj, i) => (
                  <div key={i} className="rounded border border-border/50 px-2 py-1 text-xs text-muted-foreground">
                    Q{adj.quarter}: {adj.description}
                  </div>
                ))}
              </div>
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
