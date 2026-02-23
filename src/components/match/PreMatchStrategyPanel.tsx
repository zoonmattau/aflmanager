/**
 * PreMatchStrategyPanel — 3-tab strategy editor.
 *
 *  Game Plan  — gameplan tactics in clearly organised sections
 *  Rotations  — per-bench-player dropdown; queued for the Q1 break
 *  Matchups   — hard tags + physical pressure instructions
 */

import { useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X, Plus, Target, Zap, ArrowRight } from 'lucide-react'
import type { Player } from '@/types/player'
import type { ClubGameplan, RuckNomination, PlayStyleRules } from '@/types/club'
import type {
  WeeklyMatchupTactics,
  HardTagInstruction,
  PhysicalAttentionInstruction,
  MatchupInstructionIntensity,
} from '@/types/game'
import type { QueuedRotation } from '@/components/match/BenchTacticsPanel'
import { getOverallRating } from '@/engine/player/playerRating'
import { getPositionBadgeClass } from '@/lib/positionColor'

// ---------------------------------------------------------------------------
// Default gameplan
// ---------------------------------------------------------------------------

export const DEFAULT_GAMEPLAN: ClubGameplan = {
  offensiveStyle: 'balanced',
  tempo: 'medium',
  aggression: 'medium',
  kickInTactic: 'set-up-short',
  centreTactic: 'balanced',
  stoppageTactic: 'balanced',
  defensiveLine: 'zone',
  midfieldLine: 'run',
  forwardLine: 'run',
  ruckNomination: { primaryRuckId: null, backupRuckId: null, aroundTheGround: false },
  rotations: 'medium',
  playStyle: {
    forwardLeading: 'diagonal',
    tapDirection: 'read-and-react',
    stoppageMovement: 'balanced',
    switchFrequency: 'normal',
    noUTurns: false,
    handbballToRunner: false,
    noKickBackAcrossGoal: false,
  },
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BENCH_SLOTS = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8']

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PreMatchStrategyPanelProps {
  userLineupPlayers: Player[]
  oppositionPlayers: Player[]
  matchupTactics: WeeklyMatchupTactics
  onTacticsChange: (tactics: WeeklyMatchupTactics) => void
  gameplan: ClubGameplan
  onGameplanChange: (gp: ClubGameplan) => void
  userSlotLineup?: Record<string, string>
  interchangeCount?: number
  plannedRotations?: QueuedRotation[]
  onPlannedRotationsChange?: (rotations: QueuedRotation[]) => void
}

// ---------------------------------------------------------------------------
// Reusable building blocks
// ---------------------------------------------------------------------------

function SectionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {children}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>}
    </div>
  )
}

