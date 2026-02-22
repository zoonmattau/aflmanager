import { useMemo, useState } from 'react'
import type { TrainingSlot, TrainingGroup, TrainingFocus, TrainingIntensity } from '@/engine/training/trainingEngine'
import { createDefaultGroup, FOCUS_ATTRIBUTES, getCoachForFocus } from '@/engine/training/trainingEngine'
import type { Player } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import { TrainingGroupEditor } from './TrainingGroupEditor'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Plus, Sun, Moon, X, AlertTriangle, BedDouble } from 'lucide-react'

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

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
  'video-review': 'Video',
  rest: 'Rest',
}

const FOCUS_FULL_LABELS: Record<TrainingFocus, string> = {
  kicking: 'Kicking',
  handball: 'Handball',
  marking: 'Marking',
  physical: 'Physical Conditioning',
  contested: 'Contested Ball',
  'game-sense': 'Game Sense',
  offensive: 'Offensive Play',
  defensive: 'Defensive Skills',
  ruck: 'Ruck Craft',
  mental: 'Mental Strength',
  'set-pieces': 'Set Pieces',
  'match-fitness': 'Match Fitness',
  recovery: 'Recovery',
  'video-review': 'Video Review',
  rest: 'Rest',
}

const INTENSITY_BADGE_COLORS: Record<TrainingIntensity, string> = {
  light: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30',
  moderate: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  intense: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
}

const INTENSITY_TEXT_COLORS: Record<TrainingIntensity, string> = {
  light: 'text-green-600 dark:text-green-400',
  moderate: 'text-yellow-600 dark:text-yellow-400',
  intense: 'text-red-600 dark:text-red-400',
}

// Mirrors the internal constants in trainingEngine.ts
const INTENSITY_FATIGUE_COST: Record<TrainingIntensity, number> = {
  light: 3,
  moderate: 8,
  intense: 15,
}
const INTENSITY_FITNESS_CHANGE: Record<TrainingIntensity, number> = {
  light: 2,
  moderate: 1,
  intense: -3,
}
const INTENSITY_ATTR_MULT: Record<TrainingIntensity, string> = {
  light: '0.5×',
  moderate: '1.0×',
  intense: '1.5×',
}

