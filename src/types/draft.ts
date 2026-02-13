import type { PositionGroup, PlayerAttributes, HiddenAttributes, PlayerPersonality } from './player'

/** A region from which draft prospects originate. */
export type ScoutingRegion = 'VIC' | 'SA' | 'WA' | 'NSW/ACT' | 'QLD' | 'TAS/NT'

/** A draft prospect before being drafted. */
export interface DraftProspect {
  id: string
  firstName: string
  lastName: string
  age: number                    // 17-19
  region: ScoutingRegion
  position: {
    primary: PositionGroup
    secondary: PositionGroup[]
  }
  height: number                 // cm
  weight: number                 // kg

  /** True (hidden) attributes - only fully revealed when fully scouted. */
  trueAttributes: PlayerAttributes
  hiddenAttributes: HiddenAttributes
  personality: PlayerPersonality

  /**
   * Scouted attribute ranges per club.
   * Key is clubId, value is the revealed range for each attribute.
   * Range narrows as scouting progresses.
   */
  scoutingReports: Record<string, ScoutingReport>

  /** Projected draft pick range (1-80) - rough consensus ranking. */
  projectedPick: number

  /** Quality tier for generation purposes. */
  tier: 'elite' | 'first-round' | 'second-round' | 'late' | 'rookie-list'

  /** Father-Son or Academy eligible club ID, or null. */
  linkedClubId: string | null

  /** Development pathway */
  pathway: 'Coates Talent League' | 'APS' | 'State League' | 'International'
}

/** A scouting report for a specific club's evaluation of a prospect. */
export interface ScoutingReport {
  /** How many scouting sessions have been done (more = tighter ranges). */
  sessionsCompleted: number

  /** The confidence level 0-1 (0 = no info, 1 = fully revealed). */
  confidence: number

  /**
   * Estimated attribute ranges.
   * Each value is [low, high] - narrows toward trueValue as confidence increases.
   */
  attributeRanges: Partial<Record<keyof PlayerAttributes, [number, number]>>

  /** Scout's overall rating estimate (average of midpoints). */
  overallEstimate: number
}

/** A scout that can be hired and assigned to regions. */
export interface Scout {
  id: string
  firstName: string
  lastName: string
  skill: number                  // 1-100, affects how fast confidence grows
  salary: number                 // Annual salary
  assignedRegion: ScoutingRegion | null
  clubId: string
}

/** A single pick in the draft. */
export interface DraftPick {
  pickNumber: number
  round: number                  // 1 = National Draft Rd 1, 2 = Rd 2, etc.
  clubId: string                 // Club that owns this pick
  originalClubId: string         // Club that originally held this pick
  /** Set once the pick is made. */
  selectedProspectId: string | null
  /** Whether this is a Father-Son/Academy bid pick. */
  isBid: boolean
}

/** The state of the draft for the current year. */
export interface DraftState {
  year: number
  prospects: DraftProspect[]
  nationalDraftPicks: DraftPick[]
  rookieDraftPicks: DraftPick[]
  /** Current pick index during live draft (0-based). -1 = not started. */
  currentPickIndex: number
  /** Whether the national draft is complete. */
  nationalDraftComplete: boolean
  /** Whether the rookie draft is complete. */
  rookieDraftComplete: boolean
  /** IDs of prospects that have been drafted. */
  draftedProspectIds: string[]
}

/** Club's list of scouts. */
export type ScoutRoster = Scout[]
