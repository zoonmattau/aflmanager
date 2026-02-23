import { cn } from '@/lib/utils'
import {
  Star,
  Swords,
  Trophy,
  Zap,
  HeartCrack,
  Medal,
  Target,
  TrendingUp,
  Flame,
  Crown,
  ShieldCheck,
  ShieldOff,
  ShieldPlus,
} from 'lucide-react'
import type { PlayerMoment, PlayerMomentType } from '@/types/player'

// ---------------------------------------------------------------------------
// Moment visual config
// ---------------------------------------------------------------------------

interface MomentMeta {
  icon: React.ElementType
  /** Tailwind classes for the icon wrapper */
  iconCls: string
  /** Tailwind classes for the card border/background */
  cardCls: string
  /** Tailwind classes for the title text */
  titleCls: string
}

const META: Record<PlayerMomentType, MomentMeta> = {
  'debut': {
    icon: Star,
    iconCls: 'bg-blue-500/20 text-blue-400',
    cardCls: 'border-blue-500/30 bg-blue-500/5',
    titleCls: 'text-blue-400',
  },
  'first-goal': {
    icon: Target,
    iconCls: 'bg-emerald-500/20 text-emerald-400',
    cardCls: 'border-emerald-500/30 bg-emerald-500/5',
    titleCls: 'text-emerald-400',
  },
  'first-bog': {
    icon: Flame,
    iconCls: 'bg-orange-500/20 text-orange-400',
    cardCls: 'border-orange-500/30 bg-orange-500/5',
    titleCls: 'text-orange-400',
  },
  'breakout-game': {
    icon: Zap,
    iconCls: 'bg-yellow-500/20 text-yellow-400',
    cardCls: 'border-yellow-500/30 bg-yellow-500/5',
    titleCls: 'text-yellow-400',
  },
  'milestone-games': {
    icon: Medal,
    iconCls: 'bg-amber-500/20 text-amber-400',
    cardCls: 'border-amber-500/30 bg-amber-500/5',
    titleCls: 'text-amber-400',
  },
  'milestone-goals': {
    icon: Target,
    iconCls: 'bg-amber-500/20 text-amber-400',
    cardCls: 'border-amber-500/30 bg-amber-500/5',
    titleCls: 'text-amber-400',
  },
  'finals-hero': {
    icon: Swords,
    iconCls: 'bg-purple-500/20 text-purple-400',
    cardCls: 'border-purple-500/30 bg-purple-500/5',
    titleCls: 'text-purple-400',
  },
  'premiership': {
    icon: Crown,
    iconCls: 'bg-yellow-400/20 text-yellow-300',
    cardCls: 'border-yellow-400/40 bg-yellow-400/5',
    titleCls: 'text-yellow-300',
  },
  'major-injury': {
    icon: HeartCrack,
    iconCls: 'bg-red-500/20 text-red-400',
    cardCls: 'border-red-500/30 bg-red-500/5',
    titleCls: 'text-red-400',
  },
  'brownlow-medal': {
    icon: Trophy,
    iconCls: 'bg-yellow-500/20 text-yellow-400',
    cardCls: 'border-yellow-500/40 bg-yellow-500/8',
    titleCls: 'text-yellow-400',
  },
  'coleman-medal': {
    icon: Trophy,
    iconCls: 'bg-orange-500/20 text-orange-400',
    cardCls: 'border-orange-500/30 bg-orange-500/5',
    titleCls: 'text-orange-400',
  },
  'all-australian': {
    icon: Star,
    iconCls: 'bg-green-500/20 text-green-400',
    cardCls: 'border-green-500/30 bg-green-500/5',
    titleCls: 'text-green-400',
  },
  'club-bnf': {
    icon: TrendingUp,
    iconCls: 'bg-cyan-500/20 text-cyan-400',
    cardCls: 'border-cyan-500/30 bg-cyan-500/5',
    titleCls: 'text-cyan-400',
  },
  'captain-appointed': {
    icon: ShieldCheck,
    iconCls: 'bg-yellow-500/20 text-yellow-400',
    cardCls: 'border-yellow-500/30 bg-yellow-500/5',
    titleCls: 'text-yellow-400',
  },
  'captain-relinquished': {
    icon: ShieldOff,
    iconCls: 'bg-zinc-500/20 text-zinc-400',
    cardCls: 'border-zinc-500/30 bg-zinc-500/5',
    titleCls: 'text-zinc-400',
  },
  'vc-appointed': {
    icon: ShieldPlus,
    iconCls: 'bg-amber-500/20 text-amber-400',
    cardCls: 'border-amber-500/30 bg-amber-500/5',
    titleCls: 'text-amber-400',
  },
}

function roundLabel(round: number, isFinal: boolean): string {
  if (round === -1) return 'End of Season'
  if (isFinal) return `Finals – Wk ${round}`
  return `Round ${round}`
}

