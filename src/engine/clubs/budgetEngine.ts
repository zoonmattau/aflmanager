import type { Club, ClubBudgetAllocation, BudgetDepartment } from '@/types/club'
import type { Player } from '@/types/player'
import type { StaffMember } from '@/types/staff'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MIN_DEPARTMENT_PCT = 5
export const MAX_DEPARTMENT_PCT = 50
export const BUDGET_TOTAL = 100

export const BUDGET_DEPARTMENTS: BudgetDepartment[] = [
  'facilities',
  'coaching',
  'recruiting',
  'medical',
  'scouting',
]

export const DEFAULT_BUDGET_ALLOCATION: ClubBudgetAllocation = {
  facilities: 20,
  coaching: 20,
  recruiting: 20,
  medical: 20,
  scouting: 20,
}

export interface DepartmentMeta {
  label: string
  description: string
  impactDescription: string
  iconName: string
}

export const DEPARTMENT_META: Record<BudgetDepartment, DepartmentMeta> = {
  facilities: {
    label: 'Facilities',
    description: 'Maintenance and improvement of training grounds, gym, and recovery areas',
    impactDescription: 'Training effectiveness and recovery speed',
    iconName: 'Building2',
  },
  coaching: {
    label: 'Coaching',
    description: 'Coaching staff resources, player development programs, and tactical analysis',
    impactDescription: 'Player development speed and match-day performance',
    iconName: 'GraduationCap',
  },
  recruiting: {
    label: 'Recruiting',
    description: 'Draft scouting, trade facilitation, and player acquisition resources',
    impactDescription: 'Draft pick accuracy and trade opportunities',
    iconName: 'UserSearch',
  },
  medical: {
    label: 'Medical',
    description: 'Medical staff, physiotherapy, injury prevention, and rehabilitation programs',
    impactDescription: 'Injury prevention, recovery time, and recurrence reduction',
    iconName: 'Stethoscope',
  },
  scouting: {
    label: 'Scouting',
    description: 'Scouting network, prospect evaluation, and opposition analysis',
    impactDescription: 'Scouting accuracy and opposition preparation',
    iconName: 'Search',
  },
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/** Get a club's budget allocation, falling back to default if undefined. */
export function getClubBudgetAllocation(club: Club): ClubBudgetAllocation {
  return club.budgetAllocation ?? { ...DEFAULT_BUDGET_ALLOCATION }
}

/** Validate that an allocation sums to 100 and each department is in [5, 50]. */
export function validateBudgetAllocation(
  alloc: ClubBudgetAllocation,
): { valid: boolean; error?: string } {
  const sum = alloc.facilities + alloc.coaching + alloc.recruiting + alloc.medical + alloc.scouting
  if (sum !== BUDGET_TOTAL) {
    return { valid: false, error: `Allocation must sum to ${BUDGET_TOTAL}%, currently ${sum}%` }
  }
  for (const dept of BUDGET_DEPARTMENTS) {
    const val = alloc[dept]
    if (val < MIN_DEPARTMENT_PCT || val > MAX_DEPARTMENT_PCT) {
      return {
        valid: false,
        error: `${DEPARTMENT_META[dept].label} must be between ${MIN_DEPARTMENT_PCT}% and ${MAX_DEPARTMENT_PCT}%, currently ${val}%`,
      }
    }
  }
  return { valid: true }
}

/**
 * Convert a department percentage to a multiplier.
 * 20% (default) = 1.0x. Range clamped to [0.5, 2.0].
 * Linear: every 1% above 20 adds 0.033x, every 1% below 20 subtracts 0.033x.
 */
export function getBudgetMultiplier(
  alloc: ClubBudgetAllocation,
  dept: BudgetDepartment,
): number {
  const pct = alloc[dept]
  // 20% -> 1.0, 5% -> 0.5, 50% -> 2.0
  const multiplier = 1.0 + (pct - 20) * (1.0 / 30)
  return Math.max(0.5, Math.min(2.0, multiplier))
}

// ---------------------------------------------------------------------------
// Discretionary budget calculation
// ---------------------------------------------------------------------------

export interface DiscretionaryBudgetBreakdown {
  revenue: number
  playerSalaries: number
  staffSalaries: number
  facilityMaintenance: number
  operations: number
  totalMandatory: number
  discretionary: number
}

const FACILITY_KEYS: (keyof Club['facilities'])[] = [
  'trainingGround', 'gym', 'medicalCentre', 'recoveryPool', 'analysisSuite', 'youthAcademy',
]

/** Calculate discretionary budget = revenue - mandatory costs. */
export function calculateDiscretionaryBudget(
  club: Club,
  players: Player[],
  staffMembers: StaffMember[],
): DiscretionaryBudgetBreakdown {
  const revenue = club.finances.revenue || 16_000_000 // fallback estimate
  const playerSalaries = players.reduce((sum, p) => sum + p.contract.aav, 0)
  const staffSalaries = staffMembers.reduce((sum, s) => sum + s.salary, 0)
  const facilityMaintenance = FACILITY_KEYS.reduce(
    (sum, key) => sum + club.facilities[key] * 100_000, 0,
  )
  const operations = 2_000_000
  const totalMandatory = playerSalaries + staffSalaries + facilityMaintenance + operations

  return {
    revenue,
    playerSalaries,
    staffSalaries,
    facilityMaintenance,
    operations,
    totalMandatory,
    discretionary: Math.max(0, revenue - totalMandatory),
  }
}

// ---------------------------------------------------------------------------
// Budget impact projections (for UI)
// ---------------------------------------------------------------------------

export interface DepartmentProjection {
  department: BudgetDepartment
  percentage: number
  multiplier: number
  dollarAmount: number
  effects: { label: string; delta: string; positive: boolean }[]
}

/** Generate per-department projections for display. */
export function projectBudgetImpacts(
  alloc: ClubBudgetAllocation,
  discretionaryBudget: number,
): DepartmentProjection[] {
  return BUDGET_DEPARTMENTS.map((dept) => {
    const pct = alloc[dept]
    const multiplier = getBudgetMultiplier(alloc, dept)
    const dollarAmount = Math.round(discretionaryBudget * (pct / 100))
    const deltaPercent = Math.round((multiplier - 1) * 100)
    const sign = deltaPercent >= 0 ? '+' : ''
    const positive = deltaPercent >= 0

    const effects = getDepartmentEffects(dept, deltaPercent, sign, positive)

    return { department: dept, percentage: pct, multiplier, dollarAmount, effects }
  })
}

function getDepartmentEffects(
  dept: BudgetDepartment,
  delta: number,
  sign: string,
  positive: boolean,
): { label: string; delta: string; positive: boolean }[] {
  switch (dept) {
    case 'facilities':
      return [
        { label: 'Training effectiveness', delta: `${sign}${delta}%`, positive },
        { label: 'Recovery speed', delta: `${sign}${delta}%`, positive },
      ]
    case 'coaching':
      return [
        { label: 'Development speed', delta: `${sign}${delta}%`, positive },
        { label: 'Match-day bonus', delta: `${sign}${Math.round(delta * 0.6)}%`, positive },
      ]
    case 'recruiting':
      return [
        { label: 'Draft pick accuracy', delta: `${sign}${delta}%`, positive },
        { label: 'Trade intel quality', delta: `${sign}${Math.round(delta * 0.5)}%`, positive },
      ]
    case 'medical':
      return [
        { label: 'Injury prevention', delta: `${sign}${delta}%`, positive },
        { label: 'Rehab speed', delta: `${sign}${Math.round(delta * 0.8)}%`, positive },
      ]
    case 'scouting':
      return [
        { label: 'Scouting accuracy', delta: `${sign}${delta}%`, positive },
        { label: 'Opposition analysis', delta: `${sign}${Math.round(delta * 0.7)}%`, positive },
      ]
  }
}

// ---------------------------------------------------------------------------
// AI budget allocation generation
// ---------------------------------------------------------------------------

/**
 * Generate a budget allocation for an AI club based on its personality.
 * - Win-now: favors coaching + medical (performance now)
 * - Rebuilding: favors recruiting + scouting (future picks)
 * - Balanced: roughly even with slight coaching edge
 */
export function generateAIBudgetAllocation(club: Club): ClubBudgetAllocation {
  const window = club.aiPersonality?.competitiveWindow ?? 'balanced'

  switch (window) {
    case 'win-now':
      return { facilities: 18, coaching: 28, recruiting: 12, medical: 27, scouting: 15 }
    case 'rebuilding':
      return { facilities: 15, coaching: 15, recruiting: 28, medical: 14, scouting: 28 }
    case 'balanced':
    default:
      return { facilities: 20, coaching: 22, recruiting: 18, medical: 22, scouting: 18 }
  }
}
