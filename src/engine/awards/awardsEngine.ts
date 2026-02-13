import type { Match, MatchPlayerStats } from '@/types/match'
import type { Player } from '@/types/player'
import type { LadderEntry } from '@/types/season'
import type { BrownlowRound, SeasonAwards } from '@/types/awards'

/**
 * Award Brownlow votes (3-2-1) for a single match.
 * Best performers by a weighted disposal+goal+clearance metric.
 * Players who were reported (clangers > 8) are ineligible.
 */
export function awardBrownlowVotes(
  matchId: string,
  round: number,
  playerStats: MatchPlayerStats[],
): BrownlowRound {
  const scored = playerStats
    .filter((ps) => (ps.clangers ?? 0) <= 8) // ineligible if too many clangers
    .map((ps) => ({
      playerId: ps.playerId,
      score:
        ps.disposals * 1.0 +
        ps.goals * 3.0 +
        ps.clearances * 1.5 +
        ps.tackles * 0.8 +
        ps.marks * 0.5 +
        (ps.contestedPossessions ?? 0) * 0.7 +
        (ps.goalAssists ?? 0) * 1.5 -
        (ps.turnovers ?? 0) * 0.5,
    }))
    .sort((a, b) => b.score - a.score)

  const votes: { playerId: string; votes: number }[] = []
  if (scored.length >= 1) votes.push({ playerId: scored[0].playerId, votes: 3 })
  if (scored.length >= 2) votes.push({ playerId: scored[1].playerId, votes: 2 })
  if (scored.length >= 3) votes.push({ playerId: scored[2].playerId, votes: 1 })

  return { round, matchId, votes }
}

/**
 * Calculate Brownlow Medal winner from tracker data.
 * Returns the player with the most total votes.
 */
export function calculateBrownlowWinner(
  tracker: BrownlowRound[],
): { playerId: string; votes: number } | null {
  const totals: Record<string, number> = {}
  for (const round of tracker) {
    for (const v of round.votes) {
      totals[v.playerId] = (totals[v.playerId] ?? 0) + v.votes
    }
  }

  let best: { playerId: string; votes: number } | null = null
  for (const [playerId, votes] of Object.entries(totals)) {
    if (!best || votes > best.votes) {
      best = { playerId, votes }
    }
  }
  return best
}

/**
 * Get top N Brownlow vote-getters.
 */
export function getBrownlowLeaderboard(
  tracker: BrownlowRound[],
  topN: number = 20,
): { playerId: string; votes: number }[] {
  const totals: Record<string, number> = {}
  for (const round of tracker) {
    for (const v of round.votes) {
      totals[v.playerId] = (totals[v.playerId] ?? 0) + v.votes
    }
  }

  return Object.entries(totals)
    .map(([playerId, votes]) => ({ playerId, votes }))
    .sort((a, b) => b.votes - a.votes)
    .slice(0, topN)
}

/**
 * Calculate Coleman Medal (leading goalkicker).
 */
export function calculateColemanMedal(
  players: Record<string, Player>,
): { playerId: string; goals: number } | null {
  let best: { playerId: string; goals: number } | null = null

  for (const p of Object.values(players)) {
    if (p.seasonStats.goals > 0) {
      if (!best || p.seasonStats.goals > best.goals) {
        best = { playerId: p.id, goals: p.seasonStats.goals }
      }
    }
  }

  return best
}

/**
 * Get top N goalkickers.
 */
