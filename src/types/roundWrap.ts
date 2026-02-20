export interface RoundWrapPlayerLeader {
  playerId: string
  playerName: string
  clubId: string
  value: number
  /** Contextual detail, e.g. "82% eff" or "9.2 rating" */
  secondary?: string
}

export interface RoundWrapMatchStat {
  matchId: string
  homeClubId: string
  awayClubId: string
  homeScore: number
  awayScore: number
  homeGoals: number
  homeBehinds: number
  awayGoals: number
  awayBehinds: number
  /** The key value for this stat (margin, score, disposal diff, etc.) */
  value: number
}

export interface RoundWrapUpset extends RoundWrapMatchStat {
  winnerClubId: string
  winnerLadderPos: number
  loserClubId: string
  loserLadderPos: number
}

export interface RoundWrapUserMatch {
  won: boolean
  drew: boolean
  margin: number
  homeClubId: string
  awayClubId: string
  homeScore: number
  awayScore: number
  homeGoals: number
  homeBehinds: number
  awayGoals: number
  awayBehinds: number
  userIsHome: boolean
  /** Best player from user's team by match rating */
  bestPlayer: RoundWrapPlayerLeader | null
}

export interface RoundWrapData {
  roundNumber: number
  roundName: string
  dateRange: string

  // ── Player leaders ──────────────────────────────────────────────────────
  disposalsLeader: RoundWrapPlayerLeader | null
  goalsLeader: RoundWrapPlayerLeader | null
  clearancesLeader: RoundWrapPlayerLeader | null
  marksLeader: RoundWrapPlayerLeader | null
  tacklesLeader: RoundWrapPlayerLeader | null
  hitoutsLeader: RoundWrapPlayerLeader | null
  /** Best-on-ground — highest match rating */
  matchRatingLeader: RoundWrapPlayerLeader | null
  superCoachLeader: RoundWrapPlayerLeader | null
  fantasyLeader: RoundWrapPlayerLeader | null

  // ── Team stat leaders ────────────────────────────────────────────────────
  biggestWin: RoundWrapMatchStat | null
  highestScore: RoundWrapMatchStat | null
  /** Match with the largest disposal differential between the two sides */
  bestDisposalDiff: (RoundWrapMatchStat & { dominantClubId: string; disposalDiff: number }) | null
  /** Lower-ranked team beats higher-ranked team; ladderGap = positions climbed */
  upsetOfRound: RoundWrapUpset | null

  // ── User context ─────────────────────────────────────────────────────────
  userMatch: RoundWrapUserMatch | null

  // ── Narrative ────────────────────────────────────────────────────────────
  reviewBlurb: string

  // ── Full results for the round ───────────────────────────────────────────
  allResults: RoundWrapMatchStat[]
}
