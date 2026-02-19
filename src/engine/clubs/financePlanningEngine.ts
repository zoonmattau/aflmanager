import type { Club } from '@/types/club'
import type { Player } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import type {
  ClubLoan,
  LoanOption,
  FinancialProjection,
  FinancialHealthReport,
  FinancialHealthGrade,
  DepartmentBudgetLine,
} from '@/types/finance'
import {
  getClubBudgetAllocation,
  getBudgetMultiplier,
  calculateDiscretionaryBudget,
  DEPARTMENT_META,
  BUDGET_DEPARTMENTS,
} from './budgetEngine'

// ---------------------------------------------------------------------------
// Loan options
// ---------------------------------------------------------------------------

/**
 * Returns the available loan products for the player's club.
 * Availability is gated on allowLoans setting, existing debt, and balance.
 */
export function getLoanOptions(
  club: Club,
  currentYear: number,
  allowLoans: boolean,
): LoanOption[] {
  const balance = club.finances.balance
  const activeLoans = (club.finances.loans ?? []).filter((l) => l.status === 'active')
  const totalDebt = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0)
  const hasAflHouseLoan = activeLoans.some((l) => l.lender === 'afl-house')
  const hasBankLoan = activeLoans.some((l) => l.lender === 'bank')
  const hasPELoan = activeLoans.some((l) => l.lender === 'private-equity')

  return [
    {
      lender: 'afl-house',
      lenderName: 'AFL House',
      tagline: 'Low-interest stabilisation fund',
      description:
        'AFL House offers emergency financial assistance to struggling clubs. Low interest but public scrutiny and board pressure.',
      annualInterestRate: 0.03,
      minAmount: 500_000,
      maxAmount: 5_000_000,
      termSeasons: 5,
      requiresBoardApproval: true,
      jobSecurityPenalty: 8,
      ongoingInstabilityPenalty: 3,
      available: allowLoans && !hasAflHouseLoan && balance < 5_000_000,
      unavailableReason: !allowLoans
        ? 'Loans are disabled in your realism settings'
        : hasAflHouseLoan
        ? 'Already have an active AFL House loan'
        : balance >= 5_000_000
        ? 'Club finances are too strong to qualify for AFL assistance'
        : undefined,
    },
    {
      lender: 'bank',
      lenderName: 'Commercial Bank',
      tagline: 'Standard commercial lending at market rates',
      description:
        'A commercial bank loan at market rates. More flexible amounts but higher interest and ongoing instability.',
      annualInterestRate: 0.07,
      minAmount: 1_000_000,
      maxAmount: 10_000_000,
      termSeasons: 7,
      requiresBoardApproval: true,
      jobSecurityPenalty: 5,
      ongoingInstabilityPenalty: 2,
      available: allowLoans && !hasBankLoan && totalDebt < 15_000_000,
      unavailableReason: !allowLoans
        ? 'Loans are disabled in your realism settings'
        : hasBankLoan
        ? 'Already have an active bank loan'
        : totalDebt >= 15_000_000
        ? 'Total debt exceeds the bank\'s lending threshold'
        : undefined,
    },
    {
      lender: 'private-equity',
      lenderName: 'Private Equity Investor',
      tagline: 'High-risk capital injection with strings attached',
      description:
        'A private equity group provides a large injection of capital at high interest rates. Significant board instability and reputational risk.',
      annualInterestRate: 0.12,
      minAmount: 3_000_000,
      maxAmount: 20_000_000,
      termSeasons: 10,
      requiresBoardApproval: true,
      jobSecurityPenalty: 15,
      ongoingInstabilityPenalty: 5,
      available: allowLoans && !hasPELoan,
      unavailableReason: !allowLoans
        ? 'Loans are disabled in your realism settings'
        : hasPELoan
        ? 'Already have an active private equity arrangement'
        : undefined,
    },
  ]
}

// ---------------------------------------------------------------------------
// Multi-year financial projections
// ---------------------------------------------------------------------------

/**
 * Generate a rolling P&L projection for the next `seasons` seasons.
 * Assumes modest revenue growth and flat costs as a baseline.
 */