export function getColemanLeaderboard(
  players: Record<string, Player>,
  topN: number = 10,
): { playerId: string; goals: number }[] {
  return Object.values(players)
    .filter((p) => p.seasonStats.goals > 0)
    .map((p) => ({ playerId: p.id, goals: p.seasonStats.goals }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, topN)
}

/**
 * Select Rising Star nominee (best U21 player with < 10 career games at start of season).
 */
export function calculateRisingStar(
  players: Record<string, Player>,
): { playerId: string } | null {
  let best: { playerId: string; score: number } | null = null

  for (const p of Object.values(players)) {
    if (p.age > 21) continue
    // Eligible if relatively few career games (allowing for current season)
    const priorGames = p.careerStats.gamesPlayed - p.seasonStats.gamesPlayed
    if (priorGames >= 10) continue
    if (p.seasonStats.gamesPlayed === 0) continue

    const avgDisposals = p.seasonStats.disposals / p.seasonStats.gamesPlayed
    const avgGoals = p.seasonStats.goals / p.seasonStats.gamesPlayed
    const score = avgDisposals + avgGoals * 3

    if (!best || score > best.score) {
      best = { playerId: p.id, score }
    }
  }

  return best ? { playerId: best.playerId } : null
}

/**
 * Select All-Australian team (best 22 players by position).
 * Distributes: 6 defenders, 8 midfielders, 6 forwards, 1 ruck, 1 interchange.
 */
export function selectAllAustralian(
  players: Record<string, Player>,
  ladder: LadderEntry[],
): string[] {
  // Weight by performance + team success
  const topClubs = new Set(ladder.slice(0, 8).map((e) => e.clubId))

  const scored = Object.values(players)
    .filter((p) => p.seasonStats.gamesPlayed >= 10)
    .map((p) => {
      const gp = p.seasonStats.gamesPlayed
      const avgDisp = p.seasonStats.disposals / gp
      const avgGoals = p.seasonStats.goals / gp
      const avgMarks = p.seasonStats.marks / gp
      const avgTackles = p.seasonStats.tackles / gp
      const avgClearances = p.seasonStats.clearances / gp
      const teamBonus = topClubs.has(p.clubId) ? 1.15 : 1.0

      const score =
        (avgDisp * 1.0 +
          avgGoals * 4.0 +
          avgMarks * 1.2 +
          avgTackles * 0.8 +
          avgClearances * 1.5) *
        teamBonus

      return { player: p, score }
    })
    .sort((a, b) => b.score - a.score)

  const selected: string[] = []
  const positionCounts: Record<string, number> = {
    DEF: 0, MID: 0, FWD: 0, RUC: 0,
  }
  const positionLimits: Record<string, number> = {
    DEF: 6, MID: 8, FWD: 6, RUC: 1,
  }

  // Map primary positions to categories
  function getCategory(pos: string): string {
    if (['FB', 'CHB', 'BP'].includes(pos)) return 'DEF'
    if (['C', 'W', 'HFF', 'R'].includes(pos)) return 'MID'
    if (pos === 'RUC' || pos === 'R') return 'RUC'
    if (['CHF', 'FF', 'FP'].includes(pos)) return 'FWD'
    return 'MID' // default
  }

  // First pass: fill positions
  for (const { player } of scored) {
    if (selected.length >= 22) break
    const cat = getCategory(player.position.primary)
    if ((positionCounts[cat] ?? 0) < (positionLimits[cat] ?? 0)) {
      selected.push(player.id)
      positionCounts[cat] = (positionCounts[cat] ?? 0) + 1
    }
  }

  // Second pass: fill remaining spots with best available
  for (const { player } of scored) {
    if (selected.length >= 22) break
    if (!selected.includes(player.id)) {
      selected.push(player.id)
    }
  }

  return selected.slice(0, 22)
}

/**
 * Calculate Club Best & Fairest for each club.
 * Based on weighted per-game performance.
 */
export function calculateClubBestAndFairest(
  players: Record<string, Player>,
  clubIds: string[],
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const clubId of clubIds) {
    const clubPlayers = Object.values(players).filter(
      (p) => p.clubId === clubId && p.seasonStats.gamesPlayed >= 5,
    )

    let best: { playerId: string; score: number } | null = null
    for (const p of clubPlayers) {
      const gp = p.seasonStats.gamesPlayed
      const score =
        (p.seasonStats.disposals / gp) * 1.0 +
        (p.seasonStats.goals / gp) * 3.0 +
        (p.seasonStats.marks / gp) * 0.8 +
        (p.seasonStats.tackles / gp) * 0.8 +
        (p.seasonStats.clearances / gp) * 1.2 +
        (p.seasonStats.contestedPossessions / gp) * 0.6

      if (!best || score > best.score) {
        best = { playerId: p.id, score }
      }
    }

    if (best) {
      result[clubId] = best.playerId
    }
  }

  return result
}

/**
 * Compute all end-of-season awards.
 */
export function computeSeasonAwards(
  year: number,
  players: Record<string, Player>,
  ladder: LadderEntry[],
  brownlowTracker: BrownlowRound[],
  clubIds: string[],
): SeasonAwards {
  return {
    year,
    brownlowMedal: calculateBrownlowWinner(brownlowTracker),
    colemanMedal: calculateColemanMedal(players),
    risingStar: calculateRisingStar(players),
    allAustralian: selectAllAustralian(players, ladder),
    clubBestAndFairest: calculateClubBestAndFairest(players, clubIds),
  }
}
