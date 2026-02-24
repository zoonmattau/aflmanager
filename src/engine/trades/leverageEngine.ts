import type { Club } from '@/types/club'
import type { Player } from '@/types/player'
import type { GameSettings, CompletedTrade } from '@/types/game'
import type { TradeBlockState, TradeNegotiationOffer } from '@/types/trade'
import type { SeededRNG } from '@/engine/core/rng'
import type {
  ClubLeverageState,
  ClubPublicStance,
  NegotiationSignalLevel,
} from '@/types/negotiation'
import { getTradeDeadlineDate, getDeadlinePressure } from '@/engine/trades/tradeNegotiationEngine'

const POSITIONS = ['BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF'] as const
const POSITION_COUNT = POSITIONS.length

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function overallOf(player: Player): number {
  const vals = Object.values(player.attributes)
  return vals.reduce((s, n) => s + n, 0) / vals.length
}

function genId(prefix: string, rng: SeededRNG): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = `${prefix}_`
  for (let i = 0; i < 10; i++) out += chars[rng.nextInt(0, chars.length - 1)]
  return out
}

export function computeClubLeverage(
  clubId: string,
  targetPlayerIds: string[],
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
  currentDate: string,
  tradeBlock: TradeBlockState,
): ClubLeverageState {
  const club = clubs[clubId]
  const deadlineDate = getTradeDeadlineDate(new Date(currentDate).getFullYear())
  const deadlinePressure = getDeadlinePressure(currentDate, deadlineDate)

  // Urgency: deadline + trade requests on target players + rebuilding + cap overage
  const targetSet = new Set(targetPlayerIds)
  const hasTradeRequest = targetPlayerIds.some((pid) => players[pid]?.tradeRequest?.active)
  const isRebuilding = club?.aiPersonality.competitiveWindow === 'rebuilding'
  const currentSpend = club?.finances.currentSpend ?? 0
  const salaryCapAmount = settings.salaryCapAmount
  const isOverCap = settings.salaryCap && currentSpend > salaryCapAmount * 1.0

  const urgencyScore = clamp(
    Math.round(
      deadlinePressure * 40
      + (hasTradeRequest ? 25 : 0)
      + (isRebuilding ? 15 : 0)
      + (isOverCap ? 20 : 0),
    ),
    0,
    100,
  )

  // Cap pressure
  const capPressureScore = settings.salaryCap
    ? clamp(Math.round(((currentSpend / salaryCapAmount) - 0.92) / 0.12 * 100), 0, 100)
    : 0

  // List need: count positions with < 3 players
  const positionCounts = new Map<string, number>()
  for (const p of Object.values(players)) {
    if (p.clubId !== clubId) continue
    const pos = p.position.primary
    positionCounts.set(pos, (positionCounts.get(pos) ?? 0) + 1)
  }
  let positionsInNeed = 0
  for (const pos of POSITIONS) {
    if ((positionCounts.get(pos) ?? 0) < 3) positionsInNeed++
  }
  const listNeedScore = clamp(Math.round((positionsInNeed / POSITION_COUNT) * 100), 0, 100)

  // Alternative suitors: clubs OTHER than this club that have enquired about target players
  const alternativeClubs = new Set(
    tradeBlock.enquiries
      .filter((e) => targetSet.has(e.playerId) && e.fromClubId !== clubId)
      .map((e) => e.fromClubId),
  )
  const alternativeCount = alternativeClubs.size

  // Public stance
  let publicStance: ClubPublicStance
  if (urgencyScore < 20) publicStance = 'not-selling'
  else if (urgencyScore < 40) publicStance = 'listening'
  else if (urgencyScore < 60) publicStance = 'open'
  else if (urgencyScore < 80) publicStance = 'eager'
  else publicStance = 'desperate'

  return {
    clubId,
    computedAt: currentDate,
    urgencyScore,
    listNeedScore,
    capPressureScore,
    alternativeCount,
    publicStance,
  }
}

export function getResponseDelayDays(
  leverage: ClubLeverageState,
  personality: Club['aiPersonality'],
  deadlinePressure: number,
  rng: SeededRNG,
): number {
  const base = 14 - Math.round(leverage.urgencyScore * 0.1)
  const activityAdj =
    personality.tradeActivity === 'active' ? -4
    : personality.tradeActivity === 'passive' ? 3
    : 0
  const nearDeadlineClamp = deadlinePressure > 0.7 ? 3 : 14
  const jitter = rng.nextInt(-2, 2)
  return clamp(base + activityAdj + jitter, 1, nearDeadlineClamp)
}

