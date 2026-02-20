import { useState } from 'react'
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
import { Trophy, Star, Users } from 'lucide-react'
import type { YouthNationalTournament, NationalU18Team, StateRepTeam } from '@/types/youthPathway'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TournamentTabId = 'u18' | 'u16'
type SectionId = 'overview' | 'teams' | 'matches' | 'all-australian'

// ---------------------------------------------------------------------------
// Standings computation
// ---------------------------------------------------------------------------

function computeStandings(tournament: YouthNationalTournament) {
  const standings: Record<string, {
    wins: number; losses: number; draws: number
    played: number; pointsFor: number; pointsAgainst: number
  }> = {}

  for (const match of tournament.matches) {
    for (const team of [match.homeTeamName, match.awayTeamName] as NationalU18Team[]) {
      if (!standings[team]) {
        standings[team] = { wins: 0, losses: 0, draws: 0, played: 0, pointsFor: 0, pointsAgainst: 0 }
      }
    }
    standings[match.homeTeamName].played++
    standings[match.awayTeamName].played++
    standings[match.homeTeamName].pointsFor  += match.homeScore
    standings[match.homeTeamName].pointsAgainst += match.awayScore
    standings[match.awayTeamName].pointsFor  += match.awayScore
    standings[match.awayTeamName].pointsAgainst += match.homeScore

    if (match.homeScore > match.awayScore) {
      standings[match.homeTeamName].wins++
      standings[match.awayTeamName].losses++
    } else if (match.awayScore > match.homeScore) {
      standings[match.awayTeamName].wins++
      standings[match.homeTeamName].losses++
    } else {
      standings[match.homeTeamName].draws++
      standings[match.awayTeamName].draws++
    }
  }

  return Object.entries(standings).sort(([, a], [, b]) => {
    const apts = a.wins * 4 + a.draws * 2
    const bpts = b.wins * 4 + b.draws * 2
    if (bpts !== apts) return bpts - apts
    const apct = a.pointsAgainst > 0 ? a.pointsFor / a.pointsAgainst : 1
    const bpct = b.pointsAgainst > 0 ? b.pointsFor / b.pointsAgainst : 1
    return bpct - apct
  })
}

// ---------------------------------------------------------------------------
// Team Roster card
// ---------------------------------------------------------------------------

