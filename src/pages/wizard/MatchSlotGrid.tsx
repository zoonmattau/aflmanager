import type { MatchTimeSlot } from '@/types/game'
import type { MatchDay } from '@/types/season'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface MatchSlotGridProps {
  slots: MatchTimeSlot[]
  onChange: (slots: MatchTimeSlot[]) => void
}

const NON_STANDARD_DAYS: MatchDay[] = ['Tuesday', 'Wednesday']

const DAY_GROUPS: Array<{
  key: string
  label: string
  days: MatchDay[]
  nonStandard?: boolean
}> = [
  { key: 'tuesday',   label: 'Tuesday',   days: ['Tuesday'],   nonStandard: true },
  { key: 'wednesday', label: 'Wednesday', days: ['Wednesday'], nonStandard: true },
  { key: 'thursday',  label: 'Thursday',  days: ['Thursday'] },
  { key: 'friday',    label: 'Friday',    days: ['Friday'] },
  {
    key: 'saturday',
    label: 'Saturday',
    days: ['Saturday-Early', 'Saturday-Afternoon', 'Saturday-Twilight', 'Saturday-Night'],
  },
  {
    key: 'sunday',
    label: 'Sunday',
    days: ['Sunday-Early', 'Sunday-Afternoon', 'Sunday-Twilight'],
  },
  { key: 'monday', label: 'Monday', days: ['Monday'] },
]

function slotSubLabel(day: MatchDay): string {
  if (day.startsWith('Saturday-')) return day.slice('Saturday-'.length)
  if (day.startsWith('Sunday-')) return day.slice('Sunday-'.length)
  return ''
}

function isRealAflSlot(slot: MatchTimeSlot): boolean {
  return !(NON_STANDARD_DAYS as string[]).includes(slot.day)
}

export function MatchSlotGrid({ slots, onChange }: MatchSlotGridProps) {
  const realSlots = slots.filter(isRealAflSlot)
  const realEnabledCount = realSlots.filter((s) => s.enabled).length
  const realAflOn = realEnabledCount > 0

  const toggleSlot = (id: string) => {
    const enabledCount = slots.filter((s) => s.enabled).length
    const slot = slots.find((s) => s.id === id)
    if (slot?.enabled && enabledCount <= 1) return
    onChange(slots.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)))
  }

  const toggleRealAfl = (on: boolean) => {
    // Must keep at least one slot enabled overall
    const nonStandardEnabled = slots.filter((s) => !isRealAflSlot(s) && s.enabled).length
    if (!on && nonStandardEnabled === 0) return // can't disable everything
    onChange(slots.map((s) => (isRealAflSlot(s) ? { ...s, enabled: on } : s)))
  }

  const toggleDayGroup = (days: MatchDay[], on: boolean) => {
    const daysSet = new Set<string>(days)
    if (!on) {
      // Don't allow disabling if it would leave 0 enabled slots
      const wouldRemain = slots.filter((s) => !daysSet.has(s.day) && s.enabled).length
      if (wouldRemain === 0) return
    }
    onChange(slots.map((s) => (daysSet.has(s.day) ? { ...s, enabled: on } : s)))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-zinc-200">Match Time Slots</Label>
        <p className="text-xs text-zinc-500">
          Toggle which time slots are available for fixture scheduling.
        </p>
      </div>

      {/* Master toggle: Real AFL schedule */}
      <div className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">Real AFL schedule</p>
          <p className="text-xs text-zinc-500">
            Thu – Mon slots ({realEnabledCount}/{realSlots.length} active)
          </p>
        </div>
        <Switch checked={realAflOn} onCheckedChange={toggleRealAfl} />
      </div>

      {/* Per-day groups */}
      <div className={cn('space-y-4', !realAflOn && 'opacity-60 pointer-events-none')}>
        {DAY_GROUPS.filter((g) => !g.nonStandard).map((group) => {
          const groupSlots = slots.filter((s) => (group.days as string[]).includes(s.day))
          if (groupSlots.length === 0) return null
          const activeCount = groupSlots.filter((s) => s.enabled).length
          const allOn = activeCount === groupSlots.length

          return (
            <div key={group.key}>
              <div className="mb-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleDayGroup(group.days, !allOn)}
                  className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {group.label}
                </button>
                <span className="text-[10px] text-zinc-600">
                  {activeCount}/{groupSlots.length} on
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {groupSlots.map((slot) => {
                  const sub = slotSubLabel(slot.day)
                  return (
                    <div
                      key={slot.id}
                      className={cn(
                        'flex items-center justify-between rounded-md border px-3 py-2 transition-opacity',
                        slot.enabled
                          ? 'border-zinc-700 bg-zinc-800/50'
                          : 'border-zinc-800 bg-zinc-900/20 opacity-50',
                      )}
                    >
                      <div className="min-w-0">
                        {sub && <p className="text-[10px] text-zinc-500">{sub}</p>}
                        <p className="text-sm font-medium text-zinc-200">{slot.time}</p>
                      </div>
                      <Switch checked={slot.enabled} onCheckedChange={() => toggleSlot(slot.id)} />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Non-standard days — always shown, independent of real AFL toggle */}
      {DAY_GROUPS.filter((g) => g.nonStandard).map((group) => {
        const groupSlots = slots.filter((s) => (group.days as string[]).includes(s.day))
        if (groupSlots.length === 0) return null
        const activeCount = groupSlots.filter((s) => s.enabled).length

        return (
          <div key={group.key} className="border-t border-zinc-800 pt-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
                {group.label}
              </span>
              <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[10px] leading-none text-amber-400">
                non-standard
              </span>
              <span className="text-[10px] text-zinc-600">{activeCount}/{groupSlots.length} on</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {groupSlots.map((slot) => (
                <div
                  key={slot.id}
                  className={cn(
                    'flex items-center justify-between rounded-md border px-3 py-2 transition-opacity',
                    slot.enabled
                      ? 'border-amber-700/50 bg-amber-900/20'
                      : 'border-zinc-800 bg-zinc-900/20 opacity-50',
                  )}
                >
                  <p className="text-sm font-medium text-zinc-200">{slot.time}</p>
                  <Switch checked={slot.enabled} onCheckedChange={() => toggleSlot(slot.id)} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
