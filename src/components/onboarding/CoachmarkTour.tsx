/**
 * CoachmarkTour — lightweight first-session onboarding overlay.
 *
 * - Spotlights sidebar nav links with a non-blocking ring highlight
 * - Tooltip card is pointer-events: auto (capturable); everything else passes through
 * - Completion tracked in localStorage (key: afl:tour-v1)
 * - Never repeats after completion
 * - Can be restarted via resetTour() (dispatches a custom event)
 */

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TOUR_STEPS } from './tourSteps'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOUR_KEY = 'afl:tour-v1'
const TOUR_RESET_EVENT = 'afl-tour-reset'
const AUTOSTART_DELAY_MS = 1400
const TOOLTIP_WIDTH = 312

// ---------------------------------------------------------------------------
// Public API — reset function called from Settings
// ---------------------------------------------------------------------------

export function resetTour(): void {
  try {
    localStorage.removeItem(TOUR_KEY)
  } catch {
    // ignore quota/security errors
  }
  window.dispatchEvent(new CustomEvent(TOUR_RESET_EVENT))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SpotRect {
  left: number
  top: number
  width: number
  height: number
}

function computeSpotRect(selector: string, padding: number): SpotRect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  // Skip elements with zero size (hidden or collapsed)
  if (r.width === 0 && r.height === 0) return null
  return {
    left: r.left - padding,
    top: r.top - padding,
    width: r.width + padding * 2,
    height: r.height + padding * 2,
  }
}

function tooltipPosition(spot: SpotRect | null): React.CSSProperties {
  if (!spot) {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }
  const spotRight = spot.left + spot.width
  const rawLeft = spotRight + 16
  const left = Math.min(rawLeft, window.innerWidth - TOOLTIP_WIDTH - 8)
  const rawTop = spot.top + spot.height / 2 - 96
  const top = Math.max(8, Math.min(rawTop, window.innerHeight - 220))
  return { left, top }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CoachmarkTour() {
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [spot, setSpot] = useState<SpotRect | null>(null)

  // ── Auto-start on first visit ─────────────────────────────────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
      if (localStorage.getItem(TOUR_KEY) !== 'done') {
        timer = setTimeout(() => setActive(true), AUTOSTART_DELAY_MS)
      }
    } catch {
      // localStorage blocked — silently skip tour
    }
    return () => { if (timer) clearTimeout(timer) }
  }, [])

  // ── Listen for resetTour() events ─────────────────────────────────────────
  useEffect(() => {
    function handler() {
      setStep(0)
      setActive(true)
    }
    window.addEventListener(TOUR_RESET_EVENT, handler)
    return () => window.removeEventListener(TOUR_RESET_EVENT, handler)
  }, [])

  // ── Recompute spotlight when step changes ─────────────────────────────────
  useLayoutEffect(() => {
    if (!active) return
    const { targetSelector, padding } = TOUR_STEPS[step]

    function update() {
      setSpot(computeSpotRect(targetSelector, padding))
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [active, step])

  // ── Actions ───────────────────────────────────────────────────────────────

  function complete() {
    try { localStorage.setItem(TOUR_KEY, 'done') } catch {}
    setActive(false)
  }

  function handleNext() {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      complete()
    }
  }

  function handleSkip() {
    complete()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!active) return null

  const currentStep = TOUR_STEPS[step]
  const isLast = step === TOUR_STEPS.length - 1
  const tipPos = tooltipPosition(spot)

  return createPortal(
    <>
      {/* ── Spotlight ring (non-blocking, passes clicks through) ── */}
      {spot && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: spot.left,
            top: spot.top,
            width: spot.width,
            height: spot.height,
            borderRadius: 7,
            // Large box-shadow creates the dark mask outside the spotlight
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.42)',
            border: '2px solid rgba(139,92,246,0.75)',
            pointerEvents: 'none',
            zIndex: 9990,
            transition: 'left 200ms ease, top 200ms ease, width 200ms ease, height 200ms ease',
          }}
        />
      )}

      {/* ── Tooltip card (pointer-events captured) ── */}
      <div
        role="dialog"
        aria-label={`Onboarding step ${step + 1} of ${TOUR_STEPS.length}: ${currentStep.title}`}
        style={{
          position: 'fixed',
          width: TOOLTIP_WIDTH,
          zIndex: 9991,
          pointerEvents: 'auto',
          ...tipPos,
        }}
      >
        <Card className="shadow-2xl border-primary/25 bg-card">
          <CardContent className="p-4">
            {/* Header */}
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold leading-snug">{currentStep.title}</h3>
              <button
                type="button"
                onClick={handleSkip}
                aria-label="Skip tour"
                className="mt-0.5 shrink-0 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Body */}
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              {currentStep.body}
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between">
              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {TOUR_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-200',
                      i === step
                        ? 'w-4 bg-primary'
                        : i < step
                          ? 'w-1.5 bg-primary/40'
                          : 'w-1.5 bg-muted-foreground/25',
                    )}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={handleSkip}
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={handleNext}
                >
                  {isLast ? (
                    "Let's play!"
                  ) : (
                    <>
                      Next
                      <ChevronRight className="ml-0.5 h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>,
    document.body,
  )
}
