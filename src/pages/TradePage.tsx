import { useMemo, useState, useCallback, type ReactNode } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { Player } from '@/types/player'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
  Newspaper,
  TrendingUp,
  TrendingDown,
  Minus,
  Bell,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import type { NegotiationThread } from '@/types/negotiation'
import {
  getTradeIntelLevel,
  fuzzSignalBar,
  getStanceLabel,
  getSignalColor,
  generateTextDossier,
} from '@/engine/trades/leverageEngine'
import { diffDays } from '@/engine/calendar/calendarEngine'
import { gradeTradeRetrospective } from '@/engine/history/summaryEngine'
import type { TradeGradeLetter } from '@/engine/history/summaryEngine'
import { getPackageTradeValue } from '@/engine/trades/tradeValuation'
import type { TradeInboxItem, TradeDramaState, TradeInboxEvent, BiddingWarCluster } from '@/types/trade'
import { getDemandAdjustedValue } from '@/engine/trades/tradeNegotiationEngine'
import { useTableViewManager, type TableViewColumnConfig } from '@/components/table-view/useTableViewManager'
import { TableViewManagerControl } from '@/components/table-view/TableViewManagerControl'
import { ShortlistAssignMenu, ShortlistManager } from '@/components/shortlists/ShortlistManager'
import type { BoardApprovalResult } from '@/types/boardApproval'
import { BoardApprovalPanel } from '@/components/board/BoardApprovalPanel'
import { getDurabilityRating, durabilityRatingColor, getInjuryRiskLevel, injuryRiskDisplay } from '@/lib/injuryRisk'
import { PlayerHoverCard } from '@/components/player/PlayerHoverCard'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(value: number): string {
  return '$' + value.toLocaleString('en-AU', { maximumFractionDigits: 0 })
}

function formatPoints(value: number): string {
  return value.toLocaleString('en-AU', { maximumFractionDigits: 0 }) + ' pts'
}

function getTradeBalance(
  yourValue: number,
  theirValue: number,
): 'fair' | 'slight' | 'lopsided' {
  if (theirValue === 0 && yourValue === 0) return 'fair'
  const max = Math.max(yourValue, theirValue)
  if (max === 0) return 'fair'
  const ratio = Math.min(yourValue, theirValue) / max
  if (ratio >= 0.85) return 'fair'
  if (ratio >= 0.65) return 'slight'
  return 'lopsided'
}

function getBalanceColor(balance: 'fair' | 'slight' | 'lopsided'): string {
  switch (balance) {
    case 'fair':
      return 'text-green-500'
    case 'slight':
      return 'text-yellow-500'
    case 'lopsided':
      return 'text-red-500'
  }
}

function getBalanceBgColor(balance: 'fair' | 'slight' | 'lopsided'): string {
  switch (balance) {
    case 'fair':
      return 'bg-green-500'
    case 'slight':
      return 'bg-yellow-500'
    case 'lopsided':
      return 'bg-red-500'
  }
}

// ---------------------------------------------------------------------------
// Player Selection List (used in trade builder)
// ---------------------------------------------------------------------------

