import { TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AttributeTrendData } from '@/engine/player/trendEngine'
import { cn } from '@/lib/utils'

interface Props {
  trend: AttributeTrendData
  /** Only show historical delta, only projected, or both (default) */
  mode?: 'historical' | 'projected' | 'both'
}

/**
 * Inline badge showing:
 *   - Actual historical delta (↑+3 in green, ↓−2 in red, — in muted) with tooltip
 *   - Staff projection arrow (P↑ blue, P↓ orange, P— muted) with tooltip
 *
 * Historical indicators are only rendered when snapshot data exists.
 * Projected indicators are always rendered.
 */
export function AttributeTrendBadge({ trend, mode = 'both' }: Props) {
  const { historical, projected } = trend
  const showHistorical = mode !== 'projected' && historical !== null
  const showProjected = mode !== 'historical'

  return (
    <span className="inline-flex items-center gap-0.5 shrink-0 w-14 justify-end">

      {/* ── Historical delta ────────────────────────────────────────────── */}
      {showHistorical && historical && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums cursor-default select-none',
                historical.direction === 'rising'  ? 'text-green-500' :
                historical.direction === 'falling' ? 'text-red-500'   :
                'text-muted-foreground/40',
              )}
            >
              {historical.direction === 'rising'  && <TrendingUp  className="h-3 w-3" />}
              {historical.direction === 'falling' && <TrendingDown className="h-3 w-3" />}
              {historical.direction === 'flat'    && <Minus        className="h-3 w-3" />}
              {historical.delta !== 0 && (
                <span>{historical.delta > 0 ? '+' : ''}{historical.delta}</span>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px]">
            <p className="font-semibold text-xs">
              {historical.delta === 0
                ? 'No change'
                : `${historical.delta > 0 ? '+' : ''}${historical.delta} pts`}
              {' '}vs {historical.windowSeasons === 1 ? 'last season' : `${historical.windowSeasons} seasons ago`}
            </p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* ── Projected trend ─────────────────────────────────────────────── */}
      {showProjected && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'inline-flex items-center gap-0 text-[10px] cursor-default select-none',
                projected.direction === 'rising'  ? 'text-blue-400'    :
                projected.direction === 'falling' ? 'text-orange-400'  :
                'text-muted-foreground/30',
              )}
            >
              {projected.direction === 'rising'  && <ArrowUp   className="h-2.5 w-2.5" />}
              {projected.direction === 'falling' && <ArrowDown  className="h-2.5 w-2.5" />}
              {projected.direction === 'flat'    && <Minus      className="h-2.5 w-2.5 opacity-50" />}
              <span className="text-[9px] font-medium leading-none">P</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px] space-y-1.5">
            <p className="font-semibold text-xs">
              Staff Projection —{' '}
              {projected.direction === 'rising'
                ? 'Expected to improve'
                : projected.direction === 'falling'
                ? 'Expected to decline'
                : 'Likely to hold steady'}
            </p>
            <ul className="space-y-0.5">
              {projected.drivers.map((d, i) => (
                <li key={i} className="flex gap-1 text-xs text-muted-foreground">
                  <span className="shrink-0 opacity-50">·</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground/60 pt-0.5 border-t border-border/40">
              Confidence: <span className="font-medium capitalize">{projected.confidence}</span>
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  )
}
