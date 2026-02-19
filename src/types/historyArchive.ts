import type { QuarterScore } from './match'

export interface ArchivedLadderEntry {
  clubId: string
  played: number
  wins: number
  losses: number
  draws: number
  points: number
  pointsFor: number
  pointsAgainst: number
  percentage: number
}

export interface ArchivedFinalsMatch {
  homeClubId: string
  awayClubId: string
  venue: string
  finalType: 'QF' | 'EF' | 'PF' | 'SF' | 'GF'
  homeScore: number
  awayScore: number
  homeQuarterScores?: QuarterScore[]
  awayQuarterScores?: QuarterScore[]
  winnerClubId: string
}

export interface SeasonArchive {
  year: number
  ladder: ArchivedLadderEntry[]
  finalsResults: ArchivedFinalsMatch[]
}

export interface FinancialSeasonRecord {
  year: number
  clubId: string
  revenue: import('@/engine/clubs/clubManagement').RevenueBreakdown
  expenses: import('@/engine/clubs/clubManagement').ExpenseBreakdown
  luxuryTax: number
  pnl: number
  closingBalance: number
  membershipMembers: number
  sponsorshipCount: number
}
