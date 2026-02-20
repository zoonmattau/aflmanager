import { POSITION_LINE } from '@/engine/core/constants'
import type { MatchPlayerStats } from '@/types/match'
import type { Player } from '@/types/player'

type PositionGroup = 'DEF' | 'MID' | 'FWD' | 'RK'

/** Stat keys used in the rating formula (clangers is penalised via negative weight). */
type RatingStatKey =
  | 'intercepts'
  | 'onePercenters'
  | 'marks'
  | 'tackles'
  | 'disposals'
  | 'rebound50s'
  | 'clangers'
  | 'clearances'
  | 'contestedPossessions'
  | 'insideFifties'
  | 'goals'
  | 'scoreInvolvements'
  | 'goalAssists'
  | 'hitouts'

/** Position-aware weights. Positive = more is better, negative = more is worse. */
const POSITION_WEIGHTS: Record<PositionGroup, Partial<Record<RatingStatKey, number>>> = {
  DEF: {
    intercepts:           0.20,
    onePercenters:        0.15,
    marks:                0.15,
    tackles:              0.15,
    disposals:            0.15,
    rebound50s:           0.10,
    clangers:            -0.10,
  },
  MID: {
    clearances:           0.20,
    disposals:            0.20,
    contestedPossessions: 0.15,
    insideFifties:        0.15,
    tackles:              0.10,
    goals:                0.10,
    clangers:            -0.10,
  },
  FWD: {
    goals:                0.30,
    scoreInvolvements:    0.20,
    marks:                0.15,
    disposals:            0.15,
    goalAssists:          0.10,
    clangers:            -0.10,
  },
  RK: {
    hitouts:              0.35,
    clearances:           0.25,
    disposals:            0.20,
    tackles:              0.10,
    clangers:            -0.10,
  },
}

function getStatValue(stat: MatchPlayerStats, key: RatingStatKey): number {
  return stat[key as keyof MatchPlayerStats] as number ?? 0
}

function computeMeanAndStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 1 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length
  return { mean, std: Math.sqrt(variance) || 1 }
}

const ALL_STAT_KEYS: RatingStatKey[] = [
  'intercepts', 'onePercenters', 'marks', 'tackles', 'disposals',
  'rebound50s', 'clangers', 'clearances', 'contestedPossessions',
  'insideFifties', 'goals', 'scoreInvolvements', 'goalAssists', 'hitouts',
]

/**
 * Compute FM-style match ratings (1.0–10.0, one decimal place) for all
 * participating players.
 *
 * Algorithm:
 * 1. For each raw stat, compute the mean and std across all participants.
 * 2. For each player, convert each stat to a z-score.
 * 3. Apply position-group weights to produce a weighted z-score.
 * 4. Map: rating = clamp(6.0 + weightedZ × 1.5, 1.0, 10.0)
 *
 * Base rating 6.0 = exactly average; 9.0 = ~2 std above (exceptional);
 * below 5.0 = poor performance.
 */
export function computeMatchRatings(
  allStats: MatchPlayerStats[],
  playerMap: Map<string, Player>,
): Map<string, number> {
  const participating = allStats.filter(
    (s) => s.participated || s.disposals > 0 || s.minutesPlayed > 0,
  )

  if (participating.length === 0) return new Map()

  // Pre-compute normalization params for every stat key
  const norms: Record<string, { mean: number; std: number }> = {}
  for (const key of ALL_STAT_KEYS) {
    norms[key] = computeMeanAndStd(participating.map((s) => getStatValue(s, key)))
  }

  const result = new Map<string, number>()

  for (const stat of participating) {
    const player = playerMap.get(stat.playerId)
    const posGroup: PositionGroup = player
      ? POSITION_LINE[player.position.primary]
      : 'MID'

    const weights = POSITION_WEIGHTS[posGroup]

    let weightedZ = 0
    for (const [key, weight] of Object.entries(weights) as [RatingStatKey, number][]) {
      const norm = norms[key]
      if (!norm) continue
      const z = (getStatValue(stat, key) - norm.mean) / norm.std
      weightedZ += weight * z
    }

    // 6.0 base; each unit of weighted-z = 1.5 rating points
    const raw = 6.0 + weightedZ * 1.5
    const rating = Math.round(Math.max(1.0, Math.min(10.0, raw)) * 10) / 10
    result.set(stat.playerId, rating)
  }

  return result
}

/** Human-readable colour class for a match rating value. */
export function matchRatingColorClass(rating: number | undefined): string {
  if (rating === undefined) return 'text-muted-foreground'
  if (rating >= 8.5) return 'text-green-400'
  if (rating >= 7.5) return 'text-emerald-400'
  if (rating >= 6.5) return 'text-yellow-400'
  if (rating >= 5.5) return 'text-orange-400'
  return 'text-red-400'
}
