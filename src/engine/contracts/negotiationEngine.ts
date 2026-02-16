import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { GameSettings, NewsItem } from '@/types/game'
import type {
  ActiveNegotiation,
  CompletedNegotiation,
  NegotiationOffer,
  NegotiationRound,
  NegotiationStatus,
  NegotiationTracker,
  ContractClause,
  ContractStructure,
} from '@/types/contract'
import type { PlayerContract } from '@/types/player'
import type { SeededRNG } from '@/engine/core/rng'
import {
  calculatePlayerValue,
  generateContractDemand,
  evaluateOffer,
  roundSalary,
} from '@/engine/contracts/negotiation'
import { validateContractOffer } from '@/engine/salary/salaryCapEngine'
import {
  buildYearByYearFromStructure,
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
  isReSigning: boolean,
  rng: SeededRNG,
  ladderPosition: number,
  options?: { playerLoyaltyEnabled?: boolean },
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
  options?: { playerLoyaltyEnabled?: boolean },
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

  // Generate player demand
  const playerDemand = generateNegotiationDemand(
    player, clubId, isReSigning, rng, ladderPosition, options,
  )

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
    rounds: [],
    maxRounds: MAX_NEGOTIATION_ROUNDS,
    cooldownRemaining: 0,
    startedAtRound: currentRound,
    startedAtDate: currentDate,
    isReSigning,
    playerMood,
    mediaLeaked: false,
  }

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
  currentRound: number,
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
    const currentSalary = player?.contract.yearByYear[0] ?? 0
    const capResult = validateContractOffer(
      allPlayers,
      clubId,
      offer.aav,
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
  rng: SeededRNG,
  options?: { playerLoyaltyEnabled?: boolean },
): { result: 'accept' | 'reject' | 'counter'; counterOffer?: NegotiationOffer } {
  const latestRound = negotiation.rounds[negotiation.rounds.length - 1]
  if (!latestRound) return { result: 'reject' }

  const offer = latestRound.offer
  const demand = negotiation.playerDemand

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

  // Clamp
  acceptanceProbability = Math.max(0.02, Math.min(0.99, acceptanceProbability))

  // Roll
  if (rng.chance(acceptanceProbability)) {
    return { result: 'accept' }
  }

  // Check for flat rejection (very low probability or max rounds approaching)
  if (acceptanceProbability < 0.10 && negotiation.rounds.length >= negotiation.maxRounds - 1) {
    return { result: 'reject' }
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
  }

  // Update the player's internal demand (convergence)
  negotiation.playerDemand = {
    ...demand,
    aav: newAav,
    yearByYear: newYearByYear,
  }

  return { result: 'counter', counterOffer }
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
        rng,
        { playerLoyaltyEnabled: settings.realism.playerLoyalty },
      )

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

  // Multiple competing offers would add +1 but we don't track that here
  // so we keep it simple

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
