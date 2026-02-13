export interface QuarterScore {
  goals: number
  behinds: number
  total: number
}

export interface MatchPlayerStats {
  playerId: string
  disposals: number
  kicks: number
  handballs: number
  marks: number
  tackles: number
  goals: number
  behinds: number
  hitouts: number
  contestedPossessions: number
  uncountestedPossessions: number
  clearances: number
  insideFifties: number
  rebound50s: number
  freesFor: number
  freesAgainst: number
  // Extended stats
  contestedMarks: number
  scoreInvolvements: number
  metresGained: number
  turnovers: number
  intercepts: number
  onePercenters: number
  bounces: number
  clangers: number
  goalAssists: number
}

export interface MatchKeyEvent {
  quarter: number         // 1-4
  minute: number          // 0-30 (approx)
  type: 'goal' | 'behind' | 'injury' | 'milestone'
  description: string
  playerId?: string
  clubId: string
}

export interface MatchResult {
  homeScores: QuarterScore[]    // Q1, Q2, Q3, Q4
  awayScores: QuarterScore[]    // Q1, Q2, Q3, Q4
  homeTotalScore: number
  awayTotalScore: number
  homePlayerStats: MatchPlayerStats[]
  awayPlayerStats: MatchPlayerStats[]
  keyEvents: MatchKeyEvent[]
}

export interface Match {
  id: string
  round: number
  homeClubId: string
  awayClubId: string
  venue: string
  date: string               // In-game date ISO
  result: MatchResult | null // null if not yet played
  isFinal: boolean
  finalType?: 'QF' | 'EF' | 'PF' | 'SF' | 'GF'
}
