import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useReservesContext } from '@/hooks/useReservesContext'
import { getUserReservesEligiblePool, projectReservesLineup } from '@/engine/stateLeague/reservesManagement'
import { isPlayerSuspended } from '@/engine/players/availability'
import { hasActiveStateLeagueContract, isStateLeagueContracted } from '@/engine/players/contracts'
import { getPlayerStarRating } from '@/engine/player/playerRating'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'

export function ReservesDashboardPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const reserves = useGameStore((s) => s.reserves)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const settings = useGameStore((s) => s.settings)

  const { context, leagueName, leagueShort } = useReservesContext()
  const club = clubs[playerClubId]

  const { seniorPlayers, reservePlayers } = useMemo(() => {
    const all = Object.values(players).filter((p) => p.clubId === playerClubId)
    return {
      seniorPlayers: all.filter((p) => p.listStatus !== 'reserves'),
      reservePlayers: all.filter((p) => p.listStatus === 'reserves'),
    }
  }, [players, playerClubId])

  const allEligible = useMemo(
    () => getUserReservesEligiblePool({ players, playerClubId, selectedLineup }),
    [players, playerClubId, selectedLineup],
  )

  const projected = useMemo(
    () => projectReservesLineup(allEligible, reserves, settings.matchRules.interchangePlayers),
    [allEligible, reserves, settings.matchRules.interchangePlayers],
  )

  const unavailable = useMemo(() => {
    const selectedIds = new Set(
      Object.values(selectedLineup ?? {}).filter((id): id is string => Boolean(id)),
    )
    return [...seniorPlayers, ...reservePlayers]
      .filter((p) => !selectedIds.has(p.id))
      .filter(
        (p) =>
          p.injury ||
          isPlayerSuspended(p) ||
          (isStateLeagueContracted(p) && !hasActiveStateLeagueContract(p)),
      )
  }, [seniorPlayers, reservePlayers, selectedLineup])

  const ladderPosition = useMemo(() => {
    if (!context) return null
    const idx = context.league.ladder.findIndex((e) => e.clubId === context.club.id)
    return idx >= 0 ? idx + 1 : null
  }, [context])

  const recentResults = useMemo(() => {
    if (!context) return []
    const out: Array<{ round: number; won: boolean; score: string }> = []
    for (let r = context.roundNumber - 1; r >= 1 && out.length < 5; r--) {
      const round = context.league.season.rounds.find((rd) => rd.number === r)
      if (!round) continue
      const m = round.results.find(
        (m) => m.homeClubId === context.club.id || m.awayClubId === context.club.id,
      )
      if (!m || (m.homeScore <= 0 && m.awayScore <= 0)) continue
      const isHome = m.homeClubId === context.club.id
      const mine = isHome ? m.homeScore : m.awayScore
      const opp = isHome ? m.awayScore : m.homeScore
      out.push({ round: r, won: mine > opp, score: `${mine}–${opp}` })
    }
    return out
  }, [context])

  const topStatsThisRound = useMemo(
    () =>
      reserves.lastRoundPerformances
        .filter((p) => {
          const pl = players[p.playerId]
          return pl?.clubId === playerClubId
        })
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 5),
    [reserves.lastRoundPerformances, players, playerClubId],
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{club?.fullName} — Reserves</h1>
        <p className="text-sm text-muted-foreground">
          {leagueName} program overview. Manage selection, development, and state-league performance.
        </p>
      </div>

      {/* Quick nav */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Squad', path: '/reserves/squad' },
          { label: 'Lineup', path: '/reserves/lineup' },
          { label: 'Fixtures', path: '/reserves/fixtures' },
          { label: 'Match Preview', path: '/reserves/match-preview' },
          { label: 'Stats', path: '/reserves/stats' },
          { label: 'Development', path: '/reserves/development' },
          { label: 'Staff', path: '/reserves/staff' },
        ].map(({ label, path }) => (
          <Button key={path} size="sm" variant="outline" onClick={() => navigate(path)}>
            {label}
          </Button>
        ))}
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Senior List</p>
            <p className="text-2xl font-bold tabular-nums">{seniorPlayers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Reserves List</p>
            <p className="text-2xl font-bold tabular-nums">{reservePlayers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">{leagueShort} Position</p>
            <p className="text-2xl font-bold tabular-nums">
              {ladderPosition ? `${ladderPosition}` : '–'}
              {ladderPosition && (
                <span className="text-base font-normal text-muted-foreground">
                  {' '}/ {context?.league.ladder.length ?? '–'}
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Projected 23</p>
            <p className="text-2xl font-bold tabular-nums">{projected.selectedIds.length}/23</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Next match */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Next {leagueShort} Match</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!context ? (
              <p className="text-xs text-muted-foreground">No state-league affiliation for your club.</p>
            ) : context.opponent ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-base">
                    {context.isHome ? 'vs' : '@'} {context.opponent.name}
                  </span>
                  <Badge variant="outline">Round {context.roundNumber}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {context.isHome ? 'Home' : 'Away'} · {leagueName}
                </p>
                {context.lastResult && (
                  <p className="text-xs text-muted-foreground">
                    Last result: {context.lastResult.wasHome ? 'Home' : 'Away'}{' '}
                    {context.lastResult.homeScore}–{context.lastResult.awayScore}
                  </p>
                )}
                {recentResults.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {recentResults.map((r) => (
                      <Badge
                        key={r.round}
                        variant={r.won ? 'default' : 'secondary'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        R{r.round} {r.won ? 'W' : 'L'} {r.score}
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No fixture scheduled for Round {context.roundNumber}.
              </p>
            )}
            {context && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => navigate('/reserves/match-preview')}
              >
                Open Match Preview
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Last round top performers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Promotion Watchlist</CardTitle>
            <CardDescription className="text-xs">
              Top performers from last {leagueShort} round
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {topStatsThisRound.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No performances recorded yet this season.
              </p>
            ) : (
              topStatsThisRound.map((perf) => {
                const p = players[perf.playerId]
                if (!p) return null
                return (
                  <div
                    key={perf.playerId}
                    className="flex items-center justify-between text-xs rounded border px-2 py-1"
                  >
                    <div>
                      <span className="font-medium">
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="text-muted-foreground"> · {p.position.primary}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {perf.disposals}d {perf.goals}g
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1">
                        {perf.rating}
                      </Badge>
                      <PlayerStarRating
                        stars={getPlayerStarRating(p)}
                        player={p}
                        className="scale-[0.75] origin-right"
                      />
                    </div>
                  </div>
                )
              })
            )}
            {reserves.promotionWatchlist.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2">
                <span className="text-xs text-muted-foreground w-full">Flagged for promotion:</span>
                {reserves.promotionWatchlist.slice(0, 6).map((id) => {
                  const p = players[id]
                  return p ? (
                    <Badge key={id} variant="secondary" className="text-[10px]">
                      {p.firstName} {p.lastName}
                    </Badge>
                  ) : null
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Availability watch */}
      {unavailable.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Availability Watch</CardTitle>
            <CardDescription className="text-xs">
              Players unavailable for this week's {leagueShort} match.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {unavailable.slice(0, 8).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-xs rounded border px-2 py-1"
              >
                <span>
                  {p.firstName} {p.lastName}
                </span>
                <Badge variant="outline">
                  {p.injury
                    ? `${p.injury.type} (${p.injury.weeksRemaining}w)`
                    : isPlayerSuspended(p)
                      ? `Susp. (${p.suspension?.weeksRemaining ?? 0}w)`
                      : 'Contract expired'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
