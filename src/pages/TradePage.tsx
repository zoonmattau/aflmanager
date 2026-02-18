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
} from 'lucide-react'
import { gradeTradeRetrospective } from '@/engine/history/summaryEngine'
import type { TradeGradeLetter } from '@/engine/history/summaryEngine'
import { getPackageTradeValue } from '@/engine/trades/tradeValuation'
import type { TradeInboxItem } from '@/types/trade'
import { getDemandAdjustedValue } from '@/engine/trades/tradeNegotiationEngine'
import { useTableViewManager, type TableViewColumnConfig } from '@/components/table-view/useTableViewManager'
import { TableViewManagerControl } from '@/components/table-view/TableViewManagerControl'
import { ShortlistAssignMenu, ShortlistManager } from '@/components/shortlists/ShortlistManager'

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
                        {player.firstName} {player.lastName}
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
  const proposeTradeOffer = useGameStore((s) => s.proposeTradeOffer)

  const [partnerId, setPartnerId] = useState<string>('')
  const [capError, setCapError] = useState<string | null>(null)
  const [sendIds, setSendIds] = useState<Set<string>>(new Set())
  const [receiveIds, setReceiveIds] = useState<Set<string>>(new Set())
  const [sendSearch, setSendSearch] = useState('')
  const [receiveSearch, setReceiveSearch] = useState('')
  const [tradeResult, setTradeResult] = useState<
    'accepted' | 'rejected' | null
  >(null)
  const [rejectionMessage, setRejectionMessage] = useState('')
  const [showCompletedDialog, setShowCompletedDialog] = useState(false)
  const [completedTradeSent, setCompletedTradeSent] = useState<Player[]>([])
  const [completedTradeReceived, setCompletedTradeReceived] = useState<
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

    const sentSnapshot = sendPlayers.map((p) => ({ ...p }))
    const receivedSnapshot = receivePlayers.map((p) => ({ ...p }))
    const result = proposeTradeOffer(
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

    if (result.accepted) {
      setTradeResult('accepted')
      setCompletedTradeSent(sentSnapshot)
      setCompletedTradeReceived(receivedSnapshot)
      setShowCompletedDialog(true)
      setSendIds(new Set())
      setReceiveIds(new Set())
      return
    }

    setTradeResult('rejected')
    setRejectionMessage('Counteroffer received. Check the Trade Inbox tab to continue negotiations.')
  }, [
    sendPlayers,
    receivePlayers,
    partnerClub,
    partnerId,
    proposeTradeOffer,
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
    tradeResult !== 'accepted'

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

            {tradeResult === 'accepted' && (
              <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-600 dark:text-green-400">
                    Trade Accepted
                  </p>
                  <p className="text-sm text-muted-foreground">
                    The trade has been completed successfully. Check the Trade
                    History tab for details.
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
// Trade Inbox Tab
// ---------------------------------------------------------------------------

function formatOfferTitle(item: TradeInboxItem, clubs: Record<string, import('@/types/club').Club>): string {
  return item.offer.clubsInvolved
    .map((cid) => clubs[cid]?.abbreviation ?? cid)
    .join(' / ')
}

function TradeInboxTab() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const tradeInbox = useGameStore((s) => s.tradeInbox)
  const respondToTradeOffer = useGameStore((s) => s.respondToTradeOffer)
  const markTradeOfferRead = useGameStore((s) => s.markTradeOfferRead)
  const generateTradeInboxOffersAction = useGameStore((s) => s.generateTradeInboxOffersAction)
  const [error, setError] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...tradeInbox].sort((a, b) => b.offer.createdAt.localeCompare(a.offer.createdAt)),
    [tradeInbox],
  )

  const pending = sorted.filter((item) => item.offer.status === 'pending-user')

  const handleRespond = (offerId: string, decision: 'accept' | 'reject' | 'counter') => {
    const result = respondToTradeOffer(offerId, decision)
    if (!result.success) {
      setError(result.error ?? 'Unable to process response')
    } else {
      setError(null)
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

            return (
              <Card
                key={item.id}
                className={!item.read ? 'border-blue-500/60' : ''}
                onClick={() => markTradeOfferRead(item.id)}
              >
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">{formatOfferTitle(item, clubs)}</p>
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
                        incoming.map(({ player }) => (
                          <p key={player!.id}>
                            {player!.firstName} {player!.lastName} ({player!.position.primary})
                          </p>
                        ))
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">You Send</p>
                      {outgoing.length === 0 ? (
                        <p className="text-muted-foreground text-xs">No direct outgoing players</p>
                      ) : (
                        outgoing.map(({ player }) => (
                          <p key={player!.id}>
                            {player!.firstName} {player!.lastName} ({player!.position.primary})
                          </p>
                        ))
                      )}
                    </div>
                  </div>

                  {isPending && (
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
                        Accept
                      </Button>
                    </div>
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

  const club = clubs[playerClubId]

  const tradePeriodOpen =
    phase === 'post-season' || phase === 'offseason' || phase === 'preseason'

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
            {club?.fullName} &middot; {phaseLabel}
          </p>
        </div>
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
          <TabsTrigger value="shortlists">Shortlists</TabsTrigger>
          <TabsTrigger value="history">Trade History</TabsTrigger>
          <TabsTrigger value="rumours">Rumours</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox">
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
          <TradeBlockTab />
        </TabsContent>

        <TabsContent value="make-trade">
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

        <TabsContent value="shortlists">
          <ShortlistManager targetTypeFilter="player" title="Trade Targets Shortlists" />
        </TabsContent>

        <TabsContent value="history">
          <TradeHistoryTab />
        </TabsContent>

        <TabsContent value="rumours">
          <RumoursTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
