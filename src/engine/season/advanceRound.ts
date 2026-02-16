import { simulateMatch } from '@/engine/match/simulateMatch'
import type { MatchRulesSettings } from '@/types/game'
import type { Match } from '@/types/match'
import type { MatchPlayerStats } from '@/types/match'
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
  gameplanOverrides?: Record<string, Club['gameplan']>
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
    let resolvedVenueId = fixture.venueId

    if (input.venueState) {
      const assignment = input.venueState.assignments.find(
        (a) => a.roundNumber === round.number && a.fixtureIndex === i,
      )
      if (assignment) {
        resolvedVenueId = assignment.venueId
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
      gameplanOverrides: input.gameplanOverrides,
      seed: rngSeed + roundIndex * 100 + i,
      isFinal: round.isFinals,
      matchRules: input.matchRules,
      venueId: resolvedVenueId,
      matchDay: fixture.matchDay,
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
  matchPlayerStats: Record<string, MatchPlayerStats>,
  travelFatigueByClub?: Record<string, number>,
): void {
  for (const player of Object.values(players)) {
    const matchStats = matchPlayerStats[player.id]

    if (matchStats) {
      // Match fatigue load model:
      // - Minutes drive base load
      // - Contested/tackle/hitout workload adds extra load
      // - Travel and age increase load
      // - Recovery/endurance traits reduce load
      const minutesFactor = matchStats.minutesPlayed / 120
      const workload =
        (matchStats.contestedPossessions * 0.32) +
        (matchStats.tackles * 0.42) +
        (matchStats.hitouts * 0.15) +
        (matchStats.clearances * 0.2)
      const travelLoad = (travelFatigueByClub?.[player.clubId] ?? 0) * 1.1
      const ageLoad = player.age >= 31 ? 2.5 : player.age >= 28 ? 1.3 : player.age <= 22 ? -1 : 0
      const recoveryTrait = (player.attributes.recovery + player.attributes.endurance) / 2
      const recoveryMitigation = Math.max(0, (recoveryTrait - 50) / 14)

      const fatigueGain = Math.max(
        2,
        Math.round(6 + minutesFactor * 14 + workload + travelLoad + ageLoad - recoveryMitigation),
      )

      const fitnessDrop = Math.max(
        1,
        Math.round(1 + minutesFactor * 5 + workload * 0.35 + travelLoad * 0.25 - recoveryMitigation * 0.45),
      )

      player.fatigue = Math.min(100, player.fatigue + fatigueGain)
      player.fitness = Math.max(45, player.fitness - fitnessDrop)
    } else if (player.injury) {
      // Injured - rehab improves fitness slowly and reduces fatigue with a small morale drag.
      player.fitness = Math.min(92, player.fitness + Math.floor(Math.random() * 3 + 1))
      player.fatigue = Math.max(0, player.fatigue - Math.floor(Math.random() * 5 + 3))
      player.morale = Math.max(1, player.morale - (player.injury.weeksRemaining >= 6 ? 2 : 1))
    } else {
      // Rest/recovery model (also reflects cumulative training load carried in fatigue).
      const agePenalty = player.age >= 30 ? 1.2 : 0
      const recoveryTrait = (player.attributes.recovery + player.attributes.endurance) / 2
      const fatigueRecovery = Math.max(2, Math.round(5 + (recoveryTrait - 50) / 10 - agePenalty))
      const fitnessRecovery = Math.max(1, Math.round(2 + (recoveryTrait - 50) / 18 - agePenalty * 0.5))
      player.fatigue = Math.max(0, player.fatigue - fatigueRecovery)
      player.fitness = Math.min(100, player.fitness + fitnessRecovery)
    }

    // Small form fluctuation
    const formDelta = Math.floor(Math.random() * 7) - 3
    player.form = Math.max(20, Math.min(95, player.form + formDelta))
  }
}
