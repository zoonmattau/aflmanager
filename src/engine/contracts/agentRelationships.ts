import type {
  AgentRelationship,
  AgentRelationshipModifiers,
  RelationshipTier,
  AgentRelationshipEvent,
  AgentEventType,
} from '@/types/agent'

// ---------------------------------------------------------------------------
// Defaults & tier computation
// ---------------------------------------------------------------------------

const SCORE_NEUTRAL = 50
const MAX_EVENT_HISTORY = 20

export function getDefaultRelationship(agentId: string): AgentRelationship {
  return {
    agentId,
    score: SCORE_NEUTRAL,
    tier: 'neutral',
    events: [],
  }
}

export function computeRelationshipTier(score: number): RelationshipTier {
  if (score >= 80) return 'trusted'
  if (score >= 60) return 'friendly'
  if (score >= 40) return 'neutral'
  if (score >= 20) return 'strained'
  return 'hostile'
}

// ---------------------------------------------------------------------------
// Per-tier modifier table
// ---------------------------------------------------------------------------

const TIER_MODIFIERS: Record<RelationshipTier, AgentRelationshipModifiers> = {
  trusted: {
    demandMultiplier:    0.93,
    refusalChanceDelta: -0.18,
    moodBias:           'upgrade',
    cooldownAdjust:     -1,
    acceptanceProbBonus: 0.08,
  },
  friendly: {
    demandMultiplier:    0.97,
    refusalChanceDelta: -0.08,
    moodBias:           'upgrade',
    cooldownAdjust:      0,
    acceptanceProbBonus: 0.04,
  },
  neutral: {
    demandMultiplier:    1.00,
    refusalChanceDelta:  0.00,
    moodBias:           'none',
    cooldownAdjust:      0,
    acceptanceProbBonus: 0.00,
  },
  strained: {
    demandMultiplier:    1.06,
    refusalChanceDelta:  0.12,
    moodBias:           'downgrade',
    cooldownAdjust:      1,
    acceptanceProbBonus: -0.05,
  },
  hostile: {
    demandMultiplier:    1.12,
    refusalChanceDelta:  0.25,
    moodBias:           'downgrade',
    cooldownAdjust:      1,
    acceptanceProbBonus: -0.10,
  },
}

export function getRelationshipModifiers(rel: AgentRelationship): AgentRelationshipModifiers {
  return TIER_MODIFIERS[rel.tier]
}

// ---------------------------------------------------------------------------
// Score delta table
// ---------------------------------------------------------------------------

const EVENT_SCORE_DELTAS: Record<AgentEventType, number> = {
  'signed-accepted':    6,
  'quick-signing':      3,
  'all-demands-met':    4,
  'fair-rejection':    -2,
  'low-ball-rejection': -5,
  'club-withdrew':     -3,
  'negotiation-expired': -2,
  'counter-accepted':   5,
}

// ---------------------------------------------------------------------------
// Apply negotiation outcome events to a relationship
// ---------------------------------------------------------------------------

export function applyNegotiationOutcome(
  rel: AgentRelationship,
  eventTypes: AgentEventType[],
  date: string,
  playerId: string,
): AgentRelationship {
  const newEvents: AgentRelationshipEvent[] = eventTypes.map(type => ({
    type,
    date,
    scoreDelta: EVENT_SCORE_DELTAS[type],
    playerId,
  }))

  const totalDelta = newEvents.reduce((sum, e) => sum + e.scoreDelta, 0)
  const newScore = Math.max(0, Math.min(100, rel.score + totalDelta))
  const newTier = computeRelationshipTier(newScore)

  return {
    ...rel,
    score: newScore,
    tier: newTier,
    events: [...rel.events.slice(-(MAX_EVENT_HISTORY - newEvents.length)), ...newEvents],
    lastInteractionDate: date,
  }
}

// ---------------------------------------------------------------------------
// Mood bias helper
// ---------------------------------------------------------------------------

type PlayerMood = 'eager' | 'neutral' | 'reluctant' | 'hostile'

/** Apply a mood bias upgrade or downgrade by one step on the mood ladder. */
export function applyMoodBias(
  current: PlayerMood,
  bias: 'upgrade' | 'downgrade' | 'none',
): PlayerMood {
  if (bias === 'none') return current
  const ladder: PlayerMood[] = ['hostile', 'reluctant', 'neutral', 'eager']
  const idx = ladder.indexOf(current)
  if (bias === 'upgrade') return ladder[Math.min(ladder.length - 1, idx + 1)]
  return ladder[Math.max(0, idx - 1)]
}
