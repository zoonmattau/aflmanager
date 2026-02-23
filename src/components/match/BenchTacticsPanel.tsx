/**
 * BenchTacticsPanel — always-visible bottom panel during the PLAYING phase.
 *
 * Three tabs:
 *  - Bench & Rotations: queue on/off swaps for next quarter break
 *  - Gameplan: four sliders queued for next quarter
 *  - Match Stats: compact live team stat comparison
 */

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import type { MatchContext } from '@/engine/match/simulateMatch'
import type { MatchPlayerStats } from '@/types/match'
import type { Player } from '@/types/player'
import type { GameplanSliders } from '@/types/matchEvent'
import { ArrowLeftRight, X, ChevronUp, ChevronDown } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueuedRotation {
  onId: string
  offId: string
}

interface Props {
  ctx: MatchContext | null
  userIsHome: boolean
  userSlotLineup: Record<string, string>
  players: Record<string, Player>
  interchangeCount: number
  homeColor: string
  awayColor: string
  homeAbbr: string
  awayAbbr: string
  queuedRotations: QueuedRotation[]
  onQueueRotation: (onId: string, offId: string) => void
  onCancelRotation: (idx: number) => void
  pendingSliders: GameplanSliders | null
  onSlidersChange: (sliders: GameplanSliders) => void
  /** When true, hide collapse toggle and Match Stats tab; show Bench + Gameplan stacked. */
  embedded?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INTERCHANGE_SLOTS = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8']

function getDefaultSliders(ctx: MatchContext | null, userIsHome: boolean): GameplanSliders {
  const gp = userIsHome ? ctx?.resolvedHomeGameplan : ctx?.resolvedAwayGameplan
  const tempoMap: Record<string, number> = { fast: 80, medium: 50, slow: 20 }
  const pressMap: Record<string, number> = { press: 80, zone: 60, hold: 40, run: 20 }
  const centreMap: Record<string, number> = { cluster: 20, balanced: 50, spread: 80 }
  return {
    tempo: tempoMap[gp?.tempo ?? 'medium'] ?? 50,
    corridorUse: centreMap[gp?.centreTactic ?? 'balanced'] ?? 50,
    defensivePress: pressMap[gp?.defensiveLine ?? 'hold'] ?? 40,
    stoppageSetup: centreMap[gp?.stoppageTactic ?? 'balanced'] ?? 50,
  }
}

function sumKey(arr: MatchPlayerStats[], key: keyof MatchPlayerStats): number {
  return arr.reduce((s, p) => s + ((p[key] as number) || 0), 0)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BenchTacticsPanel({
  ctx,
  userIsHome,
  userSlotLineup,
  players,
  interchangeCount,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  queuedRotations,
  onQueueRotation,
  onCancelRotation,
  pendingSliders,
  onSlidersChange,
  embedded = false,
}: Props) {
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<'bench' | 'gameplan' | 'stats'>('bench')
  // ID of the bench player the coach has selected to send on
  const [subOnId, setSubOnId] = useState<string | null>(null)
  const [localSliders, setLocalSliders] = useState<GameplanSliders>(() => getDefaultSliders(ctx, userIsHome))

  const userColor = userIsHome ? homeColor : awayColor
  const oppColor = userIsHome ? awayColor : homeColor
  const userAbbr = userIsHome ? homeAbbr : awayAbbr
  const oppAbbr = userIsHome ? awayAbbr : homeAbbr

  // Players currently on the field according to MatchContext
  const activePlayerIds = useMemo(() => {
    const arr = userIsHome ? ctx?.homeActivePlayers : ctx?.awayActivePlayers
    return new Set((arr ?? []).map((p) => p.id))
  }, [ctx, userIsHome])

  // Projected on-field set after applying queued rotations
  const effectiveOnField = useMemo(() => {
    const ids = new Set(activePlayerIds)
    for (const r of queuedRotations) {
      ids.delete(r.offId)
      ids.add(r.onId)
    }
    return ids
  }, [activePlayerIds, queuedRotations])

  const onFieldPlayers = useMemo(
    () =>
      Array.from(effectiveOnField)
        .map((id) => players[id])
        .filter((p): p is Player => !!p)
        .sort((a, b) => a.position.primary.localeCompare(b.position.primary)),
    [effectiveOnField, players],
  )

  const benchPlayerIds = useMemo(
    () =>
      INTERCHANGE_SLOTS.slice(0, interchangeCount)
        .map((slot) => userSlotLineup[slot])
        .filter((id): id is string => !!id && !effectiveOnField.has(id)),
    [userSlotLineup, interchangeCount, effectiveOnField],
  )

  // Stat bars for the Match Stats tab
  const userStats = userIsHome ? (ctx?.homeStats ?? []) : (ctx?.awayStats ?? [])
  const oppStats = userIsHome ? (ctx?.awayStats ?? []) : (ctx?.homeStats ?? [])

  const statRows = [
    { label: 'Disposals',  u: sumKey(userStats, 'disposals'),     o: sumKey(oppStats, 'disposals') },
    { label: 'Goals',      u: sumKey(userStats, 'goals'),         o: sumKey(oppStats, 'goals') },
    { label: 'Inside 50s', u: sumKey(userStats, 'insideFifties'), o: sumKey(oppStats, 'insideFifties') },
    { label: 'Clearances', u: sumKey(userStats, 'clearances'),    o: sumKey(oppStats, 'clearances') },
    { label: 'Marks',      u: sumKey(userStats, 'marks'),         o: sumKey(oppStats, 'marks') },
    { label: 'Tackles',    u: sumKey(userStats, 'tackles'),       o: sumKey(oppStats, 'tackles') },
    { label: 'Contested',  u: sumKey(userStats, 'contestedPossessions'), o: sumKey(oppStats, 'contestedPossessions') },
    { label: 'Hitouts',    u: sumKey(userStats, 'hitouts'),       o: sumKey(oppStats, 'hitouts') },
  ]

  const SLIDERS = [
    { key: 'tempo'         as keyof GameplanSliders, label: 'Tempo',           lo: 'Slow',   hi: 'Fast'      },
    { key: 'corridorUse'   as keyof GameplanSliders, label: 'Corridor Use',    lo: 'Spread', hi: 'Cluster'   },
    { key: 'defensivePress'as keyof GameplanSliders, label: 'Defensive Press', lo: 'Zone',   hi: 'High Press' },
    { key: 'stoppageSetup' as keyof GameplanSliders, label: 'Stoppage Setup',  lo: 'Spread', hi: 'Cluster'   },
  ]

  const hasPendingChanges = queuedRotations.length > 0 || !!pendingSliders

  // In embedded mode, render Bench + Gameplan stacked with no chrome
  if (embedded) {
    return (
      <div className="space-y-4">
        {/* ── BENCH & ROTATIONS (embedded) ── */}
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bench & Rotations</div>
          <p className="text-[11px] text-muted-foreground">
            Queue rotations — they take effect at the next quarter break.
            {subOnId && (
              <span className="text-amber-500 font-medium"> Now click a player on the right to bring them off.</span>
            )}
          </p>

          {queuedRotations.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Queued Rotations</div>
              {queuedRotations.map((r, i) => {
                const onP = players[r.onId]
                const offP = players[r.offId]
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded border border-dashed border-primary/40 bg-primary/5 px-2 py-1 text-xs"
                  >
                    <span className="text-green-500 font-medium">
                      ↑ {onP ? `${onP.firstName[0]}. ${onP.lastName}` : r.onId}
                    </span>
                    <ArrowLeftRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="text-red-500 font-medium">
                      ↓ {offP ? `${offP.firstName[0]}. ${offP.lastName}` : r.offId}
                    </span>
                    <button
                      type="button"
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      onClick={() => onCancelRotation(i)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bench</div>
              {benchPlayerIds.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">All interchange players on field</p>
              ) : (
                benchPlayerIds.map((id) => {
                  const p = players[id]
                  if (!p) return null
                  const selected = subOnId === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSubOnId(selected ? null : id)}
                      className={`w-full flex items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${
                        selected
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-foreground hover:border-primary/50'
                      }`}
                    >
                      <span className="flex-1 text-left font-medium">
                        {p.firstName[0]}. {p.lastName}
                      </span>
                      <Badge variant="outline" className="text-[9px] h-4 px-1">{p.position.primary}</Badge>
                    </button>
                  )
                })
              )}
            </div>
            <div className="space-y-1">
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${subOnId ? 'text-amber-500' : 'text-muted-foreground'}`}>
                {subOnId ? 'Select player to bring off ↓' : 'On Field'}
              </div>
              {onFieldPlayers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!subOnId}
                  onClick={() => {
                    if (subOnId) {
                      onQueueRotation(subOnId, p.id)
                      setSubOnId(null)
                    }
                  }}
                  className={`w-full flex items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${
                    subOnId
                      ? 'cursor-pointer border-amber-500/50 bg-amber-500/5 text-foreground hover:border-amber-500 hover:bg-amber-500/15'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  <span className="flex-1 text-left font-medium">
                    {p.firstName[0]}. {p.lastName}
                  </span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1">{p.position.primary}</Badge>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── GAMEPLAN (embedded) ── */}
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gameplan</div>
          <p className="text-[11px] text-muted-foreground">
            Adjustments apply from the start of the next quarter.
          </p>
          {SLIDERS.map(({ key, label, lo, hi }) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{label}</span>
                <span className="tabular-nums text-muted-foreground">{localSliders[key]}</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[localSliders[key]]}
                onValueChange={([v]) => {
                  const updated = { ...localSliders, [key]: v ?? 50 }
                  setLocalSliders(updated)
                  onSlidersChange(updated)
                }}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{lo}</span>
                <span>{hi}</span>
              </div>
            </div>
          ))}
          {pendingSliders && (
            <Badge variant="secondary" className="text-[10px]">
              Changes queued for next quarter
            </Badge>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-primary/30 bg-card overflow-hidden">
      {/* ── Collapsible header ── */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          Bench &amp; Tactics
          {hasPendingChanges && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {queuedRotations.length > 0 && `${queuedRotations.length} rotation${queuedRotations.length > 1 ? 's' : ''}`}
              {queuedRotations.length > 0 && pendingSliders && ' · '}
              {pendingSliders && 'gameplan pending'}
            </Badge>
          )}
        </span>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
        }
      </button>

      {open && (
        <>
          {/* ── Tab bar ── */}
          <div className="flex border-t border-b text-xs font-medium">
            {([
              { k: 'bench',   label: 'Bench & Rotations' },
              { k: 'gameplan',label: 'Gameplan' },
              { k: 'stats',   label: 'Match Stats' },
            ] as const).map((t) => (
              <button
                key={t.k}
                className={`flex-1 py-1.5 transition-colors ${
                  tab === t.k
                    ? 'border-b-2 border-primary bg-primary/5 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/40'
                }`}
                onClick={() => setTab(t.k)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-3">

            {/* ── BENCH & ROTATIONS ── */}
            {tab === 'bench' && (
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Queue rotations — they take effect at the next quarter break.
                  {subOnId && (
                    <span className="text-amber-500 font-medium"> Now click a player on the right to bring them off.</span>
                  )}
                </p>

                {/* Queued rotation list */}
                {queuedRotations.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Queued Rotations</div>
                    {queuedRotations.map((r, i) => {
                      const onP = players[r.onId]
                      const offP = players[r.offId]
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded border border-dashed border-primary/40 bg-primary/5 px-2 py-1 text-xs"
                        >
                          <span className="text-green-500 font-medium">
                            ↑ {onP ? `${onP.firstName[0]}. ${onP.lastName}` : r.onId}
                          </span>
                          <ArrowLeftRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="text-red-500 font-medium">
                            ↓ {offP ? `${offP.firstName[0]}. ${offP.lastName}` : r.offId}
                          </span>
                          <button
                            type="button"
                            className="ml-auto text-muted-foreground hover:text-foreground"
                            onClick={() => onCancelRotation(i)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {/* Bench (interchange) players */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bench</div>
                    {benchPlayerIds.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">All interchange players on field</p>
                    ) : (
                      benchPlayerIds.map((id) => {
                        const p = players[id]
                        if (!p) return null
                        const selected = subOnId === id
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setSubOnId(selected ? null : id)}
                            className={`w-full flex items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${
                              selected
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-border text-foreground hover:border-primary/50'
                            }`}
                          >
                            <span className="flex-1 text-left font-medium">
                              {p.firstName[0]}. {p.lastName}
                            </span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1">{p.position.primary}</Badge>
                          </button>
                        )
                      })
                    )}
                  </div>

                  {/* On-field players */}
                  <div className="space-y-1">
                    <div className={`text-[10px] font-semibold uppercase tracking-wide ${subOnId ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      {subOnId ? 'Select player to bring off ↓' : 'On Field'}
                    </div>
                    {onFieldPlayers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!subOnId}
                        onClick={() => {
                          if (subOnId) {
                            onQueueRotation(subOnId, p.id)
                            setSubOnId(null)
                          }
                        }}
                        className={`w-full flex items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${
                          subOnId
                            ? 'cursor-pointer border-amber-500/50 bg-amber-500/5 text-foreground hover:border-amber-500 hover:bg-amber-500/15'
                            : 'border-border text-muted-foreground'
                        }`}
                      >
                        <span className="flex-1 text-left font-medium">
                          {p.firstName[0]}. {p.lastName}
                        </span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1">{p.position.primary}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── GAMEPLAN ── */}
            {tab === 'gameplan' && (
              <div className="space-y-4">
                <p className="text-[11px] text-muted-foreground">
                  Adjustments apply from the start of the next quarter. The quarter-break panel can also fine-tune these.
                </p>
                {SLIDERS.map(({ key, label, lo, hi }) => (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{label}</span>
                      <span className="tabular-nums text-muted-foreground">{localSliders[key]}</span>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[localSliders[key]]}
                      onValueChange={([v]) => {
                        const updated = { ...localSliders, [key]: v ?? 50 }
                        setLocalSliders(updated)
                        onSlidersChange(updated)
                      }}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{lo}</span>
                      <span>{hi}</span>
                    </div>
                  </div>
                ))}
                {pendingSliders && (
                  <Badge variant="secondary" className="text-[10px]">
                    Changes queued for next quarter
                  </Badge>
                )}
              </div>
            )}

            {/* ── MATCH STATS ── */}
            {tab === 'stats' && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold mb-3">
                  <span style={{ color: userColor }}>{userAbbr}</span>
                  <span className="text-muted-foreground">Stat</span>
                  <span style={{ color: oppColor }}>{oppAbbr}</span>
                </div>
                {statRows.map(({ label, u, o }) => {
                  const total = u + o || 1
                  const uPct = (u / total) * 100
                  return (
                    <div key={label} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="w-8 font-mono font-semibold">{u}</span>
                        <span className="text-[10px] text-muted-foreground">{label}</span>
                        <span className="w-8 text-right font-mono font-semibold">{o}</span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full">
                        <div
                          className="h-full"
                          style={{ width: `${uPct}%`, backgroundColor: userColor, opacity: 0.85 }}
                        />
                        <div
                          className="h-full flex-1"
                          style={{ backgroundColor: oppColor, opacity: 0.7 }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        </>
      )}
    </div>
  )
}
