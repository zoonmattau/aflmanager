export interface BrownlowRound {
  round: number
  matchId: string
  votes: { playerId: string; votes: number }[]  // 3-2-1
}

export interface SeasonAwards {
  year: number
  brownlowMedal: { playerId: string; votes: number } | null
  colemanMedal: { playerId: string; goals: number } | null
  risingStar: { playerId: string } | null
  allAustralian: string[]  // 22 player IDs
  clubBestAndFairest: Record<string, string>  // clubId -> playerId
}
