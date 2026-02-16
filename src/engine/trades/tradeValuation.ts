import type { Player } from '@/types/player'
import type { DraftPick, TacticalIdentity } from '@/types/club'
import { averageAttributes, PREMIUM_POSITIONS } from '@/engine/contracts/negotiation'
import { getRoleNeedBonus, roleNeedsByClub } from '@/engine/player/roles'
import { getSuspensionWeeksRemaining } from '@/engine/players/availability'
import { getTacticalTradePreferences } from '@/engine/core/tacticalIdentity'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TradeContext {
  evaluatingClubId?: string
  players?: Record<string, Player>
  competitiveWindow?: 'win-now' | 'balanced' | 'rebuilding'
  tacticalIdentity?: TacticalIdentity
}

// ---------------------------------------------------------------------------
// Pick Valuation
// ---------------------------------------------------------------------------

/**
 * Power-law pick point value. Pick 1 = 3000, falls off steeply.
 * Based on real AFL draft value index concept.
 *
 * Formula: 3000 / (pickNumber ^ 0.7)
 * Pick 1  = 3000
 * Pick 5  ≈ 886
 * Pick 10 ≈ 599
 * Pick 18 ≈ 387
 * Pick 36 ≈ 246
 * Pick 54 ≈ 185
 */
export function getPickPointValue(pickNumber: number): number {
  if (pickNumber <= 0) return 0
  return Math.round(3000 / Math.pow(pickNumber, 0.7))
}

/**
 * Trade value of a DraftPick, accounting for future-year discounting.
 * - If pickNumber is unset, estimate from round (mid-round default)
 * - Future picks discounted 15% per year ahead
 */
export function getPickTradeValue(pick: DraftPick, currentYear: number): number {
  // Default pick numbers when unset: Round 1 → 9, Round 2 → 27, Round 3 → 45
  const pickNumber = pick.pickNumber ?? (pick.round === 1 ? 9 : pick.round === 2 ? 27 : 45)

  const baseValue = getPickPointValue(pickNumber)

  // Future discount: 0.85 ^ yearsAhead (15% per year)
  const yearsAhead = Math.max(0, pick.year - currentYear)
  const futureDiscount = Math.pow(0.85, yearsAhead)

  return Math.round(baseValue * futureDiscount)
}

// ---------------------------------------------------------------------------
// Player Valuation
// ---------------------------------------------------------------------------

/**
 * Comprehensive player trade value in points.
 * Combines 8 factors into a single score.
 */
