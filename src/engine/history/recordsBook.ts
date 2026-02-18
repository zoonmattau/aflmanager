import type { Club } from '@/types/club'
import type {
  GameHistory,
  AFLRecordsBook,
  RecordsLeaderboardStat,
  RecordsPlayerEntry,
  TeamStreakRecord,
  TeamCountRecord,
  MatchValueRecord,
} from '@/types/history'
import type { Match } from '@/types/match'
import type { Player } from '@/types/player'

export const RECORDS_LEADERBOARD_STATS: RecordsLeaderboardStat[] = [
  'gamesPlayed',
  'goals',
  'disposals',
  'marks',
  'tackles',
  'hitouts',
  'clearances',
  'intercepts',
  'scoreInvolvements',
  'aflFantasyPoints',
  'superCoachPoints',
]

function createEmptyLeaderboard(): Record<RecordsLeaderboardStat, RecordsPlayerEntry[]> {
  return {
    gamesPlayed: [],
    goals: [],
    disposals: [],
    marks: [],
    tackles: [],
    hitouts: [],
    clearances: [],
    intercepts: [],
    scoreInvolvements: [],
    aflFantasyPoints: [],
    superCoachPoints: [],
  }
}

export function createDefaultRecordsBook(): AFLRecordsBook {
  return {
    singleSeason: {
      mostGoals: null,
      mostDisposals: null,
      mostMarks: null,
      mostTackles: null,
      mostHitouts: null,
      mostClearances: null,
      mostIntercepts: null,
      mostScoreInvolvements: null,
      mostAflFantasyPoints: null,
      mostSuperCoachPoints: null,
    },
    team: {
      longestWinStreak: null,
      longestPremiershipStreak: null,
      mostPremierships: null,
      mostTopFourFinishes: null,
    },
    match: {
      biggestWinMargin: null,
      highestTeamScore: null,
      highestCombinedScore: null,
    },
    leaderboards: {
      career: createEmptyLeaderboard(),
      season: createEmptyLeaderboard(),
    },
    runtime: {
      currentWinStreakByClub: {},
    },
    lastUpdatedYear: null,
  }
}

export function normalizeRecordsBook(recordsBook: AFLRecordsBook | null | undefined): AFLRecordsBook {
  const base = createDefaultRecordsBook()
  if (!recordsBook) return base
  return {
    ...base,
    ...recordsBook,
    singleSeason: {
      ...base.singleSeason,
      ...(recordsBook.singleSeason ?? {}),
    },
    team: {
      ...base.team,
      ...(recordsBook.team ?? {}),
    },
    match: {
      ...base.match,
      ...(recordsBook.match ?? {}),
    },
    leaderboards: {
      career: {
        ...base.leaderboards.career,
        ...(recordsBook.leaderboards?.career ?? {}),
      },
      season: {
        ...base.leaderboards.season,
        ...(recordsBook.leaderboards?.season ?? {}),
      },
    },
    runtime: {
      ...base.runtime,
      ...(recordsBook.runtime ?? {}),
    },
  }
}

function resolveClubName(clubs: Record<string, Club>, clubId: string): string {
  const club = clubs[clubId]
  if (!club) return clubId
  return club.abbreviation || club.name || club.fullName || clubId
}

function upsertLongestWinStreak(
  currentBest: TeamStreakRecord | null,
  contender: TeamStreakRecord,
): TeamStreakRecord {
  if (!currentBest) return contender
  if (contender.value > currentBest.value) return contender
  if (contender.value < currentBest.value) return currentBest
  if (contender.endYear > currentBest.endYear) return contender
  return currentBest
}

function upsertMatchRecord(
  currentBest: MatchValueRecord | null,
  contender: MatchValueRecord,
): MatchValueRecord {
  if (!currentBest) return contender
  if (contender.value > currentBest.value) return contender
  if (contender.value < currentBest.value) return currentBest
  if (contender.year > currentBest.year) return contender
  return currentBest
}

function upsertSeasonPlayerRecord(
  currentBest: RecordsPlayerEntry | null,
  contender: RecordsPlayerEntry | null,
): RecordsPlayerEntry | null {
  if (!contender) return currentBest
  if (!currentBest) return contender
  if (contender.value > currentBest.value) return contender
  if (contender.value < currentBest.value) return currentBest
  if ((contender.year ?? 0) > (currentBest.year ?? 0)) return contender
  return currentBest
}

