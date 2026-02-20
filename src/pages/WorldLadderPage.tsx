import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trophy } from 'lucide-react'
import type { Match } from '@/types/match'
import type { LadderEntry } from '@/types/season'

function getClubFormGuide(clubId: string, matchResults: Match[]): ('W' | 'L' | 'D')[] {
  const played = matchResults
    .filter((m) => m.result && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => b.round - a.round)
    .slice(0, 5)
    .reverse()
  return played.map((m) => {
    const isHome = m.homeClubId === clubId
    const h = m.result!.homeTotalScore
    const a = m.result!.awayTotalScore
    if (h === a) return 'D'
    return isHome ? (h > a ? 'W' : 'L') : (a > h ? 'W' : 'L')
  })
}

function FormDot({ result }: { result: 'W' | 'L' | 'D' }) {
  const cls =
    result === 'W' ? 'bg-green-500 text-white' :
    result === 'L' ? 'bg-red-500 text-white' :
    'bg-yellow-500 text-black'
  return (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${cls}`}>
      {result}
    </span>
  )
}

function LadderTable({
  entries,
  clubs,
  matchResults,
  playerClubId,
  onClubClick,
}: {
  entries: LadderEntry[]
  clubs: ReturnType<typeof useGameStore.getState>['clubs']
  matchResults: Match[]
  playerClubId: string
  onClubClick: (clubId: string) => void
}) {
  const top8 = 8

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium w-8">#</th>
            <th className="px-3 py-2.5 text-left font-medium">Club</th>
            <th className="px-3 py-2.5 text-center font-medium">P</th>
            <th className="px-3 py-2.5 text-center font-medium">W</th>
            <th className="px-3 py-2.5 text-center font-medium">L</th>
            <th className="px-3 py-2.5 text-center font-medium">D</th>
            <th className="px-3 py-2.5 text-center font-medium">PTS</th>
            <th className="px-3 py-2.5 text-right font-medium">For</th>
            <th className="px-3 py-2.5 text-right font-medium">Ag</th>
            <th className="px-3 py-2.5 text-right font-medium">%</th>
            <th className="px-3 py-2.5 text-center font-medium">Form</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry, i) => {
            const pos = i + 1
            const club = clubs[entry.clubId]
            const form = getClubFormGuide(entry.clubId, matchResults)
            const isUser = entry.clubId === playerClubId
            const inTop8 = pos <= top8

            return (
              <tr
                key={entry.clubId}
                className={`cursor-pointer hover:bg-muted/40 transition-colors ${isUser ? 'bg-primary/5' : ''} ${pos === top8 + 1 ? 'border-t-2 border-primary/30' : ''}`}
                onClick={() => onClubClick(entry.clubId)}
              >
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground text-sm">{pos}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                    />
                    <span className={`font-medium ${isUser ? 'text-primary' : ''}`}>
                      {club?.fullName ?? entry.clubId}
                    </span>
                    {isUser && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">You</Badge>
                    )}
                    {inTop8 && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-500/40 text-green-600">
                        Finals
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{entry.played}</td>
                <td className="px-3 py-2.5 text-center tabular-nums font-medium">{entry.wins}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{entry.losses}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{entry.draws}</td>
                <td className="px-3 py-2.5 text-center tabular-nums font-bold">{entry.points}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{entry.pointsFor}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{entry.pointsAgainst}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{entry.percentage.toFixed(1)}%</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-0.5">
                    {form.length > 0 ? (
                      form.map((r, j) => <FormDot key={j} result={r} />)
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function WorldLadderPage() {
  const navigate = useNavigate()
  const clubs = useGameStore((s) => s.clubs)
  const ladder = useGameStore((s) => s.ladder)
  const matchResults = useGameStore((s) => s.matchResults)
  const currentYear = useGameStore((s) => s.currentYear)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const history = useGameStore((s) => s.history)

  const [viewYear, setViewYear] = useState<string>(String(currentYear))

  // Available archive years
  const archiveYears = useMemo(() => {
    const years = (history.seasonArchives ?? []).map((a) => a.year).sort((a, b) => b - a)
    return years
  }, [history.seasonArchives])

  // Archive ladder for selected year (if not current)
  const archiveLadder = useMemo(() => {
    const yr = parseInt(viewYear)
    if (yr === currentYear) return null
    const archive = (history.seasonArchives ?? []).find((a) => a.year === yr)
    return archive?.ladder ?? null
  }, [viewYear, currentYear, history.seasonArchives])

  const displayLadder = archiveLadder ?? ladder
  const isCurrentSeason = parseInt(viewYear) === currentYear

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6" />
            League Ladder
          </h1>
          <p className="text-sm text-muted-foreground">
            {viewYear} season standings
          </p>
        </div>
        <div className="flex items-center gap-2">
          {archiveYears.length > 0 && (
            <Select value={viewYear} onValueChange={setViewYear}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={String(currentYear)}>
                  {currentYear} (Current)
                </SelectItem>
                {archiveYears.map((yr) => (
                  <SelectItem key={yr} value={String(yr)}>{yr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/world')}>
            ← World Hub
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              {viewYear} Standings
            </CardTitle>
            {isCurrentSeason && (
              <Badge variant="outline" className="text-xs">Live</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {displayLadder.length > 0 ? (
            <LadderTable
              entries={displayLadder}
              clubs={clubs}
              matchResults={isCurrentSeason ? matchResults : []}
              playerClubId={playerClubId}
              onClubClick={(id) => navigate(`/club/${id}`)}
            />
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              No ladder data for this season.
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        · Thick divider separates Finals (top 8) from non-Finals positions.
        Form guide shows last 5 results (oldest → newest).
      </p>
    </div>
  )
}
