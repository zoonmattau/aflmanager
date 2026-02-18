export type GuernseyPattern =
  | 'solid' | 'vertical-stripes' | 'horizontal-hoops'
  | 'v-stripe' | 'chevron' | 'sash' | 'yoke' | 'halves'

export interface GuernseyStyle {
  homePattern: GuernseyPattern
  awayPattern: GuernseyPattern
  homeColors: [string, string]
  awayColors: [string, string]
}

export interface ClubColors {
  primary: string    // hex
  secondary: string  // hex
  tertiary?: string  // hex
}

export interface ClubFacilities {
  trainingGround: number    // 1-5
  gym: number               // 1-5
  medicalCentre: number     // 1-5
  recoveryPool: number      // 1-5
  analysisSuite: number     // 1-5
  youthAcademy: number      // 1-5
}

export interface ClubFinances {
  salaryCap: number
  currentSpend: number
  revenue: number
  expenses: number
  balance: number
  /** Running match-day gate total accumulated during the season */
  matchDayAccumulated?: number
  /** Performance momentum modifier from recent form (-0.10 to +0.15) */
  momentumModifier?: number
  /** Last season's revenue breakdown */
  seasonRevenue?: import('@/engine/clubs/clubManagement').RevenueBreakdown
  /** Last season's expense breakdown */
  seasonExpenses?: import('@/engine/clubs/clubManagement').ExpenseBreakdown
  /** Net profit/loss from last season */
  seasonPnL?: number
}

export interface DraftPick {
  year: number
  round: number
  originalClubId: string   // Club that originally held this pick
  currentClubId: string    // Club that currently owns it
  pickNumber?: number      // Assigned during draft order
}

export interface RuckNomination {
  primaryRuckId: string | null
  backupRuckId: string | null
  aroundTheGround: boolean
}

export interface ClubLeadership {
  captainId: string | null
  viceCaptainId: string | null
  leadershipGroupIds: string[]  // 4-6 additional leaders
}

export interface ClubCulture {
  score: number              // 0-100
  momentum: number           // -20 to +20
  stability: number          // 0-100
  leadershipFactor: number   // 0-100
  ageBalance: number         // 0-100
  lastUpdatedRound: number
}

export type ClubIdentityType =
  | 'youth-development'
  | 'star-chasing'
  | 'defensive-powerhouse'

export interface ClubIdentity {
  current: ClubIdentityType
  previous: ClubIdentityType | null
  scores: Record<ClubIdentityType, number> // 0-100
  momentum: number // -20 to +20
  fanExpectation: 'patience' | 'progress' | 'finals' | 'contend'
  lastEvolvedYear: number
}

export type TacticalIdentity =
  | 'fast-movement'
  | 'contested'
  | 'defensive'
  | 'stoppage-focused'
  | 'corridor-heavy'

export interface ClubGameplan {
  offensiveStyle: 'attacking' | 'balanced' | 'defensive'
  tempo: 'fast' | 'medium' | 'slow'
  aggression: 'high' | 'medium' | 'low'
  kickInTactic: 'play-on-short' | 'play-on-long' | 'set-up-short' | 'set-up-long'
  centreTactic: 'spread' | 'cluster' | 'balanced'
  stoppageTactic: 'spread' | 'cluster' | 'balanced'
  defensiveLine: 'press' | 'hold' | 'run' | 'zone'
  midfieldLine: 'press' | 'hold' | 'run' | 'zone'
  forwardLine: 'press' | 'hold' | 'run' | 'zone'
  ruckNomination: RuckNomination
  rotations: 'low' | 'medium' | 'high'
}

export interface ClubHallOfFameEntry {
  playerId: string
  playerName: string
  inductedYear: number
  retiredYear: number
  ageAtRetirement: number
  gamesPlayed: number
  goals: number
  primaryPosition: import('./player').PlayerPositionType
}

// ---------------------------------------------------------------------------
// Media pressure
// ---------------------------------------------------------------------------

export type PressureStoryType =
  | 'losing-streak'
  | 'blowout-loss'
  | 'controversial-trade'
  | 'player-unrest'
  | 'discipline'

export interface MediaPressureStory {
  id: string
  type: PressureStoryType
  headline: string
  severity: 'minor' | 'moderate' | 'major'
  points: number
  expiresRound: number
}

export interface MediaPressure {
  score: number                     // 0-100
  lastScore: number                 // score from previous update, for trend
  activeStories: MediaPressureStory[]
}

// ---------------------------------------------------------------------------
// Budget allocation
// ---------------------------------------------------------------------------

export type BudgetDepartment = 'facilities' | 'coaching' | 'recruiting' | 'medical' | 'scouting'

export interface ClubBudgetAllocation {
  facilities: number   // 5-50, percentage
  coaching: number     // 5-50, percentage
  recruiting: number   // 5-50, percentage
  medical: number      // 5-50, percentage
  scouting: number     // 5-50, percentage
}

export interface Club {
  id: string
  name: string              // e.g. "Richmond"
  fullName: string          // e.g. "Richmond Tigers"
  abbreviation: string      // e.g. "RICH"
  mascot: string            // e.g. "Tigers"
  logoUrl?: string
  homeGround: string        // e.g. "MCG"
  established: number       // founding year
  premierships: number      // VFL/AFL premiership count
  tier: 'large' | 'medium' | 'small'  // for scheduling priority
  colors: ClubColors
  facilities: ClubFacilities
  finances: ClubFinances
  draftPicks: DraftPick[]
  gameplan: ClubGameplan
  tacticalIdentity: TacticalIdentity
  leadership: ClubLeadership
  culture?: ClubCulture
  identity?: ClubIdentity
  fanSatisfaction?: number
  lastSeasonLadderPosition?: number  // 1-18, undefined for first season
  hallOfFame?: ClubHallOfFameEntry[]
  notes?: string
  secondaryHomeGrounds?: string[]
  guernseyStyle?: GuernseyStyle
  rivalryClubIds?: string[]
  budgetAllocation?: ClubBudgetAllocation
  mediaPressure?: MediaPressure
  /** AI personality for non-player clubs */
  aiPersonality: {
    competitiveWindow: 'win-now' | 'balanced' | 'rebuilding'
    draftPhilosophy: 'best-available' | 'positional-need' | 'high-upside'
    riskTolerance: 'aggressive' | 'moderate' | 'conservative'
    tradeActivity: 'active' | 'moderate' | 'passive'
  }
}
