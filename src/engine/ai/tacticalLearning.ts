/**
 * AI Tactical Learning Engine
 *
 * Each offseason the engine:
 *   1. Snapshots every club's tactics + ladder result (snapshotSeasonTactics)
 *   2. Computes league-wide tactical effectiveness (computeLeagueTacticalMeta)
 *   3. Probabilistically adapts each non-player club's tactics (applyTacticalAdaptations)
 *
 * Change probabilities are based on:
 *   - Club's own trajectory (improving / flat / declining)
 *   - League-wide meta (what identity dominated the season)
 *   - Club's risk tolerance and competitive window
 *   - A maximum of 2 tactical dimensions changed per offseason
 */

import type { Club, TacticalIdentity, ClubGameplan } from '@/types/club'
import type { LadderEntry } from '@/types/season'
import type {
  AITacticalLearning,
  ClubTacticalLearning,
  LeagueTacticalMeta,
  TacticalSeasonRecord,
} from '@/types/aiLearning'
import type { SeededRNG } from '@/engine/core/rng'
import { getAlignedGameplan } from '@/engine/core/tacticalIdentity'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LEARNING_HISTORY = 5

const ALL_IDENTITIES: TacticalIdentity[] = [
  'fast-movement',
  'contested',
  'defensive',
  'stoppage-focused',
  'corridor-heavy',
]

const ALL_OFFENSIVE_STYLES: ClubGameplan['offensiveStyle'][] = ['attacking', 'balanced', 'defensive']
const ALL_TEMPOS: ClubGameplan['tempo'][] = ['fast', 'medium', 'slow']

// ---------------------------------------------------------------------------
// Step 1: Snapshot this season's tactics for every club
// ---------------------------------------------------------------------------

export function snapshotSeasonTactics(
  clubs: Record<string, Club>,
  ladder: LadderEntry[],
  year: number,
  existing: AITacticalLearning | undefined,
): AITacticalLearning {
  const positionByClub = new Map<string, number>()
  const statsByClub = new Map<string, { wins: number; losses: number; draws: number; pf: number; pa: number }>()
  for (let i = 0; i < ladder.length; i++) {
    const e = ladder[i]
    positionByClub.set(e.clubId, i + 1)
    statsByClub.set(e.clubId, {
      wins: e.wins,
      losses: e.losses,
      draws: e.draws,
      pf: e.percentage !== undefined ? 0 : 0,   // ladder entry may not carry raw scores
      pa: 0,
    })
  }

  const byClub: Record<string, ClubTacticalLearning> = existing ? { ...existing.byClub } : {}
  const leagueMeta: LeagueTacticalMeta[] = existing ? [...existing.leagueMeta] : []

  for (const club of Object.values(clubs)) {
    const ladderPosition = positionByClub.get(club.id) ?? 9
    const entry = ladder.find((e) => e.clubId === club.id)
    const wins = entry?.wins ?? 0
    const losses = entry?.losses ?? 0
    const draws = entry?.draws ?? 0

    const record: TacticalSeasonRecord = {
      year,
      ladderPosition,
      wins,
      losses,
      draws,
      pointsFor: 0,    // not tracked per-club in ladder (percentage only)
      pointsAgainst: 0,
      tacticalIdentity: club.tacticalIdentity,
      offensiveStyle: club.gameplan.offensiveStyle,
      tempo: club.gameplan.tempo,
    }

    const existing_club = byClub[club.id]
    const history = existing_club ? [...existing_club.history] : []
    history.push(record)
    // keep only the most recent MAX_LEARNING_HISTORY seasons
    if (history.length > MAX_LEARNING_HISTORY) {
      history.splice(0, history.length - MAX_LEARNING_HISTORY)
    }
    byClub[club.id] = { clubId: club.id, history }
  }

  // Compute this season's league meta and append
  const meta = computeLeagueTacticalMeta(clubs, ladder, year)
  leagueMeta.push(meta)
  if (leagueMeta.length > MAX_LEARNING_HISTORY) {
    leagueMeta.splice(0, leagueMeta.length - MAX_LEARNING_HISTORY)
  }

  return { byClub, leagueMeta }
}

// ---------------------------------------------------------------------------
// Step 2: Compute league-wide tactical meta for one season
// ---------------------------------------------------------------------------

