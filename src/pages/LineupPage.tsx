import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { useAppStore } from '@/stores/appStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { Wand2, RotateCcw, Save, Eye, EyeOff, FolderOpen, Pencil, Trash2, BookmarkPlus, Stethoscope } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isRecentlyReturned } from '@/lib/injuryRisk'
import type { LineupSlot, Player, PlayerPositionType } from '@/types/player'
import { getLineupSlots, SLOT_POSITION_COMPATIBILITY } from '@/engine/core/constants'
import { selectBestLineup, type LineupAutofillStrategy } from '@/engine/ai/lineupSelection'
import { FootballField } from '@/components/lineup/FootballField'
import { isPlayerSuspended } from '@/engine/players/availability'
import { canBeSelectedForAfl } from '@/engine/players/contracts'
import { getOverallRating, getPlayerPositionRatings, getPlayerStarRating } from '@/engine/player/playerRating'
import {
  getPlayerEligiblePositionTypes,
  isPlayerEligibleForPositionLine,
  getPositionSuitabilityForSlot,
} from '@/engine/player/positionEligibility'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import {
  buildUpcomingMilestoneNotes,
  formatUpcomingMilestoneLabel,
} from '@/engine/narrative/upcomingMilestones'
import { getPositionBadgeClass, getPositionFilterButtonClass } from '@/lib/positionColor'
import type { CustomLineupAutofillPreset, LineupAutofillPresetId } from '@/types/globalSettings'
import type { SavedLineup } from '@/types/game'

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
    const slotCompat = SLOT_POSITION_COMPATIBILITY[slot as keyof typeof SLOT_POSITION_COMPATIBILITY] ?? []
    const eligibleTypes = new Set(getPlayerEligiblePositionTypes(player))
    if (slotCompat.length > 0 && !slotCompat.some((pos) => eligibleTypes.has(pos))) continue
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
  const settings = useGameStore((s) => s.settings)
  const globalSettings = useAppStore((s) => s.globalSettings)
  const updateGlobalSettings = useAppStore((s) => s.updateGlobalSettings)

  const club = clubs[playerClubId]
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

  // ---- Handlers ----

  const handleAssign = useCallback(
    (slot: string, playerId: string) => {
      if (!lineupSlotSet.has(slot)) return
      setLineupDraft((prevDraft) => {
        const prev = prevDraft ?? selectedLineup ?? {}
        const next = { ...prev }
        // Remove player from any other position first
        for (const [k, v] of Object.entries(next)) {
          if (v === playerId) delete next[k]
        }
        // If the target slot already has a player, remove that assignment
        // (the old occupant goes back to the bench)
        next[slot] = playerId
        return next
      })
    },
    [lineupSlotSet, selectedLineup],
  )

  const handleSwap = useCallback(
    (slotA: string, slotB: string) => {
      if (!lineupSlotSet.has(slotA) || !lineupSlotSet.has(slotB)) return
      setLineupDraft((prevDraft) => {
        const prev = prevDraft ?? selectedLineup ?? {}
        const next = { ...prev }
        const playerA = next[slotA]
        const playerB = next[slotB]
        if (playerA) next[slotB] = playerA
        else delete next[slotB]
        if (playerB) next[slotA] = playerB
        else delete next[slotA]
        return next
      })
    },
    [lineupSlotSet, selectedLineup],
  )

  const handleUnassign = useCallback(
    (slot: string) => {
      setLineupDraft((prevDraft) => {
        const prev = prevDraft ?? selectedLineup ?? {}
        const next = { ...prev }
        delete next[slot]
        return next
      })
    },
    [selectedLineup],
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
    setLineupDraft(
      sanitizeLineup(result.lineup, players, playerClubId, lineupSlotSet),
    )
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
  }, [])

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
    if (!window.confirm(`Delete saved lineup "${entry.name}"?`)) return
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
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
          {activePresetDescription && (
            <p className="text-[11px] text-muted-foreground">{activePresetDescription}</p>
          )}
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
          <div className="flex items-center gap-1 rounded-md border border-border/70 px-2 py-1">
            <span className="text-[11px] text-muted-foreground">Preset</span>
            <Select
              value={activePresetId}
              onValueChange={handleSelectAutofillPreset}
            >
              <SelectTrigger className="h-8 w-[210px]">
                <SelectValue placeholder="Select autofill preset" />
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
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border/70 px-2 py-1">
            <span className="text-[11px] text-muted-foreground">Preserve</span>
            <Select
              value={String(lineupAutofillSettings.preserveAssignments)}
              onValueChange={handleSetPreserveAssignments}
            >
              <SelectTrigger className="h-8 w-[96px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Off</SelectItem>
                <SelectItem value="true">On</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border/70 px-2 py-1">
            <span className="text-[11px] text-muted-foreground">Continuity</span>
            <Select
              value={CONTINUITY_LEVELS.find((level) => level.value === lineupAutofillSettings.continuityBias)?.id ?? 'medium'}
              onValueChange={handleSetContinuityBias}
            >
              <SelectTrigger className="h-8 w-[104px]">
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
          <Button variant="outline" size="sm" onClick={handleSaveCustomPreset}>
            <BookmarkPlus className="mr-1 h-4 w-4" />
            Save Custom
          </Button>
          {resolvedPreset.customPreset && (
            <Button variant="outline" size="sm" onClick={handleDeleteCustomPreset}>
              <Trash2 className="mr-1 h-4 w-4" />
              Delete Custom
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleClear}>
            <RotateCcw className="mr-1 h-4 w-4" />
            Clear
          </Button>
          <Button variant="secondary" size="sm" onClick={handleAutoFill}>
            <Wand2 className="mr-1 h-4 w-4" />
            Auto Fill
          </Button>
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
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          {saveFeedback}
        </div>
      )}

      {/* Main layout: Field (left ~70%) + Bench panel (right ~30%) */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Football field */}
        <div className="lg:w-[70%] w-full relative">
          <div className="relative">
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
          </div>
        </div>

        {/* Available players panel */}
        <div
          className="lg:w-[30%] w-full"
          onDragOver={handlePanelDragOver}
          onDrop={handlePanelDrop}
        >
          <Card className="h-full">
            <CardHeader className="py-3 space-y-2">
              <CardTitle className="text-sm">
                Available Players ({benchPlayers.length})
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Position numbers are overall rating at that position. FIT% is current match fitness.
              </p>
              <div className="space-y-1">
                <div className="flex gap-1 flex-wrap">
                  <Button
                    size="sm"
                    variant={fitView === 'slot-fit' ? 'default' : 'outline'}
                    className="h-6 px-2 text-xs"
                    onClick={() => setFitView('slot-fit')}
                  >
                    Slot Fit View
                  </Button>
                  <Button
                    size="sm"
                    variant={fitView === 'standard' ? 'default' : 'outline'}
                    className="h-6 px-2 text-xs"
                    onClick={() => setFitView('standard')}
                  >
                    Standard View
                  </Button>
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
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-280px)]">
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
                          <span className="text-sm truncate">
                            {p.firstName.charAt(0)}. {p.lastName}
                          </span>
                          {isRecentlyReturned(p) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="shrink-0">
                                  <Stethoscope className="h-3 w-3 text-amber-500" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">
                                {(() => {
                                  const last = [...(p.injuryHistory ?? [])].reverse()[0]
                                  return last
                                    ? `Returned from ${last.type} (${last.initialWeeks}w, ${last.gamesMissed ?? 0} gm missed)`
                                    : 'Recently returned from injury'
                                })()}
                              </TooltipContent>
                            </Tooltip>
                          )}
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
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleDeleteSavedLineup(entry)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Delete
                        </Button>
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

