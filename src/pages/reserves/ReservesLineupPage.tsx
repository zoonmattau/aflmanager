import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useReservesContext } from '@/hooks/useReservesContext'
import { getUserReservesEligiblePool, projectReservesLineup } from '@/engine/stateLeague/reservesManagement'
import { getLeadershipScore } from '@/engine/leadership/leadershipEngine'
import { getReservesStaffImpact } from '@/engine/staff/staffEngine'

export function ReservesLineupPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const reserves = useGameStore((s) => s.reserves)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const settings = useGameStore((s) => s.settings)
  const staff = useGameStore((s) => s.staff)
  const setReservesDelegation = useGameStore((s) => s.setReservesDelegation)
  const setManagedReservesLineup = useGameStore((s) => s.setManagedReservesLineup)
  const setReservesLeadership = useGameStore((s) => s.setReservesLeadership)
  const setReservesTactics = useGameStore((s) => s.setReservesTactics)
  const autoPickManagedReservesLineup = useGameStore((s) => s.autoPickManagedReservesLineup)
  const applyReservesCoachTactics = useGameStore((s) => s.applyReservesCoachTactics)

  const { leagueShort } = useReservesContext()

  const clubStaff = useMemo(
    () => Object.values(staff).filter((m) => m.clubId === playerClubId),
    [staff, playerClubId],
  )
  const reservesImpact = useMemo(
    () => getReservesStaffImpact(clubStaff, playerClubId),
    [clubStaff, playerClubId],
  )

  const allEligible = useMemo(
    () => getUserReservesEligiblePool({ players, playerClubId, selectedLineup }),
    [players, playerClubId, selectedLineup],
  )

  const projected = useMemo(
    () => projectReservesLineup(allEligible, reserves, settings.matchRules.interchangePlayers),
    [allEligible, reserves, settings.matchRules.interchangePlayers],
  )

  const availableForSelection = useMemo(
    () =>
      allEligible
        .filter((p) => !p.injury)
        .sort((a, b) => b.form + b.fitness - (a.form + a.fitness)),
    [allEligible],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{leagueShort} Lineup & Tactics</h1>
          <p className="text-sm text-muted-foreground">
            Control your reserves lineup, tactics, and leadership, or delegate to your coaching staff.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate('/reserves/match-preview')}>
          Match Preview
        </Button>
      </div>

      {/* Delegation + tactics */}
      <Card>
        <CardHeader>
          <CardTitle>Lineup Management</CardTitle>
          <CardDescription>
            {reserves.delegationEnabled
              ? 'Lineup and tactics are delegated to your reserves coaching staff.'
              : 'Manual control — you select the 23 and set tactics.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Delegate to Staff</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When on, the reserves coach automatically picks the team and sets tactics.
              </p>
            </div>
            <Switch
              checked={reserves.delegationEnabled}
              onCheckedChange={(v) => setReservesDelegation(v)}
            />
          </div>

          {/* Tactic controls — always visible */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tempo</Label>
                <Select
                  value={reserves.tactics.tempo}
                  onValueChange={(v) => setReservesTactics({ tempo: v as 'slow' | 'balanced' | 'fast' })}
                  disabled={reserves.delegationEnabled}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slow">Slow</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="fast">Fast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Aggression</Label>
                <Select
                  value={reserves.tactics.aggression}
                  onValueChange={(v) => setReservesTactics({ aggression: v as 'low' | 'balanced' | 'high' })}
                  disabled={reserves.delegationEnabled}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch
                  checked={reserves.tactics.youthFocus}
                  onCheckedChange={(v) => setReservesTactics({ youthFocus: v })}
                  disabled={reserves.delegationEnabled}
                />
                <Label className="text-xs">Youth Focus</Label>
              </div>
            </div>

            {/* Coach tactics suggestion */}
            {!reserves.delegationEnabled && reservesImpact.philosophyDriven && (
              <div className="flex flex-wrap items-center gap-3 rounded border bg-muted/30 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">
                    Coach suggests: {reservesImpact.suggestedTactics.tempo} tempo ·{' '}
                    {reservesImpact.suggestedTactics.aggression} aggression
                    {reservesImpact.suggestedTactics.youthFocus ? ' · youth focus' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Apply your reserves coach&apos;s preferred approach to override current tactics.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={applyReservesCoachTactics}>
                  Apply Coach Tactics
                </Button>
              </div>
            )}

            {reserves.delegationEnabled && reservesImpact.philosophyDriven && (
              <p className="text-xs text-muted-foreground">
                Coach is running: {reservesImpact.suggestedTactics.tempo} / {reservesImpact.suggestedTactics.aggression}
                {reservesImpact.suggestedTactics.youthFocus ? ' / youth focus' : ''}
              </p>
            )}
          </div>

          {/* Manual lineup picker */}
          {!reserves.delegationEnabled && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <p className="text-sm font-medium">Selected 23</p>
                  <p className="text-xs text-muted-foreground">
                    {reserves.managedLineupPlayerIds.length}/23 selected
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={autoPickManagedReservesLineup}>
                  Auto-pick 23
                </Button>
                <Badge variant="outline">Projected {projected.selectedIds.length}/23</Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {availableForSelection.slice(0, 22).map((p) => {
                  const selected = reserves.managedLineupPlayerIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${
                        selected ? 'border-primary bg-primary/10' : 'border-border'
                      }`}
                      onClick={() => {
                        const next = selected
                          ? reserves.managedLineupPlayerIds.filter((id) => id !== p.id)
                          : [...reserves.managedLineupPlayerIds, p.id]
                        setManagedReservesLineup(next)
                      }}
                    >
                      <span className="truncate">
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="text-muted-foreground ml-2 shrink-0">
                        {p.position.primary} · form {p.form}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leadership */}
      <Card>
        <CardHeader>
          <CardTitle>{leagueShort} Leadership</CardTitle>
          <CardDescription>
            Captain and vice-captain influence morale and young player development.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Captain</Label>
              <Select
                value={reserves.leadership.captainId ?? '__none'}
                onValueChange={(v) => {
                  const newCapId = v === '__none' ? null : v
                  setReservesLeadership({
                    ...reserves.leadership,
                    captainId: newCapId,
                    viceCaptainId:
                      reserves.leadership.viceCaptainId === newCapId
                        ? null
                        : reserves.leadership.viceCaptainId,
                  })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select captain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {allEligible
                    .filter((p) => p.id !== reserves.leadership.viceCaptainId)
                    .sort((a, b) => getLeadershipScore(b) - getLeadershipScore(a))
                    .map((p) => (
                      <SelectItem key={`cap-${p.id}`} value={p.id}>
                        {p.firstName} {p.lastName} · LS {getLeadershipScore(p)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vice Captain</Label>
              <Select
                value={reserves.leadership.viceCaptainId ?? '__none'}
                onValueChange={(v) => {
                  const newVcId = v === '__none' ? null : v
                  setReservesLeadership({
                    ...reserves.leadership,
                    viceCaptainId: newVcId,
                    captainId:
                      reserves.leadership.captainId === newVcId
                        ? null
                        : reserves.leadership.captainId,
                  })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vice captain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {allEligible
                    .filter((p) => p.id !== reserves.leadership.captainId)
                    .sort((a, b) => getLeadershipScore(b) - getLeadershipScore(a))
                    .map((p) => (
                      <SelectItem key={`vc-${p.id}`} value={p.id}>
                        {p.firstName} {p.lastName} · LS {getLeadershipScore(p)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Leadership Group</Label>
              <span className="text-xs text-muted-foreground">
                {reserves.leadership.leadershipGroupIds.length}/8 selected
              </span>
            </div>
            <div className="grid gap-1 md:grid-cols-2">
              {allEligible
                .sort((a, b) => getLeadershipScore(b) - getLeadershipScore(a))
                .map((p) => {
                  const inGroup = reserves.leadership.leadershipGroupIds.includes(p.id)
                  const isCap = p.id === reserves.leadership.captainId
                  const isVC = p.id === reserves.leadership.viceCaptainId
                  const atMax = reserves.leadership.leadershipGroupIds.length >= 8
                  return (
                    <button
                      key={`lg-${p.id}`}
                      type="button"
                      disabled={!inGroup && atMax}
                      className={`rounded border px-2 py-1 text-xs text-left flex items-center justify-between gap-1 ${
                        inGroup ? 'border-primary bg-primary/10' : atMax ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      onClick={() => {
                        const next = inGroup
                          ? reserves.leadership.leadershipGroupIds.filter((id) => id !== p.id)
                          : [...reserves.leadership.leadershipGroupIds, p.id]
                        setReservesLeadership({ ...reserves.leadership, leadershipGroupIds: next })
                      }}
                    >
                      <span className="truncate">
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {isCap && (
                          <Badge className="h-4 text-[10px] px-1 py-0">C</Badge>
                        )}
                        {isVC && (
                          <Badge variant="secondary" className="h-4 text-[10px] px-1 py-0">VC</Badge>
                        )}
                        <span className="text-muted-foreground">LS {getLeadershipScore(p)}</span>
                      </span>
                    </button>
                  )
                })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
