import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { QuarterInjury } from '@/types/matchEvent'

interface InjuryStoppagePanelProps {
  injury: QuarterInjury
  subName: string | null   // name of available substitute, or null
  subActivated: boolean
  onActivateSub: () => void
  onContinue: () => void
}

const SEVERITY_COLOUR: Record<QuarterInjury['severity'], string> = {
  minor: 'text-yellow-500',
  moderate: 'text-orange-500',
  major: 'text-red-500',
  severe: 'text-red-700',
}

export function InjuryStoppagePanel({
  injury,
  subName,
  subActivated,
  onActivateSub,
  onContinue,
}: InjuryStoppagePanelProps) {
  const canSub = !!subName && !subActivated

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-lg leading-none">🚑</span>
        <span className="text-sm font-semibold">INJURY — {injury.playerName}</span>
        <Badge
          variant="outline"
          className={`text-[10px] ${SEVERITY_COLOUR[injury.severity]}`}
        >
          {injury.severity} · {injury.weeksOut}w
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">{injury.injuryType}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {canSub && (
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            onClick={onActivateSub}
          >
            Activate Sub: {subName}
          </Button>
        )}
        {subActivated && (
          <span className="text-xs text-muted-foreground">Substitute already activated.</span>
        )}
        {!canSub && !subActivated && (
          <span className="text-xs text-muted-foreground">No substitute available.</span>
        )}
        <Button size="sm" className="h-7 text-xs ml-auto gap-1" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}