function PlayerSelectionList({
  players,
  selectedIds,
  onToggle,
  searchValue,
  onSearchChange,
  clubName,
  emptyMessage,
  tableId,
  renderActions,
}: {
  players: Player[]
  selectedIds: Set<string>
  onToggle: (playerId: string) => void
  searchValue: string
  onSearchChange: (value: string) => void
  clubName: string
  emptyMessage: string
  tableId: string
  renderActions?: (player: Player) => ReactNode
}) {
  const filtered = useMemo(() => {
    if (!searchValue.trim()) return players
    const query = searchValue.toLowerCase()
    return players.filter(
      (p) =>
        p.firstName.toLowerCase().includes(query) ||
        p.lastName.toLowerCase().includes(query) ||
        p.position.primary.toLowerCase().includes(query),
    )
  }, [players, searchValue])

  const viewColumns = useMemo<TableViewColumnConfig[]>(
    () => [
      { id: 'selected', label: '', defaultWidth: 40, sortable: false },
      { id: 'player', label: 'Player', defaultWidth: 180, sortable: true },
      { id: 'pos', label: 'Pos', defaultWidth: 70, sortable: true },
      { id: 'age', label: 'Age', defaultWidth: 56, sortable: true },
      { id: 'aav', label: 'AAV', defaultWidth: 90, sortable: true },
      { id: 'actions', label: '', defaultWidth: 110, sortable: false },
    ],
    [],
  )
  const tableView = useTableViewManager({
    tableId,
    columns: viewColumns,
    defaultSort: { columnId: 'player', direction: 'asc' },
  })
  const visibleColumnIds = useMemo(() => {
    const hidden = new Set(tableView.snapshot.hiddenColumnIds)
    return tableView.snapshot.columnOrder.filter((id) => !hidden.has(id))
  }, [tableView.snapshot.columnOrder, tableView.snapshot.hiddenColumnIds])
  const sorted = useMemo(() => {
    const sort = tableView.snapshot.sort
    if (!sort) return filtered
    const rows = [...filtered]
    rows.sort((a, b) => {
      const va =
        sort.columnId === 'player' ? `${a.lastName},${a.firstName}`.toLowerCase()
        : sort.columnId === 'pos' ? a.position.primary
        : sort.columnId === 'age' ? a.age
        : sort.columnId === 'aav' ? a.contract.aav
        : 0
      const vb =
        sort.columnId === 'player' ? `${b.lastName},${b.firstName}`.toLowerCase()
        : sort.columnId === 'pos' ? b.position.primary
        : sort.columnId === 'age' ? b.age
        : sort.columnId === 'aav' ? b.contract.aav
        : 0
      if (va === vb) return 0
      return va > vb ? 1 : -1
    })
    return sort.direction === 'desc' ? rows.reverse() : rows
  }, [filtered, tableView.snapshot.sort])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder={`Search ${clubName} players...`}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 text-sm"
        />
        <TableViewManagerControl columns={viewColumns} manager={tableView} />
      </div>
      <ScrollArea className="h-[300px] rounded-md border">
        <div className="p-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {emptyMessage}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumnIds.includes('selected') && <TableHead className="px-2 py-1 text-xs w-8"></TableHead>}
                  {visibleColumnIds.includes('player') && <TableHead className="px-2 py-1 text-xs">Player</TableHead>}
                  {visibleColumnIds.includes('pos') && <TableHead className="px-2 py-1 text-xs">Pos</TableHead>}
                  {visibleColumnIds.includes('age') && <TableHead className="px-2 py-1 text-xs text-center">Age</TableHead>}
                  {visibleColumnIds.includes('aav') && <TableHead className="px-2 py-1 text-xs text-right">AAV</TableHead>}
                  {visibleColumnIds.includes('actions') && <TableHead className="px-2 py-1 text-xs text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((player) => {
                  const isSelected = selectedIds.has(player.id)
                  return (
                    <TableRow
                      key={player.id}
                      className={`text-sm cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary/10 hover:bg-primary/15'
                          : 'hover:bg-accent/50'
                      }`}
                      onClick={() => onToggle(player.id)}
                    >
                      {visibleColumnIds.includes('selected') && <TableCell className="px-2 py-1.5">
                        <div
                          className={`h-4 w-4 rounded border flex items-center justify-center ${
                            isSelected
                              ? 'bg-primary border-primary'
                              : 'border-muted-foreground/30'
                          }`}
                        >
                          {isSelected && (
                            <svg
                              className="h-3 w-3 text-primary-foreground"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                      </TableCell>}
                      {visibleColumnIds.includes('player') && <TableCell className="px-2 py-1.5 font-medium whitespace-nowrap">
                        <PlayerHoverCard player={player} side="right">
                          <span>{player.firstName} {player.lastName}</span>
                        </PlayerHoverCard>
                      </TableCell>}
                      {visibleColumnIds.includes('pos') && <TableCell className="px-2 py-1.5">
                        <Badge variant="outline" className="text-xs">
                          {player.position.primary}
                        </Badge>
                      </TableCell>}
                      {visibleColumnIds.includes('age') && <TableCell className="px-2 py-1.5 text-center">
                        {player.age}
                      </TableCell>}
                      {visibleColumnIds.includes('aav') && <TableCell className="px-2 py-1.5 text-right font-mono text-xs">
                        {formatDollars(player.contract.aav)}
                      </TableCell>}
                      {visibleColumnIds.includes('actions') && <TableCell className="px-2 py-1.5 text-right">
                        {renderActions?.(player)}
                      </TableCell>}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Selected Players Display (below each list)
// ---------------------------------------------------------------------------

function SelectedPlayerChips({
  players,
  onRemove,
  label,
}: {
  players: Player[]
  onRemove: (playerId: string) => void
  label: string
}) {
  if (players.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">
        No players selected for &quot;{label}&quot;
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5 py-2">
      {players.map((player) => (
        <Badge
          key={player.id}
          variant="secondary"
          className="gap-1 pr-1 text-xs"
        >
          {player.firstName[0]}. {player.lastName}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(player.id)
            }}
            className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trade Value Bar
// ---------------------------------------------------------------------------

function TradeValueBar({
  yourValue,
  theirValue,
}: {
  yourValue: number
  theirValue: number
}) {
  const total = yourValue + theirValue
  const yourPct = total > 0 ? (yourValue / total) * 100 : 50
  const balance = getTradeBalance(yourValue, theirValue)
  const balanceColor = getBalanceColor(balance)
  const barColor = getBalanceBgColor(balance)

  const balanceLabel =
    balance === 'fair'
      ? 'Fair Trade'
      : balance === 'slight'
        ? 'Slightly Imbalanced'
        : 'Heavily Lopsided'

  const BalanceIcon =
    balance === 'fair' ? Minus : yourValue > theirValue ? TrendingUp : TrendingDown

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div>
            <span className="text-muted-foreground">Your package: </span>
            <span className="font-semibold">{formatPoints(yourValue)}</span>
          </div>
          <div className={`flex items-center gap-1 font-medium ${balanceColor}`}>
            <BalanceIcon className="h-4 w-4" />
            {balanceLabel}
          </div>
          <div className="text-right">
            <span className="text-muted-foreground">Their package: </span>
            <span className="font-semibold">{formatPoints(theirValue)}</span>
          </div>
        </div>

        {/* Bar */}
        <div className="relative h-3 rounded-full bg-muted overflow-hidden">
          {total > 0 && (
            <>
              <div
                className={`absolute left-0 top-0 h-full rounded-l-full transition-all ${barColor} opacity-70`}
                style={{ width: `${yourPct}%` }}
              />
              <div
                className="absolute top-0 h-full w-0.5 bg-foreground/50"
                style={{ left: '50%' }}
              />
            </>
          )}
        </div>

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>You send more</span>
          <span>Even</span>
          <span>You receive more</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Salary Impact Display
// ---------------------------------------------------------------------------

function SalaryImpact({
  sendPlayers,
  receivePlayers,
}: {
  sendPlayers: Player[]
  receivePlayers: Player[]
}) {
  const salaryOut = sendPlayers.reduce((sum, p) => sum + p.contract.aav, 0)
  const salaryIn = receivePlayers.reduce((sum, p) => sum + p.contract.aav, 0)
  const netChange = salaryIn - salaryOut
  const netColor =
    netChange > 0
      ? 'text-red-500'
      : netChange < 0
        ? 'text-green-500'
        : 'text-muted-foreground'

  return (
    <div className="grid grid-cols-3 gap-4 text-sm">
      <div className="text-center">
        <p className="text-muted-foreground text-xs">Salary Out</p>
        <p className="font-semibold text-green-500">
          -{formatDollars(salaryOut)}
        </p>
      </div>
      <div className="text-center">
        <p className="text-muted-foreground text-xs">Net Change</p>
        <p className={`font-semibold ${netColor}`}>
          {netChange >= 0 ? '+' : ''}
          {formatDollars(Math.abs(netChange))}
          {netChange < 0 ? ' saved' : netChange > 0 ? ' added' : ''}
        </p>
      </div>
      <div className="text-center">
        <p className="text-muted-foreground text-xs">Salary In</p>
        <p className="font-semibold text-red-500">
          +{formatDollars(salaryIn)}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trade Completed Dialog
// ---------------------------------------------------------------------------

function TradeCompletedDialog({
  open,
  onOpenChange,
  yourClubName,
  partnerClubName,
  sentPlayers,
  receivedPlayers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  yourClubName: string
  partnerClubName: string
  sentPlayers: Player[]
  receivedPlayers: Player[]
}) {
  const salaryOut = sentPlayers.reduce((sum, p) => sum + p.contract.aav, 0)
  const salaryIn = receivedPlayers.reduce((sum, p) => sum + p.contract.aav, 0)
  const netSalary = salaryIn - salaryOut

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Trade Completed!
          </DialogTitle>
          <DialogDescription>
            The following trade has been finalized between {yourClubName} and{' '}
            {partnerClubName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Sent */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">
                {yourClubName} sends:
              </p>
              <div className="space-y-1">
                {sentPlayers.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-md border p-2 text-sm space-y-0.5"
                  >
                    <p className="font-medium">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.position.primary}, {p.age}yo -{' '}
                      {formatDollars(p.contract.aav)}/yr
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Received */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">
                {yourClubName} receives:
              </p>
              <div className="space-y-1">
                {receivedPlayers.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-md border p-2 text-sm space-y-0.5"
                  >
                    <p className="font-medium">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.position.primary}, {p.age}yo -{' '}
                      {formatDollars(p.contract.aav)}/yr
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          {/* Impact Summary */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Impact</p>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border p-2 text-center">
                <p className="text-xs text-muted-foreground">Salary Change</p>
                <p
                  className={`font-semibold ${netSalary > 0 ? 'text-red-500' : netSalary < 0 ? 'text-green-500' : ''}`}
                >
                  {netSalary >= 0 ? '+' : '-'}
                  {formatDollars(Math.abs(netSalary))}
                </p>
              </div>
              <div className="rounded-md border p-2 text-center">
                <p className="text-xs text-muted-foreground">Players Sent</p>
                <p className="font-semibold">{sentPlayers.length}</p>
              </div>
              <div className="rounded-md border p-2 text-center">
                <p className="text-xs text-muted-foreground">
                  Players Received
                </p>
                <p className="font-semibold">{receivedPlayers.length}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Roster spots:{' '}
              {sentPlayers.length !== receivedPlayers.length
                ? `Net change of ${receivedPlayers.length - sentPlayers.length > 0 ? '+' : ''}${receivedPlayers.length - sentPlayers.length} roster spot${Math.abs(receivedPlayers.length - sentPlayers.length) === 1 ? '' : 's'}`
                : 'No change'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Make a Trade Tab
// ---------------------------------------------------------------------------

function MakeTradeTab() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const tradeBlock = useGameStore((s) => s.tradeBlock)
  const startNegotiationThread = useGameStore((s) => s.startNegotiationThread)

  const [partnerId, setPartnerId] = useState<string>('')
  const [capError, setCapError] = useState<string | null>(null)
  const [sendIds, setSendIds] = useState<Set<string>>(new Set())
  const [receiveIds, setReceiveIds] = useState<Set<string>>(new Set())
  const [sendSearch, setSendSearch] = useState('')
  const [receiveSearch, setReceiveSearch] = useState('')
  const [tradeResult, setTradeResult] = useState<
    'submitted' | 'rejected' | null
  >(null)
  const [rejectionMessage, setRejectionMessage] = useState('')
  const [showCompletedDialog, setShowCompletedDialog] = useState(false)
  const [completedTradeSent, _setCompletedTradeSent] = useState<Player[]>([])
  const [completedTradeReceived, _setCompletedTradeReceived] = useState<
    Player[]
  >([])

  const myClub = clubs[playerClubId]
  const partnerClub = partnerId ? clubs[partnerId] : null

  const otherClubs = useMemo(
    () =>
      Object.values(clubs)
        .filter((c) => c.id !== playerClubId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clubs, playerClubId],
  )

  const myPlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId)
        .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [players, playerClubId],
  )

  const partnerPlayers = useMemo(
    () =>
      partnerId
        ? Object.values(players)
            .filter((p) => p.clubId === partnerId)
            .sort((a, b) => a.lastName.localeCompare(b.lastName))
        : [],
    [players, partnerId],
  )

  const sendPlayers = useMemo(
    () => myPlayers.filter((p) => sendIds.has(p.id)),
    [myPlayers, sendIds],
  )

  const receivePlayers = useMemo(
    () => partnerPlayers.filter((p) => receiveIds.has(p.id)),
    [partnerPlayers, receiveIds],
  )

  const currentYear = new Date().getFullYear()
  const yourValue = useMemo(
    () => sendPlayers.reduce((sum, p) => {
      const base = getPackageTradeValue([p.id], [], players, currentYear)
      const demand = tradeBlock.listings[p.id]?.demandScore ?? 0
      return sum + getDemandAdjustedValue(base, demand)
    }, 0),
    [sendPlayers, players, currentYear, tradeBlock.listings],
  )
  const theirValue = useMemo(
    () => receivePlayers.reduce((sum, p) => {
      const base = getPackageTradeValue([p.id], [], players, currentYear)
      const demand = tradeBlock.listings[p.id]?.demandScore ?? 0
      return sum + getDemandAdjustedValue(base, demand)
    }, 0),
    [receivePlayers, players, currentYear, tradeBlock.listings],
  )

  const handlePartnerChange = useCallback((clubId: string) => {
    setPartnerId(clubId)
    setReceiveIds(new Set())
    setReceiveSearch('')
    setTradeResult(null)
    setRejectionMessage('')
  }, [])

  const toggleSendPlayer = useCallback((playerId: string) => {
    setSendIds((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        next.add(playerId)
      }
      return next
    })
    setTradeResult(null)
  }, [])

  const toggleReceivePlayer = useCallback((playerId: string) => {
    setReceiveIds((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        next.add(playerId)
      }
      return next
    })
    setTradeResult(null)
  }, [])

  const removeSendPlayer = useCallback((playerId: string) => {
    setSendIds((prev) => {
      const next = new Set(prev)
      next.delete(playerId)
      return next
    })
    setTradeResult(null)
  }, [])

  const removeReceivePlayer = useCallback((playerId: string) => {
    setReceiveIds((prev) => {
      const next = new Set(prev)
      next.delete(playerId)
      return next
    })
    setTradeResult(null)
  }, [])

  const handleSubmitTrade = useCallback(() => {
    if (sendPlayers.length === 0 || receivePlayers.length === 0 || !partnerClub)
      return

    setCapError(null)

    const result = startNegotiationThread(
      partnerId,
      sendPlayers.map((p) => p.id),
      receivePlayers.map((p) => p.id),
    )

    if (!result.success) {
      setTradeResult('rejected')
      setRejectionMessage(result.error ?? 'Trade was rejected.')
      setCapError(result.error ?? null)
      return
    }

    setTradeResult('submitted')
    setSendIds(new Set())
    setReceiveIds(new Set())
  }, [
    sendPlayers,
    receivePlayers,
    partnerClub,
    partnerId,
    startNegotiationThread,
  ])

  const handleResetTrade = useCallback(() => {
    setSendIds(new Set())
    setReceiveIds(new Set())
    setSendSearch('')
    setReceiveSearch('')
    setTradeResult(null)
    setRejectionMessage('')
  }, [])

  const canSubmit =
    sendPlayers.length > 0 &&
    receivePlayers.length > 0 &&
    partnerId !== '' &&
    tradeResult !== 'submitted'

  return (
    <div className="space-y-4">
      {/* Step 1: Select Partner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Step 1: Select Trade Partner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={partnerId} onValueChange={handlePartnerChange}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Choose a club to trade with..." />
            </SelectTrigger>
            <SelectContent>
              {otherClubs.map((club) => (
                <SelectItem key={club.id} value={club.id}>
                  {club.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Step 2: Build Trade Package */}
      {partnerId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Step 2: Build Trade Package
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={handleResetTrade}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Two columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* You Send */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: myClub?.colors.primary ?? '#666',
                    }}
                  />
                  <h3 className="text-sm font-semibold">
                    You Send ({myClub?.abbreviation})
                  </h3>
                </div>
                <PlayerSelectionList
                  players={myPlayers}
                  selectedIds={sendIds}
                  onToggle={toggleSendPlayer}
                  searchValue={sendSearch}
                  onSearchChange={setSendSearch}
                  clubName={myClub?.name ?? 'your club'}
                  emptyMessage="No players found"
                  tableId={`trade-send-${playerClubId}`}
                  renderActions={(player) => (
                    <ShortlistAssignMenu targetType="player" targetId={player.id} buttonLabel="List" buttonVariant="ghost" buttonSize="sm" />
                  )}
                />
                <SelectedPlayerChips
                  players={sendPlayers}
                  onRemove={removeSendPlayer}
                  label="You Send"
                />
              </div>

              {/* You Receive */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor:
                        partnerClub?.colors.primary ?? '#666',
                    }}
                  />
                  <h3 className="text-sm font-semibold">
                    You Receive ({partnerClub?.abbreviation})
                  </h3>
                </div>
                <PlayerSelectionList
                  players={partnerPlayers}
                  selectedIds={receiveIds}
                  onToggle={toggleReceivePlayer}
                  searchValue={receiveSearch}
                  onSearchChange={setReceiveSearch}
                  clubName={partnerClub?.name ?? 'their club'}
                  emptyMessage="No players found"
                  tableId={`trade-receive-${partnerId || 'none'}`}
                  renderActions={(player) => (
                    <ShortlistAssignMenu targetType="player" targetId={player.id} buttonLabel="List" buttonVariant="ghost" buttonSize="sm" />
                  )}
                />
                <SelectedPlayerChips
                  players={receivePlayers}
                  onRemove={removeReceivePlayer}
                  label="You Receive"
                />
              </div>
            </div>

            {/* Trade Value */}
            {(sendPlayers.length > 0 || receivePlayers.length > 0) && (
              <>
                <Separator />
                <TradeValueBar
                  yourValue={yourValue}
                  theirValue={theirValue}
                />

                {/* Fantasy Value Panel */}
                {(sendPlayers.length > 0 || receivePlayers.length > 0) && (
                  <div className="rounded-md border p-3 space-y-2 bg-muted/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Fantasy Value (avg/game this season)
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">You Send</p>
                        {sendPlayers.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">—</p>
                        ) : (
                          sendPlayers.map((p) => {
                            const gp = p.seasonStats.gamesPlayed
                            const sc = gp > 0 ? Math.round(p.seasonStats.superCoachPoints / gp) : null
                            const fa = gp > 0 ? Math.round(p.seasonStats.aflFantasyPoints / gp) : null
                            return (
                              <div key={p.id} className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground truncate">
                                  {p.firstName[0]}. {p.lastName}
                                </span>
                                <span className="text-xs font-mono whitespace-nowrap">
                                  {sc != null ? (
                                    <>
                                      <span className="text-blue-500">SC {sc}</span>
                                      <span className="text-muted-foreground mx-1">·</span>
                                      <span className="text-emerald-500">F {fa}</span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">No season data</span>
                                  )}
                                </span>
                              </div>
                            )
                          })
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">You Receive</p>
                        {receivePlayers.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">—</p>
                        ) : (
                          receivePlayers.map((p) => {
                            const gp = p.seasonStats.gamesPlayed
                            const sc = gp > 0 ? Math.round(p.seasonStats.superCoachPoints / gp) : null
                            const fa = gp > 0 ? Math.round(p.seasonStats.aflFantasyPoints / gp) : null
                            return (
                              <div key={p.id} className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground truncate">
                                  {p.firstName[0]}. {p.lastName}
                                </span>
                                <span className="text-xs font-mono whitespace-nowrap">
                                  {sc != null ? (
                                    <>
                                      <span className="text-blue-500">SC {sc}</span>
                                      <span className="text-muted-foreground mx-1">·</span>
                                      <span className="text-emerald-500">F {fa}</span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">No season data</span>
                                  )}
                                </span>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Salary Impact */}
                <SalaryImpact
                  sendPlayers={sendPlayers}
                  receivePlayers={receivePlayers}
                />
              </>
            )}

            {/* Result Messages */}
            {tradeResult === 'rejected' && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-600 dark:text-red-400">
                    Trade Rejected
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {rejectionMessage}
                  </p>
                </div>
              </div>
            )}

            {tradeResult === 'submitted' && (
              <div className="rounded-md border border-blue-500/50 bg-blue-500/10 p-3 flex items-start gap-2">
                <MessageSquare className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-600 dark:text-blue-400">
                    Offer Submitted
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Your offer has been sent. Open the <strong>Negotiate</strong> tab to track the response and counter if needed.
                  </p>
                </div>
              </div>
            )}

            {/* Cap Error */}
            {capError && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-600 dark:text-red-400">Salary Cap Blocked</p>
                  <p className="text-sm text-muted-foreground">{capError}</p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleResetTrade}
                disabled={
                  sendPlayers.length === 0 && receivePlayers.length === 0
                }
              >
                Clear All
              </Button>
              <Button
                onClick={handleSubmitTrade}
                disabled={!canSubmit}
                className="min-w-[140px]"
              >
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Submit Trade
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trade Completed Dialog */}
      <TradeCompletedDialog
        open={showCompletedDialog}
        onOpenChange={setShowCompletedDialog}
        yourClubName={myClub?.abbreviation ?? 'Your Club'}
        partnerClubName={partnerClub?.abbreviation ?? 'Their Club'}
        sentPlayers={completedTradeSent}
        receivedPlayers={completedTradeReceived}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Negotiate Tab
// ---------------------------------------------------------------------------

function SignalBar({ score, level, seed }: { score: number; level: 1 | 2 | 3; seed: number }) {
  const bars = level >= 3 ? Math.round((score / 100) * 5) : fuzzSignalBar(score, seed)
  const color = getSignalColor(bars)
  return (
    <span className="flex gap-0.5">
      {[1,2,3,4,5].map((i) => (
        <span
          key={i}
          className={`inline-block w-2 h-3 rounded-sm ${i <= bars ? color.replace('text-', 'bg-') : 'bg-muted'}`}
        />
      ))}
    </span>
  )
}

function DotIndicator({ score }: { score: number }) {
  const color = score >= 60 ? 'bg-red-500' : score >= 30 ? 'bg-amber-500' : 'bg-green-500'
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
}

function LeveragePanel({ thread, clubs, tradeHistory }: {
  thread: NegotiationThread
  clubs: Record<string, import('@/types/club').Club>
  tradeHistory: import('@/types/game').CompletedTrade[]
}) {
  const [open, setOpen] = useState(false)
  const lev = thread.leverageSnapshot
  const partnerClub = clubs[thread.partnerClubId]
  const level = getTradeIntelLevel(tradeHistory)
  const seed = lev.urgencyScore + lev.capPressureScore
  const playerNames: string[] = []

  const rows = [
    { label: 'Urgency', score: lev.urgencyScore },
    { label: 'Cap Pressure', score: lev.capPressureScore },
    { label: 'List Need', score: lev.listNeedScore },
    { label: 'Alt. Suitors', score: Math.min(lev.alternativeCount * 25, 100) },
  ]

  return (
    <div className="rounded-md border">
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Trade Intelligence · {partnerClub?.name ?? thread.partnerClubId}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t">
          {level === 1 && (
            <div className="space-y-1.5 pt-2">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">—</span>
                  <DotIndicator score={r.score} />
                </div>
              ))}
            </div>
          )}

          {level >= 2 && (
            <div className="space-y-1.5 pt-2">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{r.label}</span>
                  <SignalBar score={r.score} level={level} seed={seed + r.score} />
                </div>
              ))}
              {level >= 2 && (
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <span className="text-muted-foreground">Public Stance</span>
                  <span className="text-xs font-medium">{getStanceLabel(lev.publicStance)}</span>
                </div>
              )}
            </div>
          )}

          {level >= 3 && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2 mt-2 leading-relaxed">
              {generateTextDossier(lev, partnerClub?.name ?? thread.partnerClubId, playerNames)}
            </p>
          )}

          <p className="text-[10px] text-muted-foreground/60 pt-1">
            Trade intel based on {tradeHistory.length} completed trade{tradeHistory.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  )
}

function NegotiateTab() {
  const negotiationThreads = useGameStore((s) => s.negotiationThreads)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const tradeHistory = useGameStore((s) => s.tradeHistory)
  const acceptNegotiationThread = useGameStore((s) => s.acceptNegotiationThread)
  const rejectNegotiationThread = useGameStore((s) => s.rejectNegotiationThread)
  const counterNegotiationRound = useGameStore((s) => s.counterNegotiationRound)
  const currentDate = useGameStore((s) => s.currentDate)
  const playerClubId = useGameStore((s) => s.playerClubId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCounter, setShowCounter] = useState(false)
  const [counterSendIds, setCounterSendIds] = useState<Set<string>>(new Set())
  const [counterReceiveIds, setCounterReceiveIds] = useState<Set<string>>(new Set())

  const sorted = useMemo(() =>
    [...negotiationThreads].sort((a, b) => b.initiatedAt.localeCompare(a.initiatedAt)),
    [negotiationThreads],
  )

  const selected = sorted.find((t) => t.id === selectedId) ?? sorted[0] ?? null

  // Auto-select first thread
  const effectiveId = selected?.id ?? null

  const statusBadge = (thread: NegotiationThread) => {
    const last = thread.rounds[thread.rounds.length - 1]
    if (thread.status === 'completed') return <Badge className="bg-green-600 text-white text-[10px]">Completed</Badge>
    if (thread.status === 'collapsed') return <Badge variant="destructive" className="text-[10px]">Lapsed</Badge>
    if (last?.status === 'pending-user') return <Badge className="bg-blue-600 text-white text-[10px]">Action Required</Badge>
    if (last?.status === 'pending-ai' || last?.status === 'stalling') {
      const daysLeft = diffDays(currentDate, last.respondBy)
      return <Badge variant="secondary" className="text-[10px]">Awaiting ~{Math.max(0, daysLeft)}d</Badge>
    }
    return <Badge variant="outline" className="text-[10px]">{last?.status}</Badge>
  }

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground font-medium">No active negotiations</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Submit an offer from the Make a Trade tab to start a negotiation thread.</p>
        </CardContent>
      </Card>
    )
  }

  const activeThread = effectiveId ? (sorted.find((t) => t.id === effectiveId) ?? null) : null
  const lastRound = activeThread?.rounds[activeThread.rounds.length - 1]

  const myPlayers = Object.values(players).filter((p) => p.clubId === playerClubId)
  const partnerPlayers = activeThread
    ? Object.values(players).filter((p) => p.clubId === activeThread.partnerClubId)
    : []

  const handleCounter = () => {
    if (!activeThread) return
    counterNegotiationRound(
      activeThread.id,
      [...counterSendIds],
      [...counterReceiveIds],
    )
    setShowCounter(false)
    setCounterSendIds(new Set())
    setCounterReceiveIds(new Set())
  }

  return (
    <div className="flex gap-4 min-h-[480px]">
      {/* Thread List */}
      <div className="w-[260px] shrink-0 space-y-2">
        {sorted.map((thread) => {
          const partner = clubs[thread.partnerClubId]
          const lastR = thread.rounds[thread.rounds.length - 1]
          const playerNames = lastR?.offer.playerMoves.slice(0,3).map((m) => {
            const p = players[m.playerId]
            return p ? `${p.firstName[0]}. ${p.lastName}` : m.playerId
          }).join(', ')

          return (
            <button
              key={thread.id}
              onClick={() => { setSelectedId(thread.id); setShowCounter(false) }}
              className={`w-full text-left rounded-md border p-2.5 hover:bg-muted/40 transition-colors space-y-1 ${effectiveId === thread.id ? 'border-primary bg-muted/30' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{partner?.abbreviation ?? thread.partnerClubId}</span>
                {statusBadge(thread)}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{playerNames || 'No players'}</p>
              <p className="text-[10px] text-muted-foreground/60">Round {lastR?.roundNumber ?? 1} of {thread.maxRounds}</p>
            </button>
          )
        })}
      </div>

      {/* Thread Detail */}
      <div className="flex-1 space-y-3">
        {activeThread ? (
          <>
            <LeveragePanel thread={activeThread} clubs={clubs} tradeHistory={tradeHistory} />

            {/* Round History */}
            <div className="rounded-md border">
              <div className="px-3 py-2 text-sm font-medium border-b">Round History</div>
              <ScrollArea className="max-h-[240px]">
                <div className="p-3 space-y-2">
                  {activeThread.rounds.map((round) => {
                    const isByUser = round.offererId === playerClubId
                    const sends = round.offer.playerMoves.filter((m) => m.fromClubId === playerClubId)
                    const receives = round.offer.playerMoves.filter((m) => m.toClubId === playerClubId)
                    return (
                      <div key={round.roundNumber} className="rounded border p-2.5 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">Round {round.roundNumber} — {round.offeredAt}</span>
                          <Badge variant="outline" className="text-[10px]">{round.status}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="text-red-500">↑ Sent: </span>
                          {sends.map((m) => {
                            const p = players[m.playerId]
                            return p ? `${p.firstName} ${p.lastName}` : m.playerId
                          }).join(', ') || '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="text-green-500">↓ Receive: </span>
                          {receives.map((m) => {
                            const p = players[m.playerId]
                            return p ? `${p.firstName} ${p.lastName}` : m.playerId
                          }).join(', ') || '—'}
                        </div>
                        {round.aiMessage && !isByUser && (
                          <p className="text-xs italic text-muted-foreground bg-muted/40 rounded px-2 py-1 mt-1">
                            "{round.aiMessage}"
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Action Panel */}
            <div className="rounded-md border p-3 space-y-3">
              {activeThread.status === 'completed' && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Trade completed</span>
                </div>
              )}
              {activeThread.status === 'collapsed' && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm">This negotiation lapsed. Start a new offer from Make a Trade.</span>
                </div>
              )}
              {activeThread.status === 'active' && lastRound?.status === 'pending-user' && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    {clubs[activeThread.partnerClubId]?.name ?? activeThread.partnerClubId} has responded
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => acceptNegotiationThread(activeThread.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowCounter((v) => !v)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Counter
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => rejectNegotiationThread(activeThread.id)}>
                      <X className="h-3.5 w-3.5 mr-1.5" /> Walk Away
                    </Button>
                  </div>

                  {showCounter && (
                    <div className="rounded border p-3 space-y-3 bg-muted/20">
                      <p className="text-xs font-medium text-muted-foreground">Counter Offer — modify your proposal</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-medium mb-1">You Send</p>
                          <ScrollArea className="h-[120px] border rounded">
                            <div className="p-1 space-y-0.5">
                              {myPlayers.map((p) => (
                                <label key={p.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-muted/40 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="h-3 w-3"
                                    checked={counterSendIds.has(p.id)}
                                    onChange={(e) => {
                                      setCounterSendIds((prev) => {
                                        const next = new Set(prev)
                                        if (e.target.checked) next.add(p.id)
                                        else next.delete(p.id)
                                        return next
                                      })
                                    }}
                                  />
                                  <span className="text-xs">{p.firstName} {p.lastName}</span>
                                </label>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                        <div>
                          <p className="text-xs font-medium mb-1">You Receive</p>
                          <ScrollArea className="h-[120px] border rounded">
                            <div className="p-1 space-y-0.5">
                              {partnerPlayers.map((p) => (
                                <label key={p.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-muted/40 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="h-3 w-3"
                                    checked={counterReceiveIds.has(p.id)}
                                    onChange={(e) => {
                                      setCounterReceiveIds((prev) => {
                                        const next = new Set(prev)
                                        if (e.target.checked) next.add(p.id)
                                        else next.delete(p.id)
                                        return next
                                      })
                                    }}
                                  />
                                  <span className="text-xs">{p.firstName} {p.lastName}</span>
                                </label>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                      <Button size="sm" disabled={counterSendIds.size === 0 || counterReceiveIds.size === 0} onClick={handleCounter}>
                        Send Counter
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {activeThread.status === 'active' && (lastRound?.status === 'pending-ai' || lastRound?.status === 'stalling') && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">
                    Waiting for response
                    {lastRound.respondBy > currentDate
                      ? ` — due ${lastRound.respondBy}`
                      : ' — due soon'}
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a negotiation thread
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trade Inbox Tab
// ---------------------------------------------------------------------------

function formatOfferTitle(item: TradeInboxItem, clubs: Record<string, import('@/types/club').Club>): string {
  return item.offer.clubsInvolved
    .map((cid) => clubs[cid]?.abbreviation ?? cid)
    .join(' / ')
}

// ---------------------------------------------------------------------------
// Trade Drama Timeline
// ---------------------------------------------------------------------------

const DRAMA_EVENT_STYLE: Record<TradeInboxEvent['type'], { label: string; dot: string; text: string }> = {
  'new-offer':         { label: 'New Offer',        dot: 'bg-blue-500',   text: 'text-blue-400' },
  'rival-bid':         { label: 'Rival Bid',         dot: 'bg-amber-500',  text: 'text-amber-400' },
  'offer-improved':    { label: 'Offer Sweetened',   dot: 'bg-emerald-500',text: 'text-emerald-400' },
  'offer-withdrawn':   { label: 'Offer Withdrawn',   dot: 'bg-red-500',    text: 'text-red-400' },
  'deadline-pressure': { label: 'Deadline',          dot: 'bg-orange-500', text: 'text-orange-400' },
  'player-push':       { label: 'Player Push',       dot: 'bg-purple-500', text: 'text-purple-400' },
  'rival-withdrew':    { label: 'Rival Pulled Out',  dot: 'bg-slate-500',  text: 'text-slate-400' },
}

function TradeDramaTimeline({ drama }: { drama: TradeDramaState }) {
  const recentEvents = [...drama.events].reverse().slice(0, 15)
  if (recentEvents.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-400" />
          Trade Period Activity
          {drama.biddingWars.length > 0 && (
            <Badge className="ml-auto bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px]">
              {drama.biddingWars.length} bidding war{drama.biddingWars.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="space-y-2">
          {recentEvents.map((ev) => {
            const style = DRAMA_EVENT_STYLE[ev.type]
            const leverage = ev.leverageShift === 'seller'
              ? <TrendingUp className="h-3 w-3 text-emerald-400" />
              : ev.leverageShift === 'buyer'
                ? <TrendingDown className="h-3 w-3 text-red-400" />
                : <Minus className="h-3 w-3 text-muted-foreground" />
            return (
              <div key={ev.id} className="flex items-start gap-2.5 text-xs">
                <div className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`} />
                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${style.text}`}>{style.label}</span>
                  <span className="text-muted-foreground"> · {ev.date}</span>
                  <p className="text-muted-foreground mt-0.5 leading-snug">{ev.message}</p>
                </div>
                <div className="shrink-0 mt-0.5" title={`Leverage: ${ev.leverageShift}`}>{leverage}</div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function TradeInboxTab() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const tradeInbox = useGameStore((s) => s.tradeInbox)
  const tradeDrama = useGameStore((s) => s.tradeDrama)
  const respondToTradeOffer = useGameStore((s) => s.respondToTradeOffer)
  const markTradeOfferRead = useGameStore((s) => s.markTradeOfferRead)
  const generateTradeInboxOffersAction = useGameStore((s) => s.generateTradeInboxOffersAction)
  const previewBoardApproval = useGameStore((s) => s.previewBoardApproval)
  const [error, setError] = useState<string | null>(null)
  const [tradeBoardPreview, setTradeBoardPreview] = useState<{ offerId: string; result: BoardApprovalResult } | null>(null)

  const sorted = useMemo(
    () => [...tradeInbox].sort((a, b) => b.offer.createdAt.localeCompare(a.offer.createdAt)),
    [tradeInbox],
  )

  const pending = sorted.filter((item) => item.offer.status === 'pending-user')

  // Map playerId → bidding war intensity for badge rendering
  const biddingWarMap = useMemo(() => {
    const map = new Map<string, BiddingWarCluster['intensity']>()
    for (const bw of (tradeDrama?.biddingWars ?? [])) {
      map.set(bw.playerId, bw.intensity)
    }
    return map
  }, [tradeDrama])

  const handleRespond = (offerId: string, decision: 'accept' | 'reject' | 'counter') => {
    setError(null)

    // Board approval check for trade acceptance with salary retention
    if (decision === 'accept') {
      const offer = tradeInbox.find((i) => i.id === offerId)?.offer
      if (offer) {
        const userRetention = offer.salaryRetentions
          .filter((r) => r.retainingClubId === playerClubId)
          .reduce((sum, r) => sum + r.amount, 0)

        if (userRetention > 0 && tradeBoardPreview?.offerId !== offerId) {
          const preview = previewBoardApproval('trade', { userSalaryRetention: userRetention })
          if (preview.requiresApproval) {
            setTradeBoardPreview({ offerId, result: preview })
            return
          }
        }
      }
      setTradeBoardPreview(null)
    }

    const result = respondToTradeOffer(offerId, decision)
    if (!result.success) {
      setError(result.error ?? 'Unable to process response')
      setTradeBoardPreview(null)
    } else {
      setError(null)
      setTradeBoardPreview(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Active negotiations from AI clubs. Accept, reject, or send a counter.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {pending.length} pending offer{pending.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => generateTradeInboxOffersAction()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Generate Offers
        </Button>
      </div>

      {tradeDrama && tradeDrama.events.length > 0 && (
        <TradeDramaTimeline drama={tradeDrama} />
      )}

      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">No trade offers in your inbox.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((item) => {
            const incoming = item.offer.playerMoves
              .map((m) => ({ move: m, player: players[m.playerId] }))
              .filter((x) => x.move.toClubId === playerClubId && x.player)
            const outgoing = item.offer.playerMoves
              .map((m) => ({ move: m, player: players[m.playerId] }))
              .filter((x) => x.move.fromClubId === playerClubId && x.player)
            const isPending = item.offer.status === 'pending-user'

            // Find the highest bidding-war intensity among outgoing players
            const biddingWarIntensity = outgoing
              .map((x) => biddingWarMap.get(x.move.playerId))
              .filter((v): v is BiddingWarCluster['intensity'] => v !== undefined)
              .sort((a, b) => ({ hot: 2, moderate: 1, mild: 0 }[b] - ({ hot: 2, moderate: 1, mild: 0 }[a])))[0]

            return (
              <Card
                key={item.id}
                className={!item.read ? 'border-blue-500/60' : ''}
                onClick={() => markTradeOfferRead(item.id)}
              >
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                        {formatOfferTitle(item, clubs)}
                        {biddingWarIntensity === 'hot' && (
                          <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/40">🔥 Bidding War</Badge>
                        )}
                        {biddingWarIntensity === 'moderate' && (
                          <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/40">⚡ Multiple Suitors</Badge>
                        )}
                        {biddingWarIntensity === 'mild' && (
                          <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/40">Rival Interest</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.offer.clubsInvolved.length > 2 ? 'Multi-club trade' : 'Two-club trade'} · {item.offer.createdAt}
                        {item.offer.expiresAt ? ` · expires ${item.offer.expiresAt}` : ''}
                      </p>
                    </div>
                    <Badge variant={isPending ? 'default' : 'secondary'}>
                      {item.offer.status}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground">{item.offer.message}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">You Receive</p>
                      {incoming.length === 0 ? (
                        <p className="text-muted-foreground text-xs">No direct incoming players</p>
                      ) : (
                        incoming.map(({ player }) => {
                          const p = player!
                          const dur = getDurabilityRating(p)
                          const risk = getInjuryRiskLevel(p)
                          const { iconColor } = injuryRiskDisplay(risk)
                          return (
                            <div key={p.id} className="flex items-center gap-1.5 text-sm flex-wrap">
                              <span>{p.firstName} {p.lastName} ({p.position.primary}, {p.age}yo)</span>
                              <span className={`text-[11px] ${durabilityRatingColor(dur)}`} title="Durability Rating">
                                Dur:{dur}
                              </span>
                              {risk !== 'low' && (
                                <span className={`text-[11px] ${iconColor}`}>{risk === 'very-high' ? '⚠ High injury risk' : '⚠ Injury risk'}</span>
                              )}
                              {p.injury && (
                                <Badge variant="outline" className="text-[10px] border-red-500/30 bg-red-500/15 text-red-600 px-1">
                                  {p.injury.type} ({p.injury.weeksRemaining}w)
                                </Badge>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">You Send</p>
                      {outgoing.length === 0 ? (
                        <p className="text-muted-foreground text-xs">No direct outgoing players</p>
                      ) : (
                        outgoing.map(({ player }) => {
                          const p = player!
                          const dur = getDurabilityRating(p)
                          return (
                            <div key={p.id} className="flex items-center gap-1.5 text-sm flex-wrap">
                              <span>{p.firstName} {p.lastName} ({p.position.primary}, {p.age}yo)</span>
                              <span className={`text-[11px] ${durabilityRatingColor(dur)}`} title="Durability Rating">
                                Dur:{dur}
                              </span>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {isPending && (
                    <>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleRespond(item.id, 'reject')}>
                          Reject
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRespond(item.id, 'counter')}
                          disabled={item.offer.clubsInvolved.length > 2}
                        >
                          Counter
                        </Button>
                        <Button size="sm" onClick={() => handleRespond(item.id, 'accept')}>
                          {tradeBoardPreview?.offerId === item.id ? 'Proceed to Board' : 'Accept'}
                        </Button>
                      </div>
                      {tradeBoardPreview?.offerId === item.id && (
                        <div className="mt-2 space-y-2">
                          <BoardApprovalPanel result={tradeBoardPreview.result} compact />
                          <Button size="sm" variant="ghost" onClick={() => setTradeBoardPreview(null)}>
                            Cancel
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trade Block Tab
// ---------------------------------------------------------------------------

function TradeBlockTab() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const currentYear = useGameStore((s) => s.currentYear)
  const tradeBlock = useGameStore((s) => s.tradeBlock)
  const setPlayerTradeAvailability = useGameStore((s) => s.setPlayerTradeAvailability)
  const clearPlayerTradeAvailability = useGameStore((s) => s.clearPlayerTradeAvailability)

  const myPlayers = useMemo(
    () => Object.values(players)
      .filter((p) => p.clubId === playerClubId)
      .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [players, playerClubId],
  )

  const listingByPlayer = tradeBlock.listings
  const recentEnquiries = useMemo(
    () => tradeBlock.enquiries
      .filter((e) => e.toClubId === playerClubId)
      .slice()
      .reverse()
      .slice(0, 12),
    [tradeBlock.enquiries, playerClubId],
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Player Availability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {myPlayers.map((p) => {
            const listing = listingByPlayer[p.id]
            const baseValue = getPackageTradeValue([p.id], [], players, currentYear)
            const demandScore = listing?.demandScore ?? 0
            const adjustedValue = getDemandAdjustedValue(baseValue, demandScore)
            const enquiries = listing?.enquiryCount ?? 0
            return (
              <div key={p.id} className="rounded-md border p-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-medium">
                      #{p.jerseyNumber} {p.firstName} {p.lastName} ({p.position.primary})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Base {formatPoints(baseValue)} · Market {formatPoints(adjustedValue)} · Demand {demandScore.toFixed(2)} · Enquiries {enquiries}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Button
                      size="sm"
                      variant={listing?.availability === 'available' ? 'default' : 'outline'}
                      onClick={() => setPlayerTradeAvailability(p.id, 'available')}
                    >
                      Available
                    </Button>
                    <Button
                      size="sm"
                      variant={listing?.availability === 'reluctant' ? 'default' : 'outline'}
                      onClick={() => setPlayerTradeAvailability(p.id, 'reluctant')}
                    >
                      Reluctant
                    </Button>
                    <Button
                      size="sm"
                      variant={listing?.availability === 'salary-dump' ? 'default' : 'outline'}
                      onClick={() => setPlayerTradeAvailability(p.id, 'salary-dump')}
                    >
                      Salary Dump
                    </Button>
                    {listing && (
                      <Button size="sm" variant="ghost" onClick={() => clearPlayerTradeAvailability(p.id)}>
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Club Enquiries
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentEnquiries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No club enquiries yet. List players to attract interest.</p>
          ) : (
            recentEnquiries.map((e) => (
              <div key={e.id} className="rounded-md border p-2 text-sm">
                <p className="font-medium">
                  {clubs[e.fromClubId]?.abbreviation ?? e.fromClubId} enquired about {players[e.playerId]?.firstName} {players[e.playerId]?.lastName}
                </p>
                <p className="text-xs text-muted-foreground">{e.date} · {e.interest} interest</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trade History Tab
// ---------------------------------------------------------------------------

function tradeGradeColor(grade: TradeGradeLetter): string {
  if (grade.startsWith('A')) return 'bg-green-600 text-white'
  if (grade.startsWith('B')) return 'bg-yellow-500 text-black'
  if (grade === 'C') return 'bg-yellow-600 text-white'
  return 'bg-red-500 text-white'
}

function TradeHistoryTab() {
  const tradeHistoryStore = useGameStore((s) => s.tradeHistory)
  const newsLog = useGameStore((s) => s.newsLog)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)

  // Use tradeHistory from store if available, fall back to news
  const gradedTrades = useMemo(() => {
    if (tradeHistoryStore.length > 0) {
      return [...tradeHistoryStore].reverse().map((trade) => ({
        trade,
        grade: gradeTradeRetrospective(trade, players, clubs),
      }))
    }
    return []
  }, [tradeHistoryStore, players, clubs])

  const tradeNews = useMemo(
    () =>
      newsLog
        .filter((n) => n.category === 'trade')
        .slice()
        .reverse(),
    [newsLog],
  )

  if (gradedTrades.length === 0 && tradeNews.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ArrowLeftRight className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">
            No trades have been completed yet.
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Head to the &quot;Make a Trade&quot; tab to propose a deal.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Graded trades from tradeHistory */}
      {gradedTrades.map(({ trade, grade }) => {
        const clubA = clubs[trade.clubA]
        const clubB = clubs[trade.clubB]
        const playersToA = trade.playersToA.map((pid) => players[pid]).filter(Boolean)
        const playersToB = trade.playersToB.map((pid) => players[pid]).filter(Boolean)

        return (
          <Card key={trade.id}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ArrowLeftRight className="h-4 w-4 text-primary shrink-0" />
                    <p className="font-semibold text-sm">
                      {clubA?.abbreviation ?? trade.clubA} &harr; {clubB?.abbreviation ?? trade.clubB}
                    </p>
                    <Badge className={tradeGradeColor(grade.clubAGrade)}>
                      {clubA?.abbreviation}: {grade.clubAGrade}
                    </Badge>
                    <Badge className={tradeGradeColor(grade.clubBGrade)}>
                      {clubB?.abbreviation}: {grade.clubBGrade}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">{clubA?.abbreviation} receives:</p>
                      {playersToA.map((p) => (
                        <p key={p.id}>{p.firstName} {p.lastName}</p>
                      ))}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{clubB?.abbreviation} receives:</p>
                      {playersToB.map((p) => (
                        <p key={p.id}>{p.firstName} {p.lastName}</p>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground italic">{grade.assessment}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {trade.date}
                </span>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* Fallback: trade news if no structured trade history */}
      {gradedTrades.length === 0 && tradeNews.map((news) => {
        const involvedClubs = news.clubIds
          .map((cId) => clubs[cId])
          .filter(Boolean)
        const involvedPlayers = news.playerIds
          .map((pId) => players[pId])
          .filter(Boolean)

        return (
          <Card key={news.id}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ArrowLeftRight className="h-4 w-4 text-primary shrink-0" />
                    <p className="font-semibold text-sm">{news.headline}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{news.body}</p>
                  {news.media?.reporterName && news.media?.outletName && (
                    <p className="text-xs text-muted-foreground/80">
                      Reported by {news.media.reporterName} ({news.media.outletName})
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {involvedClubs.map((club) => (
                      <Badge
                        key={club.id}
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: club.colors.primary,
                          color: club.colors.primary,
                        }}
                      >
                        {club.abbreviation}
                      </Badge>
                    ))}
                    {involvedPlayers.map((player) => (
                      <Badge
                        key={player.id}
                        variant="secondary"
                        className="text-xs"
                      >
                        {player.firstName[0]}. {player.lastName}
                      </Badge>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {news.date}
                </span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rumours Tab
// ---------------------------------------------------------------------------

function generateRumours(
  players: Record<string, Player>,
  clubs: Record<string, import('@/types/club').Club>,
  playerClubId: string,
  currentDate: string,
  tradeBlock: import('@/types/trade').TradeBlockState,
): Array<{ id: string; headline: string; body: string; playerId: string; clubId: string; confidence: 'low' | 'medium' | 'high' }> {
  const allPlayers = Object.values(players).filter((p) => p.clubId !== '' && p.clubId !== playerClubId && p.clubId !== 'retired')
  const allClubs = Object.values(clubs)

  const hash = (input: string): number => {
    let h = 2166136261
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }
  const seeded = (seed: string) => (hash(seed) % 10000) / 10000

  const getPositionalNeeds = (clubId: string): Set<string> => {
    const counts = new Map<string, number>()
    for (const p of Object.values(players)) {
      if (p.clubId !== clubId) continue
      counts.set(p.position.primary, (counts.get(p.position.primary) ?? 0) + 1)
    }
    const needs = new Set<string>()
    for (const pos of ['BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF']) {
      if ((counts.get(pos) ?? 0) < 3) needs.add(pos)
    }
    return needs
  }

  type Candidate = {
    player: Player
    sourceClubId: string
    destClubId: string
    score: number
    confidence: 'low' | 'medium' | 'high'
    reason: string
  }

  const candidates: Candidate[] = []

  for (const player of allPlayers) {
    const sourceClub = clubs[player.clubId]
    if (!sourceClub) continue

    const listing = tradeBlock.listings[player.id]
    const enquiries = tradeBlock.enquiries.filter((e) => e.playerId === player.id)
    const enquiryByClub = new Map<string, number>()
    for (const e of enquiries) {
      enquiryByClub.set(e.fromClubId, (enquiryByClub.get(e.fromClubId) ?? 0) + (e.interest === 'high' ? 3 : e.interest === 'medium' ? 2 : 1))
    }

    const destinationOptions = allClubs
      .filter((c) => c.id !== player.clubId)
      .map((c) => {
        const needs = getPositionalNeeds(c.id)
        const fitNeed = needs.has(player.position.primary) ? 18 : 0
        const enquiryWeight = (enquiryByClub.get(c.id) ?? 0) * 7
        const requestMatch = player.tradeRequest?.active && player.tradeRequest.nominatedClubIds.includes(c.id) ? 24 : 0
        const capNeed = c.finances.currentSpend > 0 && player.contract.aav > 700_000 ? 4 : 0
        const seedNoise = seeded(`${currentDate}-${player.id}-${c.id}`)
        const weight = fitNeed + enquiryWeight + requestMatch + capNeed + seedNoise * 6
        return { clubId: c.id, weight, fitNeed, enquiryWeight, requestMatch }
      })
      .sort((a, b) => b.weight - a.weight)

    if (destinationOptions.length === 0) continue
    const topDest = destinationOptions[0]

    let score = 0
    const reasons: string[] = []
    if (player.tradeRequest?.active) {
      score += 38
      reasons.push('active trade request')
    }
    if (listing?.active) {
      score += listing.availability === 'salary-dump' ? 30 : listing.availability === 'reluctant' ? 14 : 24
      score += (listing.demandScore ?? 0) * 8
      reasons.push('on the trade block')
    }
    if (player.contract.yearsRemaining <= 1) {
      score += 18
      reasons.push('expiring contract')
    }
    if (player.morale < 45) {
      score += 16
      reasons.push('low morale')
    }
    if (topDest.fitNeed > 0) {
      score += topDest.fitNeed
      reasons.push('destination list need')
    }
    if (topDest.enquiryWeight > 0) {
      score += topDest.enquiryWeight
      reasons.push('documented enquiry interest')
    }
    if (topDest.requestMatch > 0) {
      reasons.push('nominated destination')
    }

    const volatility = seeded(`${currentDate}-vol-${player.id}`)
    score += Math.round((volatility - 0.5) * 8)

    if (score < 34) continue

    const confidence: 'low' | 'medium' | 'high' =
      score >= 74 ? 'high' : score >= 50 ? 'medium' : 'low'

    candidates.push({
      player,
      sourceClubId: player.clubId,
      destClubId: topDest.clubId,
      score,
      confidence,
      reason: reasons.slice(0, 3).join(', '),
    })
  }

  const picked = candidates
    .sort((a, b) => b.score - a.score)
    .filter((c, idx) => {
      const chance = c.confidence === 'high' ? 0.92 : c.confidence === 'medium' ? 0.78 : 0.58
      const roll = seeded(`${currentDate}-rumour-${c.player.id}-${idx}`)
      return roll <= chance
    })
    .slice(0, 6)

  return picked.map((entry, idx) => {
    const player = entry.player
    const sourceClub = clubs[entry.sourceClubId]
    const destClub = clubs[entry.destClubId]
    const playerName = `${player.firstName} ${player.lastName}`

    const headline =
      entry.confidence === 'high'
        ? `${destClub?.abbreviation ?? 'Rival club'} pushing hard for ${playerName}`
        : entry.confidence === 'medium'
          ? `${playerName} linked to ${destClub?.abbreviation ?? 'a move'}`
          : `${playerName} quietly monitored by ${destClub?.abbreviation ?? 'rivals'}`

    const body = entry.confidence === 'high'
      ? `${sourceClub?.abbreviation ?? 'His club'} and ${destClub?.abbreviation ?? 'the destination club'} are believed to be discussing frameworks around ${playerName}. Drivers: ${entry.reason}. The rumour is strong, but a deal is not guaranteed.`
      : entry.confidence === 'medium'
        ? `League chatter links ${playerName} to ${destClub?.abbreviation ?? 'another club'} due to ${entry.reason}. It is a plausible fit, though talks may not advance.`
        : `${destClub?.abbreviation ?? 'A rival club'} has done background work on ${playerName}. The fit relates to ${entry.reason}, but this currently projects as speculative noise more than an active deal.`

    return {
      id: `${currentDate}-${player.id}-${idx}`,
      headline,
      body,
      playerId: player.id,
      clubId: entry.destClubId,
      confidence: entry.confidence,
    }
  })
}

function RumoursTab() {
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentDate = useGameStore((s) => s.currentDate)
  const tradeBlock = useGameStore((s) => s.tradeBlock)

  const rumours = useMemo(() =>
    generateRumours(players, clubs, playerClubId, currentDate, tradeBlock),
    [players, clubs, playerClubId, currentDate, tradeBlock],
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Rumours update automatically as market conditions change. High-confidence rumours are grounded in real demand and needs, but not every rumour becomes a completed trade.
      </p>

      {rumours.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Newspaper className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">
              No trade rumours at this time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rumours.map((rumour) => {
            const player = players[rumour.playerId]
            const destClub = rumour.clubId ? clubs[rumour.clubId] : null
            const sourceClub = player ? clubs[player.clubId] : null

            return (
              <Card key={rumour.id}>
                <CardContent className="py-4">
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Newspaper className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                      <div className="min-w-0 space-y-1">
                        <p className="font-semibold text-sm">
                          {rumour.headline}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {rumour.body}
                        </p>
                        <Badge
                          variant={rumour.confidence === 'high' ? 'default' : rumour.confidence === 'medium' ? 'secondary' : 'outline'}
                          className="text-[10px]"
                        >
                          {rumour.confidence} confidence
                        </Badge>
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          {player && (
                            <Badge variant="secondary" className="text-xs">
                              {player.firstName} {player.lastName} (
                              {player.position.primary}, {player.age}yo)
                            </Badge>
                          )}
                          {sourceClub && (
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{
                                borderColor: sourceClub.colors.primary,
                                color: sourceClub.colors.primary,
                              }}
                            >
                              {sourceClub.abbreviation}
                            </Badge>
                          )}
                          {destClub && (
                            <>
                              <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                              <Badge
                                variant="outline"
                                className="text-xs"
                                style={{
                                  borderColor: destClub.colors.primary,
                                  color: destClub.colors.primary,
                                }}
                              >
                                {destClub.abbreviation}
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function TradePage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const phase = useGameStore((s) => s.phase)
  const offseasonState = useGameStore((s) => s.offseasonState)

  const club = clubs[playerClubId]

  const tradePeriodOpen =
    phase === 'post-season' || phase === 'offseason' || phase === 'preseason'

  const tradeCloseCountdown = useMemo(() => {
    if (!tradePeriodOpen || !offseasonState?.calendarState) return null
    const closeMilestone = offseasonState.calendarState.milestones.find(
      (m) => m.label === 'Trade Period Closes',
    )
    if (!closeMilestone) return null
    const days = diffDays(offseasonState.calendarState.currentDate, closeMilestone.date)
    if (days < 0) return null
    return { days, urgency: days <= 2 ? 'urgent' : days <= 7 ? 'warning' : 'normal' as const }
  }, [tradePeriodOpen, offseasonState])

  const phaseLabel = (() => {
    switch (phase) {
      case 'setup':
        return 'Setup'
      case 'preseason':
        return 'Pre-Season'
      case 'regular-season':
        return 'Regular Season'
      case 'finals':
        return 'Finals'
      case 'post-season':
        return 'Post-Season'
      case 'offseason':
        return 'Off-Season'
      default:
        return phase
    }
  })()

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trade Centre</h1>
          <p className="text-sm text-muted-foreground">
            {club?.fullName} &middot; {phaseLabel} &middot; Respond to offers, propose deals, and manage the trade block
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={tradePeriodOpen ? 'default' : 'secondary'}
            className={
              tradePeriodOpen
                ? 'bg-green-600 hover:bg-green-600 text-white'
                : ''
            }
          >
            {tradePeriodOpen ? 'Trade Period Open' : 'Trade Period Closed'}
          </Badge>
          {tradeCloseCountdown && (
            <Badge
              variant="outline"
              className={`flex items-center gap-1 ${
                tradeCloseCountdown.urgency === 'urgent'
                  ? 'border-red-500/50 text-red-500'
                  : tradeCloseCountdown.urgency === 'warning'
                  ? 'border-amber-500/50 text-amber-500'
                  : 'text-muted-foreground'
              }`}
            >
              <Clock className="h-3 w-3" />
              {tradeCloseCountdown.days === 0
                ? 'Closes today'
                : tradeCloseCountdown.days === 1
                ? 'Closes tomorrow'
                : `Closes in ${tradeCloseCountdown.days}d`}
            </Badge>
          )}
        </div>
      </div>

      {!tradePeriodOpen && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              The trade period is currently closed. Trades can only be made
              during the post-season, off-season, and pre-season. You can still
              browse trade history and rumours below.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="make-trade">
        <TabsList>
          <TabsTrigger value="inbox">Trade Inbox</TabsTrigger>
          <TabsTrigger value="trade-block">Trade Block</TabsTrigger>
          <TabsTrigger value="make-trade">Make a Trade</TabsTrigger>
          <TabsTrigger value="negotiate">Negotiate</TabsTrigger>
          <TabsTrigger value="shortlists">Shortlists</TabsTrigger>
          <TabsTrigger value="history">Trade History</TabsTrigger>
          <TabsTrigger value="rumours">Rumours</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox">
          <p className="text-sm text-muted-foreground pt-3 pb-2">Incoming and outgoing trade offers — accept, counter, or decline. Offers can arrive outside the trade period too.</p>
          {tradePeriodOpen ? (
            <TradeInboxTab />
          ) : (
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">
                  Trade inbox remains available year-round, but new offers are mostly generated during the trade period.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="trade-block">
          <p className="text-sm text-muted-foreground pt-3 pb-2">Players you've made available for trade, and players from other clubs listed on their trade block.</p>
          <TradeBlockTab />
        </TabsContent>

        <TabsContent value="make-trade">
          <p className="text-sm text-muted-foreground pt-3 pb-2">Build a trade proposal — exchange players, draft picks, or a combination — and send it to another club.</p>
          {tradePeriodOpen ? (
            <MakeTradeTab />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <ArrowLeftRight className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">
                  Trading is not available during the {phaseLabel.toLowerCase()}.
                </p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  The trade period opens during the post-season.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="negotiate">
          <p className="text-sm text-muted-foreground pt-3 pb-2">Active trade negotiations — track AI responses, counter offers, and leverage intel.</p>
          <NegotiateTab />
        </TabsContent>

        <TabsContent value="shortlists">
          <p className="text-sm text-muted-foreground pt-3 pb-2">Your saved lists of players you're targeting via trade. Organise targets into named lists to track interest.</p>
          <ShortlistManager targetTypeFilter="player" title="Trade Targets Shortlists" />
        </TabsContent>

        <TabsContent value="history">
          <p className="text-sm text-muted-foreground pt-3 pb-2">Completed trades and their exchange grades — see what your club gave and received in every deal.</p>
          <TradeHistoryTab />
        </TabsContent>

        <TabsContent value="rumours">
          <p className="text-sm text-muted-foreground pt-3 pb-2">League-wide trade gossip and player movement reports. Rumours aren't always accurate but signal where clubs are looking.</p>
          <RumoursTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
