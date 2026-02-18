import type { Player, PlayerInjury } from '@/types/player'
import type {
  SpecialEventInstance,
  SpecialEventMatchResult,
} from '@/types/specialEvents'
import type { RealismSettings } from '@/types/game'
import type { SeededRNG } from '@/engine/core/rng'

/**
 * Simulate a special event match using simplified team-rating-based scoring
 * (same pattern as preseasonMatches.ts).
 */
export function simulateSpecialMatch(
  event: SpecialEventInstance,
  players: Record<string, Player>,
  rng: SeededRNG,
  playerClubId: string,
): SpecialEventMatchResult {
  const ratingDiff = (event.teamA.teamRating - event.teamB.teamRating) / 20

  const teamAGoals = Math.max(0, Math.round(10 + ratingDiff * 2 + rng.nextInt(-4, 4)))
  const teamABehinds = Math.max(0, Math.round(7 + rng.nextInt(-3, 5)))
  const teamBGoals = Math.max(0, Math.round(10 - ratingDiff * 2 + rng.nextInt(-4, 4)))
  const teamBBehinds = Math.max(0, Math.round(7 + rng.nextInt(-3, 5)))

  // Identify user club participants from both teams
  const userClubParticipants: string[] = []
  for (const pid of [...event.teamA.playerIds, ...event.teamB.playerIds]) {
    const p = players[pid]
    if (p && p.clubId === playerClubId) {
      userClubParticipants.push(pid)
    }
  }

  // Pick best on ground from all participants
  const allParticipantIds = [...event.teamA.playerIds, ...event.teamB.playerIds].filter(
    (id) => players[id],
  )
  const bestOnGround =
    allParticipantIds.length > 0 ? rng.pick(allParticipantIds) : undefined

  return {
    teamAScore: { goals: teamAGoals, behinds: teamABehinds, total: teamAGoals * 6 + teamABehinds },
    teamBScore: { goals: teamBGoals, behinds: teamBBehinds, total: teamBGoals * 6 + teamBBehinds },
    userClubParticipants,
    bestOnGround,
  }
}

/**
 * Apply optional player impact from a special event match.
 * Only runs when realism.specialEventPlayerImpact is true.
 * Effects are lighter than regular matches.
 */
export function applySpecialMatchImpact(
  event: SpecialEventInstance,
  players: Record<string, Player>,
  rng: SeededRNG,
  realism: RealismSettings,
): void {
  if (!realism.specialEventPlayerImpact) return
  if (!event.result) return

  const allPlayerIds = [...event.teamA.playerIds, ...event.teamB.playerIds]

  for (const pid of allPlayerIds) {
    const p = players[pid]
    if (!p) continue

    // Light fatigue: +3 to +8 (regular matches = 6-25)
    p.fatigue = Math.min(100, p.fatigue + rng.nextInt(3, 8))

    // Minor form change: -3 to +5
    p.form = Math.max(1, Math.min(100, p.form + rng.nextInt(-3, 5)))

    // Very low injury risk: 0.3% base chance
    if (rng.chance(0.003)) {
      const weeksOut = rng.nextInt(1, 2)
      const injury: PlayerInjury = {
        type: 'Minor soft tissue',
        weeksRemaining: weeksOut,
        initialWeeks: weeksOut,
        severity: 'minor',
        bodyRegion: 'soft-tissue',
      }
      p.injury = injury
    }
  }
}
