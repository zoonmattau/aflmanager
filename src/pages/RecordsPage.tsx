import { useMemo } from 'react'
import { Link } from 'react-router-dom'
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
import type { RecordsLeaderboardStat } from '@/types/history'

const STAT_LABELS: Record<RecordsLeaderboardStat, string> = {
  gamesPlayed: 'Games',
  goals: 'Goals',
  disposals: 'Disposals',
  marks: 'Marks',
  tackles: 'Tackles',
  hitouts: 'Hitouts',
  clearances: 'Clearances',
  intercepts: 'Intercepts',
  scoreInvolvements: 'Score Involvements',
  aflFantasyPoints: 'AFL Fantasy',
  superCoachPoints: 'SuperCoach',
}

export function RecordsPage() {
  const history = useGameStore((s) => s.history)
  const clubs = useGameStore((s) => s.clubs)
  const currentYear = useGameStore((s) => s.currentYear)
  const recordsBook = history.recordsBook
  const matchRecords = recordsBook.match

  const statKeys = useMemo(() => Object.keys(STAT_LABELS) as RecordsLeaderboardStat[], [])

  const clubLabel = (clubId: string) => clubs[clubId]?.abbreviation ?? clubs[clubId]?.name ?? clubId
  const singleSeasonRecords = [
    { label: 'Most Goals In A Season', entry: recordsBook.singleSeason.mostGoals },
    { label: 'Most Disposals In A Season', entry: recordsBook.singleSeason.mostDisposals },
    { label: 'Most Marks In A Season', entry: recordsBook.singleSeason.mostMarks },
    { label: 'Most Tackles In A Season', entry: recordsBook.singleSeason.mostTackles },
    { label: 'Most Hitouts In A Season', entry: recordsBook.singleSeason.mostHitouts },
    { label: 'Most Clearances In A Season', entry: recordsBook.singleSeason.mostClearances },
    { label: 'Most Intercepts In A Season', entry: recordsBook.singleSeason.mostIntercepts },
    { label: 'Most Score Involvements In A Season', entry: recordsBook.singleSeason.mostScoreInvolvements },
    { label: 'Most AFL Fantasy Points In A Season', entry: recordsBook.singleSeason.mostAflFantasyPoints },
    { label: 'Most SuperCoach Points In A Season', entry: recordsBook.singleSeason.mostSuperCoachPoints },
  ] as const

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">AFL Records Book</h1>
        <p className="text-sm text-muted-foreground">
          League-wide records and leaderboards through {currentYear}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {singleSeasonRecords.map((record) => (
          <Card key={record.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{record.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {record.entry ? (
                <div className="space-y-1">
                  <div className="text-2xl font-bold">{record.entry.value}</div>
                  <div className="text-sm">
                    <Link to={`/player/${record.entry.playerId}`} className="hover:underline">
                      {record.entry.playerName}
                    </Link>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {clubLabel(record.entry.clubId)} {record.entry.year ? `- ${record.entry.year}` : ''}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No record yet.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Longest Win Streak</CardTitle>
          </CardHeader>
          <CardContent>
            {recordsBook.team.longestWinStreak ? (
              <div className="space-y-1">
                <div className="text-2xl font-bold">{recordsBook.team.longestWinStreak.value}</div>
                <div className="text-sm">{recordsBook.team.longestWinStreak.clubName}</div>
                <div className="text-xs text-muted-foreground">
                  {recordsBook.team.longestWinStreak.startYear}-{recordsBook.team.longestWinStreak.endYear}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No record yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Longest Premiership Streak</CardTitle>
          </CardHeader>
          <CardContent>
            {recordsBook.team.longestPremiershipStreak ? (
              <div className="space-y-1">
                <div className="text-2xl font-bold">{recordsBook.team.longestPremiershipStreak.value}</div>
                <div className="text-sm">{recordsBook.team.longestPremiershipStreak.clubName}</div>
                <div className="text-xs text-muted-foreground">
                  {recordsBook.team.longestPremiershipStreak.startYear}-{recordsBook.team.longestPremiershipStreak.endYear}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No record yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Most Premierships</CardTitle>
          </CardHeader>
          <CardContent>
            {recordsBook.team.mostPremierships ? (
              <div className="space-y-1">
                <div className="text-2xl font-bold">{recordsBook.team.mostPremierships.value}</div>
                <div className="text-sm">{recordsBook.team.mostPremierships.clubName}</div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No record yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Most Top-4 Finishes</CardTitle>
          </CardHeader>
          <CardContent>
            {recordsBook.team.mostTopFourFinishes ? (
              <div className="space-y-1">
                <div className="text-2xl font-bold">{recordsBook.team.mostTopFourFinishes.value}</div>
                <div className="text-sm">{recordsBook.team.mostTopFourFinishes.clubName}</div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No record yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Biggest Winning Margin</CardTitle>
          </CardHeader>
          <CardContent>
            {matchRecords?.biggestWinMargin ? (
              <div className="space-y-1">
                <div className="text-2xl font-bold">{matchRecords.biggestWinMargin.value}</div>
                <div className="text-sm">
                  {clubLabel(matchRecords.biggestWinMargin.homeClubId)} vs {clubLabel(matchRecords.biggestWinMargin.awayClubId)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {matchRecords.biggestWinMargin.year}, Round {matchRecords.biggestWinMargin.round}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No record yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Highest Team Score</CardTitle>
          </CardHeader>
          <CardContent>
            {matchRecords?.highestTeamScore ? (
              <div className="space-y-1">
                <div className="text-2xl font-bold">{matchRecords.highestTeamScore.value}</div>
                <div className="text-sm">
                  {clubLabel(matchRecords.highestTeamScore.homeClubId)} vs {clubLabel(matchRecords.highestTeamScore.awayClubId)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {matchRecords.highestTeamScore.year}, Round {matchRecords.highestTeamScore.round}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No record yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Highest Combined Score</CardTitle>
          </CardHeader>
          <CardContent>
            {matchRecords?.highestCombinedScore ? (
              <div className="space-y-1">
                <div className="text-2xl font-bold">{matchRecords.highestCombinedScore.value}</div>
                <div className="text-sm">
                  {clubLabel(matchRecords.highestCombinedScore.homeClubId)} vs {clubLabel(matchRecords.highestCombinedScore.awayClubId)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {matchRecords.highestCombinedScore.year}, Round {matchRecords.highestCombinedScore.round}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No record yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Statistical Leaderboards</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="career" className="space-y-3">
            <TabsList>
              <TabsTrigger value="career">Career</TabsTrigger>
              <TabsTrigger value="season">Current Season</TabsTrigger>
            </TabsList>

            <TabsContent value="career" className="space-y-4">
              {statKeys.map((stat) => (
                <Card key={`career-${stat}`}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Career {STAT_LABELS[stat]}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead>Club</TableHead>
                          <TableHead className="text-right">{STAT_LABELS[stat]}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recordsBook.leaderboards.career[stat].slice(0, 10).map((entry, idx) => (
                          <TableRow key={`${stat}-${entry.playerId}`}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell>
                              <Link to={`/player/${entry.playerId}`} className="font-medium hover:underline">
                                {entry.playerName}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{clubLabel(entry.clubId)}</TableCell>
                            <TableCell className="text-right font-mono">{entry.value}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="season" className="space-y-4">
              {statKeys.map((stat) => (
                <Card key={`season-${stat}`}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">{currentYear} {STAT_LABELS[stat]}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead>Club</TableHead>
                          <TableHead className="text-right">{STAT_LABELS[stat]}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recordsBook.leaderboards.season[stat].slice(0, 10).map((entry, idx) => (
                          <TableRow key={`${stat}-${entry.playerId}`}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell>
                              <Link to={`/player/${entry.playerId}`} className="font-medium hover:underline">
                                {entry.playerName}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{clubLabel(entry.clubId)}</TableCell>
                            <TableCell className="text-right font-mono">{entry.value}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
