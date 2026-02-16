import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { isPlayerSuspended } from '@/engine/players/availability'
import { getPlayerStarRating } from '@/engine/player/playerRating'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'

export function ReservesPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const sendToReserves = useGameStore((s) => s.sendToReserves)
  const recallFromReserves = useGameStore((s) => s.recallFromReserves)
  const reserves = useGameStore((s) => s.reserves)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const setReservesDelegation = useGameStore((s) => s.setReservesDelegation)
  const setManagedReservesLineup = useGameStore((s) => s.setManagedReservesLineup)
  const setReservesTactics = useGameStore((s) => s.setReservesTactics)
  const autoPickManagedReservesLineup = useGameStore((s) => s.autoPickManagedReservesLineup)
  const navigate = useNavigate()

  const club = clubs[playerClubId]

  const { seniorPlayers, reservePlayers } = useMemo(() => {
    const clubPlayers = Object.values(players).filter((p) => p.clubId === playerClubId)
    return {
      seniorPlayers: clubPlayers.filter((p) => p.listStatus !== 'reserves'),
      reservePlayers: clubPlayers.filter((p) => p.listStatus === 'reserves'),
    }
  }, [players, playerClubId])

  const selectedAFLIds = useMemo(
    () => new Set(Object.values(selectedLineup ?? {}).filter((id): id is string => Boolean(id))),
    [selectedLineup],
  )

  const availableForReservesSelection = useMemo(
    () =>
      [...seniorPlayers, ...reservePlayers]
        .filter((p) => !selectedAFLIds.has(p.id) && !p.injury && !isPlayerSuspended(p))
        .sort((a, b) => (b.form + b.fitness) - (a.form + a.fitness)),
    [seniorPlayers, reservePlayers, selectedAFLIds],
  )

  const lastRoundByPlayer = useMemo(() => {
    const map: Record<string, { disposals: number; goals: number; rating: number }> = {}
    for (const perf of reserves.lastRoundPerformances) {
      map[perf.playerId] = {
        disposals: perf.disposals,
        goals: perf.goals,
        rating: perf.rating,
      }
    }
    return map
  }, [reserves.lastRoundPerformances])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{club?.fullName} - Reserves</h1>
        <p className="text-sm text-muted-foreground">
          Manage your reserves list. Send players down or recall them to the senior squad.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reserves Management</CardTitle>
          <CardDescription>
            Manage reserves lineup and tactics manually, or delegate to your reserves coach.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Delegation</Label>
              <p className="text-xs text-muted-foreground">
                {reserves.delegationEnabled
                  ? 'Reserves lineup and tactics are delegated.'
                  : 'Manual control enabled for reserves lineup and tactics.'}
              </p>
            </div>
            <Switch
              checked={reserves.delegationEnabled}
              onCheckedChange={(checked) => setReservesDelegation(checked)}
            />
          </div>

          {!reserves.delegationEnabled && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tempo</Label>
                  <Select
                    value={reserves.tactics.tempo}
                    onValueChange={(v) => setReservesTactics({ tempo: v as 'slow' | 'balanced' | 'fast' })}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slow">Slow</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="fast">Fast</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Aggression</Label>
                  <Select
                    value={reserves.tactics.aggression}
                    onValueChange={(v) => setReservesTactics({ aggression: v as 'low' | 'balanced' | 'high' })}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch
                    checked={reserves.tactics.youthFocus}
                    onCheckedChange={(checked) => setReservesTactics({ youthFocus: checked })}
                  />
                  <Label className="text-xs">Youth Focus</Label>
                </div>
                <Button variant="outline" onClick={autoPickManagedReservesLineup}>
                  Auto-pick 23
                </Button>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Managed Reserves 23</p>
                  <Badge variant="outline">{reserves.managedLineupPlayerIds.length}/23</Badge>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {availableForReservesSelection.slice(0, 18).map((p) => {
                    const selected = reserves.managedLineupPlayerIds.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${
                          selected ? 'border-primary bg-primary/10' : 'border-border'
                        }`}
                        onClick={() => {
                          const next = selected
                            ? reserves.managedLineupPlayerIds.filter((id) => id !== p.id)
                            : [...reserves.managedLineupPlayerIds, p.id]
                          setManagedReservesLineup(next)
                        }}
                      >
                        <span className="truncate">{p.firstName} {p.lastName}</span>
                        <span className="text-muted-foreground">{p.position.primary}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {reserves.promotionWatchlist.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Promotion Watchlist</CardTitle>
            <CardDescription>Strong reserves performers this round</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {reserves.promotionWatchlist.map((playerId) => {
              const p = players[playerId]
              if (!p) return null
              return (
                <Badge key={playerId} variant="secondary">
                  {p.firstName} {p.lastName}
                </Badge>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Reserves List */}
      <Card>
        <CardHeader>
          <CardTitle>Reserves Squad</CardTitle>
          <CardDescription>
            Players currently in the reserves. Recall them when needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Pos</TableHead>
                <TableHead className="text-center">Age</TableHead>
                <TableHead className="text-center">Fit</TableHead>
                <TableHead className="text-center">Form</TableHead>
                <TableHead className="text-center">VFL GP</TableHead>
                <TableHead className="text-center">VFL Avg Disp</TableHead>
                <TableHead className="text-center">Last VFL</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservePlayers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No players in reserves. Send players down from the Senior List below.
                  </TableCell>
                </TableRow>
              ) : (
                reservePlayers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">{p.jerseyNumber}</TableCell>
                    <TableCell>
                      <div>
                        <button
                          className="font-medium hover:underline hover:text-primary cursor-pointer text-left"
                          onClick={() => navigate(`/player/${p.id}`)}
                        >
                          {p.firstName} {p.lastName}
                        </button>
                        <PlayerStarRating stars={getPlayerStarRating(p)} className="scale-[0.8] origin-left" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.position.primary}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{p.age}</TableCell>
                    <TableCell className="text-center">{p.fitness}</TableCell>
                    <TableCell className="text-center">{p.form}</TableCell>
                    <TableCell className="text-center">{reserves.seasonStatsByPlayer[p.id]?.gamesPlayed ?? 0}</TableCell>
                    <TableCell className="text-center">
                      {reserves.seasonStatsByPlayer[p.id]?.gamesPlayed
                        ? Math.round((reserves.seasonStatsByPlayer[p.id]?.disposals ?? 0) / (reserves.seasonStatsByPlayer[p.id]?.gamesPlayed ?? 1))
                        : 0}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {lastRoundByPlayer[p.id]
                        ? `${lastRoundByPlayer[p.id].disposals}d ${lastRoundByPlayer[p.id].goals}g`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => recallFromReserves(p.id)}
                      >
                        <ArrowUp className="h-3 w-3 mr-1" />
                        Recall
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Senior List */}
      <Card>
        <CardHeader>
          <CardTitle>Senior Squad</CardTitle>
          <CardDescription>
            Send players to reserves for development or rotation.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Pos</TableHead>
                <TableHead className="text-center">Age</TableHead>
                <TableHead className="text-center">Fit</TableHead>
                <TableHead className="text-center">Form</TableHead>
                <TableHead className="text-center">Last VFL</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seniorPlayers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{p.jerseyNumber}</TableCell>
                  <TableCell>
                    <div>
                      <button
                        className="font-medium hover:underline hover:text-primary cursor-pointer text-left"
                        onClick={() => navigate(`/player/${p.id}`)}
                      >
                        {p.firstName} {p.lastName}
                      </button>
                      <PlayerStarRating stars={getPlayerStarRating(p)} className="scale-[0.8] origin-left" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.position.primary}</Badge>
                  </TableCell>
                  <TableCell className="text-center">{p.age}</TableCell>
                  <TableCell className="text-center">{p.fitness}</TableCell>
                  <TableCell className="text-center">{p.form}</TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {lastRoundByPlayer[p.id]
                      ? `${lastRoundByPlayer[p.id].disposals}d ${lastRoundByPlayer[p.id].goals}g`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => sendToReserves(p.id)}
                    >
                      <ArrowDown className="h-3 w-3 mr-1" />
                      Send Down
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
