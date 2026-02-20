import { SeededRNG } from '@/engine/core/rng'
import {
  QUARTERS_PER_MATCH,
  POSSESSIONS_PER_QUARTER,
  POINTS_PER_GOAL,
  POINTS_PER_BEHIND,
  POSITION_LINE,
  getLineupSlots,
} from '@/engine/core/constants'
import { createDefaultGameplan } from '@/engine/gameplan/defaults'
import type { Match, MatchResult, MatchPlayerStats, QuarterScore, MatchKeyEvent } from '@/types/match'
import type { Player } from '@/types/player'
import type { Club, ClubGameplan } from '@/types/club'
import type { MatchDay } from '@/types/season'
import type { MatchRulesSettings, RealismSettings, WeeklyMatchupTactics } from '@/types/game'
import { getRoleSimulationMultiplier } from '@/engine/player/roles'
import { isPlayerSuspended } from '@/engine/players/availability'
import { getMoraleModifier } from '@/engine/players/morale'
import { getClutchModifier } from '@/engine/leadership/leadershipEngine'
import { VENUES, VENUE_NAME_TO_ID } from '@/data/venues'
import { calculateMatchAttendanceFull, getVenueFamiliarityRatingBonus } from '@/engine/venues/venueEngine'
import type { LadderEntry } from '@/types/season'
import { getCultureMatchModifier } from '@/engine/culture/cultureEngine'
import { getTacticalModifiers } from '@/engine/core/tacticalIdentity'
import type { TacticalIdentity } from '@/types/club'
import type { MidMatchAdjustment } from '@/types/matchEvent'

export interface SimulateMatchInput {
  homeClubId: string
  awayClubId: string
  venue: string
  venueId?: string
  matchDay?: MatchDay
  round: number
  players: Record<string, Player>
  clubs: Record<string, Club>
  gameplanOverrides?: Record<string, ClubGameplan>
  matchupTacticsByClub?: Record<string, WeeklyMatchupTactics | undefined>
  seed: number
  isFinal?: boolean
  finalType?: 'QF' | 'EF' | 'PF' | 'SF' | 'GF'
  matchRules?: MatchRulesSettings
  realism?: RealismSettings
  injuryFrequency?: 'low' | 'medium' | 'high'
  venueHGA?: number
  travelFatigue?: { home: number; away: number }
  ladder?: LadderEntry[]
  isBlockbuster?: boolean
  isRivalry?: boolean
  homeLineupPlayerIds?: string[]
  awayLineupPlayerIds?: string[]
  homeSubstituteId?: string | null
  awaySubstituteId?: string | null
}

export type WeatherCondition = 'clear' | 'windy' | 'wet' | 'hot' | 'humid'
export type GroundCondition = 'firm' | 'dewy' | 'soft' | 'heavy' | 'muddy'

export interface WeatherModifiers {
  condition: WeatherCondition
  groundCondition: GroundCondition
  possessionMult: number
  contestedMult: number
  markMult: number
  accuracyMult: number
  turnoverMult: number
  kickingEfficiencyMult: number
  contestedPlayerBoost: number
  gameplanExecutionMult: number
}

interface MatchupModifiers {
  homeInside50Mult: number
  awayInside50Mult: number
  homeAccuracyMult: number
  awayAccuracyMult: number
  homeMarkMult: number
  awayMarkMult: number
  homeTackleMult: number
  awayTackleMult: number
  homeTurnoverMult: number
  awayTurnoverMult: number
}

interface TacticalTargetFocus {
  tagPressure: number
  roughPressure: number
  extraFreeRisk: number
}

export interface TacticalRuntime {
  focusByTarget: Map<string, TacticalTargetFocus>
  fatigueLoadByPlayer: Map<string, number>
  interceptBoostByPlayer: Map<string, number>
}

export interface MatchContext {
  rng: SeededRNG
  input: SimulateMatchInput

  // Teams (mutable — shrink on mid-match injuries)
  homeActivePlayers: Player[]
  awayActivePlayers: Player[]
  homePlayers: Player[]
  awayPlayers: Player[]
  homeSubstitute: Player | null
  awaySubstitute: Player | null

  // Accumulated results
  homeStats: MatchPlayerStats[]
  awayStats: MatchPlayerStats[]
  homeScores: QuarterScore[]
  awayScores: QuarterScore[]
  keyEvents: MatchKeyEvent[]
  currentHomeTotal: number
  currentAwayTotal: number
  quartersCompleted: number

  // Mutable simulation parameters
  homeMods: GameplanModifiers
  awayMods: GameplanModifiers
  matchup: MatchupModifiers
  homeTactical: TacticalRuntime
  awayTactical: TacticalRuntime
  resolvedHomeGameplan: ClubGameplan
  resolvedAwayGameplan: ClubGameplan
  homeTeamFreeRisk: number
  awayTeamFreeRisk: number

  // Fixed context
  weather: WeatherModifiers
  adjustedHomeRating: number
  adjustedAwayRating: number
  homeCaptainPresent: boolean
  awayCaptainPresent: boolean
  quartersPerMatch: number
  possessionsBase: number
  pointsPerGoal: number
  pointsPerBehind: number
  substitutesEnabled: boolean
  suspensionStrictness: number
  attendanceResult: { attendance?: number; capacityPct?: number } | null
  venueId: string | undefined

  // Club references (for modifier chain re-runs)
  homeClubTacticalIdentity: TacticalIdentity | undefined
  awayClubTacticalIdentity: TacticalIdentity | undefined

  // Interactive tracking
  midMatchAdjustments: MidMatchAdjustment[]
  midMatchInjuredPlayerIds: Set<string>
  positionOverrides: Map<string, 'forward' | 'back'>
  userSubActivated: boolean
  effectiveAggressionQuarters: Array<'high' | 'medium' | 'low'>

  // Per-quarter stat snapshots (for tag-failing detection)
  quarterStartDisposals: Map<string, number>
}

type TeamLine = 'DEF' | 'MID' | 'FWD' | 'RK'
type RebalancedStat = 'disposals' | 'marks' | 'tackles'

const TEAM_STAT_TARGETS: Record<RebalancedStat, { base: number; spread: number }> = {
  disposals: { base: 358, spread: 28 },
  marks: { base: 84, spread: 10 },
  tackles: { base: 61, spread: 9 },
}

const TEAM_LINE_SHARES: Record<RebalancedStat, Record<TeamLine, number>> = {
  disposals: { DEF: 0.31, MID: 0.45, FWD: 0.17, RK: 0.07 },
  marks: { DEF: 0.38, MID: 0.32, FWD: 0.22, RK: 0.08 },
  tackles: { DEF: 0.26, MID: 0.44, FWD: 0.23, RK: 0.07 },
}

function intensityToWeight(intensity: 'light' | 'standard' | 'hard'): number {
  if (intensity === 'hard') return 1.3
  if (intensity === 'light') return 0.75
  return 1
}

export function buildTacticalRuntime(
  tactics: WeeklyMatchupTactics | undefined,
  ownPlayers: Player[],
  oppPlayers: Player[],
): TacticalRuntime {
  const ownIds = new Set(ownPlayers.map((p) => p.id))
  const oppIds = new Set(oppPlayers.map((p) => p.id))
  const focusByTarget = new Map<string, TacticalTargetFocus>()
  const fatigueLoadByPlayer = new Map<string, number>()
  const interceptBoostByPlayer = new Map<string, number>()

  const addFocus = (
    targetId: string,
    update: Partial<TacticalTargetFocus>,
  ) => {
    const current = focusByTarget.get(targetId) ?? { tagPressure: 0, roughPressure: 0, extraFreeRisk: 0 }
    focusByTarget.set(targetId, {
      tagPressure: current.tagPressure + (update.tagPressure ?? 0),
      roughPressure: current.roughPressure + (update.roughPressure ?? 0),
      extraFreeRisk: current.extraFreeRisk + (update.extraFreeRisk ?? 0),
    })
  }

  const addFatigue = (playerId: string, load: number) => {
    fatigueLoadByPlayer.set(playerId, (fatigueLoadByPlayer.get(playerId) ?? 0) + load)
  }

  for (const tag of tactics?.hardTags ?? []) {
    if (!ownIds.has(tag.taggerPlayerId) || !oppIds.has(tag.targetPlayerId)) continue
    const w = intensityToWeight(tag.intensity)
    addFocus(tag.targetPlayerId, { tagPressure: 0.15 * w, extraFreeRisk: 0.03 * w })
    addFatigue(tag.taggerPlayerId, 0.8 * w)
  }

  for (const rough of tactics?.physicalAttention ?? []) {
    if (!ownIds.has(rough.enforcerPlayerId) || !oppIds.has(rough.targetPlayerId)) continue
    const w = intensityToWeight(rough.intensity)
    addFocus(rough.targetPlayerId, { roughPressure: 0.16 * w, extraFreeRisk: 0.12 * w })
    addFatigue(rough.enforcerPlayerId, 0.7 * w)
  }

  for (const role of tactics?.roleAssignments ?? []) {
    if (!ownIds.has(role.playerId)) continue
    const w = intensityToWeight(role.intensity)
    if (role.assignment === 'loose-interceptor') {
      interceptBoostByPlayer.set(role.playerId, 0.12 * w)
      continue
    }
    if (!role.targetPlayerId || !oppIds.has(role.targetPlayerId)) continue
    if (role.assignment === 'run-with') {
      addFocus(role.targetPlayerId, { tagPressure: 0.1 * w, extraFreeRisk: 0.02 * w })
      addFatigue(role.playerId, 0.55 * w)
    } else if (role.assignment === 'defensive-forward') {
      addFocus(role.targetPlayerId, { roughPressure: 0.08 * w, extraFreeRisk: 0.04 * w })
      addFatigue(role.playerId, 0.5 * w)
    }
  }

  return { focusByTarget, fatigueLoadByPlayer, interceptBoostByPlayer }
}

function getClubPlayers(
  players: Record<string, Player>,
  clubId: string,
  requiredCount: number,
  selectedPlayerIds?: string[],
): Player[] {
  const available = Object.values(players)
    .filter((p) => p.clubId === clubId && !p.injury && !isPlayerSuspended(p) && p.fitness >= 50)
    .sort((a, b) => getOverall(b) - getOverall(a))

  const byId = new Map(available.map((p) => [p.id, p]))
  const selected: Player[] = []
  const selectedIds = new Set<string>()
  for (const playerId of selectedPlayerIds ?? []) {
    if (selectedIds.has(playerId)) continue
    const player = byId.get(playerId)
    if (!player) continue
    selected.push(player)
    selectedIds.add(playerId)
    if (selected.length >= requiredCount) break
  }
  if (selected.length < requiredCount) {
    for (const player of available) {
      if (selectedIds.has(player.id)) continue
      selected.push(player)
      selectedIds.add(player.id)
      if (selected.length >= requiredCount) break
    }
  }
  return selected
}