export function computeAiCounterOffer(
  currentOffer: TradeNegotiationOffer,
  evalScore: number,
  threshold: number,
  leverage: ClubLeverageState,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  _currentYear: number,
  rng: SeededRNG,
): TradeNegotiationOffer | null {
  if (currentOffer.clubsInvolved.length !== 2) return null

  const aiClubId = leverage.clubId
  const userClubId = currentOffer.clubsInvolved.find((id) => id !== aiClubId)
  if (!userClubId) return null

  // Too bad to counter
  if (evalScore < threshold - 500) return null

  const counterRange = Math.abs(threshold) * 0.15
  const spikeRange = Math.abs(threshold) * 0.35
  const isCloseEnough = evalScore >= threshold - counterRange
  const isSpikeRange = !isCloseEnough && evalScore >= threshold - spikeRange

  if (!isCloseEnough && !isSpikeRange) return null

  const alreadyFromUser = new Set(
    currentOffer.playerMoves.filter((m) => m.fromClubId === userClubId).map((m) => m.playerId),
  )

  const userRoster = Object.values(players)
    .filter((p) => p.clubId === userClubId && !alreadyFromUser.has(p.id) && !p.isRookie)
    .map((p) => ({ p, ov: overallOf(p) }))
    .sort((a, b) => a.ov - b.ov)

  if (userRoster.length === 0) return null

  let target: Player | null = null
  if (isCloseEnough) {
    // Mild: ask for low-value player (bottom third)
    const pool = userRoster.slice(0, Math.ceil(userRoster.length / 3))
    if (pool.length > 0) target = rng.pick(pool).p
  } else {
    // Spike: ask for medium-value player (middle third)
    const start = Math.floor(userRoster.length / 3)
    const end = Math.ceil(userRoster.length * 2 / 3)
    const pool = userRoster.slice(start, end)
    if (pool.length > 0) target = rng.pick(pool).p
  }

  if (!target) return null

  const aiClub = clubs[aiClubId]
  const abbr = aiClub?.abbreviation ?? aiClubId

  return {
    ...currentOffer,
    id: genId('offer', rng),
    createdAt: currentOffer.createdAt,
    status: 'pending-user',
    initiatedBy: 'ai',
    proposingClubId: aiClubId,
    playerMoves: [
      ...currentOffer.playerMoves,
      { playerId: target.id, fromClubId: userClubId, toClubId: aiClubId },
    ],
    message: isCloseEnough
      ? `${abbr} are interested but need a little more. Add ${target.firstName} ${target.lastName} to sweeten the deal.`
      : `${abbr} see potential here but require more value. Include ${target.firstName} ${target.lastName} to proceed.`,
  }
}

export function getTradeIntelLevel(tradeHistory: CompletedTrade[]): NegotiationSignalLevel {
  const count = tradeHistory.length
  if (count >= 10) return 3
  if (count >= 3) return 2
  return 1
}

export function fuzzSignalBar(trueScore: number, seed: number): number {
  const bar = Math.round((trueScore / 100) * 5)
  const noise = ((seed % 3) - 1) // -1, 0, or +1
  return clamp(bar + noise, 0, 5)
}

export function getStanceLabel(stance: ClubPublicStance): string {
  switch (stance) {
    case 'not-selling': return 'Not Selling'
    case 'listening': return 'Listening'
    case 'open': return 'Open to Offers'
    case 'eager': return 'Eager to Deal'
    case 'desperate': return 'Desperate to Move'
  }
}

export function getSignalColor(bars: number): string {
  if (bars <= 1) return 'text-red-500'
  if (bars === 2) return 'text-yellow-500'
  if (bars <= 4) return 'text-amber-500'
  return 'text-green-500'
}

export function generateTextDossier(
  leverage: ClubLeverageState,
  partnerClubName: string,
  targetPlayerNames: string[],
): string {
  const parts: string[] = []

  if (leverage.capPressureScore >= 60) {
    const overageK = Math.round((leverage.capPressureScore / 100) * 500)
    parts.push(`${partnerClubName} are sitting $${overageK}k over the soft cap`)
  } else if (leverage.capPressureScore >= 30) {
    parts.push(`${partnerClubName} are approaching their salary ceiling`)
  }

  if (leverage.listNeedScore >= 60) {
    parts.push('they have a glaring list shortage')
  } else if (leverage.listNeedScore >= 30) {
    parts.push('they have some positional needs')
  }

  if (leverage.alternativeCount >= 3) {
    const names = targetPlayerNames.slice(0, 2).join(' and ')
    parts.push(`multiple clubs have been linked to ${names || 'the target players'}`)
  } else if (leverage.alternativeCount >= 1) {
    parts.push('at least one other club has made enquiries')
  }

  if (leverage.urgencyScore >= 70) {
    parts.push('their window is closing fast')
  } else if (leverage.urgencyScore >= 40) {
    parts.push('they have some urgency to deal')
  }

  if (parts.length === 0) {
    return `${partnerClubName} appear patient and in no rush to trade.`
  }
  return parts.join('. ') + '.'
}
