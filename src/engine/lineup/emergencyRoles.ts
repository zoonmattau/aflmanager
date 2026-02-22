/**
 * Emergency Role Coverage Engine
 *
 * Determines position-fit penalties when players are assigned outside
 * their eligible positions (emergency coverage). Provides multipliers
 * for match simulation and display metadata for the lineup UI.
 */

import type { Player, LineupSlot, PlayerPositionType } from '@/types/player'
import { getPositionSuitabilityForSlot } from '@/engine/player/positionEligibility'
import { getPlayerPositionRating } from '@/engine/player/playerRating'
import { SLOT_POSITION_COMPATIBILITY } from '@/engine/core/constants'

// ---------------------------------------------------------------------------
// Position line groupings (for cross-line penalty calculation)
// ---------------------------------------------------------------------------

const POSITION_LINE: Record<PlayerPositionType, 'def' | 'mid' | 'fwd' | 'rk'> = {
  FB:  'def', BP:  'def', HBF: 'def', CHB: 'def',
  W:   'mid', OM:  'mid', IM:  'mid',
  HFF: 'fwd', CHF: 'fwd', FF:  'fwd', FP:  'fwd',
  RK:  'rk',
}

const SLOT_LINE: Partial<Record<LineupSlot, 'def' | 'mid' | 'fwd' | 'rk'>> = {
  LBP: 'def', RBP: 'def', FB: 'def',
  LHB: 'def', RHB: 'def', CHB: 'def',
  LW:  'mid', RW:  'mid', C:  'mid', RR: 'mid', ROV: 'mid',
  LHF: 'fwd', RHF: 'fwd', CHF: 'fwd',
  LFP: 'fwd', RFP: 'fwd', FF:  'fwd',
  RK:  'rk',
  // Interchange — no fixed line
}

function getSlotLine(slot: LineupSlot): 'def' | 'mid' | 'fwd' | 'rk' | 'bench' {
  return SLOT_LINE[slot] ?? 'bench'
}

function getPlayerLine(player: Player): 'def' | 'mid' | 'fwd' | 'rk' {
  return POSITION_LINE[player.position.primary] ?? 'mid'
}

// ---------------------------------------------------------------------------
// Fit multipliers
// ---------------------------------------------------------------------------

/**
 * Performance multiplier for a player assigned to a given slot.
 * Applied to the base availability multiplier in match simulation.
 *
 * - primary    → 1.00  (no penalty)
 * - secondary  → 0.94  (−6%: slight comfort zone stretch)
 * - emergency — same line   → 0.84  (−16%)
 * - emergency — cross line  → 0.78  (−22%)
 * - emergency — into ruck   → 0.70  (−30%: extreme specialist mismatch)
 */
export function getPositionFitMultiplier(player: Player, slot: LineupSlot): number {
  const suitability = getPositionSuitabilityForSlot(player, slot)
  if (suitability === 'primary') return 1.0
  if (suitability === 'secondary') return 0.94

  // Out-of-position: measure cross-line distance
  const isInterchange = /^I\d$/.test(slot)
  if (isInterchange) return 0.88 // interchanging OOP still impacts match

  const slotLine = getSlotLine(slot)
  const playerLine = getPlayerLine(player)

  if (slotLine === 'rk' && playerLine !== 'rk') return 0.70
  if (slotLine === playerLine) return 0.84
  return 0.78
}

/** Additional fatigue accumulation rate for out-of-position players (additive %). */
export function getEmergencyFatigueBoost(player: Player, slot: LineupSlot): number {
  const suitability = getPositionSuitabilityForSlot(player, slot)
  if (suitability === 'primary') return 0
  if (suitability === 'secondary') return 0.08  // +8% fatigue load
  const slotLine = getSlotLine(slot)
  if (slotLine === 'rk' && getPlayerLine(player) !== 'rk') return 0.35
  if (slotLine === getPlayerLine(player)) return 0.18
  return 0.25
}

/** Additional injury probability multiplier for out-of-position players. */
export function getEmergencyInjuryRiskBoost(player: Player, slot: LineupSlot): number {
  const suitability = getPositionSuitabilityForSlot(player, slot)
  if (suitability === 'primary') return 1.0
  if (suitability === 'secondary') return 1.08
  const slotLine = getSlotLine(slot)
  if (slotLine === 'rk' && getPlayerLine(player) !== 'rk') return 1.45
  if (slotLine === getPlayerLine(player)) return 1.20
  return 1.32
}

// ---------------------------------------------------------------------------
// Display metadata
// ---------------------------------------------------------------------------

export type FitLevel = 'primary' | 'secondary' | 'emergency'

export interface FitDisplay {
  level: FitLevel
  label: string
  shortLabel: string
  colour: string          // Tailwind text class
  bgClass: string         // Tailwind bg/border class for PlayerMagnet
  borderClass: string
  perfPenaltyPct: number  // 0 | 6 | 16 | 22 | 30
  fatiguePct: number
  injuryMult: number
  description: string
}