function pickSubstitute(
  availablePlayers: Player[],
  selectedPlayers: Player[],
  preferredSubId?: string | null,
): Player | null {
  const selectedIds = new Set(selectedPlayers.map((p) => p.id))
  const candidates = availablePlayers.filter((p) => !selectedIds.has(p.id))
  if (candidates.length === 0) return null
  if (preferredSubId) {
    const preferred = candidates.find((p) => p.id === preferredSubId)
    if (preferred) return preferred
  }
  return candidates[0]
}

function getOverall(p: Player): number {
  const g = getGranularRatings(p)
  const base = (
    g.speed + g.endurance + g.kicking + g.marking + g.tackling + g.strength +
    g.decisionMaking + g.agility + g.spoiling + g.intercepting + g.goalSense + g.discipline
  ) / 12
  return base * getAvailabilityMultiplier(p)
}

function getTeamRating(players: Player[]): number {
  if (players.length === 0) return 50
  const aggregate = players.reduce(
    (sum, p) => {
      const g = getGranularRatings(p)
      return (
        sum +
        g.decisionMaking * 0.22 +
        g.kicking * 0.18 +
        g.endurance * 0.14 +
        g.speed * 0.12 +
        g.tackling * 0.12 +
        g.intercepting * 0.1 +
        g.strength * 0.08 +
        g.discipline * 0.04
      )
    },
    0,
  )
  return aggregate / players.length
}

function resolveVenueId(name: string, explicitId?: string): string | undefined {
  if (explicitId && VENUES[explicitId]) return explicitId
  return VENUE_NAME_TO_ID[name]
}

function generateWeatherModifiers(
  rng: SeededRNG,
  venueId: string | undefined,
  matchDay?: MatchDay,
): WeatherModifiers {
  const venue = venueId ? VENUES[venueId] : undefined
  const nightGame =
    matchDay === 'Thursday' ||
    matchDay === 'Friday' ||
    matchDay === 'Saturday-Night' ||
    matchDay === 'Sunday-Twilight'

  const baseWeights: Record<WeatherCondition, number> = {
    clear: 0.54,
    windy: 0.17,
    wet: 0.15,
    hot: 0.08,
    humid: 0.06,
  }

  if (venue?.id === 'marvel-stadium') {
    baseWeights.clear = 0.9
    baseWeights.windy = 0.02
    baseWeights.wet = 0.03
    baseWeights.hot = 0.03
    baseWeights.humid = 0.02
  } else if (venue?.state === 'TAS' || venue?.state === 'WA') {
    baseWeights.windy += 0.08
    baseWeights.clear -= 0.05
  } else if (venue?.state === 'QLD' || venue?.state === 'NT') {
    baseWeights.humid += 0.08
    baseWeights.hot += 0.05
    baseWeights.clear -= 0.07
  }

  if (nightGame) {
    baseWeights.wet += 0.05
    baseWeights.clear -= 0.04
  }

  const total = Object.values(baseWeights).reduce((sum, v) => sum + v, 0)
  const roll = rng.next() * total
  let cumulative = 0
  let condition: WeatherCondition = 'clear'
  for (const c of ['clear', 'windy', 'wet', 'hot', 'humid'] as WeatherCondition[]) {
    cumulative += baseWeights[c]
    if (roll <= cumulative) {
      condition = c
      break
    }
  }

  const groundCondition: GroundCondition =
    condition === 'wet'
      ? (rng.chance(0.4) ? 'muddy' : 'heavy')
      : condition === 'humid'
        ? (rng.chance(0.5) ? 'dewy' : 'soft')
        : condition === 'hot'
          ? 'firm'
          : condition === 'windy'
            ? (rng.chance(0.25) ? 'soft' : 'firm')
            : (nightGame && rng.chance(0.32) ? 'dewy' : 'firm')

  // Indoor venues significantly reduce poor-surface outcomes.
  if (venue?.id === 'marvel-stadium' && (groundCondition === 'muddy' || groundCondition === 'heavy')) {
    return {
      condition,
      groundCondition: 'firm',
      possessionMult: 0.99,
      contestedMult: 1.01,
      markMult: 0.98,
      accuracyMult: 0.98,
      turnoverMult: 1.03,
      kickingEfficiencyMult: 0.99,
      contestedPlayerBoost: 0.06,
      gameplanExecutionMult: 0.99,
    }
  }

  switch (condition) {
    case 'windy':
      return {
        condition,
        groundCondition,
        possessionMult: 0.97,
        contestedMult: 1.05,
        markMult: 0.91,
        accuracyMult: 0.9,
        turnoverMult: 1.12,
        kickingEfficiencyMult: 0.92,
        contestedPlayerBoost: 0.12,
        gameplanExecutionMult: 0.96,
      }
    case 'wet':
      return {
        condition,
        groundCondition,
        possessionMult: groundCondition === 'muddy' ? 0.9 : 0.94,
        contestedMult: groundCondition === 'muddy' ? 1.18 : 1.12,
        markMult: groundCondition === 'muddy' ? 0.78 : 0.84,
        accuracyMult: groundCondition === 'muddy' ? 0.82 : 0.86,
        turnoverMult: groundCondition === 'muddy' ? 1.24 : 1.18,
        kickingEfficiencyMult: groundCondition === 'muddy' ? 0.84 : 0.88,
        contestedPlayerBoost: groundCondition === 'muddy' ? 0.28 : 0.22,
        gameplanExecutionMult: groundCondition === 'muddy' ? 0.88 : 0.92,
      }
    case 'hot':
      return {
        condition,
        groundCondition,
        possessionMult: 0.93,
        contestedMult: 0.95,
        markMult: 0.97,
        accuracyMult: 0.95,
        turnoverMult: 1.05,
        kickingEfficiencyMult: 0.96,
        contestedPlayerBoost: 0.04,
        gameplanExecutionMult: 0.95,
      }
    case 'humid':
      return {
        condition,
        groundCondition,
        possessionMult: 0.95,
        contestedMult: 1.03,
        markMult: 0.95,
        accuracyMult: 0.93,
        turnoverMult: 1.08,
        kickingEfficiencyMult: 0.94,
        contestedPlayerBoost: 0.1,
        gameplanExecutionMult: 0.95,
      }
    case 'clear':
    default:
      return {
        condition: 'clear',
        groundCondition,
        possessionMult: 1,
        contestedMult: 1,
        markMult: 1,
        accuracyMult: 1,
        turnoverMult: 1,
        kickingEfficiencyMult: 1,
        contestedPlayerBoost: groundCondition === 'dewy' ? 0.08 : 0,
        gameplanExecutionMult: groundCondition === 'dewy' ? 0.97 : 1,
      }
  }
}

function getTeamProfile(players: Player[]): {
  clearance: number
  intercept: number
  pressure: number
  marking: number
  outsideRun: number
  goalSense: number
} {
  const len = Math.max(1, players.length)
  const totals = players.reduce(
    (acc, p) => {
      const g = getGranularRatings(p)
      acc.clearance += (p.attributes.clearance + p.attributes.contested + p.attributes.hardness) / 3
      acc.intercept += g.intercepting
      acc.pressure += (g.tackling + p.attributes.pressure + p.attributes.hardness) / 3
      acc.marking += g.marking
      acc.outsideRun += (g.speed + g.endurance + g.agility) / 3
      acc.goalSense += g.goalSense
      return acc
    },
    { clearance: 0, intercept: 0, pressure: 0, marking: 0, outsideRun: 0, goalSense: 0 },
  )
  return {
    clearance: totals.clearance / len,
    intercept: totals.intercept / len,
    pressure: totals.pressure / len,
    marking: totals.marking / len,
    outsideRun: totals.outsideRun / len,
    goalSense: totals.goalSense / len,
  }
}

function computeMatchupModifiers(
  homePlayers: Player[],
  awayPlayers: Player[],
  homeGameplan: ClubGameplan,
  awayGameplan: ClubGameplan,
): MatchupModifiers {
  const homeProfile = getTeamProfile(homePlayers)
  const awayProfile = getTeamProfile(awayPlayers)

  const clearanceEdge = (homeProfile.clearance - awayProfile.clearance) / 120
  const interceptEdge = (homeProfile.intercept - awayProfile.intercept) / 130
  const pressureEdge = (homeProfile.pressure - awayProfile.pressure) / 140
  const markingEdge = (homeProfile.marking - awayProfile.marking) / 140
  const runEdge = (homeProfile.outsideRun - awayProfile.outsideRun) / 150
  const scoringEdge = (homeProfile.goalSense - awayProfile.goalSense) / 150

  const homeTacticalCounter =
    (homeGameplan.centreTactic === 'cluster' && awayGameplan.centreTactic === 'spread' ? 0.02 : 0) +
    (homeGameplan.forwardLine === 'press' && awayGameplan.defensiveLine === 'run' ? 0.02 : 0) +
    (homeGameplan.defensiveLine === 'press' && awayGameplan.kickInTactic === 'play-on-short' ? 0.015 : 0)
  const awayTacticalCounter =
    (awayGameplan.centreTactic === 'cluster' && homeGameplan.centreTactic === 'spread' ? 0.02 : 0) +
    (awayGameplan.forwardLine === 'press' && homeGameplan.defensiveLine === 'run' ? 0.02 : 0) +
    (awayGameplan.defensiveLine === 'press' && homeGameplan.kickInTactic === 'play-on-short' ? 0.015 : 0)

  return {
    homeInside50Mult: clampMultiplier(1 + clearanceEdge + runEdge * 0.6 + homeTacticalCounter - interceptEdge * 0.4),
    awayInside50Mult: clampMultiplier(1 - clearanceEdge - runEdge * 0.6 + awayTacticalCounter + interceptEdge * 0.4),
    homeAccuracyMult: clampMultiplier(1 + scoringEdge * 0.75 - awayProfile.pressure / 1100),
    awayAccuracyMult: clampMultiplier(1 - scoringEdge * 0.75 - homeProfile.pressure / 1100),
    homeMarkMult: clampMultiplier(1 + markingEdge * 0.7 - awayProfile.intercept / 1200),
    awayMarkMult: clampMultiplier(1 - markingEdge * 0.7 - homeProfile.intercept / 1200),
    homeTackleMult: clampMultiplier(1 + pressureEdge * 0.8),
    awayTackleMult: clampMultiplier(1 - pressureEdge * 0.8),
    homeTurnoverMult: clampMultiplier(1 + awayProfile.pressure / 900 - homeProfile.outsideRun / 1300),
    awayTurnoverMult: clampMultiplier(1 + homeProfile.pressure / 900 - awayProfile.outsideRun / 1300),
  }
}

