import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import {
  getOverallRating,
  getStarRating,
  getPlayerTier,
  getPlayerTags,
  type PlayerTier,
  type PlayerTagKey,
} from '@/engine/player/playerRating'
import { POSITION_LINE } from '@/engine/core/constants'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowUpDown, Star, StarHalf } from 'lucide-react'

const columnHelper = createColumnHelper<Player>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function attrColor(val: number): string {
  if (val >= 80) return 'text-green-500'
  if (val >= 65) return 'text-emerald-400'
  if (val >= 50) return 'text-yellow-500'
  if (val >= 35) return 'text-orange-500'
  return 'text-red-500'
}

function tierColor(tier: PlayerTier): string {
  switch (tier) {
    case 'elite': return 'text-green-500'
    case 'good': return 'text-emerald-400'
    case 'average': return 'text-yellow-500'
    case 'developing': return 'text-orange-500'
    case 'poor': return 'text-red-500'
  }
}

function tierBorder(tier: PlayerTier): string {
  switch (tier) {
    case 'elite': return 'border-l-2 border-l-green-500'
    case 'good': return 'border-l-2 border-l-emerald-400'
    case 'poor': return 'border-l-2 border-l-red-500'
    default: return ''
  }
}

function tagStyle(key: PlayerTagKey): string {
  switch (key) {
    case 'injured': return 'bg-red-500/15 text-red-600 border-red-500/30'
    case 'expiring': return 'bg-amber-500/15 text-amber-600 border-amber-500/30'
    case 'unhappy': return 'bg-orange-500/15 text-orange-600 border-orange-500/30'
    case 'high-potential': return 'bg-blue-500/15 text-blue-600 border-blue-500/30'
    case 'ageing': return 'bg-purple-500/15 text-purple-600 border-purple-500/30'
    case 'trade-listed': return 'bg-rose-500/15 text-rose-600 border-rose-500/30'
  }
}

