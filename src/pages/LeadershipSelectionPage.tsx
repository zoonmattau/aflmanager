import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { getLeadershipScore, getTeamLeadershipRating, autoSelectLeadership } from '@/engine/leadership/leadershipEngine'
import { getOverallRating } from '@/engine/player/playerRating'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ShieldAlert, Shield, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'
import type { ClubLeadership } from '@/types/club'

type LeadershipRole = 'none' | 'lg' | 'vc' | 'c'

const ROLE_OPTIONS: { value: LeadershipRole; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'lg', label: 'Leadership Group' },
  { value: 'vc', label: 'Vice-Captain' },
  { value: 'c', label: 'Captain' },
]

function getRoleForPlayer(id: string, l: ClubLeadership): LeadershipRole {
  if (l.captainId === id) return 'c'
  if (l.viceCaptainId === id) return 'vc'
  if (l.leadershipGroupIds.includes(id)) return 'lg'
  return 'none'
}

function applyRoleChange(playerId: string, newRole: LeadershipRole, current: ClubLeadership): ClubLeadership {
  const next: ClubLeadership = {
    captainId: current.captainId,
    viceCaptainId: current.viceCaptainId,
    leadershipGroupIds: [...current.leadershipGroupIds],
  }
  if (next.captainId === playerId) next.captainId = null
  if (next.viceCaptainId === playerId) next.viceCaptainId = null
  next.leadershipGroupIds = next.leadershipGroupIds.filter((id) => id !== playerId)
  if (newRole === 'c') next.captainId = playerId
  if (newRole === 'vc') next.viceCaptainId = playerId
  if (newRole === 'lg') next.leadershipGroupIds.push(playerId)
  return next
}

function lsColor(score: number): string {
  if (score >= 75) return 'text-green-500'
  if (score >= 60) return 'text-emerald-400'
  if (score >= 45) return 'text-yellow-500'
  return 'text-muted-foreground'
}

