/**
 * TeamSelectionPage (/team-selection)
 *
 * Lets the manager assign every squad player a weekly role:
 *   - Lineup  : selected for AFL match
 *   - Reserves: available for VFL/state-league game
 *   - Resting : not playing this week
 */

import { useMemo, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { getOverallRating } from '@/engine/player/playerRating'
import { isAflListedPlayer } from '@/engine/players/contracts'
import { isPlayerSuspended } from '@/engine/players/availability'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Wand2, Search, ChevronDown, ChevronUp } from 'lucide-react'
import type { Player } from '@/types/player'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'lineup' | 'reserves' | 'rest'

const ROLE_LABELS: Record<Role, string> = {
  lineup:   'Lineup',
  reserves: 'Reserves',
  rest:     'Resting',
}

const ROLE_COLORS: Record<Role, string> = {
  lineup:   'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  reserves: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
  rest:     'bg-muted text-muted-foreground border-border',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unavailableReason(player: Player): string | null {
  if (player.injury) return 'Injured'
  if (isPlayerSuspended(player)) return 'Suspended'
  if (player.fitness < 50) return 'Low Fitness'
  return null
}

type SortKey = 'name' | 'rating' | 'position' | 'role'
type SortDir = 'asc' | 'desc'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TeamSelectionPage() {
  const players          = useGameStore((s) => s.players)
  const playerClubId     = useGameStore((s) => s.playerClubId)
  const weeklySquadRoles = useGameStore((s) => s.weeklySquadRoles)
  const setWeeklySquadRole        = useGameStore((s) => s.setWeeklySquadRole)
  const autoAssignWeeklySquadRoles = useGameStore((s) => s.autoAssignWeeklySquadRoles)

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('rating')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const clubPlayers = useMemo(() => {
    return Object.values(players).filter(
      (p) => p.clubId === playerClubId && isAflListedPlayer(p),
    )
  }, [players, playerClubId])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return clubPlayers.filter((p) => {
      if (!q) return true
      return (
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        p.position.primary.toLowerCase().includes(q)
      )
    })
  }, [clubPlayers, search])

  const sorted = useMemo(() => {
    const roleOrder: Record<Role, number> = { lineup: 0, reserves: 1, rest: 2 }
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)
          break
        case 'rating':
          cmp = getOverallRating(a) - getOverallRating(b)
          break
        case 'position':
          cmp = a.position.primary.localeCompare(b.position.primary)
          break
        case 'role': {
          const ra = weeklySquadRoles[a.id] ?? 'reserves'
          const rb = weeklySquadRoles[b.id] ?? 'reserves'
          cmp = roleOrder[ra] - roleOrder[rb]
          break
        }
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir, weeklySquadRoles])

  // Counts for summary
  const counts = useMemo(() => {
    let lineup = 0, reserves = 0, rest = 0, unset = 0
    for (const p of clubPlayers) {
      const r = weeklySquadRoles[p.id]
      if (!r) unset++
      else if (r === 'lineup') lineup++
      else if (r === 'reserves') reserves++
      else rest++
    }
    return { lineup, reserves, rest, unset }
  }, [clubPlayers, weeklySquadRoles])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'position' ? 'asc' : 'desc')
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (
      sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
    ) : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Team Selection</h1>
          <p className="text-sm text-muted-foreground">
            Assign each player's role for this week's game program.
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={autoAssignWeeklySquadRoles}
            className="gap-1.5"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Auto-assign
          </Button>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2 text-sm">
        {(['lineup', 'reserves', 'rest'] as Role[]).map((role) => (
          <span
            key={role}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-medium ${ROLE_COLORS[role]}`}
          >
            {ROLE_LABELS[role]}
            <span className="font-bold">{counts[role]}</span>
          </span>
        ))}
        {counts.unset > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            Unassigned
            <span className="font-bold">{counts.unset}</span>
          </span>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players…"
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th
                className="px-3 py-2 text-left font-medium cursor-pointer hover:text-foreground select-none"
                onClick={() => toggleSort('name')}
              >
                <span className="inline-flex items-center gap-1">
                  Player <SortIcon col="name" />
                </span>
              </th>
              <th
                className="px-3 py-2 text-center font-medium cursor-pointer hover:text-foreground select-none w-16"
                onClick={() => toggleSort('position')}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  Pos <SortIcon col="position" />
                </span>
              </th>
              <th
                className="px-3 py-2 text-center font-medium cursor-pointer hover:text-foreground select-none w-16"
                onClick={() => toggleSort('rating')}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  OVR <SortIcon col="rating" />
                </span>
              </th>
              <th className="px-3 py-2 text-center font-medium w-24">Fitness</th>
              <th
                className="px-3 py-2 text-left font-medium cursor-pointer hover:text-foreground select-none"
                onClick={() => toggleSort('role')}
              >
                <span className="inline-flex items-center gap-1">
                  Role <SortIcon col="role" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((player) => {
              const role = weeklySquadRoles[player.id] as Role | undefined
              const reason = unavailableReason(player)
              const ovr = getOverallRating(player)
              const isUnavailable = Boolean(reason)

              return (
                <tr
                  key={player.id}
                  className={`border-b last:border-0 transition-colors ${isUnavailable ? 'opacity-60' : 'hover:bg-muted/30'}`}
                >
                  {/* Name */}
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {player.firstName} {player.lastName}
                    </div>
                    {reason && (
                      <div className="text-xs text-destructive">{reason}</div>
                    )}
                    {player.isRookie && !reason && (
                      <div className="text-xs text-muted-foreground">Rookie</div>
                    )}
                  </td>

                  {/* Position */}
                  <td className="px-3 py-2 text-center">
                    <Badge variant="outline" className="text-[10px] px-1.5">
                      {player.position.primary}
                    </Badge>
                  </td>

                  {/* OVR */}
                  <td className="px-3 py-2 text-center font-mono text-sm font-semibold">
                    {ovr}
                  </td>

                  {/* Fitness */}
                  <td className="px-3 py-2 text-center">
                    <FitnessBar value={player.fitness} />
                  </td>

                  {/* Role toggle */}
                  <td className="px-3 py-2">
                    <RoleToggle
                      role={role}
                      disabled={isUnavailable}
                      onChange={(r) => setWeeklySquadRole(player.id, r)}
                    />
                  </td>
                </tr>
              )
            })}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No players found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FitnessBar({ value }: { value: number }) {
  const color =
    value >= 80 ? 'bg-emerald-500' :
    value >= 60 ? 'bg-amber-500' :
    'bg-destructive'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{value}%</span>
    </div>
  )
}

const ROLES: Role[] = ['lineup', 'reserves', 'rest']

function RoleToggle({
  role,
  disabled,
  onChange,
}: {
  role: Role | undefined
  disabled: boolean
  onChange: (role: Role | null) => void
}) {
  return (
    <div className="flex gap-1">
      {ROLES.map((r) => {
        const active = role === r
        return (
          <button
            key={r}
            disabled={disabled}
            onClick={() => onChange(active ? null : r)}
            className={`rounded px-2 py-0.5 text-xs font-medium border transition-colors
              ${disabled
                ? 'opacity-40 cursor-not-allowed border-border text-muted-foreground'
                : active
                  ? `${ROLE_COLORS[r]} cursor-pointer`
                  : 'border-border text-muted-foreground hover:border-muted-foreground cursor-pointer'
              }`}
          >
            {ROLE_LABELS[r]}
          </button>
        )
      })}
    </div>
  )
}
