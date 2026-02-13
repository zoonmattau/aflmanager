import { useMemo, useState, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { Player, PositionGroup } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import type {
  TrainingFocus,
  TrainingIntensity,
  TrainingSession,
  TrainingWeek,
} from '@/engine/training/trainingEngine'
import { getDefaultTrainingWeek, getCoachForFocus } from '@/engine/training/trainingEngine'
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
  Users,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRightLeft,
  Heart,
  Brain,
  Target,
  Shield,
  Zap,
  Footprints,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FOCUS_OPTIONS: { value: TrainingFocus; label: string; icon: typeof Dumbbell }[] = [
  { value: 'kicking', label: 'Kicking', icon: Target },
  { value: 'handball', label: 'Handball', icon: Activity },
  { value: 'marking', label: 'Marking', icon: Zap },
  { value: 'physical', label: 'Physical', icon: Dumbbell },
  { value: 'contested', label: 'Contested Ball', icon: Shield },
  { value: 'game-sense', label: 'Game Sense', icon: Brain },
  { value: 'offensive', label: 'Offensive', icon: Target },
  { value: 'defensive', label: 'Defensive', icon: Shield },
  { value: 'ruck', label: 'Ruck Craft', icon: Users },
  { value: 'mental', label: 'Mental', icon: Brain },
  { value: 'set-pieces', label: 'Set Pieces', icon: Footprints },
  { value: 'match-fitness', label: 'Match Fitness', icon: Activity },
  { value: 'recovery', label: 'Recovery', icon: Heart },
]

const FOCUS_LABELS: Record<TrainingFocus, string> = {
  kicking: 'Kicking',
  handball: 'Handball',
  marking: 'Marking',
  physical: 'Physical',
  contested: 'Contested Ball',
  'game-sense': 'Game Sense',
  offensive: 'Offensive',
  defensive: 'Defensive',
  ruck: 'Ruck Craft',
  mental: 'Mental',
  'set-pieces': 'Set Pieces',
  'match-fitness': 'Match Fitness',
  recovery: 'Recovery',
}

const INTENSITY_OPTIONS: { value: TrainingIntensity; label: string; description: string }[] = [
  { value: 'light', label: 'Light', description: 'Low fatigue, slower development' },
  { value: 'moderate', label: 'Moderate', description: 'Balanced fatigue and development' },
  { value: 'intense', label: 'Intense', description: 'High fatigue, faster development' },
]

const INTENSITY_COLORS: Record<TrainingIntensity, string> = {
  light: 'text-green-600 dark:text-green-400',
  moderate: 'text-yellow-600 dark:text-yellow-400',
  intense: 'text-red-600 dark:text-red-400',
}

const INTENSITY_BADGE_COLORS: Record<TrainingIntensity, string> = {
  light: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30',
  moderate: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  intense: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
}

const POSITION_LABELS: Record<PositionGroup, string> = {
  FB: 'Full Back',
  HB: 'Half Back',
  C: 'Centre',
  HF: 'Half Forward',
  FF: 'Full Forward',
  FOLL: 'Follower (Ruck)',
  MID: 'Midfielder',
  WING: 'Wing',
  INT: 'Interchange',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fitnessColor(val: number): string {
  if (val >= 75) return 'text-green-600 dark:text-green-400'
  if (val >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function fitnessBarColor(val: number): string {
  if (val >= 75) return '[&>div[data-slot=progress-indicator]]:bg-green-500'
  if (val >= 50) return '[&>div[data-slot=progress-indicator]]:bg-yellow-500'
  return '[&>div[data-slot=progress-indicator]]:bg-red-500'
}

function fatigueColor(val: number): string {
  if (val > 70) return 'text-red-600 dark:text-red-400'
  if (val >= 40) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
}

function fatigueBarColor(val: number): string {
  if (val > 70) return '[&>div[data-slot=progress-indicator]]:bg-red-500'
  if (val >= 40) return '[&>div[data-slot=progress-indicator]]:bg-yellow-500'
  return '[&>div[data-slot=progress-indicator]]:bg-green-500'
}

function formDisplay(form: number): { label: string; color: string } {
  if (form >= 80) return { label: 'Excellent', color: 'text-green-600 dark:text-green-400' }
  if (form >= 65) return { label: 'Good', color: 'text-emerald-500 dark:text-emerald-400' }
  if (form >= 50) return { label: 'Average', color: 'text-yellow-600 dark:text-yellow-400' }
  if (form >= 35) return { label: 'Poor', color: 'text-orange-600 dark:text-orange-400' }
  return { label: 'Terrible', color: 'text-red-600 dark:text-red-400' }
}

function injuryStatus(player: Player): { label: string; color: string } {
  if (!player.injury) return { label: 'Fit', color: 'text-green-600 dark:text-green-400' }
  if (player.injury.weeksRemaining <= 1) {
    return { label: `${player.injury.type} (Test)`, color: 'text-yellow-600 dark:text-yellow-400' }
  }
  return {
    label: `${player.injury.type} (${player.injury.weeksRemaining}w)`,
    color: 'text-red-600 dark:text-red-400',
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single training session card within the week planner */
function SessionCard({
  session,
  sessionIndex,
  clubPlayers,
  clubStaff,
  onUpdateFocus,
  onUpdateIntensity,
  onTogglePlayer,
  onClearPlayers,
}: {
  session: TrainingSession
  sessionIndex: number
  clubPlayers: Player[]
  clubStaff: Record<string, StaffMember>
  onUpdateFocus: (sessionId: string, focus: TrainingFocus) => void
  onUpdateIntensity: (sessionId: string, intensity: TrainingIntensity) => void
  onTogglePlayer: (sessionId: string, playerId: string) => void
  onClearPlayers: (sessionId: string) => void
}) {
  const [showPlayerPicker, setShowPlayerPicker] = useState(false)

  const coach = getCoachForFocus(session.focus, clubStaff)
  const isWholeSquad = session.assignedPlayerIds.length === 0
  const assignedPlayers = clubPlayers.filter((p) =>
    session.assignedPlayerIds.includes(p.id),
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Session {sessionIndex + 1}</CardTitle>
          <Badge
            variant="outline"
            className={cn('text-xs', INTENSITY_BADGE_COLORS[session.intensity])}
          >
            {session.intensity}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Focus selection */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Training Focus</label>
          <Select
            value={session.focus}
            onValueChange={(v) => onUpdateFocus(session.id, v as TrainingFocus)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOCUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Intensity selection */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Intensity</label>
          <Select
            value={session.intensity}
            onValueChange={(v) => onUpdateIntensity(session.id, v as TrainingIntensity)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTENSITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex flex-col">
                    <span className={INTENSITY_COLORS[opt.value]}>{opt.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Coach assignment (auto) */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Assigned Coach</label>
          {coach ? (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                {coach.firstName.charAt(0)}
                {coach.lastName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {coach.firstName} {coach.lastName}
                </p>
                <p className="text-[10px] text-muted-foreground capitalize">
                  {coach.role.replace(/-/g, ' ')}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
              <span className="text-xs text-muted-foreground">No specialist available</span>
            </div>
          )}
        </div>

        {/* Player assignment */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground font-medium">Players</label>
            {!isWholeSquad && (
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                onClick={() => onClearPlayers(session.id)}
              >
                Reset to Whole Squad
              </button>
            )}
          </div>

          {isWholeSquad ? (
            <div className="rounded-md border border-dashed px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Whole Squad</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowPlayerPicker(!showPlayerPicker)}
              >
                Assign Players
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {assignedPlayers.map((p) => (
                  <Badge
                    key={p.id}
                    variant="secondary"
                    className="text-xs flex items-center gap-1 pr-1"
                  >
                    {p.firstName.charAt(0)}. {p.lastName}
                    <button
                      className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
                      onClick={() => onTogglePlayer(session.id, p.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs w-full"
                onClick={() => setShowPlayerPicker(!showPlayerPicker)}
              >
                {showPlayerPicker ? 'Hide Player List' : 'Add / Remove Players'}
              </Button>
            </div>
          )}

          {/* Player picker dropdown */}
          {showPlayerPicker && (
            <div className="rounded-md border bg-muted/30 p-2 max-h-48 overflow-y-auto space-y-0.5">
              {clubPlayers
                .filter((p) => !p.injury)
                .sort((a, b) => a.lastName.localeCompare(b.lastName))
                .map((p) => {
                  const isSelected = session.assignedPlayerIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      className={cn(
                        'w-full flex items-center justify-between rounded px-2 py-1 text-xs transition-colors',
                        isSelected
                          ? 'bg-primary/15 text-foreground'
                          : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => onTogglePlayer(session.id, p.id)}
                    >
                      <span>
                        {p.firstName.charAt(0)}. {p.lastName}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          {p.position.primary}
                        </Badge>
                        {isSelected && (
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                        )}
                      </div>
                    </button>
                  )
                })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Summary card after running training */
function TrainingResultsSummary({
  week,
  clubStaff,
  onDismiss,
}: {
  week: TrainingWeek
  clubStaff: Record<string, StaffMember>
  onDismiss: () => void
}) {
  return (
    <Card className="border-green-500/30 bg-green-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <CardTitle className="text-base">Training Week Complete</CardTitle>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
        <CardDescription>
          All {week.sessions.length} sessions have been completed for this week.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {week.sessions.map((session, i) => {
            const coach = getCoachForFocus(session.focus, clubStaff)
            return (
              <div
                key={session.id}
                className="flex items-center gap-3 rounded-lg border bg-background/50 p-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400 text-sm font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{FOCUS_LABELS[session.focus]}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={INTENSITY_COLORS[session.intensity]}>
                      {session.intensity}
                    </span>
                    <span>
                      {coach
                        ? `${coach.firstName} ${coach.lastName}`
                        : 'No coach'}
                    </span>
                    <span>
                      {session.assignedPlayerIds.length === 0
                        ? 'Whole Squad'
                        : `${session.assignedPlayerIds.length} players`}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tab: Training Week Planner
// ---------------------------------------------------------------------------

function TrainingWeekPlanner({
  clubPlayers,
  clubStaff,
}: {
  clubPlayers: Player[]
  clubStaff: Record<string, StaffMember>
}) {
  const [trainingWeek, setTrainingWeek] = useState<TrainingWeek>(() =>
    getDefaultTrainingWeek(),
  )
  const [hasRun, setHasRun] = useState(false)

  const handleUpdateFocus = useCallback(
    (sessionId: string, focus: TrainingFocus) => {
      setTrainingWeek((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === sessionId ? { ...s, focus, assignedCoachId: null } : s,
        ),
      }))
      setHasRun(false)
    },
    [],
  )

  const handleUpdateIntensity = useCallback(
    (sessionId: string, intensity: TrainingIntensity) => {
      setTrainingWeek((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === sessionId ? { ...s, intensity } : s,
        ),
      }))
      setHasRun(false)
    },
    [],
  )

  const handleTogglePlayer = useCallback(
    (sessionId: string, playerId: string) => {
      setTrainingWeek((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s) => {
          if (s.id !== sessionId) return s
          const existing = s.assignedPlayerIds.includes(playerId)
          return {
            ...s,
            assignedPlayerIds: existing
              ? s.assignedPlayerIds.filter((id) => id !== playerId)
              : [...s.assignedPlayerIds, playerId],
          }
        }),
      }))
      setHasRun(false)
    },
    [],
  )

  const handleClearPlayers = useCallback((sessionId: string) => {
    setTrainingWeek((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId ? { ...s, assignedPlayerIds: [] } : s,
      ),
    }))
    setHasRun(false)
  }, [])

  const handleRunTraining = useCallback(() => {
    setHasRun(true)
  }, [])

  const handleDismiss = useCallback(() => {
    setHasRun(false)
  }, [])

  const handleReset = useCallback(() => {
    setTrainingWeek(getDefaultTrainingWeek())
    setHasRun(false)
  }, [])

  // Summary stats
  const intenseCt = trainingWeek.sessions.filter((s) => s.intensity === 'intense').length
  const recoveryCt = trainingWeek.sessions.filter((s) => s.focus === 'recovery').length

  return (
    <div className="space-y-4">
      {/* Run result */}
      {hasRun && (
        <TrainingResultsSummary
          week={trainingWeek}
          clubStaff={clubStaff}
          onDismiss={handleDismiss}
        />
      )}

      {/* Week summary bar */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Dumbbell className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Sessions:</span>
                <span className="font-semibold">{trainingWeek.sessions.length}</span>
              </div>
              {intenseCt > 2 && (
                <div className="flex items-center gap-1.5 text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs">High fatigue risk ({intenseCt} intense)</span>
                </div>
              )}
              {recoveryCt > 0 && (
                <div className="flex items-center gap-1.5 text-green-500">
                  <Heart className="h-4 w-4" />
                  <span className="text-xs">{recoveryCt} recovery session{recoveryCt > 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleReset}>
                Reset Week
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleRunTraining}
                disabled={hasRun}
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {hasRun ? 'Training Complete' : 'Run Training'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {trainingWeek.sessions.map((session, i) => (
          <SessionCard
            key={session.id}
            session={session}
            sessionIndex={i}
            clubPlayers={clubPlayers}
            clubStaff={clubStaff}
            onUpdateFocus={handleUpdateFocus}
            onUpdateIntensity={handleUpdateIntensity}
            onTogglePlayer={handleTogglePlayer}
            onClearPlayers={handleClearPlayers}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Squad Fitness Overview
// ---------------------------------------------------------------------------

function SquadFitnessOverview({ clubPlayers }: { clubPlayers: Player[] }) {
  const sorted = useMemo(
    () => [...clubPlayers].sort((a, b) => a.fitness - b.fitness),
    [clubPlayers],
  )

  const avgFitness = useMemo(() => {
    if (sorted.length === 0) return 0
    return Math.round(sorted.reduce((acc, p) => acc + p.fitness, 0) / sorted.length)
  }, [sorted])

  const avgFatigue = useMemo(() => {
    if (sorted.length === 0) return 0
    return Math.round(sorted.reduce((acc, p) => acc + p.fatigue, 0) / sorted.length)
  }, [sorted])

  const injuredCount = sorted.filter((p) => p.injury !== null).length

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Squad Size</p>
            <p className="text-2xl font-bold">{sorted.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Avg Fitness</p>
            <p className={cn('text-2xl font-bold', fitnessColor(avgFitness))}>
              {avgFitness}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Avg Fatigue</p>
            <p className={cn('text-2xl font-bold', fatigueColor(avgFatigue))}>
              {avgFatigue}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Injured</p>
            <p className={cn('text-2xl font-bold', injuredCount > 0 ? 'text-red-500' : '')}>
              {injuredCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Fitness table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-16">Pos</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-12">Age</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-44">Fitness</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-44">Fatigue</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-20">Form</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Injury Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((player) => {
                  const form = formDisplay(player.form)
                  const injury = injuryStatus(player)

                  return (
                    <tr
                      key={player.id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        {player.firstName} {player.lastName}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="text-[10px] h-5">
                          {player.position.primary}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{player.age}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Progress
                            value={player.fitness}
                            className={cn('flex-1 h-2', fitnessBarColor(player.fitness))}
                          />
                          <span
                            className={cn(
                              'text-xs font-semibold tabular-nums w-7 text-right',
                              fitnessColor(player.fitness),
                            )}
                          >
                            {player.fitness}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Progress
                            value={player.fatigue}
                            className={cn('flex-1 h-2', fatigueBarColor(player.fatigue))}
                          />
                          <span
                            className={cn(
                              'text-xs font-semibold tabular-nums w-7 text-right',
                              fatigueColor(player.fatigue),
                            )}
                          >
                            {player.fatigue}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={cn('text-xs font-medium', form.color)}>
                          {form.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('text-xs', injury.color)}>
                          {injury.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Position Retraining
// ---------------------------------------------------------------------------

/** Map from primary position to sensible retraining targets */
const RETRAIN_TARGETS: Record<PositionGroup, PositionGroup[]> = {
  FB: ['HB', 'C'],
  HB: ['FB', 'C', 'WING', 'MID'],
  C: ['MID', 'WING', 'HB', 'HF'],
  HF: ['FF', 'C', 'MID', 'WING'],
  FF: ['HF', 'FOLL'],
  FOLL: ['FF', 'HF'],
  MID: ['C', 'WING', 'HB', 'HF'],
  WING: ['MID', 'C', 'HB', 'HF'],
  INT: ['MID', 'WING', 'HB', 'HF'],
}

interface RetrainState {
  playerId: string
  targetPosition: PositionGroup | null
  status: 'idle' | 'in-progress'
}

function PositionRetrainingTab({ clubPlayers }: { clubPlayers: Player[] }) {
  const [retrainMap, setRetrainMap] = useState<Record<string, RetrainState>>({})

  // Candidates: players whose primary position has plausible retrain targets,
  // and who are young enough to retrain (age <= 28).
  const candidates = useMemo(() => {
    return clubPlayers
      .filter((p) => {
        const targets = RETRAIN_TARGETS[p.position.primary] ?? []
        return targets.length > 0 && p.age <= 28 && !p.injury
      })
      .sort((a, b) => a.age - b.age)
  }, [clubPlayers])

  const handleSelectTarget = useCallback(
    (playerId: string, position: PositionGroup) => {
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
                {/* Player info */}
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

                {/* Target position selection */}
                {state?.status !== 'in-progress' ? (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-medium">
                      Target Position
                    </label>
                    <Select
                      value={state?.targetPosition ?? '__none__'}
                      onValueChange={(v) => {
                        if (v !== '__none__') {
                          handleSelectTarget(player.id, v as PositionGroup)
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

                    {/* Current aptitude preview */}
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
          <TrainingWeekPlanner clubPlayers={clubPlayers} clubStaff={clubStaff} />
        </TabsContent>

        <TabsContent value="fitness">
          <SquadFitnessOverview clubPlayers={clubPlayers} />
        </TabsContent>

        <TabsContent value="retrain">
          <PositionRetrainingTab clubPlayers={clubPlayers} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
