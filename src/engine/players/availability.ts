import type { Player } from '@/types/player'

export function getSuspensionWeeksRemaining(player: Player): number {
  return Math.max(0, player.suspension?.weeksRemaining ?? 0)
}

export function isPlayerSuspended(player: Player): boolean {
  return getSuspensionWeeksRemaining(player) > 0
}

