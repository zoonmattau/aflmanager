import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { ChevronLeft, ChevronRight, ExternalLink, Star, Trophy } from 'lucide-react'
import type { YouthPlayer, YouthClub } from '@/types/youthPathway'

// ---------------------------------------------------------------------------
// Tab definition
// ---------------------------------------------------------------------------

type TabId = 'ladder' | 'fixtures' | 'players' | 'awards' | 'clubs' | 'draft-eligible' | 'teams'

const ALL_TABS: { id: TabId; label: string }[] = [
  { id: 'ladder',         label: 'Ladder' },
  { id: 'fixtures',       label: 'Fixtures' },
  { id: 'players',        label: 'Players' },
  { id: 'awards',         label: 'Awards' },
  { id: 'clubs',          label: 'Clubs' },
  { id: 'draft-eligible', label: 'Draft Eligible' },
  { id: 'teams',          label: 'Teams' },
]

// ---------------------------------------------------------------------------
// Pathway relationships (static — which comps can a player also appear in?)
// ---------------------------------------------------------------------------

/** Elite or sibling comps that players from this comp are also eligible for. */
const PATHWAY_ALSO_ELIGIBLE: Record<string, string[]> = {
  'aps':           ['coates-u18'],
  'agsv':          ['coates-u18'],
  'nsw-school':    ['nsw-u18'],
  'qld-school':    ['qld-u18'],
  'sa-school':     ['sa-u18'],
  'wa-school':     ['wa-u18'],
  'act-school':    ['nsw-u18'],
  'vic-state-u16': ['coates-u18', 'vic-state-u18'],
  'sa-u16':        ['sa-u18'],
  'wa-u16':        ['wa-u18'],
}

/** Feeder comps that this comp draws elite players from. */
const PATHWAY_DRAWS_FROM: Record<string, string[]> = {
  'coates-u18': ['aps', 'agsv', 'vic-state-u16', 'vic-state-u18'],
  'sa-u18':     ['sa-school', 'sa-u16'],
  'wa-u18':     ['wa-school', 'wa-u16'],
  'nsw-u18':    ['nsw-school', 'act-school'],
  'qld-u18':    ['qld-school'],
}

const POSITION_ORDER: Partial<Record<string, number>> = {
  FB: 1, BP: 2, CHB: 3, HBF: 4, W: 5, IM: 6, OM: 7, RK: 8, HFF: 9, CHF: 10, FP: 11, FF: 12,
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

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

function StateBadge({ state }: { state: string }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-muted text-muted-foreground">
      {state}
    </span>
  )
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: TabId; label: string }[]
  active: TabId
  onChange: (t: TabId) => void
}) {
  return (
    <div className="flex border-b flex-wrap gap-0">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            active === t.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function ClubSwatch({ club }: { club: YouthClub | undefined }) {
  if (!club) return null
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: club.colors.primary }}
      />
      <span className="font-medium text-sm">{club.name}</span>
    </div>
  )
}

