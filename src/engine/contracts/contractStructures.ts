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
        clause.type === 'finals-bonus') &&
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

  return clauses
}
