import type { Player } from '@/types/player'
import type { GameSettings } from '@/types/game'
import type { OffseasonPhase, OffseasonState } from '@/engine/season/offseasonFlow'
import type { NegotiationTracker } from '@/types/contract'
import type { DraftState } from '@/types/draft'
import type { TradeInboxItem } from '@/types/trade'
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
  | 'contract-response-required'
  | 'venue-decision-required'
  | 'trade-offer-response'

export interface ActionItem {
  type: ActionItemType
  title: string
  description: string
  severity: 'critical' | 'warning' | 'info'
  linkTo: string
  playerId?: string
}

export interface OffseasonChecklistTask {
  id: string
  title: string
  description: string
  required: boolean
  completed: boolean
  linkTo: string
  impact?: string
}

export interface OffseasonChecklistContext {
  players: Record<string, Player>
  playerClubId: string
  offseasonState: OffseasonState
  negotiations: NegotiationTracker | null
  settings: GameSettings
  draft: DraftState | null
  tradeInbox: TradeInboxItem[]
}

export interface OffseasonProgressionValidation {
  allowed: boolean
  error: string | null
  blockingTasks: OffseasonChecklistTask[]
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

/** Day offset at which each phase starts (derived from MILESTONE_DEFS). */
const PHASE_START_OFFSETS: [OffseasonPhase, number][] = [
  ['season-end', 0],
  ['retirements', 7],
  ['delistings', 10],
  ['trade-period', 14],
  ['free-agency', 35],
  ['national-draft', 49],
  ['rookie-draft', 52],
  ['supplemental-signing', 54],
  ['preseason', 56],
  ['venue-allocation', 70],
  ['practice-matches', 77],
  ['ready', 84],
]

/**
 * Given an offseason start date and a current date, determine which phase
 * the offseason should be in and which phases are already completed.
 */
export function computePhaseForDate(
  offseasonStartDate: string,
  currentDate: string,
): { phase: OffseasonPhase; completedPhases: OffseasonPhase[] } {
  const dayOffset = diffDays(offseasonStartDate, currentDate)

  let currentPhase: OffseasonPhase = 'season-end'
  const completedPhases: OffseasonPhase[] = []

  for (const [phase, startOffset] of PHASE_START_OFFSETS) {
    if (dayOffset >= startOffset) {
      currentPhase = phase
    }
  }

  // All phases before the current one are completed
  for (const [phase] of PHASE_START_OFFSETS) {
    if (phase === currentPhase) break
    completedPhases.push(phase)
  }

  return { phase: currentPhase, completedPhases }
}

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
  draft?: DraftState | null,
  tradeInbox?: TradeInboxItem[],
): ActionItem[] {
  const tasks = buildOffseasonChecklist({
    players,
    playerClubId,
    offseasonState,
    negotiations,
    settings,
    draft: draft ?? null,
    tradeInbox: tradeInbox ?? [],
  })
  const items: ActionItem[] = []

  for (const task of tasks) {
    if (task.completed) continue
    items.push({
      type:
        task.id === 'contract-response' ? 'contract-response-required'
        : task.id === 'venue-decisions' ? 'venue-decision-required'
        : task.id === 'trade-offers' ? 'trade-offer-response'
        : task.id === 'draft-picks' ? 'draft-pick-required'
        : task.id === 'list-compliance' ? 'mandatory-delist'
        : task.id === 'salary-cap' ? 'cap-violation'
        : 'pending-negotiation',
      title: task.title,
      description: task.description,
      severity: task.required ? 'critical' : 'warning',
      linkTo: task.linkTo,
    })
  }

  // Keep additional contextual negotiation warnings as optional insights.
  if (negotiations) {
    for (const neg of Object.values(negotiations.active)) {
      if (neg.clubId !== playerClubId) continue
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

  return items
}

function getOutstandingUserDraftPicks(draft: DraftState | null, playerClubId: string, phase: OffseasonPhase): number {
  if (!draft) return 1
  if (phase === 'national-draft') {
    return draft.nationalDraftPicks.filter(
      (pick) => pick.clubId === playerClubId && !pick.selectedProspectId,
    ).length
  }
  if (phase === 'rookie-draft') {
    return draft.rookieDraftPicks.filter(
      (pick) => pick.clubId === playerClubId && !pick.selectedProspectId,
    ).length
  }
  return 0
}

export function buildOffseasonChecklist(ctx: OffseasonChecklistContext): OffseasonChecklistTask[] {
  const {
    players,
    playerClubId,
    offseasonState,
    negotiations,
    settings,
    draft,
    tradeInbox,
  } = ctx

  const tasks: OffseasonChecklistTask[] = []
  const constraints = resolveListConstraints(settings)
  const validation = validateClubList(players, playerClubId, constraints)
  const excess = mustDelist(players, playerClubId, constraints)

  tasks.push({
    id: 'list-compliance',
    title: 'List compliance and delistings',
    description:
      excess > 0
        ? `Delist ${excess} player${excess === 1 ? '' : 's'} to reach the ${constraints.maxTotal}-player limit.`
        : 'Your list is compliant with senior and rookie limits.',
    required: true,
    completed: validation.valid && excess <= 0,
    linkTo: '/offseason',
    impact: 'List violations can invalidate roster processing and block offseason progression.',
  })

  const contractResponses = negotiations
    ? Object.values(negotiations.active).filter(
      (neg) => neg.clubId === playerClubId && neg.status === 'counter-offered',
    ).length
    : 0
  tasks.push({
    id: 'contract-response',
    title: 'Contract counter-offer responses',
    description:
      contractResponses > 0
        ? `${contractResponses} contract counter-offer${contractResponses === 1 ? '' : 's'} waiting for response.`
        : 'No contract counter-offers awaiting your response.',
    required: true,
    completed: contractResponses === 0,
    linkTo: '/contracts',
    impact: 'Unresolved contract responses can stall retention and free-agency flows.',
  })

  if (offseasonState.currentPhase === 'national-draft') {
    const outstandingPicks = getOutstandingUserDraftPicks(draft, playerClubId, offseasonState.currentPhase)
    tasks.push({
      id: 'draft-picks',
      title: 'Draft selections',
      description:
        outstandingPicks > 0
          ? `${outstandingPicks} draft pick${outstandingPicks === 1 ? '' : 's'} still need selections.`
          : 'All user-owned picks for this draft phase are completed.',
      required: true,
      completed: outstandingPicks === 0,
      linkTo: '/draft',
      impact: 'Skipping draft picks can break list balancing and downstream offseason systems.',
    })
  }

  if (offseasonState.currentPhase === 'venue-allocation') {
    const pendingOffers = offseasonState.venueOffers?.length ?? 0
    tasks.push({
      id: 'venue-decisions',
      title: 'Venue allocation decisions',
      description:
        pendingOffers > 0
          ? `${pendingOffers} venue offer${pendingOffers === 1 ? '' : 's'} require accept/reject decisions.`
          : 'All venue allocation offers have been resolved.',
      required: true,
      completed: pendingOffers === 0,
      linkTo: '/offseason',
      impact: 'Unresolved venue allocations can desync fixture venue assignment.',
    })
  }

  if (settings.salaryCap) {
    const totalSpend = calculateClubSalaryTotal(Object.values(players), playerClubId)
    const overage = totalSpend - settings.salaryCapAmount
    tasks.push({
      id: 'salary-cap',
      title: 'Salary cap compliance',
      description:
        overage > 0
          ? `Reduce spend by $${overage.toLocaleString()} to get under the $${settings.salaryCapAmount.toLocaleString()} cap.`
          : `Cap compliant at $${totalSpend.toLocaleString()} of $${settings.salaryCapAmount.toLocaleString()}.`,
      required: true,
      completed: overage <= 0,
      linkTo: '/salary-cap',
      impact: 'Cap breaches can invalidate signing and list workflows.',
    })
  }

  const pendingTradeOffers = tradeInbox.filter((item) => item.offer.status === 'pending-user').length
  tasks.push({
    id: 'trade-offers',
    title: 'Trade inbox responses',
    description:
      pendingTradeOffers > 0
        ? `${pendingTradeOffers} trade offer${pendingTradeOffers === 1 ? '' : 's'} are pending your decision.`
        : 'No trade offers pending.',
    required: false,
    completed: pendingTradeOffers === 0,
    linkTo: '/trade',
  })

  const pendingNegotiationSteps = negotiations
    ? Object.values(negotiations.active).filter(
      (neg) => neg.clubId === playerClubId && neg.cooldownRemaining === 0 && neg.status === 'pending',
    ).length
    : 0
  tasks.push({
    id: 'negotiation-follow-up',
    title: 'Negotiation follow-up offers',
    description:
      pendingNegotiationSteps > 0
        ? `${pendingNegotiationSteps} negotiation${pendingNegotiationSteps === 1 ? '' : 's'} ready for your next offer.`
        : 'No immediate follow-up offers required.',
    required: false,
    completed: pendingNegotiationSteps === 0,
    linkTo: '/contracts',
  })

  return tasks
}

export function validateOffseasonProgression(ctx: OffseasonChecklistContext): OffseasonProgressionValidation {
  const checklist = buildOffseasonChecklist(ctx)
  const blockingTasks = checklist.filter((task) => task.required && !task.completed)
  if (blockingTasks.length === 0) {
    return { allowed: true, error: null, blockingTasks: [] }
  }

  const primary = blockingTasks[0]
  const error =
    `Offseason progression blocked: ${primary.title}. ` +
    `${primary.description} ` +
    `${primary.impact ?? 'Complete all required offseason tasks before simulating or advancing.'}`

  return {
    allowed: false,
    error,
    blockingTasks,
  }
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
