import type { Round, Fixture, Season, LadderEntry, MatchDay } from '@/types/season'
import type { Club } from '@/types/club'
import type { GameSettings, MatchTimeSlot, BlockbusterMatch } from '@/types/game'
import { SeededRNG } from '@/engine/core/rng'
import { REGULAR_SEASON_ROUNDS } from '@/engine/core/constants'
import { BLOCKBUSTER_AUTO_ROUNDS, DEFAULT_RIVALRY_PAIRS } from '@/engine/core/defaultSettings'
import { validateFixture } from './fixtureValidator'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FixtureGeneratorOptions {
  clubs: Record<string, Club>
  seed: number
  playerClubId?: string
  settings?: GameSettings
}

/**
 * Generate a fixture for any number of teams.
 * Uses a round-robin circle method, then extra rounds for rivalry/repeat matches.
 * Supports bye rounds when enabled in settings.
 *
 * If `settings` is provided, uses settings-driven round count, time slots,
 * and applies blockbuster placement.
 */
export function generateFixture(options: FixtureGeneratorOptions): Season
/** @deprecated Use the options overload */
export function generateFixture(clubs: Record<string, Club>, seed: number, playerClubId?: string): Season
export function generateFixture(
  clubsOrOptions: Record<string, Club> | FixtureGeneratorOptions,
  seed?: number,
  playerClubId?: string,
): Season {
  // Handle both overloads
  let options: FixtureGeneratorOptions
  if ('clubs' in clubsOrOptions && 'seed' in clubsOrOptions && typeof (clubsOrOptions as FixtureGeneratorOptions).seed === 'number') {
    options = clubsOrOptions as FixtureGeneratorOptions
  } else {
    options = {
      clubs: clubsOrOptions as Record<string, Club>,
      seed: seed!,
      playerClubId,
    }
  }

  return generateFixtureWithRetry(options, 0)
}

/**
 * Internal: generate fixture with retry on validation failure.
 */
