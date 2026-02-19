import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { GameSettings, NewsItem } from '@/types/game'
import type {
  ActiveNegotiation,
  CompletedNegotiation,
  NegotiationConcessions,
  NegotiationDemand,
  NegotiationDemandType,
  NegotiationFeedback,
  NegotiationFeedbackItem,
  NegotiationOffer,
  NegotiationRound,
  NegotiationTracker,
  ContractStructure,
} from '@/types/contract'
import type { PlayerContract } from '@/types/player'
import type { SeededRNG } from '@/engine/core/rng'
import {
  generateContractDemand,
  roundSalary,
} from '@/engine/contracts/negotiation'
import { validateContractOffer } from '@/engine/salary/salaryCapEngine'
import {
  buildYearByYearFromStructure,
  calculateContractCapHitForYear,
  calculateIncentiveValue,
  generateClausePreferences,
} from '@/engine/contracts/contractStructures'
import {
  MAX_NEGOTIATION_ROUNDS,
  NEGOTIATION_COOLDOWN_BASE,
  NEGOTIATION_CONVERGENCE_RATE,
  MAX_CONCURRENT_NEGOTIATIONS,
  NEGOTIATION_ELIGIBLE_ROUND,
  MINIMUM_SALARY,
} from '@/engine/core/constants'
import { checkForMediaLeak } from '@/engine/contracts/mediaLeaks'
import { checkContractRefusal } from '@/engine/players/happiness'
import { getClubState } from '@/engine/venues/venueEngine'

// ---------------------------------------------------------------------------
// 1. initNegotiationTracker
// ---------------------------------------------------------------------------

export function initNegotiationTracker(): NegotiationTracker {
  return {
    active: {},
    completed: [],
    refusedPlayerIds: [],
  }
}

// ---------------------------------------------------------------------------
// Internal helpers: demand profile + feedback
// ---------------------------------------------------------------------------

function hasClause(offer: NegotiationOffer, type: import('@/types/contract').ContractClauseType): boolean {
  return offer.clauses.some((c) => c.type === type)
}

function demandLabel(type: NegotiationDemandType): string {
  switch (type) {
    case 'salary': return 'salary'
    case 'term': return 'term'
    case 'role-promise': return 'role promise'
    case 'leadership-group-role': return 'leadership group role'
    case 'contender-ambition': return 'contender ambition'
    case 'home-state-preference': return 'home-state preference'
    case 'no-trade-clause': return 'no-trade protection'
    case 'limited-trade-clause': return 'limited-trade protection'
    case 'performance-incentives': return 'performance incentives'
    case 'option-control': return 'contract option control'
    case 'vesting-protection': return 'vesting protections'
  }
}

function generateDemandProfile(
  player: Player,
  isReSigning: boolean,
  clubId: string,
): NegotiationDemand[] {
  const profile: NegotiationDemand[] = [
    { type: 'salary', priority: 'high' },
    { type: 'term', priority: 'high' },
  ]

  const currentClubState = getClubState(clubId)
  const isHomeStateClub = Boolean(player.homeState && currentClubState === player.homeState)

  if (player.personality.ambition >= 62) {
    profile.push({
      type: 'role-promise',
      priority: player.personality.ambition >= 78 ? 'high' : 'medium',
      targetValue: player.position.primary,
    })
  }

  if (player.attributes.leadership >= 75 && player.age >= 24) {
    profile.push({
      type: 'leadership-group-role',
      priority: player.attributes.leadership >= 85 ? 'high' : 'medium',
    })
  }

  if (
    player.agentArchetype === 'premiership-chaser' ||
    (player.personality.ambition >= 70 && !isReSigning)
  ) {
    profile.push({ type: 'contender-ambition', priority: 'medium' })
  }

  if (
    player.homeState &&
    !isHomeStateClub &&
    (player.agentArchetype === 'homebody' || player.personality.loyalty >= 65)
  ) {
    profile.push({
      type: 'home-state-preference',
      priority: player.agentArchetype === 'homebody' ? 'high' : 'medium',
      targetValue: player.homeState,
    })
  }

  if (player.age >= 28 && (isReSigning || player.personality.professionalism >= 70)) {
    profile.push({ type: 'no-trade-clause', priority: 'medium' })
  }

  if (player.personality.loyalty >= 55 && player.age >= 24) {
    profile.push({ type: 'limited-trade-clause', priority: 'medium' })
  }

  if (player.personality.ambition >= 66) {
    profile.push({ type: 'performance-incentives', priority: 'low' })
  }

  if (player.age <= 28 && player.personality.ambition >= 70) {
    profile.push({ type: 'option-control', priority: 'medium' })
  }

  if (player.age >= 26 && player.personality.professionalism >= 64) {
    profile.push({ type: 'vesting-protection', priority: 'low' })
  }

  const deduped = new Map<NegotiationDemandType, NegotiationDemand>()
  for (const demand of profile) {
    if (!deduped.has(demand.type)) deduped.set(demand.type, demand)
  }
  return Array.from(deduped.values())
}