/** Get a positional modifier for goal/behind scoring based on player position */
function getForwardModifier(player: Player): number {
  const pos = player.position.primary
  if (pos === 'FF') return 1.8
  if (pos === 'FP' || pos === 'CHF') return 1.5
  if (pos === 'HFF') return 1.4
  if (pos === 'RK') return 0.6
  if (pos === 'IM' || pos === 'OM') return 0.8
  if (pos === 'W') return 0.5
  return 0.3 // defenders (BP, FB, HBF, CHB)
}

// ---------------------------------------------------------------------------
// Gameplan multipliers — each tactic option produces simple modifiers that
// are applied to the base probabilities inside the possession loop.
// ---------------------------------------------------------------------------

export interface GameplanModifiers {
  /** Extra possessions per quarter (added to base) */
  possessionBonus: number
  /** Multiplier on the inside-50 chance */
  inside50Mult: number
  /** Multiplier on goal accuracy (goalChance) */
  accuracyMult: number
  /** Multiplier on contested possession chance */
  contestedMult: number
  /** Multiplier on uncontested possession chance */
  uncontestedMult: number
  /** Multiplier on tackle chance for this team's defenders */
  tackleMult: number
  /** Multiplier on mark chance */
  markMult: number
  /** Multiplier on rebound 50 chance for the opponent when this team attacks */
  opponentReboundMult: number
  /** Multiplier on hitout chance for the ruck */
  hitoutMult: number
}

export function applyTacticalIdentityModifiers(mods: GameplanModifiers, identity?: TacticalIdentity): GameplanModifiers {
  if (!identity) return mods
  const t = getTacticalModifiers(identity)
  return {
    possessionBonus: mods.possessionBonus + t.possessionBonus,
    inside50Mult: mods.inside50Mult * t.inside50Mult,
    accuracyMult: mods.accuracyMult * t.accuracyMult,
    contestedMult: mods.contestedMult * t.contestedMult,
    uncontestedMult: mods.uncontestedMult * t.uncontestedMult,
    tackleMult: mods.tackleMult * t.tackleMult,
    markMult: mods.markMult * t.markMult,
    opponentReboundMult: mods.opponentReboundMult * t.opponentReboundMult,
    hitoutMult: mods.hitoutMult * t.hitoutMult,
  }
}

export function computeGameplanModifiers(gameplan: ClubGameplan): GameplanModifiers {
  const mods: GameplanModifiers = {
    possessionBonus: 0,
    inside50Mult: 1.0,
    accuracyMult: 1.0,
    contestedMult: 1.0,
    uncontestedMult: 1.0,
    tackleMult: 1.0,
    markMult: 1.0,
    opponentReboundMult: 1.0,
    hitoutMult: 1.0,
  }

  // --- Offensive Style ---
  if (gameplan.offensiveStyle === 'attacking') {
    mods.inside50Mult *= 1.08
    mods.opponentReboundMult *= 1.05 // more open defensively
  } else if (gameplan.offensiveStyle === 'defensive') {
    mods.inside50Mult *= 0.92
    mods.tackleMult *= 1.05
    mods.opponentReboundMult *= 0.90
  }

  // --- Tempo ---
  if (gameplan.tempo === 'fast') {
    mods.possessionBonus += 15 // more possessions per quarter
    mods.accuracyMult *= 0.97 // slight accuracy drop from rushing
  } else if (gameplan.tempo === 'slow') {
    mods.possessionBonus -= 12
    mods.accuracyMult *= 1.03
  }

  // --- Aggression ---
  if (gameplan.aggression === 'high') {
    mods.contestedMult *= 1.08
    mods.tackleMult *= 1.06
  } else if (gameplan.aggression === 'low') {
    mods.contestedMult *= 0.93
    mods.tackleMult *= 0.94
  }

  // --- Kick-In Tactic ---
  if (gameplan.kickInTactic === 'play-on-long') {
    mods.inside50Mult *= 1.05
    mods.accuracyMult *= 0.97
  } else if (gameplan.kickInTactic === 'play-on-short') {
    mods.uncontestedMult *= 1.04
  } else if (gameplan.kickInTactic === 'set-up-long') {
    mods.inside50Mult *= 1.03
    mods.markMult *= 1.03
  }
  // 'set-up-short' is the neutral default — no modifiers

  // --- Centre Tactic ---
  if (gameplan.centreTactic === 'cluster') {
    mods.contestedMult *= 1.06
    mods.uncontestedMult *= 0.95
  } else if (gameplan.centreTactic === 'spread') {
    mods.uncontestedMult *= 1.06
    mods.contestedMult *= 0.95
  }

  // --- Stoppage Tactic ---
  if (gameplan.stoppageTactic === 'cluster') {
    mods.contestedMult *= 1.04
    mods.uncontestedMult *= 0.97
  } else if (gameplan.stoppageTactic === 'spread') {
    mods.uncontestedMult *= 1.04
    mods.contestedMult *= 0.97
  }

  // --- Defensive Line ---
  if (gameplan.defensiveLine === 'press') {
    mods.tackleMult *= 1.06
    mods.opponentReboundMult *= 1.04 // risky if beaten
  } else if (gameplan.defensiveLine === 'hold') {
    mods.markMult *= 1.03
  } else if (gameplan.defensiveLine === 'run') {
    mods.uncontestedMult *= 1.03
    mods.opponentReboundMult *= 0.97
  }
  // 'zone' is the neutral default

  // --- Midfield Line ---
  if (gameplan.midfieldLine === 'press') {
    mods.tackleMult *= 1.04
    mods.contestedMult *= 1.03
  } else if (gameplan.midfieldLine === 'hold') {
    mods.markMult *= 1.02
  } else if (gameplan.midfieldLine === 'zone') {
    mods.uncontestedMult *= 1.02
  }
  // 'run' is the neutral default

  // --- Forward Line ---
  if (gameplan.forwardLine === 'press') {
    mods.markMult *= 1.05 // better contested marks in forward line
    mods.inside50Mult *= 1.03
  } else if (gameplan.forwardLine === 'hold') {
    mods.accuracyMult *= 1.03
  } else if (gameplan.forwardLine === 'run') {
    mods.uncontestedMult *= 1.03
  } else if (gameplan.forwardLine === 'zone') {
    mods.markMult *= 1.02
  }

  // --- Rotations ---
  if (gameplan.rotations === 'high') {
    mods.possessionBonus += 5 // fresher legs = more activity
  } else if (gameplan.rotations === 'low') {
    mods.possessionBonus -= 5
    mods.contestedMult *= 1.02 // same players stay in position
  }

  // --- Ruck nomination: around the ground ---
  if (gameplan.ruckNomination.aroundTheGround) {
    mods.hitoutMult *= 0.90 // less specialist but more spread
    mods.contestedMult *= 1.02
  }

  // --- Play Style Rules ---
  const ps = gameplan.playStyle
  if (ps) {
    // Forward leading pattern
    if (ps.forwardLeading === 'straight') {
      mods.inside50Mult *= 1.04   // direct leads connect more
      mods.markMult *= 0.96       // defenders can read the lead
      mods.accuracyMult *= 1.01
    } else if (ps.forwardLeading === 'diagonal') {
      mods.markMult *= 1.05       // angled leads are harder to defend
      mods.inside50Mult *= 1.01
    } else if (ps.forwardLeading === 'hold-spread') {
      mods.accuracyMult *= 1.03   // forwards hold position = better set shots
      mods.markMult *= 1.02
      mods.inside50Mult *= 0.97   // fewer link-up options in the corridor
    } else if (ps.forwardLeading === 'rotate') {
      mods.uncontestedMult *= 1.04  // constant movement creates space
      mods.inside50Mult *= 1.02
    }

    // Tap direction
    if (ps.tapDirection === 'forward') {
      mods.inside50Mult *= 1.04     // more direct entries off the tap
      mods.contestedMult *= 0.97    // opponents can read and position for it
    } else if (ps.tapDirection === 'backward') {
      mods.uncontestedMult *= 1.05  // midfielders collect cleanly in space
      mods.inside50Mult *= 0.97
    } else if (ps.tapDirection === 'read-and-react') {
      mods.hitoutMult *= 1.04       // optimal reads = better hitout quality
    }

    // Stoppage movement
    if (ps.stoppageMovement === 'flood-back') {
      mods.opponentReboundMult *= 0.92  // defensively accountable
      mods.uncontestedMult *= 1.03      // more bodies behind ball = cleaner possession
      mods.inside50Mult *= 0.95         // fewer players pushing forward
    } else if (ps.stoppageMovement === 'push-forward') {
      mods.inside50Mult *= 1.06         // lots of targets forward of the ball
      mods.opponentReboundMult *= 1.07  // exposed if clearance goes the wrong way
      mods.contestedMult *= 1.02
    } else if (ps.stoppageMovement === 'numbers') {
      mods.contestedMult *= 1.04        // numerical advantage at the stoppage
      mods.tackleMult *= 1.02
    }
    // 'balanced' = no modifier (default)

    // Switch frequency
    if (ps.switchFrequency === 'often') {
      mods.uncontestedMult *= 1.05  // switches create uncontested wide options
      mods.markMult *= 1.03         // ball arrives to open players
      mods.inside50Mult *= 0.96     // more horizontal movement slows entries
    } else if (ps.switchFrequency === 'rarely') {
      mods.inside50Mult *= 1.04     // direct corridor play = more i50 entries
      mods.uncontestedMult *= 0.96  // congested through the middle
      mods.contestedMult *= 1.02
    }

    // No U-turns: maintain forward momentum, avoid reversing direction
    if (ps.noUTurns) {
      mods.uncontestedMult *= 1.02  // players run past = cleaner disposal targets
      mods.accuracyMult *= 1.02     // less hesitation when disposing
    }

    // Handball to runner: prefer handball to player running past
    if (ps.handbballToRunner) {
      mods.uncontestedMult *= 1.04  // handball chains keep ball moving forward
      mods.inside50Mult *= 1.01
    }

    // No kick back across goal: avoid backward/cross-face kicks in F50
    if (ps.noKickBackAcrossGoal) {
      mods.opponentReboundMult *= 0.93  // fewer risky turnovers in F50
      mods.accuracyMult *= 1.01
      mods.inside50Mult *= 0.97         // slightly fewer creative options
    }
  }

  return mods
}

function getGameplanFreeRiskModifier(gameplan: ClubGameplan, weather: WeatherModifiers): number {
  let risk = 1
  if (gameplan.aggression === 'high') risk += 0.24
  else if (gameplan.aggression === 'low') risk -= 0.12

  if (gameplan.defensiveLine === 'press') risk += 0.1
  if (gameplan.midfieldLine === 'press') risk += 0.07
  if (gameplan.forwardLine === 'press') risk += 0.05
  if (gameplan.kickInTactic === 'play-on-long') risk += 0.04
  if (gameplan.kickInTactic === 'play-on-short') risk += 0.03

  // Slippery conditions lead to more mistimed contact and tackles.
  if (weather.condition === 'wet' || weather.groundCondition === 'heavy' || weather.groundCondition === 'muddy') {
    risk += 0.08
  }
  return clampMultiplier(risk, 0.72, 1.45)
}

