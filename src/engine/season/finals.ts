import type { Round, Fixture, LadderEntry } from '@/types/season'
import type { Match } from '@/types/match'
import type { Club } from '@/types/club'
import type { FinalsSettings } from '@/types/game'
import type { FinalsFormat, TeamSource } from '@/types/finals'
import { getFinalsFormatById } from './finalsFormats'
import { GF_VENUES } from '@/engine/core/defaultSettings'

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
  return match.result.homeTotalScore >= match.result.awayTotalScore
    ? match.homeClubId
    : match.awayClubId
}

/**
 * Given a completed match, return the clubId of the loser.
 */
function getLoser(match: Match): string {
  if (!match.result) {
    throw new Error(`Match ${match.id} has no result — cannot determine loser`)
  }
  return match.result.homeTotalScore >= match.result.awayTotalScore
    ? match.awayClubId
    : match.homeClubId
}

/**
 * Determine which of two clubs is higher-ranked on the ladder.
 * Returns [higherRanked, lowerRanked].
 */
function orderByLadderPosition(
  clubA: string,
  clubB: string,
  ladder: LadderEntry[]
): [string, string] {
  const posA = ladder.findIndex((e) => e.clubId === clubA)
  const posB = ladder.findIndex((e) => e.clubId === clubB)

  if (posA !== -1 && posB !== -1) {
    return posA < posB ? [clubA, clubB] : [clubB, clubA]
  }
  return [clubA, clubB]
}

/**
 * Resolve the Grand Final venue based on the venue mode setting.
 *
 * - 'fixed': use the user-selected venue from settings
 * - 'random': pick a venue from the major venues list (deterministic per year)
 * - 'top-club': use the home ground of the higher-ranked finalist
 */
export function resolveGrandFinalVenue(
  finalsSettings: FinalsSettings | undefined,
  homeClubId: string,
  clubs: Record<string, Club>,
  year: number,
): string {
  const mode = finalsSettings?.grandFinalVenueMode ?? 'fixed'

  switch (mode) {
    case 'fixed':
      return finalsSettings?.grandFinalVenue ?? 'MCG'

    case 'random': {
      // Deterministic per year so the venue stays consistent within a season
      const idx = year % GF_VENUES.length
      return GF_VENUES[idx]
    }

    case 'top-club':
      return clubs[homeClubId]?.homeGround ?? 'MCG'

    default:
      return finalsSettings?.grandFinalVenue ?? 'MCG'
  }
}

/**
 * Get the venue for a finals match.
 */
function getFinalsVenue(
  homeClubId: string,
  clubs: Record<string, Club>,
  isGrandFinal: boolean,
  grandFinalVenue: string
): string {
  if (isGrandFinal) return grandFinalVenue
  return clubs[homeClubId]?.homeGround ?? 'MCG'
}

/**
 * Organize previous results by finals week number.
 * Returns a map: weekNumber -> array of matches in fixture order.
 */
function organizeByWeek(
  previousResults: Match[],
  finalsRoundsPlayed: Round[]
): Map<number, Match[]> {
  const weekMap = new Map<number, Match[]>()

  for (const round of finalsRoundsPlayed) {
    const weekMatches: Match[] = []
    for (const fixture of round.fixtures) {
      const match = previousResults.find(
        (m) =>
          m.isFinal &&
          m.homeClubId === fixture.homeClubId &&
          m.awayClubId === fixture.awayClubId &&
          m.result !== null
      )
      if (match) weekMatches.push(match)
    }
    weekMap.set(round.number, weekMatches)
  }

  return weekMap
}

/**
 * Resolve a TeamSource to a clubId.
 */
function resolveTeamSource(
  source: TeamSource,
  ladder: LadderEntry[],
  weekResults: Map<number, Match[]>
): string | null {
  if (source.type === 'ladder') {
    const rank = (source.rank ?? 1) - 1 // Convert 1-based to 0-based
    if (rank >= 0 && rank < ladder.length) {
      return ladder[rank].clubId
    }
    return null
  }

  // type === 'result'
  const weekNum = source.weekRef ?? 0
  const matchIdx = source.matchRef ?? 0
  const weekMatches = weekResults.get(weekNum) ?? []

  if (matchIdx >= weekMatches.length) return null

  const match = weekMatches[matchIdx]
  if (!match.result) return null

  return source.outcome === 'loser' ? getLoser(match) : getWinner(match)
}

// ── Round-Robin standings ──────────────────────────────────────────────────

/**
 * For round-robin format: after all RR weeks, re-rank the qualifying teams
 * by their win/loss record in the finals matches and return the updated ladder.
 */
