import { useMemo, useCallback, useEffect, useState } from 'react'
import type { FinalsSettings } from '@/types/game'
import type { LeagueConfig } from '@/types/expansion'
import type { FinalsFormat, FinalsWeekDefinition, FinalsMatchupRule, TeamSource } from '@/types/finals'
import { FINALS_FORMATS, getEffectiveFinalsFormat } from '@/engine/season/finalsFormats'
import { computeQualificationRules } from '@/engine/season/finalsQualification'
import { hasTopFourDoubleChanceAdvantage } from '@/engine/season/finalsFormats'
import { QualificationExplainer } from '@/components/finals/QualificationExplainer'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { createEmptyDraft, draftToFinalsFormat } from '@/components/bracket/bracketUtils'

interface FinalsFormatEditorProps {
  finals: FinalsSettings
  onChange: (finals: FinalsSettings) => void
  leagueConfig?: LeagueConfig
}

function isUsableFinalsFormat(format: FinalsFormat | undefined): format is FinalsFormat {
  return Boolean(format && Array.isArray(format.weeks) && typeof format.qualifyingTeams === 'number')
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

export function FinalsFormatEditor({ finals, onChange, leagueConfig }: FinalsFormatEditorProps) {
  const [customSystemName, setCustomSystemName] = useState(
    finals.customFinalsFormat?.name ?? 'Custom Finals',
  )
  const [saveTick, setSaveTick] = useState(0)

  useEffect(() => {
    if (finals.finalsFormat === 'custom') {
      setCustomSystemName(finals.customFinalsFormat?.name ?? 'Custom Finals')
    }
  }, [finals.finalsFormat, finals.customFinalsFormat?.name])

  const selectedFormat = useMemo(
    () => FINALS_FORMATS.find((f) => f.id === finals.finalsFormat) ?? null,
    [finals.finalsFormat],
  )

  const isCustom = finals.finalsFormat === 'custom'

  // Effective format reflects the qualifying teams slider
  const effectiveFormat = useMemo(
    () => getEffectiveFinalsFormat(
      finals.finalsFormat,
      finals.finalsQualifyingTeams,
      finals.customFinalsFormat,
    ),
    [finals.finalsFormat, finals.finalsQualifyingTeams, finals.customFinalsFormat],
  )

  // Is the bracket auto-adapted (different from preset)?
  const isAutoAdapted = useMemo(() => {
    if (isCustom) return false
    if (!selectedFormat) return false
    return selectedFormat.qualifyingTeams !== finals.finalsQualifyingTeams
  }, [isCustom, selectedFormat, finals.finalsQualifyingTeams])

  // Qualification rules for conferences/divisions
  const qualificationRules = useMemo(() => {
    if (!leagueConfig) return null
    const model = leagueConfig.competitionModel ?? 'single-table'
    if (model === 'single-table') return null
    const doubleChance = hasTopFourDoubleChanceAdvantage(effectiveFormat)
    return computeQualificationRules(leagueConfig, finals.finalsQualifyingTeams, doubleChance)
  }, [leagueConfig, finals.finalsQualifyingTeams, effectiveFormat])

  const handleBracketChange = useCallback(
    (format: FinalsFormat, _errors: ValidationError[]) => {
      const sameQualifying = finals.finalsQualifyingTeams === format.qualifyingTeams
      const namedFormat: FinalsFormat = {
        ...format,
        id: finals.customFinalsFormat?.id ?? 'custom',
        name: finals.customFinalsFormat?.name ?? (customSystemName.trim() || 'Custom Finals'),
        description: finals.customFinalsFormat?.description ?? 'Custom finals format created by the user.',
      }
      const sameFormat = JSON.stringify(finals.customFinalsFormat) === JSON.stringify(namedFormat)
      if (sameQualifying && sameFormat) return
      onChange({
        ...finals,
        customFinalsFormat: namedFormat,
        finalsQualifyingTeams: format.qualifyingTeams,
      })
    },
    [finals, onChange, customSystemName],
  )

  const saveCustomSystemMeta = useCallback(() => {
    const currentFormat = finals.customFinalsFormat ?? draftToFinalsFormat(createEmptyDraft())
    const trimmed = customSystemName.trim()
    const safeName = trimmed.length > 0 ? trimmed : 'Custom Finals'
    const slug = safeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    onChange({
      ...finals,
      finalsFormat: 'custom',
      customFinalsFormat: {
        ...currentFormat,
        id: slug ? `custom-${slug}` : 'custom',
        name: safeName,
        description: `Custom finals system: ${safeName}.`,
      },
      finalsQualifyingTeams: currentFormat.qualifyingTeams,
    })
    setSaveTick((v) => v + 1)
  }, [customSystemName, finals, onChange])

  return (
    <div className="space-y-4">
      {/* Format selector */}
      <div className="space-y-1.5">
        <Label className="text-zinc-200">Finals Format</Label>
        <Select
          value={finals.finalsFormat}
          onValueChange={(val) => {
            const fmt = FINALS_FORMATS.find((f) => f.id === val)
            const switchingToCustom = val === 'custom'
            const safeCustom = isUsableFinalsFormat(finals.customFinalsFormat)
              ? finals.customFinalsFormat
              : draftToFinalsFormat(createEmptyDraft())
            onChange({
              ...finals,
              finalsFormat: val as FinalsSettings['finalsFormat'],
              finalsQualifyingTeams: fmt?.qualifyingTeams ?? finals.finalsQualifyingTeams,
              customFinalsFormat: switchingToCustom ? safeCustom : finals.customFinalsFormat,
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
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">
              Build your own finals bracket by adding weeks, matches, and wiring connections between them.
            </p>
            <div className="rounded-md border border-zinc-700 bg-zinc-900/40 p-2">
              <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-1">
                  <Label className="text-zinc-200">System Name</Label>
                  <Input
                    value={customSystemName}
                    onChange={(e) => setCustomSystemName(e.target.value)}
                    placeholder="Enter custom finals system name"
                    className="h-8 border-zinc-700 bg-zinc-800/60 text-white"
                  />
                </div>
                <Button className="h-8" onClick={saveCustomSystemMeta}>
                  Save System
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-zinc-500">
                Saved version: {saveTick}
              </p>
            </div>
          </div>
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
        <div className="space-y-3">
          <BracketBuilderCanvas
            initialFormat={finals.customFinalsFormat}
            onChange={handleBracketChange}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {isAutoAdapted && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Bracket auto-adapted for {finals.finalsQualifyingTeams} teams
              {selectedFormat && ` (${selectedFormat.name} preset is designed for ${selectedFormat.qualifyingTeams})`}.
              A seeded knockout bracket has been generated.
            </div>
          )}
          <BracketPreview format={effectiveFormat} />
        </div>
      )}

      {/* Qualification rules for conferences/divisions */}
      {qualificationRules && <QualificationExplainer rules={qualificationRules} />}
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
      <Card className="border-zinc-600 bg-zinc-800/60">
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
      <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-200">
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
          ? 'border-amber-400/90 bg-amber-500/25'
          : matchup.isElimination
            ? 'border-red-400/90 bg-red-500/25'
            : 'border-blue-400/90 bg-blue-500/25',
      )}
    >
      <p className="mb-1 text-center text-[10px] font-bold text-zinc-100">
        {matchup.label}
        {matchup.isElimination && matchup.finalType !== 'GF' && (
          <span className="ml-1 text-red-200">(elim)</span>
        )}
      </p>
      <div className="space-y-0.5 text-[10px]">
        <div className="flex items-center justify-between">
          <span className="rounded bg-black/35 px-1 text-zinc-100">H</span>
          <span className="text-zinc-100">{describeTeamSource(matchup.home)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="rounded bg-black/35 px-1 text-zinc-100">A</span>
          <span className="text-zinc-100">{describeTeamSource(matchup.away)}</span>
        </div>
      </div>
    </div>
  )
}
