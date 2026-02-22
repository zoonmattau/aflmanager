/**
 * Team Cohesion engine.
 *
 * Computes and maintains a per-club cohesion score based on five sub-scores:
 * leadership stability, role familiarity, unit chemistry, list continuity,
 * and morale average.
 *
 * Cohesion is persisted on Club.cohesion and updated once per round. It
 * influences match performance (0.97–1.03 multiplier) stacking with the
 * culture modifier.
 */

import type { Club, TeamCohesion, CohesionEvent } from '@/types/club'
import type { Player, LineupSlot } from '@/types/player'
import { SLOT_POSITION_COMPATIBILITY, POSITION_LINE } from '@/engine/core/constants'
import { getOverallRating } from '@/engine/player/playerRating'

// ---------------------------------------------------------------------------
// Sub-score: Leadership Stability (0-100)
// ---------------------------------------------------------------------------

export function computeLeadershipStability(
  club: Club,
  prevCohesion: TeamCohesion | undefined,
): { score: number; events: CohesionEvent[] } {
  const events: CohesionEvent[] = []

  if (!prevCohesion || prevCohesion.lastUpdatedRound < 0) {
    return { score: 75, events }
  }

  let score = prevCohesion.leadershipStability

  const capChanged = prevCohesion.prevCaptainId !== null
    && prevCohesion.prevCaptainId !== club.leadership.captainId
  const vcChanged = prevCohesion.prevViceCaptainId !== null
    && prevCohesion.prevViceCaptainId !== club.leadership.viceCaptainId

  if (capChanged) {
    score = Math.max(20, score - 25)
    events.push({
      round: prevCohesion.lastUpdatedRound,
      type: 'captaincy-change',
      description: 'Captaincy changed — team adjusting to new leadership',
      impact: -25,
    })
  }
  if (vcChanged) {
    score = Math.max(30, score - 15)
    events.push({
      round: prevCohesion.lastUpdatedRound,
      type: 'captaincy-change',
      description: 'Vice-captaincy changed — minor leadership disruption',
      impact: -15,
    })
  }

  // Natural recovery toward 100 when leadership is stable
  if (!capChanged && !vcChanged) {
    score = Math.min(100, score + 3)
  }

  return { score: Math.round(score), events }
}

// ---------------------------------------------------------------------------
// Sub-score: Role Familiarity (0-100)
// ---------------------------------------------------------------------------

/**
 * Fraction of selected starters playing in a slot compatible with their
 * primary position. Interchange players are checked with a looser standard.
 * Returns 70 (neutral) when no lineup data is available.
 */
export function computeRoleFamiliarity(
  clubId: string,
  players: Record<string, Player>,
  selectedLineup: Record<string, string> | null,
): { score: number; outOfPositionCount: number } {
  if (!selectedLineup) return { score: 70, outOfPositionCount: 0 }

  const entries = Object.entries(selectedLineup) as Array<[LineupSlot, string]>
  if (entries.length === 0) return { score: 70, outOfPositionCount: 0 }

  let inPosition = 0
  let total = 0
  let outOfPositionCount = 0

  for (const [slot, playerId] of entries) {
    const player = players[playerId]
    if (!player || player.clubId !== clubId) continue

    total++
    const compat = SLOT_POSITION_COMPATIBILITY[slot]
    if (!compat) { inPosition++; continue }

    const isInPos = compat.includes(player.position.primary)
    if (isInPos) {
      inPosition++
    } else {
      outOfPositionCount++
    }
  }

  if (total === 0) return { score: 70, outOfPositionCount: 0 }

  // Scale: 0% in position → 40, 100% in position → 100
  const pct = inPosition / total
  const score = Math.round(40 + pct * 60)
  return { score: Math.max(0, Math.min(100, score)), outOfPositionCount }
}

// ---------------------------------------------------------------------------
// Sub-score: Unit Chemistry (0-100)
// ---------------------------------------------------------------------------

/**
 * Average years at club for each positional line (DEF / MID / FWD / RK),
 * then maps to 0-100. Long-tenured units score higher.
 */
