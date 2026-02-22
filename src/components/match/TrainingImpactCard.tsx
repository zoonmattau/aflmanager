import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dumbbell, TrendingUp, ChevronRight } from 'lucide-react'
import type { TrainingImpactSummary } from '@/types/match'

// Human-readable labels for training focuses
const FOCUS_LABEL: Record<string, string> = {
  kicking:       'Kicking',
  handball:      'Handball',
  marking:       'Marking',
  physical:      'Physical',
  contested:     'Contested',
  'game-sense':  'Game Sense',
  offensive:     'Offensive',
  defensive:     'Defensive',
  ruck:          'Ruck',
  mental:        'Mental',
  'set-pieces':  'Set Pieces',
  'match-fitness': 'Match Fitness',
  'video-review':  'Video Review',
  recovery:      'Recovery',
}

const METRIC_COLOR: Record<string, string> = {
  clearances:         'text-purple-400',
  'Q4 Output':        'text-emerald-400',
  'Kick Rate':        'text-blue-400',
  intercepts:         'text-orange-400',
  hitouts:            'text-sky-400',
  'Inside 50s':       'text-indigo-400',
  turnovers:          'text-red-400',
  'Handball Rate':    'text-teal-400',
  'Contested Marks':  'text-blue-300',
  'Composure':        'text-violet-400',
  'Set-Piece Conv.':  'text-yellow-400',
}

function metricColor(metric: string): string {
  return METRIC_COLOR[metric] ?? 'text-muted-foreground'
}

interface TrainingImpactCardProps {
  summary: TrainingImpactSummary
  /** Club name for the header context label */
  clubName?: string
}

export function TrainingImpactCard({ summary, clubName }: TrainingImpactCardProps) {
  if (summary.findings.length === 0) return null

  return (
    <Card className="border-violet-500/30 bg-violet-500/5">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-violet-400" />
          Training Impact
          {clubName && (
            <span className="text-muted-foreground font-normal">— {clubName}</span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground leading-snug mt-0.5">
          Focuses trained this week:&nbsp;
          {summary.focuses.map((f) => (
            <Badge
              key={f}
              variant="outline"
              className="text-[10px] mr-1 border-violet-500/40 text-violet-300 px-1 py-0"
            >
              {FOCUS_LABEL[f] ?? f}
            </Badge>
          ))}
        </p>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-2">
        {summary.findings.map((finding, i) => (
          <div
            key={`${finding.focus}-${i}`}
            className="flex items-start gap-2.5 rounded-md border border-border/40 bg-background/60 px-3 py-2"
          >
            <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-violet-400" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold ${metricColor(finding.metric)}`}>
                  {finding.metric}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {finding.value}
                  {finding.metric.includes('%') || finding.metric.includes('Rate') || finding.metric.includes('Conv')
                    ? '%'
                    : ''
                  }
                  <ChevronRight className="inline h-2.5 w-2.5 mx-0.5 opacity-50" />
                  <span className="text-emerald-400">+{finding.delta > 0 ? finding.delta : '—'}</span>
                  {' '}vs avg
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] border-violet-500/30 text-violet-400 px-1 py-0 ml-auto"
                >
                  {FOCUS_LABEL[finding.focus] ?? finding.focus}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                {finding.description}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
