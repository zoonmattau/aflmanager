import { useMemo, useState, useCallback, useEffect } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { Player, PlayerPositionType } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import type { TrainingGroup, TrainingWeekPlan } from '@/engine/training/trainingEngine'
import { getDefaultTrainingWeekPlan } from '@/engine/training/trainingEngine'
import { addDays } from '@/engine/calendar/calendarEngine'
import { WeekPlannerGrid } from '@/components/training/WeekPlannerGrid'
import { WeekLoadSummary } from '@/components/training/WeekLoadSummary'
import { EnhancedSquadFitness } from '@/components/training/EnhancedSquadFitness'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  ArrowRightLeft,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the Monday of the week containing the given date. */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay() // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day // Mon = 0 offset
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Get 7 dates from Mon-Sun starting from a Monday. */
function getWeekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Find the match date for the current round and the player's club. */
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
    'Saturday-Twilight': 5,
    'Saturday-Night': 5,
    'Sunday-Early': 6,
    'Sunday-Twilight': 6,
  }

  if (fixture.matchDay) {
    const offset = MATCH_DAY_OFFSETS[fixture.matchDay] ?? 5
    return addDays(baseDate, offset)
  }

  // Default to Saturday
  return addDays(baseDate, 5)
}

function fitnessColor(val: number): string {
  if (val >= 75) return 'text-green-600 dark:text-green-400'
  if (val >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

// ---------------------------------------------------------------------------
// Constants for Position Retraining (unchanged)
// ---------------------------------------------------------------------------

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

const RETRAIN_TARGETS: Record<PlayerPositionType, PlayerPositionType[]> = {
  BP: ['FB', 'HBF'],
  FB: ['BP', 'CHB'],
  HBF: ['CHB', 'W', 'BP'],
  CHB: ['FB', 'HBF'],
  W: ['OM', 'HBF', 'HFF'],
  IM: ['OM', 'HFF'],
  OM: ['IM', 'W', 'HBF'],
  RK: ['FF', 'CHF'],
  HFF: ['CHF', 'OM', 'W'],
  CHF: ['FF', 'HFF', 'RK'],
  FP: ['FF', 'HFF'],
  FF: ['CHF', 'FP'],
}

// ---------------------------------------------------------------------------
// Tab: Enhanced Week Planner
// ---------------------------------------------------------------------------

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
  const clearTrainingWeekPlan = useGameStore((s) => s.clearTrainingWeekPlan)

  // Compute week dates
  const monday = getWeekStart(currentDate)
  const weekDates = useMemo(() => getWeekDates(monday), [monday])

  // Compute match date
  const matchDate = useMemo(
    () => getMatchDateForRound(season, currentRound, playerClubId, settings.seasonStartDate),
    [season, currentRound, playerClubId, settings.seasonStartDate],
  )

  // Auto-generate plan on first render if null
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

// ---------------------------------------------------------------------------
// Tab: Position Retraining (unchanged)
// ---------------------------------------------------------------------------

interface RetrainState {
  playerId: string
  targetPosition: PlayerPositionType | null
  status: 'idle' | 'in-progress'
}

function PositionRetrainingTab({ clubPlayers }: { clubPlayers: Player[] }) {
  const [retrainMap, setRetrainMap] = useState<Record<string, RetrainState>>({})

  const candidates = useMemo(() => {
    return clubPlayers
      .filter((p) => {
        const targets = RETRAIN_TARGETS[p.position.primary] ?? []
        return targets.length > 0 && p.age <= 28 && !p.injury
      })
      .sort((a, b) => a.age - b.age)
  }, [clubPlayers])

  const handleSelectTarget = useCallback(
    (playerId: string, position: PlayerPositionType) => {
      setRetrainMap((prev) => ({
        ...prev,
        [playerId]: { playerId, targetPosition: position, status: 'idle' },
      }))
    },
    [],
  )

  const handleStartRetrain = useCallback((playerId: string) => {
    setRetrainMap((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], status: 'in-progress' },
    }))
  }, [])

  const handleCancel = useCallback((playerId: string) => {
    setRetrainMap((prev) => {
      const next = { ...prev }
      delete next[playerId]
      return next
    })
  }, [])

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <ArrowRightLeft className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-medium text-muted-foreground">
              No retraining candidates
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              No eligible players found for position retraining.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Position Retraining</CardTitle>
          <CardDescription>
            Retrain players to learn a new position. Younger players adapt faster.
            Players must be uninjured and 28 or younger.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-1">
            {candidates.length} eligible player{candidates.length !== 1 ? 's' : ''}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {candidates.map((player) => {
          const targets = RETRAIN_TARGETS[player.position.primary] ?? []
          const state = retrainMap[player.id]
          const posRating = state?.targetPosition
            ? player.position.ratings[state.targetPosition] ?? 0
            : null

          return (
            <Card key={player.id}>
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
                    {player.position.secondary.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Secondary: {player.position.secondary.join(', ')}
                      </p>
                    )}
                  </div>
                  {state?.status === 'in-progress' && (
                    <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-xs">
                      Retraining
                    </Badge>
                  )}
                </div>

                {state?.status !== 'in-progress' ? (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-medium">
                      Target Position
                    </label>
                    <Select
                      value={state?.targetPosition ?? '__none__'}
                      onValueChange={(v) => {
                        if (v !== '__none__') {
                          handleSelectTarget(player.id, v as PlayerPositionType)
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select position..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" disabled>
                          Select position...
                        </SelectItem>
                        {targets.map((pos) => {
                          const existingRating = player.position.ratings[pos] ?? 0
                          return (
                            <SelectItem key={pos} value={pos}>
                              {POSITION_LABELS[pos]} ({pos})
                              {existingRating > 0 && ` — ${existingRating}%`}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>

                    {posRating !== null && state?.targetPosition && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Current {state.targetPosition} aptitude
                          </span>
                          <span className={cn('font-semibold', fitnessColor(posRating))}>
                            {posRating}%
                          </span>
                        </div>
                        <Progress value={posRating} className="h-1.5" />
                      </div>
                    )}

                    <Button
                      size="sm"
                      className="w-full h-8 text-xs"
                      disabled={!state?.targetPosition}
                      onClick={() => handleStartRetrain(player.id)}
                    >
                      <ArrowRightLeft className="mr-1 h-3 w-3" />
                      Start Retraining
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3">
                      <p className="text-xs font-medium">
                        Retraining: {player.position.primary} → {state.targetPosition}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Progress will accumulate over training weeks. Estimated 4-8 weeks for
                        meaningful improvement depending on age and attributes.
                      </p>
                      <div className="mt-2">
                        <Progress value={15} className="h-1.5" />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          ~15% complete (simulated)
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={() => handleCancel(player.id)}
                    >
                      Cancel Retraining
                    </Button>
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

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

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
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Dumbbell className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">Training</h1>
          <p className="text-sm text-muted-foreground">
            {club?.fullName ?? 'Your Club'} — {clubPlayers.length} players on list
          </p>
        </div>
      </div>

      {/* Tabs */}
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
            <ArrowRightLeft className="mr-1 h-4 w-4" />
            Position Retraining
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planner">
          <EnhancedWeekPlanner clubPlayers={clubPlayers} clubStaff={clubStaff} />
        </TabsContent>

        <TabsContent value="fitness">
          <EnhancedSquadFitness clubPlayers={clubPlayers} plan={trainingWeekPlan} />
        </TabsContent>

        <TabsContent value="retrain">
          <PositionRetrainingTab clubPlayers={clubPlayers} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
