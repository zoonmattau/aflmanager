import type { Player, PlayerPositionType, LineupSlot } from '@/types/player'
import type { Club } from '@/types/club'
import { getRoleFitMultiplierForSlot } from '@/engine/player/roles'
import { isPlayerSuspended } from '@/engine/players/availability'
import { getLineupSlots, SLOT_POSITION_COMPATIBILITY } from '@/engine/core/constants'
import { getPlayerEligiblePositionTypes } from '@/engine/player/positionEligibility'
import { canBeSelectedForAfl } from '@/engine/players/contracts'
import { getPlayerPositionRatings } from '@/engine/player/playerRating'

export type LineupAutofillStrategy =
  | 'best-available'
  | 'last-game'
  | 'youth-focus'
  | 'win-now'

export interface LineupAutofillOptions {
  interchangePlayers?: number
  club?: Club
  strategy?: LineupAutofillStrategy
  baseLineup?: Record<string, string> | null
  preserveAssignedSlots?: boolean
  continuityBias?: number // 0-1
}

/**
 * Ordered list describing which position types fill which slots, and in what
 * priority. We fill specialist roles first (ruck, centre, wings) before the
 * lines so that versatile players are not wasted on less critical positions.
 */
const FILL_ORDER: { posType: PlayerPositionType; slots: LineupSlot[] }[] = [
  { posType: 'RK', slots: ['RK'] },
  { posType: 'OM', slots: ['C'] },
  { posType: 'W', slots: ['LW', 'RW'] },
  { posType: 'FB', slots: ['FB'] },
  { posType: 'BP', slots: ['LBP', 'RBP'] },
  { posType: 'CHB', slots: ['CHB'] },
  { posType: 'HBF', slots: ['LHB', 'RHB'] },
  { posType: 'CHF', slots: ['CHF'] },
  { posType: 'HFF', slots: ['LHF', 'RHF'] },
  { posType: 'FF', slots: ['FF'] },
  { posType: 'FP', slots: ['LFP', 'RFP'] },
  { posType: 'IM', slots: ['RR', 'ROV'] },
]

function computeEffectiveRating(player: Player): number {
  const values: number[] = Object.values(player.attributes).filter(
    (v): v is number => typeof v === 'number',
  )
  values.sort((a, b) => b - a)
  const top10 = values.slice(0, 10)
  const baseOverall = top10.length > 0 ? top10.reduce((sum, v) => sum + v, 0) / top10.length : 0
  return baseOverall * (player.fitness / 100) * (0.7 + (player.form / 100) * 0.3)
}

function computeSuitability(
  player: Player,
  targetType: PlayerPositionType,
  slot: LineupSlot,
): number {
  const effectiveRating = computeEffectiveRating(player)
  const roleFit = getRoleFitMultiplierForSlot(player.preferredRole, slot)

  if (player.position.primary === targetType) return effectiveRating * roleFit

  const posRating = getPlayerPositionRatings(player)[targetType]
  if (posRating !== undefined) return effectiveRating * (posRating / 100) * roleFit

  if (player.position.secondary.includes(targetType)) return effectiveRating * 0.8 * roleFit

  return effectiveRating * 0.5 * roleFit
}

type BenchCategory = 'MID' | 'DEF' | 'FWD' | 'TALL' | 'UTIL'

function isPlayerEligibleForSlot(player: Player, slot: LineupSlot): boolean {
  const compat = SLOT_POSITION_COMPATIBILITY[slot] ?? []
  if (compat.length === 0) return true
  const eligible = new Set(getPlayerEligiblePositionTypes(player))
  return compat.some((pos) => eligible.has(pos))
}

function isTallPlayer(player: Player): boolean {
  return (
    player.height >= 194 ||
    player.position.primary === 'RK' ||
    player.position.primary === 'CHF' ||
    player.position.primary === 'FF' ||
    player.position.primary === 'CHB' ||
    player.position.primary === 'FB' ||
    player.preferredRole === 'key-forward' ||
    player.preferredRole === 'ruck'
  )
}

