import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import type { ClubBudgetAllocation, ClubFacilities, ClubHallOfFameEntry, BudgetDepartment } from '@/types/club'
import type { FacilityUpgradeRequest } from '@/types/facilityUpgrade'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  Trophy,
  HardHat,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  UserSearch,
  RotateCcw,
  Save,
  ArrowUp,
  ArrowDown,
  Swords,
  Heart,
} from 'lucide-react'
import { getDynastyStats } from '@/engine/history/historyEngine'
import { getClubIdentity, getClubIdentityLabel, getFanExpectationLabel } from '@/engine/clubs/identity'
import { formatInflationRate, formatInflationIndex } from '@/engine/inflation/inflationEngine'
import { computeApprovalProbability, canRequestUpgrade } from '@/engine/clubs/facilityUpgradeEngine'
import {
  BUDGET_DEPARTMENTS,
  DEPARTMENT_META,
  DEFAULT_BUDGET_ALLOCATION,
  MIN_DEPARTMENT_PCT,
  MAX_DEPARTMENT_PCT,
  BUDGET_TOTAL,
  getClubBudgetAllocation,
  calculateDiscretionaryBudget,
  projectBudgetImpacts,
} from '@/engine/clubs/budgetEngine'

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

const UPGRADE_COSTS: Record<number, number> = {
  2: 500_000,
  3: 1_000_000,
  4: 2_000_000,
  5: 4_000_000,
}

const MAX_LEVEL = 5

const DEPT_ICON_MAP: Record<BudgetDepartment, typeof Building2> = {
  facilities: Building2,
  coaching: GraduationCap,
  recruiting: UserSearch,
  medical: Stethoscope,
  scouting: Search,
}

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

function hallOfFameScore(entry: ClubHallOfFameEntry): number {
  return entry.gamesPlayed + entry.goals * 0.4
}

