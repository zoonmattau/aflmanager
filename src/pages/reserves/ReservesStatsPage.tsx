import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useReservesContext } from '@/hooks/useReservesContext'
import { getPositionBadgeClass } from '@/lib/positionColor'
import { cn } from '@/lib/utils'

type SortKey = 'name' | 'pos' | 'age' | 'gp' | 'disp' | 'goals' | 'marks' | 'tackles' | 'hitouts' | 'rating' | 'fantasy'
type SortDir = 'asc' | 'desc'

export function ReservesStatsPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const reserves = useGameStore((s) => s.reserves)

  const { leagueShort } = useReservesContext()
  const [sortKey, setSortKey] = useState<SortKey>('disp')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const rows = useMemo(() => {
    return Object.entries(reserves.seasonStatsByPlayer)
      .map(([playerId, stats]) => {
        const player = players[playerId]
        if (!player || player.clubId !== playerClubId) return null
        const gp = stats.gamesPlayed
        const avgDisp = gp ? +(stats.disposals / gp).toFixed(1) : 0
        const avgGoals = gp ? +(stats.goals / gp).toFixed(1) : 0
        const avgMarks = gp ? +(stats.marks / gp).toFixed(1) : 0
        const avgTackles = gp ? +(stats.tackles / gp).toFixed(1) : 0
        const avgHitouts = gp ? +(stats.hitouts / gp).toFixed(1) : 0
        const avgRating = gp
          ? +(reserves.lastRoundPerformances
              .filter((p) => p.playerId === playerId)
              .reduce((sum, p) => sum + p.rating, 0) / gp
            ).toFixed(1)
          : 0
        const avgFantasy = gp ? +(stats.aflFantasyPoints / gp).toFixed(1) : 0
        return {
          player,
          stats,
          gp,
          avgDisp,
          avgGoals,
          avgMarks,
          avgTackles,
          avgHitouts,
          avgRating,
          avgFantasy,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [reserves.seasonStatsByPlayer, reserves.lastRoundPerformances, players, playerClubId])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let va: number | string
      let vb: number | string
      switch (sortKey) {
        case 'name': va = `${a.player.lastName}${a.player.firstName}`; vb = `${b.player.lastName}${b.player.firstName}`; break
        case 'pos': va = a.player.position.primary; vb = b.player.position.primary; break
        case 'age': va = a.player.age; vb = b.player.age; break
        case 'gp': va = a.gp; vb = b.gp; break
        case 'disp': va = a.avgDisp; vb = b.avgDisp; break
        case 'goals': va = a.avgGoals; vb = b.avgGoals; break
        case 'marks': va = a.avgMarks; vb = b.avgMarks; break
        case 'tackles': va = a.avgTackles; vb = b.avgTackles; break
        case 'hitouts': va = a.avgHitouts; vb = b.avgHitouts; break
        case 'rating': va = a.avgRating; vb = b.avgRating; break
        case 'fantasy': va = a.avgFantasy; vb = b.avgFantasy; break
        default: va = 0; vb = 0
      }
      if (va === vb) return 0
      const cmp = va > vb ? 1 : -1
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [rows, sortKey, sortDir])

  // Last round box score
  const lastRound = useMemo(() => {
    return reserves.lastRoundPerformances
      .filter((p) => {
        const pl = players[p.playerId]
        return pl?.clubId === playerClubId
      })
      .sort((a, b) => b.rating - a.rating)
  }, [reserves.lastRoundPerformances, players, playerClubId])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />
    return sortDir === 'desc'
      ? <ArrowDown className="inline h-3 w-3 ml-1" />
      : <ArrowUp className="inline h-3 w-3 ml-1" />
  }

  const headers: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Player' },
    { key: 'pos', label: 'Pos' },
    { key: 'age', label: 'Age' },
    { key: 'gp', label: 'GP' },
    { key: 'disp', label: 'Avg Disp' },
    { key: 'goals', label: 'Avg Goals' },
    { key: 'marks', label: 'Avg Marks' },
    { key: 'tackles', label: 'Avg Tackles' },
    { key: 'hitouts', label: 'Avg HO' },
    { key: 'rating', label: 'Avg Rtg' },
    { key: 'fantasy', label: 'Avg Fantasy' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{leagueShort} Season Stats</h1>
        <p className="text-sm text-muted-foreground">
          Season averages and totals for your players in {leagueShort} this year.
        </p>
      </div>

      {/* Season averages table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{leagueShort} Season Averages</CardTitle>
          <CardDescription className="text-xs">
            {sorted.length} players with recorded {leagueShort} appearances. Click headers to sort.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {sorted.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">
              No {leagueShort} stats recorded yet this season.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((h) => (
                    <TableHead
                      key={h.key}
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort(h.key)}
                    >
                      {h.label}
                      <SortIcon col={h.key} />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(({ player, gp, avgDisp, avgGoals, avgMarks, avgTackles, avgHitouts, avgRating, avgFantasy }) => (
                  <TableRow key={player.id}>
                    <TableCell>
                      <button
                        className="font-medium hover:underline hover:text-primary text-left"
                        onClick={() => navigate(`/player/${player.id}`)}
                      >
                        {player.firstName} {player.lastName}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getPositionBadgeClass(player.position.primary)}>
                        {player.position.primary}
                      </Badge>
                    </TableCell>
                    <TableCell>{player.age}</TableCell>
                    <TableCell className="tabular-nums font-medium">{gp}</TableCell>
                    <TableCell className="tabular-nums">{avgDisp}</TableCell>
                    <TableCell className="tabular-nums">{avgGoals}</TableCell>
                    <TableCell className="tabular-nums">{avgMarks}</TableCell>
                    <TableCell className="tabular-nums">{avgTackles}</TableCell>
                    <TableCell className="tabular-nums">{avgHitouts}</TableCell>
                    <TableCell>
                      <Badge variant={avgRating >= 75 ? 'default' : avgRating >= 55 ? 'secondary' : 'outline'}>
                        {avgRating}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{avgFantasy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Last round box score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Last Round Box Score</CardTitle>
          <CardDescription className="text-xs">
            Individual performances from the most recent {leagueShort} match.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {lastRound.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              No performances recorded from the last round.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Pos</TableHead>
                  <TableHead>Disp</TableHead>
                  <TableHead>Goals</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Tackles</TableHead>
                  <TableHead>HO</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Fantasy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lastRound.map((perf) => {
                  const p = players[perf.playerId]
                  if (!p) return null
                  return (
                    <TableRow key={perf.playerId}>
                      <TableCell>
                        <button
                          className="font-medium hover:underline hover:text-primary text-left"
                          onClick={() => navigate(`/player/${p.id}`)}
                        >
                          {p.firstName} {p.lastName}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getPositionBadgeClass(p.position.primary)}>
                          {p.position.primary}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{perf.disposals}</TableCell>
                      <TableCell className="tabular-nums">{perf.goals}</TableCell>
                      <TableCell className="tabular-nums">{perf.marks}</TableCell>
                      <TableCell className="tabular-nums">{perf.tackles}</TableCell>
                      <TableCell className="tabular-nums">{perf.hitouts}</TableCell>
                      <TableCell>
                        <Badge
                          variant={perf.rating >= 75 ? 'default' : perf.rating >= 55 ? 'secondary' : 'outline'}
                          className={cn(perf.rating >= 85 && 'bg-amber-500 hover:bg-amber-500 text-white border-0')}
                        >
                          {perf.rating}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{perf.aflFantasyPoints}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
