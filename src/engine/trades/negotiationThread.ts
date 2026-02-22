import type { Club } from '@/types/club'
import type { Player } from '@/types/player'
import type { GameSettings } from '@/types/game'
import type { TradeNegotiationOffer } from '@/types/trade'
import type { SeededRNG } from '@/engine/core/rng'
import type {
  NegotiationThread,
  NegotiationRound,
  NegotiationRoundStatus,
  AiResponseSignal,
  ClubLeverageState,
} from '@/types/negotiation'
import {
  evaluateForClub,
  getDeadlinePressure,
  getTradeDeadlineDate,
} from '@/engine/trades/tradeNegotiationEngine'
import type { OfferEvalContext } from '@/engine/trades/tradeNegotiationEngine'
import { getResponseDelayDays, computeAiCounterOffer } from '@/engine/trades/leverageEngine'

function addDaysToDate(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`)
  if (!Number.isFinite(ms)) return isoDate
  return new Date(ms + days * 86400000).toISOString().slice(0, 10)
}

function genId(prefix: string, rng: SeededRNG): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = `${prefix}_`
  for (let i = 0; i < 10; i++) out += chars[rng.nextInt(0, chars.length - 1)]
  return out
}

function cloneThread(thread: NegotiationThread): NegotiationThread {
  return {
    ...thread,
    rounds: thread.rounds.map((r) => ({ ...r })),
    leverageSnapshot: { ...thread.leverageSnapshot },
  }
}

export function createNegotiationThread(
  userClubId: string,
  partnerClubId: string,
  offer: TradeNegotiationOffer,
  leverage: ClubLeverageState,
  deadlinePressure: number,
  personality: Club['aiPersonality'],
  currentYear: number,
  rng: SeededRNG,
): NegotiationThread {
  const now = offer.createdAt
  const maxRounds = deadlinePressure > 0.5 ? 4 : 3
  const delayDays = getResponseDelayDays(leverage, personality, deadlinePressure, rng)
  const respondBy = addDaysToDate(now, delayDays)

  const round1: NegotiationRound = {
    roundNumber: 1,
    offeredAt: now,
    respondBy,
    respondedAt: null,
    offererId: userClubId,
    status: 'pending-ai',
    offer,
  }

  return {
    id: genId('thread', rng),
    playerClubId: userClubId,
    partnerClubId,
    status: 'active',
    initiatedAt: now,
    rounds: [round1],
    maxRounds,
    leverageSnapshot: leverage,
    currentYear,
  }
}

function resolveAiResponse(
  thread: NegotiationThread,
  currentDate: string,
  context: OfferEvalContext,
  rng: SeededRNG,
): NegotiationThread {
  const newThread = cloneThread(thread)
  const lastRound = newThread.rounds[newThread.rounds.length - 1]
  if (!lastRound || (lastRound.status !== 'pending-ai' && lastRound.status !== 'stalling')) {
    return thread
  }

  const aiClubId = thread.partnerClubId
  const score = evaluateForClub(lastRound.offer, aiClubId, context)
  const threshold = -220 + Math.round(context.deadlinePressure * 120)
  const leverage = thread.leverageSnapshot

  // 1. Accept
  if (score >= threshold) {
    lastRound.status = 'accepted'
    lastRound.respondedAt = currentDate
    lastRound.aiSignal = score >= threshold + 100 ? 'warming' : 'neutral'
    lastRound.aiMessage = 'The club has agreed to the terms. Trade completed.'
    newThread.status = 'completed'
    return newThread
  }

  const counterRange = Math.abs(threshold) * 0.15
  const isClose = score >= threshold - counterRange

  // 2. Counter if close enough and rounds remain
  if (isClose && newThread.rounds.length < newThread.maxRounds) {
    const counterOffer = computeAiCounterOffer(
      lastRound.offer,
      score,
      threshold,
      leverage,
      context.clubs,
      context.players,
      context.currentYear,
      rng,
    )
    if (counterOffer) {
      lastRound.status = 'countered'
      lastRound.respondedAt = currentDate
      lastRound.aiSignal = 'neutral'
      lastRound.aiMessage = 'Counter offer received.'

      const newRound: NegotiationRound = {
        roundNumber: newThread.rounds.length + 1,
        offeredAt: currentDate,
        respondBy: currentDate,
        respondedAt: null,
        offererId: aiClubId,
        status: 'pending-user',
        offer: counterOffer,
        aiSignal: 'neutral',
        aiMessage: counterOffer.message,
      }
      newThread.rounds.push(newRound)
      return newThread
    }
  }

  // 3. Hardball bluff: high urgency + near deadline + rounds remain
  if (
    leverage.urgencyScore >= 70
    && context.deadlinePressure >= 0.6
    && newThread.rounds.length < newThread.maxRounds
    && lastRound.status !== 'stalling' // don't bluff twice
  ) {
    lastRound.status = 'stalling'
    lastRound.respondedAt = currentDate
    lastRound.aiSignal = 'hardball'
    lastRound.aiMessage = "We'll need a better offer before we engage further."
    // Set a new AI-pending round for user to counter into
    const bluffRound: NegotiationRound = {
      roundNumber: newThread.rounds.length + 1,
      offeredAt: currentDate,
      respondBy: currentDate,
      respondedAt: null,
      offererId: aiClubId,
      status: 'pending-user',
      offer: { ...lastRound.offer, status: 'pending-user', proposingClubId: aiClubId },
      aiSignal: 'hardball',
      aiMessage: "We'll need a better offer before we engage.",
    }
    newThread.rounds.push(bluffRound)
    return newThread
  }

  // 4. Reject
  lastRound.status = 'rejected'
  lastRound.respondedAt = currentDate
  lastRound.aiSignal = score < threshold - 300 ? 'cooling' : 'neutral'
  lastRound.aiMessage =
    score < threshold - 300
      ? 'The club rejected the offer. The valuation gap is too large.'
      : 'The club declined the offer at this time.'
  newThread.status = 'collapsed'
  return newThread
}

export function tickThreadResponses(
  threads: NegotiationThread[],
  currentDate: string,
  context: {
    players: Record<string, Player>
    clubs: Record<string, Club>
    settings: GameSettings
    currentYear: number
    deadlinePressure: number
    demandByPlayerId: Record<string, number>
  },
  rng: SeededRNG,
): { threads: NegotiationThread[]; acceptedOffers: TradeNegotiationOffer[] } {
  const evalContext: OfferEvalContext = {
    players: context.players,
    clubs: context.clubs,
    settings: context.settings,
    currentYear: context.currentYear,
    deadlinePressure: context.deadlinePressure,
    demandByPlayerId: context.demandByPlayerId,
  }

  const updatedThreads: NegotiationThread[] = []
  const acceptedOffers: TradeNegotiationOffer[] = []

  for (const thread of threads) {
    if (thread.status !== 'active') {
      updatedThreads.push(thread)
      continue
    }

    const lastRound = thread.rounds[thread.rounds.length - 1]
    if (!lastRound) {
      updatedThreads.push(thread)
      continue
    }

    // Only process pending-ai rounds that are due
    if (lastRound.status === 'pending-ai' || lastRound.status === 'stalling') {
      if (currentDate >= lastRound.respondBy) {
        const resolved = resolveAiResponse(thread, currentDate, evalContext, rng)
        updatedThreads.push(resolved)
        // If the thread just got accepted, collect the offer for execution
        const resolvedLast = resolved.rounds[resolved.rounds.length - 1]
        if (resolvedLast?.status === 'accepted') {
          acceptedOffers.push(resolvedLast.offer)
        }
      } else {
        updatedThreads.push(thread)
      }
    } else {
      updatedThreads.push(thread)
    }
  }

  return { threads: updatedThreads, acceptedOffers }
}

export function userCounterRound(
  thread: NegotiationThread,
  sendPlayerIds: string[],
  receivePlayerIds: string[],
  currentDate: string,
  leverage: ClubLeverageState,
  personality: Club['aiPersonality'],
  deadlinePressure: number,
  rng: SeededRNG,
  players: Record<string, Player>,
): NegotiationThread {
  if (thread.rounds.length >= thread.maxRounds) return thread
  if (thread.status !== 'active') return thread

  const newThread = cloneThread(thread)
  const userClubId = thread.playerClubId
  const partnerClubId = thread.partnerClubId

  const playerMoves = [
    ...sendPlayerIds.map((pid) => ({ playerId: pid, fromClubId: userClubId, toClubId: partnerClubId })),
    ...receivePlayerIds.map((pid) => ({ playerId: pid, fromClubId: partnerClubId, toClubId: userClubId })),
  ]

  const delayDays = getResponseDelayDays(leverage, personality, deadlinePressure, rng)
  const respondBy = addDaysToDate(currentDate, delayDays)

  const newRound: NegotiationRound = {
    roundNumber: newThread.rounds.length + 1,
    offeredAt: currentDate,
    respondBy,
    respondedAt: null,
    offererId: userClubId,
    status: 'pending-ai',
    offer: {
      id: genId('offer', rng),
      threadId: thread.id,
      createdAt: currentDate,
      expiresAt: null,
      initiatedBy: 'user',
      status: 'pending-user',
      clubsInvolved: [userClubId, partnerClubId],
      proposingClubId: userClubId,
      message: 'User counter offer.',
      playerMoves,
      pickMoves: [],
      salaryRetentions: [],
      meta: {
        deadlinePressure,
        marketDemandScore: 0,
        isSalaryDump: false,
        isPlayerInitiated: false,
      },
    },
  }

  newThread.rounds.push(newRound)
  return newThread
}

export function userAcceptThread(thread: NegotiationThread, currentDate: string): NegotiationThread {
  if (thread.status !== 'active') return thread
  const newThread = cloneThread(thread)
  const lastRound = newThread.rounds[newThread.rounds.length - 1]
  if (lastRound && lastRound.status === 'pending-user') {
    lastRound.status = 'accepted'
    lastRound.respondedAt = currentDate
    newThread.status = 'completed'
  }
  return newThread
}

export function userRejectThread(thread: NegotiationThread): NegotiationThread {
  if (thread.status !== 'active') return thread
  const newThread = cloneThread(thread)
  const lastRound = newThread.rounds[newThread.rounds.length - 1]
  if (lastRound) {
    lastRound.status = 'rejected'
    lastRound.respondedAt = new Date().toISOString().slice(0, 10)
  }
  newThread.status = 'collapsed'
  return newThread
}

export function collapseExpiredThreads(
  threads: NegotiationThread[],
  currentDate: string,
): NegotiationThread[] {
  return threads.map((thread) => {
    if (thread.status !== 'active') return thread
    const lastRound = thread.rounds[thread.rounds.length - 1]
    if (!lastRound) return thread
    // Collapse if AI was supposed to respond >5 days ago and still hasn't
    if (
      (lastRound.status === 'pending-ai' || lastRound.status === 'stalling')
      && addDaysToDate(lastRound.respondBy, 5) < currentDate
    ) {
      return {
        ...thread,
        rounds: thread.rounds.map((r, i) =>
          i === thread.rounds.length - 1 ? { ...r, status: 'expired' as NegotiationRoundStatus } : r,
        ),
        status: 'collapsed',
      }
    }
    return thread
  })
}
