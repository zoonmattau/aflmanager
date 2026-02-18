import { useMemo } from 'react'
import { Star } from 'lucide-react'
import type { Player } from '@/types/player'
import { useGameStore } from '@/stores/gameStore'
import { getCoachingImpact } from '@/engine/staff/staffEngine'
import { getPlayerPotentialStarProjection } from '@/engine/player/playerRating'

interface PlayerStarRatingProps {
  stars: number
  className?: string
  player?: Player
  overall?: number
  showPotentialOverlay?: boolean
  scoutingAccuracy?: number
  staffQuality?: number
  viewerClubId?: string
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function getStarFraction(stars: number, starIndex: number): number {
  return clamp01(stars - starIndex)
}

export function PlayerStarRating({
  stars,
  className = '',
  player,
  overall,
  showPotentialOverlay = true,
  scoutingAccuracy: scoutingAccuracyOverride,
  staffQuality: staffQualityOverride,
  viewerClubId,
}: PlayerStarRatingProps) {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const staff = useGameStore((s) => s.staff)

  const derivedImpact = useMemo(() => {
    const clubId = viewerClubId ?? playerClubId
    if (!clubId) return { scoutingAccuracy: 1, staffQuality: 1 }
    const impact = getCoachingImpact(Object.values(staff), clubId)
    return {
      scoutingAccuracy: impact.scoutingAccuracy || 1,
      staffQuality: Math.max(0.72, Math.min(1.28, 0.68 + (impact.developmentBonus || 0) * 0.62)),
    }
  }, [playerClubId, staff, viewerClubId])

  const projection = useMemo(() => {
    if (!player || !showPotentialOverlay) return null
    return getPlayerPotentialStarProjection(player, {
      overall,
      scoutingAccuracy: scoutingAccuracyOverride ?? derivedImpact.scoutingAccuracy,
      staffQuality: staffQualityOverride ?? derivedImpact.staffQuality,
      viewerClubId: viewerClubId ?? playerClubId,
    })
  }, [
    derivedImpact.scoutingAccuracy,
    derivedImpact.staffQuality,
    overall,
    player,
    playerClubId,
    scoutingAccuracyOverride,
    showPotentialOverlay,
    staffQualityOverride,
    viewerClubId,
  ])

  const currentStars = projection?.currentStars ?? stars
  const projectedStars = projection?.projectedStars ?? currentStars
  const projectedMaxStars = projection?.projectedMaxStars ?? projectedStars

  return (
    <div
      className={`inline-flex h-3.5 w-[74px] items-center gap-px ${className}`}
      title={projection ? `Potential estimate confidence: ${projection.confidenceLabel}` : undefined}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const currentFill = getStarFraction(currentStars, i)
        const projectedFill = Math.max(currentFill, getStarFraction(projectedStars, i))
        const projectedMaxFill = Math.max(projectedFill, getStarFraction(projectedMaxStars, i))
        const projectedGap = projectedFill - currentFill
        const uncertaintyGap = projectedMaxFill - projectedFill
        return (
          <span key={`star-slot-${i}`} className="relative h-3.5 w-3.5 shrink-0">
            <Star className="absolute inset-0 h-full w-full text-muted-foreground/30" />

            {projection && uncertaintyGap > 0 && (
              <Star
                className="absolute inset-0 h-full w-full fill-muted-foreground/12 text-muted-foreground/30"
                style={{
                  clipPath: `inset(0 ${100 - projectedMaxFill * 100}% 0 ${projectedFill * 100}%)`,
                }}
              />
            )}

            {projection && projectedGap > 0 && (
              <Star
                className="absolute inset-0 h-full w-full fill-muted-foreground/25 text-muted-foreground/55"
                style={{
                  clipPath: `inset(0 ${100 - projectedFill * 100}% 0 ${currentFill * 100}%)`,
                }}
              />
            )}

            {currentFill > 0 && (
              <Star
                className="absolute inset-0 h-full w-full fill-current text-amber-400"
                style={{ clipPath: `inset(0 ${100 - currentFill * 100}% 0 0)` }}
              />
            )}
          </span>
        )
      })}
    </div>
  )
}
