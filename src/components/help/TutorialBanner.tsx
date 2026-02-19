/**
 * TutorialBanner — a dismissable contextual hint banner shown at the top of a page.
 *
 * Dismissed state is remembered in localStorage per pageId so it persists across
 * sessions without requiring any game-state changes.
 *
 * Usage:
 *   <TutorialBanner
 *     pageId="salary-cap"
 *     title="Understanding your Salary Cap"
 *     tips={[
 *       'Cap Room shows how much you can still commit this season.',
 *       'Rookie-listed players have a separate cap allowance.',
 *     ]}
 *   />
 *
 * Hidden entirely when globalSettings.showTutorialHints is false.
 */

import { useState, useEffect } from 'react'
import { X, Lightbulb } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'afl-tutorial-dismissed:'

function isDismissed(pageId: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${pageId}`) === '1'
  } catch {
    return false
  }
}

function setDismissed(pageId: string) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${pageId}`, '1')
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TutorialBannerProps {
  /** Unique identifier for this page's banner (used for dismiss persistence) */
  pageId: string
  /** Short heading shown next to the lightbulb icon */
  title: string
  /** List of tip strings rendered as bullet points */
  tips: string[]
  /** Optional extra className */
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TutorialBanner({ pageId, title, tips, className }: TutorialBannerProps) {
  const showHints = useAppStore((s) => s.globalSettings.showTutorialHints)
  const [visible, setVisible] = useState(false)

  // Read dismiss state after mount (avoids SSR mismatch if ever server-rendered)
  useEffect(() => {
    if (showHints && !isDismissed(pageId)) {
      setVisible(true)
    }
  }, [showHints, pageId])

  if (!visible) return null

  function handleDismiss() {
    setDismissed(pageId)
    setVisible(false)
  }

  return (
    <div
      className={cn(
        'relative mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm',
        className,
      )}
    >
      {/* Header row */}
      <div className="mb-1.5 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 flex-shrink-0 text-amber-400" />
        <span className="font-medium text-amber-300">{title}</span>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss hint"
          className="ml-auto flex-shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tips */}
      <ul className="ml-6 space-y-0.5 text-xs text-muted-foreground">
        {tips.map((tip, i) => (
          <li key={i} className="list-disc leading-relaxed">
            {tip}
          </li>
        ))}
      </ul>
    </div>
  )
}
