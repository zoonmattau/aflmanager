import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { GameSettings, NewsItem } from '@/types/game'
import type { LadderEntry } from '@/types/season'
import type { SeededRNG } from '@/engine/core/rng'
import { calculatePlayerValue } from '@/engine/contracts/negotiation'
import { processEndOfSeasonContracts } from '@/engine/contracts/freeAgency'
import { MINIMUM_SALARY } from '@/engine/core/constants'
import { validateContractOffer } from '@/engine/salary/salaryCapEngine'
import { resolveListConstraints, canAddToSeniorList } from '@/engine/rules/listRules'
import { getArchetypeFAWeights } from '@/engine/player/agentPersonality'
import { getClubState } from '@/engine/venues/venueEngine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FreeAgentListing {
  playerId: string
  playerName: string
  age: number
  position: string
  overall: number
  marketValue: number
  demandedAav: number
  demandedYears: number
  previousClubId: string
  isRestricted: boolean
  bids: ClubBid[]
  status: 'open' | 'signed' | 'unsigned'
  signedClubId?: string
}

export interface ClubBid {
  clubId: string
  aav: number
  years: number
  yearByYear: number[]
  preferenceScore: number
  isUserBid: boolean
}

export interface PreferenceWeights {
  money: number
  loyalty: number
  contender: number
  facilities: number
  role: number
  homeState: number
}

export interface CompensationPick {
  losingClubId: string
  gainingClubId: string
  playerId: string
  round: number
  year: number
}

export interface FreeAgencyMarketState {
  listings: FreeAgentListing[]
  compensationPicks: CompensationPick[]
  resolved: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHTS: PreferenceWeights = {
  money: 0.35,
  loyalty: 0.20,
  contender: 0.20,
  facilities: 0.10,
  role: 0.15,
  homeState: 0.0,
}

const ALL_ATTRIBUTE_KEYS: (keyof Player['attributes'])[] = [
  'kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap',
  'handballEfficiency', 'handballDistance', 'handballReceive',
  'markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested',
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
  'tackling', 'contested', 'clearance', 'hardness',
  'disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure',
  'goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct',
  'intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding',
  'hitouts', 'ruckCreative', 'followUp',
  'pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch',
  'centreBounce', 'boundaryThrowIn', 'stoppage',
]

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getOverall(player: Player): number {
  let total = 0
  for (const key of ALL_ATTRIBUTE_KEYS) {
    total += player.attributes[key]
  }
  return Math.round(total / ALL_ATTRIBUTE_KEYS.length)
}

function getPositionalCounts(
  players: Record<string, Player>,
  clubId: string,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of Object.values(players)) {
    if (p.clubId !== clubId) continue
    const group = p.position.primary
    counts[group] = (counts[group] ?? 0) + 1
  }
  return counts
}

function determineDemandedYears(player: Player): number {
  const { age, personality } = player
  if (age <= 23) return 4
  if (age <= 26) return 3
  if (age <= 29) return 2
  if (personality.loyalty >= 70 && personality.ambition < 50) return 2
  return 1
}

function contenderScore(ladder: LadderEntry[], clubId: string): number {
  const idx = ladder.findIndex((e) => e.clubId === clubId)
  if (idx === -1) return 0.5
  const totalTeams = ladder.length
  return 1.0 - idx / (totalTeams - 1)
}

function facilityScore(club: Club): number {
  const f = club.facilities
  const avg = (
    f.trainingGround + f.gym + f.medicalCentre +
    f.recoveryPool + f.analysisSuite + f.youthAcademy
  ) / 6
  return avg / 5
}

function roleScore(
  players: Record<string, Player>,
  clubId: string,
  position: string,
): number {
  const counts = getPositionalCounts(players, clubId)
  return (counts[position] ?? 0) < 4 ? 1.0 : 0.0
}

function generateId(prefix: string, rng: SeededRNG): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = `${prefix}_`
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)]
  }
  return id
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Build the free agent market: find all expired-contract players, create listings.
 */
