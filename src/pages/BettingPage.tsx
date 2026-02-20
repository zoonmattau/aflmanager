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
  if (curr.odds < prev.odds) return <TrendingDown className="h-3 w-3 text-green-500" />
  if (curr.odds > prev.odds) return <TrendingUp className="h-3 w-3 text-red-400" />
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
                    <div className={`grid items-center gap-2 ${bettingSettings?.totalPointsMarkets ? "grid-cols-[1fr_auto_auto_auto_1fr]" : "grid-cols-[1fr_auto_auto_1fr]"}`}>
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(FUTURES_LABELS) as FuturesMarket[]).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={market === key ? "default" : "outline"}
            onClick={() => setMarket(key)}
          >
            {FUTURES_LABELS[key]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">{FUTURES_LABELS[market]}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {sorted.map(({ clubId, odds }, i) => {
              const club = clubs[clubId]
              const history = historyRecord[clubId]
              const isUser = clubId === playerClubId

              return (
                <div
                  key={clubId}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isUser ? "bg-primary/5" : ""}`}
                >
                  <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: club?.colors.primary ?? "#666" }} />
                  <span className={`flex-1 ${isUser ? "font-semibold text-primary" : ""}`}>
                    {club?.fullName ?? clubId}
                    {isUser && <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0">You</Badge>}
                  </span>
                  <OddsMovementIcon history={history} />
                  <OddsBadge odds={odds} highlight={i === 0} />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Awards tab
// ---------------------------------------------------------------------------
type AwardMarket = "brownlow" | "coleman" | "risingStar"

const AWARD_LABELS: Record<AwardMarket, string> = {
  brownlow: "Brownlow Medal",
  coleman: "Coleman Medal (Goals)",
  risingStar: "Rising Star (U22)",
}

function AwardsTab() {
  const navigate = useNavigate()
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const bettingMarkets = useGameStore((s) => s.bettingMarkets)
  const playerClubId = useGameStore((s) => s.playerClubId)

  const [award, setAward] = useState<AwardMarket>("brownlow")

  const oddsRecord = bettingMarkets?.awards?.[award] ?? {}
  const historyRecord =
    award === "brownlow"
      ? bettingMarkets?.oddsHistory.brownlow ?? {}
      : award === "coleman"
        ? bettingMarkets?.oddsHistory.coleman ?? {}
        : {}

  const sorted = useMemo(
    () =>
      Object.entries(oddsRecord)
        .map(([playerId, odds]) => ({ playerId, odds }))
        .sort((a, b) => a.odds - b.odds)
        .slice(0, 20),
    [oddsRecord],
  )

  if (!bettingMarkets) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Markets not yet generated.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(AWARD_LABELS) as AwardMarket[]).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={award === key ? "default" : "outline"}
            onClick={() => setAward(key)}
          >
            {AWARD_LABELS[key]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Medal className="h-4 w-4 text-amber-500" />
            {AWARD_LABELS[award]}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {sorted.map(({ playerId, odds }, i) => {
              const player = players[playerId]
              if (!player) return null
              const club = clubs[player.clubId]
              const isUserClub = player.clubId === playerClubId
              const history = historyRecord[playerId]

              const statLabel =
                award === "brownlow"
                  ? `${player.seasonStats.disposals} disp`
                  : award === "coleman"
                    ? `${player.seasonStats.goals} goals`
                    : `${player.age}yo · ${player.seasonStats.gamesPlayed}g`

              return (
                <div
                  key={playerId}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40 ${isUserClub ? "bg-primary/5" : ""}`}
                  onClick={() => navigate(`/player/${playerId}`)}
                >
                  <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: club?.colors.primary ?? "#666" }} />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate">{player.firstName} {player.lastName}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{club?.abbreviation}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{statLabel}</span>
                  <OddsMovementIcon history={history} />
                  <OddsBadge odds={odds} highlight={i === 0} />
                </div>
              )
            })}
            {sorted.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No candidates yet — markets open once the season begins.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Odds History tab
// ---------------------------------------------------------------------------
function HistoryTab() {
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const bettingMarkets = useGameStore((s) => s.bettingMarkets)

  type HistoryCategory = "premiership" | "top8" | "coleman" | "brownlow"
  const [category, setCategory] = useState<HistoryCategory>("premiership")
  const [selectedId, setSelectedId] = useState<string>("")

  const historySource = bettingMarkets?.oddsHistory[category] ?? {}
  const entityOptions = useMemo(() => {
    if (category === "premiership" || category === "top8") {
      return Object.keys(historySource).map((id) => ({
        id,
        label: clubs[id]?.fullName ?? id,
      }))
    }
    return Object.keys(historySource).map((id) => {
      const p = players[id]
      return { id, label: p ? `${p.firstName} ${p.lastName}` : id }
    })
  }, [category, historySource, clubs, players])

  const selectedHistory = selectedId ? historySource[selectedId] : null

  if (!bettingMarkets) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No history yet.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["premiership", "top8", "coleman", "brownlow"] as HistoryCategory[]).map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={category === cat ? "default" : "outline"}
            onClick={() => { setCategory(cat); setSelectedId("") }}
          >
            {cat === "premiership" ? "Premiership" : cat === "top8" ? "Make Finals" : cat === "coleman" ? "Coleman" : "Brownlow"}
          </Button>
        ))}
      </div>

      <Select value={selectedId} onValueChange={setSelectedId}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select club or player…" />
        </SelectTrigger>
        <SelectContent>
          {entityOptions.map(({ id, label }) => (
            <SelectItem key={id} value={id}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedHistory && selectedHistory.length > 0 ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              Odds Movement
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {[...selectedHistory].reverse().map((entry, i) => {
                const prev = selectedHistory[selectedHistory.length - 2 - i]
                const changed = prev && prev.odds !== entry.odds
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="text-xs text-muted-foreground w-24 shrink-0">{entry.date}</span>
                    <OddsBadge odds={entry.odds} />
                    {changed && (
                      <span className={`text-xs ${entry.odds < prev!.odds ? "text-green-500" : "text-red-400"}`}>
                        {entry.odds < prev!.odds ? "▼ shortened" : "▲ drifted"}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : selectedId ? (
        <div className="py-8 text-center text-sm text-muted-foreground">No history for this selection.</div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export function BettingPage() {
  const settings = useGameStore((s) => s.settings)
  const bettingMarkets = useGameStore((s) => s.bettingMarkets)

  if (!settings.betting?.enabled) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Trophy className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Betting Markets</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm">
              Betting markets are disabled. Enable them in{" "}
              <a href="/game-settings" className="underline hover:text-foreground">Game Settings</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Trophy className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Betting Markets</h1>
          <p className="text-xs text-muted-foreground">
            Last updated: {bettingMarkets?.lastUpdated ?? "—"}
          </p>
        </div>
      </div>

      <BettingDisclaimer />

      <Tabs defaultValue="match">
        <TabsList>
          <TabsTrigger value="match">Match Odds</TabsTrigger>
          <TabsTrigger value="futures">Season Futures</TabsTrigger>
          <TabsTrigger value="awards">Award Markets</TabsTrigger>
          <TabsTrigger value="history">
            <BarChart2 className="mr-1 h-3.5 w-3.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="match" className="mt-4">
          <MatchOddsTab />
        </TabsContent>
        <TabsContent value="futures" className="mt-4">
          <FuturesTab />
        </TabsContent>
        <TabsContent value="awards" className="mt-4">
          <AwardsTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
