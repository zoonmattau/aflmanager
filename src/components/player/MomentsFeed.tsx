/**
 * MomentsFeed — chronological timeline of a player's career moments.
 * Used in PlayerProfilePage Overview tab.
 */
import { MomentCard } from '@/components/player/MomentCard'
import type { PlayerMoment } from '@/types/player'
import type { Club } from '@/types/club'

interface MomentsFeedProps {
  moments: PlayerMoment[]
  clubs?: Record<string, Club>
}

// Moments that are important enough to always show near the top
const PRIORITY_TYPES = new Set([
  'premiership',
  'brownlow-medal',
  'coleman-medal',
  'all-australian',
  'debut',
  'first-bog',
  'milestone-games',
])

export function MomentsFeed({ moments, clubs }: MomentsFeedProps) {
  if (moments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No career moments recorded yet. Play matches to build a history.
      </p>
    )
  }

  // Sort: priority types first, then by year desc, round desc
  const sorted = [...moments].sort((a, b) => {
    const aPriority = PRIORITY_TYPES.has(a.type) ? 0 : 1
    const bPriority = PRIORITY_TYPES.has(b.type) ? 0 : 1
    if (aPriority !== bPriority) return aPriority - bPriority
    if (b.year !== a.year) return b.year - a.year
    return b.round - a.round
  })

  return (
    <div className="space-y-2">
      {sorted.map((moment) => {
        const opponentName = moment.opponentClubId
          ? (clubs?.[moment.opponentClubId]?.abbreviation ?? moment.opponentClubId)
          : undefined
        return (
          <MomentCard
            key={moment.id}
            moment={moment}
            opponentName={opponentName}
            showStats
          />
        )
      })}
    </div>
  )
}
