/**
 * TrainingProjectionPanel
 *
 * Shows expected offseason attribute changes for a selected training focus.
 * Used in the Training page player cards and the Player Profile development tab.
 */

import { useState } from 'react'
import type { Player, PlayerTrainingFocus } from '@/types/player'
import type { ProjectionContext, AttributeProjection } from '@/lib/trainingProjection'
import {
  computeTrainingProjection,
  type DevelopmentPhase,
} from '@/lib/trainingProjection'
import {
  PLAYER_TRAINING_FOCUS_LABELS,
  PLAYER_TRAINING_FOCUS_OPTIONS,
} from '@/engine/players/trainingFocus'
import { ATTR_CATEGORIES } from '@/lib/attributeCategories'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, ArrowLeftRight, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Attribute label lookup
// ---------------------------------------------------------------------------

const ATTR_LABEL_MAP: Partial<Record<string, string>> = Object.fromEntries(
  ATTR_CATEGORIES.flatMap((cat) => cat.attrs.map(({ key, label }) => [key, label])),
)

function attrLabel(key: string): string {
  return ATTR_LABEL_MAP[key] ?? key
}

// ---------------------------------------------------------------------------
// Direction indicator
// ---------------------------------------------------------------------------

function DirectionIcon({ direction, phase }: { direction: AttributeProjection['direction']; phase: DevelopmentPhase }) {
  if (phase === 'decline') {
    return <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
  }
  if (direction === 'up') {
    return <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
  }
  return <Minus className="h-3 w-3 text-muted-foreground shrink-0" />
}

// ---------------------------------------------------------------------------
// Range display
// ---------------------------------------------------------------------------


function formatProjected(current: number, minChange: number, maxChange: number, phase: DevelopmentPhase): string {
  if (phase === 'peak') {
    const lo = Math.round(current + Math.min(minChange, maxChange))
    const hi = Math.round(current + Math.max(minChange, maxChange))
    if (lo === hi) return String(lo)
    return `${lo}–${hi}`
  }
  if (phase === 'decline') {
    const lo = Math.round(current + Math.min(minChange, maxChange))
    const hi = Math.round(current + Math.max(minChange, maxChange))
    return `${lo}–${hi}`
  }
  const lo = Math.round(current + Math.min(minChange, maxChange))
  const hi = Math.round(current + Math.max(minChange, maxChange))
  if (lo === hi) return String(lo)
  return `${lo}–${hi}`
}

// ---------------------------------------------------------------------------
// Single-focus projection rows
// ---------------------------------------------------------------------------