export function getFitDisplay(player: Player, slot: LineupSlot): FitDisplay {
  const suitability = getPositionSuitabilityForSlot(player, slot)

  if (suitability === 'primary') {
    return {
      level: 'primary',
      label: 'Natural position',
      shortLabel: 'Natural',
      colour: 'text-emerald-400',
      bgClass: 'bg-emerald-950/60',
      borderClass: 'border-emerald-600/70',
      perfPenaltyPct: 0,
      fatiguePct: 0,
      injuryMult: 1.0,
      description: 'Player is in their natural position. No performance penalty.',
    }
  }

  if (suitability === 'secondary') {
    return {
      level: 'secondary',
      label: 'Manageable',
      shortLabel: 'Manageable',
      colour: 'text-amber-400',
      bgClass: 'bg-amber-950/50',
      borderClass: 'border-amber-500/70',
      perfPenaltyPct: 6,
      fatiguePct: 8,
      injuryMult: 1.08,
      description: 'Slightly outside comfort zone. Minor performance and fatigue penalty.',
    }
  }

  // Out of position — determine cross-line severity
  const slotLine = getSlotLine(slot)
  const playerLine = getPlayerLine(player)

  if (slotLine === 'rk' && playerLine !== 'rk') {
    return {
      level: 'emergency',
      label: 'Emergency Ruck',
      shortLabel: 'Emrg',
      colour: 'text-rose-400',
      bgClass: 'bg-rose-950/60',
      borderClass: 'border-rose-500/80',
      perfPenaltyPct: 30,
      fatiguePct: 35,
      injuryMult: 1.45,
      description: 'Non-ruckman filling the ruck role. Severe performance, fatigue, and injury penalties.',
    }
  }

  if (slotLine === playerLine) {
    return {
      level: 'emergency',
      label: 'Emergency (same line)',
      shortLabel: 'Emrg',
      colour: 'text-orange-400',
      bgClass: 'bg-orange-950/50',
      borderClass: 'border-orange-500/75',
      perfPenaltyPct: 16,
      fatiguePct: 18,
      injuryMult: 1.20,
      description: 'Out of position but staying within their line. Significant performance penalty.',
    }
  }

  return {
    level: 'emergency',
    label: 'Emergency (cross-line)',
    shortLabel: 'Emrg',
    colour: 'text-rose-400',
    bgClass: 'bg-rose-950/60',
    borderClass: 'border-rose-500/80',
    perfPenaltyPct: 22,
    fatiguePct: 25,
    injuryMult: 1.32,
    description: 'Playing on an unfamiliar line. Heavy performance and significant injury risk penalties.',
  }
}

// ---------------------------------------------------------------------------
// Emergency alternative suggestions
// ---------------------------------------------------------------------------

export interface EmergencyAlternative {
  player: Player
  suitability: 'primary' | 'secondary' | 'out-of-position'
  positionRating: number
  fitMultiplier: number
}

/**
 * Find the best alternative players for a slot, ranked by fit then by rating.
 * Excludes players already in the lineup.
 */
export function getBestEmergencyAlternatives(
  slot: LineupSlot,
  availablePlayers: Player[],
  excludePlayerIds: Set<string>,
  limit = 3,
): EmergencyAlternative[] {
  const slotPrimary = SLOT_POSITION_COMPATIBILITY[slot]?.[0]

  return availablePlayers
    .filter((p) => !excludePlayerIds.has(p.id) && !p.injury)
    .map((p) => {
      const suitability = getPositionSuitabilityForSlot(p, slot)
      const positionRating = slotPrimary ? getPlayerPositionRating(p, slotPrimary) : 0
      const fitMultiplier = getPositionFitMultiplier(p, slot)
      return { player: p, suitability, positionRating, fitMultiplier }
    })
    .sort((a, b) => {
      // Primary > secondary > out-of-position, then by effective rating
      const tierOrder = { primary: 0, secondary: 1, 'out-of-position': 2 }
      const tierDiff = tierOrder[a.suitability] - tierOrder[b.suitability]
      if (tierDiff !== 0) return tierDiff
      return b.positionRating * b.fitMultiplier - a.positionRating * a.fitMultiplier
    })
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Lineup-wide emergency summary
// ---------------------------------------------------------------------------

export interface EmergencySlotInfo {
  slot: LineupSlot
  playerId: string
  player: Player
  fitDisplay: FitDisplay
  alternatives: EmergencyAlternative[]
}

/**
 * Scan an entire lineup for emergency/out-of-position assignments.
 * Returns only the slots that are non-primary fit.
 */
export function getLineupEmergencySlots(
  lineup: Record<string, string>,
  players: Record<string, Player>,
  availablePlayers: Player[],
): EmergencySlotInfo[] {
  const usedIds = new Set(Object.values(lineup).filter(Boolean))
  const results: EmergencySlotInfo[] = []

  for (const [slotStr, playerId] of Object.entries(lineup)) {
    if (!playerId) continue
    const player = players[playerId]
    if (!player) continue
    const slot = slotStr as LineupSlot
    const fitDisplay = getFitDisplay(player, slot)
    if (fitDisplay.level === 'primary') continue

    results.push({
      slot,
      playerId,
      player,
      fitDisplay,
      alternatives: getBestEmergencyAlternatives(slot, availablePlayers, usedIds),
    })
  }

  return results.sort((a, b) => b.fitDisplay.perfPenaltyPct - a.fitDisplay.perfPenaltyPct)
}
