import { useMemo, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { ClubFacilities } from '@/types/club'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DollarSign,
  Dumbbell,
  Building2,
  Stethoscope,
  Waves,
  MonitorCog,
  GraduationCap,
  ArrowUpCircle,
  TrendingUp,
  TrendingDown,
  Landmark,
  Star,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FACILITY_KEYS: (keyof ClubFacilities)[] = [
  'trainingGround',
  'gym',
  'medicalCentre',
  'recoveryPool',
  'analysisSuite',
  'youthAcademy',
]

const FACILITY_META: Record<
  keyof ClubFacilities,
  {
    label: string
    icon: typeof Building2
    impactLabel: string
    bonusPerLevel: number
  }
> = {
  trainingGround: {
    label: 'Training Ground',
    icon: Building2,
    impactLabel: 'Training effectiveness',
    bonusPerLevel: 10,
  },
  gym: {
    label: 'Gym',
    icon: Dumbbell,
    impactLabel: 'Physical development',
    bonusPerLevel: 8,
  },
  medicalCentre: {
    label: 'Medical Centre',
    icon: Stethoscope,
    impactLabel: 'Injury recovery speed',
    bonusPerLevel: 10,
  },
  recoveryPool: {
    label: 'Recovery Pool',
    icon: Waves,
    impactLabel: 'Fatigue reduction',
    bonusPerLevel: 8,
  },
  analysisSuite: {
    label: 'Analysis Suite',
    icon: MonitorCog,
    impactLabel: 'Match preparation',
    bonusPerLevel: 6,
  },
  youthAcademy: {
    label: 'Youth Academy',
    icon: GraduationCap,
    impactLabel: 'Youth development',
    bonusPerLevel: 10,
  },
}

/** Upgrade costs by target level (index = target level, so index 2 = upgrading to Lv2) */
const UPGRADE_COSTS: Record<number, number> = {
  2: 500_000,
  3: 1_000_000,
  4: 2_000_000,
  5: 4_000_000,
}

const MAX_LEVEL = 5

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toLocaleString('en-AU')}`
}

function levelStars(level: number): string {
  return '\u2605'.repeat(level) + '\u2606'.repeat(MAX_LEVEL - level)
}

function jobSecurityColor(value: number): string {
  if (value >= 70) return 'bg-green-500'
  if (value >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

function jobSecurityTextColor(value: number): string {
  if (value >= 70) return 'text-green-600 dark:text-green-400'
  if (value >= 40) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FacilityCard({
  facilityKey,
  level,
  balance,
  onUpgrade,
}: {
  facilityKey: keyof ClubFacilities
  level: number
  balance: number
  onUpgrade: (facilityKey: keyof ClubFacilities, cost: number) => void
}) {
  const meta = FACILITY_META[facilityKey]
  const Icon = meta.icon
  const nextLevel = level + 1
  const upgradeCost = UPGRADE_COSTS[nextLevel] ?? null
  const isMaxLevel = level >= MAX_LEVEL
  const canAfford = upgradeCost !== null && balance >= upgradeCost
  const impactPercent = level * meta.bonusPerLevel

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm">{meta.label}</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            Lv {level}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stars display */}
        <div className="flex items-center gap-1">
          <span className="text-lg tracking-wider text-yellow-500">
            {levelStars(level)}
          </span>
        </div>

        {/* Level progress bar */}
        <Progress value={(level / MAX_LEVEL) * 100} className="h-2" />

        {/* Impact description */}
        <p className="text-xs text-muted-foreground">
          {meta.label} Lv{level}: +{impactPercent}% {meta.impactLabel.toLowerCase()}
        </p>

        {/* Upgrade button */}
        {isMaxLevel ? (
          <Button variant="outline" size="sm" className="w-full text-xs" disabled>
            Max Level Reached
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="w-full text-xs"
            disabled={!canAfford}
            onClick={() => {
              if (upgradeCost !== null) onUpgrade(facilityKey, upgradeCost)
            }}
          >
            <ArrowUpCircle className="mr-1 h-3 w-3" />
            Upgrade to Lv{nextLevel} ({formatCurrency(upgradeCost!)})
          </Button>
        )}

        {!isMaxLevel && !canAfford && upgradeCost !== null && (
          <p className="text-[10px] text-destructive text-center">
            Insufficient funds ({formatCurrency(upgradeCost)} required)
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function ClubPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const staff = useGameStore((s) => s.staff)
  const settings = useGameStore((s) => s.settings)
  const ladder = useGameStore((s) => s.ladder)

  const club = clubs[playerClubId]

  // -------------------------------------------------------------------------
  // Local state for facility upgrades (store action may handle this, but we
  // also track locally so the UI updates immediately)
  // -------------------------------------------------------------------------
  const [localFacilities, setLocalFacilities] = useState<ClubFacilities>(
    () => ({ ...club?.facilities }),
  )
  const [localBalance, setLocalBalance] = useState<number>(
    () => club?.finances.balance ?? 0,
  )

  // Upgrade confirm dialog
  const [upgradeTarget, setUpgradeTarget] = useState<{
    facilityKey: keyof ClubFacilities
    cost: number
  } | null>(null)

  // -------------------------------------------------------------------------
  // Derived: players and staff for this club
  // -------------------------------------------------------------------------
  const clubPlayers = useMemo(
    () => Object.values(players).filter((p) => p.clubId === playerClubId),
    [players, playerClubId],
  )

  const clubStaff = useMemo(
    () => Object.values(staff).filter((s) => s.clubId === playerClubId),
    [staff, playerClubId],
  )

  // -------------------------------------------------------------------------
  // Derived: Facilities
  // -------------------------------------------------------------------------
  const facilityAverage = useMemo(() => {
    const sum = FACILITY_KEYS.reduce((acc, key) => acc + localFacilities[key], 0)
    return sum / FACILITY_KEYS.length
  }, [localFacilities])

  // -------------------------------------------------------------------------
  // Derived: Finances
  // -------------------------------------------------------------------------
  const revenueBreakdown = useMemo(() => ({
    matchDay: 3_000_000,
    membership: 4_000_000,
    sponsorship: 3_000_000,
    broadcasting: 4_000_000,
    merchandise: 2_000_000,
  }), [])

  const totalRevenue = useMemo(
    () => Object.values(revenueBreakdown).reduce((a, b) => a + b, 0),
    [revenueBreakdown],
  )

  const playerSalaries = useMemo(
    () => clubPlayers.reduce((sum, p) => sum + p.contract.aav, 0),
    [clubPlayers],
  )

  const staffSalaries = useMemo(
    () => clubStaff.reduce((sum, s) => sum + s.salary, 0),
    [clubStaff],
  )

  const facilityMaintenance = useMemo(() => {
    const totalLevels = FACILITY_KEYS.reduce(
      (sum, key) => sum + localFacilities[key],
      0,
    )
    return totalLevels * 100_000
  }, [localFacilities])

  const operationsCost = 2_000_000

  const totalExpenses = useMemo(
    () => playerSalaries + staffSalaries + facilityMaintenance + operationsCost,
    [playerSalaries, staffSalaries, facilityMaintenance],
  )

  const projectedEndOfYear = totalRevenue - totalExpenses

  const salaryCap = club?.finances.salaryCap ?? settings.salaryCapAmount
  const capUsage = salaryCap > 0 ? (playerSalaries / salaryCap) * 100 : 0

  // -------------------------------------------------------------------------
  // Derived: Board Room
  // -------------------------------------------------------------------------
  const ladderPosition = useMemo(() => {
    const idx = ladder.findIndex((e) => e.clubId === playerClubId)
    return idx >= 0 ? idx + 1 : 18
  }, [ladder, playerClubId])

  const boardExpectation = useMemo(() => {
    if (ladderPosition <= 4) return 'Finals appearance'
    if (ladderPosition <= 8) return 'Improvement'
    if (ladderPosition <= 14) return 'Development'
    return 'Patience'
  }, [ladderPosition])

  const jobSecurity = useMemo(() => {
    // Job security based on ladder position
    // Top 4 = 85-100, 5-8 = 60-80, 9-14 = 35-55, 15-18 = 15-30
    if (ladderPosition <= 4) return 85 + (4 - ladderPosition) * 5
    if (ladderPosition <= 8) return 80 - (ladderPosition - 5) * 7
    if (ladderPosition <= 14) return 55 - (ladderPosition - 9) * 4
    return 30 - (ladderPosition - 15) * 5
  }, [ladderPosition])

  const boardMessage = useMemo(() => {
    if (ladderPosition <= 2)
      return 'The board is delighted with the team\'s performance. Keep pushing for the Premiership.'
    if (ladderPosition <= 4)
      return 'Strong season so far. The board expects a deep finals run.'
    if (ladderPosition <= 8)
      return 'Solid progress. The board wants to see continued improvement and a finals berth.'
    if (ladderPosition <= 12)
      return 'Results have been mixed. The board expects to see a clear plan for improvement.'
    if (ladderPosition <= 14)
      return 'The board is growing impatient. They want to see signs of development in the playing group.'
    return 'The board is deeply concerned about the direction of the club. Improvement is urgently needed.'
  }, [ladderPosition])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleUpgradeClick = (facilityKey: keyof ClubFacilities, cost: number) => {
    setUpgradeTarget({ facilityKey, cost })
  }

  const handleUpgradeConfirm = () => {
    if (!upgradeTarget) return
    const { facilityKey, cost } = upgradeTarget

    // Update local state
    setLocalFacilities((prev) => ({
      ...prev,
      [facilityKey]: Math.min(prev[facilityKey] + 1, MAX_LEVEL),
    }))
    setLocalBalance((prev) => prev - cost)

    // Also update the store if the action is available
    const store = useGameStore.getState()
    const updatedFacilities = {
      ...localFacilities,
      [facilityKey]: Math.min(localFacilities[facilityKey] + 1, MAX_LEVEL),
    }
    const updatedBalance = localBalance - cost
    store.updateClub(playerClubId, {
      facilities: updatedFacilities,
      finances: {
        ...club.finances,
        balance: updatedBalance,
      },
    })

    setUpgradeTarget(null)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">{club?.fullName} - Club Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage facilities, finances, and board relations
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Summary Cards Row                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              Club Balance
            </div>
            <p className={`text-2xl font-bold tabular-nums ${localBalance < 0 ? 'text-red-500' : ''}`}>
              {formatCurrency(localBalance)}
            </p>
            <p className="text-xs text-muted-foreground">available funds</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Total Revenue
            </div>
            <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
              {formatCurrency(totalRevenue)}
            </p>
            <p className="text-xs text-muted-foreground">annual income</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingDown className="h-3.5 w-3.5" />
              Total Expenses
            </div>
            <p className="text-2xl font-bold tabular-nums text-red-500">
              {formatCurrency(totalExpenses)}
            </p>
            <p className="text-xs text-muted-foreground">annual costs</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Star className="h-3.5 w-3.5" />
              Facility Average
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {facilityAverage.toFixed(1)}{' '}
              <span className="text-sm font-normal text-muted-foreground">/ 5</span>
            </p>
            <p className="text-xs text-muted-foreground">across all facilities</p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Tabs                                                                */}
      {/* ------------------------------------------------------------------ */}
      <Tabs defaultValue="facilities">
        <TabsList>
          <TabsTrigger value="facilities">Facilities</TabsTrigger>
          <TabsTrigger value="finances">Finances</TabsTrigger>
          <TabsTrigger value="boardroom">Board Room</TabsTrigger>
        </TabsList>

        {/* ============================================================== */}
        {/* Facilities Tab                                                  */}
        {/* ============================================================== */}
        <TabsContent value="facilities" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Club Facilities</h2>
            <p className="text-sm text-muted-foreground">
              Upgrade your facilities to improve player development, recovery, and match preparation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {FACILITY_KEYS.map((key) => (
              <FacilityCard
                key={key}
                facilityKey={key}
                level={localFacilities[key]}
                balance={localBalance}
                onUpgrade={handleUpgradeClick}
              />
            ))}
          </div>
        </TabsContent>

        {/* ============================================================== */}
        {/* Finances Tab                                                    */}
        {/* ============================================================== */}
        <TabsContent value="finances" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Revenue
                </CardTitle>
                <CardDescription>
                  Annual income streams ({formatCurrency(totalRevenue)} total)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: 'Match Day', value: revenueBreakdown.matchDay },
                    { label: 'Memberships', value: revenueBreakdown.membership },
                    { label: 'Sponsorship', value: revenueBreakdown.sponsorship },
                    { label: 'Broadcasting', value: revenueBreakdown.broadcasting },
                    { label: 'Merchandise', value: revenueBreakdown.merchandise },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm">{item.label}</span>
                      <span className="text-sm font-medium tabular-nums text-green-600 dark:text-green-400">
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-sm">Total Revenue</span>
                    <span className="text-sm tabular-nums text-green-600 dark:text-green-400">
                      {formatCurrency(totalRevenue)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Expenses Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  Expenses
                </CardTitle>
                <CardDescription>
                  Annual cost breakdown ({formatCurrency(totalExpenses)} total)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: 'Player Salaries', value: playerSalaries },
                    { label: 'Staff Salaries', value: staffSalaries },
                    { label: 'Facility Maintenance', value: facilityMaintenance },
                    { label: 'Operations', value: operationsCost },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm">{item.label}</span>
                      <span className="text-sm font-medium tabular-nums text-red-500">
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-sm">Total Expenses</span>
                    <span className="text-sm tabular-nums text-red-500">
                      {formatCurrency(totalExpenses)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Balance Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="h-4 w-4" />
                Club Balance
              </CardTitle>
              <CardDescription>
                Current financial position and projections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className={`text-2xl font-bold tabular-nums ${localBalance < 0 ? 'text-red-500' : ''}`}>
                    {formatCurrency(localBalance)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Projected End-of-Year</p>
                  <p className={`text-2xl font-bold tabular-nums ${projectedEndOfYear < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                    {projectedEndOfYear < 0 ? '-' : '+'}
                    {formatCurrency(Math.abs(projectedEndOfYear))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Revenue ({formatCurrency(totalRevenue)}) - Expenses ({formatCurrency(totalExpenses)})
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Salary Cap Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Salary Cap Usage</CardTitle>
              <CardDescription>
                {formatCurrency(playerSalaries)} of {formatCurrency(salaryCap)} (
                {capUsage.toFixed(1)}%)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    capUsage > 100
                      ? 'bg-red-500'
                      : capUsage > 85
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(capUsage, 100)}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span className="text-yellow-500">85%</span>
                <span>100%</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Cap space remaining</span>
                <span className={`font-semibold tabular-nums ${salaryCap - playerSalaries < 0 ? 'text-red-500' : ''}`}>
                  {formatCurrency(salaryCap - playerSalaries)}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================== */}
        {/* Board Room Tab                                                  */}
        {/* ============================================================== */}
        <TabsContent value="boardroom" className="space-y-4">
          {!settings.boardPressure && (
            <Badge variant="secondary" className="text-sm">
              Board pressure is disabled
            </Badge>
          )}

          {/* Board Expectation Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Board Expectations
              </CardTitle>
              <CardDescription>
                What the board expects from you this season
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Season Objective</p>
                  <p className="text-xl font-bold">{boardExpectation}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-sm text-muted-foreground">Current Position</p>
                  <p className="text-xl font-bold">
                    {ladderPosition}
                    {ordinal(ladderPosition)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">Board Message</p>
                <p className="text-sm text-muted-foreground italic">
                  &ldquo;{boardMessage}&rdquo;
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Job Security Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {jobSecurity < 40 ? (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Job Security
              </CardTitle>
              <CardDescription>
                Your standing with the board based on results
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Security Level</span>
                  <span className={`text-sm font-bold tabular-nums ${jobSecurityTextColor(jobSecurity)}`}>
                    {jobSecurity}%
                  </span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${jobSecurityColor(jobSecurity)}`}
                    style={{ width: `${Math.max(jobSecurity, 0)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="text-red-500">At Risk</span>
                  <span className="text-yellow-500">Under Review</span>
                  <span className="text-green-500">Secure</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium">Performance Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Ladder Position</p>
                    <p className="text-lg font-bold">
                      {ladderPosition}
                      {ordinal(ladderPosition)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Expectation</p>
                    <p className="text-lg font-bold">{boardExpectation}</p>
                  </div>
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Squad Size</p>
                    <p className="text-lg font-bold">{clubPlayers.length}</p>
                  </div>
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Financial Health</p>
                    <p className={`text-lg font-bold ${projectedEndOfYear >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                      {projectedEndOfYear >= 0 ? 'Positive' : 'Negative'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------------------------ */}
      {/* Upgrade Confirmation Dialog                                         */}
      {/* ------------------------------------------------------------------ */}
      <Dialog
        open={upgradeTarget !== null}
        onOpenChange={(open) => { if (!open) setUpgradeTarget(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Facility Upgrade</DialogTitle>
            <DialogDescription>
              Are you sure you want to upgrade this facility?
            </DialogDescription>
          </DialogHeader>
          {upgradeTarget && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-semibold">
                    {FACILITY_META[upgradeTarget.facilityKey].label}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Level {localFacilities[upgradeTarget.facilityKey]} {'\u2192'}{' '}
                    Level {localFacilities[upgradeTarget.facilityKey] + 1}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    Cost: {formatCurrency(upgradeTarget.cost)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Balance after: {formatCurrency(localBalance - upgradeTarget.cost)}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                <p className="text-sm">
                  This upgrade will improve{' '}
                  <span className="font-medium">
                    {FACILITY_META[upgradeTarget.facilityKey].impactLabel.toLowerCase()}
                  </span>{' '}
                  from +
                  {localFacilities[upgradeTarget.facilityKey] *
                    FACILITY_META[upgradeTarget.facilityKey].bonusPerLevel}
                  % to +
                  {(localFacilities[upgradeTarget.facilityKey] + 1) *
                    FACILITY_META[upgradeTarget.facilityKey].bonusPerLevel}
                  %.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpgradeConfirm}>
              Confirm Upgrade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}
