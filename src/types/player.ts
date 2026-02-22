/** What a player IS — 12 AFL positions */
export type PlayerPositionType =
  | 'BP'   // Back Pocket
  | 'FB'   // Full Back
  | 'HBF'  // Half Back Flank
  | 'CHB'  // Centre Half Back
  | 'W'    // Wing
  | 'IM'   // Inside Mid
  | 'OM'   // Outside Mid
  | 'RK'   // Ruckman
  | 'HFF'  // Half Forward Flank
  | 'CHF'  // Centre Half Forward
  | 'FP'   // Forward Pocket
  | 'FF'   // Full Forward

/** Where they play on field — 18 on-field + up to 8 interchange slots */
export type LineupSlot =
  | 'LBP' | 'RBP' | 'FB'                 // Back line
  | 'LHB' | 'RHB' | 'CHB'               // Half-back line
  | 'LW' | 'RW' | 'C'                    // Centre line
  | 'LHF' | 'RHF' | 'CHF'               // Half-forward line
  | 'LFP' | 'RFP' | 'FF'                // Forward line
  | 'RK' | 'RR' | 'ROV'                  // Followers
  | 'I1' | 'I2' | 'I3' | 'I4'           // Interchange (standard)
  | 'I5' | 'I6' | 'I7' | 'I8'           // Interchange (extended)

/** @deprecated Use PlayerPositionType instead */
export type PositionGroup = PlayerPositionType

export interface PlayerPosition {
  primary: PlayerPositionType
  secondary: PlayerPositionType[]
  /** Rating at each position (0-100). Higher = more capable at that position */
  ratings: Partial<Record<PlayerPositionType, number>>
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
  durability: number             // 1-100, higher = lower injury chance and faster recovery
  bigGameModifier: number        // -10 to +10, adjustment in finals/big games
}

export interface PlayerPersonality {
  ambition: number      // 1-100
  loyalty: number       // 1-100
  professionalism: number // 1-100
  temperament: number   // 1-100
}

export type PlayerPreferredRole =
  | 'inside-mid'
  | 'outside-mid'
  | 'wing-runner'
  | 'lockdown-defender'
  | 'intercept-defender'
  | 'rebound-defender'
  | 'pressure-forward'
  | 'key-forward'
  | 'small-forward'
  | 'ruck'
  | 'utility'

export type AgentArchetype =
  | 'loyal'
  | 'greedy'
  | 'premiership-chaser'
  | 'homebody'
  | 'mercenary'
  | 'risk-averse'

export type PlayerArchetype =
  | 'ball-winner'
  | 'line-breaker'
  | 'aerial-interceptor'
  | 'stopper'
  | 'rebounder'
  | 'forward-pressure'
  | 'target-mark'
  | 'crumber'
  | 'tap-specialist'
  | 'mobile-ruck'
  | 'two-way-utility'
  | 'intercept-defender'
  | 'lockdown-defender'
  | 'rebound-defender'
  | 'inside-bull'
  | 'outside-runner'
  | 'two-way-wing'
  | 'tap-ruck'
  | 'lead-up-forward'
  | 'power-forward'
  | 'small-pressure-forward'
  | 'swingman'

export type PlayerTrainingFocus =
  | 'endurance'
  | 'strength'
  | 'kicking'
  | 'contested-ball'
  | 'marking'
  | 'tackling'
  | 'ruck-craft'

export type UpskillStatus = 'active' | 'completed' | 'paused' | 'cancelled'

export interface PlayerUpskillPlan {
  id: string
  type: 'position' | 'skill'
  targetPosition?: PlayerPositionType
  targetSkill?: PlayerTrainingFocus
  progress: number
  status: UpskillStatus
  startedRound: number
  startedDate: string
  updatedDate: string
  completedDate?: string
}

export interface PlayerTradeRequest {
  active: boolean
  requestedAt: string
  nominatedClubIds: string[]
  reason: 'unhappy' | 'role' | 'contender' | 'home-state' | 'money'
}

export interface PlayerJumperHistoryEntry {
  year: number
  clubId: string
  jumperNumber: number
}

