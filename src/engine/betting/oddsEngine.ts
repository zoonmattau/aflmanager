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

  // Ladder position bonus — only meaningful once games have been played
  const ladderPos = ladder.findIndex((e) => e.clubId === clubId)
  const maxPlayed = Math.max(...ladder.map((e) => e.played), 0)
  const ladderScale = Math.min(1, maxPlayed / 5)  // ramps up over first 5 rounds
  const ladderBonus = ladderPos >= 0 ? (ladder.length - ladderPos) * 0.3 * ladderScale : 0

  return avgRating + winRate * 4 + ladderBonus - injuryPenalty
}

// ---------------------------------------------------------------------------
// Win probability (logistic model)
// ---------------------------------------------------------------------------

const HOME_GROUND_ADVANTAGE = 3.5 // equivalent rating points for home ground
const K = 0.07                    // logistic steepness (shared by match model and Monte Carlo)

/** Returns raw (no-margin) win probabilities for home and away teams. */
export function matchWinProbabilities(
  homeStrength: number,
  awayStrength: number,
): { home: number; away: number } {
  const diff = homeStrength + HOME_GROUND_ADVANTAGE - awayStrength
  const pHome = Math.min(0.87, Math.max(0.13, 1 / (1 + Math.exp(-K * diff))))
  return { home: pHome, away: 1 - pHome }
}

// ---------------------------------------------------------------------------
// PRNG + low-level sim helpers (used by Monte Carlo)
// ---------------------------------------------------------------------------