function classifyBenchCategories(player: Player): BenchCategory[] {
  const categories = new Set<BenchCategory>()
  const primary = player.position.primary

  if (primary === 'IM' || primary === 'OM' || primary === 'W') categories.add('MID')
  if (primary === 'BP' || primary === 'FB' || primary === 'HBF' || primary === 'CHB') categories.add('DEF')
  if (primary === 'HFF' || primary === 'CHF' || primary === 'FP' || primary === 'FF') categories.add('FWD')
  if (isTallPlayer(player)) categories.add('TALL')

  const versatile =
    player.preferredRole === 'utility' ||
    player.position.secondary.length >= 2 ||
    Object.keys(getPlayerPositionRatings(player)).length >= 4

  if (versatile) categories.add('UTIL')
  if (categories.size === 0) categories.add('UTIL')

  return [...categories]
}

function tallyRoleCounts(players: Player[]): { mids: number; defs: number; fwds: number; talls: number } {
  let mids = 0
  let defs = 0
  let fwds = 0
  let talls = 0
  for (const player of players) {
    const cats = classifyBenchCategories(player)
    if (cats.includes('MID')) mids++
    if (cats.includes('DEF')) defs++
    if (cats.includes('FWD')) fwds++
    if (cats.includes('TALL')) talls++
  }
  return { mids, defs, fwds, talls }
}

function buildBenchTargetOrder(
  interchangeCount: number,
  club: Club | undefined,
  eligiblePlayers: Player[],
): BenchCategory[] {
  if (interchangeCount <= 0) return []

  const baseOrder: BenchCategory[] = ['MID', 'MID', 'DEF', 'FWD', 'TALL']
  const extraPools: BenchCategory[] = []

  const tactical = club?.tacticalIdentity
  const gameplan = club?.gameplan
  const personality = club?.aiPersonality
  const counts = tallyRoleCounts(eligiblePlayers)
  const tallForwardBias =
    (gameplan?.forwardLine === 'hold' && gameplan?.offensiveStyle !== 'defensive') ||
    (counts.fwds >= 8 && counts.talls >= 4)

  switch (tactical) {
    case 'contested':
    case 'stoppage-focused':
      extraPools.push('MID', 'MID', 'TALL', 'DEF', 'FWD')
      break
    case 'defensive':
      extraPools.push('DEF', 'MID', 'TALL', 'DEF', 'FWD')
      break
    case 'corridor-heavy':
    case 'fast-movement':
      extraPools.push('FWD', 'MID', 'MID', 'TALL', 'DEF')
      break
    default:
      extraPools.push('MID', 'DEF', 'FWD', 'TALL')
      break
  }

  if (personality?.competitiveWindow === 'rebuilding') extraPools.unshift('UTIL')
  if (personality?.riskTolerance === 'conservative') {
    extraPools.unshift('DEF', 'TALL')
  } else if (personality?.riskTolerance === 'aggressive') {
    extraPools.unshift('MID', 'FWD')
  }

  if (tallForwardBias) {
    baseOrder[3] = 'TALL'
    if (interchangeCount >= 5) baseOrder[4] = 'TALL'
    extraPools.unshift('TALL')
  }

  const target = [...baseOrder]
  let idx = 0
  while (target.length < interchangeCount) {
    target.push(extraPools[idx % extraPools.length] ?? 'MID')
    idx++
  }

  return target.slice(0, interchangeCount)
}

function benchCategoryScore(
  player: Player,
  category: BenchCategory,
  slot: LineupSlot,
): number {
  const roleFit = getRoleFitMultiplierForSlot(player.preferredRole, slot)
  const base = computeEffectiveRating(player) * roleFit
  const cats = classifyBenchCategories(player)

  if (cats.includes(category)) return base * 1.08
  if (category === 'UTIL' && cats.includes('MID')) return base * 1.03
  if (category === 'TALL' && (cats.includes('DEF') || cats.includes('FWD'))) return base * 0.98
  return base * 0.85
}

