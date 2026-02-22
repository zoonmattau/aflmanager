import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNavigationGuard } from '@/hooks/useNavigationGuard'
import { NavigationGuardDialog } from '@/components/common/NavigationGuardDialog'
import { useGameStore } from '@/stores/gameStore'
import { useAppStore } from '@/stores/appStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/ConfirmButton'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Wand2, RotateCcw, Save, Eye, EyeOff, FolderOpen, Pencil, Trash2, BookmarkPlus, Stethoscope, Settings2, ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { isRecentlyReturned, weeksAgoReturned } from '@/lib/injuryRisk'
import type { LineupSlot, Player, PlayerPositionType } from '@/types/player'
import { getLineupSlots, SLOT_POSITION_COMPATIBILITY } from '@/engine/core/constants'
import { getLineupEmergencySlots } from '@/engine/lineup/emergencyRoles'
import { selectBestLineup, type LineupAutofillStrategy } from '@/engine/ai/lineupSelection'
import { FootballField } from '@/components/lineup/FootballField'
import { InjuryReplacementPanel } from '@/components/lineup/InjuryReplacementPanel'
import { isPlayerSuspended } from '@/engine/players/availability'
import { canBeSelectedForAfl } from '@/engine/players/contracts'
import { getOverallRating, getPlayerPositionRatings, getPlayerStarRating } from '@/engine/player/playerRating'
import {
  getPlayerEligiblePositionTypes,
  isPlayerEligibleForPositionLine,
  getPositionSuitabilityForSlot,
} from '@/engine/player/positionEligibility'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { ReadinessBadge } from '@/components/player/ReadinessBadge'
import { PlayerHoverCard } from '@/components/player/PlayerHoverCard'
import { computePlayerReadiness } from '@/engine/player/readinessEngine'
import {
  buildUpcomingMilestoneNotes,
  formatUpcomingMilestoneLabel,
} from '@/engine/narrative/upcomingMilestones'
import { getPositionBadgeClass, getPositionFilterButtonClass } from '@/lib/positionColor'
import type { CustomLineupAutofillPreset, LineupAutofillPresetId } from '@/types/globalSettings'
import type { SavedLineup, RotationEvent } from '@/types/game'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PositionFilter = 'ALL' | 'DEF' | 'MID' | 'FWD' | 'RK'
type FitView = 'standard' | 'slot-fit'
type BuiltInAutofillPresetId = 'best-available' | 'last-game' | 'youth-focus' | 'win-now'

const BUILT_IN_AUTOFILL_PRESETS: Array<{ id: BuiltInAutofillPresetId; label: string; strategy: LineupAutofillStrategy; description: string }> = [
  {
    id: 'best-available',
    label: 'Best Available',
    strategy: 'best-available',
    description: 'Best role fit with form/fitness balance',
  },
  {
    id: 'last-game',
    label: 'Last Game Lineup',
    strategy: 'last-game',
    description: 'Keeps last lineup and replaces unavailable players',
  },
  {
    id: 'youth-focus',
    label: 'Youth Focus',
    strategy: 'youth-focus',
    description: 'Boosts youth/development upside',
  },
  {
    id: 'win-now',
    label: 'Veteran / Win-Now',
    strategy: 'win-now',
    description: 'Prioritizes current output and experience',
  },
]

const CONTINUITY_LEVELS = [
  { id: 'low', label: 'Low', value: 0.35 },
  { id: 'medium', label: 'Medium', value: 0.55 },
  { id: 'high', label: 'High', value: 0.8 },
] as const

const FILTER_OPTIONS: { value: PositionFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DEF', label: 'Def' },
  { value: 'MID', label: 'Mid' },
  { value: 'FWD', label: 'Fwd' },
  { value: 'RK', label: 'Ruck' },
]

const SUITABILITY_META: Record<'primary' | 'secondary' | 'out-of-position', { label: string }> = {
  primary: {
    label: 'Primary Fit',
  },
  secondary: {
    label: 'Secondary Fit',
  },
  'out-of-position': {
    label: 'Out Of Position',
  },
}

function toTitleCase(value: string): string {
  return value
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function formatSavedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatMatchRulesMeta(saved: SavedLineup): string {
  const sub = saved.matchRules.enableSubstitutes ? 'Sub On' : 'Sub Off'
  return `Int ${saved.matchRules.interchangePlayers} | ${sub} | Qtrs ${saved.matchRules.quartersPerMatch}`
}

function isCustomPresetId(value: string): value is `custom:${string}` {
  return value.startsWith('custom:')
}

function resolveAutofillPreset(
  presetId: LineupAutofillPresetId,
  customPresets: CustomLineupAutofillPreset[],
  defaults?: { preserveAssignments: boolean; continuityBias: number },
): {
  strategy: LineupAutofillStrategy
  preserveAssignments: boolean
  continuityBias: number
  customPreset: CustomLineupAutofillPreset | null
} {
  if (isCustomPresetId(presetId)) {
    const id = presetId.replace('custom:', '')
    const custom = customPresets.find((p) => p.id === id) ?? null
    if (custom) {
      return {
        strategy: custom.baseStrategy,
        preserveAssignments: custom.preserveAssignments,
        continuityBias: custom.continuityBias,
        customPreset: custom,
      }
    }
  }

  const builtIn = BUILT_IN_AUTOFILL_PRESETS.find((preset) => preset.id === presetId)
  const strategy = builtIn?.strategy ?? 'best-available'
  if (strategy === 'last-game') {
    return {
      strategy,
      preserveAssignments: true,
      continuityBias: 1,
      customPreset: null,
    }
  }
  return {
    strategy,
    preserveAssignments: defaults?.preserveAssignments ?? false,
    continuityBias: defaults?.continuityBias ?? 0.55,
    customPreset: null,
  }
}

function getPositionPreferenceChips(player: Player): Array<{ tier: 'P' | 'S' | 'T'; pos: PlayerPositionType; rating: number }> {
  const ratings = getPlayerPositionRatings(player)
  const primaryRating = ratings[player.position.primary] ?? 75
  const secondary = player.position.secondary.map((pos) => ({
    tier: 'S' as const,
    pos,
    rating: ratings[pos] ?? 62,
  }))
  const excluded = new Set<PlayerPositionType>([player.position.primary, ...player.position.secondary])
  const tertiary = Object.entries(ratings)
    .filter(([pos, value]) => !excluded.has(pos as PlayerPositionType) && (value ?? 0) >= 45)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 2)
    .map(([pos, value]) => ({
      tier: 'T' as const,
      pos: pos as PlayerPositionType,
      rating: value ?? 45,
    }))

  return [
    {
      tier: 'P',
      pos: player.position.primary,
      rating: primaryRating,
    },
    ...secondary,
    ...tertiary,
  ]
}

function matchesFilter(
  player: Player,
  filter: PositionFilter,
): boolean {
  if (filter === 'ALL') return true
  return isPlayerEligibleForPositionLine(player, filter)
}

function sanitizeLineup(
  rawLineup: Record<string, string>,
  players: Record<string, Player>,
  playerClubId: string,
  validSlots: Set<string>,
): Record<string, string> {
  const next: Record<string, string> = {}
  const seen = new Set<string>()
  for (const [slot, playerId] of Object.entries(rawLineup)) {
    if (!validSlots.has(slot)) continue
    if (!playerId || seen.has(playerId)) continue
    const player = players[playerId]
    if (!player) continue
    if (player.clubId !== playerClubId) continue
    if (!canBeSelectedForAfl(player)) continue
    if (player.injury || isPlayerSuspended(player) || player.fitness < 50) continue
    // Emergency coverage: allow any assignment — suitability is shown visually
    // and applied as a performance penalty in simulation.
    next[slot] = playerId
    seen.add(playerId)
  }
  return next
}

