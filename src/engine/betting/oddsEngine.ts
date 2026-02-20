/**
 * Odds Engine — Simulated betting markets for the AFL Manager game.
 * No real-money integration. Purely for in-game entertainment.
 */
import { getOverallRating } from '@/engine/player/playerRating'
import type { Player } from '@/types/player'
import type { LadderEntry } from '@/types/season'
import type { Match } from '@/types/match'
import type {
  BettingMarketsState,
  BettingSettings,
  MatchBettingMarket,
  OddsMovement,
} from '@/types/betting'
import { defaultBettingMarkets } from '@/types/betting'

// ---------------------------------------------------------------------------
// Core math helpers
// ---------------------------------------------------------------------------

/** Convert a true probability to decimal odds with a bookmaker margin applied. */
export function toDecimalOdds(probability: number, margin: number): number {
  const p = Math.max(0.005, Math.min(0.995, probability))
  return Math.round((1 / (p * (1 + margin))) * 100) / 100
}

/** Clamp + round to standard odds step (nearest 0.05 for odds < 5, nearest 0.1 above). */
export function formatOdds(raw: number): number {
  if (raw < 5) return Math.round(raw * 20) / 20   // 0.05 steps
  if (raw < 20) return Math.round(raw * 10) / 10  // 0.1 steps
  return Math.round(raw)
}

// ---------------------------------------------------------------------------
// Team strength
// ---------------------------------------------------------------------------

export function getTeamStrength(
  clubId: string,
  players: Record<string, Player>,
  ladder: LadderEntry[],
  matchResults: Match[],
): number {
  // Top 22 available players
  const available = Object.values(players)
    .filter((p) => p.clubId === clubId && !p.injury && p.listStatus !== 'injured-list')
    .sort((a, b) => getOverallRating(b) - getOverallRating(a))
    .slice(0, 22)

  const avgRating =
    available.length > 0
      ? available.reduce((s, p) => s + getOverallRating(p), 0) / available.length
      : 60

  // Penalty for key players who are injured (but outside of top 22 available)
  const injuredKeyCount = Object.values(players).filter(
    (p) => p.clubId === clubId && p.injury && getOverallRating(p) > 75,
  ).length
  const injuryPenalty = injuredKeyCount * 1.5

  // Recent form (last 5 games): win rate 0-1
  const recent = matchResults
    .filter((m) => m.result && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => b.round - a.round)
    .slice(0, 5)

  const winRate =
    recent.length > 0
      ? recent.reduce((s, m) => {
          const isHome = m.homeClubId === clubId
          const hw = m.result!.homeTotalScore
          const aw = m.result!.awayTotalScore
          return s + (isHome ? (hw > aw ? 1 : 0) : (aw > hw ? 1 : 0))
        }, 0) / recent.length
      : 0.5

  // Ladder position bonus (pos 1 = highest bonus)
  const ladderPos = ladder.findIndex((e) => e.clubId === clubId)
  const ladderBonus = ladderPos >= 0 ? (ladder.length - ladderPos) * 0.3 : 0

  return avgRating + winRate * 6 + ladderBonus - injuryPenalty
}

// ---------------------------------------------------------------------------
// Win probability (logistic model)
// ---------------------------------------------------------------------------

const HOME_GROUND_ADVANTAGE = 3.5 // equivalent rating points for home ground

/** Returns raw (no-margin) win probabilities for home and away teams. */
export function matchWinProbabilities(
  homeStrength: number,
  awayStrength: number,
): { home: number; away: number } {
  const diff = homeStrength + HOME_GROUND_ADVANTAGE - awayStrength
  const k = 0.09
  const pHome = 1 / (1 + Math.exp(-k * diff))
  return { home: pHome, away: 1 - pHome }
}

/** Expected winning margin for home team (used for line setting). */
export function expectedMarginPoints(homeStrength: number, awayStrength: number): number {
  const diff = homeStrength + HOME_GROUND_ADVANTAGE - awayStrength
  // ~2.8 AFL points per rating point difference, calibrated roughly
  return diff * 2.8
}

// ---------------------------------------------------------------------------
// Match market generator
// ---------------------------------------------------------------------------

