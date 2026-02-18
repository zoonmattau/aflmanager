export type MatchDay =
  | 'Thursday'
  | 'Friday'
  | 'Saturday-Early'
  | 'Saturday-Twilight'
  | 'Saturday-Night'
  | 'Sunday-Early'
  | 'Sunday-Twilight'
  | 'Monday'

export interface Fixture {
  homeClubId: string
  awayClubId: string
  venue: string
  venueId?: string
  matchDay?: MatchDay
  scheduledTime?: string  // e.g. "7:25pm"
  isBlockbuster?: boolean
  blockbusterName?: string   // e.g. "ANZAC Day"
}

export interface Round {
  number: number         // 1-based
  name: string           // "Round 1", "Qualifying Final", etc.
  fixtures: Fixture[]
  isBye: boolean
  byeClubIds: string[]   // clubs resting this round (empty for non-bye rounds)
  isFinals: boolean
}

export interface LadderEntry {
  clubId: string
  played: number
  wins: number
  losses: number
  draws: number
  points: number         // 4 per win, 2 per draw
  pointsFor: number
  pointsAgainst: number
  percentage: number     // (pointsFor / pointsAgainst) * 100
}

export interface Season {
  year: number
  rounds: Round[]
  finalsRounds: Round[]
}

export interface PowerRankingEntry {
  clubId: string
  rank: number
  previousRank: number | null
  movement: number         // positive means moved up, negative means moved down
  score: number            // 0-100 composite score
  formScore: number        // 0-100 recent results and margins
  injuryScore: number      // 0-100 availability health
  fixtureDifficulty: number // 0-100 strength of schedule
  travelLoad: number       // 0-100 burden (higher = heavier travel)
}

export interface PowerRankingSnapshot {
  year: number
  round: number            // regular season round number, finals use 100+ markers
  date: string             // in-game date
  entries: PowerRankingEntry[]
}
