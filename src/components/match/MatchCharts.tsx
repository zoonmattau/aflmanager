import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ResponsiveContainer, Tooltip,
  BarChart, Bar,
} from 'recharts'
import type { MatchKeyEvent, QuarterScore } from '@/types/match'

// ---------------------------------------------------------------------------
// Score worm data builder
// ---------------------------------------------------------------------------

function buildWormData(
  keyEvents: MatchKeyEvent[],
  homeClubId: string,
  homeScores: QuarterScore[],
  awayScores: QuarterScore[],
) {
  // Reconstruct margin timeline from goal/behind events
  const scoringEvents = keyEvents
    .filter((e) => e.type === 'goal' || e.type === 'behind')
    .map((e) => ({
      time: (e.quarter - 1) * 30 + Math.min(e.minute, 29.9),
      pts: e.type === 'goal' ? 6 : 1,
      isHome: e.clubId === homeClubId,
    }))
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

  // Pin quarter-end points to actual scores for accuracy
  for (let q = 0; q < homeScores.length; q++) {
    const t = (q + 1) * 30
    const homeRunning = homeScores.slice(0, q + 1).reduce((s, x) => s + x.total, 0)
    const awayRunning = awayScores.slice(0, q + 1).reduce((s, x) => s + x.total, 0)
    const actualMargin = homeRunning - awayRunning
    const pin = { time: t, margin: actualMargin, homeArea: Math.max(0, actualMargin), awayArea: Math.min(0, actualMargin) }
    const idx = points.findIndex((p) => p.time === t)
    if (idx >= 0) points[idx] = pin
    else points.push(pin)
  }

  return points.sort((a, b) => a.time - b.time)
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function WormTooltip({
  active,
  payload,
  homeAbbr,
  awayAbbr,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  active?: boolean; payload?: ReadonlyArray<any>; homeAbbr: string; awayAbbr: string
}) {
  if (!active || !payload?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = payload.find((p: any) => p.dataKey === 'margin')
  if (!entry) return null
  const m = entry.value as number
  const label = m === 0 ? 'Level pegging' : m > 0 ? `${homeAbbr} +${m}` : `${awayAbbr} +${Math.abs(m)}`
  return (
    <div className="rounded border bg-background px-2 py-1 text-xs shadow-md">
      {label}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score worm
// ---------------------------------------------------------------------------

export interface ScoreWormProps {
  keyEvents: MatchKeyEvent[]
  homeScores: QuarterScore[]
  awayScores: QuarterScore[]
  homeClubId: string
  homeColor: string
  awayColor: string
  homeAbbr: string
  awayAbbr: string
  quartersCompleted: number
}

export function ScoreWorm({
  keyEvents, homeScores, awayScores, homeClubId,
  homeColor, awayColor, homeAbbr, awayAbbr, quartersCompleted,
}: ScoreWormProps) {
  const data = buildWormData(keyEvents, homeClubId, homeScores, awayScores)

  const margins = data.map((d) => d.margin)
  const absMax = Math.max(...margins.map(Math.abs), 6)
  const pad    = Math.ceil(absMax * 0.2)
  const yDomain: [number, number] = [-(absMax + pad), absMax + pad]
  const maxTime = quartersCompleted * 30
  const xTicks  = [0, 30, 60, 90, 120].filter((t) => t <= maxTime)

  // Momentum badge: who won the most recent quarter?
  const lastQHome = homeScores[quartersCompleted - 1]?.total ?? 0
  const lastQAway = awayScores[quartersCompleted - 1]?.total ?? 0
  const momentumLabel =
    lastQHome > lastQAway ? `${homeAbbr} ↑`
    : lastQAway > lastQHome ? `${awayAbbr} ↑`
    : null

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: homeColor }} />
          <span className="text-muted-foreground">{homeAbbr}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">Score Worm</span>
          {momentumLabel && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: lastQHome > lastQAway ? homeColor : awayColor, color: '#fff', opacity: 0.9 }}
            >
              {momentumLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{awayAbbr}</span>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: awayColor }} />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="homeWormGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={homeColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={homeColor} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="awayWormGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={awayColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={awayColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
          <XAxis
            dataKey="time"
            type="number"
            domain={[0, maxTime]}
            ticks={xTicks}
            tickFormatter={(v: number) => v === 0 ? '' : `Q${v / 30}`}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            domain={yDomain}
            tickFormatter={(v: number) => v > 0 ? `+${v}` : String(v)}
            tick={{ fontSize: 10 }}
            width={30}
          />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="4 4" />
          {/* Quarter separator lines */}
          {xTicks.filter((t) => t > 0 && t < maxTime).map((t) => (
            <ReferenceLine key={t} x={t} stroke="currentColor" strokeOpacity={0.12} />
          ))}
          {/* Home fill (above zero) */}
          <Area
            type="linear"
            dataKey="homeArea"
            fill="url(#homeWormGrad)"
            stroke="none"
            isAnimationActive={false}
            baseValue={0}
            legendType="none"
          />
          {/* Away fill (below zero) */}
          <Area
            type="linear"
            dataKey="awayArea"
            fill="url(#awayWormGrad)"
            stroke="none"
            isAnimationActive={false}
            baseValue={0}
            legendType="none"
          />
          {/* Main worm line */}
          <Line
            type="linear"
            dataKey="margin"
            stroke="#9ca3af"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            legendType="none"
          />
          <Tooltip content={(props) => (
            <WormTooltip active={props.active} payload={props.payload} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />
          )} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quarter momentum bars (who scored more per quarter)
// ---------------------------------------------------------------------------

export interface QuarterMomentumBarsProps {
  homeScores: QuarterScore[]
  awayScores: QuarterScore[]
  homeColor: string
  awayColor: string
  homeAbbr: string
  awayAbbr: string
}

export function QuarterMomentumBars({
  homeScores, awayScores,
  homeColor, awayColor, homeAbbr, awayAbbr,
}: QuarterMomentumBarsProps) {
  if (homeScores.length === 0) return null

  const data = homeScores.map((hq, i) => {
    const aq = awayScores[i] ?? { goals: 0, behinds: 0, total: 0 }
    return {
      q:    `Q${i + 1}`,
      home: hq.total,
      away: aq.total,
      diff: hq.total - aq.total,
    }
  })

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: homeColor }} />
          <span className="text-muted-foreground">{homeAbbr}</span>
        </div>
        <span className="text-xs font-medium text-foreground">Momentum by Quarter</span>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{awayAbbr}</span>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: awayColor }} />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={data} margin={{ top: 2, right: 8, left: -16, bottom: 0 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
          <XAxis dataKey="q" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} width={28} />
          <Bar dataKey="home" fill={homeColor} fillOpacity={0.8} radius={[2, 2, 0, 0]} name={homeAbbr} />
          <Bar dataKey="away" fill={awayColor} fillOpacity={0.8} radius={[2, 2, 0, 0]} name={awayAbbr} />
          <Tooltip
            formatter={(v: number | undefined, name: string | undefined) => [`${v ?? 0} pts`, name === 'home' ? homeAbbr : awayAbbr]}
            contentStyle={{ fontSize: '11px' }}
          />
        </BarChart>
      </ResponsiveContainer>
      {/* Quarter winner summary row */}
      <div className="flex gap-1 justify-center">
        {data.map((d) => (
          <div key={d.q} className="text-center min-w-[40px]">
            <div className="text-[10px] text-muted-foreground">{d.q}</div>
            <div
              className="text-[10px] font-semibold rounded px-1"
              style={{
                backgroundColor: d.diff > 0 ? homeColor : d.diff < 0 ? awayColor : 'transparent',
                color: d.diff !== 0 ? '#fff' : 'currentColor',
                opacity: d.diff !== 0 ? 0.85 : 0.4,
              }}
            >
              {d.diff === 0 ? '=' : d.diff > 0 ? `+${d.diff}` : d.diff}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
