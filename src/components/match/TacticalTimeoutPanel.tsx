import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import {
  AlertTriangle, Activity, Shield, Zap, UserPlus, Target,
  ArrowUp, ArrowDown, Minus, ChevronRight, Brain, SlidersHorizontal,
  BarChart2, TrendingUp, TrendingDown, Lightbulb, CheckCircle2,
} from 'lucide-react'
import { QuarterStatsSummary, type QuarterSnapshot } from '@/components/match/QuarterStatsSummary'
import type { Player } from '@/types/player'
import type {
  TacticalEvent, MidMatchDecision, QuarterInjury, MidMatchAdjustment,
  CoachSuggestion, GameplanSliders,
} from '@/types/matchEvent'
import type { MatchKeyEvent } from '@/types/match'

// ---------------------------------------------------------------------------
// Slider helpers
// ---------------------------------------------------------------------------

function gameplanToSliders(snapshot: TacticalTimeoutPanelProps['userGameplanSnapshot']): GameplanSliders {
  if (!snapshot) return { tempo: 50, corridorUse: 50, defensivePress: 62, stoppageSetup: 50 }
  const tempoMap: Record<string, number>  = { slow: 15, medium: 50, fast: 85 }
  const tacticMap: Record<string, number> = { spread: 15, balanced: 50, cluster: 85 }
  const defMap: Record<string, number>    = { zone: 10, run: 35, hold: 62, press: 85 }
  return {
    tempo:         tempoMap[snapshot.tempo]         ?? 50,
    corridorUse:   tacticMap[snapshot.centreTactic]  ?? 50,
    defensivePress: defMap[snapshot.defensiveLine]   ?? 62,
    stoppageSetup: tacticMap[snapshot.stoppageTactic] ?? 50,
  }
}

interface SliderImpact { label: string; positive: boolean }

function getTempoImpacts(v: number): SliderImpact[] {
  if (v <= 33) return [
    { label: '↑ Accuracy', positive: true },
    { label: '↓ Possessions', positive: false },
    { label: '↓ Energy burn', positive: true },
  ]
  if (v <= 66) return [{ label: 'Balanced pace', positive: true }]
  return [
    { label: '↑ Possessions', positive: true },
    { label: '↓ Accuracy', positive: false },
    { label: '↑ Energy burn', positive: false },
  ]
}

function getCorridorImpacts(v: number): SliderImpact[] {
  if (v <= 33) return [
    { label: '↑ Space & width', positive: true },
    { label: '↓ Inside 50 rate', positive: false },
  ]
  if (v <= 66) return [{ label: 'Balanced corridor', positive: true }]
  return [
    { label: '↑ Inside 50s', positive: true },
    { label: '↑ Contested load', positive: false },
  ]
}

function getPressImpacts(v: number): SliderImpact[] {
  if (v <= 25) return [
    { label: '↑ Intercepts', positive: true },
    { label: 'Zone coverage', positive: true },
    { label: '↓ Tackle pressure', positive: false },
  ]
  if (v <= 50) return [{ label: 'Runner coverage', positive: true }]
  if (v <= 75) return [
    { label: 'Structured line', positive: true },
    { label: '↑ Rebound prevention', positive: true },
  ]
  return [
    { label: '↑ Tackles', positive: true },
    { label: '↑ Turnovers forced', positive: true },
    { label: '↑ Injury risk', positive: false },
  ]
}

function getStoppageImpacts(v: number): SliderImpact[] {
  if (v <= 33) return [
    { label: '↑ Defensive security', positive: true },
    { label: '↓ Stoppage scoring', positive: false },
  ]
  if (v <= 66) return [{ label: 'Balanced stoppages', positive: true }]
  return [
    { label: '↑ Stoppage scoring', positive: true },
    { label: '↓ Defensive security', positive: false },
  ]
}

