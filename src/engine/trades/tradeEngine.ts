import type { Player, PlayerPositionType } from '@/types/player'
import type { Club, DraftPick } from '@/types/club'
import type { SeededRNG } from '@/engine/core/rng'
import { calculatePlayerValue } from '@/engine/contracts/negotiation'

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface TradeProposal {
  id: string
  proposingClubId: string
  receivingClubId: string
  playersOffered: string[]      // player IDs from proposing club
  playersRequested: string[]    // player IDs from receiving club
  picksOffered: DraftPick[]
  picksRequested: DraftPick[]
  salaryRetained: number        // $ amount proposing club retains from traded player salary
  status: 'pending' | 'accepted' | 'rejected' | 'countered'
  message: string
}

export interface TradeResult {
  accepted: boolean
  message: string
  counterProposal: TradeProposal | null
}

export interface CompletedTrade {
  id: string
  date: string
  clubA: string
  clubB: string
  playersToA: string[]
  playersToB: string[]
  picksToA: DraftPick[]
  picksToB: DraftPick[]
  salaryRetainedByA: number
  salaryRetainedByB: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** All position types used in the game. */
const ALL_POSITIONS: PlayerPositionType[] = [
  'BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF',
]

/**
 * Calculates the trade value of a single draft pick in dollars.
 *
 * Round 1 picks are valued $500k-$800k, scaled by pick position so that
 * earlier picks (lower numbers) are worth more. Round 2 picks range
 * $200k-$400k. Round 3+ picks range $80k-$150k.
 *
 * Future-year picks are discounted to 80% of their current-year value.
 */
function pickValue(pick: DraftPick, currentYear: number = new Date().getFullYear()): number {
  const isFuture = pick.year > currentYear
  const futureDiscount = isFuture ? 0.80 : 1.0

  // pickNumber may not be set yet — default to mid-round position
  const position = pick.pickNumber ?? (pick.round === 1 ? 10 : pick.round === 2 ? 28 : 46)

  let value: number
  if (pick.round === 1) {
    // Round 1: 18 picks, pick 1 = $800k, pick 18 = $500k, linearly interpolated
    const maxPicks = 18
    const t = Math.min(1, Math.max(0, (position - 1) / (maxPicks - 1)))
    value = 800_000 - t * 300_000
  } else if (pick.round === 2) {
    // Round 2: pick 19-36, $400k down to $200k
    const maxPicks = 18
    const roundPosition = pick.pickNumber != null ? position - 18 : 9
    const t = Math.min(1, Math.max(0, (roundPosition - 1) / (maxPicks - 1)))
    value = 400_000 - t * 200_000
  } else {
    // Round 3+: $150k down to $80k
    const maxPicks = 18
    const roundPosition = pick.pickNumber != null ? position - 36 : 9
    const t = Math.min(1, Math.max(0, (roundPosition - 1) / (maxPicks - 1)))
    value = 150_000 - t * 70_000
  }

  return value * futureDiscount
}

/**
 * Returns a set of position groups where a club is thin on talent.
 * A club "needs" a position if it has fewer than 3 players listed there
 * as their primary position.
 */
function getPositionalNeeds(
  clubId: string,
  players: Record<string, Player>,
): Set<PlayerPositionType> {
  const counts = new Map<PlayerPositionType, number>()
  for (const pos of ALL_POSITIONS) {
    counts.set(pos, 0)
  }

  for (const player of Object.values(players)) {
    if (player.clubId === clubId) {
      const current = counts.get(player.position.primary) ?? 0
      counts.set(player.position.primary, current + 1)
    }
  }

  const needs = new Set<PlayerPositionType>()
  for (const [pos, count] of counts) {
    if (count < 3) {
      needs.add(pos)
    }
  }
  return needs
}

/**
 * Generates a simple unique ID for a trade or proposal.
 */
function generateId(rng: SeededRNG): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = 'trade_'
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)]
  }
  return id
}

/**
 * Returns the current year from the system clock. Used as the baseline for
 * determining whether a draft pick is a future pick.
 */
function currentYear(): number {
  return new Date().getFullYear()
}

// ---------------------------------------------------------------------------
// 1. calculateTradeValue
// ---------------------------------------------------------------------------

