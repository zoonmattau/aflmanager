import { useState } from 'react'
import type { TrainingGroup, TrainingFocus, TrainingIntensity } from '@/engine/training/trainingEngine'
import { getCoachForFocus } from '@/engine/training/trainingEngine'
import type { Player } from '@/types/player'
import type { StaffMember } from '@/types/staff'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { X, CheckCircle2, AlertTriangle, Users } from 'lucide-react'

const FOCUS_OPTIONS: { value: TrainingFocus; label: string }[] = [
  { value: 'kicking', label: 'Kicking' },
  { value: 'handball', label: 'Handball' },
  { value: 'marking', label: 'Marking' },
  { value: 'physical', label: 'Physical' },
  { value: 'contested', label: 'Contested Ball' },
  { value: 'game-sense', label: 'Game Sense' },
  { value: 'offensive', label: 'Offensive' },
  { value: 'defensive', label: 'Defensive' },
  { value: 'ruck', label: 'Ruck Craft' },
  { value: 'mental', label: 'Mental' },
  { value: 'set-pieces', label: 'Set Pieces' },
  { value: 'match-fitness', label: 'Match Fitness' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'video-review', label: 'Video Review' },
  { value: 'rest', label: 'Rest' },
]

const INTENSITY_OPTIONS: { value: TrainingIntensity; label: string; color: string }[] = [
  { value: 'light', label: 'Light', color: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30' },
  { value: 'moderate', label: 'Moderate', color: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30' },
  { value: 'intense', label: 'Intense', color: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30' },
]

type PositionFilter = 'All' | 'Defenders' | 'Midfielders' | 'Forwards' | 'Rucks'

const POSITION_FILTERS: PositionFilter[] = ['All', 'Defenders', 'Midfielders', 'Forwards', 'Rucks']

const POSITION_FILTER_MAP: Record<PositionFilter, string[]> = {
  All: [],
  Defenders: ['BP', 'FB', 'HBF', 'CHB'],
  Midfielders: ['W', 'IM', 'OM'],
  Forwards: ['HFF', 'CHF', 'FP', 'FF'],
  Rucks: ['RK'],
}

interface TrainingGroupEditorProps {
  group: TrainingGroup
  clubPlayers: Player[]
  clubStaff: Record<string, StaffMember>
  otherGroupPlayerIds: Set<string>
  canRemove: boolean
  onUpdate: (updated: TrainingGroup) => void
  onRemove: () => void
}

export function TrainingGroupEditor({
  group,
  clubPlayers,
  clubStaff,
  otherGroupPlayerIds,
  canRemove,
  onUpdate,
  onRemove,
}: TrainingGroupEditorProps) {
  const [showPlayerPicker, setShowPlayerPicker] = useState(false)
  const [posFilter, setPosFilter] = useState<PositionFilter>('All')

  const coach = getCoachForFocus(group.focus, clubStaff)

  const handleFocusChange = (focus: TrainingFocus) => {
    onUpdate({ ...group, focus, assignedCoachId: null })
  }

  const handleIntensityChange = (intensity: TrainingIntensity) => {
    onUpdate({ ...group, intensity })
  }

  const handleToggleRemainder = (isRemainder: boolean) => {
    onUpdate({ ...group, isRemainder, playerIds: isRemainder ? [] : group.playerIds })
  }

  const handleTogglePlayer = (playerId: string) => {
    const existing = group.playerIds.includes(playerId)
    const newIds = existing
      ? group.playerIds.filter((id) => id !== playerId)
      : [...group.playerIds, playerId]
    onUpdate({ ...group, playerIds: newIds, isRemainder: false })
  }

  const filteredPlayers = clubPlayers
    .filter((p) => !p.injury)
    .filter((p) => {
      if (posFilter === 'All') return true
      return POSITION_FILTER_MAP[posFilter].includes(p.position.primary)
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName))

  const assignedPlayers = clubPlayers.filter((p) => group.playerIds.includes(p.id))

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      {/* Focus selector */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium">Focus</label>
        <Select value={group.focus} onValueChange={(v) => handleFocusChange(v as TrainingFocus)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FOCUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Intensity selector (3 buttons) — hidden for rest */}
      {group.focus !== 'rest' && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Intensity</label>
          <div className="flex gap-1">
            {INTENSITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={cn(
                  'flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                  group.intensity === opt.value
                    ? opt.color
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
                onClick={() => handleIntensityChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Coach auto-display — hidden for rest */}
      {group.focus !== 'rest' && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Coach</label>
          {coach ? (
            <div className="flex items-center gap-2 text-xs">
              <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                {coach.firstName.charAt(0)}{coach.lastName.charAt(0)}
              </div>
              <span className="truncate">{coach.firstName} {coach.lastName}</span>
              <span className="text-muted-foreground capitalize">({coach.role.replace(/-/g, ' ')})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-3 w-3" />
              <span>No specialist</span>
            </div>
          )}
        </div>
      )}

      {/* Rest info */}
      {group.focus === 'rest' && (
        <div className="rounded-md bg-sky-500/10 border border-sky-500/20 px-2.5 py-2 text-xs text-sky-700 dark:text-sky-300 space-y-0.5">
          <p className="font-medium">Players rest this session</p>
          <p className="text-[10px] text-muted-foreground">Fatigue −8 · Fitness +3 · No attribute work</p>
        </div>
      )}

      {/* Player assignment */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground font-medium">Players</label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Whole Squad</span>
            <Switch
              checked={group.isRemainder}
              onCheckedChange={handleToggleRemainder}
              className="scale-75"
            />
          </div>
        </div>

        {group.isRemainder ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">All unassigned players</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {assignedPlayers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {assignedPlayers.map((p) => (
                  <Badge
                    key={p.id}
                    variant="secondary"
                    className="text-[10px] flex items-center gap-0.5 pr-0.5 h-5"
                  >
                    {p.firstName.charAt(0)}. {p.lastName}
                    <button
                      className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
                      onClick={() => handleTogglePlayer(p.id)}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] w-full"
              onClick={() => setShowPlayerPicker(!showPlayerPicker)}
            >
              {showPlayerPicker ? 'Hide Players' : `Select Players (${group.playerIds.length})`}
            </Button>

            {showPlayerPicker && (
              <div className="space-y-1.5">
                {/* Position group filter */}
                <div className="flex gap-1 flex-wrap">
                  {POSITION_FILTERS.map((f) => (
                    <button
                      key={f}
                      className={cn(
                        'rounded px-2 py-0.5 text-[10px] border transition-colors',
                        posFilter === f
                          ? 'bg-primary/15 text-primary border-primary/30'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                      onClick={() => setPosFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                {/* Player list */}
                <div className="rounded-md border bg-muted/30 p-1.5 max-h-36 overflow-y-auto space-y-0.5">
                  {filteredPlayers.map((p) => {
                    const isSelected = group.playerIds.includes(p.id)
                    const isInOtherGroup = otherGroupPlayerIds.has(p.id)
                    return (
                      <button
                        key={p.id}
                        disabled={isInOtherGroup}
                        className={cn(
                          'w-full flex items-center justify-between rounded px-1.5 py-0.5 text-[10px] transition-colors',
                          isInOtherGroup
                            ? 'opacity-40 cursor-not-allowed'
                            : isSelected
                              ? 'bg-primary/15 text-foreground'
                              : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                        )}
                        onClick={() => !isInOtherGroup && handleTogglePlayer(p.id)}
                      >
                        <span>{p.firstName.charAt(0)}. {p.lastName}</span>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                            {p.position.primary}
                          </Badge>
                          {isSelected && <CheckCircle2 className="h-2.5 w-2.5 text-primary" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Remove button */}
      {canRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] w-full text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <X className="mr-1 h-3 w-3" />
          Remove Group
        </Button>
      )}
    </div>
  )
}
