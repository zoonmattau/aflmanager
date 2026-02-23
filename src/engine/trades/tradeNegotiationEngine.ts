import type { Club, DraftPick } from '@/types/club'
import type { CompletedTrade, GameSettings, NewsItem } from '@/types/game'
import type { Player } from '@/types/player'
import type { LadderEntry } from '@/types/season'
import type {
  TradeBlockState,
  TradeEnquiry,
  TradeInboxItem,
  TradeBlockListing,
  TradeNegotiationOffer,
  TradePlayerMove,
  TradePickMove,
  TradeSalaryRetention,
  TradeInboxEvent,
  BiddingWarCluster,
  TradeDramaState,
} from '@/types/trade'
import type { SeededRNG } from '@/engine/core/rng'
import type { TacticalIdentity } from '@/types/club'
import { getPackageTradeValue } from '@/engine/trades/tradeValuation'
import { getTacticalTradePreferences } from '@/engine/core/tacticalIdentity'
import { validateTradeCapImpact } from '@/engine/salary/salaryCapEngine'
import { getArchetypeTradeRequestParams, getArchetypeTradeConsentModifier } from '@/engine/player/agentPersonality'
import { getRoleFrustrationTradeParams } from '@/engine/players/happiness'
import { getClubState } from '@/engine/venues/venueEngine'

const POSITIONS = ['BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF'] as const

type Position = (typeof POSITIONS)[number]

export interface OfferEvalContext {
  players: Record<string, Player>
  clubs: Record<string, Club>
  settings: GameSettings
  currentYear: number
  deadlinePressure: number
  demandByPlayerId?: Record<string, number>
}

function id(prefix: string, rng: SeededRNG): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = `${prefix}_`
  for (let i = 0; i < 10; i++) out += chars[rng.nextInt(0, chars.length - 1)]
  return out
}

function daysUntil(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`)
  const b = Date.parse(`${toIso}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 999
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)))
}

export function getTradeDeadlineDate(currentYear: number): string {
  return `${currentYear}-10-29`
}

