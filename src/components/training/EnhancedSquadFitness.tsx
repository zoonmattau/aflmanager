import { useMemo, useState } from 'react'
import type { Player } from '@/types/player'
import type { TrainingWeekPlan, PlayerFitnessBreakdown } from '@/engine/training/trainingEngine'
import { buildFitnessBreakdown } from '@/engine/training/trainingEngine'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Users,
  Activity,
  Heart,
  AlertTriangle,
  Shield,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

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

function attrColor(val: number): string {
  if (val >= 70) return 'text-green-600 dark:text-green-400'
  if (val >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
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

const RISK_BADGE: Record<'low' | 'moderate' | 'high', { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30' },
  moderate: { label: 'Mod', color: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30' },
  high: { label: 'High', color: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EnhancedSquadFitnessProps {
  clubPlayers: Player[]
  plan: TrainingWeekPlan | null
}

export function EnhancedSquadFitness({ clubPlayers, plan }: EnhancedSquadFitnessProps) {
  const [showLoadManagement, setShowLoadManagement] = useState(false)

  const breakdowns = useMemo(
    () => buildFitnessBreakdown(clubPlayers, plan),
    [clubPlayers, plan],
  )

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>()
    for (const p of clubPlayers) map.set(p.id, p)
    return map
  }, [clubPlayers])

  // Summary stats
  const avg = (arr: number[]) => arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
  const avgFitness = avg(breakdowns.map((b) => b.fitness))
  const avgFatigue = avg(breakdowns.map((b) => b.fatigue))
  const avgEndurance = avg(breakdowns.map((b) => b.endurance))
  const avgRecovery = avg(breakdowns.map((b) => b.recoveryAttr))
  const injuredCount = clubPlayers.filter((p) => p.injury !== null).length
  const atRiskCount = breakdowns.filter((b) => b.injuryRisk === 'high').length

  // Load management lists
  const shouldRest = breakdowns.filter((b) => b.fatigue > 70 || b.fitness < 40)
  const atInjuryRisk = breakdowns.filter((b) => b.injuryRisk === 'high' && b.fatigue > 50)
  const canHandleMore = breakdowns.filter((b) => b.fatigue < 25 && b.fitness > 80)

  // Sort breakdowns by fitness
  const sorted = useMemo(
    () => [...breakdowns].sort((a, b) => a.fitness - b.fitness),
    [breakdowns],
  )

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Squad Size</p>
            <p className="text-2xl font-bold">{clubPlayers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Avg Fitness</p>
            <p className={cn('text-2xl font-bold', fitnessColor(avgFitness))}>{avgFitness}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Avg Fatigue</p>
            <p className={cn('text-2xl font-bold', fatigueColor(avgFatigue))}>{avgFatigue}</p>
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
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Avg Endurance</p>
            <p className={cn('text-2xl font-bold', attrColor(avgEndurance))}>{avgEndurance}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Avg Recovery</p>
            <p className={cn('text-2xl font-bold', attrColor(avgRecovery))}>{avgRecovery}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">At Risk</p>
            <p className={cn('text-2xl font-bold', atRiskCount > 0 ? 'text-red-500' : 'text-green-500')}>
              {atRiskCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced fitness table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-14">Pos</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-10">Age</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-36">Fitness</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-36">Fatigue</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-14">End</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-14">Rec</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-14">Risk</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-10">Trend</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-14">Load</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-16">Form</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((breakdown) => {
                  const player = playerMap.get(breakdown.playerId)
                  if (!player) return null
                  const form = formDisplay(breakdown.form)
                  const injury = injuryStatus(player)
                  const risk = RISK_BADGE[breakdown.injuryRisk]

                  return (
                    <tr
                      key={breakdown.playerId}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-2 font-medium whitespace-nowrap text-xs">
                        {player.firstName} {player.lastName}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="text-[10px] h-5">
                          {player.position.primary}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-xs">{player.age}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Progress
                            value={breakdown.fitness}
                            className={cn('flex-1 h-2', fitnessBarColor(breakdown.fitness))}
                          />
                          <span
                            className={cn(
                              'text-xs font-semibold tabular-nums w-6 text-right',
                              fitnessColor(breakdown.fitness),
                            )}
                          >
                            {breakdown.fitness}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Progress
                            value={breakdown.fatigue}
                            className={cn('flex-1 h-2', fatigueBarColor(breakdown.fatigue))}
                          />
                          <span
                            className={cn(
                              'text-xs font-semibold tabular-nums w-6 text-right',
                              fatigueColor(breakdown.fatigue),
                            )}
                          >
                            {breakdown.fatigue}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={cn('text-xs font-semibold tabular-nums', attrColor(breakdown.endurance))}>
                          {breakdown.endurance}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={cn('text-xs font-semibold tabular-nums', attrColor(breakdown.recoveryAttr))}>
                          {breakdown.recoveryAttr}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className={cn('text-[10px] h-4 px-1', risk.color)}>
                          {risk.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {breakdown.fatigueTrend === 'rising' && (
                          <TrendingUp className="h-3.5 w-3.5 text-red-500 mx-auto" />
                        )}
                        {breakdown.fatigueTrend === 'falling' && (
                          <TrendingDown className="h-3.5 w-3.5 text-green-500 mx-auto" />
                        )}
                        {breakdown.fatigueTrend === 'stable' && (
                          <Minus className="h-3.5 w-3.5 text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-xs tabular-nums">
                          {breakdown.weeklySessionCount}/{breakdown.weeklyIntenseCount}
                        </span>
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

      {/* Load management panel */}
      <Card>
        <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setShowLoadManagement(!showLoadManagement)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Load Management
            </CardTitle>
            {showLoadManagement ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        {showLoadManagement && (
          <CardContent className="pt-0 pb-4 px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Should Rest */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                    Should Rest ({shouldRest.length})
                  </span>
                </div>
                {shouldRest.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No players need rest</p>
                ) : (
                  <div className="space-y-0.5">
                    {shouldRest.map((b) => {
                      const p = playerMap.get(b.playerId)
                      if (!p) return null
                      return (
                        <div key={b.playerId} className="flex items-center justify-between text-xs rounded px-2 py-0.5 bg-red-500/5">
                          <span>{p.firstName.charAt(0)}. {p.lastName}</span>
                          <span className="text-muted-foreground">
                            F:{b.fitness} / Fat:{b.fatigue}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* At Injury Risk */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                    Injury Risk ({atInjuryRisk.length})
                  </span>
                </div>
                {atInjuryRisk.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No players at risk</p>
                ) : (
                  <div className="space-y-0.5">
                    {atInjuryRisk.map((b) => {
                      const p = playerMap.get(b.playerId)
                      if (!p) return null
                      return (
                        <div key={b.playerId} className="flex items-center justify-between text-xs rounded px-2 py-0.5 bg-yellow-500/5">
                          <span>{p.firstName.charAt(0)}. {p.lastName}</span>
                          <span className="text-muted-foreground">
                            Fat:{b.fatigue}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Can Handle More */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                    Can Handle More ({canHandleMore.length})
                  </span>
                </div>
                {canHandleMore.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No players need extra load</p>
                ) : (
                  <div className="space-y-0.5">
                    {canHandleMore.map((b) => {
                      const p = playerMap.get(b.playerId)
                      if (!p) return null
                      return (
                        <div key={b.playerId} className="flex items-center justify-between text-xs rounded px-2 py-0.5 bg-green-500/5">
                          <span>{p.firstName.charAt(0)}. {p.lastName}</span>
                          <span className="text-muted-foreground">
                            F:{b.fitness} / Fat:{b.fatigue}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
