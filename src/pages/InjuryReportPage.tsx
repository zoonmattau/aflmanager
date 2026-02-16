import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getPlayerStarRating } from '@/engine/player/playerRating'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'

function severityColor(severity?: 'minor' | 'moderate' | 'major' | 'severe'): string {
  if (severity === 'severe') return 'bg-red-500/15 text-red-600 border-red-500/30'
  if (severity === 'major') return 'bg-orange-500/15 text-orange-600 border-orange-500/30'
  if (severity === 'moderate') return 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30'
  return 'bg-blue-500/15 text-blue-600 border-blue-500/30'
}

export function InjuryReportPage() {
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentDate = useGameStore((s) => s.currentDate)

  const allPlayers = useMemo(() => Object.values(players), [players])

  const leagueInjuries = useMemo(
    () =>
      allPlayers
        .filter((p) => p.clubId && p.clubId !== 'retired' && p.injury)
        .sort((a, b) => (b.injury?.weeksRemaining ?? 0) - (a.injury?.weeksRemaining ?? 0)),
    [allPlayers],
  )

  const myClubInjuries = useMemo(
    () => leagueInjuries.filter((p) => p.clubId === playerClubId),
    [leagueInjuries, playerClubId],
  )

  const highRiskAvailable = useMemo(
    () =>
      allPlayers
        .filter((p) => p.clubId === playerClubId && !p.injury)
        .filter((p) => p.fatigue >= 60 || p.hiddenAttributes.injuryProneness >= 65)
        .sort((a, b) => b.fatigue - a.fatigue),
    [allPlayers, playerClubId],
  )

  const recentlyRecovered = useMemo(
    () =>
      allPlayers
        .filter((p) => p.clubId && p.clubId !== 'retired')
        .flatMap((p) => (p.injuryHistory ?? []).map((h) => ({ player: p, history: h })))
        .filter((x) => x.history.recoveredOn === currentDate)
        .sort((a, b) => (b.history.initialWeeks - a.history.initialWeeks)),
    [allPlayers, currentDate],
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Injury Report</h1>
        <p className="text-sm text-muted-foreground">
          Medical status across your club and the league.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">My Club Injuries</p>
            <p className="text-2xl font-bold">{myClubInjuries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">League Injuries</p>
            <p className="text-2xl font-bold">{leagueInjuries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">High Risk Available</p>
            <p className="text-2xl font-bold">{highRiskAvailable.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Recovered Today</p>
            <p className="text-2xl font-bold">{recentlyRecovered.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="my-club">
        <TabsList>
          <TabsTrigger value="my-club">My Club</TabsTrigger>
          <TabsTrigger value="league">League</TabsTrigger>
          <TabsTrigger value="recoveries">Recoveries</TabsTrigger>
        </TabsList>

        <TabsContent value="my-club" className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Current Injuries</CardTitle>
              <CardDescription>Unavailable players at your club.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Injury</TableHead>
                    <TableHead className="text-center">Severity</TableHead>
                    <TableHead className="text-right">Weeks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myClubInjuries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        No active injuries.
                      </TableCell>
                    </TableRow>
                  ) : (
                    myClubInjuries.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div>
                            <Link to={`/player/${p.id}`} className="font-medium hover:underline">
                              {p.firstName} {p.lastName}
                            </Link>
                            <PlayerStarRating stars={getPlayerStarRating(p)} className="scale-[0.75] origin-left" />
                          </div>
                        </TableCell>
                        <TableCell>{p.injury?.type}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={severityColor(p.injury?.severity)}>
                            {p.injury?.severity ?? 'minor'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{p.injury?.weeksRemaining ?? 0}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">High Risk Availability</CardTitle>
              <CardDescription>Fit players carrying elevated risk signals.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">Fatigue</TableHead>
                    <TableHead className="text-right">Proneness</TableHead>
                    <TableHead className="text-right">Durability</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {highRiskAvailable.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        No high-risk players.
                      </TableCell>
                    </TableRow>
                  ) : (
                    highRiskAvailable.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div>
                            <Link to={`/player/${p.id}`} className="font-medium hover:underline">
                              {p.firstName} {p.lastName}
                            </Link>
                            <PlayerStarRating stars={getPlayerStarRating(p)} className="scale-[0.75] origin-left" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{p.fatigue}</TableCell>
                        <TableCell className="text-right font-mono">{p.hiddenAttributes.injuryProneness}</TableCell>
                        <TableCell className="text-right font-mono">{p.hiddenAttributes.durability}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="league">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">League Injury Table</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>Injury</TableHead>
                    <TableHead className="text-center">Severity</TableHead>
                    <TableHead className="text-right">Weeks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leagueInjuries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        No active injuries in league.
                      </TableCell>
                    </TableRow>
                  ) : (
                    leagueInjuries.slice(0, 120).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div>
                            <Link to={`/player/${p.id}`} className="font-medium hover:underline">
                              {p.firstName} {p.lastName}
                            </Link>
                            <PlayerStarRating stars={getPlayerStarRating(p)} className="scale-[0.75] origin-left" />
                          </div>
                        </TableCell>
                        <TableCell>{clubs[p.clubId]?.abbreviation ?? p.clubId}</TableCell>
                        <TableCell>{p.injury?.type}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={severityColor(p.injury?.severity)}>
                            {p.injury?.severity ?? 'minor'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{p.injury?.weeksRemaining ?? 0}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recoveries">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Recovered Today</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>Injury</TableHead>
                    <TableHead className="text-right">Games Missed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentlyRecovered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        No recoveries on {currentDate}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentlyRecovered.map(({ player, history }, idx) => (
                      <TableRow key={`${player.id}-${history.type}-${idx}`}>
                        <TableCell>
                          <div>
                            <Link to={`/player/${player.id}`} className="font-medium hover:underline">
                              {player.firstName} {player.lastName}
                            </Link>
                            <PlayerStarRating stars={getPlayerStarRating(player)} className="scale-[0.75] origin-left" />
                          </div>
                        </TableCell>
                        <TableCell>{clubs[player.clubId]?.abbreviation ?? player.clubId}</TableCell>
                        <TableCell>{history.type}</TableCell>
                        <TableCell className="text-right font-mono">{history.gamesMissed}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
