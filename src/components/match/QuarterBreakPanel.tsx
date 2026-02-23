/**
 * QuarterBreakPanel
 *
 * Comprehensive tabbed stats panel displayed at QT / HT / 3QT breaks.
 *
 * Tabs:
 *   Stats    – team comparison stat bars (cumulative match totals)
 *   Worm     – score worm + quarter momentum bars
 *   Quarters – per-quarter score & top performers
 *   Scoring  – chronological goal/behind chain with running score
 *   Players  – full player stat table (both teams, scrollable)
 */

import { useState, useMemo } from 'react'
import { ScoreWorm, QuarterMomentumBars } from '@/components/match/MatchCharts'
import type { QuarterSnapshot } from '@/components/match/QuarterStatsSummary'
import type { MatchKeyEvent, MatchPlayerStats, QuarterScore } from '@/types/match'
import type { Player } from '@/types/player'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'stats' | 'worm' | 'quarters' | 'scoring' | 'players'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function sumStats(arr: MatchPlayerStats[]) {
  const z = {
    disposals: 0, kicks: 0, handballs: 0, marks: 0, tackles: 0,
    goals: 0, behinds: 0, hitouts: 0, clearances: 0, insideFifties: 0,
    rebound50s: 0, contestedPossessions: 0, turnovers: 0, intercepts: 0, metresGained: 0,
  }
  for (const s of arr) {
    z.disposals += s.disposals
    z.kicks += s.kicks
    z.handballs += s.handballs
    z.marks += s.marks
    z.tackles += s.tackles
    z.goals += s.goals
    z.behinds += s.behinds
    z.hitouts += s.hitouts
    z.clearances += s.clearances
    z.insideFifties += s.insideFifties
    z.rebound50s += s.rebound50s
    z.contestedPossessions += s.contestedPossessions
    z.turnovers += s.turnovers
    z.intercepts += s.intercepts
    z.metresGained += s.metresGained
  }
  return z
}

function computeDelta(
  current: MatchPlayerStats[],
  prev: MatchPlayerStats[] | undefined,
): MatchPlayerStats[] {
  if (!prev) return current.map((s) => ({ ...s }))
  const prevMap = new Map(prev.map((s) => [s.playerId, s]))
  return current.map((s) => {
    const p = prevMap.get(s.playerId)
    if (!p) return { ...s }
    return {
      ...s,
      disposals:             Math.max(0, s.disposals - p.disposals),
      kicks:                 Math.max(0, s.kicks - p.kicks),
      handballs:             Math.max(0, s.handballs - p.handballs),
      marks:                 Math.max(0, s.marks - p.marks),
      tackles:               Math.max(0, s.tackles - p.tackles),
      goals:                 Math.max(0, s.goals - p.goals),
      behinds:               Math.max(0, s.behinds - p.behinds),
      hitouts:               Math.max(0, s.hitouts - p.hitouts),
      clearances:            Math.max(0, s.clearances - p.clearances),
      insideFifties:         Math.max(0, s.insideFifties - p.insideFifties),
      rebound50s:            Math.max(0, s.rebound50s - p.rebound50s),
      contestedPossessions:  Math.max(0, s.contestedPossessions - p.contestedPossessions),
      turnovers:             Math.max(0, s.turnovers - p.turnovers),
      intercepts:            Math.max(0, s.intercepts - p.intercepts),
      metresGained:          Math.max(0, s.metresGained - p.metresGained),
    }
  })
}

function pct(num: number, den: number) {
  return den === 0 ? '—' : `${Math.round((num / den) * 100)}%`
}

// Replicate engine formulas so we have live values at quarter breaks
// (engine only computes these in finalizeMatch at full time)
function calcFP(s: MatchPlayerStats): number {
  return Math.round(
    s.kicks * 3 + s.handballs * 2 + s.marks * 3 + s.tackles * 4 +
    s.hitouts + s.goals * 6 + s.behinds + s.freesFor - s.freesAgainst * 3,
  )
}

