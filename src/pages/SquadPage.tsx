import { useCallback, useMemo, useState, useRef, memo } from 'react'
import { cn } from '@/lib/utils'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useGameStore } from '@/stores/gameStore'
import { useAppStore } from '@/stores/appStore'
import { useTableViewManager, type TableViewColumnConfig } from '@/components/table-view/useTableViewManager'
import { TableViewManagerControl } from '@/components/table-view/TableViewManagerControl'
import type { LineupSlot, Player } from '@/types/player'
import { getLeadershipScore, getTeamLeadershipRating, autoSelectLeadership } from '@/engine/leadership/leadershipEngine'
import type { ClubLeadership } from '@/types/club'
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
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangle, ArrowUpDown, Shield } from 'lucide-react'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { ReadinessBadge } from '@/components/player/ReadinessBadge'
import { PlayerHoverCard } from '@/components/player/PlayerHoverCard'
import { computePlayerReadiness } from '@/engine/player/readinessEngine'
import { getPositionBadgeClass, getPositionFilterButtonClass } from '@/lib/positionColor'
import { calcDisposalEfficiency, calcKickingAccuracy, calcContestedPossessionPct, calcKickToHandballRatio, fmtPct, fmtKHRatio } from '@/lib/efficiencyStats'
import { getInjuryRiskLevel, injuryRiskDisplay } from '@/lib/injuryRisk'
import { matchRatingColorClass } from '@/engine/match/matchRatings'
import { ClubBFLeaderboardWidget } from '@/components/squad/ClubBFLeaderboardWidget'
import { CohesionTab } from '@/components/squad/CohesionTab'

const columnHelper = createColumnHelper<Player>()

// Stable default sort — module-level so it never changes reference
const SQUAD_DEFAULT_SORT = { columnId: 'ovr', direction: 'desc' as const }

type SquadView = 'ratings' | 'stats' | 'contracts' | 'development' | 'leadership' | 'readiness' | 'cohesion'
type QuickFilter = 'all' | 'def' | 'mid' | 'fwd' | 'rk' | 'expiring' | 'injured' | 'vfl'
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
  { key: 'leadership', label: 'Leadership' },
  { key: 'readiness', label: 'Readiness' },
  { key: 'cohesion', label: 'Cohesion' },
]

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: 'all', label: 'All Players' },
  { key: 'def', label: 'DEF' },
  { key: 'mid', label: 'MID' },
  { key: 'fwd', label: 'FWD' },
  { key: 'rk', label: 'RK' },
  { key: 'expiring', label: 'Expiring (1y)' },
  { key: 'injured', label: 'Injured Only' },
  { key: 'vfl', label: 'VFL List' },
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