function ratingBarColor(rating: number): string {
  if (rating >= 75) return 'bg-green-500'
  if (rating >= 60) return 'bg-emerald-400'
  if (rating >= 45) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function LeadershipSelectionPage() {
  const navigate = useNavigate()

  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const leadershipPending = useGameStore((s) => s.leadershipPending)
  const setClubLeadership = useGameStore((s) => s.setClubLeadership)
  const confirmLeadershipSelection = useGameStore((s) => s.confirmLeadershipSelection)
  const delegateLeadershipToStaff = useGameStore((s) => s.delegateLeadershipToStaff)

  const club = playerClubId ? clubs[playerClubId] : null
  const existingLeadership = club?.leadership ?? { captainId: null, viceCaptainId: null, leadershipGroupIds: [] }

  const [localLeadership, setLocalLeadership] = useState<ClubLeadership>({
    captainId: existingLeadership.captainId,
    viceCaptainId: existingLeadership.viceCaptainId,
    leadershipGroupIds: [...existingLeadership.leadershipGroupIds],
  })
  const [delegateDialogOpen, setDelegateDialogOpen] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // All eligible players for the player's club
  const eligiblePlayers = useMemo(() => {
    if (!playerClubId) return []
    return Object.values(players)
      .filter(
        (p) =>
          p.clubId === playerClubId &&
          p.age >= 22 &&
          p.careerStats.gamesPlayed >= 20,
      )
      .sort((a, b) => getLeadershipScore(b) - getLeadershipScore(a))
  }, [players, playerClubId])

  const teamRating = getTeamLeadershipRating(eligiblePlayers, localLeadership)

  const captain = localLeadership.captainId ? players[localLeadership.captainId] : null
  const vc = localLeadership.viceCaptainId ? players[localLeadership.viceCaptainId] : null
  const lgMembers = localLeadership.leadershipGroupIds.map((id) => players[id]).filter(Boolean)

  const handleRoleChange = (playerId: string, newRole: LeadershipRole) => {
    setLocalLeadership((prev) => applyRoleChange(playerId, newRole, prev))
    setValidationError(null)
  }

  const handleConfirm = () => {
    if (!localLeadership.captainId) {
      setValidationError('A captain must be appointed before confirming.')
      return
    }
    if (!playerClubId) return
    setClubLeadership(playerClubId, localLeadership)
    confirmLeadershipSelection()
    navigate('/')
  }

  const handleDelegate = () => {
    delegateLeadershipToStaff()
    setDelegateDialogOpen(false)
    navigate('/')
  }

  if (!playerClubId || !club) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No club selected. Take a job first.
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2">
          {leadershipPending ? (
            <ShieldAlert className="h-5 w-5 text-amber-500" />
          ) : (
            <Shield className="h-5 w-5 text-muted-foreground" />
          )}
          <h1 className="text-xl font-bold">
            {leadershipPending ? 'Appoint Your Club Leadership' : 'Club Leadership'}
          </h1>
          {!leadershipPending && (
            <Badge variant="outline" className="ml-1 gap-1 text-green-600 border-green-500/40 bg-green-500/10">
              <CheckCircle2 className="h-3 w-3" />
              Appointed
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {leadershipPending
            ? 'Your captain drives clutch performance. The leadership group guides young player mentorship and shapes club culture.'
            : 'Leadership already appointed — you can update it here at any time.'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="flex flex-wrap gap-3">
        {/* Captain */}
        <Card className={cn('min-w-[160px]', captain ? 'border-amber-500/40' : 'border-dashed')}>
          <CardContent className="p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Badge className="h-4 bg-amber-500/20 px-1.5 text-[10px] text-amber-500 border-amber-500/30">C</Badge>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Captain</span>
            </div>
            {captain ? (
              <>
                <Link to={`/player/${captain.id}`} className="text-sm font-semibold text-foreground hover:underline hover:text-primary">
                  {captain.firstName} {captain.lastName}
                </Link>
                <p className="text-xs text-muted-foreground">{captain.position.primary} · {captain.age}yo</p>
                <p className={cn('text-xs font-bold tabular-nums', lsColor(getLeadershipScore(captain)))}>
                  LS {getLeadershipScore(captain)}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic">Not appointed</p>
            )}
          </CardContent>
        </Card>

        {/* Vice-Captain */}
        <Card className={cn('min-w-[160px]', vc ? 'border-blue-500/40' : 'border-dashed')}>
          <CardContent className="p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Badge className="h-4 bg-blue-500/20 px-1.5 text-[10px] text-blue-500 border-blue-500/30">VC</Badge>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vice-Captain</span>
            </div>
            {vc ? (
              <>
                <Link to={`/player/${vc.id}`} className="text-sm font-semibold text-foreground hover:underline hover:text-primary">
                  {vc.firstName} {vc.lastName}
                </Link>
                <p className="text-xs text-muted-foreground">{vc.position.primary} · {vc.age}yo</p>
                <p className={cn('text-xs font-bold tabular-nums', lsColor(getLeadershipScore(vc)))}>
                  LS {getLeadershipScore(vc)}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic">Not appointed</p>
            )}
          </CardContent>
        </Card>

        {/* Leadership Group */}
        {lgMembers.length > 0 && (
          <Card className="flex-1 min-w-[200px]">
            <CardContent className="p-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Leadership Group ({lgMembers.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {lgMembers.map((p) => (
                  <Link
                    key={p.id}
                    to={`/player/${p.id}`}
                    className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-foreground hover:border-primary/40 hover:text-primary"
                  >
                    {p.firstName[0]}. {p.lastName}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Team rating */}
        <div className="flex flex-col items-end justify-center gap-1 ml-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Team Leadership Rating</p>
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', ratingBarColor(teamRating))}
                style={{ width: `${teamRating}%` }}
              />
            </div>
            <span className={cn('text-lg font-bold tabular-nums', lsColor(teamRating))}>{teamRating}</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
        </div>
      </div>

      {/* Eligibility note */}
      {eligiblePlayers.length === 0 && (
        <Card className="border-amber-400/50 bg-amber-500/5">
          <CardContent className="px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
            No eligible players found (requires age ≥ 22 and ≥ 20 career games). Delegate to staff to auto-select the best available candidates.
          </CardContent>
        </Card>
      )}

      {/* Player table */}
      {eligiblePlayers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Eligible Players</CardTitle>
            <p className="text-xs text-muted-foreground">Age ≥ 22 · Career games ≥ 20 · Sorted by leadership score</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 text-xs w-6">#</TableHead>
                  <TableHead className="px-3 text-xs">Name</TableHead>
                  <TableHead className="px-3 text-xs">Pos</TableHead>
                  <TableHead className="px-3 text-xs">Age</TableHead>
                  <TableHead className="px-3 text-xs">GP</TableHead>
                  <TableHead className="px-3 text-xs">OVR</TableHead>
                  <TableHead className="px-3 text-xs">LS</TableHead>
                  <TableHead className="px-3 text-xs">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligiblePlayers.map((p, i) => {
                  const role = getRoleForPlayer(p.id, localLeadership)
                  const ls = getLeadershipScore(p)
                  return (
                    <TableRow key={p.id} className="text-sm">
                      <TableCell className="px-3 py-1.5 text-xs tabular-nums text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Link to={`/player/${p.id}`} className="font-medium hover:underline hover:text-primary">
                          {p.firstName} {p.lastName}
                        </Link>
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[10px] px-1">{p.position.primary}</Badge>
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs tabular-nums">{p.age}</TableCell>
                      <TableCell className="px-3 py-1.5 text-xs tabular-nums">{p.careerStats.gamesPlayed}</TableCell>
                      <TableCell className="px-3 py-1.5 text-xs tabular-nums font-semibold">{getOverallRating(p)}</TableCell>
                      <TableCell className="px-3 py-1.5">
                        <span className={cn('text-xs font-bold tabular-nums', lsColor(ls))}>{ls}</span>
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Select
                          value={role}
                          onValueChange={(v) => handleRoleChange(p.id, v as LeadershipRole)}
                        >
                          <SelectTrigger className="h-7 w-[152px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Validation error */}
      {validationError && (
        <p className="text-sm text-destructive">{validationError}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <Button variant="outline" onClick={() => setDelegateDialogOpen(true)}>
          Delegate to Staff
        </Button>
        <Button onClick={handleConfirm} disabled={!localLeadership.captainId}>
          {leadershipPending ? 'Confirm Appointment' : 'Save Changes'}
        </Button>
      </div>

      {/* Delegate confirmation dialog */}
      <Dialog open={delegateDialogOpen} onOpenChange={setDelegateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delegate to Staff?</DialogTitle>
            <DialogDescription>
              Your coaching staff will automatically appoint the best available captain, vice-captain, and leadership group based on player attributes and experience. You can update the selection at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelegateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDelegate}>
              Let Staff Decide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
