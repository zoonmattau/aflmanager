/**
 * Player Agent / Personality Archetype System.
 *
 * Derives a behavioural archetype from personality traits that systematically
 * modifies contract demands, trade request triggers, trade consent, and
 * free-agency preference weights.
 */

import type { AgentArchetype, Player, PlayerPersonality, PlayerTradeRequest } from '@/types/player'
import type { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// 1. Archetype derivation
// ---------------------------------------------------------------------------

const ARCHETYPES: AgentArchetype[] = [
  'loyal', 'greedy', 'premiership-chaser', 'homebody', 'mercenary', 'risk-averse',
]

export function deriveAgentArchetype(
  personality: PlayerPersonality,
  rng: SeededRNG,
): AgentArchetype {
  const { ambition, loyalty, professionalism } = personality

  const weights: Record<AgentArchetype, number> = {
    'loyal': 15 + (loyalty >= 70 ? 20 : 0) - (ambition >= 70 ? 10 : 0),
    'greedy': 12 + (ambition >= 75 ? 20 : 0) - (loyalty >= 70 ? 10 : 0),
    'premiership-chaser': 15 + (ambition >= 65 && professionalism >= 60 ? 15 : 0),
    'homebody': 13 + (loyalty >= 60 && ambition < 60 ? 15 : 0),
    'mercenary': 12 + (loyalty < 40 ? 20 : 0) - (loyalty >= 70 ? 10 : 0),
    'risk-averse': 18 + (professionalism >= 70 && ambition < 55 ? 15 : 0),
  }

  // Clamp to minimum 1 so every archetype has some chance
  for (const key of ARCHETYPES) {
    weights[key] = Math.max(1, weights[key])
  }

  // Normalize and pick via threshold scan
  const total = ARCHETYPES.reduce((sum, k) => sum + weights[k], 0)
  const roll = rng.next() * total
  let cumulative = 0
  for (const archetype of ARCHETYPES) {
    cumulative += weights[archetype]
    if (roll < cumulative) return archetype
  }
  return 'risk-averse' // fallback (shouldn't reach)
}

// ---------------------------------------------------------------------------
// 2. Contract demand modifiers
// ---------------------------------------------------------------------------

export function getArchetypeContractModifiers(
  archetype: AgentArchetype,
  isAtCurrentClub: boolean,
  clubIsContender: boolean,
  isHomeState: boolean,
): { salaryMultiplier: number; yearsAdjust: number } {
  switch (archetype) {
    case 'loyal':
      return { salaryMultiplier: isAtCurrentClub ? 0.92 : 1.0, yearsAdjust: 0 }
    case 'greedy':
      return { salaryMultiplier: 1.15, yearsAdjust: 1 }
    case 'premiership-chaser':
      return { salaryMultiplier: clubIsContender ? 0.90 : 1.10, yearsAdjust: 0 }
    case 'homebody':
      return { salaryMultiplier: isHomeState ? 0.92 : 1.12, yearsAdjust: 0 }
    case 'mercenary':
      return { salaryMultiplier: 1.05, yearsAdjust: 0 }
    case 'risk-averse':
      return { salaryMultiplier: 1.03, yearsAdjust: 1 }
  }
}

// ---------------------------------------------------------------------------
// 3. Trade request modifiers
// ---------------------------------------------------------------------------

export function getArchetypeTradeRequestParams(
  archetype: AgentArchetype,
  player: Player,
  clubLadderPosition: number,
  teamCount: number,
  isHomeState: boolean,
): { moraleThreshold: number; chance: number; reason: PlayerTradeRequest['reason'] } | null {
  switch (archetype) {
    case 'loyal':
      return { moraleThreshold: 25, chance: 0.02, reason: 'unhappy' }
    case 'greedy':
      return { moraleThreshold: 50, chance: 0.08, reason: 'money' }
    case 'premiership-chaser':
      if (clubLadderPosition > teamCount * 0.65 && player.age >= 24 && player.age <= 31) {
        return { moraleThreshold: 55, chance: 0.10, reason: 'contender' }
      }
      return null
    case 'homebody':
      if (!isHomeState) {
        return { moraleThreshold: 55, chance: 0.08, reason: 'home-state' }
      }
      return null
    case 'mercenary':
      return { moraleThreshold: 50, chance: 0.10, reason: 'unhappy' }
    case 'risk-averse':
      return { moraleThreshold: 25, chance: 0.02, reason: 'unhappy' }
  }
}

// ---------------------------------------------------------------------------
// 4. Trade consent modifier
// ---------------------------------------------------------------------------

export function getArchetypeTradeConsentModifier(
  archetype: AgentArchetype,
  toClubIsContender: boolean,
  toClubIsHomeState: boolean,
): number {
  switch (archetype) {
    case 'loyal':
      return 0.15
    case 'greedy':
      return 0
    case 'premiership-chaser':
      return toClubIsContender ? -0.15 : 0.05
    case 'homebody':
      return toClubIsHomeState ? -0.20 : 0.10
    case 'mercenary':
      return -0.12
    case 'risk-averse':
      return 0.08
  }
}

// ---------------------------------------------------------------------------
// 5. Free agency preference weight modifiers
// ---------------------------------------------------------------------------

export function getArchetypeFAWeights(
  archetype: AgentArchetype,
): Partial<Record<string, number>> {
  switch (archetype) {
    case 'loyal':
      return { money: 0.8, loyalty: 3.0, contender: 1.0, facilities: 1.0, role: 1.0, homeState: 1.0 }
    case 'greedy':
      return { money: 2.5, loyalty: 0.3, contender: 0.5, facilities: 0.8, role: 0.8, homeState: 0.5 }
    case 'premiership-chaser':
      return { money: 0.7, loyalty: 0.5, contender: 3.0, facilities: 1.0, role: 1.0, homeState: 0.5 }
    case 'homebody':
      return { money: 0.8, loyalty: 1.5, contender: 0.5, facilities: 1.0, role: 1.0, homeState: 3.0 }
    case 'mercenary':
      return { money: 1.8, loyalty: 0.0, contender: 1.2, facilities: 1.0, role: 1.0, homeState: 0.0 }
    case 'risk-averse':
      return { money: 1.0, loyalty: 1.5, contender: 0.5, facilities: 2.0, role: 1.5, homeState: 1.0 }
  }
}

// ---------------------------------------------------------------------------
// 6. Labels & descriptions
// ---------------------------------------------------------------------------

export function getArchetypeLabel(archetype: AgentArchetype): string {
  switch (archetype) {
    case 'loyal': return 'Loyal'
    case 'greedy': return 'Money-Driven'
    case 'premiership-chaser': return 'Flag Chaser'
    case 'homebody': return 'Homebody'
    case 'mercenary': return 'Mercenary'
    case 'risk-averse': return 'Risk-Averse'
  }
}

export function getArchetypeDescription(archetype: AgentArchetype): string {
  switch (archetype) {
    case 'loyal':
      return 'Values club loyalty above all; likely to accept a hometown discount and rarely requests a trade.'
    case 'greedy':
      return 'Prioritises maximum salary in every negotiation and is quick to become unsettled.'
    case 'premiership-chaser':
      return 'Will take a pay cut to join a contender and may request a trade if the team isn\'t competitive.'
    case 'homebody':
      return 'Strongly prefers to play in their home state and is willing to sacrifice money to stay close to family.'
    case 'mercenary':
      return 'Goes wherever the best deal is; shows no loyalty discount and rarely refuses a trade.'
    case 'risk-averse':
      return 'Prefers long-term security and stability over short-term gains; values good facilities.'
  }
}
