import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useGameStore } from '@/stores/gameStore'
import type { Player } from '@/types/player'
import { getLeadershipScore, getTeamLeadershipRating } from '@/engine/leadership/leadershipEngine'
import {
  getOverallRating,
  getPlayerStarRating,
  getPlayerTier,
  getPlayerTags,
  type PlayerTier,
  type PlayerTagKey,
} from '@/engine/player/playerRating'
import {
  getPlayerEligiblePositionTypes,
  isPlayerEligibleForPositionLine,
} from '@/engine/player/positionEligibility'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowUpDown, Shield } from 'lucide-react'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'

const columnHelper = createColumnHelper<Player>()

type SquadView = 'ratings' | 'stats' | 'contracts' | 'development'
type QuickFilter = 'all' | 'def' | 'mid' | 'fwd' | 'rk' | 'expiring' | 'injured'

type SquadPreset = {
  name: string
  view: SquadView
  quickFilter: QuickFilter
  search: string
  sorting: SortingState
}

const VIEW_OPTIONS: { key: SquadView; label: string }[] = [
  { key: 'ratings', label: 'Ratings' },
  { key: 'stats', label: 'Stats' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'development', label: 'Development' },
]

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: 'all', label: 'All Players' },
  { key: 'def', label: 'DEF' },
  { key: 'mid', label: 'MID' },
  { key: 'fwd', label: 'FWD' },
  { key: 'rk', label: 'RK' },
  { key: 'expiring', label: 'Expiring (1y)' },
  { key: 'injured', label: 'Injured Only' },
]

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
    case 'suspended': return 'bg-orange-500/15 text-orange-600 border-orange-500/30'
    case 'expiring': return 'bg-amber-500/15 text-amber-600 border-amber-500/30'
    case 'unhappy': return 'bg-orange-500/15 text-orange-600 border-orange-500/30'
    case 'high-potential': return 'bg-blue-500/15 text-blue-600 border-blue-500/30'
    case 'ageing': return 'bg-purple-500/15 text-purple-600 border-purple-500/30'
    case 'trade-listed': return 'bg-rose-500/15 text-rose-600 border-rose-500/30'
  }
}

function safeAvg(total: number, games: number): string {
  if (games <= 0) return '0.0'
  return (total / games).toFixed(1)
}

function NameCell({ playerId, name, leadershipRole }: { playerId: string; name: string; leadershipRole?: 'C' | 'VC' | 'LG' }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-1.5">
      <button
        className="font-medium text-left hover:underline hover:text-primary cursor-pointer"
        onClick={() => navigate(`/player/${playerId}`)}
      >
        {name}
      </button>
      {leadershipRole === 'C' && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/15 text-amber-600 border-amber-500/30">C</Badge>
      )}
      {leadershipRole === 'VC' && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-500/15 text-blue-600 border-blue-500/30">VC</Badge>
      )}
      {leadershipRole === 'LG' && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-slate-500/15 text-slate-500 border-slate-500/30">LG</Badge>
      )}
    </div>
  )
}