function generateFixtureWithRetry(options: FixtureGeneratorOptions, attempt: number): Season {
  const { clubs, seed: rngSeed, playerClubId: pClubId, settings } = options
  const rng = new SeededRNG(rngSeed + attempt)
  const clubIds = Object.keys(clubs)
  const numTeams = clubIds.length

  if (numTeams < 2) {
    throw new Error(`Need at least 2 clubs, got ${numTeams}`)
  }

  const targetRounds = settings?.seasonStructure.regularSeasonRounds ?? REGULAR_SEASON_ROUNDS
  const enabledSlots = settings
    ? settings.fixtureSchedule.matchSlots.filter((s) => s.enabled)
    : null

  // Handle 0-round case (exhibition/finals only)
  if (targetRounds === 0) {
    return { year: 2026, rounds: [], finalsRounds: [] }
  }

  // ---- Bye configuration ----
  const byesEnabled = settings?.seasonStructure.byeRounds ?? false
  const byeRoundCount = byesEnabled ? (settings?.seasonStructure.byeRoundCount ?? 3) : 0
  // Only use byes if we have even teams and enough rounds
  const useByes = byesEnabled && numTeams % 2 === 0 && byeRoundCount > 0 && targetRounds > byeRoundCount

  let byeGroups: string[][] = []
  let byeRoundIndices: number[] = []

  if (useByes) {
    byeGroups = computeByeGroups(clubIds, byeRoundCount, rng)
    byeRoundIndices = computeByeRoundIndices(targetRounds, byeRoundCount)
  }

  // ---- Phase 1: Determine how many full rounds (all teams play) we need ----
  const fullRoundCount = targetRounds - (useByes ? byeRoundCount : 0)

  // ---- Phase 2: Generate round-robin rounds (circle method) ----
  // For odd numbers, add a "BYE" placeholder to make it even
  const isOdd = numTeams % 2 !== 0
  const shuffled = rng.shuffle(clubIds)
  if (isOdd) shuffled.push('__BYE__')

  const effectiveTeams = shuffled.length
  const rrRounds = effectiveTeams - 1
  const halfPairs = effectiveTeams / 2

  const fullRounds: Round[] = []

  const fixed = shuffled[0]
  const rotating = shuffled.slice(1)

  for (let r = 0; r < Math.min(rrRounds, fullRoundCount); r++) {
    const fixtures: Fixture[] = []

    // First match: fixed team vs rotating[0]
    const homeAway = r % 2 === 0
    const opponentFirst = rotating[0]
    if (fixed !== '__BYE__' && opponentFirst !== '__BYE__') {
      fixtures.push({
        homeClubId: homeAway ? fixed : opponentFirst,
        awayClubId: homeAway ? opponentFirst : fixed,
        venue: homeAway ? clubs[fixed].homeGround : clubs[opponentFirst].homeGround,
      })
    }

    // Pair up the rest: rotating[i] vs rotating[n-1-i]
    for (let i = 1; i < halfPairs; i++) {
      const a = rotating[i]
      const b = rotating[effectiveTeams - 2 - i]
      if (a === '__BYE__' || b === '__BYE__') continue
      const aHome = rng.chance(0.5)
      fixtures.push({
        homeClubId: aHome ? a : b,
        awayClubId: aHome ? b : a,
        venue: aHome ? clubs[a].homeGround : clubs[b].homeGround,
      })
    }

    fullRounds.push({
      number: 0, // Will be renumbered after assembly
      name: '',
      fixtures,
      isBye: false,
      byeClubIds: [],
      isFinals: false,
    })

    // Rotate: move last to front
    rotating.unshift(rotating.pop()!)
  }

  // ---- Phase 3: Generate balanced repeat rounds ----
  if (fullRounds.length < fullRoundCount) {
    const useRivalries = settings?.leagueMode === 'real'
      && settings.realism?.fixtureRivalryScheduling !== false

    const repeatRounds = generateBalancedRepeatRounds(
      clubIds,
      fullRounds,
      fullRoundCount,
      clubs,
      rng,
      useRivalries ? DEFAULT_RIVALRY_PAIRS : undefined,
    )
    fullRounds.push(...repeatRounds)
  }

  // ---- Phase 4: Generate bye rounds and assemble final round list ----
  const allRounds: Round[] = []

  if (useByes) {
    let fullIdx = 0
    let byeGroupIdx = 0

    for (let r = 0; r < targetRounds; r++) {
      if (byeRoundIndices.includes(r) && byeGroupIdx < byeGroups.length) {
        // This is a bye round
        const byeClubIds = byeGroups[byeGroupIdx]
        byeGroupIdx++

        const playingClubs = clubIds.filter((id) => !byeClubIds.includes(id))
        const byeFixtures = generateByeRoundFixtures(playingClubs, fullRounds, clubs, rng)

        allRounds.push({
          number: r + 1,
          name: `Round ${r + 1}`,
          fixtures: byeFixtures,
          isBye: true,
          byeClubIds,
          isFinals: false,
        })
      } else {
        // Full round
        if (fullIdx < fullRounds.length) {
          const round = fullRounds[fullIdx]
          round.number = r + 1
          round.name = `Round ${r + 1}`
          allRounds.push(round)
          fullIdx++
        }
      }
    }
  } else {
    // No byes — just number the full rounds
    for (let i = 0; i < fullRounds.length; i++) {
      fullRounds[i].number = i + 1
      fullRounds[i].name = `Round ${i + 1}`
    }
    allRounds.push(...fullRounds)
  }

  // ---- Phase 5: Schedule match days ----
  for (let i = 0; i < allRounds.length; i++) {
    if (pClubId) {
      allRounds[i].fixtures = scheduleRoundDays(
        allRounds[i].fixtures,
        pClubId,
        rng,
        enabledSlots,
      )
    }
  }

  // ---- Phase 6: Apply blockbusters ----
  if (settings && settings.leagueMode === 'real' && settings.realism?.fixtureBlockbusterBias !== false) {
    applyBlockbusters(allRounds, settings.blockbusters, clubs, rng, enabledSlots, pClubId)
  }

  // ---- Phase 7: Apply AFL House interference ----
  if (settings && settings.leagueMode === 'real' && settings.realism?.aflHouseInterference === true) {
    applyAFLHouseScheduling(allRounds, clubs, rng)
  }

  // ---- Phase 8: Validate ----
  const errors = validateFixture(allRounds, clubIds)
  if (errors.length > 0 && attempt < 2) {
    return generateFixtureWithRetry(options, attempt + 1)
  }
  if (errors.length > 0) {
    console.warn('[FixtureGenerator] Validation errors after 3 attempts:', errors)
  }

  return {
    year: 2026,
    rounds: allRounds,
    finalsRounds: [],
  }
}

