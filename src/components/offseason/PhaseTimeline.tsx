import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  getOffseasonPhaseLabel,
  PHASE_ORDER,
} from '@/engine/season/offseasonFlow'
import type { OffseasonPhase } from '@/engine/season/offseasonFlow'
import {
  CheckCircle2,
  Circle,
  Trophy,
  UserMinus,
  XCircle,
  ArrowLeftRight,
  FileText,
  Users,
  Dumbbell,
  Swords,
  Rocket,
  MapPin,
  UserPlus,
} from 'lucide-react'

const ALL_PHASES = PHASE_ORDER

const PHASE_ICONS: Record<OffseasonPhase, React.ReactNode> = {
  'season-end': <Trophy className="h-4 w-4" />,
  retirements: <UserMinus className="h-4 w-4" />,
  delistings: <XCircle className="h-4 w-4" />,
  'trade-period': <ArrowLeftRight className="h-4 w-4" />,
  'free-agency': <FileText className="h-4 w-4" />,
  'national-draft': <Users className="h-4 w-4" />,
  'rookie-draft': <Users className="h-4 w-4" />,
  'supplemental-signing': <UserPlus className="h-4 w-4" />,
  preseason: <Dumbbell className="h-4 w-4" />,
  'venue-allocation': <MapPin className="h-4 w-4" />,
  'practice-matches': <Swords className="h-4 w-4" />,
  ready: <Rocket className="h-4 w-4" />,
}

export { PHASE_ICONS }

export function PhaseTimeline({
  currentPhase,
  completedPhases,
}: {
  currentPhase: OffseasonPhase
  completedPhases: OffseasonPhase[]
}) {
  const completedSet = new Set(completedPhases)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium tracking-wide uppercase text-muted-foreground">
          Offseason Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative flex flex-col gap-0">
          {ALL_PHASES.map((phase, idx) => {
            const isCompleted = completedSet.has(phase)
            const isCurrent = phase === currentPhase
            const isFuture = !isCompleted && !isCurrent
            const isLast = idx === ALL_PHASES.length - 1

            return (
              <div key={phase} className="relative flex items-start gap-3">
                {/* Vertical connector line */}
                {!isLast && (
                  <div
                    className={cn(
                      'absolute left-[11px] top-6 h-full w-0.5',
                      isCompleted
                        ? 'bg-green-500/60'
                        : isCurrent
                          ? 'bg-primary/30'
                          : 'bg-muted-foreground/15',
                    )}
                  />
                )}

                {/* Node indicator */}
                <div className="relative z-10 flex-shrink-0 mt-0.5">
                  {isCompleted ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : isCurrent ? (
                    <div className="relative">
                      <Circle className="h-6 w-6 text-primary" />
                      <span className="absolute inset-0 h-6 w-6 animate-ping rounded-full bg-primary/30" />
                    </div>
                  ) : (
                    <Circle className="h-6 w-6 text-muted-foreground/30" />
                  )}
                </div>

                {/* Phase label + icon */}
                <div
                  className={cn(
                    'flex items-center gap-2 pb-5 pt-0.5 text-sm leading-tight',
                    isCompleted && 'text-green-500',
                    isCurrent && 'text-foreground font-semibold',
                    isFuture && 'text-muted-foreground/50',
                  )}
                >
                  <span
                    className={cn(
                      isCurrent && 'text-primary',
                      isCompleted && 'text-green-500/70',
                      isFuture && 'text-muted-foreground/30',
                    )}
                  >
                    {PHASE_ICONS[phase]}
                  </span>
                  <span>{getOffseasonPhaseLabel(phase)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