function buildColumns(view: SquadView, reservesStatsByPlayer: Record<string, { gamesPlayed: number }>) {
  const base = [
    columnHelper.accessor('jerseyNumber', { header: '#', size: 44 }),
    columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
      id: 'name',
      header: 'Name',
      cell: (info) => {
        const meta = info.table.options.meta as { leadershipRoleMap?: Record<string, 'C' | 'VC' | 'LG'> } | undefined
        const role = meta?.leadershipRoleMap?.[info.row.original.id]
        return <NameCell playerId={info.row.original.id} name={info.getValue()} leadershipRole={role} />
      },
      size: 210,
    }),
    columnHelper.accessor((row) => row.position.primary, {
      id: 'position',
      header: 'Pos',
      cell: (info) => (
        <Badge
          variant="outline"
          title={getPlayerEligiblePositionTypes(info.row.original).join(', ')}
        >
          {info.getValue()}
        </Badge>
      ),
      size: 62,
    }),
    columnHelper.accessor((row) => getOverallRating(row), {
      id: 'ovr',
      header: 'OVR',
      cell: (info) => {
        const ovr = info.getValue()
        const tier = getPlayerTier(ovr)
        return (
          <div className="flex items-center gap-2">
            <PlayerStarRating stars={getPlayerStarRating(info.row.original, ovr)} />
            <span className={`font-semibold tabular-nums ${tierColor(tier)}`}>{ovr}</span>
          </div>
        )
      },
      size: 128,
    }),
    columnHelper.accessor('age', { header: 'Age', size: 54 }),
  ]

  const status = [
    columnHelper.accessor((row) => row.injury?.weeksRemaining ?? 0, {
      id: 'status',
      header: 'Status',
      cell: (info) => {
        const p = info.row.original
        if ((p.suspension?.weeksRemaining ?? 0) > 0) {
          return (
            <Badge variant="outline" className="text-[10px] border-orange-500/30 bg-orange-500/15 text-orange-700">
              Susp ({p.suspension?.weeksRemaining ?? 0}w)
            </Badge>
          )
        }
        if (!p.injury) return <span className="text-xs text-muted-foreground">Fit</span>
        return (
          <Badge variant="outline" className="text-[10px] border-red-500/30 bg-red-500/15 text-red-600">
            {p.injury.type} ({p.injury.weeksRemaining}w)
          </Badge>
        )
      },
      size: 120,
    }),
  ]

  if (view === 'ratings') {
    return [
      ...base,
      ...status,
      columnHelper.accessor((row) => row.attributes.kickingEfficiency, { id: 'kick', header: 'Kick', cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>, size: 52 }),
      columnHelper.accessor((row) => row.attributes.markingOverhead, { id: 'mark', header: 'Mark', cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>, size: 52 }),
      columnHelper.accessor((row) => row.attributes.tackling, { id: 'tack', header: 'Tck', cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>, size: 52 }),
      columnHelper.accessor((row) => row.attributes.speed, { id: 'spd', header: 'Spd', cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>, size: 52 }),
      columnHelper.accessor((row) => row.attributes.endurance, { id: 'end', header: 'End', cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>, size: 52 }),
      columnHelper.accessor((row) => row.attributes.disposalDecision, { id: 'dec', header: 'Dec', cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>, size: 52 }),
      columnHelper.accessor('morale', { header: 'Mor', cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>, size: 52 }),
      columnHelper.accessor('fitness', { header: 'Fit', cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>, size: 52 }),
      columnHelper.accessor('form', { header: 'Form', cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>, size: 52 }),
    ]
  }

  if (view === 'stats') {
    return [
      ...base,
      columnHelper.accessor((row) => row.seasonStats.gamesPlayed, {
        id: 'gp_sc',
        header: 'GP S/C',
        cell: (i) => <span className="text-xs tabular-nums">{i.row.original.seasonStats.gamesPlayed}/{i.row.original.careerStats.gamesPlayed}</span>,
        size: 72,
      }),
      columnHelper.accessor((row) => row.seasonStats.disposals, {
        id: 'disp_ctx',
        header: 'Disp S/C Avg',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{safeAvg(p.seasonStats.disposals, p.seasonStats.gamesPlayed)} / {safeAvg(p.careerStats.disposals, p.careerStats.gamesPlayed)}</span>
        },
        size: 110,
      }),
      columnHelper.accessor((row) => row.seasonStats.goals, {
        id: 'goals_ctx',
        header: 'Goals S/C Avg',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{safeAvg(p.seasonStats.goals, p.seasonStats.gamesPlayed)} / {safeAvg(p.careerStats.goals, p.careerStats.gamesPlayed)}</span>
        },
        size: 110,
      }),
      columnHelper.accessor((row) => row.seasonStats.tackles, {
        id: 'tack_ctx',
        header: 'Tck S/C Avg',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{safeAvg(p.seasonStats.tackles, p.seasonStats.gamesPlayed)} / {safeAvg(p.careerStats.tackles, p.careerStats.gamesPlayed)}</span>
        },
        size: 108,
      }),
      columnHelper.accessor((row) => row.seasonStats.aflFantasyPoints, {
        id: 'af_ctx',
        header: 'AF S/C Avg',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{safeAvg(p.seasonStats.aflFantasyPoints, p.seasonStats.gamesPlayed)} / {safeAvg(p.careerStats.aflFantasyPoints, p.careerStats.gamesPlayed)}</span>
        },
        size: 108,
      }),
      columnHelper.accessor((row) => row.seasonStats.superCoachPoints, {
        id: 'sc_ctx',
        header: 'SC S/C Avg',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{safeAvg(p.seasonStats.superCoachPoints, p.seasonStats.gamesPlayed)} / {safeAvg(p.careerStats.superCoachPoints, p.careerStats.gamesPlayed)}</span>
        },
        size: 108,
      }),
      ...status,
    ]
  }

  if (view === 'contracts') {
    return [
      ...base,
      columnHelper.accessor((row) => row.contract.yearsRemaining, { id: 'years', header: 'Years', size: 62 }),
      columnHelper.accessor((row) => row.contract.aav, {
        id: 'aav',
        header: 'AAV',
        cell: (i) => <span className="text-xs tabular-nums">${Math.round(i.getValue() / 1000)}k</span>,
        size: 86,
      }),
      columnHelper.accessor((row) => row.contract.aav * row.contract.yearsRemaining, {
        id: 'remaining_value',
        header: 'Total Remaining',
        cell: (i) => <span className="text-xs tabular-nums">${Math.round(i.getValue() / 1000)}k</span>,
        size: 112,
      }),
      columnHelper.accessor((row) => row.isRookie, {
        id: 'list',
        header: 'List',
        cell: (i) => <Badge variant={i.getValue() ? 'secondary' : 'default'}>{i.getValue() ? 'Rookie' : 'Senior'}</Badge>,
        size: 76,
      }),
      columnHelper.accessor((row) => getPlayerTags(row).length, {
        id: 'tags',
        header: 'Tags',
        cell: (i) => {
          const tags = getPlayerTags(i.row.original)
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
        size: 220,
      }),
    ]
  }

  return [
    ...base,
    columnHelper.accessor((row) => row.hiddenAttributes.potentialCeiling, {
      id: 'pot',
      header: 'Potential',
      cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>,
      size: 84,
    }),
    columnHelper.accessor((row) => row.hiddenAttributes.developmentRate, {
      id: 'dev_rate',
      header: 'Dev Rate',
      cell: (i) => <span className="text-xs tabular-nums">{i.getValue().toFixed(2)}x</span>,
      size: 86,
    }),
    columnHelper.accessor((row) => row.hiddenAttributes.peakAgeStart, {
      id: 'peak_window',
      header: 'Peak Window',
      cell: (i) => {
        const p = i.row.original
        return <span className="text-xs tabular-nums">{p.hiddenAttributes.peakAgeStart}-{p.hiddenAttributes.peakAgeEnd}</span>
      },
      size: 90,
    }),
    columnHelper.accessor((row) => {
      const start = row.hiddenAttributes.peakAgeStart
      const end = row.hiddenAttributes.peakAgeEnd
      if (row.age < start) return 'Pre-peak'
      if (row.age > end) return 'Post-peak'
      return 'Prime'
    }, {
      id: 'stage',
      header: 'Stage',
      size: 84,
    }),
    columnHelper.accessor((row) => reservesStatsByPlayer[row.id]?.gamesPlayed ?? 0, {
      id: 'res_gp',
      header: 'Res GP',
      size: 64,
    }),
    columnHelper.accessor('form', { header: 'Form', cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>, size: 58 }),
    columnHelper.accessor('morale', { header: 'Morale', cell: (i) => <span className={attrColor(i.getValue())}>{i.getValue()}</span>, size: 62 }),
    ...status,
  ]
}