// ---------------------------------------------------------------------------
// Bye group computation
// ---------------------------------------------------------------------------

/**
 * Split teams into `byeRoundCount` groups for bye rounds.
 * Each group size must leave an even number of playing teams.
 */
function computeByeGroups(
  clubIds: string[],
  byeRoundCount: number,
  rng: SeededRNG,
): string[][] {
  const n = clubIds.length
  const shuffled = rng.shuffle([...clubIds])
  const baseSize = Math.floor(n / byeRoundCount)
  const remainder = n % byeRoundCount
  const groups: string[][] = []
  let idx = 0

  for (let g = 0; g < byeRoundCount; g++) {
    let size = baseSize + (g < remainder ? 1 : 0)
    // Ensure (n - size) is even so playing teams can all be paired
    if ((n - size) % 2 !== 0) {
      size += 1
    }
    if (idx + size > n) size = n - idx
    groups.push(shuffled.slice(idx, idx + size))
    idx += size
  }

  // Assign any remaining teams to the last group
  if (idx < n) {
    groups[groups.length - 1].push(...shuffled.slice(idx))
  }

  return groups
}

/**
 * Compute the round indices (0-based) where bye rounds should be placed.
 * Placed in the middle third of the season, evenly spaced.
 */
function computeByeRoundIndices(targetRounds: number, byeRoundCount: number): number[] {
  const spacing = Math.max(1, Math.floor(targetRounds / (byeRoundCount + 1)))
  const seasonMiddle = Math.floor(targetRounds / 2)
  const offset = Math.floor(byeRoundCount / 2) * spacing

  const indices: number[] = []
  for (let i = 0; i < byeRoundCount; i++) {
    let idx = seasonMiddle - offset + i * spacing
    // Clamp to valid range, avoiding first and last rounds
    idx = Math.max(1, Math.min(targetRounds - 2, idx))
    // Avoid duplicates
    while (indices.includes(idx)) idx++
    indices.push(idx)
  }

  return indices.sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------
// Balanced repeat rounds
// ---------------------------------------------------------------------------

/**
 * Generate balanced repeat rounds to fill up to `targetFullRounds`.
 * Pairs clubs to minimize the max meeting count.
 */
function generateBalancedRepeatRounds(
  clubIds: string[],
  existingRounds: Round[],
  targetFullRounds: number,
  clubs: Record<string, Club>,
  rng: SeededRNG,
  protectedPairs?: [string, string][],
): Round[] {
  const rounds: Round[] = []

  // Build meeting count map
  const meetingCounts = new Map<string, number>()
  for (const id of clubIds) {
    for (const other of clubIds) {
      if (id < other) meetingCounts.set(`${id}|${other}`, 0)
    }
  }

  // Count meetings from existing rounds
  for (const round of existingRounds) {
    for (const f of round.fixtures) {
      const key = f.homeClubId < f.awayClubId
        ? `${f.homeClubId}|${f.awayClubId}`
        : `${f.awayClubId}|${f.homeClubId}`
      meetingCounts.set(key, (meetingCounts.get(key) ?? 0) + 1)
    }
  }

  // Count total matches per club from existing rounds
  const totalMatches = new Map<string, number>()
  for (const id of clubIds) totalMatches.set(id, 0)
  for (const round of existingRounds) {
    for (const f of round.fixtures) {
      totalMatches.set(f.homeClubId, (totalMatches.get(f.homeClubId) ?? 0) + 1)
      totalMatches.set(f.awayClubId, (totalMatches.get(f.awayClubId) ?? 0) + 1)
    }
  }

  // Pre-compute forced rivalry pairs per repeat round
  const repeatCount = targetFullRounds - existingRounds.length
  const forcedPerRound: [string, string][][] = Array.from({ length: repeatCount }, () => [])

  if (protectedPairs && protectedPairs.length > 0) {
    // Filter to pairs where both clubs exist and have met exactly once
    const pendingRivals = protectedPairs.filter(([a, b]) => {
      if (!clubIds.includes(a) || !clubIds.includes(b)) return false
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      return (meetingCounts.get(key) ?? 0) === 1
    })

    // Distribute across repeat rounds
    pendingRivals.forEach((pair, i) => {
      forcedPerRound[i % repeatCount].push(pair)
    })
  }

  for (let r = 0; r < repeatCount; r++) {
    const fixtures: Fixture[] = []
    const used = new Set<string>()

    // Force-assign rivalry fixtures for this round
    for (const [a, b] of forcedPerRound[r]) {
      if (used.has(a) || used.has(b)) continue

      used.add(a)
      used.add(b)

      const aHome = rng.chance(0.5)
      const home = aHome ? a : b
      const away = aHome ? b : a

      fixtures.push({
        homeClubId: home,
        awayClubId: away,
        venue: clubs[home].homeGround,
      })

      // Update counts
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      meetingCounts.set(key, (meetingCounts.get(key) ?? 0) + 1)
      totalMatches.set(a, (totalMatches.get(a) ?? 0) + 1)
      totalMatches.set(b, (totalMatches.get(b) ?? 0) + 1)
    }

    // Greedy pairing for remaining teams
    const available = rng.shuffle(clubIds.filter((id) => !used.has(id)))

    // Sort available by total matches (ascending) to balance match counts
    available.sort((a, b) => (totalMatches.get(a) ?? 0) - (totalMatches.get(b) ?? 0))

    while (available.length >= 2) {
      const a = available.shift()!
      if (used.has(a)) continue

      // Find the best opponent: fewest meetings, then fewest total matches
      let bestOpponent: string | null = null
      let bestMeetings = Infinity
      let bestTotal = Infinity
      let bestIdx = -1

      for (let i = 0; i < available.length; i++) {
        const b = available[i]
        if (used.has(b)) continue

        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        const meetings = meetingCounts.get(key) ?? 0
        const bTotal = totalMatches.get(b) ?? 0

        if (meetings < bestMeetings || (meetings === bestMeetings && bTotal < bestTotal)) {
          bestMeetings = meetings
          bestTotal = bTotal
          bestOpponent = b
          bestIdx = i
        }
      }

      if (bestOpponent && bestIdx >= 0) {
        available.splice(bestIdx, 1)
        used.add(a)
        used.add(bestOpponent)

        const aHome = rng.chance(0.5)
        const home = aHome ? a : bestOpponent
        const away = aHome ? bestOpponent : a

        fixtures.push({
          homeClubId: home,
          awayClubId: away,
          venue: clubs[home].homeGround,
        })

        // Update counts
        const key = a < bestOpponent ? `${a}|${bestOpponent}` : `${bestOpponent}|${a}`
        meetingCounts.set(key, (meetingCounts.get(key) ?? 0) + 1)
        totalMatches.set(a, (totalMatches.get(a) ?? 0) + 1)
        totalMatches.set(bestOpponent, (totalMatches.get(bestOpponent) ?? 0) + 1)
      } else {
        break
      }
    }

    rounds.push({
      number: 0,
      name: '',
      fixtures,
      isBye: false,
      byeClubIds: [],
      isFinals: false,
    })
  }

  return rounds
}

// ---------------------------------------------------------------------------
// Bye round fixture generation
// ---------------------------------------------------------------------------

/**
 * Generate fixtures for a bye round where only `playingClubs` participate.
 * Uses balanced greedy pairing.
 */
function generateByeRoundFixtures(
  playingClubs: string[],
  existingRounds: Round[],
  clubs: Record<string, Club>,
  rng: SeededRNG,
): Fixture[] {
  const fixtures: Fixture[] = []
  const available = rng.shuffle([...playingClubs])

  // Build meeting counts for the playing clubs
  const meetingCounts = new Map<string, number>()
  for (const round of existingRounds) {
    for (const f of round.fixtures) {
      const key = f.homeClubId < f.awayClubId
        ? `${f.homeClubId}|${f.awayClubId}`
        : `${f.awayClubId}|${f.homeClubId}`
      meetingCounts.set(key, (meetingCounts.get(key) ?? 0) + 1)
    }
  }

  const used = new Set<string>()

  while (available.length >= 2) {
    const a = available.shift()!
    if (used.has(a)) continue

    let bestOpponent: string | null = null
    let bestMeetings = Infinity
    let bestIdx = -1

    for (let i = 0; i < available.length; i++) {
      const b = available[i]
      if (used.has(b)) continue

      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      const meetings = meetingCounts.get(key) ?? 0

      if (meetings < bestMeetings) {
        bestMeetings = meetings
        bestOpponent = b
        bestIdx = i
      }
    }

    if (bestOpponent && bestIdx >= 0) {
      available.splice(bestIdx, 1)
      used.add(a)
      used.add(bestOpponent)

      const aHome = rng.chance(0.5)
      const home = aHome ? a : bestOpponent
      const away = aHome ? bestOpponent : a

      fixtures.push({
        homeClubId: home,
        awayClubId: away,
        venue: clubs[home].homeGround,
      })
    } else {
      break
    }
  }

  return fixtures
}

// ---------------------------------------------------------------------------
// AFL House interference
// ---------------------------------------------------------------------------

/**
 * Post-process rounds to give big clubs more prime-time slots.
 * Swaps match day/time between big-club and non-big-club fixtures
 * with ~70% probability.
 */
function applyAFLHouseScheduling(
  rounds: Round[],
  clubs: Record<string, Club>,
  rng: SeededRNG,
): void {
  const bigClubIds = new Set(
    Object.values(clubs)
      .filter((c) => c.tier === 'large')
      .map((c) => c.id),
  )

  const primeSlots = new Set<MatchDay>(['Friday', 'Saturday-Night'])

  for (const round of rounds) {
    if (round.isFinals) continue

    // Find big-club fixtures NOT in prime time, and non-big fixtures IN prime time
    const bigNonPrime: number[] = []
    const nonBigPrime: number[] = []

    for (let i = 0; i < round.fixtures.length; i++) {
      const f = round.fixtures[i]
      if (f.isBlockbuster) continue // Don't touch blockbusters

      const isBigClub = bigClubIds.has(f.homeClubId) || bigClubIds.has(f.awayClubId)
      const isPrime = f.matchDay ? primeSlots.has(f.matchDay) : false

      if (isBigClub && !isPrime) bigNonPrime.push(i)
      if (!isBigClub && isPrime) nonBigPrime.push(i)
    }

    // Swap with ~70% probability per potential swap
    const swapCount = Math.min(bigNonPrime.length, nonBigPrime.length)
    for (let s = 0; s < swapCount; s++) {
      if (!rng.chance(0.7)) continue

      const bigIdx = bigNonPrime[s]
      const nonBigIdx = nonBigPrime[s]
      const bigF = round.fixtures[bigIdx]
      const nonBigF = round.fixtures[nonBigIdx]

      // Swap matchDay and scheduledTime
      const tmpDay = bigF.matchDay
      const tmpTime = bigF.scheduledTime
      bigF.matchDay = nonBigF.matchDay
      bigF.scheduledTime = nonBigF.scheduledTime
      nonBigF.matchDay = tmpDay
      nonBigF.scheduledTime = tmpTime

      // Mutate in place
      round.fixtures[bigIdx] = { ...bigF }
      round.fixtures[nonBigIdx] = { ...nonBigF }
    }
  }
}

// ---------------------------------------------------------------------------
// Blockbuster placement
// ---------------------------------------------------------------------------

/**
 * Post-process the fixture to place blockbuster matches in their target rounds.
 *
 * Algorithm per blockbuster:
 * 1. If exact matchup already exists in target round → replace in-place
 * 2. Find matchup in any OTHER round (skip target in search)
 * 3. Remove matchup from source round (source: −1)
 * 4. Displace all fixtures involving either BB club from target → move to source
 *    (displaced count N: 0, 1, or 2)
 *    source: −1 + N, target: −N
 * 5. Balance:
 *    N=0 → move 1 safe fixture from target → source (both balanced)
 *    N=1 → already balanced
 *    N=2 → move 1 safe fixture from source → target
 * 6. Insert blockbuster in target (+1)
 * 7. Re-schedule source round time slots
 */
function applyBlockbusters(
  rounds: Round[],
  blockbusters: BlockbusterMatch[],
  clubs: Record<string, Club>,
  rng: SeededRNG,
  enabledSlots: MatchTimeSlot[] | null,
  playerClubId?: string,
): void {
  const clubIds = new Set(Object.keys(clubs))

  /** Check if a fixture involves either blockbuster club */
  const involvesBBClub = (f: Fixture, homeId: string, awayId: string) =>
    f.homeClubId === homeId || f.awayClubId === homeId ||
    f.homeClubId === awayId || f.awayClubId === awayId

  /** Check if a fixture is the exact BB matchup (either direction) */
  const isMatchup = (f: Fixture, homeId: string, awayId: string) =>
    (f.homeClubId === homeId && f.awayClubId === awayId) ||
    (f.homeClubId === awayId && f.awayClubId === homeId)

  for (const bb of blockbusters) {
    if (!bb.enabled) continue
    if (!clubIds.has(bb.homeClubId) || !clubIds.has(bb.awayClubId)) continue

    // Determine target round (1-based)
    let targetRound: number
    if (bb.targetRound === 'auto') {
      targetRound = BLOCKBUSTER_AUTO_ROUNDS[bb.id] ?? 1
    } else {
      targetRound = bb.targetRound
    }

    // Clamp to valid round range
    targetRound = Math.max(1, Math.min(targetRound, rounds.length))
    const targetIdx = targetRound - 1

    // Step 1: If exact matchup already in target round → replace in-place
    const existingInTargetIdx = rounds[targetIdx].fixtures.findIndex(
      (f) => isMatchup(f, bb.homeClubId, bb.awayClubId),
    )
    if (existingInTargetIdx !== -1) {
      rounds[targetIdx].fixtures[existingInTargetIdx] = {
        homeClubId: bb.homeClubId,
        awayClubId: bb.awayClubId,
        venue: bb.venue,
        matchDay: bb.scheduledDay,
        scheduledTime: bb.scheduledTime,
        isBlockbuster: true,
        blockbusterName: bb.name,
      }
      continue
    }

    // Step 2: Find matchup in any OTHER round (skip target)
    let sourceRoundIdx = -1
    let sourceFixtureIdx = -1

    for (let ri = 0; ri < rounds.length; ri++) {
      if (ri === targetIdx) continue // skip target round
      const fi = rounds[ri].fixtures.findIndex(
        (f) => isMatchup(f, bb.homeClubId, bb.awayClubId),
      )
      if (fi !== -1) {
        sourceRoundIdx = ri
        sourceFixtureIdx = fi
        break
      }
    }

    if (sourceRoundIdx === -1) continue // Matchup doesn't exist anywhere

    // Step 3: Remove matchup from source round (source: −1)
    rounds[sourceRoundIdx].fixtures.splice(sourceFixtureIdx, 1)

    // Step 4: Displace all fixtures involving either BB club from target → source
    const displaced: Fixture[] = []
    for (let i = rounds[targetIdx].fixtures.length - 1; i >= 0; i--) {
      if (involvesBBClub(rounds[targetIdx].fixtures[i], bb.homeClubId, bb.awayClubId)) {
        displaced.push(...rounds[targetIdx].fixtures.splice(i, 1))
      }
    }
    // Move displaced fixtures to source round
    rounds[sourceRoundIdx].fixtures.push(...displaced)
    // source is now: −1 + N displaced, target is now: −N displaced

    // Step 5: Balance based on displaced count
    const N = displaced.length
    if (N === 0) {
      // Move 1 safe fixture from target → source
      const safeIdx = rounds[targetIdx].fixtures.findIndex(
        (f) => !f.isBlockbuster && !involvesBBClub(f, bb.homeClubId, bb.awayClubId),
      )
      if (safeIdx !== -1) {
        const [moved] = rounds[targetIdx].fixtures.splice(safeIdx, 1)
        rounds[sourceRoundIdx].fixtures.push(moved)
      }
    } else if (N === 2) {
      // Move 1 safe fixture from source → target
      const safeIdx = rounds[sourceRoundIdx].fixtures.findIndex(
        (f) => !f.isBlockbuster && !involvesBBClub(f, bb.homeClubId, bb.awayClubId),
      )
      if (safeIdx !== -1) {
        const [moved] = rounds[sourceRoundIdx].fixtures.splice(safeIdx, 1)
        rounds[targetIdx].fixtures.push(moved)
      }
    }
    // N === 1: already balanced

    // Step 6: Insert blockbuster in target (+1)
    rounds[targetIdx].fixtures.push({
      homeClubId: bb.homeClubId,
      awayClubId: bb.awayClubId,
      venue: bb.venue,
      matchDay: bb.scheduledDay,
      scheduledTime: bb.scheduledTime,
      isBlockbuster: true,
      blockbusterName: bb.name,
    })

    // Step 7: Re-schedule the source round's time slots
    if (playerClubId) {
      rounds[sourceRoundIdx].fixtures = scheduleRoundDays(
        rounds[sourceRoundIdx].fixtures,
        playerClubId,
        rng,
        enabledSlots,
      )
    }
  }

  // Post-loop safety: remove self-play and duplicate appearances per round
  for (const round of rounds) {
    const seen = new Set<string>()
    for (let i = round.fixtures.length - 1; i >= 0; i--) {
      const f = round.fixtures[i]
      // Remove self-play
      if (f.homeClubId === f.awayClubId) {
        console.warn(`[applyBlockbusters] Removed self-play: ${f.homeClubId} in round ${round.number}`)
        round.fixtures.splice(i, 1)
        continue
      }
      // Remove duplicate appearances
      if (seen.has(f.homeClubId) || seen.has(f.awayClubId)) {
        console.warn(`[applyBlockbusters] Removed duplicate: ${f.homeClubId} v ${f.awayClubId} in round ${round.number}`)
        round.fixtures.splice(i, 1)
        continue
      }
      seen.add(f.homeClubId)
      seen.add(f.awayClubId)
    }
  }
}

// ---------------------------------------------------------------------------
// Match day scheduling
// ---------------------------------------------------------------------------

/** Default match slots (used when no settings provided) */
const MATCH_SLOTS: { day: MatchDay; time: string }[] = [
  { day: 'Thursday', time: '7:20pm' },
  { day: 'Friday', time: '7:50pm' },
  { day: 'Saturday-Early', time: '1:45pm' },
  { day: 'Saturday-Twilight', time: '4:35pm' },
  { day: 'Saturday-Night', time: '7:25pm' },
  { day: 'Sunday-Early', time: '1:10pm' },
  { day: 'Sunday-Twilight', time: '3:20pm' },
  { day: 'Sunday-Twilight', time: '4:40pm' },
  { day: 'Monday', time: '3:20pm' },
]

/**
 * Distribute fixtures across a weekend schedule (Thurs-Mon).
 * The user's club gets the preferred time slot.
 *
 * Accepts optional enabled slots and preferred slot ID from settings.
 */
export function scheduleRoundDays(
  fixtures: Fixture[],
  playerClubId: string,
  rng: SeededRNG,
  enabledSlots?: MatchTimeSlot[] | null,
): Fixture[] {
  if (fixtures.length === 0) return fixtures

  // Separate blockbuster fixtures (already have their slot) from regular ones
  const blockbusters: Fixture[] = []
  const regulars: Fixture[] = []
  for (const f of fixtures) {
    if (f.isBlockbuster && f.matchDay && f.scheduledTime) {
      blockbusters.push(f)
    } else {
      regulars.push(f)
    }
  }

  if (regulars.length === 0) return fixtures

  // Build slot list from settings or default
  let slots: { day: MatchDay; time: string }[]
  if (enabledSlots && enabledSlots.length > 0) {
    slots = enabledSlots.map((s) => ({ day: s.day, time: s.time }))
  } else {
    slots = [...MATCH_SLOTS]
  }

  // Find the user's fixture
  const userIdx = regulars.findIndex(
    (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  )

  const count = regulars.length

  // For small rounds (bye weeks), use a subset of slots
  let activeSlots: { day: MatchDay; time: string }[]
  if (count <= 4 && slots.length > 4) {
    activeSlots = [
      slots.find((s) => s.day === 'Friday') ?? slots[0],
      slots.find((s) => s.day === 'Saturday-Twilight') ?? slots[1],
      slots.find((s) => s.day === 'Saturday-Night') ?? slots[2],
      slots.find((s) => s.day === 'Sunday-Early') ?? slots[3],
    ]
  } else {
    activeSlots = slots
  }

  // User's preferred slot: Saturday Twilight
  let preferredIdx = activeSlots.findIndex((s) => s.day === 'Saturday-Twilight')
  if (preferredIdx === -1) preferredIdx = Math.min(3, activeSlots.length - 1)

  // Shuffle slot assignment for non-user fixtures
  const slotOrder = rng.shuffle([...Array(Math.min(count, activeSlots.length)).keys()])

  const scheduled = [...regulars]
  for (let i = 0; i < scheduled.length; i++) {
    const slotIdx =
      i === userIdx
        ? preferredIdx
        : slotOrder[i] < activeSlots.length
          ? slotOrder[i]
          : i % activeSlots.length
    const slot = activeSlots[slotIdx] ?? activeSlots[i % activeSlots.length]
    scheduled[i] = {
      ...scheduled[i],
      matchDay: slot.day,
      scheduledTime: slot.time,
    }
  }

  // Combine all fixtures and sort by match day order
  const DAY_ORDER: Record<string, number> = {
    Thursday: 0,
    Friday: 1,
    'Saturday-Early': 2,
    'Saturday-Twilight': 3,
    'Saturday-Night': 4,
    'Sunday-Early': 5,
    'Sunday-Twilight': 6,
    Monday: 7,
  }
  const combined = [...scheduled, ...blockbusters]
  combined.sort((a, b) => {
    const aOrder = a.matchDay ? (DAY_ORDER[a.matchDay] ?? 99) : 99
    const bOrder = b.matchDay ? (DAY_ORDER[b.matchDay] ?? 99) : 99
    return aOrder - bOrder
  })
  return combined
}

// ---------------------------------------------------------------------------
// Ladder initializer
// ---------------------------------------------------------------------------

export function createInitialLadder(clubIds: string[]): LadderEntry[] {
  return clubIds.map((clubId) => ({
    clubId,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    percentage: 0,
  }))
}
