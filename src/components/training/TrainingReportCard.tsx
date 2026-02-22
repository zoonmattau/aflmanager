import type { TrainingWeekReport } from '@/types/game'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, Zap, CheckCircle2, AlertTriangle, ClipboardList, Flame } from 'lucide-react'

function formatAttrName(attr: string): string {
  return attr.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
}

function FatigueArrow({ value }: { value: number }) {
  if (value > 1) return <TrendingUp className="h-3.5 w-3.5 text-red-500" />
  if (value < -1) return <TrendingDown className="h-3.5 w-3.5 text-green-500" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

interface TrainingReportCardProps {
  report: TrainingWeekReport
}

export function TrainingReportCard({ report }: TrainingReportCardProps) {
  const fatigueDelta = report.avgFatigueChange
  const fitnessDelta = report.avgFitnessChange

  return (
    <Card className="border-primary/20 bg-primary/3">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Last Week&apos;s Training Report
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              Round {report.round + 1}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {report.sessionCount} sessions
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Squad load summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className={cn(
            'rounded-md border px-3 py-2 flex items-center gap-2',
            fatigueDelta > 5 ? 'bg-red-500/10 border-red-500/20' :
            fatigueDelta < -2 ? 'bg-green-500/10 border-green-500/20' :
            'bg-muted/40 border-border',
          )}>
            <FatigueArrow value={fatigueDelta} />
            <div>
              <p className={cn(
                'text-sm font-bold',
                fatigueDelta > 5 ? 'text-red-600 dark:text-red-400' :
                fatigueDelta < -2 ? 'text-green-600 dark:text-green-400' :
                'text-foreground',
              )}>
                {fatigueDelta > 0 ? '+' : ''}{fatigueDelta.toFixed(1)}
              </p>
              <p className="text-[10px] text-muted-foreground">Avg Fatigue</p>
            </div>
          </div>
          <div className={cn(
            'rounded-md border px-3 py-2 flex items-center gap-2',
            fitnessDelta > 1 ? 'bg-green-500/10 border-green-500/20' :
            fitnessDelta < -1 ? 'bg-orange-500/10 border-orange-500/20' :
            'bg-muted/40 border-border',
          )}>
            <Zap className={cn(
              'h-3.5 w-3.5',
              fitnessDelta > 1 ? 'text-green-500' :
              fitnessDelta < -1 ? 'text-orange-500' :
              'text-muted-foreground',
            )} />
            <div>
              <p className={cn(
                'text-sm font-bold',
                fitnessDelta > 1 ? 'text-green-600 dark:text-green-400' :
                fitnessDelta < -1 ? 'text-orange-600 dark:text-orange-400' :
                'text-foreground',
              )}>
                {fitnessDelta > 0 ? '+' : ''}{fitnessDelta.toFixed(1)}
              </p>
              <p className="text-[10px] text-muted-foreground">Avg Fitness</p>
            </div>
          </div>
        </div>

        {/* Top improvers */}
        {report.topImprovers.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Top Improvers
            </p>
            <div className="space-y-1">
              {report.topImprovers.map((imp) => (
                <div
                  key={imp.playerId}
                  className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <TrendingUp className="h-3 w-3 text-green-500 flex-shrink-0" />
                    <span className="text-xs font-medium truncate">{imp.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-[10px] text-muted-foreground">
                      {formatAttrName(imp.topAttr)}
                    </span>
                    <span className="text-xs font-bold text-green-600 dark:text-green-400">
                      +{imp.topGain.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upskill completions */}
        {report.upskillCompletions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Upskill Completed
            </p>
            <div className="flex flex-wrap gap-1.5">
              {report.upskillCompletions.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 px-2 py-1"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                  <span className="text-[10px] font-medium">
                    {c.playerName} — {c.targetLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Squad load level banner */}
        {(report.loadLevel === 'heavy' || report.loadLevel === 'excessive') && (
          <div className={cn(
            'flex items-center gap-2 rounded-md border px-2.5 py-1.5',
            report.loadLevel === 'excessive'
              ? 'bg-red-500/10 border-red-500/25'
              : 'bg-orange-500/10 border-orange-500/25',
          )}>
            <Flame className={cn(
              'h-3.5 w-3.5 flex-shrink-0',
              report.loadLevel === 'excessive' ? 'text-red-500' : 'text-orange-500',
            )} />
            <p className={cn(
              'text-[10px] font-semibold',
              report.loadLevel === 'excessive'
                ? 'text-red-700 dark:text-red-400'
                : 'text-orange-700 dark:text-orange-400',
            )}>
              {report.loadLevel === 'excessive'
                ? 'Excessive load — squad is being worked too hard'
                : 'Heavy load week — monitor fatigue before match day'}
            </p>
          </div>
        )}

        {/* Overtraining risk players */}
        {(report.overtrained ?? []).length > 0 && (
          <div className="rounded-md border border-red-500/25 bg-red-500/8 px-2.5 py-2 space-y-2">
            <div className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                Overtraining risk — {report.overtrained.length} player{report.overtrained.length !== 1 ? 's' : ''} in the red zone
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {report.overtrained.map((p) => (
                <span
                  key={p.playerId}
                  className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/12 px-1.5 py-0.5 text-[10px]"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className={cn(
                    'font-bold tabular-nums',
                    p.fatigue >= 82 ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400',
                  )}>
                    {p.fatigue}
                  </span>
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Fatigue ≥ 72 going into game day reduces match performance and raises injury risk.
              Schedule a recovery or rest session before the next fixture.
            </p>
          </div>
        )}

        {/* Injury scares */}
        {report.injuryScarePlayers.length > 0 && (
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/25 px-2.5 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Injury scares during training
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {report.injuryScarePlayers.join(', ')}
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {report.topImprovers.length === 0 && report.sessionCount === 0 && (
          <p className="text-xs text-muted-foreground text-center py-1">
            No sessions scheduled last week.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
