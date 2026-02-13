import { useMemo, useState, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { Player } from '@/types/player'
import type { PlayerAttributes } from '@/types/player'
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
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(value: number): string {
  return '$' + value.toLocaleString('en-AU', { maximumFractionDigits: 0 })
}

function getAgeFactor(age: number): number {
  if (age < 25) return 1.1
  if (age <= 30) return 1.0
  if (age <= 33) return 0.85
  return 0.7
}

function getAttributeAverage(attributes: PlayerAttributes): number {
  const values = Object.values(attributes) as number[]
  if (values.length === 0) return 50
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function calculatePlayerValue(player: Player): number {
  const avg = getAttributeAverage(player.attributes)
  const ageFactor = getAgeFactor(player.age)
  return Math.round(avg * ageFactor * 12_000)
}

function calculatePackageValue(players: Player[]): number {
  return players.reduce((sum, p) => sum + calculatePlayerValue(p), 0)
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

function calculateAcceptanceChance(
  yourValue: number,
  theirValue: number,
): number {
  if (theirValue === 0) return 0
  const ratio = yourValue / theirValue
  if (ratio >= 0.9) return 0.7 + Math.min((ratio - 0.9) * 2, 0.25)
  if (ratio >= 0.8) return 0.3 + ((ratio - 0.8) / 0.1) * 0.2
  return 0.1 + Math.max(0, ratio - 0.5) * 0.33
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
}: {
  players: Player[]
  selectedIds: Set<string>
  onToggle: (playerId: string) => void
  searchValue: string
  onSearchChange: (value: string) => void
  clubName: string
  emptyMessage: string
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

  return (
    <div className="space-y-2">
      <Input
        placeholder={`Search ${clubName} players...`}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-8 text-sm"
      />
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
                  <TableHead className="px-2 py-1 text-xs w-8"></TableHead>
                  <TableHead className="px-2 py-1 text-xs">Player</TableHead>
                  <TableHead className="px-2 py-1 text-xs">Pos</TableHead>
                  <TableHead className="px-2 py-1 text-xs text-center">
                    Age
                  </TableHead>
                  <TableHead className="px-2 py-1 text-xs text-right">
                    AAV
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((player) => {
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
                      <TableCell className="px-2 py-1.5">
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
                      </TableCell>
                      <TableCell className="px-2 py-1.5 font-medium whitespace-nowrap">
                        {player.firstName} {player.lastName}
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <Badge variant="outline" className="text-xs">
                          {player.position.primary}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-center">
                        {player.age}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right font-mono text-xs">
                        {formatDollars(player.contract.aav)}
                      </TableCell>
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
            <span className="font-semibold">{formatDollars(yourValue)}</span>
          </div>
          <div className={`flex items-center gap-1 font-medium ${balanceColor}`}>
            <BalanceIcon className="h-4 w-4" />
            {balanceLabel}
          </div>
          <div className="text-right">
            <span className="text-muted-foreground">Their package: </span>
            <span className="font-semibold">{formatDollars(theirValue)}</span>
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
  const currentDate = useGameStore((s) => s.currentDate)
  const updatePlayer = useGameStore((s) => s.updatePlayer)
  const addNewsItem = useGameStore((s) => s.addNewsItem)

  const [partnerId, setPartnerId] = useState<string>('')
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

  const yourValue = useMemo(
    () => calculatePackageValue(sendPlayers),
    [sendPlayers],
  )
  const theirValue = useMemo(
    () => calculatePackageValue(receivePlayers),
    [receivePlayers],
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

    const acceptance = calculateAcceptanceChance(yourValue, theirValue)
    const roll = Math.random()

    const myAbbr = myClub?.abbreviation ?? 'You'
    const theirAbbr = partnerClub.abbreviation

    if (roll < acceptance) {
      // Trade accepted -- snapshot players before mutating
      const sentSnapshot = sendPlayers.map((p) => ({ ...p }))
      const receivedSnapshot = receivePlayers.map((p) => ({ ...p }))

      // Swap club IDs
      for (const p of sendPlayers) {
        updatePlayer(p.id, { clubId: partnerId })
      }
      for (const p of receivePlayers) {
        updatePlayer(p.id, { clubId: playerClubId })
      }

      // Build news
      const sentNames = sendPlayers
        .map((p) => `${p.firstName} ${p.lastName}`)
        .join(', ')
      const receivedNames = receivePlayers
        .map((p) => `${p.firstName} ${p.lastName}`)
        .join(', ')

      addNewsItem({
        id: crypto.randomUUID(),
        date: currentDate,
        headline: `Trade: ${myAbbr} and ${theirAbbr} complete deal`,
        body: `${myAbbr} sends ${sentNames} to ${theirAbbr} in exchange for ${receivedNames}.`,
        category: 'trade',
        clubIds: [playerClubId, partnerId],
        playerIds: [
          ...sendPlayers.map((p) => p.id),
          ...receivePlayers.map((p) => p.id),
        ],
      })

      setTradeResult('accepted')
      setCompletedTradeSent(sentSnapshot)
      setCompletedTradeReceived(receivedSnapshot)
      setShowCompletedDialog(true)

      // Reset selections
      setSendIds(new Set())
      setReceiveIds(new Set())
    } else {
      // Trade rejected
      const deficit = theirValue - yourValue
      const pctShort =
        theirValue > 0
          ? Math.round(((theirValue - yourValue) / theirValue) * 100)
          : 0

      let message = `${theirAbbr} have rejected the trade.`
      if (deficit > 0) {
        message += ` They felt the package was approximately ${formatDollars(deficit)} (${pctShort}%) short in value. Consider adding more to your offer.`
      } else {
        message += ` Despite a fair value, they decided to hold onto their players at this time.`
      }

      setTradeResult('rejected')
      setRejectionMessage(message)
    }
  }, [
    sendPlayers,
    receivePlayers,
    partnerClub,
    yourValue,
    theirValue,
    myClub,
    partnerId,
    playerClubId,
    currentDate,
    updatePlayer,
    addNewsItem,
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
// Trade History Tab
// ---------------------------------------------------------------------------

function TradeHistoryTab() {
  const newsLog = useGameStore((s) => s.newsLog)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)

  const tradeNews = useMemo(
    () =>
      newsLog
        .filter((n) => n.category === 'trade')
        .slice()
        .reverse(),
    [newsLog],
  )

  if (tradeNews.length === 0) {
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
      {tradeNews.map((news) => {
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
): Array<{ id: string; headline: string; body: string; playerId: string; clubId: string }> {
  const allPlayers = Object.values(players).filter(
    (p) => p.clubId !== '' && p.clubId !== playerClubId,
  )
  const allClubs = Object.values(clubs)

  // Find candidates: low morale or expiring contracts
  const candidates = allPlayers.filter(
    (p) =>
      p.morale < 50 ||
      p.contract.yearsRemaining <= 1 ||
      (p.form < 40 && p.age < 28),
  )

  // If not enough candidates, add some random ones
  const pool =
    candidates.length >= 5
      ? candidates
      : [...candidates, ...allPlayers.slice(0, 10)]

  // Shuffle and pick 3-5
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const count = 3 + Math.floor(Math.random() * 3) // 3-5
  const selected = shuffled.slice(0, count)

  const templates = [
    (pName: string, fromClub: string, toClub: string) => ({
      headline: `${pName} linked with move to ${toClub}`,
      body: `Sources close to ${fromClub} suggest ${pName} is exploring a potential move to ${toClub}. The player is reportedly unsettled and seeking a fresh start.`,
    }),
    (pName: string, fromClub: string, toClub: string) => ({
      headline: `${toClub} circling ${pName}`,
      body: `${toClub} have expressed interest in ${fromClub}'s ${pName}, with initial discussions believed to have taken place between the clubs.`,
    }),
    (pName: string, fromClub: string, toClub: string) => ({
      headline: `${pName} on the radar of multiple clubs`,
      body: `${fromClub}'s ${pName} has attracted attention from ${toClub} and at least one other club. A deal could be done before the trade deadline.`,
    }),
    (pName: string, fromClub: string, toClub: string) => ({
      headline: `Trade whispers: ${pName} to ${toClub}?`,
      body: `Rumours are swirling that ${pName} could be headed to ${toClub} after a difficult stretch at ${fromClub}. The player's contract situation makes a move feasible.`,
    }),
    (pName: string, fromClub: string, toClub: string) => ({
      headline: `${fromClub} could part ways with ${pName}`,
      body: `${fromClub} are believed to be open to offers for ${pName}, with ${toClub} identified as a potential landing spot. The player has ${Math.floor(Math.random() * 2) + 1} year(s) remaining on their deal.`,
    }),
  ]

  return selected.map((player) => {
    const fromClub = clubs[player.clubId]
    // Pick a random destination club that isn't the player's current club
    const destOptions = allClubs.filter(
      (c) => c.id !== player.clubId,
    )
    const destClub =
      destOptions[Math.floor(Math.random() * destOptions.length)]

    const template = templates[Math.floor(Math.random() * templates.length)]
    const playerName = `${player.firstName} ${player.lastName}`
    const { headline, body } = template(
      playerName,
      fromClub?.abbreviation ?? 'Unknown',
      destClub?.abbreviation ?? 'Unknown',
    )

    return {
      id: crypto.randomUUID(),
      headline,
      body,
      playerId: player.id,
      clubId: destClub?.id ?? '',
    }
  })
}

function RumoursTab() {
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const playerClubId = useGameStore((s) => s.playerClubId)

  const [rumours, setRumours] = useState(() =>
    generateRumours(players, clubs, playerClubId),
  )

  const handleRefresh = useCallback(() => {
    setRumours(generateRumours(players, clubs, playerClubId))
  }, [players, clubs, playerClubId])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          The latest trade whispers from around the league. Take these with a
          grain of salt.
        </p>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh Rumours
        </Button>
      </div>

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
          <TabsTrigger value="make-trade">Make a Trade</TabsTrigger>
          <TabsTrigger value="history">Trade History</TabsTrigger>
          <TabsTrigger value="rumours">Rumours</TabsTrigger>
        </TabsList>

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
