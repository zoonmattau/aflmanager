import type { Player } from '@/types/player'
import type { PositionGroupKey, PositionGroupBenchmark } from '@/types/game'

// ---------------------------------------------------------------------------
// Position → group mapping
// ---------------------------------------------------------------------------

export const POSITION_GROUP_MAP: Record<string, PositionGroupKey> = {
  BP: 'DEF',
  FB: 'DEF',
  HBF: 'DEF',
  CHB: 'DEF',
  W: 'MID',
  IM: 'MID',
  OM: 'MID',
  RK: 'RK',
  HFF: 'FWD',
  CHF: 'FWD',
  FP: 'FWD',
  FF: 'FWD',
}

const ALL_GROUPS: PositionGroupKey[] = ['DEF', 'MID', 'FWD', 'RK']

export function getPositionGroup(position: string): PositionGroupKey {
  return POSITION_GROUP_MAP[position] ?? 'MID'
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

interface GroupAccumulator {
  count: number
  disposals: number
  goals: number
  marks: number
  tackles: number
  clearances: number
  hitouts: number
  contestedPossessions: number
  ratingSum: number
  ratingCount: number
}

function emptyAccumulator(): GroupAccumulator {
  return {
    count: 0,
    disposals: 0,
    goals: 0,
    marks: 0,
    tackles: 0,
    clearances: 0,
    hitouts: 0,
    contestedPossessions: 0,
    ratingSum: 0,
    ratingCount: 0,
  }
}

/**
 * Computes per-game averages for key stats grouped by position group.
 * Only players with at least `minGames` games played are included so
 * fringe players don't skew the baseline.
 */
export function computePositionBenchmarks(
  players: Record<string, Player>,
  minGames = 5,
): Record<PositionGroupKey, PositionGroupBenchmark> {
  const totals: Record<PositionGroupKey, GroupAccumulator> = {
    DEF: emptyAccumulator(),
    MID: emptyAccumulator(),
    FWD: emptyAccumulator(),
    RK: emptyAccumulator(),
  }

  for (const player of Object.values(players)) {
    const gp = player.seasonStats.gamesPlayed
    if (gp < minGames) continue

    const group = getPositionGroup(player.position.primary)
    const t = totals[group]

    t.count++
    t.disposals += player.seasonStats.disposals / gp
    t.goals += player.seasonStats.goals / gp
    t.marks += player.seasonStats.marks / gp
    t.tackles += player.seasonStats.tackles / gp
    t.clearances += player.seasonStats.clearances / gp
    t.hitouts += player.seasonStats.hitouts / gp
    t.contestedPossessions += player.seasonStats.contestedPossessions / gp

    if (player.lastMatchRating !== undefined) {
      t.ratingSum += player.lastMatchRating
      t.ratingCount++
    }
  }

  const result = {} as Record<PositionGroupKey, PositionGroupBenchmark>

  for (const group of ALL_GROUPS) {
    const t = totals[group]
    const n = t.count || 1
    const rn = t.ratingCount || 1

    result[group] = {
      group,
      sampleSize: t.count,
      disposals: t.disposals / n,
      goals: t.goals / n,
      marks: t.marks / n,
      tackles: t.tackles / n,
      clearances: t.clearances / n,
      hitouts: t.hitouts / n,
      contestedPossessions: t.contestedPossessions / n,
      rating: t.ratingSum / rn,
    }
  }

  return result
}