/**
 * Calculates the total trade value of a package of players and draft picks.
 *
 * Player values are derived from `calculatePlayerValue` (salary-based market
 * valuation). Pick values use a tiered scale by round and position.
 */
export function calculateTradeValue(
  playerIds: string[],
  picks: DraftPick[],
  players: Record<string, Player>,
): number {
  let total = 0

  for (const id of playerIds) {
    const player = players[id]
    if (player) {
      total += calculatePlayerValue(player)
    }
  }

  const year = currentYear()
  for (const pick of picks) {
    total += pickValue(pick, year)
  }

  return total
}

// ---------------------------------------------------------------------------
// 2. validateTradeProposal
// ---------------------------------------------------------------------------

/**
 * Validates a trade proposal to ensure all structural requirements are met:
 * - Players belong to the correct clubs
 * - At least one asset exists on each side of the trade
 */
export function validateTradeProposal(
  proposal: TradeProposal,
  players: Record<string, Player>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check that at least one asset is on each side
  const offeredAssets = proposal.playersOffered.length + proposal.picksOffered.length
  const requestedAssets = proposal.playersRequested.length + proposal.picksRequested.length

  if (offeredAssets === 0) {
    errors.push('Trade must include at least one player or pick offered by the proposing club.')
  }
  if (requestedAssets === 0) {
    errors.push('Trade must include at least one player or pick requested from the receiving club.')
  }

  // Check that offered players belong to the proposing club
  for (const playerId of proposal.playersOffered) {
    const player = players[playerId]
    if (!player) {
      errors.push(`Offered player ${playerId} does not exist.`)
    } else if (player.clubId !== proposal.proposingClubId) {
      errors.push(
        `${player.firstName} ${player.lastName} does not belong to the proposing club.`,
      )
    }
  }

  // Check that requested players belong to the receiving club
  for (const playerId of proposal.playersRequested) {
    const player = players[playerId]
    if (!player) {
      errors.push(`Requested player ${playerId} does not exist.`)
    } else if (player.clubId !== proposal.receivingClubId) {
      errors.push(
        `${player.firstName} ${player.lastName} does not belong to the receiving club.`,
      )
    }
  }

  return { valid: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// 3. evaluateTradeProposal
// ---------------------------------------------------------------------------

/**
 * AI evaluation of a trade proposal from the receiving club's perspective.
 *
 * The decision accounts for:
 * - Raw value difference between the two packages
 * - Positional needs — bonus value for players at positions the club lacks
 * - Competitive window — win-now clubs prefer proven veterans; rebuilding
 *   clubs prefer picks and young talent
 * - Trade activity personality — active clubs accept smaller surpluses;
 *   passive clubs require larger margins
 * - Contract burden — large/long contracts reduce a player's trade value
 *
 * If the proposal is rejected but the gap is within 25%, a counter-proposal
 * is generated.
 */
export function evaluateTradeProposal(
  proposal: TradeProposal,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  rng: SeededRNG,
  options?: { salaryDumpTradesEnabled?: boolean },
): TradeResult {
  const receivingClub = clubs[proposal.receivingClubId]
  if (!receivingClub) {
    return {
      accepted: false,
      message: 'Receiving club does not exist.',
      counterProposal: null,
    }
  }

  const personality = receivingClub.aiPersonality
  const positionalNeeds = getPositionalNeeds(proposal.receivingClubId, players)

  // --- Raw package values ---
  const offeredValue = calculateTradeValue(
    proposal.playersOffered,
    proposal.picksOffered,
    players,
  )
  const requestedValue = calculateTradeValue(
    proposal.playersRequested,
    proposal.picksRequested,
    players,
  )

  // --- Positional need bonus ---
  // If the offered players fill a positional hole, they're worth more to
  // the receiving club.
  let positionalBonus = 0
  for (const playerId of proposal.playersOffered) {
    const player = players[playerId]
    if (player && positionalNeeds.has(player.position.primary)) {
      positionalBonus += calculatePlayerValue(player) * 0.15
    }
  }

  // --- Competitive window modifier ---
  // Win-now clubs inflate the value of proven (older, higher-rated) players
  // and discount picks/youth. Rebuilding clubs do the opposite.
  let windowModifier = 0
  if (personality.competitiveWindow === 'win-now') {
    // Bonus for experienced offered players
    for (const playerId of proposal.playersOffered) {
      const player = players[playerId]
      if (player && player.age >= 25 && !player.isRookie) {
        windowModifier += calculatePlayerValue(player) * 0.10
      }
    }
    // Penalty for giving up experienced players
    for (const playerId of proposal.playersRequested) {
      const player = players[playerId]
      if (player && player.age >= 25 && !player.isRookie) {
        windowModifier -= calculatePlayerValue(player) * 0.10
      }
    }
    // Win-now clubs discount draft picks they'd be receiving
    for (const pick of proposal.picksOffered) {
      windowModifier -= pickValue(pick, currentYear()) * 0.15
    }
  } else if (personality.competitiveWindow === 'rebuilding') {
    // Bonus for picks and young players being offered
    for (const pick of proposal.picksOffered) {
      windowModifier += pickValue(pick, currentYear()) * 0.15
    }
    for (const playerId of proposal.playersOffered) {
      const player = players[playerId]
      if (player && player.age <= 23) {
        windowModifier += calculatePlayerValue(player) * 0.12
      }
    }
    // Penalty for giving up young players
    for (const playerId of proposal.playersRequested) {
      const player = players[playerId]
      if (player && player.age <= 23) {
        windowModifier -= calculatePlayerValue(player) * 0.12
      }
    }
  }

  // --- Contract burden discount ---
  // Players on large or long contracts are worth less in trade because the
  // receiving club inherits the salary obligation.
  // When salaryDumpTrades is disabled, contract burden is ignored.
  const salaryDumpEnabled = options?.salaryDumpTradesEnabled !== false
  let contractDiscount = 0
  for (const playerId of proposal.playersOffered) {
    const player = players[playerId]
    if (!player) continue
    const { yearsRemaining, aav } = player.contract
    // Penalty for contracts longer than 3 years
    if (salaryDumpEnabled && yearsRemaining > 3) {
      contractDiscount -= aav * (yearsRemaining - 3) * 0.05
    }
    // Penalty for high-AAV players (over $700k)
    if (salaryDumpEnabled && aav > 700_000) {
      contractDiscount -= (aav - 700_000) * 0.10
    }
  }
  // Inverse: getting rid of a burdensome contract is a benefit to the
  // receiving club
  for (const playerId of proposal.playersRequested) {
    const player = players[playerId]
    if (!player) continue
    const { yearsRemaining, aav } = player.contract
    if (salaryDumpEnabled && yearsRemaining > 3) {
      contractDiscount += aav * (yearsRemaining - 3) * 0.05
    }
    if (salaryDumpEnabled && aav > 700_000) {
      contractDiscount += (aav - 700_000) * 0.10
    }
  }

  // --- Salary retention bonus ---
  // If the proposing club is retaining salary, the deal is sweeter for
  // the receiving club. When salaryDumpTrades is disabled, retention is ignored.
  const retentionBonus = salaryDumpEnabled ? proposal.salaryRetained * 0.5 : 0

  // --- Trade activity threshold ---
  // Passive clubs require a bigger surplus; active clubs accept smaller ones.
  let activityMultiplier: number
  switch (personality.tradeActivity) {
    case 'active':
      activityMultiplier = 0.90
      break
    case 'moderate':
      activityMultiplier = 1.00
      break
    case 'passive':
      activityMultiplier = 1.15
      break
  }

  // --- Risk tolerance jitter ---
  // Aggressive clubs add a small random bonus; conservative clubs subtract.
  let riskJitter = 0
  switch (personality.riskTolerance) {
    case 'aggressive':
      riskJitter = rng.nextFloat(0, offeredValue * 0.05)
      break
    case 'moderate':
      riskJitter = 0
      break
    case 'conservative':
      riskJitter = -rng.nextFloat(0, offeredValue * 0.05)
      break
  }

  // --- Final evaluation ---
  const adjustedOfferedValue =
    offeredValue + positionalBonus + windowModifier + contractDiscount + retentionBonus + riskJitter
  const adjustedRequestedValue = requestedValue * activityMultiplier

  const valueDifference = adjustedOfferedValue - adjustedRequestedValue
  const differenceRatio = requestedValue > 0 ? valueDifference / requestedValue : 0

  // Must be within 15% to even consider
  if (differenceRatio < -0.15) {
    // Way too lopsided — check if within 25% for a counter
    if (differenceRatio >= -0.25) {
      const counter = generateCounterProposal(proposal, players, clubs, rng, differenceRatio)
      return {
        accepted: false,
        message: `${receivingClub.name} feel the offer undervalues their assets, but are open to further discussion.`,
        counterProposal: counter,
      }
    }
    return {
      accepted: false,
      message: `${receivingClub.name} have rejected the trade. The offer does not come close to matching the value of their players.`,
      counterProposal: null,
    }
  }

  // Positive net value → accept
  if (valueDifference >= 0) {
    return {
      accepted: true,
      message: `${receivingClub.name} have agreed to the trade.`,
      counterProposal: null,
    }
  }

  // Negative but within 15% — borderline. Chance-based acceptance with
  // probability proportional to how close the gap is.
  const acceptChance = 1.0 - Math.abs(differenceRatio) / 0.15
  if (rng.chance(acceptChance * 0.6)) {
    return {
      accepted: true,
      message: `${receivingClub.name} have accepted the trade after deliberation.`,
      counterProposal: null,
    }
  }

  // Rejected but close — generate counter
  const counter = generateCounterProposal(proposal, players, clubs, rng, differenceRatio)
  return {
    accepted: false,
    message: `${receivingClub.name} have rejected the current offer but have made a counter-proposal.`,
    counterProposal: counter,
  }
}

// ---------------------------------------------------------------------------
// Counter-proposal generation (internal)
// ---------------------------------------------------------------------------

/**
 * Generates a counter-proposal by adjusting the original proposal to be more
 * favourable to the receiving club. The counter asks for additional picks
 * from the proposing club to close the value gap.
 */
function generateCounterProposal(
  original: TradeProposal,
  _players: Record<string, Player>,
  clubs: Record<string, Club>,
  rng: SeededRNG,
  _differenceRatio: number,
): TradeProposal {
  // Start with the same structure but request an additional pick or remove
  // an offered pick to close the gap.
  const counter: TradeProposal = {
    id: generateId(rng),
    proposingClubId: original.receivingClubId,
    receivingClubId: original.proposingClubId,
    // Reverse: what was requested is now offered, and vice-versa
    playersOffered: [...original.playersRequested],
    playersRequested: [...original.playersOffered],
    picksOffered: [...original.picksRequested],
    picksRequested: [...original.picksOffered],
    salaryRetained: 0,
    status: 'pending',
    message: '',
  }

  // Try to add a pick request to close the value gap.
  // Look for a pick the original proposing club owns that isn't already in
  // the deal.
  const proposingClub = clubs[original.proposingClubId]
  if (proposingClub) {
    const existingPickIds = new Set(
      counter.picksRequested.map(
        (p) => `${p.year}-${p.round}-${p.originalClubId}`,
      ),
    )
    const availablePicks = proposingClub.draftPicks.filter(
      (p) => !existingPickIds.has(`${p.year}-${p.round}-${p.originalClubId}`),
    )
    if (availablePicks.length > 0) {
      // Pick the lowest-value available pick (so the counter is reasonable)
      const sorted = [...availablePicks].sort(
        (a, b) => pickValue(a, currentYear()) - pickValue(b, currentYear()),
      )
      counter.picksRequested.push(sorted[0])
    }
  }

  counter.message = 'Counter-proposal: we would need additional draft capital to make this work.'
  return counter
}

// ---------------------------------------------------------------------------
// 4. executeTrade
// ---------------------------------------------------------------------------

/**
 * Executes an accepted trade proposal by swapping player club assignments
 * and returning the updated players record alongside a CompletedTrade log
 * entry.
 *
 * This function does NOT validate the proposal — call `validateTradeProposal`
 * and `evaluateTradeProposal` first.
 */
export function executeTrade(
  proposal: TradeProposal,
  players: Record<string, Player>,
): { updatedPlayers: Record<string, Player>; completedTrade: CompletedTrade } {
  // Deep-clone players so we don't mutate the input
  const updatedPlayers: Record<string, Player> = {}
  for (const [id, player] of Object.entries(players)) {
    updatedPlayers[id] = { ...player }
  }

  // Move offered players (proposing club → receiving club)
  for (const playerId of proposal.playersOffered) {
    if (updatedPlayers[playerId]) {
      updatedPlayers[playerId] = {
        ...updatedPlayers[playerId],
        clubId: proposal.receivingClubId,
      }
    }
  }

  // Move requested players (receiving club → proposing club)
  for (const playerId of proposal.playersRequested) {
    if (updatedPlayers[playerId]) {
      updatedPlayers[playerId] = {
        ...updatedPlayers[playerId],
        clubId: proposal.proposingClubId,
      }
    }
  }

  const completedTrade: CompletedTrade = {
    id: proposal.id,
    date: new Date().toISOString().split('T')[0],
    clubA: proposal.proposingClubId,
    clubB: proposal.receivingClubId,
    playersToA: [...proposal.playersRequested],
    playersToB: [...proposal.playersOffered],
    picksToA: [...proposal.picksRequested],
    picksToB: [...proposal.picksOffered],
    salaryRetainedByA: proposal.salaryRetained,
    salaryRetainedByB: 0,
  }

  return { updatedPlayers, completedTrade }
}

// ---------------------------------------------------------------------------
// 5. generateTradeRumour
// ---------------------------------------------------------------------------

/**
 * Generates a random trade rumour for the in-game news feed.
 *
 * Candidates are players who are either unhappy (morale < 50) or on an
 * expiring contract (1 year remaining). The function pairs the candidate
 * with a club that has a positional need matching the player's primary
 * position.
 *
 * Returns `null` if no suitable rumour candidates exist.
 */
export function generateTradeRumour(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  rng: SeededRNG,
  options?: { tradeRequestsEnabled?: boolean },
): { headline: string; body: string; playerIds: string[]; clubIds: string[] } | null {
  const allPlayers = Object.values(players)
  const tradeRequestsEnabled = options?.tradeRequestsEnabled !== false

  // Find candidates: unhappy or expiring contract
  // When tradeRequests is disabled, only contract-expiry rumours are generated
  const candidates = allPlayers.filter(
    (p) => tradeRequestsEnabled ? (p.morale < 50 || p.contract.yearsRemaining <= 1) : p.contract.yearsRemaining <= 1,
  )

  if (candidates.length === 0) {
    return null
  }

  const player = rng.pick(candidates)
  const playerClub = clubs[player.clubId]

  // Find clubs with a positional need matching this player (excluding
  // the player's current club)
  const otherClubs = Object.values(clubs).filter((c) => c.id !== player.clubId)
  const matchingClubs = otherClubs.filter((club) => {
    const needs = getPositionalNeeds(club.id, players)
    return needs.has(player.position.primary)
  })

  // If no clubs have the positional need, pick a random other club
  const linkedClub =
    matchingClubs.length > 0 ? rng.pick(matchingClubs) : rng.pick(otherClubs)

  if (!linkedClub) {
    return null
  }

  // Build the rumour text
  const playerName = `${player.firstName} ${player.lastName}`
  const currentClubName = playerClub?.name ?? 'his club'

  const isUnhappy = player.morale < 50
  const isExpiring = player.contract.yearsRemaining <= 1

  let headline: string
  let body: string

  if (isUnhappy && isExpiring) {
    headline = `${playerName} eyeing exit from ${currentClubName}`
    body = `Sources close to ${playerName} suggest the disgruntled ${currentClubName} ` +
      `${player.position.primary} is unlikely to re-sign with the club when his ` +
      `contract expires at the end of the season. ${linkedClub.name} are believed ` +
      `to be monitoring the situation closely, with the ${player.age}-year-old ` +
      `seen as a key target.`
  } else if (isUnhappy) {
    headline = `${playerName} reportedly unsettled at ${currentClubName}`
    body = `${playerName} is said to be unhappy at ${currentClubName}, with ` +
      `speculation mounting about a potential trade request. ${linkedClub.name} ` +
      `have been linked to the ${player.age}-year-old ${player.position.primary}, ` +
      `who could be available during the trade period.`
  } else {
    headline = `${linkedClub.name} circling ${currentClubName}'s ${playerName}`
    body = `With ${playerName}'s contract at ${currentClubName} set to expire, ` +
      `${linkedClub.name} are understood to have expressed interest in the ` +
      `${player.age}-year-old ${player.position.primary}. The club could look ` +
      `to secure a trade rather than risk losing him for nothing in free agency.`
  }

  return {
    headline,
    body,
    playerIds: [player.id],
    clubIds: [player.clubId, linkedClub.id],
  }
}