function calcSCRaw(s: MatchPlayerStats): number {
  const disp    = s.kicks * 2.5 + s.handballs * 1.7
  const cont    = s.contestedPossessions * 3.9 + s.clearances * 4.2
  const def     = s.intercepts * 3.7 + s.onePercenters * 1.6 + s.contestedMarks * 8.2
  const score   = s.goals * 9.1 + s.behinds * 1.3 + s.scoreInvolvements * 2.5 +
                  s.goalAssists * 4.3 + s.insideFifties * 1.25
  const ruck    = s.hitouts * 1.1 + s.tackles * 4.6 + s.rebound50s * 1.7
  const disc    = s.freesFor * 0.9 - s.freesAgainst * 3.9
  const mistake = s.clangers * -4.8 + s.turnovers * -3.1
  return Math.round(Math.max(1, disp + cont + def + score + ruck + disc + mistake))
}

type SortKey =
  | 'disposals' | 'kicks' | 'handballs' | 'marks' | 'tackles'
  | 'goals' | 'behinds' | 'hitouts' | 'clearances' | 'insideFifties'
  | 'rebound50s' | 'contestedPossessions' | 'turnovers' | 'fp' | 'sc'

const PLAYER_COLS: { key: SortKey; label: string; color?: string }[] = [
  { key: 'disposals',            label: 'D'   },
  { key: 'kicks',                label: 'K'   },
  { key: 'handballs',            label: 'HB'  },
  { key: 'marks',                label: 'M'   },
  { key: 'tackles',              label: 'T'   },
  { key: 'goals',                label: 'G'   },
  { key: 'behinds',              label: 'B'   },
  { key: 'hitouts',              label: 'HO'  },
  { key: 'clearances',           label: 'CL'  },
  { key: 'insideFifties',        label: 'I50' },
  { key: 'rebound50s',           label: 'R50' },
  { key: 'contestedPossessions', label: 'CP'  },
  { key: 'turnovers',            label: 'TO'  },
  { key: 'fp',                   label: 'FP',  color: '#f59e0b' },
  { key: 'sc',                   label: 'SC',  color: '#60a5fa' },
]

function playerName(p: Player | undefined, playerId: string) {
  return p ? `${p.firstName[0]}. ${p.lastName}` : playerId.slice(0, 8)
}

// ---------------------------------------------------------------------------
// StatBar (horizontal divided bar)
// ---------------------------------------------------------------------------

