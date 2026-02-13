import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toLocaleString('en-AU')}`
}

export function LeaguePage() {
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const ladder = useGameStore((s) => s.ladder)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentYear = useGameStore((s) => s.currentYear)
  const navigate = useNavigate()

  const clubData = useMemo(() => {
    return Object.values(clubs).map((club) => {
      const clubPlayers = Object.values(players).filter((p) => p.clubId === club.id)
      const avgAge =
        clubPlayers.length > 0
          ? clubPlayers.reduce((sum, p) => sum + p.age, 0) / clubPlayers.length
          : 0
      const totalSalary = clubPlayers.reduce((sum, p) => sum + p.contract.aav, 0)
      const capUsage =
        club.finances.salaryCap > 0
          ? (totalSalary / club.finances.salaryCap) * 100
          : 0
      const ladderIdx = ladder.findIndex((e) => e.clubId === club.id)
      const ladderEntry = ladderIdx >= 0 ? ladder[ladderIdx] : null
      const position = ladderIdx >= 0 ? ladderIdx + 1 : null

      return {
        club,
        squadSize: clubPlayers.length,
        avgAge,
        totalSalary,
        capUsage,
        ladderEntry,
        position,
      }
    }).sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
  }, [clubs, players, ladder])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{currentYear} AFL Clubs</h1>
        <p className="text-sm text-muted-foreground">
          Browse all {clubData.length} clubs in the league
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {clubData.map(({ club, squadSize, avgAge, capUsage, ladderEntry, position }) => {
          const isPlayer = club.id === playerClubId
          return (
            <Card
              key={club.id}
              className={`cursor-pointer transition-colors hover:bg-accent/50 ${isPlayer ? 'ring-2 ring-primary' : ''}`}
              onClick={() => navigate(`/club/${club.id}`)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="h-10 w-10 rounded-full flex-shrink-0 border"
                    style={{
                      background: `linear-gradient(135deg, ${club.colors.primary} 50%, ${club.colors.secondary} 50%)`,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{club.name}</p>
                      {isPlayer && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          You
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{club.fullName}</p>
                  </div>
                  {position != null && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-2xl font-bold tabular-nums">{position}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Pos</p>
                    </div>
                  )}
                </div>

                {ladderEntry && (
                  <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
                    <div>
                      <p className="font-bold tabular-nums">{ladderEntry.wins}</p>
                      <p className="text-muted-foreground">W</p>
                    </div>
                    <div>
                      <p className="font-bold tabular-nums">{ladderEntry.losses}</p>
                      <p className="text-muted-foreground">L</p>
                    </div>
                    <div>
                      <p className="font-bold tabular-nums">{ladderEntry.draws}</p>
                      <p className="text-muted-foreground">D</p>
                    </div>
                    <div>
                      <p className="font-bold tabular-nums">{ladderEntry.percentage.toFixed(1)}</p>
                      <p className="text-muted-foreground">%</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-xs border-t pt-2">
                  <div>
                    <p className="text-muted-foreground">Squad</p>
                    <p className="font-medium tabular-nums">{squadSize}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg Age</p>
                    <p className="font-medium tabular-nums">{avgAge.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cap %</p>
                    <p className={`font-medium tabular-nums ${capUsage > 100 ? 'text-red-500' : capUsage > 85 ? 'text-yellow-500' : ''}`}>
                      {capUsage.toFixed(0)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
