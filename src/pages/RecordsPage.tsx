import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ChevronDown } from 'lucide-react'
import type { RecordsLeaderboardStat } from '@/types/history'

const STAT_LABELS: Record<RecordsLeaderboardStat, string> = {
  gamesPlayed: 'Games Played',
  goals: 'Goals',
  disposals: 'Disposals',
  marks: 'Marks',
  tackles: 'Tackles',
  hitouts: 'Hitouts',
  clearances: 'Clearances',
  intercepts: 'Intercepts',
  scoreInvolvements: 'Score Involvements',
  aflFantasyPoints: 'AFL Fantasy Points',
  superCoachPoints: 'SuperCoach Points',
}

// ---------------------------------------------------------------------------
// Section wrapper with collapse toggle
// ---------------------------------------------------------------------------

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Record row — one line per record
// ---------------------------------------------------------------------------

function RecordRow({
  label,
  value,
  primary,
  secondary,
  href,
}: {
  label: string
  value: string | number | null | undefined
  primary?: string
  secondary?: string
  href?: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-muted/30 transition-colors">
      <span className="flex-1 text-sm text-muted-foreground">{label}</span>
      {value != null ? (
        <>
          <span className="font-mono font-semibold text-sm min-w-[3rem] text-right">
            {value}
          </span>
          <div className="text-right min-w-[12rem]">
            {href ? (
              <Link to={href} className="text-sm font-medium hover:underline">
                {primary}
              </Link>
            ) : (
              <span className="text-sm font-medium">{primary}</span>
            )}
            {secondary && (
              <p className="text-xs text-muted-foreground">{secondary}</p>
            )}
          </div>
        </>
      ) : (
        <span className="text-sm text-muted-foreground italic">No record yet</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Leaderboard accordion item
// ---------------------------------------------------------------------------

function LeaderboardItem({
  label,
  entries,
  statKey,
  clubLabel,
}: {
  label: string
  entries: Array<{ playerId: string; playerName: string; clubId: string; value: number }>
  statKey: string
  clubLabel: (id: string) => string
}) {
  return (
    <AccordionItem value={statKey} className="border-b last:border-b-0">
      <AccordionTrigger className="px-4 py-2.5 text-sm font-medium hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20">
        <div className="flex items-center justify-between w-full pr-2">
          <span>{label}</span>
          {entries[0] && (
            <span className="text-xs text-muted-foreground font-normal">
              {entries[0].playerName} · {entries[0].value}
            </span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pl-4">#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Club</TableHead>
              <TableHead className="text-right pr-4">{label}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.slice(0, 10).map((entry, idx) => (
              <TableRow key={`${statKey}-${entry.playerId}`}>
                <TableCell className="pl-4 text-muted-foreground">{idx + 1}</TableCell>
                <TableCell>
                  <Link
                    to={`/player/${entry.playerId}`}
                    className="font-medium hover:underline"
                  >
                    {entry.playerName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {clubLabel(entry.clubId)}
                </TableCell>
                <TableCell className="text-right font-mono pr-4">{entry.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AccordionContent>
    </AccordionItem>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mini leaderboard table for Fantasy/SC section
// ---------------------------------------------------------------------------

function FscLeaderboardTable({
  entries,
  statLabel,
  clubLabel,
}: {
  entries: Array<{ playerId: string; playerName: string; clubId: string; avg: number; games: number }>
  statLabel: string
  clubLabel: (id: string) => string
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-2">No data yet — play through a season.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8 pl-0">#</TableHead>
          <TableHead>Player</TableHead>
          <TableHead>Club</TableHead>
          <TableHead className="text-right">GP</TableHead>
          <TableHead className="text-right pr-4">{statLabel}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e, idx) => (
          <TableRow key={e.playerId}>
            <TableCell className="pl-0 text-muted-foreground">{idx + 1}</TableCell>
            <TableCell>
              <Link to={`/player/${e.playerId}`} className="font-medium hover:underline">
                {e.playerName}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{clubLabel(e.clubId)}</TableCell>
            <TableCell className="text-right text-muted-foreground">{e.games}</TableCell>
            <TableCell className="text-right font-mono font-semibold pr-4">{e.avg}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function RecordsPage() {
  const history = useGameStore((s) => s.history)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const currentYear = useGameStore((s) => s.currentYear)
  const recordsBook = history.recordsBook
  const matchRecords = recordsBook.match

  // Build Club Awards: count how many times each player has won a club B&F
  const bfWinCounts = useMemo(() => {
    const counts: Record<string, { playerName: string; clubId: string; wins: number; latestYear: number }> = {}
    for (const award of history.awards ?? []) {
      for (const [, winner] of Object.entries(award.clubBestAndFairest)) {
        const pid = winner.playerId
        const existing = counts[pid]
        if (existing) {
          existing.wins++
          if (award.year > existing.latestYear) existing.latestYear = award.year
        } else {
          const p = players[pid]
          counts[pid] = {
            playerName: winner.playerName,
            clubId: p?.clubId ?? '',
            wins: 1,
            latestYear: award.year,
          }
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1].wins - a[1].wins || b[1].latestYear - a[1].latestYear)
      .slice(0, 10)
  }, [history.awards, players])

  // K:H Ratio leaderboard — highest and lowest ratio in career (min 20 games)
  const khLeaderboards = useMemo(() => {
    const qualified = Object.values(players).filter((p) => p.careerStats.gamesPlayed >= 20 && p.careerStats.handballs > 0)
    const sorted = qualified.map((p) => ({
      playerId: p.id,
      playerName: `${p.firstName} ${p.lastName}`,
      clubId: p.clubId,
      ratio: p.careerStats.kicks / p.careerStats.handballs,
    }))
    return {
      highest: [...sorted].sort((a, b) => b.ratio - a.ratio).slice(0, 10),
      lowest: [...sorted].sort((a, b) => a.ratio - b.ratio).slice(0, 10),
    }
  }, [players])

  const statKeys = useMemo(() => Object.keys(STAT_LABELS) as RecordsLeaderboardStat[], [])

  const clubLabel = (clubId: string) =>
    clubs[clubId]?.abbreviation ?? clubs[clubId]?.name ?? clubId

  const ss = recordsBook.singleSeason
  const team = recordsBook.team

  const singleSeasonRows = [
    {
      label: 'Most Goals',
      entry: ss.mostGoals,
      fmt: (e: typeof ss.mostGoals) =>
        e
          ? {
              value: e.value,
              primary: e.playerName,
              secondary: `${clubLabel(e.clubId)}${e.year ? ` · ${e.year}` : ''}`,
              href: `/player/${e.playerId}`,
            }
          : null,
    },
    {
      label: 'Most Disposals',
      entry: ss.mostDisposals,
      fmt: (e: typeof ss.mostDisposals) =>
        e
          ? {
              value: e.value,
              primary: e.playerName,
              secondary: `${clubLabel(e.clubId)}${e.year ? ` · ${e.year}` : ''}`,
              href: `/player/${e.playerId}`,
            }
          : null,
    },
    {
      label: 'Most Marks',
      entry: ss.mostMarks,
      fmt: (e: typeof ss.mostMarks) =>
        e
          ? {
              value: e.value,
              primary: e.playerName,
              secondary: `${clubLabel(e.clubId)}${e.year ? ` · ${e.year}` : ''}`,
              href: `/player/${e.playerId}`,
            }
          : null,
    },
    {
      label: 'Most Tackles',
      entry: ss.mostTackles,
      fmt: (e: typeof ss.mostTackles) =>
        e
          ? {
              value: e.value,
              primary: e.playerName,
              secondary: `${clubLabel(e.clubId)}${e.year ? ` · ${e.year}` : ''}`,
              href: `/player/${e.playerId}`,
            }
          : null,
    },
    {
      label: 'Most Hitouts',
      entry: ss.mostHitouts,
      fmt: (e: typeof ss.mostHitouts) =>
        e
          ? {
              value: e.value,
              primary: e.playerName,
              secondary: `${clubLabel(e.clubId)}${e.year ? ` · ${e.year}` : ''}`,
              href: `/player/${e.playerId}`,
            }
          : null,
    },
    {
      label: 'Most Clearances',
      entry: ss.mostClearances,
      fmt: (e: typeof ss.mostClearances) =>
        e
          ? {
              value: e.value,
              primary: e.playerName,
              secondary: `${clubLabel(e.clubId)}${e.year ? ` · ${e.year}` : ''}`,
              href: `/player/${e.playerId}`,
            }
          : null,
    },
    {
      label: 'Most Intercepts',
      entry: ss.mostIntercepts,
      fmt: (e: typeof ss.mostIntercepts) =>
        e
          ? {
              value: e.value,
              primary: e.playerName,
              secondary: `${clubLabel(e.clubId)}${e.year ? ` · ${e.year}` : ''}`,
              href: `/player/${e.playerId}`,
            }
          : null,
    },
    {
      label: 'Most Score Involvements',
      entry: ss.mostScoreInvolvements,
      fmt: (e: typeof ss.mostScoreInvolvements) =>
        e
          ? {
              value: e.value,
              primary: e.playerName,
              secondary: `${clubLabel(e.clubId)}${e.year ? ` · ${e.year}` : ''}`,
              href: `/player/${e.playerId}`,
            }
          : null,
    },
    {
      label: 'Most AFL Fantasy Pts',
      entry: ss.mostAflFantasyPoints,
      fmt: (e: typeof ss.mostAflFantasyPoints) =>
        e
          ? {
              value: e.value,
              primary: e.playerName,
              secondary: `${clubLabel(e.clubId)}${e.year ? ` · ${e.year}` : ''}`,
              href: `/player/${e.playerId}`,
            }
          : null,
    },
    {
      label: 'Most SuperCoach Pts',
      entry: ss.mostSuperCoachPoints,
      fmt: (e: typeof ss.mostSuperCoachPoints) =>
        e
          ? {
              value: e.value,
              primary: e.playerName,
              secondary: `${clubLabel(e.clubId)}${e.year ? ` · ${e.year}` : ''}`,
              href: `/player/${e.playerId}`,
            }
          : null,
    },
  ]

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold">AFL Records Book</h1>
        <p className="text-sm text-muted-foreground">
          League-wide records and leaderboards through {currentYear}
        </p>
      </div>

      {/* Single-Season Player Records */}
      <Section title="Single-Season Player Records">
        {singleSeasonRows.map((r) => {
          const data = r.fmt(r.entry as never)
          return (
            <RecordRow
              key={r.label}
              label={r.label}
              value={data?.value}
              primary={data?.primary}
              secondary={data?.secondary}
              href={data?.href}
            />
          )
        })}
      </Section>

      {/* Team Records */}
      <Section title="Team Records">
        <RecordRow
          label="Most Premierships"
          value={team.mostPremierships?.value}
          primary={team.mostPremierships?.clubName}
        />
        <RecordRow
          label="Longest Win Streak"
          value={team.longestWinStreak?.value != null ? `${team.longestWinStreak.value} games` : undefined}
          primary={team.longestWinStreak?.clubName}
          secondary={
            team.longestWinStreak
              ? `${team.longestWinStreak.startYear}–${team.longestWinStreak.endYear}`
              : undefined
          }
        />
        <RecordRow
          label="Longest Premiership Streak"
          value={team.longestPremiershipStreak?.value != null ? `${team.longestPremiershipStreak.value} in a row` : undefined}
          primary={team.longestPremiershipStreak?.clubName}
          secondary={
            team.longestPremiershipStreak
              ? `${team.longestPremiershipStreak.startYear}–${team.longestPremiershipStreak.endYear}`
              : undefined
          }
        />
        <RecordRow
          label="Most Top-4 Finishes"
          value={team.mostTopFourFinishes?.value}
          primary={team.mostTopFourFinishes?.clubName}
        />
      </Section>

      {/* Match Records */}
      <Section title="Match Records">
        <RecordRow
          label="Biggest Winning Margin"
          value={matchRecords?.biggestWinMargin?.value != null ? `${matchRecords.biggestWinMargin.value} pts` : undefined}
          primary={
            matchRecords?.biggestWinMargin
              ? `${clubLabel(matchRecords.biggestWinMargin.homeClubId)} vs ${clubLabel(matchRecords.biggestWinMargin.awayClubId)}`
              : undefined
          }
          secondary={
            matchRecords?.biggestWinMargin
              ? `${matchRecords.biggestWinMargin.year} · Round ${matchRecords.biggestWinMargin.round}`
              : undefined
          }
        />
        <RecordRow
          label="Highest Team Score"
          value={matchRecords?.highestTeamScore?.value}
          primary={
            matchRecords?.highestTeamScore
              ? `${clubLabel(matchRecords.highestTeamScore.homeClubId)} vs ${clubLabel(matchRecords.highestTeamScore.awayClubId)}`
              : undefined
          }
          secondary={
            matchRecords?.highestTeamScore
              ? `${matchRecords.highestTeamScore.year} · Round ${matchRecords.highestTeamScore.round}`
              : undefined
          }
        />
        <RecordRow
          label="Highest Combined Score"
          value={matchRecords?.highestCombinedScore?.value}
          primary={
            matchRecords?.highestCombinedScore
              ? `${clubLabel(matchRecords.highestCombinedScore.homeClubId)} vs ${clubLabel(matchRecords.highestCombinedScore.awayClubId)}`
              : undefined
          }
          secondary={
            matchRecords?.highestCombinedScore
              ? `${matchRecords.highestCombinedScore.year} · Round ${matchRecords.highestCombinedScore.round}`
              : undefined
          }
        />
      </Section>

      {/* Club Awards */}
      <Section title="Club Awards">
        <div className="px-4 py-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Most Club B&amp;F Awards</h4>
          {bfWinCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No awards yet — complete a season to see winners.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 pl-0">#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>Club</TableHead>
                  <TableHead className="text-right">B&amp;F Awards</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bfWinCounts.map(([pid, data], idx) => (
                  <TableRow key={pid}>
                    <TableCell className="pl-0 text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <Link to={`/player/${pid}`} className="font-medium hover:underline">
                        {data.playerName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {clubs[data.clubId]?.abbreviation ?? data.clubId}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{data.wins}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Section>

      {/* K:H Ratio Leaderboards */}
      <Section title="K:H Ratio Leaders (Career)" defaultOpen={false}>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Most Kick-Dominant (min 20 GP)</h4>
            {khLeaderboards.highest.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Not enough data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 pl-0">#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead className="text-right">K:H</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {khLeaderboards.highest.map((e, idx) => (
                    <TableRow key={e.playerId}>
                      <TableCell className="pl-0 text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <Link to={`/player/${e.playerId}`} className="font-medium hover:underline">{e.playerName}</Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{clubLabel(e.clubId)}</TableCell>
                      <TableCell className="text-right font-mono">{e.ratio.toFixed(1)}:1</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Most Handball-Dominant (min 20 GP)</h4>
            {khLeaderboards.lowest.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Not enough data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 pl-0">#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead className="text-right">K:H</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {khLeaderboards.lowest.map((e, idx) => (
                    <TableRow key={e.playerId}>
                      <TableCell className="pl-0 text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <Link to={`/player/${e.playerId}`} className="font-medium hover:underline">{e.playerName}</Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{clubLabel(e.clubId)}</TableCell>
                      <TableCell className="text-right font-mono">{e.ratio.toFixed(1)}:1</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </Section>

      {/* Statistical Leaderboards */}
      <Section title="Statistical Leaderboards">
        <div className="px-4 pt-3 pb-2">
          <Tabs defaultValue="career">
            <TabsList className="mb-3">
              <TabsTrigger value="career">Career</TabsTrigger>
              <TabsTrigger value="season">Current Season</TabsTrigger>
            </TabsList>

            <TabsContent value="career">
              <Card className="p-0 overflow-hidden">
                <Accordion type="multiple" className="divide-y">
                  {statKeys.map((stat) => (
                    <LeaderboardItem
                      key={`career-${stat}`}
                      statKey={`career-${stat}`}
                      label={`Career ${STAT_LABELS[stat]}`}
                      entries={recordsBook.leaderboards.career[stat]}
                      clubLabel={clubLabel}
                    />
                  ))}
                </Accordion>
              </Card>
            </TabsContent>

            <TabsContent value="season">
              <Card className="p-0 overflow-hidden">
                <Accordion type="multiple" className="divide-y">
                  {statKeys.map((stat) => (
                    <LeaderboardItem
                      key={`season-${stat}`}
                      statKey={`season-${stat}`}
                      label={`${currentYear} ${STAT_LABELS[stat]}`}
                      entries={recordsBook.leaderboards.season[stat]}
                      clubLabel={clubLabel}
                    />
                  ))}
                </Accordion>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </Section>
    </div>
  )
}