export function generateProjections(
  club: Club,
  players: Player[],
  staff: StaffMember[],
  seasons = 3,
): FinancialProjection[] {
  const clubPlayers = players.filter((p) => p.clubId === club.id)
  const clubStaff = staff.filter((s) => s.clubId === club.id)
  const activeLoans = (club.finances.loans ?? []).filter((l) => l.status === 'active')

  const baseRevenue = club.finances.revenue || 16_000_000
  const basePlayerSalaries = clubPlayers.reduce((sum, p) => sum + p.contract.aav, 0)
  const baseStaffSalaries = clubStaff.reduce((sum, s) => sum + s.salary, 0)
  const facilityMaintenance = Object.values(club.facilities).reduce(
    (sum, level) => sum + level * 100_000,
    0,
  )
  const operations = 2_000_000

  let cumulativeBalance = club.finances.balance
  const projections: FinancialProjection[] = []

  for (let i = 0; i < seasons; i++) {
    // Revenue grows ~2.5% per year (inflation + membership growth)
    const revenueGrowth = Math.pow(1.025, i)
    const projectedRevenue = Math.round(baseRevenue * revenueGrowth)

    // Salary bill grows ~3% per year (cap increases)
    const salaryGrowth = Math.pow(1.03, i)
    const projectedSalaryBill = Math.round(
      (basePlayerSalaries + baseStaffSalaries) * salaryGrowth,
    )

    const projectedExpenses = projectedSalaryBill + facilityMaintenance + operations

    // Loan repayments
    let projectedLoanRepayments = 0
    let projectedInterestCharges = 0
    for (const loan of activeLoans) {
      if (loan.seasonsRemaining > i) {
        projectedLoanRepayments += loan.annualPrincipalRepayment
        // Interest on declining balance
        const estimatedBalance = Math.max(
          0,
          loan.remainingBalance - loan.annualPrincipalRepayment * i,
        )
        projectedInterestCharges += Math.round(estimatedBalance * loan.annualInterestRate)
      }
    }

    const projectedPnL =
      projectedRevenue - projectedExpenses - projectedLoanRepayments - projectedInterestCharges
    cumulativeBalance += projectedPnL

    const assumptions: string[] = []
    if (i === 0) assumptions.push('Based on current season revenue and cost structure')
    if (i > 0) assumptions.push(`Revenue assumes +${Math.round((revenueGrowth - 1) * 100)}% cumulative growth`)
    if (projectedLoanRepayments > 0)
      assumptions.push(
        `Includes $${(projectedLoanRepayments / 1_000_000).toFixed(1)}M loan repayments`,
      )
    if (projectedInterestCharges > 0)
      assumptions.push(
        `$${(projectedInterestCharges / 1_000_000).toFixed(1)}M interest charges`,
      )

    projections.push({
      yearOffset: i,
      label: i === 0 ? 'This Season' : i === 1 ? 'Season +1' : `Season +${i}`,
      projectedRevenue,
      projectedExpenses,
      projectedSalaryBill,
      projectedLoanRepayments,
      projectedInterestCharges,
      projectedPnL,
      cumulativeBalance,
      isDeficit: projectedPnL < 0,
      assumptions,
    })
  }

  return projections
}

// ---------------------------------------------------------------------------
// Financial health report
// ---------------------------------------------------------------------------

