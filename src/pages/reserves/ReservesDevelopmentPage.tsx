import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
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
import { getReservesStaffImpact } from '@/engine/staff/staffEngine'
import { getPositionBadgeClass } from '@/lib/positionColor'
import { getPlayerStarRating } from '@/engine/player/playerRating'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { cn } from '@/lib/utils'

type SortKey = 'name' | 'age' | 'pos' | 'form' | 'fit' | 'gp' | 'avgDisp' | 'avgRating'
type SortDir = 'asc' | 'desc'
type AgeFilter = 'all' | 'u21' | 'u23' | 'u25'

const AGE_LABELS: Record<AgeFilter, string> = {
  all: 'All ages',
  u21: 'Under 21',
  u23: 'Under 23',
  u25: 'Under 25',
}

export function ReservesDevelopmentPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const reserves = useGameStore((s) => s.reserves)
  const staff = useGameStore((s) => s.staff)

  const { leagueShort } = useReservesContext()
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('u25')
  const [sortKey, setSortKey] = useState<SortKey>('avgRating')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const clubStaff = useMemo(
    () => Object.values(staff).filter((m) => m.clubId === playerClubId),
    [staff, playerClubId],
  )
  const reservesImpact = useMemo(
    () => getReservesStaffImpact(clubStaff, playerClubId),
    [clubStaff, playerClubId],
  )

  // All club players with their reserves stats
  const rows = useMemo(() => {
    const clubPlayers = Object.values(players).filter((p) => p.clubId === playerClubId)
    return clubPlayers.map((player) => {
      const stats = reserves.seasonStatsByPlayer[player.id]
      const gp = stats?.gamesPlayed ?? 0
      const avgDisp = gp && stats ? +(stats.disposals / gp).toFixed(1) : 0
      const lastPerf = reserves.lastRoundPerformances.find((p) => p.playerId === player.id)
      const avgRating = gp && stats
        ? +(reserves.lastRoundPerformances
            .filter((p) => p.playerId === player.id)
            .reduce((s, p) => s + p.rating, 0) / gp
          ).toFixed(1)
        : 0
      const attrs = Object.values(player.attributes).filter((v): v is number => typeof v === 'number')
      const attrMean = attrs.length > 0 ? Math.round(attrs.reduce((s, v) => s + v, 0) / attrs.length) : 0
      const potentialGap = Math.max(0, Math.round(player.hiddenAttributes.potentialCeiling - attrMean))
      const isPromoCandidate = reserves.promotionWatchlist.includes(player.id)
      return {
        player,
        gp,
        avgDisp,
        avgRating,
        attrMean,
        potentialGap,
        lastPerf,
        isPromoCandidate,
      }
    })
  }, [players, playerClubId, reserves])

  const filtered = useMemo(() => {
    const maxAge =
      ageFilter === 'u21' ? 20 : ageFilter === 'u23' ? 22 : ageFilter === 'u25' ? 24 : Infinity
    return rows.filter((r) => r.player.age <= maxAge)
  }, [rows, ageFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: number | string
      let vb: number | string
      switch (sortKey) {
        case 'name': va = `${a.player.lastName}${a.player.firstName}`; vb = `${b.player.lastName}${b.player.firstName}`; break
        case 'age': va = a.player.age; vb = b.player.age; break
        case 'pos': va = a.player.position.primary; vb = b.player.position.primary; break
        case 'form': va = a.player.form; vb = b.player.form; break
        case 'fit': va = a.player.fitness; vb = b.player.fitness; break
        case 'gp': va = a.gp; vb = b.gp; break
        case 'avgDisp': va = a.avgDisp; vb = b.avgDisp; break
        case 'avgRating': va = a.avgRating; vb = b.avgRating; break
        default: va = 0; vb = 0
      }
      if (va === vb) return 0
      const cmp = va > vb ? 1 : -1
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [filtered, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />
    return sortDir === 'desc'
      ? <ArrowDown className="inline h-3 w-3 ml-1" />
      : <ArrowUp className="inline h-3 w-3 ml-1" />
  }

  const promoCount = rows.filter((r) => r.isPromoCandidate).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{leagueShort} Development</h1>
        <p className="text-sm text-muted-foreground">
          Track youth player progression, potential, and readiness for AFL promotion.
        </p>
      </div>

      {/* Staff impact summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Dev. Chance Multiplier</p>
            <p className="text-xl font-bold tabular-nums">
              ×{reservesImpact.developmentChanceMultiplier.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Extra Upgrade Chance</p>
            <p className="text-xl font-bold tabular-nums">
              +{(reservesImpact.developmentExtraUpgradeChance * 100).toFixed(0)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Youth Selection Bias</p>
            <p className="text-xl font-bold tabular-nums">
              +{reservesImpact.selectionYouthBias.toFixed(1)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Promotion Candidates</p>
            <p className="text-xl font-bold tabular-nums">{promoCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Age filter</Label>
          <Select value={ageFilter} onValueChange={(v) => setAgeFilter(v as AgeFilter)}>
            <SelectTrigger className="h-8 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(AGE_LABELS) as AgeFilter[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {AGE_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground">{sorted.length} players shown</span>
      </div>

      {/* Development table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Youth Development Tracker</CardTitle>
          <CardDescription className="text-xs">
            {leagueShort} performance, attribute mean, and growth potential.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {sorted.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">
              No players match the current filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    { key: 'name' as SortKey, label: 'Player' },
                    { key: 'pos' as SortKey, label: 'Pos' },
                    { key: 'age' as SortKey, label: 'Age' },
                    { key: 'form' as SortKey, label: 'Form' },
                    { key: 'fit' as SortKey, label: 'Fit' },
                    { key: 'gp' as SortKey, label: `${leagueShort} GP` },
                    { key: 'avgDisp' as SortKey, label: 'Avg Disp' },
                    { key: 'avgRating' as SortKey, label: 'Avg Rtg' },
                  ].map((h) => (
                    <TableHead
                      key={h.key}
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort(h.key)}
                    >
                      {h.label}
                      <SortIcon col={h.key} />
                    </TableHead>
                  ))}
                  <TableHead>Attr Mean</TableHead>
                  <TableHead>Pot. Gap</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(({ player, gp, avgDisp, avgRating, attrMean, potentialGap, isPromoCandidate }) => (
                  <TableRow
                    key={player.id}
                    className={cn(isPromoCandidate && 'bg-amber-50 dark:bg-amber-950/20')}
                  >
                    <TableCell>
                      <div>
                        <button
                          className="font-medium hover:underline hover:text-primary text-left"
                          onClick={() => navigate(`/player/${player.id}`)}
                        >
                          {player.firstName} {player.lastName}
                        </button>
                        <PlayerStarRating
                          stars={getPlayerStarRating(player)}
                          player={player}
                          className="scale-[0.75] origin-left"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getPositionBadgeClass(player.position.primary)}>
                        {player.position.primary}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{player.age}</TableCell>
                    <TableCell className="tabular-nums">{player.form}</TableCell>
                    <TableCell className="tabular-nums">{player.fitness}</TableCell>
                    <TableCell className="tabular-nums">{gp}</TableCell>
                    <TableCell className="tabular-nums">{avgDisp}</TableCell>
                    <TableCell>
                      {avgRating > 0 ? (
                        <Badge
                          variant={avgRating >= 70 ? 'default' : avgRating >= 50 ? 'secondary' : 'outline'}
                        >
                          {avgRating}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">–</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{attrMean}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'text-xs tabular-nums',
                          potentialGap >= 15 ? 'text-green-600 font-medium' : 'text-muted-foreground',
                        )}
                      >
                        +{potentialGap}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isPromoCandidate ? (
                        <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-0 text-[10px] px-1.5">
                          Promote
                        </Badge>
                      ) : player.listStatus === 'reserves' ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5">Reserves</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5">Senior</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Promotion watchlist highlight */}
      {reserves.promotionWatchlist.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Flagged for Promotion</CardTitle>
            <CardDescription className="text-xs">
              Players who stood out in recent {leagueShort} games.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {reserves.promotionWatchlist.map((id) => {
              const p = players[id]
              return p ? (
                <button
                  key={id}
                  onClick={() => navigate(`/player/${p.id}`)}
                  className="rounded border px-2 py-1 text-xs hover:bg-muted text-left"
                >
                  <span className="font-medium">{p.firstName} {p.lastName}</span>
                  <span className="text-muted-foreground ml-1">{p.position.primary} · age {p.age}</span>
                </button>
              ) : null
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
