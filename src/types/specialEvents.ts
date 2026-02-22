export type SpecialEventId =
  | 'international-rules'
  | 'state-of-origin'
  | 'aboriginal-all-stars'
  | 'preseason-showcase'
  | 'all-australian-vs-rest'

export type SpecialEventTiming = 'preseason' | 'mid-season' | 'post-season'

export type SpecialEventManualTiming =
  | 'preseason'       // Before Round 1
  | 'early-season'    // Roughly Rounds 1–8
  | 'mid-season'      // Roughly Rounds 9–16 (or bye rounds)
  | 'late-season'     // Roughly Rounds 17+
  | 'pre-finals'      // Week immediately before finals begin
  | 'post-season'     // After the Grand Final
  | 'custom-round'    // User-specified round number

export interface SpecialEventSchedule {
  timing: SpecialEventManualTiming
  customRound: number    // Only used when timing === 'custom-round'
  venueOverride: string  // Empty string = use event default venue
}

export interface SpecialEventDefinition {
  id: SpecialEventId
  name: string
  description: string
  defaultEnabled: boolean
  timing: SpecialEventTiming
  matchCount: number
  defaultVenues: string[]
  teamComposition: 'representative' | 'all-star' | 'international'
}

export interface SpecialEventInstance {
  id: string
  eventId: SpecialEventId
  year: number
  scheduledDate: string
  venue: string
  teamA: SpecialEventTeam
  teamB: SpecialEventTeam
  result: SpecialEventMatchResult | null
  status: 'scheduled' | 'completed' | 'cancelled'
  matchNumber: number
  seriesTotal: number
}

export interface SpecialEventTeam {
  name: string
  playerIds: string[]
  teamRating: number
}

export interface SpecialEventMatchResult {
  teamAScore: { goals: number; behinds: number; total: number }
  teamBScore: { goals: number; behinds: number; total: number }
  userClubParticipants: string[]
  bestOnGround?: string
}

export interface SpecialEventsState {
  events: SpecialEventInstance[]
  seriesResults: Record<string, { teamAWins: number; teamBWins: number; draws: number }>
  originStandings: OriginSeasonStanding[]
}

/** Determines how players qualify for state-based representative teams. */
export type OriginEligibility =
  | 'birthplace'       // Player's homeState (where they were born/raised)
  | 'current-club'     // State of the club they currently play for
  | 'state-league'     // State league affiliation (maps to club state)

// ---------------------------------------------------------------------------
// State of Origin configuration types
// ---------------------------------------------------------------------------

export type OriginState = 'VIC' | 'SA' | 'WA' | 'QLD' | 'NSW' | 'TAS' | 'NT'

export const ALL_ORIGIN_STATES: OriginState[] = ['VIC', 'SA', 'WA', 'QLD', 'NSW', 'TAS', 'NT']

export type OriginCompetitionFormat =
  | 'best-of-3'          // Traditional: 3-match series between rotating pairs
  | 'round-robin'        // All participating teams play each other once
  | 'single-annual'      // One marquee game per year, rotating matchups

export type OriginScheduleMode =
  | 'mid-season-block'   // All matches during bye rounds (current behavior)
  | 'weeknight-spread'   // Spread across mid-week nights throughout the season
  | 'pre-finals'         // Showcase game(s) in the week before finals
  | 'post-season'        // After finals conclude

export interface OriginConfig {
  format: OriginCompetitionFormat
  matchCount: number
  participatingStates: OriginState[]
  alliesEnabled: boolean
  alliesStates: OriginState[]
  alliesName: string
  scheduleMode: OriginScheduleMode
  matchDay: 'tuesday' | 'wednesday' | 'thursday'
  includeShowdownFinal: boolean
  showdownFinalTiming: 'before-gf' | 'after-gf'
  showdownFinalVenue: string
}

export interface OriginMatchRecord {
  year: number
  date: string
  teamA: string
  teamB: string
  scoreA: { goals: number; behinds: number; total: number }
  scoreB: { goals: number; behinds: number; total: number }
  venue: string
  bestOnGround?: string
  bestOnGroundName?: string
}

export interface OriginSeasonStanding {
  team: string
  played: number
  wins: number
  losses: number
  draws: number
  pointsFor: number
  pointsAgainst: number
}

export interface OriginHistoryRecord {
  year: number
  format: OriginCompetitionFormat
  matches: OriginMatchRecord[]
  champion: string | null
  standings: OriginSeasonStanding[]
}

export interface SpecialEventsSettings {
  enabled: boolean
  events: Record<SpecialEventId, boolean>
  autoSchedule: boolean
  originEligibility: OriginEligibility
  originConfig: OriginConfig
  eventSchedules: Partial<Record<SpecialEventId, SpecialEventSchedule>>
}
