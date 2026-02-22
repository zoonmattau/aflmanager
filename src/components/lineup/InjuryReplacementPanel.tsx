/**
 * InjuryReplacementPanel
 * ----------------------
 * Displays unresolved injury replacement puzzles on the Lineup page.
 * One card per puzzle — shows what was lost, four pathways with recommended
 * player + trade-offs, and resolve / dismiss buttons.
 */

import { useState } from 'react'
import type { InjuryReplacementPuzzle, ReplacementPathwayType } from '@/types/game'
import type { Player } from '@/types/player'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
  Zap,
  X,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  RefreshCw,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InjuryReplacementPanelProps {
  puzzles: InjuryReplacementPuzzle[]
  players: Record<string, Player>
  onResolve: (puzzleId: string, pathwayType: ReplacementPathwayType) => void
  onDismiss: (puzzleId: string) => void
}

// ── Pathway metadata ──────────────────────────────────────────────────────────

const PATHWAY_META: Record<ReplacementPathwayType, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  colourClass: string
  borderClass: string
  bgClass: string
}> = {
  'like-for-like': {
    label: 'Like-for-Like',
    icon: RefreshCw,
    colourClass: 'text-sky-600 dark:text-sky-400',
    borderClass: 'border-sky-500/30',
    bgClass: 'bg-sky-500/8',
  },
  'structure-shift': {
    label: 'Structure Shift',
    icon: ArrowRight,
    colourClass: 'text-violet-600 dark:text-violet-400',
    borderClass: 'border-violet-500/30',
    bgClass: 'bg-violet-500/8',
  },
  'youth-promotion': {
    label: 'Youth Promotion',
    icon: Sparkles,
    colourClass: 'text-emerald-600 dark:text-emerald-400',
    borderClass: 'border-emerald-500/30',
    bgClass: 'bg-emerald-500/8',
  },
  'emergency-coverage': {
    label: 'Emergency Coverage',
    icon: ShieldAlert,
    colourClass: 'text-amber-600 dark:text-amber-400',
    borderClass: 'border-amber-500/30',
    bgClass: 'bg-amber-500/8',
  },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConsequencePill({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold border',
      positive
        ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
        : 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/25',
    )}>
      {positive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {label}: {value}
    </span>
  )
}

function AttributeBar({ label, value }: { label: string; value: number }) {
  const colour =
    value >= 80 ? 'bg-emerald-500' :
    value >= 65 ? 'bg-sky-500' :
    value >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] text-muted-foreground w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', colour)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-bold w-6 text-right shrink-0">{value}</span>
    </div>
  )
}

// ── Puzzle card ───────────────────────────────────────────────────────────────

function PuzzleCard({
  puzzle,
  players,
  onResolve,
  onDismiss,
}: {
  puzzle: InjuryReplacementPuzzle
  players: Record<string, Player>
  onResolve: (pathwayType: ReplacementPathwayType) => void
  onDismiss: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [selectedPathway, setSelectedPathway] = useState<ReplacementPathwayType | null>(null)

  const weeksLabel = puzzle.weeksOut === 1 ? '1 week' : `${puzzle.weeksOut} weeks`
  const matchupPct = puzzle.roleImpact.matchupValue

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-red-500/8 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {puzzle.injuredPlayerName} — Injury Crisis
            </p>
            <p className="text-[11px] text-muted-foreground">
              {puzzle.injuredPlayerRole} · Out {weeksLabel} · {puzzle.roleImpact.statusLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
            Action Required
          </Badge>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          }
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* What we're losing */}
          <div className="rounded-md border border-border bg-background px-3 py-2.5 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Zap className="h-3 w-3" />
              What we&apos;re losing — {puzzle.roleImpact.positionGroup}
            </p>
            <div className="space-y-1.5">
              {puzzle.roleImpact.keyAttributes.map(({ attr, label, value }) => (
                <AttributeBar key={attr} label={label} value={value} />
              ))}
            </div>
            <div className="flex items-center gap-3 pt-0.5">
              <span className="text-[10px] text-muted-foreground">Matchup impact:</span>
              <div className="flex items-center gap-1.5">
                <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      matchupPct >= 75 ? 'bg-red-500' :
                      matchupPct >= 55 ? 'bg-amber-500' : 'bg-sky-500',
                    )}
                    style={{ width: `${matchupPct}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold">{matchupPct}</span>
              </div>
            </div>
          </div>

          {/* Replacement pathways */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Replacement Pathways
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {puzzle.pathways.map((pathway) => {
                const meta = PATHWAY_META[pathway.type]
                const Icon = meta.icon
                const suggestedPlayer = pathway.suggestedPlayerId
                  ? players[pathway.suggestedPlayerId]
                  : null
                const isSelected = selectedPathway === pathway.type

                return (
                  <button
                    key={pathway.type}
                    type="button"
                    onClick={() => setSelectedPathway(isSelected ? null : pathway.type)}
                    className={cn(
                      'rounded-md border px-3 py-2.5 text-left transition-colors space-y-1.5',
                      isSelected
                        ? cn(meta.bgClass, meta.borderClass)
                        : 'bg-background border-border hover:bg-muted/50',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.colourClass)} />
                      <span className={cn('text-[11px] font-semibold', meta.colourClass)}>
                        {meta.label}
                      </span>
                    </div>
                    {suggestedPlayer && (
                      <p className="text-[10px] font-medium text-foreground">
                        → {suggestedPlayer.firstName} {suggestedPlayer.lastName}
                        <span className="text-muted-foreground font-normal"> ({suggestedPlayer.position.primary})</span>
                      </p>
                    )}
                    {!suggestedPlayer && (
                      <p className="text-[10px] text-muted-foreground italic">No candidate found</p>
                    )}
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {pathway.consequences.roleNote}
                    </p>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {pathway.consequences.formDelta !== 0 && (
                        <ConsequencePill
                          label="Form"
                          value={`${pathway.consequences.formDelta > 0 ? '+' : ''}${pathway.consequences.formDelta}`}
                          positive={pathway.consequences.formDelta > 0}
                        />
                      )}
                      {pathway.consequences.fatigueDelta !== 0 && (
                        <ConsequencePill
                          label="Fatigue"
                          value={`+${pathway.consequences.fatigueDelta}`}
                          positive={false}
                        />
                      )}
                      {pathway.consequences.cohesionPenalty > 0 && (
                        <ConsequencePill
                          label="Cohesion"
                          value={`-${Math.round(pathway.consequences.cohesionPenalty * 100)}%`}
                          positive={false}
                        />
                      )}
                      {pathway.consequences.upsidePotential > 0 && (
                        <ConsequencePill
                          label="Upside"
                          value={`+${Math.round(pathway.consequences.upsidePotential * 100)}%`}
                          positive
                        />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 text-xs"
              onClick={onDismiss}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Dismiss
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!selectedPathway}
              onClick={() => selectedPathway && onResolve(selectedPathway)}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Commit to Plan
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function InjuryReplacementPanel({
  puzzles,
  players,
  onResolve,
  onDismiss,
}: InjuryReplacementPanelProps) {
  const active = puzzles.filter((p) => !p.resolved && !p.dismissed)
  if (active.length === 0) return null

  return (
    <div className="space-y-3">
      {active.map((puzzle) => (
        <PuzzleCard
          key={puzzle.id}
          puzzle={puzzle}
          players={players}
          onResolve={(pathwayType) => onResolve(puzzle.id, pathwayType)}
          onDismiss={() => onDismiss(puzzle.id)}
        />
      ))}
    </div>
  )
}
