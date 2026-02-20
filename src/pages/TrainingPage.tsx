import { useMemo, useState, useCallback, useEffect } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { Player, PlayerPositionType, PlayerTrainingFocus } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import type { TrainingGroup, TrainingWeekPlan } from '@/engine/training/trainingEngine'
import { getDefaultTrainingWeekPlan } from '@/engine/training/trainingEngine'
import {
  PLAYER_TRAINING_FOCUS_LABELS,
  PLAYER_TRAINING_FOCUS_OPTIONS,
} from '@/engine/players/trainingFocus'
import { addDays } from '@/engine/calendar/calendarEngine'
import { getTrainingInjuryRisk } from '@/engine/players/trainingInjuries'
import { getMedicalStaffImpact } from '@/engine/staff/staffEngine'
import { computeProjectionContext } from '@/lib/trainingProjection'
import { TrainingProjectionPanel } from '@/components/training/TrainingProjectionPanel'
import type { Club } from '@/types/club'
import { WeekPlannerGrid } from '@/components/training/WeekPlannerGrid'
import { WeekLoadSummary } from '@/components/training/WeekLoadSummary'
import { EnhancedSquadFitness } from '@/components/training/EnhancedSquadFitness'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  Dumbbell,
  Activity,
  Sparkles,
  Target,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

