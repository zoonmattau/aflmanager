// ---------------------------------------------------------------------------
// Contract Negotiation Types
// ---------------------------------------------------------------------------

// Clause types
export type ContractClauseType =
  | 'no-trade'
  | 'limited-trade'
  | 'home-state'
  | 'contender-only'
  | 'performance-bonus'
  | 'games-bonus'
  | 'finals-bonus'

export interface ContractClause {
  type: ContractClauseType
  vetoClubIds?: string[]           // limited-trade
  preferredState?: string          // home-state
  bonusAmount?: number             // all bonus types
  bonusThreshold?: { stat: string; value: number }  // performance-bonus
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