function evaluateDemandSatisfied(
  demand: NegotiationDemand,
  offer: NegotiationOffer,
  negotiation: ActiveNegotiation,
  player: Player,
  club: Club | undefined,
): boolean {
  const concessions: NegotiationConcessions = offer.concessions ?? {}

  switch (demand.type) {
    case 'salary':
      return offer.aav >= negotiation.playerDemand.aav * 0.97
    case 'term':
      return Math.abs(offer.years - negotiation.playerDemand.years) <= 0
    case 'role-promise': {
      const promised = concessions.promisedPosition
      if (!promised) return false
      return promised === player.position.primary || player.position.secondary.includes(promised)
    }
    case 'leadership-group-role':
      return concessions.leadershipGroupRole === true
    case 'contender-ambition':
      return concessions.contenderAmbition === true || club?.aiPersonality.competitiveWindow === 'win-now'
    case 'home-state-preference': {
      const clubState = getClubState(negotiation.clubId)
      const homeStateMatch = Boolean(player.homeState && player.homeState === clubState)
      return homeStateMatch || concessions.homeStateSupport === true
    }
    case 'no-trade-clause':
      return hasClause(offer, 'no-trade') || concessions.noTradeClause === true
    case 'limited-trade-clause':
      return hasClause(offer, 'limited-trade') || hasClause(offer, 'no-trade')
    case 'performance-incentives':
      return offer.incentiveTotal >= Math.max(25_000, negotiation.playerDemand.incentiveTotal * 0.5)
    case 'option-control':
      return hasClause(offer, 'player-option') || hasClause(offer, 'team-option')
    case 'vesting-protection':
      return hasClause(offer, 'vesting')
  }
}

