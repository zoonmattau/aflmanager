import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen } from 'lucide-react'
import {
  buildSquadStorylines,
  ARC_META,
  type PlayerStoryArc,
} from '@/engine/player/storyArc'
import { canBeSelectedForAfl } from '@/engine/players/contracts'

export function PlayerStorylinesWidget() {
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentDate = useGameStore((s) => s.currentDate)

  const storylines = useMemo<PlayerStoryArc[]>(() => {
    const club = clubs[playerClubId]
    const leadership = club?.leadership
    const leadershipIds = new Set<string>([
      ...(leadership?.captainId ? [leadership.captainId] : []),
      ...(leadership?.viceCaptainId ? [leadership.viceCaptainId] : []),
      ...(leadership?.leadershipGroupIds ?? []),
    ])

    const squadPlayers = Object.values(players).filter(
      (p) => p.clubId === playerClubId && canBeSelectedForAfl(p),
    )

    return buildSquadStorylines(squadPlayers, leadershipIds, currentDate, 5)
  }, [players, clubs, playerClubId, currentDate])

  if (storylines.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Player Storylines</CardTitle>
        <BookOpen className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3 pb-3">
        {storylines.map((s) => {
          const meta = ARC_META[s.arc]
          return (
            <div key={s.playerId} className="space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Link
                  to={`/player/${s.playerId}`}
                  className="text-xs font-semibold hover:underline"
                >
                  {s.playerName}
                </Link>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-current/20 ${meta.colour}`}
                >
                  {meta.icon} {meta.shortLabel}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {s.blurb}
              </p>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
