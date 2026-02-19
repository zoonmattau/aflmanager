import type { Club } from '@/types/club'
import type { Player } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import type { SeededRNG } from '@/engine/core/rng'
import {
  calculateRevenue,
  calculateExpenses,
  type RevenueBreakdown,
  type ExpenseBreakdown,
} from '@/engine/clubs/clubManagement'
import {
  calculateDistribution,
  DEFAULT_DISTRIBUTION_CONFIG,
} from '@/engine/clubs/distributionEngine'
import type { AflDistributionConfig, DistributionBreakdown } from '@/types/distributions'

// ---------------------------------------------------------------------------
// Momentum modifier from recent form
// ---------------------------------------------------------------------------

/**
 * Maps last-5 match results to a momentum modifier (-0.10 to +0.15).
 * Applied to membership & sponsorship revenue at season end.
 *
 *   5W = +0.15, 4W1D = +0.12, 4W1L = +0.10, 3W = +0.06,
 *   2W = +0.02, even = 0, 2L = -0.04, 3+L = -0.06...-0.10
 */
export function calculateMomentumModifier(
  recentResults: readonly ('W' | 'L' | 'D')[],
): number {
  if (recentResults.length === 0) return 0

  const wins = recentResults.filter((r) => r === 'W').length
  const losses = recentResults.filter((r) => r === 'L').length
  const n = recentResults.length

  // Net result: +1 per win, -1 per loss, 0 per draw
  const net = wins - losses

  // Scale: net ranges from -n to +n, map to -0.10..+0.15
  if (net > 0) {
    // Winning: 0 to +0.15
    return Math.min(0.15, (net / n) * 0.15)
  }
  if (net < 0) {
    // Losing: 0 to -0.10
    return Math.max(-0.10, (net / n) * 0.10)
  }
  return 0
}

// ---------------------------------------------------------------------------
// Season-end financial processing
// ---------------------------------------------------------------------------

export interface SeasonEndFinanceResult {
  revenue: RevenueBreakdown
  expenses: ExpenseBreakdown
  luxuryTax: number
  pnl: number
  newBalance: number
  distributionBreakdown?: DistributionBreakdown
}

/**
 * Process season-end finances for a single club.
 *
 * Calls the updated `calculateRevenue()` and `calculateExpenses()`,
 * applies the momentum modifier to membership/sponsorship, computes
 * luxury tax if applicable, and returns the full financial picture.
 */
export function processSeasonEndFinances(
  club: Club,
  players: Player[],
  staff: StaffMember[],
  ladderPosition: number,
  isTop4: boolean,
  rng: SeededRNG,
  salaryCapAmount: number,
  softCapEnabled: boolean,
  awayGamesPlayed = 11,
  injuryWeeksTotal = 0,
  accumulatedGate?: number,
  accumulatedBroadcast?: number,
  finalsGate?: number,
  specialEvents?: number,
  inflationIndex = 1.0,
  totalTeams = 18,
  finalsWins = 0,
  isPremier = false,
  isRunnerUp = false,
  receivesPerformanceGrant = false,
  distributionConfig?: AflDistributionConfig,
): SeasonEndFinanceResult {
  // Player wage bill = sum of year-1 salaries for club players
  const clubPlayers = players.filter((p) => p.clubId === club.id)
  const playerWageBill = clubPlayers.reduce(
    (sum, p) => sum + (p.contract.yearByYear[0] ?? 0),
    0,
  )

  // Staff wage bill
  const clubStaff = staff.filter((s) => s.clubId === club.id)
  const staffWageBill = clubStaff.reduce((sum, s) => sum + s.salary, 0)

  const scoutingBudgetPct = club.budgetAllocation?.scouting ?? 20

  // Compute AFL distribution breakdown using configurable rules
  const distConfig = distributionConfig ?? DEFAULT_DISTRIBUTION_CONFIG
  const distributionBreakdown = calculateDistribution(
    distConfig,
    ladderPosition,
    totalTeams,
    finalsWins,
    isPremier,
    isRunnerUp,
    awayGamesPlayed,
    receivesPerformanceGrant,
    inflationIndex,
  )

  // Calculate base revenue (use distribution total as aflDistribution override)
  const revenue = calculateRevenue(
    club,
    ladderPosition,
    isTop4,
    rng,
    // For old saves: matchDayAccumulated combined gate+broadcast; use as gate fallback
    accumulatedGate ?? club.finances.matchDayAccumulated,
    accumulatedBroadcast ?? club.finances.broadcastAccumulated,
    finalsGate ?? club.finances.finalsRevenueAccumulated,
    specialEvents ?? club.finances.specialEventsAccumulated,
    distributionBreakdown.total,
    inflationIndex,
  )

  // Apply momentum modifier to membership & sponsorship
  const momentum = club.finances.momentumModifier ?? 0
  if (momentum !== 0) {
    revenue.membership = Math.round(revenue.membership * (1 + momentum))
    revenue.sponsorship = Math.round(revenue.sponsorship * (1 + momentum))
    revenue.total =
      revenue.matchDay +
      revenue.membership +
      revenue.sponsorship +
      revenue.broadcasting +
      revenue.merchandise +
      revenue.aflDistribution +
      revenue.finalsRevenue +
      revenue.specialEvents
  }

  // Calculate expenses with new params
  const expenses = calculateExpenses(
    club,
    staffWageBill,
    playerWageBill,
    awayGamesPlayed,
    injuryWeeksTotal,
    scoutingBudgetPct,
    revenue.total,
    inflationIndex,
  )

  // Luxury tax: 50% of amount over cap (only if soft cap enabled)
  let luxuryTax = 0
  if (softCapEnabled && playerWageBill > salaryCapAmount) {
    luxuryTax = Math.round((playerWageBill - salaryCapAmount) * 0.5)
  }

  const pnl = revenue.total - expenses.total - luxuryTax
  const newBalance = club.finances.balance + pnl

  return { revenue, expenses, luxuryTax, pnl, newBalance, distributionBreakdown }
}

// ---------------------------------------------------------------------------
// AI spending conservatism
// ---------------------------------------------------------------------------

/**
 * Returns a 0.4–1.0 factor indicating how willing an AI club should be
 * to spend on free agents. Low-balance clubs become conservative.
 *
 *   balance >= $10M  → 1.0 (spend freely)
 *   balance $5-10M   → 0.8
 *   balance $2-5M    → 0.6
 *   balance < $2M    → 0.4 (very conservative)
 */
export function getAISpendingConservatism(balance: number): number {
  if (balance >= 10_000_000) return 1.0
  if (balance >= 5_000_000) return 0.8
  if (balance >= 2_000_000) return 0.6
  return 0.4
}