export type PlayerJumperPreferenceLevel = 'none' | 'want' | 'demand'

export interface PlayerJumperPreference {
  preferredNumbers: number[]
  level: PlayerJumperPreferenceLevel
}

export interface PlayerContract {
  yearsRemaining: number
  aav: number                    // Average annual value ($)
  yearByYear: number[]           // Salary for each remaining year
  isRestricted: boolean          // Restricted free agent when contract expires
  clauses?: import('./contract').ContractClause[]
  structure?: import('./contract').ContractStructure
  incentiveTotal?: number
}

export type PlayerContractTier = 'afl-listed' | 'state-league'

export interface StateLeagueContract {
  yearsRemaining: number
  annualValue: number
  signedDate: string
  source: 'affiliate' | 'recruitment' | 'renewal'
}

export interface PlayerContractHistoryEntry {
  date: string
  type: 'state-sign' | 'state-renew' | 'state-delist' | 'afl-sign'
  note: string
}

export interface PlayerInjury {
  type: string
  weeksRemaining: number
  initialWeeks?: number
  severity?: 'minor' | 'moderate' | 'major' | 'severe'
  occurredOn?: string
  recurrenceRisk?: number
  recoveryProgress?: number      // 0-100 progress to next week recovered
  gamesMissed?: number
  recurring?: boolean
  bodyRegion?: 'soft-tissue' | 'joint' | 'concussion' | 'structural' | 'impact'
}

export interface PlayerInjuryHistoryEntry {
  type: string
  occurredOn: string
  recoveredOn?: string
  initialWeeks: number
  gamesMissed: number
  recurring: boolean
  severity: 'minor' | 'moderate' | 'major' | 'severe'
  bodyRegion: 'soft-tissue' | 'joint' | 'concussion' | 'structural' | 'impact'
}

export interface PlayerSuspension {
  reason: string
  incidentType: string
  issuedOn: string
  totalWeeks: number
  weeksRemaining: number
  severity: 'low' | 'medium' | 'high' | 'severe'
}

export interface PlayerSuspensionHistoryEntry {
  reason: string
  incidentType: string
  issuedOn: string
  weeks: number
  severity: 'low' | 'medium' | 'high' | 'severe'
  challenged: boolean
  outcome: 'upheld' | 'reduced' | 'increased' | 'dismissed' | 'expired'
}

// ── Squad Pulse ──────────────────────────────────────────────────────────────

export type PulseTag =
  | 'peaking'       // Optimal: fresh + high fitness + good form  (+0.04)
  | 'fresh'         // Low fatigue, decent fitness               (+0.02)
  | 'confident'     // High form / good recent match rating       (+0.03)
  | 'breakthrough'  // Large attribute gain in training          (+0.02)
  | 'overcooked'    // Heavy training drove fatigue very high     (-0.04)
  | 'fatigued'      // High fatigue (match or general load)       (-0.03)
  | 'sore'          // Moderate soreness / mid fatigue            (-0.02)
  | 'struggling'    // Low form / poor recent performance         (-0.02)
  | 'returning'     // Recently cleared from injury               (-0.03)
  | 'undertrained'  // Minimal load, low base fitness             (-0.01)

export interface PlayerPulseNote {
  round: number
  date: string
  tag: PulseTag
  message: string
  /** Applied as (1 + modifier) in getAvailabilityMultiplier(). Range −0.05 to +0.05. */
  modifier: number
}

export interface PlayerCareerStats {
  gamesPlayed: number
  aflFantasyPoints: number
  superCoachPoints: number
  goals: number
  behinds: number
  disposals: number
  kicks: number
  handballs: number
  marks: number
  tackles: number
  hitouts: number
  contestedPossessions: number
  uncontestedPossessions: number
  clearances: number
  insideFifties: number
  rebound50s: number
  freesFor: number
  freesAgainst: number
  // Extended stats
  contestedMarks: number
  scoreInvolvements: number
  metresGained: number
  turnovers: number
  intercepts: number
  onePercenters: number
  bounces: number
  clangers: number
  goalAssists: number
}

