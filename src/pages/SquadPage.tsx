import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useGameStore } from '@/stores/gameStore'
import { useTableViewManager, type TableViewColumnConfig } from '@/components/table-view/useTableViewManager'
import { TableViewManagerControl } from '@/components/table-view/TableViewManagerControl'
import type { LineupSlot, Player } from '@/types/player'
import { getLeadershipScore, getTeamLeadershipRating } from '@/engine/leadership/leadershipEngine'
import {
  getOverallRating,
  getPlayerPositionRating,
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
import { isPlayerSuspended } from '@/engine/players/availability'
import { getLineupSlots, SLOT_POSITION_COMPATIBILITY } from '@/engine/core/constants'
import { canBeSelectedForAfl, hasActiveStateLeagueContract, isStateLeagueContracted } from '@/engine/players/contracts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, ArrowUpDown, Shield } from 'lucide-react'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { getPositionBadgeClass, getPositionFilterButtonClass } from '@/lib/positionColor'

const columnHelper = createColumnHelper<Player>()

type SquadView = 'ratings' | 'stats' | 'contracts' | 'development'
type QuickFilter = 'all' | 'def' | 'mid' | 'fwd' | 'rk' | 'expiring' | 'injured'
type AssignmentSlot = LineupSlot | `RES:${LineupSlot}` | 'SUB' | 'REST' | 'UNASSIGNED'

interface AssignmentSlotOption {
  slot: AssignmentSlot
  occupantLabel: string
  occupantRating: number | null
  occupiedBySelf: boolean
  projectedRating: number
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

function isReservesSlot(slot: AssignmentSlot): slot is `RES:${LineupSlot}` {
  return slot.startsWith('RES:')
}

function decodeReservesSlot(slot: `RES:${LineupSlot}`): LineupSlot {
  return slot.slice(4) as LineupSlot
}

function NameCell({ playerId, name, leadershipRole }: { playerId: string; name: string; leadershipRole?: 'C' | 'VC' | 'LG' }) {
  return (
    <div className="flex items-center gap-1.5">
      <Link
        className="font-medium text-left hover:underline hover:text-primary cursor-pointer"
        to={`/player/${encodeURIComponent(playerId)}`}
      >
        {name}
      </Link>
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

function buildColumns(
  view: SquadView,
  reservesStatsByPlayer: Record<string, { gamesPlayed: number }>,
  assignment?: {
    enabled: boolean
    getAssignedSlot: (playerId: string) => AssignmentSlot | null
    getSlotOptions: (player: Player) => AssignmentSlotOption[]
    onChangeAssignedSlot: (playerId: string, slot: string) => void
  },
) {
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
          className={getPositionBadgeClass(info.getValue())}
          title={getPlayerEligiblePositionTypes(info.row.original).join(', ')}
        >
          {info.getValue()}
        </Badge>
      ),
      size: 62,
    }),
    columnHelper.display({
      id: 'assigned_slot',
      header: 'Assigned Position',
      cell: (info) => {
        if (!assignment?.enabled) return <span className="text-xs text-muted-foreground">-</span>
        const player = info.row.original
        const assignedSlot = assignment.getAssignedSlot(player.id) ?? 'UNASSIGNED'
        const slotOptions = assignment.getSlotOptions(player)
        return (
          <Select
            value={assignedSlot ?? undefined}
            onValueChange={(slot) => assignment.onChangeAssignedSlot(player.id, slot)}
          >
            <SelectTrigger
              className={`h-7 w-[120px] text-xs ${
                assignedSlot === 'UNASSIGNED'
                  ? 'border-red-500/60 bg-red-500/10 text-red-700 focus-visible:ring-red-500/30'
                  : ''
              }`}
            >
              <SelectValue placeholder="Assign slot..." />
            </SelectTrigger>
              <SelectContent>
                {slotOptions.map((slotOption) => (
                  <SelectItem
                    key={`${player.id}-${slotOption.slot}`}
                    value={slotOption.slot}
                    className={slotOption.slot === 'UNASSIGNED' ? 'bg-red-500/10 text-red-700 focus:bg-red-500/20' : undefined}
                  >
                    <div className="leading-tight">
                      <div className="font-medium">
                        {slotOption.occupiedBySelf
                        ? slotOption.slot
                        : slotOption.occupantRating !== null
                          ? `${slotOption.slot} - ${slotOption.occupantLabel} - ${slotOption.occupantRating}`
                          : `${slotOption.slot} - ${slotOption.occupantLabel}`}
                    </div>
                    {!slotOption.occupiedBySelf && slotOption.occupantRating !== null && (
                      <div className="text-[10px] text-muted-foreground">
                        {`${player.firstName} ${player.lastName} - ${slotOption.projectedRating}`}
                      </div>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      },
      size: 280,
    }),
    columnHelper.accessor((row) => getOverallRating(row), {
      id: 'ovr',
      header: 'OVR',
      cell: (info) => {
        const ovr = info.getValue()
        const tier = getPlayerTier(ovr)
        return (
          <div className="flex items-center gap-2">
            <PlayerStarRating stars={getPlayerStarRating(info.row.original, ovr)} player={info.row.original} overall={ovr} />
            <span className={`font-semibold tabular-nums ${tierColor(tier)}`}>{ovr}</span>
          </div>
        )
      },
      size: 128,
    }),
    columnHelper.accessor('age', { header: 'Age', size: 54 }),
    columnHelper.accessor((row) => row.careerStats.gamesPlayed, {
      id: 'afl_gp',
      header: 'AFL GP',
      size: 68,
    }),
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
  const settings = useGameStore((s) => s.settings)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const setSelectedLineup = useGameStore((s) => s.setSelectedLineup)
  const selectedSubstituteId = useGameStore((s) => s.selectedSubstituteId)
  const setSelectedSubstitute = useGameStore((s) => s.setSelectedSubstitute)
  const setManagedReservesLineup = useGameStore((s) => s.setManagedReservesLineup)
  const setManagedReservesLineupSlots = useGameStore((s) => s.setManagedReservesLineupSlots)
  const setReservesPlayerAvailability = useGameStore((s) => s.setReservesPlayerAvailability)

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
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')

  const lineupSlots = useMemo(
    () => getLineupSlots(settings.matchRules.interchangePlayers),
    [settings.matchRules.interchangePlayers],
  )
  const lineupSlotSet = useMemo(() => new Set<LineupSlot>(lineupSlots), [lineupSlots])
  const sanitizedSelectedLineup = useMemo(() => {
    const next: Record<LineupSlot, string> = {} as Record<LineupSlot, string>
    const used = new Set<string>()
    const raw = selectedLineup ?? {}
    for (const [slot, playerId] of Object.entries(raw) as Array<[LineupSlot, string]>) {
      if (!lineupSlotSet.has(slot)) continue
      if (!playerId || used.has(playerId)) continue
      const player = players[playerId]
      if (!player || player.clubId !== clubId) continue
      if (!canBeSelectedForAfl(player)) continue
      next[slot] = playerId
      used.add(playerId)
    }
    return next
  }, [selectedLineup, lineupSlotSet, players, clubId])
  const assignedSlotByPlayer = useMemo(() => {
    const map = new Map<string, AssignmentSlot>()
    for (const [slot, playerId] of Object.entries(sanitizedSelectedLineup)) {
      map.set(playerId, slot as LineupSlot)
    }
    for (const [slot, playerId] of Object.entries(reserves.managedLineupSlotAssignments ?? {}) as Array<[LineupSlot, string]>) {
      if (!lineupSlotSet.has(slot)) continue
      if (!playerId || map.has(playerId)) continue
      const player = players[playerId]
      if (!player || player.clubId !== clubId) continue
      map.set(playerId, `RES:${slot}`)
    }
    if (settings.matchRules.enableSubstitutes && selectedSubstituteId) {
      const subPlayer = players[selectedSubstituteId]
      const alreadySelected = Object.values(sanitizedSelectedLineup).includes(selectedSubstituteId)
      if (subPlayer && subPlayer.clubId === clubId && !alreadySelected) {
        map.set(selectedSubstituteId, 'SUB')
      }
    }
    for (const player of clubPlayers) {
      if (map.has(player.id)) continue
      if ((reserves.playerAvailabilityAssignments[player.id] ?? 'play') === 'rest') {
        map.set(player.id, 'REST')
      }
    }
    return map
  }, [
    clubId,
    clubPlayers,
    lineupSlotSet,
    players,
    reserves.managedLineupSlotAssignments,
    reserves.playerAvailabilityAssignments,
    sanitizedSelectedLineup,
    selectedSubstituteId,
    settings.matchRules.enableSubstitutes,
  ])

  const unassignedErrorPlayerIds = useMemo(() => {
    if (clubId !== playerClubId) return new Set<string>()
    const ids = new Set<string>()
    for (const player of clubPlayers) {
      if (player.injury || isPlayerSuspended(player)) continue
      if (isStateLeagueContracted(player) && !hasActiveStateLeagueContract(player)) continue
      const availability = reserves.playerAvailabilityAssignments[player.id] ?? 'play'
      if (availability === 'rest') continue
      const assignedSlot = assignedSlotByPlayer.get(player.id) ?? 'UNASSIGNED'
      if (assignedSlot === 'UNASSIGNED') ids.add(player.id)
    }
    return ids
  }, [assignedSlotByPlayer, clubId, clubPlayers, playerClubId, reserves.playerAvailabilityAssignments])

  const sanitizedReservesLineup = useMemo(() => {
    const next: Partial<Record<LineupSlot, string>> = {}
    const selectedSet = new Set(Object.values(sanitizedSelectedLineup))
    const used = new Set<string>()
    for (const [slot, playerId] of Object.entries(reserves.managedLineupSlotAssignments ?? {}) as Array<[LineupSlot, string]>) {
      if (!lineupSlotSet.has(slot)) continue
      if (!playerId || used.has(playerId) || selectedSet.has(playerId)) continue
      const player = players[playerId]
      if (!player || player.clubId !== clubId) continue
      next[slot] = playerId
      used.add(playerId)
    }
    return next
  }, [clubId, lineupSlotSet, players, reserves.managedLineupSlotAssignments, sanitizedSelectedLineup])

  const getPlayerSlotProjection = useCallback((player: Player, slot: AssignmentSlot): { rating: number } => {
    if (slot === 'SUB' || slot === 'REST' || slot === 'UNASSIGNED') {
      return { rating: getOverallRating(player) }
    }
    const lineupSlot = isReservesSlot(slot) ? decodeReservesSlot(slot) : slot
    if (lineupSlot.startsWith('I')) {
      return { rating: getOverallRating(player) }
    }
    const slotCompat = SLOT_POSITION_COMPATIBILITY[lineupSlot] ?? []
    const primaryRating = getPlayerPositionRating(player, player.position.primary)
    const eligibleSet = new Set(getPlayerEligiblePositionTypes(player))
    let rating = 0

    for (const pos of slotCompat) {
      if (!eligibleSet.has(pos)) continue
      const projected = getPlayerPositionRating(player, pos)
      rating = Math.max(rating, projected)
    }

    if (rating <= 0) {
      rating = Math.round(primaryRating * 0.55)
    }
    rating = Math.max(1, Math.min(100, rating))
    return { rating }
  }, [])

  const getSlotOptionsForPlayer = useCallback((player: Player): AssignmentSlotOption[] => {
    const isAflEligible = canBeSelectedForAfl(player)
    const activeSlots: AssignmentSlot[] = [
      ...(isAflEligible ? lineupSlots : []),
      ...lineupSlots.map((slot) => `RES:${slot}` as AssignmentSlot),
      ...(isAflEligible && settings.matchRules.enableSubstitutes ? (['SUB'] as AssignmentSlot[]) : []),
      'REST',
      'UNASSIGNED',
    ]

    return activeSlots.map((slot) => {
      const occupantId = slot === 'SUB'
        ? selectedSubstituteId
        : isReservesSlot(slot)
          ? sanitizedReservesLineup[decodeReservesSlot(slot)]
          : slot === 'REST' || slot === 'UNASSIGNED'
            ? null
            : sanitizedSelectedLineup[slot]
      const occupant = occupantId ? players[occupantId] : null
      const projected = getPlayerSlotProjection(player, slot)
      const occupiedBySelf = occupant?.id === player.id
      const occupantProjection = occupant ? getPlayerSlotProjection(occupant, slot) : null
      return {
        slot,
        occupantLabel: slot === 'REST'
          ? 'Rest this week'
          : slot === 'UNASSIGNED'
            ? 'No slot'
            : occupant
          ? `${occupiedBySelf ? 'Current' : `${occupant.firstName.charAt(0)}. ${occupant.lastName}`}`
          : 'Empty',
        occupantRating: occupantProjection?.rating ?? null,
        occupiedBySelf,
        projectedRating: projected.rating,
      }
    })
  }, [
    getPlayerSlotProjection,
    lineupSlots,
    players,
    sanitizedReservesLineup,
    sanitizedSelectedLineup,
    selectedSubstituteId,
    settings.matchRules.enableSubstitutes,
  ])

  const handleChangeAssignedSlot = useCallback((playerId: string, targetSlot: AssignmentSlot) => {
    if (targetSlot === 'SUB' && !settings.matchRules.enableSubstitutes) return
    if (targetSlot !== 'SUB' && targetSlot !== 'REST' && targetSlot !== 'UNASSIGNED' && !isReservesSlot(targetSlot) && !lineupSlotSet.has(targetSlot)) return
    const player = players[playerId]
    if (!player || player.clubId !== clubId) return
    const playerCanAfl = canBeSelectedForAfl(player)
    if (!playerCanAfl && (targetSlot === 'SUB' || (!isReservesSlot(targetSlot) && targetSlot !== 'REST' && targetSlot !== 'UNASSIGNED'))) return

    const currentSlot = assignedSlotByPlayer.get(playerId) ?? null
    if (currentSlot === targetSlot) return

    const nextAflLineup = { ...sanitizedSelectedLineup }
    const nextReservesLineup: Partial<Record<LineupSlot, string>> = { ...sanitizedReservesLineup }
    const nextAvailability: Record<string, 'play' | 'rest'> = { ...reserves.playerAvailabilityAssignments }
    let nextSubstituteId = selectedSubstituteId ?? null

    const getSlotOccupant = (slot: AssignmentSlot): string | null => {
      if (slot === 'SUB') return nextSubstituteId
      if (slot === 'REST' || slot === 'UNASSIGNED') return null
      if (isReservesSlot(slot)) return nextReservesLineup[decodeReservesSlot(slot)] ?? null
      return nextAflLineup[slot] ?? null
    }

    const clearPlayerFromAssignments = (id: string) => {
      for (const [slot, occupantId] of Object.entries(nextAflLineup) as Array<[LineupSlot, string]>) {
        if (occupantId === id) delete nextAflLineup[slot]
      }
      for (const [slot, occupantId] of Object.entries(nextReservesLineup) as Array<[LineupSlot, string]>) {
        if (occupantId === id) delete nextReservesLineup[slot]
      }
      if (nextSubstituteId === id) nextSubstituteId = null
    }

    const setPlayerToSlot = (id: string, slot: AssignmentSlot) => {
      clearPlayerFromAssignments(id)
      if (slot === 'SUB') {
        nextSubstituteId = id
        nextAvailability[id] = 'play'
        return
      }
      if (slot === 'REST') {
        nextAvailability[id] = 'rest'
        return
      }
      if (slot === 'UNASSIGNED') {
        if (!nextAvailability[id]) nextAvailability[id] = 'play'
        return
      }
      if (isReservesSlot(slot)) {
        nextReservesLineup[decodeReservesSlot(slot)] = id
        nextAvailability[id] = 'play'
        return
      }
      nextAflLineup[slot] = id
      nextAvailability[id] = 'play'
    }

    const targetOccupantId = getSlotOccupant(targetSlot)
    if (targetOccupantId === playerId) return
    if (targetOccupantId) {
      setPlayerToSlot(targetOccupantId, currentSlot ?? 'UNASSIGNED')
    }
    setPlayerToSlot(playerId, targetSlot)

    const orderedReservesIds = lineupSlots
      .map((slot) => nextReservesLineup[slot])
      .filter((id): id is string => Boolean(id))

    setSelectedLineup(nextAflLineup)
    setManagedReservesLineup(orderedReservesIds)
    if (settings.matchRules.enableSubstitutes) {
      setSelectedSubstitute(nextSubstituteId)
    } else {
      setSelectedSubstitute(null)
    }
    setReservesPlayerAvailability(playerId, nextAvailability[playerId] ?? 'play')
    if (targetOccupantId) {
      setReservesPlayerAvailability(targetOccupantId, nextAvailability[targetOccupantId] ?? 'play')
    }
  }, [
    assignedSlotByPlayer,
    clubId,
    lineupSlots,
    lineupSlotSet,
    players,
    reserves.playerAvailabilityAssignments,
    sanitizedReservesLineup,
    sanitizedSelectedLineup,
    selectedSubstituteId,
    setManagedReservesLineup,
    setReservesPlayerAvailability,
    setSelectedLineup,
    setSelectedSubstitute,
    settings.matchRules.enableSubstitutes,
  ])

  const handleAutoAssignUnassigned = useCallback(() => {
    if (clubId !== playerClubId) return

    const nextAflLineup: Record<LineupSlot, string> = { ...sanitizedSelectedLineup }
    const nextReservesLineup: Partial<Record<LineupSlot, string>> = { ...sanitizedReservesLineup }
    const nextAvailability: Record<string, 'play' | 'rest'> = { ...reserves.playerAvailabilityAssignments }
    let nextSubstituteId = settings.matchRules.enableSubstitutes ? (selectedSubstituteId ?? null) : null

    const usedIds = new Set<string>([
      ...Object.values(nextAflLineup),
      ...Object.values(nextReservesLineup).filter((id): id is string => Boolean(id)),
      ...(nextSubstituteId ? [nextSubstituteId] : []),
    ])

    const unassignedPlayers = clubPlayers
      .filter((p) => !usedIds.has(p.id))
      .sort((a, b) => getOverallRating(b) - getOverallRating(a))
    const assignablePlayers = unassignedPlayers.filter((p) => !p.injury && (p.suspension?.weeksRemaining ?? 0) <= 0)
    const aflAssignable = assignablePlayers.filter((p) => canBeSelectedForAfl(p))
    const forcedRestPlayers = unassignedPlayers.filter((p) => p.injury || (p.suspension?.weeksRemaining ?? 0) > 0)

    const openAflSlots = lineupSlots.filter((slot) => !nextAflLineup[slot])
    const openReservesSlots = lineupSlots.filter((slot) => !nextReservesLineup[slot])

    const remaining: Player[] = [...assignablePlayers]
    const remainingAfl: Player[] = [...aflAssignable]
    const takeBestForSlot = (slot: AssignmentSlot): Player | null => {
      if (remaining.length === 0) return null
      let bestIndex = 0
      let bestScore = -1
      for (let i = 0; i < remaining.length; i++) {
        const score = getPlayerSlotProjection(remaining[i], slot).rating
        if (score > bestScore) {
          bestScore = score
          bestIndex = i
        }
      }
      const [best] = remaining.splice(bestIndex, 1)
      const aflIndex = remainingAfl.findIndex((p) => p.id === best?.id)
      if (aflIndex >= 0) remainingAfl.splice(aflIndex, 1)
      return best ?? null
    }
    const takeBestAflForSlot = (slot: AssignmentSlot): Player | null => {
      if (remainingAfl.length === 0) return null
      let bestIndex = 0
      let bestScore = -1
      for (let i = 0; i < remainingAfl.length; i++) {
        const score = getPlayerSlotProjection(remainingAfl[i], slot).rating
        if (score > bestScore) {
          bestScore = score
          bestIndex = i
        }
      }
      const [best] = remainingAfl.splice(bestIndex, 1)
      const allIndex = remaining.findIndex((p) => p.id === best?.id)
      if (allIndex >= 0) remaining.splice(allIndex, 1)
      return best ?? null
    }

    for (const slot of openAflSlots) {
      const best = takeBestAflForSlot(slot)
      if (!best) break
      nextAflLineup[slot] = best.id
      nextAvailability[best.id] = 'play'
    }

    if (settings.matchRules.enableSubstitutes && !nextSubstituteId) {
      const bestSub = takeBestAflForSlot('SUB')
      if (bestSub) {
        nextSubstituteId = bestSub.id
        nextAvailability[bestSub.id] = 'play'
      }
    }

    for (const slot of openReservesSlots) {
      const best = takeBestForSlot(`RES:${slot}`)
      if (!best) break
      nextReservesLineup[slot] = best.id
      nextAvailability[best.id] = 'play'
    }

    for (const player of remaining) {
      nextAvailability[player.id] = 'rest'
    }
    for (const player of forcedRestPlayers) {
      nextAvailability[player.id] = 'rest'
    }

    setSelectedLineup(nextAflLineup)
    setManagedReservesLineupSlots(nextReservesLineup)
    if (settings.matchRules.enableSubstitutes) {
      setSelectedSubstitute(nextSubstituteId)
    } else {
      setSelectedSubstitute(null)
    }
    for (const player of unassignedPlayers) {
      setReservesPlayerAvailability(player.id, nextAvailability[player.id] ?? 'play')
    }
  }, [
    clubId,
    clubPlayers,
    getPlayerSlotProjection,
    lineupSlots,
    playerClubId,
    reserves.playerAvailabilityAssignments,
    sanitizedReservesLineup,
    sanitizedSelectedLineup,
    selectedSubstituteId,
    setManagedReservesLineupSlots,
    setReservesPlayerAvailability,
    setSelectedLineup,
    setSelectedSubstitute,
    settings.matchRules.enableSubstitutes,
  ])

  const columns = useMemo(
    () =>
      buildColumns(view, reserves.seasonStatsByPlayer, {
        enabled: clubId === playerClubId,
        getAssignedSlot: (playerId: string) => assignedSlotByPlayer.get(playerId) ?? null,
        getSlotOptions: getSlotOptionsForPlayer,
        onChangeAssignedSlot: (playerId: string, slot: string) => {
          handleChangeAssignedSlot(playerId, slot as AssignmentSlot)
        },
      }),
    [
      assignedSlotByPlayer,
      clubId,
      getSlotOptionsForPlayer,
      handleChangeAssignedSlot,
      playerClubId,
      reserves.seasonStatsByPlayer,
      view,
    ],
  )
  const tableViewColumns = useMemo<TableViewColumnConfig[]>(
    () => {
      const next: TableViewColumnConfig[] = []
      for (const column of columns) {
        const col = column as { id?: string; accessorKey?: string; header?: unknown; size?: number }
        const id = col.id ?? col.accessorKey
        if (!id) continue
        next.push({
          id,
          label: typeof col.header === 'string' ? col.header : id.toUpperCase(),
          defaultWidth: col.size ?? 100,
          minWidth: 44,
          maxWidth: 320,
          sortable: true,
        })
      }
      return next
    },
    [columns],
  )
  const tableView = useTableViewManager({
    tableId: `squad-list-${view}`,
    columns: tableViewColumns,
    defaultSort: { columnId: 'ovr', direction: 'desc' },
  })
  const sortingState: SortingState = useMemo(
    () =>
      tableView.snapshot.sort
        ? [{ id: tableView.snapshot.sort.columnId, desc: tableView.snapshot.sort.direction === 'desc' }]
        : [],
    [tableView.snapshot.sort],
  )
  const effectiveColumnOrder = useMemo(() => {
    const order = [...tableView.snapshot.columnOrder]
    const ageIdx = order.indexOf('age')
    const aflIdx = order.indexOf('afl_gp')
    if (ageIdx < 0 || aflIdx < 0) return order
    order.splice(aflIdx, 1)
    order.splice(ageIdx + 1, 0, 'afl_gp')
    return order
  }, [tableView.snapshot.columnOrder])
  const columnVisibility = useMemo(() => {
    const hiddenSet = new Set(tableView.snapshot.hiddenColumnIds)
    const visibility: Record<string, boolean> = {}
    for (const id of effectiveColumnOrder) {
      visibility[id] = !hiddenSet.has(id)
    }
    return visibility
  }, [effectiveColumnOrder, tableView.snapshot.hiddenColumnIds])

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
    state: {
      sorting: sortingState,
      columnOrder: effectiveColumnOrder,
      columnVisibility,
      columnSizing: tableView.snapshot.columnWidths,
    },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sortingState) : updater
      const first = next[0]
      tableView.setSort(first?.id ?? null, first?.desc ? 'desc' : 'asc')
    },
    onColumnSizingChange: (updater) => {
      const next = typeof updater === 'function'
        ? updater(tableView.snapshot.columnWidths)
        : updater
      for (const [id, width] of Object.entries(next)) {
        tableView.setColumnWidth(id, Number(width))
      }
    },
    meta: { leadershipRoleMap },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  })

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
          {clubId === playerClubId && (
            <Button size="sm" variant="outline" onClick={handleAutoAssignUnassigned}>
              Auto Assign Unassigned
            </Button>
          )}
          {VIEW_OPTIONS.map((v) => (
            <Button key={v.key} size="sm" variant={view === v.key ? 'default' : 'outline'} onClick={() => setView(v.key)}>
              {v.label}
            </Button>
          ))}
        </div>
      </div>

      {clubId === playerClubId && unassignedErrorPlayerIds.size > 0 && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {unassignedErrorPlayerIds.size} unassigned player{unassignedErrorPlayerIds.size === 1 ? '' : 's'} require position assignment.
          </div>
          <p className="mt-1 text-xs text-red-700/80">
            Unassigned rows and assignment selectors are highlighted in red.
          </p>
        </div>
      )}

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
            <CardTitle className="text-sm">Filters And View</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_FILTERS.map((f) => (
                <Button
                  key={f.key}
                  variant="outline"
                  size="sm"
                  className={
                    f.key === 'def'
                      ? getPositionFilterButtonClass('DEF', quickFilter === f.key)
                      : f.key === 'mid'
                        ? getPositionFilterButtonClass('MID', quickFilter === f.key)
                        : f.key === 'fwd'
                          ? getPositionFilterButtonClass('FWD', quickFilter === f.key)
                          : f.key === 'rk'
                            ? getPositionFilterButtonClass('RK', quickFilter === f.key)
                            : quickFilter === f.key
                              ? 'border-primary/40 bg-primary/15 text-primary'
                              : undefined
                  }
                  onClick={() => setQuickFilter(f.key)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <Input className="h-8 text-xs" placeholder="Search player..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <TableViewManagerControl columns={tableViewColumns} manager={tableView} />
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
                  const isUnassignedError = clubId === playerClubId && unassignedErrorPlayerIds.has(row.original.id)
                  return (
                    <TableRow
                      key={row.id}
                      className={`text-sm ${isUnassignedError ? 'bg-red-500/5 ring-1 ring-inset ring-red-500/25' : ''}`}
                    >
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











