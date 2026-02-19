// ---------------------------------------------------------------------------
// Finance Planning & Budgeting Types
// ---------------------------------------------------------------------------

export type LoanLenderType = 'afl-house' | 'bank' | 'private-equity'
export type LoanStatus = 'active' | 'paid-off' | 'defaulted'

export interface ClubLoan {
  id: string
  lender: LoanLenderType
  lenderName: string
  /** Original borrowed amount */
  principalAmount: number
  /** Current outstanding balance (principal only, not yet repaid) */
  remainingBalance: number
  /** Annual interest rate, e.g. 0.08 = 8% */
  annualInterestRate: number
  /** Fixed principal repaid each season end */
  annualPrincipalRepayment: number
  /** Loan term in seasons (years) */
  termSeasons: number
  /** Seasons remaining before loan is due */
  seasonsRemaining: number
  /** Cumulative interest charges paid so far */
  totalInterestPaid: number
  /** Season-year the loan was taken out */
  takenOutYear: number
  /** Season-year the loan will be fully repaid */
  estimatedPayoffYear: number
  status: LoanStatus
}

export interface LoanOption {
  lender: LoanLenderType
  lenderName: string
  tagline: string
  description: string
  /** Annual interest rate, e.g. 0.08 */
  annualInterestRate: number
  minAmount: number
  maxAmount: number
  /** Loan term in seasons */
  termSeasons: number
  requiresBoardApproval: boolean
  /** Job security penalty applied immediately on taking loan */
  jobSecurityPenalty: number
  /** Annual board instability score penalty while loan is active */
  ongoingInstabilityPenalty: number
  available: boolean
  unavailableReason?: string
}

/** One row in the multi-year P&L projection table */
export interface FinancialProjection {
  yearOffset: number
  /** Display label e.g. "This Season", "Season +1" */
  label: string
  projectedRevenue: number
  projectedExpenses: number
  /** Only includes current player + staff salaries under cap */
  projectedSalaryBill: number
  projectedLoanRepayments: number
  projectedInterestCharges: number
  projectedPnL: number
  /** Running balance after this season */
  cumulativeBalance: number
  isDeficit: boolean
  /** Short notes about key assumptions driving this year */
  assumptions: string[]
}

export type FinancialHealthGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'

export interface FinancialHealthReport {
  grade: FinancialHealthGrade
  score: number              // 0–100
  /** Impact on board satisfaction this season (+10 to -20) */
  boardImpact: number
  /** Impact on job security delta due to finances */
  jobSecurityImpact: number
  staffHiringCapacity: 'excellent' | 'good' | 'limited' | 'constrained' | 'critical'
  facilityInvestmentCapacity: 'excellent' | 'good' | 'limited' | 'constrained' | 'critical'
  sustainabilityRating: 'thriving' | 'stable' | 'cautious' | 'at-risk' | 'critical'
  hasActiveLoans: boolean
  totalLoanDebt: number
  annualLoanBurden: number
  /** Warnings to highlight in red */
  warnings: string[]
  /** Positive action recommendations */
  recommendations: string[]
}

export interface DepartmentBudgetLine {
  key: 'facilities' | 'coaching' | 'recruiting' | 'medical' | 'scouting' | 'marketing'
  label: string
  icon: string
  color: string
  description: string
  /** $ dollar value for the current allocation percent */
  dollarAmount: number
  /** 0.5 – 2.0 multiplier on base effectiveness */
  effectMultiplier: number
  effectLevel: 'excellent' | 'good' | 'average' | 'poor' | 'critical'
  primaryEffect: string
  secondaryEffect: string
  /** Things that get better if this dept gets more funding */
  boostHints: string[]
}
