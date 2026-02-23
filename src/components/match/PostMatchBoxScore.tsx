import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, ArrowUpDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Match, MatchPlayerStats } from '@/types/match'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import { calcDisposalEfficiency, calcKickingAccuracy, calcContestedPossessionPct, calcKickToHandballRatio, fmtPct } from '@/lib/efficiencyStats'

type ColumnGroup = 'possession' | 'scoring' | 'defensive' | 'fantasy' | 'efficiency'
type TeamFilter = 'all' | 'home' | 'away'
type SortKey = keyof MatchPlayerStats
type SortDir = 'asc' | 'desc'

interface ColDef {
  key: SortKey
  label: string
  title: string
  /** If true, zero values are shown as '' unless the stat is always meaningful */
  hideZero?: boolean
}

interface EfficiencyColDef {
  id: string
  label: string
  title: string
  compute: (stat: MatchPlayerStats) => string
  numericValue: (stat: MatchPlayerStats) => number
}

const EFFICIENCY_COLS: EfficiencyColDef[] = [
  {
    id: 'de_pct',
    label: 'DE%',
    title: 'Disposal Efficiency — (disposals − turnovers) / disposals. Min 5 disposals.',
    compute: (s) => fmtPct(calcDisposalEfficiency(s.disposals, s.turnovers)),
    numericValue: (s) => calcDisposalEfficiency(s.disposals, s.turnovers) ?? 0,
  },
  {
    id: 'ka_pct',
    label: 'KAcc%',
    title: 'Kicking Accuracy — goals as % of total scoring shots',
    compute: (s) => fmtPct(calcKickingAccuracy(s.goals, s.behinds)),
    numericValue: (s) => calcKickingAccuracy(s.goals, s.behinds) ?? 0,
  },
  {
    id: 'cp_pct',
    label: 'CP%',
    title: 'Contested Possession % — contested possessions as % of total',
    compute: (s) => fmtPct(calcContestedPossessionPct(s.contestedPossessions, (s.uncontestedPossessions ?? s.uncountestedPossessions) ?? 0)),
    numericValue: (s) => calcContestedPossessionPct(s.contestedPossessions, (s.uncontestedPossessions ?? s.uncountestedPossessions) ?? 0) ?? 0,
  },
  {
    id: 'kh_ratio',
    label: 'K:H',
    title: 'Kick-to-Handball Ratio — kick count vs handball count',
    compute: (s) => s.handballs > 0 ? `${s.kicks}:${s.handballs}` : `${s.kicks}:0`,
    numericValue: (s) => calcKickToHandballRatio(s.kicks, s.handballs) ?? 0,
  },
]

const COLUMN_GROUPS: Record<ColumnGroup, ColDef[]> = {
  possession: [
    { key: 'disposals', label: 'D', title: 'Disposals' },
    { key: 'kicks', label: 'K', title: 'Kicks' },
    { key: 'handballs', label: 'HB', title: 'Handballs' },
    { key: 'marks', label: 'M', title: 'Marks' },
    { key: 'tackles', label: 'T', title: 'Tackles' },
    { key: 'contestedPossessions', label: 'CP', title: 'Contested Possessions' },
    { key: 'uncontestedPossessions', label: 'UP', title: 'Uncontested Possessions' },
    { key: 'clearances', label: 'CL', title: 'Clearances' },
    { key: 'insideFifties', label: 'I50', title: 'Inside 50s' },
    { key: 'rebound50s', label: 'R50', title: 'Rebound 50s' },
    { key: 'metresGained', label: 'MG', title: 'Metres Gained' },
    { key: 'bounces', label: 'BO', title: 'Bounces', hideZero: true },
    { key: 'turnovers', label: 'TO', title: 'Turnovers', hideZero: true },
    { key: 'clangers', label: 'CLG', title: 'Clangers', hideZero: true },
  ],
  scoring: [
    { key: 'goals', label: 'G', title: 'Goals', hideZero: true },
    { key: 'behinds', label: 'B', title: 'Behinds', hideZero: true },
    { key: 'goalAssists', label: 'GA', title: 'Goal Assists', hideZero: true },
    { key: 'scoreInvolvements', label: 'SI', title: 'Score Involvements' },
    { key: 'insideFifties', label: 'I50', title: 'Inside 50s' },
  ],
  defensive: [
    { key: 'tackles', label: 'T', title: 'Tackles' },
    { key: 'hitouts', label: 'HO', title: 'Hitouts', hideZero: true },
    { key: 'intercepts', label: 'INT', title: 'Intercepts' },
    { key: 'rebound50s', label: 'R50', title: 'Rebound 50s' },
    { key: 'onePercenters', label: '1%', title: 'One Percenters', hideZero: true },
    { key: 'marks', label: 'M', title: 'Marks' },
    { key: 'contestedMarks', label: 'CM', title: 'Contested Marks', hideZero: true },
    { key: 'freesFor', label: 'FF', title: 'Frees For', hideZero: true },
    { key: 'freesAgainst', label: 'FA', title: 'Frees Against', hideZero: true },
  ],
  fantasy: [
    { key: 'aflFantasyPoints', label: 'AF', title: 'AFL Fantasy Points' },
    { key: 'superCoachPoints', label: 'SC', title: 'SuperCoach Points' },
    { key: 'minutesPlayed', label: 'MIN', title: 'Minutes Played' },
  ],
  efficiency: [],
}

