import { useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PHASE_ORDER,
  getOffseasonPhaseLabel,
} from '@/engine/season/offseasonFlow'
import {
  getNextMilestone,
  getCountdown,
} from '@/engine/offseason/offseasonCalendar'
import { diffDays } from '@/engine/calendar/calendarEngine'

export function PhaseProgressCard() {
  const offseasonState = useGameStore((s) => s.offseasonState)

  const calendarState = offseasonState?.calendarState ?? null
  const currentPhase = offseasonState?.currentPhase ?? 'season-end'
  const completedSet = useMemo(
    () => new Set(offseasonState?.completedPhases ?? []),
    [offseasonState?.completedPhases],
  )

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

  if (!offseasonState) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Offseason Progress</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Compact phase dots */}
        <div className="flex items-center gap-1 mb-3">
          {PHASE_ORDER.map((phase) => {
            const isCompleted = completedSet.has(phase)
            const isCurrent = phase === currentPhase
            return (
              <div
                key={phase}
                className="relative group"
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : isCurrent ? (
                  <div className="relative">
                    <Circle className="h-4 w-4 text-primary fill-primary" />
                  </div>
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/20" />
                )}
                {/* Tooltip on hover */}
                <div className={cn(
                  'absolute -top-8 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded',
                  'bg-popover border text-[9px] whitespace-nowrap pointer-events-none',
                  'opacity-0 group-hover:opacity-100 transition-opacity z-10',
                )}>
                  {getOffseasonPhaseLabel(phase)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Current phase label */}
        <p className="text-sm font-semibold mb-1">
          {getOffseasonPhaseLabel(currentPhase)}
        </p>

        {/* Progress bar */}
        <Progress value={progress} className="h-2 mb-2" />

        {/* Next milestone countdown */}
        {nextMilestone && countdown ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{nextMilestone.label}</span>
            {' '}in {countdown.label}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Offseason complete</p>
        )}
      </CardContent>
    </Card>
  )
}
