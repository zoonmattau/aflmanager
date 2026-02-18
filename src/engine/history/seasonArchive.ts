import type { LadderEntry } from '@/types/season'
import type { Match } from '@/types/match'
import type {
  ArchivedLadderEntry,
  ArchivedFinalsMatch,
  SeasonArchive,
} from '@/types/historyArchive'

export function archiveLadder(ladder: LadderEntry[]): ArchivedLadderEntry[] {
  return ladder.map((e) => ({
    clubId: e.clubId,
    played: e.played,
    wins: e.wins,
    losses: e.losses,
    draws: e.draws,
    points: e.points,
    pointsFor: e.pointsFor,
    pointsAgainst: e.pointsAgainst,
    percentage: e.percentage,
  }))
}

export function archiveFinalsMatches(finalsMatches: Match[]): ArchivedFinalsMatch[] {
  return finalsMatches
    .filter((m) => m.isFinal && m.result !== null && m.finalType)
    .map((m) => {
      const r = m.result!
      const homeScore = r.homeTotalScore
      const awayScore = r.awayTotalScore
      return {
        homeClubId: m.homeClubId,
        awayClubId: m.awayClubId,
        venue: m.venue,
        finalType: m.finalType!,
        homeScore,
        awayScore,
        homeQuarterScores: r.homeScores,
        awayQuarterScores: r.awayScores,
        winnerClubId: homeScore >= awayScore ? m.homeClubId : m.awayClubId,
      }
    })
}

export function createSeasonArchive(
  year: number,
  ladder: LadderEntry[],
  finalsMatches: Match[],
): SeasonArchive {
  return {
    year,
    ladder: archiveLadder(ladder),
    finalsResults: archiveFinalsMatches(finalsMatches),
  }
}
