import { useMemo } from 'react'
import type { Player, LineupSlot } from '@/types/player'
import type { Club } from '@/types/club'
import { getLineupSlots } from '@/engine/core/constants'
import { FIELD_SLOTS, OPPOSITE_SLOT } from './fieldConstants'
import { FieldSvg } from './FieldSvg'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MatchupFieldPreviewProps {
  userLineup: Record<string, string>
  opponentLineup: Record<string, string>
  players: Record<string, Player>
  userClub: Club
  opponentClub: Club
  interchangeCount: number
}

// ---------------------------------------------------------------------------
// Compact magnet
// ---------------------------------------------------------------------------

function CompactMagnet({
  player,
  color,
  side,
}: {
  player: Player | null
  color: string
  side: 'left' | 'right'
}) {
  if (!player) {
    return (
      <div
        className="flex h-[24px] w-[60px] items-center justify-center rounded-md border-2 border-dashed text-[8px] text-zinc-400"
        style={{ borderColor: `${color}55`, backgroundColor: `${color}15` }}
      >
        —
      </div>
    )
  }

  const surname =
    player.lastName.length > 6
      ? player.lastName.slice(0, 5) + '.'
      : player.lastName

  return (
    <div
      className="flex h-[24px] w-[60px] items-center gap-0.5 rounded-md border-2 px-1"
      style={{
        borderColor: `${color}cc`,
        backgroundColor: `${color}40`,
        justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
      }}
    >
      {side === 'left' ? (
        <>
          <span className="shrink-0 text-[8px] font-bold leading-none text-zinc-100">
            #{player.jerseyNumber}
          </span>
          <span className="min-w-0 truncate text-[8px] leading-none text-zinc-100">
            {surname}
          </span>
        </>
      ) : (
        <>
          <span className="min-w-0 truncate text-[8px] leading-none text-zinc-100">
            {surname}
          </span>
          <span className="shrink-0 text-[8px] font-bold leading-none text-zinc-100">
            #{player.jerseyNumber}
          </span>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Interchange bench helpers
// ---------------------------------------------------------------------------

function getInterchangeSlots(interchangeCount: number): LineupSlot[] {
  return getLineupSlots(interchangeCount).filter((s) =>
    s.startsWith('I'),
  ) as LineupSlot[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MatchupFieldPreview({
  userLineup,
  opponentLineup,
  players,
  userClub,
  opponentClub,
  interchangeCount,
}: MatchupFieldPreviewProps) {
  const userColor = userClub?.colors.primary ?? '#22c55e'
  const oppColor = opponentClub?.colors.primary ?? '#ef4444'

  const interchangeSlots = useMemo(
    () => getInterchangeSlots(interchangeCount),
    [interchangeCount],
  )

  // Gather user interchange players
  const userBench = useMemo(
    () =>
      interchangeSlots
        .map((slot) => {
          const pid = userLineup[slot]
          return pid ? players[pid] ?? null : null
        })
        .filter(Boolean) as Player[],
    [interchangeSlots, userLineup, players],
  )

  // Gather opponent interchange players
  const oppBench = useMemo(
    () =>
      interchangeSlots
        .map((slot) => {
          const pid = opponentLineup[slot]
          return pid ? players[pid] ?? null : null
        })
        .filter(Boolean) as Player[],
    [interchangeSlots, opponentLineup, players],
  )

  return (
    <div className="w-full space-y-2">
      {/* Legend */}
      <div className="flex items-center justify-center gap-3 text-[10px]">
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border"
            style={{ backgroundColor: userColor, borderColor: userColor }}
          />
          <span className="font-semibold">{userClub?.abbreviation ?? 'You'}</span>
        </span>
        <span className="text-muted-foreground">vs</span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border"
            style={{ backgroundColor: oppColor, borderColor: oppColor }}
          />
          <span className="font-semibold">{opponentClub?.abbreviation ?? 'Opp'}</span>
        </span>
      </div>

      {/* Field */}
      <div
        className="relative mx-auto w-full max-w-[760px]"
        style={{ aspectRatio: '27 / 35' }}
      >
        {/* SVG ground */}
        <FieldSvg idPrefix="matchup" />

        {/* Paired magnets at each field position */}
        {FIELD_SLOTS.map((pos) => {
          const userPlayerId = userLineup[pos.slot]
          const userPlayer = userPlayerId ? players[userPlayerId] ?? null : null

          const oppSlot = OPPOSITE_SLOT[pos.slot]
          const oppPlayerId = oppSlot ? opponentLineup[oppSlot] : undefined
          const oppPlayer = oppPlayerId ? players[oppPlayerId] ?? null : null

          return (
            <div
              key={pos.slot}
              className="absolute z-20 flex flex-col items-center"
              style={{
                top: `${pos.top}%`,
                left: `${pos.left}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {/* Position label */}
              <span className="mb-0.5 text-[7px] font-bold uppercase leading-none text-white/50">
                {pos.label}
              </span>
              {/* Magnet pair */}
              <div className="flex items-center gap-0.5">
                <CompactMagnet player={userPlayer} color={userColor} side="left" />
                <CompactMagnet player={oppPlayer} color={oppColor} side="right" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Interchange bench */}
      <div
        className="relative mx-auto w-full max-w-[760px] rounded-lg border border-zinc-700 bg-zinc-800/85 px-3 py-3"
        style={{ minHeight: 70 }}
      >
        <span className="absolute -top-2 left-3 bg-zinc-800 px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Interchange
        </span>
        <div className="flex items-start gap-3">
          {/* User bench */}
          <div className="flex flex-1 flex-wrap gap-1 pt-1">
            {userBench.length > 0 ? (
              userBench.map((p) => (
                <CompactMagnet key={p.id} player={p} color={userColor} side="left" />
              ))
            ) : (
              <span className="text-[9px] text-zinc-500">No interchange</span>
            )}
          </div>
          {/* Divider */}
          <div className="mx-1 h-8 w-px bg-zinc-600" />
          {/* Opponent bench */}
          <div className="flex flex-1 flex-wrap justify-end gap-1 pt-1">
            {oppBench.length > 0 ? (
              oppBench.map((p) => (
                <CompactMagnet key={p.id} player={p} color={oppColor} side="right" />
              ))
            ) : (
              <span className="text-[9px] text-zinc-500">No interchange</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