function computeLongestPremiershipStreak(
  history: GameHistory,
  clubs: Record<string, Club>,
): TeamStreakRecord | null {
  const seasons = [...history.seasons].sort((a, b) => a.year - b.year)
  if (seasons.length === 0) return null

  let best: TeamStreakRecord | null = null
  let runClubId: string | null = null
  let runStartYear = 0
  let runEndYear = 0
  let runLength = 0

  for (const season of seasons) {
    if (runClubId === season.premierClubId && season.year === runEndYear + 1) {
      runLength += 1
      runEndYear = season.year
    } else {
      runClubId = season.premierClubId
      runStartYear = season.year
      runEndYear = season.year
      runLength = 1
    }

    if (!runClubId) continue
    const contender: TeamStreakRecord = {
      clubId: runClubId,
      clubName: resolveClubName(clubs, runClubId),
      value: runLength,
      startYear: runStartYear,
      endYear: runEndYear,
    }

    if (!best || contender.value > best.value || (contender.value === best.value && contender.endYear > best.endYear)) {
      best = contender
    }
  }

  return best
}

function computeTeamCountRecords(
  history: GameHistory,
  clubs: Record<string, Club>,
): { mostPremierships: TeamCountRecord | null; mostTopFourFinishes: TeamCountRecord | null } {
  const premiershipCounts: Record<string, number> = {}
  const topFourCounts: Record<string, number> = {}
  for (const season of history.seasons) {
    premiershipCounts[season.premierClubId] = (premiershipCounts[season.premierClubId] ?? 0) + 1
    for (const clubId of season.ladderTopFour) {
      topFourCounts[clubId] = (topFourCounts[clubId] ?? 0) + 1
    }
  }

  const resolveBest = (counts: Record<string, number>): TeamCountRecord | null => {
    let best: TeamCountRecord | null = null
    for (const [clubId, value] of Object.entries(counts)) {
      const contender: TeamCountRecord = {
        clubId,
        clubName: resolveClubName(clubs, clubId),
        value,
      }
      if (!best || contender.value > best.value) best = contender
    }
    return best
  }

  return {
    mostPremierships: resolveBest(premiershipCounts),
    mostTopFourFinishes: resolveBest(topFourCounts),
  }
}

