import type { TrainingSlot, TrainingGroup } from '@/engine/training/trainingEngine'
import type { Player } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import { TrainingSlotEditor } from './TrainingSlotEditor'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Swords } from 'lucide-react'

interface DayColumnProps {
  date: string
  dayLabel: string
  dayNumber: string
  isMatchDay: boolean
  isGameEve: boolean
  isRecoveryDay: boolean
  morningSlot: TrainingSlot
  afternoonSlot: TrainingSlot
  clubPlayers: Player[]
  clubStaff: Record<string, StaffMember>
  onUpdateGroups: (date: string, slot: 'morning' | 'afternoon', groups: TrainingGroup[]) => void
}

export function DayColumn({
  date,
  dayLabel,
  dayNumber,
  isMatchDay,
  isGameEve,
  isRecoveryDay,
  morningSlot,
  afternoonSlot,
  clubPlayers,
  clubStaff,
  onUpdateGroups,
}: DayColumnProps) {
  return (
    <div
      className={cn(
        'rounded-lg border flex flex-col min-w-[140px]',
        isMatchDay && 'border-blue-500/50 bg-blue-500/5',
        isGameEve && 'border-amber-500/30',
        isRecoveryDay && 'border-green-500/30',
      )}
    >
      {/* Day header */}
      <div
        className={cn(
          'px-2 py-1.5 border-b text-center',
          isMatchDay && 'bg-blue-500/10 border-blue-500/30',
        )}
      >
        <div className="text-xs font-semibold">{dayLabel}</div>
        <div className="text-[10px] text-muted-foreground">{dayNumber}</div>
        {isMatchDay && (
          <Badge className="mt-1 bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] h-4 px-1.5">
            <Swords className="mr-1 h-2.5 w-2.5" />
            MATCH DAY
          </Badge>
        )}
        {isGameEve && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">
            Game Eve
          </div>
        )}
        {isRecoveryDay && (
          <div className="text-[10px] text-green-600 dark:text-green-400 font-medium mt-0.5">
            Recovery
          </div>
        )}
      </div>

      {/* Slots */}
      {isMatchDay ? (
        <div className="flex-1 flex items-center justify-center p-3">
          <div className="text-center">
            <Swords className="h-6 w-6 mx-auto text-blue-500 mb-1" />
            <p className="text-xs text-muted-foreground">Match scheduled</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-2 space-y-2">
          <TrainingSlotEditor
            slot={morningSlot}
            slotType="morning"
            date={date}
            clubPlayers={clubPlayers}
            clubStaff={clubStaff}
            onUpdateGroups={(groups) => onUpdateGroups(date, 'morning', groups)}
          />
          <div className="border-t" />
          <TrainingSlotEditor
            slot={afternoonSlot}
            slotType="afternoon"
            date={date}
            clubPlayers={clubPlayers}
            clubStaff={clubStaff}
            onUpdateGroups={(groups) => onUpdateGroups(date, 'afternoon', groups)}
          />
        </div>
      )}
    </div>
  )
}
