import type { OffseasonMilestone } from '@/engine/offseason/offseasonCalendar'
import type { OffseasonPhase } from '@/engine/season/offseasonFlow'
import { getOffseasonPhaseLabel } from '@/engine/season/offseasonFlow'

interface OffseasonCalendarOverlayProps {
  date: string
  milestones: OffseasonMilestone[]
  currentPhase: OffseasonPhase
}

/**
 * Renders milestone markers for a calendar day cell during offseason.
 * If the date has a milestone, shows a colored badge. Otherwise shows a
 * subtle phase label.
 */
export function OffseasonCalendarOverlay({
  date,
  milestones,
  currentPhase,
}: OffseasonCalendarOverlayProps) {
  const dayMilestones = milestones.filter((m) => m.date === date)

  if (dayMilestones.length > 0) {
    return (
      <div className="flex flex-col gap-0.5 w-full">
        {dayMilestones.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-white bg-pink-500"
          >
            <span className="truncate">{m.label}</span>
          </div>
        ))}
      </div>
    )
  }

  // No milestone — show subtle current phase label
  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-[9px] text-muted-foreground/40">
        {getOffseasonPhaseLabel(currentPhase)}
      </span>
    </div>
  )
}
