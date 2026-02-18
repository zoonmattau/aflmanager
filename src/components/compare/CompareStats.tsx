import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { compareValues, comparisonClass } from '@/lib/comparisonUtils'
import type { Player, PlayerCareerStats } from '@/types/player'

interface CompareStatsProps {
  playerA: Player
  playerB: Player
}

const INVERTED_STATS = new Set(['turnovers', 'clangers', 'freesAgainst'])

function buildRows(stats: PlayerCareerStats, gamesPlayed: number) {
  return [
    { code: 'GP', label: 'Games Played', key: 'gamesPlayed' as const, total: gamesPlayed, avg: null },
    { code: 'AF', label: 'AFL Fantasy', key: 'aflFantasyPoints' as const, total: stats.aflFantasyPoints, avg: gamesPlayed > 0 ? stats.aflFantasyPoints / gamesPlayed : null },
    { code: 'SC', label: 'SuperCoach', key: 'superCoachPoints' as const, total: stats.superCoachPoints, avg: gamesPlayed > 0 ? stats.superCoachPoints / gamesPlayed : null },
    { code: 'G', label: 'Goals', key: 'goals' as const, total: stats.goals, avg: gamesPlayed > 0 ? stats.goals / gamesPlayed : null },
    { code: 'B', label: 'Behinds', key: 'behinds' as const, total: stats.behinds, avg: gamesPlayed > 0 ? stats.behinds / gamesPlayed : null },
    { code: 'D', label: 'Disposals', key: 'disposals' as const, total: stats.disposals, avg: gamesPlayed > 0 ? stats.disposals / gamesPlayed : null },
    { code: 'K', label: 'Kicks', key: 'kicks' as const, total: stats.kicks, avg: gamesPlayed > 0 ? stats.kicks / gamesPlayed : null },
    { code: 'HB', label: 'Handballs', key: 'handballs' as const, total: stats.handballs, avg: gamesPlayed > 0 ? stats.handballs / gamesPlayed : null },
    { code: 'M', label: 'Marks', key: 'marks' as const, total: stats.marks, avg: gamesPlayed > 0 ? stats.marks / gamesPlayed : null },
    { code: 'CM', label: 'Contested Marks', key: 'contestedMarks' as const, total: stats.contestedMarks, avg: gamesPlayed > 0 ? stats.contestedMarks / gamesPlayed : null },
    { code: 'T', label: 'Tackles', key: 'tackles' as const, total: stats.tackles, avg: gamesPlayed > 0 ? stats.tackles / gamesPlayed : null },
    { code: 'HO', label: 'Hitouts', key: 'hitouts' as const, total: stats.hitouts, avg: gamesPlayed > 0 ? stats.hitouts / gamesPlayed : null },
    { code: 'CP', label: 'Contested Poss', key: 'contestedPossessions' as const, total: stats.contestedPossessions, avg: gamesPlayed > 0 ? stats.contestedPossessions / gamesPlayed : null },
    { code: 'UP', label: 'Uncontested Poss', key: 'uncontestedPossessions' as const, total: stats.uncontestedPossessions, avg: gamesPlayed > 0 ? stats.uncontestedPossessions / gamesPlayed : null },
    { code: 'CL', label: 'Clearances', key: 'clearances' as const, total: stats.clearances, avg: gamesPlayed > 0 ? stats.clearances / gamesPlayed : null },
    { code: 'I50', label: 'Inside 50s', key: 'insideFifties' as const, total: stats.insideFifties, avg: gamesPlayed > 0 ? stats.insideFifties / gamesPlayed : null },
    { code: 'R50', label: 'Rebound 50s', key: 'rebound50s' as const, total: stats.rebound50s, avg: gamesPlayed > 0 ? stats.rebound50s / gamesPlayed : null },
    { code: 'FF', label: 'Frees For', key: 'freesFor' as const, total: stats.freesFor, avg: gamesPlayed > 0 ? stats.freesFor / gamesPlayed : null },
    { code: 'FA', label: 'Frees Against', key: 'freesAgainst' as const, total: stats.freesAgainst, avg: gamesPlayed > 0 ? stats.freesAgainst / gamesPlayed : null },
    { code: 'GA', label: 'Goal Assists', key: 'goalAssists' as const, total: stats.goalAssists, avg: gamesPlayed > 0 ? stats.goalAssists / gamesPlayed : null },
    { code: 'SI', label: 'Score Involvements', key: 'scoreInvolvements' as const, total: stats.scoreInvolvements, avg: gamesPlayed > 0 ? stats.scoreInvolvements / gamesPlayed : null },
    { code: 'MG', label: 'Metres Gained', key: 'metresGained' as const, total: stats.metresGained, avg: gamesPlayed > 0 ? stats.metresGained / gamesPlayed : null },
    { code: 'INT', label: 'Intercepts', key: 'intercepts' as const, total: stats.intercepts, avg: gamesPlayed > 0 ? stats.intercepts / gamesPlayed : null },
    { code: '1%', label: 'One Percenters', key: 'onePercenters' as const, total: stats.onePercenters, avg: gamesPlayed > 0 ? stats.onePercenters / gamesPlayed : null },
    { code: 'TO', label: 'Turnovers', key: 'turnovers' as const, total: stats.turnovers, avg: gamesPlayed > 0 ? stats.turnovers / gamesPlayed : null },
    { code: 'CLG', label: 'Clangers', key: 'clangers' as const, total: stats.clangers, avg: gamesPlayed > 0 ? stats.clangers / gamesPlayed : null },
    { code: 'BO', label: 'Bounces', key: 'bounces' as const, total: stats.bounces, avg: gamesPlayed > 0 ? stats.bounces / gamesPlayed : null },
  ]
}

