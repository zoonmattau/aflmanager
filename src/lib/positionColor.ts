import type { PlayerPositionType } from '@/types/player'
import { POSITION_LINE } from '@/engine/core/constants'
import { cn } from '@/lib/utils'

export type PositionColorGroup = 'DEF' | 'MID' | 'FWD' | 'RK'

type PositionInput = PlayerPositionType | PositionColorGroup

const BASE_BADGE = 'border'

const GROUP_BADGE: Record<PositionColorGroup, string> = {
  DEF: 'border-red-500/35 bg-red-500/15 text-red-700',
  MID: 'border-blue-500/35 bg-blue-500/15 text-blue-700',
  FWD: 'border-green-500/35 bg-green-500/15 text-green-700',
  RK: 'border-yellow-500/40 bg-yellow-500/20 text-yellow-700',
}

const GROUP_BADGE_STRONG: Record<PositionColorGroup, string> = {
  DEF: 'border-red-300/80 bg-red-600/65 text-white',
  MID: 'border-blue-300/80 bg-blue-600/65 text-white',
  FWD: 'border-green-300/80 bg-green-600/65 text-white',
  RK: 'border-yellow-300/90 bg-yellow-400/85 text-zinc-900',
}

const GROUP_BUTTON_ACTIVE: Record<PositionColorGroup, string> = {
  DEF: 'border-red-500/45 bg-red-500/20 text-red-700',
  MID: 'border-blue-500/45 bg-blue-500/20 text-blue-700',
  FWD: 'border-green-500/45 bg-green-500/20 text-green-700',
  RK: 'border-yellow-500/45 bg-yellow-500/25 text-yellow-700',
}

export function getPositionColorGroup(input: PositionInput): PositionColorGroup {
  if (input === 'DEF' || input === 'MID' || input === 'FWD' || input === 'RK') return input
  return POSITION_LINE[input]
}

export function getPositionBadgeClass(input: PositionInput, extra?: string): string {
  const group = getPositionColorGroup(input)
  return cn(BASE_BADGE, GROUP_BADGE[group], extra)
}

export function getPositionBadgeStrongClass(input: PositionInput, extra?: string): string {
  const group = getPositionColorGroup(input)
  return cn(BASE_BADGE, GROUP_BADGE_STRONG[group], extra)
}

export function getPositionFilterButtonClass(
  group: PositionColorGroup,
  selected: boolean,
  extra?: string,
): string {
  return cn(
    selected ? GROUP_BUTTON_ACTIVE[group] : 'border-border text-muted-foreground',
    extra,
  )
}