function buildLeaderboard(
  players: Record<string, Player>,
  stat: RecordsLeaderboardStat,
  source: 'careerStats' | 'seasonStats',
  currentYear?: number,
): RecordsPlayerEntry[] {
  return Object.values(players)
    .map((player) => ({
      playerId: player.id,
      playerName: `${player.firstName} ${player.lastName}`,
      clubId: player.clubId,
      value: player[source][stat] ?? 0,
      year: currentYear,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 20)
}

export function updateRecordsBookForMatches(params: {
  recordsBook: AFLRecordsBook
  matches: Match[]
  clubs: Record<string, Club>
  currentYear: number
}): AFLRecordsBook {
  const { recordsBook, matches, clubs, currentYear } = params
  if (matches.length === 0) return recordsBook

  const runtime = {
    currentWinStreakByClub: { ...recordsBook.runtime.currentWinStreakByClub },
  }
  let longestWinStreak = recordsBook.team.longestWinStreak
  let biggestWinMargin = recordsBook.match?.biggestWinMargin ?? null
  let highestTeamScore = recordsBook.match?.highestTeamScore ?? null
  let highestCombinedScore = recordsBook.match?.highestCombinedScore ?? null

  for (const match of matches) {
    if (!match.result) continue
    const homeScore = match.result.homeTotalScore
    const awayScore = match.result.awayTotalScore
    const combinedScore = homeScore + awayScore
    const margin = Math.abs(homeScore - awayScore)
    const topTeamScore = Math.max(homeScore, awayScore)

    biggestWinMargin = upsertMatchRecord(biggestWinMargin, {
      value: margin,
      year: currentYear,
      round: match.round,
      homeClubId: match.homeClubId,
      awayClubId: match.awayClubId,
    })
    highestTeamScore = upsertMatchRecord(highestTeamScore, {
      value: topTeamScore,
      year: currentYear,
      round: match.round,
      homeClubId: match.homeClubId,
      awayClubId: match.awayClubId,
    })
    highestCombinedScore = upsertMatchRecord(highestCombinedScore, {
      value: combinedScore,
      year: currentYear,
      round: match.round,
      homeClubId: match.homeClubId,
      awayClubId: match.awayClubId,
    })

    const homeState = runtime.currentWinStreakByClub[match.homeClubId] ?? { streak: 0, startYear: currentYear }
    const awayState = runtime.currentWinStreakByClub[match.awayClubId] ?? { streak: 0, startYear: currentYear }

    if (homeScore > awayScore) {
      const nextHomeStreak = homeState.streak + 1
      const homeStartYear = homeState.streak === 0 ? currentYear : homeState.startYear
      runtime.currentWinStreakByClub[match.homeClubId] = { streak: nextHomeStreak, startYear: homeStartYear }
      runtime.currentWinStreakByClub[match.awayClubId] = { streak: 0, startYear: currentYear }

      longestWinStreak = upsertLongestWinStreak(longestWinStreak, {
        clubId: match.homeClubId,
        clubName: resolveClubName(clubs, match.homeClubId),
        value: nextHomeStreak,
        startYear: homeStartYear,
        endYear: currentYear,
      })
    } else if (awayScore > homeScore) {
      const nextAwayStreak = awayState.streak + 1
      const awayStartYear = awayState.streak === 0 ? currentYear : awayState.startYear
      runtime.currentWinStreakByClub[match.awayClubId] = { streak: nextAwayStreak, startYear: awayStartYear }
      runtime.currentWinStreakByClub[match.homeClubId] = { streak: 0, startYear: currentYear }

      longestWinStreak = upsertLongestWinStreak(longestWinStreak, {
        clubId: match.awayClubId,
        clubName: resolveClubName(clubs, match.awayClubId),
        value: nextAwayStreak,
        startYear: awayStartYear,
        endYear: currentYear,
      })
    } else {
      runtime.currentWinStreakByClub[match.homeClubId] = { streak: 0, startYear: currentYear }
      runtime.currentWinStreakByClub[match.awayClubId] = { streak: 0, startYear: currentYear }
    }
  }

  return {
    ...recordsBook,
    team: {
      ...recordsBook.team,
      longestWinStreak,
    },
    match: {
      biggestWinMargin,
      highestTeamScore,
      highestCombinedScore,
    },
    runtime,
    lastUpdatedYear: currentYear,
  }
}

export function refreshRecordsBookLeaderboards(params: {
  recordsBook: AFLRecordsBook
  players: Record<string, Player>
  clubs: Record<string, Club>
  currentYear: number
  history: GameHistory
}): AFLRecordsBook {
  const { recordsBook, players, clubs, currentYear, history } = params
  const career = createEmptyLeaderboard()
  const season = createEmptyLeaderboard()

  for (const stat of RECORDS_LEADERBOARD_STATS) {
    career[stat] = buildLeaderboard(players, stat, 'careerStats')
    season[stat] = buildLeaderboard(players, stat, 'seasonStats', currentYear)
  }

  const currentMostGoals = season.goals[0] ?? null
  const teamCounts = computeTeamCountRecords(history, clubs)

  return {
    ...recordsBook,
    singleSeason: {
      ...recordsBook.singleSeason,
      mostGoals: upsertSeasonPlayerRecord(recordsBook.singleSeason.mostGoals ?? null, currentMostGoals),
      mostDisposals: upsertSeasonPlayerRecord(recordsBook.singleSeason.mostDisposals ?? null, season.disposals[0] ?? null),
      mostMarks: upsertSeasonPlayerRecord(recordsBook.singleSeason.mostMarks ?? null, season.marks[0] ?? null),
      mostTackles: upsertSeasonPlayerRecord(recordsBook.singleSeason.mostTackles ?? null, season.tackles[0] ?? null),
      mostHitouts: upsertSeasonPlayerRecord(recordsBook.singleSeason.mostHitouts ?? null, season.hitouts[0] ?? null),
      mostClearances: upsertSeasonPlayerRecord(recordsBook.singleSeason.mostClearances ?? null, season.clearances[0] ?? null),
      mostIntercepts: upsertSeasonPlayerRecord(recordsBook.singleSeason.mostIntercepts ?? null, season.intercepts[0] ?? null),
      mostScoreInvolvements: upsertSeasonPlayerRecord(recordsBook.singleSeason.mostScoreInvolvements ?? null, season.scoreInvolvements[0] ?? null),
      mostAflFantasyPoints: upsertSeasonPlayerRecord(recordsBook.singleSeason.mostAflFantasyPoints ?? null, season.aflFantasyPoints[0] ?? null),
      mostSuperCoachPoints: upsertSeasonPlayerRecord(recordsBook.singleSeason.mostSuperCoachPoints ?? null, season.superCoachPoints[0] ?? null),
    },
    team: {
      ...recordsBook.team,
      longestPremiershipStreak: computeLongestPremiershipStreak(history, clubs),
      mostPremierships: teamCounts.mostPremierships,
      mostTopFourFinishes: teamCounts.mostTopFourFinishes,
    },
    leaderboards: {
      career,
      season,
    },
    lastUpdatedYear: currentYear,
  }
}
