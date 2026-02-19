import { useState } from 'react'
import type { CustomStadium, StadiumSurface } from '@/types/stadium'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'

const SURFACE_LABELS: Record<StadiumSurface, string> = {
  grass: 'Natural Grass',
  synthetic: 'Synthetic Turf',
  hybrid: 'Hybrid Grass',
}

const AUSTRALIAN_STATES = [
  'VIC', 'NSW', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT',
]

export interface StadiumEditorPanelProps {
  stadium: CustomStadium
  onChange: (updates: Partial<CustomStadium>) => void
  onDelete?: () => void
}

export function StadiumEditorPanel({ stadium, onChange, onDelete }: StadiumEditorPanelProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="border-zinc-700 bg-zinc-900/40">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-3 w-3 shrink-0 rounded-full border border-zinc-600 bg-zinc-700"
            />
            <div className="min-w-0">
              <span className="block font-medium text-sm truncate">{stadium.name || 'Unnamed Stadium'}</span>
              <span className="block text-xs text-zinc-400 truncate">
                {stadium.city && stadium.state ? `${stadium.city}, ${stadium.state}` : 'No location set'}
                {stadium.capacity > 0 ? ` · ${stadium.capacity.toLocaleString()} cap` : ''}
                {' · '}{SURFACE_LABELS[stadium.surface]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-500 hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete() }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            )}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-zinc-800 px-4 pb-4 pt-3 space-y-4">
            {/* Identity */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Stadium Name</Label>
                <Input
                  value={stadium.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                  placeholder="e.g. Melbourne Cricket Ground"
                  className="border-zinc-700 bg-zinc-800 text-zinc-100"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Opened (Year)</Label>
                <Input
                  type="number"
                  value={stadium.opened}
                  onChange={(e) => onChange({ opened: parseInt(e.target.value, 10) || stadium.opened })}
                  min={1850}
                  max={2100}
                  className="border-zinc-700 bg-zinc-800 text-zinc-100"
                />
              </div>
            </div>

            {/* Location */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">City / Suburb</Label>
                <Input
                  value={stadium.city}
                  onChange={(e) => onChange({ city: e.target.value })}
                  placeholder="e.g. East Melbourne"
                  className="border-zinc-700 bg-zinc-800 text-zinc-100"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">State / Territory</Label>
                <Select
                  value={stadium.state}
                  onValueChange={(val) => onChange({ state: val })}
                >
                  <SelectTrigger className="border-zinc-700 bg-zinc-800 text-zinc-100">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {AUSTRALIAN_STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                    <SelectItem value="International">International</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Capacity & Surface */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Capacity</Label>
                <Input
                  type="number"
                  value={stadium.capacity}
                  onChange={(e) => onChange({ capacity: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  min={0}
                  max={200000}
                  placeholder="e.g. 100024"
                  className="border-zinc-700 bg-zinc-800 text-zinc-100"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Playing Surface</Label>
                <Select
                  value={stadium.surface}
                  onValueChange={(val) => onChange({ surface: val as StadiumSurface })}
                >
                  <SelectTrigger className="border-zinc-700 bg-zinc-800 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SURFACE_LABELS) as [StadiumSurface, string][]).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Notes (optional)</Label>
              <Input
                value={stadium.notes ?? ''}
                onChange={(e) => onChange({ notes: e.target.value })}
                placeholder="e.g. Shared with cricket, AFL heritage venue"
                className="border-zinc-700 bg-zinc-800 text-zinc-100"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function createDefaultStadium(): CustomStadium {
  return {
    id: crypto.randomUUID(),
    name: '',
    city: '',
    state: 'VIC',
    capacity: 30000,
    surface: 'grass',
    opened: 2026,
  }
}
