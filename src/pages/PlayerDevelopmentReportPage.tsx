import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { getPlayerStarRating } from '@/engine/player/playerRating'

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) return <Badge className="bg-green-600 text-white">+{delta.toFixed(1)}</Badge>
  if (delta < 0) return <Badge className="bg-red-600 text-white">{delta.toFixed(1)}</Badge>
  return <Badge variant="secondary">0.0</Badge>
}

export function PlayerDevelopmentReportPage() {
  const history = useGameStore((s) => s.history)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)

  const reports = useMemo(
    () => [...history.developmentReports].sort((a, b) => b.year - a.year),
    [history.developmentReports],
  )
  const [selectedYear, setSelectedYear] = useState<number>(reports[0]?.year ?? 0)
  const report = useMemo(
    () => reports.find((r) => r.year === selectedYear) ?? reports[0] ?? null,
    [reports, selectedYear],
  )

  if (!report) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No player development report available yet.
        </CardContent>
      </Card>
    )
  }

  const tableRows = (rows: typeof report.risers) => rows.slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Player Development Report</h1>
          <p className="text-sm text-muted-foreground">
            Preseason {report.year} development outcomes
          </p>
        </div>
        <select
          value={report.year}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {reports.map((r) => (
            <option key={r.year} value={r.year}>{r.year}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Biggest Risers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Club</TableHead>
                  <TableHead className="text-center">Delta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows(report.risers).map((r) => (
                  <TableRow key={r.playerId}>
                    <TableCell>
                      <div>
                        <Link to={`/player/${r.playerId}`} className="font-medium hover:underline">{r.playerName}</Link>
                        {players[r.playerId] && (
                          <PlayerStarRating stars={getPlayerStarRating(players[r.playerId])} player={players[r.playerId]} className="scale-[0.75] origin-left" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{clubs[r.clubId]?.abbreviation ?? r.clubId}</TableCell>
                    <TableCell className="text-center"><DeltaBadge delta={r.delta} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Biggest Fallers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Club</TableHead>
                  <TableHead className="text-center">Delta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows(report.fallers).map((r) => (
                  <TableRow key={r.playerId}>
                    <TableCell>
                      <div>
                        <Link to={`/player/${r.playerId}`} className="font-medium hover:underline">{r.playerName}</Link>
                        {players[r.playerId] && (
                          <PlayerStarRating stars={getPlayerStarRating(players[r.playerId])} player={players[r.playerId]} className="scale-[0.75] origin-left" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{clubs[r.clubId]?.abbreviation ?? r.clubId}</TableCell>
                    <TableCell className="text-center"><DeltaBadge delta={r.delta} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Breakout Candidates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.breakoutCandidates.slice(0, 12).map((r) => (
              <div key={r.playerId} className="flex items-center justify-between rounded border p-2">
                <div>
                  <Link to={`/player/${r.playerId}`} className="font-medium text-sm hover:underline">{r.playerName}</Link>
                  {players[r.playerId] && (
                    <PlayerStarRating stars={getPlayerStarRating(players[r.playerId])} player={players[r.playerId]} className="scale-[0.75] origin-left" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{r.overallAfter.toFixed(1)} OVR</Badge>
                  <DeltaBadge delta={r.delta} />
                </div>
              </div>
            ))}
            {report.breakoutCandidates.length === 0 && (
              <p className="text-sm text-muted-foreground">No clear breakout candidates this year.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bust Watch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.busts.slice(0, 12).map((r) => (
              <div key={r.playerId} className="flex items-center justify-between rounded border p-2">
                <div>
                  <Link to={`/player/${r.playerId}`} className="font-medium text-sm hover:underline">{r.playerName}</Link>
                  {players[r.playerId] && (
                    <PlayerStarRating stars={getPlayerStarRating(players[r.playerId])} player={players[r.playerId]} className="scale-[0.75] origin-left" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Pick {r.draftPick ?? '-'}</Badge>
                  <DeltaBadge delta={r.delta} />
                </div>
              </div>
            ))}
            {report.busts.length === 0 && (
              <p className="text-sm text-muted-foreground">No major early-pick bust signals.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Club Development Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Club</TableHead>
                <TableHead className="text-center">Avg Delta</TableHead>
                <TableHead className="text-center">Risers</TableHead>
                <TableHead className="text-center">Fallers</TableHead>
                <TableHead className="text-center">Youth Delta</TableHead>
                <TableHead className="text-center">Veteran Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.clubSummaries.map((s) => (
                <TableRow key={s.clubId}>
                  <TableCell className="font-medium">{clubs[s.clubId]?.fullName ?? s.clubId}</TableCell>
                  <TableCell className="text-center"><DeltaBadge delta={s.avgDelta} /></TableCell>
                  <TableCell className="text-center">{s.risers}</TableCell>
                  <TableCell className="text-center">{s.fallers}</TableCell>
                  <TableCell className="text-center">{s.youthAvgDelta.toFixed(1)}</TableCell>
                  <TableCell className="text-center">{s.veteranAvgDelta.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
