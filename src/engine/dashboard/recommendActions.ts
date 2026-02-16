import type { Player } from '@/types/player'
import type { GamePhase, GameSettings, NewsItem } from '@/types/game'
import type { Season } from '@/types/season'
import type { NegotiationTracker } from '@/types/contract'
import type { OffseasonState } from '@/engine/season/offseasonFlow'
import { identifyExpiringContracts } from '@/engine/contracts/freeAgency'
import { calculateClubSalaryTotal } from '@/engine/contracts/negotiation'
import { resolveListConstraints, validateClubList } from '@/engine/rules/listRules'
import { CAP_WARNING_THRESHOLD } from '@/engine/core/constants'
import { isPlayerSuspended } from '@/engine/players/availability'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecommendationType =
  | 'no-lineup'
  | 'injured-in-lineup'
  | 'expiring-contracts'
  | 'cap-space-low'
  | 'unread-news'
  | 'upcoming-bye'
  | 'check-key-players'
  | 'set-training'
  | 'review-squad'
  | 'offseason-review-list'
  | 'offseason-trade-targets'
  | 'offseason-check-fa'
  | 'offseason-review-draft'
  | 'offseason-list-violation'
  | 'offseason-cap-violation'

export type RecommendationSeverity = 'critical' | 'warning' | 'info'

export interface Recommendation {
  id: string
  type: RecommendationType
  title: string
  description: string
  severity: RecommendationSeverity
  linkTo: string
}

export interface RecommendationInput {
  phase: GamePhase
  playerClubId: string
  players: Record<string, Player>
  settings: GameSettings
  currentRound: number
  season: Season
  selectedLineup: Record<string, string> | null
  newsLog: NewsItem[]
  negotiations: NegotiationTracker | null
  offseasonState: OffseasonState | null
}

// ---------------------------------------------------------------------------
// Severity ordering for sort
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<RecommendationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

const MAX_RECOMMENDATIONS = 5

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function computeRecommendations(input: RecommendationInput): Recommendation[] {
  const recs: Recommendation[] = []

  switch (input.phase) {
    case 'regular-season':
      collectRegularSeason(input, recs)
      break
    case 'finals':
      collectFinals(input, recs)
      break
    case 'offseason':
    case 'post-season':
      collectOffseason(input, recs)
      break
    case 'preseason':
      collectPreseason(recs)
      break
  }

  collectCommon(input, recs)

  recs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  return recs.slice(0, MAX_RECOMMENDATIONS)
}

// ---------------------------------------------------------------------------
// Regular season
// ---------------------------------------------------------------------------

function collectRegularSeason(input: RecommendationInput, recs: Recommendation[]): void {
  const { selectedLineup, players, playerClubId, settings, currentRound, season } = input

  // No lineup set
  if (!selectedLineup || Object.keys(selectedLineup).length === 0) {
    recs.push({
      id: 'no-lineup',
      type: 'no-lineup',
      title: 'Set your lineup',
      description: 'You have not selected a lineup for the upcoming match.',
      severity: 'critical',
      linkTo: '/lineup',
    })
  } else {
    // Injured players in lineup
    checkInjuredInLineup(selectedLineup, players, recs, 'warning')
  }

  // Upcoming bye
  const round = season.rounds[currentRound]
  if (round?.byeClubIds?.includes(playerClubId)) {
    recs.push({
      id: 'upcoming-bye',
      type: 'upcoming-bye',
      title: 'Bye round',
      description: 'Your team has a bye this round. Use it for training.',
      severity: 'info',
      linkTo: '/training',
    })
  }

  // Expiring contracts
  checkExpiringContracts(players, playerClubId, recs)

  // Cap space
  checkCapSpace(players, playerClubId, settings, recs)
}

// ---------------------------------------------------------------------------
// Finals
// ---------------------------------------------------------------------------

function collectFinals(input: RecommendationInput, recs: Recommendation[]): void {
  const { selectedLineup, players, playerClubId, settings } = input

  // No lineup set
  if (!selectedLineup || Object.keys(selectedLineup).length === 0) {
    recs.push({
      id: 'no-lineup',
      type: 'no-lineup',
      title: 'Set your lineup',
      description: 'Finals lineup not set — this is a must-win game.',
      severity: 'critical',
      linkTo: '/lineup',
    })
  } else {
    // Injured in lineup — elevated to critical during finals
    checkInjuredInLineup(selectedLineup, players, recs, 'critical')
  }

  // Players in poor form (form < 40, at least 3)
  const clubPlayers = Object.values(players).filter((p) => p.clubId === playerClubId)
  const poorForm = clubPlayers.filter((p) => p.form < 40)
  if (poorForm.length >= 3) {
    recs.push({
      id: 'check-key-players',
      type: 'check-key-players',
      title: 'Players in poor form',
      description: `${poorForm.length} players have form below 40. Consider changes.`,
      severity: 'info',
      linkTo: '/squad',
    })
  }

  // Expiring contracts
  checkExpiringContracts(players, playerClubId, recs)

  // Cap space
  checkCapSpace(players, playerClubId, settings, recs)
}

// ---------------------------------------------------------------------------
// Offseason / post-season
// ---------------------------------------------------------------------------

