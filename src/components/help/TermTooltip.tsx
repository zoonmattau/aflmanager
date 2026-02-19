/**
 * TermTooltip — inline contextual definition for a glossary term.
 *
 * Two usage patterns:
 *
 * 1. Icon-only (placed beside an existing label):
 *    <TermTooltip id="aav" />
 *
 * 2. Inline term wrapper (underlines the term text and shows an icon):
 *    <TermTooltip id="aav">Average Annual Value</TermTooltip>
 *
 * The component is always visible regardless of tutorial-hint settings —
 * it is a reference tool, not a tutorial prompt.
 *
 * The popover shows the term's `summary` and links to /glossary#{id}.
 */

import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getGlossaryEntry } from '@/data/glossary'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TermTooltipProps {
  /** Glossary entry id (e.g. "aav", "soft-cap") */
  id: string
  /**
   * When provided, wraps children in the trigger and underlines them.
   * When omitted, renders only the info icon as the trigger.
   */
  children?: ReactNode
  /** Popover placement relative to the trigger */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Extra className on the root element */
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TermTooltip({
  id,
  children,
  side = 'top',
  className,
}: TermTooltipProps) {
  const entry = getGlossaryEntry(id)

  // Silently do nothing if the id is not registered — avoids broken UI.
  if (!entry) {
    return children ? <>{children}</> : null
  }

  // Icon-only mode: just the info icon acts as the trigger.
  if (!children) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Definition: ${entry.term}`}
            className={cn(
              'inline-flex items-center justify-center align-middle rounded-full',
              'text-muted-foreground/50 transition-colors hover:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'ml-0.5',
              className,
            )}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side={side} align="start" className="w-72 space-y-2 p-4">
          <TermPopoverBody entry={entry} />
        </PopoverContent>
      </Popover>
    )
  }

  // Inline mode: the term text and a trailing icon together form the trigger.
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Definition: ${entry.term}`}
          className={cn(
            'inline-flex items-baseline gap-0.5 align-baseline cursor-help',
            'border-b border-dotted border-muted-foreground/40 hover:border-muted-foreground/70',
            'text-inherit font-inherit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm',
            'transition-colors',
            className,
          )}
        >
          {children}
          <Info className="h-3 w-3 self-center shrink-0 text-muted-foreground/50 ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align="start" className="w-72 space-y-2 p-4">
        <TermPopoverBody entry={entry} />
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Popover body (shared)
// ---------------------------------------------------------------------------

function TermPopoverBody({ entry }: { entry: ReturnType<typeof getGlossaryEntry> }) {
  if (!entry) return null
  return (
    <>
      <p className="text-sm font-semibold leading-snug">{entry.term}</p>
      {entry.aliases && entry.aliases.length > 0 && (
        <p className="text-[11px] text-muted-foreground/70 -mt-1">
          Also: {entry.aliases.join(', ')}
        </p>
      )}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {entry.summary}
      </p>
      <Link
        to={`/glossary#${entry.id}`}
        className="inline-block text-xs text-primary underline underline-offset-2 hover:opacity-80"
      >
        Full definition in Glossary
      </Link>
    </>
  )
}
