import type { Player, PlayerPreferredRole } from '@/types/player'
import { averageAttributes } from '@/engine/contracts/negotiation'

// ---------------------------------------------------------------------------
// Overall rating
// ---------------------------------------------------------------------------

/** Simple mean of all 52 attributes - delegates to averageAttributes(). */
export function getOverallRating(player: Player): number {
  return Math.round(averageAttributes(player.attributes))
}

// ---------------------------------------------------------------------------
// Star rating
// ---------------------------------------------------------------------------

const ROLE_VALUE_MULTIPLIER: Record<PlayerPreferredRole, number> = {
  ruck: 1.07,
  'inside-mid': 1.05,
  'intercept-defender': 1.04,
  'key-forward': 1.04,
  'outside-mid': 1.02,
  'rebound-defender': 1.01,
  'pressure-forward': 1.0,
  'wing-runner': 0.99,
  'small-forward': 0.98,
  'lockdown-defender': 0.98,
  utility: 0.97,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2
}

/**
 * Convert overall (1-100) to 0.5-5.0 stars with half-star increments.
 * This baseline variant does not include role value.
 */
export function getStarRating(overall: number): number {
  const normalized = (clamp(overall, 30, 95) - 30) / 65
  return clamp(roundToHalf(0.5 + normalized * 4.5), 0.5, 5)
}

/** Preferred role impact on player value in star calculations. */
export function getRoleValueMultiplier(role: PlayerPreferredRole): number {
  return ROLE_VALUE_MULTIPLIER[role] ?? 1
}

/** Player star rating derived from overall rating and role value. */
export function getPlayerStarRating(player: Player, overall?: number): number {
  const ovr = overall ?? getOverallRating(player)
  const roleAdjusted = ovr * getRoleValueMultiplier(player.preferredRole)
  return getStarRating(roleAdjusted)
}

// ---------------------------------------------------------------------------
// Tier
// ---------------------------------------------------------------------------

export type PlayerTier = 'elite' | 'good' | 'average' | 'developing' | 'poor'

export function getPlayerTier(overall: number): PlayerTier {
  if (overall >= 75) return 'elite'
  if (overall >= 65) return 'good'
  if (overall >= 55) return 'average'
  if (overall >= 45) return 'developing'
  return 'poor'
}

// ---------------------------------------------------------------------------
// Status tags
// ---------------------------------------------------------------------------

export type PlayerTagKey =
  | 'injured'
  | 'suspended'
  | 'expiring'
  | 'unhappy'
  | 'high-potential'
  | 'ageing'
  | 'trade-listed'

export interface PlayerTag {
  key: PlayerTagKey
  label: string
}

export function getPlayerTags(player: Player): PlayerTag[] {
  const tags: PlayerTag[] = []

  if (player.injury !== null) {
    tags.push({
      key: 'injured',
      label: `Injured (${player.injury.weeksRemaining}w)`,
    })
  }
  if ((player.suspension?.weeksRemaining ?? 0) > 0) {
    tags.push({
      key: 'suspended',
      label: `Suspended (${player.suspension?.weeksRemaining ?? 0}w)`,
    })
  }

  if (player.contract.yearsRemaining === 1) {
    tags.push({ key: 'expiring', label: 'Expiring' })
  }

  if (player.morale < 35) {
    tags.push({ key: 'unhappy', label: 'Unhappy' })
  }

  if (player.age <= 22 && player.hiddenAttributes.potentialCeiling >= 75) {
    tags.push({ key: 'high-potential', label: 'High Potential' })
  }

  if (player.age > player.hiddenAttributes.peakAgeEnd) {
    tags.push({ key: 'ageing', label: 'Decline Risk' })
  }

  if (player.personality.loyalty < 30 && player.morale < 40) {
    tags.push({ key: 'trade-listed', label: 'Wants Out' })
  }

  return tags
}
