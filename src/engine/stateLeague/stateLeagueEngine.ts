import type {
  StateLeagueId,
  StateLeague,
  StateLeagueClub,
  StateLeagueMatchResult,
} from '@/types/stateLeague'
import type { LadderEntry } from '@/types/season'
import { SeededRNG } from '@/engine/core/rng'
import sanflClubsJson from '@/data/sanflClubs.json'
import waflClubsJson from '@/data/waflClubs.json'
import tflClubsJson from '@/data/tflClubs.json'
import ntflClubsJson from '@/data/ntflClubs.json'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AFLClubInfo {
  id: string
  name: string
  abbreviation: string
  colors: { primary: string; secondary: string }
  homeGround: string
}

interface StateClubJson {
  id: string
  name: string
  abbreviation: string
  colors: { primary: string; secondary: string }
  homeGround: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createLadderEntry(clubId: string): LadderEntry {
  return {
    clubId,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    percentage: 0,
  }
}

function makeReservesClub(afl: AFLClubInfo, leaguePrefix: string): StateLeagueClub {
  return {
    id: `${leaguePrefix}-${afl.id}`,
    name: `${afl.name} ${leaguePrefix.toUpperCase()}`,
    abbreviation: afl.abbreviation,
    colors: { primary: afl.colors.primary, secondary: afl.colors.secondary },
    homeGround: afl.homeGround,
    aflAffiliateId: afl.id,
    isAFLReserves: true,
  }
}

function standaloneClubFromJson(json: StateClubJson): StateLeagueClub {
  return {
    id: json.id,
    name: json.name,
    abbreviation: json.abbreviation,
    colors: { primary: json.colors.primary, secondary: json.colors.secondary },
    homeGround: json.homeGround,
    aflAffiliateId: null,
    isAFLReserves: false,
  }
}

function sortLadder(ladder: LadderEntry[]): void {
  ladder.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.percentage !== a.percentage) return b.percentage - a.percentage
    return b.pointsFor - a.pointsFor
  })
}

// ─── Fixture Generation ─────────────────────────────────────────────────────

/**
 * Round-robin fixture generation for a state league.
 * Uses the circle method to produce balanced home/away pairings.
 * Supports odd team counts (one bye per round).
 * Returns array of rounds, each being an array of fixtures.
 */
export function generateStateLeagueFixtures(
  clubIds: string[],
  rounds: number
): { homeClubId: string; awayClubId: string }[][] {
  const ids = [...clubIds]
  const isOdd = ids.length % 2 !== 0
  if (isOdd) ids.push('__BYE__')

  const n = ids.length
  const rrRounds = n - 1
  const half = n / 2

  const fixed = ids[0]
  const rotating = ids.slice(1)

  const allRounds: { homeClubId: string; awayClubId: string }[][] = []
  const rotationState = [...rotating]

  for (let r = 0; r < Math.min(rounds, rrRounds); r++) {
    const fixtures: { homeClubId: string; awayClubId: string }[] = []

    // First pair: fixed vs rotationState[0]
    const a = fixed
    const b = rotationState[0]
    const swapFirstPair = r % 2 === 1
    if (a !== '__BYE__' && b !== '__BYE__') {
      fixtures.push({
        homeClubId: swapFirstPair ? b : a,
        awayClubId: swapFirstPair ? a : b,
      })
    }

    // Remaining pairs: rotationState[i] vs rotationState[n-2-i]
    for (let i = 1; i < half; i++) {
      const home = rotationState[i]
      const away = rotationState[n - 2 - i]
      if (home !== '__BYE__' && away !== '__BYE__') {
        if (r % 2 === 0) {
          fixtures.push({ homeClubId: home, awayClubId: away })
        } else {
          fixtures.push({ homeClubId: away, awayClubId: home })
        }
      }
    }

    allRounds.push(fixtures)

    // Rotate: move last element to the front
    const last = rotationState.pop()!
    rotationState.splice(0, 0, last)
  }

  // If more rounds requested than one complete round-robin, repeat with flipped home/away
  if (rounds > rrRounds) {
    const secondHalf = rounds - rrRounds
    for (let r = 0; r < Math.min(secondHalf, rrRounds); r++) {
      const original = allRounds[r]
      const flipped = original.map((f) => ({
        homeClubId: f.awayClubId,
        awayClubId: f.homeClubId,
      }))
      allRounds.push(flipped)
    }
  }

  return allRounds.slice(0, rounds)
}

