export interface SeasonRecord {
  year: number
  premierClubId: string
  runnerUpClubId: string
  grandFinalScore: { home: number; away: number }
  ladderTopFour: string[]          // top-4 club IDs in ladder order
}

export interface SeasonAwardRecord {
  year: number
  brownlowMedal: { playerId: string; playerName: string; clubId: string; votes: number } | null
  colemanMedal: { playerId: string; playerName: string; clubId: string; goals: number } | null
  risingStar: { playerId: string; playerName: string; clubId: string } | null
  allAustralian: Array<{ playerId: string; playerName: string; clubId: string }>
  clubBestAndFairest: Record<string, {
    playerId: string
    playerName: string
    votes?: number
    runnerUpId?: string | null
    runnerUpName?: string | null
    runnerUpVotes?: number | null
  }>
}

export type MilestoneType =
  | 'games-played'
  | 'career-goals'
  | 'career-disposals'
  | 'career-marks'
  | 'career-tackles'

export interface MilestoneRecord {
  id: string
  year: number
  round: number
  date: string
  playerId: string
  playerName: string
  clubId: string
  type: MilestoneType
  threshold: number
  value: number
}

export interface DraftHistoryEntry {
  year: number
  pickNumber: number
  round: number
  clubId: string                    // drafting club
  playerId: string
  playerName: string                // snapshot (survives retirement)
  position: string                  // primary position at draft time
}

export interface PlayerDevelopmentDelta {
  playerId: string
  clubId: string
  playerName: string
  age: number
  position: string
  draftPick: number | null
  yearsInSystem: number
  overallBefore: number
  overallAfter: number
  delta: number
  potentialCeiling: number
}

export interface ClubDevelopmentSummary {
  clubId: string
  avgDelta: number
  totalPlayers: number
  risers: number
  fallers: number
  youthAvgDelta: number
  veteranAvgDelta: number
  topRiserPlayerId: string | null
  topFallerPlayerId: string | null
}

export interface PlayerDevelopmentReport {
  year: number
  generatedAt: string
  risers: PlayerDevelopmentDelta[]
  fallers: PlayerDevelopmentDelta[]
  breakoutCandidates: PlayerDevelopmentDelta[]
  busts: PlayerDevelopmentDelta[]
  clubSummaries: ClubDevelopmentSummary[]
}

export interface PlayerSeasonStatsSnapshot {
  playerId: string
  playerName: string
  year: number
  clubId: string
  age: number
  position: string
  overall: number
  stats: import('@/types/player').PlayerCareerStats
}

export type RetirementLegacyTier = 'legend' | 'club-great' | 'veteran'

export interface RetirementLegacyEntry {
  playerId: string
  playerName: string
  retiredYear: number
  retiredFromClubId: string
  retiredFromClubName: string
  ageAtRetirement: number
  primaryPosition: string
  gamesPlayed: number
  goals: number
  overallAtRetirement: number
  tier: RetirementLegacyTier
  hallOfFameEligible: boolean
  inductedClubHallOfFame: boolean
  ceremonyHeadline: string
  ceremonySummary: string
}

export type RecordsLeaderboardStat =
  | 'gamesPlayed'
  | 'goals'
  | 'disposals'
  | 'marks'
  | 'tackles'
  | 'hitouts'
  | 'clearances'
  | 'intercepts'
  | 'scoreInvolvements'
  | 'aflFantasyPoints'
  | 'superCoachPoints'

export interface RecordsPlayerEntry {
  playerId: string
  playerName: string
  clubId: string
  value: number
  year?: number
}

export interface TeamStreakRecord {
  clubId: string
  clubName: string
  value: number
  startYear: number
  endYear: number
}

export interface TeamCountRecord {
  clubId: string
  clubName: string
  value: number
}

export interface MatchValueRecord {
  value: number
  year: number
  round: number
  homeClubId: string
  awayClubId: string
}

export interface RecordsBookRuntime {
  currentWinStreakByClub: Record<string, { streak: number; startYear: number }>
}

export interface AFLRecordsBook {
  singleSeason: {
    mostGoals: RecordsPlayerEntry | null
    mostDisposals: RecordsPlayerEntry | null
    mostMarks: RecordsPlayerEntry | null
    mostTackles: RecordsPlayerEntry | null
    mostHitouts: RecordsPlayerEntry | null
    mostClearances: RecordsPlayerEntry | null
    mostIntercepts: RecordsPlayerEntry | null
    mostScoreInvolvements: RecordsPlayerEntry | null
    mostAflFantasyPoints: RecordsPlayerEntry | null
    mostSuperCoachPoints: RecordsPlayerEntry | null
  }
  team: {
    longestWinStreak: TeamStreakRecord | null
    longestPremiershipStreak: TeamStreakRecord | null
    mostPremierships: TeamCountRecord | null
    mostTopFourFinishes: TeamCountRecord | null
  }
  match: {
    biggestWinMargin: MatchValueRecord | null
    highestTeamScore: MatchValueRecord | null
    highestCombinedScore: MatchValueRecord | null
  }
  leaderboards: {
    career: Record<RecordsLeaderboardStat, RecordsPlayerEntry[]>
    season: Record<RecordsLeaderboardStat, RecordsPlayerEntry[]>
  }
  runtime: RecordsBookRuntime
  lastUpdatedYear: number | null
}

