import { useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { buildUserStateLeagueContext } from '@/engine/stateLeague/reservesManagement'
import type { UserStateLeagueContext } from '@/engine/stateLeague/reservesManagement'

export interface ReservesContextResult {
  context: UserStateLeagueContext | null
  /** Full league name, e.g. "Victorian Football League" */
  leagueName: string
  /** Short code, e.g. "VFL" */
  leagueShort: string
  hasAffiliation: boolean
}

/**
 * Shared hook that resolves the state-league context for the user's club.
 * All reserves sub-pages use this so the correct league label is always shown.
 */
export function useReservesContext(): ReservesContextResult {
  const stateLeagues = useGameStore((s) => s.stateLeagues)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentRound = useGameStore((s) => s.currentRound)
  const settings = useGameStore((s) => s.settings)

  const context = useMemo(
    () => buildUserStateLeagueContext({ stateLeagues, playerClubId, currentRound, settings }),
    [stateLeagues, playerClubId, currentRound, settings],
  )

  return {
    context,
    leagueName: context?.league.name ?? 'State League',
    leagueShort: context ? context.league.id.toUpperCase() : 'State',
    hasAffiliation: context !== null,
  }
}
