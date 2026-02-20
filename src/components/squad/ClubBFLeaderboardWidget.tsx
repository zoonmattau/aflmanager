import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { getClubBFLeaderboard } from '@/engine/awards/clubBFEngine'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy } from 'lucide-react'

export function ClubBFLeaderboardWidget() {
  const bfTracker = useGameStore((s) => s.bfTracker)
  const players = useGameStore((s) => s.players)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const phase = useGameStore((s) => s.phase)

  const leaderboard = useMemo(
    () => (playerClubId ? getClubBFLeaderboard(bfTracker, playerClubId, 5) : []),
    [bfTracker, playerClubId],
  )

  // Only show during an active season and when there are votes
  if (!playerClubId || phase === 'setup' || leaderboard.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Club B&amp;F Leaders</CardTitle>
        <Trophy className="h-4 w-4 text-amber-500" />
      </CardHeader>
      <CardContent className="space-y-1.5">
        {leaderboard.map((entry, idx) => {
          const p = players[entry.playerId]
          if (!p) return null
          return (
            <div key={entry.playerId} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-4 text-right">{idx + 1}</span>
              <Link
                to={`/player/${entry.playerId}`}
                className="flex-1 text-xs font-medium hover:underline truncate"
              >
                {p.firstName} {p.lastName}
              </Link>
              <span className="text-xs font-mono font-semibold text-amber-600">
                {entry.votes}v
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
