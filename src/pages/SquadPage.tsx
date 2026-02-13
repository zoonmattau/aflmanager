import { useMemo, useState } from 'react'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowUpDown } from 'lucide-react'

const columnHelper = createColumnHelper<Player>()

function attrColor(val: number): string {
  if (val >= 80) return 'text-green-500'
  if (val >= 65) return 'text-emerald-400'
  if (val >= 50) return 'text-yellow-500'
  if (val >= 35) return 'text-orange-500'
  return 'text-red-500'
}

const columns = [
  columnHelper.accessor('jerseyNumber', {
    header: '#',
    cell: (info) => info.getValue(),
    size: 40,
  }),
  columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
    id: 'name',
    header: 'Name',
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    size: 180,
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
  columnHelper.accessor('height', {
    header: 'Ht',
    cell: (info) => `${info.getValue()}cm`,
    size: 60,
  }),
  columnHelper.accessor('weight', {
    header: 'Wt',
    cell: (info) => `${info.getValue()}kg`,
    size: 60,
  }),
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

export function SquadPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)

  const club = clubs[playerClubId]
  const clubPlayers = useMemo(
    () => Object.values(players).filter((p) => p.clubId === playerClubId),
    [players, playerClubId]
  )

  const [sorting, setSorting] = useState<SortingState>([])
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{club?.fullName} - Squad</h1>
          <p className="text-sm text-muted-foreground">
            {clubPlayers.length} players on list
          </p>
        </div>
        <Input
          placeholder="Search players..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
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
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="text-sm">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-2 py-1.5 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
