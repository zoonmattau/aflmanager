import { Button } from '@/components/ui/button'
import type { MidMatchDecision } from '@/types/matchEvent'

interface GoalStoppagePanelProps {
  scoringTeamName: string
  scoringColor: string
  margin: number
  userIsAhead: boolean
  decisions: MidMatchDecision[]
  onDecision: (d: MidMatchDecision) => void
  onContinue: () => void
}

export function GoalStoppagePanel({
  scoringTeamName,
  scoringColor,
  margin,
  userIsAhead,
  decisions,
  onDecision,
  onContinue,
}: GoalStoppagePanelProps) {
  // Filter decisions relevant to current situation
  const relevant = decisions.filter((d) => {
    if (d.type === 'protect-lead') return userIsAhead && margin >= 10
    if (d.type === 'chase-game') return !userIsAhead
    return ['stay-course', 'tag-switch', 'change-tempo'].includes(d.type)
  })

  return (
    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 rounded-sm border border-white/20 flex-shrink-0"
          style={{ backgroundColor: scoringColor }}
        />
        <span className="text-sm font-semibold">
          GOAL — {scoringTeamName}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {margin === 0 ? 'All square' : `${Math.abs(margin)} pt margin`}
        </span>
      </div>

      {relevant.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {relevant.map((d) => (
            <Button
              key={d.id}
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onDecision(d)}
            >
              {d.label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={onContinue} className="h-7 text-xs gap-1">
          Continue
        </Button>
      </div>
    </div>
  )
}
