import type { Player, LineupSlot } from '@/types/player'
import { getPositionSuitabilityForSlot } from '@/engine/player/positionEligibility'
import { getOverallRating, getPlayerPositionRating } from '@/engine/player/playerRating'
import { SLOT_POSITION_COMPATIBILITY } from '@/engine/core/constants'
import { getPositionBadgeStrongClass } from '@/lib/positionColor'

export type PositionSuitability = 'primary' | 'secondary' | 'out-of-position'

export interface PlayerMagnetProps {
  player: Player
  slot?: string
  suitability: PositionSuitability
  compact?: boolean
  onProfileClick?: () => void
}

export function getPositionSuitability(
  player: Player,
  slot: string,
): PositionSuitability {
  return getPositionSuitabilityForSlot(player, slot as LineupSlot)
}

const SUITABILITY_BORDER: Record<PositionSuitability, string> = {
  primary: 'border-zinc-500/70',
  secondary: 'border-zinc-500/70',
  'out-of-position': 'border-zinc-500/70',
}

const SUITABILITY_BG: Record<PositionSuitability, string> = {
  primary: 'bg-zinc-800/80',
  secondary: 'bg-zinc-800/80',
  'out-of-position': 'bg-zinc-800/80',
}

export function PlayerMagnet({ player, slot, suitability, onProfileClick }: PlayerMagnetProps) {
  const borderClass = SUITABILITY_BORDER[suitability]
  const bgClass = SUITABILITY_BG[suitability]

  const surname =
    player.lastName.length > 12
      ? player.lastName.slice(0, 11) + '.'
      : player.lastName
  const displayName = `${player.firstName.charAt(0)}. ${surname}`
  const overall = getOverallRating(player)
  const slotKey = slot as LineupSlot | undefined
  const slotPrimaryPos = slotKey ? SLOT_POSITION_COMPATIBILITY[slotKey]?.[0] : undefined
  const slotOverall = slotPrimaryPos
    ? getPlayerPositionRating(player, slotPrimaryPos)
    : overall

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move'
    // If this magnet is placed in a slot, we transfer the slot name.
    // If it's from the bench panel, we transfer the player ID.
    if (slot) {
      e.dataTransfer.setData('application/x-slot', slot)
    }
    e.dataTransfer.setData('application/x-player-id', player.id)
  }

  const position = player.position.primary

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={onProfileClick ? (e) => { e.stopPropagation(); onProfileClick() } : undefined}
      className={`flex items-center gap-[clamp(3px,0.45vw,7px)] rounded-md border-2 ${borderClass} ${bgClass} ${onProfileClick ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} select-none w-[clamp(52px,8.2vw,118px)] h-[clamp(26px,3.9vw,46px)] px-[clamp(3px,0.55vw,7px)] shrink-0 shadow-sm`}
      title={`${player.firstName} ${player.lastName} (${player.position.primary}) — click to view profile`}
    >
      <span className="hidden min-[1150px]:block w-[clamp(18px,1.8vw,28px)] text-center text-[clamp(8px,1vw,12px)] font-bold leading-none text-white">
        #{player.jerseyNumber}
      </span>
      <div className="flex-1 min-w-0 leading-tight">
        <span className="block truncate text-[clamp(7px,0.82vw,10px)] text-zinc-100">{displayName}</span>
        <span className="block truncate text-[clamp(6px,0.72vw,9px)] text-zinc-300">
          <span className={`rounded border px-1 py-0 ${getPositionBadgeStrongClass(position)}`}>{position}</span>{' '}
          {slotPrimaryPos ? `${slotPrimaryPos} ${slotOverall}` : `OVR ${overall}`}
        </span>
      </div>
    </div>
  )
}
