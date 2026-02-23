/**
 * LiveStatsDashboard — real-time stats panel shown alongside commentary
 * during the PLAYING phase of a live match.
 *
 * Stats are interpolated quarter-by-quarter: previous-quarter totals are
 * accurate; the current quarter's numbers grow proportionally as ticks advance.
 */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import type { MatchContext } from '@/engine/match/simulateMatch'
import type { MatchKeyEvent, MatchPlayerStats } from '@/types/match'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { RotationEvent } from '@/types/game'
import type { QuarterSnapshot } from './QuarterStatsSummary'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveStatsDashboardProps {
  ctx: MatchContext | null
  liveQuarter: number           // 1–4 (currently playing)
  liveMinute: number            // 0–30 (within current quarter)
  displayTickIndex: number      // ticks processed this quarter
  totalTicks: number            // total ticks for this quarter
  quarterSnapshots: QuarterSnapshot[]
  homeClub: Club | undefined
  awayClub: Club | undefined
  homeColor: string
  awayColor: string
  homeAbbr: string
  awayAbbr: string
  userClubId: string
  players: Record<string, Player>
  /** When provided, hide internal tab bar and render only this view. */
  activeView?: 'match' | 'players'
}

// Flat team-total shape used for the stat bars
interface TeamTotals {
  disposals: number
  marks: number
  tackles: number
  goals: number
  behinds: number
  hitouts: number
  clearances: number
  insideFifties: number
  rebound50s: number
  contestedPossessions: number
  turnovers: number
  intercepts: number
  metresGained: number
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function sumStats(arr: MatchPlayerStats[]): TeamTotals {
  const z: TeamTotals = {
    disposals: 0, marks: 0, tackles: 0, goals: 0, behinds: 0,
    hitouts: 0, clearances: 0, insideFifties: 0, rebound50s: 0,
    contestedPossessions: 0, turnovers: 0, intercepts: 0, metresGained: 0,
  }
  for (const s of arr) {
    z.disposals            += s.disposals
    z.marks                += s.marks
    z.tackles              += s.tackles
    z.goals                += s.goals
    z.behinds              += s.behinds
    z.hitouts              += s.hitouts
    z.clearances           += s.clearances
    z.insideFifties        += s.insideFifties
    z.rebound50s           += s.rebound50s
    z.contestedPossessions += s.contestedPossessions
    z.turnovers            += s.turnovers
    z.intercepts           += s.intercepts
    z.metresGained         += s.metresGained
  }
  return z
}

/**
 * Compute how many minutes a player has been on the ground up to `liveMatchMinute`
 * (0–120 scale) using the rotation event log.
 *
 * Starters (in `starterIds`) are on from minute 0; when a rotation removes them
 * they stop accumulating; when they come back on they resume accumulating.
 * Bench players start at 0 and only accumulate after a rotation brings them on.
 */
function computeTogMinutes(
  playerId: string,
  starterIds: Set<string>,
  rotationEvents: RotationEvent[],
  liveMatchMinute: number,
): number {
  const sorted = [...rotationEvents].sort((a, b) =>
    ((a.quarter - 1) * 30 + a.minute) - ((b.quarter - 1) * 30 + b.minute),
  )
  let onFieldSince: number | null = starterIds.has(playerId) ? 0 : null
  let total = 0
  for (const ev of sorted) {
    const evMin = (ev.quarter - 1) * 30 + ev.minute
    if (evMin > liveMatchMinute) break
    if (ev.playerOnId === playerId && onFieldSince === null) {
      onFieldSince = evMin
    }
    if (ev.playerOffId === playerId && onFieldSince !== null) {
      total += evMin - onFieldSince
      onFieldSince = null
    }
  }
  if (onFieldSince !== null) total += liveMatchMinute - onFieldSince
  return Math.max(0, total)
}

/**
 * Returns true if the player is currently on the ground at `liveMatchMinute`.
 */
function isOnGround(
  playerId: string,
  starterIds: Set<string>,
  rotationEvents: RotationEvent[],
  liveMatchMinute: number,
): boolean {
  const sorted = [...rotationEvents].sort((a, b) =>
    ((a.quarter - 1) * 30 + a.minute) - ((b.quarter - 1) * 30 + b.minute),
  )
  let onField = starterIds.has(playerId)
  for (const ev of sorted) {
    const evMin = (ev.quarter - 1) * 30 + ev.minute
    if (evMin > liveMatchMinute) break
    if (ev.playerOnId === playerId) onField = true
    if (ev.playerOffId === playerId) onField = false
  }
  return onField
}

/**
 * Interpolate a full player-stats array for the current live position.
 * Previous quarter totals are exact; the current quarter's delta is scaled
 * by `liveFraction` (0 = just started quarter, 1 = quarter finished).
 */
function computeLiveStats(
  snapshots: QuarterSnapshot[],
  liveQuarter: number,
  liveFraction: number,
  isHome: boolean,
): MatchPlayerStats[] {
  const currSnap = snapshots[liveQuarter - 1]
  if (!currSnap) return []

  const currArr  = isHome ? currSnap.home  : currSnap.away
  const prevSnap = liveQuarter >= 2 ? snapshots[liveQuarter - 2] : undefined
  const prevArr  = prevSnap ? (isHome ? prevSnap.home : prevSnap.away) : undefined

  const lerp = (curr: number, prev = 0) =>
    prev + Math.round((curr - prev) * liveFraction)

  return currArr.map((stat) => {
    const p = prevArr?.find((s) => s.playerId === stat.playerId)
    return {
      ...stat,
      disposals:            lerp(stat.disposals,            p?.disposals),
      kicks:                lerp(stat.kicks,                p?.kicks),
      handballs:            lerp(stat.handballs,            p?.handballs),
      marks:                lerp(stat.marks,                p?.marks),
      tackles:              lerp(stat.tackles,              p?.tackles),
      goals:                lerp(stat.goals,                p?.goals),
      behinds:              lerp(stat.behinds,              p?.behinds),
      hitouts:              lerp(stat.hitouts,              p?.hitouts),
      clearances:           lerp(stat.clearances,           p?.clearances),
      insideFifties:        lerp(stat.insideFifties,        p?.insideFifties),
      rebound50s:           lerp(stat.rebound50s,           p?.rebound50s),
      contestedPossessions: lerp(stat.contestedPossessions, p?.contestedPossessions),
      uncontestedPossessions: lerp(stat.uncontestedPossessions, p?.uncontestedPossessions),
      turnovers:            lerp(stat.turnovers,            p?.turnovers),
      intercepts:           lerp(stat.intercepts,           p?.intercepts),
      metresGained:         lerp(stat.metresGained,         p?.metresGained),
      minutesPlayed:        lerp(stat.minutesPlayed,        p?.minutesPlayed ?? 0),
    }
  })
}

/** Estimated in-game fatigue (0–100) for one player. */
function estimateFatigue(stat: MatchPlayerStats, baseFatigue: number): number {
  if (!stat.participated && stat.minutesPlayed <= 0) return baseFatigue
  const load =
    stat.minutesPlayed * 0.30 +
    stat.contestedPossessions * 0.45 +
    stat.tackles * 0.65
  return Math.min(99, Math.round(baseFatigue + load * 0.55))
}

function fatigueColor(pct: number): string {
  if (pct < 40) return '#22c55e'   // green
  if (pct < 65) return '#f59e0b'   // amber
  return '#ef4444'                  // red
}

/** Kicking accuracy: goals / (goals + behinds) */
function kickingEff(goals: number, behinds: number): string {
  const t = goals + behinds
  return t === 0 ? '—' : `${Math.round((goals / t) * 100)}%`
}

/** Inside-50 conversion: goals / inside50s */
function i50Eff(goals: number, i50: number): string {
  return i50 === 0 ? '—' : `${Math.round((goals / i50) * 100)}%`
}

// ---------------------------------------------------------------------------
// Stat bar (horizontal divided bar)
// ---------------------------------------------------------------------------

function StatBar({
  label, home, away, homeColor, awayColor, inverse = false,
  fmt = (v: number) => String(v),
}: {
  label: string
  home: number
  away: number
  homeColor: string
  awayColor: string
  inverse?: boolean   // lower is better (e.g. turnovers)
  fmt?: (v: number) => string
}) {
  const total = home + away
  const homePct = total === 0 ? 50 : (home / total) * 100
  const homeWins = inverse ? home < away : home > away
  const awayWins = inverse ? away < home : away > home

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span
          className={`tabular-nums font-semibold ${homeWins ? 'text-foreground' : 'text-muted-foreground'}`}
          style={homeWins ? { color: homeColor } : undefined}
        >
          {fmt(home)}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
        <span
          className={`tabular-nums font-semibold ${awayWins ? 'text-foreground' : 'text-muted-foreground'}`}
          style={awayWins ? { color: awayColor } : undefined}
        >
          {fmt(away)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${homePct}%`,
            backgroundColor: homeColor,
            opacity: homeWins ? 0.85 : 0.4,
            borderRadius: '9999px 0 0 9999px',
          }}
        />
        <div
          className="h-full flex-1"
          style={{
            backgroundColor: awayColor,
            opacity: awayWins ? 0.85 : 0.4,
            borderRadius: '0 9999px 9999px 0',
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Player row (compact)
// ---------------------------------------------------------------------------

function PlayerRow({
  stat, player, teamColor: _teamColor, fatigueEst, togMinutes, totalMatchMinutes, onGround, onPlayerClick,
}: {
  stat: MatchPlayerStats
  player: Player | undefined
  teamColor: string
  fatigueEst: number
  togMinutes: number
  totalMatchMinutes: number
  onGround: boolean
  onPlayerClick: (playerId: string) => void
}) {
  const name = player
    ? `${player.firstName[0]}. ${player.lastName}`
    : stat.playerId.slice(0, 8)
  const pos = player?.position.primary ?? '?'
  const togPct = Math.min(100, Math.round((togMinutes / Math.max(1, totalMatchMinutes)) * 100))
  const fatColor = fatigueColor(fatigueEst)

  return (
    <div className="flex items-center gap-1.5 text-[11px] py-0.5">
      {/* On-ground indicator */}
      <div
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: onGround ? '#22c55e' : '#ef4444' }}
        title={onGround ? 'On ground' : 'On bench'}
      />
      {/* Position */}
      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">{pos}</Badge>
      {/* Name */}
      <button
        className="flex-1 min-w-0 truncate font-medium text-left hover:underline hover:text-primary transition-colors"
        onClick={() => onPlayerClick(stat.playerId)}
      >
        {name}
      </button>
      {/* Stats */}
      <span className="tabular-nums text-muted-foreground w-5 text-right">{stat.disposals}</span>
      {stat.goals > 0 && (
        <span className="tabular-nums text-orange-500 font-semibold w-4 text-right">{stat.goals}</span>
      )}
      {stat.goals === 0 && <span className="w-4" />}
      <span className="tabular-nums text-muted-foreground w-4 text-right">{stat.marks}</span>
      <span className="tabular-nums text-muted-foreground w-4 text-right">{stat.tackles}</span>
      {/* TOG */}
      <span className="tabular-nums text-muted-foreground w-7 text-right text-[10px]">{togPct}%</span>
      {/* Fatigue dot */}
      <div
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: fatColor }}
        title={`Fatigue: ${fatigueEst}%`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live momentum mini-worm
// ---------------------------------------------------------------------------

function buildLiveWormData(
  keyEvents: MatchKeyEvent[],
  homeClubId: string,
  currentElapsed: number, // total match minutes elapsed (quarter * 30 + minute)
) {
  const scoringEvents = keyEvents
    .filter((e) => (e.type === 'goal' || e.type === 'behind'))
    .map((e) => ({
      time: (e.quarter - 1) * 30 + Math.min(e.minute, 29.9),
      pts: e.type === 'goal' ? 6 : 1,
      isHome: e.clubId === homeClubId,
    }))
    .filter((e) => e.time <= currentElapsed)
    .sort((a, b) => a.time - b.time)

  const points: { time: number; margin: number; homeArea: number; awayArea: number }[] = [
    { time: 0, margin: 0, homeArea: 0, awayArea: 0 },
  ]
  let margin = 0
  for (const ev of scoringEvents) {
    margin += ev.isHome ? ev.pts : -ev.pts
    points.push({
      time: ev.time,
      margin,
      homeArea: Math.max(0, margin),
      awayArea: Math.min(0, margin),
    })
  }
  // Cap to current position
  if (points[points.length - 1].time < currentElapsed) {
    const last = points[points.length - 1]
    points.push({ ...last, time: currentElapsed })
  }
  return points.sort((a, b) => a.time - b.time)
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type ActiveTab = 'match' | 'players'

export function LiveStatsDashboard({
  ctx,
  liveQuarter,
  liveMinute,
  displayTickIndex,
  totalTicks,
  quarterSnapshots,
  homeClub,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  players,
  activeView,
}: LiveStatsDashboardProps) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ActiveTab>('match')

  // When activeView is provided externally, use it instead of internal state
  const effectiveTab = activeView ?? activeTab

  // How far through the current quarter's tick sequence (0–1)
  const liveFraction = displayTickIndex / Math.max(1, totalTicks)

  // Interpolated live player stats for both teams
  const homeLive = useMemo(
    () => computeLiveStats(quarterSnapshots, liveQuarter, liveFraction, true),
    [quarterSnapshots, liveQuarter, liveFraction],
  )
  const awayLive = useMemo(
    () => computeLiveStats(quarterSnapshots, liveQuarter, liveFraction, false),
    [quarterSnapshots, liveQuarter, liveFraction],
  )

  const homeTeam = useMemo(() => sumStats(homeLive), [homeLive])
  const awayTeam = useMemo(() => sumStats(awayLive), [awayLive])

  // Total match time elapsed (minutes)
  const totalMatchMinutes = (liveQuarter - 1) * 30 + liveMinute

  // Starter sets + rotation events for TOG computation
  const homeStarterIds = useMemo(
    () => new Set((ctx?.homePlayers ?? []).map((p) => p.id)),
    [ctx],
  )
  const awayStarterIds = useMemo(
    () => new Set((ctx?.awayPlayers ?? []).map((p) => p.id)),
    [ctx],
  )
  const homeRotationEvents = ctx?.homeRotationEvents ?? []
  const awayRotationEvents = ctx?.awayRotationEvents ?? []

  // Matchup multipliers from ctx (pre-computed team tactical advantages)
  const matchup = ctx?.matchup

  // Live filtered key events for the momentum worm
  const wormData = useMemo(() => {
    if (!ctx) return []
    return buildLiveWormData(ctx.keyEvents, ctx.input.homeClubId, totalMatchMinutes)
  }, [ctx, totalMatchMinutes])

  const wormMargins = wormData.map((d) => d.margin)
  const wormAbsMax = Math.max(...wormMargins.map(Math.abs), 6)
  const wormPad    = Math.ceil(wormAbsMax * 0.2)
  const wormDomain: [number, number] = [-(wormAbsMax + wormPad), wormAbsMax + wormPad]
  const wormMaxTime = liveQuarter * 30
  const wormTicks = [0, 30, 60, 90, 120].filter((t) => t <= wormMaxTime)

  // Matchup edge helpers (positive = home advantage, negative = away advantage)
  function matchupEdge(homeMult: number, awayMult: number) {
    const diff = (homeMult - awayMult) * 100
    if (Math.abs(diff) < 2) return null
    return {
      home: diff > 0,
      label: `${diff > 0 ? homeAbbr : awayAbbr} +${Math.abs(Math.round(diff))}%`,
      color: diff > 0 ? homeColor : awayColor,
    }
  }

  const matchupEdges = matchup
    ? [
        { key: 'Inside 50', edge: matchupEdge(matchup.homeInside50Mult, matchup.awayInside50Mult) },
        { key: 'Accuracy',  edge: matchupEdge(matchup.homeAccuracyMult,  matchup.awayAccuracyMult) },
        { key: 'Marking',   edge: matchupEdge(matchup.homeMarkMult,      matchup.awayMarkMult) },
        { key: 'Pressure',  edge: matchupEdge(matchup.homeTackleMult,    matchup.awayTackleMult) },
      ].filter((e) => e.edge !== null)
    : []

  // Top players by disposals (for players tab)
  const topHome = useMemo(
    () =>
      homeLive
        .filter((s) => s.participated || s.disposals > 0)
        .sort((a, b) => b.disposals - a.disposals),
    [homeLive],
  )
  const topAway = useMemo(
    () =>
      awayLive
        .filter((s) => s.participated || s.disposals > 0)
        .sort((a, b) => b.disposals - a.disposals),
    [awayLive],
  )

  if (quarterSnapshots.length === 0) return null

  return (
    <div className={activeView ? '' : 'rounded-lg border border-border/60 bg-card text-card-foreground overflow-hidden'}>

      {/* ─── Tab header (hidden when controlled externally) ─── */}
      {!activeView && (
        <div className="flex border-b border-border/60">
          {(
            [
              { id: 'match'   as ActiveTab, label: 'Match Stats' },
              { id: 'players' as ActiveTab, label: 'Players'     },
            ]
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={[
                'flex-1 py-1.5 text-[11px] font-medium transition-colors',
                effectiveTab === id
                  ? 'bg-muted/60 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className={activeView ? 'space-y-3' : 'p-3 space-y-3'}>

        {/* ════════════════ MATCH STATS TAB ════════════════ */}
        {effectiveTab === 'match' && (
          <>
            {/* Team legend */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold" style={{ color: homeColor }}>{homeAbbr}</span>
              <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Team Comparison</span>
              <span className="font-semibold" style={{ color: awayColor }}>{awayAbbr}</span>
            </div>

            {/* Stat bars */}
            <div className="space-y-2">
              <StatBar label="Disposals"   home={homeTeam.disposals}            away={awayTeam.disposals}            homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Inside 50s"  home={homeTeam.insideFifties}        away={awayTeam.insideFifties}        homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Clearances"  home={homeTeam.clearances}           away={awayTeam.clearances}           homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Contested"   home={homeTeam.contestedPossessions} away={awayTeam.contestedPossessions} homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Marks"       home={homeTeam.marks}                away={awayTeam.marks}                homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Tackles"     home={homeTeam.tackles}              away={awayTeam.tackles}              homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Turnovers"   home={homeTeam.turnovers}            away={awayTeam.turnovers}            homeColor={homeColor} awayColor={awayColor} inverse />
              <StatBar label="Rebound 50s" home={homeTeam.rebound50s}           away={awayTeam.rebound50s}           homeColor={homeColor} awayColor={awayColor} />
              <StatBar
                label="Metres Gained"
                home={homeTeam.metresGained}
                away={awayTeam.metresGained}
                homeColor={homeColor}
                awayColor={awayColor}
                fmt={(v) => `${v}m`}
              />
            </div>

            {/* Efficiency row */}
            <div className="rounded-md bg-muted/30 px-2 py-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Kicking</span>
                <div className="flex gap-1">
                  <span style={{ color: homeColor }}>{kickingEff(homeTeam.goals, homeTeam.behinds)}</span>
                  <span className="text-muted-foreground">vs</span>
                  <span style={{ color: awayColor }}>{kickingEff(awayTeam.goals, awayTeam.behinds)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">I50 Conv.</span>
                <div className="flex gap-1">
                  <span style={{ color: homeColor }}>{i50Eff(homeTeam.goals, homeTeam.insideFifties)}</span>
                  <span className="text-muted-foreground">vs</span>
                  <span style={{ color: awayColor }}>{i50Eff(awayTeam.goals, awayTeam.insideFifties)}</span>
                </div>
              </div>
              {homeClub && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Hitouts</span>
                  <div className="flex gap-1">
                    <span style={{ color: homeColor }}>{homeTeam.hitouts}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span style={{ color: awayColor }}>{awayTeam.hitouts}</span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Intercepts</span>
                <div className="flex gap-1">
                  <span style={{ color: homeColor }}>{homeTeam.intercepts}</span>
                  <span className="text-muted-foreground">vs</span>
                  <span style={{ color: awayColor }}>{awayTeam.intercepts}</span>
                </div>
              </div>
            </div>

            {/* Matchup advantages */}
            {matchupEdges.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Tactical Edge</div>
                <div className="flex flex-wrap gap-1">
                  {matchupEdges.map(({ key, edge }) => edge && (
                    <span
                      key={key}
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: edge.color + '22', color: edge.color }}
                    >
                      {key}: {edge.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Live momentum (score worm) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span style={{ color: homeColor }}>{homeAbbr}</span>
                <span className="uppercase tracking-wide">Live Momentum</span>
                <span style={{ color: awayColor }}>{awayAbbr}</span>
              </div>
              <ResponsiveContainer width="100%" height={90}>
                <ComposedChart data={wormData} margin={{ top: 2, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lsdHomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={homeColor} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={homeColor} stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="lsdAwayGrad" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%"   stopColor={awayColor} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={awayColor} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.07} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={[0, wormMaxTime]}
                    ticks={wormTicks}
                    tickFormatter={(v: number) => v === 0 ? '' : `Q${v / 30}`}
                    tick={{ fontSize: 9 }}
                  />
                  <YAxis
                    domain={wormDomain}
                    tickFormatter={(v: number) => v > 0 ? `+${v}` : String(v)}
                    tick={{ fontSize: 9 }}
                    width={26}
                  />
                  <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" />
                  {wormTicks.filter((t) => t > 0 && t < wormMaxTime).map((t) => (
                    <ReferenceLine key={t} x={t} stroke="currentColor" strokeOpacity={0.1} />
                  ))}
                  <Area type="linear" dataKey="homeArea" fill="url(#lsdHomeGrad)" stroke="none"
                    isAnimationActive={false} baseValue={0} legendType="none" />
                  <Area type="linear" dataKey="awayArea" fill="url(#lsdAwayGrad)" stroke="none"
                    isAnimationActive={false} baseValue={0} legendType="none" />
                  <Line type="linear" dataKey="margin" stroke="#9ca3af" strokeWidth={1.5}
                    dot={false} isAnimationActive={false} legendType="none" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const entry = (payload as any[]).find((p: { dataKey: string }) => p.dataKey === 'margin')
                      if (!entry) return null
                      const m = entry.value as number
                      const label = m === 0 ? 'Level' : m > 0 ? `${homeAbbr} +${m}` : `${awayAbbr} +${Math.abs(m)}`
                      return (
                        <div className="rounded border bg-background px-2 py-0.5 text-[10px] shadow-md">
                          {label}
                        </div>
                      )
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* ════════════════ PLAYERS TAB ════════════════ */}
        {effectiveTab === 'players' && (
          <div className="space-y-3">
            {/* Column headers */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide border-b border-border/40 pb-1">
              <div className="w-1.5" />
              <div className="w-5" />   {/* pos */}
              <div className="flex-1">Name</div>
              <div className="w-5 text-right">D</div>
              <div className="w-4 text-right">G</div>
              <div className="w-4 text-right">M</div>
              <div className="w-4 text-right">T</div>
              <div className="w-7 text-right">TOG</div>
              <div className="w-2" />   {/* fatigue dot */}
            </div>

            {/* Home team */}
            <div className="space-y-0.5">
              <div
                className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
                style={{ color: homeColor }}
              >
                {homeAbbr}
              </div>
              {topHome.slice(0, 9).map((stat) => {
                const player = players[stat.playerId]
                const base   = player?.fatigue ?? 20
                return (
                  <PlayerRow
                    key={stat.playerId}
                    stat={stat}
                    player={player}
                    teamColor={homeColor}
                    fatigueEst={estimateFatigue(stat, base)}
                    togMinutes={computeTogMinutes(stat.playerId, homeStarterIds, homeRotationEvents, totalMatchMinutes)}
                    totalMatchMinutes={totalMatchMinutes}
                    onGround={isOnGround(stat.playerId, homeStarterIds, homeRotationEvents, totalMatchMinutes)}
                    onPlayerClick={(id) => navigate(`/player/${id}`)}
                  />
                )
              })}
            </div>

            <div className="border-t border-border/40" />

            {/* Away team */}
            <div className="space-y-0.5">
              <div
                className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
                style={{ color: awayColor }}
              >
                {awayAbbr}
              </div>
              {topAway.slice(0, 9).map((stat) => {
                const player = players[stat.playerId]
                const base   = player?.fatigue ?? 20
                return (
                  <PlayerRow
                    key={stat.playerId}
                    stat={stat}
                    player={player}
                    teamColor={awayColor}
                    fatigueEst={estimateFatigue(stat, base)}
                    togMinutes={computeTogMinutes(stat.playerId, awayStarterIds, awayRotationEvents, totalMatchMinutes)}
                    totalMatchMinutes={totalMatchMinutes}
                    onGround={isOnGround(stat.playerId, awayStarterIds, awayRotationEvents, totalMatchMinutes)}
                    onPlayerClick={(id) => navigate(`/player/${id}`)}
                  />
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 text-[9px] text-muted-foreground border-t border-border/40 pt-1.5">
              <span>D = disposals</span>
              <span>M = marks</span>
              <span>T = tackles</span>
              <span>TOG = time on ground</span>
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span>on ground</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                <span>bench</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                <span>fatigue</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
