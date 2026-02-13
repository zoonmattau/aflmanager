import { SeededRNG } from '@/engine/core/rng'
import { QUARTERS_PER_MATCH, POSSESSIONS_PER_QUARTER, POINTS_PER_GOAL, POINTS_PER_BEHIND } from '@/engine/core/constants'
import { createDefaultGameplan } from '@/engine/gameplan/defaults'
import type { Match, MatchResult, MatchPlayerStats, QuarterScore, MatchKeyEvent } from '@/types/match'
import type { Player } from '@/types/player'
import type { Club, ClubGameplan } from '@/types/club'
import type { MatchRulesSettings } from '@/types/game'

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
  matchRules?: MatchRulesSettings
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
  if (pos === 'FP' || pos === 'CHF') return 1.5
  if (pos === 'HFF') return 1.4
  if (pos === 'RK') return 0.6
  if (pos === 'IM' || pos === 'OM') return 0.8
  if (pos === 'W') return 0.5
  return 0.3 // defenders (BP, FB, HBF, CHB)
}

// ---------------------------------------------------------------------------
// Gameplan multipliers — each tactic option produces simple modifiers that
// are applied to the base probabilities inside the possession loop.
// ---------------------------------------------------------------------------

interface GameplanModifiers {
  /** Extra possessions per quarter (added to base) */
  possessionBonus: number
  /** Multiplier on the inside-50 chance */
  inside50Mult: number
  /** Multiplier on goal accuracy (goalChance) */
  accuracyMult: number
  /** Multiplier on contested possession chance */
  contestedMult: number
  /** Multiplier on uncontested possession chance */
  uncontestedMult: number
  /** Multiplier on tackle chance for this team's defenders */
  tackleMult: number
  /** Multiplier on mark chance */
  markMult: number
  /** Multiplier on rebound 50 chance for the opponent when this team attacks */
  opponentReboundMult: number
  /** Multiplier on hitout chance for the ruck */
  hitoutMult: number
}

function computeGameplanModifiers(gameplan: ClubGameplan): GameplanModifiers {
  const mods: GameplanModifiers = {
    possessionBonus: 0,
    inside50Mult: 1.0,
    accuracyMult: 1.0,
    contestedMult: 1.0,
    uncontestedMult: 1.0,
    tackleMult: 1.0,
    markMult: 1.0,
    opponentReboundMult: 1.0,
    hitoutMult: 1.0,
  }

  // --- Offensive Style ---
  if (gameplan.offensiveStyle === 'attacking') {
    mods.inside50Mult *= 1.08
    mods.opponentReboundMult *= 1.05 // more open defensively
  } else if (gameplan.offensiveStyle === 'defensive') {
    mods.inside50Mult *= 0.92
    mods.tackleMult *= 1.05
    mods.opponentReboundMult *= 0.90
  }

  // --- Tempo ---
  if (gameplan.tempo === 'fast') {
    mods.possessionBonus += 15 // more possessions per quarter
    mods.accuracyMult *= 0.97 // slight accuracy drop from rushing
  } else if (gameplan.tempo === 'slow') {
    mods.possessionBonus -= 12
    mods.accuracyMult *= 1.03
  }

  // --- Aggression ---
  if (gameplan.aggression === 'high') {
    mods.contestedMult *= 1.08
    mods.tackleMult *= 1.06
  } else if (gameplan.aggression === 'low') {
    mods.contestedMult *= 0.93
    mods.tackleMult *= 0.94
  }

  // --- Kick-In Tactic ---
  if (gameplan.kickInTactic === 'play-on-long') {
    mods.inside50Mult *= 1.05
    mods.accuracyMult *= 0.97
  } else if (gameplan.kickInTactic === 'play-on-short') {
    mods.uncontestedMult *= 1.04
  } else if (gameplan.kickInTactic === 'set-up-long') {
    mods.inside50Mult *= 1.03
    mods.markMult *= 1.03
  }
  // 'set-up-short' is the neutral default — no modifiers

  // --- Centre Tactic ---
  if (gameplan.centreTactic === 'cluster') {
    mods.contestedMult *= 1.06
    mods.uncontestedMult *= 0.95
  } else if (gameplan.centreTactic === 'spread') {
    mods.uncontestedMult *= 1.06
    mods.contestedMult *= 0.95
  }

  // --- Stoppage Tactic ---
  if (gameplan.stoppageTactic === 'cluster') {
    mods.contestedMult *= 1.04
    mods.uncontestedMult *= 0.97
  } else if (gameplan.stoppageTactic === 'spread') {
    mods.uncontestedMult *= 1.04
    mods.contestedMult *= 0.97
  }

  // --- Defensive Line ---
  if (gameplan.defensiveLine === 'press') {
    mods.tackleMult *= 1.06
    mods.opponentReboundMult *= 1.04 // risky if beaten
  } else if (gameplan.defensiveLine === 'hold') {
    mods.markMult *= 1.03
  } else if (gameplan.defensiveLine === 'run') {
    mods.uncontestedMult *= 1.03
    mods.opponentReboundMult *= 0.97
  }
  // 'zone' is the neutral default

  // --- Midfield Line ---
  if (gameplan.midfieldLine === 'press') {
    mods.tackleMult *= 1.04
    mods.contestedMult *= 1.03
  } else if (gameplan.midfieldLine === 'hold') {
    mods.markMult *= 1.02
  } else if (gameplan.midfieldLine === 'zone') {
    mods.uncontestedMult *= 1.02
  }
  // 'run' is the neutral default

  // --- Forward Line ---
  if (gameplan.forwardLine === 'press') {
    mods.markMult *= 1.05 // better contested marks in forward line
    mods.inside50Mult *= 1.03
  } else if (gameplan.forwardLine === 'hold') {
    mods.accuracyMult *= 1.03
  } else if (gameplan.forwardLine === 'run') {
    mods.uncontestedMult *= 1.03
  } else if (gameplan.forwardLine === 'zone') {
    mods.markMult *= 1.02
  }

  // --- Rotations ---
  if (gameplan.rotations === 'high') {
    mods.possessionBonus += 5 // fresher legs = more activity
  } else if (gameplan.rotations === 'low') {
    mods.possessionBonus -= 5
    mods.contestedMult *= 1.02 // same players stay in position
  }

  // --- Ruck nomination: around the ground ---
  if (gameplan.ruckNomination.aroundTheGround) {
    mods.hitoutMult *= 0.90 // less specialist but more spread
    mods.contestedMult *= 1.02
  }

  return mods
}

