import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { MatchReport } from '@/types/history'
import type { Club } from '@/types/club'
import type { Player } from '@/types/player'

interface MatchReportModalProps {
  report: MatchReport
  clubs: Record<string, Club>
  players: Record<string, Player>
  open: boolean
  onClose: () => void
}

const FINAL_TYPE_LABELS: Record<string, string> = {
  QF: 'Qualifying Final',
  EF: 'Elimination Final',
  SF: 'Semi Final',
  PF: 'Preliminary Final',
  GF: 'Grand Final',
}

const ATMOSPHERE_COLORS: Record<string, string> = {
  electric: 'border-yellow-500/60 bg-yellow-500/10 text-yellow-300',
  lively: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300',
  moderate: 'border-blue-500/60 bg-blue-500/10 text-blue-300',
  subdued: 'border-muted-foreground/40 text-muted-foreground',
}

const TURNING_POINT_TYPE_COLORS: Record<string, string> = {
  'goal-burst': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  'injury': 'bg-red-500/20 text-red-300 border-red-500/40',
  'tactical-change': 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  'comeback': 'bg-purple-500/20 text-purple-300 border-purple-500/40',
}

const SEVERITY_COLORS: Record<string, string> = {
  minor: 'border-muted text-muted-foreground',
  moderate: 'border-yellow-500/50 text-yellow-400',
  major: 'border-orange-500/50 text-orange-400',
  severe: 'border-red-500/50 text-red-400',
}

