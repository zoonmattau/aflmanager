import type { MatchPlayerStats } from '@/types/match'
import type { Player } from '@/types/player'
import type { ClubBFRound, ClubBFWinner } from '@/types/awards'
import { isPlayerSuspended } from '@/engine/players/availability'

function computeBFScore(ps: MatchPlayerStats): number {
  return (
    ps.disposals * 1.0 +
    ps.goals * 3.0 +
    ps.clearances * 1.5 +
    ps.tackles * 0.8 +
    ps.marks * 0.5 +
    (ps.contestedPossessions ?? 0) * 0.7 +
    (ps.goalAssists ?? 0) * 1.5 -
    (ps.turnovers ?? 0) * 0.5
  )
}

/**
 * Award Club B&F votes (3-2-1) for each club in a match.
 * Suspended players are ineligible.
 */
export function awardClubBFVotes(
  matchId: string,
  round: number,
  allPlayerStats: MatchPlayerStats[],
  players: Record<string, Player>,
): ClubBFRound[] {
  // Group stats by club using the player map
  const byClub: Record<string, MatchPlayerStats[]> = {}
  for (const ps of allPlayerStats) {
    const p = players[ps.playerId]
    if (!p) continue
    const list = byClub[p.clubId] ?? []
    list.push(ps)
    byClub[p.clubId] = list
  }

  const rounds: ClubBFRound[] = []
  for (const [clubId, stats] of Object.entries(byClub)) {
    const eligible = stats.filter((ps) => {
      const p = players[ps.playerId]
      return p != null && !isPlayerSuspended(p)
    })

    const scored = eligible
      .map((ps) => ({ playerId: ps.playerId, score: computeBFScore(ps) }))
      .sort((a, b) => b.score - a.score)

    const votes: { playerId: string; votes: number }[] = []
    if (scored.length >= 1) votes.push({ playerId: scored[0].playerId, votes: 3 })
    if (scored.length >= 2) votes.push({ playerId: scored[1].playerId, votes: 2 })
    if (scored.length >= 3) votes.push({ playerId: scored[2].playerId, votes: 1 })

    if (votes.length > 0) {
      rounds.push({ round, matchId, clubId, votes })
    }
  }

  return rounds
}

/**
 * Get top N B&F vote-getters for a specific club this season.
 */
export function getClubBFLeaderboard(
  tracker: ClubBFRound[],
  clubId: string,
  topN: number = 5,
): { playerId: string; votes: number }[] {
  const totals: Record<string, number> = {}
  for (const r of tracker) {
    if (r.clubId !== clubId) continue
    for (const v of r.votes) {
      totals[v.playerId] = (totals[v.playerId] ?? 0) + v.votes
    }
  }

  return Object.entries(totals)
    .map(([playerId, votes]) => ({ playerId, votes }))
    .sort((a, b) => b.votes - a.votes)
    .slice(0, topN)
}

/**
 * Calculate Club B&F winners for all clubs from vote tracker.
 */
export function calculateClubBFWinners(
  tracker: ClubBFRound[],
  clubIds: string[],
): Record<string, ClubBFWinner> {
  const result: Record<string, ClubBFWinner> = {}
  for (const clubId of clubIds) {
    const leaderboard = getClubBFLeaderboard(tracker, clubId, 2)
    if (leaderboard.length === 0) continue
    result[clubId] = {
      winnerId: leaderboard[0].playerId,
      votes: leaderboard[0].votes,
      runnerUpId: leaderboard[1]?.playerId ?? null,
      runnerUpVotes: leaderboard[1]?.votes ?? null,
    }
  }
  return result
}
