import type { MatchTimeSlot } from '@/types/game'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface MatchSlotGridProps {
  slots: MatchTimeSlot[]
  onChange: (slots: MatchTimeSlot[]) => void
}

export function MatchSlotGrid({ slots, onChange }: MatchSlotGridProps) {
  const toggleSlot = (id: string) => {
    const enabledCount = slots.filter((s) => s.enabled).length
    const slot = slots.find((s) => s.id === id)
    // Don't allow disabling the last enabled slot
    if (slot?.enabled && enabledCount <= 1) return

    onChange(
      slots.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    )
  }

  return (
    <div className="space-y-2">
      <Label className="text-zinc-200">Match Time Slots</Label>
      <p className="text-xs text-zinc-500">
        Toggle which time slots are available for fixture scheduling
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {slots.map((slot) => (
          <div
            key={slot.id}
            className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-200">
                {formatDay(slot.day)}
              </p>
              <p className="text-xs text-zinc-500">{slot.time}</p>
            </div>
            <Switch
              checked={slot.enabled}
              onCheckedChange={() => toggleSlot(slot.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDay(day: string): string {
  return day.replace('-', ' ')
}
