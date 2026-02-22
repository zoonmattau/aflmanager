/**
 * speechEngine.ts
 *
 * Quarter-break team-talk system. The coach can choose a delivery order, target
 * audience (full squad or individual lines), tone, and an optional specific
 * player to praise or roast. Effects are applied to player morale.
 */

import type { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpeechTone = 'fire-up' | 'calm' | 'roast' | 'strategic' | 'praise'
export type SpeechAudience = 'squad' | 'backs' | 'midfield' | 'forwards'
export type DeliveryOrder = 'squad-first' | 'lines-first'

export interface SpeechSegment {
  audience: SpeechAudience
  tone: SpeechTone
  /** For 'roast' or 'praise' — specific player ID */
  targetPlayerId?: string
}

export interface SpeechDelivery {
  deliveryOrder: DeliveryOrder
  speeches: SpeechSegment[]
}

export interface SpeechEffect {
  audienceLabel: string
  playerIds: string[]
  moraleDelta: number      // signed, applied to every player in playerIds
  description: string      // e.g. "Backs fired up (+8 morale)"
  isIndividual: boolean    // true = roast/praise of a single player
  targetPlayerId?: string  // the singled-out player
  targetMoraleDelta?: number // morale delta for the singled-out player (may differ from rest)
}

export interface SpeechContext {
  /** How many quarters completed (1-3) */
  quarter: number
  /** Margin — positive = user is winning */
  margin: number
  /** How many times each tone has been used so far this match (for fatigue) */
  toneHistory: Partial<Record<SpeechTone, number>>
}

// ---------------------------------------------------------------------------
// Effect tables
// ---------------------------------------------------------------------------

interface ToneRange { min: number; max: number }

function roll(rng: SeededRNG, min: number, max: number): number {
  return Math.round(min + rng.next() * (max - min))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// Base ranges per tone
const BASE_RANGES: Record<SpeechTone, ToneRange> = {
  'fire-up':  { min: 6,  max: 12 },
  'calm':     { min: 4,  max: 8  },
  'roast':    { min: 3,  max: 6  },  // for the rest of the group (target gets negative)
  'strategic':{ min: 3,  max: 6  },
  'praise':   { min: 1,  max: 3  },  // for the rest of the group (target gets bigger positive)
}

const ROAST_TARGET_RANGE:  ToneRange = { min: -12, max: -6 }
const PRAISE_TARGET_RANGE: ToneRange = { min: 10,  max: 16 }

// Contextual ceiling adjustments
function contextBonus(tone: SpeechTone, margin: number): number {
  if (tone === 'fire-up'  && margin <= -24) return 4   // Down 4+ goals
  if (tone === 'calm'     && margin >=  24) return 4   // Up 4+ goals
  return 0
}

// Fatigue penalty for repeated tones (reduces ceiling each re-use)
function fatiguePenalty(tone: SpeechTone, toneHistory: Partial<Record<SpeechTone, number>>): number {
  const uses = toneHistory[tone] ?? 0
  return uses * 2   // -2 per previous use
}

// ---------------------------------------------------------------------------
// Core calculator
// ---------------------------------------------------------------------------

/**
 * Calculate the morale effect of a speech delivery.
 * Called when the user clicks "Deliver Talk".
 *
 * @param segments   - The speech segments to deliver
 * @param context    - Match context (quarter, margin, prior tone history)
 * @param rng        - Seeded PRNG for reproducibility
 * @param audiencePlayerMap - Map from audience → player IDs in that line
 */
export function calculateSpeechEffects(
  segments: SpeechSegment[],
  context: SpeechContext,
  rng: SeededRNG,
  audiencePlayerMap: Record<SpeechAudience, string[]>,
): SpeechEffect[] {
  const effects: SpeechEffect[] = []

  for (const seg of segments) {
    const { audience, tone, targetPlayerId } = seg
    const allIds = audiencePlayerMap[audience]
    const bonus   = contextBonus(tone, context.margin)
    const fatigue = fatiguePenalty(tone, context.toneHistory)

    switch (tone) {
      case 'fire-up':
      case 'calm':
      case 'strategic': {
        const base = BASE_RANGES[tone]
        const delta = clamp(roll(rng, base.min, base.max) + bonus - fatigue, 0, 20)
        const label = tone === 'fire-up' ? 'fired up' : tone === 'calm' ? 'calmed' : 'focused'
        effects.push({
          audienceLabel: audienceLabel(audience),
          playerIds: allIds,
          moraleDelta: delta,
          description: `${audienceLabel(audience)} ${label} (+${delta} morale)`,
          isIndividual: false,
        })
        break
      }

      case 'roast': {
        if (!targetPlayerId) {
          // No target specified — treat as mild group fire-up
          const delta = clamp(roll(rng, 3, 7) - fatigue, 0, 10)
          effects.push({
            audienceLabel: audienceLabel(audience),
            playerIds: allIds,
            moraleDelta: delta,
            description: `${audienceLabel(audience)} challenged (+${delta} morale)`,
            isIndividual: false,
          })
          break
        }
        const targetDelta = roll(rng, ROAST_TARGET_RANGE.min, ROAST_TARGET_RANGE.max)
        const groupDelta  = clamp(roll(rng, BASE_RANGES.roast.min, BASE_RANGES.roast.max) + bonus - fatigue, 0, 10)
        const restIds     = allIds.filter((id) => id !== targetPlayerId)
        effects.push({
          audienceLabel: audienceLabel(audience),
          playerIds: restIds,
          moraleDelta: groupDelta,
          description: `${audienceLabel(audience)} lifted (+${groupDelta} morale)`,
          isIndividual: true,
          targetPlayerId,
          targetMoraleDelta: targetDelta,
        })
        break
      }

      case 'praise': {
        if (!targetPlayerId) {
          const delta = clamp(roll(rng, 3, 7), 0, 10)
          effects.push({
            audienceLabel: audienceLabel(audience),
            playerIds: allIds,
            moraleDelta: delta,
            description: `${audienceLabel(audience)} inspired (+${delta} morale)`,
            isIndividual: false,
          })
          break
        }
        const targetDelta = roll(rng, PRAISE_TARGET_RANGE.min, PRAISE_TARGET_RANGE.max)
        const groupDelta  = clamp(roll(rng, BASE_RANGES.praise.min, BASE_RANGES.praise.max) - fatigue, 0, 5)
        const restIds     = allIds.filter((id) => id !== targetPlayerId)
        effects.push({
          audienceLabel: audienceLabel(audience),
          playerIds: restIds,
          moraleDelta: groupDelta,
          description: `${audienceLabel(audience)} inspired (+${groupDelta} morale)`,
          isIndividual: true,
          targetPlayerId,
          targetMoraleDelta: targetDelta,
        })
        break
      }
    }
  }

  return effects
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function audienceLabel(audience: SpeechAudience): string {
  switch (audience) {
    case 'squad':    return 'Squad'
    case 'backs':    return 'Backs'
    case 'midfield': return 'Midfield'
    case 'forwards': return 'Forwards'
  }
}

export function toneLabel(tone: SpeechTone): string {
  switch (tone) {
    case 'fire-up':   return 'Fire Up'
    case 'calm':      return 'Calm'
    case 'roast':     return 'Roast'
    case 'strategic': return 'Strategic'
    case 'praise':    return 'Praise'
  }
}

export function toneDescription(tone: SpeechTone): string {
  switch (tone) {
    case 'fire-up':   return 'Motivational — high energy, elevates the group'
    case 'calm':      return 'Measured — resets nerves, steadies the group'
    case 'roast':     return 'Call out one player — group responds, player stings'
    case 'strategic': return 'Analytical — slight morale boost plus tactical edge'
    case 'praise':    return 'Highlight one player — they soar, group follows'
  }
}

/** Build a simple player → line map for a club's active players. */
export function buildAudiencePlayerMap(
  playerIds: string[],
  players: Record<string, { id: string; position: { primary: string } }>,
): Record<SpeechAudience, string[]> {
  const backs: string[]    = []
  const midfield: string[] = []
  const forwards: string[] = []

  for (const id of playerIds) {
    const p = players[id]
    if (!p) continue
    const pos = p.position.primary
    if (['FB', 'HB', 'BPL', 'BPR', 'CHB'].includes(pos)) {
      backs.push(id)
    } else if (['RK', 'ROV', 'MID', 'HF', 'CHF'].includes(pos)) {
      midfield.push(id)
    } else if (['FF', 'FPL', 'FPR'].includes(pos)) {
      forwards.push(id)
    } else {
      midfield.push(id)   // default to midfield for utility/unknown
    }
  }

  return {
    squad:    playerIds,
    backs,
    midfield,
    forwards,
  }
}
