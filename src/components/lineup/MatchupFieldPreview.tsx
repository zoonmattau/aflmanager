import { useMemo } from 'react'
import type { Player, LineupSlot } from '@/types/player'
import type { Club } from '@/types/club'
import { getLineupSlots } from '@/engine/core/constants'
import { getOverallRating } from '@/engine/player/playerRating'
import { OPPOSITE_SLOT } from './fieldConstants'
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
  substitutesEnabled?: boolean
  userSubstituteId?: string | null
  opponentSubstituteId?: string | null
}

// ---------------------------------------------------------------------------
// Custom field positions for the matchup view.
// Pockets and flanks are spread wider than in fieldConstants so that
// the vertical magnet stacks (58px wide) don't overlap each other.
// ---------------------------------------------------------------------------

interface MatchupSlot { slot: LineupSlot; label: string; top: number; left: number }

const MATCHUP_SLOTS: MatchupSlot[] = [
  // Back line
  { slot: 'FB',  label: 'FB',  top:  7.9, left: 50.0 },
  { slot: 'LBP', label: 'LBP', top: 13.5, left: 34.0 }, // moved right from 31.5
  { slot: 'RBP', label: 'RBP', top: 13.5, left: 66.0 }, // moved left  from 68.5

  // Half-back line
  { slot: 'CHB', label: 'CHB', top: 25.7, left: 50.0 },
  { slot: 'LHB', label: 'LHB', top: 25.7, left: 20.0 }, // moved left  from 23.1
  { slot: 'RHB', label: 'RHB', top: 25.7, left: 80.0 }, // moved right from 76.9

  // Centre square
  { slot: 'RK',  label: 'RK',  top: 40.5, left: 38.5 },
  { slot: 'RR',  label: 'RR',  top: 40.5, left: 61.5 },
  { slot: 'ROV', label: 'ROV', top: 59.5, left: 38.5 },
  { slot: 'LW',  label: 'LW',  top: 50.0, left:  8.5 }, // slightly more extreme
  { slot: 'C',   label: 'C',   top: 59.5, left: 61.5 },
  { slot: 'RW',  label: 'RW',  top: 50.0, left: 91.5 }, // slightly more extreme

  // Half-forward line
  { slot: 'CHF', label: 'CHF', top: 74.3, left: 50.0 },
  { slot: 'LHF', label: 'LHF', top: 74.3, left: 20.0 }, // mirror of LHB
  { slot: 'RHF', label: 'RHF', top: 74.3, left: 80.0 }, // mirror of RHB

  // Forward line
  { slot: 'FF',  label: 'FF',  top: 92.1, left: 50.0 },
  { slot: 'LFP', label: 'LFP', top: 86.5, left: 34.0 }, // mirror of LBP
  { slot: 'RFP', label: 'RFP', top: 86.5, left: 66.0 }, // mirror of RBP
]

// ---------------------------------------------------------------------------
// Anchor transform: keeps stacks inside the field at the edges.
// Stack total height ≈ 75px (2×34px magnet + label + gaps).
// top < 17% → anchor top (stack falls downward from grid point)
// top > 83% → anchor bottom (stack rises upward from grid point)
// ---------------------------------------------------------------------------

function stackTransform(top: number): string {
  if (top < 17) return 'translate(-50%, 0%)'
  if (top > 83) return 'translate(-50%, -100%)'
  return 'translate(-50%, -50%)'
}

// ---------------------------------------------------------------------------
// Field magnet — 58px wide so pockets/flanks don't overlap
// ---------------------------------------------------------------------------

