/**
 * Save-game migration utilities.
 *
 * When position types change between versions, existing saves need their
 * player position data migrated to the new format.
 */

import type { PlayerPositionType } from '@/types/player'
import type { TacticalIdentity } from '@/types/club'

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

const KNOWN_IDENTITIES: Record<string, TacticalIdentity> = {
  adelaide: 'corridor-heavy',
  brisbane: 'fast-movement',
  carlton: 'contested',
  collingwood: 'contested',
  essendon: 'corridor-heavy',
  fremantle: 'defensive',
  geelong: 'stoppage-focused',
  goldcoast: 'fast-movement',
  gws: 'contested',
  hawthorn: 'fast-movement',
  melbourne: 'contested',
  northmelbourne: 'defensive',
  portadelaide: 'stoppage-focused',
  richmond: 'defensive',
  stkilda: 'corridor-heavy',
  sydney: 'defensive',
  westcoast: 'corridor-heavy',
  westernbulldogs: 'fast-movement',
}

function inferFromGameplan(gameplan: AnyGameState): TacticalIdentity {
  if (!gameplan) return 'contested'
  if (gameplan.offensiveStyle === 'defensive') return 'defensive'
  if (gameplan.tempo === 'fast' && gameplan.centreTactic === 'spread') return 'fast-movement'
  if (gameplan.stoppageTactic === 'cluster' && gameplan.centreTactic === 'cluster') return 'stoppage-focused'
  if (gameplan.offensiveStyle === 'attacking' && gameplan.kickInTactic === 'set-up-long') return 'corridor-heavy'
  if (gameplan.aggression === 'high') return 'contested'
  return 'contested'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGameState = any

function hashToUnit(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function buildLegacyJumperPreference(player: AnyGameState): AnyGameState | undefined {
  const basis = String(player?.id ?? `${player?.firstName ?? ''}${player?.lastName ?? ''}`)
  const roll = hashToUnit(`jp:${basis}`)
  if (roll >= 0.55) return undefined

  const level = roll < 0.16 ? 'demand' : 'want'
  const preferred = new Set<number>()
  if (Number.isInteger(player?.jerseyNumber) && player.jerseyNumber >= 1 && player.jerseyNumber <= 50) {
    preferred.add(player.jerseyNumber)
  }

  const targetCount = level === 'demand' ? 1 : 2
  let salt = 0
  while (preferred.size < targetCount) {
    const candidate = 1 + Math.floor(hashToUnit(`${basis}:${salt}`) * 50)
    if (candidate >= 1 && candidate <= 50) preferred.add(candidate)
    salt++
  }

  return {
    level,
    preferredNumbers: Array.from(preferred).sort((a, b) => a - b),
  }
}

/**
 * Migrate an entire game state's player positions from old to new format.
 * Mutates the state in place.
 */
export function migrateGameState(state: AnyGameState): void {
  // Migrate clubs: add leadership field if missing
  if (state?.clubs) {
    for (const club of Object.values(state.clubs) as AnyGameState[]) {
      if (club && !club.leadership) {
        club.leadership = { captainId: null, viceCaptainId: null, leadershipGroupIds: [] }
      }
      if (club && !club.culture) {
        club.culture = {
          score: 55, momentum: 0, stability: 70,
          leadershipFactor: 50, ageBalance: 60, lastUpdatedRound: -1,
        }
      }
      if (club && !club.tacticalIdentity) {
        club.tacticalIdentity = KNOWN_IDENTITIES[club.id] ?? inferFromGameplan(club.gameplan)
      }
      if (club && !Array.isArray(club.hallOfFame)) {
        club.hallOfFame = []
      }
      // lastSeasonLadderPosition: no-op for old saves (optional field, undefined is valid)
    }
  }

  if (!state?.players) return

  for (const player of Object.values(state.players) as AnyGameState[]) {
    if (!player?.position) continue

    // Migrate primary position
    if (player.position.primary && !VALID_POSITIONS.has(player.position.primary)) {
      player.position.primary = migratePosition(player.position.primary)
    }

    // Migrate secondary positions (initialize if missing from old saves)
    if (!Array.isArray(player.position.secondary)) {
      player.position.secondary = []
    } else {
      player.position.secondary = migratePositions(player.position.secondary)
    }

    // Migrate agentArchetype (deterministic from personality)
    if (!player.agentArchetype && player.personality) {
      const p = player.personality
      if (p.loyalty >= 70 && p.ambition < 60) {
        player.agentArchetype = 'loyal'
      } else if (p.ambition >= 75 && p.loyalty < 40) {
        player.agentArchetype = 'mercenary'
      } else if (p.ambition >= 70) {
        player.agentArchetype = 'greedy'
      } else if (p.loyalty >= 60 && p.ambition < 55) {
        player.agentArchetype = 'homebody'
      } else if (p.professionalism >= 65 && p.ambition < 55) {
        player.agentArchetype = 'risk-averse'
      } else {
        player.agentArchetype = 'premiership-chaser'
      }
    } else if (!player.agentArchetype) {
      player.agentArchetype = 'risk-averse'
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

    if (!player.jumperPreference) {
      player.jumperPreference = buildLegacyJumperPreference(player)
    }
  }
}
