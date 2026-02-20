import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Trophy, Star, ArrowRight, Users, ChevronRight } from 'lucide-react'
import type { YouthCompetition } from '@/types/youthPathway'

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type HubTab = 'overview' | 'talent-league' | 'u18' | 'u16' | 'draft-watch'

function LevelBadge({ level }: { level: 'elite' | 'school' | 'local' }) {
  const cls = {
    elite:  'bg-yellow-500 text-black',
    school: 'bg-blue-500 text-white',
    local:  'bg-slate-500 text-white',
  }[level]
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {level === 'elite' ? 'Elite' : level === 'school' ? 'School' : 'Local'}
    </span>
  )
}

function draftYear(age: number, ageGroup: 'u16' | 'u18', currentYear: number): number | null {
  if (ageGroup !== 'u18') return null
  if (age === 18) return currentYear
  if (age === 17) return currentYear + 1
  return null
}

// ---------------------------------------------------------------------------
// Compact competition card for U18/U16 grid
// ---------------------------------------------------------------------------

function CompCard({
  comp,
  discoveredCount,
  onClick,
}: {
  comp: YouthCompetition
  discoveredCount: number
  onClick: () => void
}) {
  const leader     = comp.season.ladder[0]
  const leaderClub = leader ? comp.clubs.find((c) => c.id === leader.clubId) : null
  return (
    <Card className="cursor-pointer transition-colors hover:bg-accent/40" onClick={onClick}>
      <CardContent className="px-4 py-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-tight">{comp.name}</p>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <LevelBadge level={comp.level} />
          <Badge variant="secondary" className="text-xs">{comp.state}</Badge>
          <Badge variant="outline" className="text-xs uppercase">{comp.ageGroup}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {comp.season.completedRounds}/{comp.rounds} rounds · {comp.clubs.length} clubs
        </p>
        {leaderClub && (
          <p className="text-xs text-muted-foreground">
            Leader: <span className="font-medium text-foreground">{leaderClub.name}</span>
          </p>
        )}
        {discoveredCount > 0 && (
          <p className="text-xs text-blue-500">★ {discoveredCount} scouted</p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Talent League summary: mini-ladder + scouted players side-by-side
// ---------------------------------------------------------------------------

const EMPTY_YOUTH_PLAYERS: Record<string, import('@/types/youthPathway').YouthPlayer> = {}

function TalentLeagueSummary({
  comp,
  playerClubId,
}: {
  comp: YouthCompetition
  playerClubId: string
}) {
  const navigate = useNavigate()
  const players  = useGameStore((s) => s.youthPathway?.players) ?? EMPTY_YOUTH_PLAYERS

  const ladderRows = comp.season.ladder.slice(0, 12).map((e, i) => ({
    ...e,
    club: comp.clubs.find((c) => c.id === e.clubId),
    pos: i + 1,
  }))

  const discoveredHere = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.compId === comp.id && p.discoveredByClubIds.includes(playerClubId))
        .sort((a, b) => b.seasonStats.avgRating - a.seasonStats.avgRating)
        .slice(0, 6),
    [players, comp.id, playerClubId],
  )

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Ladder</CardTitle>
            <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => navigate(`/youth-pathway/competition/${comp.id}`)}>
              Full view <ArrowRight className="h-3 w-3 ml-0.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ladderRows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Season not started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 text-center">#</TableHead>
                  <TableHead>Club</TableHead>
                  <TableHead className="text-center w-10">P</TableHead>
                  <TableHead className="text-center w-10">W</TableHead>
                  <TableHead className="text-center w-10">L</TableHead>
                  <TableHead className="text-center w-12">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ladderRows.map(({ club, pos, played, wins, losses, points }) => (
                  <TableRow key={club?.id ?? pos}>
                    <TableCell className="text-center text-sm text-muted-foreground">{pos}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {club && <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: club.colors.primary }} />}
                        <span className="text-sm font-medium">{club?.abbreviation ?? '—'}</span>
                        <span className="text-xs text-muted-foreground hidden sm:inline">{club?.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm">{played}</TableCell>
                    <TableCell className="text-center text-sm">{wins}</TableCell>
                    <TableCell className="text-center text-sm">{losses}</TableCell>
                    <TableCell className="text-center font-bold text-sm">{points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Your Scouted Players</CardTitle>
            <span className="text-xs text-muted-foreground">{discoveredHere.length} shown</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {discoveredHere.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              No players discovered yet. Assign a scout to the VIC region.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center">Age</TableHead>
                  <TableHead className="text-center">Pos</TableHead>
                  <TableHead className="text-center">Gms</TableHead>
                  <TableHead className="text-center">Disp</TableHead>
                  <TableHead className="text-center">Goals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discoveredHere.map((p) => {
                  const club = comp.clubs.find((c) => c.id === p.clubId)
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {club && <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: club.colors.primary }} />}
                          <span className="text-sm font-medium">{p.firstName} {p.lastName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">{p.age}</TableCell>
                      <TableCell className="text-center"><Badge variant="outline" className="text-xs">{p.position}</Badge></TableCell>
                      <TableCell className="text-center text-sm">{p.seasonStats.gamesPlayed}</TableCell>
                      <TableCell className="text-center text-sm">{p.seasonStats.disposals}</TableCell>
                      <TableCell className="text-center text-sm">{p.seasonStats.goals}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function YouthPathwayPage() {
  const navigate     = useNavigate()
  const youthPathway = useGameStore((s) => s.youthPathway)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentYear  = useGameStore((s) => s.currentYear)

  const [activeTab, setActiveTab] = useState<HubTab>('overview')

  // --- null guard ---
  if (!youthPathway) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Youth Pathway</h1>
          <p className="text-sm text-muted-foreground">Youth pathway leagues are not enabled in this save.</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-muted-foreground">Not Available</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Start a new game with "Include Pathway Leagues" enabled.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // --- derived ---
  const comps      = useMemo(() => Object.values(youthPathway.competitions), [youthPathway.competitions])
  const allPlayers = useMemo(() => Object.values(youthPathway.players), [youthPathway.players])

  const isDiscovered = (pid: string) =>
    youthPathway.players[pid]?.discoveredByClubIds.includes(playerClubId) ?? false

  const discoveredPlayers = useMemo(
    () => allPlayers.filter((p) => p.discoveredByClubIds.includes(playerClubId)),
    [allPlayers, playerClubId],
  )

  const talentComp  = comps.find((c) => c.id === 'coates-u18')
  const u18Comps    = comps.filter((c) => c.ageGroup === 'u18' && c.id !== 'coates-u18')
  const u16Comps    = comps.filter((c) => c.ageGroup === 'u16')
  const schoolComps = comps.filter((c) => c.ageGroup === 'both')

  const draftWatchPlayers = useMemo(
    () =>
      allPlayers
        .filter((p) => p.ageGroup === 'u18' && (p.age === 17 || p.age === 18))
        .sort((a, b) => {
          const da = isDiscovered(a.id) ? 1 : 0
          const db = isDiscovered(b.id) ? 1 : 0
          if (db !== da) return db - da
          const ya = draftYear(a.age, a.ageGroup, currentYear) ?? 9999
          const yb = draftYear(b.age, b.ageGroup, currentYear) ?? 9999
          if (ya !== yb) return ya - yb
          return b.rawTalentScore - a.rawTalentScore
        }),
    [allPlayers, playerClubId, currentYear], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const u18Tournament = youthPathway.tournaments.u18
  const convertedCount = Object.keys(youthPathway.convertedProspectIds).length
  const thisYearCount  = draftWatchPlayers.filter((p) => p.age === 18).length
  const nextYearCount  = draftWatchPlayers.filter((p) => p.age === 17).length

  function discoveredInComp(compId: string): number {
    return discoveredPlayers.filter((p) => p.compId === compId).length
  }

  const tabs: { id: HubTab; label: string }[] = [
    { id: 'overview',      label: 'All Comps' },
    { id: 'talent-league', label: 'Talent League' },
    { id: 'u18',           label: `U18 (${u18Comps.length + schoolComps.length})` },
    { id: 'u16',           label: `U16 (${u16Comps.length})` },
    { id: 'draft-watch',   label: 'Draft Watch' },
  ]

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Youth Pathway</h1>
        <p className="text-sm text-muted-foreground">
          Track under-age competitions, discover future draft prospects, and follow the national championships.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="px-4 py-3 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Active Comps</p>
            <p className="text-2xl font-bold">{comps.length}</p>
            <p className="text-xs text-muted-foreground">{u18Comps.length + (talentComp ? 1 : 0)} U18 · {u16Comps.length} U16</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Scouted Players</p>
            <p className="text-2xl font-bold">{discoveredPlayers.length}</p>
            <p className="text-xs text-muted-foreground">of {allPlayers.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Draft Watch</p>
            <p className="text-2xl font-bold">{draftWatchPlayers.length}</p>
            <p className="text-xs text-muted-foreground">{thisYearCount} this yr · {nextYearCount} next yr</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">AFL Prospects</p>
            <p className="text-2xl font-bold">{convertedCount}</p>
            <p className="text-xs text-muted-foreground">converted to draft pool</p>
          </CardContent>
        </Card>
      </div>

      {/* Tournament banner */}
      {u18Tournament?.completed && (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-semibold text-yellow-600 dark:text-yellow-400">
                  {currentYear} National U18 Championships Complete
                </p>
                {u18Tournament.medalWinnerId && (() => {
                  const p = youthPathway.players[u18Tournament.medalWinnerId]
                  return p ? (
                    <p className="text-sm text-muted-foreground">
                      Larke Medal:{' '}
                      <span className="font-medium text-foreground">{p.firstName} {p.lastName}</span>
                      {isDiscovered(u18Tournament.medalWinnerId) && (
                        <Star className="h-3 w-3 text-blue-500 inline ml-1" />
                      )}
                    </p>
                  ) : null
                })()}
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/youth-pathway/tournament')}>
                <Trophy className="h-3.5 w-3.5 mr-1.5" />
                All-Australian Team
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab bar */}
      <div className="flex border-b flex-wrap gap-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── All Comps ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State</TableHead>
                    <TableHead>Competition</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead className="text-center">Rounds</TableHead>
                    <TableHead>Leader</TableHead>
                    <TableHead className="text-center">Scouted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comps.map((comp) => {
                    const leader     = comp.season.ladder[0]
                    const leaderClub = leader ? comp.clubs.find((c) => c.id === leader.clubId) : null
                    const scouted    = discoveredInComp(comp.id)
                    return (
                      <TableRow
                        key={comp.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/youth-pathway/competition/${comp.id}`)}
                      >
                        <TableCell className="text-sm text-muted-foreground">{comp.state}</TableCell>
                        <TableCell className="font-medium">{comp.name}</TableCell>
                        <TableCell><LevelBadge level={comp.level} /></TableCell>
                        <TableCell className="text-sm uppercase">{comp.ageGroup}</TableCell>
                        <TableCell className="text-center text-sm">
                          {comp.season.completedRounds}/{comp.rounds}
                        </TableCell>
                        <TableCell className="text-sm">{leaderClub?.name ?? '—'}</TableCell>
                        <TableCell className="text-center text-sm">
                          {scouted > 0
                            ? <span className="text-blue-500 font-medium">★ {scouted}</span>
                            : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Scouted players summary */}
          {discoveredPlayers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Your Scouted Players</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-center">Age</TableHead>
                        <TableHead className="text-center">Pos</TableHead>
                        <TableHead>Competition</TableHead>
                        <TableHead className="text-center">Gms</TableHead>
                        <TableHead className="text-center">Disp</TableHead>
                        <TableHead className="text-center">Goals</TableHead>
                        <TableHead className="text-center">BOG</TableHead>
                        <TableHead className="text-center">Draft Yr</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {discoveredPlayers
                        .sort((a, b) => b.seasonStats.avgRating - a.seasonStats.avgRating)
                        .slice(0, 30)
                        .map((player) => {
                          const comp      = youthPathway.competitions[player.compId]
                          const draftYr   = draftYear(player.age, player.ageGroup, currentYear)
                          const converted = youthPathway.convertedProspectIds[player.id]
                          return (
                            <TableRow
                              key={player.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => navigate(`/youth-pathway/player/${encodeURIComponent(player.id)}`)}
                            >
                              <TableCell className="text-sm font-medium">
                                {player.firstName} {player.lastName}
                                {converted && (
                                  <Badge
                                    variant="outline"
                                    className="ml-1.5 text-[10px] py-0 px-1 border-green-500 text-green-600 cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); navigate('/scouting') }}
                                  >
                                    Prospect
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center text-sm">{player.age}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-xs">{player.position}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{comp?.name ?? player.compId}</TableCell>
                              <TableCell className="text-center text-sm">{player.seasonStats.gamesPlayed}</TableCell>
                              <TableCell className="text-center text-sm">{player.seasonStats.disposals}</TableCell>
                              <TableCell className="text-center text-sm">{player.seasonStats.goals}</TableCell>
                              <TableCell className="text-center text-sm">{player.seasonStats.bestOnGroundCount}</TableCell>
                              <TableCell className="text-center">
                                {draftYr ? (
                                  <Badge variant={draftYr === currentYear ? 'default' : 'secondary'} className="text-xs">
                                    {draftYr}
                                  </Badge>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Talent League ── */}
      {activeTab === 'talent-league' && (
        <div className="space-y-4">
          {!talentComp ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Coates Talent League data not found.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{talentComp.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    VIC · Elite · {talentComp.clubs.length} clubs · {talentComp.season.completedRounds}/{talentComp.rounds} rounds
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/youth-pathway/competition/${talentComp.id}`)}>
                  Full detail <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </div>
              <TalentLeagueSummary comp={talentComp} playerClubId={playerClubId} />
            </>
          )}
        </div>
      )}

      {/* ── U18 ── */}
      {activeTab === 'u18' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {u18Comps.map((comp) => (
              <CompCard
                key={comp.id}
                comp={comp}
                discoveredCount={discoveredInComp(comp.id)}
                onClick={() => navigate(`/youth-pathway/competition/${comp.id}`)}
              />
            ))}
          </div>
          {schoolComps.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium">School Competitions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {schoolComps.map((comp) => (
                  <CompCard
                    key={comp.id}
                    comp={comp}
                    discoveredCount={discoveredInComp(comp.id)}
                    onClick={() => navigate(`/youth-pathway/competition/${comp.id}`)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── U16 ── */}
      {activeTab === 'u16' && (
        <div className="space-y-3">
          {u16Comps.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No U16 competitions in this save.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {u16Comps.map((comp) => (
                <CompCard
                  key={comp.id}
                  comp={comp}
                  discoveredCount={discoveredInComp(comp.id)}
                  onClick={() => navigate(`/youth-pathway/competition/${comp.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Draft Watch ── */}
      {activeTab === 'draft-watch' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Draft Watch</h2>
              <p className="text-xs text-muted-foreground">
                All U18 players aged 17–18. ★ = scouted by your club.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/scouting')}>
              Open Scouting <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-center w-10">Age</TableHead>
                      <TableHead className="text-center w-12">Pos</TableHead>
                      <TableHead>Competition</TableHead>
                      <TableHead className="text-center w-20">Draft Yr</TableHead>
                      <TableHead className="text-center w-12">Gms</TableHead>
                      <TableHead className="text-center w-12">Disp</TableHead>
                      <TableHead className="text-center w-12">Goals</TableHead>
                      <TableHead className="text-center w-10">BOG</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draftWatchPlayers.map((player) => {
                      const comp      = youthPathway.competitions[player.compId]
                      const scouted   = isDiscovered(player.id)
                      const draftYr   = draftYear(player.age, player.ageGroup, currentYear) ?? currentYear + 2
                      const converted = youthPathway.convertedProspectIds[player.id]
                      return (
                        <TableRow
                          key={player.id}
                          className={`cursor-pointer hover:bg-muted/50 ${scouted ? 'bg-blue-500/5' : ''}`}
                          onClick={() => navigate(`/youth-pathway/player/${encodeURIComponent(player.id)}`)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {scouted && <Star className="h-3 w-3 text-blue-500 shrink-0" />}
                              <span className={`text-sm font-medium ${!scouted ? 'text-muted-foreground' : ''}`}>
                                {player.firstName} {player.lastName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm">{player.age}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">{player.position}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {comp?.name ?? player.compId}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={draftYr === currentYear ? 'default' : 'secondary'} className="text-xs">
                              {draftYr}
                            </Badge>
                          </TableCell>
                          {scouted ? (
                            <>
                              <TableCell className="text-center text-sm">{player.seasonStats.gamesPlayed}</TableCell>
                              <TableCell className="text-center text-sm">{player.seasonStats.disposals}</TableCell>
                              <TableCell className="text-center text-sm">{player.seasonStats.goals}</TableCell>
                              <TableCell className="text-center text-sm">{player.seasonStats.bestOnGroundCount}</TableCell>
                            </>
                          ) : (
                            <TableCell colSpan={4} className="text-center text-xs text-muted-foreground/40">
                              — not scouted —
                            </TableCell>
                          )}
                          <TableCell>
                            {converted ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 border-green-500 text-green-600 cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); navigate('/scouting') }}
                              >
                                <Trophy className="h-2.5 w-2.5 mr-0.5" />
                                Prospect
                              </Badge>
                            ) : scouted ? (
                              <span className="text-xs text-blue-500">On radar</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">Unknown</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
