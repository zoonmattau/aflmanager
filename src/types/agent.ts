import type { AgentArchetype } from './player'

// ---------------------------------------------------------------------------
// Agent profile (static pool)
// ---------------------------------------------------------------------------

export interface AgentProfile {
  id: string
  name: string
  archetype: AgentArchetype
  /** -10 to +10: positive = leans toward loyalty in negotiations */
  baseLoyaltyBias: number
  /** -10 to +10: positive = pushes for higher demands */
  baseGreedBias: number
}

// ---------------------------------------------------------------------------
// Relationship tier
// ---------------------------------------------------------------------------

export type RelationshipTier = 'trusted' | 'friendly' | 'neutral' | 'strained' | 'hostile'

// ---------------------------------------------------------------------------
// Relationship event log
// ---------------------------------------------------------------------------

export type AgentEventType =
  | 'signed-accepted'        // Player signed with our club
  | 'quick-signing'          // Signed in ≤3 rounds (bonus)
  | 'all-demands-met'        // Final offer met or exceeded player demand
  | 'fair-rejection'         // Club offer rejected but was close (aavRatio >0.90)
  | 'low-ball-rejection'     // Club offer rejected as too low (<0.85 aav ratio)
  | 'club-withdrew'          // Club withdrew from negotiation unilaterally
  | 'negotiation-expired'    // Talks expired without resolution
  | 'counter-accepted'       // Club accepted agent's counter-offer

export interface AgentRelationshipEvent {
  type: AgentEventType
  date: string
  scoreDelta: number
  playerId: string
  note?: string
}

// ---------------------------------------------------------------------------
// Stored relationship per-agent
// ---------------------------------------------------------------------------

export interface AgentRelationship {
  agentId: string
  score: number               // 0-100 (neutral starts at 50)
  tier: RelationshipTier
  events: AgentRelationshipEvent[]
  lastInteractionDate?: string
}

// ---------------------------------------------------------------------------
// Modifiers applied to negotiations based on relationship tier
// ---------------------------------------------------------------------------

export interface AgentRelationshipModifiers {
  /** Multiplier applied to generated AAV demand */
  demandMultiplier: number
  /** Delta added to flat-rejection chance threshold */
  refusalChanceDelta: number
  /** Whether to upgrade or downgrade initial player mood */
  moodBias: 'upgrade' | 'downgrade' | 'none'
  /** Added to negotiation cooldown ticks (can be negative) */
  cooldownAdjust: number
  /** Added to final acceptance probability */
  acceptanceProbBonus: number
}
