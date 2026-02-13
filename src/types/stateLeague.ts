import type { LadderEntry } from './season'

export type StateLeagueId = 'vfl' | 'sanfl' | 'wafl' | 'tfl' | 'ntfl'

export interface StateLeagueClub {
  id: string
  name: string
  abbreviation: string
  colors: { primary: string; secondary: string }
  homeGround: string
  aflAffiliateId: string | null  // null for standalone clubs
  isAFLReserves: boolean
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
  clubs: StateLeagueClub[]
  season: StateLeagueSeason
  ladder: LadderEntry[]
}
