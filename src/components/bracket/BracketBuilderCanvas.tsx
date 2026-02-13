/**
 * BracketBuilderCanvas — top-level orchestrator for the custom bracket builder.
 *
 * Initializes draft state, layout measurement, and wiring connections.
 * Converts draft to FinalsFormat on every change and passes to parent.
 */

import { useEffect, useMemo, useState } from 'react'
import type { FinalsFormat } from '@/types/finals'
import { useBracketDraft } from './useBracketDraft'
import { useBracketLayout } from './useBracketLayout'
import { useBracketConnections } from './useBracketConnections'
import { draftToFinalsFormat, finalsFormatToDraft } from './bracketUtils'
import { validateBracketDraft } from './bracketValidation'
import type { ValidationError } from './bracketValidation'
import { BracketToolbar } from './BracketToolbar'
import { BracketGrid } from './BracketGrid'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface BracketBuilderCanvasProps {
  initialFormat?: FinalsFormat
  onChange: (format: FinalsFormat, errors: ValidationError[]) => void
}

export function BracketBuilderCanvas({
  initialFormat,
  onChange,
}: BracketBuilderCanvasProps) {
  const initialDraft = useMemo(
    () => (initialFormat ? finalsFormatToDraft(initialFormat) : undefined),
    // Only compute on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const {
    draft,
    initFromPreset,
    setQualifyingTeams,
    addWeek,
    removeWeek,
    updateWeekLabel,
    addMatch,
    removeMatch,
    updateMatch,
    setLadderSource,
    addConnection,
    removeConnection,
  } = useBracketDraft(initialDraft)

  const {
    containerRef,
    portPositions,
    registerPort,
    requestMeasure,
  } = useBracketLayout()

  const {
    wiring,
    mousePos,
    startWiring,
    cancelWiring,
    completeWiring,
    updateMousePos,
    isValidTarget,
  } = useBracketConnections(draft, addConnection)

  // Validation
  const validationErrors = useMemo(() => validateBracketDraft(draft), [draft])

  // Notify parent on draft changes
  useEffect(() => {
    const format = draftToFinalsFormat(draft)
    onChange(format, validationErrors)
  }, [draft, validationErrors, onChange])

  // Re-measure ports whenever draft structure changes
  useEffect(() => {
    requestMeasure()
  }, [draft.weeks, requestMeasure])

  // Validation error list toggle
  const [showErrors, setShowErrors] = useState(false)

  return (
    <div className="space-y-3">
      <BracketToolbar
        onInitFromPreset={initFromPreset}
        onAddWeek={addWeek}
        qualifyingTeams={draft.qualifyingTeams}
        onSetQualifyingTeams={setQualifyingTeams}
        validationErrors={validationErrors}
      />

      <BracketGrid
        draft={draft}
        containerRef={containerRef}
        portPositions={portPositions}
        wiringState={wiring}
        mousePos={mousePos}
        isValidTarget={isValidTarget}
        onRegisterPort={registerPort}
        onOutputClick={startWiring}
        onInputClick={completeWiring}
        onCancelWiring={cancelWiring}
        onUpdateMousePos={updateMousePos}
        onUpdateMatch={updateMatch}
        onSetLadderSource={setLadderSource}
        onRemoveMatch={removeMatch}
        onRemoveConnection={removeConnection}
        onAddMatch={addMatch}
        onRemoveWeek={removeWeek}
        onUpdateWeekLabel={updateWeekLabel}
      />

      {/* Validation error list (collapsible) */}
      {validationErrors.length > 0 && (
        <div className="rounded-md border border-zinc-700/50 bg-zinc-900/50">
          <button
            className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] text-zinc-400 hover:text-zinc-200"
            onClick={() => setShowErrors(!showErrors)}
          >
            <span>
              {validationErrors.length} issue{validationErrors.length !== 1 ? 's' : ''}
            </span>
            {showErrors ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {showErrors && (
            <div className="border-t border-zinc-700/50 px-3 py-2">
              <ul className="space-y-1">
                {validationErrors.map((err, i) => (
                  <li
                    key={i}
                    className={`text-[10px] ${
                      err.type === 'error' ? 'text-red-400' : 'text-amber-400'
                    }`}
                  >
                    {err.type === 'error' ? '✗' : '⚠'} {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
