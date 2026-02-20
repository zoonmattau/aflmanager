import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X } from 'lucide-react'
import { FieldSvg } from '@/components/lineup/FieldSvg'
import { FIELD_SLOTS } from '@/components/lineup/fieldConstants'
import type { Club, ClubGameplan } from '@/types/club'
import type { Player, LineupSlot } from '@/types/player'
import type {
  WeeklyMatchupTactics,
  MatchupInstructionIntensity,
  HardTagInstruction,
} from '@/types/game'
import type { MatchKeyEvent } from '@/types/match'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlayPhase = 'midfield' | 'attack' | 'defense' | 'stoppage'

export type FieldInstruction = {
  type: 'tag-change' | 'role-change' | 'position-swap'
  playerAId?: string
  playerBId?: string
  targetPlayerId?: string
  intensity?: MatchupInstructionIntensity
  note: string
}

export interface LiveFieldViewProps {
  userSlotLineup: Record<string, string>
  opponentSlotLineup: Record<string, string>
  players: Record<string, Player>
  userClub: Club | undefined
  opponentClub: Club | undefined
  userClubId: string
  userGameplan: ClubGameplan | null
  userMatchupTactics: WeeklyMatchupTactics | null
  matchPhase: 'pre-match' | 'simulating-quarter' | 'quarter-break' | 'complete'
  quartersCompleted: number
  recentKeyEvents: MatchKeyEvent[]
  onInstruction: (adj: FieldInstruction) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIELD_SLOT_MAP = new Map(FIELD_SLOTS.map((s) => [s.slot as string, s]))

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

const FWD_SLOTS = new Set<string>(['FF', 'LFP', 'RFP', 'CHF', 'LHF', 'RHF'])
const MID_SLOTS = new Set<string>(['C', 'RK', 'RR', 'ROV', 'LW', 'RW'])

function getDrift(
  slot: LineupSlot,
  phase: PlayPhase,
  gameplan: ClubGameplan | null,
): { dy: number; dx: number } {
  const tempo = gameplan?.tempo ?? 'medium'
  const amp = tempo === 'fast' ? 1.6 : tempo === 'slow' ? 0.6 : 1.0

  const isFwd = FWD_SLOTS.has(slot)
  const isMid = MID_SLOTS.has(slot)

  let dy = 0
  let dx = 0

  switch (phase) {
    case 'attack':
      dy = isFwd ? 3.5 : isMid ? 1.8 : 0.5
      dy *= amp
      break
    case 'defense':
      dy = isFwd ? -2.0 : isMid ? -3.0 : -1.0
      dy *= amp
      break
    case 'stoppage':
      dy = isFwd ? 1.0 : isMid ? 0 : -0.5
      dy *= amp
      if (slot === 'LW') dx = 2.5 * amp
      else if (slot === 'RW') dx = -2.5 * amp
      else if (slot === 'ROV' || slot === 'RR') dx = 1.5 * amp
      else if (slot === 'RK' || slot === 'C') dx = -1.5 * amp
      break
    case 'midfield':
    default:
      break
  }

  return { dy, dx }
}

// ---------------------------------------------------------------------------
// ContestedZoneOverlay
// ---------------------------------------------------------------------------

function ContestedZoneOverlay({
  gameplan,
  phase,
}: {
  gameplan: ClubGameplan | null
  phase: PlayPhase
}) {
  const fwdPressure = gameplan?.forwardLine === 'press' || phase === 'attack'
  const defPressure = gameplan?.defensiveLine === 'press' || phase === 'defense'
  const midRx = gameplan?.centreTactic === 'cluster' ? 38 : 55
  const midRy = midRx * 0.7

  return (
    <>
      {/* Forward 50 zone (bottom of oval — user attacking end) */}
      <ellipse
        cx="270"
        cy="620"
        rx="115"
        ry="58"
        fill={fwdPressure ? '#22c55e' : '#60a5fa'}
        opacity={fwdPressure ? 0.26 : 0.14}
        style={{ pointerEvents: 'none' }}
      />
      {/* Centre zone */}
      <ellipse
        cx="270"
        cy="350"
        rx={midRx}
        ry={midRy}
        fill="#60a5fa"
        opacity={phase === 'stoppage' ? 0.32 : 0.15}
        style={{ pointerEvents: 'none' }}
      />
      {/* Defensive 50 zone (top of oval — user defending end) */}
      <ellipse
        cx="270"
        cy="80"
        rx="115"
        ry="58"
        fill={defPressure ? '#f97316' : '#60a5fa'}
        opacity={defPressure ? 0.22 : 0.14}
        style={{ pointerEvents: 'none' }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// TagLineOverlay
// ---------------------------------------------------------------------------

function TagLineOverlay({
  hardTags,
  localLineup,
  opponentSlotLineup,
}: {
  hardTags: HardTagInstruction[]
  localLineup: Record<string, string>
  opponentSlotLineup: Record<string, string>
}) {
  if (hardTags.length === 0) return null

  // Build reverse lookups: playerId → slot
  const userPlayerSlot = new Map<string, string>()
  for (const [slot, pid] of Object.entries(localLineup)) {
    if (pid) userPlayerSlot.set(pid, slot)
  }
  const oppPlayerSlot = new Map<string, string>()
  for (const [slot, pid] of Object.entries(opponentSlotLineup)) {
    if (pid) oppPlayerSlot.set(pid, slot)
  }

  return (
    <>
      {hardTags.map((tag) => {
        const taggerSlot = userPlayerSlot.get(tag.taggerPlayerId)
        const targetSlot = oppPlayerSlot.get(tag.targetPlayerId)
        if (!taggerSlot || !targetSlot) return null

        const taggerPos = FIELD_SLOT_MAP.get(taggerSlot)
        const targetPos = FIELD_SLOT_MAP.get(targetSlot)
        if (!taggerPos || !targetPos) return null

        // Convert % coords to SVG units (540 wide, 700 tall)
        const x1 = taggerPos.left * 5.4
        const y1 = taggerPos.top * 7.0
        // Opponent positions are mirrored (both axes)
        const x2 = (100 - targetPos.left) * 5.4
        const y2 = (100 - targetPos.top) * 7.0
        const mx = (x1 + x2) / 2
        const my = (y1 + y2) / 2

        const dashArray =
          tag.intensity === 'light'
            ? '4 4'
            : tag.intensity === 'standard'
              ? '6 2'
              : undefined
        const color =
          tag.intensity === 'light'
            ? '#9ca3af'
            : tag.intensity === 'standard'
              ? '#f97316'
              : '#ef4444'
        const strokeWidth = tag.intensity === 'hard' ? 2.8 : 1.8

        return (
          <g key={tag.id}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              opacity={0.8}
              style={{ pointerEvents: 'none' }}
            />
            <circle
              cx={mx}
              cy={my}
              r="8"
              fill={color}
              opacity={0.7}
              style={{ pointerEvents: 'none' }}
            />
            <text
              x={mx}
              y={my + 4.5}
              textAnchor="middle"
              fontSize="11"
              fill="#fff"
              style={{ pointerEvents: 'none', fontFamily: 'sans-serif' }}
            >
              T
            </text>
          </g>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// PlayerInstructionPanel
// ---------------------------------------------------------------------------

interface PlayerInstructionPanelProps {
  player: Player
  slotLabel: string
  opponentLineup: Record<string, string>
  players: Record<string, Player>
  onTagInstruction: (targetPlayerId: string, intensity: MatchupInstructionIntensity) => void
  onStartSwap: () => void
  onRoleChange: (direction: 'forward' | 'hold' | 'back') => void
  onClose: () => void
  anchorTop: number
  anchorLeft: number
}

function PlayerInstructionPanel({
  player,
  slotLabel,
  opponentLineup,
  players,
  onTagInstruction,
  onStartSwap,
  onRoleChange,
  onClose,
  anchorTop,
  anchorLeft,
}: PlayerInstructionPanelProps) {
  const [tagTarget, setTagTarget] = useState<string>('')
  const [tagIntensity, setTagIntensity] = useState<MatchupInstructionIntensity>('standard')

  const FORWARD_SLOTS = new Set(['FF', 'LFP', 'RFP', 'CHF', 'LHF', 'RHF'])
  const MID_TAG_SLOTS = new Set(['C', 'RK', 'RR', 'ROV', 'LW', 'RW'])
  const tagOptions = Object.entries(opponentLineup)
    .filter(([slot]) => FORWARD_SLOTS.has(slot) || MID_TAG_SLOTS.has(slot))
    .map(([, pid]) => players[pid])
    .filter((p): p is Player => Boolean(p))

  // Position the panel so it stays within the field bounds
  const panelTop = clamp(anchorTop - 5, 2, 55)
  const panelLeft = clamp(anchorLeft > 58 ? anchorLeft - 56 : anchorLeft + 5, 2, 42)

  return (
    <div
      className="absolute z-50 w-52 rounded-lg border border-border bg-background shadow-xl text-sm"
      style={{ top: `${panelTop}%`, left: `${panelLeft}%` }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <div>
          <span className="font-semibold text-sm">
            {player.firstName.charAt(0)}. {player.lastName}
          </span>
          <span className="ml-1.5 text-[10px] text-muted-foreground">{slotLabel}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Tag section */}
      {tagOptions.length > 0 && (
        <div className="border-b px-3 py-2 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tag Player
          </div>
          <Select value={tagTarget} onValueChange={setTagTarget}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Select opponent..." />
            </SelectTrigger>
            <SelectContent>
              {tagOptions.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.firstName.charAt(0)}. {p.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            {(['light', 'standard', 'hard'] as MatchupInstructionIntensity[]).map((intensity) => (
              <button
                key={intensity}
                type="button"
                onClick={() => setTagIntensity(intensity)}
                className={`flex-1 rounded border px-1 py-0.5 text-[10px] capitalize transition-colors ${
                  tagIntensity === intensity
                    ? 'border-primary bg-primary/20 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {intensity}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            className="w-full h-6 text-xs"
            disabled={!tagTarget}
            onClick={() => {
              if (tagTarget) onTagInstruction(tagTarget, tagIntensity)
            }}
          >
            Apply Tag
          </Button>
        </div>
      )}

      {/* Swap section */}
      <div className="border-b px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Position
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full h-6 text-xs"
          onClick={onStartSwap}
        >
          Swap with teammate...
        </Button>
      </div>

      {/* Role section */}
      <div className="px-3 py-2 space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Role
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-6 text-[10px]"
            onClick={() => onRoleChange('forward')}
          >
            Push fwd
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-6 text-[10px]"
            onClick={() => onRoleChange('hold')}
          >
            Hold
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-6 text-[10px]"
            onClick={() => onRoleChange('back')}
          >
            Drop back
          </Button>
        </div>
      </div>

      <div className="border-t px-3 py-1.5">
        <Button size="sm" variant="ghost" className="w-full h-6 text-xs" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LivePlayerToken
// ---------------------------------------------------------------------------

interface LivePlayerTokenProps {
  top: number
  left: number
  player: Player | undefined
  isUser: boolean
  isSelected: boolean
  isFlashing: boolean
  isSwapTarget: boolean
  hasTag: boolean
  onSelect: () => void
}

function LivePlayerToken({
  top,
  left,
  player,
  isUser,
  isSelected,
  isFlashing,
  isSwapTarget,
  hasTag,
  onSelect,
}: LivePlayerTokenProps) {
  const name = player
    ? `${player.firstName.charAt(0)}${player.lastName.slice(0, 3)}`
    : '?'

  if (isUser) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        style={{
          position: 'absolute',
          top: `${top}%`,
          left: `${left}%`,
          transform: 'translate(-50%, -50%)',
          transition: 'top 0.7s ease, left 0.7s ease',
          zIndex: isSelected ? 20 : 10,
        }}
        className="relative flex items-center justify-center focus:outline-none"
        title={player ? `${player.firstName} ${player.lastName}` : undefined}
      >
        {/* Swap target pulse ring */}
        {isSwapTarget && (
          <span
            className="absolute rounded-full border-2 border-green-400 animate-ping"
            style={{ width: 46, height: 46, margin: -4, display: 'block' }}
          />
        )}
        {/* Goal flash ring */}
        {isFlashing && (
          <span
            className="absolute rounded-full border-2 border-yellow-400 animate-ping"
            style={{ width: 50, height: 50, margin: -6, display: 'block' }}
          />
        )}
        {/* Selection ring */}
        {isSelected && (
          <span
            className="absolute rounded-full border-2 border-white/90"
            style={{ width: 44, height: 44, margin: -3, display: 'block' }}
          />
        )}
        {/* Token body */}
        <span
          className={`relative flex items-center justify-center rounded-full text-white text-[9px] font-bold leading-none select-none ${
            isSwapTarget ? 'bg-green-600' : 'bg-blue-600'
          }`}
          style={{ width: 38, height: 38 }}
        >
          {name}
        </span>
        {/* Tag dot */}
        {hasTag && (
          <span
            className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-orange-500 border border-background"
            style={{ transform: 'translate(25%, -25%)' }}
          />
        )}
      </button>
    )
  }

  // Opponent token (non-interactive)
  return (
    <div
      style={{
        position: 'absolute',
        top: `${top}%`,
        left: `${left}%`,
        transform: 'translate(-50%, -50%)',
        transition: 'top 0.7s ease, left 0.7s ease',
        zIndex: 5,
        pointerEvents: 'none',
      }}
      className="relative flex items-center justify-center"
      title={player ? `${player.firstName} ${player.lastName}` : undefined}
    >
      <span
        className="flex items-center justify-center rounded-full border border-red-400 text-red-300 text-[9px] font-medium leading-none select-none"
        style={{ width: 28, height: 28, backgroundColor: 'rgba(248,113,113,0.15)' }}
      >
        {name}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LiveFieldView — main export
// ---------------------------------------------------------------------------

export function LiveFieldView({
  userSlotLineup,
  opponentSlotLineup,
  players,
  userClub,
  opponentClub,
  userGameplan,
  userMatchupTactics,
  recentKeyEvents,
  onInstruction,
}: LiveFieldViewProps) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [swapSourceSlot, setSwapSourceSlot] = useState<string | null>(null)
  const [localLineup, setLocalLineup] = useState<Record<string, string>>(userSlotLineup)
  const [localTactics, setLocalTactics] = useState<WeeklyMatchupTactics | null>(
    userMatchupTactics,
  )
  const [flashSlot, setFlashSlot] = useState<string | null>(null)
  const lastFlashKeyRef = useRef<string | null>(null)

  // Sync when parent lineup changes (e.g. new match starts)
  useEffect(() => {
    setLocalLineup(userSlotLineup)
  }, [userSlotLineup])

  // Sync when parent tactics change
  useEffect(() => {
    setLocalTactics(userMatchupTactics)
  }, [userMatchupTactics])

  // Goal flash
  useEffect(() => {
    const goalEvents = recentKeyEvents.filter((e) => e.type === 'goal')
    if (goalEvents.length === 0) return
    const latest = goalEvents[goalEvents.length - 1]
    if (!latest?.playerId) return
    const key = `${latest.quarter}-${latest.minute}-${latest.playerId}`
    if (lastFlashKeyRef.current === key) return
    lastFlashKeyRef.current = key
    const scorerSlot = Object.entries(localLineup).find(([, id]) => id === latest.playerId)?.[0]
    if (scorerSlot) {
      setFlashSlot(scorerSlot)
      setTimeout(() => setFlashSlot(null), 2000)
    }
  }, [recentKeyEvents, localLineup])

  const handleTagInstruction = useCallback(
    (targetPlayerId: string, intensity: MatchupInstructionIntensity) => {
      if (!selectedSlot) return
      const taggerPlayerId = localLineup[selectedSlot]
      if (!taggerPlayerId) return
      const taggerPlayer = players[taggerPlayerId]
      const targetPlayer = players[targetPlayerId]
      const note = `Tag: ${taggerPlayer?.lastName ?? taggerPlayerId} → ${targetPlayer?.lastName ?? targetPlayerId} (${intensity})`

      const newTag: HardTagInstruction = {
        id: `tag-${Date.now()}`,
        taggerPlayerId,
        targetPlayerId,
        intensity,
      }

      setLocalTactics((prev) => {
        const existing = prev?.hardTags ?? []
        const filtered = existing.filter((t) => t.taggerPlayerId !== taggerPlayerId)
        return {
          hardTags: [...filtered, newTag],
          physicalAttention: prev?.physicalAttention ?? [],
          roleAssignments: prev?.roleAssignments ?? [],
        }
      })

      onInstruction({ type: 'tag-change', playerAId: taggerPlayerId, targetPlayerId, intensity, note })
      setSelectedSlot(null)
    },
    [selectedSlot, localLineup, players, onInstruction],
  )

  const handleStartSwap = useCallback(() => {
    setSwapSourceSlot(selectedSlot)
    setSelectedSlot(null)
  }, [selectedSlot])

  const handlePositionSwap = useCallback(
    (targetSlot: string) => {
      if (!swapSourceSlot) return
      const playerA = localLineup[swapSourceSlot]
      const playerB = localLineup[targetSlot]
      const playerAPlayer = players[playerA]
      const playerBPlayer = players[playerB]
      const note = `Swap: ${playerAPlayer?.lastName ?? swapSourceSlot} ↔ ${playerBPlayer?.lastName ?? targetSlot}`

      setLocalLineup((prev) => ({
        ...prev,
        [swapSourceSlot]: playerB,
        [targetSlot]: playerA,
      }))
      onInstruction({ type: 'position-swap', playerAId: playerA, playerBId: playerB, note })
      setSwapSourceSlot(null)
    },
    [swapSourceSlot, localLineup, players, onInstruction],
  )

  const handleRoleChange = useCallback(
    (direction: 'forward' | 'hold' | 'back') => {
      if (!selectedSlot) return
      const playerId = localLineup[selectedSlot]
      const player = players[playerId]
      const dirLabel =
        direction === 'forward'
          ? 'Push forward'
          : direction === 'back'
            ? 'Drop back'
            : 'Hold position'
      const note = `Role: ${player?.lastName ?? playerId} — ${dirLabel}`
      onInstruction({ type: 'role-change', playerAId: playerId, note })
      setSelectedSlot(null)
    },
    [selectedSlot, localLineup, players, onInstruction],
  )

  const hardTags = localTactics?.hardTags ?? []
  const taggedPlayerIds = new Set(hardTags.map((t) => t.taggerPlayerId))
  const selectedPlayer = selectedSlot ? players[localLineup[selectedSlot]] : null
  const selectedSlotData = selectedSlot ? FIELD_SLOT_MAP.get(selectedSlot) : null

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">⬆ Defending</span>
          {'  '}Attack ⬇
        </span>
        <div className="flex items-center gap-2">
          {hardTags.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-400">
              🏷 {hardTags.length} tag{hardTags.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Swap mode banner */}
      {swapSourceSlot && (
        <div className="flex items-center justify-between rounded border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs text-green-400">
          <span>
            Click a teammate to swap with{' '}
            <strong>{players[localLineup[swapSourceSlot]]?.lastName ?? swapSourceSlot}</strong>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-xs text-green-400 hover:text-green-300"
            onClick={() => setSwapSourceSlot(null)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Field container */}
      <div
        className="relative mx-auto overflow-hidden rounded select-none"
        style={{ aspectRatio: '27 / 35', maxWidth: 380 }}
        onClick={() => {
          if (!swapSourceSlot) setSelectedSlot(null)
        }}
      >
        {/* Ground SVG */}
        <FieldSvg idPrefix="live-field" />

        {/* SVG overlay: contested zones + tag lines */}
        <svg
          viewBox="0 0 540 700"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
          style={{ pointerEvents: 'none' }}
        >
          <ContestedZoneOverlay gameplan={userGameplan} phase="midfield" />
          <TagLineOverlay
            hardTags={hardTags}
            localLineup={localLineup}
            opponentSlotLineup={opponentSlotLineup}
          />
        </svg>

        {/* Opponent tokens (behind user) */}
        {FIELD_SLOTS.map((slotPos) => {
          const playerId = opponentSlotLineup[slotPos.slot]
          if (!playerId) return null
          // Mirror both axes so opponent appears on the far side of the field
          const top = clamp(100 - slotPos.top, 3, 97)
          const left = clamp(100 - slotPos.left, 5, 95)
          return (
            <LivePlayerToken
              key={`opp-${slotPos.slot}`}
              top={top}
              left={left}
              player={players[playerId]}
              isUser={false}
              isSelected={false}
              isFlashing={false}
              isSwapTarget={false}
              hasTag={false}
              onSelect={() => {}}
            />
          )
        })}

        {/* User tokens */}
        {FIELD_SLOTS.map((slotPos) => {
          const slot = slotPos.slot
          const playerId = localLineup[slot]
          if (!playerId) return null

          const drift = getDrift(slot, 'midfield', userGameplan)
          const top = clamp(slotPos.top + drift.dy, 3, 97)
          const left = clamp(slotPos.left + drift.dx, 5, 95)
          const isSelected = selectedSlot === slot
          const isSwapSrc = swapSourceSlot === slot
          const isSwapTarget = Boolean(swapSourceSlot) && !isSwapSrc

          return (
            <LivePlayerToken
              key={slot}
              top={top}
              left={left}
              player={players[playerId]}
              isUser
              isSelected={isSelected}
              isFlashing={flashSlot === slot}
              isSwapTarget={isSwapTarget}
              hasTag={taggedPlayerIds.has(playerId)}
              onSelect={() => {
                if (swapSourceSlot && !isSwapSrc) {
                  handlePositionSwap(slot)
                } else if (!isSwapSrc) {
                  setSelectedSlot(isSelected ? null : slot)
                }
              }}
            />
          )
        })}

        {/* Instruction panel (shown when a player is selected) */}
        {selectedSlot && selectedPlayer && selectedSlotData && (
          <PlayerInstructionPanel
            player={selectedPlayer}
            slotLabel={selectedSlotData.label}
            opponentLineup={opponentSlotLineup}
            players={players}
            onTagInstruction={handleTagInstruction}
            onStartSwap={handleStartSwap}
            onRoleChange={handleRoleChange}
            onClose={() => setSelectedSlot(null)}
            anchorTop={selectedSlotData.top}
            anchorLeft={selectedSlotData.left}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-600" />
          {userClub?.abbreviation ?? 'Your team'}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-full border border-red-400"
            style={{ backgroundColor: 'rgba(248,113,113,0.2)' }}
          />
          {opponentClub?.abbreviation ?? 'Opponent'}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-orange-500" />
          Tag
        </span>
      </div>
    </div>
  )
}