function FieldMagnet({ player, color }: { player: Player | null; color: string }) {
  if (!player) {
    return (
      <div
        className="flex h-[34px] w-[58px] items-center justify-center rounded border border-dashed text-[8px] text-zinc-400"
        style={{ borderColor: `${color}44`, backgroundColor: `${color}0e` }}
      >
        —
      </div>
    )
  }

  const overall = getOverallRating(player)
  const ovrColor =
    overall >= 88 ? '#facc15' :
    overall >= 75 ? '#86efac' :
    overall >= 60 ? '#cbd5e1' :
    '#94a3b8'

  return (
    <div
      className="flex h-[34px] w-[58px] flex-col items-center justify-center rounded border px-0.5"
      style={{ borderColor: `${color}bb`, backgroundColor: `${color}30` }}
    >
      <span className="max-w-full truncate text-[8px] font-semibold leading-tight text-white">
        {player.lastName}
      </span>
      <div className="flex items-center gap-0.5">
        <span className="text-[7px] leading-none text-zinc-400">{player.position.primary}</span>
        <span className="text-[7px] leading-none text-zinc-600">·</span>
        <span className="text-[8px] font-bold leading-none tabular-nums" style={{ color: ovrColor }}>
          {overall}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bench magnet — wider, sits in the sidebar strips
// ---------------------------------------------------------------------------

function BenchMagnet({ player, color }: { player: Player | null; color: string }) {
  if (!player) {
    return (
      <div
        className="flex h-[36px] w-full items-center justify-center rounded border border-dashed text-[8px] text-zinc-400"
        style={{ borderColor: `${color}44`, backgroundColor: `${color}0e` }}
      >
        —
      </div>
    )
  }

  const overall = getOverallRating(player)
  const ovrColor =
    overall >= 88 ? '#facc15' :
    overall >= 75 ? '#86efac' :
    overall >= 60 ? '#cbd5e1' :
    '#94a3b8'

  return (
    <div
      className="flex h-[36px] w-full flex-col items-center justify-center rounded border px-1"
      style={{ borderColor: `${color}bb`, backgroundColor: `${color}30` }}
    >
      <span className="max-w-full truncate text-[9px] font-semibold leading-tight text-white">
        {player.lastName}
      </span>
      <div className="flex items-center gap-0.5">
        <span className="text-[7px] leading-none text-zinc-400">{player.position.primary}</span>
        <span className="text-[7px] leading-none text-zinc-600">·</span>
        <span className="text-[8px] font-bold leading-none tabular-nums" style={{ color: ovrColor }}>
          {overall}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInterchangeSlots(interchangeCount: number): LineupSlot[] {
  return getLineupSlots(interchangeCount).filter((s) => s.startsWith('I')) as LineupSlot[]
}

function ArrowUp({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M6 10L6 2M3 5L6 2L9 5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowDown({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M6 2L6 10M3 7L6 10L9 7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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
  substitutesEnabled = false,
  userSubstituteId = null,
  opponentSubstituteId = null,
}: MatchupFieldPreviewProps) {
  const userColor = userClub?.colors.primary ?? '#22c55e'
  const oppColor  = opponentClub?.colors.primary ?? '#ef4444'

  const interchangeSlots = useMemo(
    () => getInterchangeSlots(interchangeCount),
    [interchangeCount],
  )

  const userBench = useMemo(
    () => interchangeSlots.map((slot) => {
      const pid = userLineup[slot]
      return pid ? (players[pid] ?? null) : null
    }),
    [interchangeSlots, userLineup, players],
  )

  const oppBench = useMemo(
    () => interchangeSlots.map((slot) => {
      const pid = opponentLineup[slot]
      return pid ? (players[pid] ?? null) : null
    }),
    [interchangeSlots, opponentLineup, players],
  )

  const userSubstitute = useMemo(() => {
    if (!substitutesEnabled) return null
    const assigned = new Set(Object.values(userLineup))
    if (userSubstituteId) {
      const explicit = players[userSubstituteId]
      if (explicit && !assigned.has(explicit.id)) return explicit
    }
    return Object.values(players)
      .filter((p) => p.clubId === userClub.id && !p.injury && p.fitness >= 50)
      .filter((p) => !assigned.has(p.id))
      .sort((a, b) => getOverallRating(b) - getOverallRating(a))[0] ?? null
  }, [substitutesEnabled, userSubstituteId, players, userClub.id, userLineup])

  const opponentSubstitute = useMemo(() => {
    if (!substitutesEnabled) return null
    const assigned = new Set(Object.values(opponentLineup))
    if (opponentSubstituteId) {
      const explicit = players[opponentSubstituteId]
      if (explicit && !assigned.has(explicit.id)) return explicit
    }
    return Object.values(players)
      .filter((p) => p.clubId === opponentClub.id && !p.injury && p.fitness >= 50)
      .filter((p) => !assigned.has(p.id))
      .sort((a, b) => getOverallRating(b) - getOverallRating(a))[0] ?? null
  }, [substitutesEnabled, opponentSubstituteId, players, opponentClub.id, opponentLineup])

  // ── Kicking direction + legend row ──────────────────────────────────────
  const directionRow = (
    <div className="mb-1 flex items-center justify-between text-[10px]">
      {/* Opp attacks downward in this view */}
      <div
        className="flex items-center gap-1 rounded-full px-2.5 py-0.5"
        style={{ backgroundColor: `${oppColor}20`, border: `1px solid ${oppColor}50` }}
      >
        <span className="font-bold" style={{ color: oppColor }}>{opponentClub?.abbreviation ?? 'OPP'}</span>
        <ArrowDown color={oppColor} />
        <span style={{ color: `${oppColor}99` }}>attacking</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: userColor }} />
          <span className="font-semibold">{userClub?.abbreviation ?? 'YOU'}</span>
        </span>
        <span className="text-zinc-500">vs</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: oppColor }} />
          <span className="font-semibold">{opponentClub?.abbreviation ?? 'OPP'}</span>
        </span>
      </div>

      {/* User attacks upward in this view */}
      <div
        className="flex items-center gap-1 rounded-full px-2.5 py-0.5"
        style={{ backgroundColor: `${userColor}20`, border: `1px solid ${userColor}50` }}
      >
        <span style={{ color: `${userColor}99` }}>attacking</span>
        <ArrowUp color={userColor} />
        <span className="font-bold" style={{ color: userColor }}>{userClub?.abbreviation ?? 'YOU'}</span>
      </div>
    </div>
  )

  // ── Bench strip ──────────────────────────────────────────────────────────
  const BenchStrip = ({
    benchPlayers,
    substitutePlayer,
    color,
    abbr,
    side,
  }: {
    benchPlayers: (Player | null)[]
    substitutePlayer: Player | null
    color: string
    abbr: string
    side: 'left' | 'right'
  }) => (
    <div className="flex w-[105px] shrink-0 flex-col gap-1 rounded-lg bg-zinc-900/90 p-1.5">
      {/* Header */}
      <div
        className="flex items-center justify-center gap-1 rounded py-0.5 text-[9px] font-semibold uppercase tracking-wide"
        style={{ backgroundColor: `${color}18`, color }}
      >
        <span>{abbr}</span>
        <span className="text-zinc-500 font-normal normal-case">bench</span>
      </div>
      {/* Interchange */}
      {benchPlayers.length > 0 ? (
        benchPlayers.map((p, idx) => (
          <BenchMagnet key={`${side}-bench-${idx}-${p?.id ?? 'empty'}`} player={p} color={color} />
        ))
      ) : (
        <span className="text-center text-[8px] text-zinc-500">—</span>
      )}
      {/* Sub */}
      {substitutesEnabled && (
        <>
          <div className="mt-0.5 border-t border-zinc-700/60 pt-0.5">
            <p className="mb-0.5 text-center text-[8px] font-semibold uppercase tracking-wide text-zinc-500">Sub</p>
            <BenchMagnet player={substitutePlayer} color={color} />
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="w-full">
      {directionRow}

      {/* ── Main row: user bench | field | opp bench ── */}
      <div className="flex items-start gap-2">
        {/* User bench (left) */}
        <BenchStrip
          benchPlayers={userBench}
          substitutePlayer={userSubstitute}
          color={userColor}
          abbr={userClub?.abbreviation ?? 'YOU'}
          side="left"
        />

        {/* Field */}
        <div className="relative min-w-0 flex-1 overflow-hidden" style={{ aspectRatio: '27 / 35' }}>
          <FieldSvg idPrefix="matchup" />

          {MATCHUP_SLOTS.map((pos) => {
            const userPlayerId = userLineup[pos.slot]
            const userPlayer = userPlayerId ? (players[userPlayerId] ?? null) : null

            const oppSlot = OPPOSITE_SLOT[pos.slot]
            const oppPlayerId = oppSlot ? opponentLineup[oppSlot] : undefined
            const oppPlayer = oppPlayerId ? (players[oppPlayerId] ?? null) : null

            return (
              <div
                key={pos.slot}
                className="absolute z-20 flex flex-col items-center gap-[2px]"
                style={{
                  top: `${pos.top}%`,
                  left: `${pos.left}%`,
                  transform: stackTransform(pos.top),
                }}
              >
                {/* Opponent magnet on top — they're attacking toward the top goal */}
                <FieldMagnet player={oppPlayer} color={oppColor} />
                {/* Position label */}
                <span className="text-[6px] font-bold uppercase leading-none text-white/35">
                  {pos.label}
                </span>
                {/* User magnet on bottom — user attacks toward the bottom goal */}
                <FieldMagnet player={userPlayer} color={userColor} />
              </div>
            )
          })}
        </div>

        {/* Opponent bench (right) */}
        <BenchStrip
          benchPlayers={oppBench}
          substitutePlayer={opponentSubstitute}
          color={oppColor}
          abbr={opponentClub?.abbreviation ?? 'OPP'}
          side="right"
        />
      </div>
    </div>
  )
}
