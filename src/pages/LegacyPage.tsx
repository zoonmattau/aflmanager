import { useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Trophy,
  Star,
  TrendingUp,
  Target,
  Clock,
  CheckCircle2,
  XCircle,
  Swords,
} from 'lucide-react'
import {
  buildLegacyRating,
  CHALLENGE_TEMPLATES,
} from '@/engine/legacy/legacyEngine'
import type { ChallengeId, DynastySeasonEntry, FinalPosition } from '@/types/legacy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFinalPosition(fp: FinalPosition): { label: string; colour: string } {
  switch (fp) {
    case 'premiers':    return { label: 'Premiers 🏆', colour: 'text-yellow-400' }
    case 'runner-up':   return { label: 'Runner-up', colour: 'text-slate-300' }
    case 'preliminary': return { label: 'Prelim Final', colour: 'text-green-400' }
    case 'semi':        return { label: 'Semi Final', colour: 'text-green-500' }
    case 'elimination': return { label: 'Elim Final', colour: 'text-green-600' }
    case 'missed':      return { label: 'Missed Finals', colour: 'text-muted-foreground' }
  }
}

function SeasonCard({ entry }: { entry: DynastySeasonEntry }) {
  const fp = formatFinalPosition(entry.finalPosition)
  const borderColor =
    entry.finalPosition === 'premiers' ? 'border-yellow-400/60' :
    entry.finalPosition === 'runner-up' ? 'border-slate-400/60' :
    entry.finalPosition !== 'missed' ? 'border-green-600/60' :
    'border-border'

  return (
    <div className={`rounded-lg border ${borderColor} p-3 min-w-[160px] flex-shrink-0`}>
      <div className="text-xs text-muted-foreground mb-1">Season {entry.seasonNumber} · {entry.year}</div>
      <div className={`text-sm font-semibold mb-1 ${fp.colour}`}>{fp.label}</div>
      <div className="text-xs text-muted-foreground">#{entry.ladderPosition} ladder</div>
      <div className="text-xs text-muted-foreground">{entry.wins}W {entry.losses}L</div>
      <div className="mt-2 text-xs font-medium">+{entry.legacyPointsEarned} pts</div>
      {entry.notableEvents.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.notableEvents.slice(0, 2).map((evt, i) => (
            <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
              {evt}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab() {
  const legacyState = useGameStore((s) => s.legacyState)
  const acceptChallenge = useGameStore((s) => s.acceptChallenge)
  const { label, colour } = buildLegacyRating(legacyState.totalPoints)
  const bd = legacyState.breakdown
  const board = legacyState.boardExpectation

  const rows: { label: string; season: number; career: number }[] = [
    { label: 'Premierships', season: 0, career: bd.premierships },
    { label: 'GF Runner-up', season: 0, career: bd.grandFinals },
    { label: 'Finals appearances', season: 0, career: bd.finalsAppearances },
    { label: 'Top 4 finishes', season: 0, career: bd.top4Finishes },
    { label: '#1 ladder finishes', season: 0, career: bd.ladderLeads },
    { label: 'Brownlow medallists', season: 0, career: bd.brownlows },
    { label: 'Coleman medallists', season: 0, career: bd.colemanMedals },
    { label: 'Club Best & Fairest', season: 0, career: bd.bestAndFairest },
    { label: 'All-Australian selections', season: 0, career: bd.allAustralians },
    { label: 'Draft picks → 80+ OVR', season: 0, career: bd.draftSuccesses },
    { label: 'Financial surpluses', season: 0, career: bd.financialSurpluses },
    { label: 'Win streak bonus', season: 0, career: bd.winStreakBonus },
    { label: 'Career goals bonus', season: 0, career: bd.careerGoals },
    { label: 'Challenge rewards', season: 0, career: bd.challenges },
  ]

  // Fill season column from last dynasty entry
  const last = legacyState.dynastyHistory[legacyState.dynastyHistory.length - 1]

  const moodColour =
    board.mood === 'ecstatic' ? 'text-yellow-400' :
    board.mood === 'satisfied' ? 'text-green-400' :
    board.mood === 'neutral' ? 'text-muted-foreground' :
    board.mood === 'concerned' ? 'text-orange-400' : 'text-red-400'

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card>
        <CardContent className="pt-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-5 w-5 text-yellow-400" />
              <span className="text-2xl font-bold">{legacyState.totalPoints.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">legacy pts</span>
            </div>
            <Badge variant="outline" className={`${colour} border-current`}>{label}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xl font-bold">{legacyState.premiershipsWon}</div>
              <div className="text-xs text-muted-foreground">Flags</div>
            </div>
            <div>
              <div className="text-xl font-bold">{legacyState.allTimeWins}</div>
              <div className="text-xs text-muted-foreground">Wins</div>
            </div>
            <div>
              <div className="text-xl font-bold">{legacyState.seasonsManaged}</div>
              <div className="text-xs text-muted-foreground">Seasons</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Breakdown table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Points Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Category</th>
                  {last && <th className="text-right px-2 py-2 font-medium text-muted-foreground">Last</th>}
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => r.career > 0).map((r) => (
                  <tr key={r.label} className="border-b border-border/50">
                    <td className="px-4 py-1.5 text-muted-foreground">{r.label}</td>
                    {last && <td className="px-2 py-1.5 text-right">{r.season > 0 ? `+${r.season}` : '—'}</td>}
                    <td className="px-4 py-1.5 text-right font-medium">{r.career}</td>
                  </tr>
                ))}
                <tr className="bg-muted/30">
                  <td className="px-4 py-2 font-semibold">Total</td>
                  {last && <td className="px-2 py-2 text-right font-semibold">+{last.legacyPointsEarned}</td>}
                  <td className="px-4 py-2 text-right font-semibold">{legacyState.totalPoints}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Board expectations */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Board Expectations
                <span className={`text-xs font-normal capitalize ${moodColour}`}>
                  ({board.mood})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={board.pressureLevel} className="h-2" />
              <div className="text-xs text-muted-foreground">{board.message}</div>
              <div className="flex flex-wrap gap-2 text-xs">
                {board.requirePremiership && <Badge variant="destructive">Premiership required</Badge>}
                {!board.requirePremiership && board.requireGrandFinal && <Badge variant="destructive">Grand Final required</Badge>}
                {!board.requireGrandFinal && board.requireTopFour && <Badge variant="secondary">Top 4 required</Badge>}
                {!board.requireTopFour && board.requireFinals && <Badge variant="secondary">Finals required</Badge>}
                {board.minLadderPosition < 18 && (
                  <Badge variant="outline">Finish top {board.minLadderPosition}</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Active challenge */}
          {legacyState.activeChallenge && legacyState.activeChallenge.status === 'active' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Swords className="h-4 w-4" />
                  Active Challenge: {legacyState.activeChallenge.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">{legacyState.activeChallenge.description}</p>
                <ul className="space-y-1">
                  {legacyState.activeChallenge.rules.map((rule, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1">
                      <span className="text-primary">·</span> {rule}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="h-3 w-3" />
                  <span>Ends season {legacyState.activeChallenge.targetSeason}</span>
                  <Badge variant="secondary" className="ml-auto">+{legacyState.activeChallenge.legacyReward} pts</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {!legacyState.activeChallenge && legacyState.premiershipsWon > 0 && (
            <Card className="border-dashed">
              <CardContent className="pt-4 text-center space-y-2">
                <p className="text-xs text-muted-foreground">No active challenge. Start one to earn bonus legacy points.</p>
                <Button size="sm" variant="outline" onClick={() => {
                  const avail = CHALLENGE_TEMPLATES.find((t) => t.id === 'back-to-back')
                  if (avail) acceptChallenge(avail.id as ChallengeId)
                }}>
                  Start Back-to-Back Challenge
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline Tab
// ---------------------------------------------------------------------------

function TimelineTab() {
  const history = useGameStore((s) => s.legacyState.dynastyHistory)

  if (history.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Your dynasty timeline will appear here after your first season.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Scroll right to view full career timeline →</p>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {[...history].reverse().map((entry) => (
          <SeasonCard key={entry.seasonNumber} entry={entry} />
        ))}
      </div>

      {/* Summary bar */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center text-sm">
          <div>
            <div className="font-bold">{history.filter((e) => e.finalPosition === 'premiers').length}</div>
            <div className="text-xs text-muted-foreground">Premierships</div>
          </div>
          <div>
            <div className="font-bold">{history.filter((e) => e.finalPosition !== 'missed').length}</div>
            <div className="text-xs text-muted-foreground">Finals seasons</div>
          </div>
          <div>
            <div className="font-bold">{history.filter((e) => e.ladderPosition <= 4).length}</div>
            <div className="text-xs text-muted-foreground">Top 4 finishes</div>
          </div>
          <div>
            <div className="font-bold">{history.filter((e) => e.boardMet).length}</div>
            <div className="text-xs text-muted-foreground">Board expectations met</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Career Goals Tab
// ---------------------------------------------------------------------------

function CareerGoalsTab() {
  const objectives = useGameStore((s) => s.careerObjectives)

  const active = objectives.filter((o) => o.status === 'active')
  const completed = objectives.filter((o) => o.status === 'completed')
  const expired = objectives.filter((o) => o.status === 'expired')

  return (
    <div className="space-y-4">
      {active.length === 0 && completed.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm space-y-1">
          <Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>Career goals will be generated as you progress through your career.</p>
          <p className="text-xs">Complete your first season to unlock your first goals.</p>
        </div>
      )}

      {active.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Active Goals</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((obj) => {
              const pct = obj.targetValue > 0 ? Math.min(100, (obj.currentValue / obj.targetValue) * 100) : 0
              return (
                <Card key={obj.id}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{obj.title}</div>
                        <div className="text-xs text-muted-foreground">{obj.description}</div>
                      </div>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{obj.currentValue} / {obj.targetValue}</span>
                      {obj.expiresYear && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Expires {obj.expiresYear}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            Completed Goals
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {completed.map((obj) => (
              <div key={obj.id} className="flex items-center gap-3 rounded-lg border border-border/50 p-3 opacity-70">
                <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{obj.title}</div>
                  {obj.completedYear && (
                    <div className="text-xs text-muted-foreground">Completed {obj.completedYear}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expired.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
            <XCircle className="h-4 w-4" />
            Expired
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {expired.map((obj) => (
              <div key={obj.id} className="flex items-center gap-3 rounded-lg border border-border/30 p-3 opacity-40">
                <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="text-sm text-muted-foreground">{obj.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Challenges Tab
// ---------------------------------------------------------------------------

function ChallengesTab() {
  const legacyState = useGameStore((s) => s.legacyState)
  const acceptChallenge = useGameStore((s) => s.acceptChallenge)
  const hasActiveChallenge = legacyState.activeChallenge?.status === 'active'

  return (
    <div className="space-y-4">
      {hasActiveChallenge && legacyState.activeChallenge && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Swords className="h-4 w-4 text-primary" />
              Active Challenge: {legacyState.activeChallenge.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{legacyState.activeChallenge.description}</p>
            <ul className="space-y-1.5">
              {legacyState.activeChallenge.rules.map((rule, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-primary font-bold">·</span>
                  {rule}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-4 text-sm pt-1">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Started season {legacyState.activeChallenge.startedSeason}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span>Deadline season {legacyState.activeChallenge.targetSeason}</span>
              </div>
              <Badge variant="secondary" className="ml-auto">
                <Star className="h-3 w-3 mr-1" />
                +{legacyState.activeChallenge.legacyReward} pts on completion
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {!hasActiveChallenge && (
        <>
          <p className="text-sm text-muted-foreground">
            Select a challenge to pursue alongside your regular campaign. Challenges are on the honour system — it's up to you to follow the rules.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {CHALLENGE_TEMPLATES.map((c) => (
              <Card key={c.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    {c.title}
                    <Badge variant="secondary">+{c.legacyReward} pts</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col flex-1 gap-3">
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                  <ul className="space-y-1 flex-1">
                    {c.rules.map((rule, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span className="text-primary shrink-0">·</span>
                        {rule}
                      </li>
                    ))}
                  </ul>
                  <div className="text-xs text-muted-foreground">
                    Duration: {c.targetSeasons === 1 ? '1 season' : `up to ${c.targetSeasons} seasons`}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => acceptChallenge(c.id as ChallengeId)}
                  >
                    Accept Challenge
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function LegacyPage() {
  const [tab, setTab] = useState('overview')
  const legacyState = useGameStore((s) => s.legacyState)
  const navigate = useNavigate()

  const { label, colour } = buildLegacyRating(legacyState.totalPoints)

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            Legacy & Dynasty
          </h1>
          <p className={`text-sm ${colour}`}>{label} · {legacyState.totalPoints.toLocaleString()} pts</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Back</Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="goals">Career Goals</TabsTrigger>
          <TabsTrigger value="challenges">Challenges</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="timeline">
          <TimelineTab />
        </TabsContent>

        <TabsContent value="goals">
          <CareerGoalsTab />
        </TabsContent>

        <TabsContent value="challenges">
          <ChallengesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
