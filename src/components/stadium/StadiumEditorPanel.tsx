import { useState } from 'react'
import type { CustomStadium, StadiumSurface } from '@/types/stadium'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
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

            {/* Roof */}
            <div className="flex items-center justify-between gap-4">
              <Label className="flex flex-col gap-0.5">
                <span className="text-xs text-zinc-300">Has Roof</span>
                <span className="text-xs font-normal text-zinc-500">
                  Roofed venues never produce wet or windy match conditions
                </span>
              </Label>
              <Switch
                checked={stadium.hasRoof ?? false}
                onCheckedChange={(checked) => onChange({ hasRoof: checked })}
              />
            </div>

            {/* Dimensions */}
            <div>
              <p className="text-xs font-medium text-zinc-300 mb-2">Dimensions</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Length (m) — goal-to-goal</Label>
                  <Input
                    type="number"
                    value={stadium.length}
                    onChange={(e) => onChange({ length: Math.max(100, Math.min(220, parseInt(e.target.value, 10) || 160)) })}
                    min={100}
                    max={220}
                    placeholder="e.g. 165"
                    className="border-zinc-700 bg-zinc-800 text-zinc-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Width (m) — centre</Label>
                  <Input
                    type="number"
                    value={stadium.width}
                    onChange={(e) => onChange({ width: Math.max(80, Math.min(180, parseInt(e.target.value, 10) || 130)) })}
                    min={80}
                    max={180}
                    placeholder="e.g. 130"
                    className="border-zinc-700 bg-zinc-800 text-zinc-100"
                  />
                </div>
              </div>
            </div>

            {/* Ground characteristics */}
            <div>
              <p className="text-xs font-medium text-zinc-300 mb-3">Ground Characteristics</p>
              <div className="space-y-4">
                {/* Scoring coefficient */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400">Scoring Coefficient</Label>
                    <span className="text-xs font-mono text-zinc-300">
                      {stadium.scoringCoefficient.toFixed(2)}
                      {stadium.scoringCoefficient > 1.05
                        ? ' — high-scoring'
                        : stadium.scoringCoefficient < 0.95
                          ? ' — low-scoring'
                          : ' — neutral'}
                    </span>
                  </div>
                  <Slider
                    min={70} max={130} step={1}
                    value={[Math.round(stadium.scoringCoefficient * 100)]}
                    onValueChange={([v]) => onChange({ scoringCoefficient: v / 100 })}
                    className="w-full"
                  />
                  <p className="text-xs text-zinc-500">
                    Multiplier on goal conversion. Compact grounds (&gt;1.0) create more goals per scoring shot; vast open ovals (&lt;1.0) reduce accuracy.
                  </p>
                </div>

                {/* Kick-to-handball ratio */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400">Kick-to-Handball Ratio</Label>
                    <span className="text-xs font-mono text-zinc-300">
                      {stadium.kickToHandballRatio.toFixed(2)}
                      {stadium.kickToHandballRatio > 1.08
                        ? ' — kick-dominant'
                        : stadium.kickToHandballRatio < 0.93
                          ? ' — handball-heavy'
                          : ' — balanced'}
                    </span>
                  </div>
                  <Slider
                    min={60} max={140} step={1}
                    value={[Math.round(stadium.kickToHandballRatio * 100)]}
                    onValueChange={([v]) => onChange({ kickToHandballRatio: v / 100 })}
                    className="w-full"
                  />
                  <p className="text-xs text-zinc-500">
                    Large open ovals reward long kicking (&gt;1.0); rectangular or compact venues push teams towards handballs (&lt;1.0).
                  </p>
                </div>

                {/* Disposal coefficient */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400">Disposal Volume</Label>
                    <span className="text-xs font-mono text-zinc-300">
                      {stadium.disposalCoefficient.toFixed(2)}
                      {stadium.disposalCoefficient > 1.04
                        ? ' — high disposals'
                        : stadium.disposalCoefficient < 0.96
                          ? ' — low disposals'
                          : ' — average'}
                    </span>
                  </div>
                  <Slider
                    min={82} max={118} step={1}
                    value={[Math.round(stadium.disposalCoefficient * 100)]}
                    onValueChange={([v]) => onChange({ disposalCoefficient: v / 100 })}
                    className="w-full"
                  />
                  <p className="text-xs text-zinc-500">
                    Big open grounds tend to produce more total disposals per game. Compact or hot/humid grounds suppress disposal counts.
                  </p>
                </div>

                {/* Mark coefficient */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400">Marking Rate</Label>
                    <span className="text-xs font-mono text-zinc-300">
                      {stadium.markCoefficient.toFixed(2)}
                      {stadium.markCoefficient > 1.06
                        ? ' — marking ground'
                        : stadium.markCoefficient < 0.93
                          ? ' — congested, few marks'
                          : ' — average'}
                    </span>
                  </div>
                  <Slider
                    min={75} max={125} step={1}
                    value={[Math.round(stadium.markCoefficient * 100)]}
                    onValueChange={([v]) => onChange({ markCoefficient: v / 100 })}
                    className="w-full"
                  />
                  <p className="text-xs text-zinc-500">
                    Open ovals with wide corridors allow more marking. Compact or indoor grounds produce a more handball-based, low-marking game.
                  </p>
                </div>

                {/* Contested coefficient */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400">Contested Rate</Label>
                    <span className="text-xs font-mono text-zinc-300">
                      {stadium.contestedCoefficient.toFixed(2)}
                      {stadium.contestedCoefficient > 1.08
                        ? ' — congested, physical'
                        : stadium.contestedCoefficient < 0.93
                          ? ' — open, spread'
                          : ' — balanced'}
                    </span>
                  </div>
                  <Slider
                    min={78} max={125} step={1}
                    value={[Math.round(stadium.contestedCoefficient * 100)]}
                    onValueChange={([v]) => onChange({ contestedCoefficient: v / 100 })}
                    className="w-full"
                  />
                  <p className="text-xs text-zinc-500">
                    Compact grounds amplify contested possessions and tackle counts. Vast ovals like the MCG spread the game and reduce congestion.
                  </p>
                </div>
              </div>
            </div>

            {/* Weather tendencies */}
            <div>
              <p className="text-xs font-medium text-zinc-300 mb-1">Weather Tendencies</p>
              <p className="text-xs text-zinc-500 mb-3">
                Additive bias on top of regional baselines. Positive = more likely; negative = less likely.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { key: 'windBias', label: 'Wind tendency', hint: 'Exposed / coastal' },
                    { key: 'wetBias',  label: 'Rain tendency', hint: 'Wet climate / open roof' },
                    { key: 'hotBias',  label: 'Heat tendency', hint: 'Northern / inland' },
                    { key: 'humidBias',label: 'Humidity tendency', hint: 'Tropical / coastal QLD/NT' },
                  ] as { key: keyof CustomStadium; label: string; hint: string }[]
                ).map(({ key, label, hint }) => {
                  const rawVal = stadium[key] as number
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-zinc-400">{label}</Label>
                        <span className="text-xs font-mono text-zinc-300">
                          {rawVal >= 0 ? '+' : ''}{(rawVal * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Slider
                        min={-20} max={25} step={1}
                        value={[Math.round(rawVal * 100)]}
                        onValueChange={([v]) => onChange({ [key]: v / 100 })}
                        className="w-full"
                      />
                      <p className="text-xs text-zinc-500">{hint}</p>
                    </div>
                  )
                })}
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
    length: 160,
    width: 130,
    scoringCoefficient: 1.0,
    kickToHandballRatio: 1.0,
    disposalCoefficient: 1.0,
    markCoefficient: 1.0,
    contestedCoefficient: 1.0,
    windBias: 0.0,
    wetBias: 0.0,
    hotBias: 0.0,
    humidBias: 0.0,
    hasRoof: false,
  }
}