export function generateMatchMarket(
  match: Match,
  homeStrength: number,
  awayStrength: number,
  settings: BettingSettings,
): MatchBettingMarket {
  const { home: pH, away: pA } = matchWinProbabilities(homeStrength, awayStrength)
  const margin = settings.margin

  const rawLine = expectedMarginPoints(homeStrength, awayStrength)
  // Line rounded to nearest 0.5
  const line = Math.round(rawLine * 2) / 2

  // For the line market, both sides should be close to evens (after margin)
  // True prob for each side on the line is approximately 50/50 by definition
  const lineProb = 0.5

  // Total points: base ~155, adjust for team attacking ratings
  const baseTotals = 155
  const totalAdj = ((homeStrength + awayStrength) / 2 - 70) * 0.8
  const totalLine = settings.totalPointsMarkets
    ? Math.round((baseTotals + totalAdj) / 5) * 5
    : null

  const settled = !!match.result
  let resultOutcome: 'home' | 'away' | null = null
  if (settled && match.result) {
    const h = match.result.homeTotalScore
    const a = match.result.awayTotalScore
    resultOutcome = h > a ? 'home' : h < a ? 'away' : null
  }

  return {
    matchId: match.id,
    roundIndex: match.round,
    isFinal: match.isFinal,
    homeClubId: match.homeClubId,
    awayClubId: match.awayClubId,
    generatedDate: match.date,

    homeOdds: formatOdds(toDecimalOdds(pH, margin)),
    awayOdds: formatOdds(toDecimalOdds(pA, margin)),

    line,
    homeLineOdds: formatOdds(toDecimalOdds(lineProb, margin)),
    awayLineOdds: formatOdds(toDecimalOdds(lineProb, margin)),

    totalLine,
    overOdds: totalLine !== null ? formatOdds(toDecimalOdds(0.5, margin)) : null,
    underOdds: totalLine !== null ? formatOdds(toDecimalOdds(0.5, margin)) : null,

    settled,
    resultOutcome,
  }
}

// ---------------------------------------------------------------------------
// Futures: season-long club markets
// ---------------------------------------------------------------------------

/**
 * Estimate probability each club wins the premiership, makes finals, etc.
 * Uses a simple Bradley-Terry-style model based on team strength.
 */
export function generateFuturesOdds(
  strengths: Record<string, number>,
  ladder: LadderEntry[],
  roundsRemaining: number,
  totalRounds: number,
  margin: number,
): { premiership: Record<string, number>; top8: Record<string, number>; top4: Record<string, number>; woodenSpoon: Record<string, number> } {
  const clubIds = Object.keys(strengths)
  const n = clubIds.length
  if (n === 0) return { premiership: {}, top8: {}, top4: {}, woodenSpoon: {} }

  // Premiership: Bradley-Terry — P(i wins all) ∝ strength_i^2
  const sq = Object.fromEntries(clubIds.map((id) => [id, Math.max(0.1, strengths[id]!) ** 2]))
  const sqTotal = Object.values(sq).reduce((s, v) => s + v, 0)
  const pPremiership = Object.fromEntries(clubIds.map((id) => [id, sq[id]! / sqTotal]))

  // Finals likelihood (top 8): incorporate current ladder points
  // As season progresses, ladder position dominates
  const seasonProgress = totalRounds > 0 ? Math.min(1, (totalRounds - roundsRemaining) / totalRounds) : 0
  const ladderMap = Object.fromEntries(ladder.map((e, i) => [e.clubId, i]))

  function top8Prob(id: string): number {
    const pos = ladderMap[id] ?? n - 1
    // Strength-based component
    const strengthP = Math.max(0, 1 - (pos / n) * 1.4)
    // Ladder-based component (grows with season progress)
    const ladderP = pos < 8 ? 0.85 - pos * 0.03 : 0.75 - pos * 0.06
    return Math.max(0.02, Math.min(0.97, strengthP * (1 - seasonProgress) + ladderP * seasonProgress))
  }

  function top4Prob(id: string): number {
    const pos = ladderMap[id] ?? n - 1
    const strengthP = Math.max(0, 1 - (pos / n) * 2.2)
    const ladderP = pos < 4 ? 0.80 - pos * 0.05 : 0.45 - pos * 0.04
    return Math.max(0.01, Math.min(0.96, strengthP * (1 - seasonProgress) + ladderP * seasonProgress))
  }

  function woodenSpoonProb(id: string): number {
    const pos = ladderMap[id] ?? n - 1
    const strengthP = Math.max(0, (pos / n) * 0.7 - 0.2)
    const ladderP = pos >= n - 3 ? 0.25 + (pos - (n - 3)) * 0.1 : Math.max(0, 0.05 - pos * 0.003)
    return Math.max(0.01, Math.min(0.95, strengthP * (1 - seasonProgress) + ladderP * seasonProgress))
  }

  const toOddsRecord = (probs: Record<string, number>) =>
    Object.fromEntries(Object.entries(probs).map(([id, p]) => [id, formatOdds(toDecimalOdds(p, margin))]))

  return {
    premiership: toOddsRecord(pPremiership),
    top8: toOddsRecord(Object.fromEntries(clubIds.map((id) => [id, top8Prob(id)]))),
    top4: toOddsRecord(Object.fromEntries(clubIds.map((id) => [id, top4Prob(id)]))),
    woodenSpoon: toOddsRecord(Object.fromEntries(clubIds.map((id) => [id, woodenSpoonProb(id)]))),
  }
}

