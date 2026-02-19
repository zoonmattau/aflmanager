/**
 * HelpTooltip — a small info-circle icon that opens a contextual help popover.
 *
 * Usage:
 *   <HelpTooltip topic="salary-cap" />
 *   <HelpTooltip topic="draft-tiers" side="right" />
 *   <HelpTooltip title="Custom title" body={['paragraph one', 'paragraph two']} />
 *
 * Respects the globalSettings.showTutorialHints flag — renders nothing when
 * the user has disabled tutorial hints.
 */

import { HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { HELP_CONTENT, type HelpTopicKey, type HelpEntry } from './helpContent'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Side = 'top' | 'right' | 'bottom' | 'left'
type Size = 'sm' | 'md'

interface BaseProps {
  /** Popover placement relative to the trigger */
  side?: Side
  /** Icon size variant */
  size?: Size
  /** Extra className on the trigger icon */
  className?: string
}

type TopicProps = BaseProps & {
  topic: HelpTopicKey
  title?: never
  body?: never
  learnMorePath?: never
  learnMoreLabel?: never
}

type InlineProps = BaseProps & {
  topic?: never
  title: string
  body: string[]
  learnMorePath?: string
  learnMoreLabel?: string
}

export type HelpTooltipProps = TopicProps | InlineProps

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HelpTooltip({
  topic,
  title,
  body,
  learnMorePath,
  learnMoreLabel,
  side = 'top',
  size = 'sm',
  className,
}: HelpTooltipProps) {
  const showHints = useAppStore((s) => s.globalSettings.showTutorialHints)
  if (!showHints) return null

  const entry: HelpEntry = topic
    ? HELP_CONTENT[topic]
    : { title: title!, body: body!, learnMorePath, learnMoreLabel }

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Help: ${entry.title}`}
          className={cn(
            'inline-flex items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            className,
          )}
        >
          <HelpCircle className={iconSize} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        className="w-80 space-y-2 p-4"
      >
        <p className="text-sm font-semibold leading-none">{entry.title}</p>
        <div className="space-y-1.5">
          {entry.body.map((paragraph, i) => (
            <p key={i} className="text-xs text-muted-foreground leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
        {entry.learnMorePath && (
          <Link
            to={entry.learnMorePath}
            className="inline-block text-xs text-primary underline underline-offset-2 hover:opacity-80"
          >
            {entry.learnMoreLabel ?? 'Learn more'}
          </Link>
        )}
      </PopoverContent>
    </Popover>
  )
}
