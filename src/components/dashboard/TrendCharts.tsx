import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SeasonArchive } from '@/types/historyArchive'
import type { PowerRankingSnapshot } from '@/types/season'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

interface TrendChartsProps {
  playerClubId: string
  clubColor: string
  seasonArchives: SeasonArchive[]
  powerRankings: PowerRankingSnapshot[]
  currentYear: number
  totalTeams: number
  finalsTeams?: number
}

type FinishPoint = { year: number; position: number; label: string }
type RoundPoint  = { round: number; position: number; label: string }

export function TrendCharts({
  playerClubId,
  clubColor,
  seasonArchives,
  powerRankings,
  currentYear,
  totalTeams,
  finalsTeams = 8,
}: TrendChartsProps) {
  const seasonFinishData = useMemo<FinishPoint[]>(() => {
    return seasonArchives
      .map((archive) => {
        const idx = archive.ladder.findIndex((e) => e.clubId === playerClubId)
        if (idx === -1) return null
        return { year: archive.year, position: idx + 1, label: String(archive.year) }
      })
      .filter((d): d is FinishPoint => d !== null)
      .sort((a, b) => a.year - b.year)
      .slice(-10)
  }, [seasonArchives, playerClubId])

  const inSeasonData = useMemo<RoundPoint[]>(() => {
    return powerRankings
      .filter((s) => s.year === currentYear)
      .sort((a, b) => a.round - b.round)
      .flatMap((snapshot) => {
        const entry = snapshot.entries.find((e) => e.clubId === playerClubId)
        if (!entry) return []
        return [{ round: snapshot.round, position: entry.rank, label: `R${snapshot.round}` }]
      })
  }, [powerRankings, playerClubId, currentYear])

  const hasSeasonHistory = seasonFinishData.length >= 2
  const hasInSeason = inSeasonData.length >= 2

  if (!hasSeasonHistory && !hasInSeason) return null

  const lineColor = clubColor || '#3b82f6'
  const yDomain: [number, number] = [1, totalTeams]
  const gridStroke = 'rgba(128,128,128,0.15)'

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* Season-over-season finishing positions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Season Finishes</CardTitle>
          <p className="text-xs text-muted-foreground">Final ladder position each season</p>
        </CardHeader>
        <CardContent>
          {hasSeasonHistory ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={seasonFinishData} margin={{ top: 4, right: 56, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={yDomain}
                  reversed
                  tickCount={Math.min(6, totalTeams)}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => ordinal(v)}
                />
                <Tooltip
                  formatter={(value) => [ordinal(Number(value)), 'Position']}
                  labelFormatter={(label: string) => `Season ${label}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine
                  y={finalsTeams + 0.5}
                  stroke="#10b981"
                  strokeDasharray="4 2"
                  strokeWidth={1}
                  label={{ value: 'Finals', position: 'right', fontSize: 9, fill: '#10b981' }}
                />
                <Line
                  type="monotone"
                  dataKey="position"
                  stroke={lineColor}
                  strokeWidth={2}
                  dot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              Complete at least two seasons to see historical finish trends.
            </p>
          )}
        </CardContent>
      </Card>

      {/* In-season round-by-round position */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">In-Season Position</CardTitle>
          <p className="text-xs text-muted-foreground">Ladder position by round — {currentYear}</p>
        </CardHeader>
        <CardContent>
          {hasInSeason ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={inSeasonData} margin={{ top: 4, right: 56, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={yDomain}
                  reversed
                  tickCount={Math.min(6, totalTeams)}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => ordinal(v)}
                />
                <Tooltip
                  formatter={(value) => [ordinal(Number(value)), 'Position']}
                  labelFormatter={(label: string) => label}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine
                  y={finalsTeams + 0.5}
                  stroke="#10b981"
                  strokeDasharray="4 2"
                  strokeWidth={1}
                  label={{ value: 'Finals', position: 'right', fontSize: 9, fill: '#10b981' }}
                />
                <Line
                  type="monotone"
                  dataKey="position"
                  stroke={lineColor}
                  strokeWidth={2}
                  dot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              No round data yet. Position tracking will appear as rounds are simulated.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