function computeRoundRobinStandings(
  ladder: LadderEntry[],
  finalsMatches: Match[],
  qualifyingTeams: number
): LadderEntry[] {
  const qualifiers = ladder.slice(0, qualifyingTeams).map((e) => e.clubId)

  // Tally W/L for each qualifier in finals
  const wins = new Map<string, number>()
  const pointsFor = new Map<string, number>()
  for (const cid of qualifiers) {
    wins.set(cid, 0)
    pointsFor.set(cid, 0)
  }

  for (const m of finalsMatches) {
    if (!m.result || m.finalType === 'GF') continue
    const winner = getWinner(m)
    wins.set(winner, (wins.get(winner) ?? 0) + 1)
    pointsFor.set(m.homeClubId, (pointsFor.get(m.homeClubId) ?? 0) + m.result.homeTotalScore)
    pointsFor.set(m.awayClubId, (pointsFor.get(m.awayClubId) ?? 0) + m.result.awayTotalScore)
  }

  // Sort: most wins, then most points for, then original ladder position
  const ranked = [...qualifiers].sort((a, b) => {
    const wDiff = (wins.get(b) ?? 0) - (wins.get(a) ?? 0)
    if (wDiff !== 0) return wDiff
    const pDiff = (pointsFor.get(b) ?? 0) - (pointsFor.get(a) ?? 0)
    if (pDiff !== 0) return pDiff
    return qualifiers.indexOf(a) - qualifiers.indexOf(b)
  })

  // Build a new "ladder" with just the top qualifiers re-ranked
  return ranked.map((cid) => {
    const original = ladder.find((e) => e.clubId === cid)!
    return { ...original }
  })
}

// ── Exported API ─────────────────────────────────────────────────────────────

/**
 * Generate a finals round for the given week number using a data-driven format.
 *
 * @param weekNumber     1-based finals week
 * @param ladder         End-of-home-and-away ladder (sorted)
 * @param previousResults All finals matches played in previous weeks
 * @param clubs          Club records keyed by club id
 * @param format         The finals format to use (defaults to AFL Top 8)
 * @param finalsRoundsPlayed  Previous rounds (for fixture ordering)
 * @returns A Round with isFinals: true
 */
export function generateFinalsRound(
  weekNumber: number,
  ladder: LadderEntry[],
  previousResults: Match[],
  clubs: Record<string, Club>,
  format?: FinalsFormat,
  finalsRoundsPlayed?: Round[],
  finalsSettings?: FinalsSettings,
  year?: number,
): Round {
  const fmt = format ?? getFinalsFormatById('afl-top-8')

  const weekDef = fmt.weeks.find((w) => w.weekNumber === weekNumber)
  if (!weekDef) {
    throw new Error(`No week ${weekNumber} defined in finals format "${fmt.name}"`)
  }

  // Build results map organized by week
  const weekResults = organizeByWeek(previousResults, finalsRoundsPlayed ?? [])

  // For round-robin: if this is the GF week, re-rank based on RR standings
  let effectiveLadder = ladder
  if (fmt.id === 'round-robin' && weekDef.matchups.some((m) => m.finalType === 'GF')) {
    effectiveLadder = computeRoundRobinStandings(
      ladder,
      previousResults,
      fmt.qualifyingTeams
    )
  }

  const fixtures: Fixture[] = []

  for (const matchup of weekDef.matchups) {
    const homeClubId = resolveTeamSource(matchup.home, effectiveLadder, weekResults)
    const awayClubId = resolveTeamSource(matchup.away, effectiveLadder, weekResults)

    if (!homeClubId || !awayClubId) {
      continue // Skip if we can't resolve both teams
    }

    // Order by ladder position so higher-ranked team gets home advantage
    const [home, away] = orderByLadderPosition(homeClubId, awayClubId, ladder)
    const isGF = matchup.finalType === 'GF'

    const venue = isGF
      ? resolveGrandFinalVenue(finalsSettings, home, clubs, year ?? new Date().getFullYear())
      : getFinalsVenue(home, clubs, false, fmt.grandFinalVenue)

    fixtures.push({
      homeClubId: home,
      awayClubId: away,
      venue,
    })
  }

  return {
    number: weekNumber,
    name: weekDef.label,
    fixtures,
    isBye: false,
    byeClubIds: [],
    isFinals: true,
  }
}

/**
 * Get the display name for a finals week.
 */
export function getFinalsWeekName(weekNumber: number, format?: FinalsFormat): string {
  const fmt = format ?? getFinalsFormatById('afl-top-8')
  const weekDef = fmt.weeks.find((w) => w.weekNumber === weekNumber)
  return weekDef?.label ?? `Finals Week ${weekNumber}`
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
 * Uses the format definition to determine the type.
 */
export function getFixtureFinalType(
  weekNumber: number,
  fixtureIndex: number,
  format?: FinalsFormat
): 'QF' | 'EF' | 'SF' | 'PF' | 'GF' {
  const fmt = format ?? getFinalsFormatById('afl-top-8')
  const weekDef = fmt.weeks.find((w) => w.weekNumber === weekNumber)
  if (!weekDef || fixtureIndex >= weekDef.matchups.length) {
    return 'GF' // Fallback
  }
  return weekDef.matchups[fixtureIndex].finalType
}

/**
 * Get the total number of finals weeks for a given format.
 */
export function getFinalsWeekCount(format?: FinalsFormat): number {
  const fmt = format ?? getFinalsFormatById('afl-top-8')
  return fmt.weeks.length
}
