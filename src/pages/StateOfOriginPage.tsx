import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, MapPin, Star, Users, ChevronLeft, Shield, Play, ChevronRight, Loader2 } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SpecialEventInstance, SpecialEventMatchResult } from '@/types/specialEvents'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split a final score into 4 quarter contributions (display only). */
function splitIntoQuarters(goals: number, behinds: number): Array<{ goals: number; behinds: number }> {
  const out = [
    { goals: 0, behinds: 0 },
    { goals: 0, behinds: 0 },
    { goals: 0, behinds: 0 },
    { goals: 0, behinds: 0 },
  ]

  let gLeft = goals
  let bLeft = behinds
  for (let i = 0; i < 3; i++) {
    const g = Math.max(0, Math.min(gLeft, Math.round(goals / 4 + (Math.random() - 0.5) * 2.5)))
    const b = Math.max(0, Math.min(bLeft, Math.round(behinds / 4 + (Math.random() - 0.5) * 2)))
    out[i] = { goals: g, behinds: b }
    gLeft -= g
    bLeft -= b
  }
  out[3] = { goals: Math.max(0, gLeft), behinds: Math.max(0, bLeft) }
  return out
}

function quarterLabel(q: number) {
  return q === 1 ? 'Quarter Time' : q === 2 ? 'Half Time' : q === 3 ? 'Three Quarter Time' : 'Full Time'
}

function breakNarrative(aName: string, bName: string, aTotal: number, bTotal: number, q: number): string {
  const margin = Math.abs(aTotal - bTotal)
  const leader = aTotal > bTotal ? aName : bTotal > aTotal ? bName : null

  if (q === 1) {
    if (!leader) return 'The teams are level after the first quarter — this one is tight.'
    if (margin <= 6) return `${leader} edge ahead at quarter time. The margin is just a goal.`
    if (margin <= 18) return `${leader} have the lead at quarter time. The challenger is within striking distance.`
    return `${leader} have blown the game open early with a dominant first quarter.`
  }
  if (q === 2) {
    if (!leader) return 'All square at the main break. It\'s anyone\'s game.'
    if (margin <= 6) return `${leader} take the slimmest of leads into half time.`
    if (margin <= 18) return `${leader} lead at the main break but this is far from over.`
    return `${leader} have a commanding lead at half time. Can the opposition mount a comeback?`
  }
  if (q === 3) {
    if (!leader) return 'Three quarter time and the game is locked up. Someone will need to produce something special.'
    if (margin <= 6) return `The narrowest of margins at three quarter time — ${leader} lead by ${margin} but the next goal wins it.`
    if (margin <= 18) return `${leader} ahead at three quarter time. The final quarter will be decisive.`
    return `${leader} look to have the game under control heading into the final term.`
  }
  return ''
}

// ---------------------------------------------------------------------------
// Live match view
// ---------------------------------------------------------------------------

interface LiveSOOViewProps {
  evt: SpecialEventInstance
  result: SpecialEventMatchResult
  playerName: (id: string) => string
  onDone: () => void
}

