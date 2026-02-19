import type { TacticalIdentity, ClubGameplan } from './club'

/**
 * A snapshot of one club's tactical approach and ladder result for a single season.
 * Kept for up to MAX_LEARNING_HISTORY seasons.
 */
export interface TacticalSeasonRecord {
  year: number
  ladderPosition: number   // 1-based (1 = best, 18 = worst)
  wins: number
  losses: number
  draws: number
  pointsFor: number
  pointsAgainst: number
  tacticalIdentity: TacticalIdentity
  offensiveStyle: ClubGameplan['offensiveStyle']
  tempo: ClubGameplan['tempo']
}

/**
 * Per-club rolling history (capped at MAX_LEARNING_HISTORY seasons, oldest first).
 */
export interface ClubTacticalLearning {
  clubId: string
  history: TacticalSeasonRecord[]
}

/**
 * League-wide summary of which tactics correlated with success in a given season.
 */
export interface LeagueTacticalMeta {
  year: number
  totalClubs: number
  /** Average ladder position for clubs using each TacticalIdentity (lower = better). */
  identityAvgPositions: Partial<Record<TacticalIdentity, number>>
  offensiveStyleAvgPositions: Partial<Record<ClubGameplan['offensiveStyle'], number>>
  tempoAvgPositions: Partial<Record<ClubGameplan['tempo'], number>>
  /** Identity used by the most top-8 clubs this season. */
  dominantIdentity: TacticalIdentity | null
  dominantOffensiveStyle: ClubGameplan['offensiveStyle'] | null
  dominantTempo: ClubGameplan['tempo'] | null
}

/**
 * Root learning object stored inside GameState.
 */
export interface AITacticalLearning {
  byClub: Record<string, ClubTacticalLearning>
  /** Capped at MAX_LEARNING_HISTORY seasons, most recent last. */
  leagueMeta: LeagueTacticalMeta[]
}
