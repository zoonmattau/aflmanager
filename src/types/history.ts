export interface SeasonRecord {
  year: number
  premierClubId: string
  runnerUpClubId: string
  grandFinalScore: { home: number; away: number }
  ladderTopFour: string[]          // top-4 club IDs in ladder order
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

export interface GameHistory {
  seasons: SeasonRecord[]
  draftHistory: DraftHistoryEntry[]
  developmentReports: PlayerDevelopmentReport[]
}
