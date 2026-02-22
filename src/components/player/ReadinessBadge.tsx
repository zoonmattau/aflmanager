import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { computePlayerReadiness, type ReadinessStatus } from '@/engine/player/readinessEngine'
import type { Player } from '@/types/player'

// ---------------------------------------------------------------------------
// Colour mapping
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ReadinessStatus, { label: string; pill: string; bar: string }> = {
  peaking:  { label: 'Peaking',  pill: 'border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-400',  bar: 'bg-green-500' },
  ready:    { label: 'Ready',    pill: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-500',                          bar: 'bg-zinc-400' },
  managed:  { label: 'Managed',  pill: 'border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-400',      bar: 'bg-blue-500' },
  fatigued: { label: 'Fatigued', pill: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400',  bar: 'bg-amber-500' },
  overdone: { label: 'Overdone', pill: 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400',          bar: 'bg-red-500' },
}

// ---------------------------------------------------------------------------
// Mini stat bar used in tooltip
// ---------------------------------------------------------------------------

function StatBar({ label, value, barColor }: { label: string; value: number; barColor: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-10 text-right text-[10px] text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.max(2, value)}%` }}
        />
      </div>
      <span className="w-6 text-[10px] tabular-nums text-muted-foreground">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReadinessBadgeProps {
  player: Player
  showLabel?: boolean
  size?: 'xs' | 'sm'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReadinessBadge({ player, showLabel = false, size = 'xs' }: ReadinessBadgeProps) {
  const readiness = computePlayerReadiness(player)
  const cfg = STATUS_CONFIG[readiness.status]

  const pillClass = cn(
    'inline-flex items-center rounded-full border font-medium',
    size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]',
    cfg.pill,
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={pillClass}>
          {showLabel ? cfg.label : cfg.label.charAt(0)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="w-52 space-y-2 p-2.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">{cfg.label}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {readiness.score}/100
          </span>
        </div>

        {/* Score bar */}
        <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={cn('h-full rounded-full', cfg.bar)}
            style={{ width: `${readiness.score}%` }}
          />
        </div>

        {/* Sub-bars */}
        <div className="space-y-1 pt-0.5">
          <StatBar label="Fitness" value={player.fitness}                barColor="bg-emerald-500" />
          <StatBar label="Fresh"   value={100 - player.fatigue}           barColor="bg-sky-500"     />
          <StatBar label="Form"    value={player.form}                    barColor="bg-violet-500"  />
          <StatBar label="Morale"  value={player.morale}                  barColor="bg-amber-500"   />
        </div>

        {/* Flags */}
        {readiness.flags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {readiness.flags.map((flag) => (
              <span
                key={flag}
                className="inline-flex items-center rounded-full border border-border/50 px-1.5 py-px text-[10px] text-muted-foreground"
              >
                {flag}
              </span>
            ))}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
