import { useMemo } from 'react'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { LineupSlot } from '@/types/player'
import { selectBestLineup } from '@/engine/ai/lineupSelection'

export interface OppositionOverlayProps {
  oppositionClubId: string
  players: Record<string, Player>
  clubs: Record<string, Club>
  slotPositions: Array<{ slot: LineupSlot; top: number; left: number }>
}

const OPPOSITE_SLOT: Record<LineupSlot, LineupSlot> = {
  LBP: 'RFP',
  FB: 'FF',
  RBP: 'LFP',
  LHB: 'RHF',
  CHB: 'CHF',
  RHB: 'LHF',
  LW: 'RW',
  C: 'C',
  RW: 'LW',
  RK: 'RK',
  RR: 'ROV',
  ROV: 'RR',
  LHF: 'RHB',
  CHF: 'CHB',
  RHF: 'LHB',
  LFP: 'RBP',
  FF: 'FB',
  RFP: 'LBP',
  I1: 'I1',
  I2: 'I2',
  I3: 'I3',
  I4: 'I4',
  I5: 'I5',
  I6: 'I6',
  I7: 'I7',
  I8: 'I8',
}

export function OppositionOverlay({
  oppositionClubId,
  players,
  clubs,
  slotPositions,
}: OppositionOverlayProps) {
  const oppositionLineup = useMemo(() => {
    const allPlayers = Object.values(players)
    const result = selectBestLineup(allPlayers, oppositionClubId)
    return result.lineup
  }, [players, oppositionClubId])

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
          player.lastName.length > 7
            ? player.lastName.slice(0, 6) + '.'
            : player.lastName

        return (
          <div
            key={`opp-${slotPos.slot}`}
            className="absolute"
            style={{
              top: `${pos.top}%`,
              left: `${pos.left}%`,
              transform: 'translate(calc(-50% + 38px), calc(-50% - 18px))',
            }}
          >
            <div
              className="flex h-[28px] w-[68px] items-center gap-1 rounded-md border px-1 opacity-80"
              style={{
                borderColor: `${clubColor}99`,
                backgroundColor: `${clubColor}3d`,
              }}
            >
              <span className="w-5 text-center text-[8px] font-bold leading-none text-zinc-200">
                #{player.jerseyNumber}
              </span>
              <div className="min-w-0 leading-tight">
                <span className="block truncate text-[8px] text-zinc-100">{surname}</span>
                <span className="text-[7px] text-zinc-300">{player.position.primary}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
