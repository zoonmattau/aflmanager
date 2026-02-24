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
import { FIELD_SLOTS_LANDSCAPE } from '@/components/lineup/fieldConstants'
import type { Club, ClubGameplan } from '@/types/club'
import type { Player, LineupSlot } from '@/types/player'
import type {
  WeeklyMatchupTactics,
  MatchupInstructionIntensity,
  HardTagInstruction,
} from '@/types/game'
import type { MatchKeyEvent, MatchPlayerStats } from '@/types/match'
import type { MatchTick } from '@/types/matchTick'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlayPhase = 'midfield' | 'attack' | 'defense' | 'stoppage'

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
  /** Called with the two slot IDs whenever the user swaps two players on the field. */
  onSlotSwap?: (slotA: string, slotB: string) => void
  /** The player currently holding the ball — their magnet gets a pulsing white ring. */
  ballCarrierPlayerId?: string
  /** Possession chain links used to draw arrows on the field. */
  possessionChain?: MatchTick[]
  /** Team colour for chain arrows (primary colour of the team in possession). */
  chainTeamColor?: string
  /** Current play phase derived from the live tick — drives player drift and zone overlays. */
  livePlayPhase?: PlayPhase
  /** When set, renders an animated dot that slides off the field bottom (running-off animation). */
  runningOffAnim?: { top: number; left: number; color: string } | null
  /** Whether the user's team attacks RIGHT this quarter. Flips each quarter per coin toss. Default true. */
  teamAttacksRight?: boolean
  /** Current ball zone from the live tick — used by the animation system to attract players. */
  ballZone?: string
  /** When true the animation loop freezes all player magnets in place. */
  paused?: boolean
  /** Per-player match stats keyed by playerId — used for spectator mode stat popup. */
  matchStats?: Record<string, MatchPlayerStats>
  /** Current tick's possession type — used to snap opponents near the ball on tackles/contests. */
  currentPossessionType?: string
  /** True during centre bounces (after goals, start of quarter) — only 4 per team in centre square. */
  isCentreBounce?: boolean
  /** Pre-game animation override targets. When set, magnets spring toward these
   *  positions instead of their tick-driven/drift targets. */
  animTargetOverrides?: Map<string, { top: number; left: number }> | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIELD_SLOT_MAP = new Map(FIELD_SLOTS_LANDSCAPE.map((s) => [s.slot as string, s]))

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

