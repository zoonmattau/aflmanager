import type { Player, PlayerAttributes } from '@/types/player'
import type { SeededRNG } from '@/engine/core/rng'
import { MINIMUM_SALARY } from '@/engine/core/constants'

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface ContractDemand {
  yearsWanted: number
  aavWanted: number
  yearByYear: number[]
  willingToNegotiate: boolean
}

export interface ContractOffer {
  years: number
  aav: number
  yearByYear: number[]
  clubId: string
}

export interface NegotiationResult {
  accepted: boolean
  counterOffer: ContractDemand | null
  message: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** The maximum AAV an elite player can command. */
const ELITE_SALARY_CEILING = 1_200_000

/** Number of attributes in PlayerAttributes (all 52 numeric fields). */
const ATTRIBUTE_COUNT = 52

/** Positions that command a premium on the open market. */
const PREMIUM_POSITIONS = new Set(['IM', 'OM', 'FF', 'CHF', 'HFF'])

/**
 * Returns the arithmetic mean of every numeric attribute on a player.
 * All 52 attributes are weighted equally.
 */
function averageAttributes(attrs: PlayerAttributes): number {
  const values = Object.values(attrs) as number[]
  let sum = 0
  for (const v of values) {
    sum += v
  }
  return sum / ATTRIBUTE_COUNT
}

/**
 * Age multiplier for a player's market value.
 *
 * Young players whose potential exceeds their current overall get a premium
 * (clubs pay for upside). Players past their peak-end decline in value.
 * Players in their peak window are valued at full price.
 */
function ageCurveMultiplier(player: Player, overallRating: number): number {
  const { age, hiddenAttributes } = player
  const { potentialCeiling, peakAgeStart, peakAgeEnd } = hiddenAttributes

  // Young player — potential premium
  if (age < peakAgeStart) {
    // Ratio of potential to current (clamped 1.0-1.35)
    const potentialRatio = Math.min(1.35, Math.max(1.0, potentialCeiling / overallRating))
    // Scale: at 18 full premium, at peakAgeStart the premium fades out
    const youthFactor = (peakAgeStart - age) / (peakAgeStart - 18)
    return 0.75 + 0.25 * youthFactor * potentialRatio
  }

  // Peak window — full value
  if (age <= peakAgeEnd) {
    return 1.0
  }

  // Post-peak decline — drops off progressively
  const yearsPostPeak = age - peakAgeEnd
  return Math.max(0.4, 1.0 - yearsPostPeak * 0.1)
}

/**
 * Position multiplier. Midfielders and key forwards attract a small premium
 * because of their direct impact on scoring and contested possessions.
 */
function positionMultiplier(player: Player): number {
  if (PREMIUM_POSITIONS.has(player.position.primary)) {
    return 1.08
  }
  // Rucks get a modest bump too
  if (player.position.primary === 'RK') {
    return 1.04
  }
  return 1.0
}

/**
 * Form & morale modifier. Hot form nudges value up, poor form & morale
 * drags it down.
 *
 * Returns a multiplier in [0.88, 1.10].
 */
function formMoraleMultiplier(player: Player): number {
  // form: 1-100, morale: 1-100
  const formFactor = (player.form - 50) / 500   // ±0.10
  const moraleFactor = (player.morale - 50) / 1000 // ±0.05
  return 1.0 + formFactor + moraleFactor
}

/**
 * Rounds a salary to the nearest $5,000 — contracts in the AFL are not
 * specified to the dollar.
 */
function roundSalary(value: number): number {
  return Math.round(value / 5_000) * 5_000
}

/**
 * Build a year-by-year salary array from a base AAV with annual escalation.
 * Each year increases by `escalationRate` (e.g. 0.04 = 4%).
 *
 * The AAV of the resulting array will be close to but not exactly equal to
 * the supplied `aav` because the first year is lower and the last year is
 * higher; the function adjusts the starting salary so the *average* matches.
 */
function buildYearByYear(aav: number, years: number, escalationRate: number): number[] {
  if (years <= 0) {
    return []
  }
  if (years === 1) {
    return [roundSalary(aav)]
  }

  // Compute a geometric series multiplier sum so the average equals aav.
  // sum(r^i, i=0..n-1) = (r^n - 1) / (r - 1)  where r = 1 + escalation
  const r = 1 + escalationRate
  const seriesSum = (Math.pow(r, years) - 1) / (r - 1)
  const baseSalary = (aav * years) / seriesSum

  const salaries: number[] = []
  for (let i = 0; i < years; i++) {
    salaries.push(roundSalary(baseSalary * Math.pow(r, i)))
  }
  return salaries
}

// ---------------------------------------------------------------------------
// 1. calculatePlayerValue
// ---------------------------------------------------------------------------

/**
 * Estimates a player's market value as an annual salary (AAV).
 *
 * The valuation considers overall attribute average, age trajectory, position
 * premium, form, and morale. Values are clamped between MINIMUM_SALARY and
 * ELITE_SALARY_CEILING.
 */
export function calculatePlayerValue(player: Player): number {
  const overall = averageAttributes(player.attributes)

  // Map overall 1-100 onto a salary curve.
  // We use a power curve so that the difference between 70 and 80 is much
  // larger than between 30 and 40 — elite talent is disproportionately
  // expensive.
  //
  // normalised 0-1 (treating 30 as the floor; anything below 30 overall is
  // minimum-salary territory)
  const normalised = Math.max(0, (overall - 30) / 70)
  const baseSalary = MINIMUM_SALARY + Math.pow(normalised, 2.2) * (ELITE_SALARY_CEILING - MINIMUM_SALARY)

  const value =
    baseSalary *
    ageCurveMultiplier(player, overall) *
    positionMultiplier(player) *
    formMoraleMultiplier(player)

  return roundSalary(Math.min(ELITE_SALARY_CEILING, Math.max(MINIMUM_SALARY, value)))
}

// ---------------------------------------------------------------------------
// 2. generateContractDemand
// ---------------------------------------------------------------------------

/**
 * Produces the contract demands a player would make in free-agency or
 * re-signing negotiations.
 *
 * The demand is rooted in `calculatePlayerValue` but adjusted by personality
 * (ambitious players ask for more, loyal players at their current club ask
 * for less) and morale.
 */
export function generateContractDemand(
  player: Player,
  currentClubId: string,
  rng: SeededRNG,
  options?: { playerLoyaltyEnabled?: boolean },
): ContractDemand {
  const baseValue = calculatePlayerValue(player)
  const loyaltyEnabled = options?.playerLoyaltyEnabled !== false

  // --- Personality modifiers ---

  // Ambition: 1-100 → multiplier 1.0 – 1.2 (linear)
  const ambitionMultiplier = 1.0 + (player.personality.ambition / 100) * 0.2

  // Loyalty: only applies if player is at the club making the offer
  // 1-100 → multiplier 1.0 – 0.85 (higher loyalty = bigger discount)
  const isAtCurrentClub = player.clubId === currentClubId
  const loyaltyMultiplier = loyaltyEnabled && isAtCurrentClub
    ? 1.0 - (player.personality.loyalty / 100) * 0.15
    : 1.0

  // Low morale premium: morale below 50 adds up to a 15 % premium
  const moralePenalty = player.morale < 50
    ? 1.0 + ((50 - player.morale) / 50) * 0.15
    : 1.0

  const aavWanted = roundSalary(
    Math.max(
      MINIMUM_SALARY,
      baseValue * ambitionMultiplier * loyaltyMultiplier * moralePenalty,
    ),
  )

  // --- Years wanted ---
  let yearsWanted: number
  if (player.age < 25) {
    yearsWanted = rng.nextInt(3, 5)
  } else if (player.age <= 30) {
    yearsWanted = rng.nextInt(2, 4)
  } else {
    yearsWanted = rng.nextInt(1, 3)
  }

  // --- Escalation ---
  const escalationRate = rng.nextFloat(0.03, 0.05)
  const yearByYear = buildYearByYear(aavWanted, yearsWanted, escalationRate)

  // --- Willingness to negotiate ---
  // Players with higher professionalism and lower ambition are more flexible
  const negotiationScore =
    (player.personality.professionalism * 0.6 +
      (100 - player.personality.ambition) * 0.4) /
    100
  const willingToNegotiate = negotiationScore > 0.35

  return {
    yearsWanted,
    aavWanted,
    yearByYear,
    willingToNegotiate,
  }
}

// ---------------------------------------------------------------------------
// 3. evaluateOffer
// ---------------------------------------------------------------------------

/**
 * Evaluates a contract offer from a club and decides whether the player
 * accepts, rejects, or counters.
 *
 * Acceptance probability is driven by how the offered AAV compares to the
 * player's demand, whether the term length is acceptable, and whether
 * loyalty provides a bonus.
 */
export function evaluateOffer(
  player: Player,
  offer: ContractOffer,
  currentClubId: string,
  rng: SeededRNG,
  options?: { playerLoyaltyEnabled?: boolean },
): NegotiationResult {
  const demand = generateContractDemand(player, currentClubId, rng, options)
  const loyaltyEnabled = options?.playerLoyaltyEnabled !== false

  // --- Term check ---
  const yearDiff = Math.abs(offer.years - demand.yearsWanted)
  if (yearDiff > 1) {
    // Too far from desired term — flat rejection with counter
    return {
      accepted: false,
      counterOffer: demand,
      message: `${player.firstName} ${player.lastName} wants a ${demand.yearsWanted}-year deal. A ${offer.years}-year offer is too far from expectations.`,
    }
  }

  // --- AAV comparison ---
  const aavRatio = offer.aav / demand.aavWanted // 1.0 = exact match

  // Base acceptance probability from AAV ratio
  let acceptanceProbability: number
  if (aavRatio >= 1.0) {
    // Meets or exceeds demand — very likely to accept
    acceptanceProbability = 0.90 + Math.min(0.09, (aavRatio - 1.0) * 0.5)
  } else if (aavRatio >= 0.90) {
    // Within 90-100 % — sliding scale
    acceptanceProbability = (aavRatio - 0.90) / 0.10 * 0.70 + 0.15
  } else {
    // Below 90 % — slim chance
    acceptanceProbability = Math.max(0.02, aavRatio - 0.80)
  }

  // Loyalty bonus for staying at current club
  const isStaying = offer.clubId === currentClubId
  if (isStaying && loyaltyEnabled) {
    acceptanceProbability = Math.min(0.99, acceptanceProbability + 0.10)
  }

  // Small boost if years exactly match preference
  if (offer.years === demand.yearsWanted) {
    acceptanceProbability = Math.min(0.99, acceptanceProbability + 0.05)
  }

  // --- Roll the dice ---
  if (rng.chance(acceptanceProbability)) {
    return {
      accepted: true,
      counterOffer: null,
      message: `${player.firstName} ${player.lastName} has accepted the ${offer.years}-year, $${offer.aav.toLocaleString()} per year offer${isStaying ? ' to remain at the club' : ''}.`,
    }
  }

  // --- Rejection → generate counter-offer ---
  // The counter is the player's demand, but nudged slightly toward the offer
  // so negotiations can converge.
  const counterAav = roundSalary(
    demand.aavWanted * 0.95 + offer.aav * 0.05,
  )
  const counterYears = demand.yearsWanted
  const counterEscalation = rng.nextFloat(0.03, 0.05)
  const counterYearByYear = buildYearByYear(counterAav, counterYears, counterEscalation)

  const counterOffer: ContractDemand = {
    yearsWanted: counterYears,
    aavWanted: Math.max(MINIMUM_SALARY, counterAav),
    yearByYear: counterYearByYear,
    willingToNegotiate: demand.willingToNegotiate,
  }

  return {
    accepted: false,
    counterOffer,
    message: `${player.firstName} ${player.lastName} has rejected the offer and countered with ${counterYears} years at $${counterAav.toLocaleString()} per year.`,
  }
}

// ---------------------------------------------------------------------------
// 4. calculateClubSalaryTotal
// ---------------------------------------------------------------------------

/**
 * Returns the total salary commitment for a club in the **current year**
 * (i.e. the first entry in each player's `yearByYear` array).
 *
 * Only players whose `clubId` matches are included.
 */
export function calculateClubSalaryTotal(players: Player[], clubId: string): number {
  let total = 0
  for (const player of players) {
    if (player.clubId === clubId && player.contract.yearByYear.length > 0) {
      total += player.contract.yearByYear[0]
    }
  }
  return total
}

// ---------------------------------------------------------------------------
// 5. getCapSpace
// ---------------------------------------------------------------------------

/**
 * Returns the remaining salary-cap room for a club in the current year.
 *
 * A negative value means the club is over the cap.
 */
export function getCapSpace(
  players: Player[],
  clubId: string,
  salaryCapAmount: number,
  softCapEnabled?: boolean,
): number {
  const effectiveCap = softCapEnabled
    ? salaryCapAmount * 1.10
    : salaryCapAmount
  return effectiveCap - calculateClubSalaryTotal(players, clubId)
}

/**
 * Calculates luxury tax for a club that has exceeded the hard salary cap.
 * Tax is 150% of the amount over the cap. Returns 0 if under the cap.
 */
export function calculateLuxuryTax(
  players: Player[],
  clubId: string,
  salaryCapAmount: number,
): number {
  const total = calculateClubSalaryTotal(players, clubId)
  const overage = total - salaryCapAmount
  if (overage <= 0) return 0
  return Math.round(overage * 1.5)
}

// ---------------------------------------------------------------------------
// 6. projectCapSpace
// ---------------------------------------------------------------------------

/**
 * Projects cap space for each of the next `yearsAhead` seasons.
 *
 * For each future year index *i* (0-based, where 0 = next year, 1 = two
 * years from now, etc.) the function sums the salary of every club player
 * whose contract extends that far.  Contracts that expire before year *i*
 * simply drop off the books.
 *
 * Returns an array of length `yearsAhead` where each element is the
 * projected cap space for that year.
 */
export function projectCapSpace(
  players: Player[],
  clubId: string,
  salaryCapAmount: number,
  yearsAhead: number,
): number[] {
  const clubPlayers = players.filter((p) => p.clubId === clubId)

  const projection: number[] = []

  for (let year = 0; year < yearsAhead; year++) {
    // `year` is how many years into the future (0 = next year).
    // yearByYear index: year 0 is this year's salary which is index 0,
    // year 1 is next year which is index 1, etc.
    // We start from index 1 because index 0 is the current year.
    const futureIndex = year + 1

    let totalSalary = 0
    for (const player of clubPlayers) {
      const schedule = player.contract.yearByYear
      if (futureIndex < schedule.length) {
        totalSalary += schedule[futureIndex]
      }
      // If the contract doesn't extend to this year, the player is off the
      // books and contributes $0.
    }

    projection.push(salaryCapAmount - totalSalary)
  }

  return projection
}