export function buildFreeAgentMarket(
  players: Record<string, Player>,
  _clubs: Record<string, Club>,
  resignedPlayerIds: Set<string>,
  _currentYear: number,
): FreeAgencyMarketState {
  // Clone and process end-of-season contracts to identify expired
  const playersCopy: Record<string, Player> = {}
  for (const [id, p] of Object.entries(players)) {
    playersCopy[id] = {
      ...p,
      contract: { ...p.contract, yearByYear: [...p.contract.yearByYear] },
    }
  }
  const { expired } = processEndOfSeasonContracts(playersCopy)

  const listings: FreeAgentListing[] = []

  for (const player of expired) {
    if (resignedPlayerIds.has(player.id)) continue
    if (player.clubId === 'retired') continue

    const ovr = getOverall(player)
    if (ovr < 25) continue

    const marketValue = calculatePlayerValue(player)
    const demandedAav = Math.max(MINIMUM_SALARY, Math.round(marketValue * 1.1))

    listings.push({
      playerId: player.id,
      playerName: `${player.firstName} ${player.lastName}`,
      age: player.age,
      position: player.position.primary,
      overall: ovr,
      marketValue,
      demandedAav,
      demandedYears: determineDemandedYears(player),
      previousClubId: player.clubId,
      isRestricted: player.contract.isRestricted && player.age < 27,
      bids: [],
      status: 'open',
    })
  }

  // Also include players already in the unsigned pool (clubId === '', no contract)
  for (const player of Object.values(players)) {
    if (player.clubId !== '' || player.contract.yearsRemaining > 0) continue
    if (resignedPlayerIds.has(player.id)) continue

    const ovr = getOverall(player)
    if (ovr < 25) continue

    // Skip if already listed from expired contracts
    if (listings.some((l) => l.playerId === player.id)) continue

    const marketValue = calculatePlayerValue(player)
    const demandedAav = Math.max(MINIMUM_SALARY, Math.round(marketValue * 1.1))

    listings.push({
      playerId: player.id,
      playerName: `${player.firstName} ${player.lastName}`,
      age: player.age,
      position: player.position.primary,
      overall: ovr,
      marketValue,
      demandedAav,
      demandedYears: determineDemandedYears(player),
      previousClubId: '',
      isRestricted: false,
      bids: [],
      status: 'open',
    })
  }

  // Sort by overall descending
  listings.sort((a, b) => b.overall - a.overall)

  return {
    listings,
    compensationPicks: [],
    resolved: false,
  }
}

/**
 * AI clubs generate bids for each listing based on need/cap/window.
 */
export function generateAIBids(
  market: FreeAgencyMarketState,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  rng: SeededRNG,
  playerClubId: string,
  settings: GameSettings,
): FreeAgencyMarketState {
  const updatedListings = market.listings.map((listing) => {
    const updatedBids = [...listing.bids]
    const aiClubs = Object.values(clubs).filter((c) => c.id !== playerClubId)

    for (const club of aiClubs) {
      // Check cap space
      if (settings.salaryCap) {
        const allPlayersArray = Object.values(players)
        const capResult = validateContractOffer(
          allPlayersArray, club.id, listing.demandedAav, 0,
          settings.salaryCapAmount, settings.realism.softCapSpending,
        )
        if (!capResult.allowed) continue
      }

      // Check list space
      const constraints = resolveListConstraints(settings)
      if (!canAddToSeniorList(players, club.id, constraints)) continue

      // Evaluate interest
      const posCounts = getPositionalCounts(players, club.id)
      const hasPositionalNeed = (posCounts[listing.position] ?? 0) < 4

      let interest = 0.15
      if (hasPositionalNeed) interest += 0.25

      switch (club.aiPersonality.competitiveWindow) {
        case 'win-now':
          interest += listing.age >= 24 && listing.age <= 30 ? 0.2 : -0.1
          break
        case 'rebuilding':
          interest += listing.age <= 25 ? 0.2 : -0.15
          break
        case 'balanced':
          interest += 0.05
          break
      }

      // Loyalty bonus: previous club bids more often
      if (club.id === listing.previousClubId) interest += 0.2

      if (!rng.chance(Math.max(0.05, Math.min(0.9, interest)))) continue

      // Generate bid amount
      const bidMultiplier = 0.85 + rng.next() * 0.35
      const bidAav = Math.max(MINIMUM_SALARY, Math.round(listing.demandedAav * bidMultiplier))

      // Verify bid fits cap
      if (settings.salaryCap) {
        const allPlayersArray = Object.values(players)
        const bidCapResult = validateContractOffer(
          allPlayersArray, club.id, bidAav, 0,
          settings.salaryCapAmount, settings.realism.softCapSpending,
        )
        if (!bidCapResult.allowed) continue
      }

      // Determine years
      let years = listing.demandedYears
      if (club.aiPersonality.riskTolerance === 'conservative' && years > 2) {
        years = Math.max(1, years - 1)
      }

      // Build year-by-year
      const yearByYear: number[] = []
      for (let y = 0; y < years; y++) {
        yearByYear.push(Math.round(bidAav * (1 + y * 0.04)))
      }

      updatedBids.push({
        clubId: club.id,
        aav: bidAav,
        years,
        yearByYear,
        preferenceScore: 0,
        isUserBid: false,
      })
    }

    return { ...listing, bids: updatedBids }
  })

  return { ...market, listings: updatedListings }
}