/** Approximate luminance for deciding text colour contrast. */
function getLuminance(hex: string): number {
  if (hex.length < 7) return 0
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const FWD_SLOTS = new Set<string>(['FF', 'LFP', 'RFP', 'CHF', 'LHF', 'RHF'])
const MID_SLOTS = new Set<string>(['C', 'RK', 'RR', 'ROV', 'LW', 'RW'])

// Landscape orientation: left = defending end, right = attacking end.
// dx moves a player toward/away from goals (left-right).
// dy moves a player up/down across the wings.
function getDrift(
  slot: LineupSlot,
  phase: PlayPhase,
  gameplan: ClubGameplan | null,
): { dy: number; dx: number } {
  const tempo = gameplan?.tempo ?? 'medium'
  const amp = tempo === 'fast' ? 2.0 : tempo === 'slow' ? 0.4 : 1.0

  const isFwd = FWD_SLOTS.has(slot)
  const isMid = MID_SLOTS.has(slot)

  let dy = 0
  let dx = 0

  switch (phase) {
    case 'attack':
      // Move RIGHT (positive dx) — toward attacking goals
      dx = (isFwd ? 8.0 : isMid ? 5.0 : 2.0) * amp
      break
    case 'defense':
      // Move LEFT (negative dx) — drop back toward own goals
      dx = (isFwd ? -5.5 : isMid ? -7.0 : -3.0) * amp
      break
    case 'stoppage':
      dx = (isFwd ? 1.0 : isMid ? 0 : -0.5) * amp
      // Wings contract vertically toward centre in landscape
      if (slot === 'LW') dy = 8.0 * amp        // LW at top ~16%, move DOWN toward centre
      else if (slot === 'RW') dy = -8.0 * amp   // RW at bottom ~84%, move UP toward centre
      else if (slot === 'ROV' || slot === 'RR') dy = 5.0 * amp
      else if (slot === 'RK' || slot === 'C') dy = -5.0 * amp
      break
    case 'midfield':
    default:
      break
  }

  return { dy, dx }
}

// ---------------------------------------------------------------------------
// Animation helpers — RAF spring system
// ---------------------------------------------------------------------------

// Slot groups
const DEEP_BACK_SLOTS = new Set<string>(['FB', 'LBP', 'RBP'])
const HBF_SLOTS = new Set<string>(['CHB', 'LHB', 'RHB'])
const FOLLOWER_SLOTS = new Set<string>(['RK', 'RR', 'ROV', 'C'])
const WING_SLOTS = new Set<string>(['LW', 'RW'])
// FWD_SLOTS already: ['FF', 'LFP', 'RFP', 'CHF', 'LHF', 'RHF']

// Man-marking pairings — same positional pairing for both sides of the ground
const BACK_TO_OPP_SLOT: Record<string, string> = {
  FB: 'FF',  LBP: 'LFP', RBP: 'RFP',
  CHB: 'CHF', LHB: 'LHF', RHB: 'RHF',
}

type RoleGroup = 'follower' | 'wing' | 'halfback' | 'forward' | 'back'

function getRoleGroup(slot: string): RoleGroup {
  if (FOLLOWER_SLOTS.has(slot)) return 'follower'
  if (WING_SLOTS.has(slot)) return 'wing'
  if (HBF_SLOTS.has(slot)) return 'halfback'
  if (FWD_SLOTS.has(slot)) return 'forward'
  if (DEEP_BACK_SLOTS.has(slot)) return 'back'
  return 'follower'
}

function ballZoneToX(zone: string | undefined, teamAttacksRight: boolean): number {
  const zoneMap: Record<string, number> = {
    back50: 12, backHalf: 28, midfield: 50, forwardHalf: 72, forward50: 88,
  }
  const baseX = zoneMap[zone ?? 'midfield'] ?? 50
  return teamAttacksRight ? baseX : 100 - baseX
}

const SPRING_K = 0.14
const SPRING_DAMP = 0.74

// Jitter = subtle "alive" sway, NOT the primary source of movement.
// Purposeful movement comes from leads, man-marking, ball attraction, etc.
const JITTER_AMP: Record<RoleGroup, number> = {
  follower: 0.65, wing: 0.55, halfback: 0.40, forward: 0.55, back: 0.25,
}
const BALL_ATTRACTION: Record<RoleGroup, number> = {
  follower: 0.60, wing: 0.45, halfback: 0.28, forward: 0.25, back: 0.08,
}
/** Minimum distance (% of field) before same-team players repel each other. */
const REPULSION_RADIUS = 7
/** Strength of the repulsion nudge per frame. */
const REPULSION_STRENGTH = 0.35

interface PlayerAnimState {
  x: number; y: number; vx: number; vy: number
  phaseX: number; phaseY: number
  /** Smoothed base position — lerps toward the raw drift-adjusted slot pos to prevent jumps. */
  smoothBaseX: number; smoothBaseY: number
}

interface AnimParams {
  userSlotLineup: Record<string, string>
  opponentSlotLineup: Record<string, string>
  userGameplan: ClubGameplan | null
  activePhase: PlayPhase
  oppPhase: PlayPhase
  teamAttacksRight: boolean
  ballZone: string | undefined
  ballCarrierPlayerId: string | undefined
  paused: boolean
  /** Timestamp (ms) until which the animation loop should keep running despite being paused.
   *  Used to let players settle into new positions after a step-forward tick. */
  animateUntil: number
  /** Current tick's possession type — used to snap opponents near the ball on tackles. */
  currentPossessionType?: string
  /** True during centre bounces — only 4 per team allowed in the centre square. */
  isCentreBounce?: boolean
  /** Pre-game animation override targets — magnets spring to these instead of normal positions. */
  animTargetOverrides?: Map<string, { top: number; left: number }> | null
}

// TagLineOverlay — landscape 700×540 viewBox
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

        // Convert % coords to SVG units (700 wide, 540 tall)
        const x1 = taggerPos.left * 7.0
        const y1 = taggerPos.top * 5.4
        // Opponent positions are mirrored (both axes)
        const x2 = (100 - targetPos.left) * 7.0
        const y2 = (100 - targetPos.top) * 5.4
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
// AnimatedRunnerDot — slides off the bottom of the field to show a substitution
// ---------------------------------------------------------------------------

function AnimatedRunnerDot({ top, left, color }: { top: number; left: number; color: string }) {
  const [exited, setExited] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setExited(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div
      style={{
        position: 'absolute',
        top: exited ? '112%' : `${top}%`,
        left: `${left}%`,
        transform: 'translate(-50%, -50%)',
        transition: 'top 0.85s ease-in, opacity 0.85s ease-in',
        opacity: exited ? 0 : 1,
        zIndex: 25,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: color,
          border: '2px solid rgba(255,255,255,0.9)',
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// usePlayerAnimation — RAF spring physics for continuous player movement
// ---------------------------------------------------------------------------

function usePlayerAnimation() {
  const paramsRef = useRef<AnimParams>({
    userSlotLineup: {}, opponentSlotLineup: {}, userGameplan: null,
    activePhase: 'midfield', oppPhase: 'midfield',
    teamAttacksRight: true, ballZone: undefined, ballCarrierPlayerId: undefined,
    paused: false, animateUntil: 0, animTargetOverrides: null,
  })
  const animStatesRef = useRef(new Map<string, PlayerAnimState>())
  const elMapRef = useRef(new Map<string, HTMLElement>())
  const slotPosRef = useRef(new Map<string, PlayerPos>())
  const rafRef = useRef<number>(0)
  const prevTsRef = useRef<number>(0)
  /** Smoothed ball X — lerps toward the discrete zone X to prevent all-player jumps. */
  const smoothBallXRef = useRef<number>(50)
  /** Ball dot element — positioned directly from RAF loop so it tracks carrier every frame. */
  const ballElRef = useRef<HTMLElement | null>(null)

  const registerEl = useCallback((
    slotKey: string,
    el: HTMLElement | null,
    initialLeft: number,
    initialTop: number,
  ) => {
    if (el) {
      elMapRef.current.set(slotKey, el)
      if (!animStatesRef.current.has(slotKey)) {
        animStatesRef.current.set(slotKey, {
          x: initialLeft, y: initialTop, vx: 0, vy: 0,
          phaseX: Math.random() * Math.PI * 2,
          phaseY: Math.random() * Math.PI * 2,
          smoothBaseX: initialLeft, smoothBaseY: initialTop,
        })
      }
      const s = animStatesRef.current.get(slotKey)!
      el.style.left = `${s.x}%`
      el.style.top = `${s.y}%`
    } else {
      elMapRef.current.delete(slotKey)
    }
  }, [])

  useEffect(() => {
    let running = true

    function tick(ts: number) {
      if (!running) return
      rafRef.current = requestAnimationFrame(tick)

      // When the game is paused, freeze magnets in place — unless we're in a
      // post-step animation burst (animateUntil) to settle players into position.
      if (paramsRef.current.paused && ts > paramsRef.current.animateUntil) {
        prevTsRef.current = ts  // keep timestamp fresh so resume doesn't jump
        return
      }

      const rawDt = prevTsRef.current > 0 ? (ts - prevTsRef.current) / 16.67 : 1
      const dt = Math.min(rawDt, 3)
      prevTsRef.current = ts
      const t = ts / 1000

      const {
        userSlotLineup, opponentSlotLineup, userGameplan,
        activePhase, oppPhase, teamAttacksRight, ballZone, ballCarrierPlayerId,
        isCentreBounce: centreBounce, animTargetOverrides,
      } = paramsRef.current

      // Smooth ball X — lerp toward the discrete zone position so all players
      // transition gradually instead of snapping when the zone changes.
      // Moderate rate (0.08) — spreads zone jumps over ~20 frames (~0.33s) for a
      // natural-looking drift; the spring physics add further smoothing on top.
      const targetBallX = ballZoneToX(ballZone, teamAttacksRight)
      smoothBallXRef.current += (targetBallX - smoothBallXRef.current) * Math.min(0.08 * dt, 1)
      const ballX = smoothBallXRef.current
      // Corridor: cluster tactic tucks wings/mids through the center channel
      const useCorridor = userGameplan?.centreTactic === 'cluster'
      // Rush bonus: push-forward stoppages or run midfield line = mids/HBF burst harder
      const rushBonus =
        userGameplan?.midfieldLine === 'run' ||
        userGameplan?.playStyle?.stoppageMovement === 'push-forward'

      // Inner helper — has full closure over tick-local vars and animStatesRef
      function processPlayer(
        slot: string,
        playerId: string,
        slotKey: string,
        isUserPlayer: boolean,
        baseLeft: number,
        baseTop: number,
        roleGroup: RoleGroup,
        attractionBallX: number,
        isBallCarrier: boolean,
        phase: PlayPhase,
      ) {
        const el = elMapRef.current.get(slotKey)
        // +1 = rightward is "forward" for this player, -1 = leftward is "forward"
        const attackDir = isUserPlayer
          ? (teamAttacksRight ? 1 : -1)
          : (teamAttacksRight ? -1 : 1)
        const oppPrefix = isUserPlayer ? 'opp' : 'user'

        // ── Fetch / create animation state FIRST ──────────────────────────────
        // Role-specific targeting below uses state.phaseX for lead patterns, so
        // the state object must exist before we enter the targeting branches.
        let state = animStatesRef.current.get(slotKey)
        if (!state) {
          state = {
            x: baseLeft, y: baseTop, vx: 0, vy: 0,
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
            smoothBaseX: baseLeft, smoothBaseY: baseTop,
          }
          animStatesRef.current.set(slotKey, state)
        }

        // ── Smooth base position ────────────────────────────────────────────
        // Lerp toward the raw drift-adjusted slot position so phase changes and
        // drift transitions are gradual, not instant.  Per-player variation in
        // the lerp rate (seeded from phaseX) prevents robotic lockstep motion.
        // Fast rate (0.12–0.18) — just converts discrete jumps into brief ramps;
        // the spring physics handle the actual smooth animation to the final pos.
        const baseLerpRate = 0.12 + Math.abs(Math.sin(state.phaseX)) * 0.06
        const baseLerp = Math.min(baseLerpRate * dt, 1)
        state.smoothBaseX += (baseLeft - state.smoothBaseX) * baseLerp
        state.smoothBaseY += (baseTop - state.smoothBaseY) * baseLerp
        baseLeft = state.smoothBaseX
        baseTop = state.smoothBaseY

        // ── Pre-game animation override ─────────────────────────────────────
        // When animTargetOverrides is set, magnets spring toward those positions
        // instead of their normal tick-driven/drift targets. Skip all
        // role-specific targeting — the spring physics still apply naturally.
        if (animTargetOverrides) {
          const override = animTargetOverrides.get(slotKey)
          if (override) {
            const overrideTargetX = clamp(override.left, 3, 97)
            const overrideTargetY = clamp(override.top, 3, 97)
            const jX = (Math.sin(t * 0.3 + state.phaseX) * 0.4)
            const jY = (Math.cos(t * 0.25 + state.phaseY) * 0.4)
            const ax = (overrideTargetX + jX - state.x) * SPRING_K
            const ay = (overrideTargetY + jY - state.y) * SPRING_K
            state.vx = (state.vx + ax) * SPRING_DAMP
            state.vy = (state.vy + ay) * SPRING_DAMP
            const spd = Math.sqrt(state.vx * state.vx + state.vy * state.vy)
            if (spd > 2.0) { const sc = 2.0 / spd; state.vx *= sc; state.vy *= sc }
            state.x = clamp(state.x + state.vx * dt, 3, 97)
            state.y = clamp(state.y + state.vy * dt, 3, 97)
            if (el) { el.style.left = `${state.x}%`; el.style.top = `${state.y}%` }
            slotPosRef.current.set(playerId, {
              x: state.x * 7.0, y: state.y * 5.4, top: state.y, left: state.x,
            })
            return
          }
        }

        // ── Proximity factor ──────────────────────────────────────────────────
        // In AFL, only the ~10 players near the ball are actively moving; everyone
        // else is walking or standing still.  Scale all oscillation + jitter by
        // how close this player's slot position is to the ball zone.
        const distFromBall = Math.abs(baseLeft - attractionBallX)
        const proximityFactor = clamp(1 - distFromBall / 55, 0.20, 1)

        let targetX: number
        let targetY: number

        // ── Role-specific targeting ────────────────────────────────────────────

        if (isBallCarrier) {
          // Ball carrier must be AT the ball zone — snap position directly.
          // Spring physics are too slow (next tick fires before they arrive),
          // so bypass the spring and directly lerp position each frame.
          // 0.45/frame ≈ 90% converged in ~4 frames (~67ms at 60fps).
          const carrierTargetX = attractionBallX + (baseLeft - attractionBallX) * 0.15
          state.x += (carrierTargetX - state.x) * Math.min(0.45 * dt, 1)
          state.y += (baseTop - state.y) * Math.min(0.30 * dt, 1)
          state.vx = 0
          state.vy = 0
          // Set targets for spring code below (won't move much since
          // position was already snapped, keeps code path clean).
          targetX = carrierTargetX
          targetY = baseTop

        } else if (roleGroup === 'back') {
          // Deep backs (FB, LBP, RBP): man-mark the paired forward, stay goalside.
          // In attack they push up to compress the ground; in defence they lock on.
          const oppFwdSlot = BACK_TO_OPP_SLOT[slot]
          const oppFwd = oppFwdSlot ? animStatesRef.current.get(`${oppPrefix}-${oppFwdSlot}`) : null

          if (phase === 'attack') {
            // Team has the ball — push up strongly to compress the ground.
            // In real AFL backs push 30-40m past centre when the ball is deep forward.
            const ballForwardness = attackDir > 0
              ? clamp((attractionBallX - 50) / 50, 0, 1)
              : clamp((50 - attractionBallX) / 50, 0, 1)
            const pushUp = ballForwardness * 22          // up to 22 % toward midfield
            targetX = baseLeft + attackDir * pushUp
            // Loose tracking of opponent forward — hold Y zone but shade their way
            if (oppFwd) {
              targetY = baseTop * 0.72 + oppFwd.y * 0.28
            } else {
              targetY = baseTop
            }
          } else {
            // Defending — station goalside between opponent forward and own goal.
            // Anchor more strongly to base Y so backs maintain their spread
            // (LBP/RBP/FB should NOT converge to the same Y).
            if (oppFwd) {
              const clampedX = attackDir > 0
                ? Math.min(oppFwd.x, baseLeft + 15)
                : Math.max(oppFwd.x, baseLeft - 15)
              targetX = baseLeft * 0.60 + clampedX * 0.40
              targetY = baseTop * 0.70 + oppFwd.y * 0.30
            } else {
              targetX = baseLeft
              targetY = baseTop
            }
          }

        } else if (roleGroup === 'halfback') {
          const oppHFSlot = BACK_TO_OPP_SLOT[slot]
          const oppHF = oppHFSlot ? animStatesRef.current.get(`${oppPrefix}-${oppHFSlot}`) : null

          if (phase === 'attack') {
            // Overlap — burst forward to become a handball/kick option near the ball.
            // In real AFL, HBFs overlap through midfield and are prime handball targets.
            const rushPct = rushBonus ? 30 : 24
            const rushTarget = clamp(baseLeft + attackDir * rushPct, 5, 92)
            targetX = rushTarget * 0.35 + attractionBallX * 0.65
            targetY = baseTop
          } else {
            // Defending — mark opponent half-forward; drop deeper when ball is nearby
            const ballProximity = attackDir > 0
              ? clamp((50 - attractionBallX) / 50, 0, 1)   // 0 = ball far, 1 = ball in our back50
              : clamp((attractionBallX - 50) / 50, 0, 1)
            const dropDeeper = ballProximity * 8             // up to 8 % extra drop
            if (oppHF) {
              const clampedX = attackDir > 0
                ? Math.min(oppHF.x, baseLeft + 22)
                : Math.max(oppHF.x, baseLeft - 22)
              targetX = (baseLeft * 0.50 + clampedX * 0.50) - attackDir * dropDeeper
              targetY = baseTop * 0.60 + oppHF.y * 0.40
            } else {
              targetX = baseLeft - attackDir * dropDeeper
              targetY = baseTop
            }
          }

        } else if (roleGroup === 'forward') {
          // AFL forwards: lead toward the ball when it's behind them (present as a
          // target), crumb/work laterally when ball is in their zone.
          // How far the ball is behind the forward (0 = near, 1 = deep behind)
          const ballBehindPct = attackDir > 0
            ? clamp((baseLeft - attractionBallX) / 40, 0, 1)
            : clamp((attractionBallX - baseLeft) / 40, 0, 1)

          if (ballBehindPct > 0.25) {
            // Ball is behind — hard lead toward the ball carrier.
            // In real AFL, forwards lead 30-40m to present as a target.
            const leadStrength = 0.50 + ballBehindPct * 0.25     // 50–75 % pull toward ball
            targetX = baseLeft + (attractionBallX - baseLeft) * leadStrength
            // Spread laterally to avoid crowding other forwards
            const lateralSpread = Math.sin(t * 0.30 + state.phaseX) * 6 * proximityFactor
            targetY = baseTop + lateralSpread
          } else {
            // Ball is near or ahead — hold deep near goal, crumb laterally
            targetX = baseLeft + attackDir * 3
            const crumb = Math.sin(t * 0.35 + state.phaseX) * 7 * proximityFactor
            targetY = baseTop + crumb
          }

        } else if (roleGroup === 'wing') {
          if (useCorridor) {
            // Cluster tactic — tuck into the centre channel
            targetX = baseLeft + (attractionBallX - baseLeft) * 0.50
            targetY = baseTop * 0.35 + 50 * 0.65
          } else {
            // Wings run with the play — strong X tracking, hold the boundary width.
            // Wings in AFL are the link players — always within a kick of the ball.
            targetX = baseLeft + (attractionBallX - baseLeft) * 0.70
            const flankDrift = Math.sin(t * 0.22 + state.phaseX) * 3 * proximityFactor
            targetY = baseTop + flankDrift
          }

        } else {
          // Follower (C, RK, RR, ROV): track the ball closely.
          // Mids and rucks are always in the thick of the contest — they
          // should cluster tightly around the ball zone.
          const ballPull = 0.78
          targetX = baseLeft + (attractionBallX - baseLeft) * ballPull
          // Offset each follower differently around the ball — seeded by phaseX
          const spreadOffset = Math.sin(state.phaseX) * 6  // ±6% spread
          targetY = baseTop + (50 - baseTop) * 0.30 + spreadOffset
          if (phase === 'attack' && rushBonus) {
            targetX = clamp(targetX + attackDir * 5, 5, 95)
          }
        }

        // ── Centre bounce — only 4 per team in the square ────────────────────────
        // After goals and at the start of quarters, only the 4 followers (RK, RR,
        // ROV, C) are allowed inside the centre square.  Wings sit on the boundary.
        // All other players are pushed away from the centre zone.
        if (centreBounce && !isBallCarrier) {
          const centreX = teamAttacksRight ? 50 : 50
          if (roleGroup === 'follower') {
            // RK, RR, ROV, C — pull into centre square with spread
            targetX = targetX + (centreX - targetX) * 0.80
            targetY = targetY + (50 - targetY) * 0.45
          } else if (roleGroup === 'wing') {
            // Wings sit on the centre square boundary (wide of centre)
            targetX = targetX + (centreX - targetX) * 0.25
            // Hold at their natural wing Y (top/bottom edge of square)
          } else {
            // Everyone else: push AWAY from centre if they've drifted in
            // Centre square spans roughly X: 35–65, Y: 30–70 on the field
            const tooCloseX = Math.abs(targetX - centreX) < 18
            const tooCloseY = Math.abs(targetY - 50) < 22
            if (tooCloseX && tooCloseY) {
              // Nudge toward their own half of the field
              const pushDir = targetX < centreX ? -1 : 1
              targetX = targetX + pushDir * 6
            }
          }
        }

        // ── Stoppage convergence (non-centre-bounce) ────────────────────────────
        // At a ball-up/throw-in, players flood the contest.
        if (phase === 'stoppage' && !isBallCarrier && !centreBounce) {
          const xPull = roleGroup === 'back' ? 0.15
            : roleGroup === 'forward' ? 0.40
            : roleGroup === 'halfback' ? 0.55
            : 0.70   // follower / wing — right at the contest
          const yPull = roleGroup === 'back' ? 0.08
            : roleGroup === 'forward' ? 0.18
            : 0.25
          targetX = targetX + (attractionBallX - targetX) * xPull
          targetY = targetY + (50 - targetY) * yPull
        }

        // ── Phase-based field shape ──────────────────────────────────────────────
        // Attack: the whole team fans out wider to create passing options.
        // Defence: slight compression toward centre to cut passing lanes — but
        // light enough that players maintain their structural spread.
        if (!isBallCarrier) {
          if (phase === 'attack') {
            targetY = targetY + (targetY - 50) * 0.18         // push away from centre
          } else if (phase === 'defense') {
            targetY = targetY + (50 - targetY) * 0.08         // gentle pull toward centre
          }
        }

        // Clamp targets to field bounds — unclamped targets cause players to
        // pile up at the edges and drift off-screen.
        targetX = clamp(targetX, 4, 96)
        targetY = clamp(targetY, 4, 96)

        // Jitter scaled by proximity — players far from the ball are nearly still
        const jitterAmp = (isBallCarrier ? 0.10 : JITTER_AMP[roleGroup]) * proximityFactor

        // Multi-frequency noise: slower frequencies so movement looks deliberate
        // Irrational frequency ratios prevent synchronisation across players
        const jitterX = (
          Math.sin(t * 0.41 + state.phaseX) +
          Math.sin(t * 0.97 + state.phaseX * 1.73) * 0.38 +
          Math.sin(t * 1.73 + state.phaseX * 0.91) * 0.14
        ) * jitterAmp
        const jitterY = (
          Math.cos(t * 0.33 + state.phaseY) +
          Math.cos(t * 0.79 + state.phaseY * 1.41) * 0.38 +
          Math.cos(t * 1.51 + state.phaseY * 1.09) * 0.14
        ) * jitterAmp
        const ax = (targetX + jitterX - state.x) * SPRING_K
        const ay = (targetY + jitterY - state.y) * SPRING_K
        state.vx = (state.vx + ax) * SPRING_DAMP
        state.vy = (state.vy + ay) * SPRING_DAMP
        // Hard cap on velocity — prevents players teleporting when targets jump.
        // Ball carrier gets a higher cap (2.5) so they reach the ball zone quickly
        // when they receive a handball/kick; everyone else moves at ≤1.0 %/frame.
        const maxSpeed = isBallCarrier ? 2.5 : 1.0
        const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy)
        if (speed > maxSpeed) {
          const scale = maxSpeed / speed
          state.vx *= scale
          state.vy *= scale
        }
        state.x = clamp(state.x + state.vx * dt, 3, 97)
        state.y = clamp(state.y + state.vy * dt, 3, 97)

        if (el) {
          el.style.left = `${state.x}%`
          el.style.top = `${state.y}%`
        }
        slotPosRef.current.set(playerId, {
          x: state.x * 7.0, y: state.y * 5.4, top: state.y, left: state.x,
        })
      }

      // User players — process in two passes so backs can read opponent forward positions
      // from the previous frame (one frame lag is imperceptible at 60fps)
      for (const slotPos of FIELD_SLOTS_LANDSCAPE) {
        const slot = slotPos.slot
        const playerId = userSlotLineup[slot]
        if (!playerId) continue
        const drift = getDrift(slot, activePhase, userGameplan)
        // Per-player drift variation — same-role players react at different rates
        const ps = animStatesRef.current.get(`user-${slot}`)
        const driftMod = ps ? (0.7 + Math.sin(ps.phaseX) * 0.3) : 1.0
        const baseLeft = teamAttacksRight
          ? clamp(slotPos.left + drift.dx * driftMod, 5, 95)
          : clamp(100 - slotPos.left - drift.dx * driftMod, 5, 95)
        const baseTop = clamp(slotPos.top + drift.dy * driftMod, 3, 97)
        processPlayer(slot, playerId, `user-${slot}`, true, baseLeft, baseTop,
          getRoleGroup(slot), ballX, playerId === ballCarrierPlayerId, activePhase)
      }

      // Opponent players
      for (const slotPos of FIELD_SLOTS_LANDSCAPE) {
        const slot = slotPos.slot
        const playerId = opponentSlotLineup[slot]
        if (!playerId) continue
        const oppDrift = getDrift(slot, oppPhase, null)
        const ops = animStatesRef.current.get(`opp-${slot}`)
        const oppDriftMod = ops ? (0.7 + Math.sin(ops.phaseX) * 0.3) : 1.0
        const baseLeft = teamAttacksRight
          ? clamp(100 - slotPos.left - oppDrift.dx * oppDriftMod, 5, 95)
          : clamp(slotPos.left + oppDrift.dx * oppDriftMod, 5, 95)
        const baseTop = clamp(100 - slotPos.top, 3, 97)
        // attractionBallX = ballX (NOT 100-ballX) because opponent baseLeft is
        // already mirrored into visual coordinates — both teams share the same
        // on-screen space, so both must be attracted to the same physical ball pos.
        processPlayer(slot, playerId, `opp-${slot}`, false, baseLeft, baseTop,
          getRoleGroup(slot), ballX, false, oppPhase)
      }

      // ── Contest snap — pull nearest opponent to the ball on tackles/contests ──
      // When a tackle, contest, or spoil tick fires the opponent magnets may be
      // far from the ball carrier.  Find the 2 nearest opponents and give them
      // a strong instantaneous pull toward the ball so the visual matches the action.
      const contestType = paramsRef.current.currentPossessionType
      if (contestType === 'tackle' || contestType === 'contest' || contestType === 'spoil') {
        const carrierPos = ballCarrierPlayerId
          ? (slotPosRef.current.get(ballCarrierPlayerId) ?? null)
          : null
        const snapX = carrierPos?.left ?? ballX
        const snapY = carrierPos?.top ?? 50

        const oppEntries: { key: string; st: PlayerAnimState; dist: number }[] = []
        for (const slotPos of FIELD_SLOTS_LANDSCAPE) {
          const pid = opponentSlotLineup[slotPos.slot]
          if (!pid) continue
          const st = animStatesRef.current.get(`opp-${slotPos.slot}`)
          if (!st) continue
          const ddx = st.x - snapX
          const ddy = st.y - snapY
          oppEntries.push({ key: `opp-${slotPos.slot}`, st, dist: Math.sqrt(ddx * ddx + ddy * ddy) })
        }
        oppEntries.sort((a, b) => a.dist - b.dist)

        for (let ci = 0; ci < Math.min(2, oppEntries.length); ci++) {
          const opp = oppEntries[ci]
          const pull = ci === 0 ? 0.30 : 0.15
          opp.st.x += (snapX - opp.st.x) * pull * dt
          opp.st.y += (snapY - opp.st.y) * pull * dt
          opp.st.vx *= 0.3
          opp.st.vy *= 0.3
          const el = elMapRef.current.get(opp.key)
          if (el) {
            el.style.left = `${opp.st.x}%`
            el.style.top = `${opp.st.y}%`
          }
          const oppSlot = opp.key.replace('opp-', '')
          const oppPid = opponentSlotLineup[oppSlot]
          if (oppPid) {
            slotPosRef.current.set(oppPid, {
              x: opp.st.x * 7.0, y: opp.st.y * 5.4, top: opp.st.y, left: opp.st.x,
            })
          }
        }
      }

      // ── Same-team repulsion pass ───────────────────────────────────────────
      // Prevents player magnets from stacking on top of each other.  For each
      // pair of same-team players within REPULSION_RADIUS, nudge them apart
      // along the line between them.  O(n²) per team but n=18 so ~153 pairs
      // is negligible at 60fps.
      function applyRepulsion(prefix: string, lineup: Record<string, string>) {
        const keys: string[] = []
        for (const slotPos of FIELD_SLOTS_LANDSCAPE) {
          if (lineup[slotPos.slot]) keys.push(`${prefix}-${slotPos.slot}`)
        }
        for (let i = 0; i < keys.length; i++) {
          const a = animStatesRef.current.get(keys[i])
          if (!a) continue
          for (let j = i + 1; j < keys.length; j++) {
            const b = animStatesRef.current.get(keys[j])
            if (!b) continue
            const dx = a.x - b.x
            const dy = a.y - b.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < REPULSION_RADIUS && dist > 0.1) {
              const overlap = REPULSION_RADIUS - dist
              const force = (overlap / REPULSION_RADIUS) * REPULSION_STRENGTH * dt
              const nx = dx / dist
              const ny = dy / dist
              a.x = clamp(a.x + nx * force, 3, 97)
              a.y = clamp(a.y + ny * force, 3, 97)
              b.x = clamp(b.x - nx * force, 3, 97)
              b.y = clamp(b.y - ny * force, 3, 97)
              // Write updated positions to DOM
              const elA = elMapRef.current.get(keys[i])
              const elB = elMapRef.current.get(keys[j])
              if (elA) { elA.style.left = `${a.x}%`; elA.style.top = `${a.y}%` }
              if (elB) { elB.style.left = `${b.x}%`; elB.style.top = `${b.y}%` }
            }
          }
        }
      }
      applyRepulsion('user', userSlotLineup)
      applyRepulsion('opp', opponentSlotLineup)

      // ── Ball dot positioning ────────────────────────────────────────────
      // Position the ball dot directly from the RAF loop so it tracks the
      // carrier magnet every frame instead of only on React re-renders.
      const ballEl = ballElRef.current
      if (ballEl) {
        const isStop = paramsRef.current.activePhase === 'stoppage'
        if (!isStop && ballCarrierPlayerId) {
          const carrierPos = slotPosRef.current.get(ballCarrierPlayerId)
          if (carrierPos) {
            ballEl.style.left = `${clamp(carrierPos.left, 4, 96)}%`
            ballEl.style.top = `${clamp(carrierPos.top, 5, 95)}%`
          }
        } else if (isStop) {
          // During stoppages, park the ball at the zone centre
          ballEl.style.left = `${clamp(ballX, 4, 96)}%`
          ballEl.style.top = '50%'
        }
      }

    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, []) // intentionally empty — paramsRef.current always has fresh data

  return { registerEl, paramsRef, slotPosRef, ballElRef }
}

// ---------------------------------------------------------------------------
// ChainArrowOverlay — zone-based possession chain arrows on the field
// ---------------------------------------------------------------------------

type PlayerPos = { x: number; y: number; top: number; left: number }

function ChainArrowOverlay({
  chainLinks,
  teamColor,
  teamAttacksRight,
  userClubId,
  playerPosRef,
}: {
  chainLinks: MatchTick[]
  teamColor: string
  teamAttacksRight: boolean
  userClubId: string
  playerPosRef: { current: Map<string, PlayerPos> }
}) {
  // Snapshot map: tickIndex → frozen {x,y} captured the first time that tick is seen.
  // This prevents old nodes jumping around as players continue to drift after the play.
  const posSnapshotRef = useRef(new Map<number, { x: number; y: number }>())
  const lastChainIdRef = useRef<number>(-1)

  // Filter to possession-type links only (exclude score/injury/interchange)
  const possessionLinks = chainLinks.filter(
    (t) =>
      t.possessionType !== 'goal' &&
      t.possessionType !== 'behind' &&
      t.possessionType !== 'injury' &&
      t.possessionType !== 'interchange',
  )

  // Clear snapshots when the possession chain resets (new chainId)
  const currentChainId = chainLinks[0]?.chainId ?? -1
  if (currentChainId !== lastChainIdRef.current) {
    posSnapshotRef.current.clear()
    lastChainIdRef.current = currentChainId
  }

  if (possessionLinks.length === 0) return null

  // Keep last 10 to avoid clutter; oldest are most faded
  const visible = possessionLinks.slice(-10)
  const count = visible.length
  const markerId = `ca-${teamColor.replace(/[^a-z0-9]/gi, '')}`

  // Zone → SVG X mapping (700px wide viewBox).
  // Matches ballZoneToX() percentages × 7.0 so chain arrows align with the ball dot.
  const ZONE_X: Record<string, number> = {
    back50: 84, backHalf: 196, midfield: 350, forwardHalf: 504, forward50: 616,
  }
  const possTeamId = visible[0]?.clubId ?? ''
  const isUserTeam = possTeamId === userClubId
  const effectivelyAttacksRight = isUserTeam ? teamAttacksRight : !teamAttacksRight

  function zoneToSvgX(zone: string): number {
    const baseX = ZONE_X[zone] ?? 350
    return effectivelyAttacksRight ? baseX : 700 - baseX
  }

  // Resolve each link's position:
  // 1. Return frozen snapshot if this tick was already positioned (prevents drift).
  // 2. First time: use the player's actual animated position so chain arrows
  //    match where the ball dot is shown. Fall back to zone-based X + centre Y
  //    when the player isn't on the field (ball-up, sub, etc.).
  function getLinkPos(link: MatchTick, _arrayIdx: number): { x: number; y: number } {
    const existing = posSnapshotRef.current.get(link.tickIndex)
    if (existing) return existing

    let x: number
    let y: number

    if (link.playerId) {
      const animPos = playerPosRef.current.get(link.playerId)
      if (animPos) {
        x = animPos.x
        y = animPos.y
      } else {
        x = zoneToSvgX(link.zone)
        y = 270
      }
    } else {
      x = zoneToSvgX(link.zone)
      y = 270
    }

    const pos = { x, y }
    posSnapshotRef.current.set(link.tickIndex, pos)
    return pos
  }

  // Compute SVG positions for each visible link
  const pts = visible.map((link, idx) => ({
    ...getLinkPos(link, idx),
    link,
    idx,
  }))

  return (
    <g style={{ pointerEvents: 'none' }}>
      <defs>
        <marker
          id={markerId}
          markerWidth="5"
          markerHeight="5"
          refX="4"
          refY="2.5"
          orient="auto"
        >
          <polygon points="0 0, 5 2.5, 0 5" fill={teamColor} />
        </marker>
      </defs>

      {/* Arrows between consecutive nodes */}
      {pts.slice(0, -1).map(({ x, y, link, idx }) => {
        const next = pts[idx + 1]
        const opacity = 0.18 + ((idx + 1) / count) * 0.65
        const isKick = link.possessionType === 'kick'
        return (
          <line
            key={`${link.tickIndex}-arrow`}
            x1={x}
            y1={y}
            x2={next.x}
            y2={next.y}
            stroke={teamColor}
            strokeWidth={isKick ? 2.5 : 1.5}
            strokeDasharray={isKick ? '10 5' : undefined}
            opacity={opacity}
            markerEnd={`url(#${markerId})`}
            style={{ pointerEvents: 'none' }}
          />
        )
      })}

      {/* Dot at each node — skip the latest node because the ball dot already marks it.
          This avoids a visual double-up where the chain dot appears instantly at the new
          carrier while the ball dot is still transitioning there. */}
      {pts.map(({ x, y, link, idx }) => {
        if (idx === count - 1) return null // ball dot handles this
        const opacity = 0.25 + (idx / count) * 0.75
        return (
          <circle
            key={`${link.tickIndex}-node`}
            cx={x}
            cy={y}
            r={3}
            fill={teamColor}
            opacity={opacity}
            style={{ pointerEvents: 'none' }}
          />
        )
      })}
    </g>
  )
}

// ---------------------------------------------------------------------------
// LivePlayerMagnet — small numbered circle
// ---------------------------------------------------------------------------

interface LivePlayerMagnetProps {
  player: Player | undefined
  isUser: boolean
  isSelected: boolean
  isFlashing: boolean
  isSwapTarget: boolean
  hasTag: boolean
  isBallCarrier: boolean
  club: Club | undefined
  onSelect?: () => void
}

function LivePlayerMagnet({
  player,
  isUser,
  isSelected,
  isFlashing,
  isSwapTarget,
  hasTag,
  isBallCarrier,
  club,
  onSelect,
}: LivePlayerMagnetProps) {
  const num = player?.jerseyNumber ?? '?'
  const primary = club?.colors.primary ?? (isUser ? '#2563eb' : '#dc2626')
  const secondary = club?.colors.secondary ?? '#ffffff'
  const textColor = getLuminance(primary) > 0.35 ? '#000000' : '#ffffff'
  const bgColor = isSwapTarget ? '#15803d' : primary

  const SIZE = 22
  const circleStyle: React.CSSProperties = {
    width: SIZE,
    height: SIZE,
    borderRadius: '50%',
    backgroundColor: bgColor,
    borderColor: isSelected ? 'rgba(255,255,255,0.95)' : secondary,
    borderWidth: 2,
    borderStyle: 'solid',
    color: textColor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 8,
    fontWeight: 700,
    lineHeight: 1,
    userSelect: 'none',
    position: 'relative',
  }

  const dot = (
    <div style={{ position: 'relative' }}>
      {isSwapTarget && (
        <span
          className="absolute inset-0 animate-ping rounded-full"
          style={{ border: '2px solid #4ade80' }}
        />
      )}
      {isFlashing && (
        <span
          className="absolute inset-0 animate-ping rounded-full"
          style={{ border: '2px solid #facc15' }}
        />
      )}
      {isBallCarrier && !isSelected && !isFlashing && (
        <span
          className="absolute rounded-full animate-pulse"
          style={{ inset: -4, border: '2px solid rgba(255,255,255,0.8)', boxShadow: '0 0 8px rgba(255,255,255,0.5)' }}
        />
      )}
      {isSelected && (
        <span
          className="absolute rounded-full"
          style={{ inset: -3, border: '2px solid rgba(255,255,255,0.95)' }}
        />
      )}
      <div style={circleStyle}>
        {num}
        {hasTag && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#f97316',
              border: '1px solid rgba(0,0,0,0.3)',
            }}
          />
        )}
      </div>
    </div>
  )

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect() }}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        title={player ? `#${num} ${player.firstName} ${player.lastName}` : undefined}
      >
        {dot}
      </button>
    )
  }

  return (
    <div
      style={{ pointerEvents: 'none' }}
      title={player ? `#${num} ${player.firstName} ${player.lastName}` : undefined}
    >
      {dot}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SpectatorStatPopup — compact sports-card tooltip on magnet click
// ---------------------------------------------------------------------------

function SpectatorStatPopup({
  player,
  stats,
  club,
  onClose,
}: {
  player: Player
  stats: MatchPlayerStats | undefined
  club: Club | undefined
  onClose: () => void
}) {
  const primary = club?.colors.primary ?? '#2563eb'
  const textColor = getLuminance(primary) > 0.35 ? '#000' : '#fff'
  const d = stats?.disposals ?? 0
  const hasStats = stats && d + (stats.marks ?? 0) + (stats.tackles ?? 0) + (stats.goals ?? 0) + (stats.behinds ?? 0) > 0

  return (
    <div
      className="absolute z-50 pointer-events-auto"
      style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="rounded-lg shadow-xl overflow-hidden"
        style={{
          background: 'rgba(10,10,10,0.95)',
          border: `1.5px solid ${primary}`,
          cursor: 'pointer',
          padding: 0,
          minWidth: 140,
        }}
      >
        {/* Name bar */}
        <div
          className="flex items-center gap-1.5 px-2 py-1"
          style={{ backgroundColor: primary }}
        >
          <span className="font-bold tabular-nums" style={{ color: textColor, fontSize: 9 }}>
            {player.jerseyNumber}
          </span>
          <span className="font-semibold truncate" style={{ color: textColor, fontSize: 10 }}>
            {player.firstName.charAt(0)}. {player.lastName}
          </span>
        </div>

        {/* Stat row */}
        {hasStats ? (
          <div className="flex items-center justify-center gap-0 px-1 py-1.5">
            <MiniStat label="K" value={stats.kicks} />
            <MiniStat label="H" value={stats.handballs} />
            <MiniStat label="M" value={stats.marks} />
            <MiniStat label="T" value={stats.tackles} />
            <MiniStat label="G" value={stats.goals} highlight={stats.goals > 0} />
            <MiniStat label="B" value={stats.behinds} dim={stats.behinds === 0} />
          </div>
        ) : (
          <div className="px-2 py-1.5 text-muted-foreground" style={{ fontSize: 9 }}>
            No stats yet
          </div>
        )}
      </button>
    </div>
  )
}

function MiniStat({ label, value, highlight, dim }: { label: string; value: number; highlight?: boolean; dim?: boolean }) {
  return (
    <div className="flex flex-col items-center" style={{ width: 22 }}>
      <span
        className={`tabular-nums font-bold leading-none ${
          highlight ? 'text-orange-400' : dim ? 'text-muted-foreground/50' : 'text-foreground'
        }`}
        style={{ fontSize: 11 }}
      >
        {value}
      </span>
      <span className="text-muted-foreground leading-none" style={{ fontSize: 7 }}>
        {label}
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
  userClubId,
  opponentClub,
  userGameplan,
  userMatchupTactics,
  recentKeyEvents,
  onInstruction,
  onSlotSwap,
  ballCarrierPlayerId,
  possessionChain,
  chainTeamColor,
  livePlayPhase,
  runningOffAnim,
  teamAttacksRight = true,
  ballZone,
  paused = false,
  matchStats,
  currentPossessionType,
  isCentreBounce = false,
  animTargetOverrides,
}: LiveFieldViewProps) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [swapSourceSlot, setSwapSourceSlot] = useState<string | null>(null)
  const [localLineup, setLocalLineup] = useState<Record<string, string>>(userSlotLineup)
  const [localTactics, setLocalTactics] = useState<WeeklyMatchupTactics | null>(
    userMatchupTactics,
  )
  const [flashSlot, setFlashSlot] = useState<string | null>(null)
  const lastFlashKeyRef = useRef<string | null>(null)
  /** Tracks where the ball last was — used to freeze the ball in place during stoppages. */
  const lastBallPosRef = useRef<{ top: number; left: number } | null>(null)
  /** Spectator mode: player ID whose stats popup is shown. */
  const [spectatorPlayerId, setSpectatorPlayerId] = useState<string | null>(null)

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
      onSlotSwap?.(swapSourceSlot, targetSlot)
      setSwapSourceSlot(null)
    },
    [swapSourceSlot, localLineup, players, onInstruction, onSlotSwap],
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

  // Animation hook — runs RAF loop, writes left/top directly to player wrapper DOMs
  const { registerEl, paramsRef: animParamsRef, slotPosRef, ballElRef } = usePlayerAnimation()

  // Active play phase — drives player drift and zone overlays
  const activePhase: PlayPhase = livePlayPhase ?? 'midfield'
  // Opponents play in the inverse phase (if user is attacking, opponents are defending)
  const oppPhase: PlayPhase =
    activePhase === 'attack' ? 'defense' :
    activePhase === 'defense' ? 'attack' :
    activePhase

  // When paused, detect phase/zone/carrier changes (i.e. user stepped forward)
  // and grant a brief animation window so players settle into new positions.
  const prevPhaseRef = useRef(activePhase)
  const prevBallZoneRef = useRef(ballZone)
  const prevCarrierRef = useRef(ballCarrierPlayerId)
  let animateUntil = animParamsRef.current.animateUntil ?? 0
  if (paused && (
    activePhase !== prevPhaseRef.current ||
    ballZone !== prevBallZoneRef.current ||
    ballCarrierPlayerId !== prevCarrierRef.current
  )) {
    // ~400ms is enough for the spring physics to mostly settle
    animateUntil = performance.now() + 400
  }
  prevPhaseRef.current = activePhase
  prevBallZoneRef.current = ballZone
  prevCarrierRef.current = ballCarrierPlayerId

  // Keep animation params ref fresh every render (no re-render triggered — ref only)
  animParamsRef.current = {
    userSlotLineup: localLineup,
    opponentSlotLineup,
    userGameplan,
    activePhase,
    oppPhase,
    teamAttacksRight,
    ballZone,
    ballCarrierPlayerId,
    paused,
    animateUntil,
    currentPossessionType,
    isCentreBounce,
    animTargetOverrides,
  }

  // Build player position map for chain arrows + ball dot.
  // These are slot-based (not animated) positions, updated when phase/tick changes.
  const playerPosMap = new Map<string, PlayerPos>()
  for (const slotPos of FIELD_SLOTS_LANDSCAPE) {
    const playerId = localLineup[slotPos.slot]
    if (!playerId) continue
    const drift = getDrift(slotPos.slot, activePhase, userGameplan)
    const top = clamp(slotPos.top + drift.dy, 3, 97)
    const left = teamAttacksRight
      ? clamp(slotPos.left + drift.dx, 5, 95)
      : clamp(100 - slotPos.left - drift.dx, 5, 95)
    playerPosMap.set(playerId, { x: left * 7.0, y: top * 5.4, top, left })
  }
  for (const slotPos of FIELD_SLOTS_LANDSCAPE) {
    const playerId = opponentSlotLineup[slotPos.slot]
    if (!playerId) continue
    const oppDrift = getDrift(slotPos.slot, oppPhase, null)
    const top = clamp(100 - slotPos.top, 3, 97)
    const left = teamAttacksRight
      ? clamp(100 - slotPos.left - oppDrift.dx, 5, 95)
      : clamp(slotPos.left + oppDrift.dx, 5, 95)
    playerPosMap.set(playerId, { x: left * 7.0, y: top * 5.4, top, left })
  }
  // Ball position tracks the carrier's animated magnet position.
  // The carrier's magnet is pulled toward the ball zone in the RAF loop,
  // so it's always near the correct area of the field.
  const isStoppage = activePhase === 'stoppage'
  const zoneX = ballZoneToX(ballZone, teamAttacksRight)
  const ballCarrierPos = !isStoppage && ballCarrierPlayerId
    ? (slotPosRef.current.get(ballCarrierPlayerId) ?? playerPosMap.get(ballCarrierPlayerId) ?? null)
    : null
  if (ballCarrierPos) {
    lastBallPosRef.current = { top: ballCarrierPos.top, left: ballCarrierPos.left }
  }
  // Fallback: use zone centre if no carrier position is available
  const zoneFallbackPos = { top: 50, left: zoneX }
  const ballStoppagePos = isStoppage
    ? (lastBallPosRef.current ?? zoneFallbackPos)
    : null
  // Ball should always be visible — use carrier pos, stoppage pos, last known pos, or zone centre
  const ballPos = ballCarrierPos ?? ballStoppagePos ?? lastBallPosRef.current ?? zoneFallbackPos

  const hardTags = localTactics?.hardTags ?? []
  const taggedPlayerIds = new Set(hardTags.map((t) => t.taggerPlayerId))
  const selectedPlayer = selectedSlot ? players[localLineup[selectedSlot]] : null
  const selectedSlotData = selectedSlot ? FIELD_SLOT_MAP.get(selectedSlot) : null

  // Labels for the direction arrows
  const leftTeamLabel = teamAttacksRight
    ? (opponentClub?.abbreviation ?? 'OPP')
    : (userClub?.abbreviation ?? 'USR')
  const rightTeamLabel = teamAttacksRight
    ? (userClub?.abbreviation ?? 'USR')
    : (opponentClub?.abbreviation ?? 'OPP')
  const leftTeamColor = teamAttacksRight
    ? opponentClub?.colors.primary
    : userClub?.colors.primary
  const rightTeamColor = teamAttacksRight
    ? userClub?.colors.primary
    : opponentClub?.colors.primary

  return (
    <div className="space-y-2">
      {/* Tags badge row (if any) */}
      {hardTags.length > 0 && (
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-1 rounded border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-400">
            {hardTags.length} tag{hardTags.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

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

      {/* Direction labels — above the field, positioned at left and right */}
      <div className="flex items-center justify-between px-[20%] mx-auto" style={{ maxWidth: 720 }}>
        <div
          className="flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold"
          style={{
            borderColor: `${leftTeamColor}40`,
            backgroundColor: `${leftTeamColor}20`,
            color: leftTeamColor,
          }}
        >
          <span>← {leftTeamLabel}</span>
        </div>
        <div
          className="flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold"
          style={{
            borderColor: `${rightTeamColor}40`,
            backgroundColor: `${rightTeamColor}20`,
            color: rightTeamColor,
          }}
        >
          <span>{rightTeamLabel} →</span>
        </div>
      </div>

      {/* Field container — landscape 35:27 */}
      <div
        className="relative mx-auto overflow-hidden rounded select-none"
        style={{ aspectRatio: '35 / 27', maxWidth: 720 }}
        onClick={() => {
          if (!swapSourceSlot) setSelectedSlot(null)
          setSpectatorPlayerId(null)
        }}
      >
        {/* Ground SVG (landscape) */}
        <FieldSvg idPrefix="live-field" landscape />

        {/* SVG overlay: contested zones + tag lines (700×540 viewBox) */}
        <svg
          viewBox="0 0 700 540"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
          style={{ pointerEvents: 'none' }}
        >
          {/* Zone + tag overlays flip with the field (slot-based coords); chain arrows stay out since
              they use playerPosMap which is already computed with the correct orientation. */}
          <g transform={teamAttacksRight ? undefined : 'scale(-1,1) translate(-700,0)'}>
            <TagLineOverlay
              hardTags={hardTags}
              localLineup={localLineup}
              opponentSlotLineup={opponentSlotLineup}
            />
          </g>
          {possessionChain && possessionChain.length >= 1 && chainTeamColor && (
            <ChainArrowOverlay
              chainLinks={possessionChain}
              teamColor={chainTeamColor}
              teamAttacksRight={teamAttacksRight}
              userClubId={userClubId}
              playerPosRef={slotPosRef}
            />
          )}
        </svg>

        {/* Running-off animation — player sliding off toward bench */}
        {runningOffAnim && (
          <AnimatedRunnerDot
            key={`${runningOffAnim.top}-${runningOffAnim.left}`}
            top={runningOffAnim.top}
            left={runningOffAnim.left}
            color={runningOffAnim.color}
          />
        )}

        {/* Ball dot — positioned by RAF loop (ballElRef) so it tracks the
            carrier magnet every frame, not just on React re-renders. */}
        {ballPos && (
          <div
            ref={(el) => { ballElRef.current = el }}
            style={{
              position: 'absolute',
              top: `${clamp(ballPos.top, 5, 95)}%`,
              left: `${clamp(ballPos.left, 4, 96)}%`,
              // Hover above carrier when someone has it; centred during stoppages.
              transform: isStoppage
                ? 'translate(-50%, -50%)'
                : 'translate(-50%, calc(-100% - 10px))',
              zIndex: 30,
              pointerEvents: 'none',
            }}
          >
            {/* Outer pulse ring — faster pulse during stoppages to show contested ball */}
            <div
              className={isStoppage ? 'animate-pulse' : 'animate-ping'}
              style={{
                position: 'absolute',
                inset: isStoppage ? -8 : -4,
                borderRadius: '50%',
                backgroundColor: isStoppage ? '#f97316' : '#facc15',
                opacity: isStoppage ? 0.3 : 0.4,
              }}
            />
            {/* Ball */}
            <div
              style={{
                position: 'relative',
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: isStoppage ? '#f97316' : '#facc15',
                border: `2px solid ${isStoppage ? '#fbbf24' : '#ffffff'}`,
                boxShadow: isStoppage
                  ? '0 0 10px #f97316, 0 0 20px rgba(249,115,22,0.5)'
                  : '0 0 10px #facc15, 0 0 20px rgba(250,204,21,0.5)',
              }}
            />
          </div>
        )}

        {/* Opponent magnets — wrapper divs owned by RAF animation; initial pos from playerPosMap */}
        {FIELD_SLOTS_LANDSCAPE.map((slotPos) => {
          const slot = slotPos.slot
          const playerId = opponentSlotLineup[slot]
          if (!playerId) return null
          const pos = playerPosMap.get(playerId)
          const initLeft = pos?.left ?? (100 - slotPos.left)
          const initTop = pos?.top ?? (100 - slotPos.top)
          const hasStats = !!matchStats
          return (
            <div
              key={`opp-${slot}`}
              ref={(el) => registerEl(`opp-${slot}`, el as HTMLElement | null, initLeft, initTop)}
              style={{
                position: 'absolute',
                transform: 'translate(-50%, -50%)',
                zIndex: spectatorPlayerId === playerId ? 20 : 5,
                willChange: 'top, left',
                pointerEvents: hasStats ? 'auto' : 'none',
              }}
            >
              <LivePlayerMagnet
                player={players[playerId]}
                isUser={false}
                isSelected={spectatorPlayerId === playerId}
                isFlashing={false}
                isSwapTarget={false}
                hasTag={false}
                isBallCarrier={ballCarrierPlayerId === playerId}
                club={opponentClub}
                onSelect={hasStats ? () => setSpectatorPlayerId(
                  spectatorPlayerId === playerId ? null : playerId,
                ) : undefined}
              />
            </div>
          )
        })}

        {/* User magnets — wrapper divs owned by RAF animation; initial pos from playerPosMap */}
        {FIELD_SLOTS_LANDSCAPE.map((slotPos) => {
          const slot = slotPos.slot
          const playerId = localLineup[slot]
          if (!playerId) return null

          const pos = playerPosMap.get(playerId)
          const initLeft = pos?.left ?? slotPos.left
          const initTop = pos?.top ?? slotPos.top
          const isSelected = selectedSlot === slot
          const isSwapSrc = swapSourceSlot === slot
          const isSwapTarget = Boolean(swapSourceSlot) && !isSwapSrc
          return (
            <div
              key={slot}
              ref={(el) => registerEl(`user-${slot}`, el as HTMLElement | null, initLeft, initTop)}
              style={{
                position: 'absolute',
                transform: 'translate(-50%, -50%)',
                zIndex: (isSelected || spectatorPlayerId === playerId) ? 20 : 10,
                willChange: 'top, left',
              }}
            >
              <LivePlayerMagnet
                player={players[playerId]}
                isUser
                isSelected={isSelected || spectatorPlayerId === playerId}
                isFlashing={flashSlot === slot}
                isSwapTarget={isSwapTarget}
                hasTag={taggedPlayerIds.has(playerId)}
                isBallCarrier={ballCarrierPlayerId === playerId}
                club={userClub}
                onSelect={() => {
                  if (localTactics) {
                    if (swapSourceSlot && !isSwapSrc) {
                      handlePositionSwap(slot)
                      return
                    } else if (!isSwapSrc) {
                      setSelectedSlot(isSelected ? null : slot)
                    }
                  }
                  // Always toggle stat popup when matchStats available
                  if (matchStats) {
                    setSpectatorPlayerId(spectatorPlayerId === playerId ? null : playerId)
                  }
                }}
              />
            </div>
          )
        })}

        {/* Instruction panel (shown when a player is selected) */}
        {selectedSlot && selectedPlayer && selectedSlotData && localTactics && (
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

        {/* Spectator stat popup — shown when clicking any magnet in spectator mode */}
        {spectatorPlayerId && matchStats && players[spectatorPlayerId] && (
          <SpectatorStatPopup
            player={players[spectatorPlayerId]}
            stats={matchStats[spectatorPlayerId]}
            club={
              Object.values(opponentSlotLineup).includes(spectatorPlayerId)
                ? opponentClub
                : userClub
            }
            onClose={() => setSpectatorPlayerId(null)}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center rounded-full text-[7px] font-bold"
            style={{
              width: 16, height: 16,
              backgroundColor: userClub?.colors.primary ?? '#2563eb',
              borderWidth: 1.5,
              borderStyle: 'solid',
              borderColor: userClub?.colors.secondary ?? '#ffffff',
              color: getLuminance(userClub?.colors.primary ?? '#2563eb') > 0.35 ? '#000' : '#fff',
            }}
          >
            7
          </span>
          {userClub?.abbreviation ?? 'Your team'}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center rounded-full text-[7px] font-bold"
            style={{
              width: 16, height: 16,
              backgroundColor: opponentClub?.colors.primary ?? '#dc2626',
              borderWidth: 1.5,
              borderStyle: 'solid',
              borderColor: opponentClub?.colors.secondary ?? '#ffffff',
              color: getLuminance(opponentClub?.colors.primary ?? '#dc2626') > 0.35 ? '#000' : '#fff',
            }}
          >
            7
          </span>
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