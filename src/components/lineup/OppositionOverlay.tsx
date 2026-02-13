import { useMemo } from 'react'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { LineupSlot } from '@/types/player'
import { selectBestLineup } from '@/engine/ai/lineupSelection'

export interface OppositionOverlayProps {
  oppositionClubId: string
  players: Record<string, Player>
  clubs: Record<string, Club>
}

// ---------------------------------------------------------------------------
// Mirror mapping: opposition's defending positions map to your attacking area
// and vice versa. Interchange is hidden for the opposition overlay.
// ---------------------------------------------------------------------------

interface MirrorSlotPos {
  slot: LineupSlot
  top: number
  left: number
}

const MIRROR_SLOTS: MirrorSlotPos[] = [
  // Their back line -> your forward area (bottom)
  { slot: 'LBP', top: 80, left: 75 },
  { slot: 'FB', top: 83, left: 50 },
  { slot: 'RBP', top: 80, left: 25 },

  // Their half-back -> your half-forward area
  { slot: 'LHB', top: 66, left: 78 },
  { slot: 'CHB', top: 68, left: 50 },
  { slot: 'RHB', top: 66, left: 22 },

  // Their centre -> your centre (mirrored L/R)
  { slot: 'LW', top: 42, left: 90 },
  { slot: 'C', top: 44, left: 50 },
  { slot: 'RW', top: 42, left: 10 },

  // Their followers
  { slot: 'RK', top: 37, left: 50 },
  { slot: 'RR', top: 37, left: 64 },
  { slot: 'ROV', top: 37, left: 36 },

  // Their half-forward -> your half-back area
  { slot: 'LHF', top: 22, left: 78 },
  { slot: 'CHF', top: 20, left: 50 },
  { slot: 'RHF', top: 22, left: 22 },

  // Their forward line -> your back area (top)
  { slot: 'LFP', top: 9, left: 75 },
  { slot: 'FF', top: 6, left: 50 },
  { slot: 'RFP', top: 9, left: 25 },
]

export function OppositionOverlay({
  oppositionClubId,
  players,
  clubs,
}: OppositionOverlayProps) {
  const oppositionLineup = useMemo(() => {
    const allPlayers = Object.values(players)
    const result = selectBestLineup(allPlayers, oppositionClubId)
    return result.lineup
  }, [players, oppositionClubId])

  const club = clubs[oppositionClubId]
  const clubColor = club?.colors.primary ?? '#ef4444'

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {MIRROR_SLOTS.map((pos) => {
        const playerId = oppositionLineup[pos.slot]
        const player = playerId ? players[playerId] : null
        if (!player) return null

        const surname =
          player.lastName.length > 7
            ? player.lastName.slice(0, 6) + '.'
            : player.lastName

        return (
          <div
            key={`opp-${pos.slot}`}
            className="absolute flex flex-col items-center"
            style={{
              top: `${pos.top}%`,
              left: `${pos.left}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="flex flex-col items-center justify-center rounded-full w-[42px] h-[42px] opacity-60"
              style={{
                backgroundColor: `${clubColor}30`,
                border: `2px solid ${clubColor}90`,
              }}
            >
              <span className="text-[8px] font-bold leading-none text-zinc-300">
                #{player.jerseyNumber}
              </span>
              <span className="text-[7px] leading-tight text-zinc-400 truncate max-w-[38px] text-center">
                {surname}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
