import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  MapPin,
  Users,
  Trophy,
  Star,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Zap,
  BarChart3,
  Sword,
} from 'lucide-react'
import { ScoreWorm, QuarterMomentumBars } from '@/components/match/MatchCharts'
import { PlayByPlayPanel } from '@/components/match/PlayByPlayPanel'
import { PostMatchBoxScore } from '@/components/match/PostMatchBoxScore'
import type { PostMatchReviewPayload } from '@/types/postMatch'
import type { Club } from '@/types/club'
import type { Player } from '@/types/player'

type Tab = 'overview' | 'quarters' | 'tactics' | 'players' | 'moments'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'quarters', label: 'Quarters' },
  { key: 'tactics', label: 'Tactics' },
  { key: 'players', label: 'Players' },
  { key: 'moments', label: 'Moments' },
]

const MILESTONE_LABEL: Record<string, string> = {
  'games-played': 'games played',
  'career-goals': 'career goals',
  'career-disposals': 'career disposals',
  'career-marks': 'career marks',
  'career-tackles': 'career tackles',
}

interface PostMatchReviewProps {
  payload: PostMatchReviewPayload
  clubs: Record<string, Club>
  players: Record<string, Player>
  playerClubId: string
  onContinue: () => void
}

export function PostMatchReview({
  payload,
  clubs,
  players,
  playerClubId,
  onContinue,
}: PostMatchReviewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [hlIdx, setHlIdx] = useState(0)

  const { userMatch, matchReport, milestones, ladderSnapshot } = payload
  const result = userMatch.result!
  const homeClub = clubs[userMatch.homeClubId]
  const awayClub = clubs[userMatch.awayClubId]
  const isHome = userMatch.homeClubId === playerClubId
  const playerScore = isHome ? result.homeTotalScore : result.awayTotalScore
  const opponentScore = isHome ? result.awayTotalScore : result.homeTotalScore
  const isWin = playerScore > opponentScore
  const isDraw = playerScore === opponentScore

  const resultLabel = isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS'
  const resultBadgeClass = isWin
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
    : isDraw
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
      : 'bg-red-500/20 text-red-400 border-red-500/40'

  const highlights = (result.playByPlay ?? []).filter((e) => e.isHighlight)
  const currentHighlight = highlights[hlIdx] ?? null

  const injuries = matchReport?.injuries ?? []
  const tribunalIncidents = matchReport?.tribunalIncidents ?? []

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Score header */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Home club */}
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="h-10 w-10 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: homeClub?.colors.primary ?? '#666' }}
            />
            <div className="min-w-0">
              <div className="font-bold truncate">{homeClub?.name ?? userMatch.homeClubId}</div>
              {ladderSnapshot && (
                <div className="text-[10px] text-muted-foreground">#{ladderSnapshot.homeRank}</div>
              )}
            </div>
          </div>

          {/* Score */}
          <div className="text-center shrink-0">
            <div className="text-3xl font-bold tabular-nums">
              {result.homeTotalScore} – {result.awayTotalScore}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">
              {result.homeScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
              {' vs '}
              {result.awayScores.map((q) => `${q.goals}.${q.behinds}`).join(' | ')}
            </div>
            <Badge className={`mt-1 border text-xs font-semibold ${resultBadgeClass}`} variant="outline">
              {resultLabel}
            </Badge>
          </div>

          {/* Away club */}
          <div className="flex items-center gap-2 min-w-0 flex-row-reverse">
            <div
              className="h-10 w-10 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: awayClub?.colors.primary ?? '#666' }}
            />
            <div className="min-w-0 text-right">
              <div className="font-bold truncate">{awayClub?.name ?? userMatch.awayClubId}</div>
              {ladderSnapshot && (
                <div className="text-[10px] text-muted-foreground">#{ladderSnapshot.awayRank}</div>
              )}
            </div>
          </div>
        </div>

        {/* Venue/weather line */}
        {result.simulationContext && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {userMatch.venue}
            </span>
            {result.simulationContext.attendance != null && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {result.simulationContext.attendance.toLocaleString()}
                {result.simulationContext.capacityPct != null && (
                  <span className="text-muted-foreground/60"> ({result.simulationContext.capacityPct}%)</span>
                )}
              </span>
            )}
            <span className="capitalize">
              {result.simulationContext.weather}, {result.simulationContext.groundCondition}
            </span>
          </div>
        )}
      </div>

      {/* Milestone banners */}
      {milestones.length > 0 && (
        <div className="shrink-0 flex gap-2 overflow-x-auto px-4 py-2 border-b bg-amber-500/5">
          {milestones.map((m) => (
            <Badge
              key={m.id}
              variant="outline"
              className="shrink-0 border-amber-500/40 text-amber-400 gap-1 whitespace-nowrap"
            >
              <Star className="h-3 w-3 fill-amber-400" />
              {m.playerName} — {m.threshold} {MILESTONE_LABEL[m.type] ?? m.type}
            </Badge>
          ))}
        </div>
      )}

      {/* Injury/tribunal banners */}
      {(injuries.length > 0 || tribunalIncidents.length > 0) && (
        <div className="shrink-0 flex gap-2 overflow-x-auto px-4 py-2 border-b bg-red-500/5">
          {injuries.map((inj, i) => (
            <Badge
              key={`inj-${i}`}
              variant="outline"
              className="shrink-0 border-red-500/40 text-red-400 gap-1 whitespace-nowrap"
            >
              <AlertTriangle className="h-3 w-3" />
              {inj.playerName} — {inj.injuryType} ({inj.weeksOut}w)
            </Badge>
          ))}
          {tribunalIncidents.map((t, i) => (
            <Badge
              key={`tribunal-${i}`}
              variant="outline"
              className="shrink-0 border-orange-500/40 text-orange-400 gap-1 whitespace-nowrap"
            >
              <AlertTriangle className="h-3 w-3" />
              {t.playerName} — Tribunal ({t.recommendedWeeks}w)
            </Badge>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="shrink-0 flex gap-0 border-b overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 min-w-[80px] px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable tab content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">

          {/* ---- OVERVIEW ---- */}
          {activeTab === 'overview' && (
            <>
              {/* Score Worm */}
              {result.keyEvents.length > 0 && (
                <Card>
                  <CardContent className="py-4">
                    <ScoreWorm
                      keyEvents={result.keyEvents}
                      homeScores={result.homeScores}
                      awayScores={result.awayScores}
                      homeClubId={userMatch.homeClubId}
                      homeColor={homeClub?.colors.primary ?? '#3b82f6'}
                      awayColor={awayClub?.colors.primary ?? '#ef4444'}
                      homeAbbr={homeClub?.abbreviation ?? 'HM'}
                      awayAbbr={awayClub?.abbreviation ?? 'AW'}
                      quartersCompleted={result.homeScores.length}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Narrative */}
              {matchReport?.narrativeBody && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Match Report
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                      {matchReport.narrativeBody}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Crowd/weather */}
              {matchReport?.crowd && (
                <Card>
                  <CardContent className="py-3">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span className="font-medium text-foreground">{matchReport.crowd.attendance.toLocaleString()}</span>
                        <span>({matchReport.crowd.capacityPct}% capacity)</span>
                      </div>
                      <div className="text-muted-foreground capitalize">
                        {matchReport.crowd.weather}, {matchReport.crowd.groundCondition}
                      </div>
                      <div>
                        <Badge variant="secondary" className="text-xs">{matchReport.crowd.atmosphereRating}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Coach quotes */}
              {matchReport?.coachQuotes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Post-Match Quotes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded border border-border/50 px-3 py-2 text-sm italic text-muted-foreground">
                      "{matchReport.coachQuotes.winningCoachQuote}"
                    </div>
                    <div className="rounded border border-border/50 px-3 py-2 text-sm italic text-muted-foreground">
                      "{matchReport.coachQuotes.losingCoachQuote}"
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Ladder context */}
              {matchReport?.ladderContext && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      Ladder Impact
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{homeClub?.abbreviation}</span>
                      <span>
                        #{matchReport.ladderContext.homePositionBefore}
                        {matchReport.ladderContext.homePositionAfter !== matchReport.ladderContext.homePositionBefore && (
                          <span className={matchReport.ladderContext.homePositionAfter < matchReport.ladderContext.homePositionBefore ? 'text-emerald-400' : 'text-red-400'}>
                            {' '}→ #{matchReport.ladderContext.homePositionAfter}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{awayClub?.abbreviation}</span>
                      <span>
                        #{matchReport.ladderContext.awayPositionBefore}
                        {matchReport.ladderContext.awayPositionAfter !== matchReport.ladderContext.awayPositionBefore && (
                          <span className={matchReport.ladderContext.awayPositionAfter < matchReport.ladderContext.awayPositionBefore ? 'text-emerald-400' : 'text-red-400'}>
                            {' '}→ #{matchReport.ladderContext.awayPositionAfter}
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{matchReport.ladderContext.implication}</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ---- QUARTERS ---- */}
          {activeTab === 'quarters' && (
            <>
              {/* Quarter momentum bars */}
              <Card>
                <CardContent className="py-4">
                  <QuarterMomentumBars
                    homeScores={result.homeScores}
                    awayScores={result.awayScores}
                    homeColor={homeClub?.colors.primary ?? '#3b82f6'}
                    awayColor={awayClub?.colors.primary ?? '#ef4444'}
                    homeAbbr={homeClub?.abbreviation ?? 'HM'}
                    awayAbbr={awayClub?.abbreviation ?? 'AW'}
                  />
                </CardContent>
              </Card>

              {/* Quarter grid */}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Team</th>
                          {result.homeScores.map((_, i) => (
                            <th key={i} className="px-3 py-2 text-center text-xs text-muted-foreground font-medium">Q{i + 1}</th>
                          ))}
                          <th className="px-3 py-2 text-center text-xs text-muted-foreground font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="px-3 py-2 font-medium">{homeClub?.abbreviation ?? 'Home'}</td>
                          {result.homeScores.map((q, i) => (
                            <td key={i} className="px-3 py-2 text-center font-mono text-xs">
                              {q.goals}.{q.behinds} ({q.total})
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center font-bold">{result.homeTotalScore}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 font-medium">{awayClub?.abbreviation ?? 'Away'}</td>
                          {result.awayScores.map((q, i) => (
                            <td key={i} className="px-3 py-2 text-center font-mono text-xs">
                              {q.goals}.{q.behinds} ({q.total})
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center font-bold">{result.awayTotalScore}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Quarter summaries */}
              {matchReport?.quarterSummaries && matchReport.quarterSummaries.length > 0 && (
                <div className="space-y-2">
                  {matchReport.quarterSummaries.map((qs) => {
                    const dominant = qs.dominatingClubId ? clubs[qs.dominatingClubId] : null
                    return (
                      <Card key={qs.quarter}>
                        <CardContent className="py-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold">Q{qs.quarter}</span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {dominant && (
                                <Badge variant="outline" className="text-[10px]">
                                  {dominant.abbreviation} dominant
                                </Badge>
                              )}
                              {qs.momentumShift && (
                                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                                  Momentum shift
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>{homeClub?.abbreviation}: {qs.homeGoals}.{qs.homeBehinds} ({qs.homeScore})</span>
                            <span className="text-muted-foreground">Running: {qs.homeCumulative} – {qs.awayCumulative}</span>
                            <span>{awayClub?.abbreviation}: {qs.awayGoals}.{qs.awayBehinds} ({qs.awayScore})</span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* Turning points */}
              {matchReport?.turningPoints && matchReport.turningPoints.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Turning Points
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {matchReport.turningPoints.map((tp, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="shrink-0 text-[10px] text-muted-foreground font-mono mt-0.5 w-12">
                          Q{tp.quarter} {tp.minute}'
                        </span>
                        <div>
                          <Badge variant="outline" className="text-[10px] mb-1">{tp.type.replace('-', ' ')}</Badge>
                          <p className="text-xs text-muted-foreground">{tp.description}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ---- TACTICS ---- */}
          {activeTab === 'tactics' && (
            <>
              {result.midMatchAdjustments && result.midMatchAdjustments.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sword className="h-4 w-4" />
                      Mid-Match Adjustments
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.midMatchAdjustments.map((adj, i) => (
                      <div key={i} className="flex items-start gap-3 rounded border border-border/50 px-3 py-2 text-sm">
                        <Badge variant="outline" className="shrink-0 text-[10px]">Q{adj.quarter}</Badge>
                        <div>
                          <div className="font-medium text-xs">{adj.decisionType.replace(/-/g, ' ')}</div>
                          <p className="text-xs text-muted-foreground">{adj.description}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No tactical adjustments were recorded for this match.
                  </CardContent>
                </Card>
              )}

              {/* Gameplan snapshot */}
              {result.simulationContext && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Match Conditions</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Weather</span>
                      <span className="capitalize">{result.simulationContext.weather}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ground</span>
                      <span className="capitalize">{result.simulationContext.groundCondition}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Home familiarity</span>
                      <span>{(result.simulationContext.venueFamiliarity.home * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Away familiarity</span>
                      <span>{(result.simulationContext.venueFamiliarity.away * 100).toFixed(0)}%</span>
                    </div>
                    {result.effectiveAggressionLevel && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-muted-foreground">Aggression level</span>
                        <Badge variant="outline" className="text-[10px] capitalize">{result.effectiveAggressionLevel}</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ---- PLAYERS ---- */}
          {activeTab === 'players' && (
            <>
              {/* Best players from report */}
              {matchReport && (matchReport.homeBestPlayers.length > 0 || matchReport.awayBestPlayers.length > 0) && (
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    { label: homeClub?.name ?? 'Home', best: matchReport.homeBestPlayers },
                    { label: awayClub?.name ?? 'Away', best: matchReport.awayBestPlayers },
                  ].map(({ label, best }) => (
                    <Card key={label}>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Star className="h-4 w-4 text-amber-400" />
                          {label} Best
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        {best.slice(0, 5).map((bp, i) => (
                          <div key={bp.playerId} className="flex items-center justify-between text-sm rounded px-2 py-1 hover:bg-muted/40">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}</span>
                              <span className="font-medium">{bp.playerName}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {bp.goals > 0 && <span className="text-emerald-400 font-medium">{bp.goals}g</span>}
                              <span>{bp.disposals}d</span>
                              {bp.matchRating != null && (
                                <span className="font-semibold text-amber-400">{bp.matchRating.toFixed(1)}★</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Full box score */}
              <PostMatchBoxScore
                match={userMatch}
                clubs={clubs}
                players={players}
                playerClubId={playerClubId}
              />
            </>
          )}

          {/* ---- MOMENTS ---- */}
          {activeTab === 'moments' && (
            <>
              {/* Highlight stepper */}
              {highlights.length > 0 && currentHighlight ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-400" />
                        Highlights
                      </span>
                      <span className="text-[11px] text-muted-foreground font-normal">
                        {hlIdx + 1} / {highlights.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-3 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">Q{currentHighlight.quarter}</Badge>
                        <span>{currentHighlight.minute}'</span>
                        <span className="capitalize">{currentHighlight.type.replace(/-/g, ' ')}</span>
                        <span>—</span>
                        <span>{currentHighlight.clubId === userMatch.homeClubId ? (homeClub?.abbreviation ?? 'Home') : (awayClub?.abbreviation ?? 'Away')}</span>
                      </div>
                      <p className="text-sm font-medium">{currentHighlight.commentary}</p>
                      {currentHighlight.detail && (
                        <p className="text-xs text-muted-foreground italic">{currentHighlight.detail}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHlIdx((i) => Math.max(0, i - 1))}
                        disabled={hlIdx === 0}
                        className="gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHlIdx((i) => Math.min(highlights.length - 1, i + 1))}
                        disabled={hlIdx === highlights.length - 1}
                        className="gap-1"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    No highlights recorded for this match.
                  </CardContent>
                </Card>
              )}

              {/* Full play-by-play */}
              {(result.playByPlay ?? []).length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Full Commentary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PlayByPlayPanel
                      events={result.playByPlay ?? []}
                      homeClubId={userMatch.homeClubId}
                      awayClubId={userMatch.awayClubId}
                      homeClubName={homeClub?.name ?? userMatch.homeClubId}
                      awayClubName={awayClub?.name ?? userMatch.awayClubId}
                      players={players}
                      maxHeight="max-h-[600px]"
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    No play-by-play commentary available for this match.
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Continue footer */}
      <div className="shrink-0 border-t bg-background/95 backdrop-blur-sm px-4 py-3">
        <Button onClick={onContinue} className="w-full" size="lg">
          Continue
        </Button>
      </div>
    </div>
  )
}
