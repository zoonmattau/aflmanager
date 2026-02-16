import { useState, useMemo, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Wand2, RotateCcw, Save, Eye, EyeOff } from 'lucide-react'
import type { Player } from '@/types/player'
import { getLineupSlots } from '@/engine/core/constants'
import { selectBestLineup } from '@/engine/ai/lineupSelection'
import { FootballField } from '@/components/lineup/FootballField'
import { isPlayerSuspended } from '@/engine/players/availability'
import { getOverallRating, getPlayerStarRating } from '@/engine/player/playerRating'
import {
  getPlayerEligiblePositionTypes,
  isPlayerEligibleForPositionLine,
} from '@/engine/player/positionEligibility'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PositionFilter = 'ALL' | 'DEF' | 'MID' | 'FWD' | 'RK'

const FILTER_OPTIONS: { value: PositionFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DEF', label: 'Def' },
  { value: 'MID', label: 'Mid' },
  { value: 'FWD', label: 'Fwd' },
  { value: 'RK', label: 'Ruck' },
]

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
    if (player.injury || isPlayerSuspended(player) || player.fitness < 50) continue
    next[slot] = playerId
    seen.add(playerId)
  }
  return next
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LineupPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const setSelectedLineup = useGameStore((s) => s.setSelectedLineup)
  const season = useGameStore((s) => s.season)
  const currentRound = useGameStore((s) => s.currentRound)
  const settings = useGameStore((s) => s.settings)

  const club = clubs[playerClubId]

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
        .filter((p) => p.clubId === playerClubId && !p.injury && !isPlayerSuspended(p) && p.fitness >= 50)
        .sort((a, b) => getOverallRating(b) - getOverallRating(a)),
    [players, playerClubId],
  )

  const unavailablePlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId)
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
  const [showOpposition, setShowOpposition] = useState(false)

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
    const result = selectBestLineup(availablePlayers, playerClubId)
    setLineupDraft(
      sanitizeLineup(result.lineup, players, playerClubId, lineupSlotSet),
    )
  }, [availablePlayers, playerClubId, players, lineupSlotSet])

  const handleSave = useCallback(() => {
    setSelectedLineup(safeLineup)
    setLineupDraft(safeLineup)
  }, [safeLineup, setSelectedLineup])

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
    (e: React.DragEvent<HTMLDivElement>, playerId: string) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('application/x-player-id', playerId)
    },
    [],
  )

  const filledCount = Object.keys(safeLineup).length

  // Filter unassigned players for the bench panel
  const benchPlayers = useMemo(
    () =>
      availablePlayers.filter(
        (p) => !assignedPlayerIds.has(p.id) && matchesFilter(p, posFilter),
      ),
    [availablePlayers, assignedPlayerIds, posFilter],
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
        </div>
        <div className="flex gap-2 flex-wrap">
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
          <Button variant="secondary" size="sm" onClick={handleAutoFill}>
            <Wand2 className="mr-1 h-4 w-4" />
            Auto Fill
          </Button>
          <Button size="sm" onClick={handleSave} disabled={filledCount < requiredCount}>
            <Save className="mr-1 h-4 w-4" />
            Save Lineup
          </Button>
        </div>
      </div>

      {/* Main layout: Field (left ~70%) + Bench panel (right ~30%) */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Football field */}
        <div className="lg:w-[70%] w-full relative">
          <div className="relative">
            <FootballField
              lineup={safeLineup}
              players={players}
              clubs={clubs}
              interchangeCount={settings.matchRules.interchangePlayers}
              oppositionClubId={oppositionClubId}
              showOpposition={showOpposition}
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
              {/* Position filter buttons */}
              <div className="flex gap-1 flex-wrap">
                {FILTER_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={posFilter === opt.value ? 'default' : 'outline'}
                    className="h-6 px-2 text-xs"
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
                      onDragStart={(e) => handleBenchDragStart(e, p.id)}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors border border-transparent hover:border-zinc-700"
                    >
                      <span className="text-xs font-bold text-zinc-400 w-5 text-right">
                        #{p.jerseyNumber}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm truncate block">
                          {p.firstName.charAt(0)}. {p.lastName}
                        </span>
                        <PlayerStarRating
                          stars={getPlayerStarRating(p)}
                          className="scale-[0.8] origin-left"
                        />
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0"
                        title={getPlayerEligiblePositionTypes(p).join(', ')}
                      >
                        {p.position.primary}
                      </Badge>
                      <span className="text-xs text-muted-foreground w-7 text-right">
                        {getOverallRating(p)}
                      </span>
                      <span className="text-xs text-muted-foreground w-7 text-right">
                        {p.fitness}%
                      </span>
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
                          <Badge variant="outline" className="text-[10px] border-red-500/30 bg-red-500/15 text-red-600">
                            {p.injury.type} ({p.injury.weeksRemaining}w)
                          </Badge>
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
    </div>
  )
}