function getMatchDateForRound(
  season: { rounds: { fixtures: { homeClubId: string; awayClubId: string; matchDay?: string }[]; byeClubIds: string[] }[] },
  currentRound: number,
  playerClubId: string,
  seasonStartDate: string,
): string | null {
  const round = season.rounds[currentRound]
  if (!round) return null
  if (round.byeClubIds?.includes(playerClubId)) return null

  const baseDate = addDays(seasonStartDate, currentRound * 7)
  const fixture = round.fixtures.find(
    (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  )
  if (!fixture) return baseDate

  const MATCH_DAY_OFFSETS: Record<string, number> = {
    Thursday: 3,
    Friday: 4,
    'Saturday-Early': 5,
    'Saturday-Afternoon': 5,
    'Saturday-Twilight': 5,
    'Saturday-Night': 5,
    'Sunday-Early': 6,
    'Sunday-Afternoon': 6,
    'Sunday-Twilight': 6,
  }

  if (fixture.matchDay) {
    const offset = MATCH_DAY_OFFSETS[fixture.matchDay] ?? 5
    return addDays(baseDate, offset)
  }

  return addDays(baseDate, 5)
}

function fitnessColor(val: number): string {
  if (val >= 75) return 'text-green-600 dark:text-green-400'
  if (val >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}


const POSITION_LABELS: Record<PlayerPositionType, string> = {
  BP: 'Back Pocket',
  FB: 'Full Back',
  HBF: 'Half Back Flank',
  CHB: 'Centre Half Back',
  W: 'Wing',
  IM: 'Inside Mid',
  OM: 'Outside Mid',
  RK: 'Ruckman',
  HFF: 'Half Forward Flank',
  CHF: 'Centre Half Forward',
  FP: 'Forward Pocket',
  FF: 'Full Forward',
}

const ALL_POSITION_TYPES: PlayerPositionType[] = ['BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF']

type UpskillTypeFilter = 'all' | 'position' | 'skill'
type UpskillStatusFilter = 'all' | 'active' | 'completed' | 'cancelled' | 'idle'
type UpskillProgressFilter = 'all' | 'gt0' | 'gt25' | 'gt50' | 'gt75' | 'completed'
type UpskillSort = 'progress-desc' | 'progress-asc' | 'name' | 'age'

function EnhancedWeekPlanner({
  clubPlayers,
  clubStaff,
}: {
  clubPlayers: Player[]
  clubStaff: Record<string, StaffMember>
}) {
  const currentDate = useGameStore((s) => s.currentDate)
  const season = useGameStore((s) => s.season)
  const currentRound = useGameStore((s) => s.currentRound)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const settings = useGameStore((s) => s.settings)
  const trainingWeekPlan = useGameStore((s) => s.trainingWeekPlan)
  const setTrainingWeekPlan = useGameStore((s) => s.setTrainingWeekPlan)
  const updateTrainingSlotGroups = useGameStore((s) => s.updateTrainingSlotGroups)

  const monday = getWeekStart(currentDate)
  const weekDates = useMemo(() => getWeekDates(monday), [monday])

  const matchDate = useMemo(
    () => getMatchDateForRound(season, currentRound, playerClubId, settings.seasonStartDate),
    [season, currentRound, playerClubId, settings.seasonStartDate],
  )

  useEffect(() => {
    if (!trainingWeekPlan) {
      const defaultPlan = getDefaultTrainingWeekPlan(weekDates, matchDate)
      setTrainingWeekPlan(defaultPlan)
    }
  }, [trainingWeekPlan, weekDates, matchDate, setTrainingWeekPlan])

  const plan = trainingWeekPlan ?? getDefaultTrainingWeekPlan(weekDates, matchDate)

  const handleUpdateSlotGroups = useCallback(
    (date: string, slot: 'morning' | 'afternoon', groups: TrainingGroup[]) => {
      updateTrainingSlotGroups(date, slot, groups)
    },
    [updateTrainingSlotGroups],
  )

  const handleAutoFill = useCallback(() => {
    const defaultPlan = getDefaultTrainingWeekPlan(weekDates, matchDate)
    setTrainingWeekPlan(defaultPlan)
  }, [weekDates, matchDate, setTrainingWeekPlan])

  const handleClear = useCallback(() => {
    const emptyPlan: TrainingWeekPlan = {
      slots: Object.fromEntries(
        weekDates.map((date) => [
          date,
          { morning: { groups: [] }, afternoon: { groups: [] } },
        ]),
      ),
      matchDate,
    }
    setTrainingWeekPlan(emptyPlan)
  }, [weekDates, matchDate, setTrainingWeekPlan])

  return (
    <div className="space-y-4">
      <WeekLoadSummary plan={plan} onAutoFill={handleAutoFill} onClear={handleClear} />
      <div className="overflow-x-auto">
        <WeekPlannerGrid
          plan={plan}
          weekDates={weekDates}
          matchDate={matchDate}
          clubPlayers={clubPlayers}
          clubStaff={clubStaff}
          onUpdateSlotGroups={handleUpdateSlotGroups}
        />
      </div>
    </div>
  )
}

function UpskillingTab({ clubPlayers }: { clubPlayers: Player[] }) {
  const startPlayerUpskill = useGameStore((s) => s.startPlayerUpskill)
  const cancelPlayerUpskill = useGameStore((s) => s.cancelPlayerUpskill)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<UpskillTypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<UpskillStatusFilter>('all')
  const [progressFilter, setProgressFilter] = useState<UpskillProgressFilter>('all')
  const [sortBy, setSortBy] = useState<UpskillSort>('progress-desc')
  const [positionTargets, setPositionTargets] = useState<Partial<Record<string, PlayerPositionType>>>({})
  const [skillTargets, setSkillTargets] = useState<Partial<Record<string, PlayerTrainingFocus>>>({})

  const rows = useMemo(() => {
    const mapped = clubPlayers.map((player) => {
      const plans = player.upskillPlans ?? []
      const activePosition = plans.find((p) => p.status === 'active' && p.type === 'position')
      const activeSkill = plans.find((p) => p.status === 'active' && p.type === 'skill')
      const latestPlan = [...plans].sort((a, b) => b.updatedDate.localeCompare(a.updatedDate))[0]
      const progress = Math.max(activePosition?.progress ?? 0, activeSkill?.progress ?? 0, latestPlan?.progress ?? 0)
      const status: UpskillStatusFilter = activePosition || activeSkill
        ? 'active'
        : latestPlan?.status === 'completed'
          ? 'completed'
          : latestPlan?.status === 'cancelled'
            ? 'cancelled'
            : 'idle'
      return { player, activePosition, activeSkill, progress, status }
    })

    return mapped
      .filter((row) => {
        const q = search.trim().toLowerCase()
        if (!q) return true
        const fullName = `${row.player.firstName} ${row.player.lastName}`.toLowerCase()
        return fullName.includes(q) || row.player.position.primary.toLowerCase().includes(q)
      })
      .filter((row) => {
        if (typeFilter === 'all') return true
        if (typeFilter === 'position') return !!row.activePosition
        return !!row.activeSkill
      })
      .filter((row) => statusFilter === 'all' || row.status === statusFilter)
      .filter((row) => {
        if (progressFilter === 'all') return true
        if (progressFilter === 'gt0') return row.progress > 0
        if (progressFilter === 'gt25') return row.progress >= 25
        if (progressFilter === 'gt50') return row.progress >= 50
        if (progressFilter === 'gt75') return row.progress >= 75
        return row.progress >= 100
      })
      .sort((a, b) => {
        if (sortBy === 'progress-desc') return b.progress - a.progress
        if (sortBy === 'progress-asc') return a.progress - b.progress
        if (sortBy === 'age') return a.player.age - b.player.age
        return `${a.player.lastName} ${a.player.firstName}`.localeCompare(`${b.player.lastName} ${b.player.firstName}`)
      })
  }, [clubPlayers, progressFilter, search, sortBy, statusFilter, typeFilter])

  const handleStartPositionUpskill = useCallback((player: Player) => {
    const targetPosition = positionTargets[player.id]
    if (!targetPosition) return
    const result = startPlayerUpskill(player.id, { type: 'position', targetPosition })
    if (!result.success) {
      setError(result.error ?? 'Failed to start position upskill.')
      return
    }
    setError(null)
  }, [positionTargets, startPlayerUpskill])

  const handleStartSkillUpskill = useCallback((player: Player) => {
    const targetSkill = skillTargets[player.id]
    if (!targetSkill) return
    const result = startPlayerUpskill(player.id, { type: 'skill', targetSkill })
    if (!result.success) {
      setError(result.error ?? 'Failed to start skill upskill.')
      return
    }
    setError(null)
  }, [skillTargets, startPlayerUpskill])

  const handleCancel = useCallback((playerId: string, planId: string) => {
    const result = cancelPlayerUpskill(playerId, planId)
    if (!result.success) {
      setError(result.error ?? 'Failed to cancel upskill plan.')
      return
    }
    setError(null)
  }, [cancelPlayerUpskill])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upskilling</CardTitle>
          <CardDescription>
            All players can upskill positions and skill domains. Progress updates weekly from training and coaching quality.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player..." className="h-8 text-xs" />
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as UpskillTypeFilter)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="position">Position Upskill</SelectItem>
                <SelectItem value="skill">Skill Upskill</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as UpskillStatusFilter)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
              </SelectContent>
            </Select>
            <Select value={progressFilter} onValueChange={(v) => setProgressFilter(v as UpskillProgressFilter)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Progress" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Progress</SelectItem>
                <SelectItem value="gt0">{'>'} 0%</SelectItem>
                <SelectItem value="gt25">{'>'}= 25%</SelectItem>
                <SelectItem value="gt50">{'>'}= 50%</SelectItem>
                <SelectItem value="gt75">{'>'}= 75%</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as UpskillSort)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sort" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="progress-desc">Progress: High to Low</SelectItem>
                <SelectItem value="progress-asc">Progress: Low to High</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="age">Age</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {rows.map(({ player, activePosition, activeSkill, progress, status }) => {
          const statusTone = status === 'active'
            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
            : status === 'completed'
              ? 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30'
              : 'bg-muted text-muted-foreground border-border'
          const positionOptions = ALL_POSITION_TYPES.filter((pos) => pos !== player.position.primary)
          return (
            <Card key={player.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{player.firstName} {player.lastName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">{player.position.primary}</Badge>
                      <span className="text-xs text-muted-foreground">Age {player.age}</span>
                    </div>
                  </div>
                  <Badge className={cn('text-xs', statusTone)}>{status.toUpperCase()}</Badge>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Upskill Progress</span>
                    <span className={cn('font-semibold', fitnessColor(progress))}>{progress.toFixed(1)}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Position Upskill</p>
                    {activePosition ? (
                      <div className="rounded border border-blue-500/30 bg-blue-500/5 p-2 space-y-2">
                        <p className="text-xs font-medium">
                          Target: {activePosition.targetPosition ? `${POSITION_LABELS[activePosition.targetPosition]} (${activePosition.targetPosition})` : 'Position'}
                        </p>
                        <Progress value={activePosition.progress} className="h-1.5" />
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => handleCancel(player.id, activePosition.id)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Select
                          value={positionTargets[player.id] ?? '__none__'}
                          onValueChange={(v) => {
                            if (v === '__none__') return
                            setPositionTargets((prev) => ({ ...prev, [player.id]: v as PlayerPositionType }))
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select position..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select position...</SelectItem>
                            {positionOptions.map((pos) => (
                              <SelectItem key={pos} value={pos}>{POSITION_LABELS[pos]} ({pos})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="h-8 text-xs" disabled={!positionTargets[player.id]} onClick={() => handleStartPositionUpskill(player)}>
                          Start
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Skill Upskill</p>
                    {activeSkill ? (
                      <div className="rounded border border-blue-500/30 bg-blue-500/5 p-2 space-y-2">
                        <p className="text-xs font-medium">
                          Target: {activeSkill.targetSkill ? PLAYER_TRAINING_FOCUS_LABELS[activeSkill.targetSkill] : 'Skill'}
                        </p>
                        <Progress value={activeSkill.progress} className="h-1.5" />
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => handleCancel(player.id, activeSkill.id)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Select
                          value={skillTargets[player.id] ?? '__none__'}
                          onValueChange={(v) => {
                            if (v === '__none__') return
                            setSkillTargets((prev) => ({ ...prev, [player.id]: v as PlayerTrainingFocus }))
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select skill..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select skill...</SelectItem>
                            {PLAYER_TRAINING_FOCUS_OPTIONS.map((skill) => (
                              <SelectItem key={skill} value={skill}>{PLAYER_TRAINING_FOCUS_LABELS[skill]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="h-8 text-xs" disabled={!skillTargets[player.id]} onClick={() => handleStartSkillUpskill(player)}>
                          Start
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function PlayerFocusTab({
  clubPlayers,
  club,
  clubStaff,
}: {
  clubPlayers: Player[]
  club: Club
  clubStaff: Record<string, StaffMember>
}) {
  const setPlayerTrainingFocus = useGameStore((s) => s.setPlayerTrainingFocus)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sortedPlayers = useMemo(
    () => [...clubPlayers].sort((a, b) => {
      if (a.position.primary !== b.position.primary) return a.position.primary.localeCompare(b.position.primary)
      return a.lastName.localeCompare(b.lastName)
    }),
    [clubPlayers],
  )

  const projCtx = useMemo(
    () => computeProjectionContext(club, Object.values(clubStaff)),
    [club, clubStaff],
  )

  const handleFocusChange = useCallback((playerId: string, value: string) => {
    const nextFocus = value === '__none__' ? null : (value as PlayerTrainingFocus)
    const result = setPlayerTrainingFocus(playerId, nextFocus)
    if (!result.success) {
      setError(result.error ?? 'Failed to update player focus.')
      return
    }
    setError(null)
  }, [setPlayerTrainingFocus])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Player Development Focus</CardTitle>
          <CardDescription>
            Assign one focus per player. Focused attributes gain faster in weekly training and offseason growth.
            Click "Show Projection" on any player to preview expected attribute changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortedPlayers.map((player) => {
          const focus = player.trainingFocus ?? null
          const isExpanded = expandedId === player.id

          return (
            <Card key={player.id} className={cn(isExpanded && 'ring-1 ring-primary/30')}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">
                      {player.firstName} {player.lastName}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">
                        {player.position.primary}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Age {player.age}</span>
                    </div>
                  </div>
                  {focus ? (
                    <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-xs">
                      {PLAYER_TRAINING_FOCUS_LABELS[focus]}
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground font-medium">Development Focus</label>
                  <Select
                    value={focus ?? '__none__'}
                    onValueChange={(v) => handleFocusChange(player.id, v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select focus..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No assigned focus</SelectItem>
                      {PLAYER_TRAINING_FOCUS_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {PLAYER_TRAINING_FOCUS_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant={isExpanded ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-7 text-xs w-full"
                  onClick={() => setExpandedId(isExpanded ? null : player.id)}
                >
                  {isExpanded ? 'Hide Projection' : 'Show Projection'}
                </Button>

                {isExpanded && (
                  <div className="border-t border-border/40 pt-3">
                    <TrainingProjectionPanel
                      player={player}
                      selectedFocus={focus}
                      ctx={projCtx}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

type TrainingIntensity = 'light' | 'moderate' | 'intense'

function InjuryRiskTab({
  clubPlayers,
  clubStaff,
}: {
  clubPlayers: Player[]
  clubStaff: Record<string, StaffMember>
}) {
  const [intensity, setIntensity] = useState<TrainingIntensity>('moderate')

  const medical = useMemo(
    () => getMedicalStaffImpact(Object.values(clubStaff), clubPlayers[0]?.clubId ?? ''),
    [clubStaff, clubPlayers],
  )

  const rows = useMemo(() => {
    return clubPlayers
      .filter((p) => !p.injury)
      .map((p) => ({ player: p, risk: getTrainingInjuryRisk(p, intensity, medical) }))
      .sort((a, b) => {
        const order = { high: 0, moderate: 1, low: 2 }
        const levelDiff = order[a.risk.level] - order[b.risk.level]
        if (levelDiff !== 0) return levelDiff
        return b.risk.chance - a.risk.chance
      })
  }, [clubPlayers, intensity, medical])

  const injuredPlayers = useMemo(() => clubPlayers.filter((p) => p.injury), [clubPlayers])

  const riskCounts = useMemo(() => ({
    high: rows.filter((r) => r.risk.level === 'high').length,
    moderate: rows.filter((r) => r.risk.level === 'moderate').length,
    low: rows.filter((r) => r.risk.level === 'low').length,
  }), [rows])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Training Injury Risk
          </CardTitle>
          <CardDescription>
            Per-player injury probability based on fatigue, fitness, age, injury history, and medical staff quality.
            Adjust training intensity to see how load changes risk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-medium">Training Intensity</span>
            <Select value={intensity} onValueChange={(v) => setIntensity(v as TrainingIntensity)}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="intense">Intense</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{riskCounts.high}</p>
              <p className="text-[10px] text-muted-foreground">High Risk</p>
            </div>
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2">
              <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{riskCounts.moderate}</p>
              <p className="text-[10px] text-muted-foreground">Moderate</p>
            </div>
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{riskCounts.low}</p>
              <p className="text-[10px] text-muted-foreground">Low Risk</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {injuredPlayers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Currently Injured ({injuredPlayers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {injuredPlayers.map((p) => (
                <Badge key={p.id} variant="outline" className="text-xs text-red-600 border-red-500/40">
                  {p.firstName} {p.lastName} — {p.injury?.type} ({p.injury?.weeksRemaining}w)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map(({ player, risk }) => {
          const isHigh = risk.level === 'high'
          const isMod = risk.level === 'moderate'
          const levelColor = isHigh
            ? 'text-red-600 dark:text-red-400'
            : isMod
            ? 'text-yellow-600 dark:text-yellow-400'
            : 'text-green-600 dark:text-green-400'
          const levelBg = isHigh
            ? 'bg-red-500/10 border-red-500/20'
            : isMod
            ? 'bg-yellow-500/10 border-yellow-500/20'
            : 'bg-green-500/10 border-green-500/20'
          const Icon = isHigh || isMod ? AlertTriangle : CheckCircle2

          return (
            <div
              key={player.id}
              className={cn('flex items-center gap-3 rounded-lg border px-3 py-2', levelBg)}
            >
              <Icon className={cn('h-4 w-4 flex-shrink-0', levelColor)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {player.firstName} {player.lastName}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{player.position.primary}</Badge>
                  <span className="text-xs text-muted-foreground">Age {player.age}</span>
                </div>
                {risk.factors.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {risk.factors.join(' · ')}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className={cn('text-sm font-bold', levelColor)}>
                  {(risk.chance * 100).toFixed(1)}%
                </p>
                <p className={cn('text-[10px] capitalize', levelColor)}>{risk.level}</p>
              </div>
            </div>
          )
        })}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            All players are currently injured.
          </p>
        )}
      </div>
    </div>
  )
}

export function TrainingPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const staff = useGameStore((s) => s.staff)
  const clubs = useGameStore((s) => s.clubs)
  const trainingWeekPlan = useGameStore((s) => s.trainingWeekPlan)

  const club = clubs[playerClubId]

  const clubPlayers = useMemo(
    () =>
      Object.values(players).filter((p) => p.clubId === playerClubId),
    [players, playerClubId],
  )

  const clubStaff = useMemo(
    () => {
      const result: Record<string, StaffMember> = {}
      for (const [id, s] of Object.entries(staff)) {
        if (s.clubId === playerClubId) {
          result[id] = s
        }
      }
      return result
    },
    [staff, playerClubId],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Dumbbell className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">Training</h1>
          <p className="text-sm text-muted-foreground">
            {club?.fullName ?? 'Your Club'} - {clubPlayers.length} players on list
          </p>
        </div>
      </div>

      <Tabs defaultValue="planner">
        <TabsList>
          <TabsTrigger value="planner">
            <Dumbbell className="mr-1 h-4 w-4" />
            Week Planner
          </TabsTrigger>
          <TabsTrigger value="fitness">
            <Activity className="mr-1 h-4 w-4" />
            Squad Fitness
          </TabsTrigger>
          <TabsTrigger value="retrain">
            <Sparkles className="mr-1 h-4 w-4" />
            Upskilling
          </TabsTrigger>
          <TabsTrigger value="focus">
            <Target className="mr-1 h-4 w-4" />
            Player Focus
          </TabsTrigger>
          <TabsTrigger value="injury-risk">
            <ShieldAlert className="mr-1 h-4 w-4" />
            Injury Risk
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planner">
          <EnhancedWeekPlanner clubPlayers={clubPlayers} clubStaff={clubStaff} />
        </TabsContent>

        <TabsContent value="fitness">
          <EnhancedSquadFitness clubPlayers={clubPlayers} plan={trainingWeekPlan} />
        </TabsContent>

        <TabsContent value="retrain">
          <UpskillingTab clubPlayers={clubPlayers} />
        </TabsContent>

        <TabsContent value="focus">
          <PlayerFocusTab clubPlayers={clubPlayers} club={club} clubStaff={clubStaff} />
        </TabsContent>

        <TabsContent value="injury-risk">
          <InjuryRiskTab clubPlayers={clubPlayers} clubStaff={clubStaff} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
