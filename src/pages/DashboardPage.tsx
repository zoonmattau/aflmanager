import { useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import {
  Users, Swords, Trophy, TrendingUp,
  Play, FastForward, ChevronRight,
} from 'lucide-react'
import type { Match } from '@/types/match'

export function DashboardPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const ladder = useGameStore((s) => s.ladder)
  const currentRound = useGameStore((s) => s.currentRound)
  const season = useGameStore((s) => s.season)
  const phase = useGameStore((s) => s.phase)
  const simCurrentRound = useGameStore((s) => s.simCurrentRound)
  const simToEnd = useGameStore((s) => s.simToEnd)
  const simFinalsRound = useGameStore((s) => s.simFinalsRound)

  const [lastResult, setLastResult] = useState<Match | null>(null)
  const [simming, setSimming] = useState(false)
  const [premierMsg, setPremierMsg] = useState<string | null>(null)

  const club = clubs[playerClubId]
  const clubPlayers = Object.values(players).filter((p) => p.clubId === playerClubId)
  const ladderEntry = ladder.find((e) => e.clubId === playerClubId)
  const ladderPosition = ladder.findIndex((e) => e.clubId === playerClubId) + 1

  // Find next match
  const nextRound = phase === 'finals'
    ? null
    : season?.rounds?.[currentRound]
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

  const handleSimWeek = () => {
    setSimming(true)
    setLastResult(null)
    setPremierMsg(null)

    if (phase === 'regular-season') {
      const { userMatch } = simCurrentRound()
      setLastResult(userMatch)
    } else if (phase === 'finals') {
      const { userMatch, seasonOver } = simFinalsRound()
      setLastResult(userMatch)
      if (seasonOver) {
        const news = useGameStore.getState().newsLog
        const premNews = news.find((n) => n.headline.includes('Premiership'))
        if (premNews) setPremierMsg(premNews.headline)
      }
    }

    setSimming(false)
  }

  const handleSimToEnd = () => {
    setSimming(true)
    setLastResult(null)
    simToEnd()
    setSimming(false)
  }

  const seasonComplete = phase === 'post-season'

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

      {/* Premier message */}
      {premierMsg && (
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardContent className="py-4 text-center">
            <Trophy className="mx-auto h-8 w-8 text-yellow-500 mb-2" />
            <p className="text-lg font-bold">{premierMsg}</p>
          </CardContent>
        </Card>
      )}

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
            {opponent && phase === 'regular-season' ? (
              <>
                <div className="text-2xl font-bold">
                  {isHome ? 'vs' : '@'} {opponent.abbreviation}
                </div>
                <p className="text-xs text-muted-foreground">
                  Round {currentRound + 1} &middot; {nextFixture?.venue}
                </p>
              </>
            ) : phase === 'finals' ? (
              <>
                <div className="text-2xl font-bold">Finals</div>
                <p className="text-xs text-muted-foreground">
                  {ladderPosition <= 8 ? 'In finals contention' : 'Season over'}
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">
                  {seasonComplete ? 'Season complete' : phase === 'regular-season' ? 'Bye round' : 'Off-season'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Advance Controls */}
      {!seasonComplete && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-semibold">
                {phase === 'regular-season'
                  ? `Round ${currentRound + 1} of ${season.rounds.length}`
                  : phase === 'finals'
                    ? `Finals Series - Week ${season.finalsRounds.length + 1}`
                    : 'Off-Season'}
              </p>
              <p className="text-sm text-muted-foreground">
                {phase === 'regular-season'
                  ? `${season.rounds.length - currentRound} rounds remaining`
                  : 'May the best team win'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSimWeek} disabled={simming}>
                <Play className="mr-1 h-4 w-4" />
                {phase === 'finals' ? 'Sim Finals Week' : 'Sim Week'}
              </Button>
              {phase === 'regular-season' && (
                <Button variant="outline" onClick={handleSimToEnd} disabled={simming}>
                  <FastForward className="mr-1 h-4 w-4" />
                  Sim to Finals
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last Match Result */}
      {lastResult?.result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Your Last Result</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center gap-2">
                <div
                  className="h-8 w-8 rounded-full"
                  style={{ backgroundColor: clubs[lastResult.homeClubId]?.colors.primary }}
                />
                <span className="font-bold">{clubs[lastResult.homeClubId]?.abbreviation}</span>
              </div>
              <div className="text-center">
                <span className="text-xl font-bold font-mono">
                  {lastResult.result.homeTotalScore} - {lastResult.result.awayTotalScore}
                </span>
                <div className="text-xs text-muted-foreground font-mono">
                  {lastResult.result.homeScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{clubs[lastResult.awayClubId]?.abbreviation}</span>
                <div
                  className="h-8 w-8 rounded-full"
                  style={{ backgroundColor: clubs[lastResult.awayClubId]?.colors.primary }}
                />
              </div>
            </div>
            <div className="mt-2 text-center">
              <Button variant="link" size="sm" onClick={() => navigate('/match')}>
                View Full Stats <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate('/squad')}>View Squad</Button>
        <Button variant="outline" onClick={() => navigate('/lineup')}>Set Lineup</Button>
        <Button variant="outline" onClick={() => navigate('/gameplan')}>Gameplan</Button>
        <Button variant="outline" onClick={() => navigate('/match')}>Match Centre</Button>
        <Button variant="outline" onClick={() => navigate('/ladder')}>Ladder</Button>
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
