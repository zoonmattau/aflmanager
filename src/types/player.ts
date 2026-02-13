export type PositionGroup =
  | 'FB'   // Full Back
  | 'HB'   // Half Back
  | 'C'    // Centre
  | 'HF'   // Half Forward
  | 'FF'   // Full Forward
  | 'FOLL' // Follower (Ruck)
  | 'INT'  // Interchange
  | 'MID'  // Midfielder
  | 'WING' // Wing

export interface PlayerPosition {
  primary: PositionGroup
  secondary: PositionGroup[]
  /** Rating at each position group (0-100). Higher = more capable at that position */
  ratings: Partial<Record<PositionGroup, number>>
}

export interface PlayerAttributes {
  // Kicking (5)
  kickingEfficiency: number
  kickingDistance: number
  setShot: number
  dropPunt: number
  snap: number

  // Handball (3)
  handballEfficiency: number
  handballDistance: number
  handballReceive: number

  // Marking (4)
  markingOverhead: number
  markingLeading: number
  markingContested: number
  markingUncontested: number

  // Physical (7)
  speed: number
  acceleration: number
  endurance: number
  strength: number
  agility: number
  leap: number
  recovery: number

  // Contested (4)
  tackling: number
  contested: number
  clearance: number
  hardness: number

  // Game Sense (6)
  disposalDecision: number
  fieldKicking: number
  positioning: number
  creativity: number
  anticipation: number
  composure: number

  // Offensive (5)
  goalkicking: number
  groundBallGet: number
  insideForward: number
  leadingPatterns: number
  scoringInstinct: number

  // Defensive (5)
  intercept: number
  spoiling: number
  oneOnOne: number
  zonalAwareness: number
  rebounding: number

  // Ruck (3)
  hitouts: number
  ruckCreative: number
  followUp: number

  // Mental (7)
  pressure: number
  leadership: number
  workRate: number
  consistency: number
  determination: number
  teamPlayer: number
  clutch: number

  // Set Pieces (3)
  centreBounce: number
  boundaryThrowIn: number
  stoppage: number
}

export interface HiddenAttributes {
  potentialCeiling: number       // 1-100, max attribute average this player can reach
  developmentRate: number        // 0.5-2.0, multiplier on development speed
  peakAgeStart: number           // typically 24-28
  peakAgeEnd: number             // typically 28-32
  declineRate: number            // 0.5-2.0, multiplier on decline speed
  injuryProneness: number        // 1-100, higher = more prone
  bigGameModifier: number        // -10 to +10, adjustment in finals/big games
}

export interface PlayerPersonality {
  ambition: number      // 1-100
  loyalty: number       // 1-100
  professionalism: number // 1-100
  temperament: number   // 1-100
}

export interface PlayerContract {
  yearsRemaining: number
  aav: number                    // Average annual value ($)
  yearByYear: number[]           // Salary for each remaining year
  isRestricted: boolean          // Restricted free agent when contract expires
}

export interface PlayerInjury {
  type: string
  weeksRemaining: number
}

export interface PlayerCareerStats {
  gamesPlayed: number
  goals: number
  behinds: number
  disposals: number
  kicks: number
  handballs: number
  marks: number
  tackles: number
  hitouts: number
  contestedPossessions: number
  clearances: number
  insideFifties: number
  rebound50s: number
}

export interface Player {
  id: string
  firstName: string
  lastName: string
  age: number
  dateOfBirth: string            // YYYY-MM-DD
  clubId: string
  jerseyNumber: number
  height: number                 // cm
  weight: number                 // kg
  position: PlayerPosition
  attributes: PlayerAttributes
  hiddenAttributes: HiddenAttributes
  personality: PlayerPersonality
  contract: PlayerContract
  morale: number                 // 1-100
  fitness: number                // 1-100
  fatigue: number                // 0-100
  form: number                   // 1-100
  injury: PlayerInjury | null
  isRookie: boolean              // On rookie list?
  draftYear: number
  draftPick: number | null       // null for undrafted/rookie listed
  careerStats: PlayerCareerStats
  seasonStats: PlayerCareerStats
}