export function computeUnitChemistry(
  clubId: string,
  players: Record<string, Player>,
  currentYear: number,
): number {
  const lineYears: Record<string, number[]> = { DEF: [], MID: [], FWD: [], RK: [] }

  for (const player of Object.values(players)) {
    if (player.clubId !== clubId) continue
    const line = POSITION_LINE[player.position.primary]
    if (!line) continue
    const years = Math.max(0, currentYear - player.draftYear)
    lineYears[line].push(years)
  }

  const lineAvgs: number[] = []
  for (const years of Object.values(lineYears)) {
    if (years.length === 0) continue
    const avg = years.reduce((a, b) => a + b, 0) / years.length
    lineAvgs.push(avg)
  }

  if (lineAvgs.length === 0) return 50

  const overallAvg = lineAvgs.reduce((a, b) => a + b, 0) / lineAvgs.length

  // 0 years avg → 30, 6+ years avg → 90
  const score = 30 + Math.min(60, overallAvg * 10)
  return Math.round(Math.max(0, Math.min(100, score)))
}

// ---------------------------------------------------------------------------
// Sub-score: List Continuity (0-100)
// ---------------------------------------------------------------------------

/**
 * High continuity = low trade activity + high average tenure.
 * Mirrors the culture stability computation.
 */
export function computeListContinuity(
  clubId: string,
  players: Record<string, Player>,
  tradeCount: number,
  currentYear: number,
): number {
  let score = Math.max(30, 100 - tradeCount * 5)

  const roster = Object.values(players).filter((p) => p.clubId === clubId)
  if (roster.length > 0) {
    const avgTenure = roster.reduce(
      (sum, p) => sum + Math.max(0, currentYear - p.draftYear),
      0,
    ) / roster.length
    score += Math.min(15, avgTenure * 2.5)
  }

  return Math.round(Math.max(0, Math.min(100, score)))
}

// ---------------------------------------------------------------------------
// Sub-score: Morale Average (0-100)
// ---------------------------------------------------------------------------

export function computeMoraleAverage(
  clubId: string,
  players: Record<string, Player>,
): number {
  const roster = Object.values(players).filter((p) => p.clubId === clubId)
  if (roster.length === 0) return 60

  const sum = roster.reduce((acc, p) => acc + (p.morale ?? 60), 0)
  return Math.round(sum / roster.length)
}

// ---------------------------------------------------------------------------
// Injury disruption events
// ---------------------------------------------------------------------------

/**
 * Returns a CohesionEvent if multiple key players are currently injured.
 * "Key" = overall rating ≥ 75.
 */
export function detectInjuryDisruption(
  clubId: string,
  players: Record<string, Player>,
  currentRound: number,
): CohesionEvent | null {
  const injuredKey = Object.values(players).filter(
    (p) => p.clubId === clubId && p.injury !== null && getOverallRating(p) >= 75,
  ).length

  if (injuredKey < 2) return null

  return {
    round: currentRound,
    type: 'injury-disruption',
    description: `${injuredKey} key players injured — squad continuity disrupted`,
    impact: Math.max(-20, -(injuredKey * 5)),
  }
}

// ---------------------------------------------------------------------------
// Headline Cohesion Score (0-100)
// ---------------------------------------------------------------------------

export function computeCohesionScore(
  leadershipStability: number,
  roleFamiliarity: number,
  unitChemistry: number,
  listContinuity: number,
  moraleAverage: number,
): number {
  const score =
    leadershipStability * 0.20 +
    roleFamiliarity    * 0.25 +
    unitChemistry      * 0.20 +
    listContinuity     * 0.20 +
    moraleAverage      * 0.15

  return Math.round(Math.max(0, Math.min(100, score)))
}

// ---------------------------------------------------------------------------
// Update Cohesion (per-round entry point)
// ---------------------------------------------------------------------------

