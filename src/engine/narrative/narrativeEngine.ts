import type { NewsItem } from '@/types/game'
import type { Player } from '@/types/player'
import type { Match, MatchPlayerStats } from '@/types/match'
import type { Club } from '@/types/club'
import type { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface BrownlowVote {
  playerId: string
  votes: number
}

export interface BrownlowResult {
  winner: { playerId: string; totalVotes: number }
  topTen: { playerId: string; totalVotes: number; clubId: string }[]
  roundByRound: { roundNumber: number; votes: BrownlowVote[] }[]
}

export interface ColemanResult {
  playerId: string
  goals: number
  topFive: { playerId: string; goals: number }[]
}

export interface RisingStarResult {
  playerId: string
  nominations: string[]
}

export interface AllAustralianTeam {
  players: { playerId: string; position: string }[]
  captain: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findClub(clubId: string, clubs: Club[]): Club | undefined {
  return clubs.find((c) => c.id === clubId)
}

function clubName(clubId: string, clubs: Club[]): string {
  return findClub(clubId, clubs)?.name ?? clubId
}

function clubFullName(clubId: string, clubs: Club[]): string {
  return findClub(clubId, clubs)?.fullName ?? clubId
}

function playerFullName(player: Player): string {
  return `${player.firstName} ${player.lastName}`
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Compute a "Brownlow-style" score for a single player stat line.
 * disposals + goals*3 + marks + tackles
 */
function brownlowScore(stats: MatchPlayerStats): number {
  return stats.disposals + stats.goals * 3 + stats.marks + stats.tackles
}

/**
 * Gather all player stats from both sides of a match into a single array
 * annotated with which club they played for and whether that club won.
 */
function allPlayerStatsForMatch(match: Match): {
  stats: MatchPlayerStats
  clubId: string
  isWinner: boolean
}[] {
  const result = match.result!
  const homeWon = result.homeTotalScore > result.awayTotalScore
  const awayWon = result.awayTotalScore > result.homeTotalScore
  const items: { stats: MatchPlayerStats; clubId: string; isWinner: boolean }[] = []

  for (const s of result.homePlayerStats) {
    items.push({ stats: s, clubId: match.homeClubId, isWinner: homeWon })
  }
  for (const s of result.awayPlayerStats) {
    items.push({ stats: s, clubId: match.awayClubId, isWinner: awayWon })
  }
  return items
}

// ---------------------------------------------------------------------------
// 1. generateMatchNews
// ---------------------------------------------------------------------------

export function generateMatchNews(match: Match, clubs: Club[]): NewsItem {
  const result = match.result!
  const homeScore = result.homeTotalScore
  const awayScore = result.awayTotalScore
  const margin = Math.abs(homeScore - awayScore)

  const homeClub = clubName(match.homeClubId, clubs)
  const awayClub = clubName(match.awayClubId, clubs)

  const isDraw = homeScore === awayScore
  const winnerClub = homeScore >= awayScore ? homeClub : awayClub
  const loserClub = homeScore >= awayScore ? awayClub : homeClub
  const winnerScore = Math.max(homeScore, awayScore)
  const loserScore = Math.min(homeScore, awayScore)

  let headline: string
  let body: string

  if (isDraw) {
    headline = `${homeClub} and ${awayClub} play out thrilling draw at ${match.venue}`
    body =
      `${homeClub} and ${awayClub} couldn't be separated in an enthralling contest at ${match.venue}. ` +
      `The scores finished level at ${homeScore} apiece in Round ${match.round}.`
  } else if (margin < 12) {
    headline = `${winnerClub} edges ${loserClub} in thriller at ${match.venue}`
    body =
      `${winnerClub} has scraped home by ${margin} points in a pulsating contest against ${loserClub} at ${match.venue}. ` +
      `The final scores were ${winnerClub} ${winnerScore} to ${loserClub} ${loserScore}.`
  } else if (margin <= 40) {
    headline = `${winnerClub} defeats ${loserClub} by ${margin} points at ${match.venue}`
    body =
      `${winnerClub} proved too strong for ${loserClub}, winning by ${margin} points at ${match.venue} in Round ${match.round}. ` +
      `Final scores: ${winnerClub} ${winnerScore} d. ${loserClub} ${loserScore}.`
  } else {
    headline = `${winnerClub} cruises past ${loserClub} in ${margin}-point demolition`
    body =
      `${winnerClub} demolished ${loserClub} by ${margin} points in a one-sided affair at ${match.venue}. ` +
      `The ${loserClub} had no answers as the final scores read ${winnerClub} ${winnerScore} to ${loserClub} ${loserScore}.`
  }

  const homeGoals = result.homeScores.reduce((sum, q) => sum + q.goals, 0)
  const homeBehinds = result.homeScores.reduce((sum, q) => sum + q.behinds, 0)
  const awayGoals = result.awayScores.reduce((sum, q) => sum + q.goals, 0)
  const awayBehinds = result.awayScores.reduce((sum, q) => sum + q.behinds, 0)

  body +=
    ` ${homeClub} ${homeGoals}.${homeBehinds} (${homeScore})` +
    ` - ${awayClub} ${awayGoals}.${awayBehinds} (${awayScore}).`

  return {
    id: crypto.randomUUID(),
    date: match.date ?? todayISO(),
    headline,
    body,
    category: 'match',
    clubIds: [match.homeClubId, match.awayClubId],
    playerIds: [],
  }
}

// ---------------------------------------------------------------------------
// 2. generateInjuryNews
// ---------------------------------------------------------------------------

export function generateInjuryNews(
  player: Player,
  injuryType: string,
  weeksOut: number,
  clubs: Club[],
): NewsItem {
  const club = clubFullName(player.clubId, clubs)
  const name = playerFullName(player)

  const headline = `${name} ruled out for ${weeksOut} week${weeksOut !== 1 ? 's' : ''} with ${injuryType}`
  const body =
    `${club} will be without ${name} for the next ${weeksOut} week${weeksOut !== 1 ? 's' : ''} after the ${player.position.primary} ` +
    `sustained a ${injuryType} during ${weeksOut > 4 ? 'a significant setback' : 'play'}. ` +
    `The ${player.age}-year-old's absence will be felt as the club looks to cover the loss ` +
    `in upcoming rounds.`

  return {
    id: crypto.randomUUID(),
    date: todayISO(),
    headline,
    body,
    category: 'injury',
    clubIds: [player.clubId],
    playerIds: [player.id],
  }
}

// ---------------------------------------------------------------------------
// 3. generateTradeNews
// ---------------------------------------------------------------------------

export function generateTradeNews(
  playersMoving: Player[],
  clubA: Club,
  clubB: Club,
  _clubs: Club[],
): NewsItem {
  // Determine "headline player" as first player in the list
  const headlinePlayer = playersMoving[0]
  const headlinePlayerName = playerFullName(headlinePlayer)

  const acquiringClub =
    headlinePlayer.clubId === clubA.id ? clubB : clubA
  const sendingClub =
    headlinePlayer.clubId === clubA.id ? clubA : clubB

  const headline = `${acquiringClub.name} acquires ${headlinePlayerName} in trade with ${sendingClub.name}`

  const playerNames = playersMoving.map(playerFullName)
  let body: string
  if (playersMoving.length === 1) {
    body =
      `${acquiringClub.fullName} have completed a trade to bring in ${headlinePlayerName} from ${sendingClub.fullName}. ` +
      `The ${headlinePlayer.age}-year-old ${headlinePlayer.position.primary} adds depth to the ${acquiringClub.name} list.`
  } else {
    body =
      `${clubA.fullName} and ${clubB.fullName} have struck a deal involving ${playerNames.join(', ')}. ` +
      `The trade sees multiple players change clubs as both teams reshape their lists ahead of the new season.`
  }

  return {
    id: crypto.randomUUID(),
    date: todayISO(),
    headline,
    body,
    category: 'trade',
    clubIds: [clubA.id, clubB.id],
    playerIds: playersMoving.map((p) => p.id),
  }
}

// ---------------------------------------------------------------------------
// 4. generateContractNews
// ---------------------------------------------------------------------------

export function generateContractNews(
  player: Player,
  years: number,
  aav: number,
  isReSigning: boolean,
  clubs: Club[],
): NewsItem {
  const name = playerFullName(player)
  const club = clubName(player.clubId, clubs)
  const clubFull = clubFullName(player.clubId, clubs)

  const formattedAAV = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(aav)

  let headline: string
  let body: string

  if (isReSigning) {
    headline = `${name} commits to ${club} on ${years}-year deal`
    body =
      `${name} has re-signed with the ${clubFull}, penning a ${years}-year contract ` +
      `worth an average of ${formattedAAV} per season. ` +
      `The ${player.age}-year-old ${player.position.primary} has been a key contributor and the club moved quickly to lock away the ${player.lastName}'s future.`
  } else {
    headline = `${name} signs with ${club}`
    body =
      `${clubFull} have secured the signature of ${name} on a ${years}-year deal ` +
      `averaging ${formattedAAV} per season. ` +
      `The ${player.age}-year-old arrives at the club as a new signing and will bolster the ${club} list.`
  }

  return {
    id: crypto.randomUUID(),
    date: todayISO(),
    headline,
    body,
    category: 'contract',
    clubIds: [player.clubId],
    playerIds: [player.id],
  }
}

// ---------------------------------------------------------------------------
// 5. generateDraftNews
// ---------------------------------------------------------------------------

export function generateDraftNews(
  playerName: string,
  clubName: string,
  pickNumber: number,
): NewsItem {
  const headline = `${clubName} selects ${playerName} with pick #${pickNumber}`
  const body =
    `With pick number ${pickNumber} in the National Draft, ${clubName} have selected ${playerName}. ` +
    `${pickNumber <= 5 ? 'A highly rated prospect, ' : ''}${playerName} will join the club's list ` +
    `and look to make an impact at the highest level.`

  return {
    id: crypto.randomUUID(),
    date: todayISO(),
    headline,
    body,
    category: 'draft',
    clubIds: [],
    playerIds: [],
  }
}

// ---------------------------------------------------------------------------
// 6. simulateBrownlowMedal
// ---------------------------------------------------------------------------

export function simulateBrownlowMedal(
  matchResults: Match[],
  players: Player[],
  _clubs: Club[],
  rng: SeededRNG,
): BrownlowResult {
  const playerMap = new Map<string, Player>()
  for (const p of players) {
    playerMap.set(p.id, p)
  }

  // Accumulate total votes per player
  const totalVotes = new Map<string, number>()
  const roundByRound: BrownlowResult['roundByRound'] = []

  // Only award votes in home-and-away matches (not finals)
  const homeAndAway = matchResults.filter((m) => !m.isFinal && m.result !== null)

  // Group matches by round
  const roundMap = new Map<number, Match[]>()
  for (const m of homeAndAway) {
    const existing = roundMap.get(m.round) ?? []
    existing.push(m)
    roundMap.set(m.round, existing)
  }

  const sortedRounds = [...roundMap.keys()].sort((a, b) => a - b)

  for (const roundNum of sortedRounds) {
    const roundMatches = roundMap.get(roundNum)!
    const roundVotes: BrownlowVote[] = []

    for (const match of roundMatches) {
      const allStats = allPlayerStatsForMatch(match)

      // Score each player
      const scored = allStats.map(({ stats, isWinner }) => {
        let score = brownlowScore(stats)

        // Winning team bonus (+15%)
        if (isWinner) {
          score *= 1.15
        }

        // Mental attribute bonus: all seven mental attrs > 60
        const player = playerMap.get(stats.playerId)
        if (player) {
          const mental = player.attributes
          const mentalAttrs = [
            mental.pressure,
            mental.leadership,
            mental.workRate,
            mental.consistency,
            mental.determination,
            mental.teamPlayer,
            mental.clutch,
          ]
          if (mentalAttrs.every((v) => v > 60)) {
            score *= 1.05
          }
        }

        // Small random jitter for tie-breaking
        score += rng.next() * 0.5

        return { playerId: stats.playerId, score }
      })

      // Sort descending by score
      scored.sort((a, b) => b.score - a.score)

      // Award 3-2-1 votes to top three
      const voteAllocations = [3, 2, 1]
      for (let i = 0; i < Math.min(3, scored.length); i++) {
        const pid = scored[i].playerId
        const v = voteAllocations[i]
        totalVotes.set(pid, (totalVotes.get(pid) ?? 0) + v)
        roundVotes.push({ playerId: pid, votes: v })
      }
    }

    roundByRound.push({ roundNumber: roundNum, votes: roundVotes })
  }

  // Build sorted leaderboard
  const leaderboard = [...totalVotes.entries()]
    .map(([playerId, votes]) => ({
      playerId,
      totalVotes: votes,
      clubId: playerMap.get(playerId)?.clubId ?? '',
    }))
    .sort((a, b) => b.totalVotes - a.totalVotes)

  const topTen = leaderboard.slice(0, 10)

  const winner = topTen.length > 0
    ? { playerId: topTen[0].playerId, totalVotes: topTen[0].totalVotes }
    : { playerId: '', totalVotes: 0 }

  return { winner, topTen, roundByRound }
}

// ---------------------------------------------------------------------------
// 7. simulateColemanMedal
// ---------------------------------------------------------------------------

export function simulateColemanMedal(
  matchResults: Match[],
  _players: Player[],
): ColemanResult {
  const goalTally = new Map<string, number>()

  // Only home-and-away matches count
  const homeAndAway = matchResults.filter((m) => !m.isFinal && m.result !== null)

  for (const match of homeAndAway) {
    const allStats = [
      ...match.result!.homePlayerStats,
      ...match.result!.awayPlayerStats,
    ]
    for (const s of allStats) {
      goalTally.set(s.playerId, (goalTally.get(s.playerId) ?? 0) + s.goals)
    }
  }

  const sorted = [...goalTally.entries()]
    .map(([playerId, goals]) => ({ playerId, goals }))
    .sort((a, b) => b.goals - a.goals)

  const topFive = sorted.slice(0, 5)
  const winner = topFive.length > 0
    ? { playerId: topFive[0].playerId, goals: topFive[0].goals }
    : { playerId: '', goals: 0 }

  return {
    playerId: winner.playerId,
    goals: winner.goals,
    topFive,
  }
}

// ---------------------------------------------------------------------------
// 8. simulateRisingStar
// ---------------------------------------------------------------------------

export function simulateRisingStar(
  matchResults: Match[],
  players: Player[],
  rng: SeededRNG,
): RisingStarResult {
  const playerMap = new Map<string, Player>()
  for (const p of players) {
    playerMap.set(p.id, p)
  }

  const homeAndAway = matchResults.filter((m) => !m.isFinal && m.result !== null)

  // Group matches by round
  const roundMap = new Map<number, Match[]>()
  for (const m of homeAndAway) {
    const existing = roundMap.get(m.round) ?? []
    existing.push(m)
    roundMap.set(m.round, existing)
  }

  const sortedRounds = [...roundMap.keys()].sort((a, b) => a - b)

  const nominations: string[] = []
  const nominated = new Set<string>()

  // Accumulate performance scores for nominees across the season
  const nomineePerformance = new Map<string, { totalScore: number; games: number }>()

  for (const roundNum of sortedRounds) {
    const roundMatches = roundMap.get(roundNum)!

    // Collect all eligible player performances this round
    const eligible: { playerId: string; score: number }[] = []

    for (const match of roundMatches) {
      const allStats = [
        ...match.result!.homePlayerStats,
        ...match.result!.awayPlayerStats,
      ]

      for (const s of allStats) {
        const player = playerMap.get(s.playerId)
        if (!player) continue
        // Eligible: age <= 21 AND career gamesPlayed < 15
        if (player.age > 21 || player.careerStats.gamesPlayed >= 15) continue
        // Cannot be nominated twice
        if (nominated.has(s.playerId)) continue

        const score = s.disposals + s.goals * 3 + s.marks + s.tackles
        eligible.push({ playerId: s.playerId, score })
      }
    }

    if (eligible.length === 0) continue

    // Sort by performance, add small jitter for variety
    eligible.sort((a, b) => (b.score + rng.next() * 2) - (a.score + rng.next() * 2))

    // Nominate the top performer
    const nominee = eligible[0]
    nominations.push(nominee.playerId)
    nominated.add(nominee.playerId)
  }

  // Now determine the winner: track each nominee's performance over the whole season
  for (const match of homeAndAway) {
    const allStats = [
      ...match.result!.homePlayerStats,
      ...match.result!.awayPlayerStats,
    ]
    for (const s of allStats) {
      if (!nominated.has(s.playerId)) continue
      const score = s.disposals + s.goals * 3 + s.marks + s.tackles
      const prev = nomineePerformance.get(s.playerId) ?? { totalScore: 0, games: 0 }
      prev.totalScore += score
      prev.games += 1
      nomineePerformance.set(s.playerId, prev)
    }
  }

  // Pick the nominee with the best average performance
  let bestId = nominations[0] ?? ''
  let bestAvg = -1

  for (const pid of nominations) {
    const perf = nomineePerformance.get(pid)
    if (!perf || perf.games === 0) continue
    const avg = perf.totalScore / perf.games + rng.next() * 0.5
    if (avg > bestAvg) {
      bestAvg = avg
      bestId = pid
    }
  }

  return {
    playerId: bestId,
    nominations,
  }
}

// ---------------------------------------------------------------------------
// 9. selectAllAustralian
// ---------------------------------------------------------------------------

/**
 * Positional slots for the All-Australian team.
 * 6 defenders, 6 midfielders, 6 forwards, 2 rucks, 2 interchange = 22.
 */
const ALL_AUSTRALIAN_SLOTS: { position: string; count: number; eligiblePrimary: string[] }[] = [
  { position: 'Defender', count: 6, eligiblePrimary: ['BP', 'FB', 'HBF', 'CHB'] },
  { position: 'Midfielder', count: 6, eligiblePrimary: ['IM', 'OM', 'W'] },
  { position: 'Forward', count: 6, eligiblePrimary: ['HFF', 'CHF', 'FP', 'FF'] },
  { position: 'Ruck', count: 2, eligiblePrimary: ['RK'] },
  { position: 'Interchange', count: 2, eligiblePrimary: [] }, // best available
]

export function selectAllAustralian(
  matchResults: Match[],
  players: Player[],
  _clubs: Club[],
): AllAustralianTeam {
  const playerMap = new Map<string, Player>()
  for (const p of players) {
    playerMap.set(p.id, p)
  }

  // Accumulate season stats for each player across all matches (H&A only)
  const homeAndAway = matchResults.filter((m) => !m.isFinal && m.result !== null)

  const seasonTotals = new Map<string, { totalScore: number; games: number }>()

  for (const match of homeAndAway) {
    const allStats = [
      ...match.result!.homePlayerStats,
      ...match.result!.awayPlayerStats,
    ]
    for (const s of allStats) {
      const player = playerMap.get(s.playerId)
      if (!player) continue

      // Weighted performance score: disposals + goals*3 + marks + tackles + clearances + contestedPossessions
      const score =
        s.disposals +
        s.goals * 3 +
        s.marks +
        s.tackles +
        s.clearances * 1.5 +
        s.contestedPossessions * 1.2 +
        s.insideFifties * 0.8 +
        s.rebound50s * 0.8

      // Factor in attribute quality: average of composure, consistency, workRate as fraction
      const attrBonus =
        (player.attributes.composure +
          player.attributes.consistency +
          player.attributes.workRate) /
        300

      const adjustedScore = score * (1 + attrBonus * 0.15)

      const prev = seasonTotals.get(s.playerId) ?? { totalScore: 0, games: 0 }
      prev.totalScore += adjustedScore
      prev.games += 1
      seasonTotals.set(s.playerId, prev)
    }
  }

  // Compute average score for each player (only if they played enough games)
  const minGames = Math.max(1, Math.floor(homeAndAway.length / 18 * 10)) // ~10 games minimum scaled to season length
  const averages = new Map<string, number>()
  for (const [pid, data] of seasonTotals) {
    if (data.games >= minGames) {
      averages.set(pid, data.totalScore / data.games)
    }
  }

  // Sort all players by average score
  const rankedPlayers = [...averages.entries()]
    .map(([playerId, avg]) => ({ playerId, avg }))
    .sort((a, b) => b.avg - a.avg)

  const selected: { playerId: string; position: string }[] = []
  const usedPlayers = new Set<string>()

  // Fill each positional group
  for (const slot of ALL_AUSTRALIAN_SLOTS) {
    let filled = 0
    if (slot.eligiblePrimary.length > 0) {
      // Find players whose primary position matches
      const eligible = rankedPlayers.filter(
        (rp) =>
          !usedPlayers.has(rp.playerId) &&
          slot.eligiblePrimary.includes(playerMap.get(rp.playerId)?.position.primary ?? ''),
      )
      for (const rp of eligible) {
        if (filled >= slot.count) break
        selected.push({ playerId: rp.playerId, position: slot.position })
        usedPlayers.add(rp.playerId)
        filled++
      }
    }

    // Interchange or under-filled: take best available
    if (filled < slot.count) {
      const remaining = rankedPlayers.filter((rp) => !usedPlayers.has(rp.playerId))
      for (const rp of remaining) {
        if (filled >= slot.count) break
        selected.push({ playerId: rp.playerId, position: slot.position })
        usedPlayers.add(rp.playerId)
        filled++
      }
    }
  }

  // Captain = highest leadership among selected
  let captainId = selected[0]?.playerId ?? ''
  let highestLeadership = -1

  for (const s of selected) {
    const player = playerMap.get(s.playerId)
    if (player && player.attributes.leadership > highestLeadership) {
      highestLeadership = player.attributes.leadership
      captainId = s.playerId
    }
  }

  return {
    players: selected,
    captain: captainId,
  }
}

// ---------------------------------------------------------------------------
// 10. generateSeasonSummaryNews
// ---------------------------------------------------------------------------

export interface SeasonAwards {
  brownlow?: BrownlowResult
  coleman?: ColemanResult
  risingStar?: RisingStarResult
  allAustralian?: AllAustralianTeam
}

export function generateSeasonSummaryNews(
  awards: SeasonAwards,
  clubs: Club[],
  players: Player[],
): NewsItem[] {
  const news: NewsItem[] = []

  const playerMap = new Map<string, Player>()
  for (const p of players) {
    playerMap.set(p.id, p)
  }

  // Brownlow Medal
  if (awards.brownlow) {
    const { winner, topTen } = awards.brownlow
    const winnerPlayer = playerMap.get(winner.playerId)
    if (winnerPlayer) {
      const name = playerFullName(winnerPlayer)
      const club = clubName(winnerPlayer.clubId, clubs)

      const runnerUp = topTen.length > 1 ? playerMap.get(topTen[1].playerId) : undefined
      const runnerUpText = runnerUp
        ? ` ${playerFullName(runnerUp)} (${topTen[1].totalVotes} votes) finished runner-up.`
        : ''

      news.push({
        id: crypto.randomUUID(),
        date: todayISO(),
        headline: `${name} wins the Brownlow Medal`,
        body:
          `${club}'s ${name} has taken home the Brownlow Medal with ${winner.totalVotes} votes, ` +
          `capping off a stellar season.${runnerUpText}` +
          ` The ${winnerPlayer.age}-year-old ${winnerPlayer.position.primary} polled consistently throughout the year ` +
          `to claim the game's highest individual honour.`,
        category: 'general',
        clubIds: [winnerPlayer.clubId],
        playerIds: [winner.playerId],
      })
    }
  }

  // Coleman Medal
  if (awards.coleman) {
    const { playerId, goals, topFive } = awards.coleman
    const winnerPlayer = playerMap.get(playerId)
    if (winnerPlayer) {
      const name = playerFullName(winnerPlayer)
      const club = clubName(winnerPlayer.clubId, clubs)

      const runnerUp = topFive.length > 1 ? playerMap.get(topFive[1].playerId) : undefined
      const runnerUpText = runnerUp
        ? ` ${playerFullName(runnerUp)} (${topFive[1].goals} goals) finished second.`
        : ''

      news.push({
        id: crypto.randomUUID(),
        date: todayISO(),
        headline: `${name} claims Coleman Medal with ${goals} goals`,
        body:
          `${club} spearhead ${name} has won the Coleman Medal after booting ${goals} goals ` +
          `during the home-and-away season.${runnerUpText}` +
          ` ${winnerPlayer.lastName} was a constant threat up forward for the ${club}.`,
        category: 'general',
        clubIds: [winnerPlayer.clubId],
        playerIds: [playerId],
      })
    }
  }

  // Rising Star
  if (awards.risingStar) {
    const { playerId, nominations } = awards.risingStar
    const winnerPlayer = playerMap.get(playerId)
    if (winnerPlayer) {
      const name = playerFullName(winnerPlayer)
      const club = clubName(winnerPlayer.clubId, clubs)

      news.push({
        id: crypto.randomUUID(),
        date: todayISO(),
        headline: `${name} named Rising Star winner`,
        body:
          `${club}'s ${name} has been crowned the AFL Rising Star for the season. ` +
          `The ${winnerPlayer.age}-year-old was chosen from ${nominations.length} nominees over the course ` +
          `of the home-and-away season, impressing with consistent performances at the highest level.`,
        category: 'general',
        clubIds: [winnerPlayer.clubId],
        playerIds: [playerId],
      })
    }
  }

  // All-Australian
  if (awards.allAustralian) {
    const { players: aaPlayers, captain } = awards.allAustralian
    const captainPlayer = playerMap.get(captain)
    const captainName = captainPlayer ? playerFullName(captainPlayer) : 'Unknown'
    const captainClub = captainPlayer ? clubName(captainPlayer.clubId, clubs) : ''

    // Gather unique clubs represented
    const representedClubs = new Set<string>()
    for (const aa of aaPlayers) {
      const p = playerMap.get(aa.playerId)
      if (p) representedClubs.add(p.clubId)
    }

    news.push({
      id: crypto.randomUUID(),
      date: todayISO(),
      headline: `All-Australian team announced; ${captainName} named captain`,
      body:
        `The All-Australian team for the season has been unveiled, with ${captainClub}'s ` +
        `${captainName} named as captain of the 22-player squad. ` +
        `Players from ${representedClubs.size} clubs earned selection across the defender, midfielder, ` +
        `forward, ruck, and interchange lines. ` +
        `The team recognises the standout performers of the home-and-away season.`,
      category: 'general',
      clubIds: captainPlayer ? [captainPlayer.clubId] : [],
      playerIds: aaPlayers.map((aa) => aa.playerId),
    })
  }

  return news
}
