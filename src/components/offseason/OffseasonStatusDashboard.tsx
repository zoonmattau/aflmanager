import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Calendar,
  Play,
  FastForward,
  SkipForward,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
} from 'lucide-react'
import { getOffseasonPhaseLabel } from '@/engine/season/offseasonFlow'
import {
  formatOffseasonDateTime,
  getNextMilestone,
  getCountdown,
  detectActionItems,
  buildOffseasonChecklist,
} from '@/engine/offseason/offseasonCalendar'
import type { ActionItem, OffseasonChecklistTask } from '@/engine/offseason/offseasonCalendar'
import { diffDays } from '@/engine/calendar/calendarEngine'
import { cn } from '@/lib/utils'

const SEVERITY_ICON: Record<ActionItem['severity'], typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info,
}

const SEVERITY_COLOR: Record<ActionItem['severity'], string> = {
  critical: 'text-red-500',
  warning: 'text-yellow-500',
  info: 'text-blue-500',
}

export function OffseasonStatusDashboard() {
  const navigate = useNavigate()
  const [simError, setSimError] = useState<string | null>(null)

  const offseasonState = useGameStore((s) => s.offseasonState)
  const players = useGameStore((s) => s.players)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const negotiations = useGameStore((s) => s.negotiations)
  const settings = useGameStore((s) => s.settings)
  const draft = useGameStore((s) => s.draft)
  const tradeInbox = useGameStore((s) => s.tradeInbox)
  const simHalfDay = useGameStore((s) => s.simOffseasonHalfDay)
  const simFullDay = useGameStore((s) => s.simOffseasonFullDay)
  const simToMilestone = useGameStore((s) => s.simOffseasonToMilestone)

  const calendarState = offseasonState?.calendarState ?? null

  const actionItems = useMemo(() => {
    if (!offseasonState) return []
    return detectActionItems(players, playerClubId, offseasonState, negotiations, settings, draft, tradeInbox)
  }, [players, playerClubId, offseasonState, negotiations, settings, draft, tradeInbox])

  const checklist = useMemo(() => {
    if (!offseasonState) return []
    return buildOffseasonChecklist({
      players,
      playerClubId,
      offseasonState,
      negotiations,
      settings,
      draft,
      tradeInbox,
    })
  }, [players, playerClubId, offseasonState, negotiations, settings, draft, tradeInbox])

  const nextMilestone = useMemo(
    () => (calendarState ? getNextMilestone(calendarState) : null),
    [calendarState],
  )

  const countdown = useMemo(
    () => (calendarState ? getCountdown(calendarState) : null),
    [calendarState],
  )

  const progress = useMemo(() => {
    if (!calendarState || calendarState.milestones.length < 2) return 0
    const first = calendarState.milestones[0]
    const last = calendarState.milestones[calendarState.milestones.length - 1]
    const totalSpan = diffDays(first.date, last.date)
    if (totalSpan <= 0) return 100
    const elapsed = diffDays(first.date, calendarState.currentDate)
    return Math.min(100, Math.max(0, (elapsed / totalSpan) * 100))
  }, [calendarState])

  const requiredTasks = useMemo(() => checklist.filter((task) => task.required), [checklist])
  const optionalTasks = useMemo(() => checklist.filter((task) => !task.required), [checklist])

  const runSimAction = (action: () => { success: boolean; error?: string }) => {
    const result = action()
    if (!result.success) {
      setSimError(result.error ?? 'Simulation blocked.')
      return
    }
    setSimError(null)
  }

  const ChecklistGroup = ({
    title,
    tasks,
  }: {
    title: string
    tasks: OffseasonChecklistTask[]
  }) => (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {tasks.map((task) => (
        <button
          key={task.id}
          onClick={() => navigate(task.linkTo)}
          className={cn(
            'w-full rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted/60',
            task.completed ? 'border-green-500/30 bg-green-500/5' : task.required ? 'border-red-500/30 bg-red-500/5' : 'border-border/60 bg-muted/30',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">{task.title}</p>
            <Badge variant="outline" className={cn('text-[10px]', task.completed ? 'text-green-500 border-green-500/40' : task.required ? 'text-red-500 border-red-500/40' : 'text-yellow-600 border-yellow-500/40')}>
              {task.completed ? 'Complete' : 'Pending'}
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{task.description}</p>
          {!task.completed && task.impact && (
            <p className="mt-1 text-[10px] text-red-500/90">{task.impact}</p>
          )}
        </button>
      ))}
    </div>
  )

  if (!offseasonState || !calendarState) return null

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Section 1 — Date & Phase */}
          <div className="flex-shrink-0 space-y-1.5 min-w-[200px]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{calendarState.halfDay === 'AM' ? 'Morning' : 'Afternoon'}</span>
            </div>
            <p className="text-sm font-medium">
              {formatOffseasonDateTime(calendarState)}
            </p>
            <Badge variant="secondary" className="text-xs">
              {getOffseasonPhaseLabel(offseasonState.currentPhase)}
            </Badge>
          </div>

          {/* Section 2 — Action Items */}
          <div className="flex-grow min-w-0 border-l border-r px-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold">Right Now</span>
              {actionItems.length > 0 && (
                <Badge variant="destructive" className="text-xs h-5 min-w-[20px] justify-center">
                  {actionItems.length}
                </Badge>
              )}
            </div>
            {actionItems.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>No urgent actions</span>
              </div>
            ) : (
              <div className="max-h-[104px] overflow-y-auto space-y-1.5">
                {actionItems.map((item, i) => {
                  const Icon = SEVERITY_ICON[item.severity]
                  return (
                    <button
                      key={`${item.type}-${item.playerId ?? i}`}
                      onClick={() => navigate(item.linkTo)}
                      className="flex items-start gap-2 w-full text-left rounded-md px-2 py-1 hover:bg-muted transition-colors text-sm"
                    >
                      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${SEVERITY_COLOR[item.severity]}`} />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Section 3 — Milestone & Sim Controls */}
          <div className="flex-shrink-0 space-y-2 min-w-[200px]">
            {nextMilestone && countdown && (
              <p className="text-sm">
                <span className="font-medium">{nextMilestone.label}</span>
                <span className="text-muted-foreground"> in {countdown.label}</span>
              </p>
            )}
            {!nextMilestone && (
              <p className="text-sm text-muted-foreground">Offseason complete</p>
            )}
            <Progress value={progress} className="h-2" />
            <div className="flex gap-1.5">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={() => runSimAction(simHalfDay)}>
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sim Half Day</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={() => runSimAction(simFullDay)}>
                      <FastForward className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sim 1 Day</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={() => runSimAction(simToMilestone)}>
                      <SkipForward className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sim to Next Milestone</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
        <div className="mt-4 border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Offseason Checklist</p>
            <p className="text-[11px] text-muted-foreground">{formatOffseasonDateTime(calendarState)}</p>
          </div>
          {simError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-xs text-red-500">
              {simError}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <ChecklistGroup title="Required Tasks" tasks={requiredTasks} />
            <ChecklistGroup title="Optional Tasks" tasks={optionalTasks} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