let dragPreviewEl: HTMLDivElement | null = null
function getDragPreviewElement(label: string): HTMLDivElement {
  if (!dragPreviewEl) {
    dragPreviewEl = document.createElement('div')
    dragPreviewEl.style.position = 'fixed'
    dragPreviewEl.style.top = '-1000px'
    dragPreviewEl.style.left = '-1000px'
    dragPreviewEl.style.pointerEvents = 'none'
    dragPreviewEl.style.padding = '4px 8px'
    dragPreviewEl.style.borderRadius = '8px'
    dragPreviewEl.style.border = '1px solid rgba(255,255,255,0.28)'
    dragPreviewEl.style.background = 'rgba(24,24,27,0.96)'
    dragPreviewEl.style.color = '#f4f4f5'
    dragPreviewEl.style.fontSize = '12px'
    dragPreviewEl.style.fontWeight = '600'
    dragPreviewEl.style.whiteSpace = 'nowrap'
    dragPreviewEl.style.maxWidth = '220px'
    dragPreviewEl.style.overflow = 'hidden'
    dragPreviewEl.style.textOverflow = 'ellipsis'
    document.body.appendChild(dragPreviewEl)
  }
  dragPreviewEl.textContent = label
  return dragPreviewEl
}

// ---------------------------------------------------------------------------
// EmergencyCoveragePanel
// ---------------------------------------------------------------------------

interface EmergencyCoveragePanelProps {
  lineup: Record<string, string>
  players: Record<string, Player>
  availablePlayers: Player[]
  onNavigate: (id: string) => void
}

