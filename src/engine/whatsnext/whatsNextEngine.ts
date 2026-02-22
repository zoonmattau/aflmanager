/**
 * What's Next engine.
 *
 * Derives the single highest-priority pending action from game state.
 * Priority order: critical → warning → info → ok (all-clear).
 * Returns null only during setup or active simulation.
 */

import type { GamePhase, GameSettings, JumperManagementState } from '@/types/game'
import type { GameCalendar } from '@/types/calendar'
import type { Player } from '@/types/player'
import type { TradeInboxItem } from '@/types/trade'
import type { TribunalCase } from '@/types/discipline'
import type { OffseasonState } from '@/engine/season/offseasonFlow'
import { isPlayerSuspended } from '@/engine/players/availability'
import { identifyExpiringContracts } from '@/engine/contracts/freeAgency'
import { calculateClubSalaryTotal } from '@/engine/contracts/negotiation'
import { resolveListConstraints, validateClubList } from '@/engine/rules/listRules'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhatsNextSeverity = 'critical' | 'warning' | 'info' | 'ok'

export interface WhatsNextAction {
  /** Stable ID — changing this dismisses any existing user dismissal. */
  id: string
  severity: WhatsNextSeverity
  /** Short headline shown prominently. E.g. "Round 7 · Lineup not set" */
  label: string
  /** One-line support text. */
  detail: string
  /** Button label. */
  ctaLabel: string
  /** React-Router path the CTA navigates to. */
  linkTo: string
}

export interface WhatsNextInput {
  phase: GamePhase
  playerClubId: string
  currentRound: number
  currentDate: string
  players: Record<string, Player>
  settings: GameSettings
  calendar: GameCalendar
  selectedLineup: Record<string, string> | null
  tradeInbox: TradeInboxItem[]
  tribunalInbox: TribunalCase[]
  offseasonState: OffseasonState | null
  leadershipPending: boolean
  jumperManagement: JumperManagementState
  simulationActive: boolean
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86_400_000,
  )
}

function daysLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} day${days !== 1 ? 's' : ''}`
}

/** Builds the "Round X today / tomorrow / in N days" prefix. */
function roundContext(currentRound: number, currentDate: string, matchDate: string | undefined): string {
  const prefix = `Round ${currentRound + 1}`
  if (!matchDate) return prefix
  const days = daysBetween(currentDate, matchDate)
  if (days <= 0) return `${prefix} today`
  if (days === 1) return `${prefix} tomorrow`
  return `${prefix} in ${days} day${days !== 1 ? 's' : ''}`
}

/** Next unresolved match event on-or-after currentDate. */
function nextMatchDate(calendar: GameCalendar, currentDate: string): string | undefined {
  return [...calendar.events]
    .filter((e) => !e.resolved && e.type === 'match' && e.date >= currentDate)
    .sort((a, b) => a.date.localeCompare(b.date))[0]?.date
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function computeWhatsNext(input: WhatsNextInput): WhatsNextAction | null {
  const {
    phase,
    playerClubId,
    currentRound,
    currentDate,
    players,
    settings,
    calendar,
    selectedLineup,
    tradeInbox,
    tribunalInbox,
    offseasonState,
    leadershipPending,
    jumperManagement,
    simulationActive,
  } = input

  if (phase === 'setup' || simulationActive) return null

  // ─────────────────────────────────────────────────────────────────
  // CRITICAL 1: Jumper numbers not assigned
  // ─────────────────────────────────────────────────────────────────
  if (jumperManagement.pending) {
    return {
      id: 'jumper-management',
      severity: 'critical',
      label: 'Jumper numbers need confirming',
      detail: 'Assign squad numbers to complete pre-season setup.',
      ctaLabel: 'Set Numbers',
      linkTo: '/jumper-management',
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CRITICAL 2: Over salary cap
  // ─────────────────────────────────────────────────────────────────
  if (settings.salaryCap) {
    const spend = calculateClubSalaryTotal(Object.values(players), playerClubId)
    const cap = settings.salaryCapAmount
    if (spend > cap) {
      const overBy = ((spend - cap) / 1_000_000).toFixed(2)
      return {
        id: 'over-cap',
        severity: 'critical',
        label: `Over the salary cap by $${overBy}M`,
        detail: 'Reduce wage commitments — you cannot advance while in breach.',
        ctaLabel: 'Fix Cap',
        linkTo: '/salary-cap',
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CRITICAL 3: Offseason list-size violation
  // ─────────────────────────────────────────────────────────────────
  if (phase === 'post-season' || phase === 'offseason') {
    const constraints = resolveListConstraints(settings)
    const validation = validateClubList(players, playerClubId, constraints)
    if (!validation.valid) {
      return {
        id: 'list-violation',
        severity: 'critical',
        label: 'List size violation',
        detail: validation.errors[0]?.message ?? 'Your list does not meet size requirements.',
        ctaLabel: 'Fix List',
        linkTo: '/offseason',
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CRITICAL 4: Tribunal pending for user's club
  // ─────────────────────────────────────────────────────────────────
  const myPendingTribunal = tribunalInbox.filter(
    (c) => c.clubId === playerClubId && c.finalWeeks === null,
  )
  if (myPendingTribunal.length > 0) {
    const n = myPendingTribunal.length
    return {
      id: `tribunal-${n}`,
      severity: 'critical',
      label: `${n} player${n > 1 ? 's' : ''} facing tribunal`,
      detail: 'Submit your response before the decision deadline.',
      ctaLabel: 'Handle Tribunal',
      linkTo: '/tribunal',
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CRITICAL/WARNING 5: Lineup — regular season & finals
  // ─────────────────────────────────────────────────────────────────
  if (phase === 'regular-season' || phase === 'finals') {
    const matchDate = nextMatchDate(calendar, currentDate)
    const ctx = roundContext(currentRound, currentDate, matchDate)

    if (!selectedLineup || Object.keys(selectedLineup).length === 0) {
      return {
        id: 'no-lineup',
        severity: 'critical',
        label: `${ctx} · Lineup not set`,
        detail: 'Select your starting 22 before the round begins.',
        ctaLabel: 'Set Lineup',
        linkTo: '/lineup',
      }
    }

    const unavailable = Object.values(selectedLineup).filter((id) => {
      const p = players[id]
      return p != null && (p.injury != null || isPlayerSuspended(p))
    })
    if (unavailable.length > 0) {
      const n = unavailable.length
      return {
        id: `injured-in-lineup-${n}`,
        severity: phase === 'finals' ? 'critical' : 'warning',
        label: `${ctx} · ${n} unavailable player${n > 1 ? 's' : ''} in lineup`,
        detail: 'Injured or suspended players are selected — update your lineup.',
        ctaLabel: 'Fix Lineup',
        linkTo: '/lineup',
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // WARNING 6: Pending trade inbox offers
  // ─────────────────────────────────────────────────────────────────
  const pendingOffers = tradeInbox.filter((t) => t.offer.status === 'pending-user')
  if (pendingOffers.length > 0) {
    const unread = pendingOffers.filter((t) => !t.read).length
    const countLabel = unread > 0 ? `${unread} new` : `${pendingOffers.length}`
    const n = pendingOffers.length
    return {
      id: `trade-inbox-${n}-${unread}`,
      severity: 'warning',
      label: `${countLabel} trade offer${n !== 1 ? 's' : ''} awaiting response`,
      detail: 'Review and respond to incoming trade proposals.',
      ctaLabel: 'View Offers',
      linkTo: '/trades',
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // WARNING 7: Trade deadline ≤ 5 days away
  // ─────────────────────────────────────────────────────────────────
  const tradeDeadlineEvent = calendar.events.find(
    (e) => !e.resolved && e.type === 'trade-deadline',
  )
  if (tradeDeadlineEvent) {
    const days = daysBetween(currentDate, tradeDeadlineEvent.date)
    if (days >= 0 && days <= 5) {
      return {
        id: `trade-deadline-${days}`,
        severity: 'warning',
        label: `Trade deadline ${daysLabel(days)}`,
        detail: 'The trade window closes soon — finalise any outstanding deals.',
        ctaLabel: 'Go to Trades',
        linkTo: '/trades',
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // WARNING 8: Contract deadline ≤ 5 days away
  // ─────────────────────────────────────────────────────────────────
  const contractDeadlineEvent = calendar.events.find(
    (e) => !e.resolved && e.type === 'contract-deadline',
  )
  if (contractDeadlineEvent) {
    const days = daysBetween(currentDate, contractDeadlineEvent.date)
    if (days >= 0 && days <= 5) {
      return {
        id: `contract-deadline-${days}`,
        severity: 'warning',
        label: `Contract deadline ${daysLabel(days)}`,
        detail: 'Complete pending negotiations before the window closes.',
        ctaLabel: 'View Contracts',
        linkTo: '/contracts',
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // WARNING 9: Leadership not appointed
  // ─────────────────────────────────────────────────────────────────
  if (leadershipPending) {
    return {
      id: 'leadership-pending',
      severity: 'warning',
      label: 'Club captain not appointed',
      detail: 'Appoint a captain and leadership group before the season starts.',
      ctaLabel: 'Appoint Captain',
      linkTo: '/leadership',
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // INFO 10: Offseason phase guidance
  // ─────────────────────────────────────────────────────────────────
  if ((phase === 'post-season' || phase === 'offseason') && offseasonState) {
    const phaseGuide: Partial<Record<string, Omit<WhatsNextAction, 'id' | 'severity'>>> = {
      'season-end': {
        label: 'Season complete — review your end-of-season summary',
        detail: 'Check awards and stats, then begin list management.',
        ctaLabel: 'View Summary',
        linkTo: '/offseason',
      },
      'retirements': {
        label: 'Retirement decisions pending',
        detail: 'Confirm which players are retiring before delistings begin.',
        ctaLabel: 'Review Retirements',
        linkTo: '/offseason',
      },
      'delistings': {
        label: 'Offseason: decide which players to release',
        detail: 'Cut your list to the legal maximum before trade period opens.',
        ctaLabel: 'Manage List',
        linkTo: '/offseason',
      },
      'trade-period': {
        label: 'Trade window is open',
        detail: 'Target key positions and negotiate deals before the deadline.',
        ctaLabel: 'Go to Trades',
        linkTo: '/trades',
      },
      'free-agency': {
        label: 'Free agency is underway',
        detail: 'Sign free agents to fill gaps in your list before the draft.',
        ctaLabel: 'View Free Agents',
        linkTo: '/contracts',
      },
      'national-draft': {
        label: 'National Draft · Make your selections',
        detail: "Draft your prospects — don't let rivals poach your targets.",
        ctaLabel: 'Go to Draft',
        linkTo: '/draft',
      },
      'rookie-draft': {
        label: 'Rookie Draft available',
        detail: 'Add depth to your list by selecting from the rookie pool.',
        ctaLabel: 'Go to Draft',
        linkTo: '/draft',
      },
      'supplemental-signing': {
        label: 'Supplemental signing period open',
        detail: 'Sign unsigned players to fill remaining list spots.',
        ctaLabel: 'Sign Players',
        linkTo: '/contracts',
      },
      'preseason': {
        label: 'Pre-season underway · Build squad fitness before Round 1',
        detail: 'Set your training schedule and review your starting lineup.',
        ctaLabel: 'View Training',
        linkTo: '/training',
      },
    }
    const guide = phaseGuide[offseasonState.currentPhase]
    if (guide) {
      return {
        id: `offseason-${offseasonState.currentPhase}`,
        severity: 'info',
        ...guide,
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // INFO 11: Expiring contracts (≥ 3 players, during season)
  // ─────────────────────────────────────────────────────────────────
  if (phase === 'regular-season' || phase === 'finals') {
    const expiring = identifyExpiringContracts(players).filter((p) => p.clubId === playerClubId)
    if (expiring.length >= 3) {
      const n = expiring.length
      return {
        id: `expiring-contracts-${n}`,
        severity: 'info',
        label: `${n} contracts expiring at season end`,
        detail: 'Start negotiations now to retain your key players.',
        ctaLabel: 'View Contracts',
        linkTo: '/contracts',
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // OK 12: All clear — show next match countdown during regular season
  // ─────────────────────────────────────────────────────────────────
  if (phase === 'regular-season') {
    const matchDate = nextMatchDate(calendar, currentDate)
    const ctx = roundContext(currentRound, currentDate, matchDate)
    return {
      id: `next-match-${currentRound}`,
      severity: 'ok',
      label: `${ctx} · Lineup set`,
      detail: 'Your squad is ready.',
      ctaLabel: 'View Fixture',
      linkTo: '/fixture',
    }
  }

  if (phase === 'preseason') {
    return {
      id: 'preseason-ready',
      severity: 'info',
      label: 'Pre-season · Get your squad ready for Round 1',
      detail: 'Set your training schedule, finalise your lineup, and review squad fitness.',
      ctaLabel: 'View Training',
      linkTo: '/training',
    }
  }

  if (phase === 'finals') {
    const matchDate = nextMatchDate(calendar, currentDate)
    const finalsCtx = matchDate
      ? `Finals ${daysLabel(daysBetween(currentDate, matchDate))}`
      : 'Finals'
    return {
      id: `finals-ready-${currentRound}`,
      severity: 'ok',
      label: `${finalsCtx} · Lineup set`,
      detail: 'Preparation complete — good luck!',
      ctaLabel: 'View Fixture',
      linkTo: '/fixture',
    }
  }

  return null
}