function tacticalIdentityBoost(player: Player, club?: Club): number {
  const identity = club?.tacticalIdentity
  if (!identity) return 1

  const role = player.preferredRole
  switch (identity) {
    case 'contested':
    case 'stoppage-focused':
      if (role === 'inside-mid' || role === 'ruck' || role === 'lockdown-defender') return 1.08
      if (role === 'outside-mid' || role === 'wing-runner') return 0.96
      return 1.02
    case 'defensive':
      if (role === 'lockdown-defender' || role === 'intercept-defender' || role === 'rebound-defender') return 1.08
      if (role === 'key-forward' || role === 'small-forward') return 0.96
      return 1.01
    case 'corridor-heavy':
    case 'fast-movement':
      if (role === 'outside-mid' || role === 'wing-runner' || role === 'rebound-defender') return 1.08
      if (role === 'inside-mid' || role === 'lockdown-defender') return 0.97
      return 1.02
    default:
      return 1
  }
}

function strategyMultiplier(
  player: Player,
  strategy: LineupAutofillStrategy,
): number {
  if (strategy === 'best-available' || strategy === 'last-game') return 1

  const overall = computeEffectiveRating(player)
  if (strategy === 'youth-focus') {
    const ageBias = Math.max(0.86, Math.min(1.24, 1 + (24 - player.age) * 0.03))
    const potentialBias = Math.max(0.95, Math.min(1.15, 1 + (player.hiddenAttributes.potentialCeiling - overall) / 420))
    const devBias = Math.max(0.95, Math.min(1.1, 0.94 + player.hiddenAttributes.developmentRate * 0.08))
    return ageBias * potentialBias * devBias
  }

  // win-now
  const primeAgeBias = player.age >= 24 && player.age <= 31 ? 1.08 : player.age < 23 ? 0.94 : 0.98
  const currentFormBias = Math.max(0.94, Math.min(1.12, 0.9 + player.form / 500))
  const currentOverallBias = Math.max(0.94, Math.min(1.12, 0.9 + overall / 500))
  return primeAgeBias * currentFormBias * currentOverallBias
}

function continuityMultiplier(
  playerId: string,
  slot: LineupSlot,
  strategy: LineupAutofillStrategy,
  baseLineup: Record<string, string> | null | undefined,
  continuityBias: number,
): number {
  if (!baseLineup) return 1
  const entries = Object.entries(baseLineup)
  if (entries.length === 0) return 1
  const inLineup = entries.some(([, id]) => id === playerId)
  if (!inLineup) return 1
  const sameSlot = baseLineup[slot] === playerId
  const bias = Math.max(0, Math.min(1, continuityBias))

  if (strategy === 'last-game') {
    if (sameSlot) return 1.28 + bias * 0.24
    return 1.14 + bias * 0.2
  }
  if (sameSlot) return 1 + bias * 0.18
  return 1 + bias * 0.1
}

function slotScore(
  player: Player,
  slot: LineupSlot,
  targetType: PlayerPositionType,
  strategy: LineupAutofillStrategy,
  club: Club | undefined,
  baseLineup: Record<string, string> | null | undefined,
  continuityBias: number,
): number {
  const base = computeSuitability(player, targetType, slot)
  if (strategy === 'best-available') return base
  return (
    base *
    tacticalIdentityBoost(player, club) *
    strategyMultiplier(player, strategy) *
    continuityMultiplier(player.id, slot, strategy, baseLineup, continuityBias)
  )
}

