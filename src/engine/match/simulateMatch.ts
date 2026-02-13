import { SeededRNG } from '@/engine/core/rng'
import { QUARTERS_PER_MATCH, POSSESSIONS_PER_QUARTER, POINTS_PER_GOAL, POINTS_PER_BEHIND } from '@/engine/core/constants'
import type { Match, MatchResult, MatchPlayerStats, QuarterScore, MatchKeyEvent } from '@/types/match'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'

interface SimulateMatchInput {
  homeClubId: string
  awayClubId: string
  venue: string
  round: number
  players: Record<string, Player>
  clubs: Record<string, Club>
  seed: number
  isFinal?: boolean
  finalType?: 'QF' | 'EF' | 'PF' | 'SF' | 'GF'
}

function getClubPlayers(players: Record<string, Player>, clubId: string): Player[] {
  return Object.values(players)
    .filter((p) => p.clubId === clubId && !p.injury && p.fitness >= 50)
    .sort((a, b) => getOverall(b) - getOverall(a))
    .slice(0, 22) // Best 22
}

function getOverall(p: Player): number {
  const a = p.attributes
  return (
    a.kickingEfficiency + a.handballEfficiency + a.markingOverhead +
    a.speed + a.endurance + a.strength + a.tackling +
    a.disposalDecision + a.positioning + a.contested +
    a.workRate + a.pressure
  ) / 12
}

function getTeamRating(players: Player[]): number {
  if (players.length === 0) return 50
  return players.reduce((sum, p) => sum + getOverall(p), 0) / players.length
}

/** Get a positional modifier for goal/behind scoring based on player position */
function getForwardModifier(player: Player): number {
  const pos = player.position.primary
  if (pos === 'FF') return 1.8
  if (pos === 'HF') return 1.4
  if (pos === 'FOLL') return 0.6
  if (pos === 'MID' || pos === 'C') return 0.8
  if (pos === 'WING') return 0.5
  return 0.3 // defenders
}

