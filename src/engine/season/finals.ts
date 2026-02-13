import type { Round, Fixture, LadderEntry } from '@/types/season'
import type { Match } from '@/types/match'
import type { Club } from '@/types/club'

/**
 * AFL Finals Series Engine
 *
 * Implements the full AFL top-8 finals system:
 *
 * Week 1:
 *   QF1: 1st vs 4th   (winner -> PF1, loser -> SF1)
 *   EF1: 5th vs 8th   (winner -> SF1, loser eliminated)
 *   QF2: 2nd vs 3rd   (winner -> PF2, loser -> SF2)
 *   EF2: 6th vs 7th   (winner -> SF2, loser eliminated)
 *
 * Week 2:
 *   SF1: Loser QF1 vs Winner EF1   (winner -> PF1, loser eliminated)
 *   SF2: Loser QF2 vs Winner EF2   (winner -> PF2, loser eliminated)
 *
 * Week 3:
 *   PF1: Winner QF1 vs Winner SF1  (winner -> GF)
 *   PF2: Winner QF2 vs Winner SF2  (winner -> GF)
 *
 * Week 4:
 *   GF: Winner PF1 vs Winner PF2   (venue: MCG)
 */

const GRAND_FINAL_VENUE = 'MCG'

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Given a completed match, return the clubId of the winner.
 * In finals, draws are not expected — but if one occurs the home team
 * advances (mirrors the AFL rule where the higher-ranked team progresses).
 */
function getWinner(match: Match): string {
  if (!match.result) {
    throw new Error(`Match ${match.id} has no result — cannot determine winner`)
  }

  if (match.result.homeTotalScore >= match.result.awayTotalScore) {
    return match.homeClubId
  }
  return match.awayClubId
}

/**
 * Given a completed match, return the clubId of the loser.
 */
function getLoser(match: Match): string {
  if (!match.result) {
    throw new Error(`Match ${match.id} has no result — cannot determine loser`)
  }

  if (match.result.homeTotalScore >= match.result.awayTotalScore) {
    return match.awayClubId
  }
  return match.homeClubId
}

/**
 * Find a completed match by its finalType from a list of results.
 * When there are multiple matches of the same type (e.g. two QFs),
 * an optional index (0-based) selects which one.
 */
function findFinalMatch(
  results: Match[],
  finalType: 'QF' | 'EF' | 'SF' | 'PF' | 'GF',
  index: number = 0
): Match {
  const matches = results.filter((m) => m.isFinal && m.finalType === finalType)
  if (matches.length <= index) {
    throw new Error(
      `Expected at least ${index + 1} ${finalType} match(es) in results, found ${matches.length}`
    )
  }
  return matches[index]
}

/**
 * Determine the venue for a finals match.
 * The higher-ranked team (homeClubId) gets home ground advantage,
 * except in the Grand Final which is always at the MCG.
 */
function getFinalsVenue(
  homeClubId: string,
  clubs: Record<string, Club>,
  isGrandFinal: boolean
): string {
  if (isGrandFinal) {
    return GRAND_FINAL_VENUE
  }
  return clubs[homeClubId].homeGround
}

/**
 * Determine which of two clubs is higher-ranked on the ladder.
 * Returns [higherRanked, lowerRanked].
 * If neither club appears on the ladder (e.g. in later weeks where
 * the ladder isn't directly used), falls back to the order provided.
 */
function orderByLadderPosition(
  clubA: string,
  clubB: string,
  ladder: LadderEntry[]
): [string, string] {
  const posA = ladder.findIndex((e) => e.clubId === clubA)
  const posB = ladder.findIndex((e) => e.clubId === clubB)

  // Lower index = higher rank
  if (posA !== -1 && posB !== -1) {
    return posA < posB ? [clubA, clubB] : [clubB, clubA]
  }
  // Fallback: keep original order
  return [clubA, clubB]
}

