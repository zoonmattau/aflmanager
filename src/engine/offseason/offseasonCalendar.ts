import type { Player } from '@/types/player'
import type { GameSettings } from '@/types/game'
import type { OffseasonPhase, OffseasonState } from '@/engine/season/offseasonFlow'
import type { NegotiationTracker } from '@/types/contract'
import { addDays, diffDays, formatDateLong } from '@/engine/calendar/calendarEngine'
import { resolveListConstraints, validateClubList, mustDelist } from '@/engine/rules/listRules'
import { calculateClubSalaryTotal } from '@/engine/contracts/negotiation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OffseasonMilestone {
  id: string
  label: string
  date: string
  phase: OffseasonPhase
  dayOffset: number
}

export interface OffseasonCalendarState {
  currentDate: string
  halfDay: 'AM' | 'PM'
  milestones: OffseasonMilestone[]
  startDate: string
}

export type ActionItemType =
  | 'pending-negotiation'
  | 'expiring-offer'
  | 'list-violation'
  | 'mandatory-delist'
  | 'draft-pick-required'
  | 'cap-violation'

export interface ActionItem {
  type: ActionItemType
  title: string
  description: string
  severity: 'critical' | 'warning' | 'info'
  linkTo: string
  playerId?: string
}

// ---------------------------------------------------------------------------
// Milestone definitions
// ---------------------------------------------------------------------------

const MILESTONE_DEFS: { offset: number; label: string; phase: OffseasonPhase }[] = [
  { offset: 0, label: 'Awards Night', phase: 'season-end' },
  { offset: 7, label: 'Retirements Announced', phase: 'retirements' },
  { offset: 10, label: 'Delistings Deadline', phase: 'delistings' },
  { offset: 14, label: 'Trade Period Opens', phase: 'trade-period' },
  { offset: 28, label: 'Trade Period Closes', phase: 'trade-period' },
  { offset: 35, label: 'Free Agency Opens', phase: 'free-agency' },
  { offset: 42, label: 'Free Agency Closes', phase: 'free-agency' },
  { offset: 49, label: 'National Draft', phase: 'national-draft' },
  { offset: 52, label: 'Rookie Draft', phase: 'rookie-draft' },
  { offset: 56, label: 'Pre-Season Begins', phase: 'preseason' },
  { offset: 70, label: 'Venue Allocation', phase: 'venue-allocation' },
  { offset: 77, label: 'Practice Matches', phase: 'practice-matches' },
  { offset: 84, label: 'Season Ready', phase: 'ready' },
]

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export function buildOffseasonMilestones(offseasonStartDate: string): OffseasonMilestone[] {
  return MILESTONE_DEFS.map((def, i) => ({
    id: `milestone-${i}`,
    label: def.label,
    date: addDays(offseasonStartDate, def.offset),
    phase: def.phase,
    dayOffset: def.offset,
  }))
}

export function initOffseasonCalendar(offseasonStartDate: string): OffseasonCalendarState {
  return {
    currentDate: offseasonStartDate,
    halfDay: 'AM',
    milestones: buildOffseasonMilestones(offseasonStartDate),
    startDate: offseasonStartDate,
  }
}

export function getNextMilestone(state: OffseasonCalendarState): OffseasonMilestone | null {
  for (const m of state.milestones) {
    if (m.date > state.currentDate) return m
    if (m.date === state.currentDate && state.halfDay === 'AM') return m
  }
  return null
}

export function getCountdown(
  state: OffseasonCalendarState,
): { days: number; halfDays: number; label: string } | null {
  const next = getNextMilestone(state)
  if (!next) return null

  const dayDiff = diffDays(state.currentDate, next.date)
  const halfDayAdjust = state.halfDay === 'PM' ? 1 : 0
  const totalHalfDays = dayDiff * 2 - halfDayAdjust

  if (totalHalfDays <= 0) return { days: 0, halfDays: 0, label: 'Now' }
  if (totalHalfDays === 1) return { days: 0, halfDays: 1, label: 'This afternoon' }

  const days = totalHalfDays / 2
  if (days === Math.floor(days)) {
    return { days, halfDays: totalHalfDays, label: `${days} day${days === 1 ? '' : 's'}` }
  }
  return { days, halfDays: totalHalfDays, label: `${days} days` }
}

