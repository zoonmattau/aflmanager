import { useState } from 'react'
import type { Player } from '@/types/player'
import { getCurrentPulse, getPulseSelectionAdvice, PULSE_TAG_META } from '@/engine/training/squadPulseEngine'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface SquadPulseProps {
  players: Player[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ModifierBadge({ modifier }: { modifier: number }) {
  if (modifier >= 0.03) return (
    <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
      <TrendingUp className="h-2.5 w-2.5" />+{(modifier * 100).toFixed(0)}%
    </span>
  )
  if (modifier <= -0.03) return (
    <span className="flex items-center gap-0.5 text-red-500 dark:text-red-400 font-bold text-[10px]">
      <TrendingDown className="h-2.5 w-2.5" />{(modifier * 100).toFixed(0)}%
    </span>
  )
  if (modifier > 0) return (
    <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400 font-bold text-[10px]">
      <TrendingUp className="h-2.5 w-2.5" />+{(modifier * 100).toFixed(0)}%
    </span>
  )
  if (modifier < 0) return (
    <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-bold text-[10px]">
      <TrendingDown className="h-2.5 w-2.5" />{(modifier * 100).toFixed(0)}%
    </span>
  )
  return <Minus className="h-2.5 w-2.5 text-muted-foreground" />
}

function FatigueDot({ fatigue }: { fatigue: number }) {
  const cls = fatigue >= 70 ? 'bg-red-500' : fatigue >= 45 ? 'bg-amber-500' : 'bg-green-500'
  return <span className={cn('inline-block w-1.5 h-1.5 rounded-full flex-shrink-0', cls)} />
}

// ── Player pill ───────────────────────────────────────────────────────────────

function PlayerPill({ player, expanded, onToggle }: {
  player: Player
  expanded: boolean
  onToggle: () => void
}) {
  const pulse = getCurrentPulse(player)

  if (!pulse) {
    // No pulse yet — fall back to the original fatigue-only display
    return (
      <button
        type="button"
        title={`${player.firstName} ${player.lastName} — Fatigue: ${player.fatigue} · Fitness: ${player.fitness}`}
        className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 min-w-0 cursor-default"
      >
        <FatigueDot fatigue={player.fatigue} />
        <span className="text-[10px] font-medium truncate max-w-[64px]">
          {player.firstName.charAt(0)}. {player.lastName}
        </span>
        <span className={cn(
          'text-[10px] font-bold flex-shrink-0',
          player.fatigue >= 70 ? 'text-red-600 dark:text-red-400' :
          player.fatigue >= 45 ? 'text-amber-600 dark:text-amber-400' :
          'text-green-600 dark:text-green-400',
        )}>
          {player.fatigue}
        </span>
      </button>
    )
  }

  const meta = PULSE_TAG_META[pulse.tag]

  return (
    <button
      type="button"
      onClick={onToggle}
      title={pulse.message}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 min-w-0 transition-colors text-left',
        expanded
          ? cn(meta.bgClass, meta.borderClass)
          : 'bg-background border-border hover:bg-muted/60',
      )}
    >
      <span className={cn('inline-block w-1.5 h-1.5 rounded-full flex-shrink-0', meta.dotClass)} />
      <span className="text-[10px] font-medium truncate max-w-[64px]">
        {player.firstName.charAt(0)}. {player.lastName}
      </span>
      <span className={cn('text-[10px] font-semibold flex-shrink-0 hidden sm:inline', meta.textClass)}>
        {meta.label}
      </span>
      <ModifierBadge modifier={pulse.modifier} />
      {expanded
        ? <ChevronUp className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
        : <ChevronDown className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
      }
    </button>
  )
}

// ── Selection tips ────────────────────────────────────────────────────────────

