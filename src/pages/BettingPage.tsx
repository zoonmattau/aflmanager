import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Trophy, Medal, BarChart2 } from 'lucide-react'
import type { MatchBettingMarket, OddsMovement } from '@/types/betting'

// ---------------------------------------------------------------------------
// Disclaimer
// ---------------------------------------------------------------------------
function BettingDisclaimer() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <strong>Simulated feature only.</strong> All odds are generated for entertainment within the game.
        No real money, no wagering. 18+ only. If you or someone you know has a gambling problem, seek help.
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Odds badge
// ---------------------------------------------------------------------------
function OddsBadge({ odds, highlight }: { odds: number; highlight?: boolean }) {
  return (
    <span
      className={`inline-block min-w-[44px] rounded px-2 py-0.5 text-center font-mono text-sm font-bold tabular-nums ${
        highlight ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
      }`}
    >
      {odds.toFixed(2)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Odds movement indicator
// ---------------------------------------------------------------------------
function OddsMovementIcon({ history }: { history: OddsMovement[] | undefined }) {
  if (!history || history.length < 2) return <Minus className="h-3 w-3 text-muted-foreground" />
  const prev = history[history.length - 2]!
  const curr = history[history.length - 1]!
  if (curr.odds < prev.odds) return <TrendingDown className="h-3 w-3 text-green-500" title="Shortening (more favoured)" />
  if (curr.odds > prev.odds) return <TrendingUp className="h-3 w-3 text-red-400" title="Drifting (less favoured)" />
  return <Minus className="h-3 w-3 text-muted-foreground" />
}

// ---------------------------------------------------------------------------
// Match Odds tab
// ---------------------------------------------------------------------------
function MatchOddsTab() {
  const clubs = useGameStore((s) => s.clubs)
  const season = useGameStore((s) => s.season)
  const bettingMarkets = useGameStore((s) => s.bettingMarkets)
  const currentRound = useGameStore((s) => s.currentRound)
  const settings = useGameStore((s) => s.settings)
  const bettingSettings = settings.betting

  const [viewRound, setViewRound] = useState<string>(String(currentRound))

  const roundIndex = parseInt(viewRound)
  const round = season.rounds[roundIndex]

  const marketsForRound = useMemo<MatchBettingMarket[]>(() => {
    if (!bettingMarkets) return []
    return Object.values(bettingMarkets.matchMarkets).filter(
      (m) => m.roundIndex === roundIndex && !m.isFinal,
    )
  }, [bettingMarkets, roundIndex])

  if (!bettingMarkets) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Markets not yet generated.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={viewRound} onValueChange={setViewRound}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {season.rounds.map((_, i) => (
              <SelectItem key={i} value={String(i)}>
                Round {i + 1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {round?.byeClubIds && round.byeClubIds.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Bye: {round.byeClubIds.map((id) => clubs[id]?.abbreviation ?? id).join(", ")}
          </span>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] gap-2 border-b bg-muted/50 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <div>Home</div>
            <div className="text-center w-16">H2H</div>
            <div className="text-center w-20">Line ({bettingSettings?.totalPointsMarkets ? "Hdp" : "Hdp"})</div>
            {bettingSettings?.totalPointsMarkets && <div className="text-center w-20">Totals</div>}
            <div className="text-right">Away</div>
          </div>

          {marketsForRound.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No markets available for this round.
            </div>
          ) : (
            <div className="divide-y">
              {marketsForRound.map((m) => {
                const home = clubs[m.homeClubId]
                const away = clubs[m.awayClubId]
                const homeFav = m.homeOdds <= m.awayOdds

                return (
                  <div
                    key={m.matchId}
                    className={`px-4 py-3 text-sm ${m.settled ? "opacity-60" : ""}`}
                  >
                    <div className={`grid items-center gap-2 ${bettingSettings?.totalPointsMarkets ? "grid-cols-[1fr_auto_auto_auto_1fr]" : "grid-cols-[1fr_auto_auto_1fr]"}`}
>
                      {/* Home */}
                      <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: home?.colors.primary ?? "#666" }} />
                        <span className={homeFav ? "font-semibold" : "text-muted-foreground"}>{home?.fullName ?? m.homeClubId}</span>
                        {m.settled && m.resultOutcome === "home" && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">WIN</Badge>
                        )}
                      </div>

                      {/* H2H odds */}
                      <div className="flex items-center gap-1">
                        <OddsBadge odds={m.homeOdds} highlight={homeFav} />
                        <span className="text-xs text-muted-foreground">v</span>
                        <OddsBadge odds={m.awayOdds} highlight={!homeFav} />
                      </div>

                      {/* Line */}
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="text-[10px] text-muted-foreground">
                          {m.line > 0 ? `Home -${m.line}` : m.line < 0 ? `Away -${Math.abs(m.line)}` : "Even"}
                        </div>
                        <div className="flex gap-1">
                          <OddsBadge odds={m.homeLineOdds} />
                          <OddsBadge odds={m.awayLineOdds} />
                        </div>
                      </div>

                      {/* Totals (optional) */}
                      {bettingSettings?.totalPointsMarkets && (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="text-[10px] text-muted-foreground">O/U {m.totalLine}</div>
                          <div className="flex gap-1">
                            <OddsBadge odds={m.overOdds ?? 1.91} />
                            <OddsBadge odds={m.underOdds ?? 1.91} />
                          </div>
                        </div>
                      )}

                      {/* Away */}
                      <div className="flex items-center justify-end gap-1.5">
                        {m.settled && m.resultOutcome === "away" && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">WIN</Badge>
                        )}
                        <span className={!homeFav ? "font-semibold" : "text-muted-foreground"}>{away?.fullName ?? m.awayClubId}</span>
                        <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: away?.colors.primary ?? "#666" }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Futures tab
// ---------------------------------------------------------------------------
type FuturesMarket = "premiership" | "top8" | "top4" | "woodenSpoon"

const FUTURES_LABELS: Record<FuturesMarket, string> = {
  premiership: "Win Premiership",
  top8: "Make Finals (Top 8)",
  top4: "Top 4 Finish",
  woodenSpoon: "Wooden Spoon",
}

function FuturesTab() {
  const clubs = useGameStore((s) => s.clubs)
  const ladder = useGameStore((s) => s.ladder)
  const bettingMarkets = useGameStore((s) => s.bettingMarkets)
  const playerClubId = useGameStore((s) => s.playerClubId)

  const [market, setMarket] = useState<FuturesMarket>("premiership")

  const oddsRecord = bettingMarkets?.futures?.[market] ?? {}
  const historyRecord = market === "premiership"
    ? bettingMarkets?.oddsHistory.premiership ?? {}
    : market === "top8"
      ? bettingMarkets?.oddsHistory.top8 ?? {}
      : {}

  // Sort by odds ascending (shortest price first = favourite)
  const sorted = useMemo(
    () =>
      ladder
        .map((e) => ({ clubId: e.clubId, odds: oddsRecord[e.clubId] ?? 999, ladderPos: ladder.indexOf(e) }))
        .filter((x) => x.odds < 500)
        .sort((a, b) => a.odds - b.odds),
    [oddsRecord, ladder],
  )

  if (!bettingMarkets) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Markets not yet generated.</div>
  }