/**
 * Create a Fixture with home ground advantage for the higher-ranked team.
 */
function createFinalsFixture(
  higherRankedClubId: string,
  lowerRankedClubId: string,
  clubs: Record<string, Club>,
  isGrandFinal: boolean
): Fixture {
  return {
    homeClubId: higherRankedClubId,
    awayClubId: lowerRankedClubId,
    venue: getFinalsVenue(higherRankedClubId, clubs, isGrandFinal),
  }
}

// ── Week generators ──────────────────────────────────────────────────────────

function generateWeek1(ladder: LadderEntry[], clubs: Record<string, Club>): Fixture[] {
  const top8 = ladder.slice(0, 8)

  if (top8.length < 8) {
    throw new Error(`Need at least 8 teams on the ladder for finals, found ${top8.length}`)
  }

  const first = top8[0].clubId
  const second = top8[1].clubId
  const third = top8[2].clubId
  const fourth = top8[3].clubId
  const fifth = top8[4].clubId
  const sixth = top8[5].clubId
  const seventh = top8[6].clubId
  const eighth = top8[7].clubId

  return [
    // QF1: 1st vs 4th
    createFinalsFixture(first, fourth, clubs, false),
    // EF1: 5th vs 8th
    createFinalsFixture(fifth, eighth, clubs, false),
    // QF2: 2nd vs 3rd
    createFinalsFixture(second, third, clubs, false),
    // EF2: 6th vs 7th
    createFinalsFixture(sixth, seventh, clubs, false),
  ]
}

function generateWeek2(
  previousResults: Match[],
  ladder: LadderEntry[],
  clubs: Record<string, Club>
): Fixture[] {
  const qf1 = findFinalMatch(previousResults, 'QF', 0)
  const ef1 = findFinalMatch(previousResults, 'EF', 0)
  const qf2 = findFinalMatch(previousResults, 'QF', 1)
  const ef2 = findFinalMatch(previousResults, 'EF', 1)

  // SF1: Loser QF1 vs Winner EF1
  const sf1TeamA = getLoser(qf1)
  const sf1TeamB = getWinner(ef1)
  const [sf1Home, sf1Away] = orderByLadderPosition(sf1TeamA, sf1TeamB, ladder)

  // SF2: Loser QF2 vs Winner EF2
  const sf2TeamA = getLoser(qf2)
  const sf2TeamB = getWinner(ef2)
  const [sf2Home, sf2Away] = orderByLadderPosition(sf2TeamA, sf2TeamB, ladder)

  return [
    createFinalsFixture(sf1Home, sf1Away, clubs, false),
    createFinalsFixture(sf2Home, sf2Away, clubs, false),
  ]
}

function generateWeek3(
  previousResults: Match[],
  ladder: LadderEntry[],
  clubs: Record<string, Club>
): Fixture[] {
  const qf1 = findFinalMatch(previousResults, 'QF', 0)
  const sf1 = findFinalMatch(previousResults, 'SF', 0)
  const qf2 = findFinalMatch(previousResults, 'QF', 1)
  const sf2 = findFinalMatch(previousResults, 'SF', 1)

  // PF1: Winner QF1 vs Winner SF1
  const pf1TeamA = getWinner(qf1)
  const pf1TeamB = getWinner(sf1)
  const [pf1Home, pf1Away] = orderByLadderPosition(pf1TeamA, pf1TeamB, ladder)

  // PF2: Winner QF2 vs Winner SF2
  const pf2TeamA = getWinner(qf2)
  const pf2TeamB = getWinner(sf2)
  const [pf2Home, pf2Away] = orderByLadderPosition(pf2TeamA, pf2TeamB, ladder)

  return [
    createFinalsFixture(pf1Home, pf1Away, clubs, false),
    createFinalsFixture(pf2Home, pf2Away, clubs, false),
  ]
}