function getPlayerFreeRiskMultiplier(player: Player, weather: WeatherModifiers): number {
  const discipline = getGranularRatings(player).discipline
  const aggressionProfile = (player.attributes.pressure + player.attributes.hardness + player.attributes.tackling) / 3
  const disciplinePenalty = Math.max(0, (72 - discipline) / 110)
  const aggressionPenalty = Math.max(0, (aggressionProfile - 60) / 170)
  const temperamentPenalty = Math.max(0, (55 - player.personality.temperament) / 135)
  const weatherPenalty = weather.condition === 'wet' ? 0.06 : weather.groundCondition === 'muddy' ? 0.1 : 0
  return clampMultiplier(1 + disciplinePenalty + aggressionPenalty + temperamentPenalty + weatherPenalty, 0.75, 1.65)
}

export function applyConditionToGameplanModifiers(
  mods: GameplanModifiers,
  gameplan: ClubGameplan,
  weather: WeatherModifiers,
): GameplanModifiers {
  const adjusted: GameplanModifiers = { ...mods }

  // Wet/heavy conditions reduce precision systems and high-speed spread play,
  // while rewarding territory and stoppage-oriented systems.
  if (weather.condition === 'wet' || weather.groundCondition === 'heavy' || weather.groundCondition === 'muddy') {
    if (gameplan.tempo === 'fast') adjusted.inside50Mult *= 0.94
    if (gameplan.kickInTactic === 'play-on-long' || gameplan.kickInTactic === 'play-on-short') {
      adjusted.accuracyMult *= 0.93
      adjusted.uncontestedMult *= 0.95
    }
    if (gameplan.centreTactic === 'spread' || gameplan.stoppageTactic === 'spread') {
      adjusted.uncontestedMult *= 0.93
      adjusted.contestedMult *= 0.97
    }
    if (gameplan.centreTactic === 'cluster' || gameplan.stoppageTactic === 'cluster') {
      adjusted.contestedMult *= 1.05
      adjusted.tackleMult *= 1.04
    }
    if (gameplan.forwardLine === 'press') adjusted.markMult *= 0.94
    if (gameplan.defensiveLine === 'hold') adjusted.markMult *= 1.03
  }

  if (weather.condition === 'windy') {
    if (gameplan.kickInTactic === 'play-on-long' || gameplan.kickInTactic === 'set-up-long') {
      adjusted.accuracyMult *= 0.92
    }
    if (gameplan.forwardLine === 'hold') adjusted.accuracyMult *= 1.02
  }

  adjusted.inside50Mult *= weather.gameplanExecutionMult
  adjusted.accuracyMult *= weather.gameplanExecutionMult
  adjusted.markMult *= weather.gameplanExecutionMult
  adjusted.uncontestedMult *= weather.gameplanExecutionMult

  return adjusted
}

export function createMatchContext(input: SimulateMatchInput): MatchContext {
  const rng = new SeededRNG(input.seed)
  const { homeClubId, awayClubId, venue, players, clubs, isFinal, finalType, matchRules } = input

  const quartersPerMatch = matchRules?.quartersPerMatch ?? QUARTERS_PER_MATCH
  const possessionsMultiplier = matchRules?.possessionsMultiplier ?? 1.0
  const possessionsBase = Math.round(POSSESSIONS_PER_QUARTER * possessionsMultiplier)
  const pointsPerGoal = matchRules?.pointsPerGoal ?? POINTS_PER_GOAL
  const pointsPerBehind = matchRules?.pointsPerBehind ?? POINTS_PER_BEHIND

  const interchangePlayers = Math.max(0, Math.min(8, matchRules?.interchangePlayers ?? 5))
  const requiredSelected = getLineupSlots(interchangePlayers).length

  const homeAvailablePlayers = Object.values(players)
    .filter((p) => p.clubId === homeClubId && !p.injury && !isPlayerSuspended(p) && p.fitness >= 50)
    .sort((a, b) => getOverall(b) - getOverall(a))
  const awayAvailablePlayers = Object.values(players)
    .filter((p) => p.clubId === awayClubId && !p.injury && !isPlayerSuspended(p) && p.fitness >= 50)
    .sort((a, b) => getOverall(b) - getOverall(a))

  const homePlayers = getClubPlayers(players, homeClubId, requiredSelected, input.homeLineupPlayerIds)
  const awayPlayers = getClubPlayers(players, awayClubId, requiredSelected, input.awayLineupPlayerIds)
  const substitutesEnabled = Boolean(matchRules?.enableSubstitutes)
  const homeSubstitute = substitutesEnabled
    ? pickSubstitute(homeAvailablePlayers, homePlayers, input.homeSubstituteId)
    : null
  const awaySubstitute = substitutesEnabled
    ? pickSubstitute(awayAvailablePlayers, awayPlayers, input.awaySubstituteId)
    : null

  const homeRating = getTeamRating(homePlayers)
  const awayRating = getTeamRating(awayPlayers)

  const homeGameplan = input.gameplanOverrides?.[homeClubId] ?? clubs[homeClubId]?.gameplan
  const awayGameplan = input.gameplanOverrides?.[awayClubId] ?? clubs[awayClubId]?.gameplan
  const resolvedHomeGameplan = homeGameplan ?? createDefaultGameplan()
  const resolvedAwayGameplan = awayGameplan ?? createDefaultGameplan()
  const venueId = resolveVenueId(venue, input.venueId)
  const weather = generateWeatherModifiers(rng, venueId, input.matchDay)
  const homeBaseMods = applyTacticalIdentityModifiers(
    computeGameplanModifiers(resolvedHomeGameplan),
    clubs[homeClubId]?.tacticalIdentity,
  )
  const awayBaseMods = applyTacticalIdentityModifiers(
    computeGameplanModifiers(resolvedAwayGameplan),
    clubs[awayClubId]?.tacticalIdentity,
  )
  const homeMods = applyConditionToGameplanModifiers(homeBaseMods, resolvedHomeGameplan, weather)
  const awayMods = applyConditionToGameplanModifiers(awayBaseMods, resolvedAwayGameplan, weather)
  const matchup = computeMatchupModifiers(homePlayers, awayPlayers, resolvedHomeGameplan, resolvedAwayGameplan)
  const homeTeamFreeRisk = getGameplanFreeRiskModifier(resolvedHomeGameplan, weather)
  const awayTeamFreeRisk = getGameplanFreeRiskModifier(resolvedAwayGameplan, weather)
  const homeTactical = buildTacticalRuntime(input.matchupTacticsByClub?.[homeClubId], homePlayers, awayPlayers)
  const awayTactical = buildTacticalRuntime(input.matchupTacticsByClub?.[awayClubId], awayPlayers, homePlayers)
  const suspensionStrictness = input.realism?.tacticalSuspensionConsequences ? 1 : 0.55
  const homeVenueFamiliarity = getVenueFamiliarityRatingBonus(homeClubId, venueId)
  const awayVenueFamiliarity = getVenueFamiliarityRatingBonus(awayClubId, venueId)

  const homeAdvantage = input.venueHGA ?? 3
  const homeTravelPenalty = (input.travelFatigue?.home ?? 0) * 0.5
  const awayTravelPenalty = (input.travelFatigue?.away ?? 0) * 0.5
  const homeCultureMod = getCultureMatchModifier(clubs[homeClubId]?.culture)
  const awayCultureMod = getCultureMatchModifier(clubs[awayClubId]?.culture)
  const adjustedHomeRating = (homeRating + homeAdvantage + homeVenueFamiliarity - homeTravelPenalty) * homeCultureMod
  const adjustedAwayRating = (awayRating + awayVenueFamiliarity - awayTravelPenalty) * awayCultureMod

  const homeStarCount = homePlayers.filter((p) => getOverall(p) >= 80).length
  const awayStarCount = awayPlayers.filter((p) => getOverall(p) >= 80).length
  const attendanceResult = venueId
    ? calculateMatchAttendanceFull({
        venueId,
        homeClubId,
        awayClubId,
        clubs,
        ladder: input.ladder ?? [],
        isFinal: !!isFinal,
        finalType,
        isBlockbuster: input.isBlockbuster ?? false,
        isRivalry: input.isRivalry ?? false,
        homeStarCount,
        awayStarCount,
        rng,
      })
    : null

  const homeStats = initPlayerStats(homePlayers, homeSubstitute)
  const awayStats = initPlayerStats(awayPlayers, awaySubstitute)

  const keyEvents: MatchKeyEvent[] = []
  keyEvents.push({
    quarter: 1,
    minute: 0,
    type: 'milestone',
    description: `Conditions: ${weather.condition}, ground: ${weather.groundCondition}`,
    clubId: homeClubId,
  })

  const homeLeadership = clubs[homeClubId]?.leadership
  const awayLeadership = clubs[awayClubId]?.leadership
  const homeCaptainPresent = homePlayers.some(p => p.id === homeLeadership?.captainId)
  const awayCaptainPresent = awayPlayers.some(p => p.id === awayLeadership?.captainId)

  return {
    rng,
    input,
    homeActivePlayers: [...homePlayers],
    awayActivePlayers: [...awayPlayers],
    homePlayers,
    awayPlayers,
    homeSubstitute,
    awaySubstitute,
    homeStats,
    awayStats,
    homeScores: [],
    awayScores: [],
    keyEvents,
    currentHomeTotal: 0,
    currentAwayTotal: 0,
    quartersCompleted: 0,
    homeMods,
    awayMods,
    matchup,
    homeTactical,
    awayTactical,
    resolvedHomeGameplan,
    resolvedAwayGameplan,
    homeTeamFreeRisk,
    awayTeamFreeRisk,
    weather,
    adjustedHomeRating,
    adjustedAwayRating,
    homeCaptainPresent,
    awayCaptainPresent,
    quartersPerMatch,
    possessionsBase,
    pointsPerGoal,
    pointsPerBehind,
    substitutesEnabled,
    suspensionStrictness,
    attendanceResult,
    venueId,
    homeClubTacticalIdentity: clubs[homeClubId]?.tacticalIdentity,
    awayClubTacticalIdentity: clubs[awayClubId]?.tacticalIdentity,
    midMatchAdjustments: [],
    midMatchInjuredPlayerIds: new Set(),
    positionOverrides: new Map(),
    userSubActivated: false,
    effectiveAggressionQuarters: [],
    quarterStartDisposals: new Map(),
  }
}