function buildFeedback(
  negotiation: ActiveNegotiation,
  offer: NegotiationOffer,
  player: Player,
  club: Club | undefined,
): NegotiationFeedback {
  const demandProfile = negotiation.demandProfile?.length
    ? negotiation.demandProfile
    : [{ type: 'salary', priority: 'high' }, { type: 'term', priority: 'high' }] satisfies NegotiationDemand[]

  const items: NegotiationFeedbackItem[] = demandProfile.map((demand) => {
    const satisfiedByOffer = evaluateDemandSatisfied(demand, offer, negotiation, player, club)
    switch (demand.type) {
      case 'salary':
        return {
          type: demand.type,
          priority: demand.priority,
          satisfiedByOffer,
          message: satisfiedByOffer
            ? `Salary is in range at $${offer.aav.toLocaleString()} per year.`
            : `Salary is below target. Current ask is about $${negotiation.playerDemand.aav.toLocaleString()} per year.`,
          actionHint: `Lift AAV toward $${negotiation.playerDemand.aav.toLocaleString()}.`,
        }
      case 'term':
        return {
          type: demand.type,
          priority: demand.priority,
          satisfiedByOffer,
          message: satisfiedByOffer
            ? `Term length matches preferred ${negotiation.playerDemand.years}-year deal.`
            : `Term mismatch. Player is focused on a ${negotiation.playerDemand.years}-year contract.`,
          actionHint: `Set contract length to ${negotiation.playerDemand.years} years.`,
        }
      case 'role-promise':
        return {
          type: demand.type,
          priority: demand.priority,
          satisfiedByOffer,
          message: satisfiedByOffer
            ? `Role/position commitment has been acknowledged.`
            : `Player wants a clear role promise at ${demand.targetValue ?? player.position.primary}.`,
          actionHint: `Add a position promise (ideally ${demand.targetValue ?? player.position.primary}).`,
        }
      case 'leadership-group-role':
        return {
          type: demand.type,
          priority: demand.priority,
          satisfiedByOffer,
          message: satisfiedByOffer
            ? `Leadership pathway commitment included.`
            : 'Player wants a leadership group pathway included in the deal.',
          actionHint: 'Offer a leadership group role concession.',
        }
      case 'contender-ambition':
        return {
          type: demand.type,
          priority: demand.priority,
          satisfiedByOffer,
          message: satisfiedByOffer
            ? 'Club ambition looks aligned with contender goals.'
            : 'Player needs confidence in contender ambitions before signing.',
          actionHint: 'Add a contender ambition commitment.',
        }
      case 'home-state-preference':
        return {
          type: demand.type,
          priority: demand.priority,
          satisfiedByOffer,
          message: satisfiedByOffer
            ? 'Home-state preference has been addressed.'
            : `Player prefers a home-state arrangement${demand.targetValue ? ` (${demand.targetValue})` : ''}.`,
          actionHint: 'Address home-state preference or add home-state support concessions.',
        }
      case 'no-trade-clause':
        return {
          type: demand.type,
          priority: demand.priority,
          satisfiedByOffer,
          message: satisfiedByOffer
            ? 'No-trade protection is included.'
            : 'Player is asking for no-trade protection.',
          actionHint: 'Include a no-trade clause.',
        }
      case 'limited-trade-clause':
        return {
          type: demand.type,
          priority: demand.priority,
          satisfiedByOffer,
          message: satisfiedByOffer
            ? 'Trade destination protections are included.'
            : 'Player wants limited trade destination control.',
          actionHint: 'Include a limited-trade or no-trade clause.',
        }
      case 'performance-incentives':
        return {
          type: demand.type,
          priority: demand.priority,
          satisfiedByOffer,
          message: satisfiedByOffer
            ? 'Performance/milestone incentives are competitive.'
            : 'Player expects stronger performance/milestone bonus coverage.',
          actionHint: 'Increase bonus terms (games/goals/awards/finals/performance).',
        }
      case 'option-control':
        return {
          type: demand.type,
          priority: demand.priority,
          satisfiedByOffer,
          message: satisfiedByOffer
            ? 'Option-year control is represented in the contract.'
            : 'Player is seeking option-year flexibility/protection.',
          actionHint: 'Add a player or team option year.',
        }
      case 'vesting-protection':
        return {
          type: demand.type,
          priority: demand.priority,
          satisfiedByOffer,
          message: satisfiedByOffer
            ? 'Vesting protection term is present.'
            : 'Player wants a vesting condition tied to milestones.',
          actionHint: 'Add a vesting clause (games, goals, awards, or team finals).',
        }
    }
  })

  const unmet = items.filter((item) => !item.satisfiedByOffer)
  const requiredForSignature = unmet.map((item) => item.type)

  const summary = unmet.length === 0
    ? `${player.firstName} ${player.lastName} is ready to sign this offer.`
    : `${player.firstName} ${player.lastName} needs ${unmet.map((item) => demandLabel(item.type)).join(', ')} before signing.`

  return {
    summary,
    signableNow: unmet.length === 0,
    requiredForSignature,
    items,
  }
}

// ---------------------------------------------------------------------------
// 2. getPlayerNegotiationEligibility
// ---------------------------------------------------------------------------

export interface EligibilityResult {
  eligible: boolean
  reason: string | null
}

export function getPlayerNegotiationEligibility(
  player: Player,
  clubId: string,
  tracker: NegotiationTracker,
  gamePhase: string,
  currentRound: number,
): EligibilityResult {
  // Already negotiating with this player
  const alreadyActive = Object.values(tracker.active).some(
    (n) => n.playerId === player.id && n.clubId === clubId,
  )
  if (alreadyActive) {
    return { eligible: false, reason: 'Already negotiating with this player' }
  }

  // Player refused to negotiate this season
  if (tracker.refusedPlayerIds.includes(player.id)) {
    return { eligible: false, reason: 'Player has refused to negotiate this season' }
  }

  // Max concurrent negotiations
  const activeCount = Object.values(tracker.active).filter(
    (n) => n.clubId === clubId && (n.status === 'pending' || n.status === 'player-considering' || n.status === 'counter-offered'),
  ).length
  if (activeCount >= MAX_CONCURRENT_NEGOTIATIONS) {
    return { eligible: false, reason: `Maximum ${MAX_CONCURRENT_NEGOTIATIONS} concurrent negotiations reached` }
  }

  if (gamePhase === 'regular-season') {
    // During regular season: only own club players with expiring contracts, from round 8+
    if (currentRound < NEGOTIATION_ELIGIBLE_ROUND) {
      return { eligible: false, reason: `Negotiations open from round ${NEGOTIATION_ELIGIBLE_ROUND + 1}` }
    }
    if (player.clubId !== clubId) {
      return { eligible: false, reason: 'Can only negotiate with own players during the season' }
    }
    if (player.contract.yearsRemaining > 2) {
      return { eligible: false, reason: 'Player must have 2 or fewer years remaining' }
    }
  } else if (gamePhase === 'offseason') {
    // During offseason free-agency: any free agent or expiring player
    const isFreeAgent = player.contract.yearsRemaining <= 0 && player.clubId !== 'retired'
    const isExpiring = player.contract.yearsRemaining <= 1
    if (!isFreeAgent && !isExpiring) {
      return { eligible: false, reason: 'Player must be a free agent or have an expiring contract' }
    }
  } else {
    return { eligible: false, reason: 'Negotiations not available in this phase' }
  }

  return { eligible: true, reason: null }
}

