/**
 * Player Ageing & Decline Profile Engine
 *
 * Pure calculation functions that derive ageing/decline metrics from player data.
 * No randomness — these are deterministic probability estimates for UI display.
 */

import type { Player } from '@/types/player'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeclineStage =
  | 'pre-peak'       // age < peakAgeStart
  | 'prime'          // peakAgeStart ≤ age ≤ peakAgeEnd
  | 'early-decline'  // 1-2 years post-peak
  | 'mid-decline'    // 3-5 years post-peak
  | 'late-decline'   // 6+ years post-peak

export type RetirementRisk = 'none' | 'low' | 'moderate' | 'high' | 'very-high'
export type AthleticDeclineRisk = 'none' | 'low' | 'moderate' | 'high'
export type InjuryRiskTrend = 'low' | 'moderate' | 'elevated' | 'high'

export interface PlayerAgeingProfile {
  declineStage: DeclineStage
  yearsPostPeak: number          // 0 if in peak or pre-peak
  peakSeasonsRemaining: number   // 0 if past peak; projected remaining prime seasons
  retirementRisk: RetirementRisk
  retirementChance: number       // deterministic probability this offseason (0-1)
  projectedRetirementAge: number // estimated age when >50% cumulative chance
  athleticDeclineRisk: AthleticDeclineRisk
  injuryRiskTrend: InjuryRiskTrend
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Deterministic retirement chance — mirrors the logic in shouldRetire() but
 * without a random draw, so the result is always the same for a given player state.
 */
export function computeRetirementChance(player: Player): number {
  const { age, form, morale, hiddenAttributes } = player

  if (age < 30) return 0

  let baseChance: number
  if (age < 32) baseChance = 0.02
  else if (age < 34) baseChance = 0.05
  else if (age < 36) baseChance = 0.15
  else if (age < 38) baseChance = 0.40
  else baseChance = 0.80

  const formModifier = (50 - form) / 1000
  const moraleModifier = (50 - morale) / 1000
  const pastPeakYears = Math.max(0, age - hiddenAttributes.peakAgeEnd)
  const peakModifier = pastPeakYears * 0.02
  const declineModifier = (hiddenAttributes.declineRate - 1.0) * 0.03

  return clamp(baseChance + formModifier + moraleModifier + peakModifier + declineModifier, 0, 1)
}

/**
 * Project the age at which cumulative retirement probability first exceeds 50%.
 * Uses deterministic modifiers only (average form/morale = 50).
 */
function estimateRetirementAge(player: Player): number {
  const { peakAgeEnd, declineRate } = player.hiddenAttributes
  let cumSurvival = 1
  const startAge = Math.max(player.age, 30)

  for (let testAge = startAge; testAge <= 44; testAge++) {
    let baseChance: number
    if (testAge < 32) baseChance = 0.02
    else if (testAge < 34) baseChance = 0.05
    else if (testAge < 36) baseChance = 0.15
    else if (testAge < 38) baseChance = 0.40
    else baseChance = 0.80

    const pastPeakYears = Math.max(0, testAge - peakAgeEnd)
    const peakModifier = pastPeakYears * 0.02
    const declineModifier = (declineRate - 1.0) * 0.03
    const chance = clamp(baseChance + peakModifier + declineModifier, 0, 1)

    cumSurvival *= (1 - chance)
    if (cumSurvival < 0.5) return testAge
  }
  return 44
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function computeAgeingProfile(player: Player): PlayerAgeingProfile {
  const { age, hiddenAttributes, injuryHistory } = player
  const { peakAgeStart, peakAgeEnd, declineRate, injuryProneness, durability } = hiddenAttributes

  // --- Decline stage ---
  const yearsPostPeak = Math.max(0, age - peakAgeEnd)
  const peakSeasonsRemaining = Math.max(0, peakAgeEnd - age)

  let declineStage: DeclineStage
  if (age < peakAgeStart) {
    declineStage = 'pre-peak'
  } else if (age <= peakAgeEnd) {
    declineStage = 'prime'
  } else if (yearsPostPeak <= 2) {
    declineStage = 'early-decline'
  } else if (yearsPostPeak <= 5) {
    declineStage = 'mid-decline'
  } else {
    declineStage = 'late-decline'
  }

  // --- Retirement risk ---
  const retirementChance = computeRetirementChance(player)
  let retirementRisk: RetirementRisk
  if (retirementChance === 0) retirementRisk = 'none'
  else if (retirementChance < 0.05) retirementRisk = 'low'
  else if (retirementChance < 0.15) retirementRisk = 'moderate'
  else if (retirementChance < 0.35) retirementRisk = 'high'
  else retirementRisk = 'very-high'

  const projectedRetirementAge = age >= 30
    ? estimateRetirementAge(player)
    : peakAgeEnd + 4  // rough estimate for pre-peak/prime players

  // --- Athletic decline risk ---
  // Based on years past peak and personal decline rate
  let athleticDeclineRisk: AthleticDeclineRisk
  if (yearsPostPeak === 0) {
    athleticDeclineRisk = 'none'
  } else if (yearsPostPeak <= 1) {
    athleticDeclineRisk = declineRate > 1.2 ? 'moderate' : 'low'
  } else if (yearsPostPeak <= 3) {
    athleticDeclineRisk = declineRate > 1.3 ? 'high' : declineRate > 1.0 ? 'moderate' : 'low'
  } else {
    athleticDeclineRisk = declineRate > 1.2 ? 'high' : 'moderate'
  }

  // --- Injury risk trend ---
  // Factors: age, proneness, durability, recent severe/recurring injuries
  const recentBadInjuries = (injuryHistory ?? []).filter(
    (h) => h.severity === 'severe' || h.severity === 'major' || h.recurring,
  ).length

  const ageInjuryFactor = age >= 34 ? 3 : age >= 30 ? 2 : age >= 28 ? 1 : 0
  const pronessScore = (injuryProneness / 100) * 3
  const durabilityScore = ((100 - durability) / 100) * 2
  const recentScore = Math.min(recentBadInjuries, 3)
  const totalScore = ageInjuryFactor + pronessScore + durabilityScore + recentScore

  let injuryRiskTrend: InjuryRiskTrend
  if (totalScore < 2) injuryRiskTrend = 'low'
  else if (totalScore < 4) injuryRiskTrend = 'moderate'
  else if (totalScore < 6) injuryRiskTrend = 'elevated'
  else injuryRiskTrend = 'high'

  return {
    declineStage,
    yearsPostPeak,
    peakSeasonsRemaining,
    retirementRisk,
    retirementChance,
    projectedRetirementAge,
    athleticDeclineRisk,
    injuryRiskTrend,
  }
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

export function getDeclineStageLabel(stage: DeclineStage): string {
  switch (stage) {
    case 'pre-peak': return 'Pre-Peak'
    case 'prime': return 'Prime'
    case 'early-decline': return 'Early Decline'
    case 'mid-decline': return 'Mid-Decline'
    case 'late-decline': return 'Late Decline'
  }
}

export function getRetirementRiskLabel(risk: RetirementRisk): string {
  switch (risk) {
    case 'none': return 'None'
    case 'low': return 'Low'
    case 'moderate': return 'Moderate'
    case 'high': return 'High'
    case 'very-high': return 'Very High'
  }
}

export function getAthleticDeclineRiskLabel(risk: AthleticDeclineRisk): string {
  switch (risk) {
    case 'none': return 'Stable'
    case 'low': return 'Mild'
    case 'moderate': return 'Moderate'
    case 'high': return 'Rapid'
  }
}

export function getInjuryRiskTrendLabel(trend: InjuryRiskTrend): string {
  switch (trend) {
    case 'low': return 'Low'
    case 'moderate': return 'Moderate'
    case 'elevated': return 'Elevated'
    case 'high': return 'High'
  }
}

// ---------------------------------------------------------------------------
// CSS colour helpers (Tailwind classes)
// ---------------------------------------------------------------------------

export function declineStageColor(stage: DeclineStage): string {
  switch (stage) {
    case 'pre-peak': return 'text-blue-400'
    case 'prime': return 'text-emerald-400'
    case 'early-decline': return 'text-amber-400'
    case 'mid-decline': return 'text-orange-400'
    case 'late-decline': return 'text-red-400'
  }
}

export function retirementRiskColor(risk: RetirementRisk): string {
  switch (risk) {
    case 'none': return 'text-muted-foreground'
    case 'low': return 'text-emerald-400'
    case 'moderate': return 'text-amber-400'
    case 'high': return 'text-orange-400'
    case 'very-high': return 'text-red-400'
  }
}

export function injuryRiskTrendColor(trend: InjuryRiskTrend): string {
  switch (trend) {
    case 'low': return 'text-emerald-400'
    case 'moderate': return 'text-amber-400'
    case 'elevated': return 'text-orange-400'
    case 'high': return 'text-red-400'
  }
}

export function athleticDeclineRiskColor(risk: AthleticDeclineRisk): string {
  switch (risk) {
    case 'none': return 'text-emerald-400'
    case 'low': return 'text-amber-400'
    case 'moderate': return 'text-orange-400'
    case 'high': return 'text-red-400'
  }
}