export function simulateQuarter(ctx: MatchContext, quarterIndex: number): void {
  const {
    rng, input, homeStats, awayStats, keyEvents,
    homeMods, awayMods, matchup, homeTactical, awayTactical,
    weather, homeTeamFreeRisk, awayTeamFreeRisk,
    adjustedHomeRating, adjustedAwayRating,
    homeCaptainPresent, awayCaptainPresent,
    possessionsBase, pointsPerGoal, pointsPerBehind,
    suspensionStrictness, positionOverrides,
    resolvedHomeGameplan, resolvedAwayGameplan,
  } = ctx
  const { homeClubId, awayClubId, isFinal } = input

  // Use active players (may be reduced by mid-match injuries)
  const homePlayers = ctx.homeActivePlayers
  const awayPlayers = ctx.awayActivePlayers

  // Snapshot disposals at quarter start for tag-failing detection
  for (const stat of [...homeStats, ...awayStats]) {
    ctx.quarterStartDisposals.set(stat.playerId, stat.disposals)
  }

  let homeGoals = 0
  let homeBehinds = 0
  let awayGoals = 0
  let awayBehinds = 0

  const avgPossessionBonus = Math.round((homeMods.possessionBonus + awayMods.possessionBonus) / 2)
  const possessions = Math.max(
    65,
    Math.round((possessionsBase + avgPossessionBonus + rng.nextInt(-20, 20)) * weather.possessionMult),
  )

  for (let p = 0; p < possessions; p++) {
    const homeChance = adjustedHomeRating / (adjustedHomeRating + adjustedAwayRating)
    const homeWins = rng.chance(homeChance)

    const attackingPlayers = homeWins ? homePlayers : awayPlayers
    const attackingStats = homeWins ? homeStats : awayStats
    const attackClubId = homeWins ? homeClubId : awayClubId
    const defendingPlayers = homeWins ? awayPlayers : homePlayers
    const attMods = homeWins ? homeMods : awayMods
    const defMods = homeWins ? awayMods : homeMods
    const attackingGameplan = homeWins ? resolvedHomeGameplan : resolvedAwayGameplan
    const matchupInside50Mult = homeWins ? matchup.homeInside50Mult : matchup.awayInside50Mult
    const matchupAccuracyMult = homeWins ? matchup.homeAccuracyMult : matchup.awayAccuracyMult
    const matchupMarkMult = homeWins ? matchup.homeMarkMult : matchup.awayMarkMult
    const matchupTurnoverMult = homeWins ? matchup.homeTurnoverMult : matchup.awayTurnoverMult
    const matchupTackleMult = homeWins ? matchup.awayTackleMult : matchup.homeTackleMult
    const defendingTeamFreeRisk = homeWins ? awayTeamFreeRisk : homeTeamFreeRisk
    const attackingTeamFreeRisk = homeWins ? homeTeamFreeRisk : awayTeamFreeRisk
    const defendingTactical = homeWins ? awayTactical : homeTactical
    const surfaceContext = {
      contestedBoost: weather.contestedPlayerBoost,
      kickingPenalty: Math.max(0, 1 - weather.kickingEfficiencyMult),
    }

    const currentMargin = Math.abs(
      (ctx.currentHomeTotal + homeGoals * pointsPerGoal + homeBehinds * pointsPerBehind) -
      (ctx.currentAwayTotal + awayGoals * pointsPerGoal + awayBehinds * pointsPerBehind),
    )
    const attClutchCtx: ClutchContext = {
      quarter: quarterIndex,
      margin: currentMargin,
      isFinal: !!isFinal,
      captainPresent: homeWins ? homeCaptainPresent : awayCaptainPresent,
    }
    const defClutchCtx: ClutchContext = {
      quarter: quarterIndex,
      margin: currentMargin,
      isFinal: !!isFinal,
      captainPresent: homeWins ? awayCaptainPresent : homeCaptainPresent,
    }

    const primaryPlayer = pickWeightedPlayer(rng, attackingPlayers, surfaceContext, attClutchCtx)
    const primaryStatIndex = attackingStats.findIndex((s) => s.playerId === primaryPlayer.id)
    const primaryRatings = getGranularRatings(primaryPlayer)
    const tacticalFocus = defendingTactical.focusByTarget.get(primaryPlayer.id)
    const tagPenalty = tacticalFocus?.tagPressure ?? 0
    const roughPenalty = tacticalFocus?.roughPressure ?? 0
    const pressurePenalty = tagPenalty + roughPenalty * 0.6

    const targetKH = attackingGameplan.targetKHRatio ?? 1.5
    const kickProbFromTarget = targetKH / (targetKH + 1)
    const isKick = rng.chance(Math.max(0.30, Math.min(0.80, kickProbFromTarget)))
    if (isKick) {
      attackingStats[primaryStatIndex].kicks++
    } else {
      attackingStats[primaryStatIndex].handballs++
    }
    attackingStats[primaryStatIndex].disposals++
    if (isKick) {
      const kickExecution = clampChance(
        weather.kickingEfficiencyMult * (0.62 + primaryRatings.kicking / 260) * (1 - pressurePenalty * 0.34),
      )
      if (!rng.chance(kickExecution)) {
        attackingStats[primaryStatIndex].turnovers++
        if (rng.chance(0.55)) attackingStats[primaryStatIndex].clangers++
        continue
      }
    }

    const contestedChance = clampChance(
      (0.22 + primaryRatings.strength * 0.0012 + primaryRatings.tackling * 0.0012)
      * attMods.contestedMult
      * weather.contestedMult
      * (1 + tagPenalty * 0.1),
    )
    if (rng.chance(contestedChance)) {
      attackingStats[primaryStatIndex].contestedPossessions++
      const attackerFreeRisk = getPlayerFreeRiskMultiplier(primaryPlayer, weather)
      const holdingBallChance = clampChance(0.006 * attackingTeamFreeRisk * attackerFreeRisk)
      if (rng.chance(holdingBallChance)) {
        const tackler = pickWeightedPlayer(rng, defendingPlayers, surfaceContext, defClutchCtx)
        const defStats = homeWins ? awayStats : homeStats
        const tacklerIdx = defStats.findIndex((s) => s.playerId === tackler.id)
        attackingStats[primaryStatIndex].freesAgainst++
        if (tacklerIdx >= 0) defStats[tacklerIdx].freesFor++
        continue
      }
      const clearanceChance = clampChance(0.1 + primaryPlayer.attributes.clearance * 0.003 + primaryRatings.decisionMaking * 0.0015)
      if (rng.chance(clearanceChance)) {
        attackingStats[primaryStatIndex].clearances++
      }
    } else {
      const uncontestedRoll = 0.65 + (primaryRatings.decisionMaking + primaryRatings.agility) / 220
      const uncontestedChance = clampChance(uncontestedRoll * attMods.uncontestedMult * (1 - pressurePenalty * 0.22))
      if (rng.chance(uncontestedChance)) {
        attackingStats[primaryStatIndex].uncontestedPossessions++
        attackingStats[primaryStatIndex].uncountestedPossessions = attackingStats[primaryStatIndex].uncontestedPossessions
      }
    }

    const markBaseChance = clampChance(
      (0.09 + primaryRatings.kicking * 0.001 + primaryRatings.decisionMaking * 0.0009)
      * attMods.markMult
      * matchupMarkMult
      * weather.markMult,
    )
    if (rng.chance(markBaseChance)) {
      const marker = pickWeightedPlayer(rng, attackingPlayers, surfaceContext, attClutchCtx)
      const markerIdx = attackingStats.findIndex((s) => s.playerId === marker.id)
      const markerRatings = getGranularRatings(marker)
      const completesMark = rng.chance(clampChance(0.2 + markerRatings.marking * 0.006))
      if (!completesMark) {
        continue
      }
      attackingStats[markerIdx].marks++
      if (rng.chance(clampChance(0.08 + marker.attributes.markingContested * 0.005))) {
        attackingStats[markerIdx].contestedMarks++
      }
    }

    const tackleBaseChance = clampChance(
      (0.07 + ((100 - primaryRatings.agility) * 0.001) + ((100 - primaryRatings.discipline) * 0.0008))
      * defMods.tackleMult
      * matchupTackleMult
      * (1 + roughPenalty * 0.35),
    )
    if (rng.chance(tackleBaseChance)) {
      const tackler = pickWeightedPlayer(rng, defendingPlayers, surfaceContext, defClutchCtx)
      const defStats = homeWins ? awayStats : homeStats
      const tacklerIdx = defStats.findIndex((s) => s.playerId === tackler.id)
      const tacklerRatings = getGranularRatings(tackler)
      const tackleGain = rng.chance(
        clampChance(
          getRoleSimulationMultiplier(tackler.preferredRole, 'defense') - 0.95 +
          tacklerRatings.tackling * 0.0025 +
          tacklerRatings.strength * 0.0015,
        ),
      ) ? 2 : 1
      defStats[tacklerIdx].tackles += tackleGain

      const tacklerFreeRisk = getPlayerFreeRiskMultiplier(tackler, weather)
      const highContactChance = clampChance(
        0.0075 *
        defendingTeamFreeRisk *
        tacklerFreeRisk *
        matchupTackleMult *
        (1 + (tacticalFocus?.extraFreeRisk ?? 0) * 2.8) *
        suspensionStrictness,
      )
      if (rng.chance(highContactChance)) {
        defStats[tacklerIdx].freesAgainst++
        attackingStats[primaryStatIndex].freesFor++
      }
    }

    if (rng.chance(0.08 * attMods.hitoutMult)) {
      const ruck = attackingPlayers.find((pl) => pl.position.primary === 'RK')
      if (ruck) {
        const ruckIdx = attackingStats.findIndex((s) => s.playerId === ruck.id)
        const ruckSkill = (ruck.attributes.hitouts + ruck.attributes.leap + ruck.attributes.strength) / 3
        const hitoutGain = rng.chance(
          clampChance(getRoleSimulationMultiplier(ruck.preferredRole, 'ruck') - 0.9 + ruckSkill * 0.003),
        ) ? 2 : 1
        attackingStats[ruckIdx].hitouts += hitoutGain
      }
    }

    const inside50Chance = clampChance(
      (0.14 + primaryRatings.kicking * 0.0014 + primaryRatings.speed * 0.0008 + primaryRatings.decisionMaking * 0.0012)
      * attMods.inside50Mult
      * matchupInside50Mult
      * (1 - pressurePenalty * 0.18),
    )
    if (rng.chance(inside50Chance)) {
      const i50Player = pickWeightedPlayer(rng, attackingPlayers, surfaceContext, attClutchCtx)
      const i50Idx = attackingStats.findIndex((s) => s.playerId === i50Player.id)
      const i50Ratings = getGranularRatings(i50Player)
      attackingStats[i50Idx].insideFifties++

      const scoreChance = clampChance(0.16 + i50Ratings.decisionMaking * 0.0015 + i50Ratings.kicking * 0.001)
      if (rng.chance(scoreChance)) {
        const scorer = pickScoringPlayer(rng, attackingPlayers, attClutchCtx, positionOverrides)
        const scorerIdx = attackingStats.findIndex((s) => s.playerId === scorer.id)
        const scorerRatings = getGranularRatings(scorer)

        const goalChance = clampChance(
          (0.2 + scorerRatings.goalSense * 0.005 + scorerRatings.kicking * 0.001)
          * attMods.accuracyMult,
        )
        if (rng.chance(clampChance(goalChance * matchupAccuracyMult * weather.accuracyMult))) {
          if (homeWins) homeGoals++
          else awayGoals++
          attackingStats[scorerIdx].goals++
          attackingStats[scorerIdx].scoreInvolvements++

          if (i50Player.id !== scorer.id) {
            attackingStats[i50Idx].goalAssists++
            attackingStats[i50Idx].scoreInvolvements++
          }

          keyEvents.push({
            quarter: quarterIndex + 1,
            minute: Math.floor((p / possessions) * 30),
            type: 'goal',
            description: `${scorer.firstName} ${scorer.lastName} kicks a goal`,
            playerId: scorer.id,
            clubId: attackClubId,
          })
        } else {
          if (homeWins) homeBehinds++
          else awayBehinds++
          attackingStats[scorerIdx].behinds++
        }
      }
    }

    const reboundChance = clampChance((0.08 + primaryRatings.discipline * 0.0008) * attMods.opponentReboundMult)
    if (!homeWins && rng.chance(reboundChance)) {
      const rebounder = pickWeightedPlayer(rng, defendingPlayers, surfaceContext, defClutchCtx)
      const rebStats = homeWins ? awayStats : homeStats
      const rebIdx = rebStats.findIndex((s) => s.playerId === rebounder.id)
      rebStats[rebIdx].rebound50s++
    }

    attackingStats[primaryStatIndex].metresGained += Math.max(
      1,
      Math.round(rng.nextInt(4, 20) * (0.75 + (primaryRatings.speed + primaryRatings.kicking) / 200)),
    )

    const turnoverChance = clampChance(
      (
        0.2
        - primaryRatings.decisionMaking * 0.0012
        - primaryRatings.kicking * 0.0008
        + (100 - primaryRatings.discipline) * 0.0006
      ) * matchupTurnoverMult * weather.turnoverMult * (1 + pressurePenalty * 0.28),
    )
    if (rng.chance(turnoverChance)) {
      attackingStats[primaryStatIndex].turnovers++
      if (rng.chance(clampChance(0.3 + (100 - primaryRatings.decisionMaking) * 0.004))) {
        attackingStats[primaryStatIndex].clangers++
      }
    }

    const interceptBaseChance = clampChance(0.03 + (100 - primaryRatings.kicking) * 0.0007 + (100 - primaryRatings.decisionMaking) * 0.0008)
    if (rng.chance(interceptBaseChance)) {
      const interceptor = pickWeightedPlayer(rng, defendingPlayers, surfaceContext, defClutchCtx)
      const defStats = homeWins ? awayStats : homeStats
      const intIdx = defStats.findIndex((s) => s.playerId === interceptor.id)
      const interceptorRatings = getGranularRatings(interceptor)
      const interceptBoost = (homeWins ? awayTactical : homeTactical).interceptBoostByPlayer.get(interceptor.id) ?? 0
      const interceptGain = rng.chance(
        clampChance(
          getRoleSimulationMultiplier(interceptor.preferredRole, 'defense') - 0.92 +
          interceptorRatings.intercepting * 0.002 +
          interceptorRatings.spoiling * 0.0012 +
          interceptBoost,
        ),
      ) ? 2 : 1
      defStats[intIdx].intercepts += interceptGain
    }

    if (rng.chance(0.03 + averageGranularRating(defendingPlayers, 'spoiling') * 0.00035)) {
      const defender = pickWeightedPlayer(rng, defendingPlayers, surfaceContext, defClutchCtx)
      const defStats = homeWins ? awayStats : homeStats
      const defIdx = defStats.findIndex((s) => s.playerId === defender.id)
      defStats[defIdx].onePercenters++
    }

    if (rng.chance(clampChance(0.01 + primaryRatings.speed * 0.0002 + primaryRatings.agility * 0.0002))) {
      attackingStats[primaryStatIndex].bounces++
    }
  }

  const homeQScore = homeGoals * pointsPerGoal + homeBehinds * pointsPerBehind
  const awayQScore = awayGoals * pointsPerGoal + awayBehinds * pointsPerBehind
  ctx.homeScores.push({ goals: homeGoals, behinds: homeBehinds, total: homeQScore })
  ctx.awayScores.push({ goals: awayGoals, behinds: awayBehinds, total: awayQScore })
  ctx.currentHomeTotal += homeQScore
  ctx.currentAwayTotal += awayQScore
  ctx.quartersCompleted++
}

