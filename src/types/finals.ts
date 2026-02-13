/**
 * Custom Finals System types.
 *
 * Defines data-driven finals formats that replace the hardcoded AFL top-8 system.
 */

export type FinalsFormatId =
  | 'afl-top-8'
  | 'page-mcintyre-top-4'
  | 'top-6'
  | 'straight-knockout'
  | 'round-robin'
  | 'custom'

/** Describes where a team comes from in a finals matchup */
export interface TeamSource {
  /** 'ladder' means take from ladder by rank, 'result' means take from a prior match */
  type: 'ladder' | 'result'
  /** For 'ladder': 1-based ladder rank. For 'result': reference key */
  rank?: number
  /** For 'result': which week and match (0-based index) to reference */
  weekRef?: number
  matchRef?: number
  /** For 'result': take the winner or loser */
  outcome?: 'winner' | 'loser'
}

export interface FinalsMatchupRule {
  /** Display label e.g. "QF1", "EF1", "SF1", "PF1", "GF" */
  label: string
  /** The final type tag for match records */
  finalType: 'QF' | 'EF' | 'SF' | 'PF' | 'GF'
  /** Where the home team comes from */
  home: TeamSource
  /** Where the away team comes from */
  away: TeamSource
  /** If true, loser is eliminated. If false, loser can still progress (e.g. QF losers -> SF) */
  isElimination: boolean
}

export interface FinalsWeekDefinition {
  weekNumber: number
  label: string
  matchups: FinalsMatchupRule[]
}

export interface FinalsFormat {
  id: FinalsFormatId | string
  name: string
  description: string
  qualifyingTeams: number
  weeks: FinalsWeekDefinition[]
  grandFinalVenue: string
}
