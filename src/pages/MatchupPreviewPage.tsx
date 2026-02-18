import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FootballField } from '@/components/lineup/FootballField'
import { addDays, formatDate } from '@/engine/calendar/calendarEngine'
import { selectBestLineup } from '@/engine/ai/lineupSelection'
import { getLineupSlots } from '@/engine/core/constants'
import { isPlayerSuspended } from '@/engine/players/availability'
import type {
  MatchupInstructionIntensity,
  MatchupRoleAssignmentType,
  WeeklyMatchupTactics,
} from '@/types/game'

type MatchupOption =
  | {
      key: string
      kind: 'match'
      round: number
      roundIndex: number
      roundDate: string
      opponentId: string
      homeAway: 'home' | 'away'
      venue: string
    }
  | {
      key: string
      kind: 'bye'
      round: number
      roundIndex: number
      roundDate: string
    }

const NO_TARGET = '__none__'

function computeForm(
  matchResults: ReturnType<typeof useGameStore.getState>['matchResults'],
  clubId: string,
): string[] {
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

function sanitizeLineup(
  rawLineup: Record<string, string>,
  players: ReturnType<typeof useGameStore.getState>['players'],
  playerClubId: string,
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
    if (player.clubId !== playerClubId) continue
    if (player.injury || isPlayerSuspended(player) || player.fitness < 50) continue
    next[slot] = playerId
    seen.add(playerId)
  }
  return next
}

