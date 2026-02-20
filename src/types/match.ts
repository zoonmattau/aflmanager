export interface QuarterScore {
  goals: number
  behinds: number
  total: number
}

export interface MatchPlayerStats {
  playerId: string
  participated: boolean
  selectedAsSubstitute?: boolean
  minutesPlayed: number
  aflFantasyPoints: number
  superCoachPoints: number
  disposals: number
  kicks: number
  handballs: number
  marks: number
  tackles: number
  goals: number
  behinds: number
  hitouts: number
  contestedPossessions: number
  uncontestedPossessions: number
  /** @deprecated Use uncontestedPossessions */
  uncountestedPossessions?: number
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
  matchRating?: number
}

export interface MatchKeyEvent {
  quarter: number         // 1-4
  minute: number          // 0-30 (approx)
  type: 'goal' | 'behind' | 'injury' | 'milestone' | 'tactical-change'
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
  midMatchAdjustments?: import('@/types/matchEvent').MidMatchAdjustment[]
  midMatchInjuredPlayerIds?: string[]
  effectiveAggressionLevel?: 'high' | 'medium' | 'low'
  simulationContext?: {
    weather: 'clear' | 'windy' | 'wet' | 'hot' | 'humid'
    groundCondition: 'firm' | 'dewy' | 'soft' | 'heavy' | 'muddy'
    venueId?: string
    venueFamiliarity: { home: number; away: number }
    travelFatigue: { home: number; away: number }
    ratingInputs: { home: number; away: number }
    umpiringRisk?: { home: number; away: number }
    attendance?: number
    capacityPct?: number
  }
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
