import type { Player, PlayerPositionType, PlayerPreferredRole } from '@/types/player'

// ---------------------------------------------------------------------------
// Overall rating
// ---------------------------------------------------------------------------

const POSITION_TYPES: PlayerPositionType[] = ['BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF']

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function getPlayerPositionRating(player: Player, position: PlayerPositionType): number {
  const a = player.attributes
  const kicking = mean([a.kickingEfficiency, a.kickingDistance, a.fieldKicking, a.disposalDecision, a.composure])
  const marking = mean([a.markingOverhead, a.markingContested, a.markingLeading, a.markingUncontested])
  const defense = mean([a.intercept, a.spoiling, a.oneOnOne, a.zonalAwareness, a.rebounding, a.positioning])
  const midfield = mean([a.contested, a.clearance, a.groundBallGet, a.workRate, a.endurance, a.stoppage, a.centreBounce])
  const outside = mean([a.speed, a.acceleration, a.endurance, a.fieldKicking, a.creativity, a.workRate])
  const forward = mean([a.goalkicking, a.leadingPatterns, a.scoringInstinct, a.insideForward, a.groundBallGet, a.pressure])
  const ruck = mean([a.hitouts, a.ruckCreative, a.followUp, a.strength, a.leap, a.stoppage, a.centreBounce])

  const baseByPosition: Record<PlayerPositionType, number> = {
    BP: defense * 0.48 + outside * 0.2 + kicking * 0.2 + midfield * 0.12,
    FB: defense * 0.5 + marking * 0.2 + kicking * 0.1 + midfield * 0.08 + mean([a.strength, a.hardness, a.contested]) * 0.12,
    HBF: defense * 0.4 + kicking * 0.28 + outside * 0.2 + midfield * 0.12,
    CHB: defense * 0.42 + marking * 0.24 + mean([a.strength, a.hardness, a.contested]) * 0.2 + kicking * 0.14,
    W: outside * 0.45 + kicking * 0.3 + midfield * 0.18 + defense * 0.07,
    IM: midfield * 0.5 + mean([a.contested, a.clearance, a.hardness, a.pressure]) * 0.24 + kicking * 0.16 + outside * 0.1,
    OM: outside * 0.4 + kicking * 0.3 + midfield * 0.2 + mean([a.creativity, a.composure, a.anticipation]) * 0.1,
    RK: ruck * 0.58 + midfield * 0.18 + mean([a.strength, a.leap, a.workRate, a.pressure]) * 0.16 + kicking * 0.08,
    HFF: forward * 0.38 + kicking * 0.26 + outside * 0.2 + midfield * 0.16,
    CHF: forward * 0.34 + marking * 0.3 + kicking * 0.14 + mean([a.strength, a.contested, a.workRate]) * 0.22,
    FP: forward * 0.42 + outside * 0.22 + kicking * 0.24 + midfield * 0.12,
    FF: forward * 0.44 + marking * 0.24 + kicking * 0.16 + mean([a.strength, a.contested, a.clutch]) * 0.16,
  }

  const familiarityBonus =
    player.position.primary === position ? 4
    : player.position.secondary.includes(position) ? 2
    : 0

  return clamp(Math.round(baseByPosition[position] + familiarityBonus), 1, 99)
}

export function getPlayerPositionRatings(player: Player): Record<PlayerPositionType, number> {
  const next = {} as Record<PlayerPositionType, number>
  for (const pos of POSITION_TYPES) {
    next[pos] = getPlayerPositionRating(player, pos)
  }
  return next
}

export function syncPlayerPositionRatings(player: Player): void {
  player.position.ratings = getPlayerPositionRatings(player)
}

/** Overall is defined as the player's best position rating. */
export function getOverallRating(player: Player): number {
  const ratings = getPlayerPositionRatings(player)
  return Math.max(...Object.values(ratings))
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

export interface PlayerPotentialStarProjection {
  currentStars: number
  projectedStars: number
  projectedMaxStars: number
  confidence: number
  confidenceLabel: 'low' | 'medium' | 'high'
}

function getConfidenceLabel(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 0.75) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}

/**
 * Estimate visible potential (star ceiling) from scouting + staff quality.
 * Lower confidence intentionally widens the visible potential range.
 */
export function getPlayerPotentialStarProjection(
  player: Player,
  options?: {
    overall?: number
    scoutingAccuracy?: number
    staffQuality?: number
    viewerClubId?: string
  },
): PlayerPotentialStarProjection {
  const ovr = options?.overall ?? getOverallRating(player)
  const currentStars = getPlayerStarRating(player, ovr)
  const roleMultiplier = getRoleValueMultiplier(player.preferredRole)

  const scoutingAccuracy = clamp(options?.scoutingAccuracy ?? 1, 0.6, 1.3)
  const staffQuality = clamp(options?.staffQuality ?? 1, 0.65, 1.35)
  const gamesKnowledge = clamp((player.careerStats.gamesPlayed ?? 0) / 220, 0, 0.2)
  const ageKnowledge = clamp((player.age - 18) / 16, 0, 0.2)
  const clubKnowledge = options?.viewerClubId && options.viewerClubId === player.clubId ? 0.12 : 0
  const confidence = clamp(
    0.35 +
      (scoutingAccuracy - 0.8) * 0.65 +
      (staffQuality - 0.8) * 0.3 +
      gamesKnowledge +
      ageKnowledge +
      clubKnowledge,
    0.2,
    0.95,
  )

  const trueCeiling = clamp(player.hiddenAttributes.potentialCeiling, ovr, 99)
  const youthUpsideBias = player.age <= player.hiddenAttributes.peakAgeStart ? 1.5 : 0
  const agePenalty = player.age > player.hiddenAttributes.peakAgeEnd ? (player.age - player.hiddenAttributes.peakAgeEnd) * 2.1 : 0
  const noisyCeiling = clamp(
    trueCeiling + youthUpsideBias - agePenalty + (1 - confidence) * 6 - 2.2,
    ovr,
    99,
  )
  const blendedCeiling = ovr + (noisyCeiling - ovr) * (0.5 + confidence * 0.5)

  const projectedStars = getStarRating(blendedCeiling * roleMultiplier)
  const uncertaintyOverall = clamp((1 - confidence) * 15, 0, 9)
  const projectedMaxStars = clamp(
    getStarRating((blendedCeiling + uncertaintyOverall) * roleMultiplier),
    projectedStars,
    5,
  )

  return {
    currentStars,
    projectedStars,
    projectedMaxStars,
    confidence,
    confidenceLabel: getConfidenceLabel(confidence),
  }
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