/** Stacked: label above, pill options below. Works well at any column width. */
function TacticField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string; hint?: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={`rounded border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              value === opt.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/70 text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function BoolToggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center gap-2 rounded border px-2.5 py-1.5 text-xs transition-colors ${
        value
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border/70 text-muted-foreground hover:text-foreground'
      }`}
    >
      <div
        className={`h-3.5 w-3.5 shrink-0 rounded-sm border flex items-center justify-center ${
          value ? 'border-primary bg-primary' : 'border-muted-foreground'
        }`}
      >
        {value && <span className="text-[8px] text-primary-foreground font-bold leading-none">✓</span>}
      </div>
      <span className="font-medium">{label}</span>
      {hint && <span className="text-[10px] text-muted-foreground/70">— {hint}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Matchup sub-components
// ---------------------------------------------------------------------------

const INTENSITY_OPTIONS: { value: MatchupInstructionIntensity; label: string; color: string }[] = [
  { value: 'light',    label: 'Light',    color: 'text-sky-500'   },
  { value: 'standard', label: 'Standard', color: 'text-amber-500' },
  { value: 'hard',     label: 'Hard',     color: 'text-red-500'   },
]

function IntensityToggle({
  value,
  onChange,
}: {
  value: MatchupInstructionIntensity
  onChange: (v: MatchupInstructionIntensity) => void
}) {
  return (
    <div className="inline-flex rounded border border-border overflow-hidden text-[10px] font-medium shrink-0">
      {INTENSITY_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-1.5 py-0.5 transition-colors ${
            value === opt.value
              ? 'bg-muted text-foreground'
              : 'bg-transparent text-muted-foreground hover:bg-muted/50'
          } ${opt.color}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function playerLabel(p: Player) {
  return `#${p.jerseyNumber} ${p.firstName.charAt(0)}. ${p.lastName} (${p.position.primary})`
}

function AddAssignmentRow({
  myPlayers,
  oppPlayers,
  onAdd,
}: {
  myPlayers: Player[]
  oppPlayers: Player[]
  onAdd: (myId: string, oppId: string, intensity: MatchupInstructionIntensity) => void
}) {
  const [myId, setMyId]     = useState('')
  const [oppId, setOppId]   = useState('')
  const [intensity, setIntensity] = useState<MatchupInstructionIntensity>('standard')
  const canAdd = myId && oppId
  return (
    <div className="flex items-center gap-1.5 rounded border border-dashed border-border/70 p-1.5">
      <Select value={myId} onValueChange={setMyId}>
        <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
          <SelectValue placeholder="My player…" />
        </SelectTrigger>
        <SelectContent>
          {myPlayers.map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-xs">{playerLabel(p)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[10px] text-muted-foreground shrink-0">→</span>
      <Select value={oppId} onValueChange={setOppId}>
        <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
          <SelectValue placeholder="Their player…" />
        </SelectTrigger>
        <SelectContent>
          {oppPlayers.map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-xs">{playerLabel(p)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <IntensityToggle value={intensity} onChange={setIntensity} />
      <Button
        size="sm"
        className="h-7 px-2 shrink-0"
        disabled={!canAdd}
        onClick={() => {
          if (canAdd) {
            onAdd(myId, oppId, intensity)
            setMyId('')
            setOppId('')
            setIntensity('standard')
          }
        }}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function AssignmentRow({
  myPlayer,
  theirPlayer,
  intensity,
  onRemove,
  onIntensityChange,
  icon,
}: {
  myPlayer:  Player | undefined
  theirPlayer: Player | undefined
  intensity: MatchupInstructionIntensity
  onRemove: () => void
  onIntensityChange: (v: MatchupInstructionIntensity) => void
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 rounded border border-border/60 px-2 py-1.5 text-xs">
      {icon}
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1">
        <span className="font-medium truncate">
          {myPlayer ? `${myPlayer.firstName.charAt(0)}. ${myPlayer.lastName}` : '(unknown)'}
        </span>
        <span className="text-muted-foreground shrink-0">→</span>
        <span className="font-medium truncate text-destructive/80">
          {theirPlayer ? `${theirPlayer.firstName.charAt(0)}. ${theirPlayer.lastName}` : '(unknown)'}
        </span>
        {theirPlayer && (
          <Badge
            variant="outline"
            className={`text-[9px] shrink-0 ${getPositionBadgeClass(theirPlayer.position.primary)}`}
          >
            {theirPlayer.position.primary} {getOverallRating(theirPlayer)}
          </Badge>
        )}
      </div>
      <IntensityToggle value={intensity} onChange={onIntensityChange} />
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type PanelTab = 'gameplan' | 'rotations' | 'matchups'

export function PreMatchStrategyPanel({
  userLineupPlayers,
  oppositionPlayers,
  matchupTactics,
  onTacticsChange,
  gameplan: gameplanProp,
  onGameplanChange,
  userSlotLineup = {},
  interchangeCount = 5,
  plannedRotations = [],
  onPlannedRotationsChange,
}: PreMatchStrategyPanelProps) {

  const [tab, setTab] = useState<PanelTab>('gameplan')

  // Gameplan helpers
  const gp: ClubGameplan  = { ...DEFAULT_GAMEPLAN, ...gameplanProp }
  const ps: PlayStyleRules = { ...DEFAULT_GAMEPLAN.playStyle!, ...(gp.playStyle ?? {}) }
  const rn: RuckNomination = gp.ruckNomination ?? { primaryRuckId: null, backupRuckId: null, aroundTheGround: false }

  function setGP(updates: Partial<ClubGameplan>) {
    onGameplanChange({ ...gp, ...updates })
  }
  function setPS(updates: Partial<PlayStyleRules>) {
    onGameplanChange({ ...gp, playStyle: { ...ps, ...updates } })
  }
  function setRN(updates: Partial<RuckNomination>) {
    setGP({ ruckNomination: { ...rn, ...updates } })
  }

  // Ruck candidates
  const ruckCandidates = userLineupPlayers.filter(
    (p) => p.position.primary === 'RK' || p.position.secondary?.includes('RK'),
  )
  const allRuckCandidates = ruckCandidates.length > 0 ? ruckCandidates : userLineupPlayers

  // Matchup state
  const [addingTag,      setAddingTag]      = useState(false)
  const [addingPhysical, setAddingPhysical] = useState(false)

  const playerById = useCallback(
    (id: string) => [...userLineupPlayers, ...oppositionPlayers].find((p) => p.id === id),
    [userLineupPlayers, oppositionPlayers],
  )

  const addHardTag = useCallback(
    (taggerId: string, targetId: string, intensity: MatchupInstructionIntensity) => {
      const next: HardTagInstruction = {
        id: crypto.randomUUID(),
        taggerPlayerId: taggerId,
        targetPlayerId: targetId,
        intensity,
      }
      onTacticsChange({ ...matchupTactics, hardTags: [...matchupTactics.hardTags, next] })
      setAddingTag(false)
    },
    [matchupTactics, onTacticsChange],
  )

  const removeHardTag = useCallback(
    (id: string) => onTacticsChange({
      ...matchupTactics,
      hardTags: matchupTactics.hardTags.filter((t) => t.id !== id),
    }),
    [matchupTactics, onTacticsChange],
  )

  const addPhysical = useCallback(
    (enforcerId: string, targetId: string, intensity: MatchupInstructionIntensity) => {
      const next: PhysicalAttentionInstruction = {
        id: crypto.randomUUID(),
        enforcerPlayerId: enforcerId,
        targetPlayerId:   targetId,
        intensity,
      }
      onTacticsChange({ ...matchupTactics, physicalAttention: [...matchupTactics.physicalAttention, next] })
      setAddingPhysical(false)
    },
    [matchupTactics, onTacticsChange],
  )

  const removePhysical = useCallback(
    (id: string) => onTacticsChange({
      ...matchupTactics,
      physicalAttention: matchupTactics.physicalAttention.filter((t) => t.id !== id),
    }),
    [matchupTactics, onTacticsChange],
  )

  // Rotation tab derived data
  const benchPlayers = BENCH_SLOTS
    .slice(0, interchangeCount)
    .map((slot) => userSlotLineup[slot])
    .filter((id): id is string => !!id)
    .map((id) => userLineupPlayers.find((p) => p.id === id))
    .filter((p): p is Player => !!p)

  const onFieldPlayers = Object.entries(userSlotLineup)
    .filter(([slot, id]) => !!id && !BENCH_SLOTS.includes(slot))
    .map(([, id]) => userLineupPlayers.find((p) => p.id === id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.position.primary.localeCompare(b.position.primary))

  const usedOnFieldIds = new Set(plannedRotations.map((r) => r.offId))

  function getRotationFor(benchId: string) {
    return plannedRotations.find((r) => r.onId === benchId)?.offId ?? '__none__'
  }

  function handleRotationChange(benchId: string, onFieldId: string) {
    // Remove any existing entry for this bench player OR the same on-field target
    const next = plannedRotations.filter(
      (r) => r.onId !== benchId && r.offId !== onFieldId,
    )
    if (onFieldId !== '__none__') next.push({ onId: benchId, offId: onFieldId })
    onPlannedRotationsChange?.(next)
  }

  // Tab badges
  const rotationCount = plannedRotations.length
  const matchupCount  = matchupTactics.hardTags.length + matchupTactics.physicalAttention.length

  const TABS: { k: PanelTab; label: string; badge?: number }[] = [
    { k: 'gameplan',   label: 'Game Plan' },
    { k: 'rotations',  label: 'Rotations',  badge: rotationCount  || undefined },
    { k: 'matchups',   label: 'Matchups',   badge: matchupCount   || undefined },
  ]

  return (
    <div className="space-y-3">

      {/* ── Tab bar ── */}
      <div className="flex overflow-hidden rounded-md border border-border text-xs font-medium">
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 py-2 transition-colors ${
              tab === t.k
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {t.label}
            {t.badge != null && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${
                tab === t.k ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted-foreground/20'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── GAME PLAN ── */}
      {tab === 'gameplan' && (
        <div className="space-y-4 px-0.5">

          {/* Two-column grid: left = Game Intent + Set Pieces, right = Lines + Ruck */}
          <div className="grid grid-cols-2 gap-x-5 gap-y-0">

            {/* ── LEFT COLUMN ── */}
            <div className="space-y-4">

              {/* Game Intent */}
              <div className="space-y-2.5">
                <SectionLabel>Game Intent</SectionLabel>
                <TacticField
                  label="Style"
                  value={gp.offensiveStyle}
                  onChange={(v) => setGP({ offensiveStyle: v })}
                  options={[
                    { value: 'defensive', label: 'Defensive', hint: 'Fewer I50s, less rebound risk' },
                    { value: 'balanced',  label: 'Balanced'                                         },
                    { value: 'attacking', label: 'Attacking',  hint: 'More I50s, higher risk'       },
                  ]}
                />
                <TacticField
                  label="Tempo"
                  value={gp.tempo}
                  onChange={(v) => setGP({ tempo: v })}
                  options={[
                    { value: 'slow',   label: 'Slow',   hint: 'Fewer possessions, better accuracy' },
                    { value: 'medium', label: 'Medium'                                              },
                    { value: 'fast',   label: 'Fast',   hint: 'More possessions, lower accuracy'   },
                  ]}
                />
                <TacticField
                  label="Aggression"
                  value={gp.aggression}
                  onChange={(v) => setGP({ aggression: v })}
                  options={[
                    { value: 'low',    label: 'Low',    hint: 'Fewer frees, less injury risk' },
                    { value: 'medium', label: 'Medium'                                        },
                    { value: 'high',   label: 'High',   hint: 'More contested, higher risk'   },
                  ]}
                />
                <TacticField
                  label="Rotations"
                  value={gp.rotations}
                  onChange={(v) => setGP({ rotations: v })}
                  options={[
                    { value: 'low',    label: 'Low',    hint: '+2% contested, less fresh legs'      },
                    { value: 'medium', label: 'Medium'                                              },
                    { value: 'high',   label: 'High',   hint: '+5 possession bonus, fresh legs'     },
                  ]}
                />
              </div>

              <div className="border-t border-border/30" />

              {/* Set Pieces */}
              <div className="space-y-2.5">
                <SectionLabel>Set Pieces</SectionLabel>
                <TacticField
                  label="Centre Bounce"
                  value={gp.centreTactic}
                  onChange={(v) => setGP({ centreTactic: v })}
                  options={[
                    { value: 'spread',   label: 'Spread',   hint: '+6% uncontested, –5% contested' },
                    { value: 'balanced', label: 'Balanced'                                          },
                    { value: 'cluster',  label: 'Cluster',  hint: '+6% contested, –5% uncontested' },
                  ]}
                />
                <TacticField
                  label="Stoppages"
                  value={gp.stoppageTactic}
                  onChange={(v) => setGP({ stoppageTactic: v })}
                  options={[
                    { value: 'spread',   label: 'Spread',   hint: '+6% uncontested, –5% contested' },
                    { value: 'balanced', label: 'Balanced'                                          },
                    { value: 'cluster',  label: 'Cluster',  hint: '+6% contested, –5% uncontested' },
                  ]}
                />
                <TacticField
                  label="Ruck Tap"
                  value={ps.tapDirection}
                  onChange={(v) => setPS({ tapDirection: v })}
                  options={[
                    { value: 'forward',        label: 'Tap Fwd',     hint: '+4% I50, –3% contested'   },
                    { value: 'backward',       label: 'Tap Back',    hint: '+5% uncontested, –3% I50' },
                    { value: 'read-and-react', label: 'Read & React',hint: '+4% hitout quality'       },
                  ]}
                />
                <TacticField
                  label="Kick-In"
                  value={gp.kickInTactic}
                  onChange={(v) => setGP({ kickInTactic: v })}
                  options={[
                    { value: 'play-on-short', label: 'Play Short', hint: 'Quick, +3% I50' },
                    { value: 'play-on-long',  label: 'Play Long',  hint: '+5% I50, –3% acc' },
                    { value: 'set-up-short',  label: 'Set Short',  hint: 'Safe, +3% uncontested' },
                    { value: 'set-up-long',   label: 'Set Long',   hint: '+2% accuracy' },
                  ]}
                />
              </div>

            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-4">

              {/* Line Structures */}
              <div className="space-y-2.5">
                <SectionLabel>Line Structures</SectionLabel>
                <TacticField
                  label="Defensive"
                  value={gp.defensiveLine}
                  onChange={(v) => setGP({ defensiveLine: v })}
                  options={[
                    { value: 'zone',  label: 'Zone',  hint: 'Neutral baseline'             },
                    { value: 'hold',  label: 'Hold',  hint: '+3% marking'                  },
                    { value: 'run',   label: 'Run',   hint: '+3% uncontested, –3% rebound' },
                    { value: 'press', label: 'Press', hint: '+6% tackles, +4% opp rebound' },
                  ]}
                />
                <TacticField
                  label="Midfield"
                  value={gp.midfieldLine}
                  onChange={(v) => setGP({ midfieldLine: v })}
                  options={[
                    { value: 'zone',  label: 'Zone',  hint: '+2% uncontested'            },
                    { value: 'hold',  label: 'Hold',  hint: '+2% marking'                },
                    { value: 'run',   label: 'Run',   hint: 'Default'                    },
                    { value: 'press', label: 'Press', hint: '+4% tackles, +3% contested' },
                  ]}
                />
                <TacticField
                  label="Forward"
                  value={gp.forwardLine}
                  onChange={(v) => setGP({ forwardLine: v })}
                  options={[
                    { value: 'zone',  label: 'Zone',  hint: '+2% marking'          },
                    { value: 'hold',  label: 'Hold',  hint: '+3% accuracy'         },
                    { value: 'run',   label: 'Run',   hint: '+3% uncontested'      },
                    { value: 'press', label: 'Press', hint: '+5% marks, +3% I50'  },
                  ]}
                />
              </div>

              <div className="border-t border-border/30" />

              {/* Ruck */}
              <div className="space-y-2.5">
                <SectionLabel>Ruck</SectionLabel>
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Primary</div>
                  <Select
                    value={rn.primaryRuckId ?? '__none__'}
                    onValueChange={(v) => setRN({ primaryRuckId: v === '__none__' ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-xs w-full">
                      <SelectValue placeholder="Auto-select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs">Auto-select</SelectItem>
                      {allRuckCandidates.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">{playerLabel(p)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Backup</div>
                  <Select
                    value={rn.backupRuckId ?? '__none__'}
                    onValueChange={(v) => setRN({ backupRuckId: v === '__none__' ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-xs w-full">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs">None</SelectItem>
                      {allRuckCandidates
                        .filter((p) => p.id !== rn.primaryRuckId)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">{playerLabel(p)}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <BoolToggle
                  label="Around the Ground"
                  hint="–10% hitouts, +2% contested"
                  value={rn.aroundTheGround}
                  onChange={(v) => setRN({ aroundTheGround: v })}
                />
              </div>

            </div>
          </div>

          {/* ── Ball Movement — full width ── */}
          <div className="border-t border-border/30" />
          <div className="space-y-2.5">
            <SectionLabel>Ball Movement</SectionLabel>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
              <TacticField
                label="Fwd Leading"
                value={ps.forwardLeading}
                onChange={(v) => setPS({ forwardLeading: v })}
                options={[
                  { value: 'straight',    label: 'Straight',    hint: '+4% I50, –4% marks'      },
                  { value: 'diagonal',    label: 'Diagonal',    hint: '+5% marks'                },
                  { value: 'hold-spread', label: 'Hold/Spread', hint: '+3% accuracy, +2% marks'  },
                  { value: 'rotate',      label: 'Rotate',      hint: '+4% uncontested, +2% I50' },
                ]}
              />
              <TacticField
                label="Switch Play"
                value={ps.switchFrequency}
                onChange={(v) => setPS({ switchFrequency: v })}
                options={[
                  { value: 'often',  label: 'Often',  hint: '+5% uncontested, –4% I50' },
                  { value: 'normal', label: 'Normal'                                    },
                  { value: 'rarely', label: 'Rarely', hint: '+4% I50, –4% uncontested' },
                ]}
              />
              <TacticField
                label="After Stoppage"
                value={ps.stoppageMovement}
                onChange={(v) => setPS({ stoppageMovement: v })}
                options={[
                  { value: 'flood-back',   label: 'Flood Back',  hint: '–8% opp rebound, +3% uncontested' },
                  { value: 'balanced',     label: 'Balanced'                                               },
                  { value: 'push-forward', label: 'Push Fwd',    hint: '+6% I50, +7% opp rebound'         },
                  { value: 'numbers',      label: 'Numbers Up',  hint: '+4% contested, +2% tackles'       },
                ]}
              />
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Discipline</div>
                <div className="flex flex-col gap-1.5">
                  <BoolToggle label="No U-Turns"   hint="forward momentum only"     value={ps.noUTurns}             onChange={(v) => setPS({ noUTurns: v })}             />
                  <BoolToggle label="HB to Runner"  hint="handball to moving player" value={ps.handbballToRunner}    onChange={(v) => setPS({ handbballToRunner: v })}    />
                  <BoolToggle label="No Kick Back"  hint="reduce F50 turnovers"      value={ps.noKickBackAcrossGoal} onChange={(v) => setPS({ noKickBackAcrossGoal: v })} />
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── ROTATIONS ── */}
      {tab === 'rotations' && (
        <div className="space-y-3 px-0.5">
          <p className="text-[11px] text-muted-foreground">
            Assign each bench player a field player to replace at the first quarter break.
            Leave as <span className="font-medium">Not planned</span> to decide during the game.
          </p>

          {benchPlayers.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 py-8 text-center text-xs text-muted-foreground">
              Set your lineup in the <span className="font-medium text-foreground">Lineup</span> tab first.
            </div>
          ) : (
            <div className="space-y-2">
              {benchPlayers.map((p) => {
                const rotationTargetId = getRotationFor(p.id)
                // On-field players available for this bench player:
                // exclude those already assigned to other bench players (except the current target)
                const availableOnField = onFieldPlayers.filter(
                  (op) => !usedOnFieldIds.has(op.id) || rotationTargetId === op.id,
                )
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 rounded-md border p-2.5 transition-colors ${
                      rotationTargetId !== '__none__'
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border'
                    }`}
                  >
                    {/* Bench player info */}
                    <div className="flex flex-1 min-w-0 items-center gap-2">
                      <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{p.firstName[0]}. {p.lastName}</div>
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1">{p.position.primary}</Badge>
                      </div>
                    </div>

                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                    {/* Replacement selector */}
                    <Select
                      value={rotationTargetId}
                      onValueChange={(v) => handleRotationChange(p.id, v)}
                    >
                      <SelectTrigger className="h-8 text-xs w-[170px] shrink-0">
                        <SelectValue placeholder="Not planned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-xs text-muted-foreground">
                          — Not planned —
                        </SelectItem>
                        {availableOnField.map((op) => (
                          <SelectItem key={op.id} value={op.id} className="text-xs">
                            {op.firstName[0]}. {op.lastName}
                            <span className="ml-1 text-muted-foreground">({op.position.primary})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              })}
            </div>
          )}

          {rotationCount > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {rotationCount} rotation{rotationCount > 1 ? 's' : ''} queued — will apply at the Q1 break.
            </p>
          )}
        </div>
      )}

      {/* ── MATCHUPS ── */}
      {tab === 'matchups' && (
        <div className="space-y-4 px-0.5">

          {/* Hard Tags */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              <span className="text-xs font-semibold">Hard Tags</span>
              <span className="text-[10px] text-muted-foreground">— one-on-one marking</span>
            </div>
            {matchupTactics.hardTags.length === 0 && !addingTag && (
              <p className="text-xs text-muted-foreground pl-1 italic">No tagging assignments set.</p>
            )}
            {matchupTactics.hardTags.map((tag) => (
              <AssignmentRow
                key={tag.id}
                myPlayer={playerById(tag.taggerPlayerId)}
                theirPlayer={playerById(tag.targetPlayerId)}
                intensity={tag.intensity}
                onRemove={() => removeHardTag(tag.id)}
                onIntensityChange={(v) =>
                  onTacticsChange({
                    ...matchupTactics,
                    hardTags: matchupTactics.hardTags.map((t) =>
                      t.id === tag.id ? { ...t, intensity: v } : t,
                    ),
                  })
                }
                icon={<Target className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
              />
            ))}
            {addingTag ? (
              <AddAssignmentRow
                myPlayers={userLineupPlayers}
                oppPlayers={oppositionPlayers}
                onAdd={addHardTag}
              />
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddingTag(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />Add Tag
              </Button>
            )}
          </div>

          {/* Physical Attention */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-xs font-semibold">Physical Pressure</span>
              <span className="text-[10px] text-muted-foreground">— rough up key opponents</span>
            </div>
            {matchupTactics.physicalAttention.length === 0 && !addingPhysical && (
              <p className="text-xs text-muted-foreground pl-1 italic">No pressure assignments set.</p>
            )}
            {matchupTactics.physicalAttention.map((pa) => (
              <AssignmentRow
                key={pa.id}
                myPlayer={playerById(pa.enforcerPlayerId)}
                theirPlayer={playerById(pa.targetPlayerId)}
                intensity={pa.intensity}
                onRemove={() => removePhysical(pa.id)}
                onIntensityChange={(v) =>
                  onTacticsChange({
                    ...matchupTactics,
                    physicalAttention: matchupTactics.physicalAttention.map((t) =>
                      t.id === pa.id ? { ...t, intensity: v } : t,
                    ),
                  })
                }
                icon={<Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
              />
            ))}
            {addingPhysical ? (
              <AddAssignmentRow
                myPlayers={userLineupPlayers}
                oppPlayers={oppositionPlayers}
                onAdd={addPhysical}
              />
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddingPhysical(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />Add Pressure
              </Button>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-2">
            Tagging reduces an opponent's effectiveness. Physical pressure increases fatigue and error rate.
            High intensity raises your player's injury and free-kick risk.
          </p>
        </div>
      )}

    </div>
  )
}
