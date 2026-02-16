/**
 * Club Culture/Chemistry engine.
 *
 * Computes and maintains a per-club culture score based on four sub-scores:
 * momentum (winning/form), stability (roster turnover), leadership, and age balance.
 *
 * Culture is persisted on the Club and updated once per round. It influences
 * match performance, morale resilience, and offseason development.
 */

import type { Club, ClubCulture } from '@/types/club'
import type { Player } from '@/types/player'
import type { LadderEntry } from '@/types/season'
import { getLeadershipScore } from '@/engine/leadership/leadershipEngine'

// ---------------------------------------------------------------------------
// Sub-score: Winning Momentum (-20 to +20)
// ---------------------------------------------------------------------------

export function computeMomentum(
  ladderEntry: LadderEntry | undefined,
  ladderPosition: number,
  teamCount: number,
  recentResults: ('W' | 'L' | 'D')[],
): number {
  // Ladder position base: top of ladder → +12, bottom → -12
  const posBase = teamCount > 1
    ? 12 - (ladderPosition - 1) * (24 / (teamCount - 1))
    : 0

  // Recent form (last 5): win percentage drives form bonus
  let wins = 0
  let total = 0
  for (const r of recentResults.slice(-5)) {
    total++
    if (r === 'W') wins++
    else if (r === 'D') wins += 0.5
  }
  const winPct = total > 0 ? wins / total : 0.5
  const formBonus = (winPct - 0.5) * 16

  return Math.max(-20, Math.min(20, posBase + formBonus))
}

// ---------------------------------------------------------------------------
// Sub-score: Squad Stability (0-100)
// ---------------------------------------------------------------------------

export function computeStability(
  clubId: string,
  players: Record<string, Player>,
  tradeCount: number,
  currentYear: number,
): number {
  // Base 100, minus 5 per trade involving this club (min 30)
  let score = Math.max(30, 100 - tradeCount * 5)

  // Average tenure bonus
  const roster = Object.values(players).filter((p) => p.clubId === clubId)
  if (roster.length > 0) {
    const avgYearsAtClub = roster.reduce(
      (sum, p) => sum + Math.max(0, currentYear - p.draftYear),
      0,
    ) / roster.length
    score += Math.min(15, avgYearsAtClub * 2.5)
  }

  // Debutant penalty: -2 per debut player (gamesPlayed < 5), max -15
  let debutantCount = 0
  for (const p of roster) {
    if (p.careerStats.gamesPlayed < 5 && p.seasonStats.gamesPlayed > 0) {
      debutantCount++
    }
  }
  score -= Math.min(15, debutantCount * 2)

  return Math.max(0, Math.min(100, score))
}

// ---------------------------------------------------------------------------
// Sub-score: Age Balance (0-100)
// ---------------------------------------------------------------------------

export function computeAgeBalance(
  clubId: string,
  players: Record<string, Player>,
): number {
  const roster = Object.values(players).filter((p) => p.clubId === clubId)
  if (roster.length === 0) return 60

  let youth = 0    // 18-23
  let prime = 0    // 24-29
  let veteran = 0  // 30+

  for (const p of roster) {
    if (p.age <= 23) youth++
    else if (p.age <= 29) prime++
    else veteran++
  }

  const total = roster.length
  const youthPct = (youth / total) * 100
  const primePct = (prime / total) * 100
  const veteranPct = (veteran / total) * 100

  // Target: ~35% youth, ~50% prime, ~15% veteran
  const youthDev = Math.abs(youthPct - 35)
  const primeDev = Math.abs(primePct - 50)
  const veteranDev = Math.abs(veteranPct - 15)

  // Score 100 at ideal, -1 per percentage-point deviation
  return Math.max(0, Math.min(100, 100 - youthDev - primeDev - veteranDev))
}

// ---------------------------------------------------------------------------
// Headline Culture Score (0-100)
// ---------------------------------------------------------------------------

export function computeCultureScore(
  momentum: number,
  stability: number,
  leadershipFactor: number,
  ageBalance: number,
): number {
  // Normalize momentum from [-20, +20] to [0, 100]
  const momentumNorm = ((momentum + 20) / 40) * 100

  const score =
    momentumNorm * 0.25 +
    stability * 0.25 +
    leadershipFactor * 0.30 +
    ageBalance * 0.20

  return Math.max(0, Math.min(100, Math.round(score)))
}

