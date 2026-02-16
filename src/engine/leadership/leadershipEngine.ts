/**
 * Leadership engine — captain, vice-captain, leadership group, clutch modifiers.
 *
 * Reuses existing player attributes (leadership, clutch, determination,
 * teamPlayer, composure, professionalism, bigGameModifier, gamesPlayed).
 * Leadership is persisted on the Club, not the Player.
 */

import type { Player } from '@/types/player'
import type { ClubLeadership } from '@/types/club'

// ---------------------------------------------------------------------------
// Leadership Score
// ---------------------------------------------------------------------------

/**
 * Weighted composite of existing attributes.  Returns 0-100.
 *
 * - leadership        × 0.35
 * - determination     × 0.15
 * - teamPlayer        × 0.15
 * - professionalism   × 0.10
 * - composure         × 0.10
 * - experience        × 0.15  (derived: min(100, gamesPlayed × 0.5))
 */
export function getLeadershipScore(player: Player): number {
  const experience = Math.min(100, player.careerStats.gamesPlayed * 0.5)
  const raw =
    player.attributes.leadership * 0.35 +
    player.attributes.determination * 0.15 +
    player.attributes.teamPlayer * 0.15 +
    player.personality.professionalism * 0.10 +
    player.attributes.composure * 0.10 +
    experience * 0.15
  return Math.round(Math.max(0, Math.min(100, raw)))
}

// ---------------------------------------------------------------------------
// Auto-select leadership
// ---------------------------------------------------------------------------

/**
 * Automatically picks captain, VC, and a leadership group (up to 5 extra).
 *
 * Eligibility: age >= 22, careerStats.gamesPlayed >= 20, belongs to club.
 */
export function autoSelectLeadership(
  players: Record<string, Player>,
  clubId: string,
): ClubLeadership {
  const eligible = Object.values(players)
    .filter(
      (p) =>
        p.clubId === clubId &&
        p.age >= 22 &&
        p.careerStats.gamesPlayed >= 20,
    )
    .map((p) => ({ id: p.id, score: getLeadershipScore(p) }))
    .sort((a, b) => b.score - a.score)

  const captain = eligible[0] ?? null
  const vc = eligible[1] ?? null
  const groupCandidates = eligible
    .slice(2, 7)
    .filter((c) => c.score >= 55)

  return {
    captainId: captain?.id ?? null,
    viceCaptainId: vc?.id ?? null,
    leadershipGroupIds: groupCandidates.map((c) => c.id),
  }
}

// ---------------------------------------------------------------------------
// Team leadership rating
// ---------------------------------------------------------------------------

/**
 * Returns 0-100 rating based on which leaders are in the selected 22.
 *
 * - Captain present:    +25 (scaled by their leadershipScore/100)
 * - VC present:         +15 (scaled similarly)
 * - Each group member:  +5 each (max +25)
 * - Average leadership of all 22 contributes ~10
 * - If captain missing, VC takes captain bonus at 80% effectiveness
 */
export function getTeamLeadershipRating(
  selectedPlayers: Player[],
  leadership: ClubLeadership | undefined,
): number {
  if (!leadership || selectedPlayers.length === 0) return 30 // baseline

  const ids = new Set(selectedPlayers.map((p) => p.id))

  const captainPlayer = selectedPlayers.find((p) => p.id === leadership.captainId)
  const vcPlayer = selectedPlayers.find((p) => p.id === leadership.viceCaptainId)
  const captainPresent = !!captainPlayer
  const vcPresent = !!vcPlayer

  let rating = 0

  if (captainPresent) {
    rating += 25 * (getLeadershipScore(captainPlayer) / 100)
  } else if (vcPresent) {
    // VC takes captain bonus at 80%
    rating += 25 * 0.8 * (getLeadershipScore(vcPlayer) / 100)
  }

  if (vcPresent && captainPresent) {
    rating += 15 * (getLeadershipScore(vcPlayer) / 100)
  }

  let groupCount = 0
  for (const gId of leadership.leadershipGroupIds) {
    if (ids.has(gId) && groupCount < 5) {
      const gPlayer = selectedPlayers.find((p) => p.id === gId)
      if (gPlayer) {
        rating += 5 * (getLeadershipScore(gPlayer) / 100)
        groupCount++
      }
    }
  }

  // Average leadership attribute of the 22 contributes up to 10
  const avgLeadership =
    selectedPlayers.reduce((sum, p) => sum + p.attributes.leadership, 0) /
    selectedPlayers.length
  rating += (avgLeadership / 100) * 10

  return Math.round(Math.max(0, Math.min(100, rating)))
}

