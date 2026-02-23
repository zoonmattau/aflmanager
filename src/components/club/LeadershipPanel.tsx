/**
 * LeadershipPanel
 *
 * Displays the current club captain, vice-captain, and leadership group.
 * Allows reassignment with a confirmation dialog that previews the consequences.
 * Read-only when viewing another club.
 */

import { useState, useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { ClubLeadership } from '@/types/club'
import type { Player } from '@/types/player'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Shield, Star, Users, AlertTriangle, ChevronDown, X, Check, Bot, UserCheck } from 'lucide-react'
import { getLeadershipScore } from '@/engine/leadership/leadershipEngine'
import { computeLeadershipChangeConsequences, computeLeadershipStabilityPct } from '@/engine/leadership/leadershipChangeEngine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function leadershipScoreColor(score: number): string {
  if (score >= 75) return 'text-green-600 dark:text-green-400'
  if (score >= 55) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-muted-foreground'
}

function stabilityBarColor(pct: number): string {
  if (pct >= 70) return 'bg-green-500'
  if (pct >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

function PersonalityPip({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-1">
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-[10px] text-muted-foreground">{label} {value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PlayerPickerDropdown — simple searchable single-select using Popover pattern
// ---------------------------------------------------------------------------

interface PlayerPickerProps {
  players: Player[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  placeholder: string
  disabled?: boolean
  excludeIds?: string[]
  allowClear?: boolean
}

function PlayerPickerDropdown({
  players,
  selectedId,
  onSelect,
  placeholder,
  disabled,
  excludeIds = [],
  allowClear = false,
}: PlayerPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedPlayer = players.find((p) => p.id === selectedId)

  const availablePlayers = useMemo(() => {
    const q = search.toLowerCase()
    return players
      .filter((p) => (!excludeIds.includes(p.id) || p.id === selectedId))
      .filter((p) => !q || `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
      .sort((a, b) => getLeadershipScore(b) - getLeadershipScore(a))
  }, [players, excludeIds, selectedId, search])

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch('') }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selectedPlayer
            ? `${selectedPlayer.firstName} ${selectedPlayer.lastName}`
            : placeholder}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="start">
        <Input
          placeholder="Search players…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 mb-2"
          autoFocus
        />
        <ScrollArea className="h-48">
          <div className="space-y-0.5">
            {allowClear && selectedId && (
              <button
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors italic"
                onClick={() => { onSelect(null); setOpen(false); setSearch('') }}
              >
                <X className="h-3 w-3" />
                Clear selection
              </button>
            )}
            {availablePlayers.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">No players found.</p>
            )}
            {availablePlayers.map((p) => {
              const score = getLeadershipScore(p)
              const isSelected = p.id === selectedId
              return (
                <button
                  key={p.id}
                  className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent ${isSelected ? 'bg-accent' : ''}`}
                  onClick={() => { onSelect(p.id); setOpen(false); setSearch('') }}
                >
                  <Check className={`h-3 w-3 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                  <div className="flex flex-1 items-center justify-between min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{p.firstName} {p.lastName}</p>
                      <p className="text-[10px] text-muted-foreground">{p.position.primary} · Age {p.age}</p>
                    </div>
                    <Badge variant="outline" className={`ml-2 text-[10px] shrink-0 ${leadershipScoreColor(score)}`}>
                      {Math.round(score)}
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// LeadershipGroupPicker — multi-select via DropdownMenu checkboxes
// ---------------------------------------------------------------------------

interface GroupPickerProps {
  players: Player[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  excludeIds?: string[]
  disabled?: boolean
  maxSize?: number
}

function LeadershipGroupPicker({
  players,
  selectedIds,
  onChange,
  excludeIds = [],
  disabled,
  maxSize = 6,
}: GroupPickerProps) {
  const availablePlayers = useMemo(
    () =>
      players
        .filter((p) => !excludeIds.includes(p.id))
        .sort((a, b) => getLeadershipScore(b) - getLeadershipScore(a)),
    [players, excludeIds],
  )

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else if (selectedIds.length < maxSize) {
      onChange([...selectedIds, id])
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {selectedIds.map((id) => {
          const p = players.find((x) => x.id === id)
          if (!p) return null
          return (
            <Badge key={id} variant="secondary" className="flex items-center gap-1 pr-1.5">
              {p.firstName} {p.lastName}
              {!disabled && (
                <button
                  onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                  className="ml-0.5 rounded-sm opacity-60 hover:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </Badge>
          )
        })}
        {selectedIds.length === 0 && (
          <span className="text-xs text-muted-foreground self-center">No members selected</span>
        )}
      </div>
      {!disabled && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs">
              <Users className="mr-1 h-3 w-3" />
              Edit Group ({selectedIds.length}/{maxSize})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 max-h-72 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">Select up to {maxSize} leaders</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availablePlayers.map((p) => {
              const isSelected = selectedIds.includes(p.id)
              const isDisabled = !isSelected && selectedIds.length >= maxSize
              return (
                <DropdownMenuCheckboxItem
                  key={p.id}
                  checked={isSelected}
                  disabled={isDisabled}
                  onCheckedChange={() => toggle(p.id)}
                  className="text-sm"
                >
                  <div className="flex flex-1 items-center justify-between min-w-0">
                    <span className="truncate">{p.firstName} {p.lastName}</span>
                    <Badge variant="outline" className="ml-2 text-[10px] shrink-0">
                      {Math.round(getLeadershipScore(p))}
                    </Badge>
                  </div>
                </DropdownMenuCheckboxItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PlayerLeaderCard — shows assigned leader with personality info
// ---------------------------------------------------------------------------

function PlayerLeaderCard({
  player,
  role,
  roleIcon,
}: {
  player: Player | null
  role: string
  roleIcon: React.ReactNode
}) {
  if (!player) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed p-3">
        {roleIcon}
        <div>
          <p className="text-xs text-muted-foreground">{role}</p>
          <p className="text-sm text-muted-foreground italic">Unassigned</p>
        </div>
      </div>
    )
  }

  const score = getLeadershipScore(player)

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-3">
        {roleIcon}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{role}</p>
          <p className="font-semibold text-sm truncate">
            {player.firstName} {player.lastName}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {player.position.primary} · Age {player.age} · {player.careerStats.gamesPlayed} games
          </p>
        </div>
        <Badge variant="outline" className={`text-sm font-bold ${leadershipScoreColor(score)}`}>
          {Math.round(score)}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <PersonalityPip label="Amb" value={player.personality.ambition} />
        <PersonalityPip label="Loy" value={player.personality.loyalty} />
        <PersonalityPip label="Pro" value={player.personality.professionalism} />
        <PersonalityPip label="Tmp" value={player.personality.temperament} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LeadershipPanelProps {
  clubId: string
  readOnly?: boolean
}

export function LeadershipPanel({ clubId, readOnly = false }: LeadershipPanelProps) {
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const ladder = useGameStore((s) => s.ladder)
  const currentRound = useGameStore((s) => s.currentRound)
  const settings = useGameStore((s) => s.settings)
  const leadershipDisruptions = useGameStore((s) => s.leadershipDisruptions)
  const applyLeadershipChange = useGameStore((s) => s.applyLeadershipChange)
  const setLeadershipDelegated = useGameStore((s) => s.setLeadershipDelegated)

  const club = clubs[clubId]
  const leadership = club?.leadership

  // Draft state — mirrors leadership until user hits "Review Changes"
  const [draftCaptain, setDraftCaptain] = useState<string | null>(leadership?.captainId ?? null)
  const [draftVC, setDraftVC] = useState<string | null>(leadership?.viceCaptainId ?? null)
  const [draftGroup, setDraftGroup] = useState<string[]>(leadership?.leadershipGroupIds ?? [])

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false)

  const clubPlayers = useMemo(
    () => Object.values(players).filter((p) => p.clubId === clubId),
    [players, clubId],
  )

  const activeDisruption = leadershipDisruptions[clubId]
  const stabilityPct = activeDisruption
    ? computeLeadershipStabilityPct(
        activeDisruption.disruptionLevel,
        activeDisruption.roundsRemaining,
        activeDisruption.roundsToRecover,
      )
    : 100

  const captainPlayer = draftCaptain ? (players[draftCaptain] ?? null) : null
  const vcPlayer = draftVC ? (players[draftVC] ?? null) : null

  // IDs locked out of sibling pickers
  const captainExcludes = useMemo(
    () => [draftVC, ...draftGroup].filter(Boolean) as string[],
    [draftVC, draftGroup],
  )
  const vcExcludes = useMemo(
    () => [draftCaptain, ...draftGroup].filter(Boolean) as string[],
    [draftCaptain, draftGroup],
  )
  const groupExcludes = useMemo(
    () => [draftCaptain, draftVC].filter(Boolean) as string[],
    [draftCaptain, draftVC],
  )

  // Preview consequences for dialog
  const previewConsequences = useMemo(() => {
    if (!club || !leadership) return null
    const totalRounds = settings.seasonStructure.regularSeasonRounds
    const isPreseason = currentRound === 0
    const isFinals = currentRound > totalRounds
    return computeLeadershipChangeConsequences({
      clubId,
      previousLeadership: leadership,
      newLeadership: {
        captainId: draftCaptain,
        viceCaptainId: draftVC,
        leadershipGroupIds: draftGroup,
      },
      players,
      club,
      currentDate: new Date().toISOString().slice(0, 10),
      currentRound,
      totalRounds,
      isPreseason,
      isFinals,
      ladder,
    })
  }, [club, leadership, draftCaptain, draftVC, draftGroup, players, clubId, currentRound, settings.seasonStructure.regularSeasonRounds, ladder])

  const isDirty = useMemo(() => {
    if (!leadership) return false
    return (
      draftCaptain !== leadership.captainId ||
      draftVC !== leadership.viceCaptainId ||
      JSON.stringify([...draftGroup].sort()) !== JSON.stringify([...leadership.leadershipGroupIds].sort())
    )
  }, [draftCaptain, draftVC, draftGroup, leadership])

  function handleReset() {
    setDraftCaptain(leadership?.captainId ?? null)
    setDraftVC(leadership?.viceCaptainId ?? null)
    setDraftGroup(leadership?.leadershipGroupIds ?? [])
  }

  function handleConfirm() {
    const newLeadership: ClubLeadership = {
      captainId: draftCaptain,
      viceCaptainId: draftVC,
      leadershipGroupIds: draftGroup,
    }
    applyLeadershipChange(clubId, newLeadership)
    setConfirmOpen(false)
  }

  if (!club || !leadership) return null

  const isDelegated = leadership.delegated ?? false

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Active disruption alert                                             */}
      {/* ------------------------------------------------------------------ */}
      {activeDisruption && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Leadership adjustment in progress
              </p>
              <span className="text-sm font-bold tabular-nums">
                {stabilityPct}% stable
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${stabilityBarColor(stabilityPct)}`}
                style={{ width: `${stabilityPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {activeDisruption.roundsRemaining} round{activeDisruption.roundsRemaining !== 1 ? 's' : ''} remaining ·{' '}
              {activeDisruption.changeType === 'captain' ? 'Captaincy change'
                : activeDisruption.changeType === 'vice-captain' ? 'Vice-captaincy change'
                : activeDisruption.changeType === 'both' ? 'Full leadership change'
                : 'Leadership group change'}
              {activeDisruption.outgoingCaptainName && ` — ${activeDisruption.outgoingCaptainName} stepped aside`}
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Current leaders display                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PlayerLeaderCard
          player={captainPlayer}
          role="Captain"
          roleIcon={<Shield className="h-5 w-5 text-yellow-500 shrink-0" />}
        />
        <PlayerLeaderCard
          player={vcPlayer}
          role="Vice-Captain"
          roleIcon={<Star className="h-5 w-5 text-blue-500 shrink-0" />}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Editor (own club only)                                              */}
      {/* ------------------------------------------------------------------ */}
      {!readOnly && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm">
                  {isDelegated ? 'Staff-managed Leadership' : 'Reassign Leadership'}
                </CardTitle>
                <CardDescription>
                  {isDelegated
                    ? 'Your assistant coach is managing captaincy and leadership selection.'
                    : 'Changes trigger morale and cohesion effects. Review consequences before applying.'}
                </CardDescription>
              </div>
              {isDelegated ? (
                <Badge className="bg-sky-500/20 text-sky-600 border-sky-500/30 text-xs flex items-center gap-1 shrink-0 mt-0.5">
                  <Bot className="h-3 w-3" />
                  Delegated
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isDelegated ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Staff will automatically pick the best available captain, vice-captain, and leadership group based on player leadership scores.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLeadershipDelegated(clubId, false)}
                >
                  <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                  Take Control
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Captain</p>
                  <PlayerPickerDropdown
                    players={clubPlayers}
                    selectedId={draftCaptain}
                    onSelect={setDraftCaptain}
                    placeholder="Select captain…"
                    excludeIds={captainExcludes}
                    allowClear
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vice-Captain</p>
                  <PlayerPickerDropdown
                    players={clubPlayers}
                    selectedId={draftVC}
                    onSelect={setDraftVC}
                    placeholder="Select vice-captain…"
                    excludeIds={vcExcludes}
                    allowClear
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Leadership Group (up to 6)
                  </p>
                  <LeadershipGroupPicker
                    players={clubPlayers}
                    selectedIds={draftGroup}
                    onChange={setDraftGroup}
                    excludeIds={groupExcludes}
                    maxSize={6}
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" disabled={!isDirty} onClick={handleReset}>
                    Reset
                  </Button>
                  <Button size="sm" disabled={!isDirty} onClick={() => setConfirmOpen(true)}>
                    Review Changes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-muted-foreground"
                    onClick={() => setLeadershipDelegated(clubId, true)}
                  >
                    <Bot className="mr-1.5 h-3.5 w-3.5" />
                    Delegate to Staff
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Leadership group members (current, from saved leadership)           */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Leadership Group
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leadership.leadershipGroupIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No additional leaders nominated.</p>
          ) : (
            <div className="space-y-2">
              {leadership.leadershipGroupIds.map((id) => {
                const p = players[id]
                if (!p) return null
                const score = getLeadershipScore(p)
                return (
                  <div key={id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{p.firstName} {p.lastName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {p.position.primary} · Age {p.age} · {p.careerStats.gamesPlayed} games
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-xs ${leadershipScoreColor(score)}`}>
                      {Math.round(score)}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Confirmation dialog                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Leadership Change</DialogTitle>
            <DialogDescription>
              Review the expected consequences before applying these changes.
            </DialogDescription>
          </DialogHeader>

          {previewConsequences && (
            <div className="space-y-3">
              {/* Change summary */}
              <div className="rounded-lg border p-3 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change Summary</p>
                {draftCaptain !== leadership.captainId && (
                  <p className="text-sm">
                    Captain:{' '}
                    <span className="text-muted-foreground">
                      {leadership.captainId
                        ? `${players[leadership.captainId]?.firstName} ${players[leadership.captainId]?.lastName}`
                        : 'None'}
                    </span>
                    {' '}&rarr;{' '}
                    <span className="font-medium">
                      {draftCaptain
                        ? `${players[draftCaptain]?.firstName} ${players[draftCaptain]?.lastName}`
                        : 'None'}
                    </span>
                  </p>
                )}
                {draftVC !== leadership.viceCaptainId && (
                  <p className="text-sm">
                    Vice-Captain:{' '}
                    <span className="text-muted-foreground">
                      {leadership.viceCaptainId
                        ? `${players[leadership.viceCaptainId]?.firstName} ${players[leadership.viceCaptainId]?.lastName}`
                        : 'None'}
                    </span>
                    {' '}&rarr;{' '}
                    <span className="font-medium">
                      {draftVC
                        ? `${players[draftVC]?.firstName} ${players[draftVC]?.lastName}`
                        : 'None'}
                    </span>
                  </p>
                )}
              </div>

              {/* Impact preview */}
              <div className={`rounded-lg border p-3 space-y-1.5 ${
                previewConsequences.disruptionLevel >= 60
                  ? 'border-red-500/30 bg-red-500/5'
                  : previewConsequences.disruptionLevel >= 30
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-green-500/30 bg-green-500/5'
              }`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Disruption Level
                  </p>
                  <Badge
                    variant={
                      previewConsequences.disruptionLevel >= 60 ? 'destructive'
                      : previewConsequences.disruptionLevel >= 30 ? 'secondary'
                      : 'default'
                    }
                    className="text-xs"
                  >
                    {previewConsequences.disruptionLevel}/100
                  </Badge>
                </div>
                {previewConsequences.previewLines.map((line, i) => (
                  <p key={i} className="text-xs text-muted-foreground">· {line}</p>
                ))}
              </div>

              {previewConsequences.roundsToRecover > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    On-field cohesion penalty for {previewConsequences.roundsToRecover} rounds — affects
                    match performance, free kick discipline, and late-game composure.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={previewConsequences && previewConsequences.disruptionLevel >= 60 ? 'destructive' : 'default'}
              onClick={handleConfirm}
            >
              Apply Leadership Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