// ---------------------------------------------------------------------------
// 3. generateNegotiationDemand
// ---------------------------------------------------------------------------

export function generateNegotiationDemand(
  player: Player,
  clubId: string,
  _isReSigning: boolean,
  rng: SeededRNG,
  ladderPosition: number,
  options?: { playerLoyaltyEnabled?: boolean; inflationIndex?: number; agentDemandMultiplier?: number },
): NegotiationOffer {
  const demand = generateContractDemand(player, clubId, rng, options)

  // Generate clause preferences
  const clauses = generateClausePreferences(player, clubId, ladderPosition, rng)
  const incentiveTotal = calculateIncentiveValue(clauses)

  // Structure preference based on age
  let structure: ContractStructure
  if (player.age < 25) {
    structure = 'escalating'
  } else if (player.age <= 30) {
    structure = 'flat'
  } else {
    structure = 'front-loaded'
  }

  // Build year-by-year with structure
  const yearByYear = buildYearByYearFromStructure(
    demand.aavWanted,
    demand.yearsWanted,
    structure,
  )

  return {
    years: demand.yearsWanted,
    aav: demand.aavWanted,
    yearByYear,
    structure,
    clauses,
    incentiveTotal,
  }
}

// ---------------------------------------------------------------------------
// 4. startNegotiation
// ---------------------------------------------------------------------------

export interface StartNegotiationResult {
  success: boolean
  negotiation?: ActiveNegotiation
  error?: string
}

export function startNegotiation(
  player: Player,
  clubId: string,
  isReSigning: boolean,
  currentRound: number,
  currentDate: string,
  rng: SeededRNG,
  ladderPosition: number,
  options?: { playerLoyaltyEnabled?: boolean; inflationIndex?: number; agentDemandMultiplier?: number; agentRefusalChanceDelta?: number },
  teamCount?: number,
): StartNegotiationResult {
  // Check willingness based on professionalism + ambition
  const willingness =
    (player.personality.professionalism * 0.6 +
      (100 - player.personality.ambition) * 0.4) / 100
  if (willingness < 0.30 && !isReSigning) {
    return {
      success: false,
      error: `${player.firstName} ${player.lastName} has no interest in negotiating at this time.`,
    }
  }

  // Archetype + morale refusal check (adjusted by agent relationship)
  const effectiveTeamCount = teamCount ?? 18
  const refusal = checkContractRefusal(player, clubId, ladderPosition, effectiveTeamCount)
  const adjustedRefuseChance = Math.max(0, Math.min(1, refusal.refuseChance + (options?.agentRefusalChanceDelta ?? 0)))
  if (adjustedRefuseChance > 0 && rng.chance(adjustedRefuseChance)) {
    return {
      success: false,
      error: `${player.firstName} ${player.lastName} refused to negotiate: ${refusal.reason}`,
    }
  }

  // Generate player demand
  const playerDemand = generateNegotiationDemand(
    player, clubId, isReSigning, rng, ladderPosition, options,
  )
  const demandProfile = generateDemandProfile(player, isReSigning, clubId)

  // Determine initial mood based on loyalty and re-signing status
  let playerMood: ActiveNegotiation['playerMood'] = 'neutral'
  if (isReSigning) {
    if (player.personality.loyalty > 70) playerMood = 'eager'
    else if (player.personality.loyalty < 30) playerMood = 'reluctant'
  } else {
    if (player.personality.ambition > 70) playerMood = 'eager'
    else if (player.morale < 40) playerMood = 'reluctant'
  }

  const id = `neg_${player.id.slice(0, 8)}_${currentRound}_${rng.nextInt(1000, 9999)}`

  const negotiation: ActiveNegotiation = {
    id,
    playerId: player.id,
    clubId,
    status: 'pending',
    playerDemand,
    demandProfile,
    latestFeedback: null,
    rounds: [],
    maxRounds: MAX_NEGOTIATION_ROUNDS,
    cooldownRemaining: 0,
    startedAtRound: currentRound,
    startedAtDate: currentDate,
    isReSigning,
    playerMood,
    mediaLeaked: false,
  }

  const initialOffer: NegotiationOffer = {
    ...playerDemand,
    concessions: {},
  }
  negotiation.latestFeedback = buildFeedback(negotiation, initialOffer, player, undefined)

  return { success: true, negotiation }
}

