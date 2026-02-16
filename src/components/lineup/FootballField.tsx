import type { Player, LineupSlot } from '@/types/player'
import { PlayerMagnet, getPositionSuitability } from './PlayerMagnet'
import { useCallback, useMemo, useState } from 'react'
import { OppositionOverlay } from './OppositionOverlay'
import type { Club } from '@/types/club'
import { getLineupSlots } from '@/engine/core/constants'

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

interface SlotPosition {
  slot: LineupSlot
  label: string
  top: number
  left: number
}

const FIELD_SLOTS: SlotPosition[] = [
  { slot: 'LBP', label: 'LBP', top: 12, left: 26 },
  { slot: 'FB', label: 'FB', top: 9.5, left: 50 },
  { slot: 'RBP', label: 'RBP', top: 12, left: 74 },

  { slot: 'LHB', label: 'LHB', top: 23, left: 23 },
  { slot: 'CHB', label: 'CHB', top: 21.5, left: 50 },
  { slot: 'RHB', label: 'RHB', top: 23, left: 77 },

  { slot: 'LW', label: 'LW', top: 39.5, left: 14 },
  { slot: 'C', label: 'C', top: 38, left: 50 },
  { slot: 'RW', label: 'RW', top: 39.5, left: 86 },

  { slot: 'RK', label: 'RK', top: 48, left: 50 },
  { slot: 'RR', label: 'RR', top: 47.5, left: 38 },
  { slot: 'ROV', label: 'ROV', top: 47.5, left: 62 },

  { slot: 'LHF', label: 'LHF', top: 62, left: 23 },
  { slot: 'CHF', label: 'CHF', top: 63.5, left: 50 },
  { slot: 'RHF', label: 'RHF', top: 62, left: 77 },

  { slot: 'LFP', label: 'LFP', top: 74, left: 26 },
  { slot: 'FF', label: 'FF', top: 76.5, left: 50 },
  { slot: 'RFP', label: 'RFP', top: 74, left: 74 },
]

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
      <div className="relative mx-auto w-full max-w-[760px]" style={{ aspectRatio: '10 / 14' }}>
        <svg
          viewBox="0 0 540 760"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="lineupFieldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#194b2e" />
              <stop offset="45%" stopColor="#1f6c3d" />
              <stop offset="100%" stopColor="#174729" />
            </linearGradient>
            <clipPath id="lineupOvalClip">
              <ellipse cx="270" cy="380" rx="260" ry="366" />
            </clipPath>
          </defs>

          <ellipse cx="270" cy="380" rx="260" ry="366" fill="url(#lineupFieldGrad)" />
          <ellipse cx="270" cy="380" rx="260" ry="366" fill="none" stroke="#ffffff7a" strokeWidth="2.5" />

          <line x1="24" y1="380" x2="516" y2="380" stroke="#ffffff2f" strokeWidth="1.3" clipPath="url(#lineupOvalClip)" />

          <circle cx="270" cy="380" r="38" fill="none" stroke="#ffffff55" strokeWidth="1.6" />
          <circle cx="270" cy="380" r="67" fill="none" stroke="#ffffff2e" strokeWidth="1.2" />
          <rect x="236" y="346" width="68" height="68" fill="none" stroke="#ffffff45" strokeWidth="1.6" />

          <path d="M 102,182 Q 270,258 438,182" fill="none" stroke="#ffffff37" strokeWidth="1.5" clipPath="url(#lineupOvalClip)" />
          <path d="M 102,578 Q 270,502 438,578" fill="none" stroke="#ffffff37" strokeWidth="1.5" clipPath="url(#lineupOvalClip)" />

          <rect x="223" y="22" width="94" height="46" fill="none" stroke="#ffffff3a" strokeWidth="1.4" clipPath="url(#lineupOvalClip)" />
          <rect x="223" y="692" width="94" height="46" fill="none" stroke="#ffffff3a" strokeWidth="1.4" clipPath="url(#lineupOvalClip)" />

          <line x1="249" y1="14" x2="249" y2="2" stroke="#ffffff95" strokeWidth="2.4" />
          <line x1="291" y1="14" x2="291" y2="2" stroke="#ffffff95" strokeWidth="2.4" />
          <line x1="224" y1="14" x2="224" y2="2" stroke="#ffffff6a" strokeWidth="2.1" />
          <line x1="316" y1="14" x2="316" y2="2" stroke="#ffffff6a" strokeWidth="2.1" />

          <line x1="249" y1="746" x2="249" y2="758" stroke="#ffffff95" strokeWidth="2.4" />
          <line x1="291" y1="746" x2="291" y2="758" stroke="#ffffff95" strokeWidth="2.4" />
          <line x1="224" y1="746" x2="224" y2="758" stroke="#ffffff6a" strokeWidth="2.1" />
          <line x1="316" y1="746" x2="316" y2="758" stroke="#ffffff6a" strokeWidth="2.1" />
        </svg>

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