function formatAttrName(attr: string): string {
  return attr
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

// ---------------------------------------------------------------------------
// SessionDetailPanel — shown when a compact session card is clicked
// ---------------------------------------------------------------------------

interface SessionDetailPanelProps {
  group: TrainingGroup
  clubStaff: Record<string, StaffMember>
  onEdit: () => void
  onClose: () => void
}

function SessionDetailPanel({ group, clubStaff, onEdit, onClose }: SessionDetailPanelProps) {
  const isRest = group.focus === 'rest'
  const attrs = isRest ? [] : (FOCUS_ATTRIBUTES[group.focus] ?? [])
  const fatigueCost = isRest ? null : INTENSITY_FATIGUE_COST[group.intensity]
  const fitnessChange = isRest ? null : INTENSITY_FITNESS_CHANGE[group.intensity]
  const attrMult = isRest ? null : INTENSITY_ATTR_MULT[group.intensity]
  const coach = isRest ? null : getCoachForFocus(group.focus, clubStaff)

  return (
    <div className="rounded-lg border bg-background p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {isRest && <BedDouble className="h-4 w-4 text-sky-500 flex-shrink-0" />}
          <span className="font-semibold text-sm">{FOCUS_FULL_LABELS[group.focus]}</span>
          {!isRest && (
            <span className={cn('ml-1 font-medium capitalize text-xs', INTENSITY_TEXT_COLORS[group.intensity])}>
              {group.intensity}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground mt-0.5 flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isRest ? (
        /* Rest detail */
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Per Session / Player
          </p>
          <div className="grid grid-cols-2 gap-1.5 text-center">
            <div className="rounded bg-sky-500/10 border border-sky-500/20 px-2 py-1.5">
              <p className="text-sm font-bold text-sky-600 dark:text-sky-400">−8</p>
              <p className="text-[10px] text-muted-foreground">Fatigue</p>
            </div>
            <div className="rounded bg-green-500/10 border border-green-500/20 px-2 py-1.5">
              <p className="text-sm font-bold text-green-600 dark:text-green-400">+3</p>
              <p className="text-[10px] text-muted-foreground">Fitness</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">No attribute work</p>
        </div>
      ) : (
        <>
          {/* Target attributes */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Target Attributes
            </p>
            <div className="flex flex-wrap gap-1">
              {attrs.map((attr) => (
                <span
                  key={attr as string}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground/90"
                >
                  {formatAttrName(attr as string)}
                </span>
              ))}
            </div>
          </div>

          {/* Per-session cost */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Per Session / Player
            </p>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded bg-red-500/10 border border-red-500/20 px-2 py-1.5">
                <p className="text-sm font-bold text-red-600 dark:text-red-400">+{fatigueCost}</p>
                <p className="text-[10px] text-muted-foreground">Fatigue</p>
              </div>
              <div
                className={cn(
                  'rounded border px-2 py-1.5',
                  (fitnessChange ?? 0) >= 0
                    ? 'bg-green-500/10 border-green-500/20'
                    : 'bg-orange-500/10 border-orange-500/20',
                )}
              >
                <p
                  className={cn(
                    'text-sm font-bold',
                    (fitnessChange ?? 0) >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-orange-600 dark:text-orange-400',
                  )}
                >
                  {(fitnessChange ?? 0) >= 0 ? '+' : ''}
                  {fitnessChange}
                </p>
                <p className="text-[10px] text-muted-foreground">Fitness</p>
              </div>
              <div className="rounded bg-blue-500/10 border border-blue-500/20 px-2 py-1.5">
                <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{attrMult}</p>
                <p className="text-[10px] text-muted-foreground">Attr Gain</p>
              </div>
            </div>
          </div>

          {/* Coach */}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground min-w-0">
            <span className="font-semibold uppercase tracking-wide flex-shrink-0">Coach</span>
            {coach ? (
              <span className="text-foreground truncate">
                {coach.firstName} {coach.lastName}
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                No specialist
              </span>
            )}
          </div>
        </>
      )}

      {/* Edit button */}
      <div className="flex justify-end pt-0.5">
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={onEdit}>
          Edit Session
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TrainingSlotEditor
// ---------------------------------------------------------------------------

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
  // detailGroupId: showing breakdown panel; expandedGroupId: showing full editor
  const [detailGroupId, setDetailGroupId] = useState<string | null>(null)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)

  const handleUpdateGroup = (index: number, updated: TrainingGroup) => {
    const newGroups = [...slot.groups]
    newGroups[index] = updated
    onUpdateGroups(newGroups)
  }

  const handleRemoveGroup = (index: number) => {
    const removedId = slot.groups[index]?.id
    const newGroups = slot.groups.filter((_, i) => i !== index)
    onUpdateGroups(newGroups)
    if (removedId) {
      if (expandedGroupId === removedId) setExpandedGroupId(null)
      if (detailGroupId === removedId) setDetailGroupId(null)
    }
  }

  const handleAddGroup = () => {
    const newGroup = createDefaultGroup('physical', 'moderate')
    newGroup.isRemainder = false
    onUpdateGroups([...slot.groups, newGroup])
    setDetailGroupId(null)
    setExpandedGroupId(newGroup.id)
  }

  const handleClickCard = (groupId: string) => {
    // Toggle detail; if this card is already in detail, collapse
    if (detailGroupId === groupId) {
      setDetailGroupId(null)
      return
    }
    // If already in edit mode for this group, don't collapse it
    if (expandedGroupId === groupId) return
    setDetailGroupId(groupId)
    setExpandedGroupId(null)
  }

  const handleEditFromDetail = (groupId: string) => {
    setDetailGroupId(null)
    setExpandedGroupId(groupId)
  }

  // Player IDs in other groups (for the editor's player picker)
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
      ) : (
        <div className="space-y-1.5">
          {slot.groups.map((group, i) => {
            const isExpanded = expandedGroupId === group.id
            const isDetail = detailGroupId === group.id

            if (isExpanded) {
              return (
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
              )
            }

            if (isDetail) {
              return (
                <SessionDetailPanel
                  key={group.id}
                  group={group}
                  clubStaff={clubStaff}
                  onEdit={() => handleEditFromDetail(group.id)}
                  onClose={() => setDetailGroupId(null)}
                />
              )
            }

            // Compact card — click opens detail panel
            return (
              <button
                key={group.id}
                className={cn(
                  'w-full rounded-md border px-2 py-1.5 text-left hover:bg-muted/30 transition-colors',
                  group.focus === 'rest' && 'border-sky-500/30 bg-sky-500/5',
                )}
                onClick={() => handleClickCard(group.id)}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="flex items-center gap-1 text-xs font-medium leading-snug">
                    {group.focus === 'rest' && <BedDouble className="h-3 w-3 text-sky-500 flex-shrink-0" />}
                    {FOCUS_FULL_LABELS[group.focus]}
                  </span>
                  {group.focus !== 'rest' && (
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] h-4 px-1 flex-shrink-0 mt-0.5', INTENSITY_BADGE_COLORS[group.intensity])}
                    >
                      {group.intensity.charAt(0).toUpperCase()}
                    </Badge>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {group.isRemainder ? 'All players' : `${group.playerIds.length} players`}
                </span>
              </button>
            )
          })}

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
