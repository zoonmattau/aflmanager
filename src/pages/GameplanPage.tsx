import { useMemo, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Settings } from 'lucide-react'
import type { ClubGameplan, PlayStyleRules } from '@/types/club'
import { DEFAULT_PLAY_STYLE } from '@/engine/gameplan/defaults'
import type { Player } from '@/types/player'
import { applyGameplanAdjustment } from '@/engine/coaching/tacticalAdjustments'
import { createDefaultGameplan } from '@/engine/gameplan/defaults'
import { isPlayerEligibleForPositionType } from '@/engine/player/positionEligibility'

export function GameplanPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const season = useGameStore((s) => s.season)
  const currentRound = useGameStore((s) => s.currentRound)
  const weeklyGameplans = useGameStore((s) => s.weeklyGameplans)
  const updateGameplan = useGameStore((s) => s.updateGameplan)
  const updateWeeklyGameplanAdjustment = useGameStore((s) => s.updateWeeklyGameplanAdjustment)
  const clearWeeklyGameplanAdjustment = useGameStore((s) => s.clearWeeklyGameplanAdjustment)
  const generateWeeklyCounterGameplanForUser = useGameStore((s) => s.generateWeeklyCounterGameplanForUser)
  const matchResults = useGameStore((s) => s.matchResults)

  const club = clubs[playerClubId]
  const gameplan = club?.gameplan ?? createDefaultGameplan()

  const round = season.rounds[currentRound]
  const userFixture = round?.fixtures.find(
    (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  )
  const opponentClubId = userFixture
    ? userFixture.homeClubId === playerClubId ? userFixture.awayClubId : userFixture.homeClubId
    : null
  const opponent = opponentClubId ? clubs[opponentClubId] : null

  const weeklyEntry = weeklyGameplans[playerClubId]
  const weeklyOverrides =
    weeklyEntry && weeklyEntry.round === currentRound
      ? weeklyEntry.overrides
      : null
  const weeklyGameplan = useMemo(
    () => applyGameplanAdjustment(gameplan, weeklyOverrides),
    [gameplan, weeklyOverrides],
  )
  const [editWeekly, setEditWeekly] = useState(Boolean(weeklyOverrides))
  const activePlan = editWeekly ? weeklyGameplan : gameplan
  const updatePlan = (updates: Partial<ClubGameplan>) => {
    if (editWeekly) {
      updateWeeklyGameplanAdjustment(updates)
    } else {
      updateGameplan(updates)
    }
  }

  // Get ruckmen from the player's club for ruck nomination
  const clubPlayers = Object.values(players).filter(
    (p: Player) => p.clubId === playerClubId,
  )
  const ruckmen = clubPlayers.filter(
    (p: Player) => isPlayerEligibleForPositionType(p, 'RK'),
  )

  // Last 5 rounds K:H ratio for the user's club
  const last5KH = useMemo(() => {
    const clubMatches = matchResults
      .filter((m) => m.result && (m.homeClubId === playerClubId || m.awayClubId === playerClubId))
      .slice(-5)
    if (clubMatches.length === 0) return null
    let totalKicks = 0
    let totalHandballs = 0
    for (const m of clubMatches) {
      const stats = m.homeClubId === playerClubId ? m.result!.homePlayerStats : m.result!.awayPlayerStats
      for (const s of stats) {
        totalKicks += s.kicks
        totalHandballs += s.handballs
      }
    }
    if (totalHandballs === 0) return null
    return { kicks: totalKicks, handballs: totalHandballs, ratio: totalKicks / totalHandballs, games: clubMatches.length }
  }, [matchResults, playerClubId])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">Gameplan</h1>
          <p className="text-sm text-muted-foreground">
            Set your team&apos;s tactical approach
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Weekly Tactical Adjustment</CardTitle>
          <CardDescription>
            {opponent
              ? `Set a one-week plan for Round ${currentRound + 1} vs ${opponent.name}.`
              : 'No opponent this round (bye or offseason).'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button
            variant={editWeekly ? 'default' : 'outline'}
            size="sm"
            disabled={!opponent}
            onClick={() => setEditWeekly((v) => !v)}
          >
            {editWeekly ? 'Editing Weekly Plan' : 'Edit Season Base Plan'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!opponent}
            onClick={() => {
              generateWeeklyCounterGameplanForUser()
              setEditWeekly(true)
            }}
          >
            Auto Counter Opponent
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!weeklyOverrides}
            onClick={() => {
              clearWeeklyGameplanAdjustment()
              setEditWeekly(false)
            }}
          >
            Clear Weekly Plan
          </Button>
          {weeklyOverrides && (
            <p className="text-xs text-muted-foreground">
              Weekly override active for this round.
            </p>
          )}
          {opponent && (
            <p className="text-xs text-muted-foreground">
              Opponent style: {opponent.gameplan.offensiveStyle}, {opponent.gameplan.tempo} tempo, {opponent.gameplan.aggression} aggression.
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="set-pieces">Set Pieces</TabsTrigger>
          <TabsTrigger value="line-tactics">Line Tactics</TabsTrigger>
          <TabsTrigger value="ruck-rotations">Ruck &amp; Rotations</TabsTrigger>
          <TabsTrigger value="play-style">Play Style</TabsTrigger>
        </TabsList>

        {/* Tab 1: General */}
        <TabsContent value="general">
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Offensive Style</CardTitle>
                <CardDescription>
                  How your team approaches possession and scoring
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="offensive-style">Style</Label>
                <Select
                  value={activePlan.offensiveStyle}
                  onValueChange={(v) =>
                    updatePlan({ offensiveStyle: v as ClubGameplan['offensiveStyle'] })
                  }
                >
                  <SelectTrigger id="offensive-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attacking">
                      Attacking - Push numbers forward, high risk/reward
                    </SelectItem>
                    <SelectItem value="balanced">
                      Balanced - Measured approach
                    </SelectItem>
                    <SelectItem value="defensive">
                      Defensive - Protect the backline, counter-attack
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tempo</CardTitle>
                <CardDescription>
                  The pace your team moves the ball
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="tempo">Tempo</Label>
                <Select
                  value={activePlan.tempo}
                  onValueChange={(v) =>
                    updatePlan({ tempo: v as ClubGameplan['tempo'] })
                  }
                >
                  <SelectTrigger id="tempo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">
                      Fast - Quick ball movement, run and carry
                    </SelectItem>
                    <SelectItem value="medium">
                      Medium - Balanced tempo
                    </SelectItem>
                    <SelectItem value="slow">
                      Slow - Methodical, control possession
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aggression</CardTitle>
                <CardDescription>
                  How physically your team contests the ball
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="aggression">Level</Label>
                <Select
                  value={activePlan.aggression}
                  onValueChange={(v) =>
                    updatePlan({ aggression: v as ClubGameplan['aggression'] })
                  }
                >
                  <SelectTrigger id="aggression">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">
                      High - Hard at the contest, more tackles &amp; pressure
                    </SelectItem>
                    <SelectItem value="medium">
                      Medium - Standard pressure
                    </SelectItem>
                    <SelectItem value="low">
                      Low - Conserve energy, pick contests wisely
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Set Pieces */}
        <TabsContent value="set-pieces">
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Kick-In Tactic</CardTitle>
                <CardDescription>
                  How your team restarts play after a behind
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="kick-in">Tactic</Label>
                <Select
                  value={activePlan.kickInTactic}
                  onValueChange={(v) =>
                    updatePlan({ kickInTactic: v as ClubGameplan['kickInTactic'] })
                  }
                >
                  <SelectTrigger id="kick-in">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="play-on-short">
                      Play On Short - Quick, short restart
                    </SelectItem>
                    <SelectItem value="play-on-long">
                      Play On Long - Kick long immediately
                    </SelectItem>
                    <SelectItem value="set-up-short">
                      Set Up Short - Structured short restart
                    </SelectItem>
                    <SelectItem value="set-up-long">
                      Set Up Long - Structured long kick
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Centre Bounce</CardTitle>
                <CardDescription>
                  How your midfield sets up at centre bounces
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="centre">Setup</Label>
                <Select
                  value={activePlan.centreTactic}
                  onValueChange={(v) =>
                    updatePlan({ centreTactic: v as ClubGameplan['centreTactic'] })
                  }
                >
                  <SelectTrigger id="centre">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spread">
                      Spread - Players wide, find space
                    </SelectItem>
                    <SelectItem value="cluster">
                      Cluster - Numbers at the contest
                    </SelectItem>
                    <SelectItem value="balanced">
                      Balanced - Mix of both
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stoppage</CardTitle>
                <CardDescription>
                  How your team sets up at general stoppages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="stoppage">Setup</Label>
                <Select
                  value={activePlan.stoppageTactic}
                  onValueChange={(v) =>
                    updatePlan({ stoppageTactic: v as ClubGameplan['stoppageTactic'] })
                  }
                >
                  <SelectTrigger id="stoppage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spread">
                      Spread - Width and space
                    </SelectItem>
                    <SelectItem value="cluster">
                      Cluster - Flood the stoppage
                    </SelectItem>
                    <SelectItem value="balanced">
                      Balanced - Situation dependent
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: Line Tactics */}
        <TabsContent value="line-tactics">
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Defensive Line</CardTitle>
                <CardDescription>
                  How your backline defends
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="def-line">Style</Label>
                <Select
                  value={activePlan.defensiveLine}
                  onValueChange={(v) =>
                    updatePlan({ defensiveLine: v as ClubGameplan['defensiveLine'] })
                  }
                >
                  <SelectTrigger id="def-line">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="press">
                      Press - High pressure, aggressive intercepts
                    </SelectItem>
                    <SelectItem value="hold">
                      Hold - Maintain shape, contest marks
                    </SelectItem>
                    <SelectItem value="run">
                      Run - Rebound and carry out of defence
                    </SelectItem>
                    <SelectItem value="zone">
                      Zone - Cover space, read the play
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Midfield Line</CardTitle>
                <CardDescription>
                  How your midfield operates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="mid-line">Style</Label>
                <Select
                  value={activePlan.midfieldLine}
                  onValueChange={(v) =>
                    updatePlan({ midfieldLine: v as ClubGameplan['midfieldLine'] })
                  }
                >
                  <SelectTrigger id="mid-line">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="press">
                      Press - Apply constant pressure at the contest
                    </SelectItem>
                    <SelectItem value="hold">
                      Hold - Maintain structure, win the ball on the ground
                    </SelectItem>
                    <SelectItem value="run">
                      Run - Run and carry, link play
                    </SelectItem>
                    <SelectItem value="zone">
                      Zone - Defensive coverage, cut off supply
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Forward Line</CardTitle>
                <CardDescription>
                  How your forwards operate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="fwd-line">Style</Label>
                <Select
                  value={activePlan.forwardLine}
                  onValueChange={(v) =>
                    updatePlan({ forwardLine: v as ClubGameplan['forwardLine'] })
                  }
                >
                  <SelectTrigger id="fwd-line">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="press">
                      Press - Defensive pressure, contest marks
                    </SelectItem>
                    <SelectItem value="hold">
                      Hold - Hold position, lead patterns
                    </SelectItem>
                    <SelectItem value="run">
                      Run - Run and create, spread the zone
                    </SelectItem>
                    <SelectItem value="zone">
                      Zone - Occupy space, spread the defence
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Ruck & Rotations */}
        <TabsContent value="ruck-rotations" className="mt-0">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ruck Nomination</CardTitle>
                <CardDescription>
                  Select your primary and backup ruckmen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="primary-ruck">Primary Ruck</Label>
                  <Select
                    value={activePlan.ruckNomination.primaryRuckId ?? 'none'}
                    onValueChange={(v) =>
                      updatePlan({
                        ruckNomination: {
                          ...activePlan.ruckNomination,
                          primaryRuckId: v === 'none' ? null : v,
                        },
                      })
                    }
                  >
                    <SelectTrigger id="primary-ruck">
                      <SelectValue placeholder="Select primary ruck" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Auto-select</SelectItem>
                      {ruckmen.map((p: Player) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.firstName} {p.lastName} (#{p.jerseyNumber})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="backup-ruck">Backup Ruck</Label>
                  <Select
                    value={activePlan.ruckNomination.backupRuckId ?? 'none'}
                    onValueChange={(v) =>
                      updatePlan({
                        ruckNomination: {
                          ...activePlan.ruckNomination,
                          backupRuckId: v === 'none' ? null : v,
                        },
                      })
                    }
                  >
                    <SelectTrigger id="backup-ruck">
                      <SelectValue placeholder="Select backup ruck" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {ruckmen
                        .filter((p: Player) => p.id !== activePlan.ruckNomination.primaryRuckId,
                        )
                        .map((p: Player) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.firstName} {p.lastName} (#{p.jerseyNumber})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Switch
                    id="around-ground"
                    checked={activePlan.ruckNomination.aroundTheGround}
                    onCheckedChange={(checked: boolean) =>
                      updatePlan({
                        ruckNomination: {
                          ...activePlan.ruckNomination,
                          aroundTheGround: checked,
                        },
                      })
                    }
                  />
                  <Label htmlFor="around-ground">
                    Around the Ground - Ruck goes forward and back
                  </Label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Interchange Rotations</CardTitle>
                <CardDescription>
                  How frequently your team rotates the interchange
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="rotations">Frequency</Label>
                <Select
                  value={activePlan.rotations}
                  onValueChange={(v) =>
                    updatePlan({ rotations: v as ClubGameplan['rotations'] })
                  }
                >
                  <SelectTrigger id="rotations">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">
                      High - Frequent rotations, keep legs fresh
                    </SelectItem>
                    <SelectItem value="medium">
                      Medium - Standard rotation pattern
                    </SelectItem>
                    <SelectItem value="low">
                      Low - Minimal rotations, consistent structures
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* Tab 5: Play Style */}
        <TabsContent value="play-style">
          {(() => {
            const ps: PlayStyleRules = { ...DEFAULT_PLAY_STYLE, ...activePlan.playStyle }
            const updatePS = (patch: Partial<PlayStyleRules>) =>
              updatePlan({ playStyle: { ...ps, ...patch } })
            return (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Forward Leading */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Forward Leading Lanes</CardTitle>
                      <CardDescription className="text-xs">
                        How your forwards set up and move to create scoring options
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Select
                        value={ps.forwardLeading}
                        onValueChange={(v) => updatePS({ forwardLeading: v as PlayStyleRules['forwardLeading'] })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="straight">Straight — Direct leads toward the ball carrier</SelectItem>
                          <SelectItem value="diagonal">Diagonal — Angled leads across the corridor</SelectItem>
                          <SelectItem value="hold-spread">Hold &amp; Spread — Hold position, spread wide for long ball</SelectItem>
                          <SelectItem value="rotate">Rotate — Constant rotation through the forward line</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {ps.forwardLeading === 'straight' && '+ More inside 50 entries. − Defenders can read the lead pattern.'}
                        {ps.forwardLeading === 'diagonal' && '+ Harder for defenders to read. + Better marking position.'}
                        {ps.forwardLeading === 'hold-spread' && '+ Better set-shot accuracy. − Fewer corridor options.'}
                        {ps.forwardLeading === 'rotate' && '+ Creates uncontested space. + Good for fast tempo teams.'}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Tap Direction */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Tap Direction</CardTitle>
                      <CardDescription className="text-xs">
                        Preferred ruck tap direction at centre bounces and ball-ups
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Select
                        value={ps.tapDirection}
                        onValueChange={(v) => updatePS({ tapDirection: v as PlayStyleRules['tapDirection'] })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="forward">Forward — Tap to advantage, direct entries</SelectItem>
                          <SelectItem value="backward">Backward — Tap back to midfielder in space</SelectItem>
                          <SelectItem value="read-and-react">Read &amp; React — Best available option</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {ps.tapDirection === 'forward' && '+ More direct forward entries. − Opponents can pre-position.'}
                        {ps.tapDirection === 'backward' && '+ Midfielder collects cleanly. − Slower to get ball forward.'}
                        {ps.tapDirection === 'read-and-react' && '+ Optimal decision each time. Best for dominant ruck units.'}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Stoppage Movement */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Stoppage Movement</CardTitle>
                      <CardDescription className="text-xs">
                        How players position around general play stoppages
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Select
                        value={ps.stoppageMovement}
                        onValueChange={(v) => updatePS({ stoppageMovement: v as PlayStyleRules['stoppageMovement'] })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="flood-back">Flood Back — Defensive shape, numbers behind the ball</SelectItem>
                          <SelectItem value="push-forward">Push Forward — Attack the clearance, flood forward targets</SelectItem>
                          <SelectItem value="numbers">Numbers — Get extra bodies to the contest</SelectItem>
                          <SelectItem value="balanced">Balanced — Read the situation</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {ps.stoppageMovement === 'flood-back' && '+ Less exposed on turnovers. − Fewer forward options after clearance.'}
                        {ps.stoppageMovement === 'push-forward' && '+ More targets after clearance. − Exposed on defensive turnovers.'}
                        {ps.stoppageMovement === 'numbers' && '+ Win more contested ball. + More tackles at the contest.'}
                        {ps.stoppageMovement === 'balanced' && 'Situation-dependent movement. No major tradeoffs.'}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Switch Frequency */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Switch Frequency</CardTitle>
                      <CardDescription className="text-xs">
                        How often the team switches play to the wide or weak side
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Select
                        value={ps.switchFrequency}
                        onValueChange={(v) => updatePS({ switchFrequency: v as PlayStyleRules['switchFrequency'] })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="often">Often — Frequently move ball to open side</SelectItem>
                          <SelectItem value="normal">Normal — Switch when available</SelectItem>
                          <SelectItem value="rarely">Rarely — Direct corridor play</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {ps.switchFrequency === 'often' && '+ More uncontested possessions. + Better marking options. − Slower inside 50 entry.'}
                        {ps.switchFrequency === 'normal' && 'Balanced approach — switch when the opportunity arises.'}
                        {ps.switchFrequency === 'rarely' && '+ More inside 50 entries. − Congested corridors, more contested ball.'}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* General play rules */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">General Play Rules</CardTitle>
                    <CardDescription className="text-xs">
                      Specific in-play movement and disposal instructions
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Switch
                        id="no-uturns"
                        checked={ps.noUTurns}
                        onCheckedChange={(v) => updatePS({ noUTurns: v })}
                        className="mt-0.5"
                      />
                      <div>
                        <Label htmlFor="no-uturns" className="text-sm font-medium">No U-Turns</Label>
                        <p className="text-xs text-muted-foreground">
                          Players maintain forward momentum — never stop and reverse direction when receiving. Creates cleaner disposal angles and reduces intercept risk.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Switch
                        id="handball-to-runner"
                        checked={ps.handbballToRunner}
                        onCheckedChange={(v) => updatePS({ handbballToRunner: v })}
                        className="mt-0.5"
                      />
                      <div>
                        <Label htmlFor="handball-to-runner" className="text-sm font-medium">Handball to Player Running Past</Label>
                        <p className="text-xs text-muted-foreground">
                          Prefer handballing to a teammate in motion rather than a stationary target. Generates momentum, creates uncontested possession chains.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Switch
                        id="no-kick-back"
                        checked={ps.noKickBackAcrossGoal}
                        onCheckedChange={(v) => updatePS({ noKickBackAcrossGoal: v })}
                        className="mt-0.5"
                      />
                      <div>
                        <Label htmlFor="no-kick-back" className="text-sm font-medium">No Kick Back Across Goal</Label>
                        <p className="text-xs text-muted-foreground">
                          Avoid kicking backward or across the face of goal in the forward 50. Reduces dangerous turnovers but slightly limits creative options.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })()}
        </TabsContent>
      </Tabs>

      {/* Ball Distribution Style */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ball Distribution Style</CardTitle>
          <CardDescription>
            Target K:H ratio influences how players distribute the ball during simulation (kicks vs handballs).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Last 5 rounds indicator */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Last {last5KH?.games ?? 0} Rounds Avg K:H
              </p>
              {last5KH ? (
                <>
                  <p className="text-2xl font-bold tabular-nums">{last5KH.ratio.toFixed(1)}:1</p>
                  <p className="text-xs text-muted-foreground">
                    {last5KH.kicks} kicks · {last5KH.handballs} handballs
                    {last5KH.ratio >= 2.0 ? ' — kick dominant' : last5KH.ratio <= 1.0 ? ' — handball heavy' : ' — balanced'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No match data yet</p>
              )}
            </div>
            {/* Target setting */}
            <div className="space-y-2">
              <Label htmlFor="target-kh">Target K:H Ratio</Label>
              <Select
                value={String(activePlan.targetKHRatio ?? 1.5)}
                onValueChange={(v) => updatePlan({ targetKHRatio: parseFloat(v) })}
              >
                <SelectTrigger id="target-kh">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">0.5:1 — Strong handball-first</SelectItem>
                  <SelectItem value="0.75">0.75:1 — Handball-dominant</SelectItem>
                  <SelectItem value="1.0">1.0:1 — Equal kicks and handballs</SelectItem>
                  <SelectItem value="1.25">1.25:1 — Slightly kick-first</SelectItem>
                  <SelectItem value="1.5">1.5:1 — Balanced (default)</SelectItem>
                  <SelectItem value="2.0">2.0:1 — Kick dominant</SelectItem>
                  <SelectItem value="2.5">2.5:1 — Strong kick-first</SelectItem>
                  <SelectItem value="3.0">3.0:1 — Extreme kick-first</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Higher ratio = more kicks relative to handballs. Affects kick simulation probability each possession.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tactical Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tactical Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Your {club?.name} will play a{' '}
            <span className="font-semibold text-foreground">
              {activePlan.offensiveStyle}
            </span>{' '}
            style at{' '}
            <span className="font-semibold text-foreground">{activePlan.tempo}</span>{' '}
            tempo with{' '}
            <span className="font-semibold text-foreground">{activePlan.aggression}</span>{' '}
            aggression.
          </p>
          <p className="text-sm text-muted-foreground">
            Kick-ins:{' '}
            <span className="font-semibold text-foreground">{activePlan.kickInTactic}</span>
            {' | '}Centre:{' '}
            <span className="font-semibold text-foreground">{activePlan.centreTactic}</span>
            {' | '}Stoppages:{' '}
            <span className="font-semibold text-foreground">{activePlan.stoppageTactic}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Defence:{' '}
            <span className="font-semibold text-foreground">{activePlan.defensiveLine}</span>
            {' | '}Midfield:{' '}
            <span className="font-semibold text-foreground">{activePlan.midfieldLine}</span>
            {' | '}Forward:{' '}
            <span className="font-semibold text-foreground">{activePlan.forwardLine}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Rotations:{' '}
            <span className="font-semibold text-foreground">{activePlan.rotations}</span>
            {activePlan.ruckNomination.aroundTheGround && (
              <span className="ml-2 text-xs">(Ruck goes around the ground)</span>
            )}
          </p>

          {/* Tactical tips */}
          {activePlan.offensiveStyle === 'attacking' && (
            <p className="text-xs text-muted-foreground mt-2">
              + Higher scoring chance, more inside 50s. - More vulnerable on counter-attack.
            </p>
          )}
          {activePlan.offensiveStyle === 'defensive' && (
            <p className="text-xs text-muted-foreground mt-2">
              + Stronger defensively, better rebound. - Lower scoring output.
            </p>
          )}
          {activePlan.tempo === 'fast' && (
            <p className="text-xs text-muted-foreground mt-1">
              + More possessions per quarter. - Higher fatigue accumulation.
            </p>
          )}
          {activePlan.aggression === 'high' && (
            <p className="text-xs text-muted-foreground mt-1">
              + More contested possessions and tackles. - Higher injury risk.
            </p>
          )}
          {activePlan.kickInTactic === 'play-on-long' && (
            <p className="text-xs text-muted-foreground mt-1">
              + More inside 50 entries. - Slightly less accurate.
            </p>
          )}
          {activePlan.centreTactic === 'cluster' && (
            <p className="text-xs text-muted-foreground mt-1">
              + Better contested possession. - Fewer uncontested possessions.
            </p>
          )}
          {activePlan.defensiveLine === 'press' && (
            <p className="text-xs text-muted-foreground mt-1">
              + More tackles and pressure. - Risk of giving up goals on turnovers.
            </p>
          )}
          {activePlan.forwardLine === 'press' && (
            <p className="text-xs text-muted-foreground mt-1">
              + Better contested marks up forward. - Requires high work rate.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

