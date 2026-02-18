import type { Player } from '@/types/player'
import type { ContractClause, ContractStructure } from '@/types/contract'
import type { SeededRNG } from '@/engine/core/rng'
import { roundSalary } from '@/engine/contracts/negotiation'

// ---------------------------------------------------------------------------
// 1. buildYearByYearFromStructure
// ---------------------------------------------------------------------------

/**
 * Build a year-by-year salary array from an AAV and structure type.
 * The average of the array will equal the AAV.
 */
export function buildYearByYearFromStructure(
  aav: number,
  years: number,
  structure: ContractStructure,
  rate: number = 0.04,
): number[] {
  if (years <= 0) return []
  if (years === 1) return [roundSalary(aav)]

  switch (structure) {
    case 'flat':
      return Array.from({ length: years }, () => roundSalary(aav))

    case 'front-loaded': {
      // Year 1 = 125% of AAV, declining linearly so average = AAV
      const totalBudget = aav * years
      const step = (aav * 0.5) / (years - 1) // decline per year
      const yearOne = aav + (aav * 0.25)
      const salaries: number[] = []
      let running = 0
      for (let i = 0; i < years; i++) {
        const raw = yearOne - step * i
        salaries.push(roundSalary(raw))
        running += salaries[i]
      }
      // Adjust last year to hit exact total
      const diff = totalBudget - running
      salaries[years - 1] = roundSalary(salaries[years - 1] + diff)
      return salaries
    }

    case 'back-loaded': {
      // Year 1 = 75% of AAV, rising linearly so average = AAV
      const totalBudget = aav * years
      const step = (aav * 0.5) / (years - 1)
      const yearOne = aav - (aav * 0.25)
      const salaries: number[] = []
      let running = 0
      for (let i = 0; i < years; i++) {
        const raw = yearOne + step * i
        salaries.push(roundSalary(raw))
        running += salaries[i]
      }
      const diff = totalBudget - running
      salaries[years - 1] = roundSalary(salaries[years - 1] + diff)
      return salaries
    }

    case 'escalating': {
      // Geometric escalation: each year grows by `rate` (3-5%)
      const r = 1 + rate
      const seriesSum = (Math.pow(r, years) - 1) / (r - 1)
      const baseSalary = (aav * years) / seriesSum
      const salaries: number[] = []
      for (let i = 0; i < years; i++) {
        salaries.push(roundSalary(baseSalary * Math.pow(r, i)))
      }
      return salaries
    }

    default:
      return Array.from({ length: years }, () => roundSalary(aav))
  }
}

// ---------------------------------------------------------------------------
// 2. calculateIncentiveValue
// ---------------------------------------------------------------------------

/**
 * Sum all bonus amounts from performance/games/finals clauses.
 */
export function calculateIncentiveValue(clauses: ContractClause[]): number {
  let total = 0
  for (const clause of clauses) {
    if (
      (clause.type === 'performance-bonus' ||
        clause.type === 'games-bonus' ||
        clause.type === 'finals-bonus' ||
        clause.type === 'awards-bonus' ||
        clause.type === 'goals-bonus') &&
      clause.bonusAmount
    ) {
      total += clause.bonusAmount
    }
  }
  return total
}

// ---------------------------------------------------------------------------
// 3. calculateCapHitWithIncentives
// ---------------------------------------------------------------------------

/**
 * 50% of incentives count against the salary cap.
 */
export function calculateCapHitWithIncentives(
  baseSalary: number,
  incentiveTotal: number,
): number {
  return baseSalary + Math.round(incentiveTotal * 0.50)
}

function clauseExpectedPayoutWeight(clause: ContractClause): number {
  switch (clause.type) {
    case 'games-bonus':
      return 0.55
    case 'performance-bonus':
      return 0.45
    case 'goals-bonus':
      return 0.42
    case 'finals-bonus':
      return 0.35
    case 'awards-bonus':
      return 0.18
    case 'vesting':
      return 0.4
    default:
      return 0
  }
}

function optionProbabilityForYear(clauses: ContractClause[], contractYear: number): number {
  let probability = 1
  for (const clause of clauses) {
    const optionYear = clause.optionYear ?? clause.appliesToYear
    if (!optionYear || optionYear !== contractYear) continue
    if (clause.type === 'player-option') probability = Math.min(probability, 0.65)
    if (clause.type === 'team-option') probability = Math.min(probability, 0.45)
  }
  return probability
}

