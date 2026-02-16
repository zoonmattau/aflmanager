import type { Player } from '@/types/player'
import type { SeasonAwards } from '@/types/awards'
import {
  averageAttributes,
  ageCurveMultiplier,
  positionMultiplier,
  roundSalary,
  ELITE_SALARY_CEILING,
  calculatePlayerValue,
} from '@/engine/contracts/negotiation'
import { MINIMUM_SALARY } from '@/engine/core/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectionRiskFlag =
  | 'injury-prone'
  | 'aging-decline'
  | 'steep-decline'
  | 'approaching-retirement'
  | 'untested-youth'
  | 'high-potential'

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'very-low'

export interface YearlyProjection {
  yearOffset: number
  projectedAge: number
  projectedOverall: number
  overallDelta: number
  projectedMarketValue: number
  projectedDemand: number
  demandDelta: number
  confidence: ConfidenceLevel
  confidenceScore: number
  riskFlags: ProjectionRiskFlag[]
  phase: 'growing' | 'peak' | 'declining'
}

export interface ProjectionContext {
  clubPlayers?: Player[]
  awards?: SeasonAwards[]
  currentClubId?: string
}

export interface ContractProjection {
  playerId: string
  playerName: string
  currentAge: number
  currentOverall: number
  currentMarketValue: number
  currentDemand: number
  projections: YearlyProjection[]
  trajectory: 'rising' | 'stable' | 'declining'
  optimalNegotiationYear: number
  worstNegotiationYear: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHYSICAL_COUNT = 7
const MENTAL_COUNT = 13
const TOTAL_ATTRIBUTES = 52
const OTHER_COUNT = TOTAL_ATTRIBUTES - PHYSICAL_COUNT - MENTAL_COUNT // 32

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getPhase(
  age: number,
  peakAgeStart: number,
  peakAgeEnd: number,
): 'growing' | 'peak' | 'declining' {
  if (age < peakAgeStart) return 'growing'
  if (age <= peakAgeEnd) return 'peak'
  return 'declining'
}

/**
 * Deterministic expected change in overall rating for one year of development.
 *
 * Uses E[uniform(0,3)] = 1.5 for growth/decline expected values and
 * E[uniform(-2,2)] = 0 for peak. Mirrors the stochastic logic in
 * `src/engine/players/development.ts` but returns the expected value.
 */
function expectedOverallDelta(
  currentOverall: number,
  developmentAge: number,
  peakAgeStart: number,
  peakAgeEnd: number,
  developmentRate: number,
  declineRate: number,
  potentialCeiling: number,
): number {
  const phase = getPhase(developmentAge, peakAgeStart, peakAgeEnd)

  if (phase === 'peak') {
    return 0
  }

  if (phase === 'growing') {
    let ageFactor: number
    if (developmentAge <= 19) ageFactor = 1.5
    else if (developmentAge <= 21) ageFactor = 1.2
    else ageFactor = 0.8

    // Young players (<=21) get physical bonus, mental penalty
    let weightedTypeMult: number
    if (developmentAge <= 21) {
      weightedTypeMult =
        (PHYSICAL_COUNT * 1.3 + MENTAL_COUNT * 0.8 + OTHER_COUNT * 1.0) /
        TOTAL_ATTRIBUTES
    } else {
      weightedTypeMult = 1.0
    }

    const expectedGrowth =
      1.5 * developmentRate * ageFactor * weightedTypeMult
    // Cap so overall doesn't exceed potential ceiling
    return Math.min(expectedGrowth, Math.max(0, potentialCeiling - currentOverall))
  }

  // Declining phase
  const yearsPostPeak = developmentAge - peakAgeEnd
  let declineAgeFactor: number
  if (yearsPostPeak <= 2) declineAgeFactor = 0.5
  else if (yearsPostPeak <= 4) declineAgeFactor = 1.0
  else declineAgeFactor = 1.5

  // Mental attributes decline at 0.3x rate
  const weightedTypeMult =
    ((TOTAL_ATTRIBUTES - MENTAL_COUNT) * 1.0 + MENTAL_COUNT * 0.3) /
    TOTAL_ATTRIBUTES // ~0.825

  const expectedLoss = 1.5 * declineRate * declineAgeFactor * weightedTypeMult
  return -expectedLoss
}

/**
 * Compute projected market value using the same power-curve formula as
 * `calculatePlayerValue` but with projected overall, age, and regressed
 * form/morale values.
 */
function computeProjectedMarketValue(
  player: Player,
  projectedOverall: number,
  projectedAge: number,
  yearOffset: number,
): number {
  // Power-curve salary mapping (same as calculatePlayerValue)
  const normalised = Math.max(0, (projectedOverall - 30) / 70)
  const baseSalary =
    MINIMUM_SALARY +
    Math.pow(normalised, 2.2) * (ELITE_SALARY_CEILING - MINIMUM_SALARY)

  // Age curve with synthetic player (position doesn't matter for ageCurve)
  const syntheticPlayer = {
    age: projectedAge,
    hiddenAttributes: player.hiddenAttributes,
  } as Player
  const ageMult = ageCurveMultiplier(syntheticPlayer, projectedOverall)

  // Position multiplier (position unchanged over time)
  const posMult = positionMultiplier(player)

  // Form regresses toward 50; morale assumed 50 (neutral)
  // Inlined from formMoraleMultiplier with projected values
  const projectedForm = 50 + (player.form - 50) * Math.pow(0.6, yearOffset)
  const formFactor = (projectedForm - 50) / 500
  const moraleFactor = 0 // (50 - 50) / 1000
  const formMoraleMult = 1.0 + formFactor + moraleFactor

  const value = baseSalary * ageMult * posMult * formMoraleMult
  return roundSalary(
    Math.min(ELITE_SALARY_CEILING, Math.max(MINIMUM_SALARY, value)),
  )
}

/**
 * Awards reputation premium. Each award type contributes a percentage
 * bonus to the player's perceived market value, with per-award caps.
 */
function computeReputationMultiplier(
  playerId: string,
  awards?: SeasonAwards[],
): number {
  if (!awards || awards.length === 0) return 1.0

  let brownlowCount = 0
  let colemanCount = 0
  let allAustralianCount = 0
  let hasRisingStar = false
  let clubBFCount = 0

  for (const season of awards) {
    if (season.brownlowMedal?.playerId === playerId) brownlowCount++
    if (season.colemanMedal?.playerId === playerId) colemanCount++
    if (season.allAustralian.includes(playerId)) allAustralianCount++
    if (season.risingStar?.playerId === playerId) hasRisingStar = true
    for (const winnerId of Object.values(season.clubBestAndFairest)) {
      if (winnerId === playerId) clubBFCount++
    }
  }

  let premium = 0
  premium += Math.min(0.16, brownlowCount * 0.08) // +8% per win, cap +16%
  premium += Math.min(0.10, colemanCount * 0.05) // +5% per win, cap +10%
  premium += Math.min(0.12, allAustralianCount * 0.03) // +3% per sel, cap +12%
  if (hasRisingStar) premium += 0.03 // +3% one-off
  premium += Math.min(0.06, clubBFCount * 0.02) // +2% per win, cap +6%

  return Math.min(1.25, 1.0 + premium) // total reputation capped at 1.25x
}

/**
 * Positional scarcity multiplier based on how many same-position players
 * on the club roster will still be under contract at a given year offset.
 */
function computeScarcityMultiplier(
  player: Player,
  yearOffset: number,
  clubPlayers?: Player[],
): number {
  if (!clubPlayers) return 1.0

  const samePositionCount = clubPlayers.filter(
    (p) =>
      p.position.primary === player.position.primary &&
      p.contract.yearsRemaining >= yearOffset,
  ).length

  if (samePositionCount <= 2) return 1.1
  if (samePositionCount <= 4) return 1.05
  if (samePositionCount <= 6) return 1.0
  return 0.95
}

function computeConfidence(
  yearOffset: number,
  phase: 'growing' | 'peak' | 'declining',
  injuryProneness: number,
  projectedAge: number,
): { confidenceScore: number; confidence: ConfidenceLevel } {
  let score = Math.max(0.15, 1.0 - (yearOffset - 1) * 0.2)

  if (phase === 'growing') score -= 0.05
  if (injuryProneness > 65) score -= 0.05
  if (projectedAge > 34) score -= 0.1

  score = Math.max(0.15, score)

  let confidence: ConfidenceLevel
  if (score >= 0.8) confidence = 'high'
  else if (score >= 0.5) confidence = 'medium'
  else if (score >= 0.3) confidence = 'low'
  else confidence = 'very-low'

  return { confidenceScore: Math.round(score * 100) / 100, confidence }
}

function computeRiskFlags(
  projectedAge: number,
  projectedOverall: number,
  player: Player,
  phase: 'growing' | 'peak' | 'declining',
): ProjectionRiskFlag[] {
  const flags: ProjectionRiskFlag[] = []
  const { injuryProneness, declineRate, potentialCeiling, peakAgeEnd } =
    player.hiddenAttributes

  if (injuryProneness > 65) flags.push('injury-prone')
  if (projectedAge > peakAgeEnd) flags.push('aging-decline')
  if (declineRate > 1.5) flags.push('steep-decline')
  if (projectedAge >= 33) flags.push('approaching-retirement')
  if (
    projectedAge < 20 &&
    player.careerStats.gamesPlayed < 20
  )
    flags.push('untested-youth')
  if (
    potentialCeiling > projectedOverall + 15 &&
    phase === 'growing'
  )
    flags.push('high-potential')

  return flags
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Projects a player's future market value and salary demand for up to
 * `yearsAhead` years. Uses deterministic expected values from the
 * development model so the output is fully reproducible with no RNG.
 */
export function projectContractValue(
  player: Player,
  yearsAhead: number,
  context?: ProjectionContext,
): ContractProjection {
  const currentOverall = averageAttributes(player.attributes)
  const currentMarketValue = calculatePlayerValue(player)

  // Personality modifiers (constant across all projection years)
  const ambitionMult = 1.0 + (player.personality.ambition / 100) * 0.2
  const isAtCurrentClub = context?.currentClubId
    ? player.clubId === context.currentClubId
    : false
  const loyaltyMult = isAtCurrentClub
    ? 1.0 - (player.personality.loyalty / 100) * 0.15
    : 1.0

  const reputationMult = computeReputationMultiplier(
    player.id,
    context?.awards,
  )

  // Baseline demand for year 0 (no scarcity, no morale penalty)
  const currentDemand = roundSalary(
    Math.max(
      MINIMUM_SALARY,
      currentMarketValue * reputationMult * ambitionMult * loyaltyMult,
    ),
  )

  const projections: YearlyProjection[] = []
  let runningOverall = currentOverall

  for (let yearOffset = 1; yearOffset <= yearsAhead; yearOffset++) {
    const projectedAge = player.age + yearOffset
    const {
      peakAgeStart,
      peakAgeEnd,
      developmentRate,
      declineRate,
      potentialCeiling,
    } = player.hiddenAttributes

    // Development happens at the age *before* aging (projectedAge - 1)
    const delta = expectedOverallDelta(
      runningOverall,
      projectedAge - 1,
      peakAgeStart,
      peakAgeEnd,
      developmentRate,
      declineRate,
      potentialCeiling,
    )
    const projectedOverall = Math.max(
      1,
      Math.min(100, runningOverall + delta),
    )
    const overallDelta =
      Math.round((projectedOverall - currentOverall) * 10) / 10

    const phase = getPhase(projectedAge, peakAgeStart, peakAgeEnd)

    const projectedMarketValue = computeProjectedMarketValue(
      player,
      projectedOverall,
      projectedAge,
      yearOffset,
    )

    const scarcityMult = computeScarcityMultiplier(
      player,
      yearOffset,
      context?.clubPlayers,
    )

    const projectedDemand = roundSalary(
      Math.max(
        MINIMUM_SALARY,
        projectedMarketValue *
          reputationMult *
          scarcityMult *
          ambitionMult *
          loyaltyMult,
      ),
    )
    const demandDelta = projectedDemand - currentDemand

    const { confidenceScore, confidence } = computeConfidence(
      yearOffset,
      phase,
      player.hiddenAttributes.injuryProneness,
      projectedAge,
    )

    const riskFlags = computeRiskFlags(
      projectedAge,
      projectedOverall,
      player,
      phase,
    )

    projections.push({
      yearOffset,
      projectedAge,
      projectedOverall: Math.round(projectedOverall * 10) / 10,
      overallDelta,
      projectedMarketValue,
      projectedDemand,
      demandDelta,
      confidence,
      confidenceScore,
      riskFlags,
      phase,
    })

    runningOverall = projectedOverall
  }

  // --- Summary ---
  const firstDemand = projections[0]?.projectedDemand ?? currentDemand
  const lastDemand =
    projections[projections.length - 1]?.projectedDemand ?? currentDemand
  const demandChange =
    firstDemand > 0 ? (lastDemand - firstDemand) / firstDemand : 0

  let trajectory: 'rising' | 'stable' | 'declining'
  if (demandChange > 0.05) trajectory = 'rising'
  else if (demandChange < -0.05) trajectory = 'declining'
  else trajectory = 'stable'

  let optimalYear = 1
  let worstYear = 1
  let minDemand = Infinity
  let maxDemand = -Infinity

  for (const p of projections) {
    if (p.projectedDemand < minDemand) {
      minDemand = p.projectedDemand
      optimalYear = p.yearOffset
    }
    if (p.projectedDemand > maxDemand) {
      maxDemand = p.projectedDemand
      worstYear = p.yearOffset
    }
  }

  return {
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    currentAge: player.age,
    currentOverall: Math.round(currentOverall * 10) / 10,
    currentMarketValue,
    currentDemand,
    projections,
    trajectory,
    optimalNegotiationYear: optimalYear,
    worstNegotiationYear: worstYear,
  }
}
