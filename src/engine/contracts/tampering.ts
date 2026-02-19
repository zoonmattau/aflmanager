/**
 * Contract Tampering & Pre-Free-Agency Negotiation Engine
 *
 * Tampering = covert contact with a player still under contract (or in final year)
 *   at another club during the season. Carries detection risk.
 *
 * Pre-FA Expression = non-binding soft verbal offer to an out-of-contract player
 *   during post-season before the formal FA market opens. No detection risk.
 */

import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type {
  TamperingContactResponse,
  PreFAExpressionResponse,
} from '@/types/contract'
import type { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Detection Risk
// ---------------------------------------------------------------------------

/**
 * Calculate the probability (0–1) that a covert contact is detected by the AFL.
 * Base risk is 20%. Modifiers push it up or down.
 */
export function calculateDetectionRisk(
  player: Player,
  _initiatingClub: Club,
): number {
  let risk = 0.20

  // Low professionalism → player more likely to blab
  if (player.personality.professionalism < 40) risk += 0.10
  else if (player.personality.professionalism > 70) risk -= 0.05

  // High-profile players attract more scrutiny
  const overall = player.form // approximate: already loaded, avoid import cycle
  if (overall >= 80) risk += 0.08

  // Ambitious players with agents (mercenary / greedy) leak more
  if (
    player.agentArchetype === 'mercenary' ||
    player.agentArchetype === 'greedy'
  ) {
    risk += 0.07
  }

  // Loyal players keep quiet
  if (player.personality.loyalty >= 75) risk -= 0.06

  return Math.max(0.05, Math.min(0.55, risk))
}

// ---------------------------------------------------------------------------
// Player Response — Covert Contact
// ---------------------------------------------------------------------------

/**
 * Determine how a player privately responds to a covert approach.
 * The response drives their initial mood when formal FA begins.
 */
export function generateTamperingResponse(
  player: Player,
  initiatingClub: Club,
  rng: SeededRNG,
): TamperingContactResponse {
  // Base interest score
  let interest = 50

  // Ambitious players more open to exploring options
  interest += (player.personality.ambition - 50) * 0.4

  // Loyal players less interested in leaving
  interest -= (player.personality.loyalty - 50) * 0.3

  // Mercenary / premiership-chaser more receptive
  if (
    player.agentArchetype === 'mercenary' ||
    player.agentArchetype === 'premiership-chaser'
  ) {
    interest += 15
  }

  // Homebody / loyal agent less receptive
  if (player.agentArchetype === 'homebody' || player.agentArchetype === 'loyal') {
    interest -= 15
  }

  // Club culture appeal — if the approaching club has strong culture, +interest
  if (initiatingClub.culture && initiatingClub.culture.score > 70) interest += 8
  if (initiatingClub.fanSatisfaction && initiatingClub.fanSatisfaction > 70) interest += 5

  // Randomness: ±15
  interest += (rng.next() - 0.5) * 30

  if (interest >= 60) return 'interested'
  if (interest >= 35) return 'lukewarm'
  return 'not-interested'
}

// ---------------------------------------------------------------------------
// Player Response — Pre-FA Expression
// ---------------------------------------------------------------------------

/**
 * Determine a player's response to a pre-FA soft verbal offer.
 * The offer's AAV vs the player's estimated market value drives this.
 */
export function generatePreFAResponse(
  player: Player,
  aav: number,
  years: number,
  initiatingClub: Club,
  rng: SeededRNG,
): PreFAExpressionResponse {
  // Rough demand: approximate market value from player age / form
  const ageFactor = player.age <= 26 ? 1.1 : player.age <= 30 ? 1.0 : 0.85
  const estimatedDemand = 400_000 + player.form * 8_000 * ageFactor

  const salaryRatio = aav / estimatedDemand  // 1.0 = market rate, >1 = above

  let interest = 40

  // Offer quality
  if (salaryRatio >= 1.15) interest += 30
  else if (salaryRatio >= 1.0) interest += 15
  else if (salaryRatio >= 0.85) interest += 0
  else interest -= 15

  // Years: ambitious young players prefer longer; veterans prefer shorter
  const idealYears = player.age <= 24 ? 4 : player.age <= 27 ? 3 : 2
  const yearDiff = Math.abs(years - idealYears)
  interest -= yearDiff * 5

  // Player personality
  interest += (player.personality.ambition - 50) * 0.3
  interest -= (player.personality.loyalty - 50) * 0.25

  // Agent archetype
  if (player.agentArchetype === 'mercenary' || player.agentArchetype === 'greedy') interest += 12
  if (player.agentArchetype === 'homebody' || player.agentArchetype === 'loyal') interest -= 12
  if (player.agentArchetype === 'premiership-chaser' && (initiatingClub.fanSatisfaction ?? 50) > 65) interest += 8
  if (player.agentArchetype === 'risk-averse') interest += salaryRatio >= 1.0 ? 5 : -8

  // Club appeal
  if (initiatingClub.culture && initiatingClub.culture.score > 70) interest += 6

  // Randomness: ±12
  interest += (rng.next() - 0.5) * 24

  if (interest >= 62) return 'interested'
  if (interest >= 38) return 'neutral'
  return 'not-interested'
}

// ---------------------------------------------------------------------------
// Penalty Description
// ---------------------------------------------------------------------------

export function tamperingPenaltyDescription(): string {
  return 'The AFL has issued a 3rd-round compensatory pick penalty for unapproved contact with a contracted player.'
}