function sliderLabel(v: number, type: 'tempo' | 'corridor' | 'press' | 'stoppage'): string {
  if (type === 'tempo')    return v <= 33 ? 'Slow'   : v <= 66 ? 'Medium'   : 'Fast'
  if (type === 'corridor') return v <= 33 ? 'Wide'   : v <= 66 ? 'Balanced' : 'Corridor'
  if (type === 'press')    return v <= 25 ? 'Zone'   : v <= 50 ? 'Run'      : v <= 75 ? 'Hold' : 'Press'
  return v <= 33 ? 'Spread' : v <= 66 ? 'Balanced' : 'Cluster'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ImpactTag({ label, positive }: SliderImpact) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
      positive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
    }`}>
      {positive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {label}
    </span>
  )
}

function SliderRow({
  label, value, onChange, impacts, sliderLabel: labelStr,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  impacts: SliderImpact[]
  sliderLabel: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs font-semibold text-primary">{labelStr}</span>
      </div>
      <Slider
        min={0} max={100} step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="my-1"
      />
      <div className="flex flex-wrap gap-1">
        {impacts.map((imp) => (
          <ImpactTag key={imp.label} {...imp} />
        ))}
      </div>
    </div>
  )
}

const URGENCY_COLORS = {
  info:     'border-blue-500/40 bg-blue-500/10 text-blue-200',
  warning:  'border-amber-500/40 bg-amber-500/10 text-amber-200',
  critical: 'border-red-500/40 bg-red-500/10 text-red-200',
} as const

const PRIORITY_COLORS: Record<CoachSuggestion['priority'], string> = {
  critical: 'border-red-500/40 bg-red-500/10',
  major:    'border-amber-500/40 bg-amber-500/10',
  minor:    'border-border/60 bg-muted/30',
}
const PRIORITY_BADGE: Record<CoachSuggestion['priority'], string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  major:    'bg-amber-500/20 text-amber-300 border-amber-500/30',
  minor:    'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
}

// ---------------------------------------------------------------------------
// Matchup bar
// ---------------------------------------------------------------------------

function StatBar({
  label, home, away, homeAbbr, awayAbbr, homeColor, awayColor,
}: {
  label: string; home: number; away: number
  homeAbbr: string; awayAbbr: string
  homeColor: string; awayColor: string
}) {
  const total = home + away
  if (total === 0) return null
  const homePct = (home / total) * 100
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span className="font-medium">{home}</span>
        <span>{label}</span>
        <span className="font-medium">{away}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div style={{ width: `${homePct}%`, backgroundColor: homeColor }} className="transition-all" />
        <div style={{ width: `${100 - homePct}%`, backgroundColor: awayColor }} className="transition-all" />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/70">
        <span>{homeAbbr}</span><span>{awayAbbr}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Tab = 'situation' | 'gameplan' | 'matchup'

export interface TacticalTimeoutPanelProps {
  quarter: number
  keyEvents: MatchKeyEvent[]
  tacticalEvents: TacticalEvent[]
  decisions: MidMatchDecision[]
  injuries: QuarterInjury[]
  adjustmentsMade: MidMatchAdjustment[]
  subAvailable: boolean
  subActivated: boolean
  coachSuggestions: CoachSuggestion[]
  userGameplanSnapshot: {
    tempo: 'fast' | 'medium' | 'slow'
    centreTactic: 'spread' | 'balanced' | 'cluster'
    defensiveLine: 'press' | 'zone' | 'hold' | 'run'
    stoppageTactic: 'spread' | 'balanced' | 'cluster'
  } | null
  snapshots: QuarterSnapshot[]
  players: Record<string, Player>
  homeClubId: string
  awayClubId: string
  homeColor: string
  awayColor: string
  homeAbbr: string
  awayAbbr: string
  homeQScore?: { goals: number; behinds: number; total: number }
  awayQScore?: { goals: number; behinds: number; total: number }
  onDecision: (d: MidMatchDecision) => void
  onApplySliders: (s: GameplanSliders) => void
  onContinue: () => void
  quartersPerMatch: number
}

export function TacticalTimeoutPanel({
  quarter, keyEvents, tacticalEvents, decisions, injuries, adjustmentsMade,
  subActivated, coachSuggestions, userGameplanSnapshot,
  snapshots, players, homeClubId, awayClubId, homeColor, awayColor,
  homeAbbr, awayAbbr, homeQScore, awayQScore,
  onDecision, onApplySliders, onContinue, quartersPerMatch,
}: TacticalTimeoutPanelProps) {
  // Default to Situation if there are critical events, otherwise Gameplan
  const hasWarning = injuries.length > 0 || tacticalEvents.some((e) => e.type !== 'quarter-break' && e.urgency !== 'info')
  const [tab, setTab] = useState<Tab>(hasWarning ? 'situation' : 'gameplan')

  const [sliders, setSliders] = useState<GameplanSliders>(() => gameplanToSliders(userGameplanSnapshot))
  const [slidersApplied, setSlidersApplied] = useState(false)

  const setSlider = (key: keyof GameplanSliders) => (v: number) => {
    setSliders((prev) => ({ ...prev, [key]: v }))
    setSlidersApplied(false)
  }

  // Decisions split
  const presets = decisions.filter((d) => ['protect-lead', 'chase-game', 'stay-course'].includes(d.type))
  const subOption = decisions.find((d) => d.type === 'activate-sub')
  const tagOptions = decisions.filter((d) => d.type === 'tag-switch')
  const moveOptions = decisions.filter((d) => d.type === 'move-player-forward' || d.type === 'move-player-back')

  const moveByPlayer = useMemo(() => {
    const map = new Map<string, { fwd?: MidMatchDecision; back?: MidMatchDecision; name: string }>()
    for (const d of moveOptions) {
      const pid = d.params?.movePlayerId ?? ''
      const entry = map.get(pid) ?? { name: d.label.replace(/ Forward$| Back$/, '') }
      if (d.type === 'move-player-forward') entry.fwd = d
      else entry.back = d
      map.set(pid, entry)
    }
    return map
  }, [moveOptions])

  // Matchup stats from latest snapshot
  const latestSnap = snapshots[snapshots.length - 1]
  const matchupStats = useMemo(() => {
    if (!latestSnap) return null
    const sum = (arr: typeof latestSnap.home, key: keyof typeof arr[0]) =>
      arr.reduce((t, s) => t + (s[key] as number), 0)
    return {
      disposals:   { home: sum(latestSnap.home, 'disposals'),           away: sum(latestSnap.away, 'disposals') },
      inside50:    { home: sum(latestSnap.home, 'insideFifties'),        away: sum(latestSnap.away, 'insideFifties') },
      clearances:  { home: sum(latestSnap.home, 'clearances'),           away: sum(latestSnap.away, 'clearances') },
      contested:   { home: sum(latestSnap.home, 'contestedPossessions'), away: sum(latestSnap.away, 'contestedPossessions') },
      marks:       { home: sum(latestSnap.home, 'marks'),                away: sum(latestSnap.away, 'marks') },
      tackles:     { home: sum(latestSnap.home, 'tackles'),              away: sum(latestSnap.away, 'tackles') },
      goals:       { home: sum(latestSnap.home, 'goals'),                away: sum(latestSnap.away, 'goals') },
    }
  }, [latestSnap])

  // Q goals log
  const qGoals = keyEvents.filter((e) => e.type === 'goal' && e.quarter === quarter)

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'situation', label: 'Situation', icon: Brain },
    { id: 'gameplan',  label: 'Gameplan',  icon: SlidersHorizontal },
    { id: 'matchup',   label: 'Matchup',   icon: BarChart2 },
  ]

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {id === 'situation' && (injuries.length > 0 || coachSuggestions.some((s) => s.priority === 'critical')) && (
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            )}
          </button>
        ))}
      </div>

      {/* ── SITUATION TAB ─────────────────────────────────────────── */}
      {tab === 'situation' && (
        <div className="space-y-3">
          {/* Injuries */}
          {injuries.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Injury Report</p>
              {injuries.map((inj) => (
                <div
                  key={`${inj.playerId}-${inj.quarter}`}
                  className="flex items-center gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-semibold">{inj.playerName}</span>{' '}
                    — {inj.injuryType} ({inj.weeksOut}w, {inj.severity})
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Tactical alerts */}
          {tacticalEvents.filter((e) => e.type !== 'quarter-break').length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Match Alerts</p>
              {tacticalEvents.filter((e) => e.type !== 'quarter-break').map((evt) => (
                <div
                  key={evt.id}
                  className={`flex items-start gap-2 rounded border px-3 py-2 text-sm ${URGENCY_COLORS[evt.urgency]}`}
                >
                  <Activity className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{evt.title}</span>
                      <Badge className={`text-[10px] ${evt.urgency === 'warning' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'}`}>
                        {evt.urgency}
                      </Badge>
                    </div>
                    <p className="text-xs opacity-80 mt-0.5">{evt.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Coach suggestions */}
          {coachSuggestions.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-yellow-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assistant Coach</p>
              </div>
              {coachSuggestions.map((s) => (
                <div
                  key={s.id}
                  className={`rounded border px-3 py-2.5 space-y-1 ${PRIORITY_COLORS[s.priority]}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{s.title}</span>
                    <Badge className={`text-[10px] ${PRIORITY_BADGE[s.priority]}`}>{s.priority}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                  {s.suggestedAction && (
                    <p className="text-xs text-primary/80 italic">
                      💡 {s.suggestedAction}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Q goals log */}
          {qGoals.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Q{quarter} Goals</p>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {qGoals.map((e, i) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    {e.minute}' — {e.description}
                  </div>
                ))}
              </div>
            </div>
          )}

          {coachSuggestions.length === 0 && injuries.length === 0 && tacticalEvents.filter((e) => e.type !== 'quarter-break').length === 0 && (
            <div className="flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Game plan is working well — no major concerns.
            </div>
          )}
        </div>
      )}

      {/* ── GAMEPLAN TAB ──────────────────────────────────────────── */}
      {tab === 'gameplan' && (
        <div className="space-y-4">
          {/* Sliders */}
          <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Gameplan Sliders
            </p>
            <SliderRow
              label="Tempo"
              value={sliders.tempo}
              onChange={setSlider('tempo')}
              impacts={getTempoImpacts(sliders.tempo)}
              sliderLabel={sliderLabel(sliders.tempo, 'tempo')}
            />
            <SliderRow
              label="Corridor Use"
              value={sliders.corridorUse}
              onChange={setSlider('corridorUse')}
              impacts={getCorridorImpacts(sliders.corridorUse)}
              sliderLabel={sliderLabel(sliders.corridorUse, 'corridor')}
            />
            <SliderRow
              label="Defensive Press"
              value={sliders.defensivePress}
              onChange={setSlider('defensivePress')}
              impacts={getPressImpacts(sliders.defensivePress)}
              sliderLabel={sliderLabel(sliders.defensivePress, 'press')}
            />
            <SliderRow
              label="Stoppage Setup"
              value={sliders.stoppageSetup}
              onChange={setSlider('stoppageSetup')}
              impacts={getStoppageImpacts(sliders.stoppageSetup)}
              sliderLabel={sliderLabel(sliders.stoppageSetup, 'stoppage')}
            />
            <Button
              size="sm"
              className="w-full gap-1.5"
              variant={slidersApplied ? 'secondary' : 'default'}
              onClick={() => { onApplySliders(sliders); setSlidersApplied(true) }}
            >
              {slidersApplied
                ? <><CheckCircle2 className="h-3.5 w-3.5" /> Gameplan Applied</>
                : <><SlidersHorizontal className="h-3.5 w-3.5" /> Apply Gameplan</>
              }
            </Button>
          </div>

          {/* Quick presets */}
          {presets.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Presets</p>
              <div className="flex flex-wrap gap-2">
                {presets.map((d) => (
                  <Button
                    key={d.id}
                    variant={d.type === 'protect-lead' ? 'secondary' : d.type === 'chase-game' ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={() => onDecision(d)}
                    className="gap-1"
                  >
                    {d.type === 'protect-lead' && <Shield className="h-3.5 w-3.5" />}
                    {d.type === 'chase-game'   && <Zap    className="h-3.5 w-3.5" />}
                    {d.type === 'stay-course'  && <Minus  className="h-3.5 w-3.5" />}
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Substitute */}
          {subOption && !subActivated && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Substitute</p>
              <Button variant="secondary" size="sm" onClick={() => onDecision(subOption)} className="gap-1">
                <UserPlus className="h-3.5 w-3.5" />
                {subOption.label}
              </Button>
            </div>
          )}

          {/* Tag switches */}
          {tagOptions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tag Assignment</p>
              <div className="flex flex-wrap gap-2">
                {tagOptions.map((d) => (
                  <Button key={d.id} variant="outline" size="sm" onClick={() => onDecision(d)} className="gap-1">
                    <Target className="h-3.5 w-3.5" />
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Move players */}
          {moveByPlayer.size > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Move Player</p>
              <div className="space-y-1">
                {[...moveByPlayer.entries()].map(([pid, info]) => (
                  <div key={pid} className="flex items-center gap-2 text-xs">
                    <span className="w-32 truncate font-medium">{info.name}</span>
                    {info.fwd && (
                      <Button variant="outline" size="sm" onClick={() => onDecision(info.fwd!)} className="h-7 gap-1 px-2 text-xs">
                        <ArrowUp className="h-3 w-3" /> Fwd
                      </Button>
                    )}
                    {info.back && (
                      <Button variant="outline" size="sm" onClick={() => onDecision(info.back!)} className="h-7 gap-1 px-2 text-xs">
                        <ArrowDown className="h-3 w-3" /> Back
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Adjustments log */}
          {adjustmentsMade.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Changes Made</p>
              <div className="space-y-1">
                {adjustmentsMade.map((adj, i) => (
                  <div key={i} className="rounded border border-border/50 px-2 py-1 text-xs text-muted-foreground">
                    Q{adj.quarter}: {adj.description}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MATCHUP TAB ───────────────────────────────────────────── */}
      {tab === 'matchup' && (
        <div className="space-y-4">
          {matchupStats ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Season Stats (Accumulated)
              </p>
              {([
                { key: 'disposals',  label: 'Disposals' },
                { key: 'inside50',   label: 'Inside 50s' },
                { key: 'clearances', label: 'Clearances' },
                { key: 'contested',  label: 'Contested Poss.' },
                { key: 'marks',      label: 'Marks' },
                { key: 'tackles',    label: 'Tackles' },
                { key: 'goals',      label: 'Goals' },
              ] as const).map(({ key, label }) => (
                <StatBar
                  key={key}
                  label={label}
                  home={matchupStats[key].home}
                  away={matchupStats[key].away}
                  homeAbbr={homeAbbr}
                  awayAbbr={awayAbbr}
                  homeColor={homeColor}
                  awayColor={awayColor}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Stats will appear after each quarter.</p>
          )}

          {/* Per-quarter stats */}
          <QuarterStatsSummary
            snapshots={snapshots}
            quarterNumber={quarter}
            players={players}
            homeClubId={homeClubId}
            awayClubId={awayClubId}
            homeColor={homeColor}
            awayColor={awayColor}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
            homeQScore={homeQScore}
            awayQScore={awayQScore}
          />
        </div>
      )}

      {/* Continue button */}
      <div className="flex justify-end pt-1">
        <Button onClick={onContinue} className="gap-2">
          <ChevronRight className="h-4 w-4" />
          {quarter < quartersPerMatch ? `Continue to Q${quarter + 1}` : 'See Final Result'}
        </Button>
      </div>
    </div>
  )
}
