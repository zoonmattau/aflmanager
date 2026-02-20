import type {
  YouthCompetition,
  YouthPlayer,
  YouthMatchResult,
  YouthPlayerMatchPerformance,
  YouthLadderEntry,
} from '@/types/youthPathway'
import type { NewsItem } from '@/types/game'
import { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCORING_SCALE: Record<'elite' | 'school' | 'local', number> = {
  elite: 0.92,
  school: 0.78,
  local: 0.85,
}

const LADDER_POINTS = { win: 4, draw: 2, loss: 0 }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function avgProxyScore(player: YouthPlayer): number {
  return (
    player.athleticism +
    player.footballIQ +
    player.contested +
    player.kicking +
    player.marking +
    player.goalkicking +
    player.workRate +
    player.leadership
  ) / 8
}

/** Build round-robin fixtures for a comp (all pairs per round, round-robin order). */
function buildRoundRobinFixtures(clubIds: string[]): Array<Array<[string, string]>> {
  // Standard round-robin scheduling algorithm
  const clubs = [...clubIds]
  if (clubs.length % 2 !== 0) clubs.push('BYE')
  const n = clubs.length
  const rounds: Array<Array<[string, string]>> = []

  for (let r = 0; r < n - 1; r++) {
    const round: Array<[string, string]> = []
    for (let i = 0; i < n / 2; i++) {
      const home = clubs[i]
      const away = clubs[n - 1 - i]
      if (home !== 'BYE' && away !== 'BYE') {
        round.push([home, away])
      }
    }
    rounds.push(round)
    // Rotate clubs (keep first fixed)
    clubs.splice(1, 0, clubs.pop()!)
  }
  return rounds
}

function simMatch(
  homeClubId: string,
  awayClubId: string,
  homeStrength: number,
  awayStrength: number,
  level: 'elite' | 'school' | 'local',
  round: number,
  discoveredPlayers: YouthPlayer[],
  _allPlayers: Record<string, YouthPlayer>,
  rng: SeededRNG,
): YouthMatchResult {
  const scale = SCORING_SCALE[level]
  const diff = homeStrength - awayStrength
  const homeGoals = clamp(
    Math.round((5 + diff * 0.3) * scale + rng.nextInt(-3, 4)),
    0,
    30,
  )
  const awayGoals = clamp(
    Math.round((5 - diff * 0.3) * scale + rng.nextInt(-3, 4)),
    0,
    30,
  )
  const homeBehinds = clamp(Math.round(homeGoals * 0.55 + rng.nextInt(0, 4)), 0, 20)
  const awayBehinds = clamp(Math.round(awayGoals * 0.55 + rng.nextInt(0, 4)), 0, 20)

  const homeScore = homeGoals * 6 + homeBehinds
  const awayScore = awayGoals * 6 + awayBehinds

  // Generate individual stats only for discovered players in this match
  const performances: YouthPlayerMatchPerformance[] = []
  let bestRating = -1
  let bogPlayerId: string | null = null

  for (const player of discoveredPlayers) {
    if (player.clubId !== homeClubId && player.clubId !== awayClubId) continue
    const proxyScore = avgProxyScore(player)
    const rating = clamp(
      +(proxyScore * 0.055 + rng.nextFloat(0, 2)).toFixed(1),
      1,
      10,
    )
    const disposals = clamp(Math.round(8 + proxyScore / 8 + rng.nextInt(-5, 6)), 3, 35)
    const marks = clamp(Math.round(disposals * 0.25 + rng.nextInt(-1, 3)), 0, 12)
    const tackles = clamp(Math.round(2 + player.workRate / 25 + rng.nextInt(-1, 3)), 0, 10)
    const goals = clamp(
      Math.round((player.goalkicking / 30 + player.marking / 40 - 1.5) + rng.nextInt(-1, 2)),
      0,
      6,
    )

    performances.push({
      playerId: player.id,
      rating,
      disposals,
      goals,
      marks,
      tackles,
      isBestOnGround: false,
    })

    if (rating > bestRating) {
      bestRating = rating
      bogPlayerId = player.id
    }
  }

  // Mark BOG
  if (bogPlayerId) {
    const perf = performances.find((p) => p.playerId === bogPlayerId)
    if (perf) perf.isBestOnGround = true
  }

  return {
    round,
    homeClubId,
    awayClubId,
    homeScore,
    awayScore,
    playerPerformances: performances,
  }
}

function updateLadder(
  ladder: YouthLadderEntry[],
  result: YouthMatchResult,
): YouthLadderEntry[] {
  return ladder.map((entry) => {
    if (entry.clubId !== result.homeClubId && entry.clubId !== result.awayClubId) return entry
    const isHome = entry.clubId === result.homeClubId
    const ownScore = isHome ? result.homeScore : result.awayScore
    const oppScore = isHome ? result.awayScore : result.homeScore

    const won = ownScore > oppScore
    const drew = ownScore === oppScore

    return {
      ...entry,
      played: entry.played + 1,
      wins: entry.wins + (won ? 1 : 0),
      losses: entry.losses + (!won && !drew ? 1 : 0),
      draws: entry.draws + (drew ? 1 : 0),
      points: entry.points + (won ? LADDER_POINTS.win : drew ? LADDER_POINTS.draw : LADDER_POINTS.loss),
      pointsFor: entry.pointsFor + ownScore,
      pointsAgainst: entry.pointsAgainst + oppScore,
      percentage: entry.pointsAgainst + oppScore > 0
        ? Math.round(((entry.pointsFor + ownScore) / (entry.pointsAgainst + oppScore)) * 1000) / 10
        : 100,
    }
  })
}

function applyLightDevelopment(
  player: YouthPlayer,
  rng: SeededRNG,
  developmentChance = 0.15,
): YouthPlayer {
  if (!rng.chance(developmentChance)) return player

  const attrKeys = [
    'athleticism', 'footballIQ', 'contested', 'kicking',
    'marking', 'goalkicking', 'workRate', 'leadership',
  ] as const

  // Weight toward highest attr
  const scores = attrKeys.map((k) => player[k])
  const maxScore = Math.max(...scores)
  const weights = scores.map((s) => s / maxScore)
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  let roll = rng.nextFloat(0, totalWeight)
  let chosenAttr: typeof attrKeys[number] = attrKeys[0]
  for (let i = 0; i < attrKeys.length; i++) {
    roll -= weights[i]
    if (roll <= 0) { chosenAttr = attrKeys[i]; break }
  }

  return { ...player, [chosenAttr]: Math.min(95, player[chosenAttr] + 1) }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function simYouthCompRound(
  comp: YouthCompetition,
  roundNumber: number,
  players: Record<string, YouthPlayer>,
  rng: SeededRNG,
): {
  updatedComp: YouthCompetition
  updatedPlayers: Record<string, YouthPlayer>
  newsItems: NewsItem[]
} {
  if (roundNumber > comp.rounds) {
    return { updatedComp: comp, updatedPlayers: {}, newsItems: [] }
  }

  // Build fixtures for this round (lazy round-robin)
  const clubIds = comp.clubs.map((c) => c.id)
  const allFixtures = buildRoundRobinFixtures(clubIds)
  const roundFixtures = allFixtures[(roundNumber - 1) % allFixtures.length] ?? []

  const compPlayers = Object.values(players).filter((p) => p.compId === comp.id)
  const discoveredInComp = compPlayers.filter((p) => p.discoveredByClubIds.length > 0)

  const newResults: YouthMatchResult[] = []
  const updatedPlayers: Record<string, YouthPlayer> = {}
  const newsItems: NewsItem[] = []

  for (const [homeId, awayId] of roundFixtures) {
    const homeClub = comp.clubs.find((c) => c.id === homeId)
    const awayClub = comp.clubs.find((c) => c.id === awayId)
    if (!homeClub || !awayClub) continue

    // Team strength = club base * 0.6 + avg top-5 player proxy * 0.4
    const homePlayers = compPlayers.filter((p) => p.clubId === homeId)
    const awayPlayers = compPlayers.filter((p) => p.clubId === awayId)

    const topN = (ps: YouthPlayer[]) => {
      const sorted = [...ps].sort((a, b) => avgProxyScore(b) - avgProxyScore(a)).slice(0, 5)
      return sorted.length ? sorted.reduce((s, p) => s + avgProxyScore(p), 0) / sorted.length : 50
    }

    const homeStrength = homeClub.strengthRating * 0.6 + topN(homePlayers) * 0.4
    const awayStrength = awayClub.strengthRating * 0.6 + topN(awayPlayers) * 0.4

    const relevantDiscovered = discoveredInComp.filter(
      (p) => p.clubId === homeId || p.clubId === awayId,
    )

    const result = simMatch(
      homeId, awayId, homeStrength, awayStrength,
      comp.level, roundNumber, relevantDiscovered, players, rng,
    )
    newResults.push(result)

    // Update season stats for discovered players
    for (const perf of result.playerPerformances) {
      const existing = updatedPlayers[perf.playerId] ?? players[perf.playerId]
      if (!existing) continue

      const stats = existing.seasonStats
      const newGames = stats.gamesPlayed + 1
      const newAvgRating = (stats.avgRating * stats.gamesPlayed + perf.rating) / newGames

      let developed = applyLightDevelopment(existing, rng)
      developed = {
        ...developed,
        seasonStats: {
          gamesPlayed: newGames,
          disposals: stats.disposals + perf.disposals,
          goals: stats.goals + perf.goals,
          marks: stats.marks + perf.marks,
          tackles: stats.tackles + perf.tackles,
          bestOnGroundCount: stats.bestOnGroundCount + (perf.isBestOnGround ? 1 : 0),
          avgRating: Math.round(newAvgRating * 10) / 10,
          standoutGames: stats.standoutGames + (perf.rating >= 8.5 ? 1 : 0),
        },
      }
      updatedPlayers[perf.playerId] = developed

      // News for truly exceptional performances
      if (perf.rating >= 9.5) {
        newsItems.push({
          id: crypto.randomUUID(),
          date: new Date().toISOString().slice(0, 10),
          headline: `${existing.firstName} ${existing.lastName} puts his hand up for the draft`,
          body:
            `An outstanding performance in ${comp.name} — ${perf.disposals} disposals, ` +
            `${perf.goals} goals, rating ${perf.rating}/10. One to watch.`,
          category: 'draft' as const,
          clubIds: [],
          playerIds: [],
          read: false,
        })
      }
    }
  }

  // Update ladder
  let updatedLadder = [...comp.season.ladder]
  for (const result of newResults) {
    updatedLadder = updateLadder(updatedLadder, result)
  }

  // Sort ladder
  updatedLadder.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return b.percentage - a.percentage
  })

  const updatedComp: YouthCompetition = {
    ...comp,
    season: {
      ...comp.season,
      completedRounds: roundNumber,
      results: [...comp.season.results, ...newResults],
      ladder: updatedLadder,
    },
  }

  return { updatedComp, updatedPlayers, newsItems }
}
