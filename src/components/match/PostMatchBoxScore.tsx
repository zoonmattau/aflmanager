import { useMemo, useState } from 'react'
import { Star, MapPin, Users, ArrowUpDown } from 'lucide-react'
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
    title: 'Disposal Efficiency — effective disposals as % of total',
    compute: (s) => fmtPct(calcDisposalEfficiency(s.disposals, s.clangers)),
    numericValue: (s) => calcDisposalEfficiency(s.disposals, s.clangers) ?? 0,
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
    { key: 'disposals', label: 'D' },
    { key: 'kicks', label: 'K' },
    { key: 'handballs', label: 'HB' },
    { key: 'contestedPossessions', label: 'CP' },
    { key: 'uncontestedPossessions', label: 'UP' },
    { key: 'clearances', label: 'CL' },
    { key: 'insideFifties', label: 'I50' },
    { key: 'rebound50s', label: 'R50' },
    { key: 'metresGained', label: 'MG' },
    { key: 'turnovers', label: 'TO', hideZero: true },
    { key: 'clangers', label: 'CLG', hideZero: true },
  ],
  scoring: [
    { key: 'goals', label: 'G', hideZero: true },
    { key: 'behinds', label: 'B', hideZero: true },
    { key: 'goalAssists', label: 'GA', hideZero: true },
    { key: 'scoreInvolvements', label: 'SI' },
    { key: 'insideFifties', label: 'I50' },
  ],
  defensive: [
    { key: 'tackles', label: 'T' },
    { key: 'intercepts', label: 'INT' },
    { key: 'rebound50s', label: 'R50' },
    { key: 'onePercenters', label: '1%', hideZero: true },
    { key: 'marks', label: 'M' },
    { key: 'contestedMarks', label: 'CM', hideZero: true },
  ],
  fantasy: [
    { key: 'aflFantasyPoints', label: 'AF' },
    { key: 'superCoachPoints', label: 'SC' },
    { key: 'minutesPlayed', label: 'MIN' },
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
  const [group, setGroup] = useState<ColumnGroup>('possession')
  const [sortKey, setSortKey] = useState<SortKey>('disposals')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [effSortId, setEffSortId] = useState<string>('de_pct')
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all')

  const result = match.result!
  const homeClub = clubs[match.homeClubId]
  const awayClub = clubs[match.awayClubId]

  const homeBOG = useMemo(() => getBOG(result.homePlayerStats), [result])
  const awayBOG = useMemo(() => getBOG(result.awayPlayerStats), [result])

  const homeKH = useMemo(() => {
    const kicks = result.homePlayerStats.reduce((s, p) => s + p.kicks, 0)
    const handballs = result.homePlayerStats.reduce((s, p) => s + p.handballs, 0)
    return { kicks, handballs }
  }, [result])
  const awayKH = useMemo(() => {
    const kicks = result.awayPlayerStats.reduce((s, p) => s + p.kicks, 0)
    const handballs = result.awayPlayerStats.reduce((s, p) => s + p.handballs, 0)
    return { kicks, handballs }
  }, [result])

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

    let merged = [...home, ...away].filter((s) => s.participated)

    if (teamFilter === 'home') merged = merged.filter((s) => s.clubId === match.homeClubId)
    else if (teamFilter === 'away') merged = merged.filter((s) => s.clubId === match.awayClubId)

    if (group === 'efficiency') {
      const effCol = EFFICIENCY_COLS.find((c) => c.id === effSortId) ?? EFFICIENCY_COLS[0]
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
    <div className="space-y-4">
      {/* Match Summary Banner */}
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-8">
            {/* Home Club */}
            <div className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-12 rounded-full border border-border"
                style={{ backgroundColor: homeClub?.colors.primary }}
              />
              <span className="font-bold">{homeClub?.abbreviation}</span>
              {homeBOG && (
                <div className="flex items-center gap-1 text-xs text-amber-500">
                  <Star className="h-3 w-3" />
                  <span>
                    {players[homeBOG.playerId]
                      ? `${players[homeBOG.playerId].firstName.charAt(0)}. ${players[homeBOG.playerId].lastName}`
                      : 'BOG'}
                  </span>
                </div>
              )}
            </div>

            {/* Score */}
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums">
                {result.homeTotalScore} – {result.awayTotalScore}
              </div>
              <div className="mt-1 text-xs text-muted-foreground font-mono">
                {result.homeScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
                <br />
                {result.awayScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
              </div>
            </div>

            {/* Away Club */}
            <div className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-12 rounded-full border border-border"
                style={{ backgroundColor: awayClub?.colors.primary }}
              />
              <span className="font-bold">{awayClub?.abbreviation}</span>
              {awayBOG && (
                <div className="flex items-center gap-1 text-xs text-amber-500">
                  <Star className="h-3 w-3" />
                  <span>
                    {players[awayBOG.playerId]
                      ? `${players[awayBOG.playerId].firstName.charAt(0)}. ${players[awayBOG.playerId].lastName}`
                      : 'BOG'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Team K:H summary */}
          <div className="mt-3 flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="font-mono">{homeKH.kicks}:{homeKH.handballs} K:H</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-mono">{awayKH.kicks}:{awayKH.handballs} K:H</span>
          </div>

          {result.simulationContext && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {match.venue}
              </span>
              {result.simulationContext.attendance != null && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {result.simulationContext.attendance.toLocaleString()}
                  {result.simulationContext.capacityPct != null && (
                    <span> ({result.simulationContext.capacityPct}%)</span>
                  )}
                </span>
              )}
              <span className="capitalize">
                {result.simulationContext.weather}, {result.simulationContext.groundCondition}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Box Score Table */}
      <Card>
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
                    ? EFFICIENCY_COLS.map((col) => (
                        <TableHead
                          key={col.id}
                          title={col.title}
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
                      ))
                    : activeCols.map((col) => (
                        <TableHead
                          key={col.key}
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
                          <span>
                            {player
                              ? `${player.firstName.charAt(0)}. ${player.lastName}`
                              : stat.playerId}
                          </span>
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
                        ? EFFICIENCY_COLS.map((col) => (
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
