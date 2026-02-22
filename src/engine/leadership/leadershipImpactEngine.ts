/**
 * Leadership Impact Engine (Preview)
 *
 * Lightweight, pure-function engine for projecting the impact of a proposed
 * leadership change BEFORE it is committed. Used by the Leadership screen's
 * impact preview panel.
 *
 * Distinct from leadershipChangeEngine.ts which is the full consequence engine
 * used when changes are actually applied.
 */

import type { Player } from '@/types/player'
import type { ClubLeadership } from '@/types/club'
import type { GamePhase } from '@/types/game'
import { getLeadershipScore } from '@/engine/leadership/leadershipEngine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerMoraleDelta {
  playerId: string
  name: string
  currentRole: 'captain' | 'vice-captain' | 'lg' | 'none'
  newRole: 'captain' | 'vice-captain' | 'lg' | 'none'
  delta: number
  reason: string
}

export interface LeadershipChangeImpact {
  /** Morale deltas — only entries with |delta| ≥ 1 */
  moraleDelta: PlayerMoraleDelta[]
  /** getTeamLeadershipRating diff (positive = improvement) */
  leadershipRatingDelta: number
  /** Estimated culture point change from leadershipFactor shift */
  cultureDelta: number
  /** 0-100 probability of board concern */
  boardConcernProbability: number
  boardConcernReasons: string[]
  /** Human-readable chips summarising what will change */
  changes: Array<{ role: string; fromName: string | null; toName: string | null }>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getCurrentRole(
  playerId: string,
  leadership: ClubLeadership,
): 'captain' | 'vice-captain' | 'lg' | 'none' {
  if (leadership.captainId === playerId) return 'captain'
  if (leadership.viceCaptainId === playerId) return 'vice-captain'
  if (leadership.leadershipGroupIds.includes(playerId)) return 'lg'
  return 'none'
}

function playerName(p: Player): string {
  return `${p.firstName} ${p.lastName}`
}

// ---------------------------------------------------------------------------
// Morale delta computation (simplified, preview-only rules)
// ---------------------------------------------------------------------------

function computeMoraleDeltas(
  current: ClubLeadership,
  proposed: ClubLeadership,
  players: Record<string, Player>,
  clubId: string,
): PlayerMoraleDelta[] {
  const deltas: PlayerMoraleDelta[] = []
  const processed = new Set<string>()

  const clubPlayers = Object.values(players).filter((p) => p.clubId === clubId)

  // ── Captain changes ──────────────────────────────────────────────────────
  const captainChanged = current.captainId !== proposed.captainId

  if (captainChanged) {
    // Outgoing captain
    if (current.captainId) {
      const p = players[current.captainId]
      if (p?.clubId === clubId) {
        processed.add(p.id)
        const newRole = getCurrentRole(p.id, proposed)
        deltas.push({
          playerId: p.id,
          name: playerName(p),
          currentRole: 'captain',
          newRole,
          delta: -8,
          reason: 'Loses captaincy',
        })
      }
    }

    // Incoming captain
    if (proposed.captainId && proposed.captainId !== current.captainId) {
      const p = players[proposed.captainId]
      if (p?.clubId === clubId) {
        processed.add(p.id)
        // Natural succession (was VC) gets smaller boost
        const wasVC = current.viceCaptainId === p.id
        const delta = wasVC ? 3 : 6
        deltas.push({
          playerId: p.id,
          name: playerName(p),
          currentRole: wasVC ? 'vice-captain' : getCurrentRole(p.id, current),
          newRole: 'captain',
          delta,
          reason: wasVC ? 'Natural succession to captain' : 'Named captain',
        })
      }
    }

    // Sympathy ripple: teammates with teamPlayer ≥ 75, same primary position as outgoing captain (max 3)
    if (current.captainId) {
      const outgoing = players[current.captainId]
      if (outgoing?.clubId === clubId) {
        let rippleCount = 0
        for (const p of clubPlayers) {
          if (processed.has(p.id)) continue
          if (p.attributes.teamPlayer >= 75 && p.position.primary === outgoing.position.primary) {
            processed.add(p.id)
            deltas.push({
              playerId: p.id,
              name: playerName(p),
              currentRole: getCurrentRole(p.id, current),
              newRole: getCurrentRole(p.id, proposed),
              delta: -1,
              reason: 'Sympathy for outgoing captain (same position group)',
            })
            rippleCount++
            if (rippleCount >= 3) break
          }
        }
      }
    }
  }

  // ── VC changes ───────────────────────────────────────────────────────────
  const vcChanged = current.viceCaptainId !== proposed.viceCaptainId

  if (vcChanged) {
    // Outgoing VC
    if (current.viceCaptainId && !processed.has(current.viceCaptainId)) {
      const p = players[current.viceCaptainId]
      if (p?.clubId === clubId) {
        processed.add(p.id)
        deltas.push({
          playerId: p.id,
          name: playerName(p),
          currentRole: 'vice-captain',
          newRole: getCurrentRole(p.id, proposed),
          delta: -4,
          reason: 'Loses vice-captaincy',
        })
      }
    }

    // Incoming VC
    if (proposed.viceCaptainId && !processed.has(proposed.viceCaptainId) && proposed.viceCaptainId !== current.viceCaptainId) {
      const p = players[proposed.viceCaptainId]
      if (p?.clubId === clubId) {
        processed.add(p.id)
        deltas.push({
          playerId: p.id,
          name: playerName(p),
          currentRole: getCurrentRole(p.id, current),
          newRole: 'vice-captain',
          delta: 3,
          reason: 'Named vice-captain',
        })
      }
    }
  }

  // ── Leadership group changes ─────────────────────────────────────────────
  const prevGroupSet = new Set(current.leadershipGroupIds)
  const newGroupSet = new Set(proposed.leadershipGroupIds)

  // Removed from LG
  for (const id of prevGroupSet) {
    if (!newGroupSet.has(id) && !processed.has(id)) {
      const p = players[id]
      if (p?.clubId === clubId) {
        processed.add(id)
        deltas.push({
          playerId: id,
          name: playerName(p),
          currentRole: 'lg',
          newRole: getCurrentRole(id, proposed),
          delta: -2,
          reason: 'Removed from leadership group',
        })
      }
    }
  }

  // Added to LG
  for (const id of newGroupSet) {
    if (!prevGroupSet.has(id) && !processed.has(id)) {
      const p = players[id]
      if (p?.clubId === clubId) {
        processed.add(id)
        deltas.push({
          playerId: id,
          name: playerName(p),
          currentRole: getCurrentRole(id, current),
          newRole: 'lg',
          delta: 2,
          reason: 'Added to leadership group',
        })
      }
    }
  }

  // Filter: only include |delta| ≥ 1 (already guaranteed by rules above)
  return deltas.filter((d) => Math.abs(d.delta) >= 1)
}

// ---------------------------------------------------------------------------
// Leadership rating delta (simple 22-man approximation using all club players)
// ---------------------------------------------------------------------------

function computeLeadershipRatingDelta(
  current: ClubLeadership,
  proposed: ClubLeadership,
  players: Record<string, Player>,
  clubId: string,
): number {
  const clubPlayers = Object.values(players).filter((p) => p.clubId === clubId)

  function rating(leadership: ClubLeadership): number {
    const ids = new Set(clubPlayers.map((p) => p.id))
    const captainPlayer = clubPlayers.find((p) => p.id === leadership.captainId)
    const vcPlayer = clubPlayers.find((p) => p.id === leadership.viceCaptainId)

    let r = 0

    if (captainPlayer) {
      r += 25 * (getLeadershipScore(captainPlayer) / 100)
    } else if (vcPlayer) {
      r += 25 * 0.8 * (getLeadershipScore(vcPlayer) / 100)
    }

    if (vcPlayer && captainPlayer) {
      r += 15 * (getLeadershipScore(vcPlayer) / 100)
    }

    let groupCount = 0
    for (const gId of leadership.leadershipGroupIds) {
      if (ids.has(gId) && groupCount < 5) {
        const gPlayer = clubPlayers.find((p) => p.id === gId)
        if (gPlayer) {
          r += 5 * (getLeadershipScore(gPlayer) / 100)
          groupCount++
        }
      }
    }

    const avgLeadership =
      clubPlayers.length > 0
        ? clubPlayers.reduce((sum, p) => sum + p.attributes.leadership, 0) / clubPlayers.length
        : 50
    r += (avgLeadership / 100) * 10

    return Math.round(Math.max(0, Math.min(100, r)))
  }

  return rating(proposed) - rating(current)
}

// ---------------------------------------------------------------------------
// Culture delta estimation
// ---------------------------------------------------------------------------

function computeCultureDelta(
  current: ClubLeadership,
  proposed: ClubLeadership,
  players: Record<string, Player>,
): number {
  function leadershipFactor(leadership: ClubLeadership): number {
    const ids = [
      leadership.captainId,
      leadership.viceCaptainId,
      ...leadership.leadershipGroupIds,
    ].filter(Boolean) as string[]

    if (ids.length === 0) return 50

    const avg =
      ids.reduce((sum, id) => {
        const p = players[id]
        return sum + (p ? getLeadershipScore(p) : 50)
      }, 0) / ids.length

    return avg
  }

  const currentFactor = leadershipFactor(current)
  const proposedFactor = leadershipFactor(proposed)
  return Math.round((proposedFactor - currentFactor) * 0.30)
}

// ---------------------------------------------------------------------------
// Board concern probability
// ---------------------------------------------------------------------------

function computeBoardConcern(
  current: ClubLeadership,
  proposed: ClubLeadership,
  players: Record<string, Player>,
  phase: GamePhase,
  currentRound: number,
): { probability: number; reasons: string[] } {
  let prob = 15
  const reasons: string[] = []

  const captainChanged = current.captainId !== proposed.captainId
  const vcChanged = current.viceCaptainId !== proposed.viceCaptainId

  const isDuringRegularSeason = phase === 'regular-season'
  const isDuringFinals = phase === 'finals'

  if (captainChanged && (isDuringRegularSeason || isDuringFinals)) {
    prob += 20
    reasons.push('Captain changed during active season')
  }

  // New captain LS vs old captain LS
  if (captainChanged && current.captainId && proposed.captainId) {
    const oldCap = players[current.captainId]
    const newCap = players[proposed.captainId]
    if (oldCap && newCap) {
      const lsDiff = getLeadershipScore(oldCap) - getLeadershipScore(newCap)
      if (lsDiff > 0) {
        const penalty = Math.round((lsDiff / 10) * 8)
        prob += penalty
        if (penalty > 0) reasons.push(`New captain has lower leadership score (−${lsDiff})`)
      }
      // Was VC → natural succession reduces concern
      if (current.viceCaptainId === proposed.captainId) {
        prob -= 10
        reasons.push('Natural succession from vice-captain (reduces concern)')
      }
    }
  }

  // Count total role changes
  let totalChanges = 0
  if (captainChanged) totalChanges++
  if (vcChanged) totalChanges++

  const addedToGroup = proposed.leadershipGroupIds.filter(
    (id) => !current.leadershipGroupIds.includes(id),
  ).length
  const removedFromGroup = current.leadershipGroupIds.filter(
    (id) => !proposed.leadershipGroupIds.includes(id),
  ).length
  totalChanges += addedToGroup + removedFromGroup

  if (totalChanges > 2) {
    prob += 15
    reasons.push('Multiple simultaneous role changes')
  }

  const clampedProb = Math.max(0, Math.min(95, prob))

  // Only surface positive reasons (things that add to concern)
  const concernReasons = reasons.filter(
    (r) => !r.includes('reduces concern'),
  )

  return { probability: clampedProb, reasons: concernReasons }
}

// ---------------------------------------------------------------------------
// Change summary chips
// ---------------------------------------------------------------------------

function buildChangeSummary(
  current: ClubLeadership,
  proposed: ClubLeadership,
  players: Record<string, Player>,
): LeadershipChangeImpact['changes'] {
  const changes: LeadershipChangeImpact['changes'] = []
  const getName = (id: string | null) => {
    if (!id) return null
    const p = players[id]
    return p ? `${p.firstName} ${p.lastName}` : null
  }

  if (current.captainId !== proposed.captainId) {
    changes.push({
      role: 'Captain',
      fromName: getName(current.captainId),
      toName: getName(proposed.captainId),
    })
  }

  if (current.viceCaptainId !== proposed.viceCaptainId) {
    changes.push({
      role: 'Vice-Captain',
      fromName: getName(current.viceCaptainId),
      toName: getName(proposed.viceCaptainId),
    })
  }

  const added = proposed.leadershipGroupIds.filter(
    (id) => !current.leadershipGroupIds.includes(id),
  )
  const removed = current.leadershipGroupIds.filter(
    (id) => !proposed.leadershipGroupIds.includes(id),
  )

  for (const id of added) {
    changes.push({ role: 'Leadership Group', fromName: null, toName: getName(id) })
  }
  for (const id of removed) {
    changes.push({ role: 'Leadership Group', fromName: getName(id), toName: null })
  }

  return changes
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function computeLeadershipChangeImpact(
  current: ClubLeadership,
  proposed: ClubLeadership,
  players: Record<string, Player>,
  clubId: string,
  phase: GamePhase,
  currentRound: number,
): LeadershipChangeImpact {
  const moraleDelta = computeMoraleDeltas(current, proposed, players, clubId)
  const leadershipRatingDelta = computeLeadershipRatingDelta(current, proposed, players, clubId)
  const cultureDelta = computeCultureDelta(current, proposed, players)
  const { probability, reasons } = computeBoardConcern(current, proposed, players, phase, currentRound)
  const changes = buildChangeSummary(current, proposed, players)

  return {
    moraleDelta,
    leadershipRatingDelta,
    cultureDelta,
    boardConcernProbability: probability,
    boardConcernReasons: reasons,
    changes,
  }
}