function EmergencyCoveragePanel({ lineup, players, availablePlayers, onNavigate }: EmergencyCoveragePanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const emergencySlots = useMemo(
    () => getLineupEmergencySlots(lineup, players, availablePlayers),
    [lineup, players, availablePlayers],
  )

  if (emergencySlots.length === 0) return null

  return (
    <div className="shrink-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm font-medium hover:bg-accent/40 transition-colors"
        onClick={() => setIsOpen((v) => !v)}
      >
        {isOpen
          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <span>Emergency Coverage</span>
        <Badge variant="outline" className="ml-auto text-xs border-amber-500/40 bg-amber-500/10 text-amber-600">
          {emergencySlots.length} out-of-position
        </Badge>
      </button>

      {isOpen && (
        <div className="mt-2 rounded-md border border-border/70 p-3 space-y-2.5">
          <p className="text-[11px] text-muted-foreground">
            Players assigned outside their natural position incur performance, fatigue, and injury risk penalties in simulation.
          </p>
          {emergencySlots.map(({ slot, player, fitDisplay, alternatives }) => (
            <div key={slot} className={`rounded-md border px-2.5 py-2 space-y-1.5 ${fitDisplay.borderClass} ${fitDisplay.bgClass}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-muted-foreground w-7 shrink-0">{slot}</span>
                <button
                  type="button"
                  className="text-sm font-medium hover:underline"
                  onClick={() => onNavigate(player.id)}
                >
                  {player.firstName.charAt(0)}. {player.lastName}
                  <span className="ml-1 text-xs text-muted-foreground">({player.position.primary})</span>
                </button>
                <span className={`ml-auto text-[10px] font-semibold ${fitDisplay.colour}`}>
                  {fitDisplay.label}
                </span>
              </div>
              <div className="flex gap-3 text-[10px] flex-wrap">
                <span className="text-rose-400">−{fitDisplay.perfPenaltyPct}% performance</span>
                <span className="text-amber-400">+{fitDisplay.fatiguePct}% fatigue</span>
                <span className="text-orange-400">×{fitDisplay.injuryMult.toFixed(2)} injury risk</span>
              </div>
              {alternatives.length > 0 && (
                <div className="text-[10px] text-muted-foreground leading-relaxed">
                  {'Better options: '}
                  {alternatives.map((alt, i) => (
                    <button
                      key={alt.player.id}
                      type="button"
                      className="hover:underline"
                      onClick={() => onNavigate(alt.player.id)}
                    >
                      {alt.player.firstName.charAt(0)}. {alt.player.lastName}
                      <span className="ml-0.5 opacity-60">
                        ({alt.suitability === 'primary' ? '✓' : alt.suitability === 'secondary' ? '~' : '!'})
                      </span>
                      {i < alternatives.length - 1 ? ', ' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rotation Planner constants
// ---------------------------------------------------------------------------

const ON_FIELD_LINEUP_SLOTS = [
  'LBP', 'RBP', 'FB',
  'LHB', 'RHB', 'CHB',
  'LW', 'RW', 'C',
  'LHF', 'RHF', 'CHF',
  'LFP', 'RFP', 'FF',
  'RK', 'RR', 'ROV',
] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LineupPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const setSelectedLineup = useGameStore((s) => s.setSelectedLineup)
  const selectedSubstituteId = useGameStore((s) => s.selectedSubstituteId)
  const setSelectedSubstitute = useGameStore((s) => s.setSelectedSubstitute)
  const savedLineups = useGameStore((s) => s.savedLineups)
  const saveNamedLineup = useGameStore((s) => s.saveNamedLineup)
  const loadSavedLineup = useGameStore((s) => s.loadSavedLineup)
  const renameSavedLineup = useGameStore((s) => s.renameSavedLineup)
  const deleteSavedLineup = useGameStore((s) => s.deleteSavedLineup)
  const season = useGameStore((s) => s.season)
  const currentRound = useGameStore((s) => s.currentRound)
  const currentDate = useGameStore((s) => s.currentDate)
  const settings = useGameStore((s) => s.settings)
  const weeklyGameplan = useGameStore((s) => s.weeklyGameplans[s.playerClubId])
  const setRotationPlan = useGameStore((s) => s.setRotationPlan)
  const injuryReplacementPuzzles = useGameStore((s) => s.injuryReplacementPuzzles)
  const resolveInjuryReplacementPuzzle = useGameStore((s) => s.resolveInjuryReplacementPuzzle)
  const dismissInjuryReplacementPuzzle = useGameStore((s) => s.dismissInjuryReplacementPuzzle)
  const globalSettings = useAppStore((s) => s.globalSettings)
  const updateGlobalSettings = useAppStore((s) => s.updateGlobalSettings)
  const viewedTeamClubId = useAppStore((s) => s.viewedTeamClubId)

  const viewingOtherClub = !!viewedTeamClubId && viewedTeamClubId !== playerClubId
  const effectiveClubId = viewedTeamClubId ?? playerClubId

  const club = clubs[effectiveClubId]
  const lineupAutofillSettings = globalSettings.lineupAutofill
  const activePresetId = lineupAutofillSettings.selectedPresetId
  const resolvedPreset = useMemo(
    () => resolveAutofillPreset(activePresetId, lineupAutofillSettings.customPresets, {
      preserveAssignments: lineupAutofillSettings.preserveAssignments,
      continuityBias: lineupAutofillSettings.continuityBias,
    }),
    [
      activePresetId,
      lineupAutofillSettings.continuityBias,
      lineupAutofillSettings.customPresets,
      lineupAutofillSettings.preserveAssignments,
    ],
  )
  const activePresetDescription = useMemo(() => {
    if (resolvedPreset.customPreset) {
      return `${toTitleCase(resolvedPreset.customPreset.baseStrategy)} custom preset`
    }
    return BUILT_IN_AUTOFILL_PRESETS.find((preset) => preset.id === activePresetId)?.description ?? ''
  }, [activePresetId, resolvedPreset.customPreset])

  // Determine if user is on bye this round
  const userOnBye = useMemo(() => {
    const round = season.rounds[currentRound]
    if (!round) return false
    return (round.byeClubIds ?? []).includes(playerClubId)
  }, [season.rounds, currentRound, playerClubId])

  // Determine the current opposition from the fixture
  const oppositionClubId = useMemo(() => {
    const round = season.rounds[currentRound]
    if (!round) return null
    const fixture = round.fixtures.find(
      (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
    )
    if (!fixture) return null
    return fixture.homeClubId === playerClubId
      ? fixture.awayClubId
      : fixture.homeClubId
  }, [season.rounds, currentRound, playerClubId])

  const availablePlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId && canBeSelectedForAfl(p) && !p.injury && !isPlayerSuspended(p) && p.fitness >= 50)
        .sort((a, b) => getOverallRating(b) - getOverallRating(a)),
    [players, playerClubId],
  )

  const unavailablePlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId && canBeSelectedForAfl(p))
        .filter((p) => p.injury !== null || isPlayerSuspended(p) || p.fitness < 50)
        .sort((a, b) => {
          if (a.injury && !b.injury) return -1
          if (!a.injury && b.injury) return 1
          if (isPlayerSuspended(a) && !isPlayerSuspended(b)) return -1
          if (!isPlayerSuspended(a) && isPlayerSuspended(b)) return 1
          if (isPlayerSuspended(a) && isPlayerSuspended(b)) {
            return (b.suspension?.weeksRemaining ?? 0) - (a.suspension?.weeksRemaining ?? 0)
          }
          return (b.injury?.weeksRemaining ?? 0) - (a.injury?.weeksRemaining ?? 0)
        }),
    [players, playerClubId],
  )

  const [lineupDraft, setLineupDraft] = useState<Record<string, string> | null>(null)
  const lineupGuard = useNavigationGuard(lineupDraft !== null)

  const lineupSlots = useMemo(
    () => getLineupSlots(settings.matchRules.interchangePlayers),
    [settings.matchRules.interchangePlayers],
  )
  const lineupSlotSet = useMemo(() => new Set<string>(lineupSlots), [lineupSlots])
  const requiredCount = lineupSlots.length

  const [posFilter, setPosFilter] = useState<PositionFilter>('ALL')
  const [fitView, setFitView] = useState<FitView>('standard')
  const [selectedAssignSlot, setSelectedAssignSlot] = useState<LineupSlot | null>(null)
  const [showOpposition, setShowOpposition] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [includeReservesInSave, setIncludeReservesInSave] = useState(true)
  const [applyReservesOnLoad, setApplyReservesOnLoad] = useState(true)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [selectedSavedLineupId, setSelectedSavedLineupId] = useState<string | null>(null)

  // Rotation Planner state
  const [rotationPlanLocal, setRotationPlanLocal] = useState<RotationEvent[]>(
    () => weeklyGameplan?.rotationPlan ?? [],
  )
  const [showRotationPlanner, setShowRotationPlanner] = useState(false)
  const [activeQtr, setActiveQtr] = useState<1 | 2 | 3 | 4>(1)
  const [addingRotation, setAddingRotation] = useState(false)
  const [newMinute, setNewMinute] = useState(5)
  const [newPlayerOffId, setNewPlayerOffId] = useState('')
  const [newPlayerOnId, setNewPlayerOnId] = useState('')
  const rotationDidMountRef = useRef(false)

  const activeLineup = useMemo(
    () => lineupDraft ?? selectedLineup ?? {},
    [lineupDraft, selectedLineup],
  )

  const safeLineup = useMemo(
    () => sanitizeLineup(activeLineup, players, playerClubId, lineupSlotSet),
    [activeLineup, players, playerClubId, lineupSlotSet],
  )

  const assignedPlayerIds = useMemo(
    () => new Set(Object.values(safeLineup)),
    [safeLineup],
  )

  // Pre-match overtraining load check: starters with fatigue >= 72
  const overtrainedStarters = useMemo(() => {
    if (viewingOtherClub) return []
    return Object.values(safeLineup)
      .map((pid) => players[pid])
      .filter((p): p is import('@/types/player').Player => !!p && p.fatigue >= 72)
      .sort((a, b) => b.fatigue - a.fatigue)
  }, [safeLineup, players, viewingOtherClub])

  const savedLineupsForClub = useMemo(
    () =>
      savedLineups
        .filter((entry) => entry.clubId === playerClubId)
        .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)),
    [playerClubId, savedLineups],
  )

  useEffect(() => {
    if (!saveFeedback) return
    const timeout = window.setTimeout(() => setSaveFeedback(null), 2800)
    return () => window.clearTimeout(timeout)
  }, [saveFeedback])

  // Auto-save rotation plan to store whenever local state changes (skip initial mount)
  useEffect(() => {
    if (!rotationDidMountRef.current) {
      rotationDidMountRef.current = true
      return
    }
    setRotationPlan(rotationPlanLocal)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationPlanLocal])

  // Derived rotation planner values
  const activeQtrRotations = useMemo(
    () =>
      rotationPlanLocal
        .filter((e) => e.quarter === activeQtr)
        .sort((a, b) => a.minute - b.minute),
    [rotationPlanLocal, activeQtr],
  )

  const onFieldPlayerOptions = useMemo(() => {
    return ON_FIELD_LINEUP_SLOTS.flatMap((slot) => {
      const playerId = safeLineup[slot]
      if (!playerId) return []
      const player = players[playerId]
      if (!player) return []
      return [{ slot, player }]
    })
  }, [safeLineup, players])

  const interchangePlayerOptions = useMemo(() => {
    const slots = Array.from(
      { length: settings.matchRules.interchangePlayers },
      (_, i) => `I${i + 1}`,
    )
    return slots.flatMap((slot) => {
      const playerId = safeLineup[slot]
      if (!playerId) return []
      const player = players[playerId]
      if (!player) return []
      return [{ slot, player }]
    })
  }, [safeLineup, players, settings.matchRules.interchangePlayers])

  const alreadyScheduledOnIds = useMemo(
    () =>
      new Set(
        rotationPlanLocal
          .filter((e) => e.quarter === activeQtr)
          .map((e) => e.playerOnId),
      ),
    [rotationPlanLocal, activeQtr],
  )

  // ---- Rotation Planner Handlers ----

  const handleAddRotation = useCallback(() => {
    if (!newPlayerOffId || !newPlayerOnId) return
    const event: RotationEvent = {
      id: crypto.randomUUID(),
      quarter: activeQtr,
      minute: newMinute,
      playerOffId: newPlayerOffId,
      playerOnId: newPlayerOnId,
    }
    setRotationPlanLocal((prev) => [...prev, event])
    setAddingRotation(false)
    setNewPlayerOffId('')
    setNewPlayerOnId('')
  }, [activeQtr, newMinute, newPlayerOffId, newPlayerOnId])

  const handleRemoveRotation = useCallback((id: string) => {
    setRotationPlanLocal((prev) => prev.filter((e) => e.id !== id))
  }, [])

  // ---- Handlers ----

  const handleAssign = useCallback(
    (slot: string, playerId: string) => {
      if (!lineupSlotSet.has(slot)) return
      const prev = lineupDraft ?? selectedLineup ?? {}
      const next = { ...prev }
      for (const [k, v] of Object.entries(next)) {
        if (v === playerId) delete next[k]
      }
      next[slot] = playerId
      setLineupDraft(next)
      setSelectedLineup(next)
    },
    [lineupDraft, lineupSlotSet, selectedLineup, setSelectedLineup],
  )

  const handleSwap = useCallback(
    (slotA: string, slotB: string) => {
      if (!lineupSlotSet.has(slotA) || !lineupSlotSet.has(slotB)) return
      const prev = lineupDraft ?? selectedLineup ?? {}
      const next = { ...prev }
      const playerA = next[slotA]
      const playerB = next[slotB]
      if (playerA) next[slotB] = playerA
      else delete next[slotB]
      if (playerB) next[slotA] = playerB
      else delete next[slotA]
      setLineupDraft(next)
      setSelectedLineup(next)
    },
    [lineupDraft, lineupSlotSet, selectedLineup, setSelectedLineup],
  )

  const handleUnassign = useCallback(
    (slot: string) => {
      const prev = lineupDraft ?? selectedLineup ?? {}
      const next = { ...prev }
      delete next[slot]
      setLineupDraft(next)
      setSelectedLineup(next)
    },
    [lineupDraft, selectedLineup, setSelectedLineup],
  )

  const handleAutoFill = useCallback(() => {
    const baseLineup =
      resolvedPreset.strategy === 'last-game'
        ? selectedLineup ?? safeLineup
        : safeLineup
    const result = selectBestLineup(availablePlayers, playerClubId, {
      interchangePlayers: settings.matchRules.interchangePlayers,
      club,
      strategy: resolvedPreset.strategy,
      baseLineup,
      preserveAssignedSlots: resolvedPreset.preserveAssignments,
      continuityBias: resolvedPreset.continuityBias,
    })
    const sanitized = sanitizeLineup(result.lineup, players, playerClubId, lineupSlotSet)
    setLineupDraft(sanitized)
    setSelectedLineup(sanitized)
  }, [
    availablePlayers,
    club,
    lineupSlotSet,
    playerClubId,
    players,
    resolvedPreset.continuityBias,
    resolvedPreset.preserveAssignments,
    resolvedPreset.strategy,
    safeLineup,
    selectedLineup,
    setSelectedLineup,
    settings.matchRules.interchangePlayers,
  ])

  const handleSelectAutofillPreset = useCallback((value: string) => {
    const presetId = value as LineupAutofillPresetId
    void updateGlobalSettings({
      lineupAutofill: {
        ...lineupAutofillSettings,
        selectedPresetId: presetId,
      },
    })
  }, [lineupAutofillSettings, updateGlobalSettings])

  const handleSetPreserveAssignments = useCallback((value: string) => {
    const preserveAssignments = value === 'true'
    void updateGlobalSettings({
      lineupAutofill: {
        ...lineupAutofillSettings,
        preserveAssignments,
      },
    })
  }, [lineupAutofillSettings, updateGlobalSettings])

  const handleSetContinuityBias = useCallback((value: string) => {
    const level = CONTINUITY_LEVELS.find((item) => item.id === value)
    if (!level) return
    void updateGlobalSettings({
      lineupAutofill: {
        ...lineupAutofillSettings,
        continuityBias: level.value,
      },
    })
  }, [lineupAutofillSettings, updateGlobalSettings])

  const handleSaveCustomPreset = useCallback(() => {
    const name = window.prompt('Custom preset name')
    if (!name) return
    const trimmed = name.trim()
    if (!trimmed) return

    const id = crypto.randomUUID()
    const customPreset: CustomLineupAutofillPreset = {
      id,
      name: trimmed,
      baseStrategy: resolvedPreset.strategy,
      preserveAssignments: resolvedPreset.preserveAssignments,
      continuityBias: resolvedPreset.continuityBias,
    }

    void updateGlobalSettings({
      lineupAutofill: {
        ...lineupAutofillSettings,
        selectedPresetId: `custom:${id}`,
        customPresets: [...lineupAutofillSettings.customPresets, customPreset],
      },
    })
  }, [lineupAutofillSettings, resolvedPreset.continuityBias, resolvedPreset.preserveAssignments, resolvedPreset.strategy, updateGlobalSettings])

  const handleDeleteCustomPreset = useCallback(() => {
    const current = resolvedPreset.customPreset
    if (!current) return
    void updateGlobalSettings({
      lineupAutofill: {
        ...lineupAutofillSettings,
        selectedPresetId: 'best-available',
        customPresets: lineupAutofillSettings.customPresets.filter((preset) => preset.id !== current.id),
      },
    })
  }, [lineupAutofillSettings, resolvedPreset.customPreset, updateGlobalSettings])

  const handleClear = useCallback(() => {
    setLineupDraft({})
    setSelectedLineup({})
  }, [setSelectedLineup])

  // ---- Panel drag handling (drop player back to bench) ----

  const handlePanelDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    [],
  )

  const handlePanelDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const sourceSlot = e.dataTransfer.getData('application/x-slot')
      if (sourceSlot) {
        handleUnassign(sourceSlot)
      }
    },
    [handleUnassign],
  )

  // ---- Panel player drag start (from bench to field) ----

  const handleBenchDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, playerId: string, label: string) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('application/x-player-id', playerId)
      const preview = getDragPreviewElement(label)
      e.dataTransfer.setDragImage(preview, 12, 12)
    },
    [],
  )

  const filledCount = Object.keys(safeLineup).length
  const handleOppositionPlayerClick = useCallback((playerId: string) => {
    navigate(`/player/${encodeURIComponent(playerId)}`)
  }, [navigate])

  // Filter unassigned players for the bench panel
  const benchPlayers = useMemo(
    () => {
      const filtered = availablePlayers.filter(
        (p) => !assignedPlayerIds.has(p.id) && matchesFilter(p, posFilter),
      )
      if (fitView !== 'slot-fit' || !selectedAssignSlot) return filtered

      const scoreBySuitability: Record<'primary' | 'secondary' | 'out-of-position', number> = {
        primary: 2,
        secondary: 1,
        'out-of-position': 0,
      }

      return [...filtered].sort((a, b) => {
        const fitA = getPositionSuitabilityForSlot(a, selectedAssignSlot)
        const fitB = getPositionSuitabilityForSlot(b, selectedAssignSlot)
        const fitDelta = scoreBySuitability[fitB] - scoreBySuitability[fitA]
        if (fitDelta !== 0) return fitDelta
        return getOverallRating(b) - getOverallRating(a)
      })
    },
    [availablePlayers, assignedPlayerIds, fitView, posFilter, selectedAssignSlot],
  )
  const substituteCandidates = useMemo(
    () => availablePlayers.filter((p) => !assignedPlayerIds.has(p.id)),
    [availablePlayers, assignedPlayerIds],
  )
  const effectiveSubstituteId = useMemo(() => {
    if (!settings.matchRules.enableSubstitutes) return null
    if (!selectedSubstituteId) return null
    return substituteCandidates.some((p) => p.id === selectedSubstituteId) ? selectedSubstituteId : null
  }, [settings.matchRules.enableSubstitutes, selectedSubstituteId, substituteCandidates])
  const handleCommitLineup = useCallback(() => {
    setSelectedLineup(safeLineup)
    if (settings.matchRules.enableSubstitutes) {
      const nextSubstitute = effectiveSubstituteId ?? substituteCandidates[0]?.id ?? null
      setSelectedSubstitute(nextSubstitute)
    } else {
      setSelectedSubstitute(null)
    }
    setLineupDraft(safeLineup)
  }, [effectiveSubstituteId, safeLineup, setSelectedLineup, setSelectedSubstitute, settings.matchRules.enableSubstitutes, substituteCandidates])
  const handleOpenSaveDialog = useCallback(() => {
    handleCommitLineup()
    const defaultName = `Round ${currentRound + 1}${oppositionClubId && clubs[oppositionClubId] ? ` vs ${clubs[oppositionClubId].abbreviation}` : ''}`
    setSaveName(defaultName)
    setShowSaveDialog(true)
  }, [clubs, currentRound, handleCommitLineup, oppositionClubId])

  const handleSaveNamedLineup = useCallback(() => {
    const trimmedName = saveName.trim()
    if (!trimmedName) return
    const firstAttempt = saveNamedLineup({
      name: trimmedName,
      lineup: safeLineup,
      substitutePlayerId: settings.matchRules.enableSubstitutes ? (effectiveSubstituteId ?? null) : null,
      benchPlayerIds: benchPlayers.map((p) => p.id),
      includeReserves: includeReservesInSave,
      overwriteExisting: false,
    })

    if (!firstAttempt.success && firstAttempt.existingId) {
      const allowOverwrite = window.confirm(`"${trimmedName}" already exists. Overwrite it?`)
      if (!allowOverwrite) return
      const overwrite = saveNamedLineup({
        name: trimmedName,
        lineup: safeLineup,
        substitutePlayerId: settings.matchRules.enableSubstitutes ? (effectiveSubstituteId ?? null) : null,
        benchPlayerIds: benchPlayers.map((p) => p.id),
        includeReserves: includeReservesInSave,
        overwriteExisting: true,
      })
      if (!overwrite.success) return
      setSaveFeedback(`Lineup "${trimmedName}" overwritten successfully.`)
    } else if (firstAttempt.success) {
      setSaveFeedback(`Lineup "${trimmedName}" saved successfully.`)
    } else {
      return
    }

    setShowSaveDialog(false)
    setSelectedSavedLineupId(null)
  }, [
    benchPlayers,
    effectiveSubstituteId,
    includeReservesInSave,
    saveName,
    saveNamedLineup,
    safeLineup,
    settings.matchRules.enableSubstitutes,
  ])

  const selectedSavedLineup = useMemo(
    () => savedLineupsForClub.find((entry) => entry.id === selectedSavedLineupId) ?? null,
    [savedLineupsForClub, selectedSavedLineupId],
  )
  const selectedSavedLineupSlots = useMemo(
    () =>
      selectedSavedLineup
        ? getLineupSlots(selectedSavedLineup.matchRules.interchangePlayers)
        : [],
    [selectedSavedLineup],
  )

  const handleLoadSelectedLineup = useCallback(() => {
    if (!selectedSavedLineup) return
    const result = loadSavedLineup(selectedSavedLineup.id, { applyReserves: applyReservesOnLoad })
    if (!result.success) return
    setLineupDraft({ ...selectedSavedLineup.lineup })
    setSaveFeedback(`Loaded "${selectedSavedLineup.name}".`)
    setShowLoadDialog(false)
  }, [applyReservesOnLoad, loadSavedLineup, selectedSavedLineup])

  const handleRenameSavedLineup = useCallback((entry: SavedLineup) => {
    const nextName = window.prompt('Rename lineup', entry.name)?.trim()
    if (!nextName || nextName === entry.name) return
    const result = renameSavedLineup(entry.id, nextName)
    if (!result.success && result.existingId) {
      window.alert(`A lineup named "${nextName}" already exists.`)
    }
  }, [renameSavedLineup])

  const handleDeleteSavedLineup = useCallback((entry: SavedLineup) => {
    const result = deleteSavedLineup(entry.id)
    if (!result.success) return
    if (selectedSavedLineupId === entry.id) setSelectedSavedLineupId(null)
  }, [deleteSavedLineup, selectedSavedLineupId])

  const milestoneNotes = useMemo(
    () => buildUpcomingMilestoneNotes(players, availablePlayers.map((player) => player.id)).slice(0, 8),
    [players, availablePlayers],
  )
  const milestoneByPlayer = useMemo(() => {
    const map = new Map<string, string>()
    for (const note of milestoneNotes) {
      if (!map.has(note.playerId)) {
        map.set(note.playerId, formatUpcomingMilestoneLabel(note))
      }
    }
    return map
  }, [milestoneNotes])

  const selectedSlotCompat = useMemo(
    () => (selectedAssignSlot ? SLOT_POSITION_COMPATIBILITY[selectedAssignSlot] ?? [] : []),
    [selectedAssignSlot],
  )

  // Read-only view when scouting another club's lineup
  if (viewingOtherClub) {
    const otherClub = clubs[effectiveClubId]
    const otherLineup = selectBestLineup(
      Object.values(players),
      effectiveClubId,
      {
        interchangePlayers: settings.matchRules.interchangePlayers,
        club: otherClub,
      },
    ).lineup
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{otherClub?.name} — Lineup</h1>
          <p className="text-sm text-muted-foreground">Projected AI lineup (read-only)</p>
        </div>
        <FootballField
          lineup={otherLineup}
          players={players}
          clubs={clubs}
          userClubId={effectiveClubId}
          interchangeCount={settings.matchRules.interchangePlayers}
          substitutesEnabled={settings.matchRules.enableSubstitutes}
          oppositionClubId={null}
          showOpposition={false}
          onAssign={() => {}}
          onSwap={() => {}}
          onUnassign={() => {}}
        />
      </div>
    )
  }

  if (userOnBye) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{club?.name} - Lineup Selection</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-lg font-bold">Bye Week</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your club has a bye this round. No lineup selection needed.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <NavigationGuardDialog
        isBlocked={lineupGuard.isBlocked}
        description="You have unsaved lineup changes — leave anyway?"
        proceed={lineupGuard.proceed}
        reset={lineupGuard.reset}
      />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">
            {club?.name} - Lineup Selection
          </h1>
          <p className="text-sm text-muted-foreground">
            {filledCount}/{requiredCount} positions filled
            {` | Available ${availablePlayers.length}`}
            {` | Unavailable ${unavailablePlayers.length}`}
            {oppositionClubId && clubs[oppositionClubId]
              ? ` | vs ${clubs[oppositionClubId].name}`
              : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            Autofill: {resolvedPreset.customPreset?.name
              ?? BUILT_IN_AUTOFILL_PRESETS.find((preset) => preset.id === activePresetId)?.label
              ?? 'Best Available'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {settings.matchRules.enableSubstitutes && (
            <div className="flex min-w-[250px] items-center gap-2">
              <span className="text-xs text-muted-foreground">Sub</span>
              <Select
                value={effectiveSubstituteId ?? ''}
                onValueChange={(value) => setSelectedSubstitute(value || null)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select substitute" />
                </SelectTrigger>
                <SelectContent>
                  {substituteCandidates.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="mr-1">{p.firstName.charAt(0)}. {p.lastName}</span>
                      <span className={`rounded border px-1 py-0 text-[10px] ${getPositionBadgeClass(p.position.primary)}`}>
                        {p.position.primary}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {oppositionClubId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOpposition((v) => !v)}
            >
              {showOpposition ? (
                <EyeOff className="mr-1 h-4 w-4" />
              ) : (
                <Eye className="mr-1 h-4 w-4" />
              )}
              {showOpposition ? 'Hide Opp' : 'View Opp'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleClear}>
            <RotateCcw className="mr-1 h-4 w-4" />
            Clear
          </Button>
          <div className="flex">
            <Button variant="secondary" size="sm" className="rounded-r-none" onClick={handleAutoFill}>
              <Wand2 className="mr-1 h-4 w-4" />
              Auto Fill
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-l-none border-l border-background/20 px-2"
                  aria-label="Autofill settings"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-4">
                <p className="text-sm font-semibold">Autofill Settings</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Strategy Preset</Label>
                    <Select value={activePresetId} onValueChange={handleSelectAutofillPreset}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select preset" />
                      </SelectTrigger>
                      <SelectContent>
                        {BUILT_IN_AUTOFILL_PRESETS.map((preset) => (
                          <SelectItem key={preset.id} value={preset.id}>
                            {preset.label}
                          </SelectItem>
                        ))}
                        {lineupAutofillSettings.customPresets.length > 0 && (
                          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Custom Presets
                          </div>
                        )}
                        {lineupAutofillSettings.customPresets.map((preset) => (
                          <SelectItem key={`custom-${preset.id}`} value={`custom:${preset.id}`}>
                            {preset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {activePresetDescription && (
                      <p className="text-[11px] text-muted-foreground">{activePresetDescription}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Preserve Assignments</Label>
                      <Select
                        value={String(lineupAutofillSettings.preserveAssignments)}
                        onValueChange={handleSetPreserveAssignments}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">Off</SelectItem>
                          <SelectItem value="true">On</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Continuity Bias</Label>
                      <Select
                        value={CONTINUITY_LEVELS.find((level) => level.value === lineupAutofillSettings.continuityBias)?.id ?? 'medium'}
                        onValueChange={handleSetContinuityBias}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTINUITY_LEVELS.map((level) => (
                            <SelectItem key={level.id} value={level.id}>
                              {level.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 border-t border-border/60 pt-3">
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleSaveCustomPreset}>
                    <BookmarkPlus className="mr-1 h-3.5 w-3.5" />
                    Save as Custom
                  </Button>
                  {resolvedPreset.customPreset && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={handleDeleteCustomPreset}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Delete custom preset
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedSavedLineupId(savedLineupsForClub[0]?.id ?? null)
              setShowLoadDialog(true)
            }}
            disabled={savedLineupsForClub.length === 0}
          >
            <FolderOpen className="mr-1 h-4 w-4" />
            Load Lineup
          </Button>
          <Button size="sm" onClick={handleOpenSaveDialog} disabled={filledCount < requiredCount}>
            <Save className="mr-1 h-4 w-4" />
            Save Lineup
          </Button>
        </div>
      </div>
      {saveFeedback && (
        <div className="shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          {saveFeedback}
        </div>
      )}

      {/* Injury replacement puzzles */}
      {!viewingOtherClub && (
        <InjuryReplacementPanel
          puzzles={injuryReplacementPuzzles}
          players={players}
          onResolve={resolveInjuryReplacementPuzzle}
          onDismiss={dismissInjuryReplacementPuzzle}
        />
      )}

      {/* Overtraining load warning */}
      {overtrainedStarters.length > 0 && (
        <div className="shrink-0 rounded-md border border-orange-500/30 bg-orange-500/8 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">
              Load Warning — {overtrainedStarters.length} selected {overtrainedStarters.length === 1 ? 'player is' : 'players are'} carrying heavy fatigue
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {overtrainedStarters.map((p) => (
              <span
                key={p.id}
                className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                  p.fatigue >= 82
                    ? 'border-red-500/35 bg-red-500/12 text-red-700 dark:text-red-400'
                    : 'border-orange-500/35 bg-orange-500/12 text-orange-700 dark:text-orange-400'
                }`}
              >
                {p.firstName.charAt(0)}. {p.lastName}
                <span className="font-bold tabular-nums ml-0.5">{p.fatigue}</span>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Fatigue ≥ 72 increases injury risk and reduces match performance. Consider rotating in fresher players or scheduling a rest/recovery session before game day.
          </p>
        </div>
      )}

      {/* Main layout: Field (left ~70%) + Bench panel (right ~30%) */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Football field + Rotation Planner */}
        <div className="lg:w-[70%] w-full flex flex-col gap-3 overflow-y-auto">
          <FootballField
              lineup={safeLineup}
              players={players}
              clubs={clubs}
              userClubId={playerClubId}
              interchangeCount={settings.matchRules.interchangePlayers}
              substitutesEnabled={settings.matchRules.enableSubstitutes}
              userSubstituteId={effectiveSubstituteId}
              oppositionClubId={oppositionClubId}
              showOpposition={showOpposition}
              onOppositionPlayerClick={handleOppositionPlayerClick}
              onPlayerClick={(id) => navigate(`/player/${encodeURIComponent(id)}`)}
              selectedSlot={selectedAssignSlot}
              onSelectSlot={(slot) => setSelectedAssignSlot(slot as LineupSlot)}
              onAssign={handleAssign}
              onSwap={handleSwap}
              onUnassign={handleUnassign}
            />

          {/* Emergency Coverage Panel */}
          <EmergencyCoveragePanel
            lineup={safeLineup}
            players={players}
            availablePlayers={availablePlayers}
            onNavigate={(id) => navigate(`/player/${encodeURIComponent(id)}`)}
          />

          {/* Rotation Planner */}
          <div className="shrink-0">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm font-medium hover:bg-accent/40 transition-colors"
              onClick={() => setShowRotationPlanner((v) => !v)}
            >
              {showRotationPlanner
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <span>Rotation Planner</span>
              {rotationPlanLocal.length > 0 && (
                <Badge variant="outline" className="ml-auto text-xs">
                  {rotationPlanLocal.length} rotation{rotationPlanLocal.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </button>

            {showRotationPlanner && (
              <div className="mt-2 rounded-md border border-border/70 p-3 space-y-3">
                {/* Quarter tabs */}
                <div className="inline-flex rounded-md overflow-hidden border border-border/70">
                  {([1, 2, 3, 4] as const).map((q, qi) => (
                    <button
                      key={q}
                      type="button"
                      className={`h-7 px-3 text-xs font-medium transition-colors ${
                        activeQtr === q
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      }${qi > 0 ? ' border-l border-border/70' : ''}`}
                      onClick={() => setActiveQtr(q)}
                    >
                      Q{q}
                    </button>
                  ))}
                </div>

                {/* Rotation list for active quarter */}
                <div className="space-y-1">
                  {activeQtrRotations.length === 0 && !addingRotation && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No rotations scheduled for Q{activeQtr}
                    </p>
                  )}
                  {activeQtrRotations.map((event) => {
                    const offPlayer = players[event.playerOffId]
                    const onPlayer = players[event.playerOnId]
                    const offSlot = Object.entries(safeLineup).find(([, id]) => id === event.playerOffId)?.[0]
                    const onSlot = Object.entries(safeLineup).find(([, id]) => id === event.playerOnId)?.[0]
                    const offLabel = offPlayer
                      ? `${offPlayer.firstName.charAt(0)}. ${offPlayer.lastName}${offSlot ? ` (${offSlot})` : ''}`
                      : event.playerOffId
                    const onLabel = onPlayer
                      ? `${onPlayer.firstName.charAt(0)}. ${onPlayer.lastName}${onSlot ? ` (${onSlot})` : ''}`
                      : event.playerOnId
                    return (
                      <div
                        key={event.id}
                        className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs"
                      >
                        <span className="text-muted-foreground w-12 shrink-0">Min {event.minute}</span>
                        <span className="flex-1 truncate">{offLabel}</span>
                        <span className="text-muted-foreground shrink-0">→</span>
                        <span className="flex-1 truncate">{onLabel}</span>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => handleRemoveRotation(event.id)}
                          aria-label="Remove rotation"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}

                  {addingRotation && (
                    <div className="rounded-md border border-border/60 bg-muted/20 p-2 space-y-2">
                      <div className="grid grid-cols-[80px_1fr_1fr] gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Minute</Label>
                          <Input
                            type="number"
                            min={1}
                            max={29}
                            value={newMinute}
                            onChange={(e) => setNewMinute(Math.max(1, Math.min(29, Number(e.target.value))))}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Player Off</Label>
                          <Select value={newPlayerOffId} onValueChange={setNewPlayerOffId}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {onFieldPlayerOptions.map(({ slot, player }) => (
                                <SelectItem key={player.id} value={player.id}>
                                  {player.firstName.charAt(0)}. {player.lastName} ({slot})
                                </SelectItem>
                              ))}
                              {onFieldPlayerOptions.length === 0 && (
                                <div className="px-2 py-1 text-xs text-muted-foreground">No on-field players assigned</div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Player On</Label>
                          <Select value={newPlayerOnId} onValueChange={setNewPlayerOnId}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {interchangePlayerOptions.map(({ slot, player }) => (
                                <SelectItem
                                  key={player.id}
                                  value={player.id}
                                  disabled={alreadyScheduledOnIds.has(player.id)}
                                >
                                  {player.firstName.charAt(0)}. {player.lastName} ({slot})
                                </SelectItem>
                              ))}
                              {interchangePlayerOptions.length === 0 && (
                                <div className="px-2 py-1 text-xs text-muted-foreground">No interchange players assigned</div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={handleAddRotation}
                          disabled={!newPlayerOffId || !newPlayerOnId}
                        >
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => { setAddingRotation(false); setNewPlayerOffId(''); setNewPlayerOnId('') }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {!addingRotation && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => { setAddingRotation(true); setNewMinute(5); setNewPlayerOffId(''); setNewPlayerOnId('') }}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add Rotation
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Available players panel */}
        <div
          className="lg:w-[30%] w-full flex flex-col min-h-0"
          onDragOver={handlePanelDragOver}
          onDrop={handlePanelDrop}
        >
          <Card className="flex flex-col flex-1 min-h-0">
            <CardHeader className="py-3 space-y-2 shrink-0">
              <CardTitle className="text-sm">
                Available Players ({benchPlayers.length})
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Position numbers are overall rating at that position. FIT% is current match fitness.
              </p>
              <div className="space-y-1">
                <div className="inline-flex rounded-md overflow-hidden border border-border/70">
                  <button
                    type="button"
                    onClick={() => setFitView('standard')}
                    className={`h-7 px-3 text-xs font-medium transition-colors ${
                      fitView === 'standard'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => setFitView('slot-fit')}
                    className={`h-7 px-3 text-xs font-medium border-l border-border/70 transition-colors ${
                      fitView === 'slot-fit'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    }`}
                  >
                    Slot Fit
                  </button>
                </div>
                {fitView === 'slot-fit' && (
                  <div className="rounded-md border border-border/70 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                    {selectedAssignSlot
                      ? `Assigning ${selectedAssignSlot}. Click a player to assign quickly.`
                      : 'Select a field slot to activate fit highlighting.'}
                    {selectedAssignSlot && selectedSlotCompat.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {selectedSlotCompat.map((pos) => (
                          <Badge key={`${selectedAssignSlot}-${pos}`} variant="outline" className={`text-[10px] ${getPositionBadgeClass(pos)}`}>
                            {pos}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Position filter buttons */}
              <div className="flex gap-1 flex-wrap">
                {FILTER_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant="outline"
                    className={`h-6 px-2 text-xs ${
                      opt.value === 'DEF'
                        ? getPositionFilterButtonClass('DEF', posFilter === opt.value)
                        : opt.value === 'MID'
                          ? getPositionFilterButtonClass('MID', posFilter === opt.value)
                          : opt.value === 'FWD'
                            ? getPositionFilterButtonClass('FWD', posFilter === opt.value)
                            : opt.value === 'RK'
                              ? getPositionFilterButtonClass('RK', posFilter === opt.value)
                              : posFilter === opt.value
                                ? 'border-primary/40 bg-primary/15 text-primary'
                                : ''
                    }`}
                    onClick={() => setPosFilter(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              {/* Team readiness summary */}
              {benchPlayers.length > 0 && (() => {
                const rScores = benchPlayers.map((p) => computePlayerReadiness(p).score)
                const avgFit = Math.round(benchPlayers.reduce((s, p) => s + p.fitness, 0) / benchPlayers.length)
                const avgFat = Math.round(benchPlayers.reduce((s, p) => s + p.fatigue, 0) / benchPlayers.length)
                const avgReady = Math.round(rScores.reduce((a, b) => a + b, 0) / rScores.length)
                return (
                  <div className="text-[10px] text-muted-foreground">
                    Bench — Avg Fitness {avgFit} · Avg Fatigue {avgFat} · Avg Readiness {avgReady}
                  </div>
                )
              })()}
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0">
              <ScrollArea className="h-full">
                <div className="space-y-0.5 px-2 pb-2">
                  {benchPlayers.map((p) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) =>
                        handleBenchDragStart(e, p.id, `${p.firstName.charAt(0)}. ${p.lastName}`)
                      }
                      onClick={() => {
                        if (fitView === 'slot-fit' && selectedAssignSlot) {
                          handleAssign(selectedAssignSlot, p.id)
                        }
                      }}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors border ${
                        fitView === 'slot-fit' && selectedAssignSlot
                          ? 'border-border/70 bg-muted/20'
                          : 'border-transparent hover:border-zinc-700'
                      }`}
                    >
                      <span className="text-xs font-bold text-zinc-400 w-5 text-right">
                        #{p.jerseyNumber}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <PlayerHoverCard player={p} side="right">
                            <span className="text-sm truncate cursor-default">
                              {p.firstName.charAt(0)}. {p.lastName}
                            </span>
                          </PlayerHoverCard>
                          {isRecentlyReturned(p, currentDate) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="shrink-0">
                                  <Stethoscope className="h-3 w-3 text-amber-500" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">
                                {(() => {
                                  const last = (p.injuryHistory ?? []).at(-1)
                                  if (!last) return 'Recently returned from injury'
                                  const weeksAgo = weeksAgoReturned(p, currentDate)
                                  return (
                                    <div className="space-y-0.5">
                                      <p className="font-semibold">Returned from injury</p>
                                      <p>{last.type} ({last.initialWeeks}w, {last.gamesMissed ?? 0} gm missed)</p>
                                      <p className="text-amber-400">
                                        {weeksAgo === 0 ? 'Back this week' : `${weeksAgo}w ago`}
                                      </p>
                                    </div>
                                  )
                                })()}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <ReadinessBadge player={p} size="xs" />
                        </div>
                        {milestoneByPlayer.has(p.id) && (
                          <Badge variant="outline" className="mt-0.5 text-[10px] border-cyan-500/30 bg-cyan-500/10 text-cyan-700">
                            {milestoneByPlayer.get(p.id)}
                          </Badge>
                        )}
                        <PlayerStarRating
                          stars={getPlayerStarRating(p)}
                          player={p}
                          className="scale-[0.8] origin-left"
                        />
                        <div className="mt-1 flex flex-wrap gap-1">
                          {getPositionPreferenceChips(p).map((chip) => (
                            <Badge
                              key={`${p.id}-${chip.tier}-${chip.pos}`}
                              variant="outline"
                              className={`text-[10px] ${getPositionBadgeClass(chip.pos)}`}
                              title={`${chip.pos} overall rating`}
                            >
                              {chip.pos} {chip.rating}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${getPositionBadgeClass(p.position.primary)}`}
                        title={getPlayerEligiblePositionTypes(p).join(', ')}
                      >
                        {p.position.primary}
                      </Badge>
                      {fitView === 'slot-fit' && selectedAssignSlot && (
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0"
                        >
                          {SUITABILITY_META[getPositionSuitabilityForSlot(p, selectedAssignSlot)].label}
                        </Badge>
                      )}
                      <div className="w-12 text-right leading-tight" title="Overall rating">
                        <div className="text-[9px] text-muted-foreground uppercase">OVR</div>
                        <div className="text-xs text-muted-foreground">{getOverallRating(p)}</div>
                      </div>
                      <div className="w-12 text-right leading-tight" title="Current match fitness percentage">
                        <div className="text-[9px] text-muted-foreground uppercase">FIT%</div>
                        <div className="text-xs text-muted-foreground">{p.fitness}%</div>
                      </div>
                      {p.fatigue >= 65 && (
                        <Badge variant="outline" className="text-[10px] border-yellow-500/30 bg-yellow-500/15 text-yellow-700">
                          High Fatigue
                        </Badge>
                      )}
                    </div>
                  ))}
                  {benchPlayers.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {posFilter === 'ALL'
                        ? 'All available players assigned'
                        : 'No unassigned players match this filter'}
                    </p>
                  )}
                </div>
                {unavailablePlayers.length > 0 && (
                  <div className="px-2 pb-2 pt-2 border-t border-border/60 space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                      Unavailable ({unavailablePlayers.length})
                    </p>
                    {unavailablePlayers.map((p) => (
                      <div
                        key={`unavail-${p.id}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs bg-muted/20"
                      >
                        <span className="font-medium truncate min-w-0 flex-1">
                          {p.firstName.charAt(0)}. {p.lastName}
                        </span>
                        {p.injury ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="cursor-default text-[10px] border-red-500/30 bg-red-500/15 text-red-600">
                                <Stethoscope className="h-2.5 w-2.5 mr-0.5" />
                                {p.injury.type} ({p.injury.weeksRemaining}w)
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs max-w-[200px]">
                              <p className="font-semibold">{p.injury.type}</p>
                              {p.injury.severity && <p className="capitalize">{p.injury.severity} injury</p>}
                              <p>{p.injury.weeksRemaining} week{p.injury.weeksRemaining !== 1 ? 's' : ''} remaining</p>
                              {p.injury.recurring && <p className="text-amber-400">↩ Recurring injury</p>}
                              {typeof p.injury.recoveryProgress === 'number' && (
                                <p>Recovery: {Math.round(p.injury.recoveryProgress)}% this week</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ) : isPlayerSuspended(p) ? (
                          <Badge variant="outline" className="text-[10px] border-orange-500/30 bg-orange-500/15 text-orange-700">
                            Suspended ({p.suspension?.weeksRemaining ?? 0}w)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-orange-500/30 bg-orange-500/15 text-orange-700">
                            Fitness {p.fitness}%
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save Lineup</DialogTitle>
            <DialogDescription>
              Save current on-field lineup, bench, substitute, matchup roles/tags, and optional reserves availability snapshot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="lineup-save-name">Lineup Name</Label>
              <Input
                id="lineup-save-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Round 7 vs WCE"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
              <span>Include reserves/rest assignments</span>
              <Button
                size="sm"
                variant={includeReservesInSave ? 'default' : 'outline'}
                onClick={() => setIncludeReservesInSave((v) => !v)}
              >
                {includeReservesInSave ? 'Yes' : 'No'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNamedLineup} disabled={!saveName.trim()}>
              Save Lineup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Load Lineup</DialogTitle>
            <DialogDescription>
              Select a saved lineup to preview and load. You can also rename or delete saved entries.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <ScrollArea className="h-[420px] rounded-md border border-border/70 p-2">
              <div className="space-y-2">
                {savedLineupsForClub.map((entry) => {
                  const opponentLabel = entry.opponentClubId ? (clubs[entry.opponentClubId]?.name ?? entry.opponentClubId) : 'Unknown opponent'
                  const isSelected = entry.id === selectedSavedLineupId
                  return (
                    <div
                      key={entry.id}
                      className={`rounded-md border px-3 py-2 ${isSelected ? 'border-primary/50 bg-primary/10' : 'border-border/70'}`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setSelectedSavedLineupId(entry.id)}
                      >
                        <p className="text-sm font-semibold">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSavedAt(entry.savedAt)} | {opponentLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatMatchRulesMeta(entry)}</p>
                      </button>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleRenameSavedLineup(entry)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Rename
                        </Button>
                        <ConfirmButton size="sm" variant="outline" className="h-7 px-2 text-xs" onConfirm={() => handleDeleteSavedLineup(entry)} confirmLabel="Delete?">
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Delete
                        </ConfirmButton>
                      </div>
                    </div>
                  )
                })}
                {savedLineupsForClub.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">No saved lineups yet.</p>
                )}
              </div>
            </ScrollArea>

            <div className="space-y-2 rounded-md border border-border/70 p-3">
              <p className="text-sm font-semibold">Preview</p>
              {!selectedSavedLineup && (
                <p className="text-sm text-muted-foreground">Select a saved lineup to preview.</p>
              )}
              {selectedSavedLineup && (
                <>
                  <p className="text-sm font-medium">{selectedSavedLineup.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {Object.keys(selectedSavedLineup.lineup).length}/{selectedSavedLineupSlots.length} positions | Bench {selectedSavedLineup.benchPlayerIds.length}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tags: {selectedSavedLineup.weeklyGameplanSnapshot?.matchupTactics.hardTags.length ?? 0} hard tags, {selectedSavedLineup.weeklyGameplanSnapshot?.matchupTactics.roleAssignments.length ?? 0} role assignments
                  </p>
                  <div className="max-h-[220px] overflow-y-auto rounded-md border border-border/60 p-2 text-xs">
                    {selectedSavedLineupSlots.map((slot) => {
                      const playerId = selectedSavedLineup.lineup[slot]
                      const player = playerId ? players[playerId] : null
                      return (
                        <div key={`${selectedSavedLineup.id}-${slot}`} className="flex items-center justify-between py-0.5">
                          <span className="text-muted-foreground">{slot}</span>
                          <span>{player ? `${player.firstName.charAt(0)}. ${player.lastName}` : '-'}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
                    <span>Apply reserves/rest assignments</span>
                    <Button
                      size="sm"
                      variant={applyReservesOnLoad ? 'default' : 'outline'}
                      onClick={() => setApplyReservesOnLoad((v) => !v)}
                    >
                      {applyReservesOnLoad ? 'Yes' : 'No'}
                    </Button>
                  </div>
                  <Button onClick={handleLoadSelectedLineup} className="w-full">
                    Load Selected Lineup
                  </Button>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLoadDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

