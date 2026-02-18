/**
 * Between-round player happiness / morale system.
 *
 * Augments the existing post-match morale (morale.ts) with a per-round
 * adjustment layer that accounts for team success, home-state homesickness,
 * contract status, underpayment, role satisfaction, club culture, and
 * natural mean-reversion.
 */

import type { Player, MoraleFactors, PlayerTradeRequest } from '@/types/player'
import type { Club } from '@/types/club'
import type { LadderEntry } from '@/types/season'
import type { NewsItem } from '@/types/game'
import { calculatePlayerValue } from '@/engine/contracts/negotiation'
import { getClubState } from '@/engine/venues/venueEngine'

// ---------------------------------------------------------------------------
// 1. computeMoraleFactors
// ---------------------------------------------------------------------------

function getJumperPreferenceMoraleEffect(player: Player): number {
  const preference = player.jumperPreference
  if (!preference || preference.level === 'none' || preference.preferredNumbers.length === 0) {
    return 0
  }

  const hasAssignedNumber = player.jerseyNumber > 0
  const hasPreferredNumber = hasAssignedNumber && preference.preferredNumbers.includes(player.jerseyNumber)
  if (hasPreferredNumber) {
    return preference.level === 'demand' ? 2 : 1
  }
  if (!hasAssignedNumber) {
    return preference.level === 'demand' ? -1 : 0
  }
  return preference.level === 'demand' ? -2 : -1
}

export function computeMoraleFactors(
  player: Player,
  clubId: string,
  ladder: LadderEntry[],
  culture: Club['culture'],
  clubLeadership: Club['leadership'] | undefined,
  currentRound: number,
  teamCount: number,
): MoraleFactors {
  const ladderPos = ladder.findIndex((e) => e.clubId === clubId) + 1
  const effectivePos = ladderPos > 0 ? ladderPos : teamCount

  // --- Team success ---
  let teamSuccess = 0
  const isBottom25 = effectivePos > teamCount * 0.75
  const isTop25 = effectivePos <= teamCount * 0.25
  if (isBottom25) {
    teamSuccess = player.agentArchetype === 'premiership-chaser' ? -2 : -1
  } else if (isTop25) {
    teamSuccess = player.agentArchetype === 'premiership-chaser' ? 2 : 1
  }

  // --- Home state ---
  let homeState = 0
  if (player.homeState && getClubState(clubId) !== player.homeState) {
    if (player.agentArchetype === 'homebody') {
      homeState = -2
    } else if (player.personality.loyalty < 40) {
      homeState = -1
    }
  }

  // --- Contract status ---
  let contractStatus = 0
  if (player.contract.yearsRemaining === 0) {
    contractStatus = -3
  } else if (player.contract.yearsRemaining === 1 && player.morale > 50) {
    contractStatus = -1
  }

  // --- Underpayment ---
  let underpayment = 0
  const marketValue = calculatePlayerValue(player)
  if (marketValue > player.contract.aav * 1.4 && player.personality.ambition >= 60) {
    underpayment = player.agentArchetype === 'greedy' ? -2 : -1
  }

  // --- Role satisfaction ---
  let roleSatisfaction = 0
  if (currentRound > 0) {
    const gameRatio = player.seasonStats.gamesPlayed / currentRound
    const isInjured = player.injury !== null
    const isPrime = player.age >= 22 && player.age <= 30

    if (gameRatio < 0.4 && isPrime && !isInjured) {
      roleSatisfaction = -2
    } else if (gameRatio < 0.6 && isPrime && player.form >= 50 && !isInjured) {
      roleSatisfaction = -1
    }
  }

  // --- Contract terms / promise fulfilment ---
  let contractTerms = 0
  const clauses = player.contract.clauses ?? []
  const hasSecurity = clauses.some((c) => c.type === 'no-trade' || c.type === 'limited-trade' || c.type === 'player-option')
  if (hasSecurity) contractTerms += 1

  const rolePromise = clauses.find((c) => c.type === 'role-promise')
  if (rolePromise && currentRound > 0) {
    const gameRatio = player.seasonStats.gamesPlayed / currentRound
    if (gameRatio < 0.5 && !player.injury) contractTerms -= 1
  }

  const leadershipPromise = clauses.find((c) => c.type === 'leadership-promise')
  if (leadershipPromise && clubLeadership) {
    const isInLeadershipGroup =
      clubLeadership.captainId === player.id ||
      clubLeadership.viceCaptainId === player.id ||
      clubLeadership.leadershipGroupIds.includes(player.id)
    if (isInLeadershipGroup) contractTerms += 1
    else if (player.age >= 24) contractTerms -= 1
  }

  // --- Jumper preference satisfaction ---
  const jumperPreference = getJumperPreferenceMoraleEffect(player)

  // --- Culture ---
  let cultureEffect = 0
  const cultureScore = culture?.score ?? 50
  if (cultureScore < 35) {
    cultureEffect = -1
  } else if (cultureScore >= 75) {
    cultureEffect = 1
  }

  // --- Mean reversion (gentle drift toward 55) ---
  let meanReversion = 0
  const positiveFactors = teamSuccess + cultureEffect
  const negativeTotal = homeState + contractStatus + underpayment + roleSatisfaction + Math.min(0, jumperPreference)
  if (player.morale > 85 && positiveFactors <= 0) {
    meanReversion = -1
  } else if (player.morale < 35 && negativeTotal >= -1) {
    meanReversion = 1
  }

  return {
    teamSuccess,
    homeState,
    contractStatus,
    underpayment,
    roleSatisfaction,
    contractTerms,
    jumperPreference,
    culture: cultureEffect,
    meanReversion,
  }
}