function SelectionTips({ players }: { players: Player[] }) {
  const starters = players
    .filter((p) => !p.injury)
    .map((p) => ({ player: p, advice: getPulseSelectionAdvice(p) }))
    .filter(({ advice }) => advice.advice === 'start')
    .sort((a, b) => (getCurrentPulse(b.player)?.modifier ?? 0) - (getCurrentPulse(a.player)?.modifier ?? 0))
    .slice(0, 5)

  const resting = players
    .filter((p) => !p.injury)
    .map((p) => ({ player: p, advice: getPulseSelectionAdvice(p) }))
    .filter(({ advice }) => advice.advice === 'rest')
    .sort((a, b) => (getCurrentPulse(a.player)?.modifier ?? 0) - (getCurrentPulse(b.player)?.modifier ?? 0))

  if (starters.length === 0 && resting.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {starters.length > 0 && (
        <div className="rounded-md bg-emerald-500/8 border border-emerald-500/20 px-2.5 py-2 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Consider starting
          </p>
          <div className="flex flex-wrap gap-1">
            {starters.map(({ player }) => {
              const pulse = getCurrentPulse(player)
              const meta = pulse ? PULSE_TAG_META[pulse.tag] : null
              return (
                <span
                  key={player.id}
                  title={pulse?.message ?? ''}
                  className={cn(
                    'text-[10px] rounded px-1.5 py-0.5 border font-medium',
                    meta ? cn(meta.bgClass, meta.textClass, meta.borderClass) : 'bg-muted text-muted-foreground',
                  )}
                >
                  {player.firstName.charAt(0)}. {player.lastName}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {resting.length > 0 && (
        <div className="rounded-md bg-red-500/8 border border-red-500/20 px-2.5 py-2 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Consider resting
          </p>
          <div className="flex flex-wrap gap-1">
            {resting.map(({ player }) => {
              const pulse = getCurrentPulse(player)
              const meta = pulse ? PULSE_TAG_META[pulse.tag] : null
              return (
                <span
                  key={player.id}
                  title={pulse?.message ?? ''}
                  className={cn(
                    'text-[10px] rounded px-1.5 py-0.5 border font-medium',
                    meta ? cn(meta.bgClass, meta.textClass, meta.borderClass) : 'bg-muted text-muted-foreground',
                  )}
                >
                  {player.firstName.charAt(0)}. {player.lastName}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Expanded message panel ────────────────────────────────────────────────────

function ExpandedMessage({ player }: { player: Player }) {
  const pulse = getCurrentPulse(player)
  if (!pulse) return null
  const meta = PULSE_TAG_META[pulse.tag]
  return (
    <div className={cn(
      'rounded-md border px-3 py-2 text-xs space-y-1',
      meta.bgClass, meta.borderClass,
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{player.firstName} {player.lastName}</span>
        <span className={cn('text-[10px] font-semibold', meta.textClass)}>{meta.label}</span>
      </div>
      <p className={cn('text-[11px] italic leading-relaxed', meta.textClass)}>"{pulse.message}"</p>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-0.5">
        <span>Fatigue: <strong>{player.fatigue}</strong></span>
        <span>Fitness: <strong>{player.fitness}</strong></span>
        <span>Form: <strong>{player.form}</strong></span>
        <span className="ml-auto">
          Sim modifier: <strong><ModifierBadge modifier={pulse.modifier} /></strong>
        </span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Squad Pulse strip — shows every available player's weekly readiness narrative.
 * Players without a pulse note yet fall back to the raw fatigue display.
 * Clicking a pill expands a detail card with the full message.
 */
export function SquadPulse({ players }: SquadPulseProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const available = [...players]
    .filter((p) => !p.injury)
    .sort((a, b) => {
      // Sort by modifier ascending (most negative first) then by fatigue
      const aMod = getCurrentPulse(a)?.modifier ?? 0
      const bMod = getCurrentPulse(b)?.modifier ?? 0
      if (aMod !== bMod) return aMod - bMod
      return b.fatigue - a.fatigue
    })

  const hasPulse = available.some((p) => getCurrentPulse(p) !== null)

  // Summary counts for the legend
  const positive = available.filter((p) => (getCurrentPulse(p)?.modifier ?? 0) > 0).length
  const negative = available.filter((p) => (getCurrentPulse(p)?.modifier ?? 0) < -0.025).length
  const neutral = available.length - positive - negative

  const expandedPlayer = expandedId ? available.find((p) => p.id === expandedId) ?? null : null

  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2.5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Zap className="h-3 w-3" />
          Squad Pulse
        </p>
        {hasPulse ? (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />
              Primed ({positive})
            </span>
            <span className="flex items-center gap-1">
              <Minus className="h-2.5 w-2.5 text-muted-foreground" />
              Steady ({neutral})
            </span>
            <span className="flex items-center gap-1">
              <TrendingDown className="h-2.5 w-2.5 text-red-500" />
              Concern ({negative})
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">Advance the round to generate pulse notes</span>
        )}
      </div>

      {/* Player pills */}
      <div className="flex flex-wrap gap-1.5">
        {available.map((player) => (
          <PlayerPill
            key={player.id}
            player={player}
            expanded={expandedId === player.id}
            onToggle={() => setExpandedId(expandedId === player.id ? null : player.id)}
          />
        ))}
        {available.length === 0 && (
          <p className="text-xs text-muted-foreground">No available players.</p>
        )}
      </div>

      {/* Expanded detail card */}
      {expandedPlayer && (
        <ExpandedMessage player={expandedPlayer} />
      )}

      {/* Selection tips */}
      {hasPulse && <SelectionTips players={players} />}
    </div>
  )
}
