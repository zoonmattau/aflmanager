import type { Club } from '@/types/club'
import type { ApprovalFactor } from '@/types/facilityUpgrade'
import type { GameSettings } from '@/types/game'
import type {
  BoardApprovalCategory,
  BoardApprovalResult,
  BoardApprovalRecord,
  BoardApprovalTracker,
} from '@/types/boardApproval'
import type { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DENIAL_COOLDOWN_DAYS = 7

/** Contract AAV must be >= this fraction of the salary cap to require approval */
const CONTRACT_AAV_CAP_FRACTION = 0.04
/** Absolute floor: contracts >= this always require approval */
const CONTRACT_AAV_FLOOR = 650_000

/** Staff salary threshold for board approval */
const STAFF_SALARY_THRESHOLD = 300_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// needsBoardApproval
// ---------------------------------------------------------------------------

export interface ContractApprovalParams {
  aav: number
}

export interface TradeApprovalParams {
  userSalaryRetention: number
}

export interface StaffApprovalParams {
  salary: number
}

export type BoardApprovalParams =
  | { category: 'contract'; params: ContractApprovalParams }
  | { category: 'trade'; params: TradeApprovalParams }
  | { category: 'staff-hire'; params: StaffApprovalParams }

export function needsBoardApproval(
  input: BoardApprovalParams,
  settings: GameSettings,
): boolean {
  if (!settings.realism.boardPressure) return false

  switch (input.category) {
    case 'contract': {
      const capThreshold = settings.salaryCapAmount * CONTRACT_AAV_CAP_FRACTION
      return input.params.aav >= capThreshold || input.params.aav >= CONTRACT_AAV_FLOOR
    }
    case 'trade':
      return input.params.userSalaryRetention > 0
    case 'staff-hire':
      return input.params.salary >= STAFF_SALARY_THRESHOLD
  }
}

// ---------------------------------------------------------------------------
// computeBoardApproval
// ---------------------------------------------------------------------------

export interface ComputeBoardApprovalInput {
  category: BoardApprovalCategory
  club: Club
  jobSecurity: number
  ladderPosition: number
  settings: GameSettings
  contractParams?: ContractApprovalParams
  tradeParams?: TradeApprovalParams
  staffParams?: StaffApprovalParams
}

export function computeBoardApproval(input: ComputeBoardApprovalInput): BoardApprovalResult {
  const { category, club, jobSecurity, ladderPosition, settings } = input

  // If board pressure is off, auto-approve
  const requiresApproval = (() => {
    switch (category) {
      case 'contract':
        return input.contractParams
          ? needsBoardApproval({ category: 'contract', params: input.contractParams }, settings)
          : false
      case 'trade':
        return input.tradeParams
          ? needsBoardApproval({ category: 'trade', params: input.tradeParams }, settings)
          : false
      case 'staff-hire':
        return input.staffParams
          ? needsBoardApproval({ category: 'staff-hire', params: input.staffParams }, settings)
          : false
    }
  })()

  if (!requiresApproval) {
    return { category, probability: 100, factors: [], requiresApproval: false }
  }

  const factors: ApprovalFactor[] = []
  let probability = 65

  factors.push({ label: 'Base probability', modifier: 65 })

  // --- Universal factors (mirror facilityUpgradeEngine pattern) ---

  // Financial health: balance vs spend amount
  const spendAmount = getSpendAmount(input)
  if (spendAmount > 0) {
    const ratio = club.finances.balance / Math.max(1, spendAmount)
    if (ratio >= 3) {
      factors.push({ label: 'Strong financial position', modifier: 10 })
      probability += 10
    } else if (ratio >= 2) {
      factors.push({ label: 'Healthy finances', modifier: 5 })
      probability += 5
    } else if (ratio < 1) {
      factors.push({ label: 'Strained finances', modifier: -15 })
      probability -= 15
    } else {
      factors.push({ label: 'Tight budget', modifier: -5 })
      probability -= 5
    }
  }

  // Salary cap room (for contracts)
  if (category === 'contract' && input.contractParams) {
    const capRoom = club.finances.salaryCap - club.finances.currentSpend
    const aav = input.contractParams.aav
    if (capRoom > aav * 2) {
      factors.push({ label: 'Plenty of salary cap room', modifier: 5 })
      probability += 5
    } else if (capRoom < aav) {
      factors.push({ label: 'Salary cap pressure', modifier: -10 })
      probability -= 10
    }
  }

  // Job security: (jobSecurity - 50) * 0.3 (same formula as facility upgrades)
  const securityMod = Math.round((jobSecurity - 50) * 0.3)
  if (securityMod !== 0) {
    factors.push({
      label: securityMod > 0 ? 'Board confidence in management' : 'Board lacks confidence',
      modifier: securityMod,
    })
    probability += securityMod
  }

  // Ladder position
  if (ladderPosition <= 4) {
    factors.push({ label: 'Strong ladder position', modifier: 5 })
    probability += 5
  } else if (ladderPosition >= 15) {
    factors.push({ label: 'Poor ladder position', modifier: -5 })
    probability -= 5
  }

  // Competitive window alignment
  const competitiveWindow = club.aiPersonality?.competitiveWindow ?? 'balanced'

  // --- Category-specific factors ---

  switch (category) {
    case 'contract': {
      const aav = input.contractParams!.aav
      const capPct = aav / Math.max(1, club.finances.salaryCap)

      // Marquee salary penalty (>8% of cap)
      if (capPct > 0.08) {
        factors.push({ label: 'Marquee salary demands', modifier: -10 })
        probability -= 10
      }

      // Re-signing bonus check (would need to know if re-signing, passed via entity context)
      // We approximate: if the player is already at our club, small bonus
      // This is handled at the store level by passing context

      // Long-term risk (high AAV)
      if (aav >= 800_000) {
        factors.push({ label: 'High long-term salary commitment', modifier: -5 })
        probability -= 5
      }

      // Window alignment for big contracts
      if (competitiveWindow === 'win-now' && capPct >= 0.04) {
        factors.push({ label: 'Aligns with win-now ambitions', modifier: 5 })
        probability += 5
      } else if (competitiveWindow === 'rebuilding' && capPct >= 0.06) {
        factors.push({ label: 'Misaligned with rebuild strategy', modifier: -5 })
        probability -= 5
      }
      break
    }

    case 'trade': {
      const retention = input.tradeParams!.userSalaryRetention

      // Retention ratio penalty: higher retention = more board reluctance
      if (retention >= 400_000) {
        factors.push({ label: 'Large salary retention burden', modifier: -10 })
        probability -= 10
      } else if (retention >= 200_000) {
        factors.push({ label: 'Moderate salary retention', modifier: -5 })
        probability -= 5
      }

      // Rebuild salary-dump bonus
      if (competitiveWindow === 'rebuilding' && retention > 0) {
        factors.push({ label: 'Salary dump aligns with rebuild', modifier: 5 })
        probability += 5
      }
      break
    }

    case 'staff-hire': {
      const salary = input.staffParams!.salary

      // Premium salary penalty
      if (salary >= 500_000) {
        factors.push({ label: 'Premium coaching salary', modifier: -10 })
        probability -= 10
      } else if (salary >= 400_000) {
        factors.push({ label: 'Above-average salary', modifier: -5 })
        probability -= 5
      }

      // Head coach / senior role bonus (high-value hires get board support)
      if (salary >= 300_000) {
        factors.push({ label: 'Key leadership appointment', modifier: 5 })
        probability += 5
      }

      // Development coach alignment with rebuild
      if (competitiveWindow === 'rebuilding') {
        factors.push({ label: 'Investment in coaching aligns with rebuild', modifier: 3 })
        probability += 3
      } else if (competitiveWindow === 'win-now') {
        factors.push({ label: 'Coaching investment supports contention', modifier: 3 })
        probability += 3
      }
      break
    }
  }

  probability = clamp(probability, 5, 95)

  return { category, probability, factors, requiresApproval: true }
}

// ---------------------------------------------------------------------------
// rollBoardApproval
// ---------------------------------------------------------------------------

export function rollBoardApproval(
  tracker: BoardApprovalTracker,
  result: BoardApprovalResult,
  rng: SeededRNG,
  date: string,
  description: string,
  clubId: string,
  entityId?: string,
): { updatedTracker: BoardApprovalTracker; record: BoardApprovalRecord; approved: boolean } {
  const roll = rng.nextFloat(0, 100)
  const approved = roll < result.probability

  const record: BoardApprovalRecord = {
    id: crypto.randomUUID(),
    category: result.category,
    date,
    description,
    probability: result.probability,
    approved,
    factors: result.factors,
    relatedEntityId: entityId,
    clubId,
  }

  const updatedTracker: BoardApprovalTracker = {
    records: [...tracker.records, record],
    denialCooldowns: { ...tracker.denialCooldowns },
  }

  if (!approved) {
    const cooldownKey = entityId
      ? `${result.category}:${entityId}`
      : `${result.category}:${record.id}`
    updatedTracker.denialCooldowns[cooldownKey] = addDaysISO(date, DENIAL_COOLDOWN_DAYS)
  }

  return { updatedTracker, record, approved }
}

// ---------------------------------------------------------------------------
// isApprovalOnCooldown
// ---------------------------------------------------------------------------

export function isApprovalOnCooldown(
  tracker: BoardApprovalTracker,
  category: BoardApprovalCategory,
  entityId: string | undefined,
  currentDate: string,
): boolean {
  if (!entityId) return false
  const key = `${category}:${entityId}`
  const expiry = tracker.denialCooldowns[key]
  if (!expiry) return false
  return currentDate < expiry
}

// ---------------------------------------------------------------------------
// Helper: get the relevant spend amount for financial health checks
// ---------------------------------------------------------------------------

function getSpendAmount(input: ComputeBoardApprovalInput): number {
  switch (input.category) {
    case 'contract':
      return input.contractParams?.aav ?? 0
    case 'trade':
      return input.tradeParams?.userSalaryRetention ?? 0
    case 'staff-hire':
      return input.staffParams?.salary ?? 0
  }
}
