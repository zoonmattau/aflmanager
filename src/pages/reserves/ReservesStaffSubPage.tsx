import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useReservesContext } from '@/hooks/useReservesContext'
import { getReservesStaffImpact } from '@/engine/staff/staffEngine'

export function ReservesStaffSubPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const staff = useGameStore((s) => s.staff)
  const reserves = useGameStore((s) => s.reserves)
  const applyReservesCoachTactics = useGameStore((s) => s.applyReservesCoachTactics)

  const { leagueShort } = useReservesContext()

  const clubStaff = useMemo(
    () => Object.values(staff).filter((m) => m.clubId === playerClubId),
    [staff, playerClubId],
  )

  const reservesStaff = useMemo(
    () => ({
      coach: clubStaff.find((m) => m.role === 'reserves-coach') ?? null,
      fitnessCoach: clubStaff.find((m) => m.role === 'reserves-fitness-coach') ?? null,
      devCoach: clubStaff.find((m) => m.role === 'reserves-development-coach') ?? null,
    }),
    [clubStaff],
  )

  const reservesImpact = useMemo(
    () => getReservesStaffImpact(clubStaff, playerClubId),
    [clubStaff, playerClubId],
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{leagueShort} Staff</h1>
        <p className="text-sm text-muted-foreground">
          Your reserves coaching and support team. Staff quality drives development, tactics, injury
          risk, and player recovery.
          {reservesImpact.philosophyDriven && reserves.delegationEnabled && (
            <span className="text-primary">
              {' '}Delegation active — coach running {reservesImpact.suggestedTactics.tempo}/
              {reservesImpact.suggestedTactics.aggression}
              {reservesImpact.suggestedTactics.youthFocus ? '/youth' : ''} tactics.
            </span>
          )}
        </p>
      </div>

      {/* Staff cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Reserves Coach */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Reserves Coach</CardTitle>
              {reservesStaff.coach
                ? <Badge variant="outline">{reservesStaff.coach.contractYears}y</Badge>
                : <Badge variant="secondary">Vacant</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {reservesStaff.coach ? (
              <>
                <p className="font-medium text-sm">
                  {reservesStaff.coach.firstName} {reservesStaff.coach.lastName}
                </p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>Tactical {reservesStaff.coach.ratings.tactical} · GameDay {reservesStaff.coach.ratings.gameDay} · Dev {reservesStaff.coach.ratings.development}</p>
                  <p className="capitalize">Philosophy: {reservesStaff.coach.philosophy}</p>
                </div>
                <div className="text-xs space-y-1 rounded border bg-muted/30 px-2 py-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tactical bonus</span>
                    <span className="font-medium">+{reservesImpact.tacticalBonus.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Youth bias</span>
                    <span className="font-medium">+{reservesImpact.selectionYouthBias.toFixed(1)}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No reserves coach on staff. Hire one to unlock delegation and improve tactics.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Fitness Coach */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Fitness Coach</CardTitle>
              {reservesStaff.fitnessCoach
                ? <Badge variant="outline">{reservesStaff.fitnessCoach.contractYears}y</Badge>
                : <Badge variant="secondary">Vacant</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {reservesStaff.fitnessCoach ? (
              <>
                <p className="font-medium text-sm">
                  {reservesStaff.fitnessCoach.firstName} {reservesStaff.fitnessCoach.lastName}
                </p>
                <div className="text-xs text-muted-foreground">
                  <p>Fitness {reservesStaff.fitnessCoach.ratings.fitness}</p>
                </div>
                <div className="text-xs space-y-1 rounded border bg-muted/30 px-2 py-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Injury risk</span>
                    <span className="font-medium">{(reservesImpact.injuryRiskMultiplier * 100).toFixed(0)}% of baseline</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rest recovery</span>
                    <span className="font-medium">+{reservesImpact.restingFitnessBonus.toFixed(1)} fit/wk</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No fitness coach. Higher injury risk and slower rest recovery without one.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Development Coach */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Development Coach</CardTitle>
              {reservesStaff.devCoach
                ? <Badge variant="outline">{reservesStaff.devCoach.contractYears}y</Badge>
                : <Badge variant="secondary">Vacant</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {reservesStaff.devCoach ? (
              <>
                <p className="font-medium text-sm">
                  {reservesStaff.devCoach.firstName} {reservesStaff.devCoach.lastName}
                </p>
                <div className="text-xs text-muted-foreground">
                  <p>Development {reservesStaff.devCoach.ratings.development} · MM {reservesStaff.devCoach.ratings.manManagement}</p>
                </div>
                <div className="text-xs space-y-1 rounded border bg-muted/30 px-2 py-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dev. chance</span>
                    <span className="font-medium">×{reservesImpact.developmentChanceMultiplier.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Extra upgrade</span>
                    <span className="font-medium">+{(reservesImpact.developmentExtraUpgradeChance * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No development coach. Player attribute growth in reserves will be slower.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Apply coach tactics */}
      {!reserves.delegationEnabled && reservesImpact.philosophyDriven && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                Coach suggests: {reservesImpact.suggestedTactics.tempo} tempo ·{' '}
                {reservesImpact.suggestedTactics.aggression} aggression
                {reservesImpact.suggestedTactics.youthFocus ? ' · youth focus' : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                Apply your reserves coach&apos;s preferred approach to the current tactics settings.
              </p>
            </div>
            <Button variant="outline" onClick={applyReservesCoachTactics}>
              Apply Coach Tactics
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Hire link */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate('/staff/hire')}>
          Hire Reserves Staff
        </Button>
        <Button variant="ghost" onClick={() => navigate('/staff')}>
          View All Staff
        </Button>
      </div>
    </div>
  )
}