export function computeLeagueTacticalMeta(
  clubs: Record<string, Club>,
  ladder: LadderEntry[],
  year: number,
): LeagueTacticalMeta {
  const positionByClub = new Map<string, number>()
  for (let i = 0; i < ladder.length; i++) {
    positionByClub.set(ladder[i].clubId, i + 1)
  }

  // Accumulate positions per tactic
  const identityPositions: Partial<Record<TacticalIdentity, number[]>> = {}
  const stylePositions: Partial<Record<ClubGameplan['offensiveStyle'], number[]>> = {}
  const tempoPositions: Partial<Record<ClubGameplan['tempo'], number[]>> = {}

  // Count top-8 clubs per identity
  const identityTop8Counts: Partial<Record<TacticalIdentity, number>> = {}

  for (const club of Object.values(clubs)) {
    const pos = positionByClub.get(club.id) ?? 9
    const id = club.tacticalIdentity
    const style = club.gameplan.offensiveStyle
    const tempo = club.gameplan.tempo

    if (!identityPositions[id]) identityPositions[id] = []
    identityPositions[id]!.push(pos)

    if (!stylePositions[style]) stylePositions[style] = []
    stylePositions[style]!.push(pos)

    if (!tempoPositions[tempo]) tempoPositions[tempo] = []
    tempoPositions[tempo]!.push(pos)

    if (pos <= 8) {
      identityTop8Counts[id] = (identityTop8Counts[id] ?? 0) + 1
    }
  }

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length

  const identityAvgPositions: Partial<Record<TacticalIdentity, number>> = {}
  for (const id of ALL_IDENTITIES) {
    if (identityPositions[id]?.length) {
      identityAvgPositions[id] = avg(identityPositions[id]!)
    }
  }

  const offensiveStyleAvgPositions: Partial<Record<ClubGameplan['offensiveStyle'], number>> = {}
  for (const style of ALL_OFFENSIVE_STYLES) {
    if (stylePositions[style]?.length) {
      offensiveStyleAvgPositions[style] = avg(stylePositions[style]!)
    }
  }

  const tempoAvgPositions: Partial<Record<ClubGameplan['tempo'], number>> = {}
  for (const tempo of ALL_TEMPOS) {
    if (tempoPositions[tempo]?.length) {
      tempoAvgPositions[tempo] = avg(tempoPositions[tempo]!)
    }
  }

  // Dominant = identity with most top-8 representation
  let dominantIdentity: TacticalIdentity | null = null
  let maxTop8 = 0
  for (const [id, count] of Object.entries(identityTop8Counts) as [TacticalIdentity, number][]) {
    if (count > maxTop8) {
      maxTop8 = count
      dominantIdentity = id
    }
  }

  // Dominant style / tempo = best average position (lowest number)
  let dominantOffensiveStyle: ClubGameplan['offensiveStyle'] | null = null
  let bestStyleAvg = Infinity
  for (const [style, avgPos] of Object.entries(offensiveStyleAvgPositions) as [ClubGameplan['offensiveStyle'], number][]) {
    if (avgPos < bestStyleAvg) {
      bestStyleAvg = avgPos
      dominantOffensiveStyle = style
    }
  }

  let dominantTempo: ClubGameplan['tempo'] | null = null
  let bestTempoAvg = Infinity
  for (const [tempo, avgPos] of Object.entries(tempoAvgPositions) as [ClubGameplan['tempo'], number][]) {
    if (avgPos < bestTempoAvg) {
      bestTempoAvg = avgPos
      dominantTempo = tempo
    }
  }

  return {
    year,
    totalClubs: Object.keys(clubs).length,
    identityAvgPositions,
    offensiveStyleAvgPositions,
    tempoAvgPositions,
    dominantIdentity,
    dominantOffensiveStyle,
    dominantTempo,
  }
}

// ---------------------------------------------------------------------------
// Step 3: Apply tactical adaptations to one AI club
// ---------------------------------------------------------------------------

interface TacticalAdaptationResult {
  tacticalIdentity: TacticalIdentity
  offensiveStyle: ClubGameplan['offensiveStyle']
  tempo: ClubGameplan['tempo']
  gameplanOverrides: Partial<ClubGameplan>
  changed: boolean
  changes: string[]
}

