import { useMemo, useRef, useState } from 'react'
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
  type ColumnDef,
} from '@tanstack/react-table'
import { useGameStore } from '@/stores/gameStore'
import type { Player } from '@/types/player'
import type { PlayerPositionType } from '@/types/player'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
  ArrowUpDown,
  DollarSign,
  Users,
  AlertTriangle,
  GraduationCap,
  TrendingUp,
  Shield,
  X,
} from 'lucide-react'
import { getCapWarnings } from '@/engine/salary/salaryCapEngine'
import { calculateLuxuryTax } from '@/engine/contracts/negotiation'

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

const POSITION_GROUPS: PlayerPositionType[] = [
  'BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF',
]

const MAX_YEAR_COLUMNS = 6

type TileFilter = 'all' | 'expiring' | 'rookie'

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
// Main component
// ---------------------------------------------------------------------------

export function SalaryCapPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const settings = useGameStore((s) => s.settings)
  const currentYear = useGameStore((s) => s.currentYear)

  const club = clubs[playerClubId]
  const salaryCapAmount = settings.salaryCapAmount

  // -- Refs for scroll targets ----------------------------------------------

  const capOverviewRef = useRef<HTMLDivElement>(null)
  const projectionsRef = useRef<HTMLDivElement>(null)
  const matrixRef = useRef<HTMLDivElement>(null)

  // -- Active tile filter ---------------------------------------------------

  const [activeFilter, setActiveFilter] = useState<TileFilter | null>(null)

  function handleTileClick(filter: TileFilter | null, ref: React.RefObject<HTMLDivElement | null>) {
    setActiveFilter(filter)
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // -- Derived data ----------------------------------------------------------

  const clubPlayers = useMemo(
    () => Object.values(players).filter((p) => p.clubId === playerClubId),
    [players, playerClubId],
  )

  const totalSpend = useMemo(
    () => clubPlayers.reduce((sum, p) => sum + getCurrentYearSalary(p), 0),
    [clubPlayers],
  )

  const softCapEnabled = settings.realism.softCapSpending
  const effectiveCap = softCapEnabled ? salaryCapAmount * 1.10 : salaryCapAmount
  const capSpace = effectiveCap - totalSpend
  const capRatio = salaryCapAmount > 0 ? totalSpend / salaryCapAmount : 0

  const seniorCount = useMemo(() => clubPlayers.filter((p) => !p.isRookie).length, [clubPlayers])
  const rookieCount = useMemo(() => clubPlayers.filter((p) => p.isRookie).length, [clubPlayers])

  const expiringPlayers = useMemo(
    () => clubPlayers.filter((p) => p.contract.yearsRemaining <= 1),
    [clubPlayers],
  )

  const expiringAAV = useMemo(
    () => expiringPlayers.reduce((sum, p) => sum + p.contract.aav, 0),
    [expiringPlayers],
  )

  const capWarnings = useMemo(
    () => getCapWarnings(totalSpend, salaryCapAmount, softCapEnabled),
    [totalSpend, salaryCapAmount, softCapEnabled],
  )

  const luxuryTax = useMemo(
    () => softCapEnabled ? calculateLuxuryTax(clubPlayers, playerClubId, salaryCapAmount) : 0,
    [softCapEnabled, clubPlayers, playerClubId, salaryCapAmount],
  )

  const capHealthColor = capRatio >= 1.0
    ? 'text-red-500'
    : capRatio >= 0.95
      ? 'text-orange-500'
      : capRatio >= 0.90
        ? 'text-yellow-500'
        : 'text-green-500'

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

  // Year 2 projection for tile
  const yr2Free = projections.length >= 2
    ? salaryCapAmount - projections[1].projectedSpend
    : 0
  const yr2ExpiringCount = projections.length >= 2
    ? projections[1].expiringCount
    : 0

  // -- Matrix column data (year-by-year summaries) --------------------------

  const yearSummaries = useMemo(() => {
    const summaries: Array<{
      committedSpend: number
      playerCount: number
    }> = []

    for (let offset = 0; offset < MAX_YEAR_COLUMNS; offset++) {
      let committedSpend = 0
      let playerCount = 0

      for (const p of clubPlayers) {
        const salary = getSalaryForYear(p, offset)
        if (salary !== null) {
          committedSpend += salary
          playerCount++
        }
      }

      summaries.push({ committedSpend, playerCount })
    }

    return summaries
  }, [clubPlayers])

  // -- TanStack Table columns (matrix layout) --------------------------------

  const columnHelper = createColumnHelper<Player>()

  const matrixColumns = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cols: ColumnDef<Player, any>[] = [
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
        header: 'Pos',
        cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
        size: 60,
        filterFn: 'equals',
      }),
      columnHelper.accessor('age', {
        header: 'Age',
        size: 50,
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
        size: 70,
      }),
    ]

    // Year columns (1 through MAX_YEAR_COLUMNS)
    for (let offset = 0; offset < MAX_YEAR_COLUMNS; offset++) {
      const yearNum = currentYear + offset
      cols.push(
        columnHelper.display({
          id: `year_${offset}`,
          header: () => (
            <div className="text-center">
              <div>Yr {offset + 1}</div>
              <div className="text-[10px] text-muted-foreground font-normal">{yearNum}</div>
            </div>
          ),
          cell: (info) => {
            const player = info.row.original
            const salary = getSalaryForYear(player, offset)
            if (salary === null) {
              return <span className="text-muted-foreground">—</span>
            }
            const isLastYear = player.contract.yearsRemaining === offset + 1
            return (
              <span
                className={`tabular-nums text-xs ${aavColorClass(salary)} ${
                  isLastYear ? 'border-r-2 border-yellow-500/50 pr-1' : ''
                }`}
              >
                {formatSalary(salary)}
              </span>
            )
          },
          size: 90,
        }),
      )
    }

    // Total column
    cols.push(
      columnHelper.accessor(
        (row) => row.contract.yearByYear.reduce((sum, v) => sum + v, 0) || row.contract.aav * row.contract.yearsRemaining,
        {
          id: 'total',
          header: 'Total',
          cell: (info) => (
            <span className="tabular-nums text-xs font-medium">
              {formatSalary(info.getValue())}
            </span>
          ),
          size: 90,
        },
      ),
    )

    // Expiring filter column (hidden, used for tile filter)
    cols.push(
      columnHelper.accessor((row) => row.contract.yearsRemaining, {
        id: 'yearsRemaining',
        header: () => null,
        cell: () => null,
        filterFn: (row, _columnId, filterValue) => {
          if (filterValue === 'expiring') {
            return row.original.contract.yearsRemaining <= 1
          }
          return true
        },
        size: 0,
      }),
    )

    return cols
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear])

  // -- Table state -----------------------------------------------------------

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'total', desc: true },
  ])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  // Merge tile filter with manual column filters
  const effectiveColumnFilters = useMemo(() => {
    const filters = [...columnFilters]

    // Remove any existing tile-driven filters
    const tileFilterIds = ['yearsRemaining', 'listType']
    const manualFilters = filters.filter((f) => !tileFilterIds.includes(f.id) ||
      // Keep listType if it was set by the dropdown, not the tile
      (f.id === 'listType' && activeFilter !== 'rookie'))

    if (activeFilter === 'expiring') {
      manualFilters.push({ id: 'yearsRemaining', value: 'expiring' })
    } else if (activeFilter === 'rookie') {
      manualFilters.push({ id: 'listType', value: 'rookie' })
    }

    return manualFilters
  }, [columnFilters, activeFilter])

  const table = useReactTable({
    data: clubPlayers,
    columns: matrixColumns,
    state: { sorting, columnFilters: effectiveColumnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode: 'onChange',
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
    // Clear tile filter if user manually changes list filter
    if (activeFilter === 'rookie') setActiveFilter(null)
  }

  function clearTileFilter() {
    setActiveFilter(null)
  }

  // -- Render ----------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{club?.fullName} - Cap Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Salary cap overview and contract projections
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/contracts')}>
          Manage Contracts
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Clickable Tile Row (5 tiles)                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* Cap Space */}
        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => handleTileClick(null, capOverviewRef)}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground font-medium">Cap Space</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${capSpace < 0 ? 'text-red-500' : ''}`}>
              {capSpace < 0 ? '-' : ''}{formatSalary(Math.abs(capSpace))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {(capRatio * 100).toFixed(1)}% of {formatSalary(salaryCapAmount)} used
            </p>
          </CardContent>
        </Card>

        {/* Players Under Contract */}
        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => {
            setActiveFilter('all')
            matrixRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground font-medium">Players Under Contract</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{clubPlayers.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {seniorCount} senior / {rookieCount} rookie
            </p>
          </CardContent>
        </Card>

        {/* Expiring Contracts */}
        <Card
          className={`cursor-pointer transition-colors hover:bg-accent/50 ${
            activeFilter === 'expiring' ? 'ring-2 ring-amber-500/50' : ''
          }`}
          onClick={() => handleTileClick('expiring', matrixRef)}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground font-medium">Expiring Contracts</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{expiringPlayers.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatSalary(expiringAAV)} in expiring AAV
            </p>
          </CardContent>
        </Card>

        {/* Rookie Contracts */}
        <Card
          className={`cursor-pointer transition-colors hover:bg-accent/50 ${
            activeFilter === 'rookie' ? 'ring-2 ring-teal-500/50' : ''
          }`}
          onClick={() => handleTileClick('rookie', matrixRef)}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="h-4 w-4 text-teal-500" />
              <span className="text-xs text-muted-foreground font-medium">Rookie Contracts</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{rookieCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {rookieCount}/{settings.listRules.rookieListSize} spots filled
            </p>
          </CardContent>
        </Card>

        {/* Cap Projections */}
        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => handleTileClick(null, projectionsRef)}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground font-medium">Cap Projections</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${yr2Free < 0 ? 'text-red-500' : ''}`}>
              Yr2: {yr2Free < 0 ? '-' : ''}{formatSalary(Math.abs(yr2Free))} free
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {yr2ExpiringCount} player{yr2ExpiringCount !== 1 ? 's' : ''} off-contract next yr
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Salary Cap Progress Bar                                             */}
      {/* ------------------------------------------------------------------ */}
      <Card ref={capOverviewRef}>
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
      {/* List Size + Cap Health + Warnings                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* List Size */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1">
              <Users className="h-4 w-4" />
              List Composition
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Senior: {seniorCount}/{settings.listRules.seniorListSize}</span>
                <span>{Math.round((seniorCount / settings.listRules.seniorListSize) * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${seniorCount >= settings.listRules.seniorListSize ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min((seniorCount / settings.listRules.seniorListSize) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Rookie: {rookieCount}/{settings.listRules.rookieListSize}</span>
                <span>{Math.round((rookieCount / settings.listRules.rookieListSize) * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${rookieCount >= settings.listRules.rookieListSize ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min((rookieCount / settings.listRules.rookieListSize) * 100, 100)}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Total: {seniorCount + rookieCount}/{settings.listRules.seniorListSize + settings.listRules.rookieListSize}
            </p>
          </CardContent>
        </Card>

        {/* Cap Health */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1">
              <Shield className="h-4 w-4" />
              Cap Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${capHealthColor}`}>
              {capRatio >= 1.0 ? 'OVER' : capRatio >= 0.95 ? 'TIGHT' : capRatio >= 0.90 ? 'OK' : 'HEALTHY'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {(capRatio * 100).toFixed(1)}% of hard cap used
            </p>
            {softCapEnabled && (
              <p className="text-xs text-muted-foreground">
                Soft cap ceiling: {formatSalary(salaryCapAmount * 1.10)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Warnings / Luxury Tax */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {capWarnings.length === 0 && luxuryTax === 0 ? (
              <p className="text-sm text-muted-foreground">No salary cap alerts</p>
            ) : (
              <div className="space-y-2">
                {capWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-orange-600 dark:text-orange-400">{w}</p>
                  </div>
                ))}
                {softCapEnabled && luxuryTax > 0 && (
                  <div className="flex items-start gap-2">
                    <DollarSign className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600 dark:text-red-400">
                      Projected luxury tax: {formatSalary(luxuryTax)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Cap Projections Table                                               */}
      {/* ------------------------------------------------------------------ */}
      <Card ref={projectionsRef}>
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
      {/* Year-by-Year Contract Matrix                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card ref={matrixRef}>
        <CardHeader>
          <CardTitle>Contract Matrix</CardTitle>
          <CardDescription>
            Year-by-year salary commitments for all {clubPlayers.length} players
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filter bar */}
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

            {/* Active tile filter badge */}
            {activeFilter && activeFilter !== 'all' && (
              <Badge
                variant="secondary"
                className="gap-1 pl-2 pr-1 py-1 cursor-pointer"
                onClick={clearTileFilter}
              >
                {activeFilter === 'expiring' ? 'Expiring Only' : 'Rookies Only'}
                <X className="h-3 w-3" />
              </Badge>
            )}
          </div>

          {/* Matrix table with horizontal scroll */}
          <ScrollArea className="w-full">
            <div className="min-w-[900px]">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        // Hide the yearsRemaining filter column
                        if (header.id === 'yearsRemaining') return null
                        const isSticky = header.id === 'name' || header.id === 'position'
                        const stickyLeft = header.id === 'name' ? 'left-0' : header.id === 'position' ? 'left-[180px]' : ''
                        return (
                          <TableHead
                            key={header.id}
                            className={`whitespace-nowrap px-2 text-xs ${
                              isSticky ? `sticky ${stickyLeft} z-10 bg-background` : ''
                            } ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''}`}
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
                              ) : header.column.getCanSort() ? (
                                <ArrowUpDown className="h-3 w-3 opacity-30" />
                              ) : null}
                            </div>
                          </TableHead>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={matrixColumns.length - 1}
                        className="text-center text-muted-foreground py-8"
                      >
                        No players match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} className="text-sm">
                        {row.getVisibleCells().map((cell) => {
                          if (cell.column.id === 'yearsRemaining') return null
                          const isSticky = cell.column.id === 'name' || cell.column.id === 'position'
                          const stickyLeft = cell.column.id === 'name' ? 'left-0' : cell.column.id === 'position' ? 'left-[180px]' : ''
                          return (
                            <TableCell
                              key={cell.id}
                              className={`px-2 py-1.5 whitespace-nowrap ${
                                isSticky ? `sticky ${stickyLeft} z-10 bg-background` : ''
                              }`}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>

                {/* Footer summary rows */}
                {table.getRowModel().rows.length > 0 && (
                  <tfoot>
                    {/* Committed Spend */}
                    <tr className="border-t-2 border-border">
                      <td className="sticky left-0 z-10 bg-background px-2 py-1.5 text-xs font-semibold" colSpan={2}>
                        Committed Spend
                      </td>
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5" />
                      {Array.from({ length: MAX_YEAR_COLUMNS }, (_, offset) => (
                        <td key={`spend_${offset}`} className="px-2 py-1.5 text-xs tabular-nums font-medium">
                          {formatSalary(yearSummaries[offset].committedSpend)}
                        </td>
                      ))}
                      <td className="px-2 py-1.5" />
                    </tr>

                    {/* Cap */}
                    <tr>
                      <td className="sticky left-0 z-10 bg-background px-2 py-1.5 text-xs font-semibold" colSpan={2}>
                        Salary Cap
                      </td>
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5" />
                      {Array.from({ length: MAX_YEAR_COLUMNS }, (_, offset) => (
                        <td key={`cap_${offset}`} className="px-2 py-1.5 text-xs tabular-nums text-muted-foreground">
                          {formatSalary(salaryCapAmount)}
                        </td>
                      ))}
                      <td className="px-2 py-1.5" />
                    </tr>

                    {/* Cap Space */}
                    <tr>
                      <td className="sticky left-0 z-10 bg-background px-2 py-1.5 text-xs font-semibold" colSpan={2}>
                        Cap Space
                      </td>
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5" />
                      {Array.from({ length: MAX_YEAR_COLUMNS }, (_, offset) => {
                        const space = salaryCapAmount - yearSummaries[offset].committedSpend
                        return (
                          <td
                            key={`space_${offset}`}
                            className={`px-2 py-1.5 text-xs tabular-nums font-medium ${
                              space < 0 ? 'text-red-500' : 'text-green-500'
                            }`}
                          >
                            {space < 0 ? '-' : ''}{formatSalary(Math.abs(space))}
                          </td>
                        )
                      })}
                      <td className="px-2 py-1.5" />
                    </tr>

                    {/* Players Under Contract */}
                    <tr className="border-b border-border">
                      <td className="sticky left-0 z-10 bg-background px-2 py-1.5 text-xs font-semibold" colSpan={2}>
                        Players
                      </td>
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5" />
                      {Array.from({ length: MAX_YEAR_COLUMNS }, (_, offset) => (
                        <td key={`count_${offset}`} className="px-2 py-1.5 text-xs tabular-nums text-muted-foreground">
                          {yearSummaries[offset].playerCount}
                        </td>
                      ))}
                      <td className="px-2 py-1.5" />
                    </tr>
                  </tfoot>
                )}
              </Table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Footer text */}
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
