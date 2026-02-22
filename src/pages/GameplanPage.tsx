import { useMemo, useState, Fragment, useCallback, useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Check, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { RotationEvent } from '@/types/game'
import type { ClubGameplan, PlayStyleRules } from '@/types/club'
import { DEFAULT_PLAY_STYLE } from '@/engine/gameplan/defaults'
import type { Player } from '@/types/player'
import { applyGameplanAdjustment } from '@/engine/coaching/tacticalAdjustments'
import { createDefaultGameplan } from '@/engine/gameplan/defaults'

// ── Constants ────────────────────────────────────────────────────────────────

// ── Impact chips ─────────────────────────────────────────────────────────────

const STYLE_IMPACTS = {
  offensiveStyle: {
    attacking: { pros: ['↑ Inside 50s', '↑ Scoring chances'], cons: ['↑ Counter risk'] },
    balanced:  { pros: [] as string[], cons: [] as string[] },
    defensive: { pros: ['↑ Rebound defence'], cons: ['↓ Scoring output'] },
  },
  tempo: {
    fast:   { pros: ['↑ Possessions per quarter'], cons: ['↓ Disposal accuracy', '↑ Fatigue'] },
    medium: { pros: [] as string[], cons: [] as string[] },
    slow:   { pros: ['↑ Disposal accuracy'], cons: ['↓ Possessions'] },
  },
  aggression: {
    high:   { pros: ['↑ Contested ball', '↑ Tackles'], cons: ['↑ Injury risk'] },
    medium: { pros: [] as string[], cons: [] as string[] },
    low:    { pros: ['↓ Fatigue accumulation'], cons: ['↓ Contested wins'] },
  },
  defensiveLine: {
    press: { pros: ['↑ Tackles', '↑ Intercepts'], cons: ['↑ Counter-attack risk'] },
    hold:  { pros: ['↑ Defensive shape'], cons: [] as string[] },
    run:   { pros: ['↑ Rebound drive', '↑ Handball chains'], cons: ['↓ Defensive cover'] },
    zone:  { pros: ['↓ Goals against'], cons: ['↓ Tackle count'] },
  },
  midfieldLine: {
    press: { pros: ['↑ Clearances', '↑ Possessions'], cons: ['↑ Fatigue'] },
    hold:  { pros: ['↑ Ground ball wins'], cons: [] as string[] },
    run:   { pros: ['↑ Run & carry'], cons: ['↓ Defensive shape'] },
    zone:  { pros: ['↑ Intercepts'], cons: ['↓ Clearances'] },
  },
  forwardLine: {
    press: { pros: ['↑ Contested marks', '↑ F50 pressure'], cons: ['↑ Work rate'] },
    hold:  { pros: ['↑ Lead quality', '↑ Set shot accuracy'], cons: [] as string[] },
    run:   { pros: ['↑ Uncontested marks', '↑ Open space'], cons: [] as string[] },
    zone:  { pros: ['↑ Crumbing', '↑ Second efforts'], cons: ['↓ Lead patterns'] },
  },
  kickInTactic: {
    'play-on-short': { pros: ['↑ Quick restart'], cons: ['↓ Forward entry'] },
    'play-on-long':  { pros: ['↑ Inside 50 entry'], cons: ['↓ Accuracy'] },
    'set-up-short':  { pros: ['↑ Possession security'], cons: ['↓ Speed of play'] },
    'set-up-long':   { pros: ['↑ Structure', '↑ Forward setup'], cons: ['↓ Tempo'] },
  },
  centreTactic: {
    spread:   { pros: ['↑ Uncontested marks'], cons: ['↓ Contest wins'] },
    cluster:  { pros: ['↑ Contest wins', '↑ Clearances'], cons: ['↓ Open space'] },
    balanced: { pros: [] as string[], cons: [] as string[] },
  },
  stoppageTactic: {
    spread:   { pros: ['↑ Width', '↑ Uncontested'], cons: ['↓ Contest wins'] },
    cluster:  { pros: ['↑ Contest wins', '↑ Tackles'], cons: ['↓ Open space'] },
    balanced: { pros: [] as string[], cons: [] as string[] },
  },
  rotations: {
    high:   { pros: ['↑ Late-game energy', '↑ Fitness'], cons: ['↓ Structural consistency'] },
    medium: { pros: [] as string[], cons: [] as string[] },
    low:    { pros: ['↑ Structural consistency'], cons: ['↓ Late-game fitness'] },
  },
}

const KH_OPTIONS: { value: number; label: string; desc: string }[] = [
  { value: 0.5,  label: '0.5:1',  desc: 'Handball heavy' },
  { value: 0.75, label: '0.75:1', desc: 'Handball-first' },
  { value: 1.0,  label: '1.0:1',  desc: 'Equal' },
  { value: 1.25, label: '1.25:1', desc: 'Slight kick' },
  { value: 1.5,  label: '1.5:1',  desc: 'Balanced' },
  { value: 2.0,  label: '2.0:1',  desc: 'Kick dominant' },
  { value: 2.5,  label: '2.5:1',  desc: 'Kick-first' },
  { value: 3.0,  label: '3.0:1',  desc: 'Extreme kick' },
]

// ── OptionButton ──────────────────────────────────────────────────────────────

interface OptionButtonProps {
  label: string
  desc: string
  pros: string[]
  cons: string[]
  selected: boolean
  onClick: () => void
  compact?: boolean
}

function OptionButton({ label, desc, pros, cons, selected, onClick, compact = false }: OptionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={[
        'group flex-1 min-w-0 text-left rounded-lg border transition-all',
        compact ? 'p-2' : 'p-3',
        selected
          ? 'ring-2 ring-primary border-primary bg-primary/5'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30',
      ].join(' ')}
    >
      <div className={['font-semibold', compact ? 'text-xs' : 'text-sm'].join(' ')}>{label}</div>
      <div className={['text-muted-foreground mt-0.5 leading-snug', compact ? 'text-[10px]' : 'text-xs'].join(' ')}>{desc}</div>
      {(pros.length > 0 || cons.length > 0) && (
        <div className="hidden group-hover:flex gap-1 flex-wrap mt-1.5">
          {pros.map((p) => (
            <span key={p} className="text-[10px] leading-none text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5">
              {p}
            </span>
          ))}
          {cons.map((c) => (
            <span key={c} className="text-[10px] leading-none text-red-600 dark:text-red-400 bg-red-500/10 rounded px-1.5 py-0.5">
              {c}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function GameplanPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const season = useGameStore((s) => s.season)
  const currentRound = useGameStore((s) => s.currentRound)
  const weeklyGameplans = useGameStore((s) => s.weeklyGameplans)
  const updateGameplan = useGameStore((s) => s.updateGameplan)
  const updateWeeklyGameplanAdjustment = useGameStore((s) => s.updateWeeklyGameplanAdjustment)
  const clearWeeklyGameplanAdjustment = useGameStore((s) => s.clearWeeklyGameplanAdjustment)
  const generateWeeklyCounterGameplanForUser = useGameStore((s) => s.generateWeeklyCounterGameplanForUser)
  const matchResults = useGameStore((s) => s.matchResults)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const setRotationPlan = useGameStore((s) => s.setRotationPlan)

  const club = clubs[playerClubId]
  const gameplan = club?.gameplan ?? createDefaultGameplan()

  const round = season.rounds[currentRound]
  const userFixture = round?.fixtures.find(
    (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  )
  const opponentClubId = userFixture
    ? userFixture.homeClubId === playerClubId ? userFixture.awayClubId : userFixture.homeClubId
    : null
  const opponent = opponentClubId ? clubs[opponentClubId] : null

  const weeklyEntry = weeklyGameplans[playerClubId]
  const weeklyOverrides =
    weeklyEntry && weeklyEntry.round === currentRound ? weeklyEntry.overrides : null
  const weeklyGameplan = useMemo(
    () => applyGameplanAdjustment(gameplan, weeklyOverrides),
    [gameplan, weeklyOverrides],
  )
  const [editWeekly, setEditWeekly] = useState(Boolean(weeklyOverrides))
  const [activeTab, setActiveTab] = useState<'core' | 'lines' | 'ruck' | 'rotations' | 'advanced'>('core')
  const activePlan = editWeekly ? weeklyGameplan : gameplan

  const updatePlan = (updates: Partial<ClubGameplan>) => {
    if (editWeekly) {
      updateWeeklyGameplanAdjustment(updates)
    } else {
      updateGameplan(updates)
    }
  }

  const clubPlayers = Object.values(players).filter((p: Player) => p.clubId === playerClubId)
  const ruckmen = clubPlayers.filter((p: Player) => p.position.primary === 'RK')

  const last5KH = useMemo(() => {
    const clubMatches = matchResults
      .filter((m) => m.result && (m.homeClubId === playerClubId || m.awayClubId === playerClubId))
      .slice(-5)
    if (clubMatches.length === 0) return null
    let totalKicks = 0
    let totalHandballs = 0
    for (const m of clubMatches) {
      const stats = m.homeClubId === playerClubId ? m.result!.homePlayerStats : m.result!.awayPlayerStats
      for (const s of stats) {
        totalKicks += s.kicks
        totalHandballs += s.handballs
      }
    }
    if (totalHandballs === 0) return null
    return { kicks: totalKicks, handballs: totalHandballs, ratio: totalKicks / totalHandballs, games: clubMatches.length }
  }, [matchResults, playerClubId])

  const ps: PlayStyleRules = { ...DEFAULT_PLAY_STYLE, ...activePlan.playStyle }
  const updatePS = (patch: Partial<PlayStyleRules>) =>
    updatePlan({ playStyle: { ...ps, ...patch } })

  // ── Rotation planner ───────────────────────────────────────────────────────
  const lineup: Record<string, string> = selectedLineup ?? {}
  const [rotationPlanLocal, setRotationPlanLocal] = useState<RotationEvent[]>(
    () => weeklyEntry?.rotationPlan ?? [],
  )
  const rotationDidMountRef = useRef(false)
  const [activeQtr, setActiveQtr] = useState<1 | 2 | 3 | 4>(1)
  const [addingRotation, setAddingRotation] = useState(false)
  const [newMinute, setNewMinute] = useState(5)
  const [newPlayerOffId, setNewPlayerOffId] = useState('')
  const [newPlayerOnId, setNewPlayerOnId] = useState('')

  useEffect(() => {
    if (!rotationDidMountRef.current) {
      rotationDidMountRef.current = true
      return
    }
    setRotationPlan(rotationPlanLocal)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationPlanLocal])

  const activeQtrRotations = useMemo(
    () => rotationPlanLocal.filter((e) => e.quarter === activeQtr).sort((a, b) => a.minute - b.minute),
    [rotationPlanLocal, activeQtr],
  )

  const alreadyScheduledOnIds = useMemo(
    () => new Set(rotationPlanLocal.filter((e) => e.quarter === activeQtr).map((e) => e.playerOnId)),
    [rotationPlanLocal, activeQtr],
  )

  const handleAddRotation = useCallback(() => {
    if (!newPlayerOffId || !newPlayerOnId) return
    const event: RotationEvent = {
      id: crypto.randomUUID(),
      quarter: activeQtr,
      minute: newMinute,
      playerOffId: newPlayerOffId,
      playerOnId: newPlayerOnId,
    }
    setRotationPlanLocal((prev) => [...prev, event])
    setAddingRotation(false)
    setNewPlayerOffId('')
    setNewPlayerOnId('')
  }, [activeQtr, newMinute, newPlayerOffId, newPlayerOnId])

  const handleRemoveRotation = useCallback((id: string) => {
    setRotationPlanLocal((prev) => prev.filter((e) => e.id !== id))
  }, [])
  // ── End rotation planner ───────────────────────────────────────────────────

  const lineOptions = ['press', 'hold', 'run', 'zone'] as const
  type LineTactic = typeof lineOptions[number]
  const lineRows: { key: string; label: string; field: 'defensiveLine' | 'midfieldLine' | 'forwardLine' }[] = [
    { key: 'def', label: 'Defence',  field: 'defensiveLine' },
    { key: 'mid', label: 'Midfield', field: 'midfieldLine' },
    { key: 'fwd', label: 'Forward',  field: 'forwardLine' },
  ]

  return (
    <div className="space-y-6 pb-8">

      {/* ── 1. Header + Mode Toggle ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{club?.name} — Gameplan</h1>
          <p className="text-sm text-muted-foreground">
            {editWeekly
              ? weeklyOverrides
                ? `Weekly override active · Round ${currentRound + 1} vs ${opponent?.name}`
                : `Editing weekly plan · Round ${currentRound + 1} vs ${opponent?.name}`
              : 'Season base plan — applies to all rounds unless overridden'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              onClick={() => setEditWeekly(false)}
              className={[
                'px-3 py-1.5 font-medium transition-colors',
                !editWeekly
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              ].join(' ')}
            >
              Season Base
            </button>
            <button
              onClick={() => { if (opponent) setEditWeekly(true) }}
              disabled={!opponent}
              className={[
                'px-3 py-1.5 font-medium border-l border-border transition-colors',
                editWeekly
                  ? 'bg-primary text-primary-foreground'
                  : opponent
                    ? 'bg-background text-muted-foreground hover:bg-muted'
                    : 'bg-background text-muted-foreground/40 cursor-not-allowed',
              ].join(' ')}
            >
              {opponent ? `Rd ${currentRound + 1} vs ${opponent.name}` : 'No fixture'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab nav ──────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-border -mb-4">
        {(
          [
            { value: 'core',      label: 'Core Style' },
            { value: 'lines',     label: 'Lines & Set Pieces' },
            { value: 'ruck',      label: 'Ruck' },
            { value: 'rotations', label: 'Rotations' },
            { value: 'advanced',  label: 'Advanced' },
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div>

        {/* ── Opponent Intel Card — visible on all tabs in weekly mode ─────── */}
        {editWeekly && opponent && (
          <div className="mt-3 rounded-lg border bg-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: opponent.colors?.primary ?? '#666' }}
                />
                <span className="font-semibold text-sm truncate">{opponent.fullName ?? opponent.name}</span>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Round {currentRound + 1}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => { generateWeeklyCounterGameplanForUser(); setEditWeekly(true) }}
                >
                  Auto Counter
                </Button>
                {weeklyOverrides && (
                  <button
                    onClick={() => { clearWeeklyGameplanAdjustment(); setEditWeekly(false) }}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Two-column body */}
            <div className="grid grid-cols-2 divide-x text-sm">
              {/* Core style */}
              <div className="px-4 py-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Core Style</p>
                <div className="space-y-2">
                  {[
                    { label: 'Attack',     val: opponent.gameplan.offensiveStyle },
                    { label: 'Tempo',      val: opponent.gameplan.tempo },
                    { label: 'Aggression', val: opponent.gameplan.aggression },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <span className="rounded border border-border px-2 py-0.5 text-xs font-medium capitalize">
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Line tactics */}
              <div className="px-4 py-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Line Tactics</p>
                <div className="space-y-2">
                  {[
                    { label: 'Defence',  val: opponent.gameplan.defensiveLine },
                    { label: 'Midfield', val: opponent.gameplan.midfieldLine },
                    { label: 'Forward',  val: opponent.gameplan.forwardLine },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <span className="rounded border border-border px-2 py-0.5 text-xs font-medium capitalize">
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Core Style ────────────────────────────────────────────────── */}
        {activeTab === 'core' && <div className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">

              {/* Offensive Style */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Offensive Style</p>
                <div className="flex gap-2">
                  <OptionButton
                    label="Attacking"
                    desc="Push numbers forward, high risk/reward"
                    pros={STYLE_IMPACTS.offensiveStyle.attacking.pros}
                    cons={STYLE_IMPACTS.offensiveStyle.attacking.cons}
                    selected={activePlan.offensiveStyle === 'attacking'}
                    onClick={() => updatePlan({ offensiveStyle: 'attacking' })}
                  />
                  <OptionButton
                    label="Balanced"
                    desc="Measured, adaptable approach"
                    pros={STYLE_IMPACTS.offensiveStyle.balanced.pros}
                    cons={STYLE_IMPACTS.offensiveStyle.balanced.cons}
                    selected={activePlan.offensiveStyle === 'balanced'}
                    onClick={() => updatePlan({ offensiveStyle: 'balanced' })}
                  />
                  <OptionButton
                    label="Defensive"
                    desc="Protect the backline, counter-attack"
                    pros={STYLE_IMPACTS.offensiveStyle.defensive.pros}
                    cons={STYLE_IMPACTS.offensiveStyle.defensive.cons}
                    selected={activePlan.offensiveStyle === 'defensive'}
                    onClick={() => updatePlan({ offensiveStyle: 'defensive' })}
                  />
                </div>
              </div>

              {/* Tempo */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Tempo</p>
                <div className="flex gap-2">
                  <OptionButton
                    label="Fast"
                    desc="Quick ball movement, run and carry"
                    pros={STYLE_IMPACTS.tempo.fast.pros}
                    cons={STYLE_IMPACTS.tempo.fast.cons}
                    selected={activePlan.tempo === 'fast'}
                    onClick={() => updatePlan({ tempo: 'fast' })}
                  />
                  <OptionButton
                    label="Medium"
                    desc="Balanced tempo, situation-dependent"
                    pros={STYLE_IMPACTS.tempo.medium.pros}
                    cons={STYLE_IMPACTS.tempo.medium.cons}
                    selected={activePlan.tempo === 'medium'}
                    onClick={() => updatePlan({ tempo: 'medium' })}
                  />
                  <OptionButton
                    label="Slow"
                    desc="Methodical, control possession"
                    pros={STYLE_IMPACTS.tempo.slow.pros}
                    cons={STYLE_IMPACTS.tempo.slow.cons}
                    selected={activePlan.tempo === 'slow'}
                    onClick={() => updatePlan({ tempo: 'slow' })}
                  />
                </div>
              </div>

              {/* Aggression */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Aggression</p>
                <div className="flex gap-2">
                  <OptionButton
                    label="High"
                    desc="Hard at the contest, maximum pressure"
                    pros={STYLE_IMPACTS.aggression.high.pros}
                    cons={STYLE_IMPACTS.aggression.high.cons}
                    selected={activePlan.aggression === 'high'}
                    onClick={() => updatePlan({ aggression: 'high' })}
                  />
                  <OptionButton
                    label="Medium"
                    desc="Standard pressure and work rate"
                    pros={STYLE_IMPACTS.aggression.medium.pros}
                    cons={STYLE_IMPACTS.aggression.medium.cons}
                    selected={activePlan.aggression === 'medium'}
                    onClick={() => updatePlan({ aggression: 'medium' })}
                  />
                  <OptionButton
                    label="Low"
                    desc="Conserve energy, pick contests wisely"
                    pros={STYLE_IMPACTS.aggression.low.pros}
                    cons={STYLE_IMPACTS.aggression.low.cons}
                    selected={activePlan.aggression === 'low'}
                    onClick={() => updatePlan({ aggression: 'low' })}
                  />
                </div>
              </div>

              {/* Ball Distribution Style */}
              <div className="border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Ball Distribution Style</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  {/* Last 5 rounds indicator */}
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Last {last5KH?.games ?? 0} Rounds Avg K:H
                    </p>
                    {last5KH ? (
                      <>
                        <p className="text-2xl font-bold tabular-nums">{last5KH.ratio.toFixed(1)}:1</p>
                        <p className="text-xs text-muted-foreground">
                          {last5KH.kicks} kicks · {last5KH.handballs} handballs
                          {last5KH.ratio >= 2.0 ? ' — kick dominant' : last5KH.ratio <= 1.0 ? ' — handball heavy' : ' — balanced'}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No match data yet</p>
                    )}
                  </div>

                  {/* Target K:H button group */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Target K:H Ratio</p>
                    <div className="flex flex-wrap gap-1.5">
                      {KH_OPTIONS.map(({ value, label, desc }) => {
                        const currentKH = activePlan.targetKHRatio ?? 1.5
                        const isSelected = Math.abs(currentKH - value) < 0.01
                        return (
                          <button
                            key={value}
                            onClick={() => updatePlan({ targetKHRatio: value })}
                            title={desc}
                            className={[
                              'rounded border px-2 py-1.5 text-xs transition-all text-center',
                              isSelected
                                ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                                : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/30 hover:text-foreground',
                            ].join(' ')}
                          >
                            <div className="font-medium tabular-nums">{label}</div>
                            <div className="text-[9px] leading-none mt-0.5 opacity-70">{desc}</div>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Higher ratio = more kicks relative to handballs.
                    </p>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>
        </div>}

        {/* ── Tab: Lines & Set Pieces ────────────────────────────────────────── */}
        {activeTab === 'lines' && <div className="mt-4 space-y-4">

          {/* Card 1 — Line Tactics */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Line Tactics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[100px_1fr_1fr_1fr_1fr] gap-1.5">
                {/* Header row */}
                <div />
                {lineOptions.map((tactic) => (
                  <div
                    key={tactic}
                    className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide py-1 capitalize"
                  >
                    {tactic}
                  </div>
                ))}
                {/* Line rows: Defence, Midfield, Forward */}
                {lineRows.map((row) => (
                  <Fragment key={row.key}>
                    <div className="flex items-center text-sm font-medium pr-2">
                      {row.label}
                    </div>
                    {lineOptions.map((tactic) => {
                      const isSelected = (activePlan[row.field] as LineTactic) === tactic
                      return (
                        <button
                          key={`${row.key}-${tactic}`}
                          onClick={() => updatePlan({ [row.field]: tactic } as Partial<ClubGameplan>)}
                          className={[
                            isSelected
                              ? 'rounded-md border-2 border-primary bg-primary/10 text-primary font-semibold flex items-center justify-center gap-1 py-2.5 text-sm'
                              : 'rounded-md border border-border text-muted-foreground text-sm py-2.5 text-center hover:border-primary/40 hover:bg-muted/30 hover:text-foreground transition-all',
                          ].join(' ')}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                          {!isSelected && tactic}
                          {isSelected && tactic}
                        </button>
                      )
                    })}
                  </Fragment>
                ))}
              </div>

              {/* Description strip */}
              <div className="mt-3 rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {[
                    { label: 'Defence',  impacts: STYLE_IMPACTS.defensiveLine[activePlan.defensiveLine],  current: activePlan.defensiveLine },
                    { label: 'Midfield', impacts: STYLE_IMPACTS.midfieldLine[activePlan.midfieldLine],    current: activePlan.midfieldLine },
                    { label: 'Forward',  impacts: STYLE_IMPACTS.forwardLine[activePlan.forwardLine],      current: activePlan.forwardLine },
                  ].map(({ label, impacts, current }) => (
                    <span key={label}>
                      <span className="font-medium text-foreground">{label}: {current}</span>
                      {impacts.pros.length > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400"> · {impacts.pros.join(', ')}</span>
                      )}
                      {impacts.cons.length > 0 && (
                        <span className="text-red-500"> · {impacts.cons.join(', ')}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2 — Set Pieces */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Set Pieces</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Kick-In */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Kick-In</p>
                <div className="flex gap-2">
                  {(
                    [
                      { value: 'play-on-short', label: 'Play On Short', desc: 'Quick, short restart' },
                      { value: 'play-on-long',  label: 'Play On Long',  desc: 'Kick long immediately' },
                      { value: 'set-up-short',  label: 'Set Up Short',  desc: 'Structured short restart' },
                      { value: 'set-up-long',   label: 'Set Up Long',   desc: 'Structured long kick' },
                    ] as const
                  ).map(({ value, label, desc }) => (
                    <OptionButton
                      key={value}
                      label={label}
                      desc={desc}
                      pros={STYLE_IMPACTS.kickInTactic[value].pros}
                      cons={STYLE_IMPACTS.kickInTactic[value].cons}
                      selected={activePlan.kickInTactic === value}
                      onClick={() => updatePlan({ kickInTactic: value })}
                      compact
                    />
                  ))}
                </div>
              </div>

              {/* Centre Bounce */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Centre Bounce</p>
                <div className="flex gap-2">
                  {(
                    [
                      { value: 'spread',   label: 'Spread',   desc: 'Players wide, find space' },
                      { value: 'cluster',  label: 'Cluster',  desc: 'Numbers at the contest' },
                      { value: 'balanced', label: 'Balanced', desc: 'Mix of both approaches' },
                    ] as const
                  ).map(({ value, label, desc }) => (
                    <OptionButton
                      key={value}
                      label={label}
                      desc={desc}
                      pros={STYLE_IMPACTS.centreTactic[value].pros}
                      cons={STYLE_IMPACTS.centreTactic[value].cons}
                      selected={activePlan.centreTactic === value}
                      onClick={() => updatePlan({ centreTactic: value })}
                      compact
                    />
                  ))}
                </div>
              </div>

              {/* Stoppage */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Stoppage</p>
                <div className="flex gap-2">
                  {(
                    [
                      { value: 'spread',   label: 'Spread',   desc: 'Width and open space' },
                      { value: 'cluster',  label: 'Cluster',  desc: 'Flood the stoppage' },
                      { value: 'balanced', label: 'Balanced', desc: 'Situation dependent' },
                    ] as const
                  ).map(({ value, label, desc }) => (
                    <OptionButton
                      key={value}
                      label={label}
                      desc={desc}
                      pros={STYLE_IMPACTS.stoppageTactic[value].pros}
                      cons={STYLE_IMPACTS.stoppageTactic[value].cons}
                      selected={activePlan.stoppageTactic === value}
                      onClick={() => updatePlan({ stoppageTactic: value })}
                      compact
                    />
                  ))}
                </div>
              </div>

            </CardContent>
          </Card>

        </div>}

        {/* ── Tab: Ruck & Rotations ──────────────────────────────────────────── */}
        {activeTab === 'ruck' && <div className="mt-4 space-y-4">

          {/* Card 1 — Ruck Nomination */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ruck Nomination</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Ruck nomination */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ruck Selection</p>
                  <div>
                    <Label htmlFor="primary-ruck" className="text-xs">Primary Ruck</Label>
                    <Select
                      value={activePlan.ruckNomination.primaryRuckId ?? 'none'}
                      onValueChange={(v) =>
                        updatePlan({
                          ruckNomination: {
                            ...activePlan.ruckNomination,
                            primaryRuckId: v === 'none' ? null : v,
                          },
                        })
                      }
                    >
                      <SelectTrigger id="primary-ruck" className="mt-1">
                        <SelectValue placeholder="Select primary ruck" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Auto-select</SelectItem>
                        {ruckmen.map((p: Player) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.firstName} {p.lastName} — RK {p.position.ratings['RK'] ?? '—'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="backup-ruck" className="text-xs">Backup Ruck</Label>
                    <Select
                      value={activePlan.ruckNomination.backupRuckId ?? 'none'}
                      onValueChange={(v) =>
                        updatePlan({
                          ruckNomination: {
                            ...activePlan.ruckNomination,
                            backupRuckId: v === 'none' ? null : v,
                          },
                        })
                      }
                    >
                      <SelectTrigger id="backup-ruck" className="mt-1">
                        <SelectValue placeholder="Select backup ruck" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {ruckmen
                          .filter((p: Player) => p.id !== activePlan.ruckNomination.primaryRuckId)
                          .map((p: Player) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.firstName} {p.lastName} — RK {p.position.ratings['RK'] ?? '—'}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <Switch
                      id="around-ground"
                      checked={activePlan.ruckNomination.aroundTheGround}
                      onCheckedChange={(checked: boolean) =>
                        updatePlan({
                          ruckNomination: { ...activePlan.ruckNomination, aroundTheGround: checked },
                        })
                      }
                    />
                    <Label htmlFor="around-ground" className="text-xs cursor-pointer">
                      Around the Ground — ruck goes forward and back
                    </Label>
                  </div>
                </div>

                {/* Interchange rotations */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Interchange Rotations</p>
                  <div className="flex gap-2">
                    <OptionButton
                      label="High"
                      desc="Frequent rotations, keep legs fresh"
                      pros={STYLE_IMPACTS.rotations.high.pros}
                      cons={STYLE_IMPACTS.rotations.high.cons}
                      selected={activePlan.rotations === 'high'}
                      onClick={() => updatePlan({ rotations: 'high' })}
                      compact
                    />
                    <OptionButton
                      label="Medium"
                      desc="Standard rotation pattern"
                      pros={STYLE_IMPACTS.rotations.medium.pros}
                      cons={STYLE_IMPACTS.rotations.medium.cons}
                      selected={activePlan.rotations === 'medium'}
                      onClick={() => updatePlan({ rotations: 'medium' })}
                      compact
                    />
                    <OptionButton
                      label="Low"
                      desc="Minimal rotations, consistent structures"
                      pros={STYLE_IMPACTS.rotations.low.pros}
                      cons={STYLE_IMPACTS.rotations.low.cons}
                      selected={activePlan.rotations === 'low'}
                      onClick={() => updatePlan({ rotations: 'low' })}
                      compact
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>}

        {/* ── Tab: Rotations ─────────────────────────────────────────────────── */}
        {activeTab === 'rotations' && <div className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">Rotation Plan</CardTitle>
                {rotationPlanLocal.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {rotationPlanLocal.length} rotation{rotationPlanLocal.length !== 1 ? 's' : ''}
                  </Badge>
                )}
                {ruckmen.length === 0 && (
                  <p className="text-xs text-muted-foreground">No ruckmen found in your squad.</p>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">

              {/* Quarter tabs */}
              <div className="inline-flex rounded-md overflow-hidden border border-border/70">
                {([1, 2, 3, 4] as const).map((q, qi) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setActiveQtr(q)}
                    className={[
                      'h-7 px-3 text-xs font-medium transition-colors',
                      activeQtr === q
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      qi > 0 ? 'border-l border-border/70' : '',
                    ].join(' ')}
                  >
                    Q{q}
                  </button>
                ))}
              </div>

              {/* Rotation list */}
              <div className="space-y-1">
                {activeQtrRotations.length === 0 && !addingRotation && (
                  <p className="text-xs text-muted-foreground py-1">No rotations scheduled for Q{activeQtr}.</p>
                )}
                {activeQtrRotations.map((event) => {
                  const offPlayer = players[event.playerOffId]
                  const onPlayer = players[event.playerOnId]
                  const offSlot = Object.entries(lineup).find(([, id]) => id === event.playerOffId)?.[0]
                  const onSlot = Object.entries(lineup).find(([, id]) => id === event.playerOnId)?.[0]
                  const offLabel = offPlayer
                    ? `${offPlayer.firstName.charAt(0)}. ${offPlayer.lastName}${offSlot ? ` (${offSlot})` : ''}`
                    : event.playerOffId
                  const onLabel = onPlayer
                    ? `${onPlayer.firstName.charAt(0)}. ${onPlayer.lastName}${onSlot ? ` (${onSlot})` : ''}`
                    : event.playerOnId
                  return (
                    <div key={event.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs">
                      <span className="text-muted-foreground w-12 shrink-0">Min {event.minute}</span>
                      <span className="flex-1 truncate">{offLabel}</span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span className="flex-1 truncate">{onLabel}</span>
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => handleRemoveRotation(event.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}

                {addingRotation && (
                  <div className="rounded-md border border-border/60 bg-muted/20 p-2 space-y-2">
                    <div className="grid grid-cols-[80px_1fr_1fr] gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Minute</Label>
                        <Input
                          type="number"
                          min={1}
                          max={29}
                          value={newMinute}
                          onChange={(e) => setNewMinute(Math.max(1, Math.min(29, Number(e.target.value))))}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Ruck Off</Label>
                        <Select value={newPlayerOffId} onValueChange={setNewPlayerOffId}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {ruckmen.map((p: Player) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.firstName.charAt(0)}. {p.lastName} — RK {p.position.ratings['RK'] ?? '—'}
                              </SelectItem>
                            ))}
                            {ruckmen.length === 0 && (
                              <div className="px-2 py-1 text-xs text-muted-foreground">No rucks on list</div>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Ruck On</Label>
                        <Select value={newPlayerOnId} onValueChange={setNewPlayerOnId}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {ruckmen
                              .filter((p: Player) => p.id !== newPlayerOffId)
                              .map((p: Player) => (
                                <SelectItem key={p.id} value={p.id} disabled={alreadyScheduledOnIds.has(p.id)}>
                                  {p.firstName.charAt(0)}. {p.lastName} — RK {p.position.ratings['RK'] ?? '—'}
                                </SelectItem>
                              ))}
                            {ruckmen.length <= 1 && (
                              <div className="px-2 py-1 text-xs text-muted-foreground">No other rucks on list</div>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={handleAddRotation} disabled={!newPlayerOffId || !newPlayerOnId}>
                        Add
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => { setAddingRotation(false); setNewPlayerOffId(''); setNewPlayerOnId('') }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {!addingRotation && (
                <Button
                  size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setAddingRotation(true); setNewMinute(5); setNewPlayerOffId(''); setNewPlayerOnId('') }}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Rotation
                </Button>
              )}

            </CardContent>
          </Card>

        </div>}

        {/* ── Tab: Advanced ──────────────────────────────────────────────────── */}
        {activeTab === 'advanced' && <div className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Advanced Play Style</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">

                {/* Forward Leading */}
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Forward Leading Lanes</p>
                  <p className="text-xs text-muted-foreground">How your forwards set up and move to create scoring options</p>
                  <Select
                    value={ps.forwardLeading}
                    onValueChange={(v) => updatePS({ forwardLeading: v as PlayStyleRules['forwardLeading'] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="straight">Straight — Direct leads toward the ball carrier</SelectItem>
                      <SelectItem value="diagonal">Diagonal — Angled leads across the corridor</SelectItem>
                      <SelectItem value="hold-spread">Hold &amp; Spread — Hold position, spread wide for long ball</SelectItem>
                      <SelectItem value="rotate">Rotate — Constant rotation through the forward line</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {ps.forwardLeading === 'straight' && '+ More inside 50 entries. − Defenders can read the lead pattern.'}
                    {ps.forwardLeading === 'diagonal' && '+ Harder for defenders to read. + Better marking position.'}
                    {ps.forwardLeading === 'hold-spread' && '+ Better set-shot accuracy. − Fewer corridor options.'}
                    {ps.forwardLeading === 'rotate' && '+ Creates uncontested space. + Good for fast tempo teams.'}
                  </p>
                </div>

                {/* Tap Direction */}
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Tap Direction</p>
                  <p className="text-xs text-muted-foreground">Preferred ruck tap direction at centre bounces and ball-ups</p>
                  <Select
                    value={ps.tapDirection}
                    onValueChange={(v) => updatePS({ tapDirection: v as PlayStyleRules['tapDirection'] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="forward">Forward — Tap to advantage, direct entries</SelectItem>
                      <SelectItem value="backward">Backward — Tap back to midfielder in space</SelectItem>
                      <SelectItem value="read-and-react">Read &amp; React — Best available option</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {ps.tapDirection === 'forward' && '+ More direct forward entries. − Opponents can pre-position.'}
                    {ps.tapDirection === 'backward' && '+ Midfielder collects cleanly. − Slower to get ball forward.'}
                    {ps.tapDirection === 'read-and-react' && '+ Optimal decision each time. Best for dominant ruck units.'}
                  </p>
                </div>

                {/* Stoppage Movement */}
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Stoppage Movement</p>
                  <p className="text-xs text-muted-foreground">How players position around general play stoppages</p>
                  <Select
                    value={ps.stoppageMovement}
                    onValueChange={(v) => updatePS({ stoppageMovement: v as PlayStyleRules['stoppageMovement'] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flood-back">Flood Back — Defensive shape, numbers behind the ball</SelectItem>
                      <SelectItem value="push-forward">Push Forward — Attack the clearance, flood forward targets</SelectItem>
                      <SelectItem value="numbers">Numbers — Get extra bodies to the contest</SelectItem>
                      <SelectItem value="balanced">Balanced — Read the situation</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {ps.stoppageMovement === 'flood-back' && '+ Less exposed on turnovers. − Fewer forward options after clearance.'}
                    {ps.stoppageMovement === 'push-forward' && '+ More targets after clearance. − Exposed on defensive turnovers.'}
                    {ps.stoppageMovement === 'numbers' && '+ Win more contested ball. + More tackles at the contest.'}
                    {ps.stoppageMovement === 'balanced' && 'Situation-dependent movement. No major tradeoffs.'}
                  </p>
                </div>

                {/* Switch Frequency */}
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Switch Frequency</p>
                  <p className="text-xs text-muted-foreground">How often the team switches play to the wide or weak side</p>
                  <Select
                    value={ps.switchFrequency}
                    onValueChange={(v) => updatePS({ switchFrequency: v as PlayStyleRules['switchFrequency'] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="often">Often — Frequently move ball to open side</SelectItem>
                      <SelectItem value="normal">Normal — Switch when available</SelectItem>
                      <SelectItem value="rarely">Rarely — Direct corridor play</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {ps.switchFrequency === 'often' && '+ More uncontested possessions. + Better marking options. − Slower inside 50 entry.'}
                    {ps.switchFrequency === 'normal' && 'Balanced approach — switch when the opportunity arises.'}
                    {ps.switchFrequency === 'rarely' && '+ More inside 50 entries. − Congested corridors, more contested ball.'}
                  </p>
                </div>
              </div>

              {/* General Play Rules */}
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium">General Play Rules</p>
                <div className="flex items-start gap-3">
                  <Switch
                    id="no-uturns"
                    checked={ps.noUTurns}
                    onCheckedChange={(v) => updatePS({ noUTurns: v })}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor="no-uturns" className="text-sm font-medium">No U-Turns</Label>
                    <p className="text-xs text-muted-foreground">
                      Players maintain forward momentum — never stop and reverse direction when receiving. Creates cleaner disposal angles and reduces intercept risk.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Switch
                    id="handball-to-runner"
                    checked={ps.handbballToRunner}
                    onCheckedChange={(v) => updatePS({ handbballToRunner: v })}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor="handball-to-runner" className="text-sm font-medium">Handball to Player Running Past</Label>
                    <p className="text-xs text-muted-foreground">
                      Prefer handballing to a teammate in motion rather than a stationary target. Generates momentum, creates uncontested possession chains.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Switch
                    id="no-kick-back"
                    checked={ps.noKickBackAcrossGoal}
                    onCheckedChange={(v) => updatePS({ noKickBackAcrossGoal: v })}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor="no-kick-back" className="text-sm font-medium">No Kick Back Across Goal</Label>
                    <p className="text-xs text-muted-foreground">
                      Avoid kicking backward or across the face of goal in the forward 50. Reduces dangerous turnovers but slightly limits creative options.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>}

      </div>
    </div>
  )
}
