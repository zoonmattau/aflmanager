import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Trophy, TrendingUp, Calendar, BookOpen, Medal, Star } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Match } from '@/types/match'

function getClubFormGuide(clubId: string, matchResults: Match[]): ('W' | 'L' | 'D')[] {
  const played = matchResults
    .filter((m) => m.result && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => b.round - a.round)
    .slice(0, 5)
    .reverse()
  return played.map((m) => {
    const isHome = m.homeClubId === clubId
    const h = m.result!.homeTotalScore
    const a = m.result!.awayTotalScore
    if (h === a) return 'D'
    return isHome ? (h > a ? 'W' : 'L') : (a > h ? 'W' : 'L')
  })
}

function FormDot({ result }: { result: 'W' | 'L' | 'D' }) {
  const cls = result === 'W' ? 'bg-green-500' : result === 'L' ? 'bg-red-500' : 'bg-yellow-500'
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} title={result} />
}

export function WorldHubPage() {
  const navigate = useNavigate()
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const ladder = useGameStore((s) => s.ladder)
  const matchResults = useGameStore((s) => s.matchResults)
  const currentYear = useGameStore((s) => s.currentYear)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const awards = useGameStore((s) => s.awards)

  const goalsLeaders = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.seasonStats.gamesPlayed > 0)
        .sort((a, b) => b.seasonStats.goals - a.seasonStats.goals)
        .slice(0, 5),
    [players],
  )

  const disposalLeaders = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.seasonStats.gamesPlayed > 0)
        .sort((a, b) => b.seasonStats.disposals - a.seasonStats.disposals)
        .slice(0, 5),
    [players],
  )

  const recentResults = useMemo(
    () =>
      [...matchResults]
        .filter((m) => m.result && !m.isFinal)
        .sort((a, b) => b.round - a.round)
        .slice(0, 8),
    [matchResults],
  )

  const latestAwards = awards.find((a) => a.year === currentYear) ?? awards[awards.length - 1]
  const playedCount = matchResults.filter((m) => m.result).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{currentYear} AFL World</h1>
            <p className="text-sm text-muted-foreground">
              {Object.keys(clubs).length} clubs · {playedCount} matches played
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/world/ladder')}>Ladder</Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/world/fixtures')}>Fixtures</Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/world/stats')}>Stats</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Trophy className="h-4 w-4" />
                League Ladder
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/world/ladder')}>
                Full Ladder →
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium w-8">#</th>
                      <th className="px-3 py-2 text-left font-medium">Club</th>
                      <th className="px-2 py-2 text-center font-medium w-8">W</th>
                      <th className="px-2 py-2 text-center font-medium w-8">L</th>
                      <th className="px-2 py-2 text-center font-medium w-8">D</th>
                      <th className="px-2 py-2 text-center font-medium w-12">PTS</th>
                      <th className="px-2 py-2 text-center font-medium w-16">%</th>
                      <th className="px-3 py-2 text-center font-medium">Form</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ladder.map((entry, i) => {
                      const club = clubs[entry.clubId]
                      const form = getClubFormGuide(entry.clubId, matchResults)
                      const isUser = entry.clubId === playerClubId
                      return (
                        <tr
                          key={entry.clubId}
                          className={`cursor-pointer hover:bg-muted/40 transition-colors ${isUser ? 'bg-primary/5 font-medium' : ''}`}
                          onClick={() => navigate(`/club/${entry.clubId}`)}
                        >
                          <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                              />
                              <span className="font-medium">{club?.abbreviation}</span>
                              {isUser && <Badge variant="secondary" className="text-[10px] px-1 py-0">You</Badge>}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{entry.wins}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{entry.losses}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{entry.draws}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums font-bold">{entry.points}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">{entry.percentage.toFixed(1)}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center justify-center gap-0.5">
                              {form.length > 0 ? form.map((r, j) => <FormDot key={j} result={r} />) : (
                                <span className="text-muted-foreground text-[10px]">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {recentResults.length > 0 && (
            <Card>
              <CardHeader className="py-3 flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4" />
                  Recent Results
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/world/fixtures')}>
                  All Fixtures →
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {recentResults.map((m) => {
                    const home = clubs[m.homeClubId]
                    const away = clubs[m.awayClubId]
                    const h = m.result!.homeTotalScore
                    const a = m.result!.awayTotalScore
                    const homeWon = h > a
                    return (
                      <div key={m.id} className="flex items-center px-4 py-2 text-sm gap-3">
                        <span className="text-xs text-muted-foreground w-12 shrink-0">Rd {m.round + 1}</span>
                        <div className="flex flex-1 items-center justify-between gap-2">
                          <span className={`truncate ${homeWon ? 'font-semibold' : 'text-muted-foreground'}`}>
                            {home?.abbreviation ?? m.homeClubId}
                          </span>
                          <div className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums">
                            <span className={homeWon ? '' : 'text-muted-foreground'}>{h}</span>
                            <span className="text-muted-foreground text-xs">–</span>
                            <span className={!homeWon ? '' : 'text-muted-foreground'}>{a}</span>
                          </div>
                          <span className={`truncate text-right ${!homeWon ? 'font-semibold' : 'text-muted-foreground'}`}>
                            {away?.abbreviation ?? m.awayClubId}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-amber-500" />
                Goals Leaders
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/world/stats')}>
                All Stats →
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {goalsLeaders.map((p, i) => {
                  const club = clubs[p.clubId]
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-muted/40 text-sm"
                      onClick={() => navigate(`/player/${p.id}`)}
                    >
                      <span className="w-5 text-muted-foreground text-xs tabular-nums">{i + 1}</span>
                      <div
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                      />
                      <span className="flex-1 truncate">{p.firstName} {p.lastName}</span>
                      <span className="font-mono font-bold tabular-nums">{p.seasonStats.goals}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                Disposal Leaders
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {disposalLeaders.map((p, i) => {
                  const club = clubs[p.clubId]
                  const avg = p.seasonStats.gamesPlayed > 0
                    ? (p.seasonStats.disposals / p.seasonStats.gamesPlayed).toFixed(1)
                    : '—'
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-muted/40 text-sm"
                      onClick={() => navigate(`/player/${p.id}`)}
                    >
                      <span className="w-5 text-muted-foreground text-xs tabular-nums">{i + 1}</span>
                      <div
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                      />
                      <span className="flex-1 truncate">{p.firstName} {p.lastName}</span>
                      <span className="font-mono text-xs text-muted-foreground">{avg}/g</span>
                      <span className="font-mono font-bold tabular-nums">{p.seasonStats.disposals}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpen className="h-4 w-4" />
                Quick Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-3 pt-0">
              {[
                { label: 'Club Directory', path: '/league' },
                { label: 'Awards Night', path: '/awards-night' },
                { label: 'AA Selection Night', path: '/all-australian-night' },
                { label: 'Awards History', path: '/awards-history' },
                { label: 'Records Book', path: '/records' },
                { label: 'League History', path: '/history' },
                { label: 'State Leagues', path: '/state-leagues' },
              ].map(({ label, path }) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted/50 text-left transition-colors"
                >
                  <span>{label}</span>
                  <span className="text-muted-foreground text-xs">→</span>
                </button>
              ))}
            </CardContent>
          </Card>

          {latestAwards && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Medal className="h-4 w-4 text-yellow-500" />
                  {latestAwards.year} Awards
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm p-4 pt-0">
                {latestAwards.brownlowMedal && (() => {
                  const p = players[latestAwards.brownlowMedal!.playerId]
                  return (
                    <div
                      className="flex justify-between cursor-pointer hover:text-foreground text-muted-foreground"
                      onClick={() => p && navigate(`/player/${p.id}`)}
                    >
                      <span>Brownlow</span>
                      <span className="font-medium text-foreground truncate ml-2">
                        {p ? `${p.firstName} ${p.lastName}` : '—'}
                      </span>
                    </div>
                  )
                })()}
                {latestAwards.colemanMedal && (() => {
                  const p = players[latestAwards.colemanMedal!.playerId]
                  return (
                    <div
                      className="flex justify-between cursor-pointer hover:text-foreground text-muted-foreground"
                      onClick={() => p && navigate(`/player/${p.id}`)}
                    >
                      <span>Coleman</span>
                      <span className="font-medium text-foreground truncate ml-2">
                        {p ? `${p.firstName} ${p.lastName}` : '—'}
                      </span>
                    </div>
                  )
                })()}
                {latestAwards.risingStar && (() => {
                  const p = players[latestAwards.risingStar!.playerId]
                  return (
                    <div
                      className="flex justify-between cursor-pointer hover:text-foreground text-muted-foreground"
                      onClick={() => p && navigate(`/player/${p.id}`)}
                    >
                      <span>Rising Star</span>
                      <span className="font-medium text-foreground truncate ml-2">
                        {p ? `${p.firstName} ${p.lastName}` : '—'}
                      </span>
                    </div>
                  )
                })()}
                <button
                  className="mt-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => navigate('/awards-history')}
                >
                  View all awards →
                </button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
