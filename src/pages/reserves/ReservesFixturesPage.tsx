import { useMemo, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useReservesContext } from '@/hooks/useReservesContext'
import { cn } from '@/lib/utils'

export function ReservesFixturesPage() {
  const currentRound = useGameStore((s) => s.currentRound)

  const { context, leagueName, leagueShort } = useReservesContext()
  const [tab, setTab] = useState<'fixtures' | 'ladder'>('fixtures')

  const clubMap = useMemo(() => {
    if (!context) return new Map<string, string>()
    return new Map(context.league.clubs.map((c) => [c.id, c.abbreviation]))
  }, [context])

  const clubNameMap = useMemo(() => {
    if (!context) return new Map<string, string>()
    return new Map(context.league.clubs.map((c) => [c.id, c.name]))
  }, [context])

  // Compute ladder stats from results
  const ladderStats = useMemo(() => {
    if (!context) return []
    const map: Record<
      string,
      { w: number; l: number; d: number; pf: number; pa: number; pts: number }
    > = {}
    for (const club of context.league.clubs) {
      map[club.id] = { w: 0, l: 0, d: 0, pf: 0, pa: 0, pts: 0 }
    }
    const rules = context.league.ladderRules
    for (const round of context.league.season.rounds) {
      for (const m of round.results) {
        if (m.homeScore <= 0 && m.awayScore <= 0) continue
        const h = map[m.homeClubId]
        const a = map[m.awayClubId]
        if (!h || !a) continue
        h.pf += m.homeScore
        h.pa += m.awayScore
        a.pf += m.awayScore
        a.pa += m.homeScore
        if (m.homeScore > m.awayScore) {
          h.w++; h.pts += rules.pointsForWin
          a.l++; a.pts += rules.pointsForLoss
        } else if (m.awayScore > m.homeScore) {
          a.w++; a.pts += rules.pointsForWin
          h.l++; h.pts += rules.pointsForLoss
        } else {
          h.d++; h.pts += rules.pointsForDraw
          a.d++; a.pts += rules.pointsForDraw
        }
      }
    }
    return context.league.clubs
      .map((c) => ({ ...c, ...(map[c.id] ?? { w: 0, l: 0, d: 0, pf: 0, pa: 0, pts: 0 }) }))
      .sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts
        const apct = a.pa > 0 ? a.pf / a.pa : 0
        const bpct = b.pa > 0 ? b.pf / b.pa : 0
        return bpct - apct
      })
  }, [context])

  if (!context) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Reserves Fixtures</h1>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No state-league affiliation found for your club.
          </CardContent>
        </Card>
      </div>
    )
  }

  const userClubId = context.club.id
  const nextRound = currentRound + 1

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{leagueShort} Fixtures &amp; Ladder</h1>
        <p className="text-sm text-muted-foreground">
          {leagueName} — {context.club.name}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
          <TabsTrigger value="ladder">Ladder</TabsTrigger>
        </TabsList>

        {/* ── Fixtures ─────────────────────────────────────────────────────── */}
        <TabsContent value="fixtures" className="space-y-3 mt-3">
          {context.league.season.rounds.map((round) => {
            const userMatch = round.results.find(
              (m) => m.homeClubId === userClubId || m.awayClubId === userClubId,
            )
            const isCurrentRound = round.number === nextRound
            const isPast = round.number < nextRound

            return (
              <Card
                key={round.number}
                className={cn(isCurrentRound && 'ring-2 ring-primary/40')}
              >
                <CardHeader className="py-2 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">
                      Round {round.number}
                    </CardTitle>
                    <div className="flex gap-1">
                      {isCurrentRound && (
                        <Badge variant="default" className="text-[10px] px-1.5">
                          This week
                        </Badge>
                      )}
                      {isPast && round.results.some((m) => m.homeScore > 0 || m.awayScore > 0) && (
                        <Badge variant="secondary" className="text-[10px] px-1.5">
                          Complete
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-1">
                  {round.results.map((m, i) => {
                    const isUserMatch =
                      m.homeClubId === userClubId || m.awayClubId === userClubId
                    const played = m.homeScore > 0 || m.awayScore > 0
                    const homeAbbr = clubMap.get(m.homeClubId) ?? m.homeClubId
                    const awayAbbr = clubMap.get(m.awayClubId) ?? m.awayClubId
                    const homeWon = played && m.homeScore > m.awayScore
                    const awayWon = played && m.awayScore > m.homeScore

                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex items-center justify-between text-xs rounded px-2 py-1',
                          isUserMatch ? 'bg-primary/5 border border-primary/20 font-medium' : '',
                        )}
                      >
                        <span
                          className={cn(
                            'w-24 truncate',
                            homeWon && 'font-semibold',
                          )}
                        >
                          {homeAbbr}
                        </span>
                        <span className="text-muted-foreground w-20 text-center tabular-nums">
                          {played ? `${m.homeScore} – ${m.awayScore}` : 'v'}
                        </span>
                        <span
                          className={cn(
                            'w-24 truncate text-right',
                            awayWon && 'font-semibold',
                          )}
                        >
                          {awayAbbr}
                        </span>
                      </div>
                    )
                  })}
                  {userMatch && (
                    <p className="text-xs text-muted-foreground pt-1">
                      Your match:{' '}
                      {userMatch.homeClubId === userClubId
                        ? `vs ${clubNameMap.get(userMatch.awayClubId) ?? userMatch.awayClubId} (Home)`
                        : `@ ${clubNameMap.get(userMatch.homeClubId) ?? userMatch.homeClubId} (Away)`}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
          {context.league.season.rounds.length === 0 && (
            <p className="text-sm text-muted-foreground">No fixture generated yet.</p>
          )}
        </TabsContent>

        {/* ── Ladder ───────────────────────────────────────────────────────── */}
        <TabsContent value="ladder" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{leagueName} Ladder</CardTitle>
              <CardDescription className="text-xs">
                Season standings — {ladderStats.filter((c) => c.w + c.l + c.d > 0).length} rounds played
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-3 py-2 text-left w-8">#</th>
                    <th className="px-3 py-2 text-left">Club</th>
                    <th className="px-3 py-2 text-center w-10">W</th>
                    <th className="px-3 py-2 text-center w-10">L</th>
                    <th className="px-3 py-2 text-center w-10">D</th>
                    <th className="px-3 py-2 text-center w-14">PF</th>
                    <th className="px-3 py-2 text-center w-14">PA</th>
                    <th className="px-3 py-2 text-center w-16">%</th>
                    <th className="px-3 py-2 text-center w-12">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {ladderStats.map((c, idx) => {
                    const pct = c.pa > 0 ? ((c.pf / c.pa) * 100).toFixed(1) : '–'
                    const isUser = c.id === userClubId
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          'border-b last:border-0',
                          isUser ? 'bg-primary/5 font-semibold' : '',
                        )}
                      >
                        <td className="px-3 py-1.5 tabular-nums">{idx + 1}</td>
                        <td className="px-3 py-1.5">
                          {c.name}
                          {isUser && (
                            <Badge className="ml-2 h-4 text-[10px] px-1 py-0">You</Badge>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-center tabular-nums">{c.w}</td>
                        <td className="px-3 py-1.5 text-center tabular-nums">{c.l}</td>
                        <td className="px-3 py-1.5 text-center tabular-nums">{c.d}</td>
                        <td className="px-3 py-1.5 text-center tabular-nums">{c.pf}</td>
                        <td className="px-3 py-1.5 text-center tabular-nums">{c.pa}</td>
                        <td className="px-3 py-1.5 text-center tabular-nums">{pct}</td>
                        <td className="px-3 py-1.5 text-center tabular-nums font-medium">{c.pts}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {ladderStats.length === 0 && (
                <p className="text-sm text-muted-foreground px-4 py-4">
                  No clubs found in this league.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