function StatBar({
  label, home, away, homeColor, awayColor,
  inverse = false, fmt = (v: number) => String(v),
}: {
  label: string; home: number; away: number
  homeColor: string; awayColor: string
  inverse?: boolean
  fmt?: (v: number) => string
}) {
  const total = home + away
  const homePct = total === 0 ? 50 : (home / total) * 100
  const homeWins = inverse ? home < away : home > away
  const awayWins = inverse ? away < home : away > home
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-[11px]">
        <span
          className="tabular-nums font-semibold w-9 text-right shrink-0"
          style={{ color: homeWins ? homeColor : undefined }}
        >
          {fmt(home)}
        </span>
        <span className="flex-1 text-center text-[10px] text-muted-foreground leading-none">
          {label}
        </span>
        <span
          className="tabular-nums font-semibold w-9 text-left shrink-0"
          style={{ color: awayWins ? awayColor : undefined }}
        >
          {fmt(away)}
        </span>
      </div>
      {/* Two-colour split bar — absolute children avoid the flex seam artefact */}
      <div className="relative h-2 rounded-full overflow-hidden bg-muted/30">
        <div
          className="absolute inset-y-0 left-0 h-full"
          style={{
            width: `${homePct}%`,
            backgroundColor: homeColor,
            opacity: homeWins ? 0.88 : 0.28,
          }}
        />
        <div
          className="absolute inset-y-0 right-0 h-full"
          style={{
            width: `${100 - homePct}%`,
            backgroundColor: awayColor,
            opacity: awayWins ? 0.88 : 0.28,
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// QuarterBreakPanel props
// ---------------------------------------------------------------------------

export interface QuarterBreakPanelProps {
  snapshots:          QuarterSnapshot[]
  quartersCompleted:  number
  keyEvents:          MatchKeyEvent[]
  homeScores:         QuarterScore[]
  awayScores:         QuarterScore[]
  players:            Record<string, Player>
  homeClubId:         string
  awayClubId:         string
  homeColor:          string
  awayColor:          string
  homeAbbr:           string
  awayAbbr:           string
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function QuarterBreakPanel({
  snapshots, quartersCompleted, keyEvents,
  homeScores, awayScores, players,
  homeClubId, awayClubId,
  homeColor, awayColor, homeAbbr, awayAbbr,
}: QuarterBreakPanelProps) {
  const [tab, setTab] = useState<Tab>('stats')
  const [playerScope, setPlayerScope] = useState<'match' | 'quarter'>('match')
  const [playerTeam, setPlayerTeam] = useState<'all' | 'home' | 'away'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('disposals')
  const [sortAsc, setSortAsc] = useState(false)
  const [scoringFilter, setScoringFilter] = useState<'all' | 'home' | 'away'>('all')

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  function sortStats(arr: MatchPlayerStats[]) {
    return [...arr]
      .filter((s) => s.participated || s.disposals > 0)
      .map((s) => ({ s, fp: calcFP(s), sc: calcSCRaw(s) }))
      .sort((a, b) => {
        const av = sortKey === 'fp' ? a.fp : sortKey === 'sc' ? a.sc : (a.s[sortKey as keyof MatchPlayerStats] as number) ?? 0
        const bv = sortKey === 'fp' ? b.fp : sortKey === 'sc' ? b.sc : (b.s[sortKey as keyof MatchPlayerStats] as number) ?? 0
        return sortAsc ? av - bv : bv - av
      })
  }

  const currentSnap = snapshots[quartersCompleted - 1]

  // Cumulative match totals
  const homeMatchTotals = useMemo(() => sumStats(currentSnap?.home ?? []), [currentSnap])
  const awayMatchTotals = useMemo(() => sumStats(currentSnap?.away ?? []), [currentSnap])

  // This-quarter delta stats
  const prevSnap = quartersCompleted > 1 ? snapshots[quartersCompleted - 2] : undefined
  const homeQDeltas = useMemo(
    () => computeDelta(currentSnap?.home ?? [], prevSnap?.home),
    [currentSnap, prevSnap],
  )
  const awayQDeltas = useMemo(
    () => computeDelta(currentSnap?.away ?? [], prevSnap?.away),
    [currentSnap, prevSnap],
  )

  // Scoring chain with running totals
  interface ScoringEntry {
    quarter: number; minute: number
    type: 'goal' | 'behind'; clubId: string; playerId?: string
    homeGoals: number; homeBehinds: number
    awayGoals: number; awayBehinds: number
    homeTotal: number; awayTotal: number
  }
  const scoringChain = useMemo<ScoringEntry[]>(() => {
    const evts = keyEvents
      .filter((e) => e.type === 'goal' || e.type === 'behind')
      .sort((a, b) => (a.quarter - b.quarter) * 1000 + (a.minute - b.minute))
    let hg = 0, hb = 0, ag = 0, ab = 0
    return evts.map((e) => {
      const isHome = e.clubId === homeClubId
      if (e.type === 'goal') { if (isHome) hg++; else ag++ }
      else { if (isHome) hb++; else ab++ }
      return {
        quarter: e.quarter, minute: e.minute,
        type: e.type as 'goal' | 'behind',
        clubId: e.clubId, playerId: e.playerId,
        homeGoals: hg, homeBehinds: hb, awayGoals: ag, awayBehinds: ab,
        homeTotal: hg * 6 + hb, awayTotal: ag * 6 + ab,
      }
    })
  }, [keyEvents, homeClubId])

  const filteredScoring = scoringChain.filter((e) => {
    if (scoringFilter === 'home') return e.clubId === homeClubId
    if (scoringFilter === 'away') return e.clubId === awayClubId
    return true
  })

  // Running score through home/away totals at start of each quarter
  const qRunningTotals = useMemo(() => {
    const rows: { q: number; hRun: number; aRun: number }[] = []
    let hRun = 0, aRun = 0
    for (let q = 0; q < quartersCompleted; q++) {
      hRun += homeScores[q]?.total ?? 0
      aRun += awayScores[q]?.total ?? 0
      rows.push({ q: q + 1, hRun, aRun })
    }
    return rows
  }, [homeScores, awayScores, quartersCompleted])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'stats',    label: 'Team Stats' },
    { id: 'worm',     label: 'Worm'       },
    { id: 'quarters', label: 'Quarters'   },
    { id: 'scoring',  label: 'Scoring'    },
    { id: 'players',  label: 'Players'    },
  ]

  if (!currentSnap) return null

  const homePlayerStats = playerScope === 'match' ? currentSnap.home : homeQDeltas
  const awayPlayerStats = playerScope === 'match' ? currentSnap.away : awayQDeltas

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">

      {/* ── Tab bar ── */}
      <div className="flex border-b border-border/60">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'flex-1 py-1.5 text-[11px] font-medium transition-colors',
              tab === t.id
                ? 'bg-muted/60 text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-3">

        {/* ══════════════ TEAM STATS TAB ══════════════ */}
        {tab === 'stats' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold" style={{ color: homeColor }}>{homeAbbr}</span>
              <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Cumulative Match Stats</span>
              <span className="font-bold" style={{ color: awayColor }}>{awayAbbr}</span>
            </div>

            <div className="space-y-2">
              <StatBar label="Disposals"    home={homeMatchTotals.disposals}            away={awayMatchTotals.disposals}            homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Kicks"        home={homeMatchTotals.kicks}                away={awayMatchTotals.kicks}                homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Handballs"    home={homeMatchTotals.handballs}            away={awayMatchTotals.handballs}            homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Inside 50s"   home={homeMatchTotals.insideFifties}        away={awayMatchTotals.insideFifties}        homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Clearances"   home={homeMatchTotals.clearances}           away={awayMatchTotals.clearances}           homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Contested P." home={homeMatchTotals.contestedPossessions} away={awayMatchTotals.contestedPossessions} homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Marks"        home={homeMatchTotals.marks}                away={awayMatchTotals.marks}                homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Tackles"      home={homeMatchTotals.tackles}              away={awayMatchTotals.tackles}              homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Hitouts"      home={homeMatchTotals.hitouts}              away={awayMatchTotals.hitouts}              homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Rebound 50s"  home={homeMatchTotals.rebound50s}           away={awayMatchTotals.rebound50s}           homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Intercepts"   home={homeMatchTotals.intercepts}           away={awayMatchTotals.intercepts}           homeColor={homeColor} awayColor={awayColor} />
              <StatBar label="Turnovers"    home={homeMatchTotals.turnovers}            away={awayMatchTotals.turnovers}            homeColor={homeColor} awayColor={awayColor} inverse />
              <StatBar
                label="Metres Gained"
                home={homeMatchTotals.metresGained}
                away={awayMatchTotals.metresGained}
                homeColor={homeColor} awayColor={awayColor}
                fmt={(v) => `${v}m`}
              />
            </div>

            {/* Efficiency grid */}
            <div className="rounded-md bg-muted/30 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              {[
                {
                  label: 'Kick Accuracy',
                  h: pct(homeMatchTotals.goals, homeMatchTotals.goals + homeMatchTotals.behinds),
                  a: pct(awayMatchTotals.goals, awayMatchTotals.goals + awayMatchTotals.behinds),
                },
                {
                  label: 'I50 Conversion',
                  h: pct(homeMatchTotals.goals, homeMatchTotals.insideFifties),
                  a: pct(awayMatchTotals.goals, awayMatchTotals.insideFifties),
                },
                {
                  label: 'Hitout %',
                  h: pct(homeMatchTotals.hitouts, homeMatchTotals.hitouts + awayMatchTotals.hitouts),
                  a: pct(awayMatchTotals.hitouts, homeMatchTotals.hitouts + awayMatchTotals.hitouts),
                },
                {
                  label: 'D/Turnover',
                  h: homeMatchTotals.turnovers === 0 ? '—' : (homeMatchTotals.disposals / homeMatchTotals.turnovers).toFixed(1),
                  a: awayMatchTotals.turnovers === 0 ? '—' : (awayMatchTotals.disposals / awayMatchTotals.turnovers).toFixed(1),
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="tabular-nums">
                    <span style={{ color: homeColor }}>{row.h}</span>
                    <span className="text-muted-foreground mx-1">vs</span>
                    <span style={{ color: awayColor }}>{row.a}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ WORM TAB ══════════════ */}
        {tab === 'worm' && (
          <div className="space-y-4">
            <ScoreWorm
              keyEvents={keyEvents}
              homeScores={homeScores}
              awayScores={awayScores}
              homeClubId={homeClubId}
              homeColor={homeColor}
              awayColor={awayColor}
              homeAbbr={homeAbbr}
              awayAbbr={awayAbbr}
              quartersCompleted={quartersCompleted}
            />
            {quartersCompleted > 1 && (
              <QuarterMomentumBars
                homeScores={homeScores}
                awayScores={awayScores}
                homeColor={homeColor}
                awayColor={awayColor}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
              />
            )}
            {/* Running cumulative score table */}
            <div className="rounded-md bg-muted/20 border border-border/40 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground">
                    <th className="text-left px-3 py-1.5 font-medium">Team</th>
                    {qRunningTotals.map((r) => (
                      <th key={r.q} className="text-center px-2 py-1.5 font-medium">Q{r.q}</th>
                    ))}
                    <th className="text-center px-2 py-1.5 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/20">
                    <td className="px-3 py-1.5 font-semibold" style={{ color: homeColor }}>{homeAbbr}</td>
                    {homeScores.slice(0, quartersCompleted).map((q, i) => (
                      <td key={i} className="text-center px-2 py-1.5 tabular-nums text-muted-foreground">
                        {q.goals}.{q.behinds}
                      </td>
                    ))}
                    <td className="text-center px-2 py-1.5 font-bold tabular-nums" style={{ color: homeColor }}>
                      {qRunningTotals[quartersCompleted - 1]?.hRun ?? 0}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 font-semibold" style={{ color: awayColor }}>{awayAbbr}</td>
                    {awayScores.slice(0, quartersCompleted).map((q, i) => (
                      <td key={i} className="text-center px-2 py-1.5 tabular-nums text-muted-foreground">
                        {q.goals}.{q.behinds}
                      </td>
                    ))}
                    <td className="text-center px-2 py-1.5 font-bold tabular-nums" style={{ color: awayColor }}>
                      {qRunningTotals[quartersCompleted - 1]?.aRun ?? 0}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════ QUARTERS TAB ══════════════ */}
        {tab === 'quarters' && (
          <div className="space-y-3">
            {Array.from({ length: quartersCompleted }, (_, qi) => {
              const q = qi + 1
              const hq = homeScores[qi]
              const aq = awayScores[qi]
              const snap = snapshots[qi]
              const prevS = qi > 0 ? snapshots[qi - 1] : undefined
              if (!snap || !hq || !aq) return null

              const hDeltas = computeDelta(snap.home, prevS?.home)
              const aDeltas = computeDelta(snap.away, prevS?.away)
              const topHome = [...hDeltas].filter(s => s.disposals > 0 || s.goals > 0).sort((a, b) => b.disposals - a.disposals).slice(0, 3)
              const topAway = [...aDeltas].filter(s => s.disposals > 0 || s.goals > 0).sort((a, b) => b.disposals - a.disposals).slice(0, 3)

              const hWon = hq.total > aq.total
              const aWon = aq.total > hq.total

              return (
                <div key={q} className="rounded-md border border-border/40 overflow-hidden">
                  {/* Quarter header */}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border/30">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {q === 1 ? 'Quarter 1' : q === 2 ? 'Half Time' : q === 3 ? 'Three Quarter' : 'Final Quarter'}
                    </span>
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span style={{ color: homeColor, fontWeight: hWon ? 700 : 400 }}>
                        {hq.goals}.{hq.behinds} ({hq.total})
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        {hWon ? `${homeAbbr} +${hq.total - aq.total}` : aWon ? `${awayAbbr} +${aq.total - hq.total}` : 'level'}
                      </span>
                      <span style={{ color: awayColor, fontWeight: aWon ? 700 : 400 }}>
                        {aq.goals}.{aq.behinds} ({aq.total})
                      </span>
                    </div>
                  </div>
                  {/* Top performers */}
                  <div className="grid grid-cols-2 gap-0">
                    <div className="p-2 space-y-1 border-r border-border/30">
                      <div className="flex items-center text-[9px] mb-1">
                        <span className="font-semibold uppercase tracking-wide flex-1" style={{ color: homeColor }}>{homeAbbr}</span>
                        <span className="text-muted-foreground/50 uppercase tracking-wide w-5 text-right">D</span>
                        <span className="text-muted-foreground/50 uppercase tracking-wide w-4 text-right">G</span>
                        <span className="text-muted-foreground/50 uppercase tracking-wide w-4 text-right">M</span>
                        <span className="text-muted-foreground/50 uppercase tracking-wide w-4 text-right">T</span>
                      </div>
                      {topHome.length === 0
                        ? <div className="text-[10px] text-muted-foreground/40">No data</div>
                        : topHome.map((s) => {
                            const p = players[s.playerId]
                            return (
                              <div key={s.playerId} className="flex items-center gap-1 text-[10px]">
                                <span className="flex-1 truncate font-medium">{playerName(p, s.playerId)}</span>
                                <span className="tabular-nums text-muted-foreground w-5 text-right">{s.disposals}</span>
                                <span className={`tabular-nums w-4 text-right ${s.goals > 0 ? 'font-semibold' : 'text-muted-foreground/40'}`} style={s.goals > 0 ? { color: '#f97316' } : undefined}>{s.goals}</span>
                                <span className="tabular-nums text-muted-foreground w-4 text-right">{s.marks}</span>
                                <span className="tabular-nums text-muted-foreground w-4 text-right">{s.tackles}</span>
                              </div>
                            )
                          })}
                    </div>
                    <div className="p-2 space-y-1">
                      <div className="flex items-center text-[9px] mb-1">
                        <span className="font-semibold uppercase tracking-wide flex-1" style={{ color: awayColor }}>{awayAbbr}</span>
                        <span className="text-muted-foreground/50 uppercase tracking-wide w-5 text-right">D</span>
                        <span className="text-muted-foreground/50 uppercase tracking-wide w-4 text-right">G</span>
                        <span className="text-muted-foreground/50 uppercase tracking-wide w-4 text-right">M</span>
                        <span className="text-muted-foreground/50 uppercase tracking-wide w-4 text-right">T</span>
                      </div>
                      {topAway.length === 0
                        ? <div className="text-[10px] text-muted-foreground/40">No data</div>
                        : topAway.map((s) => {
                            const p = players[s.playerId]
                            return (
                              <div key={s.playerId} className="flex items-center gap-1 text-[10px]">
                                <span className="flex-1 truncate font-medium">{playerName(p, s.playerId)}</span>
                                <span className="tabular-nums text-muted-foreground w-5 text-right">{s.disposals}</span>
                                <span className={`tabular-nums w-4 text-right ${s.goals > 0 ? 'font-semibold' : 'text-muted-foreground/40'}`} style={s.goals > 0 ? { color: '#f97316' } : undefined}>{s.goals}</span>
                                <span className="tabular-nums text-muted-foreground w-4 text-right">{s.marks}</span>
                                <span className="tabular-nums text-muted-foreground w-4 text-right">{s.tackles}</span>
                              </div>
                            )
                          })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══════════════ SCORING CHAIN TAB ══════════════ */}
        {tab === 'scoring' && (
          <div className="space-y-2">
            {/* Filter */}
            <div className="flex items-center gap-1">
              {(['all', 'home', 'away'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setScoringFilter(f)}
                  className={[
                    'px-2 py-0.5 rounded text-[10px] font-medium transition-colors border',
                    scoringFilter === f
                      ? 'border-transparent text-white'
                      : 'border-border/40 text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                  style={scoringFilter === f
                    ? { backgroundColor: f === 'home' ? homeColor : f === 'away' ? awayColor : '#6b7280' }
                    : undefined}
                >
                  {f === 'all' ? 'All' : f === 'home' ? homeAbbr : awayAbbr}
                </button>
              ))}
              <span className="text-[10px] text-muted-foreground ml-auto">
                {filteredScoring.length} events
              </span>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground pb-1 border-b border-border/40">
              <span className="w-14 shrink-0">Time</span>
              <span className="w-2 shrink-0" />
              <span className="flex-1">Player</span>
              <span className="text-right text-[9px]">Score</span>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-0.5 pr-0.5">
              {filteredScoring.length === 0 && (
                <div className="text-xs text-muted-foreground/50 text-center py-6">No scoring events yet</div>
              )}
              {filteredScoring.map((e, i) => {
                const isHome = e.clubId === homeClubId
                const color = isHome ? homeColor : awayColor
                const p = e.playerId ? players[e.playerId] : undefined
                const pName = playerName(p, e.playerId ?? '')
                const margin = e.homeTotal - e.awayTotal
                const marginStr = margin === 0 ? '=' : margin > 0 ? `+${margin}` : String(margin)

                return (
                  <div
                    key={i}
                    className={[
                      'flex items-center gap-2 text-[11px] py-0.5 px-1.5 rounded',
                      e.type === 'goal' ? 'bg-orange-500/8' : 'bg-transparent',
                    ].join(' ')}
                  >
                    <span className="text-muted-foreground w-14 shrink-0 tabular-nums text-[10px]">
                      Q{e.quarter} {String(Math.round(e.minute)).padStart(2, '0')}′
                    </span>
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="flex-1 min-w-0 truncate">
                      <span className="font-medium">{pName}</span>
                      {e.type === 'goal'
                        ? <span className="ml-1.5 font-semibold text-[10px]" style={{ color: '#f97316' }}>GOAL</span>
                        : <span className="ml-1.5 text-muted-foreground text-[10px]">behind</span>
                      }
                    </span>
                    <span className="text-[10px] tabular-nums text-right shrink-0 font-mono">
                      <span style={{ color: homeColor }}>{e.homeGoals}.{e.homeBehinds}</span>
                      <span className="text-muted-foreground mx-0.5">—</span>
                      <span style={{ color: awayColor }}>{e.awayGoals}.{e.awayBehinds}</span>
                      <span className="text-muted-foreground text-[9px] ml-1">({marginStr})</span>
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Running totals footer */}
            {scoringChain.length > 0 && (
              <div className="border-t border-border/40 pt-2 flex items-center justify-between text-[11px]">
                <span className="font-bold tabular-nums" style={{ color: homeColor }}>
                  {scoringChain[scoringChain.length - 1]?.homeGoals ?? 0}.
                  {scoringChain[scoringChain.length - 1]?.homeBehinds ?? 0}
                  {' '}({scoringChain[scoringChain.length - 1]?.homeTotal ?? 0})
                </span>
                <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Running Score</span>
                <span className="font-bold tabular-nums" style={{ color: awayColor }}>
                  {scoringChain[scoringChain.length - 1]?.awayGoals ?? 0}.
                  {scoringChain[scoringChain.length - 1]?.awayBehinds ?? 0}
                  {' '}({scoringChain[scoringChain.length - 1]?.awayTotal ?? 0})
                </span>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ PLAYERS TAB ══════════════ */}
        {tab === 'players' && (
          <div className="space-y-2">
            {/* Controls row */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Team filter */}
              <div className="flex items-center gap-1">
                {([
                  { id: 'all'  as const, label: 'All'    },
                  { id: 'home' as const, label: homeAbbr },
                  { id: 'away' as const, label: awayAbbr },
                ] satisfies { id: 'all' | 'home' | 'away'; label: string }[]).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPlayerTeam(id)}
                    className={[
                      'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                      playerTeam === id
                        ? 'border-transparent text-white'
                        : 'border-border/40 text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                    style={playerTeam === id
                      ? { backgroundColor: id === 'home' ? homeColor : id === 'away' ? awayColor : '#6b7280' }
                      : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Scope toggle */}
              <div className="flex items-center gap-1 ml-auto">
                {(['match', 'quarter'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPlayerScope(s)}
                    className={[
                      'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                      playerScope === s
                        ? 'bg-primary text-primary-foreground border-transparent'
                        : 'border-border/40 text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                  >
                    {s === 'match' ? 'Match' : `Q${quartersCompleted}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable table */}
            <div className="overflow-x-auto rounded border border-border/40">
              <table className="text-[10px] border-collapse" style={{ minWidth: '580px', width: '100%' }}>
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground bg-muted/20">
                    <th className="text-left py-1 px-2 font-medium sticky left-0 bg-muted/20 min-w-[120px]">Player</th>
                    {PLAYER_COLS.map((col) => (
                      <th
                        key={col.key}
                        className="text-right px-1.5 py-1 font-medium cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                        style={{ color: sortKey === col.key ? (col.color ?? 'hsl(var(--foreground))') : (col.color ?? undefined) }}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        <span className="ml-0.5 text-[9px]">
                          {sortKey === col.key ? (sortAsc ? '↑' : '↓') : ''}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { id: 'home' as const, label: homeAbbr, color: homeColor, stats: homePlayerStats },
                    { id: 'away' as const, label: awayAbbr, color: awayColor, stats: awayPlayerStats },
                  ]
                    .filter(({ id }) => playerTeam === 'all' || playerTeam === id)
                    .map(({ label, color, stats }) => {
                      const rows = sortStats(stats)
                      return (
                        <>
                          <tr key={label + '-hdr'}>
                            <td colSpan={16} className="pt-2 pb-0.5 px-2">
                              <div className="flex items-center gap-1.5">
                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</span>
                              </div>
                            </td>
                          </tr>
                          {rows.map(({ s, fp, sc }) => {
                            const p = players[s.playerId]
                            const name = playerName(p, s.playerId)
                            const pos = p?.position.primary ?? '?'
                            return (
                              <tr key={s.playerId} className="border-b border-border/20 hover:bg-muted/20">
                                <td className="py-0.5 px-2 sticky left-0 bg-card">
                                  <div className="flex items-center gap-1">
                                    <span
                                      className="shrink-0 text-[8px] px-0.5 border border-border/40 rounded text-muted-foreground"
                                      style={{ minWidth: '22px', textAlign: 'center' }}
                                    >{pos}</span>
                                    <span className="font-medium truncate">{name}</span>
                                  </div>
                                </td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'disposals' ? 'font-bold' : 'font-semibold'}`}>{s.disposals}</td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'kicks' ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{s.kicks}</td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'handballs' ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{s.handballs}</td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'marks' ? 'font-bold text-foreground' : ''}`}>{s.marks}</td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'tackles' ? 'font-bold text-foreground' : ''}`}>{s.tackles}</td>
                                <td
                                  className="text-right px-1.5 tabular-nums font-semibold"
                                  style={{ color: s.goals > 0 ? '#f97316' : undefined, fontWeight: sortKey === 'goals' ? 700 : undefined }}
                                >{s.goals}</td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'behinds' ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{s.behinds}</td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'hitouts' ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{s.hitouts || '—'}</td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'clearances' ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{s.clearances}</td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'insideFifties' ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{s.insideFifties}</td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'rebound50s' ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{s.rebound50s}</td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'contestedPossessions' ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{s.contestedPossessions}</td>
                                <td className={`text-right px-1.5 tabular-nums ${sortKey === 'turnovers' ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{s.turnovers}</td>
                                <td
                                  className="text-right px-1.5 tabular-nums font-semibold"
                                  style={{ color: '#f59e0b', fontWeight: sortKey === 'fp' ? 700 : undefined }}
                                >{fp}</td>
                                <td
                                  className="text-right px-1.5 tabular-nums font-semibold"
                                  style={{ color: '#60a5fa', fontWeight: sortKey === 'sc' ? 700 : undefined }}
                                >{sc}</td>
                              </tr>
                            )
                          })}
                        </>
                      )
                    })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground pt-1 border-t border-border/40">
              <span>D=disposals</span><span>K=kicks</span><span>HB=handballs</span>
              <span>M=marks</span><span>T=tackles</span><span>G=goals</span>
              <span>B=behinds</span><span>HO=hitouts</span><span>CL=clearances</span>
              <span>I50=inside50s</span><span>R50=rebound50s</span><span>CP=contested</span><span>TO=turnovers</span>
              <span className="text-amber-500">FP=AFL Fantasy (live)</span>
              <span className="text-blue-400">SC=SuperCoach (live est.)</span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
