import type { Round } from '@/types/season'

// ---------------------------------------------------------------------------
// Fixture Validation
// ---------------------------------------------------------------------------

export interface FixtureValidationError {
  type: 'self-play' | 'duplicate-in-round' | 'bye-conflict' | 'match-imbalance' | 'missing-venue'
  round?: number
  message: string
}

/**
 * Validate a generated fixture for correctness.
 * Returns an empty array if the fixture is valid.
 */
export function validateFixture(
  rounds: Round[],
  clubIds: string[],
): FixtureValidationError[] {
  const errors: FixtureValidationError[] = []

  const matchCounts = new Map<string, number>()
  for (const id of clubIds) {
    matchCounts.set(id, 0)
  }

  for (const round of rounds) {
    if (round.isFinals) continue

    const seenInRound = new Set<string>()
    const byeSet = new Set(round.byeClubIds ?? [])

    for (const fixture of round.fixtures) {
      // Check 1: No club plays itself
      if (fixture.homeClubId === fixture.awayClubId) {
        errors.push({
          type: 'self-play',
          round: round.number,
          message: `Round ${round.number}: ${fixture.homeClubId} plays itself`,
        })
      }

      // Check 2: No club appears twice in the same round
      if (seenInRound.has(fixture.homeClubId)) {
        errors.push({
          type: 'duplicate-in-round',
          round: round.number,
          message: `Round ${round.number}: ${fixture.homeClubId} appears more than once`,
        })
      }
      if (seenInRound.has(fixture.awayClubId)) {
        errors.push({
          type: 'duplicate-in-round',
          round: round.number,
          message: `Round ${round.number}: ${fixture.awayClubId} appears more than once`,
        })
      }
      seenInRound.add(fixture.homeClubId)
      seenInRound.add(fixture.awayClubId)

      // Check 3: Bye clubs don't appear in their bye round's fixtures
      if (byeSet.has(fixture.homeClubId)) {
        errors.push({
          type: 'bye-conflict',
          round: round.number,
          message: `Round ${round.number}: ${fixture.homeClubId} is on bye but has a fixture`,
        })
      }
      if (byeSet.has(fixture.awayClubId)) {
        errors.push({
          type: 'bye-conflict',
          round: round.number,
          message: `Round ${round.number}: ${fixture.awayClubId} is on bye but has a fixture`,
        })
      }

      // Check 5: Every fixture has a non-empty venue
      if (!fixture.venue) {
        errors.push({
          type: 'missing-venue',
          round: round.number,
          message: `Round ${round.number}: ${fixture.homeClubId} vs ${fixture.awayClubId} has no venue`,
        })
      }

      // Accumulate match counts
      matchCounts.set(fixture.homeClubId, (matchCounts.get(fixture.homeClubId) ?? 0) + 1)
      matchCounts.set(fixture.awayClubId, (matchCounts.get(fixture.awayClubId) ?? 0) + 1)
    }
  }

  // Check 4: Match counts are balanced (max - min <= 1)
  const counts = Array.from(matchCounts.values())
  if (counts.length > 0) {
    const maxCount = Math.max(...counts)
    const minCount = Math.min(...counts)
    if (maxCount - minCount > 1) {
      const overPlayed = Array.from(matchCounts.entries()).filter(([, c]) => c === maxCount).map(([id]) => id)
      const underPlayed = Array.from(matchCounts.entries()).filter(([, c]) => c === minCount).map(([id]) => id)
      errors.push({
        type: 'match-imbalance',
        message: `Match count imbalance: max=${maxCount} (${overPlayed.slice(0, 3).join(', ')}), min=${minCount} (${underPlayed.slice(0, 3).join(', ')})`,
      })
    }
  }

  return errors
}
