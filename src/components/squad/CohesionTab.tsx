import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Club, TeamCohesion, CohesionEvent } from '@/types/club'
import type { Player } from '@/types/player'
import { getCohesionLabel } from '@/engine/cohesion/cohesionEngine'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users,
  Shield,
  Star,
  Handshake,
  ListChecks,
  Smile,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Lightbulb,
  ArrowRight,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cohesionColor(score: number): string {
  if (score >= 80) return 'text-green-500'
  if (score >= 65) return 'text-emerald-400'
  if (score >= 50) return 'text-yellow-500'
  if (score >= 35) return 'text-orange-500'
  return 'text-red-500'
}

function cohesionBg(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 65) return 'bg-emerald-400'
  if (score >= 50) return 'bg-yellow-500'
  if (score >= 35) return 'bg-orange-500'
  return 'bg-red-500'
}

function cohesionBadgeClass(score: number): string {
  if (score >= 80) return 'bg-green-500/15 text-green-600 border-green-500/30'
  if (score >= 65) return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
  if (score >= 50) return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30'
  if (score >= 35) return 'bg-orange-500/15 text-orange-600 border-orange-500/30'
  return 'bg-red-500/15 text-red-600 border-red-500/30'
}

function eventIconColor(type: CohesionEvent['type']): string {
  switch (type) {
    case 'captaincy-change': return 'text-amber-500'
    case 'trade': return 'text-blue-500'
    case 'role-switch': return 'text-orange-500'
    case 'injury-disruption': return 'text-red-500'
  }
}