export function getPlayerTradeValue(player: Player, context?: TradeContext): number {
  const overall = averageAttributes(player.attributes)
  const { hiddenAttributes } = player

  // 1. Base rating value — power curve from normalized overall rating
  const normalised = Math.max(0, (overall - 30) / 70)
  const base = 200 + Math.pow(normalised, 2.0) * 2800

  // 2. Age trade multiplier — uses hidden attributes for peak window
  let ageMultiplier: number
  if (player.age < hiddenAttributes.peakAgeStart) {
    // Pre-peak young: 0.70 approaching 1.0 as they near peak
    const youthProgress = Math.max(0, Math.min(1,
      (player.age - 18) / (hiddenAttributes.peakAgeStart - 18),
    ))
    ageMultiplier = 0.70 + 0.30 * youthProgress
  } else if (player.age <= hiddenAttributes.peakAgeEnd) {
    // Peak window: full value
    ageMultiplier = 1.0
  } else {
    // Post-peak decline
    const yearsPostPeak = player.age - hiddenAttributes.peakAgeEnd
    if (yearsPostPeak === 1) {
      ageMultiplier = 0.90
    } else {
      ageMultiplier = 0.78 - (yearsPostPeak - 2) * hiddenAttributes.declineRate * 0.12
    }
  }
  ageMultiplier = Math.max(0.25, Math.min(1.0, ageMultiplier))

  // 3. Potential bonus (additive, 0-800) — young players with high ceilings
  let potentialBonus = 0
  if (player.age < hiddenAttributes.peakAgeStart) {
    const potentialGap = Math.max(0, hiddenAttributes.potentialCeiling - overall)
    const youthFactor = Math.max(0, Math.min(1,
      (hiddenAttributes.peakAgeStart - player.age) / (hiddenAttributes.peakAgeStart - 18),
    ))
    potentialBonus = Math.min(800, potentialGap * youthFactor * 12)
  }

  // 4. Injury risk discount — based on injuryProneness
  let injuryDiscount = 1.0 - (hiddenAttributes.injuryProneness / 100) * 0.25
  const durability = hiddenAttributes.durability ?? Math.max(20, 100 - hiddenAttributes.injuryProneness)
  injuryDiscount *= 0.88 + (durability / 100) * 0.18
  if (player.injury !== null) {
    const weeks = Math.max(1, player.injury.weeksRemaining)
    injuryDiscount *= Math.max(0.55, 1 - weeks * 0.03)
  }
  const suspensionWeeks = getSuspensionWeeksRemaining(player)
  if (suspensionWeeks > 0) {
    injuryDiscount *= Math.max(0.72, 1 - suspensionWeeks * 0.06)
  }
  const recentInjuryBurden = (player.injuryHistory ?? [])
    .slice(-6)
    .reduce((sum, h) => sum + Math.min(1.5, h.initialWeeks / 8), 0)
  injuryDiscount *= Math.max(0.7, 1 - recentInjuryBurden * 0.025)

  // 5. Contract value multiplier — years remaining affect trade desirability
  let contractMultiplier: number
  const yearsRemaining = player.contract.yearsRemaining
  if (yearsRemaining <= 0) {
    contractMultiplier = 0.50
  } else if (yearsRemaining === 1) {
    contractMultiplier = 0.80
  } else if (yearsRemaining === 2) {
    contractMultiplier = 1.00
  } else if (yearsRemaining === 3) {
    contractMultiplier = 1.05
  } else {
    contractMultiplier = Math.max(0.85, 1.05 - (yearsRemaining - 3) * 0.05)
  }

  // 6. Positional scarcity multiplier
  let positionScarcity: number
  if (player.position.primary === 'RK') {
    positionScarcity = 1.12
  } else if (PREMIUM_POSITIONS.has(player.position.primary)) {
    positionScarcity = 1.10
  } else {
    positionScarcity = 1.0
  }
  if (player.preferredRole === 'ruck') positionScarcity += 0.05
  if (player.preferredRole === 'intercept-defender' || player.preferredRole === 'inside-mid') {
    positionScarcity += 0.03
  }

  // 7. Form adjustment — recent form affects perceived value
  const formAdjustment = 0.90 + (player.form / 100) * 0.20

  // 8. Role fit bonus (additive, contextual, 0-300)
  let roleFitBonus = 0
  if (context?.evaluatingClubId && context?.players) {
    let positionCount = 0
    for (const p of Object.values(context.players)) {
      if (p.clubId === context.evaluatingClubId && p.position.primary === player.position.primary) {
        positionCount++
      }
    }
    if (positionCount < 3) {
      roleFitBonus = 250
    } else if (positionCount === 3) {
      roleFitBonus = 100
    }
    const roleNeeds = roleNeedsByClub(context.players, context.evaluatingClubId)
    roleFitBonus += Math.round(getRoleNeedBonus(player.preferredRole, roleNeeds) * 22)
  }

  // 9. Tactical identity fit bonus (additive, 0-200)
  let identityFitBonus = 0
  if (context?.tacticalIdentity) {
    const prefs = getTacticalTradePreferences(context.tacticalIdentity)
    if (prefs.preferredPlayerRoles.includes(player.preferredRole)) {
      identityFitBonus += 120
    }
    const attrSum = prefs.preferredAttributeKeys.reduce(
      (sum, key) => sum + (player.attributes[key] ?? 0), 0,
    )
    const attrAvg = prefs.preferredAttributeKeys.length > 0
      ? attrSum / prefs.preferredAttributeKeys.length : 0
    identityFitBonus += Math.max(0, Math.min(80, Math.round((attrAvg - 55) * 2.5)))
  }

  // Combination formula
  const value = (
    base * ageMultiplier * injuryDiscount * contractMultiplier * positionScarcity * formAdjustment
    + potentialBonus
    + roleFitBonus
    + identityFitBonus
  )

  return Math.round(value)
}

// ---------------------------------------------------------------------------
// Package Valuation
// ---------------------------------------------------------------------------

/**
 * Total trade value of a package (players + picks).
 */
export function getPackageTradeValue(
  playerIds: string[],
  picks: DraftPick[],
  players: Record<string, Player>,
  currentYear: number,
  context?: TradeContext,
): number {
  let total = 0

  for (const id of playerIds) {
    const player = players[id]
    if (player) {
      total += getPlayerTradeValue(player, context)
    }
  }

  for (const pick of picks) {
    total += getPickTradeValue(pick, currentYear)
  }

  return total
}
