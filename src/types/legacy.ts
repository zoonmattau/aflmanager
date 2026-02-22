export interface LegacyPointsBreakdown {
  premierships: number        // 100 pts each
  grandFinals: number         // 40 pts runner-up
  finalsAppearances: number   // 5/10/15 by round
  top4Finishes: number        // 10 pts each (excl. #1)
  ladderLeads: number         // 20 pts for #1 finish
  brownlows: number           // 10 pts each (own club)
  colemanMedals: number       // 8 pts each (own club)
  bestAndFairest: number      // 5 pts each (own club)
  allAustralians: number      // 3 pts per selection
  draftSuccesses: number      // 2 pts per player reaching 80+ OVR from draft
  financialSurpluses: number  // 3 pts per profitable season
  winStreakBonus: number       // 1 pt per game in streaks ≥ 6
  careerGoals: number         // 10-50 per completed career goal
  challenges: number          // 50-200 per completed challenge
  total: number
}

export type FinalPosition = 'premiers' | 'runner-up' | 'preliminary' | 'semi' | 'elimination' | 'missed'
export type BoardMood = 'ecstatic' | 'satisfied' | 'neutral' | 'concerned' | 'angry'

export interface BoardExpectation {
  minLadderPosition: number   // must finish at or above this
  requireFinals: boolean
  requireTopFour: boolean
  requireGrandFinal: boolean
  requirePremiership: boolean
  mood: BoardMood
  pressureLevel: number       // 0-100, shown as bar
  consecutiveExpectationsMet: number
  message: string             // NL description shown to user
}

export type ChallengeId = 'back-to-back' | 'three-peat' | 'youth-only' | 'low-budget' | 'dynasty-five' | 'rebuild'

export interface ChallengeTemplate {
  id: ChallengeId
  title: string
  description: string
  rules: string[]
  legacyReward: number
  targetSeasons: number       // how many seasons the challenge runs
}

export interface ActiveChallenge {
  id: ChallengeId
  title: string
  description: string
  rules: string[]
  startedSeason: number       // seasonNumber (1-indexed)
  targetSeason: number        // seasonNumber deadline
  status: 'active' | 'completed' | 'abandoned'
  legacyReward: number
  completedSeason?: number
}

export interface DynastySeasonEntry {
  seasonNumber: number        // 1 = first season managed
  year: number
  clubId: string
  ladderPosition: number
  wins: number
  losses: number
  draws: number
  percentage: number
  finalPosition: FinalPosition
  legacyPointsEarned: number
  cumulativeLegacyPoints: number
  boardMet: boolean
  boardMood: BoardMood
  notableEvents: string[]     // "Brownlow medallist", "8-game win streak", etc.
}

export interface LegacyState {
  totalPoints: number
  breakdown: LegacyPointsBreakdown
  dynastyHistory: DynastySeasonEntry[]
  boardExpectation: BoardExpectation
  activeChallenge: ActiveChallenge | null
  pendingChallengePrompt: boolean  // true = show modal after premiership
  seasonsManaged: number
  premiershipsWon: number
  allTimeWins: number
  allTimeLosses: number
  allTimeDraws: number
  longestWinStreak: number
  currentWinStreak: number
  longestFinalsStreak: number
  currentFinalsStreak: number
}