export function detectActionItems(
  players: Record<string, Player>,
  playerClubId: string,
  offseasonState: OffseasonState,
  negotiations: NegotiationTracker | null,
  settings: GameSettings,
): ActionItem[] {
  const items: ActionItem[] = []

  // Pending negotiations: active with cooldownRemaining === 0
  if (negotiations) {
    for (const neg of Object.values(negotiations.active)) {
      if (neg.clubId !== playerClubId) continue
      if (neg.cooldownRemaining === 0) {
        const player = players[neg.playerId]
        const name = player ? `${player.firstName} ${player.lastName}` : 'Unknown'
        items.push({
          type: 'pending-negotiation',
          title: `Respond to ${name}`,
          description: 'Negotiation ready for your next offer',
          severity: 'warning',
          linkTo: '/contracts',
          playerId: neg.playerId,
        })
      }

      // Expiring offers: in round 3+
      if (neg.rounds.length >= 3) {
        const player = players[neg.playerId]
        const name = player ? `${player.firstName} ${player.lastName}` : 'Unknown'
        items.push({
          type: 'expiring-offer',
          title: `${name} may walk`,
          description: `Negotiation in round ${neg.rounds.length} of ${neg.maxRounds}`,
          severity: 'warning',
          linkTo: '/contracts',
          playerId: neg.playerId,
        })
      }
    }
  }

  // List violations
  const constraints = resolveListConstraints(settings)
  const validation = validateClubList(players, playerClubId, constraints)
  if (!validation.valid) {
    for (const err of validation.errors) {
      items.push({
        type: 'list-violation',
        title: 'List Violation',
        description: err.message,
        severity: 'critical',
        linkTo: '/offseason',
      })
    }
  }

  // Mandatory delistings
  const excess = mustDelist(players, playerClubId, constraints)
  if (excess > 0) {
    items.push({
      type: 'mandatory-delist',
      title: `Must delist ${excess} player${excess === 1 ? '' : 's'}`,
      description: `Roster exceeds ${constraints.maxTotal}-player limit`,
      severity: 'critical',
      linkTo: '/offseason',
    })
  }

  // Draft picks required
  if (
    offseasonState.currentPhase === 'national-draft' ||
    offseasonState.currentPhase === 'rookie-draft'
  ) {
    items.push({
      type: 'draft-pick-required',
      title: 'Draft picks available',
      description: 'Use your draft picks to add to your list',
      severity: 'info',
      linkTo: '/offseason',
    })
  }

  // Cap violations
  if (settings.salaryCap) {
    const allPlayers = Object.values(players)
    const totalSpend = calculateClubSalaryTotal(allPlayers, playerClubId)
    if (totalSpend > settings.salaryCapAmount) {
      const overage = totalSpend - settings.salaryCapAmount
      items.push({
        type: 'cap-violation',
        title: 'Over salary cap',
        description: `$${overage.toLocaleString()} over the $${settings.salaryCapAmount.toLocaleString()} cap`,
        severity: 'critical',
        linkTo: '/salary-cap',
      })
    }
  }

  return items
}

export function advanceHalfDay(state: OffseasonCalendarState): OffseasonCalendarState {
  if (state.halfDay === 'AM') {
    return { ...state, halfDay: 'PM' }
  }
  return {
    ...state,
    currentDate: addDays(state.currentDate, 1),
    halfDay: 'AM',
  }
}

export function advanceToNextMilestone(state: OffseasonCalendarState): OffseasonCalendarState {
  const next = getNextMilestone(state)
  if (!next) return state
  return {
    ...state,
    currentDate: next.date,
    halfDay: 'AM',
  }
}

export function formatOffseasonDateTime(state: OffseasonCalendarState): string {
  const dateStr = formatDateLong(state.currentDate)
  const timeOfDay = state.halfDay === 'AM' ? 'Morning' : 'Afternoon'
  return `${dateStr} — ${timeOfDay}`
}
