import type { Match, MatchPlayerStats } from '@/types/match'

export interface PlayerGameEntry {
  matchId: string
  round: number
  isFinal: boolean
  opponentClubId: string
  playerClubId: string
  /** true = won, false = lost, null = draw */
  won: boolean | null
  stats: MatchPlayerStats
}

/**
 * Scans matchResults to find the last `limit` games for a given player.
 * Returns entries ordered newest first.
 */
export function getPlayerRecentGames(
  playerId: string,
  matchResults: Match[],
  limit = 10,
): PlayerGameEntry[] {
  const entries: PlayerGameEntry[] = []

  // Process in reverse order (newest rounds first)
  for (let i = matchResults.length - 1; i >= 0; i--) {
    const match = matchResults[i]
    if (!match.result) continue

    const { result } = match
    let stats: MatchPlayerStats | null = null
    let playerClubId!: string
    let opponentClubId!: string

    const homeStat = result.homePlayerStats.find((s) => s.playerId === playerId)
    if (homeStat?.participated) {
      stats = homeStat
      playerClubId = match.homeClubId
      opponentClubId = match.awayClubId
    } else {
      const awayStat = result.awayPlayerStats.find((s) => s.playerId === playerId)
      if (awayStat?.participated) {
        stats = awayStat
        playerClubId = match.awayClubId
        opponentClubId = match.homeClubId
      }
    }

    if (!stats) continue

    const homeScore = result.homeTotalScore
    const awayScore = result.awayTotalScore
    const playerWasHome = playerClubId === match.homeClubId
    const playerScore = playerWasHome ? homeScore : awayScore
    const oppScore = playerWasHome ? awayScore : homeScore

    entries.push({
      matchId: match.id,
      round: match.round,
      isFinal: match.isFinal,
      opponentClubId,
      playerClubId,
      won: playerScore > oppScore ? true : playerScore < oppScore ? false : null,
      stats,
    })

    if (entries.length >= limit) break
  }

  return entries
}

export interface L5Averages {
  games: number
  disposals: number
  goals: number
  marks: number
  tackles: number
  clearances: number
  hitouts: number
  aflFantasyPoints: number
  superCoachPoints: number
  rating: number
}

/** Computes per-game averages from a list of game entries (pass the last-5 slice). */
export function computeL5Averages(games: PlayerGameEntry[]): L5Averages {
  const n = games.length
  if (n === 0) {
    return { games: 0, disposals: 0, goals: 0, marks: 0, tackles: 0, clearances: 0, hitouts: 0, aflFantasyPoints: 0, superCoachPoints: 0, rating: 0 }
  }
  const sum = games.reduce(
    (acc, g) => ({
      disposals: acc.disposals + g.stats.disposals,
      goals: acc.goals + g.stats.goals,
      marks: acc.marks + g.stats.marks,
      tackles: acc.tackles + g.stats.tackles,
      clearances: acc.clearances + g.stats.clearances,
      hitouts: acc.hitouts + g.stats.hitouts,
      aflFantasyPoints: acc.aflFantasyPoints + g.stats.aflFantasyPoints,
      superCoachPoints: acc.superCoachPoints + g.stats.superCoachPoints,
      rating: acc.rating + (g.stats.matchRating ?? 0),
    }),
    { disposals: 0, goals: 0, marks: 0, tackles: 0, clearances: 0, hitouts: 0, aflFantasyPoints: 0, superCoachPoints: 0, rating: 0 },
  )
  return {
    games: n,
    disposals: sum.disposals / n,
    goals: sum.goals / n,
    marks: sum.marks / n,
    tackles: sum.tackles / n,
    clearances: sum.clearances / n,
    hitouts: sum.hitouts / n,
    aflFantasyPoints: sum.aflFantasyPoints / n,
    superCoachPoints: sum.superCoachPoints / n,
    rating: sum.rating / n,
  }
}

/** Returns the CSS color class for a given match rating value. */
export function formDotColorClass(rating: number): string {
  if (rating >= 8.0) return 'bg-amber-400'   // Gold
  if (rating >= 6.5) return 'bg-green-500'   // Green
  if (rating >= 5.0) return 'bg-zinc-500'    // Grey
  return 'bg-red-500'                         // Red
}
