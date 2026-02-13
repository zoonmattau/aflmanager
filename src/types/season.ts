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
