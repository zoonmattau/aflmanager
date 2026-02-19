export interface BrownlowRound {
  round: number
  matchId: string
  votes: { playerId: string; votes: number }[]  // 3-2-1
}

export interface ClubBFRound {
  round: number
  matchId: string
  clubId: string
  votes: { playerId: string; votes: number }[]  // 3-2-1
}

export interface ClubBFWinner {
  winnerId: string
  votes: number
  runnerUpId: string | null
  runnerUpVotes: number | null
}

export interface SeasonAwards {
  year: number
  brownlowMedal: { playerId: string; votes: number } | null
  colemanMedal: { playerId: string; goals: number } | null
  risingStar: { playerId: string } | null
  allAustralian: string[]  // 22 player IDs
  /** clubId -> winner info (string form kept for backward-compat with old saves) */
  clubBestAndFairest: Record<string, ClubBFWinner | string>
}
