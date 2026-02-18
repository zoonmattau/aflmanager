import { useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Trophy } from 'lucide-react'
import type { StateLeague, StateLeagueId } from '@/types/stateLeague'

const LEAGUE_ORDER: StateLeagueId[] = ['vfl', 'sanfl', 'wafl', 'tfl', 'ntfl', 'u18', 'u16']

function leagueSubtitle(league: StateLeague): string {
  const divisionText = league.divisions.length > 1
    ? `${league.divisions.length} divisions`
    : 'Single table'
  return `${divisionText} - ${league.fixtureRules.rounds} rounds - ${league.finalsRules.qualifyingTeams} finals teams`
}

export function StateLeaguePage() {
  const stateLeagues = useGameStore((s) => s.stateLeagues)

  const leagues = useMemo(() => {
    if (!stateLeagues) return []
    return LEAGUE_ORDER
      .map((id) => ({ id, league: stateLeagues[id] }))
      .filter((entry): entry is { id: StateLeagueId; league: StateLeague } => Boolean(entry.league && entry.league.clubs.length > 0))
  }, [stateLeagues])

  if (leagues.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">State And Pathway Leagues</h1>
          <p className="text-sm text-muted-foreground">
            Multi-tier state and underage competitions are unavailable in this save.
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No Active Leagues</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Start a new game with pathway leagues enabled to simulate U16/U18 competitions.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">State And Pathway Leagues</h1>
        <p className="text-sm text-muted-foreground">
          Fully simulated state leagues plus U16/U18 pathways with custom ladder, fixture and finals rules.
        </p>
      </div>

      <Tabs defaultValue={leagues[0]?.id ?? 'vfl'}>
        <TabsList className="flex flex-wrap h-auto">
          {leagues.map(({ id, league }) => (
            <TabsTrigger key={id} value={id}>{league.name}</TabsTrigger>
          ))}
        </TabsList>

        {leagues.map(({ id, league }) => {
          const completedRounds = league.season.rounds.filter(
            (r) => r.results.length > 0 && r.results.some((res) => res.homeScore > 0 || res.awayScore > 0),
          )
          const lastRound = completedRounds[completedRounds.length - 1]
          const latestHistory = league.history[league.history.length - 1]

          return (
            <TabsContent key={id} value={id} className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {league.name}
                    <Badge variant="outline" className="text-xs font-normal">{league.clubs.length} teams</Badge>
                    <Badge variant="outline" className="text-xs font-normal">{leagueSubtitle(league)}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {league.ladder.every((e) => e.played === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Season has not started yet. Simulate AFL rounds to advance this competition.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8">#</TableHead>
                            <TableHead>Club</TableHead>
                            <TableHead className="text-center w-10">P</TableHead>
                            <TableHead className="text-center w-10">W</TableHead>
                            <TableHead className="text-center w-10">L</TableHead>
                            <TableHead className="text-center w-10">D</TableHead>
                            <TableHead className="text-center w-14">PF</TableHead>
                            <TableHead className="text-center w-14">PA</TableHead>
                            <TableHead className="text-center w-16">%</TableHead>
                            <TableHead className="text-center w-10">Pts</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {league.ladder.map((entry, idx) => {
                            const club = league.clubs.find((c) => c.id === entry.clubId)
                            if (!club) return null
                            return (
                              <TableRow key={entry.clubId} className={idx < league.finalsRules.qualifyingTeams ? 'bg-muted/20' : undefined}>
                                <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: club.colors.primary }} />
                                    <span className="font-medium text-sm">{club.name}</span>
                                    {club.divisionId && club.divisionId !== 'overall' && (
                                      <Badge variant="secondary" className="text-[10px] px-1 py-0">{club.divisionId}</Badge>
                                    )}
                                    {club.isAFLReserves && (
                                      <Badge variant="secondary" className="text-[10px] px-1 py-0">AFL</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">{entry.played}</TableCell>
                                <TableCell className="text-center">{entry.wins}</TableCell>
                                <TableCell className="text-center">{entry.losses}</TableCell>
                                <TableCell className="text-center">{entry.draws}</TableCell>
                                <TableCell className="text-center">{entry.pointsFor}</TableCell>
                                <TableCell className="text-center">{entry.pointsAgainst}</TableCell>
                                <TableCell className="text-center">{entry.percentage.toFixed(1)}</TableCell>
                                <TableCell className="text-center font-bold">{entry.points}</TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {latestHistory && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Latest Historical Record ({latestHistory.year})</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Premier: {league.clubs.find((c) => c.id === latestHistory.premierClubId)?.name ?? latestHistory.premierClubId}
                    {latestHistory.runnerUpClubId && (
                      <span> - Runner-up: {league.clubs.find((c) => c.id === latestHistory.runnerUpClubId)?.name ?? latestHistory.runnerUpClubId}</span>
                    )}
                  </CardContent>
                </Card>
              )}

              {lastRound && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Round {lastRound.number} Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {lastRound.results.map((result, i) => {
                        const home = league.clubs.find((c) => c.id === result.homeClubId)
                        const away = league.clubs.find((c) => c.id === result.awayClubId)
                        if (!home || !away) return null
                        const homeWon = result.homeScore > result.awayScore

                        return (
                          <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: home.colors.primary }} />
                              <span className={homeWon ? 'font-semibold' : ''}>{home.abbreviation}</span>
                            </div>
                            <span className="font-mono text-xs">{result.homeScore} - {result.awayScore}</span>
                            <div className="flex items-center gap-2">
                              <span className={!homeWon && result.awayScore > result.homeScore ? 'font-semibold' : ''}>{away.abbreviation}</span>
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: away.colors.primary }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
