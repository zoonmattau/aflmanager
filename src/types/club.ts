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

export interface Club {
  id: string
  name: string              // e.g. "Richmond"
  fullName: string          // e.g. "Richmond Tigers"
  abbreviation: string      // e.g. "RICH"
  mascot: string            // e.g. "Tigers"
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
  fanSatisfaction?: number
  lastSeasonLadderPosition?: number  // 1-18, undefined for first season
  /** AI personality for non-player clubs */
  aiPersonality: {
    competitiveWindow: 'win-now' | 'balanced' | 'rebuilding'
    draftPhilosophy: 'best-available' | 'positional-need' | 'high-upside'
    riskTolerance: 'aggressive' | 'moderate' | 'conservative'
    tradeActivity: 'active' | 'moderate' | 'passive'
  }
}