export function getDeadlinePressure(currentDate: string, deadlineDate: string): number {
  const days = daysUntil(currentDate, deadlineDate)
  if (days <= 1) return 1
  if (days <= 3) return 0.85
  if (days <= 7) return 0.7
  if (days <= 14) return 0.45
  return 0.2
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function getDemandAdjustedValue(baseValue: number, demandScore: number): number {
  const factor = 1 + clamp(demandScore, -1.2, 3) * 0.12
  return Math.max(0, Math.round(baseValue * factor))
}

function getClubRoster(players: Record<string, Player>, clubId: string): Player[] {
  return Object.values(players).filter((p) => p.clubId === clubId)
}

export function getPositionalNeeds(players: Record<string, Player>, clubId: string): Set<Position> {
  const counts = new Map<Position, number>()
  for (const pos of POSITIONS) counts.set(pos, 0)
  for (const p of Object.values(players)) {
    if (p.clubId !== clubId) continue
    const pos = p.position.primary as Position
    counts.set(pos, (counts.get(pos) ?? 0) + 1)
  }

  const needs = new Set<Position>()
  for (const [pos, count] of counts) {
    if (count < 3) needs.add(pos)
  }
  return needs
}

export function computeMarketDemand(players: Record<string, Player>, clubs: Record<string, Club>): Record<Position, number> {
  const demand: Record<Position, number> = {
    BP: 0,
    FB: 0,
    HBF: 0,
    CHB: 0,
    W: 0,
    IM: 0,
    OM: 0,
    RK: 0,
    HFF: 0,
    CHF: 0,
    FP: 0,
    FF: 0,
  }

  for (const clubId of Object.keys(clubs)) {
    const needs = getPositionalNeeds(players, clubId)
    for (const pos of needs) {
      demand[pos] += 1
    }
  }

  const divisor = Math.max(1, Object.keys(clubs).length)
  for (const pos of POSITIONS) demand[pos] = demand[pos] / divisor
  return demand
}

function extractClubPackage(
  offer: TradeNegotiationOffer,
  clubId: string,
): {
  playersIn: string[]
  playersOut: string[]
  picksIn: DraftPick[]
  picksOut: DraftPick[]
  salaryIncoming: number[]
  salaryOutgoing: number[]
} {
  const playersIn: string[] = []
  const playersOut: string[] = []
  const picksIn: DraftPick[] = []
  const picksOut: DraftPick[] = []

  for (const move of offer.playerMoves) {
    if (move.toClubId === clubId) playersIn.push(move.playerId)
    if (move.fromClubId === clubId) playersOut.push(move.playerId)
  }

  for (const move of offer.pickMoves) {
    if (move.toClubId === clubId) picksIn.push(move.pick)
    if (move.fromClubId === clubId) picksOut.push(move.pick)
  }

  return {
    playersIn,
    playersOut,
    picksIn,
    picksOut,
    salaryIncoming: [],
    salaryOutgoing: [],
  }
}

function buildSalaryFlows(
  offer: TradeNegotiationOffer,
  players: Record<string, Player>,
  clubId: string,
): { incoming: number[]; outgoing: number[] } {
  const incoming: number[] = []
  const outgoing: number[] = []

  const retentionByPlayer = new Map<string, number>()
  for (const r of offer.salaryRetentions) {
    retentionByPlayer.set(r.playerId, (retentionByPlayer.get(r.playerId) ?? 0) + r.amount)
  }

  for (const move of offer.playerMoves) {
    const player = players[move.playerId]
    if (!player) continue
    const salary = player.contract.yearByYear[0] ?? player.contract.aav
    const retained = Math.min(Math.max(0, retentionByPlayer.get(move.playerId) ?? 0), salary)
    const assumedSalaryAtDestination = Math.max(0, salary - retained)

    if (move.toClubId === clubId) incoming.push(assumedSalaryAtDestination)
    if (move.fromClubId === clubId) outgoing.push(assumedSalaryAtDestination)

    for (const ret of offer.salaryRetentions) {
      if (ret.playerId !== move.playerId) continue
      if (ret.retainingClubId === clubId) outgoing.push(ret.amount)
    }
  }

  return { incoming, outgoing }
}

function playerValue(
  playerId: string,
  players: Record<string, Player>,
  year: number,
  clubId?: string,
  demandByPlayerId?: Record<string, number>,
): number {
  if (!players[playerId]) return 0
  const base = getPackageTradeValue(
    [playerId],
    [],
    players,
    year,
    clubId ? { evaluatingClubId: clubId, players } : undefined,
  )
  const demand = demandByPlayerId?.[playerId] ?? 0
  return getDemandAdjustedValue(base, demand)
}

function overallOf(player: Player): number {
  const vals = Object.values(player.attributes)
  const total = vals.reduce((sum, n) => sum + n, 0)
  return total / vals.length
}

export function evaluateForClub(
  offer: TradeNegotiationOffer,
  clubId: string,
  context: OfferEvalContext,
): number {
  const club = context.clubs[clubId]
  if (!club) return -9999

  const pkg = extractClubPackage(offer, clubId)
  const needs = getPositionalNeeds(context.players, clubId)
  const marketDemand = computeMarketDemand(context.players, context.clubs)

  let inValue = getPackageTradeValue(
    pkg.playersIn,
    pkg.picksIn,
    context.players,
    context.currentYear,
    {
      evaluatingClubId: clubId,
      players: context.players,
      competitiveWindow: club.aiPersonality.competitiveWindow,
      tacticalIdentity: club.tacticalIdentity,
    },
  )

  let outValue = getPackageTradeValue(
    pkg.playersOut,
    pkg.picksOut,
    context.players,
    context.currentYear,
  )

  if (context.demandByPlayerId) {
    for (const pid of pkg.playersIn) {
      const d = context.demandByPlayerId[pid] ?? 0
      inValue += Math.round(d * 65)
    }
    for (const pid of pkg.playersOut) {
      const d = context.demandByPlayerId[pid] ?? 0
      outValue += Math.round(d * 65)
    }
  }

  let needBonus = 0
  let marketBonus = 0
  let strategyBonus = 0

  for (const pid of pkg.playersIn) {
    const p = context.players[pid]
    if (!p) continue
    const pos = p.position.primary as Position
    if (needs.has(pos)) needBonus += 140
    marketBonus += Math.round((marketDemand[pos] ?? 0) * 90)

    const ov = overallOf(p)
    if (club.aiPersonality.competitiveWindow === 'win-now' && p.age >= 24 && ov >= 55) strategyBonus += 120
    if (club.aiPersonality.competitiveWindow === 'rebuilding' && p.age <= 23) strategyBonus += 120
  }

  for (const pid of pkg.playersOut) {
    const p = context.players[pid]
    if (!p) continue
    const pos = p.position.primary as Position
    marketBonus -= Math.round((marketDemand[pos] ?? 0) * 70)
  }

  // Salary dump bias: clubs over cap strongly prefer cap relief trades.
  const salary = buildSalaryFlows(offer, context.players, clubId)
  const netSalary = salary.incoming.reduce((a, b) => a + b, 0) - salary.outgoing.reduce((a, b) => a + b, 0)
  if (context.settings.salaryCap && context.settings.realism.salaryDumpTrades) {
    const currentSpend = context.clubs[clubId]?.finances.currentSpend ?? 0
    const cap = context.settings.salaryCapAmount
    if (currentSpend > cap * 0.98 && netSalary < 0) {
      strategyBonus += Math.min(320, Math.round(Math.abs(netSalary) / 3500))
    }
  }

  // Player request leverage penalty when destination is nominated.
  if (
    context.settings.realism.reducedNominatedLeverage
    && offer.meta.isPlayerInitiated
    && offer.meta.requestedByPlayerId
    && offer.meta.nominatedClubIds
  ) {
    const requestedId = offer.meta.requestedByPlayerId
    const requestMove = offer.playerMoves.find((m) => m.playerId === requestedId)
    if (requestMove && requestMove.fromClubId === clubId && offer.meta.nominatedClubIds.includes(requestMove.toClubId)) {
      const leverageDiscount = Math.round(playerValue(
        requestedId,
        context.players,
        context.currentYear,
        undefined,
        context.demandByPlayerId,
      ) * 0.2)
      outValue -= leverageDiscount
    }
  }

  const pressureDiscount = Math.round(context.deadlinePressure * 160)

  let activityModifier = 0
  switch (club.aiPersonality.tradeActivity) {
    case 'active':
      activityModifier = 90
      break
    case 'moderate':
      activityModifier = 0
      break
    case 'passive':
      activityModifier = -120
      break
  }

  return inValue - outValue + needBonus + marketBonus + strategyBonus + pressureDiscount + activityModifier
}

function canAllAiClubsAccept(
  offer: TradeNegotiationOffer,
  context: OfferEvalContext,
  userClubId: string,
): { accepted: boolean; lowClubId?: string; lowScore?: number } {
  let worstClubId: string | undefined
  let worstScore = Number.POSITIVE_INFINITY

  for (const clubId of offer.clubsInvolved) {
    if (clubId === userClubId) continue
    const score = evaluateForClub(offer, clubId, context)
    if (score < worstScore) {
      worstScore = score
      worstClubId = clubId
    }
  }

  const threshold = -220 + Math.round(context.deadlinePressure * 120)
  if (worstScore < threshold) {
    return { accepted: false, lowClubId: worstClubId, lowScore: worstScore }
  }

  return { accepted: true }
}

function validOfferStructure(offer: TradeNegotiationOffer, players: Record<string, Player>): { ok: boolean; error?: string } {
  if (offer.clubsInvolved.length < 2) {
    return { ok: false, error: 'Trade requires at least two clubs.' }
  }
  if (offer.playerMoves.length === 0 && offer.pickMoves.length === 0) {
    return { ok: false, error: 'Trade contains no assets.' }
  }

  for (const move of offer.playerMoves) {
    const p = players[move.playerId]
    if (!p) return { ok: false, error: `Unknown player ${move.playerId}.` }
    if (p.clubId !== move.fromClubId) {
      return { ok: false, error: `${p.firstName} ${p.lastName} is no longer at ${move.fromClubId}.` }
    }
  }

  return { ok: true }
}

function validateOfferCaps(
  offer: TradeNegotiationOffer,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
): { ok: boolean; error?: string } {
  if (!settings.salaryCap) return { ok: true }

  const allPlayers = Object.values(players)
  for (const clubId of offer.clubsInvolved) {
    const club = clubs[clubId]
    if (!club) continue
    const salary = buildSalaryFlows(offer, players, clubId)
    const cap = validateTradeCapImpact(
      allPlayers,
      clubId,
      salary.incoming,
      salary.outgoing,
      settings.salaryCapAmount,
      settings.realism.softCapSpending,
    )

    if (!cap.allowed) {
      return { ok: false, error: `${club.abbreviation}: ${cap.reason ?? 'salary cap failure'}` }
    }
  }

  return { ok: true }
}

function executePickMove(clubs: Record<string, Club>, move: TradePickMove): void {
  const fromClub = clubs[move.fromClubId]
  const toClub = clubs[move.toClubId]
  if (!fromClub || !toClub) return

  const key = `${move.pick.year}-${move.pick.round}-${move.pick.originalClubId}`
  const index = fromClub.draftPicks.findIndex(
    (p) => `${p.year}-${p.round}-${p.originalClubId}` === key,
  )
  if (index < 0) return

  const pick = fromClub.draftPicks[index]
  fromClub.draftPicks.splice(index, 1)
  toClub.draftPicks.push({
    ...pick,
    currentClubId: move.toClubId,
  })
}

export function executeTradeOffer(
  offer: TradeNegotiationOffer,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  currentDate: string,
): { updatedPlayers: Record<string, Player>; updatedClubs: Record<string, Club>; completedTrade: CompletedTrade; news: NewsItem } {
  const updatedPlayers: Record<string, Player> = {}
  for (const [pid, player] of Object.entries(players)) {
    updatedPlayers[pid] = { ...player }
  }

  const updatedClubs: Record<string, Club> = {}
  for (const [clubId, club] of Object.entries(clubs)) {
    updatedClubs[clubId] = {
      ...club,
      draftPicks: club.draftPicks.map((p) => ({ ...p })),
    }
  }

  for (const move of offer.playerMoves) {
    const p = updatedPlayers[move.playerId]
    if (!p) continue
    p.clubId = move.toClubId
    if (p.tradeRequest?.active) {
      p.tradeRequest = { ...p.tradeRequest, active: false }
    }
  }

  for (const move of offer.pickMoves) {
    executePickMove(updatedClubs, move)
  }

  const userClub = offer.clubsInvolved[0]
  const partner = offer.clubsInvolved.find((cid) => cid !== userClub) ?? userClub

  const playersToUser = offer.playerMoves.filter((m) => m.toClubId === userClub).map((m) => m.playerId)
  const playersFromUser = offer.playerMoves.filter((m) => m.fromClubId === userClub).map((m) => m.playerId)

  const completedTrade: CompletedTrade = {
    id: offer.id,
    date: currentDate,
    clubA: userClub,
    clubB: partner,
    playersToA: playersToUser,
    playersToB: playersFromUser,
    salaryRetainedByA: offer.salaryRetentions
      .filter((r) => r.retainingClubId === userClub)
      .reduce((sum, r) => sum + r.amount, 0),
    salaryRetainedByB: offer.salaryRetentions
      .filter((r) => r.retainingClubId === partner)
      .reduce((sum, r) => sum + r.amount, 0),
    clubsInvolved: [...offer.clubsInvolved],
    multiClubMoves: offer.playerMoves.map((m) => ({ ...m })),
  }

  const clubNames = offer.clubsInvolved.map((cid) => updatedClubs[cid]?.abbreviation ?? cid).join(' / ')
  const news: NewsItem = {
    id: crypto.randomUUID(),
    date: currentDate,
    headline: `Trade completed: ${clubNames}`,
    body: offer.message,
    category: 'trade',
    clubIds: [...offer.clubsInvolved],
    playerIds: offer.playerMoves.map((m) => m.playerId),
  }

  return { updatedPlayers, updatedClubs, completedTrade, news }
}

export function applyOfferDecision(
  offer: TradeNegotiationOffer,
  decision: 'accept' | 'reject',
): TradeNegotiationOffer {
  return {
    ...offer,
    status: decision === 'accept' ? 'accepted' : 'rejected',
  }
}

export function proposeUserTrade(
  playerClubId: string,
  partnerClubId: string,
  sendPlayerIds: string[],
  receivePlayerIds: string[],
  currentDate: string,
  rng: SeededRNG,
): TradeNegotiationOffer {
  const threadId = id('thread', rng)
  const offerId = id('offer', rng)

  const playerMoves: TradePlayerMove[] = [
    ...sendPlayerIds.map((pid) => ({ playerId: pid, fromClubId: playerClubId, toClubId: partnerClubId })),
    ...receivePlayerIds.map((pid) => ({ playerId: pid, fromClubId: partnerClubId, toClubId: playerClubId })),
  ]

  return {
    id: offerId,
    threadId,
    createdAt: currentDate,
    expiresAt: null,
    initiatedBy: 'user',
    status: 'pending-user',
    clubsInvolved: [playerClubId, partnerClubId],
    proposingClubId: playerClubId,
    message: 'User-submitted offer.',
    playerMoves,
    pickMoves: [],
    salaryRetentions: [],
    meta: {
      deadlinePressure: 0,
      marketDemandScore: 0,
      isSalaryDump: false,
      isPlayerInitiated: false,
    },
  }
}

function findExpendablePlayer(
  roster: Player[],
  rng: SeededRNG,
  preferHighSalary: boolean,
): Player | null {
  if (roster.length === 0) return null

  const scored = roster
    .filter((p) => !p.isRookie && p.contract.yearsRemaining > 0)
    .map((p) => {
      const ov = overallOf(p)
      const agePenalty = p.age > 29 ? (p.age - 29) * 4 : 0
      const capWeight = preferHighSalary ? (p.contract.aav / 100_000) : 0
      return { player: p, score: ov - agePenalty - capWeight }
    })
    .sort((a, b) => a.score - b.score)

  if (scored.length === 0) return null
  const topSlice = scored.slice(0, Math.min(6, scored.length)).map((x) => x.player)
  return rng.pick(topSlice)
}

function findTargetPlayer(
  roster: Player[],
  needs: Set<Position>,
  window: Club['aiPersonality']['competitiveWindow'],
  rng: SeededRNG,
  identity?: TacticalIdentity,
): Player | null {
  const identityRoles = identity ? getTacticalTradePreferences(identity).preferredPlayerRoles : []
  const candidates = roster
    .filter((p) => !p.isRookie)
    .map((p) => {
      let score = overallOf(p)
      if (needs.has(p.position.primary as Position)) score += 16
      if (window === 'win-now' && p.age >= 24 && p.age <= 30) score += 12
      if (window === 'rebuilding' && p.age <= 23) score += 12
      if (window === 'rebuilding' && p.age > 29) score -= 10
      if (identityRoles.includes(p.preferredRole)) score += 8
      return { player: p, score }
    })
    .sort((a, b) => b.score - a.score)

  if (candidates.length === 0) return null
  return rng.pick(candidates.slice(0, Math.min(8, candidates.length)).map((x) => x.player))
}

function generateTwoClubOffer(
  userClubId: string,
  aiClubId: string,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
  currentDate: string,
  currentYear: number,
  rng: SeededRNG,
  deadlinePressure: number,
  demandByPlayerId?: Record<string, number>,
  targetPlayerId?: string,
): TradeNegotiationOffer | null {
  const aiClub = clubs[aiClubId]
  if (!aiClub) return null

  const userRoster = getClubRoster(players, userClubId)
  const aiRoster = getClubRoster(players, aiClubId)
  if (userRoster.length === 0 || aiRoster.length === 0) return null

  const aiNeeds = getPositionalNeeds(players, aiClubId)
  const userNeeds = getPositionalNeeds(players, userClubId)

  const overCap = settings.salaryCap
    ? (aiClub.finances.currentSpend > settings.salaryCapAmount * 0.98)
    : false

  const salaryDumpMode = settings.realism.salaryDumpTrades && overCap && rng.chance(0.45)

  const outgoing = findExpendablePlayer(aiRoster, rng, salaryDumpMode)
  const incoming = targetPlayerId
    ? (players[targetPlayerId] ?? findTargetPlayer(userRoster, aiNeeds, aiClub.aiPersonality.competitiveWindow, rng, aiClub.tacticalIdentity))
    : findTargetPlayer(
        userRoster,
        aiNeeds,
        aiClub.aiPersonality.competitiveWindow,
        rng,
        aiClub.tacticalIdentity,
      )

  if (!outgoing || !incoming) return null

  const offerId = id('offer', rng)
  const threadId = id('thread', rng)

  const salaryRetentions: TradeSalaryRetention[] = []
  if (salaryDumpMode) {
    const retain = Math.round((outgoing.contract.aav * (0.15 + rng.nextFloat(0, 0.2))) / 10_000) * 10_000
    if (retain > 0) {
      salaryRetentions.push({
        playerId: outgoing.id,
        retainingClubId: aiClubId,
        receivingClubId: userClubId,
        amount: retain,
      })
    }
  }

  const offer: TradeNegotiationOffer = {
    id: offerId,
    threadId,
    createdAt: currentDate,
    expiresAt: null,
    initiatedBy: 'ai',
    status: 'pending-user',
    clubsInvolved: [userClubId, aiClubId],
    proposingClubId: aiClubId,
    message: `${aiClub.abbreviation} propose ${outgoing.firstName} ${outgoing.lastName} for ${incoming.firstName} ${incoming.lastName}.`,
    playerMoves: [
      { playerId: outgoing.id, fromClubId: aiClubId, toClubId: userClubId },
      { playerId: incoming.id, fromClubId: userClubId, toClubId: aiClubId },
    ],
    pickMoves: [],
    salaryRetentions,
    meta: {
      deadlinePressure,
      marketDemandScore: computeMarketDemand(players, clubs)[incoming.position.primary as Position] ?? 0,
      isSalaryDump: salaryDumpMode,
      isPlayerInitiated: false,
    },
  }

  const context: OfferEvalContext = {
    players,
    clubs,
    settings,
    currentYear,
    deadlinePressure,
    demandByPlayerId,
  }

  const aiEval = evaluateForClub(offer, aiClubId, context)
  const userEval = evaluateForClub(offer, userClubId, context)
  if (aiEval < -200 || userEval < -450) return null

  // If user is over cap, prefer cap-saving incoming amount.
  if (settings.salaryCap) {
    const salary = buildSalaryFlows(offer, players, userClubId)
    const cap = validateTradeCapImpact(
      Object.values(players),
      userClubId,
      salary.incoming,
      salary.outgoing,
      settings.salaryCapAmount,
      settings.realism.softCapSpending,
    )
    if (!cap.allowed) return null
  }

  if (userNeeds.has(outgoing.position.primary as Position)) {
    offer.message += ` They believe ${outgoing.position.primary} depth matches your list need.`
  }

  return offer
}

function generateThreeClubOffer(
  userClubId: string,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
  currentDate: string,
  currentYear: number,
  rng: SeededRNG,
  deadlinePressure: number,
  demandByPlayerId?: Record<string, number>,
): TradeNegotiationOffer | null {
  const aiClubIds = Object.keys(clubs).filter((id) => id !== userClubId)
  if (aiClubIds.length < 2) return null

  const shuffled = rng.shuffle(aiClubIds)
  const clubAId = shuffled[0]
  const clubBId = shuffled[1]

  const rosterUser = getClubRoster(players, userClubId)
  const rosterA = getClubRoster(players, clubAId)
  const rosterB = getClubRoster(players, clubBId)
  if (rosterUser.length === 0 || rosterA.length === 0 || rosterB.length === 0) return null

  const userNeeds = getPositionalNeeds(players, userClubId)
  const clubANeeds = getPositionalNeeds(players, clubAId)

  const userOut = findTargetPlayer(rosterUser, clubANeeds, clubs[clubAId].aiPersonality.competitiveWindow, rng, clubs[clubAId].tacticalIdentity)
  const aOut = findExpendablePlayer(rosterA, rng, false)
  const bOut = findTargetPlayer(rosterB, userNeeds, clubs[userClubId].aiPersonality.competitiveWindow, rng, clubs[userClubId].tacticalIdentity)

  if (!userOut || !aOut || !bOut) return null

  const offer: TradeNegotiationOffer = {
    id: id('offer', rng),
    threadId: id('thread', rng),
    createdAt: currentDate,
    expiresAt: null,
    initiatedBy: 'ai',
    status: 'pending-user',
    clubsInvolved: [userClubId, clubAId, clubBId],
    proposingClubId: clubAId,
    message: `Three-club proposal: ${clubs[clubAId].abbreviation}, ${clubs[clubBId].abbreviation}, and your club cycle talent to fill list needs before deadline.`,
    playerMoves: [
      { playerId: userOut.id, fromClubId: userClubId, toClubId: clubAId },
      { playerId: aOut.id, fromClubId: clubAId, toClubId: clubBId },
      { playerId: bOut.id, fromClubId: clubBId, toClubId: userClubId },
    ],
    pickMoves: [],
    salaryRetentions: [],
    meta: {
      deadlinePressure,
      marketDemandScore: 0,
      isSalaryDump: false,
      isPlayerInitiated: false,
    },
  }

  const context: OfferEvalContext = {
    players,
    clubs,
    settings,
    currentYear,
    deadlinePressure,
    demandByPlayerId,
  }

  const evalCheck = canAllAiClubsAccept(offer, context, userClubId)
  if (!evalCheck.accepted) return null
  return offer
}

export function generatePlayerTradeRequests(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
  currentDate: string,
  playerClubId: string,
  rng: SeededRNG,
  ladder?: LadderEntry[],
): { updatedPlayers: Record<string, Player>; news: NewsItem[] } {
  if (!settings.realism.tradeRequests) {
    return { updatedPlayers: players, news: [] }
  }

  const updatedPlayers: Record<string, Player> = {}
  for (const [pid, p] of Object.entries(players)) {
    updatedPlayers[pid] = { ...p }
  }

  const news: NewsItem[] = []
  const clubsList = Object.keys(clubs)
  const teamCount = clubsList.length

  for (const p of Object.values(updatedPlayers)) {
    if (!p.clubId || p.clubId === 'retired') continue
    if (p.tradeRequest?.active) continue
    if (p.contract.yearsRemaining <= 0) continue

    const isUserPlayer = p.clubId === playerClubId

    // Archetype-driven thresholds and reasons
    const clubLadderPos = ladder
      ? ladder.findIndex((e) => e.clubId === p.clubId) + 1
      : teamCount // If no ladder, assume worst position (conservative)
    const isHomeState = p.homeState ? getClubState(p.clubId) === p.homeState : true

    const archetypeParams = p.agentArchetype
      ? getArchetypeTradeRequestParams(p.agentArchetype, p, clubLadderPos, teamCount, isHomeState)
      : null

    // Role frustration trade params (stacks — use whichever has higher moraleThreshold)
    const currentRoundNum = ladder?.[0]?.played ?? 0
    const roleParams = getRoleFrustrationTradeParams(p, currentRoundNum)
    let bestParams = archetypeParams
    if (roleParams && (!bestParams || roleParams.moraleThreshold > bestParams.moraleThreshold)) {
      bestParams = roleParams
    }

    // Default fallback (original logic)
    const moraleThreshold = bestParams?.moraleThreshold ?? 40
    const requestChance = bestParams?.chance ?? 0.06
    const requestReason = bestParams?.reason ?? 'unhappy'

    if (p.morale >= moraleThreshold) continue
    if (!rng.chance(requestChance)) continue

    // Determine nominated destinations based on archetype reason
    let nominated: string[]
    const destinationPool = clubsList.filter((cid) => cid !== p.clubId)
    if (requestReason === 'home-state' && p.homeState) {
      nominated = clubsList
        .filter((cid) => cid !== p.clubId && getClubState(cid) === p.homeState)
        .slice(0, 3)
    } else if (requestReason === 'contender' && ladder) {
      nominated = ladder
        .slice(0, 4)
        .map((e) => e.clubId)
        .filter((cid) => cid !== p.clubId)
        .slice(0, 3)
    } else if (requestReason === 'money') {
      // Greedy players nominate clubs likely to have cap space (random subset)
      nominated = settings.realism.nominatedTradeDestinations
        ? rng.shuffle(destinationPool).slice(0, Math.min(3, destinationPool.length))
        : []
    } else {
      nominated = settings.realism.nominatedTradeDestinations
        ? rng.shuffle(destinationPool).slice(0, Math.min(3, destinationPool.length))
        : []
    }

    p.tradeRequest = {
      active: true,
      requestedAt: currentDate,
      nominatedClubIds: nominated,
      reason: requestReason,
    }

    const currentClub = clubs[p.clubId]
    const reasonLabel = requestReason === 'contender' ? ' to pursue a premiership'
      : requestReason === 'home-state' ? ' to return to their home state'
      : requestReason === 'money' ? ' seeking a better deal'
      : requestReason === 'role' ? ' seeking more game time'
      : ''

    if (isUserPlayer) {
      // Specific news for user's team player requesting a trade
      news.push({
        id: crypto.randomUUID(),
        date: currentDate,
        headline: `${p.firstName} ${p.lastName} has requested a trade`,
        body: `Your player ${p.firstName} ${p.lastName} has formally requested a trade${reasonLabel}. Address their concerns or risk losing them.${
          nominated.length > 0
            ? ` Nominated destinations: ${nominated.map((cid) => clubs[cid]?.abbreviation ?? cid).join(', ')}.`
            : ''
        }`,
        category: 'trade',
        clubIds: [p.clubId, ...nominated],
        playerIds: [p.id],
      })
    } else {
      const headline = `${p.firstName} ${p.lastName} requests a trade`
      const body = nominated.length > 0
        ? `${p.firstName} ${p.lastName} has requested a trade from ${currentClub?.abbreviation ?? p.clubId}${reasonLabel} and nominated ${nominated.map((cid) => clubs[cid]?.abbreviation ?? cid).join(', ')} as preferred destinations.`
        : `${p.firstName} ${p.lastName} has requested a trade from ${currentClub?.abbreviation ?? p.clubId}${reasonLabel}.`

      news.push({
        id: crypto.randomUUID(),
        date: currentDate,
        headline,
        body,
        category: 'trade',
        clubIds: [p.clubId, ...nominated],
        playerIds: [p.id],
      })
    }
  }

  return { updatedPlayers, news }
}

export function generateTradeInboxOffers(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
  playerClubId: string,
  currentDate: string,
  currentYear: number,
  existingInbox: TradeInboxItem[],
  rng: SeededRNG,
  demandByPlayerId?: Record<string, number>,
): TradeInboxItem[] {
  const pendingCount = existingInbox.filter((i) => i.offer.status === 'pending-user').length
  if (pendingCount >= 6) return []

  const deadlineDate = getTradeDeadlineDate(currentYear)
  const deadlinePressure = getDeadlinePressure(currentDate, deadlineDate)

  const maxOffers = deadlinePressure >= 0.7 ? 3 : 2
  const offers: TradeInboxItem[] = []

  const aiClubIds = rng.shuffle(Object.keys(clubs).filter((cid) => cid !== playerClubId))

  for (const aiClubId of aiClubIds) {
    if (offers.length >= maxOffers) break
    if (!rng.chance(0.33 + deadlinePressure * 0.2)) continue

    let offer: TradeNegotiationOffer | null = null
    const makeThreeClub = rng.chance(0.2 + deadlinePressure * 0.1)
    if (makeThreeClub) {
      offer = generateThreeClubOffer(
        playerClubId,
        players,
        clubs,
        settings,
        currentDate,
        currentYear,
        rng,
        deadlinePressure,
        demandByPlayerId,
      )
    }

    if (!offer) {
      offer = generateTwoClubOffer(
        playerClubId,
        aiClubId,
        players,
        clubs,
        settings,
        currentDate,
        currentYear,
        rng,
        deadlinePressure,
        demandByPlayerId,
      )
    }

    if (!offer) continue

    const expiryDays = deadlinePressure >= 0.85 ? 1 : deadlinePressure >= 0.6 ? 2 : 4
    offer.expiresAt = new Date(Date.parse(`${currentDate}T00:00:00Z`) + expiryDays * 86400000)
      .toISOString()
      .slice(0, 10)

    offers.push({
      id: id('inbox', rng),
      offer,
      read: false,
    })
  }

  return offers
}

function generateAiCounterOffer(
  baseOffer: TradeNegotiationOffer,
  userClubId: string,
  players: Record<string, Player>,
  rng: SeededRNG,
  currentDate: string,
): TradeNegotiationOffer | null {
  if (baseOffer.clubsInvolved.length !== 2) return null

  const partnerClubId = baseOffer.clubsInvolved.find((cid) => cid !== userClubId)
  if (!partnerClubId) return null

  const alreadyToUser = new Set(baseOffer.playerMoves.filter((m) => m.toClubId === userClubId).map((m) => m.playerId))
  const partnerRoster = getClubRoster(players, partnerClubId)
  const sweetener = partnerRoster
    .filter((p) => !alreadyToUser.has(p.id) && !p.isRookie)
    .sort((a, b) => playerValue(a.id, players, new Date().getFullYear()) - playerValue(b.id, players, new Date().getFullYear()))
    .slice(0, 5)

  if (sweetener.length === 0) return null
  const extra = rng.pick(sweetener)

  return {
    ...baseOffer,
    id: id('offer', rng),
    createdAt: currentDate,
    status: 'pending-user',
    initiatedBy: 'ai',
    proposingClubId: partnerClubId,
    playerMoves: [
      ...baseOffer.playerMoves,
      { playerId: extra.id, fromClubId: partnerClubId, toClubId: userClubId },
    ],
    message: `${clubsLabel(baseOffer.clubsInvolved)} counter with an extra sweetener: ${extra.firstName} ${extra.lastName}.`,
  }
}

function clubsLabel(clubIds: string[]): string {
  return clubIds.join(' / ')
}

export function counterByUser(
  offer: TradeNegotiationOffer,
  playerClubId: string,
  players: Record<string, Player>,
  rng: SeededRNG,
  currentDate: string,
): TradeNegotiationOffer | null {
  if (offer.clubsInvolved.length !== 2) return null
  const partnerClubId = offer.clubsInvolved.find((cid) => cid !== playerClubId)
  if (!partnerClubId) return null

  const alreadyToUser = new Set(offer.playerMoves.filter((m) => m.toClubId === playerClubId).map((m) => m.playerId))
  const partnerRoster = getClubRoster(players, partnerClubId)
  const options = partnerRoster
    .filter((p) => !alreadyToUser.has(p.id) && !p.isRookie)
    .sort((a, b) => playerValue(a.id, players, new Date().getFullYear()) - playerValue(b.id, players, new Date().getFullYear()))

  if (options.length === 0) return null

  const ask = rng.pick(options.slice(0, Math.min(4, options.length)))

  return {
    ...offer,
    id: id('offer', rng),
    createdAt: currentDate,
    initiatedBy: 'user',
    status: 'pending-user',
    proposingClubId: playerClubId,
    playerMoves: [...offer.playerMoves, { playerId: ask.id, fromClubId: partnerClubId, toClubId: playerClubId }],
    message: `Counter from user: include ${ask.firstName} ${ask.lastName} and we can move forward.`,
  }
}

export function evaluateIncomingUserOffer(
  offer: TradeNegotiationOffer,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
  currentYear: number,
  currentDate: string,
  userClubId: string,
  rng: SeededRNG,
  demandByPlayerId?: Record<string, number>,
): { accepted: boolean; aiCounter?: TradeNegotiationOffer; reason?: string } {
  const deadlinePressure = getDeadlinePressure(currentDate, getTradeDeadlineDate(currentYear))

  const valid = validOfferStructure(offer, players)
  if (!valid.ok) {
    return { accepted: false, reason: valid.error }
  }

  const cap = validateOfferCaps(offer, players, clubs, settings)
  if (!cap.ok) {
    return { accepted: false, reason: cap.error }
  }

  const context: OfferEvalContext = {
    players,
    clubs,
    settings,
    currentYear,
    deadlinePressure,
    demandByPlayerId,
  }

  const aiCheck = canAllAiClubsAccept(offer, context, userClubId)
  if (aiCheck.accepted) {
    return { accepted: true }
  }

  const counter = generateAiCounterOffer(offer, userClubId, players, rng, currentDate)
  if (counter) {
    const counterCap = validateOfferCaps(counter, players, clubs, settings)
    if (counterCap.ok) {
      return {
        accepted: false,
        aiCounter: counter,
        reason: 'AI clubs rejected the valuation and returned a counter-proposal.',
      }
    }
  }

  return {
    accepted: false,
    reason: 'AI clubs rejected the counter as too expensive.',
  }
}

export function expireTradeInboxItems(items: TradeInboxItem[], currentDate: string): TradeInboxItem[] {
  return items.map((item) => {
    if (!item.offer.expiresAt) return item
    if (item.offer.status !== 'pending-user') return item
    if (item.offer.expiresAt < currentDate) {
      return {
        ...item,
        offer: {
          ...item.offer,
          status: 'expired',
        },
      }
    }
    return item
  })
}

export function validateTradeOfferForUser(
  offer: TradeNegotiationOffer,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
): { ok: boolean; error?: string } {
  const valid = validOfferStructure(offer, players)
  if (!valid.ok) return { ok: false, error: valid.error }

  const cap = validateOfferCaps(offer, players, clubs, settings)
  if (!cap.ok) return { ok: false, error: cap.error }

  return { ok: true }
}

export function initTradeBlockState(): TradeBlockState {
  return {
    listings: {},
    enquiries: [],
  }
}

export function setPlayerTradeBlockListing(
  tradeBlock: TradeBlockState,
  playerId: string,
  clubId: string,
  currentDate: string,
  availability: TradeBlockListing['availability'],
): TradeBlockState {
  const existing = tradeBlock.listings[playerId]
  return {
    listings: {
      ...tradeBlock.listings,
      [playerId]: {
        playerId,
        clubId,
        listedAt: existing?.listedAt ?? currentDate,
        active: true,
        availability,
        demandScore: existing?.demandScore ?? 0,
        enquiryCount: existing?.enquiryCount ?? 0,
        lastDemandUpdate: currentDate,
      },
    },
    enquiries: tradeBlock.enquiries,
  }
}

export function removePlayerTradeBlockListing(
  tradeBlock: TradeBlockState,
  playerId: string,
): TradeBlockState {
  const listings = { ...tradeBlock.listings }
  delete listings[playerId]
  return { ...tradeBlock, listings }
}

export function getDemandByPlayerFromTradeBlock(tradeBlock: TradeBlockState): Record<string, number> {
  const out: Record<string, number> = {}
  for (const listing of Object.values(tradeBlock.listings)) {
    if (!listing.active) continue
    out[listing.playerId] = listing.demandScore
  }
  return out
}

export function getDemandAdjustedPlayerTradeValue(
  playerId: string,
  players: Record<string, Player>,
  currentYear: number,
  tradeBlock: TradeBlockState,
  clubId?: string,
): { baseValue: number; demandScore: number; adjustedValue: number } {
  const baseValue = playerValue(playerId, players, currentYear, clubId)
  const demandScore = tradeBlock.listings[playerId]?.demandScore ?? 0
  return {
    baseValue,
    demandScore,
    adjustedValue: getDemandAdjustedValue(baseValue, demandScore),
  }
}

export function generateTradeBlockEnquiries(
  tradeBlock: TradeBlockState,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  userClubId: string,
  currentDate: string,
  rng: SeededRNG,
): { tradeBlock: TradeBlockState; news: NewsItem[] } {
  const listings: Record<string, TradeBlockListing> = {}
  for (const [playerId, listing] of Object.entries(tradeBlock.listings)) {
    listings[playerId] = { ...listing }
  }
  const enquiries: TradeEnquiry[] = [...tradeBlock.enquiries]
  const news: NewsItem[] = []

  for (const listing of Object.values(listings)) {
    if (!listing.active) continue
    const player = players[listing.playerId]
    if (!player || player.clubId !== listing.clubId) continue
    if (!rng.chance(0.22)) {
      listing.demandScore = Math.max(-1, listing.demandScore - 0.03)
      continue
    }

    const clubsPool = Object.keys(clubs).filter((cid) => cid !== listing.clubId)
    if (clubsPool.length === 0) continue
    const fromClubId = rng.pick(clubsPool)

    let interest: TradeEnquiry['interest'] = 'low'
    const roll = rng.next()
    if (roll > 0.72) interest = 'high'
    else if (roll > 0.36) interest = 'medium'

    const bump = interest === 'high' ? 0.6 : interest === 'medium' ? 0.35 : 0.18
    listing.demandScore = clamp(listing.demandScore + bump, -1, 4)
    listing.enquiryCount += 1
    listing.lastDemandUpdate = currentDate

    const enquiry: TradeEnquiry = {
      id: id('enquiry', rng),
      playerId: listing.playerId,
      fromClubId,
      toClubId: listing.clubId,
      date: currentDate,
      interest,
      note: `${clubs[fromClubId]?.abbreviation ?? fromClubId} made a ${interest} enquiry about ${player.firstName} ${player.lastName}.`,
    }
    enquiries.push(enquiry)

    if (listing.clubId === userClubId) {
      news.push({
        id: crypto.randomUUID(),
        date: currentDate,
        headline: `Trade enquiry for ${player.firstName} ${player.lastName}`,
        body: enquiry.note,
        category: 'trade',
        clubIds: [listing.clubId, fromClubId],
        playerIds: [player.id],
      })
    }
  }

  return {
    tradeBlock: { listings, enquiries },
    news,
  }
}

export function validateTradeConsent(
  offer: TradeNegotiationOffer,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
  rng: SeededRNG,
): { ok: boolean; reason?: string } {
  if (!settings.realism.playersRefuseTrades) return { ok: true }

  for (const move of offer.playerMoves) {
    const player = players[move.playerId]
    if (!player) continue
    if (move.fromClubId === move.toClubId) continue

    const request = player.tradeRequest
    if (request?.active && request.nominatedClubIds.includes(move.toClubId)) {
      continue
    }

    const clauses = player.contract.clauses ?? []
    const hasNoTrade = clauses.some((c) => c.type === 'no-trade')
    if (hasNoTrade) {
      return {
        ok: false,
        reason: `${player.firstName} ${player.lastName} holds a no-trade clause.`,
      }
    }

    const limitedTrade = clauses.find((c) => c.type === 'limited-trade')
    if (limitedTrade?.vetoClubIds?.includes(move.toClubId)) {
      return {
        ok: false,
        reason: `${player.firstName} ${player.lastName} blocked a move to ${clubs[move.toClubId]?.abbreviation ?? move.toClubId} (limited no-trade clause).`,
      }
    }
    const homeStateOnly = clauses.some((c) => c.type === 'home-state')
    if (homeStateOnly && player.homeState && getClubState(move.toClubId) !== player.homeState) {
      return {
        ok: false,
        reason: `${player.firstName} ${player.lastName} can only be traded to their home state under contract terms.`,
      }
    }
    const contenderOnly = clauses.some((c) => c.type === 'contender-only')
    if (contenderOnly && clubs[move.toClubId]?.aiPersonality.competitiveWindow !== 'win-now') {
      return {
        ok: false,
        reason: `${player.firstName} ${player.lastName} can only be moved to a contender under contract terms.`,
      }
    }

    const loyalty = player.personality.loyalty / 100
    const moraleFactor = player.morale >= 65 ? 0.18 : player.morale <= 45 ? -0.12 : 0
    const contenderPull = clubs[move.toClubId]?.aiPersonality.competitiveWindow === 'win-now' ? -0.06 : 0
    const requestDiscount = request?.active ? -0.2 : 0
    const toClubIsContender = clubs[move.toClubId]?.aiPersonality.competitiveWindow === 'win-now'
    const toClubIsHomeState = player.homeState ? getClubState(move.toClubId) === player.homeState : false
    const archetypeMod = player.agentArchetype
      ? getArchetypeTradeConsentModifier(player.agentArchetype, toClubIsContender, toClubIsHomeState)
      : 0
    const refuseChance = clamp(0.08 + loyalty * 0.34 + moraleFactor + contenderPull + requestDiscount + archetypeMod, 0, 0.72)

    if (rng.chance(refuseChance)) {
      return {
        ok: false,
        reason: `${player.firstName} ${player.lastName} refused a trade to ${clubs[move.toClubId]?.abbreviation ?? move.toClubId}.`,
      }
    }
  }

  return { ok: true }
}

// ── Trade Drama Engine ────────────────────────────────────────────────────────

export function initTradeDramaState(): TradeDramaState {
  return { events: [], biddingWars: [] }
}

/**
 * Generate an unsolicited offer from an AI club targeting one of the user's
 * high-value players.  Returns null if nothing interesting can be built.
 */
function generateTargetedInboundOffer(
  userClubId: string,
  targetPlayerId: string,
  aiClubId: string,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
  currentDate: string,
  currentYear: number,
  rng: SeededRNG,
  deadlinePressure: number,
  demandByPlayerId?: Record<string, number>,
): TradeNegotiationOffer | null {
  return generateTwoClubOffer(
    userClubId,
    aiClubId,
    players,
    clubs,
    settings,
    currentDate,
    currentYear,
    rng,
    deadlinePressure,
    demandByPlayerId,
    targetPlayerId,
  )
}

/**
 * Improve an existing pending offer slightly — better pick or swap a player
 * for something of higher value.  Returns the mutated copy.
 */
function improveOffer(
  base: TradeNegotiationOffer,
  players: Record<string, Player>,
  rng: SeededRNG,
): TradeNegotiationOffer {
  const improved = structuredClone(base)
  improved.id = base.id // keep same id so we can patch-in-place
  improved.meta = { ...base.meta, deadlinePressure: clamp(base.meta.deadlinePressure + 0.1, 0, 1) }

  // Try to add a future pick as a sweetener
  const aiClubId = base.proposingClubId
  const aiHasRoster = Object.values(players).some((p) => p.clubId === aiClubId)
  if (aiHasRoster && !improved.pickMoves.some((pm) => pm.pick.year > 2025)) {
    const sweetenerPick: TradePickMove = {
      pick: { round: 3, year: 2026, originalClubId: aiClubId, currentClubId: aiClubId },
      fromClubId: aiClubId,
      toClubId: base.clubsInvolved.find((c) => c !== aiClubId) ?? aiClubId,
    }
    improved.pickMoves = [...improved.pickMoves, sweetenerPick]
    improved.message = improved.message.replace(/\.$/, '') + ', sweetened with a future 3rd.'
  }

  return improved
}

interface TickDramaResult {
  /** The inbox with any offer modifications (improved / withdrawn) applied */
  updatedInbox: TradeInboxItem[]
  /** Brand-new items generated by the drama tick (targeted inbound, rival bids) */
  newInboxItems: TradeInboxItem[]
  updatedDrama: TradeDramaState
}

/**
 * Main drama tick called once per half-day advance during the trade period.
 * - Detects / updates bidding wars
 * - Escalates offers that are nearing expiry to pressure the user
 * - Occasionally generates a targeted rival bid for a user-star player
 * - Records events in the drama timeline
 */
export function tickTradeDrama(
  drama: TradeDramaState,
  inbox: TradeInboxItem[],
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
  userClubId: string,
  currentDate: string,
  currentYear: number,
  rng: SeededRNG,
  demandByPlayerId?: Record<string, number>,
): TickDramaResult {
  const deadlineDate = getTradeDeadlineDate(currentYear)
  const deadlinePressure = getDeadlinePressure(currentDate, deadlineDate)
  const daysLeft = daysUntil(currentDate, deadlineDate)

  const newEvents: TradeInboxEvent[] = []
  const newInboxItems: TradeInboxItem[] = []
  let updatedInbox = inbox.map((i) => ({ ...i })) // shallow clone each item

  // ── 1. Bidding-war detection ────────────────────────────────────────────────
  const userPendingOffers = updatedInbox.filter(
    (i) => i.offer.status === 'pending-user' && i.offer.clubsInvolved.includes(userClubId),
  )

  const playerBidderMap = new Map<string, string[]>()
  for (const item of userPendingOffers) {
    const userPlayers = item.offer.playerMoves
      .filter((m) => m.fromClubId === userClubId)
      .map((m) => m.playerId)
    for (const pid of userPlayers) {
      if (!playerBidderMap.has(pid)) playerBidderMap.set(pid, [])
      playerBidderMap.get(pid)!.push(item.offer.proposingClubId)
    }
  }

  const updatedBiddingWars: BiddingWarCluster[] = []
  for (const [playerId, clubIds] of playerBidderMap) {
    if (clubIds.length < 2) continue
    const unique = [...new Set(clubIds)]
    const existing = drama.biddingWars.find((bw) => bw.playerId === playerId)
    const intensity: BiddingWarCluster['intensity'] =
      unique.length >= 4 ? 'hot' : unique.length >= 3 ? 'moderate' : 'mild'

    if (!existing) {
      const player = players[playerId]
      const clubNames = unique
        .slice(0, 3)
        .map((cid) => clubs[cid]?.abbreviation ?? cid)
        .join(', ')
      newEvents.push({
        id: id('ev', rng),
        date: currentDate,
        type: 'rival-bid',
        playerId,
        message: `Multiple clubs (${clubNames}) are now competing for ${player?.firstName ?? ''} ${player?.lastName ?? ''}.`,
        leverageShift: 'seller',
        demandDelta: unique.length,
      })
    }

    updatedBiddingWars.push({
      playerId,
      clubIds: unique,
      startedAt: existing?.startedAt ?? currentDate,
      intensity,
    })
  }

  // Carry forward bidding wars for players not in current batch
  for (const bw of drama.biddingWars) {
    if (!updatedBiddingWars.find((u) => u.playerId === bw.playerId)) {
      const stillActive = userPendingOffers.some((i) =>
        i.offer.playerMoves.some((m) => m.fromClubId === userClubId && m.playerId === bw.playerId),
      )
      if (stillActive) updatedBiddingWars.push(bw)
    }
  }

  // ── 2. Deadline pressure events ────────────────────────────────────────────
  if (daysLeft <= 3 && rng.chance(0.5)) {
    const pendingCount = userPendingOffers.length
    if (pendingCount > 0) {
      newEvents.push({
        id: id('ev', rng),
        date: currentDate,
        type: 'deadline-pressure',
        message: `Trade deadline is ${daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`}. ${pendingCount} offer${pendingCount !== 1 ? 's' : ''} still pending.`,
        leverageShift: 'buyer',
      })
    }
  }

  // ── 3. Offer escalation — AI improves a stale offer ────────────────────────
  const staleOffers = userPendingOffers.filter((i) => {
    const age = daysUntil(i.offer.createdAt, currentDate)
    return age >= 3 && deadlinePressure >= 0.45
  })

  if (staleOffers.length > 0 && rng.chance(0.25 + deadlinePressure * 0.3)) {
    const target = rng.pick(staleOffers)
    const improved = improveOffer(target.offer, players, rng)
    updatedInbox = updatedInbox.map((i) =>
      i.offer.id === target.offer.id ? { ...i, offer: improved, read: false } : i,
    )
    newEvents.push({
      id: id('ev', rng),
      date: currentDate,
      type: 'offer-improved',
      offerId: target.offer.id,
      clubId: target.offer.proposingClubId,
      message: `${clubs[target.offer.proposingClubId]?.name ?? 'An AI club'} has sweetened their offer.`,
      leverageShift: 'seller',
    })
  }

  // ── 4. Targeted inbound — AI eyes a user star ──────────────────────────────
  const pendingTotal = userPendingOffers.length
  const inboundCap = deadlinePressure >= 0.7 ? 5 : 3
  if (pendingTotal < inboundCap && rng.chance(0.15 + deadlinePressure * 0.2)) {
    const activeTargetIds = new Set(
      userPendingOffers.flatMap((i) =>
        i.offer.playerMoves.filter((m) => m.fromClubId === userClubId).map((m) => m.playerId),
      ),
    )
    const roster = getClubRoster(players, userClubId)
    const starPool = roster
      .filter((p) => overallOf(p) >= 72 && !activeTargetIds.has(p.id))
      .sort((a, b) => overallOf(b) - overallOf(a))

    if (starPool.length > 0) {
      const target = starPool[0]
      const aiClubs = rng.shuffle(Object.keys(clubs).filter((c) => c !== userClubId))
      for (const aiClubId of aiClubs.slice(0, 3)) {
        const offer = generateTargetedInboundOffer(
          userClubId,
          target.id,
          aiClubId,
          players,
          clubs,
          settings,
          currentDate,
          currentYear,
          rng,
          deadlinePressure,
          demandByPlayerId,
        )
        if (!offer) continue
        const expiryDays = deadlinePressure >= 0.85 ? 1 : deadlinePressure >= 0.6 ? 2 : 4
        offer.expiresAt = new Date(Date.parse(`${currentDate}T00:00:00Z`) + expiryDays * 86400000)
          .toISOString()
          .slice(0, 10)
        newInboxItems.push({ id: id('inbox', rng), offer, read: false })
        newEvents.push({
          id: id('ev', rng),
          date: currentDate,
          type: 'new-offer',
          offerId: offer.id,
          playerId: target.id,
          clubId: aiClubId,
          message: `${clubs[aiClubId]?.name ?? aiClubId} has submitted an unsolicited offer targeting ${target.firstName} ${target.lastName}.`,
          leverageShift: 'neutral',
        })
        break // one per tick
      }
    }
  }

  // ── 5. Rival-withdrew — a bidding war club pulls out ───────────────────────
  for (const bw of updatedBiddingWars) {
    if (bw.intensity === 'hot' && rng.chance(0.1)) {
      const droppingClub = rng.pick(bw.clubIds)
      const player = players[bw.playerId]
      newEvents.push({
        id: id('ev', rng),
        date: currentDate,
        type: 'rival-withdrew',
        clubId: droppingClub,
        playerId: bw.playerId,
        message: `${clubs[droppingClub]?.name ?? droppingClub} has pulled out of negotiations for ${player?.firstName ?? ''} ${player?.lastName ?? ''}.`,
        leverageShift: 'buyer',
      })
    }
  }

  // Cap events log at 100
  const mergedEvents = [...drama.events, ...newEvents].slice(-100)

  return {
    updatedInbox,
    newInboxItems,
    updatedDrama: {
      events: mergedEvents,
      biddingWars: updatedBiddingWars,
    },
  }
}
