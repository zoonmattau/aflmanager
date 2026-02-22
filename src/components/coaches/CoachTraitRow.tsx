import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CoachTraitRowProps {
  label: string
  value: string | number | undefined
  revealed: boolean
  /** Optional: show a colored bar for numeric values */
  numeric?: boolean
  maxValue?: number
  className?: string
}

export function CoachTraitRow({
  label,
  value,
  revealed,
  numeric = false,
  maxValue = 100,
  className,
}: CoachTraitRowProps) {
  return (
    <div className={cn('flex items-center justify-between py-1.5 border-b border-border/50 last:border-0', className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      {revealed && value !== undefined ? (
        <div className="flex items-center gap-2">
          {numeric && typeof value === 'number' ? (
            <>
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', getNumericColor(value, maxValue))}
                  style={{ width: `${(value / maxValue) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium w-8 text-right">{value}</span>
            </>
          ) : (
            <span className="text-sm font-medium">{value}</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span className="text-xs">Hidden</span>
        </div>
      )}
    </div>
  )
}

function getNumericColor(value: number, max: number): string {
  const pct = value / max
  if (pct >= 0.75) return 'bg-green-500'
  if (pct >= 0.5) return 'bg-sky-500'
  if (pct >= 0.25) return 'bg-amber-500'
  return 'bg-red-500'
}
