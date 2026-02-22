/**
 * PlayerHoverCard / ProspectHoverCard
 *
 * Reusable tooltip-based preview cards for player rows in tables.
 *
 * - Mounted lazily: Radix only renders TooltipContent when the tooltip is open,
 *   so getOverallRating() and other computations run only on first hover.
 * - 300ms delay: prevents accidental triggers while scrolling large tables.
 * - Accessibility: content is purely informational (no interactive elements).
 *   The trigger retains its own semantic role (link, button, span, etc.).
 * - No store subscriptions: player/prospect data is passed by the parent,
 *   which already has it, avoiding per-row subscriptions.
 */

import { useMemo, type ReactNode } from 'react'
import type { Player } from '@/types/player'
import type { DraftProspect } from '@/types/draft'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getOverallRating, getPlayerTier } from '@/engine/player/playerRating'

// ---------------------------------------------------------------------------
// Shared internals
// ---------------------------------------------------------------------------

type Side = 'top' | 'right' | 'bottom' | 'left'

function StatBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

function moraleColor(v: number) {
  return v >= 70 ? 'bg-green-500' : v >= 40 ? 'bg-amber-500' : 'bg-red-500'
}
function fitnessColor(v: number) {
  return v >= 80 ? 'bg-green-500' : v >= 60 ? 'bg-amber-500' : 'bg-red-500'
}

function formatAav(aav: number): string {
  if (aav >= 1_000_000) return `$${(aav / 1_000_000).toFixed(2)}m`
  return `$${Math.round(aav / 1_000)}k`
}

const TIER_OVR_COLOR = {
  elite: 'text-green-500',
  good: 'text-emerald-500',
  average: 'text-yellow-500',
  developing: 'text-orange-400',
  poor: 'text-muted-foreground',
} as const

// ---------------------------------------------------------------------------
// Player card content
// ---------------------------------------------------------------------------

