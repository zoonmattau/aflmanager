import type { Player } from '@/types/player'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a random integer between min and max (inclusive). */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Clamps a morale value to the valid 1-100 range. */
function clampMorale(value: number): number {
  return Math.max(1, Math.min(100, value))
}

// ---------------------------------------------------------------------------
// Post-match morale update
// ---------------------------------------------------------------------------

/**
 * Mutates every player's morale based on match selection and result.
 * Designed for Immer-compatible in-place mutation.
 *
 * - Selected & won:  +3 to +5
 * - Selected & lost: -1 to -3
 * - Selected & draw: +0 to +1
 * - Not selected, morale >60:  -2 to -4 (frustrated at being dropped)
 * - Not selected, morale <=60: -1 to -2
 * - Young players (age <= 21) not selected: -0 to -2 (reduced penalty)
 */
export function updateMoralePostMatch(
  players: Record<string, Player>,
  selectedPlayerIds: Set<string>,
  clubId: string,
  won: boolean,
  draw: boolean
): void {
  for (const player of Object.values(players)) {
    if (player.clubId !== clubId) continue

    const wasSelected = selectedPlayerIds.has(player.id)

    if (wasSelected) {
      if (won) {
        player.morale += randInt(3, 5)
      } else if (draw) {
        player.morale += randInt(0, 1)
      } else {
        // Lost
        player.morale -= randInt(1, 3)
      }
    } else {
      // Not selected – sitting on the sidelines
      const isYoung = player.age <= 21

      if (isYoung) {
        player.morale -= randInt(0, 2)
      } else if (player.morale > 60) {
        player.morale -= randInt(2, 4)
      } else {
        player.morale -= randInt(1, 2)
      }
    }

    player.morale = clampMorale(player.morale)
  }
}

// ---------------------------------------------------------------------------
// Contract-related morale
// ---------------------------------------------------------------------------

/**
 * Adjusts a single player's morale based on their contract situation.
 *
 * - 1 year remaining & morale > 50: -1 (mild anxiety)
 * - 0 years remaining (out of contract): -5
 */
export function updateMoraleContractStatus(player: Player): void {
  if (player.contract.yearsRemaining === 0) {
    player.morale -= 5
  } else if (player.contract.yearsRemaining <= 1 && player.morale > 50) {
    player.morale -= 1
  }

  player.morale = clampMorale(player.morale)
}

// ---------------------------------------------------------------------------
// Morale display label
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable label for the given morale value.
 */
export function getMoraleLabel(morale: number): string {
  if (morale >= 90) return 'Ecstatic'
  if (morale >= 75) return 'Happy'
  if (morale >= 60) return 'Content'
  if (morale >= 45) return 'Unsettled'
  if (morale >= 30) return 'Unhappy'
  return 'Furious'
}

// ---------------------------------------------------------------------------
// Morale performance modifier
// ---------------------------------------------------------------------------

/**
 * Returns a multiplicative performance modifier based on morale.
 *
 * - 90+:  1.05  (5% boost)
 * - 75-89: 1.02
 * - 60-74: 1.00
 * - 45-59: 0.98
 * - 30-44: 0.95
 * - <30:   0.90
 */
export function getMoraleModifier(morale: number): number {
  if (morale >= 90) return 1.05
  if (morale >= 75) return 1.02
  if (morale >= 60) return 1.00
  if (morale >= 45) return 0.98
  if (morale >= 30) return 0.95
  return 0.90
}