export interface MoraleFactors {
  teamSuccess: number
  homeState: number
  contractStatus: number
  underpayment: number
  roleSatisfaction: number
  contractTerms: number
  jumperPreference: number
  culture: number
  meanReversion: number
}

// ---------------------------------------------------------------------------
// Player Moments — career-defining events stored on each player
// ---------------------------------------------------------------------------

export type PlayerMomentType =
  | 'debut'             // First senior AFL game
  | 'first-goal'        // First career goal
  | 'first-bog'         // First best-on-ground (rating ≥ 9.0)
  | 'breakout-game'     // Exceptional game (≥ 9.2) after already having first-bog
  | 'milestone-games'   // 50, 100, 150, 200 … games played
  | 'milestone-goals'   // 50, 100, 150, 200 … career goals
  | 'finals-hero'       // Outstanding finals performance
  | 'premiership'       // Member of a premiership team
  | 'major-injury'      // Severe injury (≥ 8 weeks)
  | 'brownlow-medal'    // Won the Brownlow Medal
  | 'coleman-medal'     // Won the Coleman Medal
  | 'all-australian'    // All-Australian selection
  | 'club-bnf'          // Club Best & Fairest
  | 'captain-appointed'     // Named captain of the club
  | 'captain-relinquished'  // Stripped of / stepped down from captaincy
  | 'vc-appointed'          // Named vice-captain of the club

export interface PlayerMoment {
  id: string
  type: PlayerMomentType
  date: string       // ISO date of the event
  year: number
  round: number      // -1 for off-season award events
  isFinal: boolean
  title: string
  description: string
  stats?: {
    disposals?: number
    goals?: number
    marks?: number
    tackles?: number
    hitouts?: number
    matchRating?: number
    aflFantasyPoints?: number
  }
  value?: number          // e.g. 100 for 100-game milestone; Brownlow votes
  opponentClubId?: string // the opposition club for match-based moments
}

export interface Player {
  id: string
  firstName: string
  lastName: string
  age: number
  dateOfBirth: string            // YYYY-MM-DD
  clubId: string
  jerseyNumber: number
  jumperHistory: PlayerJumperHistoryEntry[]
  jumperPreference?: PlayerJumperPreference
  height: number                 // cm
  weight: number                 // kg
  position: PlayerPosition
  preferredRole: PlayerPreferredRole
  archetype: PlayerArchetype
  attributes: PlayerAttributes
  hiddenAttributes: HiddenAttributes
  personality: PlayerPersonality
  agentArchetype?: AgentArchetype
  agentId?: string              // Assigned agent from the static pool
  homeState?: string
  contract: PlayerContract
  morale: number                 // 1-100
  moraleFactors?: MoraleFactors
  fitness: number                // 1-100
  fatigue: number                // 0-100
  form: number                   // 1-100
  injury: PlayerInjury | null
  isRookie: boolean              // On rookie list?
  listStatus: 'senior' | 'reserves' | 'injured-list'
  draftYear: number
  draftPick: number | null       // null for undrafted/rookie listed
  careerStats: PlayerCareerStats
  seasonStats: PlayerCareerStats
  injuryHistory: PlayerInjuryHistoryEntry[]
  suspension?: PlayerSuspension | null
  suspensionHistory?: PlayerSuspensionHistoryEntry[]
  tradeRequest?: PlayerTradeRequest | null
  trainingFocus?: PlayerTrainingFocus | null
  upskillPlans?: PlayerUpskillPlan[]
  contractTier?: PlayerContractTier
  stateLeagueContract?: StateLeagueContract | null
  contractHistory?: PlayerContractHistoryEntry[]
  matchRatingHistory?: number[]
  lastMatchRating?: number
  bio?: string
  seasonStatsHistory?: { year: number; stats: PlayerCareerStats }[]
  moments?: PlayerMoment[]
  /** Rolling history of weekly Squad Pulse notes (capped at 10 entries). */
  pulseNotes?: PlayerPulseNote[]
  /** Per-season attribute snapshots captured before offseason development. Key is the season year. Kept for last 5 seasons. */
  attributeSnapshots?: Record<number, Partial<PlayerAttributes>>
}
