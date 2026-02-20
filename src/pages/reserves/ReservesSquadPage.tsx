import { useMemo, type ReactNode } from 'react'
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
import { useReservesContext } from '@/hooks/useReservesContext'
import { isPlayerSuspended } from '@/engine/players/availability'
import { getPlayerStarRating } from '@/engine/player/playerRating'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { useTableViewManager, type TableViewColumnConfig } from '@/components/table-view/useTableViewManager'
import { TableViewManagerControl } from '@/components/table-view/TableViewManagerControl'
import type { Player } from '@/types/player'
import { getUserReservesEligiblePool, projectReservesLineup } from '@/engine/stateLeague/reservesManagement'
import { getPositionBadgeClass } from '@/lib/positionColor'
import { hasActiveStateLeagueContract, isStateLeagueContracted } from '@/engine/players/contracts'

type RowColumn = {
  id: string
  label: string
  defaultWidth: number
  sortable?: boolean
  sortValue?: (p: Player) => string | number
  render: (p: Player) => ReactNode
}

export function ReservesSquadPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const reserves = useGameStore((s) => s.reserves)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const settings = useGameStore((s) => s.settings)
  const sendToReserves = useGameStore((s) => s.sendToReserves)
  const recallFromReserves = useGameStore((s) => s.recallFromReserves)
  const setReservesPlayerAvailability = useGameStore((s) => s.setReservesPlayerAvailability)
  const setStateLeagueContractDelegation = useGameStore((s) => s.setStateLeagueContractDelegation)
  const setStateLeagueContractTargetCount = useGameStore((s) => s.setStateLeagueContractTargetCount)
  const reSignStateLeagueContract = useGameStore((s) => s.reSignStateLeagueContract)
  const delistStateLeagueContractedPlayer = useGameStore((s) => s.delistStateLeagueContractedPlayer)
  const recruitStateLeagueContractPlayer = useGameStore((s) => s.recruitStateLeagueContractPlayer)
  const signStateLeaguePlayerToAflContract = useGameStore((s) => s.signStateLeaguePlayerToAflContract)

  const { leagueShort } = useReservesContext()

  const { clubPlayers, seniorPlayers, reservePlayers } = useMemo(() => {
    const all = Object.values(players).filter((p) => p.clubId === playerClubId)
    return {
      clubPlayers: all,
      seniorPlayers: all.filter((p) => p.listStatus !== 'reserves'),
      reservePlayers: all.filter((p) => p.listStatus === 'reserves'),
    }
  }, [players, playerClubId])

  const stateLeagueContractPlayers = useMemo(
    () => clubPlayers.filter((p) => isStateLeagueContracted(p)),
    [clubPlayers],
  )
  const inactiveContracts = useMemo(
    () => stateLeagueContractPlayers.filter((p) => !hasActiveStateLeagueContract(p)),
    [stateLeagueContractPlayers],
  )

  const selectedAFLIds = useMemo(
    () => new Set(Object.values(selectedLineup ?? {}).filter((id): id is string => Boolean(id))),
    [selectedLineup],
  )

  const allEligible = useMemo(
    () => getUserReservesEligiblePool({ players, playerClubId, selectedLineup }),
    [players, playerClubId, selectedLineup],
  )

  const projected = useMemo(
    () => projectReservesLineup(allEligible, reserves, settings.matchRules.interchangePlayers),
    [allEligible, reserves, settings.matchRules.interchangePlayers],
  )
  const projectedSet = useMemo(() => new Set(projected.selectedIds), [projected.selectedIds])

  const lastRoundByPlayer = useMemo(() => {
    const map: Record<string, { disposals: number; goals: number; rating: number }> = {}
    for (const perf of reserves.lastRoundPerformances) {
      map[perf.playerId] = { disposals: perf.disposals, goals: perf.goals, rating: perf.rating }
    }
    return map
  }, [reserves.lastRoundPerformances])

  const availableForAssignment = useMemo(
    () =>
      [...seniorPlayers, ...reservePlayers]
        .filter((p) => !isStateLeagueContracted(p) || hasActiveStateLeagueContract(p))
        .filter((p) => !selectedAFLIds.has(p.id) && !p.injury && !isPlayerSuspended(p))
        .sort((a, b) => b.form + b.fitness - (a.form + a.fitness)),
    [reservePlayers, selectedAFLIds, seniorPlayers],
  )

  // ── Table columns ──────────────────────────────────────────────────────────
  const reserveColumns = useMemo<RowColumn[]>(
    () => [
      {
        id: 'jumper',
        label: '#',
        defaultWidth: 44,
        sortable: true,
        sortValue: (p) => p.jerseyNumber,
        render: (p) => p.jerseyNumber,
      },
      {
        id: 'name',
        label: 'Name',
        defaultWidth: 180,
        sortable: true,
        sortValue: (p) => `${p.lastName},${p.firstName}`.toLowerCase(),
        render: (p) => (
          <div>
            <button
              className="font-medium hover:underline hover:text-primary cursor-pointer text-left"
              onClick={() => navigate(`/player/${p.id}`)}
            >
              {p.firstName} {p.lastName}
            </button>
            <PlayerStarRating
              stars={getPlayerStarRating(p)}
              player={p}
              className="scale-[0.8] origin-left"
            />
          </div>
        ),
      },
      {
        id: 'pos',
        label: 'Pos',
        defaultWidth: 70,
        sortable: true,
        sortValue: (p) => p.position.primary,
        render: (p) => (
          <Badge variant="outline" className={getPositionBadgeClass(p.position.primary)}>
            {p.position.primary}
          </Badge>
        ),
      },
      {
        id: 'age',
        label: 'Age',
        defaultWidth: 56,
        sortable: true,
        sortValue: (p) => p.age,
        render: (p) => p.age,
      },
      {
        id: 'fit',
        label: 'Fit',
        defaultWidth: 56,
        sortable: true,
        sortValue: (p) => p.fitness,
        render: (p) => p.fitness,
      },
      {
        id: 'form',
        label: 'Form',
        defaultWidth: 56,
        sortable: true,
        sortValue: (p) => p.form,
        render: (p) => p.form,
      },
      {
        id: 'vflgp',
        label: `${leagueShort} GP`,
        defaultWidth: 72,
        sortable: true,
        sortValue: (p) => reserves.seasonStatsByPlayer[p.id]?.gamesPlayed ?? 0,
        render: (p) => reserves.seasonStatsByPlayer[p.id]?.gamesPlayed ?? 0,
      },
      {
        id: 'vflavg',
        label: `${leagueShort} Avg`,
        defaultWidth: 88,
        sortable: true,
        sortValue: (p) => {
          const gp = reserves.seasonStatsByPlayer[p.id]?.gamesPlayed ?? 0
          return gp ? Math.round((reserves.seasonStatsByPlayer[p.id]?.disposals ?? 0) / gp) : 0
        },
        render: (p) => {
          const gp = reserves.seasonStatsByPlayer[p.id]?.gamesPlayed ?? 0
          return gp
            ? Math.round((reserves.seasonStatsByPlayer[p.id]?.disposals ?? 0) / gp)
            : 0
        },
      },
      {
        id: 'last',
        label: `Last ${leagueShort}`,
        defaultWidth: 90,
        sortable: false,
        render: (p) =>
          lastRoundByPlayer[p.id]
            ? `${lastRoundByPlayer[p.id].disposals}d ${lastRoundByPlayer[p.id].goals}g`
            : '–',
      },
      {
        id: 'action',
        label: 'Action',
        defaultWidth: 92,
        sortable: false,
        render: (p) => (
          <Button size="sm" variant="outline" onClick={() => recallFromReserves(p.id)}>
            <ArrowUp className="h-3 w-3 mr-1" />
            Recall
          </Button>
        ),
      },
    ],
    [navigate, reserves.seasonStatsByPlayer, lastRoundByPlayer, recallFromReserves, leagueShort],
  )

  const seniorColumns = useMemo<RowColumn[]>(
    () => [
      {
        id: 'jumper',
        label: '#',
        defaultWidth: 44,
        sortable: true,
        sortValue: (p) => p.jerseyNumber,
        render: (p) => p.jerseyNumber,
      },
      {
        id: 'name',
        label: 'Name',
        defaultWidth: 180,
        sortable: true,
        sortValue: (p) => `${p.lastName},${p.firstName}`.toLowerCase(),
        render: (p) => (
          <div>
            <button
              className="font-medium hover:underline hover:text-primary cursor-pointer text-left"
              onClick={() => navigate(`/player/${p.id}`)}
            >
              {p.firstName} {p.lastName}
            </button>
            <PlayerStarRating
              stars={getPlayerStarRating(p)}
              player={p}
              className="scale-[0.8] origin-left"
            />
          </div>
        ),
      },
      {
        id: 'pos',
        label: 'Pos',
        defaultWidth: 70,
        sortable: true,
        sortValue: (p) => p.position.primary,
        render: (p) => (
          <Badge variant="outline" className={getPositionBadgeClass(p.position.primary)}>
            {p.position.primary}
          </Badge>
        ),
      },
      {
        id: 'age',
        label: 'Age',
        defaultWidth: 56,
        sortable: true,
        sortValue: (p) => p.age,
        render: (p) => p.age,
      },
      {
        id: 'fit',
        label: 'Fit',
        defaultWidth: 56,
        sortable: true,
        sortValue: (p) => p.fitness,
        render: (p) => p.fitness,
      },
      {
        id: 'form',
        label: 'Form',
        defaultWidth: 56,
        sortable: true,
        sortValue: (p) => p.form,
        render: (p) => p.form,
      },
      {
        id: 'last',
        label: `Last ${leagueShort}`,
        defaultWidth: 90,
        sortable: false,
        render: (p) =>
          lastRoundByPlayer[p.id]
            ? `${lastRoundByPlayer[p.id].disposals}d ${lastRoundByPlayer[p.id].goals}g`
            : '–',
      },
      {
        id: 'action',
        label: 'Action',
        defaultWidth: 108,
        sortable: false,
        render: (p) => (
          <Button size="sm" variant="ghost" onClick={() => sendToReserves(p.id)}>
            <ArrowDown className="h-3 w-3 mr-1" />
            Send Down
          </Button>
        ),
      },
    ],
    [navigate, lastRoundByPlayer, sendToReserves, leagueShort],
  )

  const reserveViewCols = useMemo<TableViewColumnConfig[]>(
    () => reserveColumns.map((c) => ({ id: c.id, label: c.label, defaultWidth: c.defaultWidth, sortable: c.sortable !== false })),
    [reserveColumns],
  )
  const seniorViewCols = useMemo<TableViewColumnConfig[]>(
    () => seniorColumns.map((c) => ({ id: c.id, label: c.label, defaultWidth: c.defaultWidth, sortable: c.sortable !== false })),
    [seniorColumns],
  )
  const reserveView = useTableViewManager({ tableId: 'squad-reserves-list', columns: reserveViewCols, defaultSort: { columnId: 'name', direction: 'asc' } })
  const seniorView = useTableViewManager({ tableId: 'squad-senior-list', columns: seniorViewCols, defaultSort: { columnId: 'name', direction: 'asc' } })

  const buildVisible = (cols: RowColumn[], hiddenIds: string[], order: string[]) => {
    const hidden = new Set(hiddenIds)
    const byId = new Map(cols.map((c) => [c.id, c]))
    return order.filter((id) => !hidden.has(id)).map((id) => byId.get(id)).filter((c): c is RowColumn => Boolean(c))
  }
  const sortRows = (rows: Player[], cols: RowColumn[], sort: { columnId: string; direction: 'asc' | 'desc' } | null) => {
    if (!sort) return rows
    const col = cols.find((c) => c.id === sort.columnId && c.sortable !== false && c.sortValue)
    if (!col?.sortValue) return rows
    const sorted = [...rows].sort((a, b) => {
      const va = col.sortValue!(a)
      const vb = col.sortValue!(b)
      if (va === vb) return 0
      return va > vb ? 1 : -1
    })
    return sort.direction === 'desc' ? sorted.reverse() : sorted
  }

  const visibleReserveCols = buildVisible(reserveColumns, reserveView.snapshot.hiddenColumnIds, reserveView.snapshot.columnOrder)
  const visibleSeniorCols = buildVisible(seniorColumns, seniorView.snapshot.hiddenColumnIds, seniorView.snapshot.columnOrder)
  const sortedReservePlayers = sortRows(reservePlayers, reserveColumns, reserveView.snapshot.sort)
  const sortedSeniorPlayers = sortRows(seniorPlayers, seniorColumns, seniorView.snapshot.sort)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Reserves Squad</h1>
        <p className="text-sm text-muted-foreground">
          Manage player list status, weekly availability, and {leagueShort} contracts.
        </p>
      </div>

      {/* Weekly play/rest assignments */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly {leagueShort} Assignment</CardTitle>
          <CardDescription>
            Set each non-selected player to play in the {leagueShort} or rest this week.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {availableForAssignment.length === 0 ? (
            <p className="text-sm text-muted-foreground">No eligible non-selected players this week.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {availableForAssignment.map((player) => {
                const assignment = reserves.playerAvailabilityAssignments[player.id] ?? 'play'
                const willPlay = projectedSet.has(player.id)
                const isAflListed = player.listStatus !== 'reserves'
                return (
                  <div key={player.id} className="rounded border p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {player.firstName} {player.lastName}
                        </p>
                        <p className="text-muted-foreground">
                          {player.position.primary} · form {player.form} · fit {player.fitness}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {isAflListed && <Badge variant="outline">AFL</Badge>}
                        <Badge variant={willPlay ? 'default' : 'secondary'}>
                          {willPlay ? 'In 23' : 'Out'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={assignment === 'play' ? 'default' : 'outline'}
                        className="h-6 px-2 text-xs"
                        onClick={() => setReservesPlayerAvailability(player.id, 'play')}
                      >
                        Play
                      </Button>
                      <Button
                        size="sm"
                        variant={assignment === 'rest' ? 'destructive' : 'outline'}
                        className="h-6 px-2 text-xs"
                        onClick={() => setReservesPlayerAvailability(player.id, 'rest')}
                      >
                        Rest
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* State-league contracts */}
      <Card>
        <CardHeader>
          <CardTitle>{leagueShort} Contracts</CardTitle>
          <CardDescription>
            Affiliate-contracted reserves players. Re-sign or promote to AFL when ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={reserves.stateLeagueContractDelegationEnabled}
                onCheckedChange={setStateLeagueContractDelegation}
              />
              <Label className="text-xs">Delegate contract decisions to reserves staff</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Target list size</Label>
              <Select
                value={String(reserves.stateLeagueContractTargetCount)}
                onValueChange={(v) => setStateLeagueContractTargetCount(Number(v))}
              >
                <SelectTrigger className="h-8 w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[8, 10, 12, 14, 16, 18, 20].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={() => recruitStateLeagueContractPlayer(1)}>
              Recruit 1
            </Button>
            <Badge variant="outline">
              Active {stateLeagueContractPlayers.filter((p) => hasActiveStateLeagueContract(p)).length}/{stateLeagueContractPlayers.length}
            </Badge>
          </div>
          {stateLeagueContractPlayers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No {leagueShort}-contracted players on the affiliate list.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {stateLeagueContractPlayers
                .sort((a, b) => b.form + b.fitness - (a.form + a.fitness))
                .map((player) => {
                  const years = player.stateLeagueContract?.yearsRemaining ?? 0
                  const active = years > 0
                  return (
                    <div key={player.id} className="rounded border p-2 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">
                          {player.firstName} {player.lastName}
                        </p>
                        <Badge variant={active ? 'default' : 'secondary'}>
                          {active ? `${years}y remaining` : 'Expired'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {player.position.primary} · age {player.age} · form {player.form}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => reSignStateLeagueContract(player.id, 1)}>
                          Re-sign
                        </Button>
                        <Button size="sm" variant="destructive" className="h-6 px-2 text-xs" onClick={() => delistStateLeagueContractedPlayer(player.id)}>
                          Delist
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-6 px-2 text-xs"
                          onClick={() => signStateLeaguePlayerToAflContract(player.id, 2, 150000)}
                        >
                          AFL Contract
                        </Button>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
          {inactiveContracts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {inactiveContracts.length} contract{inactiveContracts.length === 1 ? '' : 's'} expired — re-sign to reactivate.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Reserves squad table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Reserves Squad</CardTitle>
            <TableViewManagerControl columns={reserveViewCols} manager={reserveView} />
          </div>
          <CardDescription>Players on the reserves list. Recall to senior when needed.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleReserveCols.map((col) => (
                  <TableHead
                    key={col.id}
                    style={{ width: reserveView.snapshot.columnWidths[col.id] ?? col.defaultWidth }}
                    onClick={() => {
                      if (!col.sortable) return
                      const cur = reserveView.snapshot.sort
                      if (!cur || cur.columnId !== col.id) reserveView.setSort(col.id, 'asc')
                      else reserveView.setSort(col.id, cur.direction === 'asc' ? 'desc' : 'asc')
                    }}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservePlayers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleReserveCols.length} className="text-center text-muted-foreground py-8">
                    No players in reserves. Send players down from the Senior Squad below.
                  </TableCell>
                </TableRow>
              ) : (
                sortedReservePlayers.map((p) => (
                  <TableRow key={p.id}>
                    {visibleReserveCols.map((col) => (
                      <TableCell key={`${p.id}-${col.id}`} style={{ width: reserveView.snapshot.columnWidths[col.id] ?? col.defaultWidth }}>
                        {col.render(p)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Senior squad table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Senior Squad</CardTitle>
            <TableViewManagerControl columns={seniorViewCols} manager={seniorView} />
          </div>
          <CardDescription>Send players to reserves for development or rotation.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleSeniorCols.map((col) => (
                  <TableHead
                    key={col.id}
                    style={{ width: seniorView.snapshot.columnWidths[col.id] ?? col.defaultWidth }}
                    onClick={() => {
                      if (!col.sortable) return
                      const cur = seniorView.snapshot.sort
                      if (!cur || cur.columnId !== col.id) seniorView.setSort(col.id, 'asc')
                      else seniorView.setSort(col.id, cur.direction === 'asc' ? 'desc' : 'asc')
                    }}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSeniorPlayers.map((p) => (
                <TableRow key={p.id}>
                  {visibleSeniorCols.map((col) => (
                    <TableCell key={`${p.id}-${col.id}`} style={{ width: seniorView.snapshot.columnWidths[col.id] ?? col.defaultWidth }}>
                      {col.render(p)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