const OFFSEASON_PHASE_RECS: Record<string, { type: RecommendationType; title: string; description: string; linkTo: string }> = {
  'delistings': {
    type: 'offseason-review-list',
    title: 'Review your list',
    description: 'Decide which players to delist before the trade period.',
    linkTo: '/offseason',
  },
  'trade-period': {
    type: 'offseason-trade-targets',
    title: 'Set trade targets',
    description: 'The trade window is open. Identify players to target.',
    linkTo: '/offseason',
  },
  'free-agency': {
    type: 'offseason-check-fa',
    title: 'Check free agents',
    description: 'Free agency is underway. Sign players to fill gaps.',
    linkTo: '/contracts',
  },
  'national-draft': {
    type: 'offseason-review-draft',
    title: 'Review draft board',
    description: 'The national draft is coming up. Scout the best prospects.',
    linkTo: '/offseason',
  },
  'rookie-draft': {
    type: 'offseason-review-draft',
    title: 'Review rookie draft',
    description: 'The rookie draft is available. Find hidden gems.',
    linkTo: '/offseason',
  },
}

function collectOffseason(input: RecommendationInput, recs: Recommendation[]): void {
  const { offseasonState, players, playerClubId, settings } = input

  // Phase-specific guidance
  if (offseasonState) {
    const phaseRec = OFFSEASON_PHASE_RECS[offseasonState.currentPhase]
    if (phaseRec) {
      recs.push({
        id: `offseason-${offseasonState.currentPhase}`,
        ...phaseRec,
        severity: 'info',
      })
    }
  }

  // List violations
  const constraints = resolveListConstraints(settings)
  const validation = validateClubList(players, playerClubId, constraints)
  if (!validation.valid) {
    recs.push({
      id: 'offseason-list-violation',
      type: 'offseason-list-violation',
      title: 'List size violation',
      description: validation.errors.map((e) => e.message).join('; '),
      severity: 'critical',
      linkTo: '/offseason',
    })
  }

  // Cap violations
  if (settings.salaryCap) {
    const spend = calculateClubSalaryTotal(Object.values(players), playerClubId)
    if (spend > settings.salaryCapAmount) {
      recs.push({
        id: 'offseason-cap-violation',
        type: 'offseason-cap-violation',
        title: 'Over the salary cap',
        description: `$${((spend - settings.salaryCapAmount) / 1_000_000).toFixed(2)}M over the cap. You must reduce spending.`,
        severity: 'critical',
        linkTo: '/salary-cap',
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Preseason
// ---------------------------------------------------------------------------

function collectPreseason(recs: Recommendation[]): void {
  recs.push({
    id: 'set-training',
    type: 'set-training',
    title: 'Set training schedule',
    description: 'Prepare your squad with a preseason training program.',
    severity: 'info',
    linkTo: '/training',
  })
  recs.push({
    id: 'review-squad',
    type: 'review-squad',
    title: 'Review squad',
    description: 'Check your roster and get ready for the season.',
    severity: 'info',
    linkTo: '/squad',
  })
}

// ---------------------------------------------------------------------------
// Common (all phases)
// ---------------------------------------------------------------------------

function collectCommon(input: RecommendationInput, recs: Recommendation[]): void {
  const unread = input.newsLog.filter((n) => !n.read).length
  if (unread > 0) {
    recs.push({
      id: 'unread-news',
      type: 'unread-news',
      title: `${unread} unread news`,
      description: 'Check your inbox for the latest updates.',
      severity: 'info',
      linkTo: '/inbox',
    })
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function checkInjuredInLineup(
  lineup: Record<string, string>,
  players: Record<string, Player>,
  recs: Recommendation[],
  severity: RecommendationSeverity,
): void {
  const lineupIds = new Set(Object.values(lineup))
  const unavailable = Array.from(lineupIds).filter((id) => {
    const p = players[id]
    return p?.injury != null || (p ? isPlayerSuspended(p) : false)
  })
  if (unavailable.length > 0) {
    recs.push({
      id: 'injured-in-lineup',
      type: 'injured-in-lineup',
      title: `${unavailable.length} unavailable in lineup`,
      description: 'You have injured or suspended players selected. Update your lineup.',
      severity,
      linkTo: '/lineup',
    })
  }
}

function checkExpiringContracts(
  players: Record<string, Player>,
  clubId: string,
  recs: Recommendation[],
): void {
  const expiring = identifyExpiringContracts(players).filter((p) => p.clubId === clubId)
  if (expiring.length > 0) {
    recs.push({
      id: 'expiring-contracts',
      type: 'expiring-contracts',
      title: `${expiring.length} expiring contracts`,
      description: 'Some players are out of contract at season end.',
      severity: 'info',
      linkTo: '/contracts',
    })
  }
}

function checkCapSpace(
  players: Record<string, Player>,
  clubId: string,
  settings: GameSettings,
  recs: Recommendation[],
): void {
  if (!settings.salaryCap) return

  const spend = calculateClubSalaryTotal(Object.values(players), clubId)
  const cap = settings.salaryCapAmount

  if (spend > cap) {
    recs.push({
      id: 'cap-space-low',
      type: 'cap-space-low',
      title: 'Over the salary cap',
      description: `$${((spend - cap) / 1_000_000).toFixed(2)}M over. Immediate action required.`,
      severity: 'critical',
      linkTo: '/salary-cap',
    })
  } else if (spend / cap >= CAP_WARNING_THRESHOLD) {
    recs.push({
      id: 'cap-space-low',
      type: 'cap-space-low',
      title: 'Cap space running low',
      description: `${((1 - spend / cap) * 100).toFixed(1)}% cap room remaining.`,
      severity: 'warning',
      linkTo: '/salary-cap',
    })
  }
}