export function MatchupPreviewPage() {
  const navigate = useNavigate()
  const phase = useGameStore((s) => s.phase)
  const season = useGameStore((s) => s.season)
  const currentRound = useGameStore((s) => s.currentRound)
  const currentDate = useGameStore((s) => s.currentDate)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const ladder = useGameStore((s) => s.ladder)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const matchResults = useGameStore((s) => s.matchResults)
  const settings = useGameStore((s) => s.settings)
  const weeklyGameplans = useGameStore((s) => s.weeklyGameplans)
  const setWeeklyMatchupTactics = useGameStore((s) => s.setWeeklyMatchupTactics)
  const clearWeeklyMatchupTactics = useGameStore((s) => s.clearWeeklyMatchupTactics)

  const seasonStartDate = settings.seasonStartDate ?? '2026-03-20'

  const options = useMemo(() => {
    if (phase !== 'regular-season') return [] as MatchupOption[]
    const out: MatchupOption[] = []
    for (let idx = currentRound; idx < Math.min(season.rounds.length, currentRound + 5); idx++) {
      const round = season.rounds[idx]
      if (!round) continue
      const roundDate = addDays(seasonStartDate, idx * 7)
      if ((round.byeClubIds ?? []).includes(playerClubId)) {
        out.push({
          key: `bye-${idx}`,
          kind: 'bye',
          round: idx + 1,
          roundIndex: idx,
          roundDate,
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
        roundIndex: idx,
        roundDate,
        opponentId: oppId,
        homeAway: fixture.homeClubId === playerClubId ? 'home' : 'away',
        venue: fixture.venue,
      })
    }
    return out
  }, [phase, season.rounds, currentRound, seasonStartDate, playerClubId])

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [newTaggerId, setNewTaggerId] = useState<string>('')
  const [newTagTargetId, setNewTagTargetId] = useState<string>('')
  const [newTagIntensity, setNewTagIntensity] = useState<MatchupInstructionIntensity>('standard')
  const [newEnforcerId, setNewEnforcerId] = useState<string>('')
  const [newRoughTargetId, setNewRoughTargetId] = useState<string>('')
  const [newRoughIntensity, setNewRoughIntensity] = useState<MatchupInstructionIntensity>('standard')
  const [newRolePlayerId, setNewRolePlayerId] = useState<string>('')
  const [newRoleTargetId, setNewRoleTargetId] = useState<string>(NO_TARGET)
  const [newRoleType, setNewRoleType] = useState<MatchupRoleAssignmentType>('run-with')
  const [newRoleIntensity, setNewRoleIntensity] = useState<MatchupInstructionIntensity>('standard')

  const selected = useMemo(() => {
    if (options.length === 0) return null
    if (selectedKey) {
      const found = options.find((o) => o.key === selectedKey)
      if (found) return found
    }
    return options[0]
  }, [options, selectedKey])

  const userLineup = useMemo(() => {
    const fallback = selectBestLineup(Object.values(players), playerClubId).lineup
    return sanitizeLineup(selectedLineup ?? fallback, players, playerClubId, settings.matchRules.interchangePlayers)
  }, [players, playerClubId, selectedLineup, settings.matchRules.interchangePlayers])
  const userLineupPlayerIds = useMemo(
    () => Object.values(userLineup).filter((id): id is string => Boolean(id)),
    [userLineup],
  )
  const opponentLikelyLineupPlayerIds = useMemo(() => {
    if (!selected || selected.kind !== 'match') return [] as string[]
    return Object.values(selectBestLineup(Object.values(players), selected.opponentId).lineup)
      .filter((id): id is string => Boolean(id))
  }, [selected, players])
  const userLineupPlayers = useMemo(
    () => userLineupPlayerIds.map((id) => players[id]).filter(Boolean),
    [userLineupPlayerIds, players],
  )
  const opponentLikelyPlayers = useMemo(
    () => opponentLikelyLineupPlayerIds.map((id) => players[id]).filter(Boolean),
    [opponentLikelyLineupPlayerIds, players],
  )
  const canEditSelectedMatchup = selected?.kind === 'match' && selected.roundIndex === currentRound
  const activeTactics = useMemo<WeeklyMatchupTactics>(() => {
    if (!selected || selected.kind !== 'match' || selected.roundIndex !== currentRound) {
      return { hardTags: [], physicalAttention: [], roleAssignments: [] }
    }
    const entry = weeklyGameplans[playerClubId]
    if (
      !entry ||
      entry.round !== currentRound ||
      entry.opponentClubId !== selected.opponentId ||
      !entry.matchupTactics
    ) {
      return { hardTags: [], physicalAttention: [], roleAssignments: [] }
    }
    return entry.matchupTactics
  }, [selected, currentRound, weeklyGameplans, playerClubId])

  const saveTactics = (next: WeeklyMatchupTactics) => {
    if (!canEditSelectedMatchup) return
    setWeeklyMatchupTactics(next)
  }

  const opponentForm = useMemo(
    () => (selected && selected.kind === 'match' ? computeForm(matchResults, selected.opponentId) : []),
    [selected, matchResults],
  )

  const opponentLadderPosition = useMemo(() => {
    if (!selected || selected.kind !== 'match') return 0
    return ladder.findIndex((e) => e.clubId === selected.opponentId) + 1
  }, [selected, ladder])

  const countdownDays = useMemo(() => {
    if (!selected) return null
    const now = new Date(currentDate + 'T00:00:00').getTime()
    const then = new Date(selected.roundDate + 'T00:00:00').getTime()
    return Math.max(0, Math.round((then - now) / 86_400_000))
  }, [selected, currentDate])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Potential Matchups</h1>
          <p className="text-sm text-muted-foreground">Read-only tactical preview with both teams on field layout.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/')}>
          Back to Dashboard
        </Button>
      </div>

      {options.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No regular-season matchups available right now.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
              <Button
                key={opt.key}
                size="sm"
                variant={selected?.key === opt.key ? 'default' : 'outline'}
                onClick={() => setSelectedKey(opt.key)}
              >
                R{opt.round}
                {opt.kind === 'bye' ? ' · BYE' : ` · ${clubs[opt.opponentId]?.abbreviation ?? opt.opponentId}`}
              </Button>
            ))}
          </div>

          {selected?.kind === 'bye' ? (
            <Card>
              <CardContent className="py-6">
                <p className="text-lg font-semibold">Round {selected.round} is a bye</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {countdownDays === 0 ? 'Current week' : `${countdownDays} day${countdownDays === 1 ? '' : 's'} away`} · {formatDate(selected.roundDate)}
                </p>
              </CardContent>
            </Card>
          ) : selected ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Round {selected.round} · {clubs[selected.opponentId]?.fullName ?? selected.opponentId}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    {countdownDays === 0 ? 'Game day' : `${countdownDays} day${countdownDays === 1 ? '' : 's'} to game`} · {selected.homeAway.toUpperCase()} · {selected.venue}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline">Opp ladder: {opponentLadderPosition > 0 ? `${opponentLadderPosition}` : '-'}</Badge>
                    <Badge variant="outline">Opp form: {opponentForm.length ? opponentForm.join('') : '-'}</Badge>
                  </div>
                  <div className="rounded border p-2 text-xs text-muted-foreground space-y-1">
                    <p>
                      {opponentLadderPosition > 0 && opponentLadderPosition <= 4
                        ? 'Strategy: protect corridor turnovers and control stoppage territory.'
                        : 'Strategy: force repeat entries and punish intercept exits.'}
                    </p>
                    <p>
                      {opponentForm.filter((r) => r === 'W').length >= 3
                        ? 'Opponent trend: in form, so begin with conservative field position.'
                        : 'Opponent trend: mixed form, so press early and build scoreboard pressure.'}
                    </p>
                  </div>
                  {!canEditSelectedMatchup ? (
                    <div className="rounded border p-2 text-xs text-muted-foreground">
                      Tactical matchup instructions can be set for the current round only.
                    </div>
                  ) : (
                    <div className="space-y-3 rounded border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold">Matchup Instructions</p>
                        <Button variant="outline" size="sm" onClick={() => clearWeeklyMatchupTactics()}>
                          Clear Instructions
                        </Button>
                      </div>

                      <div className="grid gap-2 md:grid-cols-4">
                        <div>
                          <Label className="text-xs">Hard Tagger</Label>
                          <Select value={newTaggerId} onValueChange={setNewTaggerId}>
                            <SelectTrigger><SelectValue placeholder="Select player" /></SelectTrigger>
                            <SelectContent>
                              {userLineupPlayers.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Tag Target</Label>
                          <Select value={newTagTargetId} onValueChange={setNewTagTargetId}>
                            <SelectTrigger><SelectValue placeholder="Select opponent" /></SelectTrigger>
                            <SelectContent>
                              {opponentLikelyPlayers.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Intensity</Label>
                          <Select value={newTagIntensity} onValueChange={(v) => setNewTagIntensity(v as MatchupInstructionIntensity)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="light">Light</SelectItem>
                              <SelectItem value="standard">Standard</SelectItem>
                              <SelectItem value="hard">Hard</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            className="w-full"
                            size="sm"
                            disabled={!newTaggerId || !newTagTargetId}
                            onClick={() =>
                              saveTactics({
                                ...activeTactics,
                                hardTags: [
                                  ...activeTactics.hardTags.filter((t) => t.taggerPlayerId !== newTaggerId),
                                  { id: crypto.randomUUID(), taggerPlayerId: newTaggerId, targetPlayerId: newTagTargetId, intensity: newTagIntensity },
                                ],
                              })
                            }
                          >
                            Add Hard Tag
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-4">
                        <div>
                          <Label className="text-xs">Enforcer</Label>
                          <Select value={newEnforcerId} onValueChange={setNewEnforcerId}>
                            <SelectTrigger><SelectValue placeholder="Select player" /></SelectTrigger>
                            <SelectContent>
                              {userLineupPlayers.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Rough-Up Target</Label>
                          <Select value={newRoughTargetId} onValueChange={setNewRoughTargetId}>
                            <SelectTrigger><SelectValue placeholder="Select opponent" /></SelectTrigger>
                            <SelectContent>
                              {opponentLikelyPlayers.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Intensity</Label>
                          <Select value={newRoughIntensity} onValueChange={(v) => setNewRoughIntensity(v as MatchupInstructionIntensity)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="light">Light</SelectItem>
                              <SelectItem value="standard">Standard</SelectItem>
                              <SelectItem value="hard">Hard</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            className="w-full"
                            size="sm"
                            disabled={!newEnforcerId || !newRoughTargetId}
                            onClick={() =>
                              saveTactics({
                                ...activeTactics,
                                physicalAttention: [
                                  ...activeTactics.physicalAttention.filter((t) => t.enforcerPlayerId !== newEnforcerId),
                                  { id: crypto.randomUUID(), enforcerPlayerId: newEnforcerId, targetPlayerId: newRoughTargetId, intensity: newRoughIntensity },
                                ],
                              })
                            }
                          >
                            Add Rough-Up
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-5">
                        <div>
                          <Label className="text-xs">Role Player</Label>
                          <Select value={newRolePlayerId} onValueChange={setNewRolePlayerId}>
                            <SelectTrigger><SelectValue placeholder="Select player" /></SelectTrigger>
                            <SelectContent>
                              {userLineupPlayers.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Assignment</Label>
                          <Select value={newRoleType} onValueChange={(v) => setNewRoleType(v as MatchupRoleAssignmentType)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="run-with">Run With</SelectItem>
                              <SelectItem value="loose-interceptor">Loose Interceptor</SelectItem>
                              <SelectItem value="defensive-forward">Defensive Forward</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Target (optional)</Label>
                          <Select value={newRoleTargetId} onValueChange={setNewRoleTargetId}>
                            <SelectTrigger><SelectValue placeholder="No target" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_TARGET}>No target</SelectItem>
                              {opponentLikelyPlayers.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Intensity</Label>
                          <Select value={newRoleIntensity} onValueChange={(v) => setNewRoleIntensity(v as MatchupInstructionIntensity)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="light">Light</SelectItem>
                              <SelectItem value="standard">Standard</SelectItem>
                              <SelectItem value="hard">Hard</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            className="w-full"
                            size="sm"
                            disabled={!newRolePlayerId || ((newRoleType === 'run-with' || newRoleType === 'defensive-forward') && newRoleTargetId === NO_TARGET)}
                            onClick={() =>
                              saveTactics({
                                ...activeTactics,
                                roleAssignments: [
                                  ...activeTactics.roleAssignments.filter((r) => r.playerId !== newRolePlayerId),
                                  {
                                    id: crypto.randomUUID(),
                                    playerId: newRolePlayerId,
                                    assignment: newRoleType,
                                    targetPlayerId: newRoleTargetId === NO_TARGET ? undefined : newRoleTargetId,
                                    intensity: newRoleIntensity,
                                  },
                                ],
                              })
                            }
                          >
                            Add Role
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        {activeTactics.hardTags.map((instruction) => (
                          <div key={instruction.id} className="flex items-center justify-between rounded border px-2 py-1">
                            <span>
                              Hard tag: {players[instruction.taggerPlayerId]?.lastName ?? instruction.taggerPlayerId}{' -> '}{players[instruction.targetPlayerId]?.lastName ?? instruction.targetPlayerId} ({instruction.intensity})
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                saveTactics({
                                  ...activeTactics,
                                  hardTags: activeTactics.hardTags.filter((t) => t.id !== instruction.id),
                                })
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        {activeTactics.physicalAttention.map((instruction) => (
                          <div key={instruction.id} className="flex items-center justify-between rounded border px-2 py-1">
                            <span>
                              Rough up: {players[instruction.enforcerPlayerId]?.lastName ?? instruction.enforcerPlayerId}{' -> '}{players[instruction.targetPlayerId]?.lastName ?? instruction.targetPlayerId} ({instruction.intensity})
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                saveTactics({
                                  ...activeTactics,
                                  physicalAttention: activeTactics.physicalAttention.filter((t) => t.id !== instruction.id),
                                })
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        {activeTactics.roleAssignments.map((instruction) => (
                          <div key={instruction.id} className="flex items-center justify-between rounded border px-2 py-1">
                            <span>
                              Role: {players[instruction.playerId]?.lastName ?? instruction.playerId} as {instruction.assignment}
                              {instruction.targetPlayerId ? ` vs ${players[instruction.targetPlayerId]?.lastName ?? instruction.targetPlayerId}` : ''} ({instruction.intensity})
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                saveTactics({
                                  ...activeTactics,
                                  roleAssignments: activeTactics.roleAssignments.filter((r) => r.id !== instruction.id),
                                })
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        {activeTactics.hardTags.length === 0 &&
                          activeTactics.physicalAttention.length === 0 &&
                          activeTactics.roleAssignments.length === 0 && (
                            <p>No tactical matchup instructions set.</p>
                          )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <FootballField
                lineup={userLineup}
                players={players}
                clubs={clubs}
                interchangeCount={settings.matchRules.interchangePlayers}
                oppositionClubId={selected.opponentId}
                showOpposition={true}
                onAssign={() => {}}
                onSwap={() => {}}
                onUnassign={() => {}}
              />
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
