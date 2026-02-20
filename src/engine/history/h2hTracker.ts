import type { H2HMeeting, H2HRecord, MatchReport } from '@/types/history'
import type { Club } from '@/types/club'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Canonical key for a club pair — always alphabetically sorted. */
export function h2hKey(a: string, b: string): string {
  return [a, b].sort().join('_')
}

/** Check whether two clubs are canonical rivals (either club lists the other). */
export function isRivalryMatch(
  homeId: string,
  awayId: string,
  clubs: Record<string, Club>,
): boolean {
  const home = clubs[homeId]
  const away = clubs[awayId]
  if (!home || !away) return false
  const homeRivals = home.rivalryClubIds ?? []
  const awayRivals = away.rivalryClubIds ?? []
  return homeRivals.includes(awayId) || awayRivals.includes(homeId)
}

// ---------------------------------------------------------------------------
// Core builder
// ---------------------------------------------------------------------------

/**
 * Build the full H2H records dictionary from all stored match reports.
 * Called after every round commit and on save-load.
 */
export function buildH2HFromMatchReports(
  matchReports: MatchReport[],
): Record<string, H2HRecord> {
  // Group meetings by club pair key, in chronological order
  const grouped: Record<string, H2HMeeting[]> = {}

  for (const report of matchReports) {
    const { homeClubId, awayClubId, homeScore, awayScore, year, round, isFinal } = report
    const key = h2hKey(homeClubId, awayClubId)
    const sorted = [homeClubId, awayClubId].sort()
    const id0 = sorted[0]
    // score0 corresponds to clubId0 (alphabetically first)
    const score0 = id0 === homeClubId ? homeScore : awayScore
    const score1 = id0 === homeClubId ? awayScore : homeScore

    if (!grouped[key]) grouped[key] = []
    grouped[key].push({ year, round, score0, score1, isFinal })
  }

  const result: Record<string, H2HRecord> = {}

  for (const [key, meetings] of Object.entries(grouped)) {
    // Sort chronologically
    meetings.sort((a, b) => a.year !== b.year ? a.year - b.year : a.round - b.round)

    const [id0, id1] = key.split('_')

    let wins0 = 0, wins1 = 0, draws = 0
    let biggestWin0: H2HRecord['biggestWin0'] = null
    let biggestWin1: H2HRecord['biggestWin1'] = null

    for (const m of meetings) {
      const margin = m.score0 - m.score1
      if (margin > 0) {
        wins0++
        if (!biggestWin0 || margin > biggestWin0.margin) {
          biggestWin0 = { margin, year: m.year, round: m.round }
        }
      } else if (margin < 0) {
        wins1++
        if (!biggestWin1 || -margin > biggestWin1.margin) {
          biggestWin1 = { margin: -margin, year: m.year, round: m.round }
        }
      } else {
        draws++
      }
    }

    // Current streak — walk back from the end
    let streak: H2HRecord['streak'] = null
    if (meetings.length > 0) {
      const last = meetings[meetings.length - 1]
      if (last.score0 !== last.score1) {
        const leaderId = last.score0 > last.score1 ? id0 : id1
        let len = 0
        for (let i = meetings.length - 1; i >= 0; i--) {
          const m = meetings[i]
          const winner = m.score0 > m.score1 ? id0 : m.score1 > m.score0 ? id1 : null
          if (winner === leaderId) len++
          else break
        }
        streak = { clubId: leaderId, length: len }
      }
    }

    result[key] = {
      clubId0: id0,
      clubId1: id1,
      wins0,
      wins1,
      draws,
      streak,
      last10: meetings.slice(-10),
      biggestWin0,
      biggestWin1,
      lastMeeting: meetings.length > 0 ? meetings[meetings.length - 1] : null,
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Perspective helper (view from one club's POV)
// ---------------------------------------------------------------------------

export interface H2HPerspective {
  wins: number
  losses: number
  draws: number
  played: number
  /** Streak from this club's perspective. null if no streak or starts with a draw. */
  streak: { type: 'W' | 'L'; length: number } | null
  biggestWin: { margin: number; year: number; round: number } | null
  biggestLoss: { margin: number; year: number; round: number } | null
  lastMeeting: {
    myScore: number
    theirScore: number
    year: number
    round: number
    result: 'W' | 'L' | 'D'
    isFinal: boolean
  } | null
  last10: Array<{
    year: number
    round: number
    myScore: number
    theirScore: number
    result: 'W' | 'L' | 'D'
    isFinal: boolean
  }>
}

export function h2hPerspective(
  record: H2HRecord,
  clubId: string,
): H2HPerspective {
  const isClub0 = record.clubId0 === clubId

  const wins = isClub0 ? record.wins0 : record.wins1
  const losses = isClub0 ? record.wins1 : record.wins0
  const draws = record.draws
  const played = wins + losses + draws

  // Streak
  let streak: H2HPerspective['streak'] = null
  if (record.streak) {
    if (record.streak.clubId === clubId) {
      streak = { type: 'W', length: record.streak.length }
    } else {
      // The opponent is on a winning streak = we're on a losing streak of same length
      streak = { type: 'L', length: record.streak.length }
    }
  }

  // Biggest win/loss
  const myBiggestWin = isClub0 ? record.biggestWin0 : record.biggestWin1
  const myBiggestLoss = isClub0 ? record.biggestWin1 : record.biggestWin0

  // Last meeting
  let lastMeeting: H2HPerspective['lastMeeting'] = null
  if (record.lastMeeting) {
    const lm = record.lastMeeting
    const myScore = isClub0 ? lm.score0 : lm.score1
    const theirScore = isClub0 ? lm.score1 : lm.score0
    const result: 'W' | 'L' | 'D' = myScore > theirScore ? 'W' : myScore < theirScore ? 'L' : 'D'
    lastMeeting = { myScore, theirScore, year: lm.year, round: lm.round, result, isFinal: lm.isFinal }
  }

  // Last 10
  const last10 = record.last10.map((m) => {
    const myScore = isClub0 ? m.score0 : m.score1
    const theirScore = isClub0 ? m.score1 : m.score0
    const result: 'W' | 'L' | 'D' = myScore > theirScore ? 'W' : myScore < theirScore ? 'L' : 'D'
    return { year: m.year, round: m.round, myScore, theirScore, result, isFinal: m.isFinal }
  })

  return { wins, losses, draws, played, streak, biggestWin: myBiggestWin ?? null, biggestLoss: myBiggestLoss ?? null, lastMeeting, last10 }
}
