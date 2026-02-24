import { useState } from 'react'
import { FieldSvg } from '@/components/lineup/FieldSvg'
import { FIELD_SLOTS_LANDSCAPE } from '@/components/lineup/fieldConstants'
import type { Club } from '@/types/club'
import type { Player, LineupSlot } from '@/types/player'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIELD_SLOT_SET = new Set(FIELD_SLOTS_LANDSCAPE.map((s) => s.slot))
const BENCH_SLOTS = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8'] as const

function getLuminance(hex: string): number {
  if (hex.length < 7) return 0
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LiveInterchangePanelProps {
  /** Full slot lineup — both field (LBP…ROV) and bench (I1…I8). */
  slotLineup: Record<string, string>
  players: Record<string, Player>
  club: Club | undefined
  interchangeCount: number
  /** Called with the two slot IDs that should be swapped. */
  onInterchange: (slotA: string, slotB: string) => void
  /** When true, render ONLY the bench badge strip — no mini-field. */
  compact?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LiveInterchangePanel({
  slotLineup,
  players,
  club,
  interchangeCount,
  onInterchange,
  compact = false,
}: LiveInterchangePanelProps) {
  const [dragging, setDragging] = useState<{ slot: string; playerId: string } | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  const primary = club?.colors.primary ?? '#2563eb'
  const secondary = club?.colors.secondary ?? '#ffffff'
  const textColor = getLuminance(primary) > 0.35 ? '#000000' : '#ffffff'

  const activeBenchSlots = BENCH_SLOTS.slice(0, interchangeCount)

  function handleDrop(targetSlot: string) {
    if (!dragging || dragging.slot === targetSlot) {
      setDragging(null)
      setDragOverSlot(null)
      return
    }
    // Must swap a field slot with a bench slot (or vice versa)
    const fromIsField = FIELD_SLOT_SET.has(dragging.slot as LineupSlot)
    const toIsField = FIELD_SLOT_SET.has(targetSlot as LineupSlot)
    if (fromIsField === toIsField) {
      // Field↔field or bench↔bench not allowed as interchange
      setDragging(null)
      setDragOverSlot(null)
      return
    }
    onInterchange(dragging.slot, targetSlot)
    setDragging(null)
    setDragOverSlot(null)
  }

  // Player badge used for both field and bench slots
  function PlayerBadge({ slot, compact }: { slot: string; compact?: boolean }) {
    const playerId = slotLineup[slot]
    const player = playerId ? players[playerId] : undefined
    const isDragOver = dragOverSlot === slot && dragging?.slot !== slot
    const isFromIsField = dragging ? FIELD_SLOT_SET.has(dragging.slot as LineupSlot) : false
    const targetIsField = FIELD_SLOT_SET.has(slot as LineupSlot)
    const isValidTarget = dragging && dragging.slot !== slot && isFromIsField !== targetIsField
    const isDragging = dragging?.slot === slot

    const bgColor = isDragOver && isValidTarget ? '#15803d' : primary
    const borderColor =
      isDragOver && isValidTarget ? '#4ade80' : secondary
    const name = player
      ? player.lastName.length > 9
        ? player.lastName.slice(0, 9) + '.'
        : player.lastName
      : '—'
    const num = player?.jerseyNumber ?? ''

    return (
      <div
        draggable={!!playerId}
        onDragStart={() => {
          if (playerId) setDragging({ slot, playerId })
        }}
        onDragEnd={() => {
          setDragging(null)
          setDragOverSlot(null)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOverSlot(slot)
        }}
        onDragLeave={() => {
          if (dragOverSlot === slot) setDragOverSlot(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          handleDrop(slot)
        }}
        style={{
          backgroundColor: bgColor,
          borderColor,
          color: isDragOver && isValidTarget ? '#fff' : textColor,
          opacity: isDragging ? 0.35 : 1,
          borderWidth: 1.5,
          borderStyle: 'solid',
          borderRadius: 3,
          padding: compact ? '1px 3px' : '2px 5px',
          cursor: playerId ? 'grab' : 'default',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          transition: 'background-color 0.1s, border-color 0.1s, opacity 0.2s',
          minWidth: compact ? 38 : 52,
        }}
      >
        <div style={{ fontSize: 7, fontWeight: 700, lineHeight: 1.2, display: 'flex', gap: 2, alignItems: 'baseline' }}>
          <span style={{ opacity: 0.65, minWidth: 10 }}>{num}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        </div>
        {!compact && (
          <div style={{ fontSize: 6, lineHeight: 1, opacity: 0.55 }}>{slot}</div>
        )}
      </div>
    )
  }

  if (compact) {
    return (
      <div
        className="flex flex-wrap items-center gap-1 rounded border border-border/50 bg-muted/20 px-2 py-1.5"
        onDragOver={(e) => e.preventDefault()}
      >
        <span className="text-[9px] text-muted-foreground self-center mr-1 uppercase tracking-wide">
          Bench
        </span>
        {activeBenchSlots.map((slot) => (
          <PlayerBadge key={slot} slot={slot} />
        ))}
        <span className="text-[8px] text-muted-foreground ml-auto">Drag to field</span>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Interchange
        </span>
        <span className="text-[9px] text-muted-foreground">
          Drag to swap
        </span>
      </div>

      {/* Compact landscape field showing 18 field player positions */}
      <div
        className="relative rounded overflow-hidden"
        style={{ aspectRatio: '35 / 27' }}
        onDragOver={(e) => e.preventDefault()}
      >
        <FieldSvg idPrefix="ic-field" landscape />

        {FIELD_SLOTS_LANDSCAPE.map((slotPos) => (
          <div
            key={slotPos.slot}
            style={{
              position: 'absolute',
              top: `${slotPos.top}%`,
              left: `${slotPos.left}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <PlayerBadge slot={slotPos.slot} compact />
          </div>
        ))}
      </div>

      {/* Bench strip */}
      <div
        className="flex flex-wrap gap-1 rounded border border-border/50 bg-muted/20 px-2 py-1.5"
        onDragOver={(e) => e.preventDefault()}
      >
        <span className="text-[9px] text-muted-foreground self-center mr-1 uppercase tracking-wide">
          Bench
        </span>
        {activeBenchSlots.map((slot) => (
          <PlayerBadge key={slot} slot={slot} />
        ))}
      </div>
    </div>
  )
}
