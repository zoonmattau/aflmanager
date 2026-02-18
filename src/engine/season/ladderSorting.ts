import type { LadderEntry } from '@/types/season'
import type { GameSettings } from '@/types/game'

function compareMetric(metric: NonNullable<GameSettings['ladderSorting']>['tieBreakers'][number], a: LadderEntry, b: LadderEntry): number {
  switch (metric) {
    case 'points':
      return b.points - a.points
    case 'percentage':
      return b.percentage - a.percentage
    case 'wins':
      return b.wins - a.wins
    case 'draws':
      return b.draws - a.draws
    case 'losses':
      return a.losses - b.losses
    case 'pointsFor':
      return b.pointsFor - a.pointsFor
    case 'pointsAgainst':
      return a.pointsAgainst - b.pointsAgainst
    case 'clubId':
      return a.clubId.localeCompare(b.clubId)
    default:
      return 0
  }
}

export function compareLadderEntries(
  a: LadderEntry,
  b: LadderEntry,
  ladderSorting?: GameSettings['ladderSorting'],
): number {
  const primary = ladderSorting?.primary ?? 'points'
  const orderedTieBreakers: NonNullable<GameSettings['ladderSorting']>['tieBreakers'] =
    ladderSorting?.tieBreakers && ladderSorting.tieBreakers.length > 0
      ? ladderSorting.tieBreakers
      : ['percentage', 'wins', 'draws', 'losses', 'pointsFor', 'clubId']

  const primaryDiff = compareMetric(primary, a, b)
  if (primaryDiff !== 0) return primaryDiff

  const fallbackPrimary = primary === 'points' ? 'percentage' : 'points'
  const fallbackDiff = compareMetric(fallbackPrimary, a, b)
  if (fallbackDiff !== 0) return fallbackDiff

  for (const tie of orderedTieBreakers) {
    const diff = compareMetric(tie, a, b)
    if (diff !== 0) return diff
  }

  return a.clubId.localeCompare(b.clubId)
}

export function sortLadderEntries(
  ladder: LadderEntry[],
  ladderSorting?: GameSettings['ladderSorting'],
): LadderEntry[] {
  return [...ladder].sort((a, b) => compareLadderEntries(a, b, ladderSorting))
}