// ---------------------------------------------------------------------------
// 5. submitOffer
// ---------------------------------------------------------------------------

export interface SubmitOfferResult {
  success: boolean
  error?: string
}

export function submitOffer(
  negotiation: ActiveNegotiation,
  offer: NegotiationOffer,
  _currentRound: number,
  currentDate: string,
  players: Record<string, Player>,
  clubId: string,
  settings: GameSettings,
): SubmitOfferResult {
  // Validate status
  if (negotiation.status !== 'pending' && negotiation.status !== 'counter-offered') {
    return { success: false, error: 'Cannot submit offer in current negotiation state' }
  }

  // Validate salary cap
  if (settings.salaryCap) {
    const allPlayers = Object.values(players)
    const player = players[negotiation.playerId]
    const currentSalary = player
      ? calculateContractCapHitForYear({
          yearSalary: player.contract.yearByYear[0] ?? player.contract.aav,
          contractYear: 1,
          clauses: player.contract.clauses,
          incentiveTotal: player.contract.incentiveTotal,
        })
      : 0
    const proposedCapHit = calculateContractCapHitForYear({
      yearSalary: offer.yearByYear[0] ?? offer.aav,
      contractYear: 1,
      clauses: offer.clauses,
      incentiveTotal: offer.incentiveTotal,
    })
    const capResult = validateContractOffer(
      allPlayers,
      clubId,
      proposedCapHit,
      negotiation.isReSigning ? currentSalary : 0,
      settings.salaryCapAmount,
      settings.realism.softCapSpending,
    )
    if (!capResult.allowed) {
      return { success: false, error: capResult.reason ?? 'Contract would breach salary cap' }
    }
  }

  // Add round to history
  const round: NegotiationRound = {
    roundNumber: negotiation.rounds.length + 1,
    offeredBy: 'club',
    offer,
    gameDate: currentDate,
  }
  negotiation.rounds.push(round)

  // Calculate cooldown
  const player = players[negotiation.playerId]
  negotiation.cooldownRemaining = calculateNegotiationCooldown(
    player ?? null,
    negotiation,
    settings.realism.negotiationDelays,
  )

  // Set status
  negotiation.status = 'player-considering'

  return { success: true }
}

// ---------------------------------------------------------------------------
// 6. evaluateClubOffer
// ---------------------------------------------------------------------------

