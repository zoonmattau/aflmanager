import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { SeededRNG } from '@/engine/core/rng'
import { rollMatchInjuries, applyInjuryEvent } from '@/engine/players/injuries'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreseasonPlayerStat {
  playerId: string
  clubId: string
  disposals: number
  goals: number
  marks: number
  tackles: number
  performanceRating: number // 1.0–10.0, one decimal
}

export interface PracticeMatchFixture {
  id: string
  type: 'friendly' | 'intra-squad'
  homeClubId: string
  awayClubId: string
  venue: string
}

export interface PracticeMatchResult {
  fixtureId: string
  type: 'friendly' | 'intra-squad'
  homeClubId: string
  awayClubId: string
  homeScore: { goals: number; behinds: number; total: number }
  awayScore: { goals: number; behinds: number; total: number }
  venue: string
  playerStats: PreseasonPlayerStat[]
  injuredPlayerIds: string[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Average all numeric attributes as a simple overall (0-100). */
function getOverall(player: Player): number {
  const vals = Object.values(player.attributes) as number[]
  if (vals.length === 0) return 50
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/** Returns true if position is forward or midfield (can kick goals). */
function isForwardOrMid(position: string): boolean {
  return ['HFF', 'CHF', 'FP', 'FF', 'W', 'IM', 'OM', 'RK', 'RR', 'ROV'].includes(position)
}

/** Team rating = average overall of top 22 players. */
function getTeamRating(clubId: string, players: Record<string, Player>): number {
  const clubPlayers = Object.values(players).filter((p) => p.clubId === clubId)
  if (clubPlayers.length === 0) return 50
  const sorted = clubPlayers.map(getOverall).sort((a, b) => b - a).slice(0, 22)
  return sorted.reduce((a, b) => a + b, 0) / sorted.length
}

/** Generate a score-line from rating difference. */
function generateScore(
  homeRating: number,
  awayRating: number,
  rng: SeededRNG,
): { home: { goals: number; behinds: number; total: number }; away: { goals: number; behinds: number; total: number } } {
  const homeAdvantage = 3
  const ratingDiff = (homeRating + homeAdvantage - awayRating) / 20
  const homeGoals = Math.max(0, Math.round(8 + ratingDiff * 2 + rng.nextInt(-4, 4)))
  const homeBehinds = Math.max(0, Math.round(6 + rng.nextInt(-3, 5)))
  const awayGoals = Math.max(0, Math.round(8 - ratingDiff * 2 + rng.nextInt(-4, 4)))
  const awayBehinds = Math.max(0, Math.round(6 + rng.nextInt(-3, 5)))
  return {
    home: { goals: homeGoals, behinds: homeBehinds, total: homeGoals * 6 + homeBehinds },
    away: { goals: awayGoals, behinds: awayBehinds, total: awayGoals * 6 + awayBehinds },
  }
}

/** Generate per-player stats for the top 22 players on a side. */
function generatePlayerStats(
  playerIds: string[],
  players: Record<string, Player>,
  clubId: string,
  rng: SeededRNG,
): PreseasonPlayerStat[] {
  return playerIds.map((playerId) => {
    const player = players[playerId]
    if (!player) return null
    const a = player.attributes
    const kick = a.kickingEfficiency ?? 50
    const handball = a.handballEfficiency ?? 50
    const marking = ((a.markingOverhead ?? 50) + (a.markingContested ?? 50) + (a.markingLeading ?? 50) + (a.markingUncontested ?? 50)) / 4
    const tackling = a.tackling ?? 50
    const goalkicking = a.goalkicking ?? 50

    const disposals = clamp(
      Math.round((kick + handball) / 10 + rng.nextFloat(-3, 5)),
      2,
      30,
    )
    const goals = isForwardOrMid(player.position.primary)
      ? clamp(Math.round(goalkicking / 22 + rng.nextFloat(-0.5, 1.5)), 0, 6)
      : 0
    const marks = clamp(Math.round(marking / 12 + rng.nextFloat(-1, 2)), 0, 10)
    const tackles = clamp(Math.round(tackling / 12 + rng.nextFloat(-1, 2)), 0, 10)

    const raw = disposals * 0.25 + goals * 0.8 + marks * 0.15 + tackles * 0.15
    const performanceRating = clamp(Math.round(raw * 10) / 10, 1.0, 10.0)

    return {
      playerId,
      clubId,
      disposals,
      goals,
      marks,
      tackles,
      performanceRating,
    } satisfies PreseasonPlayerStat
  }).filter((s): s is PreseasonPlayerStat => Boolean(s))
}

/** Generate a 12-char alphanumeric ID using the RNG. */
function generateId(prefix: string, rng: SeededRNG): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = `${prefix}_`
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)]
  }
  return id
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Returns up to 5 shuffled AI club IDs (excludes player's own club).
 */
export function getAvailableOpponents(
  clubs: Record<string, Club>,
  playerClubId: string,
  rng: SeededRNG,
): string[] {
  const others = Object.keys(clubs).filter((id) => id !== playerClubId)
  return rng.shuffle(others).slice(0, 5)
}

/**
 * Build a PracticeMatchFixture from the given parameters.
 *
 * Friendly: alternate home/away based on existing fixture count (even = home, odd = away).
 * Intra-squad: both clubs are playerClubId, venue is homeGround + " (Training)".
 */
export function buildPracticeMatchFixture(
  type: 'friendly' | 'intra-squad',
  playerClubId: string,
  clubs: Record<string, Club>,
  rng: SeededRNG,
  existingCount: number,
  opponentClubId?: string,
): PracticeMatchFixture {
  const id = generateId('pm', rng)

  if (type === 'intra-squad') {
    const venue = (clubs[playerClubId]?.homeGround ?? 'Training Ground') + ' (Training)'
    return {
      id,
      type: 'intra-squad',
      homeClubId: playerClubId,
      awayClubId: playerClubId,
      venue,
    }
  }

  // Friendly
  const opponentId = opponentClubId ?? getAvailableOpponents(clubs, playerClubId, rng)[0] ?? playerClubId
  const isHome = existingCount % 2 === 0
  const homeClubId = isHome ? playerClubId : opponentId
  const awayClubId = isHome ? opponentId : playerClubId
  const venue = clubs[homeClubId]?.homeGround ?? 'Unknown Venue'

  return {
    id,
    type: 'friendly',
    homeClubId,
    awayClubId,
    venue,
  }
}

/**
 * Simulate a practice match. Returns scores, per-player stats, and injuries.
 * Mutates the passed `players` record to apply injury events.
 */
export function simulatePracticeMatch(
  fixture: PracticeMatchFixture,
  players: Record<string, Player>,
  _clubs: Record<string, Club>,
  rng: SeededRNG,
): PracticeMatchResult {
  const { homeClubId, awayClubId, type } = fixture

  let homePlayerIds: string[]
  let awayPlayerIds: string[]

  if (type === 'intra-squad') {
    // Sort club players by overall, alternately assign to red/blue
    const clubPlayers = Object.values(players)
      .filter((p) => p.clubId === homeClubId && p.clubId !== 'retired')
      .sort((a, b) => getOverall(b) - getOverall(a))

    homePlayerIds = []
    awayPlayerIds = []
    for (let i = 0; i < clubPlayers.length; i++) {
      if (i % 2 === 0) {
        homePlayerIds.push(clubPlayers[i].id)
      } else {
        awayPlayerIds.push(clubPlayers[i].id)
      }
    }
    homePlayerIds = homePlayerIds.slice(0, 22)
    awayPlayerIds = awayPlayerIds.slice(0, 22)
  } else {
    // Friendly: top 22 from each club
    homePlayerIds = Object.values(players)
      .filter((p) => p.clubId === homeClubId && p.clubId !== 'retired')
      .sort((a, b) => getOverall(b) - getOverall(a))
      .slice(0, 22)
      .map((p) => p.id)

    awayPlayerIds = Object.values(players)
      .filter((p) => p.clubId === awayClubId && p.clubId !== 'retired')
      .sort((a, b) => getOverall(b) - getOverall(a))
      .slice(0, 22)
      .map((p) => p.id)
  }

  // Scores
  let homeRating: number
  let awayRating: number
  if (type === 'intra-squad') {
    homeRating = homePlayerIds.reduce((sum, id) => sum + getOverall(players[id]!), 0) / Math.max(1, homePlayerIds.length)
    awayRating = awayPlayerIds.reduce((sum, id) => sum + getOverall(players[id]!), 0) / Math.max(1, awayPlayerIds.length)
  } else {
    homeRating = getTeamRating(homeClubId, players)
    awayRating = getTeamRating(awayClubId, players)
  }
  const scores = generateScore(homeRating, awayRating, rng)

  // Per-player stats
  const homeStats = generatePlayerStats(homePlayerIds, players, homeClubId, rng)
  const awayStats = generatePlayerStats(awayPlayerIds, players, awayClubId, rng)
  const allStats = [...homeStats, ...awayStats]

  // Injuries (low = ~40% of normal base rate)
  const allParticipantIds = [...homePlayerIds, ...awayPlayerIds]
  const today = new Date().toISOString().slice(0, 10)
  const injuries = rollMatchInjuries(allParticipantIds, players, rng, 'low', 'low', today)

  const injuredPlayerIds: string[] = []
  for (const event of injuries) {
    const player = players[event.playerId]
    if (player) {
      applyInjuryEvent(player, event)
      injuredPlayerIds.push(event.playerId)
    }
  }

  return {
    fixtureId: fixture.id,
    type,
    homeClubId,
    awayClubId,
    homeScore: scores.home,
    awayScore: scores.away,
    venue: fixture.venue,
    playerStats: allStats,
    injuredPlayerIds,
  }
}

/**
 * Apply practice match effects to players.
 * - Participating players: form + (2 to +6), fatigue +6
 * - Non-participating listed players (not injured): form -1
 *
 * Mutates players in place.
 */
export function applyPracticeMatchEffects(
  result: PracticeMatchResult,
  players: Record<string, Player>,
  playerClubId: string,
): void {
  const participantIds = new Set(result.playerStats.map((s) => s.playerId))
  const injuredIds = new Set(result.injuredPlayerIds)

  for (const player of Object.values(players)) {
    if (!player.clubId || player.clubId === 'retired') continue
    // Only apply effects to players in the participating clubs
    const isParticipatingClub =
      player.clubId === result.homeClubId || player.clubId === result.awayClubId

    if (!isParticipatingClub) continue

    if (participantIds.has(player.id)) {
      // Find the player's rating
      const stat = result.playerStats.find((s) => s.playerId === player.id)
      const rating = stat?.performanceRating ?? 5
      const formBoost = 2 + Math.floor(rating * 0.4)
      player.form = clamp(player.form + formBoost, 1, 100)
      player.fatigue = clamp(player.fatigue + 6, 0, 100)
    } else if (!injuredIds.has(player.id)) {
      // Non-participating, non-injured: mild form decay
      player.form = clamp(player.form - 1, 1, 100)
    }
  }

  void playerClubId // used by caller for scoping (no-op here)
}