// ─── Match Simulation ───────────────────────────────────────────────────────

/**
 * Simulates one round of a state league season.
 * Uses a lightweight team-rating approach (random goals/behinds) rather
 * than possession-by-possession simulation.
 * Mutates the league's season.rounds and ladder in place.
 */
export function simStateLeagueRound(
  league: StateLeague,
  roundNumber: number,
  rng: SeededRNG
): void {
  // If no fixtures have been generated yet, generate them all up-front
  if (league.season.rounds.length === 0) {
    const clubIds = league.clubs.map((c) => c.id)
    const totalRounds = league.clubs.length <= 12 ? 18 : 22
    const allFixtures = generateStateLeagueFixtures(clubIds, totalRounds)

    for (let i = 0; i < allFixtures.length; i++) {
      league.season.rounds.push({
        number: i + 1,
        results: allFixtures[i].map((f) => ({
          homeClubId: f.homeClubId,
          awayClubId: f.awayClubId,
          homeScore: 0,
          awayScore: 0,
        })),
      })
    }
  }

  // Find the round to simulate
  const round = league.season.rounds.find((r) => r.number === roundNumber)
  if (!round) return

  // Simulate each match in the round
  for (const result of round.results) {
    if (result.homeScore > 0 || result.awayScore > 0) continue // Already simulated

    // Home team: 5-15 goals + slight home advantage (60% chance of +1 goal)
    const homeGoals = rng.nextInt(5, 15) + (rng.chance(0.6) ? 1 : 0)
    const homeBehinds = rng.nextInt(4, 10)
    const homeScore = homeGoals * 6 + homeBehinds

    // Away team: 5-15 goals, no bonus
    const awayGoals = rng.nextInt(5, 15)
    const awayBehinds = rng.nextInt(4, 10)
    const awayScore = awayGoals * 6 + awayBehinds

    result.homeScore = homeScore
    result.awayScore = awayScore
  }

  // Update ladder from this round's results
  updateLadderFromRound(league, round.results)
}

function updateLadderFromRound(
  league: StateLeague,
  results: StateLeagueMatchResult[]
): void {
  for (const result of results) {
    const homeEntry = league.ladder.find((e) => e.clubId === result.homeClubId)
    const awayEntry = league.ladder.find((e) => e.clubId === result.awayClubId)

    if (!homeEntry || !awayEntry) continue

    homeEntry.played++
    awayEntry.played++

    homeEntry.pointsFor += result.homeScore
    homeEntry.pointsAgainst += result.awayScore
    awayEntry.pointsFor += result.awayScore
    awayEntry.pointsAgainst += result.homeScore

    if (result.homeScore > result.awayScore) {
      homeEntry.wins++
      homeEntry.points += 4
      awayEntry.losses++
    } else if (result.awayScore > result.homeScore) {
      awayEntry.wins++
      awayEntry.points += 4
      homeEntry.losses++
    } else {
      homeEntry.draws++
      awayEntry.draws++
      homeEntry.points += 2
      awayEntry.points += 2
    }

    // Recalculate percentage
    homeEntry.percentage =
      homeEntry.pointsAgainst > 0
        ? (homeEntry.pointsFor / homeEntry.pointsAgainst) * 100
        : 0
    awayEntry.percentage =
      awayEntry.pointsAgainst > 0
        ? (awayEntry.pointsFor / awayEntry.pointsAgainst) * 100
        : 0
  }

  sortLadder(league.ladder)
}

// ─── Initialization ─────────────────────────────────────────────────────────

