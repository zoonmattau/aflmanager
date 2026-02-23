import { useState, useMemo, useCallback, useEffect } from 'react'
import { FootballField } from '@/components/lineup/FootballField'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Target, Zap, X } from 'lucide-react'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type {
  WeeklyMatchupTactics,
  HardTagInstruction,
  PhysicalAttentionInstruction,
  MatchupInstructionIntensity,
} from '@/types/game'
import type { LineupSlot } from '@/types/player'
import { getLineupSlots } from '@/engine/core/constants'
import { getOverallRating } from '@/engine/player/playerRating'
import { getPositionBadgeClass } from '@/lib/positionColor'
import { canBeSelectedForAfl } from '@/engine/players/contracts'
import { isPlayerSuspended } from '@/engine/players/availability'

const EMPTY_TACTICS: WeeklyMatchupTactics = { hardTags: [], physicalAttention: [], roleAssignments: [] }

const INTENSITY_OPTIONS: { value: MatchupInstructionIntensity; label: string; color: string }[] = [
  { value: 'light', label: 'Light', color: 'text-sky-500' },
  { value: 'standard', label: 'Standard', color: 'text-amber-500' },
  { value: 'hard', label: 'Hard', color: 'text-red-500' },
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

export interface PreMatchLineupEditorProps {
  lineup: Record<string, string>
  players: Record<string, Player>
  clubs: Record<string, Club>
  userClubId: string
  interchangeCount: number
  oppositionClubId: string
  onLineupChange: (lineup: Record<string, string>) => void
  matchupTactics?: WeeklyMatchupTactics | null
  onMatchupTacticsChange?: (tactics: WeeklyMatchupTactics) => void
}

export function PreMatchLineupEditor({
  lineup,
  players,
  clubs,
  userClubId,
  interchangeCount,
  oppositionClubId,
  onLineupChange,
  matchupTactics,
  onMatchupTacticsChange,
}: PreMatchLineupEditorProps) {
  // Optimistic local copy so field updates instantly without waiting for store round-trip
  const [localLineup, setLocalLineup] = useState(lineup)
  useEffect(() => { setLocalLineup(lineup) }, [lineup])

  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)
  // Player-first selection: user picks an unassigned player, then clicks a slot to place them
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null)

  const tactics = matchupTactics ?? EMPTY_TACTICS

  const lineupSlotSet = useMemo(
    () => new Set(getLineupSlots(Math.max(0, Math.min(8, interchangeCount)))),
    [interchangeCount],
  )

  const playerSlotMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const [slot, pid] of Object.entries(localLineup)) {
      if (pid) map.set(pid, slot)
    }
    return map
  }, [localLineup])

  const clubPlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === userClubId)
        .sort((a, b) => getOverallRating(b) - getOverallRating(a)),
    [players, userClubId],
  )

  // Players in lineup (starters + bench) for strategy dropdowns
  const lineupPlayers = useMemo(
    () => clubPlayers.filter((p) => playerSlotMap.has(p.id)),
    [clubPlayers, playerSlotMap],
  )

  const oppositionPlayer = selectedOppId ? (players[selectedOppId] ?? null) : null

  const push = useCallback((next: Record<string, string>) => {
    setLocalLineup(next)
    onLineupChange(next)
  }, [onLineupChange])

  const doSwap = useCallback((slotA: string, slotB: string) => {
    if (!lineupSlotSet.has(slotA as LineupSlot) || !lineupSlotSet.has(slotB as LineupSlot)) return
    const next = { ...localLineup }
    const pA = next[slotA]; const pB = next[slotB]
    if (pA) next[slotB] = pA; else delete next[slotB]
    if (pB) next[slotA] = pB; else delete next[slotA]
    push(next)
  }, [localLineup, lineupSlotSet, push])

  const doAssign = useCallback((slot: string, playerId: string) => {
    if (!lineupSlotSet.has(slot as LineupSlot)) return
    const next = { ...localLineup }
    for (const [k, v] of Object.entries(next)) { if (v === playerId) delete next[k] }
    next[slot] = playerId
    push(next)
  }, [localLineup, lineupSlotSet, push])

  const handleSelectSlot = useCallback((slot: string) => {
    setSelectedOppId(null)
    // If a player is held (player-first flow), assign them to this slot
    if (pendingPlayerId) {
      doAssign(slot, pendingPlayerId)
      setPendingPlayerId(null)
      setSelectedSlot(null)
      return
    }
    if (selectedSlot && selectedSlot !== slot) {
      doSwap(selectedSlot, slot)
      setSelectedSlot(null)
    } else {
      setSelectedSlot(selectedSlot === slot ? null : slot)
    }
  }, [selectedSlot, pendingPlayerId, doSwap, doAssign])

  const handleOppositionClick = useCallback((playerId: string) => {
    setSelectedSlot(null)
    setPendingPlayerId(null)
    setSelectedOppId((prev) => prev === playerId ? null : playerId)
  }, [])

  const handlePlayerRowClick = useCallback((playerId: string) => {
    // If an opposition player is focused, clicking a my-player assigns them as tagger
    if (selectedOppId) {
      if (!onMatchupTacticsChange) return
      const existingTag = tactics.hardTags.find((t) => t.targetPlayerId === selectedOppId)
      if (existingTag) {
        onMatchupTacticsChange({
          ...tactics,
          hardTags: tactics.hardTags.map((t) =>
            t.id === existingTag.id ? { ...t, taggerPlayerId: playerId } : t,
          ),
        })
      } else {
        const next: HardTagInstruction = {
          id: crypto.randomUUID(),
          taggerPlayerId: playerId,
          targetPlayerId: selectedOppId,
          intensity: 'standard',
        }
        onMatchupTacticsChange({ ...tactics, hardTags: [...tactics.hardTags, next] })
      }
      return
    }

    const theirSlot = playerSlotMap.get(playerId)

    if (selectedSlot) {
      // Slot already selected — swap or assign into it
      if (theirSlot && theirSlot !== selectedSlot) {
        doSwap(selectedSlot, theirSlot)
      } else if (!theirSlot) {
        doAssign(selectedSlot, playerId)
      }
      setSelectedSlot(null)
      setPendingPlayerId(null)
    } else if (theirSlot) {
      // Assigned player clicked with no slot selected → select their slot (slot-first flow)
      setSelectedSlot(theirSlot)
      setPendingPlayerId(null)
    } else {
      // Unassigned player clicked with no slot selected → hold them (player-first flow)
      setPendingPlayerId((prev) => prev === playerId ? null : playerId)
    }
  }, [selectedOppId, selectedSlot, playerSlotMap, doSwap, doAssign, tactics, onMatchupTacticsChange])

  // ── Tactics helpers ──────────────────────────────────────────────────────────

  const tagForOpp = selectedOppId
    ? tactics.hardTags.find((t) => t.targetPlayerId === selectedOppId) ?? null
    : null
  const physForOpp = selectedOppId
    ? tactics.physicalAttention.find((t) => t.targetPlayerId === selectedOppId) ?? null
    : null

  const setTagTagger = useCallback((taggerId: string) => {
    if (!selectedOppId || !onMatchupTacticsChange) return
    if (taggerId === '__none__') {
      onMatchupTacticsChange({
        ...tactics,
        hardTags: tactics.hardTags.filter((t) => t.targetPlayerId !== selectedOppId),
      })
      return
    }
    if (tagForOpp) {
      onMatchupTacticsChange({
        ...tactics,
        hardTags: tactics.hardTags.map((t) =>
          t.id === tagForOpp.id ? { ...t, taggerPlayerId: taggerId } : t,
        ),
      })
    } else {
      const next: HardTagInstruction = {
        id: crypto.randomUUID(),
        taggerPlayerId: taggerId,
        targetPlayerId: selectedOppId,
        intensity: 'standard',
      }
      onMatchupTacticsChange({ ...tactics, hardTags: [...tactics.hardTags, next] })
    }
  }, [selectedOppId, tactics, tagForOpp, onMatchupTacticsChange])

  const setTagIntensity = useCallback((intensity: MatchupInstructionIntensity) => {
    if (!tagForOpp || !onMatchupTacticsChange) return
    onMatchupTacticsChange({
      ...tactics,
      hardTags: tactics.hardTags.map((t) =>
        t.id === tagForOpp.id ? { ...t, intensity } : t,
      ),
    })
  }, [tactics, tagForOpp, onMatchupTacticsChange])

  const setPhysEnforcer = useCallback((enforcerId: string) => {
    if (!selectedOppId || !onMatchupTacticsChange) return
    if (enforcerId === '__none__') {
      onMatchupTacticsChange({
        ...tactics,
        physicalAttention: tactics.physicalAttention.filter((t) => t.targetPlayerId !== selectedOppId),
      })
      return
    }
    if (physForOpp) {
      onMatchupTacticsChange({
        ...tactics,
        physicalAttention: tactics.physicalAttention.map((t) =>
          t.id === physForOpp.id ? { ...t, enforcerPlayerId: enforcerId } : t,
        ),
      })
    } else {
      const next: PhysicalAttentionInstruction = {
        id: crypto.randomUUID(),
        enforcerPlayerId: enforcerId,
        targetPlayerId: selectedOppId,
        intensity: 'standard',
      }
      onMatchupTacticsChange({ ...tactics, physicalAttention: [...tactics.physicalAttention, next] })
    }
  }, [selectedOppId, tactics, physForOpp, onMatchupTacticsChange])

  const setPhysIntensity = useCallback((intensity: MatchupInstructionIntensity) => {
    if (!physForOpp || !onMatchupTacticsChange) return
    onMatchupTacticsChange({
      ...tactics,
      physicalAttention: tactics.physicalAttention.map((t) =>
        t.id === physForOpp.id ? { ...t, intensity } : t,
      ),
    })
  }, [tactics, physForOpp, onMatchupTacticsChange])

  // ── Right panel ──────────────────────────────────────────────────────────────

  const rightPanel = selectedOppId && oppositionPlayer ? (
    <div className="w-[210px] shrink-0 flex flex-col border border-border rounded-md overflow-hidden">
      {/* Header */}
      <div className="px-2.5 py-2 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs font-semibold truncate">
            #{oppositionPlayer.jerseyNumber} {oppositionPlayer.firstName.charAt(0)}. {oppositionPlayer.lastName}
          </p>
          <button
            type="button"
            onClick={() => setSelectedOppId(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[9px] font-bold px-1 rounded border ${getPositionBadgeClass(oppositionPlayer.position.primary)}`}>
            {oppositionPlayer.position.primary}
          </span>
          <span className="text-[10px] text-muted-foreground">OVR {getOverallRating(oppositionPlayer)}</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2.5 space-y-3">
          {/* Hard Tag */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              <p className="text-[11px] font-semibold">Hard Tag</p>
            </div>
            <Select
              value={tagForOpp?.taggerPlayerId ?? '__none__'}
              onValueChange={setTagTagger}
              disabled={!onMatchupTacticsChange}
            >
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder="No tagger assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-[11px]">None</SelectItem>
                {lineupPlayers.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-[11px]">
                    #{p.jerseyNumber} {p.firstName.charAt(0)}. {p.lastName} ({p.position.primary})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tagForOpp && (
              <div className="flex items-center gap-1.5 pl-0.5">
                <span className="text-[10px] text-muted-foreground">Intensity</span>
                <IntensityToggle value={tagForOpp.intensity} onChange={setTagIntensity} />
              </div>
            )}
          </div>

          {/* Physical Pressure */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <p className="text-[11px] font-semibold">Physical Pressure</p>
            </div>
            <Select
              value={physForOpp?.enforcerPlayerId ?? '__none__'}
              onValueChange={setPhysEnforcer}
              disabled={!onMatchupTacticsChange}
            >
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder="No enforcer assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-[11px]">None</SelectItem>
                {lineupPlayers.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-[11px]">
                    #{p.jerseyNumber} {p.firstName.charAt(0)}. {p.lastName} ({p.position.primary})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {physForOpp && (
              <div className="flex items-center gap-1.5 pl-0.5">
                <span className="text-[10px] text-muted-foreground">Intensity</span>
                <IntensityToggle value={physForOpp.intensity} onChange={setPhysIntensity} />
              </div>
            )}
          </div>

          <p className="text-[9px] text-muted-foreground border-t border-border/60 pt-2">
            Or tap one of your players in the squad list to quickly assign as tagger.
          </p>
        </div>
      </ScrollArea>
    </div>
  ) : (
    /* Squad list — unassigned players; those on-field/bench are on the field */
    <div className="w-[190px] shrink-0 flex flex-col border border-border rounded-md overflow-hidden">
      <div className="px-2.5 py-2 border-b border-border bg-muted/30 shrink-0 space-y-0.5">
        <p className="text-xs font-semibold">Not Selected</p>
        <p className="text-[10px] text-muted-foreground">
          {pendingPlayerId
            ? 'Now tap a slot on the field to place them'
            : selectedSlot
              ? `Assigning to ${selectedSlot} — pick a player`
              : 'Tap a player to hold, then tap a slot'}
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-1">
          {clubPlayers.filter((p) => !playerSlotMap.has(p.id)).map((p) => {
            const isPending = p.id === pendingPlayerId
            // Determine why a player can't be selected (mirrors setSelectedLineup logic)
            const ineligibleReason =
              p.injury ? 'INJ'
              : isPlayerSuspended(p) ? 'SUSP'
              : p.fitness < 50 ? `FIT ${p.fitness}`
              : !canBeSelectedForAfl(p) ? 'VFL'
              : null
            const isSelectable = !ineligibleReason
            return (
              <div
                key={p.id}
                draggable={isSelectable}
                onDragStart={isSelectable ? (e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('application/x-player-id', p.id)
                } : undefined}
                onClick={() => isSelectable && handlePlayerRowClick(p.id)}
                className={`flex items-center gap-1.5 rounded px-1.5 py-1 select-none transition-colors text-[11px] border ${
                  !isSelectable
                    ? 'border-transparent opacity-40 cursor-default'
                    : isPending
                      ? 'bg-primary/15 border-primary/50 cursor-grab ring-1 ring-primary/40'
                      : 'border-amber-500/40 bg-amber-500/8 hover:bg-amber-500/15 cursor-grab'
                }`}
              >
                <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0">
                  {p.jerseyNumber}
                </span>
                <span className="flex-1 truncate font-medium">
                  {p.firstName.charAt(0)}. {p.lastName}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                  {getOverallRating(p)}
                </span>
                <span className={`text-[9px] font-bold shrink-0 px-1 rounded border ${
                  ineligibleReason
                    ? 'border-red-500/40 text-red-400'
                    : getPositionBadgeClass(p.position.primary)
                }`}>
                  {ineligibleReason ?? p.position.primary}
                </span>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )

  return (
    <div className="flex gap-3 min-h-0">
      {/* Field — landscape with bench (interchange) slots + opposition */}
      <div className="flex-1 min-w-0">
        <FootballField
          lineup={localLineup}
          players={players}
          clubs={clubs}
          userClubId={userClubId}
          interchangeCount={interchangeCount}
          oppositionClubId={oppositionClubId}
          showOpposition={true}
          selectedSlot={selectedSlot}
          onSelectSlot={handleSelectSlot}
          onSwap={doSwap}
          onAssign={doAssign}
          onUnassign={() => {}}
          onOppositionPlayerClick={handleOppositionClick}
        />
        {pendingPlayerId && !selectedOppId && (() => {
          const pp = players[pendingPlayerId]
          return pp ? (
            <p className="mt-1 text-center text-[11px] text-primary">
              <span className="font-semibold">{pp.firstName.charAt(0)}. {pp.lastName}</span> selected — tap a slot on the field to place them
            </p>
          ) : null
        })()}
        {selectedSlot && !pendingPlayerId && (
          <p className="mt-1 text-center text-[11px] text-primary">
            <span className="font-semibold">{selectedSlot}</span> selected — tap another slot to swap, or a player in the list
          </p>
        )}
        {selectedOppId && oppositionPlayer && (
          <p className="mt-1 text-center text-[11px] text-amber-500">
            Setting strategy for <span className="font-semibold">{oppositionPlayer.firstName.charAt(0)}. {oppositionPlayer.lastName}</span> — tap your player to tag, or use the panel
          </p>
        )}
      </div>

      {rightPanel}
    </div>
  )
}
