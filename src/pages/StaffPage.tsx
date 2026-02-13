import { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import type { StaffMember, StaffRole, StaffRatings } from '@/types/staff'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Users,
  DollarSign,
  AlertTriangle,
  Star,
  UserMinus,
  UserPlus,
  Trophy,
  Dumbbell,
  Heart,
  TrendingUp,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_DISPLAY_NAMES: Record<StaffRole, string> = {
  'head-coach': 'Head Coach',
  'assistant-coach': 'Assistant Coach',
  'forwards-coach': 'Forwards Coach',
  'midfield-coach': 'Midfield Coach',
  'ruck-coach': 'Ruck Coach',
  'defensive-coach': 'Defensive Coach',
  'strength-conditioning': 'S&C Coach',
  'reserves-coach': 'Reserves Coach',
}

/** All 10 coaching positions in display order (assistant-coach appears 3 times) */
const ALL_POSITIONS: { role: StaffRole; slotIndex: number }[] = [
  { role: 'head-coach', slotIndex: 0 },
  { role: 'assistant-coach', slotIndex: 0 },
  { role: 'assistant-coach', slotIndex: 1 },
  { role: 'assistant-coach', slotIndex: 2 },
  { role: 'forwards-coach', slotIndex: 0 },
  { role: 'midfield-coach', slotIndex: 0 },
  { role: 'ruck-coach', slotIndex: 0 },
  { role: 'defensive-coach', slotIndex: 0 },
  { role: 'strength-conditioning', slotIndex: 0 },
  { role: 'reserves-coach', slotIndex: 0 },
]

const RATING_LABELS: Record<keyof StaffRatings, string> = {
  tactical: 'Tactical',
  manManagement: 'Man Management',
  development: 'Development',
  gameDay: 'Game Day',
  recruitment: 'Recruitment',
  fitness: 'Fitness',
  discipline: 'Discipline',
}

const RATING_KEYS: (keyof StaffRatings)[] = [
  'tactical',
  'manManagement',
  'development',
  'gameDay',
  'recruitment',
  'fitness',
  'discipline',
]

const PHILOSOPHY_COLORS: Record<StaffMember['philosophy'], string> = {
  attacking: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  defensive: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  balanced: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  development: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSalary(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}m`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`
  return `$${value.toLocaleString('en-AU')}`
}

function getOverallRating(ratings: StaffRatings): number {
  const sum = RATING_KEYS.reduce((acc, key) => acc + ratings[key], 0)
  return Math.round(sum / RATING_KEYS.length)
}

function ratingBarColor(value: number): string {
  if (value >= 70) return 'bg-green-500'
  if (value >= 50) return 'bg-yellow-500'
  if (value >= 30) return 'bg-orange-500'
  return 'bg-red-500'
}

function ratingTextColor(value: number): string {
  if (value >= 70) return 'text-green-600 dark:text-green-400'
  if (value >= 50) return 'text-yellow-600 dark:text-yellow-400'
  if (value >= 30) return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

function overallBadgeClass(ovr: number): string {
  if (ovr >= 70) return 'bg-green-500 text-white'
  if (ovr >= 50) return 'bg-yellow-500 text-black'
  if (ovr >= 30) return 'bg-orange-500 text-white'
  return 'bg-red-500 text-white'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RatingBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-[100px] truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${ratingBarColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-7 text-right ${ratingTextColor(value)}`}>
        {value}
      </span>
    </div>
  )
}

function PhilosophyBadge({ philosophy }: { philosophy: StaffMember['philosophy'] }) {
  return (
    <Badge variant="outline" className={`text-xs capitalize ${PHILOSOPHY_COLORS[philosophy]}`}>
      {philosophy}
    </Badge>
  )
}

function StaffPositionCard({
  role,
  slotLabel,
  member,
  onFire,
  onHire,
}: {
  role: StaffRole
  slotLabel: string
  member: StaffMember | null
  onFire: (member: StaffMember) => void
  onHire: (role: StaffRole) => void
}) {
  const ovr = member ? getOverallRating(member.ratings) : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{slotLabel}</CardTitle>
          <Badge variant="outline" className="text-xs">
            {ROLE_DISPLAY_NAMES[role]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {member ? (
          <div className="space-y-3">
            {/* Name and overview row */}
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="font-semibold">
                  {member.firstName} {member.lastName}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Age {member.age}</span>
                  <span>{member.contractYears}yr contract</span>
                  <span className="font-medium">{formatSalary(member.salary)}</span>
                </div>
                <PhilosophyBadge philosophy={member.philosophy} />
              </div>
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${overallBadgeClass(ovr)}`}
                >
                  {ovr}
                </div>
                <span className="text-[10px] text-muted-foreground">OVR</span>
              </div>
            </div>

            {/* Rating bars */}
            <div className="space-y-1.5">
              {RATING_KEYS.map((key) => (
                <RatingBar key={key} label={RATING_LABELS[key]} value={member.ratings[key]} />
              ))}
            </div>

            {/* Fire button */}
            <Button
              variant="destructive"
              size="sm"
              className="w-full text-xs"
              onClick={() => onFire(member)}
            >
              <UserMinus className="mr-1 h-3 w-3" />
              Fire Coach
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 space-y-3">
            <Badge variant="outline" className="border-dashed text-muted-foreground">
              VACANT
            </Badge>
            <p className="text-xs text-muted-foreground text-center">
              No coach assigned to this position
            </p>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => onHire(role)}
            >
              <UserPlus className="mr-1 h-3 w-3" />
              Hire Coach
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CoachingImpactCard({ clubStaff }: { clubStaff: StaffMember[] }) {
  const bonuses = useMemo(() => {
    if (clubStaff.length === 0) {
      return { development: 0, matchDay: 0, fitness: 0, morale: 0 }
    }

    // Development Bonus: average of all staff development ratings
    const avgDevelopment =
      clubStaff.reduce((sum, s) => sum + s.ratings.development, 0) / clubStaff.length

    // Match Day Bonus: head coach tactical + game day (average if found, else 0)
    const headCoach = clubStaff.find((s) => s.role === 'head-coach')
    const matchDay = headCoach
      ? (headCoach.ratings.tactical + headCoach.ratings.gameDay) / 2
      : 0

    // Fitness Bonus: S&C coach fitness rating
    const scCoach = clubStaff.find((s) => s.role === 'strength-conditioning')
    const fitness = scCoach ? scCoach.ratings.fitness : 0

    // Morale Bonus: average man management rating across all staff
    const avgManManagement =
      clubStaff.reduce((sum, s) => sum + s.ratings.manManagement, 0) / clubStaff.length

    return {
      development: Math.round(avgDevelopment),
      matchDay: Math.round(matchDay),
      fitness: Math.round(fitness),
      morale: Math.round(avgManManagement),
    }
  }, [clubStaff])

  const items = [
    { label: 'Development Bonus', value: bonuses.development, icon: TrendingUp },
    { label: 'Match Day Bonus', value: bonuses.matchDay, icon: Trophy },
    { label: 'Fitness Bonus', value: bonuses.fitness, icon: Dumbbell },
    { label: 'Morale Bonus', value: bonuses.morale, icon: Heart },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coaching Impact</CardTitle>
        <CardDescription>
          Calculated bonuses from your current coaching staff
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm">
                  <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{item.label}</span>
                </div>
                <span className={`text-sm font-bold tabular-nums ${ratingTextColor(item.value)}`}>
                  {item.value}%
                </span>
              </div>
              <Progress value={item.value} className="h-2" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function StaffPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const staff = useGameStore((s) => s.staff)
  const clubs = useGameStore((s) => s.clubs)
  const fireStaffMember = useGameStore((s) => s.fireStaffMember)

  const club = clubs[playerClubId]

  // Fire confirmation dialog state
  const [fireTarget, setFireTarget] = useState<StaffMember | null>(null)

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const allStaffList = useMemo(() => Object.values(staff), [staff])

  const clubStaff = useMemo(
    () => allStaffList.filter((s) => s.clubId === playerClubId),
    [allStaffList, playerClubId],
  )

  const totalWageBill = useMemo(
    () => clubStaff.reduce((sum, s) => sum + s.salary, 0),
    [clubStaff],
  )

  const vacantCount = useMemo(() => {
    // Count how many of the 10 slots are unfilled
    let filled = 0
    for (const pos of ALL_POSITIONS) {
      const matches = clubStaff.filter((s) => s.role === pos.role)
      if (pos.role === 'assistant-coach') {
        if (matches.length > pos.slotIndex) filled++
      } else {
        if (matches.length > 0) filled++
      }
    }
    return ALL_POSITIONS.length - filled
  }, [clubStaff])

  const staffCount = ALL_POSITIONS.length - vacantCount

  const avgRating = useMemo(() => {
    if (clubStaff.length === 0) return 0
    const sum = clubStaff.reduce((acc, s) => acc + getOverallRating(s.ratings), 0)
    return Math.round(sum / clubStaff.length)
  }, [clubStaff])

  /** Map each position slot to its assigned staff member (or null) */
  const positionAssignments = useMemo(() => {
    const roleStaffMap: Record<StaffRole, StaffMember[]> = {
      'head-coach': [],
      'assistant-coach': [],
      'forwards-coach': [],
      'midfield-coach': [],
      'ruck-coach': [],
      'defensive-coach': [],
      'strength-conditioning': [],
      'reserves-coach': [],
    }
    for (const s of clubStaff) {
      roleStaffMap[s.role].push(s)
    }

    return ALL_POSITIONS.map((pos) => {
      const members = roleStaffMap[pos.role]
      const member = pos.role === 'assistant-coach'
        ? members[pos.slotIndex] ?? null
        : members[0] ?? null
      const label =
        pos.role === 'assistant-coach'
          ? `${ROLE_DISPLAY_NAMES[pos.role]} ${pos.slotIndex + 1}`
          : ROLE_DISPLAY_NAMES[pos.role]
      return { ...pos, member, label }
    })
  }, [clubStaff])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleFireConfirm = useCallback(() => {
    if (!fireTarget) return
    fireStaffMember(fireTarget.id)
    setFireTarget(null)
  }, [fireTarget, fireStaffMember])

  const handleHire = useCallback(
    (role: StaffRole) => {
      navigate(`/staff/hire?role=${role}`)
    },
    [navigate],
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Coaching Staff</h1>
        <p className="text-sm text-muted-foreground">
          {club?.fullName ?? 'Your Club'} — Total wage bill: {formatSalary(totalWageBill)}
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Summary Cards Row                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5" />
              Staff Count
            </div>
            <p className="text-2xl font-bold">
              {staffCount}{' '}
              <span className="text-sm font-normal text-muted-foreground">/ 10</span>
            </p>
            <p className="text-xs text-muted-foreground">positions filled</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              Wage Bill
            </div>
            <p className="text-2xl font-bold tabular-nums">{formatSalary(totalWageBill)}</p>
            <p className="text-xs text-muted-foreground">annual salary</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Vacant Positions
            </div>
            <p className={`text-2xl font-bold ${vacantCount > 0 ? 'text-yellow-500' : ''}`}>
              {vacantCount}
            </p>
            <p className="text-xs text-muted-foreground">unfilled roles</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Star className="h-3.5 w-3.5" />
              Avg Rating
            </div>
            <p className={`text-2xl font-bold ${ratingTextColor(avgRating)}`}>
              {clubStaff.length > 0 ? avgRating : '--'}
            </p>
            <p className="text-xs text-muted-foreground">overall average</p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Staff Roster                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Staff Roster</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {positionAssignments.map((pos, idx) => (
            <StaffPositionCard
              key={`${pos.role}-${pos.slotIndex}-${idx}`}
              role={pos.role}
              slotLabel={pos.label}
              member={pos.member}
              onFire={setFireTarget}
              onHire={handleHire}
            />
          ))}
        </div>
      </div>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Coaching Impact Card                                                */}
      {/* ------------------------------------------------------------------ */}
      <CoachingImpactCard clubStaff={clubStaff} />

      {/* ------------------------------------------------------------------ */}
      {/* Fire Confirmation Dialog                                            */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={fireTarget !== null} onOpenChange={(open) => { if (!open) setFireTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fire Coach</DialogTitle>
            <DialogDescription>
              Are you sure you want to fire this coaching staff member?
            </DialogDescription>
          </DialogHeader>
          {fireTarget && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-semibold">
                    {fireTarget.firstName} {fireTarget.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {ROLE_DISPLAY_NAMES[fireTarget.role]}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm">
                    Contract: {fireTarget.contractYears} year{fireTarget.contractYears !== 1 ? 's' : ''} remaining
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Salary: {formatSalary(fireTarget.salary)}/yr
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">
                  Severance payout: {formatSalary(fireTarget.salary * fireTarget.contractYears)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on {formatSalary(fireTarget.salary)} x {fireTarget.contractYears} year{fireTarget.contractYears !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFireTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleFireConfirm}>
              Confirm Termination
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
