import type { AICoachProfile, CoachCareerEntry } from '@/types/coach'
import type { Club } from '@/types/club'
import type { LadderEntry } from '@/types/season'
import type { NewsItem } from '@/types/game'
import type { SeededRNG } from '@/engine/core/rng'
import { generateCoach } from './coachGenerator'

// ---------------------------------------------------------------------------
// Season record update
// ---------------------------------------------------------------------------

/**
 * Update the active career entry at season end.
 * Pure — returns updated coach.
 */
export function updateCoachCareerRecord(
  coach: AICoachProfile,
  ladderPosition: number,
  wins: number,
  losses: number,
  draws: number,
  premiershipsWon: number = 0,
): AICoachProfile {
  const history = [...coach.careerHistory]
  const activeIdx = history.findIndex((e) => e.departed === 'active')
  if (activeIdx === -1) return coach

  const active = history[activeIdx]
  history[activeIdx] = {
    ...active,
    wins: active.wins + wins,
    losses: active.losses + losses,
    draws: active.draws + draws,
    premiershipsWon: active.premiershipsWon + premiershipsWon,
    finalLadderPositions: [...active.finalLadderPositions, ladderPosition],
  }

  return { ...coach, careerHistory: history }
}

// ---------------------------------------------------------------------------
// Coach aging
// ---------------------------------------------------------------------------

/** Age all coaches by one year (cosmetic, for display). Pure. */
export function ageCoaches(
  coaches: Record<string, AICoachProfile>,
): Record<string, AICoachProfile> {
  const result: Record<string, AICoachProfile> = {}
  for (const [id, coach] of Object.entries(coaches)) {
    result[id] = { ...coach, age: coach.age + 1 }
  }
  return result
}

// ---------------------------------------------------------------------------
// Coaching carousel
// ---------------------------------------------------------------------------

/** Close the active career entry for a departing coach */
function closeCareerEntry(
  coach: AICoachProfile,
  reason: 'fired' | 'resigned',
  endYear: number,
): AICoachProfile {
  const history = coach.careerHistory.map((e) =>
    e.departed === 'active' ? { ...e, endYear, departed: reason } : e,
  ) as CoachCareerEntry[]
  return {
    ...coach,
    currentClubId: null,
    tenureStartYear: null,
    careerHistory: history,
  }
}

/** Determine if a coach should be sacked (bottom-4 for 2 consecutive seasons) */
function shouldSackCoach(coach: AICoachProfile): boolean {
  const active = coach.careerHistory.find((e) => e.departed === 'active')
  if (!active) return false
  const positions = active.finalLadderPositions
  if (positions.length < 2) return false
  const last2 = positions.slice(-2)
  return last2.every((p) => p >= 15)
}

/** Natural retirement check — 25% chance per offseason for coaches 63+ */
function shouldRetireNaturally(coach: AICoachProfile, rng: SeededRNG): boolean {
  return coach.age >= 63 && rng.chance(0.25)
}

/**
 * Resolve coaching carousel at end of offseason.
 * - Fires coaches whose clubs finished bottom-4 for 2 consecutive seasons (if enabled)
 * - Naturally retires coaches age 63+ (25% chance)
 * - Generates replacement coaches for vacated clubs
 *
 * Pure — returns updated maps + news items.
 */
export function resolveCoachingCarousel(
  clubs: Record<string, Club>,
  coaches: Record<string, AICoachProfile>,
  ladder: LadderEntry[],
  rng: SeededRNG,
  currentYear: number,
  playerClubId: string,
  coachingCarouselEnabled: boolean,
): {
  updatedCoaches: Record<string, AICoachProfile>
  updatedClubs: Record<string, Club>
  newNewsItems: NewsItem[]
} {
  const updatedCoaches: Record<string, AICoachProfile> = { ...coaches }
  const updatedClubs: Record<string, Club> = { ...clubs }
  const newNewsItems: NewsItem[] = []

  const ladderPositionByClub = new Map<string, number>()
  for (let i = 0; i < ladder.length; i++) {
    ladderPositionByClub.set(ladder[i].clubId, i + 1)
  }

  for (const [coachId, coach] of Object.entries(coaches)) {
    if (!coach.currentClubId) continue
    if (coach.currentClubId === playerClubId) continue // player's club handled separately

    const isFired = coachingCarouselEnabled && shouldSackCoach(coach)
    const isRetiring = shouldRetireNaturally(coach, rng)

    if (!isFired && !isRetiring) continue

    const clubId = coach.currentClubId
    const club = updatedClubs[clubId]
    if (!club) continue

    const reason: 'fired' | 'resigned' = isFired ? 'fired' : 'resigned'
    const closedCoach = closeCareerEntry(coach, reason, currentYear)
    updatedCoaches[coachId] = closedCoach

    // Generate replacement
    const newCoach = generateCoach(club, currentYear + 1, rng)
    updatedCoaches[newCoach.id] = newCoach
    updatedClubs[clubId] = { ...club, coachId: newCoach.id }

    const headline = isFired
      ? `${club.name} sack coach ${coach.firstName} ${coach.lastName}`
      : `${coach.firstName} ${coach.lastName} retires from ${club.name} coaching role`

    const body = isFired
      ? `${club.fullName} have parted ways with ${coach.firstName} ${coach.lastName} following consecutive bottom-four finishes. ${newCoach.firstName} ${newCoach.lastName} takes over immediately.`
      : `${coach.firstName} ${coach.lastName} has announced his retirement from coaching after ${(club.name)} tenure. ${newCoach.firstName} ${newCoach.lastName} steps into the role.`

    newNewsItems.push({
      id: crypto.randomUUID(),
      date: `${currentYear}-11-01`,
      headline,
      body,
      category: 'general',
      clubIds: [clubId],
      playerIds: [],
    })
  }

  return { updatedCoaches, updatedClubs, newNewsItems }
}