/**
 * Best On Ground weighted composite score.
 * Weights: disposals 20%, goals 25%, clearances 15%, marks 10%,
 *          tackles 10%, scoreInvolvements 10%, clangers -10%
 */
function calcBOGScore(stat: MatchPlayerStats): number {
  return (
    (stat.disposals / 30) * 0.20 +
    (stat.goals / 4) * 0.25 +
    (stat.clearances / 10) * 0.15 +
    (stat.marks / 8) * 0.10 +
    (stat.tackles / 8) * 0.10 +
    (stat.scoreInvolvements / 8) * 0.10 -
    (stat.clangers / 5) * 0.10
  )
}

function getBOG(stats: MatchPlayerStats[]): MatchPlayerStats | null {
  const participating = stats.filter((s) => s.participated)
  if (!participating.length) return null
  return participating.reduce((best, s) =>
    calcBOGScore(s) > calcBOGScore(best) ? s : best,
    participating[0],
  )
}

function getStatValue(stat: MatchPlayerStats, key: SortKey): number {
  if (key === 'uncontestedPossessions') {
    return (stat.uncontestedPossessions ?? stat.uncountestedPossessions) ?? 0
  }
  const v = stat[key]
  return typeof v === 'number' ? v : 0
}

export interface PostMatchBoxScoreProps {
  match: Match
  clubs: Record<string, Club>
  players: Record<string, Player>
  playerClubId: string
}

