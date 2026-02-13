import { useMemo, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import type { StaffMember, StaffRole, StaffRatings } from '@/types/staff'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, UserPlus } from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants (duplicated from StaffPage – small display-only values)
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

const ALL_ROLES: StaffRole[] = [
  'head-coach',
  'assistant-coach',
  'forwards-coach',
  'midfield-coach',
  'ruck-coach',
  'defensive-coach',
  'strength-conditioning',
  'reserves-coach',
]

type SortOption = 'ovr' | 'salary' | 'age' | 'tactical' | 'development' | 'gameDay' | 'fitness'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'ovr', label: 'Overall Rating' },
  { value: 'salary', label: 'Salary' },
  { value: 'age', label: 'Age' },
  { value: 'tactical', label: 'Tactical' },
  { value: 'development', label: 'Development' },
  { value: 'gameDay', label: 'Game Day' },
  { value: 'fitness', label: 'Fitness' },
]

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

function getSortValue(s: StaffMember, sort: SortOption): number {
  if (sort === 'ovr') return getOverallRating(s.ratings)
  if (sort === 'salary') return s.salary
  if (sort === 'age') return s.age
  return s.ratings[sort]
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

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function StaffHiringPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const staff = useGameStore((s) => s.staff)
  const hireStaffMember = useGameStore((s) => s.hireStaffMember)

  // Role filter from URL param
  const roleParam = searchParams.get('role') as StaffRole | null
  const roleFilter = roleParam && ALL_ROLES.includes(roleParam) ? roleParam : 'all'

  const [sortBy, setSortBy] = useState<SortOption>('ovr')
  const [contractYears, setContractYears] = useState<Record<string, number>>({})

  // Free agents filtered & sorted
  const candidates = useMemo(() => {
    let list = Object.values(staff).filter((s) => s.clubId === '')
    if (roleFilter !== 'all') {
      list = list.filter((s) => s.role === roleFilter)
    }
    return list.sort((a, b) => {
      const av = getSortValue(a, sortBy)
      const bv = getSortValue(b, sortBy)
      // Age sorts ascending, everything else descending
      return sortBy === 'age' ? av - bv : bv - av
    })
  }, [staff, roleFilter, sortBy])

  const handleRoleChange = useCallback(
    (value: string) => {
      if (value === 'all') {
        searchParams.delete('role')
      } else {
        searchParams.set('role', value)
      }
      setSearchParams(searchParams, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const handleHire = useCallback(
    (candidate: StaffMember) => {
      const years = contractYears[candidate.id] ?? 2
      hireStaffMember(candidate.id, years)
      navigate('/staff')
    },
    [contractYears, hireStaffMember, navigate],
  )

  const handleContractYearChange = useCallback((candidateId: string, years: string) => {
    setContractYears((prev) => ({ ...prev, [candidateId]: Number(years) }))
  }, [])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/staff')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Hire Coaching Staff</h1>
          <p className="text-sm text-muted-foreground">
            {candidates.length} candidate{candidates.length !== 1 ? 's' : ''} available
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={roleFilter} onValueChange={handleRoleChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ALL_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_DISPLAY_NAMES[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Candidate List */}
      {candidates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No candidates available for this role.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {candidates.map((candidate) => {
            const ovr = getOverallRating(candidate.ratings)
            const years = contractYears[candidate.id] ?? 2

            return (
              <Card key={candidate.id}>
                <CardContent className="p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">
                          {candidate.firstName} {candidate.lastName}
                        </p>
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${overallBadgeClass(ovr)}`}
                        >
                          {ovr}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Age {candidate.age}</span>
                        <Badge variant="outline" className="text-xs">
                          {ROLE_DISPLAY_NAMES[candidate.role]}
                        </Badge>
                        <span className="font-medium">{formatSalary(candidate.salary)}/yr</span>
                      </div>
                      <PhilosophyBadge philosophy={candidate.philosophy} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={String(years)}
                        onValueChange={(v) => handleContractYearChange(candidate.id, v)}
                      >
                        <SelectTrigger className="w-[80px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 yr</SelectItem>
                          <SelectItem value="2">2 yr</SelectItem>
                          <SelectItem value="3">3 yr</SelectItem>
                          <SelectItem value="4">4 yr</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 text-xs" onClick={() => handleHire(candidate)}>
                        <UserPlus className="mr-1 h-3 w-3" />
                        Hire
                      </Button>
                    </div>
                  </div>

                  {/* Rating bars */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                    {RATING_KEYS.map((key) => (
                      <RatingBar key={key} label={RATING_LABELS[key]} value={candidate.ratings[key]} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
