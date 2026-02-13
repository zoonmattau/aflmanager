/**
 * BracketToolbar — toolbar with preset initialization, add week, and validation status.
 */

import { Plus, CheckCircle2, AlertCircle } from 'lucide-react'
import { FINALS_FORMATS } from '@/engine/season/finalsFormats'
import type { FinalsFormat } from '@/types/finals'
import type { ValidationError } from './bracketValidation'
import { hasBlockingErrors } from './bracketValidation'

interface BracketToolbarProps {
  onInitFromPreset: (format: FinalsFormat) => void
  onAddWeek: () => void
  qualifyingTeams: number
  onSetQualifyingTeams: (count: number) => void
  validationErrors: ValidationError[]
}

export function BracketToolbar({
  onInitFromPreset,
  onAddWeek,
  qualifyingTeams,
  onSetQualifyingTeams,
  validationErrors,
}: BracketToolbarProps) {
  const hasErrors = hasBlockingErrors(validationErrors)
  const errorCount = validationErrors.filter((e) => e.type === 'error').length
  const warningCount = validationErrors.filter((e) => e.type === 'warning').length

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Initialize from preset */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-zinc-500">Load preset:</span>
        <select
          className="h-6 rounded border border-zinc-700 bg-zinc-800 px-1.5 text-[10px] text-zinc-300 outline-none"
          value=""
          onChange={(e) => {
            const fmt = FINALS_FORMATS.find((f) => f.id === e.target.value)
            if (fmt) onInitFromPreset(fmt)
          }}
        >
          <option value="" disabled>
            Select...
          </option>
          {FINALS_FORMATS.map((fmt) => (
            <option key={fmt.id} value={fmt.id}>
              {fmt.name}
            </option>
          ))}
        </select>
      </div>

      {/* Add week */}
      <button
        className="flex h-6 items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 text-[10px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
        onClick={onAddWeek}
      >
        <Plus className="h-3 w-3" />
        Add Week
      </button>

      {/* Qualifying teams */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-zinc-500">Teams:</span>
        <input
          type="number"
          className="h-6 w-10 rounded border border-zinc-700 bg-zinc-800 px-1 text-center text-[10px] text-zinc-300 outline-none"
          value={qualifyingTeams}
          min={2}
          max={18}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10)
            if (!isNaN(val) && val >= 2 && val <= 18) {
              onSetQualifyingTeams(val)
            }
          }}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Validation status */}
      <div className="flex items-center gap-1">
        {hasErrors ? (
          <>
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[10px] text-red-400">
              {errorCount} error{errorCount !== 1 ? 's' : ''}
              {warningCount > 0 && `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`}
            </span>
          </>
        ) : warningCount > 0 ? (
          <>
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] text-amber-400">
              {warningCount} warning{warningCount !== 1 ? 's' : ''}
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            <span className="text-[10px] text-green-400">Valid</span>
          </>
        )}
      </div>
    </div>
  )
}