function NameCell({ playerId, name, leadershipRole, player }: { playerId: string; name: string; leadershipRole?: 'C' | 'VC' | 'LG'; player: Player }) {
  return (
    <div className="flex items-center gap-1.5">
      <PlayerHoverCard player={player} side="right">
        <Link
          className="font-medium text-left hover:underline hover:text-primary cursor-pointer"
          to={`/player/${encodeURIComponent(playerId)}`}
        >
          {name}
        </Link>
      </PlayerHoverCard>
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

interface SlotAssignmentCellProps {
  player: Player
  assignedSlot: AssignmentSlot
  getSlotOptions: (player: Player) => AssignmentSlotOption[]
  onChangeAssignedSlot: (playerId: string, slot: string) => void
}

const SlotAssignmentCell = memo(function SlotAssignmentCell({
  player,
  assignedSlot,
  getSlotOptions,
  onChangeAssignedSlot,
}: SlotAssignmentCellProps) {
  const [open, setOpen] = useState(false)
  const slotOptions = useMemo(
    () => (open ? getSlotOptions(player) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  )
  return (
    <Select
      onOpenChange={setOpen}
      value={assignedSlot ?? undefined}
      onValueChange={(slot) => onChangeAssignedSlot(player.id, slot)}
    >
      <SelectTrigger
        className={`h-7 w-[120px] text-xs ${
          assignedSlot === 'UNASSIGNED'
            ? 'border-red-500/60 bg-red-500/10 text-red-700 focus-visible:ring-red-500/30'
            : ''
        }`}
      >
        {assignedSlot === 'UNASSIGNED' ? (
          <span className="text-muted-foreground truncate">Assign slot...</span>
        ) : (
          <span className="truncate">{assignedSlot}</span>
        )}
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
})

function buildColumns(
  view: SquadView,
  reservesStatsByPlayerRaw: Record<string, { gamesPlayed: number }> | null | undefined,
  statsDisplayMode: 'totals' | 'averages',
  currentYear: number,
  assignment?: {
    enabled: boolean
    getAssignedSlot: (playerId: string) => AssignmentSlot | null
    getSlotOptions: (player: Player) => AssignmentSlotOption[]
    onChangeAssignedSlot: (playerId: string, slot: string) => void
  },
) {
  const reservesStatsByPlayer: Record<string, { gamesPlayed: number }> = reservesStatsByPlayerRaw ?? {}
  const base = [
    columnHelper.accessor('jerseyNumber', { header: '#', size: 44 }),
    columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
      id: 'name',
      header: 'Name',
      cell: (info) => {
        const meta = info.table.options.meta as { leadershipRoleMap?: Record<string, 'C' | 'VC' | 'LG'> } | undefined
        const role = meta?.leadershipRoleMap?.[info.row.original.id]
        return <NameCell playerId={info.row.original.id} name={info.getValue()} leadershipRole={role} player={info.row.original} />
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
        return (
          <SlotAssignmentCell
            player={player}
            assignedSlot={assignedSlot}
            getSlotOptions={assignment.getSlotOptions}
            onChangeAssignedSlot={assignment.onChangeAssignedSlot}
          />
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
    const avg = statsDisplayMode === 'averages'
    return [
      ...base,
      columnHelper.accessor((row) => row.lastMatchRating ?? -1, {
        id: 'last_game_rating',
        header: 'Last Game',
        cell: (i) => {
          const rating = i.row.original.lastMatchRating
          if (rating === undefined) return <span className="text-xs text-muted-foreground">—</span>
          return (
            <span className={`text-xs font-mono font-bold tabular-nums ${matchRatingColorClass(rating)}`}>
              {rating.toFixed(1)}
            </span>
          )
        },
        size: 80,
      }),
      columnHelper.accessor((row) => row.seasonStats.gamesPlayed, {
        id: 'gp',
        header: 'GP',
        cell: (i) => <span className="text-xs tabular-nums">{i.row.original.seasonStats.gamesPlayed}</span>,
        size: 52,
      }),
      columnHelper.accessor((row) => avg ? (row.seasonStats.gamesPlayed > 0 ? row.seasonStats.disposals / row.seasonStats.gamesPlayed : 0) : row.seasonStats.disposals, {
        id: 'disp_ctx',
        header: avg ? 'Disp/G' : 'Disposals',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{avg ? safeAvg(p.seasonStats.disposals, p.seasonStats.gamesPlayed) : p.seasonStats.disposals}</span>
        },
        size: avg ? 72 : 84,
      }),
      columnHelper.accessor((row) => avg ? (row.seasonStats.gamesPlayed > 0 ? row.seasonStats.goals / row.seasonStats.gamesPlayed : 0) : row.seasonStats.goals, {
        id: 'goals_ctx',
        header: avg ? 'Goals/G' : 'Goals',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{avg ? safeAvg(p.seasonStats.goals, p.seasonStats.gamesPlayed) : p.seasonStats.goals}</span>
        },
        size: avg ? 72 : 64,
      }),
      columnHelper.accessor((row) => calcKickToHandballRatio(row.seasonStats.kicks, row.seasonStats.handballs) ?? 0, {
        id: 'kh_ratio',
        header: 'K:H',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{fmtKHRatio(calcKickToHandballRatio(p.seasonStats.kicks, p.seasonStats.handballs))}</span>
        },
        size: 60,
      }),
      columnHelper.accessor((row) => avg ? (row.seasonStats.gamesPlayed > 0 ? row.seasonStats.tackles / row.seasonStats.gamesPlayed : 0) : row.seasonStats.tackles, {
        id: 'tack_ctx',
        header: avg ? 'Tck/G' : 'Tackles',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{avg ? safeAvg(p.seasonStats.tackles, p.seasonStats.gamesPlayed) : p.seasonStats.tackles}</span>
        },
        size: avg ? 64 : 72,
      }),
      columnHelper.accessor((row) => avg ? (row.seasonStats.gamesPlayed > 0 ? row.seasonStats.aflFantasyPoints / row.seasonStats.gamesPlayed : 0) : row.seasonStats.aflFantasyPoints, {
        id: 'af_ctx',
        header: avg ? 'AF/G' : 'AFL Fantasy',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{avg ? safeAvg(p.seasonStats.aflFantasyPoints, p.seasonStats.gamesPlayed) : p.seasonStats.aflFantasyPoints}</span>
        },
        size: avg ? 60 : 88,
      }),
      columnHelper.accessor((row) => avg ? (row.seasonStats.gamesPlayed > 0 ? row.seasonStats.superCoachPoints / row.seasonStats.gamesPlayed : 0) : row.seasonStats.superCoachPoints, {
        id: 'sc_ctx',
        header: avg ? 'SC/G' : 'SC Pts',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{avg ? safeAvg(p.seasonStats.superCoachPoints, p.seasonStats.gamesPlayed) : p.seasonStats.superCoachPoints}</span>
        },
        size: avg ? 60 : 72,
      }),
      columnHelper.accessor((row) => calcDisposalEfficiency(row.seasonStats.disposals, row.seasonStats.turnovers) ?? 0, {
        id: 'de_pct',
        header: 'DE%',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{fmtPct(calcDisposalEfficiency(p.seasonStats.disposals, p.seasonStats.turnovers))}</span>
        },
        size: 64,
      }),
      columnHelper.accessor((row) => calcKickingAccuracy(row.seasonStats.goals, row.seasonStats.behinds) ?? 0, {
        id: 'ka_pct',
        header: 'KAcc%',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{fmtPct(calcKickingAccuracy(p.seasonStats.goals, p.seasonStats.behinds))}</span>
        },
        size: 72,
      }),
      columnHelper.accessor((row) => calcContestedPossessionPct(row.seasonStats.contestedPossessions, row.seasonStats.uncontestedPossessions) ?? 0, {
        id: 'cp_pct',
        header: 'CP%',
        cell: (i) => {
          const p = i.row.original
          return <span className="text-xs tabular-nums">{fmtPct(calcContestedPossessionPct(p.seasonStats.contestedPossessions, p.seasonStats.uncontestedPossessions))}</span>
        },
        size: 64,
      }),
      ...status,
    ]
  }

  if (view === 'contracts') {
    const yearCols = Array.from({ length: 5 }, (_, i) =>
      columnHelper.accessor((row) => row.contract.yearByYear[i] ?? null, {
        id: `year_${currentYear + i}`,
        header: String(currentYear + i),
        cell: (info) => {
          const val = info.getValue()
          return val !== null
            ? <span className="text-xs tabular-nums">${Math.round(val / 1000)}k</span>
            : <span className="text-muted-foreground/30 text-xs">—</span>
        },
        size: 78,
      }),
    )
    return [
      ...base,
      columnHelper.accessor((row) => row.contract.aav, {
        id: 'aav',
        header: 'AAV',
        cell: (i) => <span className="text-xs tabular-nums">${Math.round(i.getValue() / 1000)}k</span>,
        size: 80,
      }),
      ...yearCols,
      columnHelper.accessor((row) => row, {
        id: 'list',
        header: 'List',
        cell: (i) => {
          const p = i.getValue()
          const isVfl = !canBeSelectedForAfl(p)
          return (
            <div className="flex items-center gap-1">
              <Badge variant={isVfl ? 'outline' : p.isRookie ? 'secondary' : 'default'}>
                {isVfl ? 'VFL' : p.isRookie ? 'Rookie' : 'Senior'}
              </Badge>
            </div>
          )
        },
        size: 80,
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

  if (view === 'readiness') {
    return [
      ...base,
      columnHelper.accessor((row) => computePlayerReadiness(row).score, {
        id: 'readiness_score',
        header: 'Readiness',
        cell: (i) => (
          <ReadinessBadge player={i.row.original} showLabel size="sm" />
        ),
        size: 100,
      }),
      columnHelper.accessor('fitness', {
        id: 'fit',
        header: 'Fitness',
        cell: (i) => {
          const v = i.getValue()
          return (
            <div className="flex items-center gap-1.5 min-w-[80px]">
              <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${v}%` }} />
              </div>
              <span className="text-[10px] tabular-nums w-6">{v}</span>
            </div>
          )
        },
        size: 100,
      }),
      columnHelper.accessor('fatigue', {
        id: 'fat',
        header: 'Fatigue',
        cell: (i) => {
          const v = i.getValue()
          const barColor = v >= 70 ? 'bg-red-500' : v >= 50 ? 'bg-amber-500' : 'bg-sky-500'
          return (
            <div className="flex items-center gap-1.5 min-w-[80px]">
              <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${v}%` }} />
              </div>
              <span className="text-[10px] tabular-nums w-6">{v}</span>
            </div>
          )
        },
        size: 100,
      }),
      columnHelper.accessor('form', {
        id: 'form_r',
        header: 'Form',
        cell: (i) => {
          const v = i.getValue()
          return (
            <div className="flex items-center gap-1.5 min-w-[80px]">
              <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div className="h-full rounded-full bg-violet-500" style={{ width: `${v}%` }} />
              </div>
              <span className="text-[10px] tabular-nums w-6">{v}</span>
            </div>
          )
        },
        size: 100,
      }),
      columnHelper.accessor('morale', {
        id: 'morale_r',
        header: 'Morale',
        cell: (i) => {
          const v = i.getValue()
          return (
            <div className="flex items-center gap-1.5 min-w-[80px]">
              <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${v}%` }} />
              </div>
              <span className="text-[10px] tabular-nums w-6">{v}</span>
            </div>
          )
        },
        size: 100,
      }),
      ...status,
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
    columnHelper.accessor((row) => getInjuryRiskLevel(row), {
      id: 'inj_risk',
      header: 'Inj Risk',
      cell: (i) => {
        const level = i.getValue()
        const { label, iconColor } = injuryRiskDisplay(level)
        const p = i.row.original
        const count = p.injuryHistory?.length ?? 0
        const proneness = p.hiddenAttributes.injuryProneness
        return (
          <span
            title={`${label} · Proneness ${proneness} · ${count} career injur${count === 1 ? 'y' : 'ies'}`}
            className="flex items-center gap-1"
          >
            <Shield className={`h-3.5 w-3.5 ${iconColor}`} />
            <span className={`text-[10px] ${iconColor}`}>{label.split(' ')[0]}</span>
          </span>
        )
      },
      size: 90,
    }),
    ...status,
  ]
}

type LeadershipRole = 'none' | 'lg' | 'vc' | 'c'

const ROLE_OPTIONS: { value: LeadershipRole; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'lg', label: 'Leadership Group' },
  { value: 'vc', label: 'Vice-Captain' },
  { value: 'c', label: 'Captain' },
]

function getRoleForPlayer(id: string, l: ClubLeadership): LeadershipRole {
  if (l.captainId === id) return 'c'
  if (l.viceCaptainId === id) return 'vc'
  if (l.leadershipGroupIds.includes(id)) return 'lg'
  return 'none'
}

function applyRoleChange(playerId: string, newRole: LeadershipRole, current: ClubLeadership): ClubLeadership {
  const next: ClubLeadership = {
    captainId: current.captainId,
    viceCaptainId: current.viceCaptainId,
    leadershipGroupIds: [...current.leadershipGroupIds],
  }
  if (next.captainId === playerId) next.captainId = null
  if (next.viceCaptainId === playerId) next.viceCaptainId = null
  next.leadershipGroupIds = next.leadershipGroupIds.filter((id) => id !== playerId)
  if (newRole === 'c') next.captainId = playerId
  if (newRole === 'vc') next.viceCaptainId = playerId
  if (newRole === 'lg') next.leadershipGroupIds.push(playerId)
  return next
}

function lsColor(score: number): string {
  if (score >= 75) return 'text-green-500'
  if (score >= 60) return 'text-emerald-400'
  if (score >= 45) return 'text-yellow-500'
  return 'text-muted-foreground'
}

interface LeadershipTabProps {
  clubPlayers: Player[]
  players: Record<string, Player>
  leadership: ClubLeadership | undefined
  isEditable: boolean
  onUpdate: (l: ClubLeadership) => void
  onAutoSelect: () => void
}

function LeadershipTab({ clubPlayers, players, leadership, isEditable, onUpdate, onAutoSelect }: LeadershipTabProps) {
  const current: ClubLeadership = leadership ?? { captainId: null, viceCaptainId: null, leadershipGroupIds: [] }
  const captain = current.captainId ? players[current.captainId] : null
  const vc = current.viceCaptainId ? players[current.viceCaptainId] : null
  const lgMembers = current.leadershipGroupIds.map((id) => players[id]).filter(Boolean)
  const teamRating = getTeamLeadershipRating(clubPlayers, current)

  const sortedPlayers = useMemo(
    () => [...clubPlayers].sort((a, b) => getLeadershipScore(b) - getLeadershipScore(a)),
    [clubPlayers],
  )

  return (
    <div className="space-y-4">
      {/* Link to full leadership screen */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link to="/leadership">Full Leadership Screen →</Link>
        </Button>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap items-start gap-3">
        {/* Captain */}
        <Card className={cn('min-w-[160px]', captain ? 'border-amber-500/40' : 'border-dashed')}>
          <CardContent className="p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Badge className="h-4 bg-amber-500/20 px-1.5 text-[10px] text-amber-500 border-amber-500/30">C</Badge>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Captain</span>
            </div>
            {captain ? (
              <>
                <Link to={`/player/${captain.id}`} className="text-sm font-semibold text-foreground hover:underline hover:text-primary">
                  {captain.firstName} {captain.lastName}
                </Link>
                <p className="text-xs text-muted-foreground">{captain.position.primary} · {captain.age}yo</p>
                <p className={cn('text-xs font-bold tabular-nums', lsColor(getLeadershipScore(captain)))}>
                  LS {getLeadershipScore(captain)}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic">Not assigned</p>
            )}
          </CardContent>
        </Card>

        {/* Vice-Captain */}
        <Card className={cn('min-w-[160px]', vc ? 'border-blue-500/40' : 'border-dashed')}>
          <CardContent className="p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Badge className="h-4 bg-blue-500/20 px-1.5 text-[10px] text-blue-500 border-blue-500/30">VC</Badge>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vice-Captain</span>
            </div>
            {vc ? (
              <>
                <Link to={`/player/${vc.id}`} className="text-sm font-semibold text-foreground hover:underline hover:text-primary">
                  {vc.firstName} {vc.lastName}
                </Link>
                <p className="text-xs text-muted-foreground">{vc.position.primary} · {vc.age}yo</p>
                <p className={cn('text-xs font-bold tabular-nums', lsColor(getLeadershipScore(vc)))}>
                  LS {getLeadershipScore(vc)}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic">Not assigned</p>
            )}
          </CardContent>
        </Card>

        {/* Leadership Group */}
        {lgMembers.length > 0 && (
          <Card className="flex-1 min-w-[200px]">
            <CardContent className="p-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Leadership Group ({lgMembers.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {lgMembers.map((p) => (
                  <Link
                    key={p.id}
                    to={`/player/${p.id}`}
                    className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-foreground hover:border-primary/40 hover:text-primary"
                  >
                    {p.firstName[0]}. {p.lastName}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Team Rating + Auto-select */}
        <div className="flex flex-col items-end gap-2 ml-auto">
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Team Leadership</p>
            <p className={cn('text-2xl font-bold tabular-nums', lsColor(teamRating))}>{teamRating}</p>
          </div>
          {isEditable && (
            <Button size="sm" variant="outline" onClick={onAutoSelect}>
              Auto-select
            </Button>
          )}
        </div>
      </div>

      {/* Player list */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-3 text-xs w-8">#</TableHead>
                <TableHead className="px-3 text-xs">Name</TableHead>
                <TableHead className="px-3 text-xs">Pos</TableHead>
                <TableHead className="px-3 text-xs">Age</TableHead>
                <TableHead className="px-3 text-xs">GP</TableHead>
                <TableHead className="px-3 text-xs">OVR</TableHead>
                <TableHead className="px-3 text-xs">LS</TableHead>
                <TableHead className="px-3 text-xs">{isEditable ? 'Role' : 'Role'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlayers.map((p, i) => {
                const role = getRoleForPlayer(p.id, current)
                const ls = getLeadershipScore(p)
                return (
                  <TableRow key={p.id} className="text-sm">
                    <TableCell className="px-3 py-1.5 text-xs tabular-nums text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="px-3 py-1.5">
                      <Link to={`/player/${p.id}`} className="font-medium hover:underline hover:text-primary">
                        {p.firstName} {p.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <Badge variant="outline" className={getPositionBadgeClass(p.position.primary)}>{p.position.primary}</Badge>
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-xs tabular-nums">{p.age}</TableCell>
                    <TableCell className="px-3 py-1.5 text-xs tabular-nums">{p.careerStats.gamesPlayed}</TableCell>
                    <TableCell className="px-3 py-1.5 text-xs tabular-nums font-semibold">{getOverallRating(p)}</TableCell>
                    <TableCell className="px-3 py-1.5">
                      <span className={cn('text-xs font-bold tabular-nums', lsColor(ls))}>{ls}</span>
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      {isEditable ? (
                        <Select
                          value={role}
                          onValueChange={(v) => onUpdate(applyRoleChange(p.id, v as LeadershipRole, current))}
                        >
                          <SelectTrigger className="h-7 w-[160px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        role !== 'none' ? (
                          <Badge variant="outline" className={cn('text-[10px] px-1.5',
                            role === 'c' ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                            : role === 'vc' ? 'bg-blue-500/15 text-blue-600 border-blue-500/30'
                            : 'bg-slate-500/15 text-slate-500 border-slate-500/30'
                          )}>
                            {role === 'c' ? 'Captain' : role === 'vc' ? 'Vice-Captain' : 'LG'}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export function SquadPage() {
  const { clubId: routeClubId } = useParams<{ clubId?: string }>()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const viewedTeamClubId = useAppStore((s) => s.viewedTeamClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const currentYear = useGameStore((s) => s.currentYear)
  const currentRound = useGameStore((s) => s.currentRound)
  const reserves = useGameStore((s) => s.reserves)
  const settings = useGameStore((s) => s.settings)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const setSelectedLineup = useGameStore((s) => s.setSelectedLineup)
  const selectedSubstituteId = useGameStore((s) => s.selectedSubstituteId)
  const setSelectedSubstitute = useGameStore((s) => s.setSelectedSubstitute)
  const setManagedReservesLineupSlots = useGameStore((s) => s.setManagedReservesLineupSlots)
  const batchSetReservesPlayerAvailability = useGameStore((s) => s.batchSetReservesPlayerAvailability)
  const applyLineupAutoAssign = useGameStore((s) => s.applyLineupAutoAssign)
  const setClubLeadership = useGameStore((s) => s.setClubLeadership)

  const clubId = routeClubId ?? viewedTeamClubId ?? playerClubId
  const club = clubs[clubId]
  const leadership = club?.leadership
  const clubPlayers = useMemo(() => Object.values(players).filter((p) => p.clubId === clubId), [players, clubId])

  const leadershipRoleMap = useMemo(() => {
    const map: Record<string, 'C' | 'VC' | 'LG'> = {}
    if (!leadership) return map
    if (leadership.captainId) map[leadership.captainId] = 'C'
    if (leadership.viceCaptainId) map[leadership.viceCaptainId] = 'VC'
    for (const id of (leadership.leadershipGroupIds ?? [])) map[id] = 'LG'
    return map
  }, [leadership])


  const [searchParams, setSearchParams] = useSearchParams()
  const view: SquadView = (() => {
    const v = searchParams.get('view')
    return VIEW_OPTIONS.some((o) => o.key === v) ? (v as SquadView) : 'ratings'
  })()
  const setView = (v: SquadView) => {
    setSearchParams((prev) => { prev.set('view', v); return prev }, { replace: true })
  }
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [statsDisplayMode, setStatsDisplayMode] = useState<'totals' | 'averages'>(
    () => (localStorage.getItem('squad-stats-mode') as 'totals' | 'averages' | null) ?? 'averages',
  )

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

    // Availability for affected players only
    const availability: Record<string, 'play' | 'rest'> = {
      [playerId]: nextAvailability[playerId] ?? 'play',
    }
    if (targetOccupantId) {
      availability[targetOccupantId] = nextAvailability[targetOccupantId] ?? 'play'
    }

    // Apply each change via its dedicated store action (preserves sanitization logic).
    // React 18 automatic batching collapses these into a single re-render.
    setSelectedLineup(nextAflLineup)
    setManagedReservesLineupSlots(nextReservesLineup)
    batchSetReservesPlayerAvailability(availability)
    setSelectedSubstitute(settings.matchRules.enableSubstitutes ? nextSubstituteId : null)
  }, [
    assignedSlotByPlayer,
    batchSetReservesPlayerAvailability,
    clubId,
    lineupSlotSet,
    players,
    reserves.playerAvailabilityAssignments,
    sanitizedReservesLineup,
    sanitizedSelectedLineup,
    selectedSubstituteId,
    setManagedReservesLineupSlots,
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

    const availability: Record<string, 'play' | 'rest'> = {}
    for (const player of unassignedPlayers) {
      availability[player.id] = nextAvailability[player.id] ?? 'play'
    }
    applyLineupAutoAssign({
      aflLineup: nextAflLineup,
      reservesLineup: nextReservesLineup,
      substituteId: settings.matchRules.enableSubstitutes ? nextSubstituteId : null,
      availability,
    })
  }, [
    applyLineupAutoAssign,
    clubId,
    clubPlayers,
    getPlayerSlotProjection,
    lineupSlots,
    playerClubId,
    reserves.playerAvailabilityAssignments,
    sanitizedReservesLineup,
    sanitizedSelectedLineup,
    selectedSubstituteId,
    settings.matchRules.enableSubstitutes,
  ])

  // Stable refs so `columns` doesn't rebuild every time the lineup changes.
  // The ref values are updated synchronously during render (before JSX is evaluated)
  // so cell renderers always see the current assigned slots / options.
  const assignedSlotByPlayerRef = useRef(assignedSlotByPlayer)
  assignedSlotByPlayerRef.current = assignedSlotByPlayer
  const getSlotOptionsRef = useRef(getSlotOptionsForPlayer)
  getSlotOptionsRef.current = getSlotOptionsForPlayer
  const handleChangeAssignedSlotRef = useRef(handleChangeAssignedSlot)
  handleChangeAssignedSlotRef.current = handleChangeAssignedSlot

  const stableGetAssignedSlot = useCallback(
    (playerId: string) => assignedSlotByPlayerRef.current.get(playerId) ?? null,
    [],
  )
  const stableGetSlotOptions = useCallback(
    (player: Player) => getSlotOptionsRef.current(player),
    [],
  )
  const stableOnChangeAssignedSlot = useCallback(
    (playerId: string, slot: string) => handleChangeAssignedSlotRef.current(playerId, slot as AssignmentSlot),
    [],
  )

  const columns = useMemo(
    () =>
      buildColumns(view, reserves.seasonStatsByPlayer, statsDisplayMode, currentYear, {
        enabled: clubId === playerClubId,
        getAssignedSlot: stableGetAssignedSlot,
        getSlotOptions: stableGetSlotOptions,
        onChangeAssignedSlot: stableOnChangeAssignedSlot,
      }),
    [
      clubId,
      currentYear,
      playerClubId,
      reserves.seasonStatsByPlayer,
      stableGetAssignedSlot,
      stableGetSlotOptions,
      stableOnChangeAssignedSlot,
      statsDisplayMode,
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
    defaultSort: SQUAD_DEFAULT_SORT,
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
      if (quickFilter === 'vfl' && canBeSelectedForAfl(p)) return false
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
        {clubId === playerClubId && (
          <Button size="sm" variant="outline" onClick={handleAutoAssignUnassigned}>
            Auto Assign Unassigned
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={view} onValueChange={(v) => setView(v as SquadView)}>
          <TabsList>
            {VIEW_OPTIONS.map((v) => (
              <TabsTrigger key={v.key} value={v.key}>
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          {view === 'ratings' && 'Overall and positional ratings, star tier, and lineup slot assignment.'}
          {view === 'stats' && 'Season statistics — toggle between cumulative totals and per-game averages.'}
          {view === 'contracts' && 'Year-by-year salary commitment for the next 5 seasons. Manage deals on the Contracts page.'}
          {view === 'development' && 'Potential ceiling, development rate, and peak age window for each player.'}
          {view === 'leadership' && 'Captain, vice-captain, and leadership group. Sorted by leadership score.'}
          {view === 'readiness' && 'Pre-game readiness — composite score from fitness, fatigue, form, and morale. Sort by Readiness to find risks.'}
          {view === 'cohesion' && 'Team cohesion — how well your squad works together. Affects match performance through leadership, role familiarity, unit chemistry, list continuity, and morale.'}
        </p>
        {view === 'stats' && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={statsDisplayMode === 'totals' ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => {
                setStatsDisplayMode('totals')
                localStorage.setItem('squad-stats-mode', 'totals')
              }}
            >
              Totals
            </Button>
            <Button
              size="sm"
              variant={statsDisplayMode === 'averages' ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => {
                setStatsDisplayMode('averages')
                localStorage.setItem('squad-stats-mode', 'averages')
              }}
            >
              Averages
            </Button>
          </div>
        )}
      </div>

      {view === 'leadership' && (
        <LeadershipTab
          clubPlayers={clubPlayers}
          players={players}
          leadership={leadership}
          isEditable={clubId === playerClubId}
          onUpdate={(l) => setClubLeadership(clubId, l)}
          onAutoSelect={() => setClubLeadership(clubId, autoSelectLeadership(players, clubId))}
        />
      )}

      {view === 'cohesion' && club && (
        <CohesionTab
          club={club}
          clubPlayers={clubPlayers}
          currentRound={currentRound}
        />
      )}

      {view !== 'leadership' && view !== 'cohesion' && clubId === playerClubId && unassignedErrorPlayerIds.size > 0 && (
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

      {view !== 'leadership' && view !== 'cohesion' && (<>
      <div className="flex flex-wrap gap-4">
        {clubId === playerClubId && <ClubBFLeaderboardWidget />}
        <Card className="flex-1 min-w-[280px]">
          <CardContent className="p-3 space-y-2.5">
            {/* Filters row */}
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_FILTERS.map((f) => (
                <Button
                  key={f.key}
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-7 px-2.5 text-xs',
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
                              : undefined,
                  )}
                  onClick={() => setQuickFilter(f.key)}
                >
                  {f.label}
                </Button>
              ))}
              <Input className="h-7 w-40 text-xs" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="ml-auto">
                <TableViewManagerControl columns={tableViewColumns} manager={tableView} />
              </div>
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
      </>)}
    </div>
  )
}











