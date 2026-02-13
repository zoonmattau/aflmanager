/**
 * Expansion team types.
 *
 * Supports adding new clubs to the league via expansion drafts,
 * priority picks, and salary cap concessions.
 */

export interface ExpansionPlan {
  clubId: string
  /** Year the club enters as a VFL/development team */
  vflEntryYear: number
  /** Year the club enters the AFL competition proper */
  aflEntryYear: number
  /** Number of priority draft picks per year for the first N AFL years */
  priorityPicksPerYear: number
  /** How many AFL years priority picks last */
  priorityPickYears: number
  /** Extra salary cap allowance during early AFL years (flat addition) */
  salaryCapConcession: number
  /** How many AFL years salary concession lasts */
  salaryCapConcessionYears: number
  /** Current status */
  status: 'planned' | 'vfl' | 'active' | 'established'
}

export interface LeagueConfig {
  /** Club IDs currently active in the AFL competition */
  activeClubIds: string[]
  /** Expansion plans for future clubs */
  expansionPlans: ExpansionPlan[]
  /** Total teams in the league (computed from activeClubIds.length) */
  totalTeams: number
}

/**
 * Data shape for expansion club definitions in expansionClubs.json.
 */
export interface ExpansionClubData {
  id: string
  name: string
  fullName: string
  abbreviation: string
  mascot: string
  homeGround: string
  colors: { primary: string; secondary: string; tertiary?: string }
  /** Suggested AFL entry year */
  suggestedEntryYear: number
}
