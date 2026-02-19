import type {
  AflDistributionConfig,
  DistributionBreakdown,
  LadderPrizeTier,
} from '@/types/distributions'

// ---------------------------------------------------------------------------
// Default configuration (mirrors real AFL prize-money structure)
// ---------------------------------------------------------------------------

export const DEFAULT_DISTRIBUTION_CONFIG: AflDistributionConfig = {
  // Ladder prize pool
  ladderFirst: 1_800_000,
  ladderLast: 400_000,
  distributionModel: 'linear',
  ladderTiers: [
    { minPosition: 1, maxPosition: 1, amount: 1_800_000 },
    { minPosition: 2, maxPosition: 4, amount: 1_400_000 },
    { minPosition: 5, maxPosition: 8, amount: 1_000_000 },
    { minPosition: 9, maxPosition: 13, amount: 700_000 },
    { minPosition: 14, maxPosition: 18, amount: 400_000 },
  ],
  // Finals bonuses
  finalsEnabled: true,
  finalsWinBonus: 150_000,
  premiershipBonus: 500_000,
  runnerUpBonus: 200_000,
  // Equalisation
  equalisationEnabled: true,
  equalisationThreshold: 6,
  equalisationPayment: 200_000,
  // Travel compensation
  travelCompEnabled: true,
  travelPerAwayGame: 30_000,
  // Performance grants (off by default — opt-in)
  performanceGrantEnabled: false,
  performanceGrantPositions: 3,
  performanceGrantAmount: 100_000,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lerpByPosition(
  first: number,
  last: number,
  position: number,
  totalTeams: number,
): number {
  if (totalTeams <= 1) return first
  const t = (position - 1) / (totalTeams - 1)
  return Math.round(first + (last - first) * t)
}

function getTieredPrize(tiers: LadderPrizeTier[], position: number): number {
  const tier = tiers.find((t) => position >= t.minPosition && position <= t.maxPosition)
  return tier?.amount ?? 0
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the full distribution payment for a single club.
 *
 * @param config - Distribution rules (from GameSettings.aflDistributions)
 * @param ladderPosition - Final ladder position this season (1-based)
 * @param totalTeams - Number of clubs in the competition
 * @param finalsWins - Number of finals matches won this season
 * @param isPremier - Whether this club won the Grand Final
 * @param isRunnerUp - Whether this club lost the Grand Final
 * @param awayGamesPlayed - Regular-season away games (for travel comp)
 * @param receivesPerformanceGrant - Pre-computed flag: store determines who qualifies
 * @param inflationIndex - Annual CPI multiplier
 */
export function calculateDistribution(
  config: AflDistributionConfig,
  ladderPosition: number,
  totalTeams: number,
  finalsWins: number,
  isPremier: boolean,
  isRunnerUp: boolean,
  awayGamesPlayed: number,
  receivesPerformanceGrant: boolean,
  inflationIndex: number,
): DistributionBreakdown {
  const ix = inflationIndex

  // 1. Ladder prize
  let ladderPrize: number
  if (config.distributionModel === 'tiered') {
    ladderPrize = Math.round(getTieredPrize(config.ladderTiers, ladderPosition) * ix)
  } else if (config.distributionModel === 'flat') {
    ladderPrize = Math.round(((config.ladderFirst + config.ladderLast) / 2) * ix)
  } else {
    // linear (default)
    ladderPrize = lerpByPosition(
      Math.round(config.ladderFirst * ix),
      Math.round(config.ladderLast * ix),
      ladderPosition,
      totalTeams,
    )
  }

  // 2. Finals bonuses
  let finalsWinBonusTotal = 0
  let premiershipBonusAmount = 0
  let runnerUpBonusAmount = 0
  if (config.finalsEnabled) {
    finalsWinBonusTotal = Math.round(finalsWins * config.finalsWinBonus * ix)
    if (isPremier) premiershipBonusAmount = Math.round(config.premiershipBonus * ix)
    if (isRunnerUp) runnerUpBonusAmount = Math.round(config.runnerUpBonus * ix)
  }

  // 3. Equalisation — bottom N clubs by ladder position
  let equalisationPaymentAmount = 0
  if (config.equalisationEnabled && config.equalisationThreshold > 0) {
    const qualifyingCutoff = totalTeams - config.equalisationThreshold + 1
    if (ladderPosition >= qualifyingCutoff) {
      equalisationPaymentAmount = Math.round(config.equalisationPayment * ix)
    }
  }

  // 4. Travel compensation
  const travelCompensation = config.travelCompEnabled
    ? Math.round(awayGamesPlayed * config.travelPerAwayGame * ix)
    : 0

  // 5. Performance improvement grant (pre-computed by store)
  const performanceGrant = receivesPerformanceGrant && config.performanceGrantEnabled
    ? Math.round(config.performanceGrantAmount * ix)
    : 0

  const total =
    ladderPrize +
    finalsWinBonusTotal +
    premiershipBonusAmount +
    runnerUpBonusAmount +
    equalisationPaymentAmount +
    travelCompensation +
    performanceGrant

  return {
    ladderPrize,
    finalsWinBonus: finalsWinBonusTotal,
    premiershipBonus: premiershipBonusAmount,
    runnerUpBonus: runnerUpBonusAmount,
    equalisationPayment: equalisationPaymentAmount,
    travelCompensation,
    performanceGrant,
    total,
  }
}

// ---------------------------------------------------------------------------
// Preview table for settings UI
// ---------------------------------------------------------------------------

export interface DistributionPreviewRow {
  position: number
  ladderPrize: number
  /** Total with 1 finals win added */
  withOneFinalWin: number
  /** Total with equalisation applied (if eligible) */
  withEqualisation: number
  isEqualisation: boolean
}

/**
 * Generate a preview table showing what each ladder position would receive.
 * Used in GameSettingsPage to give immediate feedback when adjusting sliders.
 */
export function getDistributionPreviewTable(
  config: AflDistributionConfig,
  totalTeams: number,
): DistributionPreviewRow[] {
  return Array.from({ length: totalTeams }, (_, i) => {
    const position = i + 1
    const base = calculateDistribution(config, position, totalTeams, 0, false, false, 11, false, 1.0)
    const qualifyingCutoff = config.equalisationEnabled
      ? totalTeams - config.equalisationThreshold + 1
      : totalTeams + 1
    const isEqualisation = position >= qualifyingCutoff
    return {
      position,
      ladderPrize: base.ladderPrize,
      withOneFinalWin: base.ladderPrize + (config.finalsEnabled ? config.finalsWinBonus : 0),
      withEqualisation: base.total,
      isEqualisation,
    }
  })
}

// ---------------------------------------------------------------------------
// Compute performance grant recipients (top-N most-improved clubs)
// ---------------------------------------------------------------------------

/**
 * Given this season's ladder positions and last season's positions,
 * return the set of club IDs that qualify for the performance improvement grant.
 */
export function computePerformanceGrantRecipients(
  config: AflDistributionConfig,
  currentLadder: { clubId: string; position: number }[],
  lastSeasonPositions: Record<string, number>,
): Set<string> {
  if (!config.performanceGrantEnabled) return new Set()

  const improvements = currentLadder
    .map(({ clubId, position }) => {
      const prev = lastSeasonPositions[clubId]
      if (prev == null) return null
      return { clubId, improvement: prev - position } // positive = moved up
    })
    .filter((x): x is { clubId: string; improvement: number } => x !== null && x.improvement > 0)
    .sort((a, b) => b.improvement - a.improvement)
    .slice(0, config.performanceGrantPositions)

  return new Set(improvements.map((x) => x.clubId))
}
