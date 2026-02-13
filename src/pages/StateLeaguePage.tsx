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
import type { StateLeagueId } from '@/types/stateLeague'

const LEAGUE_INFO: Record<StateLeagueId, { name: string; fullName: string }> = {
  vfl: { name: 'VFL', fullName: 'Victorian Football League' },
  sanfl: { name: 'SANFL', fullName: 'South Australian National Football League' },
  wafl: { name: 'WAFL', fullName: 'West Australian Football League' },
}

export function StateLeaguePage() {
  const stateLeagues = useGameStore((s) => s.stateLeagues)

  if (!stateLeagues) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">State Leagues</h1>
          <p className="text-sm text-muted-foreground">
            VFL, SANFL, and WAFL competition ladders and results
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">Not Available</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              State leagues are only available in Real AFL mode.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">State Leagues</h1>
        <p className="text-sm text-muted-foreground">
          VFL, SANFL, and WAFL competition ladders and results
        </p>
      </div>

      <Tabs defaultValue="vfl">
        <TabsList>
          <TabsTrigger value="vfl">VFL</TabsTrigger>
          <TabsTrigger value="sanfl">SANFL</TabsTrigger>
          <TabsTrigger value="wafl">WAFL</TabsTrigger>
        </TabsList>

        {(['vfl', 'sanfl', 'wafl'] as const).map((leagueId) => {
          const league = stateLeagues[leagueId]
          const info = LEAGUE_INFO[leagueId]

          // Find the last completed round
          const completedRounds = league.season.rounds.filter(
            (r) => r.results.length > 0 && r.results.some((res) => res.homeScore > 0 || res.awayScore > 0),
          )
          const lastRound = completedRounds[completedRounds.length - 1]

          return (
            <TabsContent key={leagueId} value={leagueId} className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    {info.fullName}
                    <Badge variant="outline" className="text-xs font-normal">
                      {league.clubs.length} teams
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {league.ladder.every((e) => e.played === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Season has not started yet. Simulate AFL rounds to advance state leagues.
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
                              <TableRow
                                key={entry.clubId}
                                className={idx < 4 ? 'bg-muted/30' : undefined}
                              >
                                <TableCell className="font-medium text-muted-foreground">
                                  {idx + 1}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="h-3 w-3 rounded-full shrink-0"
                                      style={{ backgroundColor: club.colors.primary }}
                                    />
                                    <span className="font-medium text-sm">
                                      {club.name}
                                    </span>
                                    {club.isAFLReserves && (
                                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                        AFL
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">{entry.played}</TableCell>
                                <TableCell className="text-center">{entry.wins}</TableCell>
                                <TableCell className="text-center">{entry.losses}</TableCell>
                                <TableCell className="text-center">{entry.draws}</TableCell>
                                <TableCell className="text-center">{entry.pointsFor}</TableCell>
                                <TableCell className="text-center">{entry.pointsAgainst}</TableCell>
                                <TableCell className="text-center">
                                  {entry.percentage.toFixed(1)}
                                </TableCell>
                                <TableCell className="text-center font-bold">
                                  {entry.points}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Last Round Results */}
              {lastRound && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Round {lastRound.number} Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {lastRound.results.map((result, i) => {
                        const home = league.clubs.find((c) => c.id === result.homeClubId)
                        const away = league.clubs.find((c) => c.id === result.awayClubId)
                        if (!home || !away) return null
                        const homeWon = result.homeScore > result.awayScore

                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: home.colors.primary }}
                              />
                              <span className={homeWon ? 'font-semibold' : ''}>
                                {home.abbreviation}
                              </span>
                            </div>
                            <span className="font-mono text-xs">
                              {result.homeScore} - {result.awayScore}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={!homeWon && result.awayScore > result.homeScore ? 'font-semibold' : ''}>
                                {away.abbreviation}
                              </span>
                              <div
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: away.colors.primary }}
                              />
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
