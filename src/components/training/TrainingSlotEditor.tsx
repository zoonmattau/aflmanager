import { useMemo } from 'react'
import type { TrainingSlot, TrainingGroup, TrainingFocus, TrainingIntensity } from '@/engine/training/trainingEngine'
import { createDefaultGroup } from '@/engine/training/trainingEngine'
import type { Player } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import { TrainingGroupEditor } from './TrainingGroupEditor'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Plus, Sun, Moon } from 'lucide-react'
import { useState } from 'react'

const FOCUS_SHORT_LABELS: Record<TrainingFocus, string> = {
  kicking: 'Kick',
  handball: 'Hand',
  marking: 'Mark',
  physical: 'Phys',
  contested: 'Cont',
  'game-sense': 'Sense',
  offensive: 'Off',
  defensive: 'Def',
  ruck: 'Ruck',
  mental: 'Ment',
  'set-pieces': 'Set P',
  'match-fitness': 'M-Fit',
  recovery: 'Recov',
}

const INTENSITY_BADGE_COLORS: Record<TrainingIntensity, string> = {
  light: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30',
  moderate: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  intense: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
}

interface TrainingSlotEditorProps {
  slot: TrainingSlot
  slotType: 'morning' | 'afternoon'
  date: string
  clubPlayers: Player[]
  clubStaff: Record<string, StaffMember>
  onUpdateGroups: (groups: TrainingGroup[]) => void
}

export function TrainingSlotEditor({
  slot,
  slotType,
  date: _date,
  clubPlayers,
  clubStaff,
  onUpdateGroups,
}: TrainingSlotEditorProps) {
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)

  const handleUpdateGroup = (index: number, updated: TrainingGroup) => {
    const newGroups = [...slot.groups]
    newGroups[index] = updated
    onUpdateGroups(newGroups)
  }

  const handleRemoveGroup = (index: number) => {
    const newGroups = slot.groups.filter((_, i) => i !== index)
    onUpdateGroups(newGroups)
    setExpandedGroupId(null)
  }

  const handleAddGroup = () => {
    const newGroup = createDefaultGroup('physical', 'moderate')
    // New groups start as non-remainder since there should already be a remainder group
    newGroup.isRemainder = false
    onUpdateGroups([...slot.groups, newGroup])
    setExpandedGroupId(newGroup.id)
  }

  // Collect player IDs assigned to other groups (for disabling in editor)
  const otherGroupPlayerIdsByGroup = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const group of slot.groups) {
      const otherIds = new Set<string>()
      for (const g of slot.groups) {
        if (g.id !== group.id && !g.isRemainder) {
          for (const pid of g.playerIds) otherIds.add(pid)
        }
      }
      map.set(group.id, otherIds)
    }
    return map
  }, [slot.groups])

  const isEmpty = slot.groups.length === 0
  const isSingleRemainder = slot.groups.length === 1 && slot.groups[0].isRemainder

  return (
    <div className="space-y-1.5">
      {/* Slot header */}
      <div className="flex items-center gap-1.5">
        {slotType === 'morning' ? (
          <Sun className="h-3 w-3 text-yellow-500" />
        ) : (
          <Moon className="h-3 w-3 text-blue-400" />
        )}
        <span className="text-[10px] font-medium text-muted-foreground uppercase">
          {slotType === 'morning' ? 'AM' : 'PM'}
        </span>
      </div>

      {isEmpty ? (
        <button
          className="w-full rounded-md border border-dashed px-2 py-3 text-center text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          onClick={handleAddGroup}
        >
          + Add Session
        </button>
      ) : isSingleRemainder && expandedGroupId !== slot.groups[0].id ? (
        // Simplified inline view for single remainder group
        <button
          className="w-full rounded-md border px-2 py-1.5 text-left hover:bg-muted/30 transition-colors"
          onClick={() => setExpandedGroupId(slot.groups[0].id)}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              {FOCUS_SHORT_LABELS[slot.groups[0].focus]}
            </span>
            <Badge
              variant="outline"
              className={cn('text-[10px] h-4 px-1', INTENSITY_BADGE_COLORS[slot.groups[0].intensity])}
            >
              {slot.groups[0].intensity.charAt(0).toUpperCase()}
            </Badge>
          </div>
          <span className="text-[10px] text-muted-foreground">All players</span>
        </button>
      ) : (
        // Multiple groups or expanded view
        <div className="space-y-1.5">
          {slot.groups.map((group, i) => (
            expandedGroupId === group.id ? (
              <div key={group.id} className="space-y-1">
                <TrainingGroupEditor
                  group={group}
                  clubPlayers={clubPlayers}
                  clubStaff={clubStaff}
                  otherGroupPlayerIds={otherGroupPlayerIdsByGroup.get(group.id) ?? new Set()}
                  canRemove={slot.groups.length > 1}
                  onUpdate={(updated) => handleUpdateGroup(i, updated)}
                  onRemove={() => handleRemoveGroup(i)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] w-full"
                  onClick={() => setExpandedGroupId(null)}
                >
                  Collapse
                </Button>
              </div>
            ) : (
              <button
                key={group.id}
                className="w-full rounded-md border px-2 py-1.5 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedGroupId(group.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {FOCUS_SHORT_LABELS[group.focus]}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn('text-[10px] h-4 px-1', INTENSITY_BADGE_COLORS[group.intensity])}
                  >
                    {group.intensity.charAt(0).toUpperCase()}
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {group.isRemainder ? 'All players' : `${group.playerIds.length} players`}
                </span>
              </button>
            )
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] w-full"
            onClick={handleAddGroup}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Group
          </Button>
        </div>
      )}
    </div>
  )
}
