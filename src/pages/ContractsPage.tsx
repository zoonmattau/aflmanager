import { useMemo, useState, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { Player, PlayerPositionType } from '@/types/player'
import type { NegotiationOffer, ContractStructure, ActiveNegotiation, ContractClause } from '@/types/contract'
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
  Clock,
  MessageSquare,
  TrendingUp,
  X,
} from 'lucide-react'
import { diffDays } from '@/engine/calendar/calendarEngine'
import { calculatePlayerValue } from '@/engine/contracts/negotiation'
import { buildYearByYearFromStructure, calculateIncentiveValue } from '@/engine/contracts/contractStructures'
import { ContractProjectionPanel } from '@/components/contracts/ContractProjectionPanel'
import { useTableViewManager, type TableViewColumnConfig } from '@/components/table-view/useTableViewManager'
import { TableViewManagerControl } from '@/components/table-view/TableViewManagerControl'
import { ShortlistAssignMenu, ShortlistManager } from '@/components/shortlists/ShortlistManager'
import { isAflListedPlayer } from '@/engine/players/contracts'
import type { BoardApprovalResult } from '@/types/boardApproval'
import { BoardApprovalPanel } from '@/components/board/BoardApprovalPanel'

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

function statusBadge(status: ActiveNegotiation['status']) {
  switch (status) {
    case 'pending': return <Badge variant="outline">Pending</Badge>
    case 'player-considering': return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Considering</Badge>
    case 'counter-offered': return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">Counter Offered</Badge>
    case 'accepted': return <Badge className="bg-green-500/15 text-green-600 border-green-500/30">Accepted</Badge>
    case 'rejected': return <Badge variant="destructive">Rejected</Badge>
    case 'expired': return <Badge variant="secondary">Expired</Badge>
    case 'withdrawn': return <Badge variant="secondary">Withdrawn</Badge>
    default: return <Badge variant="outline">{status}</Badge>
  }
}

function moodBadge(mood: ActiveNegotiation['playerMood']) {
  switch (mood) {
    case 'eager': return <Badge className="bg-green-500/15 text-green-600 border-green-500/30">Eager</Badge>
    case 'neutral': return <Badge variant="outline">Neutral</Badge>
    case 'reluctant': return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Reluctant</Badge>
    case 'hostile': return <Badge variant="destructive">Hostile</Badge>
  }
}

// ---------------------------------------------------------------------------
// Sub-components: Negotiation Dialog
// ---------------------------------------------------------------------------

function NegotiationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const phase = useGameStore((s) => s.phase)
  const players = useGameStore((s) => s.players)
  const negotiations = useGameStore((s) => s.negotiations)
  const startContractNegotiation = useGameStore((s) => s.startContractNegotiation)
  const submitContractOffer = useGameStore((s) => s.submitContractOffer)
  const acceptContractCounterOffer = useGameStore((s) => s.acceptContractCounterOffer)
  const withdrawContractNegotiation = useGameStore((s) => s.withdrawContractNegotiation)
  const previewBoardApproval = useGameStore((s) => s.previewBoardApproval)

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
  const [activeNegId, setActiveNegId] = useState<string | null>(null)
  const [years, setYears] = useState(3)
  const [aavInput, setAavInput] = useState('')
  const [structure, setStructure] = useState<ContractStructure>('escalating')
  const [promisedPosition, setPromisedPosition] = useState<PlayerPositionType | ''>('')
  const [leadershipGroupRole, setLeadershipGroupRole] = useState(false)
  const [contenderAmbition, setContenderAmbition] = useState(false)
  const [homeStateSupport, setHomeStateSupport] = useState(false)
  const [offerNoTradeClause, setOfferNoTradeClause] = useState(false)
  const [offerLimitedTradeClause, setOfferLimitedTradeClause] = useState(false)
  const [limitedTradeVetoIdsInput, setLimitedTradeVetoIdsInput] = useState('')
  const [offerPlayerOption, setOfferPlayerOption] = useState(false)
  const [offerTeamOption, setOfferTeamOption] = useState(false)
  const [optionYear, setOptionYear] = useState(2)
  const [offerVestingClause, setOfferVestingClause] = useState(false)
  const [vestingYear, setVestingYear] = useState(2)
  const [vestingType, setVestingType] = useState<'games-played' | 'awards' | 'goals' | 'team-finals'>('games-played')
  const [vestingThreshold, setVestingThreshold] = useState(15)
  const [vestingAmountInput, setVestingAmountInput] = useState('')
  const [gamesBonusInput, setGamesBonusInput] = useState('')
  const [goalsBonusInput, setGoalsBonusInput] = useState('')
  const [awardsBonusInput, setAwardsBonusInput] = useState('')
  const [finalsBonusInput, setFinalsBonusInput] = useState('')
  const [offerRolePromiseClause, setOfferRolePromiseClause] = useState(false)
  const [offerLeadershipPromiseClause, setOfferLeadershipPromiseClause] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [contractBoardPreview, setContractBoardPreview] = useState<BoardApprovalResult | null>(null)

  const clubPlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId && isAflListedPlayer(p))
        .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [players, playerClubId],
  )

  const expiringPlayers = useMemo(
    () => clubPlayers.filter((p) => p.contract.yearsRemaining <= 2),
    [clubPlayers],
  )

  const offseasonFreeAgents = useMemo(
    () => {
      if (phase !== 'offseason') return []
      return Object.values(players)
        .filter((p) => p.clubId !== playerClubId && p.clubId !== 'retired' && p.contract.yearsRemaining <= 0)
        .sort((a, b) => b.contract.aav - a.contract.aav)
    },
    [phase, players, playerClubId],
  )

  const selectedPlayer = selectedPlayerId ? players[selectedPlayerId] : null
  const marketValue = selectedPlayer ? calculatePlayerValue(selectedPlayer) : 0
  const aav = parseDollarInput(aavInput)
  const yearByYear = useMemo(
    () => buildYearByYearFromStructure(aav, years, structure),
    [aav, years, structure],
  )

  // Find active negotiation for this player
  const activeNeg = activeNegId && negotiations?.active[activeNegId]
    ? negotiations.active[activeNegId]
    : null

  const resetForm = useCallback(() => {
    setSelectedPlayerId('')
    setActiveNegId(null)
    setYears(3)
    setAavInput('')
    setStructure('escalating')
    setPromisedPosition('')
    setLeadershipGroupRole(false)
    setContenderAmbition(false)
    setHomeStateSupport(false)
    setOfferNoTradeClause(false)
    setOfferLimitedTradeClause(false)
    setLimitedTradeVetoIdsInput('')
    setOfferPlayerOption(false)
    setOfferTeamOption(false)
    setOptionYear(2)
    setOfferVestingClause(false)
    setVestingYear(2)
    setVestingType('games-played')
    setVestingThreshold(15)
    setVestingAmountInput('')
    setGamesBonusInput('')
    setGoalsBonusInput('')
    setAwardsBonusInput('')
    setFinalsBonusInput('')
    setOfferRolePromiseClause(false)
    setOfferLeadershipPromiseClause(false)
    setError(null)
    setSuccess(null)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm()
      onOpenChange(next)
    },
    [onOpenChange, resetForm],
  )

  const handleStartNegotiation = useCallback(() => {
    if (!selectedPlayerId) return
    setError(null)
    setSuccess(null)

    const result = startContractNegotiation(selectedPlayerId)
    if (!result.success) {
      setError(result.error ?? 'Failed to start negotiation')
      return
    }

    setActiveNegId(result.negotiationId ?? null)

    // Pre-fill the offer form based on player demand
    const neg = result.negotiationId ? useGameStore.getState().negotiations?.active[result.negotiationId] : null
    if (neg) {
      setAavInput(neg.playerDemand.aav.toString())
      setYears(neg.playerDemand.years)
      setStructure(neg.playerDemand.structure)
      setPromisedPosition('')
      setLeadershipGroupRole(false)
      setContenderAmbition(false)
      setHomeStateSupport(false)
      setOfferNoTradeClause(false)
      setOfferLimitedTradeClause(false)
      setLimitedTradeVetoIdsInput('')
      setOfferPlayerOption(false)
      setOfferTeamOption(false)
      setOptionYear(2)
      setOfferVestingClause(false)
      setVestingYear(2)
      setVestingType('games-played')
      setVestingThreshold(15)
      setVestingAmountInput('')
      setGamesBonusInput('')
      setGoalsBonusInput('')
      setAwardsBonusInput('')
      setFinalsBonusInput('')
      setOfferRolePromiseClause(false)
      setOfferLeadershipPromiseClause(false)
    }
  }, [selectedPlayerId, startContractNegotiation])

  const handleSubmitOffer = useCallback(() => {
    if (!activeNegId || aav <= 0 || years < 1) return
    setError(null)
    setSuccess(null)

    // Board approval preview (show panel on first click, submit on second)
    if (!contractBoardPreview) {
      const preview = previewBoardApproval('contract', { aav })
      if (preview.requiresApproval) {
        setContractBoardPreview(preview)
        return
      }
    }
    setContractBoardPreview(null)

    const baseClauses = activeNeg?.playerDemand.clauses ?? []
    const clauses: ContractClause[] = [...baseClauses]
    const upsertClause = (clause: ContractClause, enabled: boolean, matcher: (c: ContractClause) => boolean) => {
      const idx = clauses.findIndex(matcher)
      if (enabled) {
        if (idx >= 0) clauses[idx] = clause
        else clauses.push(clause)
        return
      }
      if (idx >= 0) clauses.splice(idx, 1)
    }

    upsertClause({ type: 'no-trade' }, offerNoTradeClause, (c) => c.type === 'no-trade')
    upsertClause(
      { type: 'limited-trade', vetoClubIds: limitedTradeVetoIdsInput.split(',').map((x) => x.trim()).filter(Boolean) },
      offerLimitedTradeClause,
      (c) => c.type === 'limited-trade',
    )
    upsertClause({ type: 'player-option', optionYear }, offerPlayerOption, (c) => c.type === 'player-option')
    upsertClause({ type: 'team-option', optionYear }, offerTeamOption, (c) => c.type === 'team-option')
    upsertClause(
      {
        type: 'vesting',
        appliesToYear: vestingYear,
        bonusAmount: parseDollarInput(vestingAmountInput),
        vestingCondition: { type: vestingType, threshold: Math.max(1, vestingThreshold) },
      },
      offerVestingClause,
      (c) => c.type === 'vesting',
    )
    upsertClause(
      { type: 'role-promise', promisedPosition: promisedPosition || undefined },
      offerRolePromiseClause,
      (c) => c.type === 'role-promise',
    )
    upsertClause(
      { type: 'leadership-promise', leadershipLevel: 'group' },
      offerLeadershipPromiseClause,
      (c) => c.type === 'leadership-promise',
    )
    upsertClause(
      { type: 'games-bonus', bonusAmount: parseDollarInput(gamesBonusInput), bonusThreshold: { stat: 'gamesPlayed', value: 18 } },
      parseDollarInput(gamesBonusInput) > 0,
      (c) => c.type === 'games-bonus',
    )
    upsertClause(
      { type: 'goals-bonus', bonusAmount: parseDollarInput(goalsBonusInput), bonusThreshold: { stat: 'goals', value: 35 } },
      parseDollarInput(goalsBonusInput) > 0,
      (c) => c.type === 'goals-bonus',
    )
    upsertClause(
      { type: 'awards-bonus', bonusAmount: parseDollarInput(awardsBonusInput), bonusThreshold: { stat: 'awards', value: 1 } },
      parseDollarInput(awardsBonusInput) > 0,
      (c) => c.type === 'awards-bonus',
    )
    upsertClause(
      { type: 'finals-bonus', bonusAmount: parseDollarInput(finalsBonusInput), bonusThreshold: { stat: 'teamFinals', value: 1 } },
      parseDollarInput(finalsBonusInput) > 0,
      (c) => c.type === 'finals-bonus',
    )

    const offer: NegotiationOffer = {
      years,
      aav,
      yearByYear,
      structure,
      clauses,
      incentiveTotal: calculateIncentiveValue(clauses),
      concessions: {
        promisedPosition: promisedPosition || undefined,
        leadershipGroupRole,
        contenderAmbition,
        homeStateSupport,
        noTradeClause: offerNoTradeClause,
      },
    }

    const result = submitContractOffer(activeNegId, offer)
    if (!result.success) {
      setError(result.error ?? 'Failed to submit offer')
      return
    }

    // Check if it resolved immediately (delays disabled)
    const state = useGameStore.getState()
    const neg = state.negotiations?.active[activeNegId]
    if (!neg) {
      // Negotiation completed (moved to completed list)
      const completed = state.negotiations?.completed.find((c) => c.id === activeNegId)
      if (completed?.outcome === 'signed') {
        setSuccess('Contract accepted! Player has signed the deal.')
      } else if (completed?.outcome === 'rejected') {
        setError('Player has rejected the offer and walked away.')
      }
    }
  }, [
    activeNegId,
    aav,
    years,
    yearByYear,
    structure,
    activeNeg,
    submitContractOffer,
    previewBoardApproval,
    contractBoardPreview,
    promisedPosition,
    leadershipGroupRole,
    contenderAmbition,
    homeStateSupport,
    offerNoTradeClause,
    offerLimitedTradeClause,
    limitedTradeVetoIdsInput,
    offerPlayerOption,
    offerTeamOption,
    optionYear,
    offerVestingClause,
    vestingYear,
    vestingType,
    vestingThreshold,
    vestingAmountInput,
    gamesBonusInput,
    goalsBonusInput,
    awardsBonusInput,
    finalsBonusInput,
    offerRolePromiseClause,
    offerLeadershipPromiseClause,
  ])

  const handleAcceptCounter = useCallback(() => {
    if (!activeNegId) return
    setError(null)

    // Board approval preview for accepting counter-offer
    const counterAav = activeNeg?.playerDemand.aav ?? 0
    if (!contractBoardPreview) {
      const preview = previewBoardApproval('contract', { aav: counterAav })
      if (preview.requiresApproval) {
        setContractBoardPreview(preview)
        return
      }
    }
    setContractBoardPreview(null)

    const result = acceptContractCounterOffer(activeNegId)
    if (!result.success) {
      setError(result.error ?? 'Failed to accept counter-offer')
      return
    }
    setSuccess('Counter-offer accepted! Player has signed.')
  }, [activeNegId, activeNeg, acceptContractCounterOffer, previewBoardApproval, contractBoardPreview])

  const handleWithdraw = useCallback(() => {
    if (!activeNegId) return
    withdrawContractNegotiation(activeNegId)
    resetForm()
  }, [activeNegId, withdrawContractNegotiation, resetForm])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contract Negotiation</DialogTitle>
          <DialogDescription>
            Start a negotiation and work toward a deal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Select Player (if no active negotiation) */}
          {!activeNeg && !success && (
            <>
              <div className="space-y-2">
                <Label>Select Player</Label>
                <Select
                  value={selectedPlayerId}
                  onValueChange={(v) => {
                    setSelectedPlayerId(v)
                    setError(null)
                    setSuccess(null)
                    setActiveNegId(null)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a player..." />
                  </SelectTrigger>
                  <SelectContent>
                    {expiringPlayers.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Expiring Contracts</SelectLabel>
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
                    {offseasonFreeAgents.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Free Agents</SelectLabel>
                        {offseasonFreeAgents.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.firstName} {p.lastName} ({p.position.primary}, {p.age}yo) - Free agent
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedPlayer && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Current AAV:</span>{' '}
                      <span className="font-medium">{formatDollars(selectedPlayer.contract.aav)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Years Left:</span>{' '}
                      <span className="font-medium">{selectedPlayer.contract.yearsRemaining}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Market Value:</span>{' '}
                      <span className="font-semibold text-primary">{formatDollars(marketValue)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Morale:</span>{' '}
                      <span className="font-medium">{selectedPlayer.morale}</span>
                    </div>
                  </div>
                  <Button onClick={handleStartNegotiation} className="w-full">
                    Start Negotiation
                  </Button>
                  <div className="flex justify-end">
                    <ShortlistAssignMenu targetType="player" targetId={selectedPlayer.id} buttonLabel="Add to Shortlist" buttonVariant="outline" buttonSize="sm" />
                  </div>
                </>
              )}
            </>
          )}

          {/* Active Negotiation */}
          {activeNeg && !success && (
            <>
              <Separator />

              {/* Player Demand */}
              <div className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Player's Demand</p>
                  {moodBadge(activeNeg.playerMood)}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">AAV:</span>{' '}
                    <span className="font-medium">{formatDollars(activeNeg.playerDemand.aav)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Years:</span>{' '}
                    <span className="font-medium">{activeNeg.playerDemand.years}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Structure:</span>{' '}
                    <span className="font-medium capitalize">{activeNeg.playerDemand.structure}</span>
                  </div>
                  {activeNeg.playerDemand.clauses.length > 0 && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Clauses:</span>{' '}
                      <span className="font-medium">
                        {activeNeg.playerDemand.clauses.map((c) => c.type).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
                {activeNeg.mediaLeaked && (
                  <Badge variant="outline" className="text-orange-500 border-orange-500/30">
                    Media Leaked
                  </Badge>
                )}
              </div>

              {activeNeg.latestFeedback && (
                <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3 space-y-2">
                  <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">Player Feedback</p>
                  <p className="text-xs text-muted-foreground">{activeNeg.latestFeedback.summary}</p>
                  <div className="space-y-1">
                    {activeNeg.latestFeedback.items.map((item, idx) => (
                      <div key={`${item.type}-${idx}`} className="text-xs flex items-start gap-2">
                        <Badge variant="outline" className={item.satisfiedByOffer ? 'text-green-600 border-green-500/40' : 'text-amber-600 border-amber-500/40'}>
                          {item.satisfiedByOffer ? 'Met' : 'Need'}
                        </Badge>
                        <div className="min-w-0">
                          <p className="font-medium">{item.message}</p>
                          {!item.satisfiedByOffer && (
                            <p className="text-muted-foreground">{item.actionHint}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status display */}
              {activeNeg.status === 'player-considering' && activeNeg.cooldownRemaining > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
                  <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-600 dark:text-amber-400">Player Considering</p>
                    <p className="text-sm text-muted-foreground">
                      The player is reviewing your offer. Response expected in {activeNeg.cooldownRemaining} round{activeNeg.cooldownRemaining !== 1 ? 's' : ''}.
                    </p>
                  </div>
                </div>
              )}

              {/* Counter-offer display */}
              {activeNeg.status === 'counter-offered' && (
                <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-600 dark:text-blue-400">Counter-Offer Received</p>
                      {(() => {
                        const lastPlayerOffer = [...activeNeg.rounds].reverse().find((r) => r.offeredBy === 'player')
                        if (!lastPlayerOffer) return null
                        return (
                          <p className="text-sm text-muted-foreground">
                            Player wants {lastPlayerOffer.offer.years} years at {formatDollars(lastPlayerOffer.offer.aav)}/yr ({lastPlayerOffer.offer.structure})
                          </p>
                        )
                      })()}
                    </div>
                  </div>
                  {contractBoardPreview && (
                    <div className="space-y-2">
                      <BoardApprovalPanel result={contractBoardPreview} compact />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleAcceptCounter}>Proceed to Board</Button>
                        <Button size="sm" variant="ghost" onClick={() => setContractBoardPreview(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                  {!contractBoardPreview && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAcceptCounter}>Accept Counter</Button>
                      <Button size="sm" variant="outline" onClick={() => { /* Allow revising below */ }}>
                        Revise Offer
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Offer Form (when pending or counter-offered) */}
              {(activeNeg.status === 'pending' || activeNeg.status === 'counter-offered') && (
                <div className="space-y-3">
                  <Separator />
                  <p className="text-sm font-semibold">Your Offer</p>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Contract Length</Label>
                      <span className="text-sm font-semibold">{years} {years === 1 ? 'year' : 'years'}</span>
                    </div>
                    <input
                      type="range" min={1} max={6} step={1} value={years}
                      onChange={(e) => setYears(Number(e.target.value))}
                      className="w-full accent-primary h-2 cursor-pointer"
                    />
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
                        {((aav / marketValue) * 100).toFixed(0)}% of market value
                        {aav < activeNeg.playerDemand.aav && (
                          <span className="text-orange-500"> (below demand)</span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Structure</Label>
                    <Select value={structure} onValueChange={(v) => setStructure(v as ContractStructure)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">Flat</SelectItem>
                        <SelectItem value="front-loaded">Front-Loaded</SelectItem>
                        <SelectItem value="back-loaded">Back-Loaded</SelectItem>
                        <SelectItem value="escalating">Escalating</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Concessions</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <label className="flex items-center gap-2 rounded-md border p-2">
                        <input
                          type="checkbox"
                          checked={leadershipGroupRole}
                          onChange={(e) => setLeadershipGroupRole(e.target.checked)}
                        />
                        Leadership group role
                      </label>
                      <label className="flex items-center gap-2 rounded-md border p-2">
                        <input
                          type="checkbox"
                          checked={contenderAmbition}
                          onChange={(e) => setContenderAmbition(e.target.checked)}
                        />
                        Contender ambitions
                      </label>
                      <label className="flex items-center gap-2 rounded-md border p-2">
                        <input
                          type="checkbox"
                          checked={homeStateSupport}
                          onChange={(e) => setHomeStateSupport(e.target.checked)}
                        />
                        Home-state support
                      </label>
                      <label className="flex items-center gap-2 rounded-md border p-2">
                        <input
                          type="checkbox"
                          checked={offerNoTradeClause}
                          onChange={(e) => setOfferNoTradeClause(e.target.checked)}
                        />
                        Include no-trade clause
                      </label>
                      <label className="flex items-center gap-2 rounded-md border p-2">
                        <input
                          type="checkbox"
                          checked={offerLimitedTradeClause}
                          onChange={(e) => setOfferLimitedTradeClause(e.target.checked)}
                        />
                        Include limited no-trade
                      </label>
                      <label className="flex items-center gap-2 rounded-md border p-2">
                        <input
                          type="checkbox"
                          checked={offerPlayerOption}
                          onChange={(e) => setOfferPlayerOption(e.target.checked)}
                        />
                        Player option year
                      </label>
                      <label className="flex items-center gap-2 rounded-md border p-2">
                        <input
                          type="checkbox"
                          checked={offerTeamOption}
                          onChange={(e) => setOfferTeamOption(e.target.checked)}
                        />
                        Team option year
                      </label>
                      <label className="flex items-center gap-2 rounded-md border p-2">
                        <input
                          type="checkbox"
                          checked={offerVestingClause}
                          onChange={(e) => setOfferVestingClause(e.target.checked)}
                        />
                        Vesting year clause
                      </label>
                      <label className="flex items-center gap-2 rounded-md border p-2">
                        <input
                          type="checkbox"
                          checked={offerRolePromiseClause}
                          onChange={(e) => setOfferRolePromiseClause(e.target.checked)}
                        />
                        Role promise clause
                      </label>
                      <label className="flex items-center gap-2 rounded-md border p-2">
                        <input
                          type="checkbox"
                          checked={offerLeadershipPromiseClause}
                          onChange={(e) => setOfferLeadershipPromiseClause(e.target.checked)}
                        />
                        Leadership promise clause
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Option Year</Label>
                      <Input value={String(optionYear)} onChange={(e) => setOptionYear(Math.max(1, Math.min(6, Number(e.target.value) || 1)))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Limited NT Veto Club IDs (comma)</Label>
                      <Input value={limitedTradeVetoIdsInput} onChange={(e) => setLimitedTradeVetoIdsInput(e.target.value)} placeholder="e.g. richmond,hawthorn" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Vesting Year</Label>
                      <Input value={String(vestingYear)} onChange={(e) => setVestingYear(Math.max(1, Math.min(6, Number(e.target.value) || 1)))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Vesting Amount</Label>
                      <Input value={vestingAmountInput} onChange={(e) => setVestingAmountInput(e.target.value)} placeholder="100000" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Vesting Threshold</Label>
                      <Input value={String(vestingThreshold)} onChange={(e) => setVestingThreshold(Math.max(1, Number(e.target.value) || 1))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Vesting Type</Label>
                      <Select value={vestingType} onValueChange={(v) => setVestingType(v as 'games-played' | 'awards' | 'goals' | 'team-finals')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="games-played">Games Played</SelectItem>
                          <SelectItem value="awards">Awards</SelectItem>
                          <SelectItem value="goals">Goals</SelectItem>
                          <SelectItem value="team-finals">Team Finals</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Games Bonus</Label>
                      <Input value={gamesBonusInput} onChange={(e) => setGamesBonusInput(e.target.value)} placeholder="30000" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Goals Bonus</Label>
                      <Input value={goalsBonusInput} onChange={(e) => setGoalsBonusInput(e.target.value)} placeholder="30000" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Awards Bonus</Label>
                      <Input value={awardsBonusInput} onChange={(e) => setAwardsBonusInput(e.target.value)} placeholder="40000" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Team Finals Bonus</Label>
                      <Input value={finalsBonusInput} onChange={(e) => setFinalsBonusInput(e.target.value)} placeholder="40000" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Role / Position Promise</Label>
                    <Select
                      value={promisedPosition || '__none'}
                      onValueChange={(v) => setPromisedPosition(v === '__none' ? '' : (v as PlayerPositionType))}
                    >
                      <SelectTrigger><SelectValue placeholder="No position promise" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No promise</SelectItem>
                        {(['BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF'] as PlayerPositionType[]).map((pos) => (
                          <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Year-by-Year Preview */}
                  {aav > 0 && years > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Year-by-Year</Label>
                      <div className="flex gap-2 flex-wrap">
                        {yearByYear.map((salary, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            Y{i + 1}: {formatDollars(salary)}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Total: {formatDollars(yearByYear.reduce((sum, v) => sum + v, 0))}
                      </p>
                    </div>
                  )}

                  {contractBoardPreview && (
                    <div className="space-y-2">
                      <BoardApprovalPanel result={contractBoardPreview} compact />
                      <div className="flex gap-2">
                        <Button onClick={handleSubmitOffer} className="flex-1">
                          Proceed to Board
                        </Button>
                        <Button variant="ghost" onClick={() => setContractBoardPreview(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                  {!contractBoardPreview && (
                    <Button onClick={handleSubmitOffer} disabled={aav <= 0 || years < 1} className="w-full">
                      Submit Offer
                    </Button>
                  )}
                </div>
              )}

              {/* Negotiation History */}
              {activeNeg.rounds.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">History</p>
                  {activeNeg.rounds.map((round, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant={round.offeredBy === 'club' ? 'default' : 'secondary'} className="text-[10px]">
                        {round.offeredBy === 'club' ? 'You' : 'Player'}
                      </Badge>
                      <span>{round.offer.years}yr @ {formatDollars(round.offer.aav)}/yr ({round.offer.structure})</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 flex items-start gap-2">
              <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-600 dark:text-red-400">Error</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-600 dark:text-green-400">Success</p>
                <p className="text-sm text-muted-foreground">{success}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {success ? 'Close' : 'Cancel'}
          </Button>
          {activeNeg && !success && (
            <Button variant="ghost" size="sm" onClick={handleWithdraw} className="text-destructive">
              <X className="h-4 w-4 mr-1" /> Withdraw
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Sub-components: Delist Dialog (UNCHANGED)
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
        .filter((p) => p.clubId === playerClubId && isAflListedPlayer(p))
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
// Sub-components: Rookie Upgrade Dialog (UNCHANGED)
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
        .filter((p) => p.clubId === playerClubId && isAflListedPlayer(p) && p.isRookie)
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
// Active Negotiations Panel
// ---------------------------------------------------------------------------

function ActiveNegotiationsPanel() {
  const negotiations = useGameStore((s) => s.negotiations)
  const players = useGameStore((s) => s.players)
  const withdrawContractNegotiation = useGameStore((s) => s.withdrawContractNegotiation)

  const activeList = useMemo(() => {
    if (!negotiations) return []
    return Object.values(negotiations.active)
  }, [negotiations])

  if (activeList.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Active Negotiations ({activeList.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activeList.map((neg) => {
            const player = players[neg.playerId]
            if (!player) return null
            return (
              <div key={neg.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {player.firstName} {player.lastName}
                    </span>
                    {statusBadge(neg.status)}
                    {moodBadge(neg.playerMood)}
                    {neg.mediaLeaked && (
                      <Badge variant="outline" className="text-orange-500 border-orange-500/30 text-[10px]">
                        Leaked
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Demand: {formatDollars(neg.playerDemand.aav)}/yr x {neg.playerDemand.years}yr
                    {' '}&middot;{' '}Rounds: {neg.rounds.length}/{neg.maxRounds}
                    {neg.cooldownRemaining > 0 && (
                      <span> &middot; Response in {neg.cooldownRemaining} round{neg.cooldownRemaining !== 1 ? 's' : ''}</span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => withdrawContractNegotiation(neg.id)}
                  className="text-destructive shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
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
  const offseasonState = useGameStore((s) => s.offseasonState)

  const [offerOpen, setOfferOpen] = useState(false)
  const [delistOpen, setDelistOpen] = useState(false)
  const [rookieOpen, setRookieOpen] = useState(false)
  const [projectionPlayerId, setProjectionPlayerId] = useState<string | null>(null)

  const club = clubs[playerClubId]

  const clubPlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId && isAflListedPlayer(p))
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
      case 'setup': return 'Setup'
      case 'preseason': return 'Pre-Season'
      case 'regular-season': return 'Regular Season'
      case 'finals': return 'Finals'
      case 'post-season': return 'Post-Season'
      case 'offseason': return 'Off-Season'
      default: return phase
    }
  })()

  const freeAgencyCountdown = useMemo(() => {
    if (!offseasonState?.calendarState) return null
    const cal = offseasonState.calendarState
    // Show the "Free Agency Opens" countdown before it starts, then "closes" once open
    const opensMilestone = cal.milestones.find((m) => m.label === 'Free Agency Opens')
    const closesMilestone = cal.milestones.find((m) => m.label === 'Free Agency Closes')
    if (opensMilestone && cal.currentDate < opensMilestone.date) {
      const days = diffDays(cal.currentDate, opensMilestone.date)
      return { label: 'Free agency opens', days, urgency: days <= 2 ? 'urgent' : days <= 7 ? 'warning' : 'normal' as const }
    }
    if (closesMilestone && cal.currentDate <= closesMilestone.date) {
      const days = diffDays(cal.currentDate, closesMilestone.date)
      return { label: 'Free agency closes', days, urgency: days <= 2 ? 'urgent' : days <= 7 ? 'warning' : 'normal' as const }
    }
    return null
  }, [offseasonState])

  const tableColumns = useMemo(() => {
    const cols = [
      {
        id: 'player',
        label: 'Player',
        defaultWidth: 180,
        sortable: true,
        sortValue: (player: Player) => `${player.lastName},${player.firstName}`.toLowerCase(),
        render: (player: Player) => <span className="font-medium">{player.firstName} {player.lastName}</span>,
      },
      {
        id: 'pos',
        label: 'Pos',
        defaultWidth: 72,
        sortable: true,
        sortValue: (player: Player) => player.position.primary,
        render: (player: Player) => <Badge variant="outline">{player.position.primary}</Badge>,
      },
      {
        id: 'age',
        label: 'Age',
        defaultWidth: 60,
        sortable: true,
        sortValue: (player: Player) => player.age,
        render: (player: Player) => player.age,
      },
      {
        id: 'aav',
        label: 'AAV',
        defaultWidth: 96,
        sortable: true,
        sortValue: (player: Player) => player.contract.aav,
        render: (player: Player) => <span className="font-mono text-xs">{formatDollars(player.contract.aav)}</span>,
      },
      {
        id: 'years',
        label: 'Years Left',
        defaultWidth: 84,
        sortable: true,
        sortValue: (player: Player) => player.contract.yearsRemaining,
        render: (player: Player) => (
          <span className={player.contract.yearsRemaining <= 1 ? 'text-red-500 font-semibold' : ''}>
            {player.contract.yearsRemaining}
          </span>
        ),
      },
      {
        id: 'estValue',
        label: 'Est. Value',
        defaultWidth: 96,
        sortable: true,
        sortValue: (player: Player) => calculatePlayerValue(player),
        render: (player: Player) => <span className="font-mono text-xs">{formatDollars(calculatePlayerValue(player))}</span>,
      },
      {
        id: 'list',
        label: 'List',
        defaultWidth: 90,
        sortable: true,
        sortValue: (player: Player) => (player.isRookie ? 1 : 0),
        render: (player: Player) => (
          <Badge variant={player.isRookie ? 'secondary' : 'default'}>
            {player.isRookie ? 'Rookie' : 'Senior'}
          </Badge>
        ),
      },
      {
        id: 'status',
        label: 'Status',
        defaultWidth: 120,
        sortable: true,
        sortValue: (player: Player) => {
          if (player.contract.yearsRemaining === 0) return 3
          const mv = calculatePlayerValue(player)
          if (player.contract.aav > mv * 1.15) return 2
          if (player.contract.aav < mv * 0.8) return 0
          return 1
        },
        render: (player: Player) => {
          const mv = calculatePlayerValue(player)
          const overpaid = player.contract.aav > mv * 1.15
          const underpaid = player.contract.aav < mv * 0.8
          return (
            player.contract.yearsRemaining === 0 ? (
              <Badge variant="destructive">Out of Contract</Badge>
            ) : overpaid ? (
              <Badge variant="outline" className="text-orange-500 border-orange-500/50">Overpaid</Badge>
            ) : underpaid ? (
              <Badge variant="outline" className="text-green-500 border-green-500/50">Underpaid</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Fair</Badge>
            )
          )
        },
      },
      {
        id: 'action',
        label: '',
        defaultWidth: 130,
        sortable: false,
        render: (player: Player) => (
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
              title="Contract projection"
              onClick={() => setProjectionPlayerId(player.id)}
            >
              <TrendingUp className="h-4 w-4" />
            </button>
            <ShortlistAssignMenu targetType="player" targetId={player.id} buttonLabel="List" buttonVariant="ghost" buttonSize="sm" />
          </div>
        ),
      },
    ]
    return cols
  }, [])

  const tableViewColumns = useMemo<TableViewColumnConfig[]>(
    () => tableColumns.map((col) => ({
      id: col.id,
      label: col.label || col.id,
      defaultWidth: col.defaultWidth,
      minWidth: 40,
      maxWidth: 300,
      sortable: col.sortable,
    })),
    [tableColumns],
  )
  const tableView = useTableViewManager({
    tableId: 'contracts-overview',
    columns: tableViewColumns,
    defaultSort: { columnId: 'aav', direction: 'desc' },
  })
  const visibleColumns = useMemo(() => {
    const hidden = new Set(tableView.snapshot.hiddenColumnIds)
    const byId = new Map(tableColumns.map((col) => [col.id, col] as const))
    return tableView.snapshot.columnOrder
      .filter((id) => !hidden.has(id))
      .map((id) => byId.get(id))
      .filter((col): col is (typeof tableColumns)[number] => Boolean(col))
  }, [tableView.snapshot.columnOrder, tableView.snapshot.hiddenColumnIds, tableColumns])
  const sortedPlayers = useMemo(() => {
    const sort = tableView.snapshot.sort
    if (!sort) return clubPlayers
    const col = tableColumns.find((c) => c.id === sort.columnId && c.sortable && c.sortValue)
    if (!col?.sortValue) return clubPlayers
    const sorted = [...clubPlayers].sort((a, b) => {
      const va = col.sortValue!(a)
      const vb = col.sortValue!(b)
      if (va === vb) return 0
      return va > vb ? 1 : -1
    })
    return sort.direction === 'desc' ? sorted.reverse() : sorted
  }, [clubPlayers, tableColumns, tableView.snapshot.sort])

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

      {/* Free Agency Deadline Countdown */}
      {freeAgencyCountdown && (
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
          freeAgencyCountdown.urgency === 'urgent'
            ? 'border-red-500/40 bg-red-500/10 text-red-600'
            : freeAgencyCountdown.urgency === 'warning'
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
            : 'border-border bg-muted/30 text-muted-foreground'
        }`}>
          <Clock className="h-4 w-4 flex-shrink-0" />
          <span>
            {freeAgencyCountdown.label}
            {' — '}
            {freeAgencyCountdown.days === 0
              ? 'today'
              : freeAgencyCountdown.days === 1
              ? 'tomorrow'
              : `in ${freeAgencyCountdown.days} days`}
          </span>
        </div>
      )}

      {/* Active Negotiations Panel */}
      <ActiveNegotiationsPanel />

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
              <p className="font-semibold">Negotiate Contract</p>
              <p className="text-xs text-muted-foreground">
                Start multi-round contract negotiations
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
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Squad Contracts</CardTitle>
            <TableViewManagerControl columns={tableViewColumns} manager={tableView} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.map((col) => (
                    <TableHead
                      key={col.id}
                      className="px-3"
                      style={{ width: tableView.snapshot.columnWidths[col.id] ?? col.defaultWidth }}
                      onClick={() => {
                        if (!col.sortable) return
                        const current = tableView.snapshot.sort
                        if (!current || current.columnId !== col.id) {
                          tableView.setSort(col.id, 'desc')
                          return
                        }
                        tableView.setSort(col.id, current.direction === 'desc' ? 'asc' : 'desc')
                      }}
                    >
                      {col.label || ''}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPlayers.map((player) => (
                  <TableRow key={player.id} className="text-sm">
                    {visibleColumns.map((col) => (
                      <TableCell
                        key={`${player.id}-${col.id}`}
                        className={
                          col.id === 'aav' || col.id === 'estValue' ? 'text-right'
                            : col.id === 'age' || col.id === 'years' || col.id === 'list' || col.id === 'status' || col.id === 'action'
                              ? 'text-center'
                              : 'text-left'
                        }
                        style={{ width: tableView.snapshot.columnWidths[col.id] ?? col.defaultWidth }}
                      >
                        {col.render(player)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ShortlistManager targetTypeFilter="player" title="Contract Targets Shortlists" />

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
                    {news.media?.reporterName && news.media?.outletName && (
                      <p className="text-[11px] text-muted-foreground/80">
                        Reported by {news.media.reporterName} ({news.media.outletName})
                      </p>
                    )}
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
      <NegotiationDialog open={offerOpen} onOpenChange={setOfferOpen} />
      <DelistDialog open={delistOpen} onOpenChange={setDelistOpen} />
      <RookieUpgradeDialog open={rookieOpen} onOpenChange={setRookieOpen} />
      <ContractProjectionPanel
        playerId={projectionPlayerId}
        open={projectionPlayerId !== null}
        onOpenChange={(open) => { if (!open) setProjectionPlayerId(null) }}
      />
    </div>
  )
}