function SubScoreRow({
  icon: Icon,
  label,
  score,
  description,
}: {
  icon: React.ElementType
  label: string
  score: number
  description: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium">{label}</span>
          <span className={cn('text-xs font-bold tabular-nums ml-2 flex-shrink-0', cohesionColor(score))}>
            {score}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', cohesionBg(score))}
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Actionable levers
// ---------------------------------------------------------------------------

const LEVERS = [
  {
    icon: ListChecks,
    title: 'Consistent selection',
    detail: 'Pick the same 22 each week where possible — familiarity builds over 3–4 rounds.',
  },
  {
    icon: ArrowRight,
    title: 'Role stability',
    detail: 'Avoid moving players out of their primary position. Out-of-position starters hurt role familiarity.',
  },
  {
    icon: Star,
    title: 'Strong leadership',
    detail: 'Keep your captain & VC stable. A captaincy change drops leadership stability by 25 pts.',
  },
  {
    icon: Smile,
    title: 'Morale management',
    detail: 'High squad morale (via wins, culture, and welfare) directly feeds the morale average sub-score.',
  },
  {
    icon: Handshake,
    title: 'Limit list churn',
    detail: 'Each trade reduces list continuity. Targeted list building outperforms a "buy and sell" approach.',
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CohesionTabProps {
  club: Club
  clubPlayers: Player[]
  currentRound: number
}

export function CohesionTab({ club, clubPlayers: _players, currentRound }: CohesionTabProps) {
  const cohesion: TeamCohesion | undefined = club.cohesion

  const score = cohesion?.score ?? 55
  const label = getCohesionLabel(score)

  // Sort recent events newest-first
  const sortedEvents = useMemo(
    () => [...(cohesion?.recentEvents ?? [])].sort((a, b) => b.round - a.round),
    [cohesion],
  )

  if (!cohesion || cohesion.lastUpdatedRound < 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Cohesion data will be generated after the first round is simulated.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Header card: overall score                                           */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold tabular-nums',
                score >= 80 ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                  : score >= 65 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : score >= 50 ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                  : score >= 35 ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                  : 'bg-red-500/15 text-red-600 dark:text-red-400',
              )}>
                {score}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold">Team Cohesion</h3>
                  <Badge variant="outline" className={cn('text-[10px]', cohesionBadgeClass(score))}>
                    {label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Round {currentRound + 1} — last updated round {cohesion.lastUpdatedRound + 1}
                </p>
              </div>
            </div>
            {/* Overall bar */}
            <div className="flex-1 max-w-[200px]">
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', cohesionBg(score))}
                  style={{ width: `${score}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-muted-foreground">Fragmented</span>
                <span className="text-[9px] text-muted-foreground">Tight-Knit</span>
              </div>
            </div>
          </div>

          {/* Match modifier callout */}
          <div className={cn(
            'mt-3 rounded-md border px-3 py-2 text-xs',
            score >= 65
              ? 'bg-green-500/8 border-green-500/20 text-green-700 dark:text-green-400'
              : score >= 50
              ? 'bg-muted/40 border-border text-muted-foreground'
              : 'bg-orange-500/8 border-orange-500/20 text-orange-700 dark:text-orange-400',
          )}>
            {score >= 80 && (
              <><TrendingUp className="inline h-3 w-3 mr-1" />High cohesion is giving your team a <strong>+3% match rating boost</strong>.</>
            )}
            {score >= 65 && score < 80 && (
              <><TrendingUp className="inline h-3 w-3 mr-1" />Good cohesion is providing a <strong>small match rating boost</strong>.</>
            )}
            {score >= 50 && score < 65 && (
              <>Team cohesion is average — <strong>no significant boost or penalty</strong>.</>
            )}
            {score >= 35 && score < 50 && (
              <><TrendingDown className="inline h-3 w-3 mr-1" />Disrupted cohesion is <strong>reducing match effectiveness</strong>. Address key sub-scores.</>
            )}
            {score < 35 && (
              <><AlertTriangle className="inline h-3 w-3 mr-1" />Fragmented cohesion is causing a <strong>−3% match rating penalty</strong>. Urgent action needed.</>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ---------------------------------------------------------------- */}
        {/* Sub-scores                                                        */}
        {/* ---------------------------------------------------------------- */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Sub-Scores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SubScoreRow
              icon={Shield}
              label="Leadership Stability"
              score={cohesion.leadershipStability}
              description="Drops sharply when captain or vice-captain changes. Recovers over time with stable leadership."
            />
            <SubScoreRow
              icon={ListChecks}
              label="Role Familiarity"
              score={cohesion.roleFamiliarity}
              description="Fraction of starters playing their primary position. Selecting players out of position lowers this."
            />
            <SubScoreRow
              icon={Handshake}
              label="Unit Chemistry"
              score={cohesion.unitChemistry}
              description="Average tenure at the club per positional line (DEF / MID / FWD). Longer-serving units score higher."
            />
            <SubScoreRow
              icon={ListChecks}
              label="List Continuity"
              score={cohesion.listContinuity}
              description="Reduced by trades and list churn. Squads with stable lists build stronger working relationships."
            />
            <SubScoreRow
              icon={Smile}
              label="Morale Average"
              score={cohesion.moraleAverage}
              description="Mean morale across all squad members. Winning, good culture, and player welfare all lift this."
            />
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Recent disruptions                                                */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                Recent Disruptions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sortedEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No disruptions in the last 6 rounds. Keep it stable.
                </p>
              ) : (
                <div className="space-y-2">
                  {sortedEvents.map((ev, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-md border px-2.5 py-2',
                        ev.impact <= -20
                          ? 'bg-red-500/8 border-red-500/20'
                          : ev.impact <= -10
                          ? 'bg-orange-500/8 border-orange-500/20'
                          : 'bg-amber-500/8 border-amber-500/20',
                      )}
                    >
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle className={cn('h-3 w-3 flex-shrink-0 mt-0.5', eventIconColor(ev.type))} />
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium leading-snug">{ev.description}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Round {ev.round + 1} &middot; {ev.impact} pts
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actionable levers */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                How to Improve
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {LEVERS.map((lever) => (
                <div key={lever.title} className="flex gap-2">
                  <lever.icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs font-medium">{lever.title}</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{lever.detail}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