export function SquadPage() {
  const { clubId: routeClubId } = useParams<{ clubId?: string }>()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const reserves = useGameStore((s) => s.reserves)

  const clubId = routeClubId ?? playerClubId
  const club = clubs[clubId]
  const leadership = club?.leadership
  const clubPlayers = useMemo(() => Object.values(players).filter((p) => p.clubId === clubId), [players, clubId])

  const leadershipRoleMap = useMemo(() => {
    const map: Record<string, 'C' | 'VC' | 'LG'> = {}
    if (!leadership) return map
    if (leadership.captainId) map[leadership.captainId] = 'C'
    if (leadership.viceCaptainId) map[leadership.viceCaptainId] = 'VC'
    for (const id of leadership.leadershipGroupIds) map[id] = 'LG'
    return map
  }, [leadership])

  const leadershipCardData = useMemo(() => {
    if (!leadership) return null
    const captain = leadership.captainId ? players[leadership.captainId] : null
    const vc = leadership.viceCaptainId ? players[leadership.viceCaptainId] : null
    const group = leadership.leadershipGroupIds.map((id) => players[id]).filter(Boolean)
    return { captain, vc, group, teamRating: getTeamLeadershipRating(clubPlayers, leadership) }
  }, [leadership, players, clubPlayers])

  const [view, setView] = useState<SquadView>('ratings')
  const [sorting, setSorting] = useState<SortingState>([])
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<SquadPreset[]>([])

  const presetKey = `afl_squad_presets_${clubId}`
  useEffect(() => {
    try {
      const raw = localStorage.getItem(presetKey)
      setPresets(raw ? (JSON.parse(raw) as SquadPreset[]) : [])
    } catch {
      setPresets([])
    }
  }, [presetKey])

  const savePresets = (next: SquadPreset[]) => {
    setPresets(next)
    localStorage.setItem(presetKey, JSON.stringify(next))
  }

  const columns = useMemo(() => buildColumns(view, reserves.seasonStatsByPlayer), [view, reserves.seasonStatsByPlayer])

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clubPlayers.filter((p) => {
      if (q && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) return false

      if (quickFilter === 'def' && !isPlayerEligibleForPositionLine(p, 'DEF')) return false
      if (quickFilter === 'mid' && !isPlayerEligibleForPositionLine(p, 'MID')) return false
      if (quickFilter === 'fwd' && !isPlayerEligibleForPositionLine(p, 'FWD')) return false
      if (quickFilter === 'rk' && !isPlayerEligibleForPositionLine(p, 'RK')) return false
      if (quickFilter === 'expiring' && p.contract.yearsRemaining !== 1) return false
      if (quickFilter === 'injured' && p.injury === null) return false
      return true
    })
  }, [clubPlayers, search, quickFilter])

  const table = useReactTable({
    data: filteredPlayers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    meta: { leadershipRoleMap },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const applyPreset = (name: string) => {
    const p = presets.find((x) => x.name === name)
    if (!p) return
    setView(p.view)
    setQuickFilter(p.quickFilter)
    setSearch(p.search)
    setSorting(p.sorting)
  }

  const handleSavePreset = () => {
    const name = presetName.trim()
    if (!name) return
    const nextPreset: SquadPreset = { name, view, quickFilter, search, sorting }
    const next = [...presets.filter((p) => p.name !== name), nextPreset].sort((a, b) => a.name.localeCompare(b.name))
    savePresets(next)
    setPresetName('')
  }

  const handleDeletePreset = (name: string) => {
    savePresets(presets.filter((p) => p.name !== name))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{club?.fullName} - Squad</h1>
          <p className="text-sm text-muted-foreground">
            {filteredPlayers.length} players{filteredPlayers.length !== clubPlayers.length ? ` (of ${clubPlayers.length})` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {VIEW_OPTIONS.map((v) => (
            <Button key={v.key} size="sm" variant={view === v.key ? 'default' : 'outline'} onClick={() => setView(v.key)}>
              {v.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Leadership Group</h3>
              {leadershipCardData && (
                <Badge variant="outline" className="ml-auto text-xs">Team Rating: {leadershipCardData.teamRating}</Badge>
              )}
            </div>
            {leadershipCardData ? (
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                {leadershipCardData.captain && (
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Captain</span>
                    <span className="font-medium">{leadershipCardData.captain.firstName} {leadershipCardData.captain.lastName}</span>
                    <span className="text-xs text-muted-foreground">{leadershipCardData.captain.position.primary} · Age {leadershipCardData.captain.age} · LS {getLeadershipScore(leadershipCardData.captain)}</span>
                  </div>
                )}
                {leadershipCardData.vc && (
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Vice-Captain</span>
                    <span className="font-medium">{leadershipCardData.vc.firstName} {leadershipCardData.vc.lastName}</span>
                    <span className="text-xs text-muted-foreground">{leadershipCardData.vc.position.primary} · Age {leadershipCardData.vc.age} · LS {getLeadershipScore(leadershipCardData.vc)}</span>
                  </div>
                )}
                {leadershipCardData.group.length > 0 && (
                  <div className="col-span-2 flex flex-col">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Leadership Group</span>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {leadershipCardData.group.map((p) => (
                        <span key={p.id} className="text-xs">{p.firstName} {p.lastName}<span className="text-muted-foreground"> ({p.position.primary}, LS {getLeadershipScore(p)})</span></span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No leadership group assigned.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Filters, Sorting, Presets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_FILTERS.map((f) => (
                <Button key={f.key} variant={quickFilter === f.key ? 'default' : 'outline'} size="sm" onClick={() => setQuickFilter(f.key)}>
                  {f.label}
                </Button>
              ))}
            </div>
            <Input className="h-8 text-xs" placeholder="Search player..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-8 w-44 text-xs" placeholder="Preset name..." value={presetName} onChange={(e) => setPresetName(e.target.value)} />
              <Button size="sm" onClick={handleSavePreset}>Save Preset</Button>
              <Select onValueChange={applyPreset}>
                <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder="Load preset..." /></SelectTrigger>
                <SelectContent>
                  {presets.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select onValueChange={handleDeletePreset}>
                <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder="Delete preset..." /></SelectTrigger>
                <SelectContent>
                  {presets.map((p) => <SelectItem key={`del-${p.name}`} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
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
                            header.column.getIsSorted() === 'asc' ? ' ?' : ' ?'
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
                        <TableCell key={cell.id} className="whitespace-nowrap px-2 py-1.5">
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








