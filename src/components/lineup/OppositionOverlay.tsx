import { useMemo } from 'react'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { LineupSlot } from '@/types/player'
import { selectBestLineup } from '@/engine/ai/lineupSelection'
import { getOverallRating } from '@/engine/player/playerRating'
import { OPPOSITE_SLOT } from './fieldConstants'
import { getPositionBadgeStrongClass } from '@/lib/positionColor'

export interface OppositionOverlayProps {
  oppositionClubId: string
  players: Record<string, Player>
  clubs: Record<string, Club>
  slotPositions: Array<{ slot: LineupSlot; top: number; left: number }>
  interchangeCount: number
  onPlayerClick?: (playerId: string) => void
}


export function OppositionOverlay({
  oppositionClubId,
  players,
  clubs,
  slotPositions,
  interchangeCount,
  onPlayerClick,
}: OppositionOverlayProps) {
  const oppositionLineup = useMemo(() => {
    const allPlayers = Object.values(players)
    const result = selectBestLineup(allPlayers, oppositionClubId, {
      interchangePlayers: interchangeCount,
      club: clubs[oppositionClubId],
    })
    return result.lineup
  }, [players, oppositionClubId, interchangeCount, clubs])

  const club = clubs[oppositionClubId]
  const clubColor = club?.colors.primary ?? '#ef4444'

  const positionBySlot = useMemo(() => {
    const out = new Map<LineupSlot, { top: number; left: number }>()
    for (const p of slotPositions) out.set(p.slot, { top: p.top, left: p.left })
    return out
  }, [slotPositions])

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {slotPositions.map((slotPos) => {
        const mirroredSlot = OPPOSITE_SLOT[slotPos.slot]
        const playerId = oppositionLineup[mirroredSlot]
        const player = playerId ? players[playerId] : null
        if (!player) return null

        const pos = positionBySlot.get(slotPos.slot)
        if (!pos) return null

        const surname =
          player.lastName.length > 12
            ? player.lastName.slice(0, 11) + '.'
            : player.lastName
        const displayName = `${player.firstName.charAt(0)}. ${surname}`
        const overall = getOverallRating(player)
        const verticalOffset = pos.top <= 50
          ? 'calc(clamp(26px, 3.9vw, 46px) + 4px)'
          : 'calc(-1 * (clamp(26px, 3.9vw, 46px) + 4px))'

        return (
          <div
            key={`opp-${slotPos.slot}`}
            className="absolute"
            style={{
              top: `${pos.top}%`,
              left: `${pos.left}%`,
              transform: `translate(-50%, calc(-50% + ${verticalOffset}))`,
            }}
          >
            <div
              className="pointer-events-auto flex h-[clamp(26px,3.9vw,46px)] w-[clamp(52px,8.2vw,118px)] cursor-pointer items-center gap-[clamp(3px,0.45vw,7px)] rounded-md border px-[clamp(3px,0.55vw,7px)] opacity-85 shadow-sm transition-opacity hover:opacity-100"
              style={{
                borderColor: `${clubColor}99`,
                backgroundColor: `${clubColor}3d`,
              }}
              onClick={() => onPlayerClick?.(player.id)}
            >
              <span className="hidden min-[1150px]:block w-[clamp(18px,1.8vw,28px)] text-center text-[clamp(8px,1vw,12px)] font-bold leading-none text-zinc-200">
                #{player.jerseyNumber}
              </span>
                    <div className="min-w-0 leading-tight">
                      <span className="block truncate text-[clamp(7px,0.82vw,10px)] text-zinc-100">{displayName}</span>
                      <span className="block truncate text-[clamp(6px,0.72vw,9px)] text-zinc-300">
                        <span className={`rounded border px-1 py-0 ${getPositionBadgeStrongClass(player.position.primary)}`}>{player.position.primary}</span> OVR {overall}
                      </span>
                    </div>
                  </div>
          </div>
        )
      })}
    </div>
  )
}