export function selectBestLineup(
  players: Player[],
  clubId: string,
  options?: LineupAutofillOptions,
): { lineup: Record<string, string>; selectedPlayerIds: string[] } {
  const interchangePlayers = Math.max(0, Math.min(8, options?.interchangePlayers ?? 4))
  const strategy = options?.strategy ?? 'best-available'
  const strictBestAvailable = strategy === 'best-available'
  const baseLineup = strictBestAvailable ? null : (options?.baseLineup ?? null)
  const preserveAssignedSlots = strictBestAvailable ? false : Boolean(options?.preserveAssignedSlots)
  const continuityBias = strictBestAvailable ? 0 : (options?.continuityBias ?? 0.55)
  const lineupSlots = getLineupSlots(interchangePlayers)
  const onFieldSlots = lineupSlots.filter((slot) => !slot.startsWith('I')) as LineupSlot[]
  const interchangeSlots = lineupSlots.filter((slot) => slot.startsWith('I')) as LineupSlot[]

  const eligible = players
    .filter((p) => p.clubId === clubId)
    .filter((p) => canBeSelectedForAfl(p))
    .filter((p) => p.injury === null)
    .filter((p) => !isPlayerSuspended(p))
    .filter((p) => p.fitness >= 50)

  const lineup: Record<string, string> = {}
  const assigned = new Set<string>()
  const eligibleById = new Map(eligible.map((p) => [p.id, p]))

  if (preserveAssignedSlots && baseLineup) {
    for (const slot of lineupSlots) {
      const playerId = baseLineup[slot]
      if (!playerId || assigned.has(playerId)) continue
      const player = eligibleById.get(playerId)
      if (!player) continue
      if (!isPlayerEligibleForSlot(player, slot)) continue
      lineup[slot] = playerId
      assigned.add(playerId)
    }
  }

  const assignBest = (
    slot: LineupSlot,
    candidates: Player[],
    targetType: PlayerPositionType,
  ): boolean => {
    const available = candidates
      .filter((p) => !assigned.has(p.id))
      .filter((p) => isPlayerEligibleForSlot(p, slot))
      .map((p) => ({
        player: p,
        score: slotScore(
          p,
          slot,
          targetType,
          strategy,
          options?.club,
          baseLineup,
          continuityBias,
        ),
      }))
      .sort((a, b) => b.score - a.score)

    if (available.length === 0) return false

    const best = available[0]
    lineup[slot] = best.player.id
    assigned.add(best.player.id)
    return true
  }

  const byType = new Map<PlayerPositionType, Player[]>()
  for (const p of eligible) {
    const type = p.position.primary
    if (!byType.has(type)) byType.set(type, [])
    byType.get(type)!.push(p)
  }

  for (const { posType, slots } of FILL_ORDER) {
    const primaryCandidates = byType.get(posType) ?? []
    const secondaryCandidates = eligible.filter(
      (p) => p.position.primary !== posType && p.position.secondary.includes(posType),
    )
    const pool = [...primaryCandidates, ...secondaryCandidates]

    for (const slot of slots) assignBest(slot, pool, posType)
  }

  for (const slot of onFieldSlots) {
    if (lineup[slot]) continue

    const remaining = eligible
      .filter((p) => !assigned.has(p.id))
      .filter((p) => isPlayerEligibleForSlot(p, slot))
      .map((p) => ({
        player: p,
        score: slotScore(
          p,
          slot,
          p.position.primary,
          strategy,
          options?.club,
          baseLineup,
          continuityBias,
        ),
      }))
      .sort((a, b) => b.score - a.score)

    if (remaining.length > 0) {
      lineup[slot] = remaining[0].player.id
      assigned.add(remaining[0].player.id)
    }
  }

  const benchTemplate = buildBenchTargetOrder(interchangeSlots.length, options?.club, eligible)
  for (let i = 0; i < interchangeSlots.length; i++) {
    const slot = interchangeSlots[i]
    if (lineup[slot]) continue

    const benchCategory = benchTemplate[i] ?? 'MID'
    const remaining = eligible
      .filter((p) => !assigned.has(p.id))
      .filter((p) => isPlayerEligibleForSlot(p, slot))
      .map((p) => ({
        player: p,
        score: strictBestAvailable
          ? benchCategoryScore(p, benchCategory, slot)
          : (
            benchCategoryScore(p, benchCategory, slot) *
            strategyMultiplier(p, strategy) *
            tacticalIdentityBoost(p, options?.club) *
            continuityMultiplier(p.id, slot, strategy, baseLineup, continuityBias)
          ),
      }))
      .sort((a, b) => b.score - a.score)

    if (remaining.length > 0) {
      lineup[slot] = remaining[0].player.id
      assigned.add(remaining[0].player.id)
    }
  }

  return {
    lineup,
    selectedPlayerIds: Object.values(lineup),
  }
}
