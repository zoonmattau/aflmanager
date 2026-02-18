import type { LadderEntry } from './season'

export type StateLeagueId = 'vfl' | 'sanfl' | 'wafl' | 'tfl' | 'ntfl' | 'u16' | 'u18'
export type AdultStateLeagueId = Exclude<StateLeagueId, 'u16' | 'u18'>

export interface StateLeagueAffiliationSettings {
  allowCustomAffiliations: boolean
  clubAffiliations: Partial<Record<string, AdultStateLeagueId>>
}

export type StateLeagueLadderPrimarySort = 'points' | 'percentage'
export type StateLeagueLadderTieBreaker =
  | 'percentage'
  | 'points'
  | 'wins'
  | 'pointsFor'
  | 'pointsAgainst'
  | 'clubId'

export interface StateLeagueBranding {
  logoText: string
  primaryColor: string
  secondaryColor: string
}

export interface StateLeagueDivision {
  id: string
  name: string
  clubIds: string[]
}

export interface StateLeagueLadderRules {
  pointsForWin: number
  pointsForDraw: number
  pointsForLoss: number
  primarySort: StateLeagueLadderPrimarySort
  tieBreakers: StateLeagueLadderTieBreaker[]
}

export interface StateLeagueFixtureRules {
  rounds: number
  homeAwayBalance: boolean
}

export interface StateLeagueFinalsRules {
  format: 'top-8' | 'top-6' | 'top-4' | 'straight-knockout'
  qualifyingTeams: number
}

export interface StateLeagueHistoryRecord {
  year: number
  premierClubId: string
  runnerUpClubId: string | null
  minorPremierClubId: string | null
}

export interface StateLeagueClub {
  id: string
  name: string
  abbreviation: string
  colors: { primary: string; secondary: string }
  logoText?: string
  homeGround: string
  aflAffiliateId: string | null  // null for standalone clubs
  isAFLReserves: boolean
  conferenceId?: string
  divisionId?: string
}

export interface StateLeagueSeason {
  year: number
  rounds: { number: number; results: StateLeagueMatchResult[] }[]
}

export interface StateLeagueMatchResult {
  homeClubId: string
  awayClubId: string
  homeScore: number
  awayScore: number
}

export interface StateLeague {
  id: StateLeagueId
  name: string
  branding: StateLeagueBranding
  clubs: StateLeagueClub[]
  divisions: StateLeagueDivision[]
  ladderRules: StateLeagueLadderRules
  fixtureRules: StateLeagueFixtureRules
  finalsRules: StateLeagueFinalsRules
  season: StateLeagueSeason
  ladder: LadderEntry[]
  history: StateLeagueHistoryRecord[]
}