export function calculateFinancialHealth(
  club: Club,
  players: Player[],
  staff: StaffMember[],
): FinancialHealthReport {
  const balance = club.finances.balance
  const revenue = club.finances.revenue || 16_000_000
  const activeLoans = (club.finances.loans ?? []).filter((l) => l.status === 'active')
  const totalLoanDebt = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0)
  const annualLoanBurden = activeLoans.reduce(
    (sum, l) =>
      sum + l.annualPrincipalRepayment + Math.round(l.remainingBalance * l.annualInterestRate),
    0,
  )

  const clubPlayers = players.filter((p) => p.clubId === club.id)
  const clubStaff = staff.filter((s) => s.clubId === club.id)
  const totalWages =
    clubPlayers.reduce((sum, p) => sum + p.contract.aav, 0) +
    clubStaff.reduce((sum, s) => sum + s.salary, 0)

  let score = 100
  const warnings: string[] = []
  const recommendations: string[] = []

  // Cash balance
  if (balance < 0) {
    score -= 35
    warnings.push(
      `Operating deficit of $${(Math.abs(balance) / 1_000_000).toFixed(1)}M — urgent action required`,
    )
  } else if (balance < 2_000_000) {
    score -= 18
    warnings.push('Cash reserves critically low — less than $2M buffer')
  } else if (balance < 5_000_000) {
    score -= 8
    recommendations.push('Build cash reserves above $5M for financial stability')
  }

  // Debt-to-revenue ratio
  if (revenue > 0 && totalLoanDebt > 0) {
    const dtr = totalLoanDebt / revenue
    if (dtr > 1.5) {
      score -= 25
      warnings.push(
        `Loan debt is ${dtr.toFixed(1)}× annual revenue — very high financial risk`,
      )
    } else if (dtr > 1.0) {
      score -= 15
      warnings.push('Loan debt exceeds annual revenue — elevated financial risk')
    } else if (dtr > 0.5) {
      score -= 8
      recommendations.push('Reducing loan burden would significantly improve resilience')
    }
  }

  // Annual loan burden vs revenue
  if (revenue > 0 && annualLoanBurden > revenue * 0.2) {
    score -= 10
    warnings.push(
      `Annual loan repayments consume ${Math.round((annualLoanBurden / revenue) * 100)}% of revenue`,
    )
  }

  // Wages-to-revenue
  if (revenue > 0) {
    const wageRatio = totalWages / revenue
    if (wageRatio > 0.9) {
      score -= 15
      warnings.push(`Wages consume ${Math.round(wageRatio * 100)}% of revenue — unsustainable`)
    } else if (wageRatio > 0.8) {
      score -= 8
      recommendations.push('High wage-to-revenue ratio — review contract commitments')
    }
  }

  score = Math.max(0, Math.min(100, score))

  let grade: FinancialHealthGrade
  if (score >= 90) grade = 'A+'
  else if (score >= 80) grade = 'A'
  else if (score >= 68) grade = 'B'
  else if (score >= 52) grade = 'C'
  else if (score >= 35) grade = 'D'
  else grade = 'F'

  const boardImpact =
    score >= 85 ? 10
    : score >= 70 ? 5
    : score >= 55 ? 0
    : score >= 35 ? -8
    : -20

  const jobSecurityImpact =
    score < 35 ? -10
    : score < 55 ? -5
    : score >= 85 ? 3
    : 0

  const discretionary = Math.max(0, balance)

  const staffHiringCapacity: FinancialHealthReport['staffHiringCapacity'] =
    discretionary > 3_000_000 ? 'excellent'
    : discretionary > 1_500_000 ? 'good'
    : discretionary > 500_000 ? 'limited'
    : balance > 0 ? 'constrained'
    : 'critical'

  const facilityInvestmentCapacity: FinancialHealthReport['facilityInvestmentCapacity'] =
    discretionary > 5_000_000 ? 'excellent'
    : discretionary > 2_000_000 ? 'good'
    : discretionary > 500_000 ? 'limited'
    : balance > 0 ? 'constrained'
    : 'critical'

  const sustainabilityRating: FinancialHealthReport['sustainabilityRating'] =
    score >= 85 ? 'thriving'
    : score >= 70 ? 'stable'
    : score >= 55 ? 'cautious'
    : score >= 35 ? 'at-risk'
    : 'critical'

  return {
    grade,
    score,
    boardImpact,
    jobSecurityImpact,
    staffHiringCapacity,
    facilityInvestmentCapacity,
    sustainabilityRating,
    hasActiveLoans: activeLoans.length > 0,
    totalLoanDebt,
    annualLoanBurden,
    warnings,
    recommendations,
  }
}

// ---------------------------------------------------------------------------
// Department budget lines for the UI
// ---------------------------------------------------------------------------

const DEPT_COLORS: Record<string, string> = {
  facilities: '#3b82f6',
  coaching: '#8b5cf6',
  recruiting: '#10b981',
  medical: '#f59e0b',
  scouting: '#ef4444',
  marketing: '#ec4899',
}

const DEPT_PRIMARY_EFFECTS: Record<string, string> = {
  facilities: 'Training quality and recovery infrastructure rating',
  coaching: 'Player development rate and match-day performance',
  recruiting: 'Draft pick accuracy and trade intelligence',
  medical: 'Injury prevention rate and rehabilitation speed',
  scouting: 'Opposition analysis depth and prospect evaluation',
  marketing: 'Membership growth and sponsorship deal value',
}

