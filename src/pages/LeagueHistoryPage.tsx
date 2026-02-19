import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MatchReportModal } from '@/components/match/MatchReportModal'
import type { MatchReport } from '@/types/history'

const FINALS_ORDER: Array<'QF' | 'EF' | 'SF' | 'PF' | 'GF'> = ['QF', 'EF', 'SF', 'PF', 'GF']
const FINALS_LABELS: Record<string, string> = {
  QF: 'Qualifying Finals',
  EF: 'Elimination Finals',
  SF: 'Semi Finals',
  PF: 'Preliminary Finals',
  GF: 'Grand Final',
}

export function LeagueHistoryPage() {
  const history = useGameStore((s) => s.history)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const tradeHistory = useGameStore((s) => s.tradeHistory)

  const clubName = (clubId: string) => clubs[clubId]?.name ?? clubId
  const clubAbbr = (clubId: string) => clubs[clubId]?.abbreviation ?? clubs[clubId]?.name ?? clubId

  // Year lists for dropdowns
  const archiveYears = useMemo(
    () => (history.seasonArchives ?? []).map((a) => a.year).sort((a, b) => b - a),
    [history.seasonArchives],
  )
  const draftYears = useMemo(
    () => [...new Set(history.draftHistory.map((d) => d.year))].sort((a, b) => b - a),
    [history.draftHistory],
  )
  const tradeYears = useMemo(
    () => [...new Set(tradeHistory.map((t) => new Date(t.date).getFullYear()))].sort((a, b) => b - a),
    [tradeHistory],
  )
  const awardYears = useMemo(
    () => (history.awards ?? []).map((a) => a.year).sort((a, b) => b - a),
    [history.awards],
  )
  const reportYears = useMemo(
    () => [...new Set((history.matchReports ?? []).map((r) => r.year))].sort((a, b) => b - a),
    [history.matchReports],
  )
  const [selectedReport, setSelectedReport] = useState<MatchReport | null>(null)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">League History</h1>
        <p className="text-sm text-muted-foreground">
          Browse the complete history of the competition
        </p>
      </div>

      <Tabs defaultValue="premiers">
        <TabsList className="flex-wrap">
          <TabsTrigger value="premiers">Premiers</TabsTrigger>
          <TabsTrigger value="ladders">Ladders</TabsTrigger>
          <TabsTrigger value="finals">Finals</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="awards">Awards</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="premiers">
          <PremiersTab />
        </TabsContent>
        <TabsContent value="ladders">
          <LaddersTab years={archiveYears} />
        </TabsContent>
        <TabsContent value="finals">
          <FinalsTab years={archiveYears} />
        </TabsContent>
        <TabsContent value="draft">
          <DraftTab years={draftYears} />
        </TabsContent>
        <TabsContent value="trades">
          <TradesTab years={tradeYears} />
        </TabsContent>
        <TabsContent value="awards">
          <AwardsTab years={awardYears} />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab years={reportYears} />
        </TabsContent>
      </Tabs>
      {selectedReport && (
        <MatchReportModal
          report={selectedReport}
          clubs={clubs}
          players={players}
          open={true}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </div>
  )

  // ---------- Premiers Tab ----------
  function PremiersTab() {
    const seasons = useMemo(
      () => [...history.seasons].sort((a, b) => b.year - a.year),
      [history.seasons],
    )

    if (seasons.length === 0) {
      return <EmptyState message="No completed seasons yet." />
    }

    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Premiership History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Year</TableHead>
                <TableHead>Premier</TableHead>
                <TableHead>Runner-Up</TableHead>
                <TableHead className="text-right">GF Score</TableHead>
                <TableHead>Top 4</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seasons.map((s) => (
                <TableRow key={s.year}>
                  <TableCell className="font-mono">{s.year}</TableCell>
                  <TableCell>
                    <Link to={`/club/${s.premierClubId}`} className="font-medium hover:underline">
                      {clubName(s.premierClubId)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link to={`/club/${s.runnerUpClubId}`} className="hover:underline">
                      {clubName(s.runnerUpClubId)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {s.grandFinalScore.home} - {s.grandFinalScore.away}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.ladderTopFour.map((id) => clubAbbr(id)).join(', ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  // ---------- Ladders Tab ----------
  function LaddersTab({ years }: { years: number[] }) {
    const [selectedYear, setSelectedYear] = useState<string>(
      years.length > 0 ? String(years[0]) : '',
    )

    const archive = useMemo(
      () => (history.seasonArchives ?? []).find((a) => a.year === Number(selectedYear)),
      [selectedYear, history.seasonArchives],
    )

    if (years.length === 0) {
      return <EmptyState message="No archived ladders available. Complete a season to see full ladder history." />
    }

    return (
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm">Season Ladder</CardTitle>
          <YearSelector years={years} value={selectedYear} onChange={setSelectedYear} />
        </CardHeader>
        <CardContent>
          {archive ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Club</TableHead>
                  <TableHead className="text-right">P</TableHead>
                  <TableHead className="text-right">W</TableHead>
                  <TableHead className="text-right">L</TableHead>
                  <TableHead className="text-right">D</TableHead>
                  <TableHead className="text-right">Pts</TableHead>
                  <TableHead className="text-right">PF</TableHead>
                  <TableHead className="text-right">PA</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archive.ladder.map((e, i) => (
                  <TableRow key={e.clubId}>
                    <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <Link to={`/club/${e.clubId}`} className="hover:underline">
                        {clubName(e.clubId)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono">{e.played}</TableCell>
                    <TableCell className="text-right font-mono">{e.wins}</TableCell>
                    <TableCell className="text-right font-mono">{e.losses}</TableCell>
                    <TableCell className="text-right font-mono">{e.draws}</TableCell>
                    <TableCell className="text-right font-mono font-medium">{e.points}</TableCell>
                    <TableCell className="text-right font-mono">{e.pointsFor}</TableCell>
                    <TableCell className="text-right font-mono">{e.pointsAgainst}</TableCell>
                    <TableCell className="text-right font-mono">{e.percentage.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No ladder data for this season.</p>
          )}
        </CardContent>
      </Card>
    )
  }

  // ---------- Finals Tab ----------
  function FinalsTab({ years }: { years: number[] }) {
    const [selectedYear, setSelectedYear] = useState<string>(
      years.length > 0 ? String(years[0]) : '',
    )

    const archive = useMemo(
      () => (history.seasonArchives ?? []).find((a) => a.year === Number(selectedYear)),
      [selectedYear, history.seasonArchives],
    )

    if (years.length === 0) {
      return <EmptyState message="No archived finals available. Complete a season to see finals history." />
    }

    const finalsResults = archive?.finalsResults ?? []

    return (
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm">Finals Series</CardTitle>
          <YearSelector years={years} value={selectedYear} onChange={setSelectedYear} />
        </CardHeader>
        <CardContent className="space-y-6">
          {finalsResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No finals data for this season.</p>
          ) : (
            FINALS_ORDER
              .filter((ft) => finalsResults.some((m) => m.finalType === ft))
              .map((ft) => (
                <div key={ft} className="space-y-2">
                  <h3 className="text-sm font-semibold">{FINALS_LABELS[ft] ?? ft}</h3>
                  {finalsResults
                    .filter((m) => m.finalType === ft)
                    .map((m, idx) => (
                      <div
                        key={`${ft}-${idx}`}
                        className="flex items-center justify-between rounded-md border p-3 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/club/${m.homeClubId}`}
                            className={`hover:underline ${m.winnerClubId === m.homeClubId ? 'font-bold' : ''}`}
                          >
                            {clubName(m.homeClubId)}
                          </Link>
                          <span className="font-mono">
                            {m.homeScore} - {m.awayScore}
                          </span>
                          <Link
                            to={`/club/${m.awayClubId}`}
                            className={`hover:underline ${m.winnerClubId === m.awayClubId ? 'font-bold' : ''}`}
                          >
                            {clubName(m.awayClubId)}
                          </Link>
                        </div>
                        <span className="text-xs text-muted-foreground">{m.venue}</span>
                      </div>
                    ))}
                </div>
              ))
          )}
        </CardContent>
      </Card>
    )
  }

  // ---------- Draft Tab ----------
  function DraftTab({ years }: { years: number[] }) {
    const [selectedYear, setSelectedYear] = useState<string>(
      years.length > 0 ? String(years[0]) : '',
    )

    const picks = useMemo(
      () =>
        history.draftHistory
          .filter((d) => d.year === Number(selectedYear))
          .sort((a, b) => a.pickNumber - b.pickNumber),
      [selectedYear, history.draftHistory],
    )

    if (years.length === 0) {
      return <EmptyState message="No draft history yet." />
    }

    return (
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm">Draft</CardTitle>
          <YearSelector years={years} value={selectedYear} onChange={setSelectedYear} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Pick</TableHead>
                <TableHead className="w-16">Round</TableHead>
                <TableHead>Club</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {picks.map((p) => (
                <TableRow key={`${p.year}-${p.pickNumber}`}>
                  <TableCell className="font-mono">{p.pickNumber}</TableCell>
                  <TableCell className="font-mono">{p.round}</TableCell>
                  <TableCell>
                    <Link to={`/club/${p.clubId}`} className="hover:underline">
                      {clubAbbr(p.clubId)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link to={`/player/${p.playerId}`} className="hover:underline">
                      {p.playerName}
                    </Link>
                  </TableCell>
                  <TableCell>{p.position}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  // ---------- Trades Tab ----------
  function TradesTab({ years }: { years: number[] }) {
    const [selectedYear, setSelectedYear] = useState<string>(
      years.length > 0 ? String(years[0]) : '',
    )

    const trades = useMemo(
      () =>
        tradeHistory
          .filter((t) => new Date(t.date).getFullYear() === Number(selectedYear))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      [selectedYear, tradeHistory],
    )

    if (years.length === 0) {
      return <EmptyState message="No trade history yet." />
    }

    const playerName = (pid: string) => {
      const p = players[pid]
      return p ? `${p.firstName} ${p.lastName}` : pid
    }

    return (
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm">Trades</CardTitle>
          <YearSelector years={years} value={selectedYear} onChange={setSelectedYear} />
        </CardHeader>
        <CardContent className="space-y-3">
          {trades.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trades for this year.</p>
          ) : (
            trades.map((t) => (
              <div key={t.id} className="rounded-md border p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link to={`/club/${t.clubA}`} className="font-medium hover:underline">
                      {clubAbbr(t.clubA)}
                    </Link>
                    <span className="text-muted-foreground">↔</span>
                    <Link to={`/club/${t.clubB}`} className="font-medium hover:underline">
                      {clubAbbr(t.clubB)}
                    </Link>
                  </div>
                  <span className="text-xs text-muted-foreground">{t.date}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground mb-1">To {clubAbbr(t.clubA)}:</p>
                    {t.playersToA.map((pid) => (
                      <Link key={pid} to={`/player/${pid}`} className="block hover:underline">
                        {playerName(pid)}
                      </Link>
                    ))}
                    {t.playersToA.length === 0 && <span className="text-muted-foreground">-</span>}
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">To {clubAbbr(t.clubB)}:</p>
                    {t.playersToB.map((pid) => (
                      <Link key={pid} to={`/player/${pid}`} className="block hover:underline">
                        {playerName(pid)}
                      </Link>
                    ))}
                    {t.playersToB.length === 0 && <span className="text-muted-foreground">-</span>}
                  </div>
                </div>
                {(t.salaryRetainedByA > 0 || t.salaryRetainedByB > 0) && (
                  <div className="text-xs text-muted-foreground">
                    {t.salaryRetainedByA > 0 && (
                      <span>{clubAbbr(t.clubA)} retains ${(t.salaryRetainedByA / 1000).toFixed(0)}k </span>
                    )}
                    {t.salaryRetainedByB > 0 && (
                      <span>{clubAbbr(t.clubB)} retains ${(t.salaryRetainedByB / 1000).toFixed(0)}k</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    )
  }

  // ---------- Awards Tab ----------
  function AwardsTab({ years }: { years: number[] }) {
    const [selectedYear, setSelectedYear] = useState<string>(
      years.length > 0 ? String(years[0]) : '',
    )

    const awards = useMemo(
      () => (history.awards ?? []).find((a) => a.year === Number(selectedYear)),
      [selectedYear, history.awards],
    )

    if (years.length === 0) {
      return <EmptyState message="No awards yet. Complete a season to see award winners." />
    }

    return (
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm">Season Awards</CardTitle>
          <YearSelector years={years} value={selectedYear} onChange={setSelectedYear} />
        </CardHeader>
        <CardContent className="space-y-4">
          {!awards ? (
            <p className="text-sm text-muted-foreground">No awards data for this season.</p>
          ) : (
            <>
              {/* Brownlow Medal */}
              <AwardCard
                title="Brownlow Medal"
                content={
                  awards.brownlowMedal ? (
                    <div className="space-y-1">
                      <Link to={`/player/${awards.brownlowMedal.playerId}`} className="font-medium hover:underline">
                        {awards.brownlowMedal.playerName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {clubName(awards.brownlowMedal.clubId)} — {awards.brownlowMedal.votes} votes
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not awarded</p>
                  )
                }
              />

              {/* Coleman Medal */}
              <AwardCard
                title="Coleman Medal"
                content={
                  awards.colemanMedal ? (
                    <div className="space-y-1">
                      <Link to={`/player/${awards.colemanMedal.playerId}`} className="font-medium hover:underline">
                        {awards.colemanMedal.playerName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {clubName(awards.colemanMedal.clubId)} — {awards.colemanMedal.goals} goals
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not awarded</p>
                  )
                }
              />

              {/* Rising Star */}
              <AwardCard
                title="Rising Star"
                content={
                  awards.risingStar ? (
                    <div className="space-y-1">
                      <Link to={`/player/${awards.risingStar.playerId}`} className="font-medium hover:underline">
                        {awards.risingStar.playerName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{clubName(awards.risingStar.clubId)}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not awarded</p>
                  )
                }
              />

              {/* All-Australian */}
              {awards.allAustralian.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">All-Australian</h4>
                  <div className="flex flex-wrap gap-1">
                    {awards.allAustralian.map((p) => (
                      <Link key={p.playerId} to={`/player/${p.playerId}`}>
                        <Badge variant="secondary" className="cursor-pointer hover:bg-accent">
                          {p.playerName} ({clubAbbr(p.clubId)})
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Club Best & Fairest */}
              {Object.keys(awards.clubBestAndFairest).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Club Best & Fairest</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Club</TableHead>
                        <TableHead>Winner</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(awards.clubBestAndFairest)
                        .sort((a, b) => clubName(a[0]).localeCompare(clubName(b[0])))
                        .map(([cid, winner]) => (
                          <TableRow key={cid}>
                            <TableCell>
                              <Link to={`/club/${cid}`} className="hover:underline">
                                {clubName(cid)}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Link to={`/player/${winner.playerId}`} className="hover:underline">
                                {winner.playerName}
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  // ---------- Reports Tab ----------
  function ReportsTab({ years }: { years: number[] }) {
    const allReports = history.matchReports ?? []
    const [selectedYear, setSelectedYear] = useState<string>(years.length > 0 ? String(years[0]) : '')

    const year = Number(selectedYear)
    const yearReports = allReports.filter((r) => r.year === year)
    const regularReports = yearReports.filter((r) => !r.isFinal)
    const finalsReports = yearReports.filter((r) => r.isFinal)

    const FINALS_LABEL: Record<string, string> = {
      QF: 'Qualifying Final', EF: 'Elimination Final',
      SF: 'Semi Final', PF: 'Preliminary Final', GF: 'Grand Final',
    }

    function ReportCard({ report }: { report: MatchReport }) {
      const home = clubs[report.homeClubId]
      const away = clubs[report.awayClubId]
      const homeAbbr = home?.abbreviation ?? report.homeClubId
      const awayAbbr = away?.abbreviation ?? report.awayClubId
      const label = report.isFinal && report.finalType
        ? FINALS_LABEL[report.finalType] ?? report.finalType
        : `Round ${report.round}`
      return (
        <div className="flex items-center justify-between rounded border px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{label}</Badge>
            <span className="font-mono font-medium">
              {homeAbbr} {report.homeScore} – {report.awayScore} {awayAbbr}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSelectedReport(report)}>
            View Report
          </Button>
        </div>
      )
    }

    if (years.length === 0) {
      return <EmptyState message="No match reports available yet. Simulate a round to generate reports." />
    }

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Match Reports</CardTitle>
            <YearSelector years={years} value={selectedYear} onChange={setSelectedYear} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {yearReports.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No reports for {year}.</p>
          ) : (
            <>
              {regularReports.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regular Season</h3>
                  <div className="space-y-1">
                    {regularReports.map((r) => <ReportCard key={r.id} report={r} />)}
                  </div>
                </div>
              )}
              {finalsReports.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Finals</h3>
                  <div className="space-y-1">
                    {finalsReports.map((r) => <ReportCard key={r.id} report={r} />)}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    )
  }
}

// ---------- Shared Components ----------

function YearSelector({
  years,
  value,
  onChange,
}: {
  years: number[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-28">
        <SelectValue placeholder="Year" />
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => (
          <SelectItem key={y} value={String(y)}>
            {y}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  )
}

function AwardCard({ title, content }: { title: string; content: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">{title}</h4>
      {content}
    </div>
  )
}
