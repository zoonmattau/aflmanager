import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { SeededRNG } from '@/engine/core/rng'
import type { ListConstraints } from '@/engine/rules/listRules'
import { calculatePlayerValue } from '@/engine/contracts/negotiation'
import { MINIMUM_SALARY, SENIOR_LIST_SIZE } from '@/engine/core/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FreeAgent {
  player: Player
  type: 'restricted' | 'unrestricted'
  demandedAav: number
  demandedYears: number
  interestedClubs: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Gather all players belonging to a specific club.
 */
function getClubPlayers(
  players: Record<string, Player>,
  clubId: string,
): Player[] {
  return Object.values(players).filter((p) => p.clubId === clubId)
}

/**
 * Determine the number of contract years a free agent will demand based on
 * their age and personality. Younger players seek longer deals; ambitious
 * players at contending-age may accept shorter "prove it" deals.
 */
function determineDemandedYears(player: Player): number {
  const { age, personality } = player

  if (age <= 23) return 4
  if (age <= 26) return 3
  if (age <= 29) return 2

  // Older players – 1-year deals unless very loyal / low ambition
  if (personality.loyalty >= 70 && personality.ambition < 50) return 2
  return 1
}

/**
 * Compute the position-group counts for a club's current roster.
 * Returns a map of PositionGroup -> number of players whose primary
 * position falls in that group.
 */
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

/**
 * Heuristically determine if a club has a positional need that the free
 * agent could fill. This is intentionally broad – a club with fewer than
 * 4 players in the free agent's primary or any secondary position group
 * is considered to have a need.
 */
