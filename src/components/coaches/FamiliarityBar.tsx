import type { CoachFamiliarityTier } from '@/types/coach'
import { FAMILIARITY_THRESHOLDS } from '@/engine/coaching/coachKnowledgeEngine'
import { cn } from '@/lib/utils'

const TIER_COLORS: Record<CoachFamiliarityTier, string> = {
  unknown: 'bg-muted-foreground',
  aware: 'bg-blue-500',
  familiar: 'bg-sky-400',
  'well-scouted': 'bg-green-500',
  'book-on': 'bg-amber-500',
}

const TIER_LABELS: Record<CoachFamiliarityTier, string> = {
  unknown: 'Unknown',
  aware: 'Aware',
  familiar: 'Familiar',
  'well-scouted': 'Well Scouted',
  'book-on': 'Book On',
}

interface FamiliarityBarProps {
  familiarity: number
  tier: CoachFamiliarityTier
  showLabel?: boolean
  className?: string
}

export function FamiliarityBar({ familiarity, tier, showLabel = true, className }: FamiliarityBarProps) {
  return (
    <div className={cn('space-y-1', className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Familiarity</span>
          <span className={cn('font-medium', getTierTextColor(tier))}>
            {TIER_LABELS[tier]}
          </span>
        </div>
      )}
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', TIER_COLORS[tier])}
          style={{ width: `${Math.min(100, familiarity)}%` }}
        />
        {/* Tier markers */}
        {Object.entries(FAMILIARITY_THRESHOLDS)
          .filter(([key]) => key !== 'unknown')
          .map(([, threshold]) => (
            <div
              key={threshold}
              className="absolute top-0 bottom-0 w-px bg-background/50"
              style={{ left: `${threshold}%` }}
            />
          ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>{familiarity}/100</span>
      </div>
    </div>
  )
}

function getTierTextColor(tier: CoachFamiliarityTier): string {
  switch (tier) {
    case 'unknown': return 'text-muted-foreground'
    case 'aware': return 'text-blue-500'
    case 'familiar': return 'text-sky-400'
    case 'well-scouted': return 'text-green-500'
    case 'book-on': return 'text-amber-500'
  }
}

export function TierBadge({ tier }: { tier: CoachFamiliarityTier }) {
  const BADGE_CLASSES: Record<CoachFamiliarityTier, string> = {
    unknown: 'bg-muted text-muted-foreground',
    aware: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    familiar: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    'well-scouted': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'book-on': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  }

  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', BADGE_CLASSES[tier])}>
      {TIER_LABELS[tier]}
    </span>
  )
}
