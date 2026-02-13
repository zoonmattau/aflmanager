import type { Player, LineupSlot } from '@/types/player'
import { SLOT_POSITION_COMPATIBILITY } from '@/engine/core/constants'

export type PositionSuitability = 'primary' | 'secondary' | 'out-of-position'

export interface PlayerMagnetProps {
  player: Player
  slot?: string
  suitability: PositionSuitability
}

export function getPositionSuitability(
  player: Player,
  slot: string,
): PositionSuitability {
  const compatTypes = SLOT_POSITION_COMPATIBILITY[slot as LineupSlot] ?? []
  if (compatTypes.includes(player.position.primary)) return 'primary'
  if (player.position.secondary.some((s) => compatTypes.includes(s)))
    return 'secondary'
  return 'out-of-position'
}

const SUITABILITY_BORDER: Record<PositionSuitability, string> = {
  primary: 'border-green-500',
  secondary: 'border-yellow-500',
  'out-of-position': 'border-red-500',
}

const SUITABILITY_BG: Record<PositionSuitability, string> = {
  primary: 'bg-green-500/20',
  secondary: 'bg-yellow-500/20',
  'out-of-position': 'bg-red-500/20',
}

export function PlayerMagnet({ player, slot, suitability }: PlayerMagnetProps) {
  const borderClass = SUITABILITY_BORDER[suitability]
  const bgClass = SUITABILITY_BG[suitability]

  const surname =
    player.lastName.length > 8
      ? player.lastName.slice(0, 7) + '.'
      : player.lastName

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move'
    // If this magnet is placed in a slot, we transfer the slot name.
    // If it's from the bench panel, we transfer the player ID.
    if (slot) {
      e.dataTransfer.setData('application/x-slot', slot)
    }
    e.dataTransfer.setData('application/x-player-id', player.id)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={`flex flex-col items-center justify-center rounded-full border-2 ${borderClass} ${bgClass} cursor-grab active:cursor-grabbing select-none w-[54px] h-[54px] shrink-0`}
      title={`${player.firstName} ${player.lastName} (${player.position.primary})`}
    >
      <span className="text-[10px] font-bold leading-none text-white">
        #{player.jerseyNumber}
      </span>
      <span className="text-[9px] leading-tight text-zinc-200 truncate max-w-[48px] text-center">
        {surname}
      </span>
    </div>
  )
}