function ordinalPos(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function positionArrow(before: number, after: number) {
  if (before === after) return <span className="text-muted-foreground">→ {ordinalPos(after)}</span>
  if (after < before) return <span className="text-emerald-400">↑ {ordinalPos(after)}</span>
  return <span className="text-red-400">↓ {ordinalPos(after)}</span>
}

export function MatchReportModal({ report, clubs, open, onClose }: MatchReportModalProps) {
  const homeClub = clubs[report.homeClubId]
  const awayClub = clubs[report.awayClubId]
  const homeWon = report.homeScore > report.awayScore
  const isDraw = report.homeScore === report.awayScore
  const roundLabel = report.isFinal && report.finalType
    ? FINAL_TYPE_LABELS[report.finalType] ?? report.finalType
    : `Round ${report.round}`

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="text-base">Match Report</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge variant="outline">{roundLabel}</Badge>
            {report.isFinal && <Badge variant="secondary">Finals</Badge>}
            <span className="text-xs text-muted-foreground">{report.venue} · {report.date}</span>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh]">
          <div className="px-6 py-4 space-y-6">

            {/* ── Header: Score ── */}
            <div className="flex items-center justify-center gap-6 py-3 rounded-lg border bg-card">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="h-10 w-10 rounded-full border border-white/20"
                  style={{ background: homeClub?.colors.primary ?? '#666' }}
                />
                <span className={`font-bold text-sm ${homeWon && !isDraw ? '' : 'text-muted-foreground'}`}>
                  {homeClub?.abbreviation ?? report.homeClubId}
                </span>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold tabular-nums">
                  {report.homeScore}
                  <span className="text-muted-foreground mx-2">–</span>
                  {report.awayScore}
                </div>
                {isDraw && <div className="text-xs text-muted-foreground mt-1">Draw</div>}
              </div>
              <div className="flex flex-col items-center gap-1">
                <div
                  className="h-10 w-10 rounded-full border border-white/20"
                  style={{ background: awayClub?.colors.primary ?? '#666' }}
                />
                <span className={`font-bold text-sm ${!homeWon && !isDraw ? '' : 'text-muted-foreground'}`}>
                  {awayClub?.abbreviation ?? report.awayClubId}
                </span>
              </div>
            </div>

            {/* ── Quarter Grid ── */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Quarter by Quarter
              </h3>
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-xs text-center">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="py-1.5 px-3 text-left font-medium text-muted-foreground">Team</th>
                      <th className="py-1.5 px-2">Q1</th>
                      <th className="py-1.5 px-2">Q2</th>
                      <th className="py-1.5 px-2">Q3</th>
                      <th className="py-1.5 px-2">Q4</th>
                      <th className="py-1.5 px-2 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1.5 px-3 text-left font-medium">
                        {homeClub?.abbreviation ?? report.homeClubId}
                      </td>
                      {report.quarterSummaries.map((q) => (
                        <td key={`home-q${q.quarter}`} className="py-1.5 px-2 font-mono">
                          {q.homeGoals}.{q.homeBehinds}
                          <br />
                          <span className="text-muted-foreground text-[10px]">({q.homeCumulative})</span>
                        </td>
                      ))}
                      <td className="py-1.5 px-2 font-mono font-bold">{report.homeScore}</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-left font-medium">
                        {awayClub?.abbreviation ?? report.awayClubId}
                      </td>
                      {report.quarterSummaries.map((q) => (
                        <td key={`away-q${q.quarter}`} className="py-1.5 px-2 font-mono">
                          {q.awayGoals}.{q.awayBehinds}
                          <br />
                          <span className="text-muted-foreground text-[10px]">({q.awayCumulative})</span>
                        </td>
                      ))}
                      <td className="py-1.5 px-2 font-mono font-bold">{report.awayScore}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Narrative ── */}
            {report.narrativeBody && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Match Report
                </h3>
                <div className="space-y-3 text-sm leading-relaxed">
                  {report.narrativeBody.split('\n\n').map((para, i) => (
                    <p key={i} className="text-sm">{para}</p>
                  ))}
                </div>
              </section>
            )}

            {/* ── Best Players ── */}
            {(report.homeBestPlayers.length > 0 || report.awayBestPlayers.length > 0) && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Best Players
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground font-medium mb-1">
                      {homeClub?.name ?? report.homeClubId}
                    </div>
                    {report.homeBestPlayers.map((bp, i) => (
                      <div key={bp.playerId} className="flex items-center justify-between rounded border px-2 py-1.5 text-xs">
                        <span>
                          <span className="text-muted-foreground mr-1">{i + 1}.</span>
                          {bp.playerName}
                        </span>
                        <div className="flex gap-1">
                          <span className="rounded bg-muted px-1">D{bp.disposals}</span>
                          {bp.goals > 0 && <span className="rounded bg-muted px-1">G{bp.goals}</span>}
                          <span className="rounded bg-muted px-1">M{bp.marks}</span>
                          <span className="rounded bg-muted px-1">T{bp.tackles}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground font-medium mb-1">
                      {awayClub?.name ?? report.awayClubId}
                    </div>
                    {report.awayBestPlayers.map((bp, i) => (
                      <div key={bp.playerId} className="flex items-center justify-between rounded border px-2 py-1.5 text-xs">
                        <span>
                          <span className="text-muted-foreground mr-1">{i + 1}.</span>
                          {bp.playerName}
                        </span>
                        <div className="flex gap-1">
                          <span className="rounded bg-muted px-1">D{bp.disposals}</span>
                          {bp.goals > 0 && <span className="rounded bg-muted px-1">G{bp.goals}</span>}
                          <span className="rounded bg-muted px-1">M{bp.marks}</span>
                          <span className="rounded bg-muted px-1">T{bp.tackles}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* ── Turning Points ── */}
            {report.turningPoints.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Turning Points
                </h3>
                <div className="space-y-2">
                  {report.turningPoints.map((tp, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${TURNING_POINT_TYPE_COLORS[tp.type] ?? ''}`}>
                        Q{tp.quarter} {tp.minute}m
                      </span>
                      <span className="text-sm">{tp.description}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Crowd & Conditions ── */}
            {report.crowd && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Crowd & Conditions
                </h3>
                <div className="rounded border px-4 py-3 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Attendance</span>
                    <span className="font-medium">
                      {report.crowd.attendance.toLocaleString()}
                      {report.crowd.capacityPct > 0 && (
                        <span className="text-muted-foreground ml-1">({report.crowd.capacityPct}%)</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Weather</span>
                    <span className="capitalize">{report.crowd.weather}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Ground</span>
                    <span className="capitalize">{report.crowd.groundCondition}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Atmosphere</span>
                    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs capitalize ${ATMOSPHERE_COLORS[report.crowd.atmosphereRating] ?? ''}`}>
                      {report.crowd.atmosphereRating}
                    </span>
                  </div>
                </div>
              </section>
            )}

            {/* ── Injuries ── */}
            {report.injuries.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Injuries
                </h3>
                <div className="flex flex-wrap gap-2">
                  {report.injuries.map((inj, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${SEVERITY_COLORS[inj.severity] ?? ''}`}
                    >
                      {inj.playerName} — {inj.injuryType} ({inj.weeksOut}w)
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* ── Tribunal ── */}
            {report.tribunalIncidents.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Tribunal Incidents
                </h3>
                <div className="flex flex-wrap gap-2">
                  {report.tribunalIncidents.map((ti, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-xs text-orange-300"
                    >
                      {ti.playerName} — {ti.incidentType} ({ti.recommendedWeeks}w)
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* ── Coach Quotes ── */}
            {report.coachQuotes && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Post-Match
                </h3>
                <div className="space-y-2">
                  <div className="rounded border px-3 py-2 text-sm text-muted-foreground italic">
                    <span className="not-italic font-medium text-foreground">
                      {report.homeScore > report.awayScore ? homeClub?.name : awayClub?.name}:
                    </span>{' '}
                    "{report.coachQuotes.winningCoachQuote}"
                  </div>
                  <div className="rounded border px-3 py-2 text-sm text-muted-foreground italic">
                    <span className="not-italic font-medium text-foreground">
                      {report.homeScore > report.awayScore ? awayClub?.name : homeClub?.name}:
                    </span>{' '}
                    "{report.coachQuotes.losingCoachQuote}"
                  </div>
                </div>
              </section>
            )}

            {/* ── Ladder Impact ── */}
            {report.ladderContext && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Ladder Impact
                </h3>
                <div className="rounded border px-4 py-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{homeClub?.abbreviation ?? report.homeClubId}</span>
                    <span className="text-xs text-muted-foreground">
                      {ordinalPos(report.ladderContext.homePositionBefore)}{' '}
                      {positionArrow(report.ladderContext.homePositionBefore, report.ladderContext.homePositionAfter)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{awayClub?.abbreviation ?? report.awayClubId}</span>
                    <span className="text-xs text-muted-foreground">
                      {ordinalPos(report.ladderContext.awayPositionBefore)}{' '}
                      {positionArrow(report.ladderContext.awayPositionBefore, report.ladderContext.awayPositionAfter)}
                    </span>
                  </div>
                  {report.ladderContext.implication && (
                    <p className="text-xs text-muted-foreground pt-1 border-t">
                      {report.ladderContext.implication}
                    </p>
                  )}
                </div>
              </section>
            )}

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