function PlayerCardContent({ player }: { player: Player }) {
  const overall = useMemo(() => getOverallRating(player), [player])
  const tier = getPlayerTier(overall)

  const injury = player.injury
  const susp = player.suspension
  const alertText = injury
    ? `${injury.type} · ${injury.weeksRemaining}w remaining`
    : susp && susp.weeksRemaining > 0
      ? `Suspended · ${susp.weeksRemaining}w`
      : null

  const gp = player.careerStats?.gamesPlayed ?? 0

  return (
    <div className="space-y-2">
      {/* Name + OVR */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-snug">
            {player.firstName} {player.lastName}
          </p>
          <p className="text-[11px] text-muted-foreground">
            #{player.jerseyNumber} · {player.position.primary} · {player.age}yo · {gp} GP
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className={cn('text-lg font-bold leading-none', TIER_OVR_COLOR[tier])}>
            {overall}
          </span>
          <p className="text-[10px] uppercase text-muted-foreground">OVR</p>
        </div>
      </div>

      {/* Stat bars: Form / Morale / Fitness */}
      <div className="grid grid-cols-3 gap-x-2">
        <div>
          <p className="mb-0.5 text-[10px] uppercase text-muted-foreground">Form</p>
          <StatBar value={player.form} color="bg-blue-500" />
          <p className="mt-0.5 text-[10px] font-medium">{player.form}</p>
        </div>
        <div>
          <p className="mb-0.5 text-[10px] uppercase text-muted-foreground">Morale</p>
          <StatBar value={player.morale} color={moraleColor(player.morale)} />
          <p className="mt-0.5 text-[10px] font-medium">{player.morale}</p>
        </div>
        <div>
          <p className="mb-0.5 text-[10px] uppercase text-muted-foreground">Fitness</p>
          <StatBar value={player.fitness} color={fitnessColor(player.fitness)} />
          <p className="mt-0.5 text-[10px] font-medium">{player.fitness}%</p>
        </div>
      </div>

      {/* Injury / suspension alert */}
      {alertText && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-600 dark:text-red-400">
          ⚠ {alertText}
        </div>
      )}

      {/* Contract footer */}
      <div className="flex items-center justify-between border-t border-border pt-1.5 text-[10px] text-muted-foreground">
        <span>
          {player.contract.yearsRemaining}yr · {formatAav(player.contract.aav)}/yr
          {player.isRookie ? ' · Rookie' : ''}
        </span>
        {player.morale < 35 && (
          <span className="font-medium text-amber-500">Unhappy</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public: PlayerHoverCard
// ---------------------------------------------------------------------------

export interface PlayerHoverCardProps {
  player: Player
  children: ReactNode
  side?: Side
}

export function PlayerHoverCard({ player, children, side = 'right' }: PlayerHoverCardProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={6}
          className="w-56 p-3 bg-popover text-popover-foreground border border-border shadow-md"
        >
          <PlayerCardContent player={player} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Draft prospect card content
// ---------------------------------------------------------------------------

const PROSPECT_TIER_LABEL: Record<DraftProspect['tier'], string> = {
  elite: 'Elite',
  'first-round': '1st Round',
  'second-round': '2nd Round',
  late: 'Late Round',
  'rookie-list': 'Rookie List',
}

const PROSPECT_TIER_COLOR: Record<DraftProspect['tier'], string> = {
  elite: 'text-green-500',
  'first-round': 'text-blue-500',
  'second-round': 'text-yellow-500',
  late: 'text-orange-400',
  'rookie-list': 'text-muted-foreground',
}

function ProspectCardContent({
  prospect,
  playerClubId,
}: {
  prospect: DraftProspect
  playerClubId: string
}) {
  const report = prospect.scoutingReports[playerClubId]
  const scoutedOvr = report ? Math.round(report.overallEstimate) : null
  const confidence = report ? Math.round(report.confidence * 100) : 0

  const bg = prospect.background
  const nat = bg.nationalU18Stats

  return (
    <div className="space-y-2">
      {/* Name + scouted OVR */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-snug">
            {prospect.firstName} {prospect.lastName}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {prospect.position.primary} · {prospect.age}yo · {prospect.region}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className={cn('text-lg font-bold leading-none', PROSPECT_TIER_COLOR[prospect.tier])}>
            {scoutedOvr ?? '?'}
          </span>
          <p className="text-[10px] uppercase text-muted-foreground">
            {report ? `${confidence}% conf` : 'unscouted'}
          </p>
        </div>
      </div>

      {/* Tier + archetype + projected pick */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
        <span className={cn('font-semibold', PROSPECT_TIER_COLOR[prospect.tier])}>
          {PROSPECT_TIER_LABEL[prospect.tier]}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="capitalize text-muted-foreground">
          {prospect.archetype.replace(/-/g, ' ')}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">Proj. #{prospect.projectedPick}</span>
      </div>

      {/* Background */}
      <div className="space-y-0.5 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
        <p>{bg.schoolName} ({bg.schoolSystem})</p>
        <p>Jr Club: {bg.juniorClub}</p>
        {bg.stateLeagueClub && (
          <p>{bg.stateLeague}: {bg.stateLeagueClub}</p>
        )}
        <p>
          U18: {nat.matches} gm · {nat.disposalsPerGame.toFixed(1)} disp/gm · {nat.goalsPerGame.toFixed(1)} goals/gm
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public: ProspectHoverCard
// ---------------------------------------------------------------------------

export interface ProspectHoverCardProps {
  prospect: DraftProspect
  playerClubId: string
  children: ReactNode
  side?: Side
}

export function ProspectHoverCard({
  prospect,
  playerClubId,
  children,
  side = 'right',
}: ProspectHoverCardProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={6}
          className="w-60 p-3 bg-popover text-popover-foreground border border-border shadow-md"
        >
          <ProspectCardContent prospect={prospect} playerClubId={playerClubId} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
