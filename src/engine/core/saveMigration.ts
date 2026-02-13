/**
 * Save-game migration utilities.
 *
 * When position types change between versions, existing saves need their
 * player position data migrated to the new format.
 */

import type { PlayerPositionType } from '@/types/player'

/** Map old PositionGroup values to new PlayerPositionType values. */
const POSITION_MIGRATION_MAP: Record<string, PlayerPositionType> = {
  FB: 'FB',
  HB: 'HBF',
  C: 'OM',
  HF: 'HFF',
  FF: 'FF',
  FOLL: 'RK',
  MID: 'IM',
  WING: 'W',
  INT: 'IM',
}

/** All valid new position types. */
const VALID_POSITIONS = new Set<string>([
  'BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF',
])

/**
 * Migrate a single position string from old format to new.
 * Returns the position unchanged if it's already a valid new type.
 */
export function migratePosition(pos: string): PlayerPositionType {
  if (VALID_POSITIONS.has(pos)) return pos as PlayerPositionType
  return POSITION_MIGRATION_MAP[pos] ?? 'IM'
}

/**
 * Migrate an array of position strings.
 */
export function migratePositions(positions: string[]): PlayerPositionType[] {
  return positions.map(migratePosition)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGameState = any

/**
 * Migrate an entire game state's player positions from old to new format.
 * Mutates the state in place.
 */
export function migrateGameState(state: AnyGameState): void {
  if (!state?.players) return

  for (const player of Object.values(state.players) as AnyGameState[]) {
    if (!player?.position) continue

    // Migrate primary position
    if (player.position.primary && !VALID_POSITIONS.has(player.position.primary)) {
      player.position.primary = migratePosition(player.position.primary)
    }

    // Migrate secondary positions
    if (Array.isArray(player.position.secondary)) {
      player.position.secondary = migratePositions(player.position.secondary)
    }

    // Migrate position ratings keys
    if (player.position.ratings && typeof player.position.ratings === 'object') {
      const oldRatings = player.position.ratings as Record<string, number>
      const newRatings: Record<string, number> = {}
      for (const [key, value] of Object.entries(oldRatings)) {
        const newKey = migratePosition(key)
        // Keep the higher rating if two old positions map to the same new one
        newRatings[newKey] = Math.max(newRatings[newKey] ?? 0, value)
      }
      player.position.ratings = newRatings
    }
  }
}