/**
 * Creates VFL, SANFL, and WAFL state leagues.
 *
 * - VFL: All 18 AFL clubs have VFL-aligned reserves teams.
 * - SANFL: 8 standalone clubs + Adelaide Crows reserves + Port Adelaide reserves = 10 teams.
 * - WAFL: 9 standalone clubs + West Coast reserves + Fremantle reserves = 11 teams.
 *
 * Returns a record keyed by StateLeagueId.
 */
export function initializeStateLeagues(
  aflClubs: Record<string, AFLClubInfo>,
  year: number,
  seed: number
): Record<StateLeagueId, StateLeague> {
  // Seed is available for future use (e.g. shuffling fixture order)
  void seed

  // ── VFL ──────────────────────────────────────────────────────────────────
  const vflClubs: StateLeagueClub[] = Object.values(aflClubs).map((afl) =>
    makeReservesClub(afl, 'vfl')
  )

  const vfl: StateLeague = {
    id: 'vfl',
    name: 'VFL',
    clubs: vflClubs,
    season: { year, rounds: [] },
    ladder: vflClubs.map((c) => createLadderEntry(c.id)),
  }

  // ── SANFL ────────────────────────────────────────────────────────────────
  const sanflStandalone: StateLeagueClub[] = (sanflClubsJson as StateClubJson[]).map(
    standaloneClubFromJson
  )

  const adelaideCrows = aflClubs['adelaide']
  const portAdelaide = aflClubs['portadelaide']

  const sanflReserves: StateLeagueClub[] = []
  if (adelaideCrows) {
    sanflReserves.push(makeReservesClub(adelaideCrows, 'sanfl'))
  }
  if (portAdelaide) {
    sanflReserves.push(makeReservesClub(portAdelaide, 'sanfl'))
  }

  const sanflClubs = [...sanflStandalone, ...sanflReserves]

  const sanfl: StateLeague = {
    id: 'sanfl',
    name: 'SANFL',
    clubs: sanflClubs,
    season: { year, rounds: [] },
    ladder: sanflClubs.map((c) => createLadderEntry(c.id)),
  }

  // ── WAFL ─────────────────────────────────────────────────────────────────
  const waflStandalone: StateLeagueClub[] = (waflClubsJson as StateClubJson[]).map(
    standaloneClubFromJson
  )

  const westCoast = aflClubs['westcoast']
  const fremantle = aflClubs['fremantle']

  const waflReserves: StateLeagueClub[] = []
  if (westCoast) {
    waflReserves.push(makeReservesClub(westCoast, 'wafl'))
  }
  if (fremantle) {
    waflReserves.push(makeReservesClub(fremantle, 'wafl'))
  }

  const waflAllClubs = [...waflStandalone, ...waflReserves]

  const wafl: StateLeague = {
    id: 'wafl',
    name: 'WAFL',
    clubs: waflAllClubs,
    season: { year, rounds: [] },
    ladder: waflAllClubs.map((c) => createLadderEntry(c.id)),
  }

  // ── TFL (Tasmania) ──────────────────────────────────────────────────────
  const tflStandalone: StateLeagueClub[] = (tflClubsJson as StateClubJson[]).map(
    standaloneClubFromJson
  )

  const tfl: StateLeague = {
    id: 'tfl',
    name: 'TFL',
    clubs: tflStandalone,
    season: { year, rounds: [] },
    ladder: tflStandalone.map((c) => createLadderEntry(c.id)),
  }

  // ── NTFL (Northern Territory) ─────────────────────────────────────────
  const ntflStandalone: StateLeagueClub[] = (ntflClubsJson as StateClubJson[]).map(
    standaloneClubFromJson
  )

  const ntfl: StateLeague = {
    id: 'ntfl',
    name: 'NTFL',
    clubs: ntflStandalone,
    season: { year, rounds: [] },
    ladder: ntflStandalone.map((c) => createLadderEntry(c.id)),
  }

  return { vfl, sanfl, wafl, tfl, ntfl }
}