export function finalizeMatch(ctx: MatchContext, skipUserSubForSide?: 'home' | 'away'): Match {
  const {
    rng, input, homeStats, awayStats, homePlayers, awayPlayers,
    homeScores, awayScores, keyEvents,
    homeMods, awayMods, homeTactical, awayTactical,
    homeSubstitute, awaySubstitute, weather,
    resolvedHomeGameplan, resolvedAwayGameplan,
    homeTeamFreeRisk, awayTeamFreeRisk,
    substitutesEnabled, venueId,
    adjustedHomeRating, adjustedAwayRating,
    attendanceResult, midMatchAdjustments, midMatchInjuredPlayerIds,
    effectiveAggressionQuarters,
  } = ctx
  const { homeClubId, awayClubId, venue, round, isFinal, finalType } = input
  const homeVenueFamiliarity = getVenueFamiliarityRatingBonus(homeClubId, venueId)
  const awayVenueFamiliarity = getVenueFamiliarityRatingBonus(awayClubId, venueId)

  const homeTotalScore = homeScores.reduce((s, q) => s + q.total, 0)
  const awayTotalScore = awayScores.reduce((s, q) => s + q.total, 0)

  if (substitutesEnabled) {
    if (skipUserSubForSide !== 'home') {
      applySubstituteStrategy({
        rng,
        teamStats: homeStats,
        teamPlayers: homePlayers,
        substitute: homeSubstitute,
        teamScore: homeTotalScore,
        opponentScore: awayTotalScore,
        gameplan: resolvedHomeGameplan,
      })
    }
    if (skipUserSubForSide !== 'away') {
      applySubstituteStrategy({
        rng,
        teamStats: awayStats,
        teamPlayers: awayPlayers,
        substitute: awaySubstitute,
        teamScore: awayTotalScore,
        opponentScore: homeTotalScore,
        gameplan: resolvedAwayGameplan,
      })
    }
  }

  rebalanceTeamStatProfile(rng, homeStats, homePlayers, homeMods, weather)
  rebalanceTeamStatProfile(rng, awayStats, awayPlayers, awayMods, weather)

  for (const [teamStats, teamPlayers, teamRisk] of [
    [homeStats, homePlayers, homeTeamFreeRisk],
    [awayStats, awayPlayers, awayTeamFreeRisk],
  ] as const) {
    const playerMap = new Map(teamPlayers.map((pl) => [pl.id, pl]))
    for (const stat of teamStats) {
      const player = playerMap.get(stat.playerId)
      if (!player) continue
      if (stat.selectedAsSubstitute && !stat.participated) continue
      const playerRisk = getPlayerFreeRiskMultiplier(player, weather)
      const backgroundAgainstChance = clampChance(0.16 * (teamRisk - 0.45) * playerRisk)
      const bonusAgainst = rng.chance(backgroundAgainstChance) ? rng.nextInt(0, 2) : 0
      stat.freesAgainst += bonusAgainst

      const discipline = getGranularRatings(player).discipline
      const pressureForChance = clampChance(0.1 + player.attributes.pressure * 0.0012 + discipline * 0.0008)
      if (rng.chance(pressureForChance)) {
        stat.freesFor += rng.nextInt(0, 2)
      }

      const extraLoad =
        (homeTactical.fatigueLoadByPlayer.get(stat.playerId) ?? 0) +
        (awayTactical.fatigueLoadByPlayer.get(stat.playerId) ?? 0)
      if (!stat.participated && stat.minutesPlayed <= 0) continue
      stat.minutesPlayed = Math.min(120, stat.minutesPlayed > 0
        ? stat.minutesPlayed + Math.round(extraLoad * rng.nextInt(1, 3))
        : estimateMinutesPlayed(stat) + Math.round(extraLoad * rng.nextInt(3, 6)))
      stat.participated = stat.minutesPlayed > 0
    }
  }

  for (const stat of [...homeStats, ...awayStats]) {
    stat.aflFantasyPoints = computeAFLFantasyPoints(stat)
  }
  assignSuperCoachPoints(homeStats, awayStats, homeTotalScore, awayTotalScore)

  // Compute effective aggression level from quarter history
  let effectiveAggressionLevel: 'high' | 'medium' | 'low' = 'medium'
  if (effectiveAggressionQuarters.length > 0) {
    const counts = { high: 0, medium: 0, low: 0 }
    for (const a of effectiveAggressionQuarters) counts[a]++
    if (counts.high > counts.medium && counts.high > counts.low) effectiveAggressionLevel = 'high'
    else if (counts.low > counts.medium && counts.low > counts.high) effectiveAggressionLevel = 'low'
  }

  const result: MatchResult = {
    homeScores,
    awayScores,
    homeTotalScore,
    awayTotalScore,
    homePlayerStats: homeStats,
    awayPlayerStats: awayStats,
    keyEvents,
    midMatchAdjustments: midMatchAdjustments.length > 0 ? midMatchAdjustments : undefined,
    midMatchInjuredPlayerIds: midMatchInjuredPlayerIds.size > 0 ? [...midMatchInjuredPlayerIds] : undefined,
    effectiveAggressionLevel: effectiveAggressionQuarters.length > 0 ? effectiveAggressionLevel : undefined,
    simulationContext: {
      weather: weather.condition,
      groundCondition: weather.groundCondition,
      venueId,
      venueFamiliarity: { home: homeVenueFamiliarity, away: awayVenueFamiliarity },
      travelFatigue: {
        home: input.travelFatigue?.home ?? 0,
        away: input.travelFatigue?.away ?? 0,
      },
      ratingInputs: { home: adjustedHomeRating, away: adjustedAwayRating },
      umpiringRisk: { home: homeTeamFreeRisk, away: awayTeamFreeRisk },
      attendance: attendanceResult?.attendance,
      capacityPct: attendanceResult?.capacityPct,
    },
  }

  return {
    id: `match-${round}-${homeClubId}-${awayClubId}`,
    round,
    homeClubId,
    awayClubId,
    venue,
    date: '',
    result,
    isFinal: isFinal ?? false,
    finalType,
  }
}

export function simulateMatch(input: SimulateMatchInput): Match {
  const ctx = createMatchContext(input)
  for (let q = 0; q < ctx.quartersPerMatch; q++) {
    simulateQuarter(ctx, q)
  }
  return finalizeMatch(ctx)
}