export function CompareStats({ playerA, playerB }: CompareStatsProps) {
  const [mode, setMode] = useState<'season' | 'career'>('season')

  const statsA = mode === 'season' ? playerA.seasonStats : playerA.careerStats
  const statsB = mode === 'season' ? playerB.seasonStats : playerB.careerStats
  const gpA = statsA.gamesPlayed
  const gpB = statsB.gamesPlayed
  const rowsA = buildRows(statsA, gpA)
  const rowsB = buildRows(statsB, gpB)

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{mode === 'season' ? 'Season' : 'Career'} Stats</CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant={mode === 'season' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setMode('season')}>
              Season
            </Button>
            <Button size="sm" variant={mode === 'career' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setMode('career')}>
              Career
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm space-y-0.5">
          {/* Header */}
          <div className="flex text-xs text-muted-foreground font-medium mb-1">
            <span className="w-16 text-right">Total</span>
            <span className="w-12 text-right">Avg</span>
            <span className="flex-1 text-center">Stat</span>
            <span className="w-12 text-left">Avg</span>
            <span className="w-16 text-left">Total</span>
          </div>
          {rowsA.map((rA, i) => {
            const rB = rowsB[i]
            const inverted = INVERTED_STATS.has(rA.key)
            const totalWinner = compareValues(rA.total, rB.total, inverted)
            return (
              <div key={rA.code} className="flex items-center">
                <span className={`w-16 text-right font-mono text-xs ${comparisonClass(totalWinner, 'a')}`}>{rA.total}</span>
                <span className="w-12 text-right font-mono text-[10px] text-muted-foreground">
                  {rA.avg !== null ? rA.avg.toFixed(1) : '-'}
                </span>
                <span className="flex-1 text-center text-xs text-muted-foreground">{rA.code} - {rA.label}</span>
                <span className="w-12 text-left font-mono text-[10px] text-muted-foreground">
                  {rB.avg !== null ? rB.avg.toFixed(1) : '-'}
                </span>
                <span className={`w-16 text-left font-mono text-xs ${comparisonClass(totalWinner, 'b')}`}>{rB.total}</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
