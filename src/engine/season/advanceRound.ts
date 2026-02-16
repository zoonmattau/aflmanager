import { simulateMatch } from '@/engine/match/simulateMatch'
import type { MatchRulesSettings } from '@/types/game'
import type { Match } from '@/types/match'
import type { Round } from '@/types/season'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { SeasonVenueState } from '@/types/venue'
import { getVenueHGA, getTravelFatigue, getClubState } from '@/engine/venues/venueEngine'
import { VENUES } from '@/data/venues'

interface SimRoundInput {
  round: Round
  roundIndex: number
  players: Record<string, Player>
  clubs: Record<string, Club>
  rngSeed: number
  playerClubId: string
  matchRules?: MatchRulesSettings
  venueState?: SeasonVenueState | null
}

export interface SimRoundResult {
  matches: Match[]
  userMatch: Match | null
}

/**
 * Simulate all matches in a round and return results.
 * Does NOT mutate any store state - caller is responsible for that.
 */
export function simulateRound(input: SimRoundInput): SimRoundResult {
  const { round, roundIndex, players, clubs, rngSeed, playerClubId } = input

  const matches: Match[] = round.fixtures.map((fixture, i) => {
    // Resolve venue-specific HGA and travel fatigue
    let venueHGA: number | undefined
    let travelFatigue: { home: number; away: number } | undefined

    if (input.venueState) {
      const assignment = input.venueState.assignments.find(
        (a) => a.roundNumber === round.number && a.fixtureIndex === i,
      )
      if (assignment) {
        venueHGA = getVenueHGA(assignment.venueId, fixture.homeClubId)
        const venueObj = VENUES[assignment.venueId]
        if (venueObj) {
          const homeState = getClubState(fixture.homeClubId)
          const awayState = getClubState(fixture.awayClubId)
          travelFatigue = {
            home: getTravelFatigue(homeState, venueObj.state),
            away: getTravelFatigue(awayState, venueObj.state),
          }
        }
      }
    }

    return simulateMatch({
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
      venue: fixture.venue,
      round: roundIndex,
      players,
      clubs,
      seed: rngSeed + roundIndex * 100 + i,
      isFinal: round.isFinals,
      matchRules: input.matchRules,
      venueHGA,
      travelFatigue,
    })
  })

  const userMatch = matches.find(
    (m) => m.homeClubId === playerClubId || m.awayClubId === playerClubId
  ) ?? null

  return { matches, userMatch }
}

/**
 * Check if the regular season is complete.
 * Uses the total number of rounds in the season (settings-driven).
 */
export function isRegularSeasonComplete(currentRound: number, totalRounds: number): boolean {
  return currentRound >= totalRounds
}

/**
 * Apply fatigue and fitness changes after a round.
 * Players who played lose some fitness and gain fatigue.
 * Players who didn't play recover.
 */
export function applyPostRoundEffects(
  players: Record<string, Player>,
  matchPlayerIds: Set<string>,
  travelFatigueByClub?: Record<string, number>,
): void {
  for (const player of Object.values(players)) {
    if (matchPlayerIds.has(player.id)) {
      // Played - lose fitness, gain fatigue
      const extraTravelFatigue = travelFatigueByClub?.[player.clubId] ?? 0
      player.fitness = Math.max(50, player.fitness - Math.floor(Math.random() * 5 + 3))
      player.fatigue = Math.min(100, player.fatigue + Math.floor(Math.random() * 8 + 5) + extraTravelFatigue)
    } else {
      // Rested - recover fitness, reduce fatigue
      player.fitness = Math.min(100, player.fitness + Math.floor(Math.random() * 4 + 2))
      player.fatigue = Math.max(0, player.fatigue - Math.floor(Math.random() * 6 + 4))
    }

    // Small form fluctuation
    const formDelta = Math.floor(Math.random() * 7) - 3
    player.form = Math.max(20, Math.min(95, player.form + formDelta))
  }
}
