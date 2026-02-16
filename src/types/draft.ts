import type { PlayerPositionType, PlayerAttributes, HiddenAttributes, PlayerPersonality } from './player'
import type { DraftPick as ClubDraftPick } from './club'

/** A region from which draft prospects originate. */
export type ScoutingRegion = 'VIC' | 'SA' | 'WA' | 'NSW/ACT' | 'QLD' | 'TAS' | 'NT'
export type HomeState = 'VIC' | 'SA' | 'WA' | 'NSW' | 'ACT' | 'QLD' | 'TAS' | 'NT'

export type DraftArchetype =
  | 'intercept-defender'
  | 'lockdown-defender'
  | 'rebound-defender'
  | 'inside-bull'
  | 'outside-runner'
  | 'two-way-wing'
  | 'mobile-ruck'
  | 'tap-ruck'
  | 'lead-up-forward'
  | 'power-forward'
  | 'small-pressure-forward'
  | 'swingman'

export type DraftRole =
  | 'shutdown'
  | 'ball-winner'
  | 'line-breaker'
  | 'aerial-threat'
  | 'ground-pressure'
  | 'contested-mark'
  | 'ruck-craft'
  | 'utility'

export type DraftLinkedType = 'father-son' | 'academy' | 'nga'

export interface DraftProspectBackground {
  schoolSystem: string
  schoolName: string
  juniorClub: string
  scoutingTournament: 'AFL National U18 Championships'
  nationalU18Team: 'VIC Metro' | 'VIC Country' | 'SA' | 'WA' | 'NSW/ACT' | 'QLD' | 'Tasmania' | 'NT' | 'Allies'
  nationalU18Stats: {
    matches: number
    disposalsPerGame: number
    goalsPerGame: number
  }
  stateLeague: 'VFL' | 'SANFL' | 'WAFL' | 'TFL' | 'NTFL' | null
  stateLeagueClub: string | null
  pathwaySummary: string
}

export type DraftClassStrength = 'weak' | 'average' | 'strong' | 'generational'

export interface DraftClassProfile {
  year: number
  strength: DraftClassStrength
  strengthScore: number
  topEndTalent: number
  depthRating: number
}

/** A draft prospect before being drafted. */
export interface DraftProspect {
  id: string
  firstName: string
  lastName: string
  age: number                    // 17-19
  region: ScoutingRegion
  homeState: HomeState
  position: {
    primary: PlayerPositionType
    secondary: PlayerPositionType[]
  }
  archetype: DraftArchetype
  role: DraftRole
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
  linkedType: DraftLinkedType | null

  /** Development pathway */
  pathway: 'Coates Talent League' | 'APS' | 'State League' | 'School Football' | 'International'

  /** U18 talent league club ID (if applicable, mainly VIC prospects). */
  u18ClubId: string | null

  /** Background and development history before draft eligibility. */
  background: DraftProspectBackground
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
  /** Estimated potential (hidden ceiling) range. */
  potentialRange: [number, number]
  /** Midpoint of potentialRange. */
  potentialEstimate: number
}

export interface ScoutSpecialtyRatings {
  midfield: number
  forward: number
  defense: number
  ruck: number
  character: number
}

/** A scout that can be hired and assigned to regions. */
export interface Scout {
  id: string
  firstName: string
  lastName: string
  skill: number                  // 1-100, affects how fast confidence grows
  salary: number                 // Annual salary
  regionRatings: Record<ScoutingRegion, number>
  specialtyRatings: ScoutSpecialtyRatings
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

export interface DraftPickTradeOffer {
  id: string
  createdAt: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  fromClubId: string
  toClubId: string
  // User swaps down from currentPickIndex to incomingPickIndex.
  currentPickIndex: number
  incomingPickIndex: number
  offeredFuturePicks: ClubDraftPick[]
  requestedFuturePicks: ClubDraftPick[]
  message: string
  targetProspectId: string
}

/** The state of the draft for the current year. */
export interface DraftState {
  year: number
  classProfile: DraftClassProfile
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
  pickTradeOffers?: DraftPickTradeOffer[]
  combineCompleted?: boolean
  combineDate?: string | null
}

/** Club's list of scouts. */
export type ScoutRoster = Scout[]