const DEPT_SECONDARY_EFFECTS: Record<string, string> = {
  facilities: 'High allocation accelerates facility upgrade approvals',
  coaching: 'Low allocation slows development of emerging players',
  recruiting: 'High allocation surfaces hidden late-round draft gems',
  medical: 'At max funding, halves average injury recovery time',
  scouting: 'Unlocks detailed opposition scouting reports pre-match',
  marketing: 'Boosts fan satisfaction and media perception metrics',
}

const DEPT_BOOST_HINTS: Record<string, string[]> = {
  facilities: ['Upgrade approval probability', 'Post-match recovery speed'],
  coaching: ['Development session XP', 'Match-day bonus rating'],
  recruiting: ['Draft ceiling boost', 'Trade value accuracy'],
  medical: ['Weeks saved per injury', 'Season-ending injury prevention'],
  scouting: ['Opponent weakness reveals', 'Prospect hidden ratings'],
  marketing: ['Membership tier growth', 'Sponsorship renewal bonus'],
}

export function getDepartmentBudgetLines(
  club: Club,
  players: Player[],
  staff: StaffMember[],
): DepartmentBudgetLine[] {
  const alloc = getClubBudgetAllocation(club)
  const { discretionary } = calculateDiscretionaryBudget(
    club,
    players.filter((p) => p.clubId === club.id),
    staff.filter((s) => s.clubId === club.id),
  )

  return BUDGET_DEPARTMENTS.map((dept) => {
    const pct = alloc[dept]
    const multiplier = getBudgetMultiplier(alloc, dept)
    const dollarAmount = Math.round(Math.max(0, discretionary) * (pct / 100))

    const effectLevel: DepartmentBudgetLine['effectLevel'] =
      multiplier >= 1.5 ? 'excellent'
      : multiplier >= 1.15 ? 'good'
      : multiplier >= 0.85 ? 'average'
      : multiplier >= 0.65 ? 'poor'
      : 'critical'

    return {
      key: dept,
      label: DEPARTMENT_META[dept].label,
      icon: DEPARTMENT_META[dept].iconName,
      color: DEPT_COLORS[dept],
      description: DEPARTMENT_META[dept].description,
      dollarAmount,
      effectMultiplier: multiplier,
      effectLevel,
      primaryEffect: DEPT_PRIMARY_EFFECTS[dept],
      secondaryEffect: DEPT_SECONDARY_EFFECTS[dept],
      boostHints: DEPT_BOOST_HINTS[dept],
    }
  })
}

// ---------------------------------------------------------------------------
// Loan creation helper
// ---------------------------------------------------------------------------

export function createLoan(
  lender: import('@/types/finance').LoanLenderType,
  lenderName: string,
  amount: number,
  annualInterestRate: number,
  termSeasons: number,
  currentYear: number,
): ClubLoan {
  const annualPrincipalRepayment = Math.round(amount / termSeasons)
  return {
    id: crypto.randomUUID(),
    lender,
    lenderName,
    principalAmount: amount,
    remainingBalance: amount,
    annualInterestRate,
    annualPrincipalRepayment,
    termSeasons,
    seasonsRemaining: termSeasons,
    totalInterestPaid: 0,
    takenOutYear: currentYear,
    estimatedPayoffYear: currentYear + termSeasons,
    status: 'active',
  }
}

/**
 * Process annual loan repayment at season end for a single club.
 * Mutates the loan array in-place. Returns the total cash outflow.
 */
export function processLoanRepayments(loans: ClubLoan[], currentYear: number): number {
  let totalOutflow = 0
  for (const loan of loans) {
    if (loan.status !== 'active') continue
    const interestCharge = Math.round(loan.remainingBalance * loan.annualInterestRate)
    const repayment = Math.min(loan.annualPrincipalRepayment, loan.remainingBalance)
    loan.remainingBalance = Math.max(0, loan.remainingBalance - repayment)
    loan.totalInterestPaid += interestCharge
    loan.seasonsRemaining = Math.max(0, loan.seasonsRemaining - 1)
    totalOutflow += repayment + interestCharge
    if (loan.remainingBalance === 0) {
      loan.status = 'paid-off'
    }
  }
  return totalOutflow
}
