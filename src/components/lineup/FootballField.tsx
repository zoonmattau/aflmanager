import type { Player, LineupSlot } from '@/types/player'
import { PlayerMagnet, getPositionSuitability } from './PlayerMagnet'
import { useCallback, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FootballFieldProps {
  lineup: Record<string, string> // slot -> playerId
  players: Record<string, Player>
  onAssign: (slot: string, playerId: string) => void
  onSwap: (slotA: string, slotB: string) => void
  onUnassign: (slot: string) => void
}

// ---------------------------------------------------------------------------
// Slot positions (% from top, % from left) within the oval
// ---------------------------------------------------------------------------

interface SlotPosition {
  slot: LineupSlot
  label: string
  top: number
  left: number
}

const FIELD_SLOTS: SlotPosition[] = [
  // Back line (top = defending end)
  { slot: 'LBP', label: 'LBP', top: 9, left: 25 },
  { slot: 'FB', label: 'FB', top: 6, left: 50 },
  { slot: 'RBP', label: 'RBP', top: 9, left: 75 },

  // Half-back line
  { slot: 'LHB', label: 'LHB', top: 22, left: 22 },
  { slot: 'CHB', label: 'CHB', top: 20, left: 50 },
  { slot: 'RHB', label: 'RHB', top: 22, left: 78 },

  // Centre line
  { slot: 'LW', label: 'LW', top: 42, left: 10 },
  { slot: 'C', label: 'C', top: 40, left: 50 },
  { slot: 'RW', label: 'RW', top: 42, left: 90 },

  // Followers (around centre)
  { slot: 'RK', label: 'RK', top: 47, left: 50 },
  { slot: 'RR', label: 'RR', top: 47, left: 36 },
  { slot: 'ROV', label: 'ROV', top: 47, left: 64 },

  // Half-forward line
  { slot: 'LHF', label: 'LHF', top: 62, left: 22 },
  { slot: 'CHF', label: 'CHF', top: 64, left: 50 },
  { slot: 'RHF', label: 'RHF', top: 62, left: 78 },

  // Forward line (bottom = attacking end)
  { slot: 'LFP', label: 'LFP', top: 77, left: 25 },
  { slot: 'FF', label: 'FF', top: 80, left: 50 },
  { slot: 'RFP', label: 'RFP', top: 77, left: 75 },
]

const INTERCHANGE_SLOTS: SlotPosition[] = [
  { slot: 'I1', label: 'I1', top: 0, left: 12.5 },
  { slot: 'I2', label: 'I2', top: 0, left: 37.5 },
  { slot: 'I3', label: 'I3', top: 0, left: 62.5 },
  { slot: 'I4', label: 'I4', top: 0, left: 87.5 },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FootballField({
  lineup,
  players,
  onAssign,
  onSwap,
  onUnassign,
}: FootballFieldProps) {
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    [],
  )

  const handleDrop = useCallback(
    (targetSlot: string, e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOverSlot(null)

      const sourceSlot = e.dataTransfer.getData('application/x-slot')
      const playerId = e.dataTransfer.getData('application/x-player-id')

      if (sourceSlot && sourceSlot !== targetSlot) {
        // Dragged from another slot -> swap
        onSwap(sourceSlot, targetSlot)
      } else if (playerId && !sourceSlot) {
        // Dragged from the bench panel -> assign
        onAssign(targetSlot, playerId)
      }
    },
    [onAssign, onSwap],
  )

  const handleSlotDoubleClick = useCallback(
    (slot: string) => {
      if (lineup[slot]) {
        onUnassign(slot)
      }
    },
    [lineup, onUnassign],
  )

  const renderSlot = (pos: SlotPosition, isInterchange: boolean) => {
    const playerId = lineup[pos.slot]
    const player = playerId ? players[playerId] : null
    const isOver = dragOverSlot === pos.slot

    const positionStyle: React.CSSProperties = isInterchange
      ? { left: `${pos.left}%`, transform: 'translateX(-50%)' }
      : {
          position: 'absolute' as const,
          top: `${pos.top}%`,
          left: `${pos.left}%`,
          transform: 'translate(-50%, -50%)',
        }

    return (
      <div
        key={pos.slot}
        className={`flex flex-col items-center z-10 ${isInterchange ? 'relative' : ''}`}
        style={positionStyle}
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
            className={`flex items-center justify-center rounded-full border-2 border-dashed w-[54px] h-[54px] transition-colors ${
              isOver
                ? 'border-white bg-white/20'
                : 'border-zinc-400/50 bg-zinc-900/40'
            }`}
          >
            <span className="text-[10px] text-zinc-400 font-medium">
              {pos.label}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Football field oval */}
      <div
        className="relative w-full overflow-hidden"
        style={{ minHeight: '600px', aspectRatio: '2 / 3' }}
      >
        {/* SVG field markings */}
        <svg
          viewBox="0 0 400 600"
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="fieldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a4d2e" />
              <stop offset="50%" stopColor="#1f6b3a" />
              <stop offset="100%" stopColor="#1a4d2e" />
            </linearGradient>
            <clipPath id="ovalClip">
              <ellipse cx="200" cy="300" rx="195" ry="295" />
            </clipPath>
          </defs>

          {/* Green fill inside oval */}
          <ellipse
            cx="200"
            cy="300"
            rx="195"
            ry="295"
            fill="url(#fieldGrad)"
          />

          {/* Boundary line */}
          <ellipse
            cx="200"
            cy="300"
            rx="195"
            ry="295"
            fill="none"
            stroke="#ffffff40"
            strokeWidth="2.5"
          />

          {/* Centre circle */}
          <circle
            cx="200"
            cy="300"
            r="30"
            fill="none"
            stroke="#ffffff30"
            strokeWidth="1.5"
          />

          {/* Centre square */}
          <rect
            x="192"
            y="292"
            width="16"
            height="16"
            fill="none"
            stroke="#ffffff30"
            strokeWidth="1.5"
          />

          {/* 50m arcs (top) */}
          <path
            d="M 80,145 Q 200,210 320,145"
            fill="none"
            stroke="#ffffff25"
            strokeWidth="1.5"
            clipPath="url(#ovalClip)"
          />

          {/* 50m arcs (bottom) */}
          <path
            d="M 80,455 Q 200,390 320,455"
            fill="none"
            stroke="#ffffff25"
            strokeWidth="1.5"
            clipPath="url(#ovalClip)"
          />

          {/* Goal square top (defending) */}
          <rect
            x="172"
            y="5"
            width="56"
            height="28"
            fill="none"
            stroke="#ffffff30"
            strokeWidth="1.5"
            clipPath="url(#ovalClip)"
          />
          {/* Goal posts top */}
          <line
            x1="180"
            y1="5"
            x2="180"
            y2="0"
            stroke="#ffffff40"
            strokeWidth="2"
          />
          <line
            x1="220"
            y1="5"
            x2="220"
            y2="0"
            stroke="#ffffff40"
            strokeWidth="2"
          />

          {/* Goal square bottom (attacking) */}
          <rect
            x="172"
            y="567"
            width="56"
            height="28"
            fill="none"
            stroke="#ffffff30"
            strokeWidth="1.5"
            clipPath="url(#ovalClip)"
          />
          {/* Goal posts bottom */}
          <line
            x1="180"
            y1="595"
            x2="180"
            y2="600"
            stroke="#ffffff40"
            strokeWidth="2"
          />
          <line
            x1="220"
            y1="595"
            x2="220"
            y2="600"
            stroke="#ffffff40"
            strokeWidth="2"
          />

          {/* Centre line */}
          <line
            x1="5"
            y1="300"
            x2="395"
            y2="300"
            stroke="#ffffff15"
            strokeWidth="1"
            clipPath="url(#ovalClip)"
          />
        </svg>

        {/* Player slots - absolutely positioned on field */}
        {FIELD_SLOTS.map((pos) => renderSlot(pos, false))}
      </div>

      {/* Interchange bench */}
      <div className="relative flex items-center justify-around rounded-lg border border-zinc-700 bg-zinc-800/80 px-2 py-3">
        <span className="absolute -top-2.5 left-3 bg-zinc-800 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          Interchange
        </span>
        {INTERCHANGE_SLOTS.map((pos) => renderSlot(pos, true))}
      </div>
    </div>
  )
}