function evaluateClubOffer(
  negotiation: ActiveNegotiation,
  player: Player,
  clubs: Record<string, Club>,
  rng: SeededRNG,
  options?: { playerLoyaltyEnabled?: boolean },
): { result: 'accept' | 'reject' | 'counter'; counterOffer?: NegotiationOffer; feedback: NegotiationFeedback } {
  const latestRound = negotiation.rounds[negotiation.rounds.length - 1]
  if (!latestRound) {
    return {
      result: 'reject',
      feedback: {
        summary: 'No offer to evaluate.',
        signableNow: false,
        requiredForSignature: ['salary', 'term'],
        items: [],
      },
    }
  }

  const offer = latestRound.offer
  const demand = negotiation.playerDemand
  const club = clubs[negotiation.clubId]
  const feedback = buildFeedback(negotiation, offer, player, club)
  const unmetByPriority = {
    high: feedback.items.filter((i) => !i.satisfiedByOffer && i.priority === 'high').length,
    medium: feedback.items.filter((i) => !i.satisfiedByOffer && i.priority === 'medium').length,
    low: feedback.items.filter((i) => !i.satisfiedByOffer && i.priority === 'low').length,
  }

  // AAV ratio
  const aavRatio = offer.aav / demand.aav

  // Base acceptance probability from AAV ratio
  let acceptanceProbability: number
  if (aavRatio >= 1.0) {
    acceptanceProbability = 0.90 + Math.min(0.09, (aavRatio - 1.0) * 0.5)
  } else if (aavRatio >= 0.90) {
    acceptanceProbability = (aavRatio - 0.90) / 0.10 * 0.70 + 0.15
  } else {
    acceptanceProbability = Math.max(0.02, aavRatio - 0.80)
  }

  // Years match bonus
  const yearDiff = Math.abs(offer.years - demand.years)
  if (yearDiff === 0) {
    acceptanceProbability = Math.min(0.99, acceptanceProbability + 0.05)
  } else if (yearDiff > 1) {
    acceptanceProbability = Math.max(0.02, acceptanceProbability - 0.15)
  }

  // Clause compatibility: each demanded clause missing from offer = penalty
  const demandedClauseTypes = new Set(demand.clauses.map((c) => c.type))
  const offeredClauseTypes = new Set(offer.clauses.map((c) => c.type))
  let missingClauses = 0
  for (const ct of demandedClauseTypes) {
    if (!offeredClauseTypes.has(ct)) missingClauses++
  }
  acceptanceProbability -= missingClauses * 0.05

  // Structure preference mismatch
  if (offer.structure !== demand.structure) {
    acceptanceProbability -= 0.05
  }

  // Explicit demand fulfillment impact
  acceptanceProbability += feedback.items.filter((i) => i.satisfiedByOffer && i.type !== 'salary' && i.type !== 'term').length * 0.03
  acceptanceProbability -= unmetByPriority.high * 0.12
  acceptanceProbability -= unmetByPriority.medium * 0.07
  acceptanceProbability -= unmetByPriority.low * 0.04
  if (unmetByPriority.high > 0) {
    acceptanceProbability = Math.min(acceptanceProbability, 0.25)
  }

  // Loyalty bonus for re-signing
  const loyaltyEnabled = options?.playerLoyaltyEnabled !== false
  if (negotiation.isReSigning && loyaltyEnabled) {
    acceptanceProbability = Math.min(0.99, acceptanceProbability + 0.10)
  }

  // Mood modifier
  switch (negotiation.playerMood) {
    case 'eager':
      acceptanceProbability = Math.min(0.99, acceptanceProbability + 0.10)
      break
    case 'reluctant':
      acceptanceProbability -= 0.10
      break
    case 'hostile':
      acceptanceProbability -= 0.15
      break
  }

  // Agent relationship bonus
  if (negotiation.agentRelBonus) {
    acceptanceProbability += negotiation.agentRelBonus
  }

  // Clamp
  acceptanceProbability = Math.max(0.02, Math.min(0.99, acceptanceProbability))

  // Roll
  if (feedback.signableNow && rng.chance(acceptanceProbability)) {
    return { result: 'accept', feedback }
  }

  // Check for flat rejection (very low probability or max rounds approaching)
  if (
    (acceptanceProbability < 0.10 || unmetByPriority.high >= 2) &&
    negotiation.rounds.length >= negotiation.maxRounds - 1
  ) {
    return { result: 'reject', feedback }
  }

  // Counter-offer: converge demand toward the club's offer
  const convergenceRate = NEGOTIATION_CONVERGENCE_RATE
  const newAav = roundSalary(
    demand.aav * (1 - convergenceRate) + offer.aav * convergenceRate,
  )
  const newYears = demand.years // Years don't converge
  const newYearByYear = buildYearByYearFromStructure(newAav, newYears, demand.structure)

  // Mood-adjusted demand
  let moodAavModifier = 1.0
  switch (negotiation.playerMood) {
    case 'eager': moodAavModifier = 0.95; break
    case 'reluctant': moodAavModifier = 1.05; break
    case 'hostile': moodAavModifier = 1.15; break
  }

  const adjustedAav = roundSalary(Math.max(MINIMUM_SALARY, newAav * moodAavModifier))
  const adjustedYearByYear = buildYearByYearFromStructure(adjustedAav, newYears, demand.structure)

  const counterOffer: NegotiationOffer = {
    years: newYears,
    aav: adjustedAav,
    yearByYear: adjustedYearByYear,
    structure: demand.structure,
    clauses: demand.clauses,
    incentiveTotal: demand.incentiveTotal,
    concessions: {},
  }

  if (
    (negotiation.demandProfile ?? []).some((d) => d.type === 'no-trade-clause') &&
    !counterOffer.clauses.some((c) => c.type === 'no-trade')
  ) {
    counterOffer.clauses = [...counterOffer.clauses, { type: 'no-trade' }]
  }
  if (
    (negotiation.demandProfile ?? []).some((d) => d.type === 'limited-trade-clause') &&
    !counterOffer.clauses.some((c) => c.type === 'limited-trade' || c.type === 'no-trade')
  ) {
    counterOffer.clauses = [...counterOffer.clauses, { type: 'limited-trade', vetoClubIds: [] }]
  }

  // Update the player's internal demand (convergence)
  negotiation.playerDemand = {
    ...demand,
    aav: newAav,
    yearByYear: newYearByYear,
  }

  return { result: 'counter', counterOffer, feedback }
}

