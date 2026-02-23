import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useGameStore } from '@/stores/gameStore'
import { useAppStore } from '@/stores/appStore'
import type { ClubLeadership } from '@/types/club'
import type { Player } from '@/types/player'
import type { LeadershipChangeRecord } from '@/types/history'
import { getLeadershipScore, autoSelectLeadership, getTeamLeadershipRating } from '@/engine/leadership/leadershipEngine'
import { computeLeadershipChangeImpact } from '@/engine/leadership/leadershipImpactEngine'
import { getOverallRating } from '@/engine/player/playerRating'
import { getPositionBadgeClass } from '@/lib/positionColor'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { ChevronDown, Shield, Star, Users, TrendingUp, TrendingDown, ChevronRight, Minus, Bot, UserCheck } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LeadershipRole = 'captain' | 'vice-captain' | 'lg' | 'none'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRoleForPlayer(playerId: string, leadership: ClubLeadership): LeadershipRole {
  if (leadership.captainId === playerId) return 'captain'
  if (leadership.viceCaptainId === playerId) return 'vice-captain'
  if (leadership.leadershipGroupIds.includes(playerId)) return 'lg'
  return 'none'
}

function applyRoleChange(
  playerId: string,
  newRole: LeadershipRole,
  current: ClubLeadership,
): ClubLeadership {
  const next: ClubLeadership = {
    captainId: current.captainId,
    viceCaptainId: current.viceCaptainId,
    leadershipGroupIds: [...current.leadershipGroupIds],
  }

  // Remove player from their current role
  if (next.captainId === playerId) next.captainId = null
  if (next.viceCaptainId === playerId) next.viceCaptainId = null
  next.leadershipGroupIds = next.leadershipGroupIds.filter((id) => id !== playerId)

  // Bump displaced player to 'none' if necessary
  if (newRole === 'captain' && next.captainId) {
    // displaced captain → 'none' (already cleared above)
    next.captainId = null
  }
  if (newRole === 'vice-captain' && next.viceCaptainId) {
    next.viceCaptainId = null
  }

  // Assign new role
  if (newRole === 'captain') next.captainId = playerId
  else if (newRole === 'vice-captain') next.viceCaptainId = playerId
  else if (newRole === 'lg') {
    if (next.leadershipGroupIds.length < 6) {
      next.leadershipGroupIds.push(playerId)
    }
  }

  return next
}

function lsColor(score: number): string {
  if (score >= 80) return 'text-amber-500'
  if (score >= 65) return 'text-emerald-500'
  if (score >= 50) return 'text-sky-400'
  return 'text-muted-foreground'
}

function deltaColor(delta: number): string {
  if (delta > 0) return 'text-emerald-500'
  if (delta < 0) return 'text-rose-500'
  return 'text-muted-foreground'
}

function deltaSign(delta: number): string {
  if (delta > 0) return `+${delta}`
  return `${delta}`
}

function formatRound(round: number, year: number): string {
  if (round < 0) return `Offseason ${year}`
  if (round === 0) return `Preseason ${year}`
  return `R${round} ${year}`
}

// ---------------------------------------------------------------------------
// Hero tier card (Captain / Vice-Captain)
// ---------------------------------------------------------------------------

interface HeroCardProps {
  role: 'captain' | 'vice-captain'
  player: Player | null
  ls: number
}