// ---------------------------------------------------------------------------
// Compact timeline card (used in MomentsFeed)
// ---------------------------------------------------------------------------

interface MomentCardProps {
  moment: PlayerMoment
  opponentName?: string
  /** Show full stats row beneath the description */
  showStats?: boolean
}

export function MomentCard({ moment, opponentName, showStats = true }: MomentCardProps) {
  const meta = META[moment.type]
  const Icon = meta.icon

  return (
    <div className={cn('rounded-lg border px-3 py-2.5 space-y-1.5', meta.cardCls)}>
      {/* Header row */}
      <div className="flex items-start gap-2.5">
        <div className={cn('mt-0.5 shrink-0 rounded-full p-1.5', meta.iconCls)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn('text-xs font-semibold', meta.titleCls)}>{moment.title}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
              {moment.year} · {roundLabel(moment.round, moment.isFinal)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{moment.description}</p>
          {opponentName && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">vs {opponentName}</p>
          )}
        </div>
      </div>

      {/* Stats chips */}
      {showStats && moment.stats && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-8">
          {moment.stats.disposals != null && (
            <StatChip label="D" value={moment.stats.disposals} />
          )}
          {moment.stats.goals != null && moment.stats.goals > 0 && (
            <StatChip label="G" value={moment.stats.goals} />
          )}
          {moment.stats.marks != null && moment.stats.marks > 0 && (
            <StatChip label="M" value={moment.stats.marks} />
          )}
          {moment.stats.tackles != null && moment.stats.tackles > 0 && (
            <StatChip label="T" value={moment.stats.tackles} />
          )}
          {moment.stats.hitouts != null && moment.stats.hitouts > 0 && (
            <StatChip label="HO" value={moment.stats.hitouts} />
          )}
          {moment.stats.matchRating != null && (
            <StatChip label="★" value={moment.stats.matchRating.toFixed(1)} highlight />
          )}
        </div>
      )}
    </div>
  )
}

function StatChip({
  label,
  value,
  highlight,
}: {
  label: string
  value: number | string
  highlight?: boolean
}) {
  return (
    <span className={cn('text-[10px] font-mono', highlight ? 'font-bold text-amber-400' : 'text-muted-foreground')}>
      {label} <span className="font-semibold">{value}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Dramatic full-width card (used in PostMatchReview moments tab)
// ---------------------------------------------------------------------------

interface DramaticMomentCardProps {
  moment: PlayerMoment
  playerName: string
  opponentName?: string
}

export function DramaticMomentCard({ moment, playerName, opponentName }: DramaticMomentCardProps) {
  const meta = META[moment.type]
  const Icon = meta.icon

  return (
    <div className={cn('rounded-xl border-2 px-5 py-4 space-y-3', meta.cardCls)}>
      {/* Icon + type label */}
      <div className="flex items-center gap-2">
        <div className={cn('rounded-full p-2', meta.iconCls)}>
          <Icon className="h-5 w-5" />
        </div>
        <span className={cn('text-sm font-bold tracking-wide uppercase', meta.titleCls)}>
          {moment.title}
        </span>
      </div>

      {/* Player name big */}
      <div>
        <p className="text-xl font-bold leading-tight">{playerName}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{moment.description}</p>
        {opponentName && (
          <p className="text-xs text-muted-foreground/60 mt-1">vs {opponentName}</p>
        )}
      </div>

      {/* Stats strip */}
      {moment.stats && (
        <div className="flex flex-wrap gap-4 pt-1 border-t border-white/10">
          {moment.stats.disposals != null && (
            <BigStatChip label="Disposals" value={moment.stats.disposals} />
          )}
          {moment.stats.goals != null && moment.stats.goals > 0 && (
            <BigStatChip label="Goals" value={moment.stats.goals} />
          )}
          {moment.stats.marks != null && moment.stats.marks > 0 && (
            <BigStatChip label="Marks" value={moment.stats.marks} />
          )}
          {moment.stats.tackles != null && moment.stats.tackles > 0 && (
            <BigStatChip label="Tackles" value={moment.stats.tackles} />
          )}
          {moment.stats.matchRating != null && (
            <BigStatChip label="Rating" value={moment.stats.matchRating.toFixed(1)} highlight />
          )}
        </div>
      )}

      {/* Milestone number callout */}
      {moment.value != null && (
        <div className={cn('text-4xl font-black tabular-nums text-center py-2', meta.titleCls)}>
          {moment.value}
        </div>
      )}
    </div>
  )
}

function BigStatChip({
  label,
  value,
  highlight,
}: {
  label: string
  value: number | string
  highlight?: boolean
}) {
  return (
    <div className="text-center">
      <div className={cn('text-2xl font-bold tabular-nums', highlight ? 'text-amber-400' : 'text-foreground')}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  )
}
