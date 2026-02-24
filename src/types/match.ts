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
  zonePossessions?: Partial<Record<import('@/types/matchTick').FieldZone, number>>
}

export interface MatchKeyEvent {
  quarter: number         // 1-4
  minute: number          // 0-30 (approx)
  type: 'goal' | 'behind' | 'injury' | 'milestone' | 'tactical-change'
  description: string
  playerId?: string
  clubId: string
}

export type PlayByPlayEventType =
  | 'goal' | 'behind' | 'miss' | 'inside50'
  | 'turnover' | 'clearance' | 'mark' | 'contested-mark'
  | 'free-kick' | 'intercept' | 'tackle' | 'quarter-break'
  | 'training-callout'

export interface PlayByPlayEvent {
  id: string
  quarter: number
  minute: number
  type: PlayByPlayEventType
  clubId: string
  playerId?: string
  receiverPlayerId?: string
  defenderPlayerId?: string
  defenderClubId?: string
  commentary: string
  detail?: string
  isHighlight: boolean
}

export interface MatchResult {
  homeScores: QuarterScore[]    // Q1, Q2, Q3, Q4
  awayScores: QuarterScore[]    // Q1, Q2, Q3, Q4
  /** Running minutes per quarter (excl. stoppages). Slightly randomised ~18–22 each. */
  quarterRunningMinutes?: number[]
  homeTotalScore: number
  awayTotalScore: number
  homePlayerStats: MatchPlayerStats[]
  awayPlayerStats: MatchPlayerStats[]
  keyEvents: MatchKeyEvent[]
  playByPlay?: PlayByPlayEvent[]
  midMatchAdjustments?: import('@/types/matchEvent').MidMatchAdjustment[]
  midMatchInjuredPlayerIds?: string[]
  effectiveAggressionLevel?: 'high' | 'medium' | 'low'
  trainingImpactSummary?: TrainingImpactSummary
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
    // Wind / dynamic weather
    windDirection?: import('@/engine/match/weatherEngine').WindDirection
    windStrength?: import('@/engine/match/weatherEngine').WindStrength
    windAdvantageEnd?: 'home' | 'away'
    quarterWeather?: import('@/engine/match/weatherEngine').QuarterWeatherEntry[]
    coinTossWinner?: 'home' | 'away'
    prepAnalysis?: import('@/engine/match/prepAnalysis').PrepAnalysis
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

// ── Training Impact ───────────────────────────────────────────────────────────

export interface TrainingImpactFinding {
  /** The training focus that drove this outcome */
  focus: string
  /** Short stat label used in the timeline badge */
  metric: string
  /** Actual value recorded in the match */
  value: number
  /** Typical / benchmark value for comparison */
  benchmark: number
  /** How far above benchmark (positive = good) */
  delta: number
  /** Full narrative sentence for the impact card */
  description: string
  /** Short, punchy callout for play-by-play injection (≤ 12 words) */
  callout: string
}

export interface TrainingImpactSummary {
  /** Training focuses active for the week leading into this match */
  focuses: string[]
  /** Up to 4 concrete findings, ordered by delta descending */
  findings: TrainingImpactFinding[]
  /** Single sentence headline derived from the top finding */
  headlineInsight: string
}