export interface MatchReportBestPlayer {
  playerId: string
  playerName: string
  clubId: string
  disposals: number
  goals: number
  marks: number
  tackles: number
  fantasyPoints: number
  matchRating?: number
}

export interface MatchReportQuarterSummary {
  quarter: number
  homeGoals: number
  homeBehinds: number
  homeScore: number
  awayGoals: number
  awayBehinds: number
  awayScore: number
  homeCumulative: number
  awayCumulative: number
  dominatingClubId: string | null
  momentumShift: boolean
}

export interface MatchReportTurningPoint {
  quarter: number
  minute: number
  description: string
  type: 'goal-burst' | 'injury' | 'tactical-change' | 'comeback'
}

export interface MatchReportInjury {
  playerId: string
  playerName: string
  clubId: string
  injuryType: string
  weeksOut: number
  severity: 'minor' | 'moderate' | 'major' | 'severe'
}

export interface MatchReportTribunalIncident {
  playerId: string
  playerName: string
  clubId: string
  incidentType: string
  incidentSummary: string
  recommendedWeeks: number
  severity: string
}

export interface MatchReportPlayerStat {
  playerId: string
  playerName: string
  position: string
  matchRating: number
  disposals: number
  goals: number
  marks: number
  tackles: number
  clearances: number
  hitouts: number
  intercepts: number
}

export interface MatchReport {
  id: string
  matchId: string
  year: number
  round: number
  isFinal: boolean
  finalType?: 'QF' | 'EF' | 'PF' | 'SF' | 'GF'
  homeClubId: string
  awayClubId: string
  homeScore: number
  awayScore: number
  venue: string
  date: string
  quarterSummaries: MatchReportQuarterSummary[]
  homeBestPlayers: MatchReportBestPlayer[]
  awayBestPlayers: MatchReportBestPlayer[]
  turningPoints: MatchReportTurningPoint[]
  injuries: MatchReportInjury[]
  tribunalIncidents: MatchReportTribunalIncident[]
  coachQuotes: { winningCoachQuote: string; losingCoachQuote: string } | null
  crowd: {
    attendance: number
    capacityPct: number
    weather: string
    groundCondition: string
    atmosphereRating: 'electric' | 'lively' | 'moderate' | 'subdued'
  } | null
  ladderContext: {
    homePositionBefore: number
    homePositionAfter: number
    awayPositionBefore: number
    awayPositionAfter: number
    implication: string
  } | null
  narrativeBody: string
  /** Full player stats for both teams, sorted by rating descending. Optional (absent on old saves). */
  homeBoxScore?: MatchReportPlayerStat[]
  awayBoxScore?: MatchReportPlayerStat[]
}

export interface H2HMeeting {
  year: number
  round: number
  score0: number  // score for clubId0 (alphabetically first)
  score1: number  // score for clubId1 (alphabetically second)
  isFinal: boolean
}

export interface H2HRecord {
  clubId0: string  // alphabetically sorted, comes first
  clubId1: string  // alphabetically sorted, comes second
  wins0: number
  wins1: number
  draws: number
  streak: { clubId: string; length: number } | null
  last10: H2HMeeting[]
  biggestWin0: { margin: number; year: number; round: number } | null
  biggestWin1: { margin: number; year: number; round: number } | null
  lastMeeting: H2HMeeting | null
}
export interface GameHistory {
  seasons: SeasonRecord[]
  draftHistory: DraftHistoryEntry[]
  developmentReports: PlayerDevelopmentReport[]
  playerSeasonStats: PlayerSeasonStatsSnapshot[]
  awards: SeasonAwardRecord[]
  milestones: MilestoneRecord[]
  retirementLegacies: RetirementLegacyEntry[]
  originHistory: import('@/types/specialEvents').OriginHistoryRecord[]
  recordsBook: AFLRecordsBook
  seasonArchives: import('@/types/historyArchive').SeasonArchive[]
  matchReports: MatchReport[]
  financialHistory?: import('@/types/historyArchive').FinancialSeasonRecord[]
  h2hRecords?: Record<string, H2HRecord>
  allAustralianHistory?: import('@/types/allAustralian').AllAustralianHistoryEntry[]
}