/**
 * User submits a bid on a listing. Validates cap/list space.
 */
export function submitUserBid(
  market: FreeAgencyMarketState,
  playerId: string,
  aav: number,
  years: number,
  playerClubId: string,
  players: Record<string, Player>,
  settings: GameSettings,
): { success: boolean; error?: string; market: FreeAgencyMarketState } {
  const listingIdx = market.listings.findIndex((l) => l.playerId === playerId)
  if (listingIdx === -1) {
    return { success: false, error: 'Player not found in market', market }
  }

  const listing = market.listings[listingIdx]
  if (listing.status !== 'open') {
    return { success: false, error: 'This listing is no longer open', market }
  }

  // Check cap space
  if (settings.salaryCap) {
    const allPlayersArray = Object.values(players)
    const capResult = validateContractOffer(
      allPlayersArray, playerClubId, aav, 0,
      settings.salaryCapAmount, settings.realism.softCapSpending,
    )
    if (!capResult.allowed) {
      return { success: false, error: 'Insufficient salary cap space', market }
    }
  }

  // Check list space
  const constraints = resolveListConstraints(settings)
  if (!canAddToSeniorList(players, playerClubId, constraints)) {
    return { success: false, error: 'No room on the senior list', market }
  }

  // Validate salary minimum
  const clampedAav = Math.max(MINIMUM_SALARY, aav)
  const clampedYears = Math.max(1, Math.min(5, years))

  // Build year-by-year
  const yearByYear: number[] = []
  for (let y = 0; y < clampedYears; y++) {
    yearByYear.push(Math.round(clampedAav * (1 + y * 0.04)))
  }

  // Remove any existing user bid on this listing
  const filteredBids = listing.bids.filter((b) => !b.isUserBid)

  const userBid: ClubBid = {
    clubId: playerClubId,
    aav: clampedAav,
    years: clampedYears,
    yearByYear,
    preferenceScore: 0,
    isUserBid: true,
  }

  const updatedListings = [...market.listings]
  updatedListings[listingIdx] = {
    ...listing,
    bids: [...filteredBids, userBid],
  }

  return {
    success: true,
    market: { ...market, listings: updatedListings },
  }
}

/**
 * Remove user's bid from a listing.
 */
export function withdrawUserBid(
  market: FreeAgencyMarketState,
  playerId: string,
): FreeAgencyMarketState {
  const updatedListings = market.listings.map((listing) => {
    if (listing.playerId !== playerId) return listing
    return {
      ...listing,
      bids: listing.bids.filter((b) => !b.isUserBid),
    }
  })
  return { ...market, listings: updatedListings }
}

/**
 * Resolve the entire market: score all bids, assign signings, generate compensation picks.
 */