export function simulateMatch(input: SimulateMatchInput): Match {
  const rng = new SeededRNG(input.seed)
  const { homeClubId, awayClubId, venue, round, players, clubs, isFinal, finalType, matchRules } = input

  // Use settings-driven values or fall back to constants
  const quartersPerMatch = matchRules?.quartersPerMatch ?? QUARTERS_PER_MATCH
  const possessionsMultiplier = matchRules?.possessionsMultiplier ?? 1.0
  const possessionsBase = Math.round(POSSESSIONS_PER_QUARTER * possessionsMultiplier)
  const pointsPerGoal = matchRules?.pointsPerGoal ?? POINTS_PER_GOAL
  const pointsPerBehind = matchRules?.pointsPerBehind ?? POINTS_PER_BEHIND

  const homePlayers = getClubPlayers(players, homeClubId)
  const awayPlayers = getClubPlayers(players, awayClubId)

  const homeRating = getTeamRating(homePlayers)
  const awayRating = getTeamRating(awayPlayers)

  // Compute gameplan modifiers for both clubs
  const homeGameplan = clubs[homeClubId]?.gameplan
  const awayGameplan = clubs[awayClubId]?.gameplan
  const homeMods = computeGameplanModifiers(homeGameplan ?? createDefaultGameplan())
  const awayMods = computeGameplanModifiers(awayGameplan ?? createDefaultGameplan())

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
  for (let q = 0; q < quartersPerMatch; q++) {
    let homeGoals = 0
    let homeBehinds = 0
    let awayGoals = 0
    let awayBehinds = 0

    // Average both team's possession bonuses for the match pace
    const avgPossessionBonus = Math.round((homeMods.possessionBonus + awayMods.possessionBonus) / 2)
    const possessions = possessionsBase + avgPossessionBonus + rng.nextInt(-20, 20)

    for (let p = 0; p < possessions; p++) {
      // Determine which team wins this possession
      const homeChance = adjustedHomeRating / (adjustedHomeRating + awayRating)
      const homeWins = rng.chance(homeChance)

      const attackingPlayers = homeWins ? homePlayers : awayPlayers
      const attackingStats = homeWins ? homeStats : awayStats
      const attackClubId = homeWins ? homeClubId : awayClubId
      const defendingPlayers = homeWins ? awayPlayers : homePlayers
      const attMods = homeWins ? homeMods : awayMods
      const defMods = homeWins ? awayMods : homeMods

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

      // Contested possession chance (modified by gameplan)
      const contestedChance = 0.35 * attMods.contestedMult
      if (rng.chance(contestedChance)) {
        attackingStats[primaryStatIndex].contestedPossessions++
        if (rng.chance(0.3)) {
          attackingStats[primaryStatIndex].clearances++
        }
      } else {
        const uncontestedRoll = 1.0 * attMods.uncontestedMult
        if (uncontestedRoll >= 1.0 || rng.chance(uncontestedRoll)) {
          attackingStats[primaryStatIndex].uncountestedPossessions++
        }
      }

      // Mark chance (modified by attacker gameplan)
      if (rng.chance(0.25 * attMods.markMult)) {
        const marker = pickWeightedPlayer(rng, attackingPlayers)
        const markerIdx = attackingStats.findIndex((s) => s.playerId === marker.id)
        attackingStats[markerIdx].marks++
        // Contested mark subset
        if (rng.chance(0.3)) {
          attackingStats[markerIdx].contestedMarks++
        }
      }

      // Tackle from defending team (modified by defender gameplan)
      if (rng.chance(0.2 * defMods.tackleMult)) {
        const tackler = pickWeightedPlayer(rng, defendingPlayers)
        const defStats = homeWins ? awayStats : homeStats
        const tacklerIdx = defStats.findIndex((s) => s.playerId === tackler.id)
        defStats[tacklerIdx].tackles++
      }

      // Hitout for rucks (modified by gameplan)
      if (rng.chance(0.08 * attMods.hitoutMult)) {
        const ruck = attackingPlayers.find((pl) => pl.position.primary === 'RK')
        if (ruck) {
          const ruckIdx = attackingStats.findIndex((s) => s.playerId === ruck.id)
          attackingStats[ruckIdx].hitouts++
        }
      }

      // Inside 50 chance (~30% of possessions, modified by gameplan)
      if (rng.chance(0.30 * attMods.inside50Mult)) {
        const i50Player = pickWeightedPlayer(rng, attackingPlayers)
        const i50Idx = attackingStats.findIndex((s) => s.playerId === i50Player.id)
        attackingStats[i50Idx].insideFifties++

        // Score chance from I50 (~40%)
        if (rng.chance(0.40)) {
          // Pick a scoring player (weighted toward forwards)
          const scorer = pickScoringPlayer(rng, attackingPlayers)
          const scorerIdx = attackingStats.findIndex((s) => s.playerId === scorer.id)

          // Goal vs behind (~50/50 adjusted by goalkicking skill + gameplan accuracy)
          const goalChance = (0.40 + (scorer.attributes.goalkicking / 100) * 0.25) * attMods.accuracyMult
          if (rng.chance(goalChance)) {
            // Goal!
            if (homeWins) homeGoals++
            else awayGoals++
            attackingStats[scorerIdx].goals++
            attackingStats[scorerIdx].scoreInvolvements++

            // Goal assist — credit the I50 player if different from scorer
            if (i50Player.id !== scorer.id) {
              attackingStats[i50Idx].goalAssists++
              attackingStats[i50Idx].scoreInvolvements++
            }

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

      // Rebound 50 (modified by attacker's rebound vulnerability)
      if (!homeWins && rng.chance(0.15 * attMods.opponentReboundMult)) {
        const rebounder = pickWeightedPlayer(rng, defendingPlayers)
        const rebStats = homeWins ? awayStats : homeStats
        const rebIdx = rebStats.findIndex((s) => s.playerId === rebounder.id)
        rebStats[rebIdx].rebound50s++
      }

      // --- Extended stats ---
      // Metres gained (on each disposal)
      attackingStats[primaryStatIndex].metresGained += rng.nextInt(5, 25)

      // Turnover chance (~12% of disposals)
      if (rng.chance(0.12)) {
        attackingStats[primaryStatIndex].turnovers++
        if (rng.chance(0.5)) {
          attackingStats[primaryStatIndex].clangers++
        }
      }

      // Intercept for defending team
      if (rng.chance(0.08)) {
        const interceptor = pickWeightedPlayer(rng, defendingPlayers)
        const defStats = homeWins ? awayStats : homeStats
        const intIdx = defStats.findIndex((s) => s.playerId === interceptor.id)
        defStats[intIdx].intercepts++
      }

      // One-percenter for defending team (spoils, smothers)
      if (rng.chance(0.06)) {
        const defender = pickWeightedPlayer(rng, defendingPlayers)
        const defStats = homeWins ? awayStats : homeStats
        const defIdx = defStats.findIndex((s) => s.playerId === defender.id)
        defStats[defIdx].onePercenters++
      }

      // Bounce (midfield run)
      if (rng.chance(0.03)) {
        attackingStats[primaryStatIndex].bounces++
      }
    }

    homeScores.push({
      goals: homeGoals,
      behinds: homeBehinds,
      total: homeGoals * pointsPerGoal + homeBehinds * pointsPerBehind,
    })
    awayScores.push({
      goals: awayGoals,
      behinds: awayBehinds,
      total: awayGoals * pointsPerGoal + awayBehinds * pointsPerBehind,
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
    contestedMarks: 0,
    scoreInvolvements: 0,
    metresGained: 0,
    turnovers: 0,
    intercepts: 0,
    onePercenters: 0,
    bounces: 0,
    clangers: 0,
    goalAssists: 0,
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
