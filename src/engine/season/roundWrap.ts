import type { Match, MatchPlayerStats } from '@/types/match'
import type { LadderEntry } from '@/types/season'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type {
  RoundWrapData,
  RoundWrapMatchStat,
  RoundWrapPlayerLeader,
  RoundWrapUpset,
} from '@/types/roundWrap'

export interface ComputeRoundWrapInput {
  roundIdx: number
  roundName: string
  dateRange: string
  allMatches: Match[]
  ladder: LadderEntry[]
  players: Record<string, Player>
  clubs: Record<string, Club>
  playerClubId: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreComponents(
  playerStats: MatchPlayerStats[],
): { goals: number; behinds: number } {
  return playerStats.reduce(
    (acc, s) => ({ goals: acc.goals + s.goals, behinds: acc.behinds + s.behinds }),
    { goals: 0, behinds: 0 },
  )
}

function toMatchStat(match: Match, value: number): RoundWrapMatchStat | null {
  if (!match.result) return null
  const home = scoreComponents(match.result.homePlayerStats)
  const away = scoreComponents(match.result.awayPlayerStats)
  return {
    matchId: match.id,
    homeClubId: match.homeClubId,
    awayClubId: match.awayClubId,
    homeScore: match.result.homeTotalScore,
    awayScore: match.result.awayTotalScore,
    homeGoals: home.goals,
    homeBehinds: home.behinds,
    awayGoals: away.goals,
    awayBehinds: away.behinds,
    value,
  }
}

interface PlayerStatEntry {
  stats: MatchPlayerStats
  clubId: string
  matchId: string
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function computeRoundWrap(input: ComputeRoundWrapInput): RoundWrapData | null {
  const { roundIdx, roundName, dateRange, allMatches, ladder, players, clubs, playerClubId } = input

  const roundMatches = allMatches.filter((m) => m.round === roundIdx && m.result !== null)
  if (roundMatches.length === 0) return null

  // Ladder position map (1-based rank)
  const ladderPosMap = new Map<string, number>()
  ladder.forEach((entry, idx) => ladderPosMap.set(entry.clubId, idx + 1))

  // Flatten all participating player stats from the round
  const allPlayerStats: PlayerStatEntry[] = []
  for (const match of roundMatches) {
    if (!match.result) continue
    for (const s of match.result.homePlayerStats) {
      if (s.participated) allPlayerStats.push({ stats: s, clubId: match.homeClubId, matchId: match.id })
    }
    for (const s of match.result.awayPlayerStats) {
      if (s.participated) allPlayerStats.push({ stats: s, clubId: match.awayClubId, matchId: match.id })
    }
  }

  // Generic leader finder
  function findLeader(
    getValue: (s: MatchPlayerStats) => number,
    getSecondary?: (value: number, entry: PlayerStatEntry) => string,
  ): RoundWrapPlayerLeader | null {
    if (allPlayerStats.length === 0) return null
    let best: PlayerStatEntry | null = null
    let bestVal = -Infinity
    for (const entry of allPlayerStats) {
      const val = getValue(entry.stats)
      if (val > bestVal) {
        bestVal = val
        best = entry
      }
    }
    if (!best || bestVal <= 0) return null
    const player = players[best.stats.playerId]
    if (!player) return null
    return {
      playerId: best.stats.playerId,
      playerName: `${player.firstName} ${player.lastName}`,
      clubId: best.clubId,
      value: bestVal,
      secondary: getSecondary ? getSecondary(bestVal, best) : undefined,
    }
  }

  // ── Player leaders ────────────────────────────────────────────────────────

  const disposalsLeader = findLeader(
    (s) => s.disposals,
    (v, e) => {
      const eff = v > 0 ? Math.round(((v - e.stats.clangers) / v) * 100) : 100
      return `${eff}% eff`
    },
  )

  const goalsLeader = findLeader((s) => s.goals)
  const clearancesLeader = findLeader((s) => s.clearances)
  const marksLeader = findLeader((s) => s.marks)
  const tacklesLeader = findLeader((s) => s.tackles)
  const hitoutsLeader = findLeader((s) => s.hitouts)

  const matchRatingLeader = findLeader(
    (s) => s.matchRating ?? 0,
    (v) => `${v.toFixed(1)} rating`,
  )

  const superCoachLeader = findLeader((s) => s.superCoachPoints)
  const fantasyLeader = findLeader((s) => s.aflFantasyPoints)

  // ── Team stat leaders ──────────────────────────────────────────────────────

  let biggestWin: RoundWrapMatchStat | null = null
  let highestScore: RoundWrapMatchStat | null = null
  let bestDisposalDiff: (RoundWrapMatchStat & { dominantClubId: string; disposalDiff: number }) | null = null
  let upsetOfRound: RoundWrapUpset | null = null

  for (const match of roundMatches) {
    if (!match.result) continue
    const r = match.result

    const margin = Math.abs(r.homeTotalScore - r.awayTotalScore)
    const highScore = Math.max(r.homeTotalScore, r.awayTotalScore)

    const base = toMatchStat(match, 0)!

    // Biggest win
    if (!biggestWin || margin > biggestWin.value) {
      biggestWin = { ...base, value: margin }
    }

    // Highest score
    if (!highestScore || highScore > highestScore.value) {
      highestScore = { ...base, value: highScore }
    }

    // Disposal differential
    const homeDisp = r.homePlayerStats.reduce((sum, s) => sum + s.disposals, 0)
    const awayDisp = r.awayPlayerStats.reduce((sum, s) => sum + s.disposals, 0)
    const dispDiff = Math.abs(homeDisp - awayDisp)
    if (!bestDisposalDiff || dispDiff > bestDisposalDiff.disposalDiff) {
      const dominantClubId = homeDisp >= awayDisp ? match.homeClubId : match.awayClubId
      bestDisposalDiff = { ...base, value: dispDiff, dominantClubId, disposalDiff: dispDiff }
    }

    // Upset of round — lower-ranked team beats higher-ranked team
    if (r.homeTotalScore !== r.awayTotalScore) {
      const winnerClubId = r.homeTotalScore > r.awayTotalScore ? match.homeClubId : match.awayClubId
      const loserClubId = winnerClubId === match.homeClubId ? match.awayClubId : match.homeClubId
      const winnerPos = ladderPosMap.get(winnerClubId) ?? 9
      const loserPos = ladderPosMap.get(loserClubId) ?? 9
      const ladderGap = loserPos - winnerPos // positive = winner was lower, i.e. upset

      if (ladderGap > 0) {
        const prevGap = upsetOfRound
          ? upsetOfRound.loserLadderPos - upsetOfRound.winnerLadderPos
          : -1
        if (ladderGap > prevGap) {
          upsetOfRound = {
            ...base,
            value: ladderGap,
            winnerClubId,
            winnerLadderPos: winnerPos,
            loserClubId,
            loserLadderPos: loserPos,
          }
        }
      }
    }
  }

  // ── User match ─────────────────────────────────────────────────────────────

  const userMatchRecord = roundMatches.find(
    (m) => m.homeClubId === playerClubId || m.awayClubId === playerClubId,
  )

  let userMatch: RoundWrapData['userMatch'] = null
  if (userMatchRecord?.result) {
    const r = userMatchRecord.result
    const userIsHome = userMatchRecord.homeClubId === playerClubId
    const userScore = userIsHome ? r.homeTotalScore : r.awayTotalScore
    const oppScore = userIsHome ? r.awayTotalScore : r.homeTotalScore
    const userStats = userIsHome ? r.homePlayerStats : r.awayPlayerStats
    const bestEntry = [...userStats]
      .filter((s) => s.participated)
      .sort((a, b) => (b.matchRating ?? 0) - (a.matchRating ?? 0))[0]

    let bestPlayer: RoundWrapPlayerLeader | null = null
    if (bestEntry) {
      const p = players[bestEntry.playerId]
      if (p) {
        bestPlayer = {
          playerId: bestEntry.playerId,
          playerName: `${p.firstName} ${p.lastName}`,
          clubId: playerClubId,
          value: bestEntry.matchRating ?? 0,
          secondary: `${bestEntry.disposals} disp, ${bestEntry.goals} g, ${(bestEntry.matchRating ?? 0).toFixed(1)} rtg`,
        }
      }
    }

    const homeComp = scoreComponents(r.homePlayerStats)
    const awayComp = scoreComponents(r.awayPlayerStats)

    userMatch = {
      won: userScore > oppScore,
      drew: userScore === oppScore,
      margin: Math.abs(userScore - oppScore),
      homeClubId: userMatchRecord.homeClubId,
      awayClubId: userMatchRecord.awayClubId,
      homeScore: r.homeTotalScore,
      awayScore: r.awayTotalScore,
      homeGoals: homeComp.goals,
      homeBehinds: homeComp.behinds,
      awayGoals: awayComp.goals,
      awayBehinds: awayComp.behinds,
      userIsHome,
      bestPlayer,
      ...(!userIsHome
        ? {
            // flip for display: user's score is always shown prominently
          }
        : {}),
    }
  }

  // ── Review blurb ─────────────────────────────────────────────────────────

  const reviewBlurb = generateReviewBlurb({
    roundName,
    userMatch,
    disposalsLeader,
    goalsLeader,
    matchRatingLeader,
    biggestWin,
    clubs,
    playerClubId,
  })

  // ── All results ──────────────────────────────────────────────────────────

  const allResults: RoundWrapMatchStat[] = roundMatches
    .filter((m) => m.result)
    .map((m) => toMatchStat(m, Math.abs(m.result!.homeTotalScore - m.result!.awayTotalScore))!)

  return {
    roundNumber: roundIdx + 1,
    roundName,
    dateRange,
    disposalsLeader,
    goalsLeader,
    clearancesLeader,
    marksLeader,
    tacklesLeader,
    hitoutsLeader,
    matchRatingLeader,
    superCoachLeader,
    fantasyLeader,
    biggestWin,
    highestScore,
    bestDisposalDiff,
    upsetOfRound,
    userMatch,
    reviewBlurb,
    allResults,
  }
}

// ---------------------------------------------------------------------------
// Review blurb generator
// ---------------------------------------------------------------------------

function generateReviewBlurb(args: {
  roundName: string
  userMatch: RoundWrapData['userMatch']
  disposalsLeader: RoundWrapPlayerLeader | null
  goalsLeader: RoundWrapPlayerLeader | null
  matchRatingLeader: RoundWrapPlayerLeader | null
  biggestWin: RoundWrapMatchStat | null
  clubs: Record<string, Club>
  playerClubId: string
}): string {
  const {
    roundName,
    userMatch,
    disposalsLeader,
    goalsLeader,
    matchRatingLeader,
    biggestWin,
    clubs,
    playerClubId,
  } = args

  const parts: string[] = []

  // User result sentence
  if (userMatch) {
    const userClub = clubs[playerClubId]
    const oppClubId =
      userMatch.homeClubId === playerClubId ? userMatch.awayClubId : userMatch.homeClubId
    const oppClub = clubs[oppClubId]
    const userAbbr = userClub?.fullName ?? playerClubId
    const oppAbbr = oppClub?.fullName ?? oppClubId

    if (userMatch.drew) {
      parts.push(`${userAbbr} drew with ${oppAbbr}.`)
    } else if (userMatch.won) {
      parts.push(`${userAbbr} defeated ${oppAbbr} by ${userMatch.margin} points.`)
    } else {
      parts.push(`${userAbbr} fell to ${oppAbbr} by ${userMatch.margin} points.`)
    }

    if (userMatch.bestPlayer) {
      parts.push(
        `${userMatch.bestPlayer.playerName} was the standout with ${userMatch.bestPlayer.secondary}.`,
      )
    }
  }

  // Biggest win sentence (only if not user's match and margin ≥ 40 pts)
  if (biggestWin && biggestWin.value >= 40) {
    const isUserMatch =
      biggestWin.homeClubId === playerClubId || biggestWin.awayClubId === playerClubId
    if (!isUserMatch) {
      const winnerClubId =
        biggestWin.homeScore > biggestWin.awayScore
          ? biggestWin.homeClubId
          : biggestWin.awayClubId
      const loserClubId =
        winnerClubId === biggestWin.homeClubId ? biggestWin.awayClubId : biggestWin.homeClubId
      const winner = clubs[winnerClubId]?.fullName ?? winnerClubId
      const loser = clubs[loserClubId]?.abbreviation ?? loserClubId
      parts.push(
        `${winner} put in a dominant display, accounting for ${loser} by ${biggestWin.value} points.`,
      )
    }
  }

  // Disposal leader (threshold: 30+)
  if (disposalsLeader && disposalsLeader.value >= 30) {
    parts.push(
      `${disposalsLeader.playerName} was a ball magnet with ${disposalsLeader.value} disposals${disposalsLeader.secondary ? ` (${disposalsLeader.secondary})` : ''}.`,
    )
  }

  // Goal kicker (threshold: 4+)
  if (goalsLeader && goalsLeader.value >= 4) {
    const club = clubs[goalsLeader.clubId]
    parts.push(
      `${goalsLeader.playerName}${club ? ` (${club.abbreviation})` : ''} led all scorers with ${goalsLeader.value} goal${goalsLeader.value !== 1 ? 's' : ''}.`,
    )
  }

  // BOG (threshold: 8.0+)
  if (matchRatingLeader && matchRatingLeader.value >= 8.0) {
    parts.push(
      `${matchRatingLeader.playerName} earned best-on-ground honours with a ${matchRatingLeader.value.toFixed(1)} match rating.`,
    )
  }

  if (parts.length === 0) {
    parts.push(`${roundName} featured competitive footy across the competition.`)
  }

  return parts.join(' ')
}
