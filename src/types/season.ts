export interface Fixture {
  homeClubId: string
  awayClubId: string
  venue: string
}

export interface Round {
  number: number         // 1-based
  name: string           // "Round 1", "Qualifying Final", etc.
  fixtures: Fixture[]
  isBye: boolean
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
