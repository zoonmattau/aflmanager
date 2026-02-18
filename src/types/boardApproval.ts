import type { ApprovalFactor } from './facilityUpgrade'

export type BoardApprovalCategory = 'contract' | 'trade' | 'staff-hire'

// ---------------------------------------------------------------------------
// Board instability & spill events
// ---------------------------------------------------------------------------

/** The type of board challenge or instability event. */
export type SpillEventType =
  | 'board-challenge'       // Faction of board members publicly challenge coach
  | 'vote-of-confidence'    // Full board calls a formal confidence vote
  | 'emergency-meeting'     // Crisis meeting; immediate job security hit + expectation reset
  | 'chairman-change'       // Chairman replaced; strategy and expectations may shift

/** The outcome of a resolved spill event. */
export type SpillOutcome =
  | 'survived'              // Coach retains position without conditions
  | 'on-notice'             // Retained but under formal review with new expectations
  | 'chairman-replaced'     // New chairman installed (chairman-change events)
  | 'dismissed'             // Rare mid-season firing

export interface SpillEvent {
  id: string
  type: SpillEventType
  triggeredRound: number
  triggeredYear: number
  triggeredDate: string
  instabilityScore: number
  headline: string
  description: string
  resolved: boolean
  resolvedDate?: string
  outcome?: SpillOutcome
  jobSecurityDelta: number        // Applied on resolution (negative = security lost)
  newExpectation?: string         // If season expectations shift
  newCompetitiveWindow?: 'win-now' | 'balanced' | 'rebuilding' // If club strategy shifts
}

export interface BoardInstabilityState {
  /** Current instability pressure (0–100). Computed each round. */
  score: number
  /** Consecutive losses without a win or draw. Resets on win/draw. */
  consecutiveLosses: number
  /** History of all spill events this save. */
  spillHistory: SpillEvent[]
  /** Round number when last spill event was triggered (−1 = never). */
  lastSpillRound: number
  /** How supportive the current chairman is (0–100; 50 = neutral). */
  chairmanSupportLevel: number
}

export interface BoardApprovalResult {
  category: BoardApprovalCategory
  probability: number // 0-100
  factors: ApprovalFactor[]
  requiresApproval: boolean
}

export interface BoardApprovalRecord {
  id: string
  category: BoardApprovalCategory
  date: string
  description: string
  probability: number
  approved: boolean
  factors: ApprovalFactor[]
  relatedEntityId?: string
  clubId: string
}

export interface BoardApprovalTracker {
  records: BoardApprovalRecord[]
  /** category:entityId -> ISO date when cooldown expires */
  denialCooldowns: Record<string, string>
}