function HeroCard({ role, player, ls }: HeroCardProps) {
  const isC = role === 'captain'
  const borderColor = isC ? 'border-amber-500/40' : 'border-blue-500/40'
  const badgeBg = isC ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' : 'bg-blue-500/20 text-blue-500 border-blue-500/30'
  const label = isC ? 'Captain' : 'Vice-Captain'
  const abbrev = isC ? 'C' : 'VC'

  return (
    <Card className={cn('flex-1 min-w-[200px]', player ? borderColor : 'border-dashed')}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Badge className={cn('h-5 px-2 text-xs', badgeBg)}>{abbrev}</Badge>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
        {player ? (
          <div className="space-y-1">
            <Link
              to={`/player/${player.id}`}
              className="block text-base font-bold text-foreground hover:underline hover:text-primary"
            >
              {player.firstName} {player.lastName}
            </Link>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className={cn('text-[10px] px-1.5', getPositionBadgeClass(player.position.primary))}>
                {player.position.primary}
              </Badge>
              <span>{player.age}yo</span>
              <span>·</span>
              <span>{player.careerStats.gamesPlayed} GP</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-muted-foreground">OVR</span>
              <span className="text-sm font-bold">{getOverallRating(player)}</span>
              <span className="text-xs text-muted-foreground">LS</span>
              <span className={cn('text-sm font-bold tabular-nums', lsColor(ls))}>{ls}</span>
            </div>
            <div className="mt-2">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    ls >= 80 ? 'bg-amber-500' : ls >= 65 ? 'bg-emerald-500' : ls >= 50 ? 'bg-sky-400' : 'bg-muted-foreground',
                  )}
                  style={{ width: `${ls}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Not assigned</p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Leadership Group member card
// ---------------------------------------------------------------------------

interface LGMemberCardProps {
  player: Player
  onRemove: () => void
  isEditable: boolean
}

function LGMemberCard({ player, onRemove, isEditable }: LGMemberCardProps) {
  const ls = getLeadershipScore(player)
  return (
    <Card className="flex-1 min-w-[140px] max-w-[200px]">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-1">
          <Link
            to={`/player/${player.id}`}
            className="text-sm font-semibold text-foreground hover:underline hover:text-primary leading-tight"
          >
            {player.firstName[0]}. {player.lastName}
          </Link>
          {isEditable && (
            <button
              onClick={onRemove}
              className="text-muted-foreground hover:text-rose-500 text-xs shrink-0"
              title="Remove from leadership group"
            >
              ×
            </button>
          )}
        </div>
        <Badge variant="outline" className={cn('mt-1 text-[10px] px-1.5', getPositionBadgeClass(player.position.primary))}>
          {player.position.primary}
        </Badge>
        <p className={cn('mt-1 text-xs font-bold tabular-nums', lsColor(ls))}>LS {ls}</p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Impact Preview panel
// ---------------------------------------------------------------------------

interface ImpactPanelProps {
  current: ClubLeadership
  proposed: ClubLeadership
  players: Record<string, Player>
  clubId: string
  phase: import('@/types/game').GamePhase
  currentRound: number
  currentLR: number
  onCancel: () => void
  onConfirm: () => void
}

function ImpactPanel({
  current,
  proposed,
  players,
  clubId,
  phase,
  currentRound,
  currentLR,
  onCancel,
  onConfirm,
}: ImpactPanelProps) {
  const impact = useMemo(
    () => computeLeadershipChangeImpact(current, proposed, players, clubId, phase, currentRound),
    [current, proposed, players, clubId, phase, currentRound],
  )

  const newLR = currentLR + impact.leadershipRatingDelta

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Impact Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Proposed changes chips */}
        {impact.changes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {impact.changes.map((c, i) => (
              <div key={i} className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs">
                <span className="font-semibold text-muted-foreground">{c.role}:</span>
                {c.fromName && <span className="line-through text-muted-foreground">{c.fromName}</span>}
                {c.fromName && c.toName && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                {c.toName && <span className="font-semibold text-foreground">{c.toName}</span>}
                {!c.toName && <span className="text-rose-500">removed</span>}
                {!c.fromName && <span className="text-emerald-500">added</span>}
              </div>
            ))}
          </div>
        )}

        {/* Morale impact table */}
        {impact.moraleDelta.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Morale Impact</p>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 text-xs h-7">Player</TableHead>
                    <TableHead className="px-3 text-xs h-7">Role Change</TableHead>
                    <TableHead className="px-3 text-xs h-7">Morale</TableHead>
                    <TableHead className="px-3 text-xs h-7">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {impact.moraleDelta.map((d) => (
                    <TableRow key={d.playerId} className="text-xs">
                      <TableCell className="px-3 py-1.5 font-medium">{d.name}</TableCell>
                      <TableCell className="px-3 py-1.5 text-muted-foreground">
                        {d.currentRole} → {d.newRole}
                      </TableCell>
                      <TableCell className={cn('px-3 py-1.5 font-bold tabular-nums', deltaColor(d.delta))}>
                        {deltaSign(d.delta)}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-muted-foreground">{d.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-3">
          {/* Team leadership rating */}
          <div className="rounded-md border p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Team Leadership</p>
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-sm font-bold">{currentLR}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className={cn('text-sm font-bold', deltaColor(impact.leadershipRatingDelta))}>{newLR}</span>
            </div>
            <p className={cn('text-xs font-semibold', deltaColor(impact.leadershipRatingDelta))}>
              {deltaSign(impact.leadershipRatingDelta)}
            </p>
          </div>

          {/* Culture cohesion */}
          <div className="rounded-md border p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Culture Cohesion</p>
            <p className={cn('text-base font-bold', deltaColor(impact.cultureDelta))}>
              {deltaSign(impact.cultureDelta)} pts
            </p>
            <p className="text-[10px] text-muted-foreground">estimated</p>
          </div>

          {/* Board concern */}
          <div className="rounded-md border p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Board Concern</p>
            <Progress
              value={impact.boardConcernProbability}
              className={cn(
                'h-1.5 mb-1',
                impact.boardConcernProbability >= 60 ? '[&>div]:bg-rose-500'
                : impact.boardConcernProbability >= 35 ? '[&>div]:bg-amber-500'
                : '[&>div]:bg-emerald-500',
              )}
            />
            <p className={cn(
              'text-xs font-bold',
              impact.boardConcernProbability >= 60 ? 'text-rose-500'
              : impact.boardConcernProbability >= 35 ? 'text-amber-500'
              : 'text-emerald-500',
            )}>
              {impact.boardConcernProbability}%
            </p>
            {impact.boardConcernReasons.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {impact.boardConcernReasons.map((r, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground">· {r}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel Proposal
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Confirm & Apply
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Leadership History accordion
// ---------------------------------------------------------------------------

interface HistoryAccordionProps {
  changelog: LeadershipChangeRecord[]
  players: Record<string, Player>
  clubId: string
}

function HistoryAccordion({ changelog, players, clubId }: HistoryAccordionProps) {
  const [open, setOpen] = useState(false)

  const entries = useMemo(
    () =>
      [...changelog]
        .filter((r) => r.clubId === clubId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [changelog, clubId],
  )

  function describe(r: LeadershipChangeRecord): string {
    const p = players[r.playerId]
    const pName = p ? `${p.firstName} ${p.lastName}` : 'Unknown'
    const replaced = r.replacedPlayerId ? players[r.replacedPlayerId] : null
    const replacedName = replaced ? `${replaced.firstName} ${replaced.lastName}` : null
    const roleLabel =
      r.role === 'captain' ? 'Captain'
      : r.role === 'vice-captain' ? 'Vice-Captain'
      : 'Leadership Group'

    if (r.changeType === 'appointed') {
      return replacedName
        ? `${pName} appointed ${roleLabel} (replacing ${replacedName})`
        : `${pName} appointed ${roleLabel}`
    }
    return `${pName} removed from ${roleLabel}`
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between rounded-md border bg-card px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors">
          <span className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Leadership History ({entries.length} records)
          </span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="rounded-t-none border-t-0">
          <CardContent className="p-4">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                No changes recorded yet.
              </p>
            ) : (
              <div className="space-y-2">
                {entries.map((r) => (
                  <div key={r.id} className="flex items-start gap-3 text-sm">
                    <Badge variant="outline" className="text-[10px] tabular-nums shrink-0 mt-0.5">
                      {formatRound(r.round, r.year)}
                    </Badge>
                    <span className="text-foreground">{describe(r)}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] px-1.5 shrink-0 ml-auto',
                        r.role === 'captain' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                        : r.role === 'vice-captain' ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                        : 'bg-slate-500/10 text-slate-500 border-slate-500/30',
                      )}
                    >
                      {r.role === 'captain' ? 'C' : r.role === 'vice-captain' ? 'VC' : 'LG'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function LeadershipPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const viewedTeamClubId = useAppStore((s) => s.viewedTeamClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const history = useGameStore((s) => s.history)
  const phase = useGameStore((s) => s.phase)
  const currentRound = useGameStore((s) => s.currentRound)
  const applyLeadershipChange = useGameStore((s) => s.applyLeadershipChange)
  const setClubLeadership = useGameStore((s) => s.setClubLeadership)
  const setLeadershipDelegated = useGameStore((s) => s.setLeadershipDelegated)

  const clubId = viewedTeamClubId ?? playerClubId ?? ''
  const club = clubs[clubId]
  const isEditable = clubId === playerClubId

  const [pendingProposal, setPendingProposal] = useState<ClubLeadership | null>(null)
  const isDelegated = club?.leadership?.delegated ?? false

  const current: ClubLeadership = useMemo(
    () => club?.leadership ?? { captainId: null, viceCaptainId: null, leadershipGroupIds: [] },
    [club],
  )

  const displayed = pendingProposal ?? current

  const clubPlayers = useMemo(
    () => Object.values(players).filter((p) => p.clubId === clubId),
    [players, clubId],
  )

  const sortedPlayers = useMemo(
    () => [...clubPlayers].sort((a, b) => getLeadershipScore(b) - getLeadershipScore(a)),
    [clubPlayers],
  )

  const captain = displayed.captainId ? players[displayed.captainId] : null
  const vc = displayed.viceCaptainId ? players[displayed.viceCaptainId] : null
  const lgMembers = displayed.leadershipGroupIds.map((id) => players[id]).filter(Boolean) as Player[]

  // Compute team leadership rating on current (committed) leadership
  const currentLR = useMemo(() => {
    return getTeamLeadershipRating(clubPlayers, current)
  }, [clubPlayers, current])

  function handleRoleChange(playerId: string, role: LeadershipRole) {
    const base = pendingProposal ?? current
    const next = applyRoleChange(playerId, role, base)
    setPendingProposal(next)
  }

  function handleRemoveFromLG(playerId: string) {
    const base = pendingProposal ?? current
    const next: ClubLeadership = {
      ...base,
      leadershipGroupIds: base.leadershipGroupIds.filter((id) => id !== playerId),
    }
    setPendingProposal(next)
  }

  function handleConfirm() {
    if (!pendingProposal) return
    applyLeadershipChange(clubId, pendingProposal)
    setPendingProposal(null)
  }

  function handleCancel() {
    setPendingProposal(null)
  }

  function handleAutoSelect() {
    const auto = autoSelectLeadership(players, clubId)
    setPendingProposal(auto)
  }

  if (!club) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Club not found.
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{club.name}</h1>
          <p className="text-sm text-muted-foreground">Leadership Hierarchy</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingProposal && (
            <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-xs">
              Pending changes
            </Badge>
          )}
          {isDelegated && (
            <Badge className="bg-sky-500/20 text-sky-600 border-sky-500/30 text-xs flex items-center gap-1">
              <Bot className="h-3 w-3" />
              Staff-managed
            </Badge>
          )}
          {isEditable && isDelegated && (
            <Button variant="outline" size="sm" onClick={() => setLeadershipDelegated(clubId, false)}>
              <UserCheck className="mr-1.5 h-3.5 w-3.5" />
              Take Control
            </Button>
          )}
          {isEditable && !isDelegated && (
            <>
              <Button variant="ghost" size="sm" onClick={handleAutoSelect} className="text-muted-foreground">
                Auto-select
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                setPendingProposal(null)
                setLeadershipDelegated(clubId, true)
              }}>
                <Bot className="mr-1.5 h-3.5 w-3.5" />
                Delegate to Staff
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Delegation banner */}
      {isDelegated && (
        <div className="flex items-center gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm">
          <Bot className="h-4 w-4 text-sky-500 shrink-0" />
          <div className="flex-1">
            <span className="font-medium text-sky-700 dark:text-sky-400">Leadership delegated to staff.</span>
            {' '}
            <span className="text-muted-foreground">Your assistant coach selects the captain, vice-captain, and leadership group. Click <strong>Take Control</strong> to manage it yourself.</span>
          </div>
        </div>
      )}

      {/* A. Hero tier — Captain + Vice-Captain */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5" />
          Senior Leadership
        </p>
        <div className="flex flex-wrap gap-3">
          <HeroCard
            role="captain"
            player={captain}
            ls={captain ? getLeadershipScore(captain) : 0}
          />
          <HeroCard
            role="vice-captain"
            player={vc}
            ls={vc ? getLeadershipScore(vc) : 0}
          />
        </div>
      </div>

      {/* B. Leadership Group grid */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Leadership Group ({lgMembers.length}/6)
        </p>
        <div className="flex flex-wrap gap-2">
          {lgMembers.map((p) => (
            <LGMemberCard
              key={p.id}
              player={p}
              isEditable={isEditable}
              onRemove={() => handleRemoveFromLG(p.id)}
            />
          ))}
          {isEditable && lgMembers.length < 6 && (
            <div className="flex items-center justify-center min-w-[140px] rounded-md border border-dashed text-muted-foreground text-xs p-3">
              + Add via table below
            </div>
          )}
          {lgMembers.length === 0 && !isEditable && (
            <p className="text-sm text-muted-foreground italic">No leadership group members assigned.</p>
          )}
        </div>
      </div>

      {/* C. Ranking table */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          All Squad — Leadership Rankings
        </p>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 text-xs w-8">#</TableHead>
                  <TableHead className="px-3 text-xs">Name</TableHead>
                  <TableHead className="px-3 text-xs">Pos</TableHead>
                  <TableHead className="px-3 text-xs">Age</TableHead>
                  <TableHead className="px-3 text-xs">GP</TableHead>
                  <TableHead className="px-3 text-xs">LS</TableHead>
                  <TableHead className="px-3 text-xs">OVR</TableHead>
                  <TableHead className="px-3 text-xs">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPlayers.map((p, i) => {
                  const ls = getLeadershipScore(p)
                  const role = getRoleForPlayer(p.id, displayed)
                  const ovr = getOverallRating(p)

                  return (
                    <TableRow key={p.id} className={cn(
                      'text-sm',
                      role !== 'none' && 'bg-muted/30',
                    )}>
                      <TableCell className="px-3 py-1.5 text-xs tabular-nums text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <Link to={`/player/${p.id}`} className="font-medium hover:underline hover:text-primary">
                            {p.firstName} {p.lastName}
                          </Link>
                          {role === 'captain' && (
                            <Badge className="h-4 bg-amber-500/20 px-1 text-[10px] text-amber-500 border-amber-500/30">C</Badge>
                          )}
                          {role === 'vice-captain' && (
                            <Badge className="h-4 bg-blue-500/20 px-1 text-[10px] text-blue-500 border-blue-500/30">VC</Badge>
                          )}
                          {role === 'lg' && (
                            <Badge className="h-4 bg-slate-500/20 px-1 text-[10px] text-slate-500 border-slate-500/30">LG</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Badge variant="outline" className={cn('text-[10px] px-1.5', getPositionBadgeClass(p.position.primary))}>
                          {p.position.primary}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs tabular-nums">{p.age}</TableCell>
                      <TableCell className="px-3 py-1.5 text-xs tabular-nums">{p.careerStats.gamesPlayed}</TableCell>
                      <TableCell className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xs font-bold tabular-nums', lsColor(ls))}>{ls}</span>
                          <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                ls >= 80 ? 'bg-amber-500' : ls >= 65 ? 'bg-emerald-500' : ls >= 50 ? 'bg-sky-400' : 'bg-muted-foreground',
                              )}
                              style={{ width: `${ls}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs tabular-nums font-semibold">{ovr}</TableCell>
                      <TableCell className="px-3 py-1.5">
                        {isEditable && !isDelegated ? (
                          <Select
                            value={role}
                            onValueChange={(v) => handleRoleChange(p.id, v as LeadershipRole)}
                          >
                            <SelectTrigger className="h-7 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">—</SelectItem>
                              <SelectItem value="captain">Captain</SelectItem>
                              <SelectItem value="vice-captain">Vice-Captain</SelectItem>
                              <SelectItem value="lg" disabled={displayed.leadershipGroupIds.length >= 6 && role !== 'lg'}>
                                Leadership Group
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          role !== 'none' ? (
                            <Badge variant="outline" className={cn('text-[10px] px-1.5',
                              role === 'captain' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                              : role === 'vice-captain' ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                              : 'bg-slate-500/10 text-slate-500 border-slate-500/30',
                            )}>
                              {role === 'captain' ? 'Captain' : role === 'vice-captain' ? 'Vice-Captain' : 'LG'}
                            </Badge>
                          ) : (
                            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* D. Impact Preview panel */}
      {pendingProposal && (
        <ImpactPanel
          current={current}
          proposed={pendingProposal}
          players={players}
          clubId={clubId}
          phase={phase}
          currentRound={currentRound}
          currentLR={currentLR}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
        />
      )}

      {/* E. Leadership History accordion */}
      <HistoryAccordion
        changelog={history.leadershipChangelog ?? []}
        players={players}
        clubId={clubId}
      />
    </div>
  )
}
