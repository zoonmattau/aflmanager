import type { Player, LineupSlot } from '@/types/player'
import { PlayerMagnet, getPositionSuitability } from './PlayerMagnet'
import { useCallback, useMemo, useState } from 'react'
import { OppositionOverlay } from './OppositionOverlay'
import type { Club } from '@/types/club'
import { getLineupSlots } from '@/engine/core/constants'
import { FIELD_SLOTS } from './fieldConstants'
import type { SlotPosition } from './fieldConstants'
import { FieldSvg } from './FieldSvg'

export interface FootballFieldProps {
  lineup: Record<string, string>
  players: Record<string, Player>
  clubs: Record<string, Club>
  interchangeCount: number
  oppositionClubId: string | null
  showOpposition: boolean
  onAssign: (slot: string, playerId: string) => void
  onSwap: (slotA: string, slotB: string) => void
  onUnassign: (slot: string) => void
}


function buildInterchangeSlots(interchangeCount: number): SlotPosition[] {
  const count = Math.max(0, Math.min(8, interchangeCount))
  const slots = getLineupSlots(count)
    .filter((s) => s.startsWith('I')) as LineupSlot[]

  if (slots.length <= 4) {
    return slots.map((slot, i) => ({
      slot,
      label: slot,
      top: 50,
      left: ((i + 1) * 100) / (slots.length + 1),
    }))
  }

  const firstRow = slots.slice(0, Math.ceil(slots.length / 2))
  const secondRow = slots.slice(Math.ceil(slots.length / 2))

  const out: SlotPosition[] = []
  firstRow.forEach((slot, i) => {
    out.push({
      slot,
      label: slot,
      top: 35,
      left: ((i + 1) * 100) / (firstRow.length + 1),
    })
  })
  secondRow.forEach((slot, i) => {
    out.push({
      slot,
      label: slot,
      top: 70,
      left: ((i + 1) * 100) / (secondRow.length + 1),
    })
  })
  return out
}

export function FootballField({
  lineup,
  players,
  clubs,
  interchangeCount,
  oppositionClubId,
  showOpposition,
  onAssign,
  onSwap,
  onUnassign,
}: FootballFieldProps) {
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  const interchangeSlots = useMemo(
    () => buildInterchangeSlots(interchangeCount),
    [interchangeCount],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback((targetSlot: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOverSlot(null)

    const sourceSlot = e.dataTransfer.getData('application/x-slot')
    const playerId = e.dataTransfer.getData('application/x-player-id')

    if (sourceSlot && sourceSlot !== targetSlot) {
      onSwap(sourceSlot, targetSlot)
    } else if (playerId && !sourceSlot) {
      onAssign(targetSlot, playerId)
    }
  }, [onAssign, onSwap])

  const handleSlotDoubleClick = useCallback((slot: string) => {
    if (lineup[slot]) {
      onUnassign(slot)
    }
  }, [lineup, onUnassign])

  const renderSlot = (pos: SlotPosition, isInterchange: boolean) => {
    const playerId = lineup[pos.slot]
    const player = playerId ? players[playerId] : null
    const isOver = dragOverSlot === pos.slot

    const style: React.CSSProperties = isInterchange
      ? {
          left: `${pos.left}%`,
          top: `${pos.top}%`,
          transform: 'translate(-50%, -50%)',
        }
      : {
          left: `${pos.left}%`,
          top: `${pos.top}%`,
          transform: 'translate(-50%, -50%)',
        }

    return (
      <div
        key={pos.slot}
        className="absolute z-20"
        style={style}
        onDragOver={(e) => {
          handleDragOver(e)
          setDragOverSlot(pos.slot)
        }}
        onDragLeave={() => setDragOverSlot(null)}
        onDrop={(e) => handleDrop(pos.slot, e)}
        onDoubleClick={() => handleSlotDoubleClick(pos.slot)}
      >
        {player ? (
          <PlayerMagnet
            player={player}
            slot={pos.slot}
            suitability={getPositionSuitability(player, pos.slot)}
          />
        ) : (
          <div
            className={`flex h-[34px] w-[86px] items-center justify-center rounded-md border border-dashed text-[10px] font-semibold transition-colors ${
              isOver
                ? 'border-white bg-white/20 text-white'
                : 'border-zinc-400/55 bg-zinc-900/45 text-zinc-300'
            }`}
          >
            {pos.label}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full space-y-2">
      <div className="relative mx-auto w-full max-w-[760px]" style={{ aspectRatio: '27 / 35' }}>
        <FieldSvg idPrefix="lineup" />

        {FIELD_SLOTS.map((pos) => renderSlot(pos, false))}

        {showOpposition && oppositionClubId && (
          <OppositionOverlay
            oppositionClubId={oppositionClubId}
            players={players}
            clubs={clubs}
            slotPositions={FIELD_SLOTS}
          />
        )}
      </div>

      <div className="relative mx-auto w-full max-w-[760px] rounded-lg border border-zinc-700 bg-zinc-800/85 py-3" style={{ minHeight: interchangeSlots.length > 4 ? 118 : 70 }}>
        <span className="absolute -top-2 left-3 bg-zinc-800 px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Interchange Bench
        </span>
        <div className="relative h-full" style={{ minHeight: interchangeSlots.length > 4 ? 98 : 54 }}>
          {interchangeSlots.map((pos) => renderSlot(pos, true))}
        </div>
      </div>
    </div>
  )
}
