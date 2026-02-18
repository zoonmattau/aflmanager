// ---------------------------------------------------------------------------
// Contract Negotiation Types
// ---------------------------------------------------------------------------

// Clause types
export type ContractClauseType =
  | 'no-trade'
  | 'limited-trade'
  | 'home-state'
  | 'contender-only'
  | 'player-option'
  | 'team-option'
  | 'vesting'
  | 'role-promise'
  | 'leadership-promise'
  | 'performance-bonus'
  | 'games-bonus'
  | 'finals-bonus'
  | 'awards-bonus'
  | 'goals-bonus'

export type ContractMilestoneType =
  | 'games-played'
  | 'awards'
  | 'goals'
  | 'team-finals'

export interface ContractVestingCondition {
  type: ContractMilestoneType
  threshold: number
}

export interface ContractClause {
  type: ContractClauseType
  vetoClubIds?: string[]           // limited-trade
  preferredState?: string          // home-state
  bonusAmount?: number             // bonus / vesting amount
  bonusThreshold?: { stat: string; value: number }  // stat-driven bonuses
  appliesToYear?: number           // 1-based contract year
  optionYear?: number              // 1-based option year
  vestingCondition?: ContractVestingCondition
  promisedPosition?: import('./player').PlayerPositionType
  leadershipLevel?: 'group' | 'vice-captain' | 'captain'
  note?: string
}

export type NegotiationDemandType =
  | 'salary'
  | 'term'
  | 'role-promise'
  | 'leadership-group-role'
  | 'contender-ambition'
  | 'home-state-preference'
  | 'no-trade-clause'
  | 'limited-trade-clause'
  | 'performance-incentives'
  | 'option-control'
  | 'vesting-protection'

export interface NegotiationDemand {
  type: NegotiationDemandType
  priority: 'low' | 'medium' | 'high'
  targetValue?: string
}

export interface NegotiationConcessions {
  promisedPosition?: import('./player').PlayerPositionType
  leadershipGroupRole?: boolean
  contenderAmbition?: boolean
  homeStateSupport?: boolean
  noTradeClause?: boolean
}

export interface NegotiationFeedbackItem {
  type: NegotiationDemandType
  priority: 'low' | 'medium' | 'high'
  satisfiedByOffer: boolean
  message: string
  actionHint: string
}

export interface NegotiationFeedback {
  summary: string
  signableNow: boolean
  requiredForSignature: NegotiationDemandType[]
  items: NegotiationFeedbackItem[]
}

// Contract structure type
export type ContractStructure = 'flat' | 'front-loaded' | 'back-loaded' | 'escalating'

// Negotiation offer (used by both club and player)
export interface NegotiationOffer {
  years: number
  aav: number
  yearByYear: number[]
  structure: ContractStructure
  clauses: ContractClause[]
  incentiveTotal: number
  concessions?: NegotiationConcessions
}

// A single exchange in the negotiation
export interface NegotiationRound {
  roundNumber: number
  offeredBy: 'club' | 'player'
  offer: NegotiationOffer
  gameDate: string
}

// Negotiation status lifecycle
export type NegotiationStatus =
  | 'pending'
  | 'player-considering'
  | 'counter-offered'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'withdrawn'

// Active in-progress negotiation
export interface ActiveNegotiation {
  id: string
  playerId: string
  clubId: string
  status: NegotiationStatus
  playerDemand: NegotiationOffer    // What the player wants (updated on counters)
  demandProfile: NegotiationDemand[] // Explicit asks that drive counters
  latestFeedback: NegotiationFeedback | null
  rounds: NegotiationRound[]        // Full history
  maxRounds: number                 // Auto-expire after this many exchanges
  cooldownRemaining: number         // Ticks until player responds
  startedAtRound: number
  startedAtDate: string
  isReSigning: boolean              // Own player vs external FA
  playerMood: 'eager' | 'neutral' | 'reluctant' | 'hostile'
  mediaLeaked: boolean
  leakedAtRound?: number
}

// Completed negotiation (history)
export interface CompletedNegotiation {
  id: string
  playerId: string
  clubId: string
  outcome: 'signed' | 'rejected' | 'expired' | 'withdrawn'
  finalOffer?: NegotiationOffer
  completedDate: string
  totalRounds: number
}

// Top-level tracker on GameState
export interface NegotiationTracker {
  active: Record<string, ActiveNegotiation>
  completed: CompletedNegotiation[]
  refusedPlayerIds: string[]        // Players who refused to negotiate this season
}
