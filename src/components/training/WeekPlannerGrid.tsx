import type { TrainingWeekPlan, TrainingGroup } from '@/engine/training/trainingEngine'
import type { Player } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import { DayColumn } from './DayColumn'
import { addDays } from '@/engine/calendar/calendarEngine'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatDayNumber(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

interface WeekPlannerGridProps {
  plan: TrainingWeekPlan
  weekDates: string[]
  matchDate: string | null
  clubPlayers: Player[]
  clubStaff: Record<string, StaffMember>
  onUpdateSlotGroups: (date: string, slot: 'morning' | 'afternoon', groups: TrainingGroup[]) => void
}

export function WeekPlannerGrid({
  plan,
  weekDates,
  matchDate,
  clubPlayers,
  clubStaff,
  onUpdateSlotGroups,
}: WeekPlannerGridProps) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDates.map((date, i) => {
        const isMatchDay = matchDate !== null && date === matchDate
        const dayBefore = matchDate !== null && addDays(date, 1) === matchDate
        const dayAfter = matchDate !== null && addDays(matchDate, 1) === date

        const daySlots = plan.slots[date] ?? {
          morning: { groups: [] },
          afternoon: { groups: [] },
        }

        return (
          <DayColumn
            key={date}
            date={date}
            dayLabel={DAY_LABELS[i]}
            dayNumber={formatDayNumber(date)}
            isMatchDay={isMatchDay}
            isGameEve={dayBefore}
            isRecoveryDay={dayAfter}
            morningSlot={daySlots.morning}
            afternoonSlot={daySlots.afternoon}
            clubPlayers={clubPlayers}
            clubStaff={clubStaff}
            onUpdateGroups={onUpdateSlotGroups}
          />
        )
      })}
    </div>
  )
}
