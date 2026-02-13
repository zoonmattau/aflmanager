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

export interface GameHistory {
  seasons: SeasonRecord[]
  draftHistory: DraftHistoryEntry[]
}
