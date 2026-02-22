/**
 * PastGameViewer
 *
 * Read-only post-game layout for matches already played.
 * Shows: score header, score worm, box score, conditions summary,
 * quarter breakdown, and the tactics log.
 */

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { ScoreWorm, QuarterMomentumBars } from '@/components/match/MatchCharts'
import { PostMatchBoxScore } from '@/components/match/PostMatchBoxScore'
import { MapPin, Users, Wind, Cloud, Thermometer, Droplets, CheckCircle2, AlertCircle, MinusCircle } from 'lucide-react'
import type { Match } from '@/types/match'
import type { Club } from '@/types/club'
import type { Player } from '@/types/player'
import { windDirectionArrow, windStrengthLabel } from '@/engine/match/weatherEngine'
import type { PrepAnalysis } from '@/engine/match/prepAnalysis'

// ---------------------------------------------------------------------------
// Prep Story helpers
// ---------------------------------------------------------------------------

const READINESS_CONFIG = {
  excellent: { label: 'Excellent', badge: 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400' },
  good:      { label: 'Good',      badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  mixed:     { label: 'Mixed',     badge: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  poor:      { label: 'Poor',      badge: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400' },
} as const

function FactorIcon({ impact }: { impact: 'positive' | 'neutral' | 'negative' }) {
  if (impact === 'positive') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
  if (impact === 'negative') return <AlertCircle   className="h-3.5 w-3.5 shrink-0 text-red-500" />
  return <MinusCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
}

function PreparationStoryCard({ analysis }: { analysis: PrepAnalysis }) {
  const cfg = READINESS_CONFIG[analysis.overallReadiness]
  return (
    <div className="rounded border border-border/40 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Preparation Story
        </span>
        <Badge variant="outline" className={`text-[10px] ${cfg.badge}`}>
          {cfg.label}
        </Badge>
      </div>

      {/* Key stats line */}
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span>Avg fitness <strong className="text-foreground">{analysis.avgTeamFitness}</strong></span>
        <span>Avg fatigue <strong className="text-foreground">{analysis.avgTeamFatigue}</strong></span>
      </div>

      {/* Factors */}
      <div className="space-y-1.5">
        {analysis.factors.map((factor, i) => (
          <div key={i} className="flex items-start gap-2">
            <FactorIcon impact={factor.impact} />
            <div className="min-w-0">
              <span className="text-[11px] font-medium">{factor.label}</span>
              {' '}
              <span className="text-[11px] text-muted-foreground">{factor.detail}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Player highlights */}
      {analysis.playerHighlights.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Player Highlights</div>
          {analysis.playerHighlights.map((ph) => (
            <div key={ph.playerId} className="flex items-start gap-2 text-[11px]">
              <span className={ph.impact === 'positive' ? 'text-green-500' : 'text-red-500'}>
                {ph.impact === 'positive' ? '▲' : '▼'}
              </span>
              <span>
                <span className="font-medium">{ph.playerName}</span>
                {' — '}
                <span className="text-muted-foreground">{ph.note}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Narrative */}
      {analysis.narrative && (
        <p className="text-[11px] text-muted-foreground italic border-t border-border/30 pt-2">
          "{analysis.narrative}"
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PastGameViewerProps {
  match: Match
  clubs: Record<string, Club>
  players: Record<string, Player>
  playerClubId: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function weatherIcon(condition: string) {
  switch (condition) {
    case 'wet':   return <Droplets className="h-3 w-3" />
    case 'windy': return <Wind className="h-3 w-3" />
    case 'hot':   return <Thermometer className="h-3 w-3" />
    case 'humid': return <Droplets className="h-3 w-3 opacity-60" />
    default:      return <Cloud className="h-3 w-3" />
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PastGameViewer({ match, clubs, players, playerClubId }: PastGameViewerProps) {
  const result = match.result
  const homeClub = clubs[match.homeClubId]
  const awayClub = clubs[match.awayClubId]

  const homeColor  = homeClub?.colors.primary ?? '#6b7280'
  const awayColor  = awayClub?.colors.primary ?? '#9ca3af'
  const homeAbbr   = homeClub?.abbreviation   ?? 'HOM'
  const awayAbbr   = awayClub?.abbreviation   ?? 'AWY'

  const ctx = result?.simulationContext

  const matchClubs = useMemo(() => {
    const c: Record<string, Club> = {}
    if (homeClub) c[match.homeClubId] = homeClub
    if (awayClub) c[match.awayClubId] = awayClub
    return c
  }, [homeClub, awayClub, match.homeClubId, match.awayClubId])

  if (!result) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No result data for this match.
      </div>
    )
  }

  const homeTotal = result.homeTotalScore
  const awayTotal = result.awayTotalScore
  const winner = homeTotal > awayTotal ? homeClub?.name : awayTotal > homeTotal ? awayClub?.name : null

  // Cumulative quarter scores
  let hRun = 0, aRun = 0
  const qRows = result.homeScores.map((hq, i) => {
    const aq = result.awayScores[i]
    hRun += hq.total
    aRun += aq?.total ?? 0
    return { q: i + 1, hq, aq, hRun, aRun }
  })

  return (
    <div className="space-y-4">

      {/* Score header */}
      <div className="rounded-md border p-4 text-center">
        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <div className="h-10 w-10 rounded-full border border-white/20" style={{ backgroundColor: homeColor }} />
            <span className="text-sm font-bold">{homeAbbr}</span>
          </div>
          <div>
            <div className="text-3xl font-bold tabular-nums">
              {homeTotal} – {awayTotal}
            </div>
            <Badge className="mt-1">
              {winner ? `${winner} win` : 'Draw'}
            </Badge>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="h-10 w-10 rounded-full border border-white/20" style={{ backgroundColor: awayColor }} />
            <span className="text-sm font-bold">{awayAbbr}</span>
          </div>
        </div>

        {/* Quarter-by-quarter score line */}
        {qRows.length > 0 && (
          <div className="mt-2 text-xs font-mono text-muted-foreground">
            <div className="flex items-center justify-center gap-3">
              <span className="w-10 text-right font-medium" style={{ color: homeColor }}>{homeAbbr}</span>
              {qRows.map(({ q, hq }) => (
                <span key={q} className="w-12 text-center">{hq.goals}.{hq.behinds}</span>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3">
              <span className="w-10 text-right font-medium" style={{ color: awayColor }}>{awayAbbr}</span>
              {qRows.map(({ q, aq }) => (
                <span key={q} className="w-12 text-center">{aq?.goals ?? 0}.{aq?.behinds ?? 0}</span>
              ))}
            </div>
          </div>
        )}

        {/* Conditions */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
          {match.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {match.venue}
            </span>
          )}
          {ctx?.weather && (
            <span className="inline-flex items-center gap-1">
              {weatherIcon(ctx.weather)}
              {ctx.weather.charAt(0).toUpperCase() + ctx.weather.slice(1)},&nbsp;
              {ctx.groundCondition}
            </span>
          )}
          {ctx?.windDirection && ctx.windStrength && ctx.windStrength !== 'calm' && (
            <span className="inline-flex items-center gap-1">
              <Wind className="h-3 w-3" />
              {windDirectionArrow(ctx.windDirection)} {windStrengthLabel(ctx.windStrength)} wind
            </span>
          )}
          {ctx?.attendance && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {ctx.attendance.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Score worm */}
      {result.keyEvents && result.keyEvents.length > 0 && (
        <>
          <ScoreWorm
            keyEvents={result.keyEvents}
            homeScores={result.homeScores}
            awayScores={result.awayScores}
            homeClubId={match.homeClubId}
            homeColor={homeColor}
            awayColor={awayColor}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
            quartersCompleted={result.homeScores.length}
          />
          <QuarterMomentumBars
            homeScores={result.homeScores}
            awayScores={result.awayScores}
            homeColor={homeColor}
            awayColor={awayColor}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
          />
        </>
      )}

      {/* Quarter weather changes */}
      {ctx?.quarterWeather && ctx.quarterWeather.some((q) => q.changeNote) && (
        <div className="rounded border border-border/40 p-2 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Weather Events</div>
          {ctx.quarterWeather
            .filter((q) => q.changeNote)
            .map((q) => (
              <div key={q.quarter} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="text-[9px]">Q{q.quarter}</Badge>
                <span>{q.changeNote}</span>
              </div>
            ))}
        </div>
      )}

      {/* Quarterly scoring breakdown (cumulative) */}
      {qRows.length > 0 && (
        <div className="rounded border border-border/40 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border/30 bg-muted/20 text-muted-foreground">
                <th className="text-left px-3 py-1.5 font-medium">Team</th>
                {qRows.map(({ q }) => (
                  <th key={q} className="text-center px-2 py-1.5 font-medium">Q{q}</th>
                ))}
                <th className="text-center px-2 py-1.5 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/20">
                <td className="px-3 py-1.5 font-semibold" style={{ color: homeColor }}>{homeAbbr}</td>
                {result.homeScores.map((hq, i) => (
                  <td key={i} className="text-center px-2 py-1.5 tabular-nums text-muted-foreground">
                    {hq.goals}.{hq.behinds}
                  </td>
                ))}
                <td className="text-center px-2 py-1.5 font-bold tabular-nums" style={{ color: homeColor }}>
                  {homeTotal}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 font-semibold" style={{ color: awayColor }}>{awayAbbr}</td>
                {result.awayScores.map((aq, i) => (
                  <td key={i} className="text-center px-2 py-1.5 tabular-nums text-muted-foreground">
                    {aq.goals}.{aq.behinds}
                  </td>
                ))}
                <td className="text-center px-2 py-1.5 font-bold tabular-nums" style={{ color: awayColor }}>
                  {awayTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Mid-match adjustments log */}
      {result.midMatchAdjustments && result.midMatchAdjustments.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tactical Changes</div>
          {result.midMatchAdjustments.map((adj, i) => (
            <div key={i} className="rounded border border-border/50 px-2 py-1 text-xs text-muted-foreground">
              Q{adj.quarter}: {adj.description}
            </div>
          ))}
        </div>
      )}

      {/* Preparation Story — only shown for user club matches */}
      {ctx?.prepAnalysis && (
        <PreparationStoryCard analysis={ctx.prepAnalysis} />
      )}

      {/* Full box score */}
      <PostMatchBoxScore
        match={match}
        clubs={matchClubs}
        players={players}
        playerClubId={playerClubId}
      />

    </div>
  )
}
