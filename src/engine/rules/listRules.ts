import type { GameSettings } from '@/types/game'
import type { Player } from '@/types/player'
import { SENIOR_LIST_SIZE, ROOKIE_LIST_SIZE } from '@/engine/core/constants'
import { getListCounts } from '@/engine/contracts/freeAgency'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListConstraints {
  minSenior: number
  maxSenior: number
  minRookie: number
  maxRookie: number
  maxTotal: number
  minDraftSelections: number
}

export type ViolationSeverity = 'error' | 'warning'

export interface RuleViolation {
  code: string
  severity: ViolationSeverity
  message: string
  meta?: Record<string, number>
}

export interface ClubListValidation {
  valid: boolean
  errors: RuleViolation[]
  warnings: RuleViolation[]
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Resolve effective list constraints from user settings, falling back to
 * the hard-coded constants when settings values are missing.
 */
export function resolveListConstraints(settings: GameSettings): ListConstraints {
  const maxSenior = settings.listRules?.seniorListSize ?? SENIOR_LIST_SIZE
  const maxRookie = settings.listRules?.rookieListSize ?? ROOKIE_LIST_SIZE

  return {
    minSenior: 0,
    maxSenior,
    minRookie: 0,
    maxRookie,
    maxTotal: maxSenior + maxRookie,
    minDraftSelections: 1,
  }
}

/**
 * Validate a club's roster against the given list constraints.
 * Returns structured errors and warnings.
 */
export function validateClubList(
  players: Record<string, Player>,
  clubId: string,
  constraints: ListConstraints,
): ClubListValidation {
  const { senior, rookie, total } = getListCounts(players, clubId)
  const errors: RuleViolation[] = []
  const warnings: RuleViolation[] = []

  // --- Errors ---
  if (senior > constraints.maxSenior) {
    errors.push({
      code: 'SENIOR_OVER_MAX',
      severity: 'error',
      message: `Senior list has ${senior} players, exceeding the maximum of ${constraints.maxSenior}.`,
      meta: { current: senior, max: constraints.maxSenior, excess: senior - constraints.maxSenior },
    })
  }

  if (rookie > constraints.maxRookie) {
    errors.push({
      code: 'ROOKIE_OVER_MAX',
      severity: 'error',
      message: `Rookie list has ${rookie} players, exceeding the maximum of ${constraints.maxRookie}.`,
      meta: { current: rookie, max: constraints.maxRookie, excess: rookie - constraints.maxRookie },
    })
  }

  if (total > constraints.maxTotal) {
    errors.push({
      code: 'ROSTER_OVER_TOTAL',
      severity: 'error',
      message: `Total roster has ${total} players, exceeding the maximum of ${constraints.maxTotal}.`,
      meta: { current: total, max: constraints.maxTotal, excess: total - constraints.maxTotal },
    })
  }

  // --- Warnings ---
  if (senior >= constraints.maxSenior - 2 && senior <= constraints.maxSenior) {
    warnings.push({
      code: 'SENIOR_NEAR_MAX',
      severity: 'warning',
      message: `Senior list has ${senior} of ${constraints.maxSenior} spots filled.`,
      meta: { current: senior, max: constraints.maxSenior, remaining: constraints.maxSenior - senior },
    })
  }

  if (rookie >= constraints.maxRookie - 1 && rookie <= constraints.maxRookie) {
    warnings.push({
      code: 'ROOKIE_NEAR_MAX',
      severity: 'warning',
      message: `Rookie list has ${rookie} of ${constraints.maxRookie} spots filled.`,
      meta: { current: rookie, max: constraints.maxRookie, remaining: constraints.maxRookie - rookie },
    })
  }

  if (total < 30) {
    warnings.push({
      code: 'ROSTER_LOW',
      severity: 'warning',
      message: `Roster has only ${total} players — dangerously thin squad.`,
      meta: { current: total, threshold: 30 },
    })
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/** Returns true if the club can add another player to the senior list. */
export function canAddToSeniorList(
  players: Record<string, Player>,
  clubId: string,
  constraints: ListConstraints,
): boolean {
  const { senior, total } = getListCounts(players, clubId)
  return senior < constraints.maxSenior && total < constraints.maxTotal
}

/** Returns true if the club can add another player to the rookie list. */
export function canAddToRookieList(
  players: Record<string, Player>,
  clubId: string,
  constraints: ListConstraints,
): boolean {
  const { rookie, total } = getListCounts(players, clubId)
  return rookie < constraints.maxRookie && total < constraints.maxTotal
}

/** Convenience wrapper — delegates to senior or rookie check based on `isRookie`. */
export function canAddToList(
  players: Record<string, Player>,
  clubId: string,
  isRookie: boolean,
  constraints: ListConstraints,
): boolean {
  return isRookie
    ? canAddToRookieList(players, clubId, constraints)
    : canAddToSeniorList(players, clubId, constraints)
}

/** Returns the number of players that must be delisted to meet the total roster limit. */
export function mustDelist(
  players: Record<string, Player>,
  clubId: string,
  constraints: ListConstraints,
): number {
  const { total } = getListCounts(players, clubId)
  return Math.max(0, total - constraints.maxTotal)
}

/** Returns a human-readable warning if the club must delist players, else null. */
export function getDelistingWarning(
  players: Record<string, Player>,
  clubId: string,
  constraints: ListConstraints,
): string | null {
  const excess = mustDelist(players, clubId, constraints)
  if (excess <= 0) return null
  return `You must delist ${excess} player${excess === 1 ? '' : 's'} to meet the ${constraints.maxTotal}-player roster limit.`
}