function StateTeamCard({
  team,
  playerClubId,
}: {
  team: StateRepTeam
  playerClubId: string
}) {
  const youthPathway = useGameStore((s) => s.youthPathway)
  const [expanded, setExpanded] = useState(false)

  const playerList = team.playerIds.map((pid) => ({
    id: pid,
    player:    youthPathway?.players[pid] ?? null,
    stats:     team.tournamentStats[pid] ?? null,
    scouted:   youthPathway?.players[pid]?.discoveredByClubIds.includes(playerClubId) ?? false,
    converted: youthPathway ? pid in youthPathway.convertedProspectIds : false,
  }))

  const scoutedCount = playerList.filter((p) => p.scouted).length

  return (
    <Card>
      <CardContent className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-sm">{team.teamName}</p>
            <p className="text-xs text-muted-foreground">
              {team.playerIds.length} players
              {scoutedCount > 0 && (
                <span className="ml-2 text-blue-500">★ {scoutedCount} scouted</span>
              )}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Hide' : 'Show roster'}
          </Button>
        </div>

        {expanded && (
          <div className="border-t pt-2">
            {playerList.length === 0 ? (
              <p className="text-xs text-muted-foreground">No players listed.</p>
            ) : (
              <div className="space-y-1">
                {playerList.map(({ id, player, stats, scouted, converted }) => (
                  <div
                    key={id}
                    className={`flex items-center gap-2 text-xs rounded px-2 py-1 ${scouted ? 'bg-blue-500/8' : ''}`}
                  >
                    {scouted && <Star className="h-3 w-3 text-blue-500 shrink-0" />}
                    <span className={`font-medium min-w-[120px] ${!scouted ? 'text-muted-foreground' : ''}`}>
                      {player ? `${player.firstName} ${player.lastName}` : id.slice(0, 8) + '…'}
                    </span>
                    {player && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1">{player.position}</Badge>
                    )}
                    {converted && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1 border-green-500 text-green-600">
                        Prospect
                      </Badge>
                    )}
                    {scouted && stats && (
                      <span className="text-muted-foreground ml-auto">
                        {stats.disposals}d · {stats.goals}g · {stats.bestOnGroundCount} BOG
                      </span>
                    )}
                    {!scouted && (
                      <span className="ml-auto text-muted-foreground/40">— not scouted —</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Full tournament view
// ---------------------------------------------------------------------------

function TournamentView({
  tournament,
  ageGroup,
  playerClubId,
}: {
  tournament: YouthNationalTournament | null
  ageGroup: 'u16' | 'u18'
  playerClubId: string
}) {
  const [section, setSection] = useState<SectionId>('overview')
  const youthPathway = useGameStore((s) => s.youthPathway)

  const sections: { id: SectionId; label: string }[] = [
    { id: 'overview',       label: 'Standings' },
    { id: 'matches',        label: 'Matches' },
    { id: 'teams',          label: 'State Teams' },
    { id: 'all-australian', label: 'All-Australian' },
  ]

  if (!tournament) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Users className="mx-auto h-10 w-10 text-muted-foreground/20 mb-3" />
        <p className="text-lg font-medium">Tournament not yet run</p>
        <p className="text-sm mt-1">
          State teams are selected and the national championships simulated when AFL Finals begin.
        </p>
      </div>
    )
  }

  const isDiscovered = (pid: string) =>
    youthPathway?.players[pid]?.discoveredByClubIds.includes(playerClubId) ?? false

  const standings  = computeStandings(tournament)
  const medalWinner = tournament.medalWinnerId
    ? youthPathway?.players[tournament.medalWinnerId]
    : null

  return (
    <div className="space-y-4">
      {/* Medal winner banner */}
      {medalWinner && (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
              {ageGroup === 'u18' ? 'Larke Medal Winner' : 'Tournament Medal Winner'}
            </p>
            <p className="text-xl font-bold">
              {medalWinner.firstName} {medalWinner.lastName}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{medalWinner.position}</Badge>
              <span className="text-sm text-muted-foreground">{medalWinner.region}</span>
              {isDiscovered(tournament.medalWinnerId!) && (
                <Badge className="bg-blue-500 text-white text-xs">On Your Radar</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section tabs */}
      <div className="flex border-b flex-wrap gap-0">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              section === s.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Standings ── */}
      {section === 'overview' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tournament Standings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 text-center">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-center w-10">P</TableHead>
                  <TableHead className="text-center w-10">W</TableHead>
                  <TableHead className="text-center w-10">L</TableHead>
                  <TableHead className="text-center w-10">D</TableHead>
                  <TableHead className="text-center w-14">PF</TableHead>
                  <TableHead className="text-center w-14">PA</TableHead>
                  <TableHead className="text-center w-12">Pts</TableHead>
                  <TableHead className="text-center w-16">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.map(([team, s], idx) => {
                  const pts = s.wins * 4 + s.draws * 2
                  const pct = s.pointsAgainst > 0
                    ? ((s.pointsFor / s.pointsAgainst) * 100).toFixed(1)
                    : '100.0'
                  return (
                    <TableRow key={team}>
                      <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-sm">{team}</TableCell>
                      <TableCell className="text-center text-sm">{s.played}</TableCell>
                      <TableCell className="text-center text-sm">{s.wins}</TableCell>
                      <TableCell className="text-center text-sm">{s.losses}</TableCell>
                      <TableCell className="text-center text-sm">{s.draws}</TableCell>
                      <TableCell className="text-center text-sm">{s.pointsFor}</TableCell>
                      <TableCell className="text-center text-sm">{s.pointsAgainst}</TableCell>
                      <TableCell className="text-center font-bold">{pts}</TableCell>
                      <TableCell className="text-center text-sm">{pct}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Matches ── */}
      {section === 'matches' && (
        <div className="space-y-2">
          {tournament.matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches played.</p>
          ) : (
            (() => {
              // Group by round
              const byRound: Record<number, typeof tournament.matches> = {}
              for (const m of tournament.matches) {
                if (!byRound[m.round]) byRound[m.round] = []
                byRound[m.round].push(m)
              }
              return Object.entries(byRound)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([round, matches]) => (
                  <div key={round} className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Round {round}
                    </p>
                    {matches.map((match, idx) => {
                      const homeWon = match.homeScore > match.awayScore
                      const mvp     = match.mvpPlayerId
                        ? youthPathway?.players[match.mvpPlayerId]
                        : null
                      const mvpScouted = match.mvpPlayerId ? isDiscovered(match.mvpPlayerId) : false
                      return (
                        <Card key={idx}>
                          <CardContent className="pt-4 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className={homeWon ? 'font-bold w-2/5' : 'text-muted-foreground w-2/5'}>
                                {match.homeTeamName}
                              </span>
                              <span className="font-mono font-bold">
                                {match.homeScore} – {match.awayScore}
                              </span>
                              <span className={`text-right w-2/5 ${!homeWon && match.awayScore !== match.homeScore ? 'font-bold' : 'text-muted-foreground'}`}>
                                {match.awayTeamName}
                              </span>
                            </div>
                            {mvp && (
                              <p className="text-xs text-muted-foreground">
                                MVP: <span className={mvpScouted ? 'font-medium text-foreground' : ''}>
                                  {mvp.firstName} {mvp.lastName}
                                </span>
                                {mvpScouted && <Star className="h-3 w-3 text-blue-500 inline ml-1" />}
                              </p>
                            )}
                            {match.standoutPlayerIds.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {match.standoutPlayerIds.map((pid) => {
                                  const p       = youthPathway?.players[pid]
                                  const scouted = isDiscovered(pid)
                                  if (!p) return null
                                  return (
                                    <Badge
                                      key={pid}
                                      variant={scouted ? 'default' : 'secondary'}
                                      className="text-[10px]"
                                    >
                                      {scouted && <Star className="h-2.5 w-2.5 mr-0.5" />}
                                      {p.firstName} {p.lastName}
                                    </Badge>
                                  )
                                })}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                ))
            })()
          )}
        </div>
      )}

      {/* ── State Teams ── */}
      {section === 'teams' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {tournament.teams.length} state teams selected. Click "Show roster" to expand each team.
            ★ = scouted by your club.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tournament.teams.map((team) => (
              <StateTeamCard key={team.teamName} team={team} playerClubId={playerClubId} />
            ))}
          </div>
          {tournament.teams.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                State team rosters not available.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── All-Australian ── */}
      {section === 'all-australian' && (
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                All-Australian Team
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tournament.allAustralianTeam.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  All-Australian team not yet selected.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {tournament.allAustralianTeam.map((pid, idx) => {
                    const player    = youthPathway?.players[pid]
                    const scouted   = isDiscovered(pid)
                    const converted = youthPathway ? pid in youthPathway.convertedProspectIds : false
                    if (!player) return null
                    return (
                      <div
                        key={pid}
                        className={`border rounded-md p-3 space-y-1 ${
                          scouted ? 'border-blue-500/40 bg-blue-500/5' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="font-medium text-sm">
                            {scouted && <Star className="h-3 w-3 text-blue-500 inline mr-0.5" />}
                            {player.firstName} {player.lastName}
                          </p>
                          <span className="text-xs text-muted-foreground shrink-0">#{idx + 1}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className="text-xs py-0 px-1">{player.position}</Badge>
                          <span className="text-xs text-muted-foreground">{player.region}</span>
                          {converted && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1 border-green-500 text-green-600">
                              Prospect
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function YouthTournamentPage() {
  const navigate     = useNavigate()
  const [activeTab, setActiveTab] = useState<TournamentTabId>('u18')

  const youthPathway  = useGameStore((s) => s.youthPathway)
  const playerClubId  = useGameStore((s) => s.playerClubId)
  const currentYear   = useGameStore((s) => s.currentYear)

  if (!youthPathway) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-muted-foreground">Youth pathway not enabled.</p>
        <Button variant="link" onClick={() => navigate('/youth-pathway')}>← Youth Pathway</Button>
      </div>
    )
  }

  const tabs: { id: TournamentTabId; label: string }[] = [
    { id: 'u18', label: 'U18 Championships' },
    { id: 'u16', label: 'U16 Championships' },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/youth-pathway')}>
          ← Youth Pathway
        </Button>
        <div>
          <h1 className="text-2xl font-bold">National U18 Championships</h1>
          <p className="text-sm text-muted-foreground">{currentYear} · State vs State</p>
        </div>
      </div>

      {/* Age-group tabs */}
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

      {activeTab === 'u18' && (
        <TournamentView
          tournament={youthPathway.tournaments.u18}
          ageGroup="u18"
          playerClubId={playerClubId}
        />
      )}
      {activeTab === 'u16' && (
        <TournamentView
          tournament={youthPathway.tournaments.u16}
          ageGroup="u16"
          playerClubId={playerClubId}
        />
      )}
    </div>
  )
}