function rebalanceTeamStatProfile(
  rng: SeededRNG,
  teamStats: MatchPlayerStats[],
  teamPlayers: Player[],
  mods: GameplanModifiers,
  weather: WeatherModifiers,
): void {
  if (teamStats.length === 0 || teamPlayers.length === 0) return
  const playerById = new Map(teamPlayers.map((p) => [p.id, p]))

  const paceMult = clampMultiplier(1 + mods.possessionBonus / 180, 0.9, 1.08) * weather.possessionMult
  const contestMult = clampMultiplier(1 + (mods.contestedMult - 1) * 0.45 + (weather.contestedMult - 1) * 0.4, 0.9, 1.12)
  const marksMult = clampMultiplier(weather.markMult * mods.markMult, 0.84, 1.08)

  const disposalTarget = Math.max(
    285,
    Math.round((TEAM_STAT_TARGETS.disposals.base + rng.nextInt(-TEAM_STAT_TARGETS.disposals.spread, TEAM_STAT_TARGETS.disposals.spread + 1)) * paceMult),
  )
  const marksTarget = Math.max(
    58,
    Math.round((TEAM_STAT_TARGETS.marks.base + rng.nextInt(-TEAM_STAT_TARGETS.marks.spread, TEAM_STAT_TARGETS.marks.spread + 1)) * marksMult * (0.95 + paceMult * 0.05)),
  )
  const tacklesTarget = Math.max(
    36,
    Math.round((TEAM_STAT_TARGETS.tackles.base + rng.nextInt(-TEAM_STAT_TARGETS.tackles.spread, TEAM_STAT_TARGETS.tackles.spread + 1)) * contestMult),
  )

  const disposalAllocation = allocateTeamStatByLine(rng, teamStats, teamPlayers, 'disposals', disposalTarget)
  const marksAllocation = allocateTeamStatByLine(rng, teamStats, teamPlayers, 'marks', marksTarget)
  const tacklesAllocation = allocateTeamStatByLine(rng, teamStats, teamPlayers, 'tackles', tacklesTarget)

  for (let i = 0; i < teamStats.length; i++) {
    const stat = teamStats[i]
    const player = playerById.get(stat.playerId)

    const oldDisposals = Math.max(0, stat.disposals)
    const newDisposals = Math.max(0, disposalAllocation[i] ?? 0)
    const oldKickShare = oldDisposals > 0
      ? stat.kicks / oldDisposals
      : player
        ? clampChance(0.48 + (getGranularRatings(player).kicking - 50) / 250)
        : 0.55
    const kicks = Math.min(newDisposals, Math.round(newDisposals * oldKickShare))
    stat.disposals = newDisposals
    stat.kicks = kicks
    stat.handballs = Math.max(0, newDisposals - kicks)

    const oldContestedShare = oldDisposals > 0
      ? stat.contestedPossessions / oldDisposals
      : player
        ? clampChance(0.28 + (player.attributes.contested + player.attributes.clearance + player.attributes.hardness) / 460)
        : 0.38
    const contested = Math.max(0, Math.min(newDisposals, Math.round(newDisposals * oldContestedShare)))
    stat.contestedPossessions = contested
    stat.uncontestedPossessions = Math.max(0, newDisposals - contested)
    stat.uncountestedPossessions = stat.uncontestedPossessions

    const metresPerDisposal = oldDisposals > 0 ? stat.metresGained / oldDisposals : 11
    stat.metresGained = Math.max(0, Math.round(newDisposals * metresPerDisposal))

    const marks = Math.max(0, marksAllocation[i] ?? 0)
    stat.marks = marks
    stat.contestedMarks = Math.min(marks, stat.contestedMarks)

    stat.tackles = Math.max(0, tacklesAllocation[i] ?? 0)
  }
}

function allocateTeamStatByLine(
  rng: SeededRNG,
  stats: MatchPlayerStats[],
  players: Player[],
  stat: RebalancedStat,
  teamTarget: number,
): number[] {
  const playerById = new Map(players.map((p) => [p.id, p]))
  const idxByLine: Record<TeamLine, number[]> = { DEF: [], MID: [], FWD: [], RK: [] }
  for (let i = 0; i < stats.length; i++) {
    const player = playerById.get(stats[i].playerId)
    const line: TeamLine = player ? POSITION_LINE[player.position.primary] : 'MID'
    idxByLine[line].push(i)
  }

  const lineTargets = allocateByWeights(
    teamTarget,
    (['DEF', 'MID', 'FWD', 'RK'] as TeamLine[]).map((line) => TEAM_LINE_SHARES[stat][line]),
  )

  const allocation = new Array<number>(stats.length).fill(0)
  for (const [lineIndex, line] of (['DEF', 'MID', 'FWD', 'RK'] as TeamLine[]).entries()) {
    const indices = idxByLine[line]
    if (indices.length === 0) continue
    const lineTarget = lineTargets[lineIndex] ?? 0
    if (lineTarget <= 0) continue

    const weights = indices.map((idx) => {
      const s = stats[idx]
      const player = playerById.get(s.playerId)
      const g = player ? getGranularRatings(player) : null
      const selectedAsSub = s.selectedAsSubstitute ? 0.42 : 1
      if (stat === 'disposals') {
        const base = 2.6 + s.disposals * 0.9
        const skill = g ? ((g.decisionMaking + g.endurance + g.kicking) / 150) : 1
        return Math.max(0.25, base * skill * selectedAsSub)
      }
      if (stat === 'marks') {
        const base = 0.9 + s.marks * 0.95
        const skill = g ? ((g.marking + g.intercepting) / 170) : 1
        return Math.max(0.2, base * skill * selectedAsSub)
      }
      const base = 1.1 + s.tackles * 0.95
      const skill = g ? ((g.tackling + g.strength) / 165) : 1
      return Math.max(0.2, base * skill * selectedAsSub)
    })

    const lineAlloc = allocateByWeights(lineTarget, weights, rng)
    for (let i = 0; i < indices.length; i++) {
      allocation[indices[i]] += lineAlloc[i] ?? 0
    }
  }
  return allocation
}

function allocateByWeights(total: number, weights: number[], rng?: SeededRNG): number[] {
  if (weights.length === 0) return []
  const safe = weights.map((w) => Math.max(0, Number.isFinite(w) ? w : 0))
  const sum = safe.reduce((acc, w) => acc + w, 0)
  if (sum <= 0) {
    const even = Math.floor(total / weights.length)
    const out = new Array<number>(weights.length).fill(even)
    let rem = total - even * weights.length
    let cursor = 0
    while (rem > 0) {
      out[cursor % out.length] += 1
      rem--
      cursor++
    }
    return out
  }

  const scaled = safe.map((w) => (w / sum) * total)
  const floored = scaled.map((v) => Math.floor(v))
  let remainder = total - floored.reduce((acc, v) => acc + v, 0)
  const order = scaled
    .map((v, idx) => ({
      idx,
      frac: v - floored[idx],
      tie: rng ? rng.next() : idx / scaled.length,
    }))
    .sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac
      return b.tie - a.tie
    })

  let cursor = 0
  while (remainder > 0 && order.length > 0) {
    floored[order[cursor % order.length].idx] += 1
    remainder--
    cursor++
  }
  return floored
}

function initPlayerStats(players: Player[], substitute?: Player | null): MatchPlayerStats[] {
  const stats: MatchPlayerStats[] = players.map((p) => ({
    playerId: p.id,
    participated: false,
    minutesPlayed: 0,
    aflFantasyPoints: 0,
    superCoachPoints: 0,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    tackles: 0,
    goals: 0,
    behinds: 0,
    hitouts: 0,
    contestedPossessions: 0,
    uncontestedPossessions: 0,
    uncountestedPossessions: 0,
    clearances: 0,
    insideFifties: 0,
    rebound50s: 0,
    freesFor: 0,
    freesAgainst: 0,
    contestedMarks: 0,
    scoreInvolvements: 0,
    metresGained: 0,
    turnovers: 0,
    intercepts: 0,
    onePercenters: 0,
    bounces: 0,
    clangers: 0,
    goalAssists: 0,
  }))
  if (substitute) {
    stats.push({
      playerId: substitute.id,
      participated: false,
      selectedAsSubstitute: true,
      minutesPlayed: 0,
      aflFantasyPoints: 0,
      superCoachPoints: 0,
      disposals: 0,
      kicks: 0,
      handballs: 0,
      marks: 0,
      tackles: 0,
      goals: 0,
      behinds: 0,
      hitouts: 0,
      contestedPossessions: 0,
      uncontestedPossessions: 0,
      uncountestedPossessions: 0,
      clearances: 0,
      insideFifties: 0,
      rebound50s: 0,
      freesFor: 0,
      freesAgainst: 0,
      contestedMarks: 0,
      scoreInvolvements: 0,
      metresGained: 0,
      turnovers: 0,
      intercepts: 0,
      onePercenters: 0,
      bounces: 0,
      clangers: 0,
      goalAssists: 0,
    })
  }
  return stats
}

function applySubstituteStrategy(params: {
  rng: SeededRNG
  teamStats: MatchPlayerStats[]
  teamPlayers: Player[]
  substitute: Player | null
  teamScore: number
  opponentScore: number
  gameplan: ClubGameplan
}): void {
  const { rng, teamStats, substitute, teamScore, opponentScore, gameplan } = params
  if (!substitute) return
  const subStats = teamStats.find((s) => s.playerId === substitute.id)
  if (!subStats) return

  const margin = Math.abs(teamScore - opponentScore)
  const trailing = teamScore < opponentScore
  const comfortablyAhead = teamScore - opponentScore >= 24
  let activateChance = 0.28
  if (margin <= 18) activateChance += 0.2
  if (trailing) activateChance += 0.12
  if (gameplan.rotations === 'high') activateChance += 0.1
  if (gameplan.aggression === 'high') activateChance += 0.04
  if (comfortablyAhead) activateChance -= 0.12
  if (!rng.chance(clampChance(activateChance))) return

  subStats.participated = true
  subStats.minutesPlayed = rng.nextInt(16, 42)

  const impactScale = subStats.minutesPlayed / 120
  const ratings = getGranularRatings(substitute)
  const disposals = Math.max(2, Math.round(3 + impactScale * (9 + ratings.decisionMaking / 16) + rng.nextInt(0, 3)))
  const kickShare = clampChance(0.45 + (ratings.kicking - 50) / 220)
  const kicks = Math.min(disposals, Math.round(disposals * kickShare))
  const handballs = Math.max(0, disposals - kicks)
  const tackles = Math.max(0, Math.round(impactScale * (2 + ratings.tackling / 45) + rng.nextInt(0, 2)))

  subStats.disposals += disposals
  subStats.kicks += kicks
  subStats.handballs += handballs
  subStats.tackles += tackles
  subStats.contestedPossessions += Math.max(0, Math.round(disposals * 0.42))
  subStats.uncontestedPossessions += Math.max(0, disposals - subStats.contestedPossessions)
  subStats.uncountestedPossessions = subStats.uncontestedPossessions
  subStats.marks += Math.max(0, Math.round(disposals * 0.25))
  subStats.clearances += Math.max(0, Math.round(impactScale * (1 + ratings.decisionMaking / 80)))
  subStats.insideFifties += Math.max(0, Math.round(impactScale * (1 + ratings.kicking / 90)))
  subStats.rebound50s += Math.max(0, Math.round(impactScale * (1 + ratings.intercepting / 90)))
  subStats.metresGained += Math.round(disposals * (12 + ratings.speed / 7))
  subStats.intercepts += Math.max(0, Math.round(impactScale * (ratings.intercepting / 70)))
  subStats.onePercenters += Math.max(0, Math.round(impactScale * (ratings.spoiling / 95)))
  if (rng.chance(clampChance(0.08 + ratings.goalSense * 0.001))) {
    subStats.goals += 1
    subStats.scoreInvolvements += 1
  } else if (rng.chance(clampChance(0.1 + ratings.goalSense * 0.0012))) {
    subStats.behinds += 1
  }
}

