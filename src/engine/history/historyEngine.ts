import type { GameHistory, SeasonRecord, DraftHistoryEntry } from '@/types/history'
import type { Match } from '@/types/match'
import type { LadderEntry } from '@/types/season'
import type { Player, PlayerCareerStats } from '@/types/player'

/**
 * Record the result of a completed season into the game history.
 *
 * Uses the Grand Final match to determine premier and runner-up.
 * Top-4 is read from the end-of-H&A ladder.
 */
export function recordSeasonResult(
  history: GameHistory,
  year: number,
  finalsMatches: Match[],
  ladder: LadderEntry[],
): GameHistory {
  const grandFinal = finalsMatches.find(
    (m) => m.isFinal && m.finalType === 'GF' && m.result !== null,
  )

  if (!grandFinal || !grandFinal.result) return history

  const homeScore = grandFinal.result.homeTotalScore
  const awayScore = grandFinal.result.awayTotalScore
  const premierClubId = homeScore >= awayScore ? grandFinal.homeClubId : grandFinal.awayClubId
  const runnerUpClubId = homeScore >= awayScore ? grandFinal.awayClubId : grandFinal.homeClubId

  const record: SeasonRecord = {
    year,
    premierClubId,
    runnerUpClubId,
    grandFinalScore: { home: homeScore, away: awayScore },
    ladderTopFour: ladder.slice(0, 4).map((e) => e.clubId),
  }

  return {
    ...history,
    seasons: [...history.seasons, record],
  }
}

/**
 * Record a single draft pick into history.
 */
export function recordDraftPick(
  history: GameHistory,
  entry: DraftHistoryEntry,
): GameHistory {
  return {
    ...history,
    draftHistory: [...history.draftHistory, entry],
  }
}

/**
 * Dynasty stats for a specific club across all recorded seasons.
 */
export interface DynastyStats {
  totalPremierships: number
  premiershipYears: number[]
  consecutivePremierships: number  // current streak
  maxConsecutivePremierships: number
  topFourAppearances: number
}

/**
 * Compute dynasty stats for a given club from historical season records.
 */
export function getDynastyStats(
  history: GameHistory,
  clubId: string,
): DynastyStats {
  const premiershipYears: number[] = []
  let topFourAppearances = 0
  let maxConsecutive = 0
  let currentStreak = 0

  // Sort seasons by year to compute streaks correctly
  const sorted = [...history.seasons].sort((a, b) => a.year - b.year)

  for (const season of sorted) {
    if (season.premierClubId === clubId) {
      premiershipYears.push(season.year)
      currentStreak++
      maxConsecutive = Math.max(maxConsecutive, currentStreak)
    } else {
      currentStreak = 0
    }

    if (season.ladderTopFour.includes(clubId)) {
      topFourAppearances++
    }
  }

  return {
    totalPremierships: premiershipYears.length,
    premiershipYears,
    consecutivePremierships: currentStreak,
    maxConsecutivePremierships: maxConsecutive,
    topFourAppearances,
  }
}

/**
 * A career leader entry for display.
 */
export interface CareerLeaderEntry {
  playerId: string
  playerName: string
  clubId: string
  value: number
}

/**
 * Get the top N career leaders for a given stat across all players
 * (including retired players).
 */
export function getCareerLeaders(
  players: Record<string, Player>,
  stat: keyof PlayerCareerStats,
  limit: number = 10,
): CareerLeaderEntry[] {
  return Object.values(players)
    .filter((p) => p.careerStats[stat] > 0)
    .sort((a, b) => b.careerStats[stat] - a.careerStats[stat])
    .slice(0, limit)
    .map((p) => ({
      playerId: p.id,
      playerName: `${p.firstName} ${p.lastName}`,
      clubId: p.clubId,
      value: p.careerStats[stat],
    }))
}