function ProjectionTable({
  attrs,
  phase,
}: {
  attrs: AttributeProjection[]
  phase: DevelopmentPhase
}) {
  return (
    <div className="space-y-0.5">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[10px] text-muted-foreground pb-1 border-b border-border/40">
        <span>Attribute</span>
        <span className="text-right">Now</span>
        <span className="text-right">Projected</span>
        <span className="w-4" />
      </div>
      {attrs.map((a) => (
        <div key={a.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center py-0.5">
          <span className={cn('text-xs', a.isFocused && 'font-semibold')}>
            {attrLabel(a.key)}
            {a.isFocused && <span className="text-[9px] text-emerald-500 ml-1">↑</span>}
          </span>
          <span className="text-xs text-right tabular-nums font-mono text-muted-foreground">{a.current}</span>
          <span className={cn(
            'text-xs text-right tabular-nums font-mono',
            phase === 'growth' ? 'text-emerald-500' : phase === 'decline' ? 'text-red-500' : 'text-muted-foreground',
          )}>
            {formatProjected(a.current, a.minChange, a.maxChange, phase)}
          </span>
          <DirectionIcon direction={a.direction} phase={phase} />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modifier pill
// ---------------------------------------------------------------------------

function ModifierPill({ pct, label }: { pct: number; label: string }) {
  const isPositive = pct > 0
  const isNeutral = pct === 0
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
      isNeutral
        ? 'border-border text-muted-foreground'
        : isPositive
          ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
          : 'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5',
    )}>
      {isNeutral ? '' : isPositive ? '+' : ''}{pct}% {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Compare mode — 3-column view
// ---------------------------------------------------------------------------

const COMPARE_FOCUSES: PlayerTrainingFocus[] = [
  'endurance', 'kicking', 'contested-ball',
]

function CompareFocusesPanel({
  player,
  ctx,
  onClose,
}: {
  player: Player
  ctx: ProjectionContext
  onClose: () => void
}) {
  const [focuses, setFocuses] = useState<[PlayerTrainingFocus, PlayerTrainingFocus, PlayerTrainingFocus]>([
    COMPARE_FOCUSES[0], COMPARE_FOCUSES[1], COMPARE_FOCUSES[2],
  ])

  const projections = focuses.map((f) => computeTrainingProjection(player, f, ctx))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Compare Focuses</h4>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {focuses.map((focus, idx) => (
          <div key={idx} className="space-y-1.5">
            <select
              className="w-full text-xs rounded border border-input bg-background px-1.5 py-1"
              value={focus}
              onChange={(e) => {
                const next = [...focuses] as typeof focuses
                next[idx] = e.target.value as PlayerTrainingFocus
                setFocuses(next)
              }}
            >
              {PLAYER_TRAINING_FOCUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{PLAYER_TRAINING_FOCUS_LABELS[opt]}</option>
              ))}
            </select>

            <div className="space-y-0.5 text-[10px]">
              <div className="font-medium text-muted-foreground pb-0.5 border-b border-border/40">Top 5</div>
              {projections[idx].topAttributes.map((a) => (
                <div key={a.key} className="flex justify-between items-center gap-1">
                  <span className={cn('truncate', a.isFocused && 'font-semibold')}>{attrLabel(a.key)}</span>
                  <span className={cn(
                    'tabular-nums font-mono shrink-0',
                    projections[idx].phase === 'growth' ? 'text-emerald-500'
                      : projections[idx].phase === 'decline' ? 'text-red-500'
                        : 'text-muted-foreground',
                  )}>
                    {formatProjected(a.current, a.minChange, a.maxChange, projections[idx].phase)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Projections show expected range after one offseason. Actual results vary.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TrainingProjectionPanelProps {
  player: Player
  selectedFocus: PlayerTrainingFocus | null
  ctx: ProjectionContext
  compact?: boolean
}

export function TrainingProjectionPanel({
  player,
  selectedFocus,
  ctx,
  compact = false,
}: TrainingProjectionPanelProps) {
  const [showCompare, setShowCompare] = useState(false)

  const result = computeTrainingProjection(player, selectedFocus, ctx)

  if (showCompare) {
    return (
      <CompareFocusesPanel
        player={player}
        ctx={ctx}
        onClose={() => setShowCompare(false)}
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Phase + dev rate */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <Badge variant="outline" className={cn(
          'text-[10px]',
          result.phase === 'growth' ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
            : result.phase === 'decline' ? 'border-red-500/30 text-red-500'
              : 'border-border text-muted-foreground',
        )}>
          {result.phase === 'growth' ? '📈 ' : result.phase === 'decline' ? '📉 ' : '➡️ '}
          {result.phaseLabel}
        </Badge>
        {result.devRateLabel && (
          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
            {result.devRateLabel}
          </Badge>
        )}
      </div>

      {/* Top 5 attribute projections */}
      {selectedFocus ? (
        <>
          <div>
            <p className="text-[10px] text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">
              Top 5 — {PLAYER_TRAINING_FOCUS_LABELS[selectedFocus]} focus
            </p>
            <ProjectionTable attrs={result.topAttributes} phase={result.phase} />
          </div>

          {/* Penalised attributes note */}
          {!compact && result.penalisedAttributes.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground font-medium mb-1 uppercase tracking-wider">
                Reduced focus (×0.985)
              </p>
              <div className="flex flex-wrap gap-1">
                {result.penalisedAttributes.slice(0, 8).map((key) => (
                  <span
                    key={key}
                    className="text-[9px] text-red-500/70 border border-red-500/20 rounded px-1 py-0.5 bg-red-500/5"
                  >
                    {attrLabel(key)}
                  </span>
                ))}
                {result.penalisedAttributes.length > 8 && (
                  <span className="text-[9px] text-muted-foreground">
                    +{result.penalisedAttributes.length - 8} more
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">
            Top 5 without focus
          </p>
          <ProjectionTable attrs={result.topAttributes} phase={result.phase} />
          <p className="text-[10px] text-muted-foreground mt-1">
            No focus penalty applied. Assign a focus for targeted growth.
          </p>
        </div>
      )}

      {/* Modifiers */}
      {!compact && (
        <div>
          <p className="text-[10px] text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">
            Modifiers
          </p>
          <div className="flex flex-wrap gap-1.5">
            <ModifierPill pct={ctx.coachingPct} label="coaching" />
            <ModifierPill pct={ctx.facilitiesPct} label="facilities" />
            <ModifierPill pct={ctx.culturePct} label="culture" />
          </div>
        </div>
      )}

      {/* Compare button */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1.5 w-full"
        onClick={() => setShowCompare(true)}
      >
        <ArrowLeftRight className="h-3 w-3" />
        Compare Focuses
      </Button>

      <p className="text-[9px] text-muted-foreground">
        Projections show expected range. Actual results vary due to randomness.
      </p>
    </div>
  )
}
