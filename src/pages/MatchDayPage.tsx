import { useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { simulateMatch } from '@/engine/match/simulateMatch'
import { processMatchResults } from '@/engine/season/processResults'
import type { Match } from '@/types/match'
import type { Fixture, MatchDay } from '@/types/season'
import { Swords, Play, Clock, Calendar, MapPin, Star } from 'lucide-react'

const MATCH_DAY_ORDER: MatchDay[] = [
  'Thursday',
  'Friday',
  'Saturday-Early',
  'Saturday-Twilight',
  'Saturday-Night',
  'Sunday-Early',
  'Sunday-Twilight',
  'Monday',
]

const MATCH_DAY_LABELS: Record<MatchDay, string> = {
  'Thursday': 'Thursday Night',
  'Friday': 'Friday Night',
  'Saturday-Early': 'Saturday Afternoon',
  'Saturday-Twilight': 'Saturday Twilight',
  'Saturday-Night': 'Saturday Night',
  'Sunday-Early': 'Sunday Early',
  'Sunday-Twilight': 'Sunday Afternoon',
  'Monday': 'Monday',
}

function getMatchDayIndex(day?: MatchDay): number {
  if (!day) return 3 // Default to Saturday-Twilight
  return MATCH_DAY_ORDER.indexOf(day)
}

export function MatchDayPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const season = useGameStore((s) => s.season)
  const currentRound = useGameStore((s) => s.currentRound)
  const matchResults = useGameStore((s) => s.matchResults)
  const rngSeed = useGameStore((s) => s.rngSeed)
  const addMatchResult = useGameStore((s) => s.addMatchResult)
  const advanceRound = useGameStore((s) => s.advanceRound)

  const [lastMatchResult, setLastMatchResult] = useState<Match | null>(null)
  const [viewingRound, setViewingRound] = useState<number | null>(null)

  const displayRoundIdx = viewingRound ?? currentRound
  const round = season?.rounds?.[displayRoundIdx]
  const isCurrentRound = displayRoundIdx === currentRound

  if (!season?.rounds?.length) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Match Day</h1>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No more matches to play this season.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!round) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Match Day</h1>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No more matches to play this season.
          </CardContent>
        </Card>
      </div>
    )
  }

  const playerFixture = round.fixtures.find(
    (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId
  )

  // Check if this round has already been played
  const roundPlayed = matchResults.some(
    (m) => m.round === displayRoundIdx && m.result !== null
  )

  // Group fixtures by match day
  const userMatchDayIdx = getMatchDayIndex(playerFixture?.matchDay)

  const earlierFixtures = round.fixtures.filter(
    (f) =>
      f !== playerFixture &&
      getMatchDayIndex(f.matchDay) < userMatchDayIdx
  )
  const sameTimeFixtures = round.fixtures.filter(
    (f) =>
      f !== playerFixture &&
      getMatchDayIndex(f.matchDay) === userMatchDayIdx
  )
  const laterFixtures = round.fixtures.filter(
    (f) =>
      f !== playerFixture &&
      getMatchDayIndex(f.matchDay) > userMatchDayIdx
  )

  // Group fixtures by day for display
  const groupByDay = (fixtures: Fixture[]) => {
    const groups: { day: MatchDay; fixtures: Fixture[] }[] = []
    for (const f of fixtures) {
      const day = f.matchDay ?? 'Saturday-Twilight'
      const existing = groups.find((g) => g.day === day)
      if (existing) {
        existing.fixtures.push(f)
      } else {
        groups.push({ day, fixtures: [f] })
      }
    }
    return groups.sort((a, b) => getMatchDayIndex(a.day) - getMatchDayIndex(b.day))
  }

  const handleSimRound = () => {
    // Simulate all matches in this round
    const results: Match[] = round.fixtures.map((fixture, i) => {
      const match = simulateMatch({
        homeClubId: fixture.homeClubId,
        awayClubId: fixture.awayClubId,
        venue: fixture.venue,
        round: currentRound,
        players,
        clubs,
        seed: rngSeed + currentRound * 100 + i,
      })
      return match
    })

    // Add all match results
    results.forEach((m) => addMatchResult(m))

    // Process results (update ladder)
    processMatchResults(results, useGameStore.getState, useGameStore.setState)

    // Find user's match
    const userMatch = results.find(
      (m) => m.homeClubId === playerClubId || m.awayClubId === playerClubId
    )
    if (userMatch) setLastMatchResult(userMatch)

    // Advance to next round
    advanceRound()
  }

  const homeClub = playerFixture ? clubs[playerFixture.homeClubId] : null
  const awayClub = playerFixture ? clubs[playerFixture.awayClubId] : null

  const getMatchResult = (fixture: Fixture) =>
    matchResults.find(
      (m) =>
        m.round === displayRoundIdx &&
        m.homeClubId === fixture.homeClubId &&
        m.awayClubId === fixture.awayClubId
    )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{round.name}</h1>
          <Select
            value={String(displayRoundIdx)}
            onValueChange={(val) => {
              const idx = parseInt(val, 10)
              setViewingRound(idx === currentRound ? null : idx)
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {season.rounds.map((r, i) => (
                <SelectItem key={i} value={String(i)}>
                  {r.name}{i === currentRound ? ' (current)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isCurrentRound && !roundPlayed && (
          <Button onClick={handleSimRound} className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Simulate Round
          </Button>
        )}
      </div>

      {/* Teams on Bye */}
      {(round.byeClubIds ?? []).length > 0 && (
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Teams on Bye: </span>
              {(round.byeClubIds ?? []).map((id) => clubs[id]?.abbreviation ?? id).join(', ')}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Earlier Results */}
      {earlierFixtures.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Earlier Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {groupByDay(earlierFixtures).map(({ day, fixtures }) => (
                <div key={day}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {MATCH_DAY_LABELS[day]}
                  </p>
                  <div className="space-y-1.5">
                    {fixtures.map((fixture, i) => (
                      <FixtureRow
                        key={i}
                        fixture={fixture}
                        clubs={clubs}
                        result={getMatchResult(fixture)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming fixture */}
      {playerFixture && !lastMatchResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5" />
              Your Match
              {playerFixture.matchDay && (
                <span className="ml-auto flex items-center gap-1 text-sm font-normal text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {MATCH_DAY_LABELS[playerFixture.matchDay]}
                  {playerFixture.scheduledTime && ` ${playerFixture.scheduledTime}`}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-8 py-4">
              <div className="flex flex-col items-center gap-2">
                <div
                  className="h-16 w-16 rounded-full"
                  style={{ backgroundColor: homeClub?.colors.primary }}
                />
                <span className="text-lg font-bold">{homeClub?.abbreviation}</span>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-muted-foreground">vs</p>
                <p className="text-sm text-muted-foreground">{playerFixture.venue}</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div
                  className="h-16 w-16 rounded-full"
                  style={{ backgroundColor: awayClub?.colors.primary }}
                />
                <span className="text-lg font-bold">{awayClub?.abbreviation}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Match Result */}
      {lastMatchResult?.result && (
        <MatchResultView match={lastMatchResult} clubs={clubs} players={players} playerClubId={playerClubId} />
      )}

      {/* Same-time & Later fixtures */}
      {(sameTimeFixtures.length > 0 || laterFixtures.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other Fixtures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sameTimeFixtures.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Same Time
                  </p>
                  <div className="space-y-1.5">
                    {sameTimeFixtures.map((fixture, i) => (
                      <FixtureRow
                        key={`same-${i}`}
                        fixture={fixture}
                        clubs={clubs}
                        result={getMatchResult(fixture)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {groupByDay(laterFixtures).map(({ day, fixtures }) => (
                <div key={day}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {MATCH_DAY_LABELS[day]}
                  </p>
                  <div className="space-y-1.5">
                    {fixtures.map((fixture, i) => (
                      <FixtureRow
                        key={`later-${day}-${i}`}
                        fixture={fixture}
                        clubs={clubs}
                        result={getMatchResult(fixture)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function FixtureRow({
  fixture,
  clubs,
  result,
}: {
  fixture: Fixture
  clubs: Record<string, import('@/types/club').Club>
  result: Match | undefined
}) {
  const home = clubs[fixture.homeClubId]
  const away = clubs[fixture.awayClubId]
  return (
    <div className="rounded-md border px-4 py-2">
      {fixture.isBlockbuster && fixture.blockbusterName && (
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
          <Star className="h-3 w-3 fill-amber-400" />
          {fixture.blockbusterName}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: home?.colors.primary }}
          />
          <span className="font-medium">{home?.abbreviation}</span>
        </div>
        <div className="text-center">
          {result?.result ? (
            <span className="font-mono text-sm">
              {result.result.homeTotalScore} - {result.result.awayTotalScore}
            </span>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-sm text-muted-foreground">vs</span>
              {fixture.scheduledTime && (
                <span className="text-xs text-muted-foreground">{fixture.scheduledTime}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{away?.abbreviation}</span>
          <div
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: away?.colors.primary }}
          />
        </div>
      </div>
      {fixture.venue && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="h-2.5 w-2.5" />
          {fixture.venue}
        </div>
      )}
    </div>
  )
}

function MatchResultView({
  match,
  clubs,
  players,
  playerClubId,
}: {
  match: Match
  clubs: Record<string, import('@/types/club').Club>
  players: Record<string, import('@/types/player').Player>
  playerClubId: string
}) {
  const result = match.result!
  const homeClub = clubs[match.homeClubId]
  const awayClub = clubs[match.awayClubId]
  const isHome = match.homeClubId === playerClubId

  const userStats = isHome ? result.homePlayerStats : result.awayPlayerStats

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-8">
            <div className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-12 rounded-full"
                style={{ backgroundColor: homeClub?.colors.primary }}
              />
              <span className="font-bold">{homeClub?.abbreviation}</span>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">
                {result.homeTotalScore} - {result.awayTotalScore}
              </div>
              <div className="mt-1 text-xs text-muted-foreground font-mono">
                {result.homeScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
                <br />
                {result.awayScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-12 rounded-full"
                style={{ backgroundColor: awayClub?.colors.primary }}
              />
              <span className="font-bold">{awayClub?.abbreviation}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Player Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Your Player Stats</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-center">D</TableHead>
                  <TableHead className="text-center">K</TableHead>
                  <TableHead className="text-center">HB</TableHead>
                  <TableHead className="text-center">M</TableHead>
                  <TableHead className="text-center">T</TableHead>
                  <TableHead className="text-center">G</TableHead>
                  <TableHead className="text-center">B</TableHead>
                  <TableHead className="text-center">CP</TableHead>
                  <TableHead className="text-center">CL</TableHead>
                  <TableHead className="text-center">HO</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...userStats]
                  .sort((a, b) => b.disposals - a.disposals)
                  .map((stat) => {
                    const player = players[stat.playerId]
                    if (!player) return null
                    return (
                      <TableRow key={stat.playerId} className="text-sm">
                        <TableCell className="font-medium whitespace-nowrap">
                          {player.firstName.charAt(0)}. {player.lastName}
                        </TableCell>
                        <TableCell className="text-center">{stat.disposals}</TableCell>
                        <TableCell className="text-center">{stat.kicks}</TableCell>
                        <TableCell className="text-center">{stat.handballs}</TableCell>
                        <TableCell className="text-center">{stat.marks}</TableCell>
                        <TableCell className="text-center">{stat.tackles}</TableCell>
                        <TableCell className="text-center font-bold">
                          {stat.goals > 0 ? stat.goals : ''}
                        </TableCell>
                        <TableCell className="text-center">
                          {stat.behinds > 0 ? stat.behinds : ''}
                        </TableCell>
                        <TableCell className="text-center">{stat.contestedPossessions}</TableCell>
                        <TableCell className="text-center">{stat.clearances}</TableCell>
                        <TableCell className="text-center">
                          {stat.hitouts > 0 ? stat.hitouts : ''}
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
  )
}
