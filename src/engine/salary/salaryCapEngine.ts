import type { Player } from '@/types/player'
import {
  calculateClubSalaryTotal,
  calculateLuxuryTax,
} from '@/engine/contracts/negotiation'
import {
  MINIMUM_SALARY,
  CAP_WARNING_THRESHOLD,
} from '@/engine/core/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapValidationResult {
  allowed: boolean
  reason?: string
  currentSpend: number
  projectedSpend: number
  capRoom: number
  luxuryTaxOwed?: number
  warnings: string[]
}

export interface ListValidationResult {
  allowed: boolean
  reason?: string
  seniorCount: number
  rookieCount: number
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Recalculate a club's current salary spend from the player list.
 * Returns the total so the caller can write it to `ClubFinances.currentSpend`.
 */
export function syncClubCurrentSpend(
  players: Player[],
  clubId: string,
): number {
  return calculateClubSalaryTotal(players, clubId)
}

/**
 * Core validation shared by all specific validators.
 * Checks projected spend vs cap (hard or soft at 110%).
 */
export function validateCapImpact(
  currentSpend: number,
  netSalaryChange: number,
  salaryCap: number,
  softCapEnabled: boolean,
): CapValidationResult {
  const projectedSpend = currentSpend + netSalaryChange
  const effectiveCap = softCapEnabled ? salaryCap * 1.10 : salaryCap
  const capRoom = effectiveCap - projectedSpend
  const warnings = getCapWarnings(projectedSpend, salaryCap, softCapEnabled)

  let luxuryTaxOwed: number | undefined
  if (softCapEnabled && projectedSpend > salaryCap) {
    luxuryTaxOwed = Math.round((projectedSpend - salaryCap) * 1.5)
  }

  if (projectedSpend > effectiveCap) {
    return {
      allowed: false,
      reason: softCapEnabled
        ? `Exceeds soft cap ceiling (110% of $${formatCurrency(salaryCap)}). Projected spend: $${formatCurrency(projectedSpend)}`
        : `Exceeds salary cap of $${formatCurrency(salaryCap)}. Projected spend: $${formatCurrency(projectedSpend)}`,
      currentSpend,
      projectedSpend,
      capRoom,
      luxuryTaxOwed,
      warnings,
    }
  }

  return {
    allowed: true,
    currentSpend,
    projectedSpend,
    capRoom,
    luxuryTaxOwed,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Specific validators
// ---------------------------------------------------------------------------

/**
 * Validate a trade's cap impact for a single club.
 * Net change = sum(incoming salaries) - sum(outgoing salaries).
 */
export function validateTradeCapImpact(
  players: Player[],
  clubId: string,
  incomingSalaries: number[],
  outgoingSalaries: number[],
  salaryCap: number,
  softCapEnabled: boolean,
): CapValidationResult {
  const currentSpend = calculateClubSalaryTotal(players, clubId)
  const netChange =
    incomingSalaries.reduce((s, v) => s + v, 0) -
    outgoingSalaries.reduce((s, v) => s + v, 0)
  return validateCapImpact(currentSpend, netChange, salaryCap, softCapEnabled)
}

/**
 * Validate a contract offer's cap impact.
 * Net change = proposedAAV - currentPlayerSalary (0 for new signings).
 */
export function validateContractOffer(
  players: Player[],
  clubId: string,
  proposedCapHit: number,
  currentPlayerSalary: number,
  salaryCap: number,
  softCapEnabled: boolean,
): CapValidationResult {
  const currentSpend = calculateClubSalaryTotal(players, clubId)
  const netChange = proposedCapHit - currentPlayerSalary
  return validateCapImpact(currentSpend, netChange, salaryCap, softCapEnabled)
}

/**
 * Validate a draft selection's cap impact.
 * New draftees sign at MINIMUM_SALARY.
 */
export function validateDraftSelection(
  players: Player[],
  clubId: string,
  salaryCap: number,
  softCapEnabled: boolean,
): CapValidationResult {
  const currentSpend = calculateClubSalaryTotal(players, clubId)
  return validateCapImpact(currentSpend, MINIMUM_SALARY, salaryCap, softCapEnabled)
}

/**
 * Validate list size constraints for a roster action.
 */
export function validateListSize(
  players: Player[],
  clubId: string,
  seniorListSize: number,
  rookieListSize: number,
  action: { type: 'add-senior' | 'add-rookie' | 'upgrade-rookie' | 'remove' },
): ListValidationResult {
  let seniorCount = 0
  let rookieCount = 0

  for (const p of players) {
    if (p.clubId !== clubId) continue
    if (p.isRookie) {
      rookieCount++
    } else {
      seniorCount++
    }
  }

  switch (action.type) {
    case 'add-senior':
      if (seniorCount >= seniorListSize) {
        return {
          allowed: false,
          reason: `Senior list is full (${seniorCount}/${seniorListSize})`,
          seniorCount,
          rookieCount,
        }
      }
      break
    case 'add-rookie':
      if (rookieCount >= rookieListSize) {
        return {
          allowed: false,
          reason: `Rookie list is full (${rookieCount}/${rookieListSize})`,
          seniorCount,
          rookieCount,
        }
      }
      break
    case 'upgrade-rookie':
      if (seniorCount >= seniorListSize) {
        return {
          allowed: false,
          reason: `Cannot upgrade rookie — senior list is full (${seniorCount}/${seniorListSize})`,
          seniorCount,
          rookieCount,
        }
      }
      break
    case 'remove':
      // Removals are always allowed
      break
  }

  return { allowed: true, seniorCount, rookieCount }
}

// ---------------------------------------------------------------------------
// Warnings & financials
// ---------------------------------------------------------------------------

/**
 * Generate cap-related warnings for a club's current spend.
 */
export function getCapWarnings(
  currentSpend: number,
  salaryCap: number,
  softCapEnabled: boolean,
): string[] {
  const warnings: string[] = []
  const ratio = currentSpend / salaryCap

  if (softCapEnabled && currentSpend > salaryCap) {
    const taxOwed = Math.round((currentSpend - salaryCap) * 1.5)
    warnings.push(`Over hard cap — luxury tax of $${formatCurrency(taxOwed)} applies`)
  } else if (ratio >= 1.0) {
    warnings.push('At or over the salary cap')
  } else if (ratio >= CAP_WARNING_THRESHOLD) {
    warnings.push(`Within ${Math.round((1 - ratio) * 100)}% of salary cap`)
  }

  return warnings
}

/**
 * Calculate season-end financials for a club.
 */
export function calculateSeasonEndFinancials(
  players: Player[],
  clubId: string,
  salaryCap: number,
  softCapEnabled: boolean,
): { totalSpend: number; luxuryTax: number; isOverCap: boolean } {
  const totalSpend = calculateClubSalaryTotal(players, clubId)
  const isOverCap = totalSpend > salaryCap
  const luxuryTax = softCapEnabled ? calculateLuxuryTax(players, clubId, salaryCap) : 0

  return { totalSpend, luxuryTax, isOverCap }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return value.toLocaleString('en-AU')
}