function approvalColor(probability: number): string {
  if (probability >= 70) return 'text-green-600 dark:text-green-400'
  if (probability >= 40) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function approvalButtonVariant(probability: number): 'default' | 'secondary' | 'destructive' {
  if (probability >= 70) return 'default'
  if (probability >= 40) return 'secondary'
  return 'destructive'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FacilityCard({
  facilityKey,
  level,
  balance,
  onUpgrade,
  readOnly = false,
  activeUpgrade,
  approvalProbability,
  canRequest,
  cantRequestReason,
}: {
  facilityKey: keyof ClubFacilities
  level: number
  balance: number
  onUpgrade: (facilityKey: keyof ClubFacilities, cost: number) => void
  readOnly?: boolean
  activeUpgrade?: FacilityUpgradeRequest
  approvalProbability?: number
  canRequest: boolean
  cantRequestReason?: string
}) {
  const meta = FACILITY_META[facilityKey]
  const Icon = meta.icon
  const nextLevel = level + 1
  const upgradeCost = UPGRADE_COSTS[nextLevel] ?? null
  const isMaxLevel = level >= MAX_LEVEL
  const canAfford = upgradeCost !== null && balance >= upgradeCost
  const impactPercent = level * meta.bonusPerLevel

  const isUnderConstruction = activeUpgrade?.status === 'under-construction'
  const constructionProgress = isUnderConstruction && activeUpgrade
    ? Math.max(0, Math.min(100,
        ((activeUpgrade.constructionWeeksTotal - activeUpgrade.constructionWeeksRemaining) /
          Math.max(1, activeUpgrade.constructionWeeksTotal)) * 100,
      ))
    : 0
  const weeksElapsed = isUnderConstruction && activeUpgrade
    ? Math.round(activeUpgrade.constructionWeeksTotal - activeUpgrade.constructionWeeksRemaining)
    : 0

  return (
    <Card className={isUnderConstruction ? 'border-yellow-500/50' : undefined}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm">{meta.label}</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {isUnderConstruction && (
              <Badge variant="outline" className="text-[10px] border-yellow-500/50 text-yellow-600 dark:text-yellow-400">
                <HardHat className="mr-0.5 h-3 w-3" />
                Building
              </Badge>
            )}
            <Badge variant="outline" className="text-xs font-mono">
              Lv {level}
            </Badge>
          </div>
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

        {/* Construction progress */}
        {isUnderConstruction && activeUpgrade && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 font-medium">
                <HardHat className="h-3 w-3" />
                Upgrading to Lv{activeUpgrade.toLevel}
              </span>
              <span className="font-mono text-muted-foreground">
                {weeksElapsed}/{activeUpgrade.constructionWeeksTotal}w
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-yellow-500/20">
              <div
                className="h-full rounded-full bg-yellow-500 transition-all"
                style={{ width: `${constructionProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {Math.ceil(activeUpgrade.constructionWeeksRemaining)} week{Math.ceil(activeUpgrade.constructionWeeksRemaining) === 1 ? '' : 's'} remaining
            </p>
          </div>
        )}

        {/* Upgrade button */}
        {!readOnly && !isUnderConstruction && (
          <>
            {isMaxLevel ? (
              <Button variant="outline" size="sm" className="w-full text-xs" disabled>
                Max Level Reached
              </Button>
            ) : canRequest && canAfford ? (
              <Button
                variant={approvalProbability != null ? approvalButtonVariant(approvalProbability) : 'default'}
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  if (upgradeCost !== null) onUpgrade(facilityKey, upgradeCost)
                }}
              >
                <ArrowUpCircle className="mr-1 h-3 w-3" />
                Request Upgrade ({approvalProbability != null ? `${Math.round(approvalProbability)}%` : formatCurrency(upgradeCost!)})
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="w-full text-xs" disabled>
                {isMaxLevel ? 'Max Level' : cantRequestReason ? 'Unavailable' : 'Insufficient Funds'}
              </Button>
            )}

            {!isMaxLevel && cantRequestReason && (
              <p className="text-[10px] text-muted-foreground text-center">
                {cantRequestReason}
              </p>
            )}
            {!isMaxLevel && !canAfford && !cantRequestReason && upgradeCost !== null && (
              <p className="text-[10px] text-destructive text-center">
                Insufficient funds ({formatCurrency(upgradeCost)} required)
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function ClubPage() {
  const { clubId: routeClubId } = useParams<{ clubId?: string }>()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const staff = useGameStore((s) => s.staff)
  const settings = useGameStore((s) => s.settings)
  const ladder = useGameStore((s) => s.ladder)
  const history = useGameStore((s) => s.history)
  const manager = useGameStore((s) => s.manager)
  const facilityUpgrades = useGameStore((s) => s.facilityUpgrades)
  const currentDate = useGameStore((s) => s.currentDate)
  const matchResults = useGameStore((s) => s.matchResults)
  const inflationIndex = useGameStore((s) => s.inflationIndex ?? 1.0)
  const inflationHistory = useGameStore((s) => s.inflationHistory ?? [])
  const inflationSettings = useGameStore((s) => s.settings.inflation)
  const doRequestUpgrade = useGameStore((s) => s.requestFacilityUpgrade)
  const doUpdateBudget = useGameStore((s) => s.updateBudgetAllocation)

  const clubId = routeClubId ?? playerClubId
  const isOwnClub = clubId === playerClubId
  const club = clubs[clubId]

  // Read facilities and balance directly from store (no local state duplication)
  const facilities = club?.facilities
  const balance = club?.finances.balance ?? 0

  // Upgrade confirm dialog
  const [upgradeTarget, setUpgradeTarget] = useState<{
    facilityKey: keyof ClubFacilities
    cost: number
  } | null>(null)

  // Result banner after submitting to board
  const [upgradeResult, setUpgradeResult] = useState<{
    approved: boolean
    reason: string
    facility: string
    probability?: number
  } | null>(null)

  // -------------------------------------------------------------------------
  // Derived: facility upgrade state
  // -------------------------------------------------------------------------
  const tracker = facilityUpgrades ?? { requests: [], activeConstructionByClub: {}, denialCooldowns: {} }

  const activeConstructionRequest = useMemo(() => {
    const requestId = tracker.activeConstructionByClub[clubId]
    if (!requestId) return undefined
    return tracker.requests.find((r) => r.id === requestId)
  }, [tracker, clubId])

  const facilityUpgradeMap = useMemo(() => {
    const map: Partial<Record<keyof ClubFacilities, FacilityUpgradeRequest>> = {}
    // Find active construction for each facility of this club
    for (const req of tracker.requests) {
      if (req.clubId === clubId && req.status === 'under-construction') {
        map[req.facility] = req
      }
    }
    return map
  }, [tracker.requests, clubId])

  const facilityCanRequestMap = useMemo(() => {
    if (!club) return {} as Record<keyof ClubFacilities, { allowed: boolean; reason: string; cost: number }>
    const map = {} as Record<keyof ClubFacilities, { allowed: boolean; reason: string; cost: number }>
    for (const key of FACILITY_KEYS) {
      map[key] = canRequestUpgrade(tracker, club, key, currentDate)
    }
    return map
  }, [tracker, club, currentDate])

  const facilityApprovalMap = useMemo(() => {
    if (!club) return {} as Record<keyof ClubFacilities, number>
    const ladderIdx = ladder.findIndex((e) => e.clubId === clubId)
    const pos = ladderIdx >= 0 ? ladderIdx + 1 : 18
    const map = {} as Record<keyof ClubFacilities, number>
    for (const key of FACILITY_KEYS) {
      const cost = UPGRADE_COSTS[club.facilities[key] + 1] ?? 0
      const { probability } = computeApprovalProbability(club, key, cost, manager.jobSecurity, pos)
      map[key] = probability
    }
    return map
  }, [club, ladder, clubId, manager.jobSecurity])

  // Approval factors for dialog
  const upgradeTargetApproval = useMemo(() => {
    if (!upgradeTarget || !club) return null
    const ladderIdx = ladder.findIndex((e) => e.clubId === clubId)
    const pos = ladderIdx >= 0 ? ladderIdx + 1 : 18
    return computeApprovalProbability(club, upgradeTarget.facilityKey, upgradeTarget.cost, manager.jobSecurity, pos)
  }, [upgradeTarget, club, ladder, clubId, manager.jobSecurity])

  // -------------------------------------------------------------------------
  // Derived: players and staff for this club
  // -------------------------------------------------------------------------
  const clubPlayers = useMemo(
    () => Object.values(players).filter((p) => p.clubId === clubId),
    [players, clubId],
  )

  const clubStaff = useMemo(
    () => Object.values(staff).filter((s) => s.clubId === clubId),
    [staff, clubId],
  )

  // -------------------------------------------------------------------------
  // Derived: Facilities
  // -------------------------------------------------------------------------
  const facilityAverage = useMemo(() => {
    if (!facilities) return 0
    const sum = FACILITY_KEYS.reduce((acc, key) => acc + facilities[key], 0)
    return sum / FACILITY_KEYS.length
  }, [facilities])

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
    if (!facilities) return 0
    const totalLevels = FACILITY_KEYS.reduce(
      (sum, key) => sum + facilities[key],
      0,
    )
    return totalLevels * 100_000
  }, [facilities])

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
    const idx = ladder.findIndex((e) => e.clubId === clubId)
    return idx >= 0 ? idx + 1 : 18
  }, [ladder, clubId])

  const boardExpectation = useMemo(() => {
    if (isOwnClub && manager.seasonExpectation) return manager.seasonExpectation
    const identity = getClubIdentity(club, 2026)
    const expectationLabel = getFanExpectationLabel(identity.fanExpectation)
    if (expectationLabel === 'Premiership Contention') return 'Contend for Premiership'
    if (expectationLabel === 'Finals Qualification') return 'Finals appearance'
    if (expectationLabel === 'Visible Year-on-Year Progress') return 'Improvement'
    if (expectationLabel === 'Patience During Build') return 'Development'
    if (ladderPosition <= 4) return 'Finals appearance'
    if (ladderPosition <= 8) return 'Improvement'
    if (ladderPosition <= 14) return 'Development'
    return 'Patience'
  }, [club, isOwnClub, ladderPosition, manager.seasonExpectation])

  const jobSecurity = useMemo(() => {
    if (isOwnClub) return manager.jobSecurity
    if (ladderPosition <= 4) return 85 + (4 - ladderPosition) * 5
    if (ladderPosition <= 8) return 80 - (ladderPosition - 5) * 7
    if (ladderPosition <= 14) return 55 - (ladderPosition - 9) * 4
    return 30 - (ladderPosition - 15) * 5
  }, [isOwnClub, ladderPosition, manager.jobSecurity])

  const boardMessage = useMemo(() => {
    if (isOwnClub && manager.employmentStatus === 'unemployed') {
      return 'You are currently unemployed and can apply for vacant coaching jobs.'
    }
    const identity = getClubIdentity(club, 2026)
    const identityLabel = getClubIdentityLabel(identity.current)
    if (ladderPosition <= 2)
      return `The board is delighted with the team's performance. Keep pushing while maintaining your ${identityLabel} identity.`
    if (ladderPosition <= 4)
      return `Strong season so far. The board expects a deep finals run consistent with your ${identityLabel} profile.`
    if (ladderPosition <= 8)
      return `Solid progress. The board wants continued improvement and a finals berth from this ${identityLabel} group.`
    if (ladderPosition <= 12)
      return `Results have been mixed. The board expects a clearer identity-led plan for improvement.`
    if (ladderPosition <= 14)
      return `The board is growing impatient. They want clearer signs the ${identityLabel} pathway is working.`
    return `The board is deeply concerned about the direction of the club. Improvement is urgently needed.`
  }, [club, isOwnClub, ladderPosition, manager.employmentStatus])

  const identityInfo = useMemo(() => getClubIdentity(club, 2026), [club])
  const hallOfFameEntries = useMemo(
    () =>
      [...(club?.hallOfFame ?? [])].sort((a, b) => {
        const byScore = hallOfFameScore(b) - hallOfFameScore(a)
        if (byScore !== 0) return byScore
        return b.retiredYear - a.retiredYear
      }),
    [club?.hallOfFame],
  )

  // -------------------------------------------------------------------------
  // Derived: Budget
  // -------------------------------------------------------------------------
  const savedAllocation = useMemo(() => getClubBudgetAllocation(club), [club])
  const [draftAllocation, setDraftAllocation] = useState<ClubBudgetAllocation>(() => ({ ...savedAllocation }))
  const [budgetSaved, setBudgetSaved] = useState(false)

  // Sync draft with saved when saved changes (e.g. after save)
  const budgetTotal = draftAllocation.facilities + draftAllocation.coaching + draftAllocation.recruiting + draftAllocation.medical + draftAllocation.scouting
  const budgetValid = budgetTotal === BUDGET_TOTAL
  const budgetDirty = BUDGET_DEPARTMENTS.some((d) => draftAllocation[d] !== savedAllocation[d])

  const discretionaryBreakdown = useMemo(
    () => calculateDiscretionaryBudget(club, clubPlayers, clubStaff),
    [club, clubPlayers, clubStaff],
  )

  const budgetProjections = useMemo(
    () => projectBudgetImpacts(draftAllocation, discretionaryBreakdown.discretionary),
    [draftAllocation, discretionaryBreakdown.discretionary],
  )

  const handleBudgetSlider = useCallback((dept: BudgetDepartment, newValue: number) => {
    setDraftAllocation((prev) => ({ ...prev, [dept]: newValue }))
    setBudgetSaved(false)
  }, [])

  const handleBudgetReset = useCallback(() => {
    setDraftAllocation({ ...DEFAULT_BUDGET_ALLOCATION })
    setBudgetSaved(false)
  }, [])

  const handleBudgetSave = useCallback(() => {
    const result = doUpdateBudget(draftAllocation)
    if (result.success) {
      setBudgetSaved(true)
      setTimeout(() => setBudgetSaved(false), 2000)
    }
  }, [draftAllocation, doUpdateBudget])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleUpgradeClick = (facilityKey: keyof ClubFacilities, cost: number) => {
    setUpgradeResult(null)
    setUpgradeTarget({ facilityKey, cost })
  }

  const handleUpgradeConfirm = () => {
    if (!upgradeTarget) return
    const { facilityKey } = upgradeTarget

    const result = doRequestUpgrade(facilityKey)
    const facilityLabel = FACILITY_META[facilityKey].label

    setUpgradeResult({
      approved: result.approved,
      reason: result.reason,
      facility: facilityLabel,
      probability: result.probability,
    })
    setUpgradeTarget(null)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!facilities) return null

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
            <p className={`text-2xl font-bold tabular-nums ${balance < 0 ? 'text-red-500' : ''}`}>
              {formatCurrency(balance)}
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
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="rivalries">Rivalries</TabsTrigger>
        </TabsList>

        {/* ============================================================== */}
        {/* Facilities Tab                                                  */}
        {/* ============================================================== */}
        <TabsContent value="facilities" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Club Facilities</h2>
            <p className="text-sm text-muted-foreground">
              Upgrade your facilities to improve player development, recovery, and match preparation.
              Upgrades require board approval and take time to construct.
            </p>
          </div>

          {!isOwnClub && (
            <Badge variant="secondary" className="text-sm">
              Viewing another club — upgrades disabled
            </Badge>
          )}

          {/* Result banner */}
          {upgradeResult && isOwnClub && (
            <div className={`flex items-start gap-3 rounded-lg border p-4 ${
              upgradeResult.approved
                ? 'border-green-500/30 bg-green-500/5'
                : 'border-red-500/30 bg-red-500/5'
            }`}>
              {upgradeResult.approved ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {upgradeResult.approved
                    ? `${upgradeResult.facility} Upgrade Approved!`
                    : `${upgradeResult.facility} Upgrade Denied`}
                </p>
                <p className="text-xs text-muted-foreground">{upgradeResult.reason}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto shrink-0 text-xs"
                onClick={() => setUpgradeResult(null)}
              >
                Dismiss
              </Button>
            </div>
          )}

          {/* Active Construction Card */}
          {activeConstructionRequest && isOwnClub && (
            <Card className="border-yellow-500/50">
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-yellow-500/10 p-2">
                    <HardHat className="h-5 w-5 text-yellow-500" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Active Construction: {FACILITY_META[activeConstructionRequest.facility]?.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Level {activeConstructionRequest.fromLevel} {'\u2192'} Level {activeConstructionRequest.toLevel}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono">
                          {Math.round(activeConstructionRequest.constructionWeeksTotal - activeConstructionRequest.constructionWeeksRemaining)}/
                          {activeConstructionRequest.constructionWeeksTotal}w
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                          <Clock className="h-3 w-3" />
                          {Math.ceil(activeConstructionRequest.constructionWeeksRemaining)}w left
                        </p>
                      </div>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-yellow-500/20">
                      <div
                        className="h-full rounded-full bg-yellow-500 transition-all"
                        style={{
                          width: `${Math.max(0, Math.min(100,
                            ((activeConstructionRequest.constructionWeeksTotal - activeConstructionRequest.constructionWeeksRemaining) /
                              Math.max(1, activeConstructionRequest.constructionWeeksTotal)) * 100,
                          ))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {FACILITY_KEYS.map((key) => {
              const checkResult = facilityCanRequestMap[key]
              return (
                <FacilityCard
                  key={key}
                  facilityKey={key}
                  level={facilities[key]}
                  balance={balance}
                  onUpgrade={handleUpgradeClick}
                  readOnly={!isOwnClub}
                  activeUpgrade={facilityUpgradeMap[key]}
                  approvalProbability={facilityApprovalMap[key]}
                  canRequest={checkResult?.allowed ?? false}
                  cantRequestReason={checkResult?.allowed === false ? checkResult.reason : undefined}
                />
              )
            })}
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
                  <p className={`text-2xl font-bold tabular-nums ${balance < 0 ? 'text-red-500' : ''}`}>
                    {formatCurrency(balance)}
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

          {/* Inflation Indicator */}
          {inflationSettings?.enabled && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-500" />
                  Economic Inflation
                </CardTitle>
                <CardDescription>
                  All financial values are displayed in nominal (current-year) dollars.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs">Cumulative change</p>
                    <p className="font-semibold">{formatInflationIndex(inflationIndex)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs">Latest annual rate</p>
                    <p className="font-semibold">
                      {inflationHistory.length > 0
                        ? formatInflationRate(inflationHistory[inflationHistory.length - 1].rate)
                        : formatInflationRate(inflationSettings.baseRate)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs">Preset</p>
                    <p className="font-semibold capitalize">{inflationSettings.preset}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* Board Room Tab                                                  */}
        {/* ============================================================== */}
        <TabsContent value="boardroom" className="space-y-4">
          {!settings.realism.boardPressure && (
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
                  <p className="text-xs text-muted-foreground">
                    Identity: {getClubIdentityLabel(identityInfo.current)} ({Math.round(identityInfo.scores[identityInfo.current])}% confidence)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Fan expectation: {getFanExpectationLabel(identityInfo.fanExpectation)}
                  </p>
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

        {/* ============================================================== */}
        {/* Budget Tab                                                      */}
        {/* ============================================================== */}
        <TabsContent value="budget" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Budget Allocation</h2>
            <p className="text-sm text-muted-foreground">
              Allocate your discretionary budget across departments to influence club performance.
              Each department must receive between {MIN_DEPARTMENT_PCT}% and {MAX_DEPARTMENT_PCT}%, totalling {BUDGET_TOTAL}%.
            </p>
          </div>

          {!isOwnClub && (
            <Badge variant="secondary" className="text-sm">
              Viewing another club — budget changes disabled
            </Badge>
          )}

          {/* Discretionary budget summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Discretionary Budget
              </CardTitle>
              <CardDescription>
                Funds available after mandatory costs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">
                    {formatCurrency(discretionaryBreakdown.revenue)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Mandatory Costs</p>
                  <p className="text-lg font-bold tabular-nums text-red-500">
                    {formatCurrency(discretionaryBreakdown.totalMandatory)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Discretionary</p>
                  <p className="text-lg font-bold tabular-nums">
                    {formatCurrency(discretionaryBreakdown.discretionary)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Allocation Status</p>
                  <Badge variant={budgetValid ? 'default' : 'destructive'} className="text-xs">
                    {budgetTotal}% / {BUDGET_TOTAL}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Allocation sliders */}
          <Card>
            <CardHeader>
              <CardTitle>Department Allocations</CardTitle>
              <CardDescription>
                Drag sliders to set each department's share of the discretionary budget
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {BUDGET_DEPARTMENTS.map((dept) => {
                const meta = DEPARTMENT_META[dept]
                const Icon = DEPT_ICON_MAP[dept]
                const pct = draftAllocation[dept]
                const dollarAmount = Math.round(discretionaryBreakdown.discretionary * (pct / 100))

                return (
                  <div key={dept} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{meta.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {formatCurrency(dollarAmount)}
                        </span>
                        <Badge variant="outline" className="font-mono text-xs min-w-[3.5rem] justify-center">
                          {pct}%
                        </Badge>
                      </div>
                    </div>
                    <Slider
                      min={MIN_DEPARTMENT_PCT}
                      max={MAX_DEPARTMENT_PCT}
                      step={1}
                      value={[pct]}
                      onValueChange={([v]) => handleBudgetSlider(dept, v)}
                      disabled={!isOwnClub}
                    />
                    <p className="text-[10px] text-muted-foreground">{meta.description}</p>
                  </div>
                )
              })}

              {/* Total bar */}
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total Allocation</span>
                  <span className={`text-sm font-bold tabular-nums ${
                    budgetValid ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                  }`}>
                    {budgetTotal}%
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      budgetValid ? 'bg-green-500'
                        : budgetTotal < BUDGET_TOTAL ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(budgetTotal, 100)}%` }}
                  />
                </div>
                {!budgetValid && (
                  <p className="text-xs text-red-500">
                    {budgetTotal < BUDGET_TOTAL
                      ? `${BUDGET_TOTAL - budgetTotal}% unallocated — distribute remaining points`
                      : `${budgetTotal - BUDGET_TOTAL}% over budget — reduce allocations`}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              {isOwnClub && (
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBudgetReset}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Reset to Default
                  </Button>
                  <Button
                    size="sm"
                    disabled={!budgetValid || !budgetDirty}
                    onClick={handleBudgetSave}
                  >
                    <Save className="mr-1 h-3 w-3" />
                    {budgetSaved ? 'Saved!' : 'Save Allocation'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Projected impacts grid */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Projected Impacts</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {budgetProjections.map((proj) => {
                const meta = DEPARTMENT_META[proj.department]
                const Icon = DEPT_ICON_MAP[proj.department]
                const isPositive = proj.multiplier >= 1.0
                const isNeutral = proj.multiplier === 1.0

                return (
                  <Card key={proj.department}>
                    <CardContent className="py-3 px-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-medium">{meta.label}</span>
                        </div>
                        <Badge
                          variant={isNeutral ? 'secondary' : isPositive ? 'default' : 'destructive'}
                          className="text-[10px] font-mono"
                        >
                          {proj.multiplier.toFixed(2)}x
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {proj.effects.map((eff, i) => (
                          <div key={i} className="flex items-center gap-1 text-[11px]">
                            {eff.positive ? (
                              <ArrowUp className="h-3 w-3 text-green-500 shrink-0" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-red-500 shrink-0" />
                            )}
                            <span className="text-muted-foreground">{eff.label}:</span>
                            <span className={eff.positive ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                              {eff.delta}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* ============================================================== */}
        {/* History Tab                                                     */}
        {/* ============================================================== */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                Club Hall of Fame
              </CardTitle>
              <CardDescription>
                Retired club greats inducted for exceptional careers.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {hallOfFameEntries.length === 0 ? (
                <div className="px-6 py-8 text-sm text-muted-foreground">
                  No Hall of Fame inductees yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Pos</TableHead>
                      <TableHead className="text-right">Games</TableHead>
                      <TableHead className="text-right">Goals</TableHead>
                      <TableHead className="text-right">Retired</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hallOfFameEntries.map((entry) => (
                      <TableRow key={entry.playerId}>
                        <TableCell className="font-medium">{entry.playerName}</TableCell>
                        <TableCell>{entry.primaryPosition}</TableCell>
                        <TableCell className="text-right font-mono">{entry.gamesPlayed}</TableCell>
                        <TableCell className="text-right font-mono">{entry.goals}</TableCell>
                        <TableCell className="text-right font-mono">{entry.retiredYear}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {history.seasons.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Trophy className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-medium">No history yet</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  Complete a season to see premiership history.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Dynasty Stats */}
              {(() => {
                const dynasty = getDynastyStats(history, clubId)
                return (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-yellow-500" />
                        Club Dynasty
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-2xl font-bold">{dynasty.totalPremierships}</p>
                          <p className="text-xs text-muted-foreground">Premierships</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-2xl font-bold">{dynasty.consecutivePremierships}</p>
                          <p className="text-xs text-muted-foreground">Current Streak</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-2xl font-bold">{dynasty.maxConsecutivePremierships}</p>
                          <p className="text-xs text-muted-foreground">Best Streak</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-2xl font-bold">{dynasty.topFourAppearances}</p>
                          <p className="text-xs text-muted-foreground">Top 4 Finishes</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })()}

              {/* Premiership List */}
              <Card>
                <CardHeader>
                  <CardTitle>Premiership History</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead>Premier</TableHead>
                        <TableHead>Runner-Up</TableHead>
                        <TableHead className="text-right">GF Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...history.seasons].reverse().map((season) => {
                        const isUserPremier = season.premierClubId === clubId
                        const isUserRunnerUp = season.runnerUpClubId === clubId
                        return (
                          <TableRow
                            key={season.year}
                            className={isUserPremier ? 'bg-yellow-500/10' : isUserRunnerUp ? 'bg-accent' : ''}
                          >
                            <TableCell className="font-mono">{season.year}</TableCell>
                            <TableCell className="font-medium">
                              {clubs[season.premierClubId]?.name ?? season.premierClubId}
                              {isUserPremier && (
                                <Badge variant="secondary" className="ml-2 text-xs">You</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {clubs[season.runnerUpClubId]?.name ?? season.runnerUpClubId}
                              {isUserRunnerUp && (
                                <Badge variant="secondary" className="ml-2 text-xs">You</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {season.grandFinalScore.home} - {season.grandFinalScore.away}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* Rivalries Tab                                                   */}
        {/* ============================================================== */}
        <TabsContent value="rivalries" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Club Rivalries</h2>
            <p className="text-sm text-muted-foreground">
              Rivalry matches generate larger attendance, greater fan sentiment swings, and more board scrutiny.
            </p>
          </div>

          {/* Fan Satisfaction Card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-rose-500" />
                <CardTitle className="text-sm font-medium">Fan Sentiment</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const fanSat = club?.fanSatisfaction ?? 60
                const label = fanSat >= 75 ? 'Ecstatic' : fanSat >= 60 ? 'Happy' : fanSat >= 45 ? 'Neutral' : fanSat >= 30 ? 'Frustrated' : 'Angry'
                const barColor = fanSat >= 75 ? 'bg-green-500' : fanSat >= 60 ? 'bg-emerald-400' : fanSat >= 45 ? 'bg-yellow-400' : fanSat >= 30 ? 'bg-orange-500' : 'bg-red-600'
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Supporter Mood</span>
                      <span className="font-semibold">{label} ({fanSat}/100)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${fanSat}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Rivalry wins boost fan satisfaction by +3 (vs +1 for normal wins). Rivalry losses drop it by -3.
                    </p>
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* Rivals H2H This Season */}
          {(() => {
            const rivalIds = club?.rivalryClubIds ?? []
            if (rivalIds.length === 0) {
              return (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center gap-2 py-4 text-center text-muted-foreground">
                      <Swords className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No rivalries configured for this club.</p>
                      <p className="text-xs">Set up rivalries in Game Settings to enable rivalry effects.</p>
                    </div>
                  </CardContent>
                </Card>
              )
            }

            return (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Head-to-Head This Season</h3>
                {rivalIds.map((rivalId) => {
                  const rival = clubs[rivalId]
                  if (!rival) return null

                  // Compute H2H from matchResults
                  const h2hMatches = matchResults.filter((m) =>
                    m.result &&
                    ((m.homeClubId === clubId && m.awayClubId === rivalId) ||
                     (m.awayClubId === clubId && m.homeClubId === rivalId)),
                  )

                  let wins = 0, losses = 0, draws = 0
                  let pointsFor = 0, pointsAgainst = 0
                  for (const m of h2hMatches) {
                    if (!m.result) continue
                    const isHome = m.homeClubId === clubId
                    const myScore = isHome ? m.result.homeTotalScore : m.result.awayTotalScore
                    const theirScore = isHome ? m.result.awayTotalScore : m.result.homeTotalScore
                    pointsFor += myScore
                    pointsAgainst += theirScore
                    if (myScore > theirScore) wins++
                    else if (myScore < theirScore) losses++
                    else draws++
                  }

                  const played = wins + losses + draws
                  const avgFor = played > 0 ? (pointsFor / played).toFixed(0) : '—'
                  const avgAgainst = played > 0 ? (pointsAgainst / played).toFixed(0) : '—'

                  return (
                    <Card key={rivalId}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-8 w-8 rounded-full border-2"
                              style={{ backgroundColor: rival.colors.primary, borderColor: rival.colors.secondary }}
                            />
                            <div>
                              <p className="font-semibold text-sm">{rival.fullName}</p>
                              <p className="text-xs text-muted-foreground">{rival.homeGround}</p>
                            </div>
                          </div>

                          {played === 0 ? (
                            <p className="text-xs text-muted-foreground">Not yet played</p>
                          ) : (
                            <div className="flex items-center gap-4 text-sm">
                              <div className="text-center">
                                <p className="font-bold text-green-500">{wins}</p>
                                <p className="text-[10px] text-muted-foreground">W</p>
                              </div>
                              <div className="text-center">
                                <p className="font-bold text-yellow-500">{draws}</p>
                                <p className="text-[10px] text-muted-foreground">D</p>
                              </div>
                              <div className="text-center">
                                <p className="font-bold text-red-500">{losses}</p>
                                <p className="text-[10px] text-muted-foreground">L</p>
                              </div>
                              <div className="border-l pl-4 text-center">
                                <p className="font-semibold text-xs">{avgFor} / {avgAgainst}</p>
                                <p className="text-[10px] text-muted-foreground">Avg PF / PA</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Recent H2H results */}
                        {h2hMatches.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {h2hMatches.slice(-3).map((m) => {
                              if (!m.result) return null
                              const isHome = m.homeClubId === clubId
                              const myScore = isHome ? m.result.homeTotalScore : m.result.awayTotalScore
                              const theirScore = isHome ? m.result.awayTotalScore : m.result.homeTotalScore
                              const won = myScore > theirScore
                              const isDraw = myScore === theirScore
                              return (
                                <div key={m.id} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                                  <span className="text-muted-foreground">Rd {m.round} ({isHome ? 'H' : 'A'})</span>
                                  <span className={`font-semibold ${won ? 'text-green-500' : isDraw ? 'text-yellow-500' : 'text-red-500'}`}>
                                    {won ? 'W' : isDraw ? 'D' : 'L'} {myScore}-{theirScore}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )
          })()}
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------------------------ */}
      {/* Upgrade Confirmation Dialog (Board Approval)                        */}
      {/* ------------------------------------------------------------------ */}
      <Dialog
        open={upgradeTarget !== null}
        onOpenChange={(open) => { if (!open) setUpgradeTarget(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Facility Upgrade</DialogTitle>
            <DialogDescription>
              Submit this upgrade proposal to the board for approval.
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
                    Level {facilities[upgradeTarget.facilityKey]} {'\u2192'}{' '}
                    Level {facilities[upgradeTarget.facilityKey] + 1}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    Cost: {formatCurrency(upgradeTarget.cost)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Balance after: {formatCurrency(balance - upgradeTarget.cost)}
                  </p>
                </div>
              </div>

              {/* Board Approval Probability */}
              {upgradeTargetApproval && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Board Approval Probability</p>
                    <span className={`text-lg font-bold tabular-nums ${approvalColor(upgradeTargetApproval.probability)}`}>
                      {Math.round(upgradeTargetApproval.probability)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${
                        upgradeTargetApproval.probability >= 70
                          ? 'bg-green-500'
                          : upgradeTargetApproval.probability >= 40
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${upgradeTargetApproval.probability}%` }}
                    />
                  </div>
                  <div className="space-y-1 mt-2">
                    {upgradeTargetApproval.factors
                      .filter((f) => f.label !== 'Base probability')
                      .map((factor, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{factor.label}</span>
                          <span className={factor.modifier > 0 ? 'text-green-600 dark:text-green-400' : factor.modifier < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}>
                            {factor.modifier > 0 ? '+' : ''}{factor.modifier}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                <p className="text-sm">
                  This upgrade will improve{' '}
                  <span className="font-medium">
                    {FACILITY_META[upgradeTarget.facilityKey].impactLabel.toLowerCase()}
                  </span>{' '}
                  from +
                  {facilities[upgradeTarget.facilityKey] *
                    FACILITY_META[upgradeTarget.facilityKey].bonusPerLevel}
                  % to +
                  {(facilities[upgradeTarget.facilityKey] + 1) *
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
              Submit to Board
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
