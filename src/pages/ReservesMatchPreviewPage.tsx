import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FootballField } from '@/components/lineup/FootballField'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { getPlayerStarRating } from '@/engine/player/playerRating'
import { buildUserStateLeagueContext, getUserReservesEligiblePool, projectReservesLineup } from '@/engine/stateLeague/reservesManagement'

export function ReservesMatchPreviewPage() {
  const navigate = useNavigate()
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const stateLeagues = useGameStore((s) => s.stateLeagues)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentRound = useGameStore((s) => s.currentRound)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const reserves = useGameStore((s) => s.reserves)
  const settings = useGameStore((s) => s.settings)

  const context = useMemo(
    () => buildUserStateLeagueContext({ stateLeagues, playerClubId, currentRound, settings }),
    [stateLeagues, playerClubId, currentRound, settings],
  )
  const eligible = useMemo(
    () => getUserReservesEligiblePool({ players, playerClubId, selectedLineup }),
    [players, playerClubId, selectedLineup],
  )
  const projected = useMemo(
    () => projectReservesLineup(eligible, reserves, settings.matchRules.interchangePlayers),
    [eligible, reserves, settings.matchRules.interchangePlayers],
  )
  const projectedPlayers = useMemo(
    () => projected.selectedIds.map((id) => players[id]).filter(Boolean),
    [projected.selectedIds, players],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reserves Match Preview</h1>
          <p className="text-sm text-muted-foreground">Projected state-league team selection and matchup context.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/reserves')}>
          Back to Reserves
        </Button>
      </div>

      {!context ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No state-league affiliation available for your club.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Round {context.roundNumber}: {context.club.name} vs {context.opponent?.name ?? 'TBC'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{context.league.name}</Badge>
                <Badge variant="outline">{context.isHome ? 'Home' : 'Away'}</Badge>
                <Badge variant="outline">Projected lineup: {projected.selectedIds.length}/23</Badge>
              </div>
              {context.lastResult && (
                <p className="text-xs text-muted-foreground">
                  Last result: {context.lastResult.wasHome ? 'Home' : 'Away'} {context.lastResult.homeScore}-{context.lastResult.awayScore}
                </p>
              )}
            </CardContent>
          </Card>

          <FootballField
            lineup={projected.lineupMap}
            players={players}
            clubs={clubs}
            userClubId={playerClubId}
            interchangeCount={settings.matchRules.interchangePlayers}
            oppositionClubId={context.opponent?.aflAffiliateId ?? null}
            showOpposition={false}
            onAssign={() => {}}
            onSwap={() => {}}
            onUnassign={() => {}}
          />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Projected Matchups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {projectedPlayers.slice(0, 8).map((player) => (
                <div key={player.id} className="flex items-center justify-between text-sm rounded border px-2 py-1">
                  <div>
                    <span className="font-medium">{player.firstName} {player.lastName}</span>
                    <span className="text-muted-foreground"> · {player.position.primary} · form {player.form}</span>
                  </div>
                  <PlayerStarRating stars={getPlayerStarRating(player)} player={player} />
                </div>
              ))}
              {projectedPlayers.length === 0 && (
                <p className="text-sm text-muted-foreground">No eligible reserves players projected this week.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

