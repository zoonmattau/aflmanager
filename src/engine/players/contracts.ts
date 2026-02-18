import type { Player } from '@/types/player'

export function getPlayerContractTier(player: Player): 'afl-listed' | 'state-league' {
  return player.contractTier === 'state-league' ? 'state-league' : 'afl-listed'
}

export function isStateLeagueContracted(player: Player): boolean {
  return getPlayerContractTier(player) === 'state-league'
}

export function isAflListedPlayer(player: Player): boolean {
  return getPlayerContractTier(player) === 'afl-listed'
}

export function canBeSelectedForAfl(player: Player): boolean {
  return isAflListedPlayer(player)
}

export function hasActiveStateLeagueContract(player: Player): boolean {
  return isStateLeagueContracted(player) && (player.stateLeagueContract?.yearsRemaining ?? 0) > 0
}
