import { Trophy, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { CareerObjective } from '@/types/achievements'

interface DynastyQuestCardProps {
  quests: CareerObjective[]
  clubName: string
}

export function DynastyQuestCard({ quests, clubName: _clubName }: DynastyQuestCardProps) {
  if (quests.length === 0) return null

  const completedCount = quests.filter((q) => q.status === 'completed').length

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-yellow-500" />
              Dynasty Quests
            </CardTitle>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {completedCount} / {quests.length} completed
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          {quests.map((quest) => {
            const isCompleted = quest.status === 'completed'
            const pct = Math.min(100, Math.round((quest.currentValue / quest.targetValue) * 100))

            return (
              <div key={quest.id} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`text-[11px] font-medium truncate cursor-default ${
                          isCompleted ? 'text-green-600 dark:text-green-400' : 'text-foreground'
                        }`}
                      >
                        {quest.title}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-xs">
                      {quest.description}
                      {isCompleted && quest.completedYear && (
                        <span className="block text-muted-foreground mt-0.5">
                          Completed in {quest.completedYear}
                        </span>
                      )}
                    </TooltipContent>
                  </Tooltip>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {quest.currentValue} / {quest.targetValue}
                    </span>
                    {isCompleted ? (
                      <Badge className="bg-green-600 hover:bg-green-600 text-white text-[9px] px-1 py-0 h-4 gap-0.5">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Done
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-blue-600 border-blue-400">
                        Active
                      </Badge>
                    )}
                  </div>
                </div>

                <Progress
                  value={pct}
                  className={`h-1.5 ${isCompleted ? '[&>div]:bg-green-500' : '[&>div]:bg-blue-500'}`}
                />
              </div>
            )
          })}
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
