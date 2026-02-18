/**
 * BracketBuilderCanvas - top-level orchestrator for the custom bracket builder.
 *
 * Initializes draft state, layout measurement, and wiring connections.
 * Converts draft to FinalsFormat on every change and passes to parent.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { FinalsFormat } from '@/types/finals'
import { useBracketDraft } from './useBracketDraft'
import { useBracketLayout } from './useBracketLayout'
import { useBracketConnections } from './useBracketConnections'
import { draftToFinalsFormat, finalsFormatToDraft } from './bracketUtils'
import { validateBracketDraft } from './bracketValidation'
import type { ValidationError } from './bracketValidation'
import { BracketToolbar } from './BracketToolbar'
import { BracketGrid } from './BracketGrid'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

interface BracketBuilderCanvasProps {
  initialFormat?: FinalsFormat
  onChange: (format: FinalsFormat, errors: ValidationError[]) => void
}

function isUsableFinalsFormat(format: FinalsFormat | undefined): format is FinalsFormat {
  return Boolean(format && Array.isArray(format.weeks) && typeof format.qualifyingTeams === 'number')
}

export function BracketBuilderCanvas({
  initialFormat,
  onChange,
}: BracketBuilderCanvasProps) {
  const onChangeRef = useRef(onChange)
  const lastEmitRef = useRef<string | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const initialDraft = useMemo(
    () => (isUsableFinalsFormat(initialFormat) ? finalsFormatToDraft(initialFormat) : undefined),
    // Only compute on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const {
    draft,
    initFromPreset,
    addWeek,
    moveWeek,
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
    const signature = JSON.stringify({ format, validationErrors })
    if (lastEmitRef.current === signature) return
    lastEmitRef.current = signature
    onChangeRef.current(format, validationErrors)
  }, [draft, validationErrors])

  // Re-measure ports whenever draft structure changes
  useEffect(() => {
    requestMeasure()
  }, [draft.weeks, requestMeasure])

  return (
    <div className="space-y-3">
      <BracketToolbar
        onInitFromPreset={initFromPreset}
        onAddWeek={addWeek}
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
        onMoveWeek={moveWeek}
        onRemoveWeek={removeWeek}
        onUpdateWeekLabel={updateWeekLabel}
      />

      <div className="rounded-md border border-zinc-700/50 bg-zinc-900/50 px-3 py-2">
        {validationErrors.length === 0 ? (
          <div className="flex items-center gap-1 text-[10px] text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            <span>No validation issues</span>
          </div>
        ) : (
          <ul className="space-y-1">
            {validationErrors.map((err, i) => (
              <li
                key={i}
                className={`flex items-center gap-1 text-[10px] ${
                  err.type === 'error' ? 'text-red-400' : 'text-amber-400'
                }`}
              >
                <AlertCircle className="h-3 w-3" />
                <span>{err.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
