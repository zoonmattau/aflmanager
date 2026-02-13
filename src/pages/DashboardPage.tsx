import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { Users, Swords, Trophy, TrendingUp } from 'lucide-react'

export function DashboardPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const ladder = useGameStore((s) => s.ladder)
  const currentRound = useGameStore((s) => s.currentRound)
  const season = useGameStore((s) => s.season)
  const phase = useGameStore((s) => s.phase)

  const club = clubs[playerClubId]
  const clubPlayers = Object.values(players).filter((p) => p.clubId === playerClubId)
  const ladderEntry = ladder.find((e) => e.clubId === playerClubId)
  const ladderPosition = ladder.findIndex((e) => e.clubId === playerClubId) + 1

  // Find next match
  const nextRound = season?.rounds?.[currentRound]
  const nextFixture = nextRound?.fixtures?.find(
    (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId
  )
  const opponentId = nextFixture
    ? nextFixture.homeClubId === playerClubId
      ? nextFixture.awayClubId
      : nextFixture.homeClubId
    : null
  const opponent = opponentId ? clubs[opponentId] : null
  const isHome = nextFixture?.homeClubId === playerClubId

  return (
    <div className="space-y-6">
      {/* Club Header */}
      <div className="flex items-center gap-4">
        <div
          className="h-12 w-12 rounded-full"
          style={{ backgroundColor: club?.colors.primary ?? '#666' }}
        />
        <div>
          <h1 className="text-2xl font-bold">{club?.fullName}</h1>
          <p className="text-muted-foreground">
            {club?.homeGround} &middot; List Manager Dashboard
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Squad Size</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clubPlayers.length}</div>
            <p className="text-xs text-muted-foreground">
              {clubPlayers.filter((p) => !p.isRookie).length} senior,{' '}
              {clubPlayers.filter((p) => p.isRookie).length} rookie
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ladder Position</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ladderPosition > 0 ? `${ladderPosition}${ordinal(ladderPosition)}` : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {ladderEntry
                ? `${ladderEntry.wins}W ${ladderEntry.losses}L ${ladderEntry.draws}D`
                : 'Season not started'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Percentage</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ladderEntry ? `${ladderEntry.percentage.toFixed(1)}%` : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {ladderEntry
                ? `${ladderEntry.pointsFor} for, ${ladderEntry.pointsAgainst} against`
                : 'No matches played'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Match</CardTitle>
            <Swords className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {opponent ? (
              <>
                <div className="text-2xl font-bold">
                  {isHome ? 'vs' : '@'} {opponent.abbreviation}
                </div>
                <p className="text-xs text-muted-foreground">
                  Round {currentRound + 1} &middot; {nextFixture?.venue}
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">
                  {phase === 'regular-season' ? 'Bye round' : 'Off-season'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={() => navigate('/squad')}>View Squad</Button>
        {phase === 'regular-season' && nextFixture && (
          <Button variant="secondary" onClick={() => navigate('/match')}>
            Play Match
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate('/ladder')}>
          View Ladder
        </Button>
      </div>

      {/* Ladder Preview */}
      {ladder.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ladder</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {ladder.slice(0, 8).map((entry, i) => {
                const ladderClub = clubs[entry.clubId]
                const isPlayer = entry.clubId === playerClubId
                return (
                  <div
                    key={entry.clubId}
                    className={`flex items-center justify-between rounded px-3 py-1.5 text-sm ${
                      isPlayer ? 'bg-accent font-semibold' : ''
                    } ${i === 7 ? 'border-b-2 border-dashed border-muted-foreground/30' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-right text-muted-foreground">{i + 1}</span>
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: ladderClub?.colors.primary }}
                      />
                      <span>{ladderClub?.abbreviation}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{entry.wins}-{entry.losses}-{entry.draws}</span>
                      <span className="w-12 text-right">{entry.percentage.toFixed(1)}%</span>
                      <Badge variant="secondary" className="w-8 justify-center">
                        {entry.points}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}