export function applyTacticalAdaptations(
  club: Club,
  learning: AITacticalLearning,
  rng: SeededRNG,
): TacticalAdaptationResult {
  const clubLearning = learning.byClub[club.id]
  const latestMeta = learning.leagueMeta.length > 0
    ? learning.leagueMeta[learning.leagueMeta.length - 1]
    : null

  // Default result = no change
  let tacticalIdentity = club.tacticalIdentity
  let offensiveStyle = club.gameplan.offensiveStyle
  let tempo = club.gameplan.tempo
  const changes: string[] = []

  if (!clubLearning || clubLearning.history.length < 2) {
    // Not enough history to learn from
    return {
      tacticalIdentity,
      offensiveStyle,
      tempo,
      gameplanOverrides: getAlignedGameplan(tacticalIdentity),
      changed: false,
      changes,
    }
  }

  const history = clubLearning.history
  const lastSeason = history[history.length - 1]
  const prevSeason = history[history.length - 2]

  // Position delta: positive = declined, negative = improved
  const positionDelta = lastSeason.ladderPosition - prevSeason.ladderPosition

  // How many consecutive seasons has the club used the same identity?
  let consecutiveSameIdentity = 1
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].tacticalIdentity === lastSeason.tacticalIdentity) {
      consecutiveSameIdentity++
    } else {
      break
    }
  }

  // Trajectory categorisation
  const strongDecline = positionDelta > 4 && consecutiveSameIdentity >= 2
  const moderateDecline = positionDelta > 2 && consecutiveSameIdentity >= 2
  const mildDecline = positionDelta > 1
  const improving = positionDelta < -2

  // Base probabilities per dimension
  let pIdentity = 0
  let pStyle = 0
  let pTempo = 0

  if (improving) {
    // Very low innovation chance — don't fix what's working
    pIdentity = 0.04
    pStyle = 0.03
    pTempo = 0.02
  } else if (strongDecline) {
    pIdentity = 0.55
    pStyle = 0.40
    pTempo = 0.30
  } else if (moderateDecline) {
    pIdentity = 0.35
    pStyle = 0.25
    pTempo = 0.18
  } else if (mildDecline) {
    pIdentity = 0.15
    pStyle = 0.10
    pTempo = 0.07
  } else {
    // Flat / minor movement — small random chance of innovation
    pIdentity = 0.06
    pStyle = 0.04
    pTempo = 0.03
  }

  // Risk tolerance multiplier
  const riskMult = club.aiPersonality.riskTolerance === 'aggressive'
    ? 1.3
    : club.aiPersonality.riskTolerance === 'conservative'
      ? 0.65
      : 1.0

  // Competitive window multiplier
  const windowMult = club.aiPersonality.competitiveWindow === 'win-now'
    ? 1.15
    : club.aiPersonality.competitiveWindow === 'rebuilding'
      ? 0.75
      : 1.0

  pIdentity = Math.min(1, pIdentity * riskMult * windowMult)
  pStyle = Math.min(1, pStyle * riskMult * windowMult)
  pTempo = Math.min(1, pTempo * riskMult * windowMult)

  // Max 2 changes per offseason — track how many we make
  let changesLeft = 2

  // 1. Tactical identity
  if (changesLeft > 0 && rng.chance(pIdentity)) {
    const candidate = pickBestIdentity(club, lastSeason, latestMeta, rng)
    if (candidate !== tacticalIdentity) {
      tacticalIdentity = candidate
      changes.push(`identity: ${lastSeason.tacticalIdentity} → ${tacticalIdentity}`)
      changesLeft--
    }
  }

  // 2. Offensive style
  if (changesLeft > 0 && rng.chance(pStyle)) {
    const candidate = pickBestStyle(lastSeason, latestMeta, rng)
    if (candidate !== offensiveStyle) {
      offensiveStyle = candidate
      changes.push(`offensiveStyle: ${lastSeason.offensiveStyle} → ${offensiveStyle}`)
      changesLeft--
    }
  }

  // 3. Tempo
  if (changesLeft > 0 && rng.chance(pTempo)) {
    const candidate = pickBestTempo(lastSeason, latestMeta, rng)
    if (candidate !== tempo) {
      tempo = candidate
      changes.push(`tempo: ${lastSeason.tempo} → ${tempo}`)
    }
  }

  // Build gameplan overrides: always apply aligned overrides for the new identity,
  // then patch in any style/tempo overrides
  const aligned = getAlignedGameplan(tacticalIdentity)
  const gameplanOverrides: Partial<ClubGameplan> = {
    ...aligned,
    offensiveStyle,
    tempo,
  }

  return {
    tacticalIdentity,
    offensiveStyle,
    tempo,
    gameplanOverrides,
    changed: changes.length > 0,
    changes,
  }
}

// ---------------------------------------------------------------------------
// Helpers for picking new tactic values
// ---------------------------------------------------------------------------

function pickBestIdentity(
  _club: Club,
  lastSeason: TacticalSeasonRecord,
  meta: LeagueTacticalMeta | null,
  rng: SeededRNG,
): TacticalIdentity {
  const current = lastSeason.tacticalIdentity

  // 60% chance: move toward the dominant league identity (if different)
  if (meta?.dominantIdentity && meta.dominantIdentity !== current && rng.chance(0.60)) {
    return meta.dominantIdentity
  }

  // Otherwise pick random alternative (excluding current)
  const options = ALL_IDENTITIES.filter((id) => id !== current)
  return options[rng.nextInt(0, options.length - 1)]
}

function pickBestStyle(
  lastSeason: TacticalSeasonRecord,
  meta: LeagueTacticalMeta | null,
  rng: SeededRNG,
): ClubGameplan['offensiveStyle'] {
  const current = lastSeason.offensiveStyle

  // 55% chance: adopt the dominant league style
  if (meta?.dominantOffensiveStyle && meta.dominantOffensiveStyle !== current && rng.chance(0.55)) {
    return meta.dominantOffensiveStyle
  }

  const options = ALL_OFFENSIVE_STYLES.filter((s) => s !== current)
  return options[rng.nextInt(0, options.length - 1)]
}

function pickBestTempo(
  lastSeason: TacticalSeasonRecord,
  meta: LeagueTacticalMeta | null,
  rng: SeededRNG,
): ClubGameplan['tempo'] {
  const current = lastSeason.tempo

  // 55% chance: adopt the dominant league tempo
  if (meta?.dominantTempo && meta.dominantTempo !== current && rng.chance(0.55)) {
    return meta.dominantTempo
  }

  const options = ALL_TEMPOS.filter((t) => t !== current)
  return options[rng.nextInt(0, options.length - 1)]
}
