import type { Player } from '@/types/player'
import type { StateLeague, StateLeagueClub } from '@/types/stateLeague'
import type { GameState } from '@/types/game'
import { getLineupSlots } from '@/engine/core/constants'
import { isPlayerSuspended } from '@/engine/players/availability'
import { resolveStateLeagueAffiliation, ensureStateLeagueFixtures } from '@/engine/stateLeague/stateLeagueEngine'
import { hasActiveStateLeagueContract, isStateLeagueContracted } from '@/engine/players/contracts'

export interface UserStateLeagueContext {
  leagueId: string
  league: StateLeague
  club: StateLeagueClub
  roundNumber: number
  fixture: {
    homeClubId: string
    awayClubId: string
    homeScore: number
    awayScore: number
  } | null
  opponent: StateLeagueClub | null
  isHome: boolean
  lastResult: {
    homeScore: number
    awayScore: number
    wasHome: boolean
  } | null
}

function playerSelectionScore(player: Player, youthFocus: boolean): number {
  const attrs = Object.values(player.attributes)
  const mean = attrs.reduce((sum, value) => sum + value, 0) / attrs.length
  const youthBoost = youthFocus && player.age <= 22 ? 6 : 0
  return mean * 0.45 + player.form * 0.35 + player.fitness * 0.2 + youthBoost
}

export function buildUserStateLeagueContext(
  state: Pick<GameState, 'stateLeagues' | 'playerClubId' | 'currentRound' | 'settings'>,
): UserStateLeagueContext | null {
  const affiliation = resolveStateLeagueAffiliation(
    state.stateLeagues,
    state.playerClubId,
    state.settings.stateLeagueAffiliations,
  )
  if (!affiliation) return null

  const league = ensureStateLeagueFixtures(affiliation.league)
  const roundNumber = state.currentRound + 1
  const round = league.season.rounds.find((r) => r.number === roundNumber) ?? null
  const fixture = round?.results.find(
    (m) => m.homeClubId === affiliation.club.id || m.awayClubId === affiliation.club.id,
  ) ?? null
  const isHome = fixture ? fixture.homeClubId === affiliation.club.id : false
  const opponent = fixture
    ? league.clubs.find((c) => c.id === (isHome ? fixture.awayClubId : fixture.homeClubId)) ?? null
    : null

  let lastResult: UserStateLeagueContext['lastResult'] = null
  for (let i = roundNumber - 1; i >= 1; i--) {
    const prev = league.season.rounds.find((r) => r.number === i)
    if (!prev) continue
    const match = prev.results.find((m) => m.homeClubId === affiliation.club.id || m.awayClubId === affiliation.club.id)
    if (!match) continue
    if (match.homeScore <= 0 && match.awayScore <= 0) continue
    lastResult = {
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      wasHome: match.homeClubId === affiliation.club.id,
    }
    break
  }

  return {
    leagueId: affiliation.leagueId,
    league,
    club: affiliation.club,
    roundNumber,
    fixture,
    opponent,
    isHome,
    lastResult,
  }
}

export function getUserReservesEligiblePool(state: Pick<GameState, 'players' | 'playerClubId' | 'selectedLineup'>): Player[] {
  const selectedAFLIds = new Set(Object.values(state.selectedLineup ?? {}).filter((id): id is string => Boolean(id)))
  return Object.values(state.players)
    .filter((p) => p.clubId === state.playerClubId)
    .filter((p) => !selectedAFLIds.has(p.id))
    .filter((p) => !isStateLeagueContracted(p) || hasActiveStateLeagueContract(p))
    .filter((p) => !p.injury && !isPlayerSuspended(p))
}

export function projectReservesLineup(
  players: Player[],
  reserves: Pick<GameState['reserves'], 'managedLineupPlayerIds' | 'managedLineupSlotAssignments' | 'playerAvailabilityAssignments' | 'delegationEnabled' | 'tactics'>,
  interchangePlayers: number,
): { selectedIds: string[]; lineupMap: Record<string, string> } {
  const playable = players.filter((p) => reserves.playerAvailabilityAssignments[p.id] !== 'rest')
  const explicitPlay = playable
    .filter((p) => reserves.playerAvailabilityAssignments[p.id] === 'play')
    .sort((a, b) => playerSelectionScore(b, reserves.tactics.youthFocus) - playerSelectionScore(a, reserves.tactics.youthFocus))
  const explicitPlayIds = explicitPlay.map((p) => p.id)
  const explicitSet = new Set(explicitPlayIds)
  const forcedSlotIds = Object.values(reserves.managedLineupSlotAssignments ?? {})
    .filter((id): id is string => Boolean(id))
    .filter((id) => playable.some((p) => p.id === id) && !explicitSet.has(id))

  const remaining = playable
    .filter((p) => !explicitSet.has(p.id))
    .sort((a, b) => playerSelectionScore(b, reserves.tactics.youthFocus) - playerSelectionScore(a, reserves.tactics.youthFocus))

  const managed = reserves.managedLineupPlayerIds.filter((id) => playable.some((p) => p.id === id) && !explicitSet.has(id))
  const forcedSet = new Set(forcedSlotIds)
  const selectedIds = reserves.delegationEnabled
    ? [...explicitPlayIds, ...forcedSlotIds, ...remaining.map((p) => p.id).filter((id) => !forcedSet.has(id))].slice(0, 23)
    : [
      ...explicitPlayIds,
      ...forcedSlotIds,
      ...managed.filter((id) => !forcedSet.has(id)),
      ...remaining.map((p) => p.id).filter((id) => !forcedSet.has(id) && !managed.includes(id)),
    ].slice(0, 23)

  const slots = getLineupSlots(interchangePlayers).slice(0, selectedIds.length)
  const lineupMap: Record<string, string> = {}
  const selectedSet = new Set(selectedIds)
  const assigned = new Set<string>()

  for (const slot of slots) {
    const explicit = reserves.managedLineupSlotAssignments?.[slot]
    if (!explicit) continue
    if (!selectedSet.has(explicit) || assigned.has(explicit)) continue
    lineupMap[slot] = explicit
    assigned.add(explicit)
  }

  const fallback = selectedIds.filter((id) => !assigned.has(id))
  let idx = 0
  for (const slot of slots) {
    if (lineupMap[slot]) continue
    const nextId = fallback[idx++]
    if (!nextId) continue
    lineupMap[slot] = nextId
  }
  return { selectedIds, lineupMap }
}
