import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { Button } from '@/components/ui/button'

export function SimulationOverlay() {
  const simulation = useGameStore((s) => s.simulation)
  const [showLog, setShowLog] = useState(false)

  const progressLabel = useMemo(() => {
    if (!simulation.active) return ''
    if (simulation.progress === null) return 'Working...'
    return `${simulation.progress}%`
  }, [simulation.active, simulation.progress])

  if (!simulation.active) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/75 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <div>
            <p className="text-sm font-semibold">{simulation.title || 'Processing'}</p>
            <p className="text-xs text-muted-foreground">{simulation.detail || 'Please wait...'}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${simulation.progress ?? 35}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{progressLabel}</span>
            {simulation.currentStep !== null && simulation.totalSteps !== null && (
              <span>
                Step {simulation.currentStep}/{simulation.totalSteps}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLog((v) => !v)}
            className="h-7 gap-1 text-xs"
          >
            {showLog ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showLog ? 'Hide Details' : 'Show Details'}
          </Button>
          {showLog && (
            <div className="mt-2 max-h-44 overflow-y-auto rounded border border-border/80 bg-muted/30 p-2">
              {simulation.logs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No detailed logs yet.</p>
              ) : (
                <div className="space-y-1">
                  {simulation.logs.map((line, idx) => (
                    <p key={`${idx}-${line}`} className="font-mono text-[11px] text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

