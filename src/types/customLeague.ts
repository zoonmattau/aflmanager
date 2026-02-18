import type { FinalsFormat } from './finals'

export type CustomCompetitionModel = 'single-table' | 'conferences' | 'divisions'

export interface CustomLeagueTeam {
  id: string
  name: string
  fullName: string
  abbreviation: string
  mascot: string
  logoUrl?: string
  homeVenue: string
  established: number
  colors: {
    primary: string
    secondary: string
    tertiary?: string
  }
  notes?: string
  secondaryHomeGrounds?: string[]
  guernseyStyle?: import('@/types/club').GuernseyStyle
  rivalryClubIds?: string[]
  tier?: 'large' | 'medium' | 'small'
  finances?: { revenue: number; expenses: number; balance: number }
  fanSatisfaction?: number
}

export interface CustomLeagueStructure {
  model: CustomCompetitionModel
  conferenceCount: number
  divisionsPerConference: number
  teamsPerDivision: number
  /** Team-to-group mapping. Group ids are generated from structure counts. */
  groupAssignments?: Record<string, string>
  tierCount: number
  enablePromotionRelegation: boolean
  promotionRelegationSpots: number
}

export type LadderPrimarySort = 'points' | 'percentage'
export type LadderTieBreaker =
  | 'percentage'
  | 'points'
  | 'wins'
  | 'draws'
  | 'losses'
  | 'pointsFor'
  | 'pointsAgainst'
  | 'clubId'

export interface CustomLadderRules {
  pointsForWin: number
  pointsForDraw: number
  pointsForLoss: number
  primarySort: LadderPrimarySort
  tieBreakers: LadderTieBreaker[]
}

export interface CustomFixtureRules {
  roundCount: number
  byeRounds: boolean
  byeRoundCount: number
  enforceHomeAwayBalance: boolean
  enforceRivalries: boolean
  travelWeighting: number // 0-100
  venueSharingRules: boolean
}

export interface CustomFinalsRules {
  finalsTeams: number
  finalsFormat: 'afl-top-8' | 'page-mcintyre-top-4' | 'top-6' | 'straight-knockout' | 'round-robin' | 'custom'
  customFinalsFormat?: FinalsFormat
}

export interface CustomLeagueTemplate {
  id: string
  name: string
  description: string
  createdAt: string
  lastModified: string
  teams: CustomLeagueTeam[]
  rivalries: Array<[string, string]>
  structure: CustomLeagueStructure
  ladderRules: CustomLadderRules
  fixtureRules: CustomFixtureRules
  finalsRules: CustomFinalsRules
}