function draftEligibleYear(player: YouthPlayer, currentYear: number): number | null {
  if (player.ageGroup !== 'u18') return null
  if (player.age === 18) return currentYear
  if (player.age === 17) return currentYear + 1
  return null
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function YouthCompDetailPage() {
  const { compId } = useParams<{ compId: string }>()
  const navigate   = useNavigate()

  const youthPathway  = useGameStore((s) => s.youthPathway)
  const playerClubId  = useGameStore((s) => s.playerClubId)
  const currentYear   = useGameStore((s) => s.currentYear)

  const [activeTab, setActiveTab]       = useState<TabId>('ladder')
  const [fixtureRound, setFixtureRound] = useState(1)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  // ---- guard ----
  if (!youthPathway || !compId) {
    return (
      <div className="p-6 space-y-2">
        <p className="text-muted-foreground">Competition not found.</p>
        <Button variant="link" onClick={() => navigate('/youth-pathway')}>← Back to Youth Pathway</Button>
      </div>
    )
  }

  const comp = youthPathway.competitions[compId]
  if (!comp) {
    return (
      <div className="p-6 space-y-2">
        <p className="text-muted-foreground">Competition not found.</p>
        <Button variant="link" onClick={() => navigate('/youth-pathway')}>← Back to Youth Pathway</Button>
      </div>
    )
  }

  // ---- derived data ----
  const allPlayers = useMemo(
    () => Object.values(youthPathway.players).filter((p) => p.compId === compId),
    [youthPathway.players, compId],
  )

  const isDiscovered = (pid: string) =>
    youthPathway.players[pid]?.discoveredByClubIds.includes(playerClubId) ?? false

  const getClub = (id: string): YouthClub | undefined => comp.clubs.find((c) => c.id === id)

  // Fixture rounds
  const completedRounds = useMemo(() => {
    const roundSet = new Set(comp.season.results.map((r) => r.round))
    return [...roundSet].sort((a, b) => a - b)
  }, [comp.season.results])

  const lastCompletedRound = completedRounds[completedRounds.length - 1] ?? 0

  // Fixture round selector (clamp to valid range)
  const displayRound = Math.max(1, Math.min(fixtureRound, Math.max(lastCompletedRound, 1)))
  const roundResults = comp.season.results.filter((r) => r.round === displayRound)

  // Stats leaders (discovered players only for fair play — same data the scout sees)
  const discoveredPlayers = allPlayers.filter((p) => isDiscovered(p.id))

  // Award leaders
  const topDisposals   = [...discoveredPlayers].sort((a, b) => b.seasonStats.disposals  - a.seasonStats.disposals).slice(0, 8)
  const topGoals       = [...discoveredPlayers].sort((a, b) => b.seasonStats.goals       - a.seasonStats.goals).slice(0, 8)
  const topMarks       = [...discoveredPlayers].sort((a, b) => b.seasonStats.marks       - a.seasonStats.marks).slice(0, 8)
  const topTackles     = [...discoveredPlayers].sort((a, b) => b.seasonStats.tackles     - a.seasonStats.tackles).slice(0, 8)
  const topBOG         = [...discoveredPlayers].sort((a, b) => b.seasonStats.bestOnGroundCount - a.seasonStats.bestOnGroundCount).slice(0, 8)
  const topRating      = [...discoveredPlayers]
    .filter((p) => p.seasonStats.gamesPlayed > 0)
    .sort((a, b) => b.seasonStats.avgRating - a.seasonStats.avgRating)
    .slice(0, 8)

  // Draft-eligible players (U18 aged 17–18)
  const draftEligible = allPlayers
    .filter((p) => p.ageGroup === 'u18' && (p.age === 17 || p.age === 18))
    .sort((a, b) => {
      // Discovered first, then by rawTalentScore desc
      const da = isDiscovered(a.id) ? 1 : 0
      const db = isDiscovered(b.id) ? 1 : 0
      if (db !== da) return db - da
      return b.rawTalentScore - a.rawTalentScore
    })

  // Players grouped by club (for Teams tab)
  const playersByClub = useMemo(() => {
    const map: Record<string, YouthPlayer[]> = {}
    for (const p of allPlayers) {
      if (!map[p.clubId]) map[p.clubId] = []
      map[p.clubId].push(p)
    }
    return map
  }, [allPlayers])

  // Pathway relationships for this comp
  const alsoEligibleFor = (PATHWAY_ALSO_ELIGIBLE[compId] ?? [])
    .map((id) => ({ id, name: youthPathway.competitions[id]?.name ?? id }))
  const drawsFromComps = (PATHWAY_DRAWS_FROM[compId] ?? [])
    .map((id) => ({ id, name: youthPathway.competitions[id]?.name ?? id }))

  // Selected team roster (Teams tab)
  const selectedClub = selectedTeamId ? getClub(selectedTeamId) : null
  const teamPlayers = selectedTeamId
    ? (playersByClub[selectedTeamId] ?? []).slice().sort((a, b) => {
        const da = isDiscovered(a.id) ? 1 : 0
        const db = isDiscovered(b.id) ? 1 : 0
        if (db !== da) return db - da
        const pa = POSITION_ORDER[a.position] ?? 99
        const pb = POSITION_ORDER[b.position] ?? 99
        if (pa !== pb) return pa - pb
        return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)
      })
    : []

  // Ladder with club info
  const ladderWithClub = comp.season.ladder.map((e, i) => ({
    ...e,
    club: getClub(e.clubId),
    position: i + 1,
  }))

  // Clubs with ladder position
  const clubsWithLadder = comp.clubs.map((club) => {
    const ladderIdx = comp.season.ladder.findIndex((e) => e.clubId === club.id)
    const ladderEntry = comp.season.ladder[ladderIdx]
    return {
      club,
      position: ladderIdx >= 0 ? ladderIdx + 1 : null,
      played:   ladderEntry?.played   ?? 0,
      wins:     ladderEntry?.wins     ?? 0,
      losses:   ladderEntry?.losses   ?? 0,
    }
  }).sort((a, b) => (a.position ?? 999) - (b.position ?? 999))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/youth-pathway')}>
          <ChevronLeft className="h-4 w-4 mr-1" />Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{comp.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <StateBadge state={comp.state} />
            <LevelBadge level={comp.level} />
            <span className="text-sm text-muted-foreground uppercase">{comp.ageGroup}</span>
            <span className="text-sm text-muted-foreground">
              {comp.season.completedRounds} / {comp.rounds} rounds
            </span>
            <span className="text-sm text-muted-foreground">{comp.clubs.length} clubs</span>
          </div>
          {(alsoEligibleFor.length > 0 || drawsFromComps.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              {alsoEligibleFor.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Elite players also eligible for:</span>
                  {alsoEligibleFor.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/youth-pathway/competition/${c.id}`)}
                      className="px-2 py-0.5 rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {drawsFromComps.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Also draws players from:</span>
                  {drawsFromComps.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/youth-pathway/competition/${c.id}`)}
                      className="px-2 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20 transition-colors"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <TabBar tabs={ALL_TABS} active={activeTab} onChange={setActiveTab} />

      {/* ---- Ladder tab ---- */}
      {activeTab === 'ladder' && (
        <Card>
          <CardContent className="p-0">
            {ladderWithClub.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No matches played yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 text-center">#</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead className="text-center w-10">P</TableHead>
                      <TableHead className="text-center w-10">W</TableHead>
                      <TableHead className="text-center w-10">L</TableHead>
                      <TableHead className="text-center w-10">D</TableHead>
                      <TableHead className="text-center w-14">PF</TableHead>
                      <TableHead className="text-center w-14">PA</TableHead>
                      <TableHead className="text-center w-16">%</TableHead>
                      <TableHead className="text-center w-12">Pts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ladderWithClub.map(({ club, position, played, wins, losses, draws, points, pointsFor, pointsAgainst, percentage }) => (
                      <TableRow key={club?.id ?? position}>
                        <TableCell className="text-center text-muted-foreground text-sm">{position}</TableCell>
                        <TableCell>
                          {club ? (
                            <ClubSwatch club={club} />
                          ) : (
                            <span className="text-sm text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm">{played}</TableCell>
                        <TableCell className="text-center text-sm">{wins}</TableCell>
                        <TableCell className="text-center text-sm">{losses}</TableCell>
                        <TableCell className="text-center text-sm">{draws}</TableCell>
                        <TableCell className="text-center text-sm">{pointsFor}</TableCell>
                        <TableCell className="text-center text-sm">{pointsAgainst}</TableCell>
                        <TableCell className="text-center text-sm">{percentage.toFixed(1)}</TableCell>
                        <TableCell className="text-center font-bold">{points}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- Fixtures tab ---- */}
      {activeTab === 'fixtures' && (
        <div className="space-y-3">
          {/* Round nav */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFixtureRound((r) => Math.max(1, r - 1))}
              disabled={displayRound <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-28 text-center">
              Round {displayRound}
              {displayRound > lastCompletedRound && (
                <span className="ml-1 text-muted-foreground text-xs">(unplayed)</span>
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFixtureRound((r) => Math.min(comp.rounds, r + 1))}
              disabled={displayRound >= comp.rounds}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {lastCompletedRound > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setFixtureRound(lastCompletedRound)}
              >
                Latest ({lastCompletedRound})
              </Button>
            )}
          </div>

          {displayRound > lastCompletedRound ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Round {displayRound} has not been played yet.
              </CardContent>
            </Card>
          ) : roundResults.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No results recorded for Round {displayRound}.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {roundResults.map((result, idx) => {
                const home = getClub(result.homeClubId)
                const away = getClub(result.awayClubId)
                const homeWon = result.homeScore > result.awayScore

                // Discovered performers in this match
                const discPerfs = result.playerPerformances.filter((p) => isDiscovered(p.playerId))

                return (
                  <Card key={idx}>
                    <CardContent className="pt-4 space-y-2">
                      {/* Score row */}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 w-2/5">
                          {home && <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: home.colors.primary }} />}
                          <span className={homeWon ? 'font-bold' : 'text-muted-foreground'}>
                            {home?.name ?? result.homeClubId}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-base">
                          {result.homeScore} – {result.awayScore}
                        </span>
                        <div className="flex items-center gap-2 w-2/5 justify-end">
                          <span className={!homeWon && result.awayScore !== result.homeScore ? 'font-bold' : 'text-muted-foreground'}>
                            {away?.name ?? result.awayClubId}
                          </span>
                          {away && <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: away.colors.primary }} />}
                        </div>
                      </div>

                      {/* Discovered player performances */}
                      {discPerfs.length > 0 && (
                        <div className="space-y-1 pt-1 border-t">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Your scouted players</p>
                          {discPerfs.map((perf) => {
                            const p = youthPathway.players[perf.playerId]
                            return (
                              <div
                                key={perf.playerId}
                                className="flex items-center gap-3 text-xs pl-2 border-l-2 border-blue-400"
                              >
                                <span className="font-medium">{p?.firstName} {p?.lastName}</span>
                                <span className="text-muted-foreground">{perf.disposals}d</span>
                                <span className="text-muted-foreground">{perf.goals}g</span>
                                <span className="text-muted-foreground">{perf.marks}m</span>
                                <span className="text-muted-foreground">{perf.tackles}t</span>
                                {perf.isBestOnGround && (
                                  <Badge variant="outline" className="text-yellow-500 border-yellow-400 text-[10px] py-0 px-1">
                                    BOG
                                  </Badge>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ---- Players tab ---- */}
      {activeTab === 'players' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {allPlayers.length} players in this competition. Stats shown for scouted players only (★ = your discovery).
          </p>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-center w-10">Age</TableHead>
                      <TableHead className="text-center w-12">Pos</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead className="text-center w-10">Gms</TableHead>
                      <TableHead className="text-center w-12">Disp</TableHead>
                      <TableHead className="text-center w-12">Goals</TableHead>
                      <TableHead className="text-center w-12">Marks</TableHead>
                      <TableHead className="text-center w-10">Tkl</TableHead>
                      <TableHead className="text-center w-10">BOG</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allPlayers
                      .sort((a, b) => {
                        const da = isDiscovered(a.id) ? 1 : 0
                        const db = isDiscovered(b.id) ? 1 : 0
                        if (db !== da) return db - da
                        return b.seasonStats.avgRating - a.seasonStats.avgRating
                      })
                      .map((player) => {
                        const club   = getClub(player.clubId)
                        const scouted = isDiscovered(player.id)
                        const converted = youthPathway.convertedProspectIds[player.id]
                        return (
                          <TableRow
                            key={player.id}
                            className={`cursor-pointer hover:bg-muted/60 ${scouted ? 'bg-blue-500/5' : ''}`}
                            onClick={() => navigate(`/youth-pathway/player/${encodeURIComponent(player.id)}`)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {scouted && <Star className="h-3 w-3 text-blue-500 shrink-0" />}
                                <span className={`text-sm font-medium ${!scouted ? 'text-muted-foreground' : ''}`}>
                                  {player.firstName} {player.lastName}
                                </span>
                                {converted && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 px-1 border-green-500 text-green-600 cursor-pointer"
                                    onClick={() => navigate('/scouting')}
                                  >
                                    Prospect <ExternalLink className="h-2.5 w-2.5 ml-0.5 inline" />
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-sm">{player.age}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-xs">{player.position}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {club && <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: club.colors.primary }} />}
                                <span className="text-xs text-muted-foreground">{club?.abbreviation ?? '—'}</span>
                              </div>
                            </TableCell>
                            {scouted ? (
                              <>
                                <TableCell className="text-center text-sm">{player.seasonStats.gamesPlayed}</TableCell>
                                <TableCell className="text-center text-sm">{player.seasonStats.disposals}</TableCell>
                                <TableCell className="text-center text-sm">{player.seasonStats.goals}</TableCell>
                                <TableCell className="text-center text-sm">{player.seasonStats.marks}</TableCell>
                                <TableCell className="text-center text-sm">{player.seasonStats.tackles}</TableCell>
                                <TableCell className="text-center text-sm">{player.seasonStats.bestOnGroundCount}</TableCell>
                              </>
                            ) : (
                              <TableCell colSpan={6} className="text-center text-xs text-muted-foreground/50">
                                — not scouted —
                              </TableCell>
                            )}
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

      {/* ---- Awards tab ---- */}
      {activeTab === 'awards' && (
        <div className="space-y-4">
          {discoveredPlayers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No scouted players yet. Assign a scout to this competition to start seeing award leaders.
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Stats leaders among your scouted players.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <AwardLeaderCard title="Disposals" icon="📊" players={topDisposals} stat={(p) => p.seasonStats.disposals} getClub={getClub} currentYear={currentYear} />
                <AwardLeaderCard title="Goals"     icon="🥅" players={topGoals}     stat={(p) => p.seasonStats.goals}     getClub={getClub} currentYear={currentYear} />
                <AwardLeaderCard title="Marks"     icon="🙌" players={topMarks}     stat={(p) => p.seasonStats.marks}     getClub={getClub} currentYear={currentYear} />
                <AwardLeaderCard title="Tackles"   icon="💪" players={topTackles}   stat={(p) => p.seasonStats.tackles}   getClub={getClub} currentYear={currentYear} />
                <AwardLeaderCard title="Best on Ground" icon="⭐" players={topBOG}  stat={(p) => p.seasonStats.bestOnGroundCount} getClub={getClub} currentYear={currentYear} />
                <AwardLeaderCard title="Avg Rating" icon="📈" players={topRating}  stat={(p) => Number(p.seasonStats.avgRating.toFixed(1))} getClub={getClub} currentYear={currentYear} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- Clubs tab ---- */}
      {activeTab === 'clubs' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-center">Pos</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead className="text-center">Abbr</TableHead>
                    <TableHead className="text-center">Strength</TableHead>
                    <TableHead className="text-center">P</TableHead>
                    <TableHead className="text-center">W</TableHead>
                    <TableHead className="text-center">L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clubsWithLadder.map(({ club, position, played, wins, losses }) => (
                    <TableRow
                      key={club.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => { setSelectedTeamId(club.id); setActiveTab('teams') }}
                    >
                      <TableCell className="text-center text-muted-foreground text-sm">
                        {position ?? '—'}
                      </TableCell>
                      <TableCell>
                        <ClubSwatch club={club} />
                      </TableCell>
                      <TableCell className="text-center text-sm font-mono">{club.abbreviation}</TableCell>
                      <TableCell className="text-center">
                        <StrengthBar value={club.strengthRating} />
                      </TableCell>
                      <TableCell className="text-center text-sm">{played}</TableCell>
                      <TableCell className="text-center text-sm">{wins}</TableCell>
                      <TableCell className="text-center text-sm">{losses}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Teams tab ---- */}
      {activeTab === 'teams' && (
        <div className="space-y-3">
          {/* Club picker */}
          <div className="flex flex-wrap gap-2">
            {comp.clubs.map((club) => (
              <button
                key={club.id}
                onClick={() => setSelectedTeamId(selectedTeamId === club.id ? null : club.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  selectedTeamId === club.id
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/50'
                }`}
              >
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: club.colors.primary }} />
                {club.name}
              </button>
            ))}
          </div>

          {!selectedTeamId ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Select a club above to view their squad.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {selectedClub && (
                    <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: selectedClub.colors.primary }} />
                  )}
                  {selectedClub?.name ?? selectedTeamId}
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    {teamPlayers.length} players
                  </span>
                  <StrengthBar value={selectedClub?.strengthRating ?? 50} />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {teamPlayers.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">No players registered for this club.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-center w-10">Age</TableHead>
                          <TableHead className="text-center w-10">Yr</TableHead>
                          <TableHead className="text-center w-12">Pos</TableHead>
                          <TableHead className="text-center w-28">Potential</TableHead>
                          <TableHead className="text-center w-10">Gms</TableHead>
                          <TableHead className="text-center w-12">Disp</TableHead>
                          <TableHead className="text-center w-12">Goals</TableHead>
                          <TableHead className="text-center w-12">Avg</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamPlayers.map((player) => {
                          const scouted    = isDiscovered(player.id)
                          const converted  = youthPathway.convertedProspectIds[player.id]
                          const scoutRating = scouted
                            ? Math.round(
                                (player.athleticism + player.footballIQ + player.contested +
                                  player.kicking + player.marking + player.goalkicking +
                                  player.workRate + player.leadership) / 8,
                              )
                            : null
                          return (
                            <TableRow
                              key={player.id}
                              className={`cursor-pointer hover:bg-muted/60 ${scouted ? 'bg-blue-500/5' : ''}`}
                              onClick={() => navigate(`/youth-pathway/player/${encodeURIComponent(player.id)}`)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  {scouted && <Star className="h-3 w-3 text-blue-500 shrink-0" />}
                                  <span className={`text-sm font-medium ${!scouted ? 'text-muted-foreground' : ''}`}>
                                    {player.firstName} {player.lastName}
                                  </span>
                                  {converted && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] py-0 px-1 border-green-500 text-green-600 cursor-pointer"
                                      onClick={(e) => { e.stopPropagation(); navigate('/scouting') }}
                                    >
                                      Prospect
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center text-sm">{player.age}</TableCell>
                              <TableCell className="text-center text-sm text-muted-foreground">Y{player.yearInComp}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-xs">{player.position}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {scoutRating !== null ? (
                                  <div className="flex items-center gap-1.5 justify-center">
                                    <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          scoutRating >= 70 ? 'bg-green-500'
                                            : scoutRating >= 55 ? 'bg-yellow-500'
                                            : 'bg-slate-400'
                                        }`}
                                        style={{ width: `${scoutRating}%` }}
                                      />
                                    </div>
                                    <span className="text-xs tabular-nums w-6 text-right">{scoutRating}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground/40">not scouted</span>
                                )}
                              </TableCell>
                              {scouted ? (
                                <>
                                  <TableCell className="text-center text-sm">{player.seasonStats.gamesPlayed}</TableCell>
                                  <TableCell className="text-center text-sm">{player.seasonStats.disposals}</TableCell>
                                  <TableCell className="text-center text-sm">{player.seasonStats.goals}</TableCell>
                                  <TableCell className="text-center text-sm">{player.seasonStats.avgRating.toFixed(1)}</TableCell>
                                </>
                              ) : (
                                <TableCell colSpan={4} className="text-center text-xs text-muted-foreground/40">
                                  — scout to unlock —
                                </TableCell>
                              )}
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ---- Draft Eligible tab ---- */}
      {activeTab === 'draft-eligible' && (
        <div className="space-y-2">
          {comp.ageGroup === 'u16' ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                U16 players are not yet draft eligible. They will appear here when they reach U18 competitions.
              </CardContent>
            </Card>
          ) : draftEligible.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No draft-eligible players found in this competition.
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {draftEligible.length} draft-eligible players (age 17–18). ★ = on your radar. Green badge = converted to AFL prospect.
              </p>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-center w-10">Age</TableHead>
                          <TableHead className="text-center w-12">Pos</TableHead>
                          <TableHead>Club</TableHead>
                          <TableHead className="text-center w-20">Draft Year</TableHead>
                          <TableHead className="text-center w-12">Gms</TableHead>
                          <TableHead className="text-center w-12">Disp</TableHead>
                          <TableHead className="text-center w-12">Goals</TableHead>
                          <TableHead className="text-center w-10">BOG</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {draftEligible.map((player) => {
                          const club    = getClub(player.clubId)
                          const scouted = isDiscovered(player.id)
                          const draftYr = draftEligibleYear(player, currentYear) ?? currentYear + 1
                          const converted = youthPathway.convertedProspectIds[player.id]
                          return (
                            <TableRow
                              key={player.id}
                              className={`cursor-pointer hover:bg-muted/60 ${scouted ? 'bg-blue-500/5' : ''}`}
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
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  {club && <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: club.colors.primary }} />}
                                  <span className="text-xs text-muted-foreground">{club?.abbreviation ?? '—'}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant={player.age === 18 ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
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
                                <TableCell colSpan={4} className="text-center text-xs text-muted-foreground/50">
                                  — not scouted —
                                </TableCell>
                              )}
                              <TableCell>
                                {converted ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 px-1.5 border-green-500 text-green-600 cursor-pointer"
                                    onClick={() => navigate('/scouting')}
                                  >
                                    <Trophy className="h-2.5 w-2.5 mr-0.5" />
                                    AFL Prospect
                                  </Badge>
                                ) : scouted ? (
                                  <span className="text-xs text-blue-500">On radar</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground/50">Unknown</span>
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
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Award Leader Card
// ---------------------------------------------------------------------------

function AwardLeaderCard({
  title,
  icon,
  players,
  stat,
  getClub,
  currentYear,
}: {
  title: string
  icon: string
  players: YouthPlayer[]
  stat: (p: YouthPlayer) => number
  getClub: (id: string) => YouthClub | undefined
  currentYear: number
}) {
  void currentYear // passed for potential use
  if (players.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <span>{icon}</span> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {players.map((p, i) => {
            const club = getClub(p.clubId)
            return (
              <div key={p.id} className="flex items-center gap-2 px-4 py-2">
                <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                {club && <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: club.colors.primary }} />}
                <span className="text-sm font-medium flex-1 min-w-0 truncate">
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-sm font-bold tabular-nums">{stat(p)}</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Strength bar
// ---------------------------------------------------------------------------

function StrengthBar({ value }: { value: number }) {
  const pct   = Math.round(value)
  const color = pct >= 70 ? 'bg-green-500' : pct >= 55 ? 'bg-yellow-500' : 'bg-slate-400'
  return (
    <div className="flex items-center gap-2 justify-center">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums w-6 text-right">{pct}</span>
    </div>
  )
}
