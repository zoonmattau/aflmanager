import type { Round, Fixture, Season, LadderEntry } from '@/types/season'
import type { Club } from '@/types/club'
import { SeededRNG } from '@/engine/core/rng'
import { REGULAR_SEASON_ROUNDS, TOTAL_CLUBS } from '@/engine/core/constants'

/**
 * Generate a 23-round fixture for 18 teams.
 * Uses a round-robin approach: 18 teams = 17 complete rounds (each team plays each other once),
 * then 6 extra rounds for rivalry/repeat matches.
 */
export function generateFixture(clubs: Record<string, Club>, seed: number): Season {
  const rng = new SeededRNG(seed)
  const clubIds = Object.keys(clubs)

  if (clubIds.length !== TOTAL_CLUBS) {
    throw new Error(`Expected ${TOTAL_CLUBS} clubs, got ${clubIds.length}`)
  }

  // Shuffle for variety
  const shuffled = rng.shuffle(clubIds)
  const rounds: Round[] = []

  // Generate 17 rounds using circle method (round-robin)
  // Fix first team, rotate the rest
  const fixed = shuffled[0]
  const rotating = shuffled.slice(1) // 17 teams

  for (let r = 0; r < 17; r++) {
    const fixtures: Fixture[] = []

    // First match: fixed team vs rotating[0]
    const homeAway = r % 2 === 0
    fixtures.push({
      homeClubId: homeAway ? fixed : rotating[0],
      awayClubId: homeAway ? rotating[0] : fixed,
      venue: homeAway ? clubs[fixed].homeGround : clubs[rotating[0]].homeGround,
    })

    // Pair up the rest: rotating[i] vs rotating[16-i]
    for (let i = 1; i <= 8; i++) {
      const a = rotating[i]
      const b = rotating[17 - i]
      const aHome = rng.chance(0.5)
      fixtures.push({
        homeClubId: aHome ? a : b,
        awayClubId: aHome ? b : a,
        venue: aHome ? clubs[a].homeGround : clubs[b].homeGround,
      })
    }

    rounds.push({
      number: r + 1,
      name: `Round ${r + 1}`,
      fixtures,
      isBye: false,
      isFinals: false,
    })

    // Rotate: move last to front
    rotating.unshift(rotating.pop()!)
  }

  // Generate rounds 18-23: repeat matches (rivals / balanced schedule)
  // Each team needs 6 more matches to reach 22 H&A games (some have byes)
  for (let r = 17; r < REGULAR_SEASON_ROUNDS; r++) {
    const fixtures: Fixture[] = []
    const used = new Set<string>()

    // Try to pair teams that haven't played much at home/away
    const available = [...clubIds]
    rng.shuffle(available)

    while (available.length >= 2) {
      const a = available.shift()!
      if (used.has(a)) continue

      // Find best opponent
      let bestOpponent: string | null = null
      for (let i = 0; i < available.length; i++) {
        if (!used.has(available[i])) {
          bestOpponent = available.splice(i, 1)[0]
          break
        }
      }

      if (bestOpponent) {
        used.add(a)
        used.add(bestOpponent)
        const aHome = rng.chance(0.5)
        fixtures.push({
          homeClubId: aHome ? a : bestOpponent,
          awayClubId: aHome ? bestOpponent : a,
          venue: aHome ? clubs[a].homeGround : clubs[bestOpponent].homeGround,
        })
      }
    }

    rounds.push({
      number: r + 1,
      name: `Round ${r + 1}`,
      fixtures,
      isBye: false,
      isFinals: false,
    })
  }

  return {
    year: 2026,
    rounds,
    finalsRounds: [],
  }
}

export function createInitialLadder(clubIds: string[]): LadderEntry[] {
  return clubIds.map((clubId) => ({
    clubId,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    percentage: 0,
  }))
}