export function PostMatchBoxScore({
  match,
  clubs,
  players,
  playerClubId,
}: PostMatchBoxScoreProps) {
  const navigate = useNavigate()

  const [group, setGroup] = useState<ColumnGroup>('possession')
  const [sortKey, setSortKey] = useState<SortKey>('disposals')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [effSortId, setEffSortId] = useState<string>('de_pct')
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all')

  const result = match.result!
  const homeClub = clubs[match.homeClubId]
  const awayClub = clubs[match.awayClubId]

  const totalRunningMinutes = result.quarterRunningMinutes
    ? result.quarterRunningMinutes.reduce((s, m) => s + m, 0)
    : 80

  const efficiencyCols: EfficiencyColDef[] = [
    ...EFFICIENCY_COLS,
    {
      id: 'tog_pct',
      label: 'TOG%',
      title: `Time on Ground % — running minutes / ${totalRunningMinutes} total`,
      compute: (s) => s.minutesPlayed > 0 ? `${Math.round((s.minutesPlayed / totalRunningMinutes) * 100)}%` : '-',
      numericValue: (s) => s.minutesPlayed / totalRunningMinutes,
    },
  ]

  const homeBOG = useMemo(() => getBOG(result.homePlayerStats), [result])
  const awayBOG = useMemo(() => getBOG(result.awayPlayerStats), [result])

  const bogIds = useMemo(
    () => new Set([homeBOG?.playerId, awayBOG?.playerId].filter(Boolean) as string[]),
    [homeBOG, awayBOG],
  )

  const allStats = useMemo(() => {
    type ExtendedStat = MatchPlayerStats & { clubId: string; isUser: boolean }
    const home: ExtendedStat[] = result.homePlayerStats.map((s) => ({
      ...s,
      clubId: match.homeClubId,
      isUser: match.homeClubId === playerClubId,
    }))
    const away: ExtendedStat[] = result.awayPlayerStats.map((s) => ({
      ...s,
      clubId: match.awayClubId,
      isUser: match.awayClubId === playerClubId,
    }))

    let merged = [...home, ...away].filter((s) => s.participated || s.disposals > 0 || s.minutesPlayed > 0)

    if (teamFilter === 'home') merged = merged.filter((s) => s.clubId === match.homeClubId)
    else if (teamFilter === 'away') merged = merged.filter((s) => s.clubId === match.awayClubId)

    if (group === 'efficiency') {
      const effCol = efficiencyCols.find((c) => c.id === effSortId) ?? efficiencyCols[0]
      return [...merged].sort((a, b) =>
        sortDir === 'desc'
          ? effCol.numericValue(b) - effCol.numericValue(a)
          : effCol.numericValue(a) - effCol.numericValue(b),
      )
    }

    return [...merged].sort((a, b) => {
      const av = getStatValue(a, sortKey)
      const bv = getStatValue(b, sortKey)
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [result, match, playerClubId, teamFilter, sortKey, sortDir, group, effSortId])

  const activeCols = group === 'efficiency' ? [] : COLUMN_GROUPS[group]

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const handleEffSort = (id: string) => {
    if (effSortId === id) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setEffSortId(id)
      setSortDir('desc')
    }
  }

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* Box Score Table */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle>Player Box Score</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {/* Team filter */}
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={teamFilter === 'all' ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setTeamFilter('all')}
                >
                  Both
                </Button>
                <Button
                  size="sm"
                  variant={teamFilter === 'home' ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setTeamFilter('home')}
                >
                  {homeClub?.abbreviation ?? 'Home'}
                </Button>
                <Button
                  size="sm"
                  variant={teamFilter === 'away' ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setTeamFilter('away')}
                >
                  {awayClub?.abbreviation ?? 'Away'}
                </Button>
              </div>

              {/* Column group toggles */}
              <div className="flex gap-1">
                {(['possession', 'scoring', 'defensive', 'fantasy', 'efficiency'] as const).map((g) => (
                  <Button
                    key={g}
                    size="sm"
                    variant={group === g ? 'default' : 'outline'}
                    className="h-7 text-xs capitalize"
                    onClick={() => setGroup(g)}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[140px]">
                    Player
                  </TableHead>
                  <TableHead className="text-center w-10 text-xs text-muted-foreground">
                    Team
                  </TableHead>
                  {group === 'efficiency'
                    ? efficiencyCols.map((col) => (
                        <Tooltip key={col.id}>
                          <TooltipTrigger asChild>
                            <TableHead
                              className={cn(
                                'text-center cursor-pointer select-none min-w-[60px] hover:bg-muted/50 transition-colors',
                                effSortId === col.id && 'bg-muted/40',
                              )}
                              onClick={() => handleEffSort(col.id)}
                            >
                              <div className="flex items-center justify-center gap-0.5">
                                {col.label}
                                {effSortId === col.id && (
                                  <ArrowUpDown className="h-3 w-3 opacity-60" />
                                )}
                              </div>
                            </TableHead>
                          </TooltipTrigger>
                          <TooltipContent>{col.title}</TooltipContent>
                        </Tooltip>
                      ))
                    : activeCols.map((col) => (
                        <Tooltip key={col.key}>
                          <TooltipTrigger asChild>
                            <TableHead
                              className={cn(
                                'text-center cursor-pointer select-none min-w-[40px] hover:bg-muted/50 transition-colors',
                                sortKey === col.key && 'bg-muted/40',
                              )}
                              onClick={() => handleSort(col.key)}
                            >
                              <div className="flex items-center justify-center gap-0.5">
                                {col.label}
                                {sortKey === col.key && (
                                  <ArrowUpDown className="h-3 w-3 opacity-60" />
                                )}
                              </div>
                            </TableHead>
                          </TooltipTrigger>
                          <TooltipContent>{col.title}</TooltipContent>
                        </Tooltip>
                      ))
                  }
                </TableRow>
              </TableHeader>

              <TableBody>
                {allStats.map((stat) => {
                  const player = players[stat.playerId]
                  const isBOG = bogIds.has(stat.playerId)
                  const club = clubs[(stat as MatchPlayerStats & { clubId: string }).clubId]
                  const isUser = (stat as MatchPlayerStats & { isUser: boolean }).isUser

                  return (
                    <TableRow
                      key={stat.playerId}
                      className={cn(
                        'text-sm',
                        isUser ? 'bg-primary/5' : '',
                        isBOG && 'outline outline-1 outline-amber-400/50',
                      )}
                    >
                      <TableCell className="sticky left-0 bg-inherit z-10 font-medium whitespace-nowrap py-1.5">
                        <div className="flex items-center gap-1">
                          {isBOG && (
                            <Star className="h-3 w-3 text-amber-400 shrink-0" />
                          )}
                          <button
                            className="hover:underline hover:text-primary transition-colors text-left"
                            onClick={() => navigate(`/player/${stat.playerId}`)}
                          >
                            {player
                              ? `${player.firstName.charAt(0)}. ${player.lastName}`
                              : stat.playerId}
                          </button>
                        </div>
                      </TableCell>

                      <TableCell className="text-center py-1.5">
                        <div className="flex items-center justify-center">
                          <div
                            className="h-3 w-3 rounded-full border border-border/50"
                            style={{ backgroundColor: club?.colors.primary ?? '#888' }}
                            title={club?.abbreviation}
                          />
                        </div>
                      </TableCell>

                      {group === 'efficiency'
                        ? efficiencyCols.map((col) => (
                            <TableCell
                              key={col.id}
                              className={cn(
                                'text-center py-1.5 tabular-nums',
                                effSortId === col.id && 'bg-muted/20',
                              )}
                            >
                              {col.compute(stat)}
                            </TableCell>
                          ))
                        : activeCols.map((col) => {
                            const val = getStatValue(stat, col.key)
                            const display =
                              col.hideZero && val === 0 ? '' : String(val)
                            return (
                              <TableCell
                                key={col.key}
                                className={cn(
                                  'text-center py-1.5',
                                  sortKey === col.key && 'bg-muted/20',
                                )}
                              >
                                {display}
                              </TableCell>
                            )
                          })
                      }
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