export function resolveMarket(
  market: FreeAgencyMarketState,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  ladder: LadderEntry[],
  rng: SeededRNG,
  currentYear: number,
): {
  market: FreeAgencyMarketState
  updatedPlayers: Record<string, Player>
  compensationPicks: CompensationPick[]
  news: NewsItem[]
} {
  // Clone players
  const updatedPlayers: Record<string, Player> = {}
  for (const [id, p] of Object.entries(players)) {
    updatedPlayers[id] = {
      ...p,
      contract: { ...p.contract, yearByYear: [...p.contract.yearByYear] },
    }
  }

  // Process end-of-season contracts on the clone so expired contracts are at 0
  processEndOfSeasonContracts(updatedPlayers)

  const compensationPicks: CompensationPick[] = []
  const news: NewsItem[] = []

  const resolvedListings = market.listings.map((listing) => {
    if (listing.bids.length === 0) {
      return { ...listing, status: 'unsigned' as const }
    }

    const player = updatedPlayers[listing.playerId]
    if (!player) return { ...listing, status: 'unsigned' as const }

    // Compute preference scores for all bids
    const weights: PreferenceWeights = { ...DEFAULT_WEIGHTS }

    // Personality modifiers
    if (player.personality.loyalty >= 60) weights.loyalty *= 2
    if (player.personality.ambition >= 70) weights.contender *= 2

    // Archetype-driven weight modifiers
    if (player.agentArchetype) {
      const archWeights = getArchetypeFAWeights(player.agentArchetype)
      if (archWeights.money !== undefined) weights.money *= archWeights.money
      if (archWeights.loyalty !== undefined) weights.loyalty *= archWeights.loyalty
      if (archWeights.contender !== undefined) weights.contender *= archWeights.contender
      if (archWeights.facilities !== undefined) weights.facilities *= archWeights.facilities
      if (archWeights.role !== undefined) weights.role *= archWeights.role
      if (archWeights.homeState !== undefined) weights.homeState *= archWeights.homeState
    }

    // Normalize weights after personality + archetype modifiers
    const totalWeight = weights.money + weights.loyalty + weights.contender + weights.facilities + weights.role + weights.homeState
    weights.money /= totalWeight
    weights.loyalty /= totalWeight
    weights.contender /= totalWeight
    weights.facilities /= totalWeight
    weights.role /= totalWeight
    weights.homeState /= totalWeight

    const scoredBids = listing.bids.map((bid) => {
      const club = clubs[bid.clubId]
      if (!club) return { ...bid, preferenceScore: 0 }

      const moneyScore = Math.min(1.5, bid.aav / listing.demandedAav) * weights.money
      const loyaltyBonus = (bid.clubId === listing.previousClubId ? 1.0 : 0.0) * weights.loyalty
      const contScore = contenderScore(ladder, bid.clubId) * weights.contender
      const facScore = facilityScore(club) * weights.facilities
      const rScore = roleScore(updatedPlayers, bid.clubId, listing.position) * weights.role
      const homeStateScore = (player.homeState && getClubState(bid.clubId) === player.homeState ? 1.0 : 0.0) * weights.homeState

      return {
        ...bid,
        preferenceScore: moneyScore + loyaltyBonus + contScore + facScore + rScore + homeStateScore,
      }
    })

    // Sort by preference score (desc), then by AAV (desc) for ties
    scoredBids.sort((a, b) =>
      b.preferenceScore - a.preferenceScore || b.aav - a.aav,
    )

    const winner = scoredBids[0]

    // Apply signing
    const yearByYear = [...winner.yearByYear]
    updatedPlayers[listing.playerId] = {
      ...updatedPlayers[listing.playerId],
      clubId: winner.clubId,
      contract: {
        yearsRemaining: winner.years,
        aav: winner.aav,
        yearByYear,
        isRestricted: false,
      },
      morale: Math.min(100, (updatedPlayers[listing.playerId].morale ?? 50) + 10),
    }

    // Compensation pick if player signs with a different club
    if (listing.previousClubId && listing.previousClubId !== '' && winner.clubId !== listing.previousClubId) {
      if (listing.overall >= 75) {
        compensationPicks.push({
          losingClubId: listing.previousClubId,
          gainingClubId: winner.clubId,
          playerId: listing.playerId,
          round: 2,
          year: currentYear + 1,
        })
      } else if (listing.overall >= 65) {
        compensationPicks.push({
          losingClubId: listing.previousClubId,
          gainingClubId: winner.clubId,
          playerId: listing.playerId,
          round: 3,
          year: currentYear + 1,
        })
      }
    }

    const clubName = clubs[winner.clubId]?.name ?? winner.clubId
    news.push({
      id: generateId('news', rng),
      date: `${currentYear}-11-01`,
      headline: `${listing.playerName} signs with ${clubName}`,
      body: `Free agent ${listing.playerName} has signed a ${winner.years}-year deal worth $${winner.aav.toLocaleString()} per year with ${clubName}. The ${listing.age}-year-old ${listing.position} was sought after by ${scoredBids.length} club${scoredBids.length !== 1 ? 's' : ''}.`,
      category: 'contract',
      clubIds: [winner.clubId, ...(listing.previousClubId && listing.previousClubId !== winner.clubId ? [listing.previousClubId] : [])],
      playerIds: [listing.playerId],
    })

    return {
      ...listing,
      bids: scoredBids,
      status: 'signed' as const,
      signedClubId: winner.clubId,
    }
  })

  // Generate compensation pick news
  for (const comp of compensationPicks) {
    const losingClub = clubs[comp.losingClubId]?.name ?? comp.losingClubId
    const player = updatedPlayers[comp.playerId]
    const playerName = player ? `${player.firstName} ${player.lastName}` : 'Unknown'
    news.push({
      id: generateId('news', rng),
      date: `${currentYear}-11-02`,
      headline: `${losingClub} awarded Round ${comp.round} compensation pick`,
      body: `${losingClub} have been awarded an end-of-round-${comp.round} compensation pick in the ${comp.year} draft after losing ${playerName} in free agency.`,
      category: 'draft',
      clubIds: [comp.losingClubId],
      playerIds: [comp.playerId],
    })
  }

  return {
    market: { listings: resolvedListings, compensationPicks, resolved: true },
    updatedPlayers,
    compensationPicks,
    news,
  }
}