function generateWeek4(
  previousResults: Match[],
  ladder: LadderEntry[],
  clubs: Record<string, Club>
): Fixture[] {
  const pf1 = findFinalMatch(previousResults, 'PF', 0)
  const pf2 = findFinalMatch(previousResults, 'PF', 1)

  // GF: Winner PF1 vs Winner PF2
  const gfTeamA = getWinner(pf1)
  const gfTeamB = getWinner(pf2)
  const [gfHome, gfAway] = orderByLadderPosition(gfTeamA, gfTeamB, ladder)

  return [createFinalsFixture(gfHome, gfAway, clubs, true)]
}

// ── Finals type assignment ───────────────────────────────────────────────────

/**
 * Map week number and fixture index to the appropriate finalType.
 */
function getFinalType(
  weekNumber: number,
  fixtureIndex: number
): 'QF' | 'EF' | 'SF' | 'PF' | 'GF' {
  if (weekNumber === 1) {
    // Order: QF1, EF1, QF2, EF2
    return fixtureIndex === 0 || fixtureIndex === 2 ? 'QF' : 'EF'
  }
  if (weekNumber === 2) return 'SF'
  if (weekNumber === 3) return 'PF'
  return 'GF'
}

// ── Exported API ─────────────────────────────────────────────────────────────

/**
 * Generate a finals round for the given week number.
 *
 * @param weekNumber    1-4, corresponding to finals weeks
 * @param ladder        The end-of-home-and-away-season ladder (sorted)
 * @param previousResults  All finals matches played in previous weeks
 * @param clubs         Club records keyed by club id
 * @returns A Round with isFinals: true
 */
export function generateFinalsRound(
  weekNumber: number,
  ladder: LadderEntry[],
  previousResults: Match[],
  clubs: Record<string, Club>
): Round {
  if (weekNumber < 1 || weekNumber > 4) {
    throw new Error(`Invalid finals week number: ${weekNumber}. Must be 1-4.`)
  }

  let fixtures: Fixture[]

  switch (weekNumber) {
    case 1:
      fixtures = generateWeek1(ladder, clubs)
      break
    case 2:
      fixtures = generateWeek2(previousResults, ladder, clubs)
      break
    case 3:
      fixtures = generateWeek3(previousResults, ladder, clubs)
      break
    case 4:
      fixtures = generateWeek4(previousResults, ladder, clubs)
      break
    default:
      throw new Error(`Unexpected week number: ${weekNumber}`)
  }

  return {
    number: weekNumber,
    name: getFinalsWeekName(weekNumber),
    fixtures,
    isBye: false,
    isFinals: true,
  }
}

/**
 * Get the display name for a finals week.
 */
export function getFinalsWeekName(weekNumber: number): string {
  switch (weekNumber) {
    case 1:
      return 'Finals Week 1'
    case 2:
      return 'Finals Week 2'
    case 3:
      return 'Finals Week 3'
    case 4:
      return 'Grand Final'
    default:
      return `Finals Week ${weekNumber}`
  }
}

/**
 * Check whether the season is complete (Grand Final has been played).
 */
export function isSeasonComplete(finalsResults: Match[]): boolean {
  return finalsResults.some(
    (m) => m.isFinal && m.finalType === 'GF' && m.result !== null
  )
}

/**
 * Get the clubId of the premier (Grand Final winner).
 * Returns null if the Grand Final has not yet been played.
 */
export function getPremier(finalsResults: Match[]): string | null {
  const grandFinal = finalsResults.find(
    (m) => m.isFinal && m.finalType === 'GF' && m.result !== null
  )

  if (!grandFinal) return null

  return getWinner(grandFinal)
}

/**
 * Get the finalType for a specific fixture within a finals round.
 * Useful when creating Match objects from generated fixtures.
 */
export function getFixtureFinalType(
  weekNumber: number,
  fixtureIndex: number
): 'QF' | 'EF' | 'SF' | 'PF' | 'GF' {
  return getFinalType(weekNumber, fixtureIndex)
}