// ---------------------------------------------------------------------------
// Update Culture (per-round entry point)
// ---------------------------------------------------------------------------

export function updateClubCulture(
  club: Club,
  players: Record<string, Player>,
  ladder: LadderEntry[],
  tradeCount: number,
  currentRound: number,
  currentYear: number,
  teamCount: number,
  recentResults: ('W' | 'L' | 'D')[],
): void {
  const ladderEntry = ladder.find((e) => e.clubId === club.id)
  const ladderPosition = ladderEntry
    ? ladder.indexOf(ladderEntry) + 1
    : Math.ceil(teamCount / 2)

  const rawMomentum = computeMomentum(ladderEntry, ladderPosition, teamCount, recentResults)
  const rawStability = computeStability(club.id, players, tradeCount, currentYear)
  const rawAgeBalance = computeAgeBalance(club.id, players)

  // Leadership factor: average getLeadershipScore() of captain + VC + group members
  const leaderIds: string[] = []
  if (club.leadership.captainId) leaderIds.push(club.leadership.captainId)
  if (club.leadership.viceCaptainId) leaderIds.push(club.leadership.viceCaptainId)
  leaderIds.push(...club.leadership.leadershipGroupIds)

  let rawLeadershipFactor = 50
  if (leaderIds.length > 0) {
    let totalScore = 0
    let count = 0
    for (const id of leaderIds) {
      const p = players[id]
      if (p && p.clubId === club.id) {
        totalScore += getLeadershipScore(p)
        count++
      }
    }
    if (count > 0) rawLeadershipFactor = totalScore / count
  }

  const rawScore = computeCultureScore(rawMomentum, rawStability, rawLeadershipFactor, rawAgeBalance)

  // Drift model: 70% new + 30% previous (prevents wild swings)
  const prev = club.culture
  if (prev && prev.lastUpdatedRound >= 0) {
    club.culture = {
      score: Math.round(rawScore * 0.7 + prev.score * 0.3),
      momentum: Math.round((rawMomentum * 0.7 + prev.momentum * 0.3) * 10) / 10,
      stability: Math.round(rawStability * 0.7 + prev.stability * 0.3),
      leadershipFactor: Math.round(rawLeadershipFactor * 0.7 + prev.leadershipFactor * 0.3),
      ageBalance: Math.round(rawAgeBalance * 0.7 + prev.ageBalance * 0.3),
      lastUpdatedRound: currentRound,
    }
  } else {
    club.culture = {
      score: rawScore,
      momentum: Math.round(rawMomentum * 10) / 10,
      stability: rawStability,
      leadershipFactor: Math.round(rawLeadershipFactor),
      ageBalance: rawAgeBalance,
      lastUpdatedRound: currentRound,
    }
  }
}

// ---------------------------------------------------------------------------
// Effect Functions
// ---------------------------------------------------------------------------

/** Multiplicative modifier on adjusted team rating. Returns 0.97-1.03. */
export function getCultureMatchModifier(culture: ClubCulture | undefined): number {
  if (!culture) return 1.0
  // Map score 0-100 to 0.97-1.03
  return 0.97 + (culture.score / 100) * 0.06
}

/** Additive morale buffer post-match. Returns -2 to +2 integer. */
export function getCultureMoraleBuffer(culture: ClubCulture | undefined): number {
  if (!culture) return 0
  if (culture.score >= 80) return 2
  if (culture.score >= 65) return 1
  if (culture.score >= 50) return 0
  if (culture.score >= 35) return -1
  return -2
}

/** Development modifier, replaces old computeClubCultureModifier. Returns 0.85-1.20. */
export function getCultureDevelopmentModifier(culture: ClubCulture | undefined): number {
  if (!culture) return 1.0
  // Map score 0-100 to 0.85-1.20
  return 0.85 + (culture.score / 100) * 0.35
}

/** Returns a default culture for new games / migration. */
export function createDefaultCulture(): ClubCulture {
  return {
    score: 55,
    momentum: 0,
    stability: 70,
    leadershipFactor: 50,
    ageBalance: 60,
    lastUpdatedRound: -1,
  }
}

/** Human-readable label for a culture score. */
export function getCultureLabel(score: number): string {
  if (score >= 80) return 'Elite'
  if (score >= 65) return 'Strong'
  if (score >= 50) return 'Stable'
  if (score >= 35) return 'Fragile'
  return 'Toxic'
}