function StarDisplay({ stars }: { stars: number }) {
  const fullStars = Math.floor(stars)
  const hasHalf = stars % 1 !== 0
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0)

  return (
    <div className="flex items-center gap-px">
      {Array.from({ length: fullStars }, (_, i) => (
        <Star key={`f${i}`} className="h-3.5 w-3.5 fill-current text-amber-400" />
      ))}
      {hasHalf && <StarHalf className="h-3.5 w-3.5 fill-current text-amber-400" />}
      {Array.from({ length: emptyStars }, (_, i) => (
        <Star key={`e${i}`} className="h-3.5 w-3.5 text-muted-foreground/30" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const columns = [
  columnHelper.accessor('jerseyNumber', {
    header: '#',
    cell: (info) => info.getValue(),
    size: 40,
  }),
  columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
    id: 'name',
    header: 'Name',
    cell: (info) => (
      <NameCell playerId={info.row.original.id} name={info.getValue()} />
    ),
    size: 180,
  }),
  columnHelper.accessor((row) => getOverallRating(row), {
    id: 'ovr',
    header: 'OVR',
    cell: (info) => {
      const overall = info.getValue()
      const tier = getPlayerTier(overall)
      return (
        <div className="flex items-center gap-2">
          <StarDisplay stars={getStarRating(overall)} />
          <span className={`font-semibold tabular-nums ${tierColor(tier)}`}>{overall}</span>
        </div>
      )
    },
    size: 130,
  }),
  columnHelper.accessor('age', {
    header: 'Age',
    size: 50,
  }),
  columnHelper.accessor((row) => row.position.primary, {
    id: 'position',
    header: 'Pos',
    cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
    size: 60,
  }),
  columnHelper.accessor(
    (row) => getPlayerTags(row).length,
    {
      id: 'tags',
      header: 'Tags',
      cell: (info) => {
        const tags = getPlayerTags(info.row.original)
        if (tags.length === 0) return null
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag.key} variant="outline" className={`text-[10px] px-1.5 py-0 ${tagStyle(tag.key)}`}>
                {tag.label}
              </Badge>
            ))}
          </div>
        )
      },
      size: 180,
    },
  ),
  columnHelper.accessor((row) => row.attributes.kickingEfficiency, {
    id: 'kick',
    header: 'Kick',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor((row) => row.attributes.handballEfficiency, {
    id: 'hb',
    header: 'HB',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor((row) => row.attributes.markingOverhead, {
    id: 'mark',
    header: 'Mark',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor((row) => row.attributes.speed, {
    id: 'spd',
    header: 'Spd',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor((row) => row.attributes.endurance, {
    id: 'end',
    header: 'End',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor((row) => row.attributes.strength, {
    id: 'str',
    header: 'Str',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor((row) => row.attributes.tackling, {
    id: 'tck',
    header: 'Tck',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor((row) => row.attributes.disposalDecision, {
    id: 'dec',
    header: 'Dec',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor((row) => row.attributes.goalkicking, {
    id: 'goal',
    header: 'Goal',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor('morale', {
    header: 'Mor',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor('fitness', {
    header: 'Fit',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor('form', {
    header: 'Form',
    cell: (info) => <span className={attrColor(info.getValue())}>{info.getValue()}</span>,
    size: 50,
  }),
  columnHelper.accessor((row) => row.contract.aav, {
    id: 'contract',
    header: 'Contract',
    cell: (info) => {
      const p = info.row.original
      const yrs = p.contract.yearsRemaining
      const aavK = Math.round(p.contract.aav / 1000)
      return (
        <span className="tabular-nums text-xs text-muted-foreground">
          {yrs}yr / ${aavK}k
        </span>
      )
    },
    size: 90,
  }),
  columnHelper.accessor((row) => row.isRookie, {
    id: 'list',
    header: 'List',
    cell: (info) => (
      <Badge variant={info.getValue() ? 'secondary' : 'default'}>
        {info.getValue() ? 'Rookie' : 'Senior'}
      </Badge>
    ),
    size: 70,
  }),
]

// ---------------------------------------------------------------------------
// Sub-components
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
// Quick filters
// ---------------------------------------------------------------------------

type QuickFilter = 'all' | 'stars' | 'worst' | 'expiring' | 'must-re-sign'

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'stars', label: 'Stars' },
  { key: 'worst', label: 'Worst' },
  { key: 'expiring', label: 'Expiring' },
  { key: 'must-re-sign', label: 'Must Re-Sign' },
]

const POSITION_OPTIONS = ['_all', 'DEF', 'MID', 'FWD', 'RK'] as const

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SquadPage() {
  const { clubId: routeClubId } = useParams<{ clubId?: string }>()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)

  const clubId = routeClubId ?? playerClubId
  const club = clubs[clubId]
  const clubPlayers = useMemo(
    () => Object.values(players).filter((p) => p.clubId === clubId),
    [players, clubId]
  )

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [posFilter, setPosFilter] = useState<string>('_all')

  const filteredPlayers = useMemo(() => {
    let result = clubPlayers

    // Position filter
    if (posFilter !== '_all') {
      result = result.filter(
        (p) => POSITION_LINE[p.position.primary] === posFilter,
      )
    }

    // Quick filter
    switch (quickFilter) {
      case 'stars':
        result = result.filter((p) => getOverallRating(p) >= 75)
        break
      case 'worst':
        result = result.filter((p) => getOverallRating(p) < 50)
        break
      case 'expiring':
        result = result.filter((p) => p.contract.yearsRemaining === 1)
        break
      case 'must-re-sign':
        result = result.filter(
          (p) => p.contract.yearsRemaining === 1 && getOverallRating(p) >= 65,
        )
        break
    }

    return result
  }, [clubPlayers, quickFilter, posFilter])

  function handleQuickFilter(key: QuickFilter) {
    setQuickFilter(key)
    // Auto-set sorting based on filter
    if (key === 'worst') {
      setSorting([{ id: 'ovr', desc: false }])
    } else if (key === 'stars' || key === 'must-re-sign' || key === 'expiring') {
      setSorting([{ id: 'ovr', desc: true }])
    }
  }

  const table = useReactTable({
    data: filteredPlayers,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{club?.fullName} - Squad</h1>
          <p className="text-sm text-muted-foreground">
            {filteredPlayers.length} players
            {filteredPlayers.length !== clubPlayers.length && ` (of ${clubPlayers.length})`}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={quickFilter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleQuickFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
        <Select value={posFilter} onValueChange={setPosFilter}>
          <SelectTrigger size="sm" className="w-24">
            <SelectValue placeholder="Position" />
          </SelectTrigger>
          <SelectContent>
            {POSITION_OPTIONS.map((pos) => (
              <SelectItem key={pos} value={pos}>
                {pos === '_all' ? 'All' : pos}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search players..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
      </div>

      <Card>
        <CardContent className="p-0">
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
                          {flexRender(header.column.columnDef.header, header.getContext())}
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
                {table.getRowModel().rows.map((row) => {
                  const tier = getPlayerTier(getOverallRating(row.original))
                  return (
                    <TableRow key={row.id} className={`text-sm ${tierBorder(tier)}`}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="px-2 py-1.5 whitespace-nowrap">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
