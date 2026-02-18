import { SeededRNG } from '@/engine/core/rng'
import { QUARTERS_PER_MATCH, POSSESSIONS_PER_QUARTER, POINTS_PER_GOAL, POINTS_PER_BEHIND } from '@/engine/core/constants'
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
import { CLUB_DEFAULT_VENUES, VENUES, VENUE_NAME_TO_ID } from '@/data/venues'
import { getClubState } from '@/engine/venues/venueEngine'
import { getCultureMatchModifier } from '@/engine/culture/cultureEngine'
import { getTacticalModifiers } from '@/engine/core/tacticalIdentity'
import type { TacticalIdentity } from '@/types/club'

interface SimulateMatchInput {
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
}

type WeatherCondition = 'clear' | 'windy' | 'wet' | 'hot' | 'humid'
type GroundCondition = 'firm' | 'dewy' | 'soft' | 'heavy' | 'muddy'

interface WeatherModifiers {
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

interface TacticalRuntime {
  focusByTarget: Map<string, TacticalTargetFocus>
  fatigueLoadByPlayer: Map<string, number>
  interceptBoostByPlayer: Map<string, number>
}

function intensityToWeight(intensity: 'light' | 'standard' | 'hard'): number {
  if (intensity === 'hard') return 1.3
  if (intensity === 'light') return 0.75
  return 1
}

function buildTacticalRuntime(
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

function getClubPlayers(players: Record<string, Player>, clubId: string): Player[] {
  return Object.values(players)
    .filter((p) => p.clubId === clubId && !p.injury && !isPlayerSuspended(p) && p.fitness >= 50)
    .sort((a, b) => getOverall(b) - getOverall(a))
    .slice(0, 22) // Best 22
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

function computeVenueFamiliarityBonus(clubId: string, venueId: string | undefined): number {
  if (!venueId || !VENUES[venueId]) return 0
  const linked = CLUB_DEFAULT_VENUES[clubId]
  if (linked?.primary === venueId) return 2.4
  if (linked?.secondary === venueId) return 1.4
  const venue = VENUES[venueId]
  const clubState = getClubState(clubId)
  if (venue.state === clubState) return 0.9
  return 0
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

interface GameplanModifiers {
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

function applyTacticalIdentityModifiers(mods: GameplanModifiers, identity?: TacticalIdentity): GameplanModifiers {
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

function computeGameplanModifiers(gameplan: ClubGameplan): GameplanModifiers {
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

function applyConditionToGameplanModifiers(
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

export function simulateMatch(input: SimulateMatchInput): Match {
  const rng = new SeededRNG(input.seed)
  const { homeClubId, awayClubId, venue, round, players, clubs, isFinal, finalType, matchRules } = input

  // Use settings-driven values or fall back to constants
  const quartersPerMatch = matchRules?.quartersPerMatch ?? QUARTERS_PER_MATCH
  const possessionsMultiplier = matchRules?.possessionsMultiplier ?? 1.0
  const possessionsBase = Math.round(POSSESSIONS_PER_QUARTER * possessionsMultiplier)
  const pointsPerGoal = matchRules?.pointsPerGoal ?? POINTS_PER_GOAL
  const pointsPerBehind = matchRules?.pointsPerBehind ?? POINTS_PER_BEHIND

  const homePlayers = getClubPlayers(players, homeClubId)
  const awayPlayers = getClubPlayers(players, awayClubId)

  const homeRating = getTeamRating(homePlayers)
  const awayRating = getTeamRating(awayPlayers)

  // Compute gameplan modifiers for both clubs
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
  const homeVenueFamiliarity = computeVenueFamiliarityBonus(homeClubId, venueId)
  const awayVenueFamiliarity = computeVenueFamiliarityBonus(awayClubId, venueId)

  // Home advantage: dynamic from venue system, or fallback to 3
  const homeAdvantage = input.venueHGA ?? 3
  const homeTravelPenalty = (input.travelFatigue?.home ?? 0) * 0.5
  const awayTravelPenalty = (input.travelFatigue?.away ?? 0) * 0.5
  const homeCultureMod = getCultureMatchModifier(clubs[homeClubId]?.culture)
  const awayCultureMod = getCultureMatchModifier(clubs[awayClubId]?.culture)
  const adjustedHomeRating = (homeRating + homeAdvantage + homeVenueFamiliarity - homeTravelPenalty) * homeCultureMod
  const adjustedAwayRating = (awayRating + awayVenueFamiliarity - awayTravelPenalty) * awayCultureMod

  // Initialize stats
  const homeStats = initPlayerStats(homePlayers)
  const awayStats = initPlayerStats(awayPlayers)

  const homeScores: QuarterScore[] = []
  const awayScores: QuarterScore[] = []
  const keyEvents: MatchKeyEvent[] = []
  keyEvents.push({
    quarter: 1,
    minute: 0,
    type: 'milestone',
    description: `Conditions: ${weather.condition}, ground: ${weather.groundCondition}`,
    clubId: homeClubId,
  })

  // Pre-compute leadership context for clutch modifiers
  const homeLeadership = clubs[homeClubId]?.leadership
  const awayLeadership = clubs[awayClubId]?.leadership
  const homeCaptainPresent = homePlayers.some(p => p.id === homeLeadership?.captainId)
  const awayCaptainPresent = awayPlayers.some(p => p.id === awayLeadership?.captainId)

  // Running score totals for clutch margin tracking
  let currentHomeTotal = 0
  let currentAwayTotal = 0

  // Simulate quarter by quarter
  for (let q = 0; q < quartersPerMatch; q++) {
    let homeGoals = 0
    let homeBehinds = 0
    let awayGoals = 0
    let awayBehinds = 0

    // Average both team's possession bonuses for the match pace
    const avgPossessionBonus = Math.round((homeMods.possessionBonus + awayMods.possessionBonus) / 2)
    const possessions = Math.max(
      65,
      Math.round((possessionsBase + avgPossessionBonus + rng.nextInt(-20, 20)) * weather.possessionMult),
    )

    for (let p = 0; p < possessions; p++) {
      // Determine which team wins this possession
      const homeChance = adjustedHomeRating / (adjustedHomeRating + adjustedAwayRating)
      const homeWins = rng.chance(homeChance)

      const attackingPlayers = homeWins ? homePlayers : awayPlayers
      const attackingStats = homeWins ? homeStats : awayStats
      const attackClubId = homeWins ? homeClubId : awayClubId
      const defendingPlayers = homeWins ? awayPlayers : homePlayers
      const attMods = homeWins ? homeMods : awayMods
      const defMods = homeWins ? awayMods : homeMods
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

      // Clutch context for leadership/morale modifiers
      const currentMargin = Math.abs(
        (currentHomeTotal + homeGoals * pointsPerGoal + homeBehinds * pointsPerBehind) -
        (currentAwayTotal + awayGoals * pointsPerGoal + awayBehinds * pointsPerBehind),
      )
      const attClutchCtx: ClutchContext = {
        quarter: q,
        margin: currentMargin,
        isFinal: !!isFinal,
        captainPresent: homeWins ? homeCaptainPresent : awayCaptainPresent,
      }
      const defClutchCtx: ClutchContext = {
        quarter: q,
        margin: currentMargin,
        isFinal: !!isFinal,
        captainPresent: homeWins ? awayCaptainPresent : homeCaptainPresent,
      }

      // Pick a primary player for this possession (weighted by overall + role)
      const primaryPlayer = pickWeightedPlayer(rng, attackingPlayers, surfaceContext, attClutchCtx)
      const primaryStatIndex = attackingStats.findIndex((s) => s.playerId === primaryPlayer.id)
      const primaryRatings = getGranularRatings(primaryPlayer)
      const tacticalFocus = defendingTactical.focusByTarget.get(primaryPlayer.id)
      const tagPenalty = tacticalFocus?.tagPressure ?? 0
      const roughPenalty = tacticalFocus?.roughPressure ?? 0
      const pressurePenalty = tagPenalty + roughPenalty * 0.6

      // Generate disposal
      const isKick = rng.chance(0.55)
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

      // Contested possession chance (modified by gameplan)
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

      // Mark chance (modified by attacker gameplan)
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
        // Contested mark subset
        if (rng.chance(clampChance(0.08 + marker.attributes.markingContested * 0.005))) {
          attackingStats[markerIdx].contestedMarks++
        }
      }

      // Tackle from defending team (modified by defender gameplan)
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

        // Discipline: high-risk tacklers and aggressive systems concede more frees.
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

      // Hitout for rucks (modified by gameplan)
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

      // Inside 50 chance (~30% of possessions, modified by gameplan)
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

        // Score chance from I50 (~40%)
        const scoreChance = clampChance(0.16 + i50Ratings.decisionMaking * 0.0015 + i50Ratings.kicking * 0.001)
        if (rng.chance(scoreChance)) {
          // Pick a scoring player (weighted toward forwards)
          const scorer = pickScoringPlayer(rng, attackingPlayers, attClutchCtx)
          const scorerIdx = attackingStats.findIndex((s) => s.playerId === scorer.id)
          const scorerRatings = getGranularRatings(scorer)

          // Goal vs behind (~50/50 adjusted by goalkicking skill + gameplan accuracy)
          const goalChance = clampChance(
            (0.2 + scorerRatings.goalSense * 0.005 + scorerRatings.kicking * 0.001)
            * attMods.accuracyMult,
          )
          if (rng.chance(clampChance(goalChance * matchupAccuracyMult * weather.accuracyMult))) {
            // Goal!
            if (homeWins) homeGoals++
            else awayGoals++
            attackingStats[scorerIdx].goals++
            attackingStats[scorerIdx].scoreInvolvements++

            // Goal assist — credit the I50 player if different from scorer
            if (i50Player.id !== scorer.id) {
              attackingStats[i50Idx].goalAssists++
              attackingStats[i50Idx].scoreInvolvements++
            }

            keyEvents.push({
              quarter: q + 1,
              minute: Math.floor((p / possessions) * 30),
              type: 'goal',
              description: `${scorer.firstName} ${scorer.lastName} kicks a goal`,
              playerId: scorer.id,
              clubId: attackClubId,
            })
          } else {
            // Behind
            if (homeWins) homeBehinds++
            else awayBehinds++
            attackingStats[scorerIdx].behinds++
          }
        }
      }

      // Rebound 50 (modified by attacker's rebound vulnerability)
      const reboundChance = clampChance((0.08 + primaryRatings.discipline * 0.0008) * attMods.opponentReboundMult)
      if (!homeWins && rng.chance(reboundChance)) {
        const rebounder = pickWeightedPlayer(rng, defendingPlayers, surfaceContext, defClutchCtx)
        const rebStats = homeWins ? awayStats : homeStats
        const rebIdx = rebStats.findIndex((s) => s.playerId === rebounder.id)
        rebStats[rebIdx].rebound50s++
      }

      // --- Extended stats ---
      // Metres gained (on each disposal)
      attackingStats[primaryStatIndex].metresGained += Math.max(
        1,
        Math.round(rng.nextInt(4, 20) * (0.75 + (primaryRatings.speed + primaryRatings.kicking) / 200)),
      )

      // Turnover chance (~12% of disposals)
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

      // Intercept for defending team
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

      // One-percenter for defending team (spoils, smothers)
      if (rng.chance(0.03 + averageGranularRating(defendingPlayers, 'spoiling') * 0.00035)) {
        const defender = pickWeightedPlayer(rng, defendingPlayers, surfaceContext, defClutchCtx)
        const defStats = homeWins ? awayStats : homeStats
        const defIdx = defStats.findIndex((s) => s.playerId === defender.id)
        defStats[defIdx].onePercenters++
      }

      // Bounce (midfield run)
      if (rng.chance(clampChance(0.01 + primaryRatings.speed * 0.0002 + primaryRatings.agility * 0.0002))) {
        attackingStats[primaryStatIndex].bounces++
      }
    }

    const homeQScore = homeGoals * pointsPerGoal + homeBehinds * pointsPerBehind
    const awayQScore = awayGoals * pointsPerGoal + awayBehinds * pointsPerBehind
    homeScores.push({ goals: homeGoals, behinds: homeBehinds, total: homeQScore })
    awayScores.push({ goals: awayGoals, behinds: awayBehinds, total: awayQScore })
    currentHomeTotal += homeQScore
    currentAwayTotal += awayQScore
  }

  const homeTotalScore = homeScores.reduce((s, q) => s + q.total, 0)
  const awayTotalScore = awayScores.reduce((s, q) => s + q.total, 0)

  // Background disciplinary frees to avoid zero-heavy distributions.
  for (const [teamStats, teamPlayers, teamRisk] of [
    [homeStats, homePlayers, homeTeamFreeRisk],
    [awayStats, awayPlayers, awayTeamFreeRisk],
  ] as const) {
    const playerMap = new Map(teamPlayers.map((pl) => [pl.id, pl]))
    for (const stat of teamStats) {
      const player = playerMap.get(stat.playerId)
      if (!player) continue
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
      stat.minutesPlayed = Math.min(120, estimateMinutesPlayed(stat) + Math.round(extraLoad * rng.nextInt(3, 6)))
    }
  }

  // Per-match fantasy scoring models.
  for (const stat of [...homeStats, ...awayStats]) {
    stat.aflFantasyPoints = computeAFLFantasyPoints(stat)
  }
  // SuperCoach points pool is fixed at 3300 per match.
  assignSuperCoachPoints(homeStats, awayStats, homeTotalScore, awayTotalScore)

  const result: MatchResult = {
    homeScores,
    awayScores,
    homeTotalScore,
    awayTotalScore,
    homePlayerStats: homeStats,
    awayPlayerStats: awayStats,
    keyEvents,
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

function initPlayerStats(players: Player[]): MatchPlayerStats[] {
  return players.map((p) => ({
    playerId: p.id,
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

function pickScoringPlayer(rng: SeededRNG, players: Player[], clutchCtx?: ClutchContext): Player {
  // Weight toward forwards using position modifier and goalkicking ability
  const weights = players.map((p) => {
    const moraleMult = getMoraleModifier(p.morale)
    const clutchMult = clutchCtx
      ? getClutchModifier(p, clutchCtx.quarter, clutchCtx.margin, clutchCtx.isFinal, clutchCtx.captainPresent)
      : 1.0
    return getForwardModifier(p) *
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