// ---------------------------------------------------------------------------
// 7. tickNegotiations
// ---------------------------------------------------------------------------

export interface TickResult {
  completedIds: string[]
  signings: { playerId: string; clubId: string; offer: NegotiationOffer }[]
  news: NewsItem[]
}

export function tickNegotiations(
  tracker: NegotiationTracker,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  currentRound: number,
  currentDate: string,
  rng: SeededRNG,
  settings: GameSettings,
): TickResult {
  const completedIds: string[] = []
  const signings: TickResult['signings'] = []
  const news: NewsItem[] = []

  for (const [id, negotiation] of Object.entries(tracker.active)) {
    const player = players[negotiation.playerId]
    if (!player) {
      completedIds.push(id)
      continue
    }

    // Decrement cooldown
    if (negotiation.cooldownRemaining > 0) {
      negotiation.cooldownRemaining--
    }

    // When cooldown hits 0 and player is considering
    if (
      negotiation.cooldownRemaining === 0 &&
      negotiation.status === 'player-considering'
    ) {
      const evaluation = evaluateClubOffer(
        negotiation,
        player,
        clubs,
        rng,
        { playerLoyaltyEnabled: settings.realism.playerLoyalty },
      )
      negotiation.latestFeedback = evaluation.feedback

      switch (evaluation.result) {
        case 'accept': {
          negotiation.status = 'accepted'
          const latestOffer = negotiation.rounds[negotiation.rounds.length - 1]?.offer
          if (latestOffer) {
            signings.push({
              playerId: player.id,
              clubId: negotiation.clubId,
              offer: latestOffer,
            })
          }

          const clubName = clubs[negotiation.clubId]?.name ?? negotiation.clubId
          news.push({
            id: `news_${id}_accepted`,
            date: currentDate,
            headline: `${player.firstName} ${player.lastName} ${negotiation.isReSigning ? 're-signs' : 'signs'} with ${clubName}`,
            body: `${player.firstName} ${player.lastName} has agreed to a ${latestOffer?.years ?? 0}-year deal worth $${(latestOffer?.aav ?? 0).toLocaleString()} per year with ${clubName}.`,
            category: 'contract',
            clubIds: [negotiation.clubId],
            playerIds: [player.id],
          })

          completedIds.push(id)
          break
        }

        case 'reject': {
          negotiation.status = 'rejected'

          const clubName = clubs[negotiation.clubId]?.name ?? negotiation.clubId
          news.push({
            id: `news_${id}_rejected`,
            date: currentDate,
            headline: `${player.firstName} ${player.lastName} rejects ${clubName} offer`,
            body: `${player.firstName} ${player.lastName} has walked away from contract negotiations with ${clubName}. The two parties were unable to reach an agreement.`,
            category: 'contract',
            clubIds: [negotiation.clubId],
            playerIds: [player.id],
          })

          completedIds.push(id)
          break
        }

        case 'counter': {
          negotiation.status = 'counter-offered'
          if (evaluation.counterOffer) {
            const counterRound: NegotiationRound = {
              roundNumber: negotiation.rounds.length + 1,
              offeredBy: 'player',
              offer: evaluation.counterOffer,
              gameDate: currentDate,
            }
            negotiation.rounds.push(counterRound)
          }
          break
        }
      }
    }

    // Check max rounds expiry
    if (
      negotiation.rounds.length >= negotiation.maxRounds &&
      negotiation.status !== 'accepted' &&
      !completedIds.includes(id)
    ) {
      negotiation.status = 'expired'

      const clubName = clubs[negotiation.clubId]?.name ?? negotiation.clubId
      news.push({
        id: `news_${id}_expired`,
        date: currentDate,
        headline: `${player.firstName} ${player.lastName} negotiations with ${clubName} expire`,
        body: `Contract talks between ${player.firstName} ${player.lastName} and ${clubName} have broken down after ${negotiation.rounds.length} rounds of negotiation without agreement.`,
        category: 'contract',
        clubIds: [negotiation.clubId],
        playerIds: [player.id],
      })

      completedIds.push(id)
    }

    // Media leak check (only for active negotiations)
    if (
      !completedIds.includes(id) &&
      !negotiation.mediaLeaked &&
      negotiation.rounds.length > 0
    ) {
      const leakResult = checkForMediaLeak(
        negotiation, player, clubs, rng, settings,
      )
      if (leakResult.leaked) {
        negotiation.mediaLeaked = true
        negotiation.leakedAtRound = currentRound
        if (leakResult.moodChange) {
          negotiation.playerMood = leakResult.moodChange
        }
        if (leakResult.newsItem) {
          news.push(leakResult.newsItem)
        }
      }
    }
  }

  return { completedIds, signings, news }
}