// ---------------------------------------------------------------------------
// 2. applyBetweenRoundMorale
// ---------------------------------------------------------------------------

export function applyBetweenRoundMorale(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  ladder: LadderEntry[],
  currentRound: number,
  teamCount: number,
): void {
  for (const player of Object.values(players)) {
    if (!player.clubId || player.clubId === 'retired') continue

    const club = clubs[player.clubId]
    if (!club) continue

    const factors = computeMoraleFactors(
      player, player.clubId, ladder, club.culture, club.leadership, currentRound, teamCount,
    )

    const totalDelta = factors.teamSuccess + factors.homeState +
      factors.contractStatus + factors.underpayment +
      factors.roleSatisfaction + factors.contractTerms + factors.jumperPreference + factors.culture + factors.meanReversion

    // Clamp per-round delta to ±4
    const clampedDelta = Math.max(-4, Math.min(4, totalDelta))
    player.morale = Math.max(1, Math.min(100, player.morale + clampedDelta))
    player.moraleFactors = factors
  }
}

// ---------------------------------------------------------------------------
// 3. checkContractRefusal
// ---------------------------------------------------------------------------

export function checkContractRefusal(
  player: Player,
  clubId: string,
  ladderPosition: number,
  teamCount: number,
): { refuseChance: number; reason: string } {
  // Mercenaries never refuse
  if (player.agentArchetype === 'mercenary') {
    return { refuseChance: 0, reason: '' }
  }

  // Loyal archetype: only refuses at very low morale
  if (player.agentArchetype === 'loyal') {
    if (player.morale < 20) {
      return { refuseChance: 0.30, reason: 'too unhappy to negotiate' }
    }
    return { refuseChance: 0, reason: '' }
  }

  // Active trade request with low-ish morale
  if (player.morale < 45 && player.tradeRequest?.active) {
    return { refuseChance: 0.60, reason: 'has requested a trade' }
  }

  // Very low morale
  if (player.morale < 25) {
    return { refuseChance: 0.80, reason: 'too unhappy to negotiate' }
  }
  if (player.morale < 35) {
    return { refuseChance: 0.40, reason: 'too unhappy to negotiate' }
  }

  // Archetype-specific refusals
  if (player.agentArchetype === 'greedy') {
    const marketValue = calculatePlayerValue(player)
    if (marketValue > player.contract.aav * 1.3) {
      return { refuseChance: 0.50, reason: 'wants to test the market' }
    }
  }

  if (player.agentArchetype === 'premiership-chaser') {
    if (ladderPosition > teamCount * 0.5) {
      return { refuseChance: 0.30, reason: 'wants to join a contender' }
    }
  }

  if (player.agentArchetype === 'homebody') {
    if (player.homeState && getClubState(clubId) !== player.homeState && player.morale < 55) {
      return { refuseChance: 0.40, reason: 'wants to return home' }
    }
  }

  return { refuseChance: 0, reason: '' }
}

// ---------------------------------------------------------------------------
// 4. getRoleFrustrationTradeParams
// ---------------------------------------------------------------------------

export function getRoleFrustrationTradeParams(
  player: Player,
  currentRound: number,
): { moraleThreshold: number; chance: number; reason: PlayerTradeRequest['reason'] } | null {
  if (currentRound <= 0) return null
  const gameRatio = player.seasonStats.gamesPlayed / currentRound
  if (gameRatio < 0.4 && player.age >= 23 && player.age <= 30 && !player.injury) {
    return { moraleThreshold: 50, chance: 0.06, reason: 'role' }
  }
  return null
}

// ---------------------------------------------------------------------------
// 5. generateMoraleWarnings
// ---------------------------------------------------------------------------

/**
 * Generate morale warning news for user's team players crossing thresholds.
 * Only fires when the morale drop this round caused the player to cross
 * the threshold (avoids spam every round).
 */
export function generateMoraleWarnings(
  player: Player,
  previousMorale: number,
  clubName: string,
  currentDate: string,
): NewsItem | null {
  // Crossed below 30 this round (more severe warning)
  if (player.morale < 30 && previousMorale >= 30) {
    return {
      id: crypto.randomUUID(),
      date: currentDate,
      headline: `${player.firstName} ${player.lastName} reportedly considering a trade request`,
      body: `${player.firstName} ${player.lastName} is reportedly considering requesting a trade from ${clubName}. Sources close to the player say frustration has been building for weeks.`,
      category: 'general',
      clubIds: [player.clubId],
      playerIds: [player.id],
    }
  }

  // Crossed below 40 this round (initial warning)
  if (player.morale < 40 && previousMorale >= 40) {
    return {
      id: crypto.randomUUID(),
      date: currentDate,
      headline: `Sources say ${player.firstName} ${player.lastName} is growing frustrated`,
      body: `Sources say ${player.firstName} ${player.lastName} is growing frustrated at ${clubName}. The player's morale has been declining and the situation bears watching.`,
      category: 'general',
      clubIds: [player.clubId],
      playerIds: [player.id],
    }
  }

  return null
}