// ---------------------------------------------------------------------------
// Leadership morale bonus
// ---------------------------------------------------------------------------

/**
 * Returns integer morale adjustment applied post-match.
 *
 * - Rating >= 80: won? +3 : +1
 * - Rating >= 60: won? +2 : 0
 * - Rating >= 40: won? +1 : -1
 * - Rating <  40: won? 0  : -2
 */
export function getLeadershipMoraleBonus(
  teamLeadershipRating: number,
  won: boolean,
): number {
  if (teamLeadershipRating >= 80) return won ? 3 : 1
  if (teamLeadershipRating >= 60) return won ? 2 : 0
  if (teamLeadershipRating >= 40) return won ? 1 : -1
  return won ? 0 : -2
}

// ---------------------------------------------------------------------------
// Clutch performance modifier
// ---------------------------------------------------------------------------

/**
 * Returns a multiplier for pickWeightedPlayer / pickScoringPlayer weights.
 *
 * - Q1-Q3 of non-final: 1.0 (no effect)
 * - Q4 or any quarter of a final: clutch + bigGame + captain bonus
 * - Close game (margin <= 18 pts, ~3 goals): clutchFactor boosted × 1.3
 * - Clamped [0.88, 1.15]
 */
export function getClutchModifier(
  player: Player,
  quarter: number,
  marginPoints: number,
  isFinal: boolean,
  captainPresent: boolean,
): number {
  if (quarter < 3 && !isFinal) return 1.0

  const clutchFactor = player.attributes.clutch / 100
  const bigGame = player.hiddenAttributes.bigGameModifier / 100
  const captainBonus = captainPresent ? 0.02 : 0

  let modifier: number
  if (marginPoints <= 18) {
    // Close game — clutch matters more
    modifier = 0.95 + clutchFactor * 1.3 * 0.15 + bigGame + captainBonus
  } else {
    modifier = 0.95 + clutchFactor * 0.15 + bigGame + captainBonus
  }

  return Math.max(0.88, Math.min(1.15, modifier))
}

// ---------------------------------------------------------------------------
// Mentorship development modifier
// ---------------------------------------------------------------------------

/**
 * Returns a multiplier (0.97-1.08) applied to young player (age <= 24) development.
 *
 * - Captain/VC have leadership >= 75 and same club → base 1.04
 * - Each leader with leadership >= 70 at same position group → +0.01 (max +0.04)
 * - No/weak leadership → 0.97
 */
export function getMentorshipModifier(
  player: Player,
  leadership: ClubLeadership | undefined,
  players: Record<string, Player>,
): number {
  if (player.age > 24) return 1.0
  if (!leadership) return 0.97

  const captain = leadership.captainId ? players[leadership.captainId] : null
  const vc = leadership.viceCaptainId ? players[leadership.viceCaptainId] : null

  const hasStrongLeader =
    (captain && captain.clubId === player.clubId && captain.attributes.leadership >= 75) ||
    (vc && vc.clubId === player.clubId && vc.attributes.leadership >= 75)

  if (!hasStrongLeader) return 0.97

  let modifier = 1.04

  // Position-group mentorship from leadership group members
  const playerPosGroup = player.position.primary
  let positionalBonus = 0
  for (const gId of leadership.leadershipGroupIds) {
    const leader = players[gId]
    if (
      leader &&
      leader.clubId === player.clubId &&
      leader.attributes.leadership >= 70 &&
      leader.position.primary === playerPosGroup
    ) {
      positionalBonus += 0.01
      if (positionalBonus >= 0.04) break
    }
  }

  modifier += positionalBonus
  return Math.min(1.08, modifier)
}