export function simulateMatch(input: SimulateMatchInput): Match {
  const rng = new SeededRNG(input.seed)
  const { homeClubId, awayClubId, venue, round, players, isFinal, finalType } = input

  const homePlayers = getClubPlayers(players, homeClubId)
  const awayPlayers = getClubPlayers(players, awayClubId)

  const homeRating = getTeamRating(homePlayers)
  const awayRating = getTeamRating(awayPlayers)

  // Home advantage ~3 rating points
  const homeAdvantage = 3
  const adjustedHomeRating = homeRating + homeAdvantage

  // Initialize stats
  const homeStats = initPlayerStats(homePlayers)
  const awayStats = initPlayerStats(awayPlayers)

  const homeScores: QuarterScore[] = []
  const awayScores: QuarterScore[] = []
  const keyEvents: MatchKeyEvent[] = []

  // Simulate quarter by quarter
  for (let q = 0; q < QUARTERS_PER_MATCH; q++) {
    let homeGoals = 0
    let homeBehinds = 0
    let awayGoals = 0
    let awayBehinds = 0

    const possessions = POSSESSIONS_PER_QUARTER + rng.nextInt(-20, 20)

    for (let p = 0; p < possessions; p++) {
      // Determine which team wins this possession
      const homeChance = adjustedHomeRating / (adjustedHomeRating + awayRating)
      const homeWins = rng.chance(homeChance)

      const attackingPlayers = homeWins ? homePlayers : awayPlayers
      const attackingStats = homeWins ? homeStats : awayStats
      const attackClubId = homeWins ? homeClubId : awayClubId
      const defendingPlayers = homeWins ? awayPlayers : homePlayers

      // Pick a primary player for this possession (weighted by overall + role)
      const primaryPlayer = pickWeightedPlayer(rng, attackingPlayers)
      const primaryStatIndex = attackingStats.findIndex((s) => s.playerId === primaryPlayer.id)

      // Generate disposal
      const isKick = rng.chance(0.55)
      if (isKick) {
        attackingStats[primaryStatIndex].kicks++
      } else {
        attackingStats[primaryStatIndex].handballs++
      }
      attackingStats[primaryStatIndex].disposals++

      // Contested possession chance
      if (rng.chance(0.35)) {
        attackingStats[primaryStatIndex].contestedPossessions++
        if (rng.chance(0.3)) {
          attackingStats[primaryStatIndex].clearances++
        }
      } else {
        attackingStats[primaryStatIndex].uncountestedPossessions++
      }

      // Mark chance
      if (rng.chance(0.25)) {
        const marker = pickWeightedPlayer(rng, attackingPlayers)
        const markerIdx = attackingStats.findIndex((s) => s.playerId === marker.id)
        attackingStats[markerIdx].marks++
      }

      // Tackle from defending team
      if (rng.chance(0.2)) {
        const tackler = pickWeightedPlayer(rng, defendingPlayers)
        const defStats = homeWins ? awayStats : homeStats
        const tacklerIdx = defStats.findIndex((s) => s.playerId === tackler.id)
        defStats[tacklerIdx].tackles++
      }

      // Hitout for rucks
      if (rng.chance(0.08)) {
        const ruck = attackingPlayers.find((pl) => pl.position.primary === 'FOLL')
        if (ruck) {
          const ruckIdx = attackingStats.findIndex((s) => s.playerId === ruck.id)
          attackingStats[ruckIdx].hitouts++
        }
      }

      // Inside 50 chance (~30% of possessions lead to an I50)
      if (rng.chance(0.30)) {
        const i50Player = pickWeightedPlayer(rng, attackingPlayers)
        const i50Idx = attackingStats.findIndex((s) => s.playerId === i50Player.id)
        attackingStats[i50Idx].insideFifties++

        // Score chance from I50 (~40%)
        if (rng.chance(0.40)) {
          // Pick a scoring player (weighted toward forwards)
          const scorer = pickScoringPlayer(rng, attackingPlayers)
          const scorerIdx = attackingStats.findIndex((s) => s.playerId === scorer.id)

          // Goal vs behind (~50/50 adjusted by goalkicking skill)
          const goalChance = 0.40 + (scorer.attributes.goalkicking / 100) * 0.25
          if (rng.chance(goalChance)) {
            // Goal!
            if (homeWins) homeGoals++
            else awayGoals++
            attackingStats[scorerIdx].goals++

            keyEvents.push({
              quarter: q + 1,
              minute: Math.floor((p / possessions) * 30),
              type: 'goal',
              description: `${scorer.firstName} ${scorer.lastName} kicks a goal`,
              playerId: scorer.id,
              clubId: attackClubId,
            })
          } else {
            // Behind
            if (homeWins) homeBehinds++
            else awayBehinds++
            attackingStats[scorerIdx].behinds++
          }
        }
      }

      // Rebound 50
      if (!homeWins && rng.chance(0.15)) {
        const rebounder = pickWeightedPlayer(rng, defendingPlayers)
        const rebStats = homeWins ? awayStats : homeStats
        const rebIdx = rebStats.findIndex((s) => s.playerId === rebounder.id)
        rebStats[rebIdx].rebound50s++
      }
    }

    homeScores.push({
      goals: homeGoals,
      behinds: homeBehinds,
      total: homeGoals * POINTS_PER_GOAL + homeBehinds * POINTS_PER_BEHIND,
    })
    awayScores.push({
      goals: awayGoals,
      behinds: awayBehinds,
      total: awayGoals * POINTS_PER_GOAL + awayBehinds * POINTS_PER_BEHIND,
    })
  }

  const homeTotalScore = homeScores.reduce((s, q) => s + q.total, 0)
  const awayTotalScore = awayScores.reduce((s, q) => s + q.total, 0)

  // Add free kicks
  for (const stats of [homeStats, awayStats]) {
    for (const stat of stats) {
      stat.freesFor = rng.nextInt(0, 4)
      stat.freesAgainst = rng.nextInt(0, 3)
    }
  }

  const result: MatchResult = {
    homeScores,
    awayScores,
    homeTotalScore,
    awayTotalScore,
    homePlayerStats: homeStats,
    awayPlayerStats: awayStats,
    keyEvents,
  }

  return {
    id: `match-${round}-${homeClubId}-${awayClubId}`,
    round,
    homeClubId,
    awayClubId,
    venue,
    date: '',
    result,
    isFinal: isFinal ?? false,
    finalType,
  }
}

function initPlayerStats(players: Player[]): MatchPlayerStats[] {
  return players.map((p) => ({
    playerId: p.id,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    tackles: 0,
    goals: 0,
    behinds: 0,
    hitouts: 0,
    contestedPossessions: 0,
    uncountestedPossessions: 0,
    clearances: 0,
    insideFifties: 0,
    rebound50s: 0,
    freesFor: 0,
    freesAgainst: 0,
  }))
}

function pickWeightedPlayer(rng: SeededRNG, players: Player[]): Player {
  // Weight by overall ability + work rate
  const weights = players.map((p) => getOverall(p) + p.attributes.workRate * 0.3)
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let r = rng.next() * totalWeight
  for (let i = 0; i < players.length; i++) {
    r -= weights[i]
    if (r <= 0) return players[i]
  }
  return players[players.length - 1]
}

function pickScoringPlayer(rng: SeededRNG, players: Player[]): Player {
  // Weight toward forwards using position modifier and goalkicking ability
  const weights = players.map((p) =>
    getForwardModifier(p) * (p.attributes.goalkicking * 0.5 + p.attributes.insideForward * 0.3 + 20)
  )
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let r = rng.next() * totalWeight
  for (let i = 0; i < players.length; i++) {
    r -= weights[i]
    if (r <= 0) return players[i]
  }
  return players[players.length - 1]
}
