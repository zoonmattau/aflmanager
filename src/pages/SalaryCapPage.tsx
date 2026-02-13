import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { useGameStore } from '@/stores/gameStore'
import type { Player } from '@/types/player'
import type { PositionGroup } from '@/types/player'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowUpDown, DollarSign, Users, AlertTriangle, TrendingDown } from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSalary(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}m`
  return `$${(value / 1000).toFixed(0)}k`
}

function getCurrentYearSalary(player: Player): number {
  if (player.contract.yearByYear.length > 0) {
    return player.contract.yearByYear[0]
  }
  return player.contract.aav
}

function getSalaryForYear(player: Player, yearOffset: number): number | null {
  if (yearOffset >= player.contract.yearsRemaining) return null
  if (player.contract.yearByYear.length > yearOffset) {
    return player.contract.yearByYear[yearOffset]
  }
  return player.contract.aav
}

function aavColorClass(aav: number): string {
  if (aav > 900_000) return 'text-red-500'
  if (aav > 600_000) return 'text-orange-500'
  if (aav > 300_000) return 'text-yellow-500'
  return 'text-green-500'
}

function capBarColor(ratio: number): string {
  if (ratio > 1) return 'bg-red-500'
  if (ratio > 0.85) return 'bg-yellow-500'
  return 'bg-green-500'
}

const POSITION_GROUPS: PositionGroup[] = [
  'FB', 'HB', 'C', 'HF', 'FF', 'FOLL', 'INT', 'MID', 'WING',
]

// ---------------------------------------------------------------------------
// Name cell (uses hooks, must be a component)
// ---------------------------------------------------------------------------

function NameCell({ playerId, name }: { playerId: string; name: string }) {
  const navigate = useNavigate()
  return (
    <button
      className="font-medium text-left hover:underline hover:text-primary cursor-pointer"
      onClick={() => navigate(`/player/${playerId}`)}
    >
      {name}
    </button>
  )
}

// ---------------------------------------------------------------------------
// TanStack Table columns
// ---------------------------------------------------------------------------

const columnHelper = createColumnHelper<Player>()

const columns = [
  columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
    id: 'name',
    header: 'Name',
    cell: (info) => (
      <NameCell playerId={info.row.original.id} name={info.getValue()} />
    ),
    size: 180,
  }),
  columnHelper.accessor((row) => row.position.primary, {
    id: 'position',
    header: 'Position',
    cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
    size: 70,
    filterFn: 'equals',
  }),
  columnHelper.accessor('age', {
    header: 'Age',
    size: 50,
  }),
  columnHelper.accessor((row) => row.contract.aav, {
    id: 'aav',
    header: 'AAV',
    cell: (info) => (
      <span className={aavColorClass(info.getValue())}>
        {formatSalary(info.getValue())}
      </span>
    ),
    size: 80,
  }),
  columnHelper.accessor((row) => row.contract.yearsRemaining, {
    id: 'yearsRemaining',
    header: 'Years',
    cell: (info) => `${info.getValue()}yr`,
    size: 60,
  }),
  columnHelper.display({
    id: 'yearByYear',
    header: 'Year-by-Year',
    cell: (info) => {
      const yby = info.row.original.contract.yearByYear
      if (yby.length === 0) return <span className="text-muted-foreground">-</span>
      return (
        <span className="text-xs tabular-nums">
          {yby.map((v) => formatSalary(v)).join(' / ')}
        </span>
      )
    },
    size: 200,
  }),
  columnHelper.accessor((row) => row.isRookie, {
    id: 'listType',
    header: 'List',
    cell: (info) => (
      <Badge variant={info.getValue() ? 'secondary' : 'default'}>
        {info.getValue() ? 'Rookie' : 'Senior'}
      </Badge>
    ),
    filterFn: (row, _columnId, filterValue) => {
      if (filterValue === 'all') return true
      const isRookie = row.original.isRookie
      return filterValue === 'rookie' ? isRookie : !isRookie
    },
    size: 80,
  }),
  columnHelper.accessor((row) => row.contract.yearsRemaining, {
    id: 'status',
    header: 'Status',
    cell: (info) => {
      const years = info.getValue()
      if (years === 0) {
        return <Badge variant="destructive">Out of Contract</Badge>
      }
      if (years === 1) {
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-500">
            Expiring
          </Badge>
        )
      }
      return <span className="text-muted-foreground text-xs">Contracted</span>
    },
    size: 120,
  }),
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SalaryCapPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const settings = useGameStore((s) => s.settings)

  const club = clubs[playerClubId]
  const salaryCapAmount = settings.salaryCapAmount

  // -- Derived data ----------------------------------------------------------

  const clubPlayers = useMemo(
    () => Object.values(players).filter((p) => p.clubId === playerClubId),
    [players, playerClubId],
  )

  const totalSpend = useMemo(
    () => clubPlayers.reduce((sum, p) => sum + getCurrentYearSalary(p), 0),
    [clubPlayers],
  )

  const capSpace = salaryCapAmount - totalSpend
  const capRatio = salaryCapAmount > 0 ? totalSpend / salaryCapAmount : 0

  const expiringPlayers = useMemo(
    () => clubPlayers.filter((p) => p.contract.yearsRemaining <= 1),
    [clubPlayers],
  )

  // -- Projections for next 3 years ------------------------------------------

  const projections = useMemo(() => {
    const years: Array<{
      yearLabel: string
      projectedSpend: number
      expiringCount: number
      playersUnderContract: number
    }> = []

    for (let offset = 0; offset < 3; offset++) {
      let projectedSpend = 0
      let expiringCount = 0
      let playersUnderContract = 0

      for (const p of clubPlayers) {
        const salary = getSalaryForYear(p, offset)
        if (salary !== null) {
          projectedSpend += salary
          playersUnderContract++
          // A player is "expiring" in this year if yearsRemaining == offset + 1
          if (p.contract.yearsRemaining === offset + 1) {
            expiringCount++
          }
        }
      }

      years.push({
        yearLabel: offset === 0 ? 'Current Year' : `Year ${offset + 1}`,
        projectedSpend,
        expiringCount,
        playersUnderContract,
      })
    }

    return years
  }, [clubPlayers])

  // -- Table state -----------------------------------------------------------

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'aav', desc: true },
  ])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data: clubPlayers,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  // -- Position filter handler -----------------------------------------------

  function handlePositionFilter(value: string) {
    setColumnFilters((prev) => {
      const next = prev.filter((f) => f.id !== 'position')
      if (value !== 'all') next.push({ id: 'position', value })
      return next
    })
  }

  function handleListFilter(value: string) {
    setColumnFilters((prev) => {
      const next = prev.filter((f) => f.id !== 'listType')
      if (value !== 'all') next.push({ id: 'listType', value })
      return next
    })
  }

  // -- Render ----------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{club?.fullName} - Salary Cap</h1>
        <p className="text-sm text-muted-foreground">
          Manage your club's salary cap and player contracts
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Summary Cards Row                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              Total Salary Spend
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatSalary(totalSpend)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              Salary Cap
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatSalary(salaryCapAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              {capSpace < 0 ? (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              Cap Space Remaining
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold tabular-nums ${
                capSpace < 0 ? 'text-red-500' : ''
              }`}
            >
              {capSpace < 0 ? '-' : ''}
              {formatSalary(Math.abs(capSpace))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              Players on List
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {clubPlayers.length}
            </p>
            <p className="text-xs text-muted-foreground">
              {clubPlayers.filter((p) => !p.isRookie).length} senior /{' '}
              {clubPlayers.filter((p) => p.isRookie).length} rookie
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Salary Cap Progress Bar                                             */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cap Usage</CardTitle>
          <CardDescription>
            {formatSalary(totalSpend)} of {formatSalary(salaryCapAmount)} (
            {(capRatio * 100).toFixed(1)}%)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${capBarColor(capRatio)}`}
              style={{ width: `${Math.min(capRatio * 100, 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span className="text-yellow-500">85%</span>
            <span>100%</span>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Cap Projections Table                                               */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Cap Projections</CardTitle>
          <CardDescription>
            Projected salary commitments over the next 3 years
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Projected Spend</TableHead>
                <TableHead className="text-right">Cap Space</TableHead>
                <TableHead className="text-right">Players Under Contract</TableHead>
                <TableHead className="text-right">Expiring Contracts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projections.map((proj) => {
                const projCapSpace = salaryCapAmount - proj.projectedSpend
                return (
                  <TableRow key={proj.yearLabel}>
                    <TableCell className="font-medium">{proj.yearLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatSalary(proj.projectedSpend)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        projCapSpace < 0 ? 'text-red-500' : ''
                      }`}
                    >
                      {projCapSpace < 0 ? '-' : ''}
                      {formatSalary(Math.abs(projCapSpace))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {proj.playersUnderContract}
                    </TableCell>
                    <TableCell className="text-right">
                      {proj.expiringCount > 0 ? (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                          {proj.expiringCount} expiring
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Expiring Contracts Section                                          */}
      {/* ------------------------------------------------------------------ */}
      {expiringPlayers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Expiring Contracts
            </CardTitle>
            <CardDescription>
              {expiringPlayers.length} player{expiringPlayers.length !== 1 ? 's' : ''} with
              1 year or less remaining on their contract
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead className="text-right">AAV</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Restriction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringPlayers
                  .sort((a, b) => b.contract.aav - a.contract.aav)
                  .map((player) => (
                    <TableRow key={player.id}>
                      <TableCell>
                        <NameCell
                          playerId={player.id}
                          name={`${player.firstName} ${player.lastName}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{player.position.primary}</Badge>
                      </TableCell>
                      <TableCell>{player.age}</TableCell>
                      <TableCell className={`text-right tabular-nums ${aavColorClass(player.contract.aav)}`}>
                        {formatSalary(player.contract.aav)}
                      </TableCell>
                      <TableCell>
                        {player.contract.yearsRemaining === 0 ? (
                          <Badge variant="destructive">Out of Contract</Badge>
                        ) : (
                          <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                            Expiring
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {player.contract.isRestricted ? (
                          <Badge variant="secondary">RFA</Badge>
                        ) : (
                          <Badge variant="outline">UFA</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Player Contracts Table                                              */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Player Contracts</CardTitle>
          <CardDescription>
            Full contract details for all {clubPlayers.length} players
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search players..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="max-w-xs"
            />

            <Select
              onValueChange={handlePositionFilter}
              defaultValue="all"
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Positions</SelectItem>
                {POSITION_GROUPS.map((pg) => (
                  <SelectItem key={pg} value={pg}>
                    {pg}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              onValueChange={handleListFilter}
              defaultValue="all"
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="List Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lists</SelectItem>
                <SelectItem value="senior">Senior</SelectItem>
                <SelectItem value="rookie">Rookie</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="cursor-pointer select-none whitespace-nowrap px-2 text-xs"
                        onClick={header.column.getToggleSortingHandler()}
                        style={{ width: header.getSize() }}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getIsSorted() ? (
                            header.column.getIsSorted() === 'asc' ? ' ↑' : ' ↓'
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-30" />
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="text-center text-muted-foreground py-8"
                    >
                      No players match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className="text-sm">
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className="px-2 py-1.5 whitespace-nowrap"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer summary */}
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {table.getRowModel().rows.length} of {clubPlayers.length} players
            </span>
            <span className="tabular-nums">
              Total filtered AAV:{' '}
              {formatSalary(
                table
                  .getRowModel()
                  .rows.reduce(
                    (sum, row) => sum + row.original.contract.aav,
                    0,
                  ),
              )}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
