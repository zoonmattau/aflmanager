import { SeededRNG } from '@/engine/core/rng'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'

// ---------------------------------------------------------------------------
// Pre-season match result (simplified — no possession-by-possession)
// ---------------------------------------------------------------------------

export interface PreseasonMatchResult {
  homeClubId: string
  awayClubId: string
  homeScore: { goals: number; behinds: number; total: number }
  awayScore: { goals: number; behinds: number; total: number }
  venue: string
  isIntraClub: boolean
}

/**
 * Generate pre-season friendlies for the player's club.
 * Returns 2-3 fixtures against random opponents.
 */
export function generatePreseasonFixtures(
  clubs: Record<string, Club>,
  playerClubId: string,
  count: number = 3,
  seed: number,
): { homeClubId: string; awayClubId: string; venue: string }[] {
  const rng = new SeededRNG(seed)
  const otherClubIds = Object.keys(clubs).filter((id) => id !== playerClubId)
  const shuffled = rng.shuffle(otherClubIds)
  const opponents = shuffled.slice(0, count)

  return opponents.map((oppId, i) => {
    const isHome = i % 2 === 0
    return {
      homeClubId: isHome ? playerClubId : oppId,
      awayClubId: isHome ? oppId : playerClubId,
      venue: isHome
        ? clubs[playerClubId]?.homeGround ?? 'Unknown Venue'
        : clubs[oppId]?.homeGround ?? 'Unknown Venue',
    }
  })
}

/**
 * Simulate a pre-season friendly match (simplified — team-rating based).
 * Stats don't count toward season totals. Reduced injury risk.
 */
export function simulatePreseasonMatch(
  homeClubId: string,
  awayClubId: string,
  venue: string,
  players: Record<string, Player>,
  rng: SeededRNG,
  isIntraClub: boolean = false,
): PreseasonMatchResult {
  // Calculate team rating based on average player attributes
  const getTeamRating = (clubId: string): number => {
    const clubPlayers = Object.values(players).filter((p) => p.clubId === clubId)
    if (clubPlayers.length === 0) return 50

    // Take top 22 by overall rating
    const sorted = clubPlayers
      .map((p) => {
        const attrs = Object.values(p.attributes) as number[]
        return attrs.reduce((a, b) => a + b, 0) / attrs.length
      })
      .sort((a, b) => b - a)
      .slice(0, 22)

    return sorted.reduce((a, b) => a + b, 0) / sorted.length
  }

  const homeRating = getTeamRating(homeClubId)
  const awayRating = isIntraClub ? homeRating : getTeamRating(awayClubId)

  // Generate scores based on rating difference with randomness
  // Pre-season matches tend to be lower scoring
  const homeAdvantage = 3
  const ratingDiff = (homeRating + homeAdvantage - awayRating) / 20

  const homeGoals = Math.max(0, Math.round(8 + ratingDiff * 2 + rng.nextInt(-4, 4)))
  const homeBehinds = Math.max(0, Math.round(6 + rng.nextInt(-3, 5)))
  const awayGoals = Math.max(0, Math.round(8 - ratingDiff * 2 + rng.nextInt(-4, 4)))
  const awayBehinds = Math.max(0, Math.round(6 + rng.nextInt(-3, 5)))

  return {
    homeClubId,
    awayClubId,
    homeScore: { goals: homeGoals, behinds: homeBehinds, total: homeGoals * 6 + homeBehinds },
    awayScore: { goals: awayGoals, behinds: awayBehinds, total: awayGoals * 6 + awayBehinds },
    venue,
    isIntraClub,
  }
}

/**
 * Simulate an intra-club match (split squad into two teams).
 */
export function simulateIntraClubMatch(
  clubId: string,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  rng: SeededRNG,
): PreseasonMatchResult {
  const venue = clubs[clubId]?.homeGround ?? 'Training Ground'
  return simulatePreseasonMatch(
    clubId,
    clubId,
    venue,
    players,
    rng,
    true,
  )
}