// ---------------------------------------------------------------------------
// 8. withdrawNegotiation
// ---------------------------------------------------------------------------

export function withdrawNegotiation(
  negotiation: ActiveNegotiation,
  currentDate: string,
): CompletedNegotiation {
  negotiation.status = 'withdrawn'

  return {
    id: negotiation.id,
    playerId: negotiation.playerId,
    clubId: negotiation.clubId,
    outcome: 'withdrawn',
    completedDate: currentDate,
    totalRounds: negotiation.rounds.length,
  }
}

// ---------------------------------------------------------------------------
// 9. buildContractFromOffer
// ---------------------------------------------------------------------------

export function buildContractFromOffer(offer: NegotiationOffer): PlayerContract {
  return {
    yearsRemaining: offer.years,
    aav: offer.aav,
    yearByYear: [...offer.yearByYear],
    isRestricted: false,
    clauses: [...offer.clauses],
    structure: offer.structure,
    incentiveTotal: offer.incentiveTotal,
  }
}

// ---------------------------------------------------------------------------
// 10. completeNegotiation
// ---------------------------------------------------------------------------

export function completeNegotiation(
  negotiation: ActiveNegotiation,
  currentDate: string,
): CompletedNegotiation {
  const lastClubOffer = [...negotiation.rounds]
    .reverse()
    .find((r) => r.offeredBy === 'club')

  let outcome: CompletedNegotiation['outcome']
  switch (negotiation.status) {
    case 'accepted': outcome = 'signed'; break
    case 'rejected': outcome = 'rejected'; break
    case 'expired': outcome = 'expired'; break
    case 'withdrawn': outcome = 'withdrawn'; break
    default: outcome = 'expired'; break
  }

  return {
    id: negotiation.id,
    playerId: negotiation.playerId,
    clubId: negotiation.clubId,
    outcome,
    finalOffer: lastClubOffer?.offer,
    completedDate: currentDate,
    totalRounds: negotiation.rounds.length,
  }
}

// ---------------------------------------------------------------------------
// 11. calculateNegotiationCooldown
// ---------------------------------------------------------------------------

export function calculateNegotiationCooldown(
  player: Player | null,
  negotiation: ActiveNegotiation,
  delaysEnabled: boolean,
): number {
  if (!delaysEnabled) return 0

  let cooldown = NEGOTIATION_COOLDOWN_BASE

  if (player) {
    if (player.personality.professionalism < 40) cooldown += 1
  }

  if (negotiation.playerMood === 'hostile') cooldown += 1

  // Agent relationship cooldown adjustment
  if (negotiation.agentCooldownAdjust) {
    cooldown = Math.max(0, cooldown + negotiation.agentCooldownAdjust)
  }

  return cooldown
}

// ---------------------------------------------------------------------------
// 12. acceptCounterOffer
// ---------------------------------------------------------------------------

export function acceptCounterOffer(
  negotiation: ActiveNegotiation,
): NegotiationOffer | null {
  if (negotiation.status !== 'counter-offered') return null

  // Find the latest player counter-offer
  const lastPlayerOffer = [...negotiation.rounds]
    .reverse()
    .find((r) => r.offeredBy === 'player')

  if (!lastPlayerOffer) return null

  negotiation.status = 'accepted'
  return lastPlayerOffer.offer
}
