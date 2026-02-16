import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  getPlayerStarRating,
  getStarRating,
  getPlayerTier,
  type PlayerTier,
} from '@/engine/player/playerRating'
import { POSITION_LINE } from '@/engine/core/constants'
import { isPlayerEligibleForPositionLine } from '@/engine/player/positionEligibility'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  ExternalLink,
  UserPlus,
  Gavel,
  AlertTriangle as AlertTriangleIcon,
  Trophy,
  XCircle,
} from 'lucide-react'
import type { FreeAgentListing } from '@/engine/contracts/freeAgencyMarket'
import type { Player } from '@/types/player'

// ---------------------------------------------------------------------------
// Shared helpers (matching OffseasonPage patterns)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Bid Form
// ---------------------------------------------------------------------------

function BidForm({
  listing,
  onSubmit,
  onWithdraw,
  hasUserBid,
}: {
  listing: FreeAgentListing
  onSubmit: (aav: number, years: number) => void
  onWithdraw: () => void
  hasUserBid: boolean
}) {
  const [aav, setAav] = useState(listing.demandedAav)
  const [years, setYears] = useState(listing.demandedYears)

  return (
    <div className="flex items-center gap-3 mt-2">
      {hasUserBid ? (
        <Button
          variant="outline"
          size="sm"
          className="text-red-400 border-red-500/30 hover:bg-red-500/10 h-7 text-xs"
          onClick={onWithdraw}
        >
          <XCircle className="mr-1 h-3 w-3" />
          Withdraw Bid
        </Button>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-muted-foreground">AAV $</label>
            <input
              type="number"
              value={aav}
              onChange={(e) => setAav(Number(e.target.value))}
              className="h-7 w-28 rounded-md border border-border bg-background px-2 text-xs font-mono"
              min={110000}
              step={10000}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-muted-foreground">Years</label>
            <input
              type="number"
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              className="h-7 w-14 rounded-md border border-border bg-background px-2 text-xs font-mono"
              min={1}
              max={5}
            />
          </div>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => onSubmit(aav, years)}
          >
            <UserPlus className="mr-1 h-3 w-3" />
            Place Bid
          </Button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Listing Row
// ---------------------------------------------------------------------------

function ListingRow({
  listing,
  player,
  clubs,
  onBid,
  onWithdraw,
  isResolved,
}: {
  listing: FreeAgentListing
  player: Player | undefined
  clubs: Record<string, { name: string; abbreviation: string; colors: { primary: string } }>
  onBid: (playerId: string, aav: number, years: number) => void
  onWithdraw: (playerId: string) => void
  isResolved: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const tier = getPlayerTier(listing.overall)
  const stars = player ? getPlayerStarRating(player, listing.overall) : getStarRating(listing.overall)
  const line = POSITION_LINE[listing.position as keyof typeof POSITION_LINE] ?? ''
  const previousClub = listing.previousClubId ? clubs[listing.previousClubId] : null
  const hasUserBid = listing.bids.some((b) => b.isUserBid)
  const signedClub = listing.signedClubId ? clubs[listing.signedClubId] : null

  return (
    <div className={cn('py-2.5 pr-1', tierBorder(tier))}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">
                {listing.playerName}
              </p>
              <PlayerStarRating stars={stars} className="scale-[0.85] origin-left" />
              <span className={cn('text-xs font-semibold tabular-nums', tierColor(tier))}>
                {listing.overall}
              </span>
              {listing.status === 'signed' && signedClub && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-400 border-green-500/30">
                  Signed: {signedClub.abbreviation}
                </Badge>
              )}
              {listing.status === 'unsigned' && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-muted-foreground/30">
                  Unsigned
                </Badge>
              )}
              {hasUserBid && !isResolved && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary border-primary/30">
                  Your Bid
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                {listing.position}
              </Badge>
              <span className="text-muted-foreground/60">{line}</span>
              <span>&middot;</span>
              <span>Age {listing.age}</span>
              {previousClub && (
                <>
                  <span>&middot;</span>
                  <span className="flex items-center gap-1">
                    <div
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: previousClub.colors.primary }}
                    />
                    {previousClub.abbreviation}
                  </span>
                </>
              )}
              <span>&middot;</span>
              <span className="font-mono text-amber-400">
                ${(listing.demandedAav / 1000).toFixed(0)}k × {listing.demandedYears}yr
              </span>
              <span>&middot;</span>
              <span>{listing.bids.length} bid{listing.bids.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 ml-2 space-y-3">
          {/* Bids table */}
          {listing.bids.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Bids ({listing.bids.length})
              </p>
              <div className="divide-y divide-border/30">
                {[...listing.bids]
                  .sort((a, b) => (isResolved ? b.preferenceScore - a.preferenceScore : b.aav - a.aav))
                  .map((bid, i) => {
                    const bidClub = clubs[bid.clubId]
                    const isWinner = isResolved && i === 0 && listing.status === 'signed'
                    return (
                      <div
                        key={`${bid.clubId}-${i}`}
                        className={cn(
                          'flex items-center justify-between py-1.5 text-xs',
                          bid.isUserBid && 'bg-primary/5 px-2 -mx-2 rounded',
                          isWinner && 'bg-green-500/5 px-2 -mx-2 rounded',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {isWinner && <Trophy className="h-3 w-3 text-green-400" />}
                          <div
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: bidClub?.colors.primary ?? '#666' }}
                          />
                          <span className={cn('font-medium', bid.isUserBid && 'text-primary')}>
                            {bid.isUserBid ? 'Your Bid' : (bidClub?.abbreviation ?? bid.clubId)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-muted-foreground">
                          <span>${(bid.aav / 1000).toFixed(0)}k × {bid.years}yr</span>
                          {isResolved && (
                            <span className="text-amber-400">{bid.preferenceScore.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No bids placed yet.</p>
          )}

          {/* Bid form */}
          {!isResolved && listing.status === 'open' && (
            <BidForm
              listing={listing}
              onSubmit={(aav, years) => onBid(listing.playerId, aav, years)}
              onWithdraw={() => onWithdraw(listing.playerId)}
              hasUserBid={hasUserBid}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function FreeAgencyMarketPanel() {
  const navigate = useNavigate()
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const offseasonState = useGameStore((s) => s.offseasonState)
  const submitBid = useGameStore((s) => s.submitFreeAgencyBidAction)
  const withdrawBid = useGameStore((s) => s.withdrawFreeAgencyBidAction)
  const resolveAction = useGameStore((s) => s.resolveFreeAgencyMarketAction)

  const market = offseasonState?.freeAgencyMarket
  const isResolved = market?.resolved ?? false

  const [posFilter, setPosFilter] = useState<string>('')
  const [bidError, setBidError] = useState<string | null>(null)
  const [bidSuccess, setBidSuccess] = useState<string | null>(null)

  const filteredListings = useMemo(() => {
    if (!market) return []
    return market.listings
      .filter((l) => {
        if (posFilter === '') return true
        const player = players[l.playerId]
        if (player) {
          return isPlayerEligibleForPositionLine(player, posFilter as 'DEF' | 'MID' | 'FWD' | 'RK')
        }
        return POSITION_LINE[l.position as keyof typeof POSITION_LINE] === posFilter
      })
      .sort((a, b) => b.overall - a.overall)
  }, [market, posFilter, players])

  const handleBid = useCallback((playerId: string, aav: number, years: number) => {
    const result = submitBid(playerId, aav, years)
    if (result.success) {
      setBidError(null)
      setBidSuccess('Bid placed successfully!')
      setTimeout(() => setBidSuccess(null), 3000)
    } else {
      setBidError(result.error ?? 'Failed to place bid')
      setBidSuccess(null)
    }
  }, [submitBid])

  const handleWithdraw = useCallback((playerId: string) => {
    withdrawBid(playerId)
    setBidError(null)
  }, [withdrawBid])

  const handleResolve = useCallback(() => {
    resolveAction()
    setBidError(null)
    setBidSuccess(null)
  }, [resolveAction])

  // Summary stats
  const totalListings = market?.listings.length ?? 0
  const signedCount = market?.listings.filter((l) => l.status === 'signed').length ?? 0
  const userBidCount = market?.listings.filter((l) => l.bids.some((b) => b.isUserBid)).length ?? 0
  const compensationCount = market?.compensationPicks.length ?? 0

  if (!market) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">
          The free agency market is being prepared...
        </p>
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <FileText className="h-8 w-8 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Contract Management</p>
            <p className="text-sm text-muted-foreground">
              Re-sign players before free agency opens.
            </p>
          </div>
          <Button onClick={() => navigate('/contracts')} className="flex-shrink-0">
            Go to Contracts
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            {isResolved
              ? 'Free agency has been resolved. Review the signings below.'
              : 'Review listings, place bids, then resolve the market to finalize signings.'}
          </p>
        </div>
        <Button onClick={() => navigate('/contracts')} variant="outline" size="sm" className="h-7 text-xs">
          Contracts <ExternalLink className="ml-1 h-3 w-3" />
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
          <div className="text-lg font-bold text-primary">{totalListings}</div>
          <div className="text-[10px] text-muted-foreground">Free Agents</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
          <div className="text-lg font-bold text-amber-400">{userBidCount}</div>
          <div className="text-[10px] text-muted-foreground">Your Bids</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
          <div className="text-lg font-bold text-green-400">{signedCount}</div>
          <div className="text-[10px] text-muted-foreground">Signed</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
          <div className="text-lg font-bold text-purple-400">{compensationCount}</div>
          <div className="text-[10px] text-muted-foreground">Comp. Picks</div>
        </div>
      </div>

      {/* Resolve button */}
      {!isResolved && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <Gavel className="h-6 w-6 text-primary flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm">Resolve Market</p>
            <p className="text-xs text-muted-foreground">
              Finalize all signings based on preference scoring. You can also advance the phase to auto-resolve.
            </p>
          </div>
          <Button onClick={handleResolve} size="sm">
            Resolve
          </Button>
        </div>
      )}

      {/* Compensation picks display */}
      {isResolved && market.compensationPicks.length > 0 && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
          <p className="text-xs font-medium text-purple-400 uppercase tracking-wide mb-2">
            Compensation Picks Awarded
          </p>
          <div className="space-y-1">
            {market.compensationPicks.map((comp, i) => {
              const losingClub = clubs[comp.losingClubId]
              const player = players[comp.playerId]
              return (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span>
                    <span className="font-medium">{losingClub?.abbreviation ?? comp.losingClubId}</span>
                    <span className="text-muted-foreground"> — lost </span>
                    <span className="font-medium">{player ? `${player.firstName} ${player.lastName}` : 'Unknown'}</span>
                  </span>
                  <Badge variant="outline" className="text-purple-400 border-purple-500/30 text-[10px] font-mono">
                    Round {comp.round} ({comp.year})
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Error / Success */}
      {bidError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
          <AlertTriangleIcon className="h-3 w-3 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-400">{bidError}</p>
        </div>
      )}
      {bidSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-2">
          <CheckCircle2 className="h-3 w-3 text-green-400 flex-shrink-0" />
          <p className="text-xs text-green-400">{bidSuccess}</p>
        </div>
      )}

      {/* Position filters */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Listings ({filteredListings.length})
        </div>
        <div className="flex gap-1">
          {['', 'DEF', 'MID', 'FWD', 'RK'].map((pos) => (
            <Button
              key={pos || 'all'}
              variant={posFilter === pos ? 'default' : 'outline'}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setPosFilter(pos)}
            >
              {pos || 'All'}
            </Button>
          ))}
        </div>
      </div>

      {/* Listings */}
      {filteredListings.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No free agents available.
        </p>
      ) : (
        <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
          {filteredListings.map((listing) => (
          <ListingRow
            key={listing.playerId}
            listing={listing}
            player={players[listing.playerId]}
            clubs={clubs}
            onBid={handleBid}
            onWithdraw={handleWithdraw}
            isResolved={isResolved}
          />
          ))}
        </div>
      )}
    </div>
  )
}
