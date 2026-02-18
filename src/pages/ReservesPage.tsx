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
import { isPlayerSuspended } from '@/engine/players/availability'
import { getPlayerStarRating } from '@/engine/player/playerRating'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { useTableViewManager, type TableViewColumnConfig } from '@/components/table-view/useTableViewManager'
import { TableViewManagerControl } from '@/components/table-view/TableViewManagerControl'
import type { Player } from '@/types/player'
import { buildUserStateLeagueContext, getUserReservesEligiblePool, projectReservesLineup } from '@/engine/stateLeague/reservesManagement'
import { getPositionBadgeClass } from '@/lib/positionColor'
import { hasActiveStateLeagueContract, isStateLeagueContracted } from '@/engine/players/contracts'

type RowColumn = {
  id: string
  label: string
  defaultWidth: number
  sortable?: boolean
  sortValue?: (player: Player) => string | number
  render: (player: Player) => ReactNode
}

export function ReservesPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const stateLeagues = useGameStore((s) => s.stateLeagues)
  const currentRound = useGameStore((s) => s.currentRound)
  const settings = useGameStore((s) => s.settings)
  const sendToReserves = useGameStore((s) => s.sendToReserves)
  const recallFromReserves = useGameStore((s) => s.recallFromReserves)
  const reserves = useGameStore((s) => s.reserves)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const setReservesDelegation = useGameStore((s) => s.setReservesDelegation)
  const setManagedReservesLineup = useGameStore((s) => s.setManagedReservesLineup)
  const setReservesPlayerAvailability = useGameStore((s) => s.setReservesPlayerAvailability)
  const setReservesLeadership = useGameStore((s) => s.setReservesLeadership)
  const setReservesTactics = useGameStore((s) => s.setReservesTactics)
  const autoPickManagedReservesLineup = useGameStore((s) => s.autoPickManagedReservesLineup)
  const setStateLeagueContractDelegation = useGameStore((s) => s.setStateLeagueContractDelegation)
  const setStateLeagueContractTargetCount = useGameStore((s) => s.setStateLeagueContractTargetCount)
  const reSignStateLeagueContract = useGameStore((s) => s.reSignStateLeagueContract)
  const delistStateLeagueContractedPlayer = useGameStore((s) => s.delistStateLeagueContractedPlayer)
  const recruitStateLeagueContractPlayer = useGameStore((s) => s.recruitStateLeagueContractPlayer)
  const signStateLeaguePlayerToAflContract = useGameStore((s) => s.signStateLeaguePlayerToAflContract)
  const navigate = useNavigate()

  const club = clubs[playerClubId]

  const { clubPlayers, seniorPlayers, reservePlayers } = useMemo(() => {
    const clubPlayers = Object.values(players).filter((p) => p.clubId === playerClubId)
    return {
      clubPlayers,
      seniorPlayers: clubPlayers.filter((p) => p.listStatus !== 'reserves'),
      reservePlayers: clubPlayers.filter((p) => p.listStatus === 'reserves'),
    }
  }, [players, playerClubId])

  const stateLeagueContractPlayers = useMemo(
    () => clubPlayers.filter((p) => isStateLeagueContracted(p)),
    [clubPlayers],
  )
  const inactiveStateLeagueContracts = useMemo(
    () => stateLeagueContractPlayers.filter((p) => !hasActiveStateLeagueContract(p)),
    [stateLeagueContractPlayers],
  )

  const selectedAFLIds = useMemo(
    () => new Set(Object.values(selectedLineup ?? {}).filter((id): id is string => Boolean(id))),
    [selectedLineup],
  )

  const stateLeagueContext = useMemo(
    () => buildUserStateLeagueContext({ stateLeagues, playerClubId, currentRound, settings }),
    [stateLeagues, playerClubId, currentRound, settings],
  )
  const reservesLeagueLabel = stateLeagueContext?.league.id.toUpperCase() ?? 'State'

  const allReservesEligible = useMemo(
    () => getUserReservesEligiblePool({ players, playerClubId, selectedLineup }),
    [players, playerClubId, selectedLineup],
  )

  const projectedReserves = useMemo(
    () => projectReservesLineup(allReservesEligible, reserves, settings.matchRules.interchangePlayers),
    [allReservesEligible, reserves, settings.matchRules.interchangePlayers],
  )

  const projectedReservesSet = useMemo(
    () => new Set(projectedReserves.selectedIds),
    [projectedReserves.selectedIds],
  )
  const topProjectedPlayers = useMemo(
    () =>
      projectedReserves.selectedIds
        .map((id) => players[id])
        .filter(Boolean)
        .sort((a, b) => (b.form + b.fitness) - (a.form + a.fitness))
        .slice(0, 3),
    [projectedReserves.selectedIds, players],
  )
  void topProjectedPlayers

  const availableForReservesSelection = useMemo(
    () =>
      [...seniorPlayers, ...reservePlayers]
        .filter((p) => !isStateLeagueContracted(p) || hasActiveStateLeagueContract(p))
        .filter((p) => !selectedAFLIds.has(p.id) && !p.injury && !isPlayerSuspended(p))
        .sort((a, b) => (b.form + b.fitness) - (a.form + a.fitness)),
    [reservePlayers, selectedAFLIds, seniorPlayers],
  )

  const unavailableForReserves = useMemo(
    () =>
      [...seniorPlayers, ...reservePlayers]
        .filter((p) => !selectedAFLIds.has(p.id))
        .filter((p) => p.injury || isPlayerSuspended(p) || (isStateLeagueContracted(p) && !hasActiveStateLeagueContract(p))),
    [reservePlayers, selectedAFLIds, seniorPlayers],
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

  const reserveColumns = useMemo<RowColumn[]>(() => [
    { id: 'jumper', label: '#', defaultWidth: 44, sortable: true, sortValue: (p) => p.jerseyNumber, render: (p) => p.jerseyNumber },
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
          <PlayerStarRating stars={getPlayerStarRating(p)} player={p} className="scale-[0.8] origin-left" />
        </div>
      ),
    },
    { id: 'pos', label: 'Pos', defaultWidth: 70, sortable: true, sortValue: (p) => p.position.primary, render: (p) => <Badge variant="outline" className={getPositionBadgeClass(p.position.primary)}>{p.position.primary}</Badge> },
    { id: 'age', label: 'Age', defaultWidth: 56, sortable: true, sortValue: (p) => p.age, render: (p) => p.age },
    { id: 'fit', label: 'Fit', defaultWidth: 56, sortable: true, sortValue: (p) => p.fitness, render: (p) => p.fitness },
    { id: 'form', label: 'Form', defaultWidth: 56, sortable: true, sortValue: (p) => p.form, render: (p) => p.form },
    {
      id: 'vflgp',
      label: `${reservesLeagueLabel} GP`,
      defaultWidth: 74,
      sortable: true,
      sortValue: (p) => reserves.seasonStatsByPlayer[p.id]?.gamesPlayed ?? 0,
      render: (p) => reserves.seasonStatsByPlayer[p.id]?.gamesPlayed ?? 0,
    },
    {
      id: 'vflavg',
      label: `${reservesLeagueLabel} Avg Disp`,
      defaultWidth: 90,
      sortable: true,
      sortValue: (p) => {
        const gp = reserves.seasonStatsByPlayer[p.id]?.gamesPlayed ?? 0
        return gp ? Math.round((reserves.seasonStatsByPlayer[p.id]?.disposals ?? 0) / gp) : 0
      },
      render: (p) => {
        const gp = reserves.seasonStatsByPlayer[p.id]?.gamesPlayed ?? 0
        return gp ? Math.round((reserves.seasonStatsByPlayer[p.id]?.disposals ?? 0) / gp) : 0
      },
    },
    {
      id: 'lastvfl',
      label: `Last ${reservesLeagueLabel}`,
      defaultWidth: 92,
      sortable: false,
      render: (p) => lastRoundByPlayer[p.id] ? `${lastRoundByPlayer[p.id].disposals}d ${lastRoundByPlayer[p.id].goals}g` : '-',
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
  ], [navigate, reserves.seasonStatsByPlayer, lastRoundByPlayer, recallFromReserves, reservesLeagueLabel])

  const seniorColumns = useMemo<RowColumn[]>(() => [
    { id: 'jumper', label: '#', defaultWidth: 44, sortable: true, sortValue: (p) => p.jerseyNumber, render: (p) => p.jerseyNumber },
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
          <PlayerStarRating stars={getPlayerStarRating(p)} player={p} className="scale-[0.8] origin-left" />
        </div>
      ),
    },
    { id: 'pos', label: 'Pos', defaultWidth: 70, sortable: true, sortValue: (p) => p.position.primary, render: (p) => <Badge variant="outline" className={getPositionBadgeClass(p.position.primary)}>{p.position.primary}</Badge> },
    { id: 'age', label: 'Age', defaultWidth: 56, sortable: true, sortValue: (p) => p.age, render: (p) => p.age },
    { id: 'fit', label: 'Fit', defaultWidth: 56, sortable: true, sortValue: (p) => p.fitness, render: (p) => p.fitness },
    { id: 'form', label: 'Form', defaultWidth: 56, sortable: true, sortValue: (p) => p.form, render: (p) => p.form },
    {
      id: 'lastvfl',
      label: `Last ${reservesLeagueLabel}`,
      defaultWidth: 92,
      sortable: false,
      render: (p) => lastRoundByPlayer[p.id] ? `${lastRoundByPlayer[p.id].disposals}d ${lastRoundByPlayer[p.id].goals}g` : '-',
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
  ], [navigate, lastRoundByPlayer, sendToReserves, reservesLeagueLabel])

  const reserveViewColumns = useMemo<TableViewColumnConfig[]>(
    () => reserveColumns.map((c) => ({ id: c.id, label: c.label, defaultWidth: c.defaultWidth, sortable: c.sortable !== false })),
    [reserveColumns],
  )
  const seniorViewColumns = useMemo<TableViewColumnConfig[]>(
    () => seniorColumns.map((c) => ({ id: c.id, label: c.label, defaultWidth: c.defaultWidth, sortable: c.sortable !== false })),
    [seniorColumns],
  )
  const reserveView = useTableViewManager({ tableId: 'reserves-list', columns: reserveViewColumns, defaultSort: { columnId: 'name', direction: 'asc' } })
  const seniorView = useTableViewManager({ tableId: 'senior-list', columns: seniorViewColumns, defaultSort: { columnId: 'name', direction: 'asc' } })

  const buildVisibleColumns = (cols: RowColumn[], hiddenIds: string[], order: string[]) => {
    const hidden = new Set(hiddenIds)
    const byId = new Map(cols.map((c) => [c.id, c] as const))
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
  const visibleReserveColumns = buildVisibleColumns(reserveColumns, reserveView.snapshot.hiddenColumnIds, reserveView.snapshot.columnOrder)
  const visibleSeniorColumns = buildVisibleColumns(seniorColumns, seniorView.snapshot.hiddenColumnIds, seniorView.snapshot.columnOrder)
  const sortedReservePlayers = sortRows(reservePlayers, reserveColumns, reserveView.snapshot.sort)
  const sortedSeniorPlayers = sortRows(seniorPlayers, seniorColumns, seniorView.snapshot.sort)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{club?.fullName} - Reserves</h1>
        <p className="text-sm text-muted-foreground">
          Manage your reserves program with weekly state-league assignments, lineup control, leadership and match preview.
        </p>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => navigate('/reserves/match-preview')}>
          Open Reserves Match Preview
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Next State League Match</p>
            <p className="text-sm font-semibold">
              {stateLeagueContext?.opponent ? `vs ${stateLeagueContext.opponent.abbreviation}` : 'TBC'}
            </p>
            <p className="text-xs text-muted-foreground">
              {stateLeagueContext ? `${stateLeagueContext.league.name} · R${stateLeagueContext.roundNumber}` : 'No affiliation'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Projected Playing 23</p>
            <p className="text-2xl font-bold tabular-nums">{projectedReserves.selectedIds.length}</p>
          </CardContent>
        </Card>
      </div>

      {unavailableForReserves.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Reserves Availability Watch</CardTitle>
            <CardDescription>Injuries/suspensions impacting this week&apos;s reserves selection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {unavailableForReserves.slice(0, 8).map((p) => (
              <div key={`unavail-${p.id}`} className="text-xs flex items-center justify-between rounded border px-2 py-1">
                <span>{p.firstName} {p.lastName}</span>
                <Badge variant="outline">
                  {p.injury
                    ? `${p.injury.type} (${p.injury.weeksRemaining}w)`
                    : isPlayerSuspended(p)
                      ? `Suspended (${p.suspension?.weeksRemaining ?? 0}w)`
                      : 'State contract expired'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {stateLeagueContext && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Reserves Dashboard</CardTitle>
            <CardDescription>
              {stateLeagueContext.club.name} {stateLeagueContext.isHome ? 'hosts' : 'travels to'} {stateLeagueContext.opponent?.name ?? 'TBC'} in {stateLeagueContext.league.name}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Round {stateLeagueContext.roundNumber}</Badge>
              <Badge variant="outline">{stateLeagueContext.isHome ? 'Home' : 'Away'}</Badge>
              <Badge variant="outline">Projected lineup {projectedReserves.selectedIds.length}/23</Badge>
            </div>
            {stateLeagueContext.lastResult && (
              <p className="text-xs text-muted-foreground">
                Last result: {stateLeagueContext.lastResult.wasHome ? 'Home' : 'Away'} {stateLeagueContext.lastResult.homeScore}-{stateLeagueContext.lastResult.awayScore}
              </p>
            )}
            <div className="rounded border p-2">
              <p className="text-xs font-semibold mb-1">Upcoming fixture (next 5)</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                {stateLeagueContext.league.season.rounds
                  .slice(Math.max(0, stateLeagueContext.roundNumber - 1), stateLeagueContext.roundNumber + 4)
                  .map((round) => {
                    const match = round.results.find((m) => m.homeClubId === stateLeagueContext.club.id || m.awayClubId === stateLeagueContext.club.id)
                    if (!match) return null
                    const oppId = match.homeClubId === stateLeagueContext.club.id ? match.awayClubId : match.homeClubId
                    const opp = stateLeagueContext.league.clubs.find((c) => c.id === oppId)
                    const label = match.homeClubId === stateLeagueContext.club.id ? 'vs' : '@'
                    const done = match.homeScore > 0 || match.awayScore > 0
                    return (
                      <div key={`fixture-${round.number}`} className="flex items-center justify-between">
                        <span>R{round.number} {label} {opp?.abbreviation ?? oppId}</span>
                        <span>{done ? `${match.homeScore}-${match.awayScore}` : 'Scheduled'}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
            <div className="rounded border p-2">
              <p className="text-xs font-semibold mb-1">Key Matchups (Projected)</p>
              <div className="space-y-1">
                {topProjectedPlayers.map((player) => (
                  <div key={`matchup-${player.id}`} className="flex items-center justify-between text-xs">
                    <span>{player.firstName} {player.lastName} · {player.position.primary}</span>
                    <span className="text-muted-foreground">form {player.form} · fit {player.fitness}</span>
                  </div>
                ))}
                {topProjectedPlayers.length === 0 && (
                  <p className="text-xs text-muted-foreground">No projected matchup data yet.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>AFL Non-Selected Weekly Assignment</CardTitle>
          <CardDescription>
            Every non-selected AFL-listed player can be assigned to state league (`play`) or held out (`rest`).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {allReservesEligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No eligible non-selected players this week.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {allReservesEligible
                .sort((a, b) => (b.form + b.fitness) - (a.form + a.fitness))
                .map((player) => {
                  const assignment = reserves.playerAvailabilityAssignments[player.id] ?? 'play'
                  const willPlay = projectedReservesSet.has(player.id)
                  const isAflListed = player.listStatus !== 'reserves'
                  return (
                    <div key={player.id} className="rounded border p-2 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{player.firstName} {player.lastName}</p>
                          <p className="text-muted-foreground">
                            {player.position.primary} · form {player.form} · fit {player.fitness}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {isAflListed && <Badge variant="outline">AFL-listed</Badge>}
                          <Badge variant={willPlay ? 'default' : 'secondary'}>{willPlay ? 'In 23' : 'Out'}</Badge>
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

      <Card>
        <CardHeader>
          <CardTitle>Reserves Leadership</CardTitle>
          <CardDescription>Assign reserves captain, vice-captain, and leadership group.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Captain</Label>
              <Select
                value={reserves.leadership.captainId ?? '__none'}
                onValueChange={(v) => setReservesLeadership({
                  ...reserves.leadership,
                  captainId: v === '__none' ? null : v,
                })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {allReservesEligible.map((p) => (
                    <SelectItem key={`cap-${p.id}`} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vice Captain</Label>
              <Select
                value={reserves.leadership.viceCaptainId ?? '__none'}
                onValueChange={(v) => setReservesLeadership({
                  ...reserves.leadership,
                  viceCaptainId: v === '__none' ? null : v,
                })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {allReservesEligible.map((p) => (
                    <SelectItem key={`vc-${p.id}`} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Leadership Group</Label>
              <div className="rounded border p-2 min-h-[40px] text-xs">
                {reserves.leadership.leadershipGroupIds.length > 0
                  ? reserves.leadership.leadershipGroupIds
                    .map((id) => players[id])
                    .filter(Boolean)
                    .map((p) => `${p.firstName} ${p.lastName}`)
                    .join(', ')
                  : 'No group selected'}
              </div>
            </div>
          </div>
          <div className="grid gap-1 md:grid-cols-2">
            {allReservesEligible.map((p) => {
              const inGroup = reserves.leadership.leadershipGroupIds.includes(p.id)
              return (
                <button
                  key={`lg-${p.id}`}
                  type="button"
                  className={`rounded border px-2 py-1 text-xs text-left ${inGroup ? 'border-primary bg-primary/10' : ''}`}
                  onClick={() => {
                    const next = inGroup
                      ? reserves.leadership.leadershipGroupIds.filter((id) => id !== p.id)
                      : [...reserves.leadership.leadershipGroupIds, p.id]
                    setReservesLeadership({ ...reserves.leadership, leadershipGroupIds: next })
                  }}
                >
                  {p.firstName} {p.lastName}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>State-League Contracts</CardTitle>
          <CardDescription>
            Manage affiliate-contracted reserves players. These players remain reserves-only until signed to an AFL contract.
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
                  {[8, 10, 12, 14, 16, 18, 20].map((value) => (
                    <SelectItem key={`state-target-${value}`} value={String(value)}>
                      {value}
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
            <p className="text-xs text-muted-foreground">No state-league contracted players currently on the affiliate list.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {stateLeagueContractPlayers
                .sort((a, b) => (b.form + b.fitness) - (a.form + a.fitness))
                .map((player) => {
                  const years = player.stateLeagueContract?.yearsRemaining ?? 0
                  const active = years > 0
                  return (
                    <div key={`state-contract-${player.id}`} className="rounded border p-2 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{player.firstName} {player.lastName}</p>
                        <Badge variant={active ? 'default' : 'secondary'}>
                          {active ? `${years}y remaining` : 'Expired'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">{player.position.primary} · age {player.age} · form {player.form}</p>
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
          {inactiveStateLeagueContracts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {inactiveStateLeagueContracts.length} contract{inactiveStateLeagueContracts.length === 1 ? '' : 's'} expired and unavailable until re-signed.
            </p>
          )}
        </CardContent>
      </Card>

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
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Reserves Squad</CardTitle>
            <TableViewManagerControl columns={reserveViewColumns} manager={reserveView} />
          </div>
          <CardDescription>
            Players currently in the reserves. Recall them when needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleReserveColumns.map((col) => (
                  <TableHead
                    key={col.id}
                    style={{ width: reserveView.snapshot.columnWidths[col.id] ?? col.defaultWidth }}
                    onClick={() => {
                      if (!col.sortable) return
                      const current = reserveView.snapshot.sort
                      if (!current || current.columnId !== col.id) reserveView.setSort(col.id, 'asc')
                      else reserveView.setSort(col.id, current.direction === 'asc' ? 'desc' : 'asc')
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
                  <TableCell colSpan={visibleReserveColumns.length} className="text-center text-muted-foreground py-8">
                    No players in reserves. Send players down from the Senior List below.
                  </TableCell>
                </TableRow>
              ) : (
                sortedReservePlayers.map((p) => (
                  <TableRow key={p.id}>
                    {visibleReserveColumns.map((col) => (
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

      {/* Senior List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Senior Squad</CardTitle>
            <TableViewManagerControl columns={seniorViewColumns} manager={seniorView} />
          </div>
          <CardDescription>
            Send players to reserves for development or rotation.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleSeniorColumns.map((col) => (
                  <TableHead
                    key={col.id}
                    style={{ width: seniorView.snapshot.columnWidths[col.id] ?? col.defaultWidth }}
                    onClick={() => {
                      if (!col.sortable) return
                      const current = seniorView.snapshot.sort
                      if (!current || current.columnId !== col.id) seniorView.setSort(col.id, 'asc')
                      else seniorView.setSort(col.id, current.direction === 'asc' ? 'desc' : 'asc')
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
                  {visibleSeniorColumns.map((col) => (
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
