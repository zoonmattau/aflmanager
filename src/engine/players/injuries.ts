import type { SeededRNG } from '@/engine/core/rng'
import type { Player } from '@/types/player'

/**
 * Represents an injury that occurred during a match.
 */
export interface InjuryEvent {
  playerId: string
  type: string
  weeksOut: number
}

/**
 * Injury category definition used for weighted random selection.
 */
interface InjuryCategory {
  types: string[]
  weight: number
  minWeeks: number
  maxWeeks: number
}

/**
 * Weighted injury categories with their probabilities and recovery windows.
 */
const INJURY_CATEGORIES: InjuryCategory[] = [
  { types: ['Hamstring strain', 'Calf strain', 'Quad strain'], weight: 0.40, minWeeks: 1, maxWeeks: 4 },
  { types: ['Concussion'], weight: 0.10, minWeeks: 1, maxWeeks: 2 },
  { types: ['Corked thigh', 'Dead leg'], weight: 0.15, minWeeks: 0, maxWeeks: 1 },
  { types: ['Ankle sprain', 'Knee sprain'], weight: 0.15, minWeeks: 2, maxWeeks: 6 },
  { types: ['Shoulder injury'], weight: 0.10, minWeeks: 2, maxWeeks: 8 },
  { types: ['ACL tear', 'Structural knee injury'], weight: 0.08, minWeeks: 8, maxWeeks: 20 },
  { types: ['Back injury'], weight: 0.02, minWeeks: 2, maxWeeks: 6 },
]

/**
 * Calculate the injury probability for a single player in a match.
 *
 * Base chance is ~3%, modified by injury proneness, aggression level,
 * fatigue, and age.
 */
function getInjuryChance(
  player: Player,
  aggressionLevel: 'high' | 'medium' | 'low',
): number {
  // Base injury chance per match
  let chance = 0.03

  // Injury proneness adds up to an additional 3%
  chance += (player.hiddenAttributes.injuryProneness / 100) * 0.03

  // Aggression level modifier
  if (aggressionLevel === 'high') {
    chance += 0.015
  } else if (aggressionLevel === 'low') {
    chance -= 0.01
  }

  // Fatigue over 70 adds 2%
  if (player.fatigue > 70) {
    chance += 0.02
  }

  // Age over 30 adds 1%
  if (player.age > 30) {
    chance += 0.01
  }

  return Math.max(0, chance)
}

/**
 * Pick a random injury category using weighted selection, then pick a
 * specific injury type from that category and randomise the weeks out.
 */
function rollInjuryType(rng: SeededRNG): { type: string; weeksOut: number } {
  // Build cumulative weights
  let roll = rng.nextFloat(0, 1)

  for (const category of INJURY_CATEGORIES) {
    roll -= category.weight
    if (roll <= 0) {
      const type = rng.pick(category.types)
      const weeksOut = rng.nextInt(category.minWeeks, category.maxWeeks)
      return { type, weeksOut }
    }
  }

  // Fallback (should not be reached due to weights summing to 1.0)
  const fallback = INJURY_CATEGORIES[0]
  return {
    type: rng.pick(fallback.types),
    weeksOut: rng.nextInt(fallback.minWeeks, fallback.maxWeeks),
  }
}

/**
 * Roll for injuries across all players participating in a match.
 *
 * For each player, calculates an injury probability based on their
 * attributes, fatigue, age, and the match aggression level. If the roll
 * succeeds, an injury is generated with a random type and duration.
 *
 * @param playerIds - IDs of players participating in the match
 * @param players - Full player record keyed by ID
 * @param rng - Seeded random number generator for reproducibility
 * @param aggressionLevel - Overall aggression intensity of the match
 * @returns Array of injury events that occurred during the match
 */
export function rollMatchInjuries(
  playerIds: string[],
  players: Record<string, Player>,
  rng: SeededRNG,
  aggressionLevel: 'high' | 'medium' | 'low',
): InjuryEvent[] {
  const injuries: InjuryEvent[] = []

  for (const playerId of playerIds) {
    const player = players[playerId]
    if (!player) continue

    // Skip players who are already injured
    if (player.injury) continue

    const chance = getInjuryChance(player, aggressionLevel)

    if (rng.chance(chance)) {
      const { type, weeksOut } = rollInjuryType(rng)
      injuries.push({ playerId, type, weeksOut })
    }
  }

  return injuries
}

/**
 * Process weekly injury healing for all players.
 *
 * Decrements weeksRemaining for every injured player. When weeksRemaining
 * reaches 0 the injury is cleared (set to null).
 *
 * @param players - Mutable player record (call inside Immer draft or similar)
 * @returns Array of player IDs who have fully recovered this week
 */
export function healInjuries(players: Record<string, Player>): string[] {
  const recovered: string[] = []

  for (const playerId of Object.keys(players)) {
    const player = players[playerId]
    if (!player.injury) continue

    player.injury.weeksRemaining -= 1

    if (player.injury.weeksRemaining <= 0) {
      player.injury = null
      recovered.push(playerId)
    }
  }

  return recovered
}
