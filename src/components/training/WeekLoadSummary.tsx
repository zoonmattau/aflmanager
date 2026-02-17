import type { TrainingWeekPlan } from '@/engine/training/trainingEngine'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Dumbbell, AlertTriangle, Heart, Sparkles, Trash2 } from 'lucide-react'

interface WeekLoadSummaryProps {
  plan: TrainingWeekPlan
  onAutoFill: () => void
  onClear: () => void
}

export function WeekLoadSummary({ plan, onAutoFill, onClear }: WeekLoadSummaryProps) {
  let totalSessions = 0
  let recoverySessions = 0
  let intenseSessions = 0

  for (const daySlots of Object.values(plan.slots)) {
    for (const slotKey of ['morning', 'afternoon'] as const) {
      const slot = daySlots[slotKey]
      for (const group of slot.groups) {
        totalSessions++
        if (group.focus === 'recovery') recoverySessions++
        if (group.intensity === 'intense') intenseSessions++
      }
    }
  }

  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Dumbbell className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Sessions:</span>
              <span className="font-semibold">{totalSessions}</span>
            </div>
            {recoverySessions > 0 && (
              <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <Heart className="h-4 w-4" />
                <span className="text-xs">
                  {recoverySessions} recovery
                </span>
              </div>
            )}
            {intenseSessions > 3 && (
              <div className="flex items-center gap-1.5 text-red-500">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs">High fatigue risk ({intenseSessions} intense)</span>
              </div>
            )}
            {intenseSessions > 0 && intenseSessions <= 3 && (
              <div className={cn(
                'flex items-center gap-1.5 text-xs',
                intenseSessions > 2 ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground',
              )}>
                <span>{intenseSessions} intense</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAutoFill}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Auto Fill
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClear}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Clear Week
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