function LiveSOOView({ evt, result, playerName, onDone }: LiveSOOViewProps) {
  type Phase = 'pre-match' | 'simulating' | 'break' | 'complete'

  // Generate quarter splits upfront (stable via ref)
  const quartersRef = useRef<{
    a: Array<{ goals: number; behinds: number }>
    b: Array<{ goals: number; behinds: number }>
  } | null>(null)
  if (!quartersRef.current) {
    quartersRef.current = {
      a: splitIntoQuarters(result.teamAScore.goals, result.teamAScore.behinds),
      b: splitIntoQuarters(result.teamBScore.goals, result.teamBScore.behinds),
    }
  }
  const quarters = quartersRef.current

  const [phase, setPhase] = useState<Phase>('pre-match')
  const [revealed, setRevealed] = useState(0) // number of quarters shown

  // Cumulative scores up to `revealed` quarters
  const aRunning = useMemo(() => {
    let g = 0, b = 0
    for (let i = 0; i < revealed; i++) { g += quarters.a[i].goals; b += quarters.a[i].behinds }
    return { goals: g, behinds: b, total: g * 6 + b }
  }, [revealed, quarters])

  const bRunning = useMemo(() => {
    let g = 0, b = 0
    for (let i = 0; i < revealed; i++) { g += quarters.b[i].goals; b += quarters.b[i].behinds }
    return { goals: g, behinds: b, total: g * 6 + b }
  }, [revealed, quarters])

  const handleBegin = useCallback(() => {
    setPhase('simulating')
    setTimeout(() => {
      setRevealed(1)
      setPhase('break')
    }, 600)
  }, [])

  const handleContinue = useCallback(() => {
    const next = revealed + 1
    if (next > 4) {
      setPhase('complete')
      return
    }
    setPhase('simulating')
    setTimeout(() => {
      setRevealed(next)
      setPhase(next === 4 ? 'complete' : 'break')
    }, 600)
  }, [revealed])

  const bog = result.bestOnGround ? playerName(result.bestOnGround) : null
  const aWon = result.teamAScore.total > result.teamBScore.total
  const bWon = result.teamBScore.total > result.teamAScore.total

  return (
    <Card className="border-primary/50 overflow-hidden">
      {/* Header bar */}
      <div className="border-b bg-muted/30 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" /> {evt.venue}
        </div>
        <Badge variant="secondary" className="text-xs">
          {new Date(evt.scheduledDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
        </Badge>
      </div>

      <CardContent className="pt-5 pb-5 space-y-5">
        {/* Scoreboard */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
          <div className="space-y-1">
            <div className="text-sm font-bold leading-tight">{evt.teamA.name}</div>
            <div className={`text-4xl font-bold font-mono tabular-nums transition-all duration-300 ${
              phase === 'complete' ? (aWon ? 'text-green-500' : bWon ? 'text-muted-foreground' : '') : ''
            }`}>
              {revealed > 0 ? aRunning.total : '–'}
            </div>
            {revealed > 0 && (
              <div className="text-xs text-muted-foreground font-mono">{aRunning.goals}.{aRunning.behinds}</div>
            )}
            {phase === 'complete' && aWon && <Badge className="text-xs">Winner</Badge>}
          </div>

          <div className="text-center space-y-1">
            {phase === 'simulating' ? (
              <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
            ) : (
              <span className="text-muted-foreground font-bold text-lg">
                {revealed === 0 ? 'vs' : 'v'}
              </span>
            )}
            {revealed > 0 && revealed < 4 && phase !== 'simulating' && (
              <div className="text-[10px] text-muted-foreground font-medium">
                Q{revealed}
              </div>
            )}
            {phase === 'complete' && (
              <Badge variant="outline" className="text-[10px]">Full Time</Badge>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-sm font-bold leading-tight">{evt.teamB.name}</div>
            <div className={`text-4xl font-bold font-mono tabular-nums transition-all duration-300 ${
              phase === 'complete' ? (bWon ? 'text-green-500' : aWon ? 'text-muted-foreground' : '') : ''
            }`}>
              {revealed > 0 ? bRunning.total : '–'}
            </div>
            {revealed > 0 && (
              <div className="text-xs text-muted-foreground font-mono">{bRunning.goals}.{bRunning.behinds}</div>
            )}
            {phase === 'complete' && bWon && <Badge className="text-xs">Winner</Badge>}
          </div>
        </div>

        {/* Quarter-by-quarter bar */}
        {revealed > 0 && (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs font-mono">
            <div className="grid grid-cols-[2.5rem_repeat(4,1fr)] gap-1 text-center text-muted-foreground mb-1">
              <div />
              {['Q1','Q2','Q3','Q4'].map((q, i) => (
                <div key={q} className={i >= revealed ? 'opacity-30' : ''}>{q}</div>
              ))}
            </div>
            <div className="grid grid-cols-[2.5rem_repeat(4,1fr)] gap-1 text-center">
              <div className="text-left font-medium text-foreground">{evt.teamA.name.slice(0, 3).toUpperCase()}</div>
              {quarters.a.map((q, i) => (
                <div key={i} className={i >= revealed ? 'opacity-20' : ''}>
                  {i < revealed ? `${q.goals}.${q.behinds}` : '···'}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[2.5rem_repeat(4,1fr)] gap-1 text-center">
              <div className="text-left font-medium text-foreground">{evt.teamB.name.slice(0, 3).toUpperCase()}</div>
              {quarters.b.map((q, i) => (
                <div key={i} className={i >= revealed ? 'opacity-20' : ''}>
                  {i < revealed ? `${q.goals}.${q.behinds}` : '···'}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quarter-break narrative */}
        {phase === 'break' && revealed < 4 && (
          <p className="text-sm text-muted-foreground italic text-center px-4">
            {breakNarrative(evt.teamA.name, evt.teamB.name, aRunning.total, bRunning.total, revealed)}
          </p>
        )}

        {/* Simulating message */}
        {phase === 'simulating' && (
          <p className="text-xs text-muted-foreground text-center animate-pulse">
            Simulating quarter {revealed + 1}…
          </p>
        )}

        {/* Pre-match */}
        {phase === 'pre-match' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-center text-xs text-muted-foreground">
              <div className="rounded border p-2">
                <div className="font-semibold text-foreground mb-0.5">{evt.teamA.name}</div>
                <div>Rating {evt.teamA.teamRating}</div>
                <div>{evt.teamA.playerIds.length} players</div>
              </div>
              <div className="rounded border p-2">
                <div className="font-semibold text-foreground mb-0.5">{evt.teamB.name}</div>
                <div>Rating {evt.teamB.teamRating}</div>
                <div>{evt.teamB.playerIds.length} players</div>
              </div>
            </div>
            <div className="flex justify-center pt-1">
              <Button size="lg" className="gap-2" onClick={handleBegin}>
                <Play className="h-4 w-4" /> Begin Match
              </Button>
            </div>
          </div>
        )}

        {/* Break / continue */}
        {phase === 'break' && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs font-medium text-muted-foreground">{quarterLabel(revealed)}</div>
            <Button onClick={handleContinue} className="gap-2">
              <ChevronRight className="h-4 w-4" />
              {revealed < 3 ? `Continue to Q${revealed + 1}` : 'See Full Time'}
            </Button>
          </div>
        )}

        {/* Full time result */}
        {phase === 'complete' && (
          <div className="space-y-4">
            {bog && (
              <div className="flex items-center justify-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 py-2 px-4">
                <Star className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Best on Ground: {bog}
                </span>
              </div>
            )}

            {result.userClubParticipants.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Your Club's Representatives
                </div>
                <div className="flex flex-wrap gap-1">
                  {result.userClubParticipants.map((pid) => (
                    <Badge key={pid} variant="outline" className="text-xs">
                      {playerName(pid)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={onDone} className="gap-2">
                <ChevronRight className="h-4 w-4" /> Continue
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Result card (completed matches)
// ---------------------------------------------------------------------------

function MatchResultCard({
  evt,
  playerName,
  matchIndex,
}: {
  evt: SpecialEventInstance
  playerName: (id: string) => string
  matchIndex: number
}) {
  if (!evt.result) return null
  const { teamAScore, teamBScore, userClubParticipants, bestOnGround } = evt.result
  const aWon = teamAScore.total > teamBScore.total
  const bWon = teamBScore.total > teamAScore.total
  const drew = !aWon && !bWon

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/30 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Game {matchIndex} · {new Date(evt.scheduledDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />{evt.venue}
        </div>
      </div>
      <CardContent className="pt-4 pb-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
          <div className="space-y-1">
            <div className="text-sm font-bold">{evt.teamA.name}</div>
            <div className={`text-3xl font-bold font-mono ${aWon ? '' : 'text-muted-foreground'}`}>{teamAScore.total}</div>
            <div className="text-xs text-muted-foreground font-mono">{teamAScore.goals}.{teamAScore.behinds}</div>
            {aWon && <Badge className="text-xs">Winner</Badge>}
            {drew && <Badge variant="secondary" className="text-xs">Draw</Badge>}
          </div>
          <span className="text-muted-foreground font-bold text-lg">v</span>
          <div className="space-y-1">
            <div className="text-sm font-bold">{evt.teamB.name}</div>
            <div className={`text-3xl font-bold font-mono ${bWon ? '' : 'text-muted-foreground'}`}>{teamBScore.total}</div>
            <div className="text-xs text-muted-foreground font-mono">{teamBScore.goals}.{teamBScore.behinds}</div>
            {bWon && <Badge className="text-xs">Winner</Badge>}
          </div>
        </div>
        {bestOnGround && (
          <div className="mt-3 flex items-center justify-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 py-1.5 px-3">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
              Best on Ground: {playerName(bestOnGround)}
            </span>
          </div>
        )}
        {userClubParticipants.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium flex items-center gap-1">
              <Shield className="h-3 w-3" /> Your Club's Representatives
            </div>
            <div className="flex flex-wrap gap-1">
              {userClubParticipants.map((pid) => (
                <Badge key={pid} variant="outline" className="text-xs">{playerName(pid)}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Team sheet card
// ---------------------------------------------------------------------------

function TeamSheetCard({ evt, playerName, matchIndex }: { evt: SpecialEventInstance; playerName: (id: string) => string; matchIndex: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Game {matchIndex} · {evt.teamA.name} vs {evt.teamB.name}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-4">
          {[evt.teamA, evt.teamB].map((team) => (
            <div key={team.name}>
              <div className="text-xs font-semibold mb-1.5 text-muted-foreground">{team.name}</div>
              <div className="space-y-0.5">
                {team.playerIds.map((pid) => (
                  <div key={pid} className="text-xs flex items-center gap-1">
                    {pid === evt.result?.bestOnGround && <Star className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
                    {evt.result?.userClubParticipants.includes(pid) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                    <span className={evt.result?.userClubParticipants.includes(pid) ? 'font-medium' : 'text-muted-foreground'}>
                      {playerName(pid)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" /> Your club</span>
          <span className="flex items-center gap-1"><Star className="h-2.5 w-2.5 text-amber-500" /> BOG</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function StateOfOriginPage() {
  const navigate = useNavigate()
  const specialEvents = useGameStore((s) => s.specialEvents)
  const players = useGameStore((s) => s.players)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const settings = useGameStore((s) => s.settings)
  const currentYear = useGameStore((s) => s.currentYear)
  const simSpecialEvent = useGameStore((s) => s.simSpecialEvent)

  // State for the live view — holds the event+result while watching
  const [liveMatch, setLiveMatch] = useState<{
    evt: SpecialEventInstance
    result: SpecialEventMatchResult
  } | null>(null)

  const playerName = useCallback((id: string) => {
    const p = players[id]
    return p ? `${p.firstName} ${p.lastName}` : 'Unknown'
  }, [players])

  const sooEvents = useMemo(() => {
    if (!specialEvents) return []
    return [...specialEvents.events]
      .filter((e) => e.eventId === 'state-of-origin')
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
  }, [specialEvents])

  const completedEvents = useMemo(() => sooEvents.filter((e) => e.status === 'completed'), [sooEvents])
  const upcomingEvents = useMemo(() => sooEvents.filter((e) => e.status === 'scheduled'), [sooEvents])
  const nextUpcoming = upcomingEvents[0] ?? null

  const standings = useMemo(() => {
    if (!specialEvents?.originStandings) return []
    return [...specialEvents.originStandings].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
    })
  }, [specialEvents])

  const seriesResult = specialEvents?.seriesResults['state-of-origin']
  const originEnabled = settings.specialEvents?.enabled && settings.specialEvents.events['state-of-origin']

  const handleWatch = useCallback((evt: SpecialEventInstance) => {
    // Sim the event to store the result, then capture it for the live view
    const { result } = simSpecialEvent(evt.id)
    if (result) {
      // After simSpecialEvent, read the updated event from the store
      setLiveMatch({ evt, result })
    }
  }, [simSpecialEvent])

  const handleLiveDone = useCallback(() => {
    setLiveMatch(null)
  }, [])

  if (!originEnabled || sooEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <Trophy className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-muted-foreground">
          {originEnabled ? 'No State of Origin matches scheduled this season.' : 'State of Origin is not enabled in Game Settings.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back
        </Button>
      </div>
    )
  }

  const leader = seriesResult
    ? seriesResult.teamAWins > seriesResult.teamBWins ? completedEvents[0]?.teamA.name
      : seriesResult.teamBWins > seriesResult.teamAWins ? completedEvents[0]?.teamB.name
      : null
    : null

  const seriesComplete = upcomingEvents.length === 0 && completedEvents.length > 0

  return (
    <div className="space-y-5 p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            State of Origin {currentYear}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {settings.specialEvents?.originConfig?.format === 'best-of-3' ? 'Best of 3 Series' : 'Series'} · {completedEvents.length} of {sooEvents.length} matches played
          </p>
        </div>
      </div>

      {/* Live match view — shown when watching */}
      {liveMatch && (
        <LiveSOOView
          evt={liveMatch.evt}
          result={liveMatch.result}
          playerName={playerName}
          onDone={handleLiveDone}
        />
      )}

      {/* Series winner banner */}
      {!liveMatch && seriesComplete && leader && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-center gap-3">
          <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <div className="font-semibold text-amber-700 dark:text-amber-400">{leader} wins the series!</div>
            <div className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
              {seriesResult?.teamAWins}–{seriesResult?.teamBWins}
              {seriesResult?.draws ? `–${seriesResult.draws}` : ''} ({completedEvents[0]?.teamA.name} – {completedEvents[0]?.teamB.name})
            </div>
          </div>
        </div>
      )}

      {/* Live series score */}
      {!liveMatch && !seriesComplete && completedEvents.length > 0 && seriesResult && (
        <Card className="border-primary/30">
          <CardContent className="pt-3 pb-3">
            <div className="text-xs text-muted-foreground text-center mb-2 font-medium">Series Score</div>
            <div className="grid grid-cols-3 items-center text-center gap-2">
              <div>
                <div className="text-sm font-bold">{completedEvents[0]?.teamA.name}</div>
                <div className="text-2xl font-bold text-primary">{seriesResult.teamAWins}</div>
              </div>
              <div className="text-muted-foreground">
                {seriesResult.draws > 0 && <div className="text-sm">{seriesResult.draws} draw{seriesResult.draws !== 1 ? 's' : ''}</div>}
              </div>
              <div>
                <div className="text-sm font-bold">{completedEvents[0]?.teamB.name}</div>
                <div className="text-2xl font-bold text-primary">{seriesResult.teamBWins}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next upcoming match — Watch button */}
      {!liveMatch && nextUpcoming && (
        <Card className="border-primary/40 bg-primary/5">
          <div className="border-b border-primary/20 bg-primary/10 px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-primary uppercase tracking-wide">
              Next Match — Game {completedEvents.length + 1}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" />{nextUpcoming.venue}
            </span>
          </div>
          <CardContent className="pt-4 pb-4 space-y-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
              <div>
                <div className="text-base font-bold">{nextUpcoming.teamA.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Rating {nextUpcoming.teamA.teamRating}</div>
              </div>
              <div className="text-muted-foreground font-bold">vs</div>
              <div>
                <div className="text-base font-bold">{nextUpcoming.teamB.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Rating {nextUpcoming.teamB.teamRating}</div>
              </div>
            </div>
            <div className="flex justify-center">
              <Button size="lg" className="gap-2" onClick={() => handleWatch(nextUpcoming)}>
                <Play className="h-4 w-4" /> Watch Match
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Other upcoming matches */}
      {!liveMatch && upcomingEvents.length > 1 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Later</h2>
          {upcomingEvents.slice(1).map((evt, i) => (
            <Card key={evt.id} className="border-dashed opacity-75">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Game {completedEvents.length + i + 2}</span>
                  <span className="text-muted-foreground">{evt.teamA.name} vs {evt.teamB.name}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{evt.venue}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Standings (round-robin) */}
      {standings.length > 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" /> Standings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1.5 font-medium">Team</th>
                  <th className="text-center py-1.5 font-medium w-8">P</th>
                  <th className="text-center py-1.5 font-medium w-8">W</th>
                  <th className="text-center py-1.5 font-medium w-8">L</th>
                  <th className="text-center py-1.5 font-medium w-8">D</th>
                  <th className="text-right py-1.5 font-medium w-16">+/-</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr key={s.team} className={`border-b last:border-0 ${i === 0 ? 'font-semibold' : ''}`}>
                    <td className="py-1.5 flex items-center gap-1.5">
                      {i === 0 && <Trophy className="h-3 w-3 text-amber-500" />}{s.team}
                    </td>
                    <td className="text-center py-1.5">{s.played}</td>
                    <td className="text-center py-1.5">{s.wins}</td>
                    <td className="text-center py-1.5">{s.losses}</td>
                    <td className="text-center py-1.5">{s.draws}</td>
                    <td className={`text-right py-1.5 ${s.pointsFor - s.pointsAgainst >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                      {s.pointsFor - s.pointsAgainst >= 0 ? '+' : ''}{s.pointsFor - s.pointsAgainst}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {completedEvents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Results</h2>
          {completedEvents.map((evt, i) => (
            <MatchResultCard key={evt.id} evt={evt} playerName={playerName} matchIndex={i + 1} />
          ))}
        </div>
      )}

      {/* Team sheets */}
      {completedEvents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Team Sheets</h2>
          {completedEvents.map((evt, i) => (
            <TeamSheetCard key={evt.id} evt={evt} playerName={playerName} matchIndex={i + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