// ---------------------------------------------------------------------------
// Award markets
// ---------------------------------------------------------------------------

export function generateAwardOdds(
  players: Record<string, Player>,
  brownlowTracker: Array<{ playerId: string; votes: number }>,
  currentRound: number,
  totalRounds: number,
  margin: number,
): { brownlow: Record<string, number>; coleman: Record<string, number>; risingStar: Record<string, number> } {
  const allPlayers = Object.values(players).filter((p) => p.seasonStats.gamesPlayed > 0)
  const roundsRemaining = Math.max(0, totalRounds - currentRound)

  // --- Brownlow ---
  const brownlowVotesMap = Object.fromEntries(brownlowTracker.map((b) => [b.playerId, b.votes]))

  const brownlowScores = allPlayers.map((p) => {
    const currentVotes = brownlowVotesMap[p.id] ?? 0
    // Project future votes: disposals/game * remaining rounds * vote rate
    const dispPerGame =
      p.seasonStats.gamesPlayed > 0 ? p.seasonStats.disposals / p.seasonStats.gamesPlayed : 0
    const projFutureVotes = (dispPerGame / 30) * roundsRemaining * 2.5
    const totalProjected = currentVotes + projFutureVotes
    return { id: p.id, score: totalProjected }
  })

  // Softmax to convert scores to probabilities
  const brownlowTop = brownlowScores.sort((a, b) => b.score - a.score).slice(0, 30)
  const maxBScore = brownlowTop[0]?.score ?? 1
  const bExpScores = brownlowTop.map((x) => ({ id: x.id, exp: Math.exp((x.score - maxBScore) * 0.3) }))
  const bTotal = bExpScores.reduce((s, x) => s + x.exp, 0)
  const brownlow = Object.fromEntries(
    bExpScores.map((x) => [x.id, formatOdds(toDecimalOdds(x.exp / bTotal, margin))]),
  )

  // --- Coleman (leading goalkicker) ---
  const colemanScores = allPlayers.map((p) => {
    const goalsPerGame =
      p.seasonStats.gamesPlayed > 0 ? p.seasonStats.goals / p.seasonStats.gamesPlayed : 0
    const projTotal = p.seasonStats.goals + goalsPerGame * roundsRemaining
    return { id: p.id, score: projTotal }
  })

  const colemanTop = colemanScores.sort((a, b) => b.score - a.score).slice(0, 20)
  const maxCScore = colemanTop[0]?.score ?? 1
  const cExpScores = colemanTop.map((x) => ({ id: x.id, exp: Math.exp((x.score - maxCScore) * 0.4) }))
  const cTotal = cExpScores.reduce((s, x) => s + x.exp, 0)
  const coleman = Object.fromEntries(
    cExpScores.map((x) => [x.id, formatOdds(toDecimalOdds(x.exp / cTotal, margin))]),
  )

  // --- Rising Star (U22) ---
  const risingStarCandidates = allPlayers
    .filter((p) => p.age <= 22 && p.seasonStats.gamesPlayed >= 3)
    .map((p) => {
      const dispPerGame =
        p.seasonStats.gamesPlayed > 0 ? p.seasonStats.disposals / p.seasonStats.gamesPlayed : 0
      const goalsPerGame =
        p.seasonStats.gamesPlayed > 0 ? p.seasonStats.goals / p.seasonStats.gamesPlayed : 0
      // Composite score (disposals + goals weighted)
      const score = dispPerGame * 1.0 + goalsPerGame * 3 + (22 - p.age) * 0.5
      return { id: p.id, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  const maxRScore = risingStarCandidates[0]?.score ?? 1
  const rExpScores = risingStarCandidates.map((x) => ({
    id: x.id,
    exp: Math.exp((x.score - maxRScore) * 0.5),
  }))
  const rTotal = rExpScores.reduce((s, x) => s + x.exp, 0)
  const risingStar = Object.fromEntries(
    rExpScores.map((x) => [x.id, formatOdds(toDecimalOdds(x.exp / rTotal, margin))]),
  )

  return { brownlow, coleman, risingStar }
}

// ---------------------------------------------------------------------------
// History tracker
// ---------------------------------------------------------------------------

/** Append an odds movement to a history array, keeping at most maxEntries. */
export function appendOddsHistory(
  history: OddsMovement[],
  date: string,
  odds: number,
  maxEntries = 12,
): OddsMovement[] {
  const last = history[history.length - 1]
  if (last && last.odds === odds) return history // no change, skip
  const next = [...history, { date, odds }]
  return next.length > maxEntries ? next.slice(next.length - maxEntries) : next
}

// ---------------------------------------------------------------------------
// Full market refresh
// ---------------------------------------------------------------------------

export function refreshAllBettingMarkets(params: {
  currentState: BettingMarketsState | null
  players: Record<string, Player>
  clubs: Record<string, { id: string }>
  ladder: LadderEntry[]
  matchResults: Match[]
  upcomingMatches: Match[]
  currentDate: string
  currentRound: number
  totalRounds: number
  brownlowTracker: Array<{ playerId: string; votes: number }>
  settings: BettingSettings
}): BettingMarketsState {
  const {
    currentState,
    players,
    clubs,
    ladder,
    matchResults,
    upcomingMatches,
    currentDate,
    currentRound,
    totalRounds,
    brownlowTracker,
    settings,
  } = params

  const prev = currentState ?? defaultBettingMarkets()
  const margin = settings.margin

  // Compute strength for all clubs
  const strengths: Record<string, number> = {}
  for (const clubId of Object.keys(clubs)) {
    strengths[clubId] = getTeamStrength(clubId, players, ladder, matchResults)
  }

  // Match markets — generate for upcoming + settle past
  const matchMarkets: Record<string, MatchBettingMarket> = { ...prev.matchMarkets }

  for (const match of upcomingMatches) {
    const hStr = strengths[match.homeClubId] ?? 70
    const aStr = strengths[match.awayClubId] ?? 70
    const existing = matchMarkets[match.id]
    if (existing?.settled) continue // don't regenerate settled markets
    matchMarkets[match.id] = generateMatchMarket(match, hStr, aStr, settings)
  }

  // Settle any completed matches that have a market
  for (const match of matchResults) {
    if (!match.result) continue
    const m = matchMarkets[match.id]
    if (!m) continue
    if (!m.settled) {
      const h = match.result.homeTotalScore
      const a = match.result.awayTotalScore
      matchMarkets[match.id] = {
        ...m,
        settled: true,
        resultOutcome: h > a ? 'home' : h < a ? 'away' : null,
      }
    }
  }

  // Futures
  const roundsRemaining = Math.max(0, totalRounds - currentRound)
  const futuresOdds = generateFuturesOdds(strengths, ladder, roundsRemaining, totalRounds, margin)

  // Awards
  const awardOdds = generateAwardOdds(players, brownlowTracker, currentRound, totalRounds, margin)

  // Update history (premiership + top8)
  const newHistory = {
    premiership: { ...prev.oddsHistory.premiership },
    top8: { ...prev.oddsHistory.top8 },
    coleman: { ...prev.oddsHistory.coleman },
    brownlow: { ...prev.oddsHistory.brownlow },
  }
  for (const [clubId, odds] of Object.entries(futuresOdds.premiership)) {
    newHistory.premiership[clubId] = appendOddsHistory(
      newHistory.premiership[clubId] ?? [],
      currentDate,
      odds,
    )
  }
  for (const [clubId, odds] of Object.entries(futuresOdds.top8)) {
    newHistory.top8[clubId] = appendOddsHistory(newHistory.top8[clubId] ?? [], currentDate, odds)
  }
  // Award history — top 5 candidates each
  for (const [playerId, odds] of Object.entries(awardOdds.coleman).slice(0, 5)) {
    newHistory.coleman[playerId] = appendOddsHistory(
      newHistory.coleman[playerId] ?? [],
      currentDate,
      odds,
    )
  }
  for (const [playerId, odds] of Object.entries(awardOdds.brownlow).slice(0, 5)) {
    newHistory.brownlow[playerId] = appendOddsHistory(
      newHistory.brownlow[playerId] ?? [],
      currentDate,
      odds,
    )
  }

  return {
    lastUpdated: currentDate,
    matchMarkets,
    futures: { lastUpdated: currentDate, ...futuresOdds },
    awards: { lastUpdated: currentDate, ...awardOdds },
    oddsHistory: newHistory,
  }
}