export function updateTeamCohesion(
  club: Club,
  players: Record<string, Player>,
  selectedLineup: Record<string, string> | null,
  tradeCount: number,
  currentRound: number,
  currentYear: number,
): void {
  const prev = club.cohesion

  // Sub-scores
  const { score: rawLeadershipStability, events: leaderEvents } =
    computeLeadershipStability(club, prev)

  const { score: rawRoleFamiliarity, outOfPositionCount } =
    computeRoleFamiliarity(club.id, players, selectedLineup)

  const rawUnitChemistry = computeUnitChemistry(club.id, players, currentYear)
  const rawListContinuity = computeListContinuity(club.id, players, tradeCount, currentYear)
  const rawMoraleAverage = computeMoraleAverage(club.id, players)

  const rawScore = computeCohesionScore(
    rawLeadershipStability,
    rawRoleFamiliarity,
    rawUnitChemistry,
    rawListContinuity,
    rawMoraleAverage,
  )

  // Build events for this round
  const newEvents: CohesionEvent[] = [...leaderEvents]

  // Out-of-position event
  if (outOfPositionCount >= 3) {
    newEvents.push({
      round: currentRound,
      type: 'role-switch',
      description: `${outOfPositionCount} players selected out of their primary position`,
      impact: -(outOfPositionCount * 3),
    })
  }

  // Injury disruption
  const injuryEvent = detectInjuryDisruption(club.id, players, currentRound)
  if (injuryEvent) newEvents.push(injuryEvent)

  // Keep events from the last 6 rounds
  const retainedEvents: CohesionEvent[] = [
    ...(prev?.recentEvents ?? []).filter((e) => currentRound - e.round <= 6),
    ...newEvents,
  ].slice(-12)  // cap at 12 total

  // Drift model: 70% new + 30% previous (prevents wild swings)
  const drift = prev && prev.lastUpdatedRound >= 0

  club.cohesion = {
    score: drift ? Math.round(rawScore * 0.7 + prev!.score * 0.3) : rawScore,
    leadershipStability: drift
      ? Math.round(rawLeadershipStability * 0.7 + prev!.leadershipStability * 0.3)
      : rawLeadershipStability,
    roleFamiliarity: drift
      ? Math.round(rawRoleFamiliarity * 0.7 + prev!.roleFamiliarity * 0.3)
      : rawRoleFamiliarity,
    unitChemistry: drift
      ? Math.round(rawUnitChemistry * 0.7 + prev!.unitChemistry * 0.3)
      : rawUnitChemistry,
    listContinuity: drift
      ? Math.round(rawListContinuity * 0.7 + prev!.listContinuity * 0.3)
      : rawListContinuity,
    moraleAverage: drift
      ? Math.round(rawMoraleAverage * 0.7 + prev!.moraleAverage * 0.3)
      : rawMoraleAverage,
    lastUpdatedRound: currentRound,
    recentEvents: retainedEvents,
    prevCaptainId: club.leadership.captainId,
    prevViceCaptainId: club.leadership.viceCaptainId,
  }
}

// ---------------------------------------------------------------------------
// Effect Functions
// ---------------------------------------------------------------------------

/** Multiplicative modifier on adjusted team rating. Returns 0.97–1.03. */
export function getCohesionMatchModifier(cohesion: TeamCohesion | undefined): number {
  if (!cohesion) return 1.0
  return 0.97 + (cohesion.score / 100) * 0.06
}

/** Human-readable label for a cohesion score. */
export function getCohesionLabel(score: number): string {
  if (score >= 80) return 'Tight-Knit'
  if (score >= 65) return 'Cohesive'
  if (score >= 50) return 'Functional'
  if (score >= 35) return 'Disrupted'
  return 'Fragmented'
}

/** Returns a default cohesion state for new games / migration. */
export function createDefaultCohesion(): TeamCohesion {
  return {
    score: 55,
    leadershipStability: 75,
    roleFamiliarity: 70,
    unitChemistry: 55,
    listContinuity: 65,
    moraleAverage: 60,
    lastUpdatedRound: -1,
    recentEvents: [],
    prevCaptainId: null,
    prevViceCaptainId: null,
  }
}
