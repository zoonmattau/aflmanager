import type { Player } from '@/types/player'
import { averageAttributes } from '@/engine/contracts/negotiation'

// ---------------------------------------------------------------------------
// Overall rating
// ---------------------------------------------------------------------------

/** Simple mean of all 52 attributes — delegates to averageAttributes(). */
export function getOverallRating(player: Player): number {
  return Math.round(averageAttributes(player.attributes))
}

// ---------------------------------------------------------------------------
// Star rating
// ---------------------------------------------------------------------------

/** Convert 1-100 overall to 0.5–5.0 star rating (half-star increments). */
export function getStarRating(overall: number): number {
  if (overall >= 80) return 5
  if (overall >= 75) return 4.5
  if (overall >= 70) return 4
  if (overall >= 65) return 3.5
  if (overall >= 60) return 3
  if (overall >= 55) return 2.5
  if (overall >= 50) return 2
  if (overall >= 45) return 1.5
  if (overall >= 40) return 1
  return 0.5
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