function clubHasPositionalNeed(
  counts: Record<string, number>,
  player: Player,
): boolean {
  const NEED_THRESHOLD = 4

  if ((counts[player.position.primary] ?? 0) < NEED_THRESHOLD) return true

  for (const sec of player.position.secondary) {
    if ((counts[sec] ?? 0) < NEED_THRESHOLD) return true
  }

  return false
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Return every player whose contract will expire at the end of the current
 * season (i.e. they have exactly 1 year remaining).
 */
export function identifyExpiringContracts(
  players: Record<string, Player>,
): Player[] {
  return Object.values(players).filter(
    (p) => p.contract.yearsRemaining === 1,
  )
}

/**
 * Process end-of-season contract changes:
 *  1. Decrement every active contract by one year and shift the yearByYear
 *     salary array (drop the first element which was this season's salary).
 *  2. Any player whose contract reaches 0 years remaining becomes a free
 *     agent.
 *  3. Classify free agents as restricted (isRestricted flag AND age < 27)
 *     or unrestricted.
 *  4. Generate a demanded AAV for each free agent based on their value.
 *
 * NOTE: This function **mutates** the player contracts in-place for
 * efficiency – callers should treat the incoming record as mutable state.
 */
export function processEndOfSeasonContracts(
  players: Record<string, Player>,
): { expired: Player[]; freeAgents: FreeAgent[] } {
  const expired: Player[] = []
  const freeAgents: FreeAgent[] = []

  for (const player of Object.values(players)) {
    // Skip players with no active contract (already delisted / free)
    if (player.contract.yearsRemaining <= 0) continue

    // Decrement contract
    player.contract.yearsRemaining -= 1
    player.contract.yearByYear = player.contract.yearByYear.slice(1)

    // Update the AAV to reflect the remaining yearByYear values
    if (player.contract.yearByYear.length > 0) {
      player.contract.aav =
        player.contract.yearByYear.reduce((sum, v) => sum + v, 0) /
        player.contract.yearByYear.length
    }

    // Contract expired
    if (player.contract.yearsRemaining === 0) {
      expired.push(player)

      const isRestricted =
        player.contract.isRestricted && player.age < 27

      const baseValue = calculatePlayerValue(player)
      // Free agents demand a premium over their calculated value
      const demandedAav = Math.max(
        MINIMUM_SALARY,
        Math.round(baseValue * 1.1),
      )

      freeAgents.push({
        player,
        type: isRestricted ? 'restricted' : 'unrestricted',
        demandedAav,
        demandedYears: determineDemandedYears(player),
        interestedClubs: [],
      })
    }
  }

  return { expired, freeAgents }
}

/**
 * Determine which AI-controlled clubs are interested in signing a given
 * free agent. Interest is driven by:
 *  - Available salary cap space (must be able to afford the demanded AAV)
 *  - Competitive window alignment (win-now clubs chase proven talent;
 *    rebuilding clubs prefer younger prospects)
 *  - Positional need
 *  - Risk tolerance (aggressive clubs bid more often)
 *
 * Returns an array of interested club IDs (also mutates `freeAgent.interestedClubs`).
 */
export function generateFreeAgentInterest(
  freeAgent: FreeAgent,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  rng: SeededRNG,
  options?: { softCapEnabled?: boolean; constraints?: ListConstraints },
): string[] {
  const interested: string[] = []
  const { player, demandedAav } = freeAgent

  for (const club of Object.values(clubs)) {
    // A player's own former club is handled separately (re-signing logic)
    // so we skip it here.
    if (club.id === player.clubId) continue

    // --- Cap space check ---
    const effectiveCap = options?.softCapEnabled
      ? club.finances.salaryCap * 1.10
      : club.finances.salaryCap
    const availableCap = effectiveCap - club.finances.currentSpend
    if (availableCap < demandedAav) continue

    // --- List space check ---
    const maxSenior = options?.constraints?.maxSenior ?? SENIOR_LIST_SIZE
    const clubPlayers = getClubPlayers(players, club.id)
    const seniorCount = clubPlayers.filter((p) => !p.isRookie).length
    if (seniorCount >= maxSenior) continue

    // --- Competitive window alignment ---
    let windowScore = 0 // higher = more interested

    switch (club.aiPersonality.competitiveWindow) {
      case 'win-now':
        // Win-now clubs want experienced, high-value players
        windowScore = player.age >= 24 && player.age <= 30 ? 0.3 : -0.15
        break
      case 'balanced':
        windowScore = 0.1
        break
      case 'rebuilding':
        // Rebuilding clubs want youth
        windowScore = player.age <= 25 ? 0.25 : -0.2
        break
    }

    // --- Positional need ---
    const posCounts = getPositionalCounts(players, club.id)
    const hasNeed = clubHasPositionalNeed(posCounts, player)
    const needScore = hasNeed ? 0.25 : -0.1

    // --- Risk tolerance ---
    let riskScore = 0
    switch (club.aiPersonality.riskTolerance) {
      case 'aggressive':
        riskScore = 0.15
        break
      case 'moderate':
        riskScore = 0
        break
      case 'conservative':
        riskScore = -0.1
        break
    }

    // --- Combine into a probability ---
    const baseProbability = 0.3
    const totalProbability = Math.min(
      0.95,
      Math.max(0.05, baseProbability + windowScore + needScore + riskScore),
    )

    if (rng.chance(totalProbability)) {
      interested.push(club.id)
    }
  }

  // Mutate the free agent's interested clubs list
  freeAgent.interestedClubs = interested
  return interested
}

/**
 * Delist a player from their club.
 *
 * Mutates the player object:
 *  - Clears their contract
 *  - Removes their club association
 */
export function delistPlayer(player: Player): void {
  player.contract = {
    yearsRemaining: 0,
    aav: 0,
    yearByYear: [],
    isRestricted: false,
  }
  player.clubId = ''
}

/**
 * Promote a rookie-listed player to the senior list.
 *
 * Mutates the player object: sets `isRookie` to `false`.
 */
export function upgradeRookie(player: Player): void {
  player.isRookie = false
}

/**
 * Count how many senior-listed and rookie-listed players a club currently
 * has.
 */
export function getListCounts(
  players: Record<string, Player>,
  clubId: string,
): { senior: number; rookie: number; total: number } {
  let senior = 0
  let rookie = 0

  for (const p of Object.values(players)) {
    if (p.clubId !== clubId) continue
    if (p.isRookie) {
      rookie += 1
    } else {
      senior += 1
    }
  }

  return { senior, rookie, total: senior + rookie }
}

/**
 * Check if a club is allowed to delist a player.
 *
 * Delisting removes a player from the list, so it is always permitted –
 * there is no minimum roster requirement that would block it.
 */
export function canDelist(
  _players: Record<string, Player>,
  _clubId: string,
): boolean {
  return true
}

/**
 * Check if a club has room on the senior list to upgrade a rookie.
 *
 * When `constraints` is provided, checks against the user-configured
 * maxSenior value. Otherwise falls back to the hard-coded SENIOR_LIST_SIZE.
 */
export function canUpgradeRookie(
  players: Record<string, Player>,
  clubId: string,
  constraints?: ListConstraints,
): boolean {
  const { senior } = getListCounts(players, clubId)
  const max = constraints?.maxSenior ?? SENIOR_LIST_SIZE
  return senior < max
}
