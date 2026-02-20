import type { Player } from '@/types/player'

export type InjuryRiskLevel = 'low' | 'moderate' | 'high' | 'very-high'
export type DurabilityRating = 'A' | 'B' | 'C' | 'D'

/** Injury risk level based on proneness attribute + career injury count */
export function getInjuryRiskLevel(player: Player): InjuryRiskLevel {
  const proneness = player.hiddenAttributes.injuryProneness
  const historyCount = player.injuryHistory?.length ?? 0

  if (proneness >= 75 || historyCount >= 5) return 'very-high'
  if (proneness >= 55 || historyCount >= 3) return 'high'
  if (proneness >= 35 || historyCount >= 2) return 'moderate'
  return 'low'
}

/** Total career games missed across all recorded injuries */
export function getTotalGamesMissed(player: Player): number {
  return (player.injuryHistory ?? []).reduce((sum, h) => sum + (h.gamesMissed ?? 0), 0)
}

/**
 * Durability letter grade A–D.
 * Based on durability + (inverted) injuryProneness attributes, minus a penalty
 * for career games missed.
 */
export function getDurabilityRating(player: Player): DurabilityRating {
  const dur = player.hiddenAttributes.durability
  const proneness = player.hiddenAttributes.injuryProneness
  const totalMissed = getTotalGamesMissed(player)

  // Attribute score: durability 60%, inverted proneness 40%
  const attrScore = dur * 0.6 + (100 - proneness) * 0.4
  // Penalise for games missed: -0.5 per game, capped at -20
  const missPenalty = Math.min(20, totalMissed * 0.5)
  const score = attrScore - missPenalty

  if (score >= 72) return 'A'
  if (score >= 52) return 'B'
  if (score >= 32) return 'C'
  return 'D'
}

/** Body regions that appear 2+ times in a player's injury history */
export function getRecurringBodyRegions(player: Player): string[] {
  const counts: Record<string, number> = {}
  for (const entry of player.injuryHistory ?? []) {
    const r = entry.bodyRegion
    if (r) counts[r] = (counts[r] ?? 0) + 1
  }
  return Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .map(([region]) => region)
}

/** Human-readable body-region label */
export function bodyRegionLabel(region: string): string {
  const map: Record<string, string> = {
    'soft-tissue': 'soft tissue',
    'joint': 'joint',
    'concussion': 'concussion',
    'structural': 'structural',
    'impact': 'impact',
  }
  return map[region] ?? region
}

/** Display properties for an injury risk level */
export function injuryRiskDisplay(level: InjuryRiskLevel): {
  label: string
  color: string
  iconColor: string
  bgClass: string
} {
  switch (level) {
    case 'low':
      return { label: 'Low Risk',       color: 'text-green-600',  iconColor: 'text-green-500',  bgClass: 'bg-green-500/10 border-green-500/30 text-green-700' }
    case 'moderate':
      return { label: 'Moderate Risk',  color: 'text-yellow-600', iconColor: 'text-yellow-500', bgClass: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700' }
    case 'high':
      return { label: 'High Risk',      color: 'text-orange-600', iconColor: 'text-orange-500', bgClass: 'bg-orange-500/10 border-orange-500/30 text-orange-700' }
    case 'very-high':
      return { label: 'Very High Risk', color: 'text-red-600',    iconColor: 'text-red-500',    bgClass: 'bg-red-500/10 border-red-500/30 text-red-700' }
  }
}

/** Tailwind colour class for durability rating badge */
export function durabilityRatingColor(rating: DurabilityRating): string {
  switch (rating) {
    case 'A': return 'text-green-600 font-bold'
    case 'B': return 'text-emerald-500 font-bold'
    case 'C': return 'text-yellow-600 font-bold'
    case 'D': return 'text-red-600 font-bold'
  }
}

/** True if a player returned from a significant injury recently (has a recovered history entry) */
export function isRecentlyReturned(player: Player): boolean {
  if (player.injury) return false
  const history = player.injuryHistory ?? []
  if (history.length === 0) return false
  // Most recent history entry has recoveredOn and was a meaningful injury (≥2 weeks)
  const last = history[history.length - 1]
  return !!(last?.recoveredOn && (last.initialWeeks ?? 0) >= 2)
}
