import { useMemo, useState, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { Player } from '@/types/player'
import type { PlayerAttributes } from '@/types/player'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FileText,
  UserMinus,
  ArrowUpCircle,
  DollarSign,
  Calendar,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(value: number): string {
  return '$' + value.toLocaleString('en-AU', { maximumFractionDigits: 0 })
}

function parseDollarInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9]/g, '')
  return cleaned === '' ? 0 : Number(cleaned)
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

function calculateMarketValue(player: Player): number {
  const avg = getAttributeAverage(player.attributes)
  const ageFactor = getAgeFactor(player.age)
  return Math.round(avg * ageFactor * 12_000)
}

function generateYearByYear(aav: number, years: number): number[] {
  const result: number[] = []
  for (let i = 0; i < years; i++) {
    result.push(Math.round(aav * Math.pow(1.03, i)))
  }
  return result
}

function calculateAcceptanceProbability(
  offerAAV: number,
  marketValue: number,
  ambition: number,
  _loyalty: number,
): number {
  const adjustedMarket = marketValue * (1 + (ambition - 50) / 200)
  const ratio = offerAAV / adjustedMarket

  let base: number
  if (ratio >= 0.95) {
    base = 0.8 + (ratio - 0.95) * 2 // 80-90%+
  } else if (ratio >= 0.8) {
    base = 0.4 + ((ratio - 0.8) / 0.15) * 0.2 // 40-60%
  } else {
    base = 0.1 + (ratio / 0.8) * 0.1 // 10-20%
  }

  // Loyalty bonus (player is at club)
  base += 0.15

  return Math.min(Math.max(base, 0), 1)
}

// ---------------------------------------------------------------------------
// Sub-components: Contract Offer Dialog
// ---------------------------------------------------------------------------

function ContractOfferDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const currentDate = useGameStore((s) => s.currentDate)
  const updatePlayer = useGameStore((s) => s.updatePlayer)
  const addNewsItem = useGameStore((s) => s.addNewsItem)

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
  const [years, setYears] = useState(3)
  const [aavInput, setAavInput] = useState('')
  const [result, setResult] = useState<'accepted' | 'rejected' | null>(null)
  const [counterDemand, setCounterDemand] = useState<{
    aav: number
    years: number
  } | null>(null)

  const clubPlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId)
        .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [players, playerClubId],
  )

  const expiringPlayers = useMemo(
    () => clubPlayers.filter((p) => p.contract.yearsRemaining <= 1),
    [clubPlayers],
  )

  const otherPlayers = useMemo(
    () => clubPlayers.filter((p) => p.contract.yearsRemaining > 1),
    [clubPlayers],
  )

  const selectedPlayer = selectedPlayerId ? players[selectedPlayerId] : null
  const marketValue = selectedPlayer ? calculateMarketValue(selectedPlayer) : 0
  const aav = parseDollarInput(aavInput)
  const yearByYear = useMemo(() => generateYearByYear(aav, years), [aav, years])

  const resetForm = useCallback(() => {
    setSelectedPlayerId('')
    setYears(3)
    setAavInput('')
    setResult(null)
    setCounterDemand(null)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm()
      onOpenChange(next)
    },
    [onOpenChange, resetForm],
  )

  const handlePlayerSelect = useCallback(
    (playerId: string) => {
      setSelectedPlayerId(playerId)
      setResult(null)
      setCounterDemand(null)
      const player = players[playerId]
      if (player) {
        setAavInput(calculateMarketValue(player).toString())
        setYears(Math.min(Math.max(player.contract.yearsRemaining, 2), 4))
      }
    },
    [players],
  )

  const handleSubmitOffer = useCallback(() => {
    if (!selectedPlayer || aav <= 0 || years < 1) return

    const probability = calculateAcceptanceProbability(
      aav,
      marketValue,
      selectedPlayer.personality.ambition,
      selectedPlayer.personality.loyalty,
    )

    const roll = Math.random()
    const accepted = roll < probability
    const clubName = clubs[playerClubId]?.abbreviation ?? 'Club'
    const playerName = `${selectedPlayer.firstName} ${selectedPlayer.lastName}`

    if (accepted) {
      setResult('accepted')
      setCounterDemand(null)

      updatePlayer(selectedPlayer.id, {
        contract: {
          yearsRemaining: years,
          aav,
          yearByYear: generateYearByYear(aav, years),
          isRestricted: false,
        },
      })

      addNewsItem({
        id: crypto.randomUUID(),
        date: currentDate,
        headline: `${playerName} re-signs with ${clubName}`,
        body: `${playerName} has signed a ${years}-year deal worth ${formatDollars(aav)} per season with ${clubName}.`,
        category: 'contract',
        clubIds: [playerClubId],
        playerIds: [selectedPlayer.id],
      })
    } else {
      setResult('rejected')
      const counterAAV = Math.round(marketValue * 1.05)
      const counterYears = Math.min(years + 1, 6)
      setCounterDemand({ aav: counterAAV, years: counterYears })

      addNewsItem({
        id: crypto.randomUUID(),
        date: currentDate,
        headline: `${playerName} rejects ${clubName} contract offer`,
        body: `${playerName} has rejected a ${years}-year offer of ${formatDollars(aav)} per season from ${clubName}. The player is believed to be seeking ${formatDollars(counterAAV)} over ${counterYears} years.`,
        category: 'contract',
        clubIds: [playerClubId],
        playerIds: [selectedPlayer.id],
      })
    }
  }, [
    selectedPlayer,
    aav,
    years,
    marketValue,
    clubs,
    playerClubId,
    currentDate,
    updatePlayer,
    addNewsItem,
  ])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Offer Contract</DialogTitle>
          <DialogDescription>
            Select a player and negotiate a new contract.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Player Selector */}
          <div className="space-y-2">
            <Label>Select Player</Label>
            <Select
              value={selectedPlayerId}
              onValueChange={handlePlayerSelect}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a player..." />
              </SelectTrigger>
              <SelectContent>
                {expiringPlayers.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Expiring</SelectLabel>
                    {expiringPlayers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} ({p.position.primary}, {p.age}yo) -{' '}
                        {p.contract.yearsRemaining === 0
                          ? 'Out of contract'
                          : `${p.contract.yearsRemaining}yr remaining`}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {otherPlayers.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Others</SelectLabel>
                    {otherPlayers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} ({p.position.primary}, {p.age}yo) -{' '}
                        {p.contract.yearsRemaining}yr remaining
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Player Details */}
          {selectedPlayer && (
            <>
              <Separator />

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Current AAV:</span>{' '}
                  <span className="font-medium">
                    {formatDollars(selectedPlayer.contract.aav)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Years Left:</span>{' '}
                  <span className="font-medium">
                    {selectedPlayer.contract.yearsRemaining}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Est. Market Value:</span>{' '}
                  <span className="font-semibold text-primary">
                    {formatDollars(marketValue)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Morale:</span>{' '}
                  <span className="font-medium">{selectedPlayer.morale}</span>
                </div>
              </div>

              <Separator />

              {/* Contract Terms */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Contract Length</Label>
                    <span className="text-sm font-semibold">
                      {years} {years === 1 ? 'year' : 'years'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={6}
                    step={1}
                    value={years}
                    onChange={(e) => setYears(Number(e.target.value))}
                    className="w-full accent-primary h-2 cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1yr</span>
                    <span>3yr</span>
                    <span>6yr</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Average Annual Value (AAV)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={aav > 0 ? aav.toLocaleString('en-AU') : ''}
                      onChange={(e) => setAavInput(e.target.value)}
                      placeholder="Enter salary..."
                      className="pl-9"
                    />
                  </div>
                  {aav > 0 && marketValue > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {((aav / marketValue) * 100).toFixed(0)}% of estimated
                      market value
                    </p>
                  )}
                </div>

                {/* Year-by-Year Preview */}
                {aav > 0 && years > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Year-by-Year (3% escalation)</Label>
                    <div className="flex gap-2 flex-wrap">
                      {yearByYear.map((salary, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          Y{i + 1}: {formatDollars(salary)}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Total:{' '}
                      {formatDollars(
                        yearByYear.reduce((sum, v) => sum + v, 0),
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Result */}
              {result === 'accepted' && (
                <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-600 dark:text-green-400">
                      Contract Accepted
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedPlayer.firstName} {selectedPlayer.lastName} has
                      agreed to a {years}-year deal at{' '}
                      {formatDollars(aav)} per season.
                    </p>
                  </div>
                </div>
              )}

              {result === 'rejected' && counterDemand && (
                <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 flex items-start gap-2">
                  <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-600 dark:text-red-400">
                      Contract Rejected
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedPlayer.firstName} {selectedPlayer.lastName} has
                      rejected your offer. They are seeking{' '}
                      {formatDollars(counterDemand.aav)} per season over{' '}
                      {counterDemand.years} years.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && selectedPlayer && (
            <Button onClick={handleSubmitOffer} disabled={aav <= 0 || years < 1}>
              Submit Offer
            </Button>
          )}
          {result === 'rejected' && (
            <Button
              onClick={() => {
                setResult(null)
                setCounterDemand(null)
              }}
            >
              Revise Offer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Delist Dialog
// ---------------------------------------------------------------------------

function DelistDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const currentDate = useGameStore((s) => s.currentDate)
  const updatePlayer = useGameStore((s) => s.updatePlayer)
  const addNewsItem = useGameStore((s) => s.addNewsItem)

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  const clubPlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId)
        .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [players, playerClubId],
  )

  const selectedPlayer = selectedPlayerId ? players[selectedPlayerId] : null
  const clubName = clubs[playerClubId]?.abbreviation ?? 'Club'

  const resetForm = useCallback(() => {
    setSelectedPlayerId('')
    setConfirming(false)
    setDone(false)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm()
      onOpenChange(next)
    },
    [onOpenChange, resetForm],
  )

  const handleConfirmDelist = useCallback(() => {
    if (!selectedPlayer) return

    const playerName = `${selectedPlayer.firstName} ${selectedPlayer.lastName}`

    updatePlayer(selectedPlayer.id, {
      clubId: '',
      contract: {
        yearsRemaining: 0,
        aav: 0,
        yearByYear: [],
        isRestricted: false,
      },
    })

    addNewsItem({
      id: crypto.randomUUID(),
      date: currentDate,
      headline: `${clubName} delists ${playerName}`,
      body: `${playerName} has been delisted by ${clubName} and is now a free agent.`,
      category: 'contract',
      clubIds: [playerClubId],
      playerIds: [selectedPlayer.id],
    })

    setDone(true)
    setConfirming(false)
  }, [selectedPlayer, clubName, playerClubId, currentDate, updatePlayer, addNewsItem])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delist Player</DialogTitle>
          <DialogDescription>
            Remove a player from your club list. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!done ? (
            <>
              <div className="space-y-2">
                <Label>Select Player</Label>
                <Select
                  value={selectedPlayerId}
                  onValueChange={(v) => {
                    setSelectedPlayerId(v)
                    setConfirming(false)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a player to delist..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clubPlayers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} ({p.position.primary}, {p.age}yo)
                        {p.isRookie ? ' [Rookie]' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPlayer && !confirming && (
                <div className="rounded-md border p-3 text-sm space-y-1">
                  <p>
                    <span className="font-medium">
                      {selectedPlayer.firstName} {selectedPlayer.lastName}
                    </span>{' '}
                    - {selectedPlayer.position.primary}, {selectedPlayer.age}yo
                  </p>
                  <p className="text-muted-foreground">
                    Contract: {selectedPlayer.contract.yearsRemaining}yr @{' '}
                    {formatDollars(selectedPlayer.contract.aav)}/yr
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="mt-2"
                    onClick={() => setConfirming(true)}
                  >
                    Delist This Player
                  </Button>
                </div>
              )}

              {selectedPlayer && confirming && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-3">
                  <p className="text-sm font-medium">
                    Are you sure you want to delist{' '}
                    {selectedPlayer.firstName} {selectedPlayer.lastName}? They
                    will be removed from your list.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleConfirmDelist}
                    >
                      Confirm Delisting
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <p className="text-sm">
                Player has been delisted successfully.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {done ? 'Close' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Rookie Upgrade Dialog
// ---------------------------------------------------------------------------

function RookieUpgradeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const currentDate = useGameStore((s) => s.currentDate)
  const updatePlayer = useGameStore((s) => s.updatePlayer)
  const addNewsItem = useGameStore((s) => s.addNewsItem)

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
  const [done, setDone] = useState(false)

  const rookies = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId && p.isRookie)
        .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [players, playerClubId],
  )

  const selectedPlayer = selectedPlayerId ? players[selectedPlayerId] : null
  const clubName = clubs[playerClubId]?.abbreviation ?? 'Club'

  const resetForm = useCallback(() => {
    setSelectedPlayerId('')
    setDone(false)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm()
      onOpenChange(next)
    },
    [onOpenChange, resetForm],
  )

  const handleUpgrade = useCallback(() => {
    if (!selectedPlayer) return

    const playerName = `${selectedPlayer.firstName} ${selectedPlayer.lastName}`

    updatePlayer(selectedPlayer.id, {
      isRookie: false,
    })

    addNewsItem({
      id: crypto.randomUUID(),
      date: currentDate,
      headline: `${playerName} upgraded to ${clubName} senior list`,
      body: `${playerName} has been elevated from the rookie list to the senior list at ${clubName}.`,
      category: 'contract',
      clubIds: [playerClubId],
      playerIds: [selectedPlayer.id],
    })

    setDone(true)
  }, [selectedPlayer, clubName, playerClubId, currentDate, updatePlayer, addNewsItem])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade Rookie</DialogTitle>
          <DialogDescription>
            Promote a rookie-listed player to your senior list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!done ? (
            <>
              {rookies.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No rookie-listed players available.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Select Rookie</Label>
                    <Select
                      value={selectedPlayerId}
                      onValueChange={setSelectedPlayerId}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a rookie..." />
                      </SelectTrigger>
                      <SelectContent>
                        {rookies.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.firstName} {p.lastName} ({p.position.primary},{' '}
                            {p.age}yo)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedPlayer && (
                    <div className="rounded-md border p-3 text-sm space-y-2">
                      <p>
                        <span className="font-medium">
                          {selectedPlayer.firstName} {selectedPlayer.lastName}
                        </span>{' '}
                        - {selectedPlayer.position.primary},{' '}
                        {selectedPlayer.age}yo
                      </p>
                      <p className="text-muted-foreground">
                        Contract: {selectedPlayer.contract.yearsRemaining}yr @{' '}
                        {formatDollars(selectedPlayer.contract.aav)}/yr
                      </p>
                      <Button size="sm" onClick={handleUpgrade}>
                        Confirm Upgrade to Senior List
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <p className="text-sm">
                Player has been upgraded to the senior list.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {done ? 'Close' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function ContractsPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const phase = useGameStore((s) => s.phase)
  const newsLog = useGameStore((s) => s.newsLog)

  const [offerOpen, setOfferOpen] = useState(false)
  const [delistOpen, setDelistOpen] = useState(false)
  const [rookieOpen, setRookieOpen] = useState(false)

  const club = clubs[playerClubId]

  const clubPlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId)
        .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [players, playerClubId],
  )

  const totalSalary = useMemo(
    () => clubPlayers.reduce((sum, p) => sum + p.contract.aav, 0),
    [clubPlayers],
  )

  const expiringCount = useMemo(
    () => clubPlayers.filter((p) => p.contract.yearsRemaining <= 1).length,
    [clubPlayers],
  )

  const rookieCount = useMemo(
    () => clubPlayers.filter((p) => p.isRookie).length,
    [clubPlayers],
  )

  const recentContractNews = useMemo(
    () =>
      newsLog
        .filter((n) => n.category === 'contract')
        .slice(-10)
        .reverse(),
    [newsLog],
  )

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
          <h1 className="text-2xl font-bold">Contract Management</h1>
          <p className="text-sm text-muted-foreground">
            {club?.fullName} &middot; {phaseLabel}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-right">
            <p className="text-muted-foreground">Total Salary</p>
            <p className="font-semibold">{formatDollars(totalSalary)}</p>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div className="text-right">
            <p className="text-muted-foreground">Expiring</p>
            <p className="font-semibold">{expiringCount} players</p>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div className="text-right">
            <p className="text-muted-foreground">Rookies</p>
            <p className="font-semibold">{rookieCount}</p>
          </div>
        </div>
      </div>

      {/* Actions Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => setOfferOpen(true)}
        >
          <CardContent className="flex items-center gap-4 py-4">
            <div className="rounded-md bg-primary/10 p-2">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Offer Contract</p>
              <p className="text-xs text-muted-foreground">
                Negotiate a new deal with a player
              </p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => setDelistOpen(true)}
        >
          <CardContent className="flex items-center gap-4 py-4">
            <div className="rounded-md bg-destructive/10 p-2">
              <UserMinus className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="font-semibold">Delist Player</p>
              <p className="text-xs text-muted-foreground">
                Remove a player from your list
              </p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => setRookieOpen(true)}
        >
          <CardContent className="flex items-center gap-4 py-4">
            <div className="rounded-md bg-green-500/10 p-2">
              <ArrowUpCircle className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="font-semibold">Upgrade Rookie</p>
              <p className="text-xs text-muted-foreground">
                Promote a rookie to the senior list
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contract Overview Table */}
      <Card>
        <CardHeader>
          <CardTitle>Squad Contracts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3">Player</TableHead>
                  <TableHead className="px-3">Pos</TableHead>
                  <TableHead className="px-3 text-center">Age</TableHead>
                  <TableHead className="px-3 text-right">AAV</TableHead>
                  <TableHead className="px-3 text-center">Years Left</TableHead>
                  <TableHead className="px-3 text-right">Est. Value</TableHead>
                  <TableHead className="px-3 text-center">List</TableHead>
                  <TableHead className="px-3 text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clubPlayers.map((player) => {
                  const mv = calculateMarketValue(player)
                  const overpaid = player.contract.aav > mv * 1.15
                  const underpaid = player.contract.aav < mv * 0.8
                  return (
                    <TableRow key={player.id} className="text-sm">
                      <TableCell className="px-3 font-medium">
                        {player.firstName} {player.lastName}
                      </TableCell>
                      <TableCell className="px-3">
                        <Badge variant="outline">{player.position.primary}</Badge>
                      </TableCell>
                      <TableCell className="px-3 text-center">
                        {player.age}
                      </TableCell>
                      <TableCell className="px-3 text-right font-mono text-xs">
                        {formatDollars(player.contract.aav)}
                      </TableCell>
                      <TableCell className="px-3 text-center">
                        <span
                          className={
                            player.contract.yearsRemaining <= 1
                              ? 'text-red-500 font-semibold'
                              : ''
                          }
                        >
                          {player.contract.yearsRemaining}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 text-right font-mono text-xs">
                        {formatDollars(mv)}
                      </TableCell>
                      <TableCell className="px-3 text-center">
                        <Badge
                          variant={player.isRookie ? 'secondary' : 'default'}
                        >
                          {player.isRookie ? 'Rookie' : 'Senior'}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 text-center">
                        {player.contract.yearsRemaining === 0 ? (
                          <Badge variant="destructive">Out of Contract</Badge>
                        ) : overpaid ? (
                          <Badge variant="outline" className="text-orange-500 border-orange-500/50">
                            Overpaid
                          </Badge>
                        ) : underpaid ? (
                          <Badge variant="outline" className="text-green-500 border-green-500/50">
                            Underpaid
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Fair
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Feed */}
      {recentContractNews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentContractNews.map((news) => (
                <div key={news.id} className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{news.headline}</p>
                    <p className="text-xs text-muted-foreground">{news.body}</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {news.date}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <ContractOfferDialog open={offerOpen} onOpenChange={setOfferOpen} />
      <DelistDialog open={delistOpen} onOpenChange={setDelistOpen} />
      <RookieUpgradeDialog open={rookieOpen} onOpenChange={setRookieOpen} />
    </div>
  )
}