/** Fast xorshift PRNG seeded from a number. */
function makePRNG(seed: number): () => number {
  let s = Math.max(1, seed >>> 0)
  return (): number => {
    s ^= s << 13
    s ^= s >> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}

/** Simple string → unsigned int hash (for deterministic per-match seeds). */
function hashStr(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Simulate one game outcome. Includes per-game unpredictability noise (±8%). */
function simGame(homeStr: number, awayStr: number, rng: () => number): 'home' | 'away' {
  const diff = homeStr + HOME_GROUND_ADVANTAGE - awayStr
  let pH = 1 / (1 + Math.exp(-K * diff))
  // Match-day noise: AFL games are unpredictable — even big favourites lose
  pH = Math.min(0.93, Math.max(0.07, pH + (rng() - 0.5) * 0.16))
  return rng() < pH ? 'home' : 'away'
}

/** Simulate the AFL McIntyre 8-team finals system; returns premiership winner's club ID. */
function simFinalsWinner(
  sortedTop8: string[],
  strengths: Record<string, number>,
  rng: () => number,
): string {
  const t = [...sortedTop8]
  while (t.length < 8) t.push(t[t.length - 1]!)   // pad if fewer than 8 in finals

  function g(a: string, b: string): string {
    return simGame(strengths[a] ?? 65, strengths[b] ?? 65, rng) === 'home' ? a : b
  }

  // Qualifying Finals: 1v2, 3v4 — winners advance straight to Prelims (double chance)
  const qf1w = g(t[0]!, t[1]!); const qf1l = qf1w === t[0] ? t[1]! : t[0]!
  const qf2w = g(t[2]!, t[3]!); const qf2l = qf2w === t[2] ? t[3]! : t[2]!
  // Elimination Finals: 5v8, 6v7 — losers eliminated
  const e1w = g(t[4]!, t[7]!)
  const e2w = g(t[5]!, t[6]!)
  // Semi Finals: QF losers get second chance
  const sf1w = g(qf1l, e2w)
  const sf2w = g(qf2l, e1w)
  // Preliminary Finals
  const pf1w = g(qf1w, sf2w)
  const pf2w = g(qf2w, sf1w)
  // Grand Final
  return g(pf1w, pf2w)
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
  const margin = settings.margin

  // Apply per-match bookmaker uncertainty to the strength differential so that
  // the line and H2H odds are always derived from the same assessment.
  // This prevents contradictions like a team being the handicap favourite but
  // the H2H underdog. Seeded by match ID for stable values across re-renders.
  const matchRng = makePRNG(hashStr(match.id))
  const rawDiff = homeStrength + HOME_GROUND_ADVANTAGE - awayStrength
  const diffNoise = (matchRng() - 0.5) * 2  // ±1 rating point ≈ ±2.8 pts on line
  const noisyDiff = rawDiff + diffNoise

  const pH = Math.min(0.90, Math.max(0.10, 1 / (1 + Math.exp(-K * noisyDiff))))
  const pA = 1 - pH

  // Line rounded to nearest 0.5 — derived from the same noisy diff as pH
  const line = Math.round(noisyDiff * 2.8 * 2) / 2

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
// Futures: Monte Carlo season simulation
// ---------------------------------------------------------------------------

/**
 * Simulates the remaining season N times to estimate futures probabilities.
 *
 * Each simulation:
 *  1. Adds ±4pt random noise to every team's strength (model uncertainty)
 *  2. Simulates every remaining regular-season game with per-game noise (±8%)
 *  3. Sorts the resulting ladder and simulates a full AFL finals bracket
 *  4. Counts outcomes (premiership win, top-8 finish, etc.)
 *
 * Counts → frequency → odds with bookmaker margin.
 * Imperfections (noise) ensure odds are never "perfectly" calibrated.
 */
function monteCarloFutures(
  currentLadder: LadderEntry[],
  strengths: Record<string, number>,
  remainingRegularMatches: Array<{ homeClubId: string; awayClubId: string }>,
  nSims: number,
  margin: number,
  seed: number,
): {
  premiership: Record<string, number>
  top8: Record<string, number>
  top4: Record<string, number>
  woodenSpoon: Record<string, number>
} {
  const rng = makePRNG(seed)
  const clubIds = currentLadder.map((e) => e.clubId)
  if (clubIds.length === 0) return { premiership: {}, top8: {}, top4: {}, woodenSpoon: {} }

  // Baseline points + scoring from current ladder
  const basePts: Record<string, number> = {}
  const baseFor: Record<string, number> = {}
  const baseAg: Record<string, number> = {}
  for (const e of currentLadder) {
    basePts[e.clubId] = e.points
    baseFor[e.clubId] = e.pointsFor
    baseAg[e.clubId] = Math.max(1, e.pointsAgainst)
  }

  const cntPremiership: Record<string, number> = Object.fromEntries(clubIds.map((id) => [id, 0]))
  const cntTop8: Record<string, number>        = Object.fromEntries(clubIds.map((id) => [id, 0]))
  const cntTop4: Record<string, number>        = Object.fromEntries(clubIds.map((id) => [id, 0]))
  const cntSpoon: Record<string, number>       = Object.fromEntries(clubIds.map((id) => [id, 0]))

  for (let sim = 0; sim < nSims; sim++) {
    // Per-simulation strength noise: we don't know exact team quality
    const noisy: Record<string, number> = {}
    for (const id of clubIds) {
      noisy[id] = (strengths[id] ?? 65) + (rng() - 0.5) * 8   // ±4 pt uncertainty
    }

    // Clone current ladder state
    const pts: Record<string, number>  = { ...basePts }
    const pFor: Record<string, number> = { ...baseFor }
    const pAg: Record<string, number>  = { ...baseAg }

    // Simulate remaining regular season
    for (const { homeClubId: hId, awayClubId: aId } of remainingRegularMatches) {
      const outcome   = simGame(noisy[hId] ?? 65, noisy[aId] ?? 65, rng)
      const scoreDiff = Math.round(8 + rng() * 60)  // winning margin: 8–68 pts
      if (outcome === 'home') {
        pts[hId]  = (pts[hId]  ?? 0) + 4
        pFor[hId] = (pFor[hId] ?? 0) + 100 + scoreDiff
        pAg[hId]  = (pAg[hId]  ?? 1) + 100
        pFor[aId] = (pFor[aId] ?? 0) + 100
        pAg[aId]  = (pAg[aId]  ?? 1) + 100 + scoreDiff
      } else {
        pts[aId]  = (pts[aId]  ?? 0) + 4
        pFor[aId] = (pFor[aId] ?? 0) + 100 + scoreDiff
        pAg[aId]  = (pAg[aId]  ?? 1) + 100
        pFor[hId] = (pFor[hId] ?? 0) + 100
        pAg[hId]  = (pAg[hId]  ?? 1) + 100 + scoreDiff
      }
    }

    // Sort simulated final ladder: pts desc, then percentage desc
    const sorted = clubIds.slice().sort((a, b) => {
      const dp = (pts[b] ?? 0) - (pts[a] ?? 0)
      if (dp !== 0) return dp
      return (pFor[b] ?? 0) / (pAg[b] ?? 1) - (pFor[a] ?? 0) / (pAg[a] ?? 1)
    })

    // Accumulate outcomes
    for (let i = 0; i < sorted.length; i++) {
      const id = sorted[i]!
      if (i < 8) cntTop8[id]!++
      if (i < 4) cntTop4[id]!++
      if (i === sorted.length - 1) cntSpoon[id]!++
    }

    // Simulate finals from simulated top 8
    const top8 = sorted.slice(0, 8)
    if (top8.length >= 2) {
      const winner = simFinalsWinner(top8, noisy, rng)
      if (winner) cntPremiership[winner]!++
    } else if (top8[0]) {
      cntPremiership[top8[0]]!++
    }
  }

  // Frequency → odds
  const countsToOdds = (cnt: Record<string, number>) =>
    Object.fromEntries(
      clubIds.map((id) => {
        const p = Math.max(0.005, Math.min(0.93, (cnt[id] ?? 0) / nSims))
        return [id, formatOdds(toDecimalOdds(p, margin))]
      }),
    )

  return {
    premiership: countsToOdds(cntPremiership),
    top8:        countsToOdds(cntTop8),
    top4:        countsToOdds(cntTop4),
    woodenSpoon: countsToOdds(cntSpoon),
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

  // Futures — Monte Carlo simulation of remaining season
  const remainingRegularMatches = upcomingMatches.filter((m) => !m.isFinal)
  const mcSeed = parseInt(currentDate.replace(/-/g, ''), 10) ^ (currentRound * 997)
  const futuresOdds = monteCarloFutures(ladder, strengths, remainingRegularMatches, 500, margin, mcSeed)

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
