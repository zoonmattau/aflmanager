import { useMemo, useCallback } from 'react'
import type { FinalsSettings } from '@/types/game'
import type { FinalsFormat, FinalsWeekDefinition, FinalsMatchupRule, TeamSource } from '@/types/finals'
import { FINALS_FORMATS } from '@/engine/season/finalsFormats'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { BracketBuilderCanvas } from '@/components/bracket/BracketBuilderCanvas'
import type { ValidationError } from '@/components/bracket/bracketValidation'

interface FinalsFormatEditorProps {
  finals: FinalsSettings
  onChange: (finals: FinalsSettings) => void
}

function describeTeamSource(src: TeamSource): string {
  if (src.type === 'ladder') return `${ordinal(src.rank ?? 1)} on ladder`
  const outcome = src.outcome === 'winner' ? 'Winner' : 'Loser'
  return `${outcome} W${src.weekRef ?? '?'}M${(src.matchRef ?? 0) + 1}`
}

function ordinal(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

export function FinalsFormatEditor({ finals, onChange }: FinalsFormatEditorProps) {
  const selectedFormat = useMemo(
    () => FINALS_FORMATS.find((f) => f.id === finals.finalsFormat) ?? null,
    [finals.finalsFormat],
  )

  const isCustom = finals.finalsFormat === 'custom'

  const handleBracketChange = useCallback(
    (format: FinalsFormat, _errors: ValidationError[]) => {
      onChange({
        ...finals,
        customFinalsFormat: format,
        finalsQualifyingTeams: format.qualifyingTeams,
      })
    },
    [finals, onChange],
  )

  return (
    <div className="space-y-4">
      {/* Format selector */}
      <div className="space-y-1.5">
        <Label className="text-zinc-200">Finals Format</Label>
        <Select
          value={finals.finalsFormat}
          onValueChange={(val) => {
            const fmt = FINALS_FORMATS.find((f) => f.id === val)
            onChange({
              ...finals,
              finalsFormat: val as FinalsSettings['finalsFormat'],
              finalsQualifyingTeams: fmt?.qualifyingTeams ?? finals.finalsQualifyingTeams,
            })
          }}
        >
          <SelectTrigger className="w-full border-zinc-700 bg-zinc-800/50 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FINALS_FORMATS.map((fmt) => (
              <SelectItem key={fmt.id} value={fmt.id}>
                {fmt.name}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        {selectedFormat && (
          <p className="text-xs text-zinc-500">{selectedFormat.description}</p>
        )}
        {isCustom && (
          <p className="text-xs text-zinc-500">
            Build your own finals bracket by adding weeks, matches, and wiring connections between them.
          </p>
        )}
      </div>

      {/* Qualifying teams slider (for presets only; custom manages its own) */}
      {!isCustom && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-zinc-200">Qualifying Teams</Label>
            <span className="text-sm font-bold tabular-nums text-zinc-200">
              {finals.finalsQualifyingTeams}
            </span>
          </div>
          <Slider
            value={[finals.finalsQualifyingTeams]}
            onValueChange={([val]) =>
              onChange({ ...finals, finalsQualifyingTeams: val })
            }
            min={2}
            max={18}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>2</span>
            <span>8 (standard)</span>
            <span>18</span>
          </div>
        </div>
      )}

      {/* Bracket Preview (presets) or Bracket Builder (custom) */}
      {isCustom ? (
        <BracketBuilderCanvas
          initialFormat={finals.customFinalsFormat}
          onChange={handleBracketChange}
        />
      ) : (
        selectedFormat && <BracketPreview format={selectedFormat} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bracket Preview
// ---------------------------------------------------------------------------

function BracketPreview({ format }: { format: FinalsFormat }) {
  return (
    <div className="space-y-2">
      <Label className="text-zinc-200">Bracket Preview</Label>
      <Card className="border-zinc-700 bg-zinc-800/30">
        <CardContent className="p-4">
          <div className="flex gap-4 overflow-x-auto pb-2">
            {format.weeks.map((week) => (
              <WeekColumn key={week.weekNumber} week={week} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function WeekColumn({ week }: { week: FinalsWeekDefinition }) {
  return (
    <div className="flex min-w-[160px] flex-col gap-2">
      <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {week.label}
      </p>
      {week.matchups.map((matchup, i) => (
        <MatchupBox key={i} matchup={matchup} />
      ))}
    </div>
  )
}

function MatchupBox({ matchup }: { matchup: FinalsMatchupRule }) {
  return (
    <div
      className={cn(
        'rounded-md border p-2',
        matchup.finalType === 'GF'
          ? 'border-amber-500/50 bg-amber-500/10'
          : matchup.isElimination
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-blue-500/30 bg-blue-500/5',
      )}
    >
      <p className="mb-1 text-center text-[10px] font-bold text-zinc-300">
        {matchup.label}
        {matchup.isElimination && matchup.finalType !== 'GF' && (
          <span className="ml-1 text-red-400">(elim)</span>
        )}
      </p>
      <div className="space-y-0.5 text-[10px]">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">H:</span>
          <span className="text-zinc-300">{describeTeamSource(matchup.home)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">A:</span>
          <span className="text-zinc-300">{describeTeamSource(matchup.away)}</span>
        </div>
      </div>
    </div>
  )
}
