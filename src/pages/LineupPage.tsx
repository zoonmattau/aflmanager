import { useState, useMemo, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Wand2, RotateCcw, Save, Eye, EyeOff } from 'lucide-react'
import type { Player } from '@/types/player'
import { POSITION_LINE } from '@/engine/core/constants'
import { selectBestLineup } from '@/engine/ai/lineupSelection'
import { FootballField } from '@/components/lineup/FootballField'
import { OppositionOverlay } from '@/components/lineup/OppositionOverlay'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPlayerOverall(p: Player): number {
  const a = p.attributes
  return Math.round(
    (a.kickingEfficiency +
      a.handballEfficiency +
      a.markingOverhead +
      a.speed +
      a.endurance +
      a.strength +
      a.tackling +
      a.disposalDecision +
      a.positioning +
      a.contested +
      a.workRate +
      a.pressure) /
      12,
  )
}

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
  const line = POSITION_LINE[player.position.primary]
  return line === filter
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
        .filter((p) => p.clubId === playerClubId && !p.injury && p.fitness >= 50)
        .sort((a, b) => getPlayerOverall(b) - getPlayerOverall(a)),
    [players, playerClubId],
  )

  const [lineup, setLineup] = useState<Record<string, string>>(
    selectedLineup ?? {},
  )

  const [posFilter, setPosFilter] = useState<PositionFilter>('ALL')
  const [showOpposition, setShowOpposition] = useState(false)

  const assignedPlayerIds = useMemo(
    () => new Set(Object.values(lineup)),
    [lineup],
  )

  // ---- Handlers ----

  const handleAssign = useCallback(
    (slot: string, playerId: string) => {
      setLineup((prev) => {
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
    [],
  )

  const handleSwap = useCallback(
    (slotA: string, slotB: string) => {
      setLineup((prev) => {
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
    [],
  )

  const handleUnassign = useCallback(
    (slot: string) => {
      setLineup((prev) => {
        const next = { ...prev }
        delete next[slot]
        return next
      })
    },
    [],
  )

  const handleAutoFill = useCallback(() => {
    const result = selectBestLineup(availablePlayers, playerClubId)
    setLineup(result.lineup)
  }, [availablePlayers, playerClubId])

  const handleSave = useCallback(() => {
    setSelectedLineup(lineup)
  }, [lineup, setSelectedLineup])

  const handleClear = useCallback(() => {
    setLineup({})
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

  const filledCount = Object.keys(lineup).length

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
            {filledCount}/22 positions filled
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
          <Button size="sm" onClick={handleSave} disabled={filledCount < 22}>
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
              lineup={lineup}
              players={players}
              onAssign={handleAssign}
              onSwap={handleSwap}
              onUnassign={handleUnassign}
            />
            {/* Opposition overlay */}
            {showOpposition && oppositionClubId && (
              <div className="absolute inset-0" style={{ bottom: '72px' }}>
                <div className="relative w-full h-full">
                  <OppositionOverlay
                    oppositionClubId={oppositionClubId}
                    players={players}
                    clubs={clubs}
                  />
                </div>
              </div>
            )}
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
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0"
                      >
                        {p.position.primary}
                      </Badge>
                      <span className="text-xs text-muted-foreground w-7 text-right">
                        {getPlayerOverall(p)}
                      </span>
                      <span className="text-xs text-muted-foreground w-7 text-right">
                        {p.fitness}%
                      </span>
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
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