export function calculateExpectedClauseCapAdjustment(
  clauses: ContractClause[],
  contractYear: number,
): number {
  let expected = 0
  for (const clause of clauses) {
    const applies = !clause.appliesToYear || clause.appliesToYear === contractYear
    if (!applies) continue
    const bonusAmount = clause.bonusAmount ?? 0
    if (bonusAmount <= 0) continue
    const weight = clauseExpectedPayoutWeight(clause)
    expected += Math.round(bonusAmount * weight * 0.5)
  }
  return expected
}

export function calculateContractCapHitForYear(
  params: {
    yearSalary: number
    contractYear: number
    clauses?: ContractClause[]
    incentiveTotal?: number
  },
): number {
  const clauses = params.clauses ?? []
  const optionProbability = optionProbabilityForYear(clauses, params.contractYear)
  const optionAdjustedBase = Math.round(params.yearSalary * optionProbability)
  const explicitIncentive = Math.round((params.incentiveTotal ?? 0) * 0.5)
  const clauseAdjustment = calculateExpectedClauseCapAdjustment(clauses, params.contractYear)
  return optionAdjustedBase + Math.max(explicitIncentive, clauseAdjustment)
}

// ---------------------------------------------------------------------------
// 4. generateClausePreferences
// ---------------------------------------------------------------------------

/**
 * Generate clause preferences based on player personality, age, and context.
 */
export function generateClausePreferences(
  player: Player,
  clubId: string,
  ladderPosition: number,
  rng: SeededRNG,
): ContractClause[] {
  const clauses: ContractClause[] = []
  const { personality, age } = player
  const isTopEight = ladderPosition <= 8

  // No-trade: loyal veterans
  if (personality.loyalty > 70 && age > 27 && player.clubId === clubId) {
    clauses.push({ type: 'no-trade' })
  }

  // Limited no-trade: many players seek partial destination control
  if (personality.loyalty > 58 && age >= 25 && rng.chance(0.35)) {
    clauses.push({
      type: 'limited-trade',
      vetoClubIds: [],
    })
  }

  // Player/team option clauses on longer deals
  if (age <= 27 && rng.chance(0.2)) {
    clauses.push({ type: 'player-option', optionYear: 4 })
  } else if (age >= 30 && rng.chance(0.2)) {
    clauses.push({ type: 'team-option', optionYear: 2 })
  }

  // Vesting protection year, usually tied to games played
  if (age >= 26 && rng.chance(0.22)) {
    clauses.push({
      type: 'vesting',
      appliesToYear: 2,
      bonusAmount: rng.nextInt(80, 180) * 1000,
      vestingCondition: { type: 'games-played', threshold: rng.nextInt(15, 21) },
    })
  }

  // Contender-only: ambitious veterans
  if (personality.ambition > 75 && age > 28 && player.clubId !== clubId) {
    clauses.push({ type: 'contender-only' })
  }

  // Home-state: loyal players
  if (personality.loyalty > 60 && rng.chance(0.3)) {
    clauses.push({ type: 'home-state' })
  }

  // Performance bonus: ambitious, in-form
  if (personality.ambition > 60 && player.form > 65) {
    const bonusAmount = rng.nextInt(20, 60) * 1000
    clauses.push({
      type: 'performance-bonus',
      bonusAmount,
      bonusThreshold: { stat: 'disposals', value: rng.nextInt(20, 30) },
    })
  }

  // Games bonus: older players want games guarantees
  if (age > 30) {
    const bonusAmount = rng.nextInt(15, 40) * 1000
    clauses.push({
      type: 'games-bonus',
      bonusAmount,
      bonusThreshold: { stat: 'gamesPlayed', value: rng.nextInt(15, 20) },
    })
  }

  // Finals bonus: ambitious players at contending clubs
  if (personality.ambition > 65 && isTopEight) {
    const bonusAmount = rng.nextInt(25, 75) * 1000
    clauses.push({
      type: 'finals-bonus',
      bonusAmount,
    })
  }

  if (personality.ambition > 68 && rng.chance(0.25)) {
    clauses.push({
      type: 'goals-bonus',
      bonusAmount: rng.nextInt(15, 55) * 1000,
      bonusThreshold: { stat: 'goals', value: rng.nextInt(25, 55) },
    })
  }

  if (personality.ambition > 72 && rng.chance(0.2)) {
    clauses.push({
      type: 'awards-bonus',
      bonusAmount: rng.nextInt(20, 80) * 1000,
      bonusThreshold: { stat: 'awards', value: 1 },
    })
  }

  if (player.personality.ambition > 65) {
    clauses.push({ type: 'role-promise', promisedPosition: player.position.primary })
  }
  if (player.attributes.leadership >= 75 && player.age >= 24) {
    clauses.push({ type: 'leadership-promise', leadershipLevel: 'group' })
  }

  return clauses
}
