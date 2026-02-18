import type { BoardApprovalResult } from '@/types/boardApproval'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShieldAlert } from 'lucide-react'

function probabilityColor(probability: number): string {
  if (probability >= 70) return 'text-green-600 dark:text-green-400'
  if (probability >= 40) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function barColor(probability: number): string {
  if (probability >= 70) return 'bg-green-500'
  if (probability >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function BoardApprovalPanel({
  result,
  compact = false,
}: {
  result: BoardApprovalResult
  compact?: boolean
}) {
  if (!result.requiresApproval) return null

  return (
    <Card className={compact ? 'border-amber-300 dark:border-amber-700' : 'border-amber-300 dark:border-amber-700'}>
      <CardContent className={compact ? 'p-3' : 'p-4'}>
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">Board Approval Required</span>
        </div>

        {/* Probability bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Approval Chance</span>
            <span className={`text-sm font-bold ${probabilityColor(result.probability)}`}>
              {result.probability}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor(result.probability)}`}
              style={{ width: `${result.probability}%` }}
            />
          </div>
        </div>

        {/* Factor breakdown */}
        {result.factors.length > 0 && (
          <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
            <span className="text-xs font-medium text-muted-foreground">Factors</span>
            {result.factors.filter((f) => f.label !== 'Base probability').map((factor, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{factor.label}</span>
                <Badge
                  variant={factor.modifier > 0 ? 'default' : factor.modifier < 0 ? 'destructive' : 'secondary'}
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  {factor.modifier > 0 ? '+' : ''}{factor.modifier}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