interface ClutchContext {
  quarter: number
  margin: number
  isFinal: boolean
  captainPresent: boolean
}

function pickWeightedPlayer(
  rng: SeededRNG,
  players: Player[],
  surface?: { contestedBoost: number; kickingPenalty: number },
  clutchCtx?: ClutchContext,
): Player {
  // Weight by granular ball-winning profile + role influence.
  const weights = players.map((p) =>
    {
      const granular = getGranularRatings(p)
      const contestedProfile = (p.attributes.contested + p.attributes.hardness + p.attributes.tackling) / 3
      const contestedMult = 1 + (contestedProfile / 100) * (surface?.contestedBoost ?? 0)
      const kickingSkill = granular.kicking / 100
      const kickingMult = 1 - (Math.max(0, 1 - kickingSkill) * (surface?.kickingPenalty ?? 0))
      const moraleMult = getMoraleModifier(p.morale)
      const clutchMult = clutchCtx
        ? getClutchModifier(p, clutchCtx.quarter, clutchCtx.margin, clutchCtx.isFinal, clutchCtx.captainPresent)
        : 1.0
      return (
      getOverall(p) * 0.45 +
      granular.decisionMaking * 0.2 +
      granular.endurance * 0.15 +
      granular.speed * 0.1 +
      granular.kicking * 0.1
      ) *
      getAvailabilityMultiplier(p) *
      getRoleSimulationMultiplier(p.preferredRole, 'general') *
      contestedMult *
      kickingMult *
      moraleMult *
      clutchMult
    },
  )
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let r = rng.next() * totalWeight
  for (let i = 0; i < players.length; i++) {
    r -= weights[i]
    if (r <= 0) return players[i]
  }
  return players[players.length - 1]
}

function pickScoringPlayer(rng: SeededRNG, players: Player[], clutchCtx?: ClutchContext, positionOverrides?: Map<string, 'forward' | 'back'>): Player {
  // Weight toward forwards using position modifier and goalkicking ability
  const weights = players.map((p) => {
    const moraleMult = getMoraleModifier(p.morale)
    const clutchMult = clutchCtx
      ? getClutchModifier(p, clutchCtx.quarter, clutchCtx.margin, clutchCtx.isFinal, clutchCtx.captainPresent)
      : 1.0
    const override = positionOverrides?.get(p.id)
    const forwardMod = getForwardModifier(p) * (override === 'forward' ? 1.5 : override === 'back' ? 0.4 : 1)
    return forwardMod *
      (getGranularRatings(p).goalSense * 0.65 + getGranularRatings(p).marking * 0.2 + getGranularRatings(p).agility * 0.15 + 16) *
      getAvailabilityMultiplier(p) *
      getRoleSimulationMultiplier(p.preferredRole, 'scoring') *
      moraleMult *
      clutchMult
  })
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let r = rng.next() * totalWeight
  for (let i = 0; i < players.length; i++) {
    r -= weights[i]
    if (r <= 0) return players[i]
  }
  return players[players.length - 1]
}

function computeAFLFantasyPoints(stat: MatchPlayerStats): number {
  // Close to AFL Fantasy Classic scoring:
  // kick=3, handball=2, mark=3, tackle=4, hitout=1, goal=6, behind=1,
  // free for=1, free against=-3.
  const value =
    stat.kicks * 3 +
    stat.handballs * 2 +
    stat.marks * 3 +
    stat.tackles * 4 +
    stat.hitouts +
    stat.goals * 6 +
    stat.behinds +
    stat.freesFor -
    stat.freesAgainst * 3
  return Math.round(value)
}

function computeSuperCoachRawPoints(
  stat: MatchPlayerStats,
  won: boolean,
  margin: number,
): number {
  const closeGameMult = margin <= 12 ? 1.12 : margin <= 24 ? 1.06 : margin >= 48 ? 0.97 : 1
  const resultMult = won ? 1.03 : 0.98

  // Proxy model for SC-style weighting:
  // contested/impact acts are worth more, mistakes penalized.
  const disposalImpact = stat.kicks * 2.5 + stat.handballs * 1.7
  const contestedImpact = stat.contestedPossessions * 3.9 + stat.clearances * 4.2
  const defensiveImpact = stat.intercepts * 3.7 + stat.onePercenters * 1.6 + stat.contestedMarks * 8.2
  const scoreboardImpact =
    stat.goals * 9.1 +
    stat.behinds * 1.3 +
    stat.scoreInvolvements * 2.5 +
    stat.goalAssists * 4.3 +
    stat.insideFifties * 1.25
  const ruckAndPressure = stat.hitouts * 1.1 + stat.tackles * 4.6 + stat.rebound50s * 1.7
  const disciplineAdj = stat.freesFor * 0.9 - stat.freesAgainst * 3.9
  const mistakeAdj = stat.clangers * -4.8 + stat.turnovers * -3.1

  const raw =
    (disposalImpact + contestedImpact + defensiveImpact + scoreboardImpact + ruckAndPressure + disciplineAdj + mistakeAdj) *
    closeGameMult *
    resultMult

  return Math.max(1, raw)
}

function assignSuperCoachPoints(
  homeStats: MatchPlayerStats[],
  awayStats: MatchPlayerStats[],
  homeTotalScore: number,
  awayTotalScore: number,
): void {
  const margin = Math.abs(homeTotalScore - awayTotalScore)
  const homeWon = homeTotalScore > awayTotalScore
  const awayWon = awayTotalScore > homeTotalScore

  const all = [
    ...homeStats.map((stat) => ({ stat, won: homeWon })),
    ...awayStats.map((stat) => ({ stat, won: awayWon })),
  ]
  const raw = all.map((entry) => computeSuperCoachRawPoints(entry.stat, entry.won, margin))
  const totalRaw = raw.reduce((sum, v) => sum + v, 0)
  if (totalRaw <= 0) {
    for (const entry of all) entry.stat.superCoachPoints = 0
    return
  }

  const targetPool = 3300
  const scaled = raw.map((v) => (v / totalRaw) * targetPool)
  const floored = scaled.map((v) => Math.floor(v))
  let remainder = targetPool - floored.reduce((sum, v) => sum + v, 0)

  const order = scaled
    .map((v, idx) => ({ idx, frac: v - floored[idx], raw: raw[idx] }))
    .sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac
      return b.raw - a.raw
    })

  let cursor = 0
  while (remainder > 0 && cursor < order.length) {
    floored[order[cursor].idx] += 1
    remainder--
    cursor++
  }

  for (let i = 0; i < all.length; i++) {
    all[i].stat.superCoachPoints = floored[i]
  }
}

interface GranularRatings {
  speed: number
  endurance: number
  kicking: number
  marking: number
  tackling: number
  strength: number
  decisionMaking: number
  agility: number
  spoiling: number
  intercepting: number
  goalSense: number
  discipline: number
}

function avg(...vals: number[]): number {
  if (vals.length === 0) return 50
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function clampChance(value: number): number {
  return Math.max(0.01, Math.min(0.95, value))
}

function clampMultiplier(value: number, min = 0.82, max = 1.18): number {
  return Math.max(min, Math.min(max, value))
}

function getGranularRatings(player: Player): GranularRatings {
  const a = player.attributes
  return {
    speed: avg(a.speed, a.acceleration, a.workRate),
    endurance: avg(a.endurance, a.recovery, a.workRate),
    kicking: avg(a.kickingEfficiency, a.kickingDistance, a.fieldKicking, a.dropPunt, a.setShot),
    marking: avg(a.markingOverhead, a.markingContested, a.markingUncontested, a.markingLeading),
    tackling: avg(a.tackling, a.pressure, a.hardness, a.oneOnOne),
    strength: avg(a.strength, a.contested, a.hardness),
    decisionMaking: avg(a.disposalDecision, a.positioning, a.anticipation, a.composure, a.consistency),
    agility: avg(a.agility, a.acceleration, a.speed, a.recovery),
    spoiling: avg(a.spoiling, a.oneOnOne, a.zonalAwareness, a.hardness),
    intercepting: avg(a.intercept, a.anticipation, a.zonalAwareness, a.markingContested),
    goalSense: avg(a.goalkicking, a.scoringInstinct, a.insideForward, a.leadingPatterns, a.snap),
    discipline: avg(player.personality.temperament, a.teamPlayer, a.composure, a.pressure),
  }
}

function averageGranularRating(players: Player[], key: keyof GranularRatings): number {
  if (players.length === 0) return 50
  let sum = 0
  for (const p of players) {
    sum += getGranularRatings(p)[key]
  }
  return sum / players.length
}

function estimateMinutesPlayed(stats: MatchPlayerStats): number {
  const workload =
    stats.disposals * 0.7 +
    stats.contestedPossessions * 1.1 +
    stats.tackles * 1.3 +
    stats.hitouts * 0.35 +
    stats.clearances * 0.8 +
    stats.insideFifties * 0.35 +
    stats.rebound50s * 0.4 +
    stats.onePercenters * 0.45
  // Typical AFL range: heavy rotation ~65-85, near full-game ~90-120.
  return Math.max(45, Math.min(120, Math.round(62 + workload * 0.9)))
}

function getAvailabilityMultiplier(player: Player): number {
  const fitnessMult = 0.6 + player.fitness / 250
  const fatigueMult = 1 - player.fatigue / 260
  const injuryMult =
    player.injury
      ? player.injury.weeksRemaining <= 1 ? 0.9 : 0.75
      : 1
  return Math.max(0.5, Math.min(1.05, fitnessMult * fatigueMult * injuryMult))
}
