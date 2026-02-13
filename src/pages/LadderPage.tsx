import { useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Link } from 'react-router-dom'
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
import { getCareerLeaders } from '@/engine/history/historyEngine'
import { getBrownlowLeaderboard, getColemanLeaderboard } from '@/engine/awards/awardsEngine'
import type { PlayerCareerStats } from '@/types/player'
import { Trophy, Medal, Star } from 'lucide-react'

const LEADER_STATS: { key: keyof PlayerCareerStats; label: string }[] = [
  { key: 'gamesPlayed', label: 'Games' },
  { key: 'goals', label: 'Goals' },
  { key: 'disposals', label: 'Disposals' },
  { key: 'marks', label: 'Marks' },
  { key: 'tackles', label: 'Tackles' },
]

function CareerLeadersTable({
  stat,
  label,
  players,
  clubs,
}: {
  stat: keyof PlayerCareerStats
  label: string
  players: Record<string, import('@/types/player').Player>
  clubs: Record<string, { name: string; abbreviation: string }>
}) {
  const leaders = useMemo(() => getCareerLeaders(players, stat, 10), [players, stat])

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Career {label}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Club</TableHead>
              <TableHead className="text-right">{label}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaders.map((entry, i) => (
              <TableRow key={entry.playerId}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <Link
                    to={`/player/${entry.playerId}`}
                    className="font-medium hover:underline"
                  >
                    {entry.playerName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entry.clubId === 'retired'
                    ? 'Retired'
                    : (clubs[entry.clubId]?.abbreviation ?? entry.clubId)}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">{entry.value}</TableCell>
              </TableRow>
            ))}
            {leaders.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                  No data yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function LadderPage() {
  const ladder = useGameStore((s) => s.ladder)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentYear = useGameStore((s) => s.currentYear)
  const brownlowTracker = useGameStore((s) => s.brownlowTracker)
  const awards = useGameStore((s) => s.awards)

  const brownlowLeaders = useMemo(
    () => getBrownlowLeaderboard(brownlowTracker, 20),
    [brownlowTracker],
  )
  const colemanLeaders = useMemo(
    () => getColemanLeaderboard(players, 10),
    [players],
  )
  const currentAwards = useMemo(
    () => awards.find((a) => a.year === currentYear) ?? null,
    [awards, currentYear],
  )

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{currentYear} AFL Ladder</h1>

      <Tabs defaultValue="ladder">
        <TabsList>
          <TabsTrigger value="ladder">Ladder</TabsTrigger>
          <TabsTrigger value="awards">Awards</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
        </TabsList>

        <TabsContent value="ladder">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead className="text-center">P</TableHead>
                    <TableHead className="text-center">W</TableHead>
                    <TableHead className="text-center">L</TableHead>
                    <TableHead className="text-center">D</TableHead>
                    <TableHead className="text-center">Pts</TableHead>
                    <TableHead className="text-right">For</TableHead>
                    <TableHead className="text-right">Agst</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ladder.map((entry, i) => {
                    const club = clubs[entry.clubId]
                    const isPlayer = entry.clubId === playerClubId
                    return (
                      <TableRow
                        key={entry.clubId}
                        className={`${isPlayer ? 'bg-accent font-semibold' : ''} ${
                          i === 7 ? 'border-b-2 border-dashed border-muted-foreground/30' : ''
                        }`}
                      >
                        <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-4 w-4 rounded-full flex-shrink-0"
                              style={{ backgroundColor: club?.colors.primary }}
                            />
                            <span>{club?.name}</span>
                            {isPlayer && (
                              <Badge variant="secondary" className="text-xs">You</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{entry.played}</TableCell>
                        <TableCell className="text-center">{entry.wins}</TableCell>
                        <TableCell className="text-center">{entry.losses}</TableCell>
                        <TableCell className="text-center">{entry.draws}</TableCell>
                        <TableCell className="text-center font-bold">{entry.points}</TableCell>
                        <TableCell className="text-right">{entry.pointsFor}</TableCell>
                        <TableCell className="text-right">{entry.pointsAgainst}</TableCell>
                        <TableCell className="text-right">{entry.percentage.toFixed(1)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="awards" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Brownlow Leaderboard */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Medal className="h-4 w-4 text-yellow-500" />
                  Brownlow Medal
                </CardTitle>
                <CardDescription>3-2-1 votes per match</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead className="text-right">Votes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brownlowLeaders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                          No votes yet — play some rounds first.
                        </TableCell>
                      </TableRow>
                    ) : (
                      brownlowLeaders.map((entry, i) => {
                        const p = players[entry.playerId]
                        return (
                          <TableRow key={entry.playerId}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>
                              <Link
                                to={`/player/${entry.playerId}`}
                                className="font-medium hover:underline"
                              >
                                {p ? `${p.firstName} ${p.lastName}` : entry.playerId}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {p ? (clubs[p.clubId]?.abbreviation ?? p.clubId) : ''}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold">
                              {entry.votes}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Coleman Leaderboard */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  Coleman Medal
                </CardTitle>
                <CardDescription>Leading goalkicker</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead className="text-right">Goals</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {colemanLeaders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                          No goals yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      colemanLeaders.map((entry, i) => {
                        const p = players[entry.playerId]
                        return (
                          <TableRow key={entry.playerId}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>
                              <Link
                                to={`/player/${entry.playerId}`}
                                className="font-medium hover:underline"
                              >
                                {p ? `${p.firstName} ${p.lastName}` : entry.playerId}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {p ? (clubs[p.clubId]?.abbreviation ?? p.clubId) : ''}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold">
                              {entry.goals}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* All-Australian & Other Awards (shown if season awards computed) */}
          {currentAwards && (
            <div className="space-y-4">
              {currentAwards.risingStar && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Star className="h-4 w-4 text-yellow-500" />
                      Rising Star
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const p = players[currentAwards.risingStar!.playerId]
                      return p ? (
                        <Link
                          to={`/player/${p.id}`}
                          className="font-medium hover:underline"
                        >
                          {p.firstName} {p.lastName} ({clubs[p.clubId]?.abbreviation})
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Unknown</span>
                      )
                    })()}
                  </CardContent>
                </Card>
              )}

              {currentAwards.allAustralian.length > 0 && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Star className="h-4 w-4 text-yellow-500" />
                      All-Australian Team
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {currentAwards.allAustralian.map((pid) => {
                        const p = players[pid]
                        return p ? (
                          <Link key={pid} to={`/player/${pid}`}>
                            <Badge variant="outline" className="hover:bg-accent cursor-pointer">
                              {p.firstName[0]}. {p.lastName} ({clubs[p.clubId]?.abbreviation})
                            </Badge>
                          </Link>
                        ) : null
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="records" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            All-time career leaders across every player in the league.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {LEADER_STATS.map(({ key, label }) => (
              <CareerLeadersTable
                key={key}
                stat={key}
                label={label}
                players={players}
                clubs={clubs}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
