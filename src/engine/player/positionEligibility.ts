import type { DraftProspect } from '@/types/draft'
import type { LineupSlot, Player, PlayerPositionType } from '@/types/player'
import { POSITION_LINE, SLOT_POSITION_COMPATIBILITY } from '@/engine/core/constants'
import { getPlayerPositionRatings } from '@/engine/player/playerRating'

export type PositionLine = 'DEF' | 'MID' | 'FWD' | 'RK'

type EligibilityOptions = {
  includeSecondary?: boolean
  includeRated?: boolean
  ratedThreshold?: number
}

const DEFAULT_ELIGIBILITY_OPTIONS: Required<EligibilityOptions> = {
  includeSecondary: true,
  includeRated: true,
  ratedThreshold: 45,
}

function resolveOptions(options?: EligibilityOptions): Required<EligibilityOptions> {
  return {
    includeSecondary: options?.includeSecondary ?? DEFAULT_ELIGIBILITY_OPTIONS.includeSecondary,
    includeRated: options?.includeRated ?? DEFAULT_ELIGIBILITY_OPTIONS.includeRated,
    ratedThreshold: options?.ratedThreshold ?? DEFAULT_ELIGIBILITY_OPTIONS.ratedThreshold,
  }
}

export function getPlayerEligiblePositionTypes(
  player: Player,
  options?: EligibilityOptions,
): PlayerPositionType[] {
  const resolved = resolveOptions(options)
  const ordered = new Set<PlayerPositionType>([player.position.primary])

  if (resolved.includeSecondary) {
    for (const secondary of (player.position.secondary ?? [])) {
      ordered.add(secondary)
    }
  }

  if (resolved.includeRated) {
    const ratingEntries = Object.entries(getPlayerPositionRatings(player))
      .filter(([, rating]) => typeof rating === 'number' && rating >= resolved.ratedThreshold)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))

    for (const [pos] of ratingEntries) {
      ordered.add(pos as PlayerPositionType)
    }
  }

  return [...ordered]
}

export function isPlayerEligibleForPositionType(
  player: Player,
  target: PlayerPositionType,
  options?: EligibilityOptions,
): boolean {
  return getPlayerEligiblePositionTypes(player, options).includes(target)
}

export function isPlayerEligibleForPositionLine(
  player: Player,
  line: PositionLine,
  options?: EligibilityOptions,
): boolean {
  return getPlayerEligiblePositionTypes(player, options).some((pos) => POSITION_LINE[pos] === line)
}

export function getProspectEligiblePositionTypes(prospect: DraftProspect): PlayerPositionType[] {
  const ordered = new Set<PlayerPositionType>([
    prospect.position.primary,
    ...prospect.position.secondary,
  ])
  return [...ordered]
}

export function isProspectEligibleForPositionType(
  prospect: DraftProspect,
  target: PlayerPositionType,
): boolean {
  return getProspectEligiblePositionTypes(prospect).includes(target)
}

export function getPositionSuitabilityForSlot(
  player: Player,
  slot: LineupSlot,
): 'primary' | 'secondary' | 'out-of-position' {
  const compatTypes = SLOT_POSITION_COMPATIBILITY[slot] ?? []
  if (compatTypes.includes(player.position.primary)) return 'primary'
  if (compatTypes.some((target) => isPlayerEligibleForPositionType(player, target))) {
    return 'secondary'
  }
  return 'out-of-position'
}
