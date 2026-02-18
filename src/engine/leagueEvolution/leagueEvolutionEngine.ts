/**
 * League Evolution Engine
 *
 * Evaluates league health at the end of each season and proposes
 * expansion, contraction, relocation, and/or merger events that AFL House
 * will apply at the start of the following season's supplemental-signing phase.
 *
 * Multiple events can fire in the same offseason. The player's own club
 * can be affected by any event type. There are no hard caps on club count
 * beyond a practical floor of 2 teams (need at least one fixture).
 */

import type { Club } from '@/types/club'
import type { LadderEntry } from '@/types/season'
import type { Player } from '@/types/player'
import type { GameSettings } from '@/types/game'
import type { SeededRNG } from '@/engine/core/rng'
import type {
  LeagueEvolutionEvent,
  LeagueEvolutionHistory,
  LeagueExpansionEvent,
  LeagueContractionEvent,
  LeagueRelocationEvent,
  LeagueMergerEvent,
} from '@/types/leagueEvolution'
import { EXPANSION_MARKETS } from '@/types/leagueEvolution'
import type { ClubFacilities, ClubFinances, ClubGameplan, TacticalIdentity } from '@/types/club'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute floor — need at least 2 clubs to run a competition. */
const MIN_CLUBS = 2
/** Fraction of clubs that must be profitable for expansion to be considered. */
const EXPANSION_HEALTH_THRESHOLD = 0.65
/** Loss threshold (negative balance) to flag a club as distressed. */
const DISTRESS_BALANCE_THRESHOLD = -5_000_000
/** AFL standard list size cap used when absorbing players in a merger. */
const AFL_LIST_SIZE = 44

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the ladder position (1-based) for a club in the given season. */
function getLadderPosition(clubId: string, ladder: LadderEntry[]): number {
  const idx = ladder.findIndex((e) => e.clubId === clubId)
  return idx === -1 ? ladder.length : idx + 1
}

/** How many clubs are loss-making (negative balance). */
function profitableClubCount(clubs: Record<string, Club>): number {
  return Object.values(clubs).filter((c) => c.finances.balance > 0).length
}

/** Average of all numeric player attributes — used to rank merger candidates. */
function getPlayerOverall(player: Player): number {
  const vals = Object.values(player.attributes) as number[]
  if (vals.length === 0) return 50
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

// ---------------------------------------------------------------------------
// Expansion candidate generation
// ---------------------------------------------------------------------------

/** Build a complete Club record for an expansion team. */
export function buildExpansionClub(
  marketId: string,
  currentYear: number,
): Club | null {
  const market = EXPANSION_MARKETS.find((m) => m.id === marketId)
  if (!market) return null

  const defaultFacilities: ClubFacilities = {
    trainingGround: 1,
    gym: 1,
    medicalCentre: 1,
    recoveryPool: 1,
    analysisSuite: 1,
    youthAcademy: 1,
  }

  const defaultFinances: ClubFinances = {
    salaryCap: 13_000_000,
    currentSpend: 0,
    revenue: 25_000_000,
    expenses: 28_000_000,
    balance: -3_000_000,  // New clubs run at a loss initially
  }

  const defaultGameplan: ClubGameplan = {
    offensiveStyle: 'balanced',
    tempo: 'medium',
    aggression: 'medium',
    kickInTactic: 'play-on-long',
    centreTactic: 'balanced',
    stoppageTactic: 'balanced',
    defensiveLine: 'hold',
    midfieldLine: 'run',
    forwardLine: 'run',
    ruckNomination: { primaryRuckId: null, backupRuckId: null, aroundTheGround: false },
    rotations: 'medium',
  }

  const tacticalIdentity: TacticalIdentity = 'fast-movement'

  return {
    id: market.id,
    name: market.name,
    fullName: market.fullName,
    abbreviation: market.abbreviation,
    mascot: market.mascot,
    homeGround: market.homeGround,
    established: currentYear + 1,
    premierships: 0,
    tier: market.tier,
    colors: {
      primary: market.primaryColor,
      secondary: market.secondaryColor,
    },
    facilities: defaultFacilities,
    finances: defaultFinances,
    draftPicks: [],
    gameplan: defaultGameplan,
    tacticalIdentity,
    leadership: { captainId: null, viceCaptainId: null, leadershipGroupIds: [] },
    aiPersonality: {
      competitiveWindow: 'rebuilding',
      draftPhilosophy: 'high-upside',
      riskTolerance: 'aggressive',
      tradeActivity: 'active',
    },
  }
}

// ---------------------------------------------------------------------------
// Event evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate league evolution events for the upcoming season.
 * All qualifying events fire — multiple can occur in one offseason.
 * The player's own club can be relocated (it's happened in real AFL history).
 * No hard caps on club count beyond the absolute floor of 2.
 */
export function evaluateLeagueEvolution(
  clubs: Record<string, Club>,
  ladder: LadderEntry[],
  players: Record<string, Player>,
  history: LeagueEvolutionHistory,
  currentYear: number,
  _playerClubId: string,
  rng: SeededRNG,
  settings: GameSettings,
): LeagueEvolutionEvent[] {
  if (!settings.realism.aflHouseExpansionEvolution) return []

  const events: LeagueEvolutionEvent[] = []
  const clubIds = Object.keys(clubs)
  const clubCount = clubIds.length
  const profitFraction = clubCount > 0 ? profitableClubCount(clubs) / clubCount : 0

  // Track clubs already scheduled for removal/merger this evaluation so we
  // don't apply multiple conflicting events to the same club.
  const contractingThisYear = new Set<string>()
  const mergingThisYear = new Set<string>()

  // -------------------------------------------------------------------------
  // 1. Expansion — fires when the league is financially healthy
  // -------------------------------------------------------------------------
  if (profitFraction >= EXPANSION_HEALTH_THRESHOLD) {
    const usedIds = new Set(clubIds)
    const usedHistoryIds = new Set(
      history.events
        .filter((e) => e.type === 'expansion')
        .map((e) => (e as LeagueExpansionEvent).newClubId),
    )
    const available = EXPANSION_MARKETS.filter(
      (m) => !usedIds.has(m.id) && !usedHistoryIds.has(m.id),
    )

    for (const market of available) {
      // Each available market has a 20% chance of being announced this year
      if (rng.chance(0.20)) {
        events.push({
          id: crypto.randomUUID(),
          type: 'expansion',
          year: currentYear,
          appliedYear: currentYear + 1,
          newClubId: market.id,
          newClubName: market.name,
          newClubFullName: market.fullName,
          city: market.city,
          description:
            `The AFL announces the ${market.fullName} as a new expansion club, ` +
            `joining the competition from ${currentYear + 1}. ` +
            `The club will be based in ${market.city}.`,
        })
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Contraction — financially distressed clubs in bad on-field shape
  // -------------------------------------------------------------------------
  if (clubCount > MIN_CLUBS) {
    const priorContractedIds = new Set(
      history.events
        .filter((e) => e.type === 'contraction')
        .map((e) => (e as LeagueContractionEvent).clubId),
    )

    for (const clubId of clubIds) {
      if (priorContractedIds.has(clubId)) continue

      const club = clubs[clubId]
      if (!club) continue

      const isDistressed = club.finances.balance < DISTRESS_BALANCE_THRESHOLD * 2
      const ladderPos = getLadderPosition(clubId, ladder)
      const isBottomPerformer = ladderPos > clubCount - 4

      if (isDistressed && isBottomPerformer) {
        const tierProbability = club.tier === 'small' ? 0.08 : club.tier === 'medium' ? 0.04 : 0.02
        if (rng.chance(tierProbability)) {
          const clubPlayers = Object.values(players).filter((p) => p.clubId === clubId)
          events.push({
            id: crypto.randomUUID(),
            type: 'contraction',
            year: currentYear,
            appliedYear: currentYear + 1,
            clubId,
            clubName: club.name,
            clubFullName: club.fullName,
            dispersedPlayerCount: clubPlayers.length,
            description:
              `The AFL announces the ${club.fullName} will be folded from ${currentYear + 1} ` +
              `following sustained financial losses and poor on-field performance. ` +
              `${clubPlayers.length} players will be dispersed into the pool.`,
          })
          contractingThisYear.add(clubId)
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2.5. Merger — two financially distressed clubs combine into one
  //
  // Real precedent: South Melbourne → Sydney Swans (1982), Fitzroy + Brisbane
  // Bears → Brisbane Lions (1997). AFL House brokers a merger when two clubs
  // are both struggling financially and performing poorly, and folding one
  // outright would be politically unacceptable.
  //
  // The better-performing club on the ladder survives with its identity.
  // Its list absorbs the best available players from the dissolved club up
  // to AFL_LIST_SIZE (44), with the remainder dispersed.
  // -------------------------------------------------------------------------
  // Need enough clubs remaining after all contractions + this merger
  const mergerFloorMet = () => {
    const mergersSoFar = mergingThisYear.size / 2 // each merger adds exactly 2 entries
    return clubCount - contractingThisYear.size - mergersSoFar > MIN_CLUBS
  }

  if (mergerFloorMet()) {
    const priorMergedIds = new Set<string>(
      history.events
        .filter((e) => e.type === 'merger')
        .flatMap((e) => {
          const m = e as LeagueMergerEvent
          return [m.club1Id, m.club2Id]
        }),
    )

    // Eligible: distressed + bottom half, not being removed this year, not previously merged
    const candidates = clubIds.filter((id) => {
      if (contractingThisYear.has(id) || mergingThisYear.has(id)) return false
      if (priorMergedIds.has(id)) return false
      const club = clubs[id]
      if (!club) return false
      const isDistressed = club.finances.balance < DISTRESS_BALANCE_THRESHOLD
      const ladderPos = getLadderPosition(id, ladder)
      return isDistressed && ladderPos > clubCount / 2
    })

    // Shuffle for fairness, then pair adjacent candidates
    const shuffled = rng.shuffle([...candidates])

    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      if (!mergerFloorMet()) break

      const id1 = shuffled[i]
      const id2 = shuffled[i + 1]
      if (mergingThisYear.has(id1) || mergingThisYear.has(id2)) continue

      if (rng.chance(0.03)) {
        const club1 = clubs[id1]!
        const club2 = clubs[id2]!

        // Surviving club: better ladder position (lower = better); ties go to better finances
        const pos1 = getLadderPosition(id1, ladder)
        const pos2 = getLadderPosition(id2, ladder)
        const survivingId =
          pos1 < pos2 ? id1
          : pos2 < pos1 ? id2
          : club1.finances.balance >= club2.finances.balance ? id1 : id2
        const dissolvedId = survivingId === id1 ? id2 : id1
        const survivingClub = clubs[survivingId]!

        const dissolvedPlayers = Object.values(players).filter((p) => p.clubId === dissolvedId)
        const survivingPlayerCount = Object.values(players).filter((p) => p.clubId === survivingId).length
        const slotsAvailable = Math.max(0, AFL_LIST_SIZE - survivingPlayerCount)
        const absorbedCount = Math.min(slotsAvailable, dissolvedPlayers.length)
        const dispersedCount = dissolvedPlayers.length - absorbedCount

        events.push({
          id: crypto.randomUUID(),
          type: 'merger',
          year: currentYear,
          appliedYear: currentYear + 1,
          club1Id: id1,
          club1Name: club1.name,
          club1FullName: club1.fullName,
          club2Id: id2,
          club2Name: club2.name,
          club2FullName: club2.fullName,
          survivingClubId: survivingId,
          dissolvedClubId: dissolvedId,
          survivingClubName: survivingClub.name,
          survivingClubFullName: survivingClub.fullName,
          absorbedPlayerCount: absorbedCount,
          dispersedPlayerCount: dispersedCount,
          description:
            `The AFL approves a merger between the ${club1.fullName} and the ${club2.fullName}. ` +
            `The combined entity will compete as the ${survivingClub.fullName} from ${currentYear + 1}. ` +
            `${absorbedCount} players transfer to the squad; ${dispersedCount} enter the pool.`,
        })

        mergingThisYear.add(id1)
        mergingThisYear.add(id2)
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Relocation — loss-making small-market clubs move to a new city
  // -------------------------------------------------------------------------
  const usedMarketIds = new Set([
    ...clubIds,
    ...history.events
      .filter((e) => e.type === 'relocation')
      .map((e) => (e as LeagueRelocationEvent).newHomeGround),
    // Also exclude markets already expansion-announced this year
    ...events
      .filter((e) => e.type === 'expansion')
      .map((e) => (e as LeagueExpansionEvent).newClubId),
  ])

  const alreadyRelocated = new Set(
    history.events
      .filter((e) => e.type === 'relocation')
      .map((e) => (e as LeagueRelocationEvent).clubId),
  )

  for (const clubId of clubIds) {
    if (contractingThisYear.has(clubId)) continue   // can't fold and move
    if (mergingThisYear.has(clubId)) continue        // can't merge and move
    if (alreadyRelocated.has(clubId)) continue       // already moved once

    const club = clubs[clubId]
    if (!club || club.tier !== 'small') continue

    const isLossMaking = club.finances.balance < DISTRESS_BALANCE_THRESHOLD
    const ladderPos = getLadderPosition(clubId, ladder)
    const isPoorPerformer = ladderPos > clubCount - 6

    if (isLossMaking && isPoorPerformer) {
      const availableDestinations = EXPANSION_MARKETS.filter(
        (m) => !usedMarketIds.has(m.id) && !clubIds.includes(m.id),
      )
      if (availableDestinations.length === 0) continue

      if (rng.chance(0.04)) {
        const dest = availableDestinations[rng.nextInt(0, availableDestinations.length - 1)]
        // Mark this destination as used so a second club doesn't move there too
        usedMarketIds.add(dest.id)

        events.push({
          id: crypto.randomUUID(),
          type: 'relocation',
          year: currentYear,
          appliedYear: currentYear + 1,
          clubId,
          oldName: club.name,
          newName: dest.name,
          newFullName: dest.fullName,
          newAbbreviation: dest.abbreviation,
          oldHomeGround: club.homeGround,
          newHomeGround: dest.homeGround,
          newCity: dest.city,
          description:
            `The AFL approves the ${club.fullName}'s relocation to ${dest.city}, ` +
            `where they will be rebranded as the ${dest.fullName} from ${currentYear + 1}.`,
        })
      }
    }
  }

  return events
}

// ---------------------------------------------------------------------------
// Application helpers (called by gameStore)
// ---------------------------------------------------------------------------

/**
 * Apply a contraction: mark all players as unsigned (clubId → '').
 * Returns the list of dispersed player IDs.
 */
export function applyContraction(
  players: Record<string, Player>,
  contractedClubId: string,
): string[] {
  const dispersed: string[] = []
  for (const player of Object.values(players)) {
    if (player.clubId === contractedClubId) {
      player.clubId = ''
      // Clear contract values so the player enters the unsigned pool
      player.contract = {
        ...player.contract,
        yearsRemaining: 0,
        yearByYear: [],
        aav: 0,
      }
      dispersed.push(player.id)
    }
  }
  return dispersed
}

/**
 * Apply a relocation: update club name, ground, and abbreviation in place.
 */
export function applyRelocation(
  club: Club,
  event: LeagueRelocationEvent,
): void {
  club.name = event.newName
  club.fullName = event.newFullName
  club.abbreviation = event.newAbbreviation
  club.homeGround = event.newHomeGround
  // Sync colors from expansion market definition
  const market = EXPANSION_MARKETS.find((m) => m.homeGround === event.newHomeGround)
  if (market) {
    club.colors = { primary: market.primaryColor, secondary: market.secondaryColor }
  }
}

/**
 * Apply a merger: transfer the best available players from the dissolved club
 * to the surviving club up to AFL_LIST_SIZE (44), disperse the rest.
 * The dissolved club record itself is removed by the caller (gameStore).
 * Returns the list of dispersed player IDs.
 */
export function applyMerger(
  players: Record<string, Player>,
  event: LeagueMergerEvent,
): string[] {
  const { survivingClubId, dissolvedClubId } = event

  // Sort dissolved club's players best-first so the surviving club absorbs quality
  const dissolvedPlayers = Object.values(players)
    .filter((p) => p.clubId === dissolvedClubId)
    .sort((a, b) => getPlayerOverall(b) - getPlayerOverall(a))

  const survivingCount = Object.values(players).filter((p) => p.clubId === survivingClubId).length
  const slotsAvailable = Math.max(0, AFL_LIST_SIZE - survivingCount)

  const dispersed: string[] = []
  for (let i = 0; i < dissolvedPlayers.length; i++) {
    const player = dissolvedPlayers[i]
    if (i < slotsAvailable) {
      player.clubId = survivingClubId
    } else {
      player.clubId = ''
      player.contract = {
        ...player.contract,
        yearsRemaining: 0,
        yearByYear: [],
        aav: 0,
      }
      dispersed.push(player.id)
    }
  }
  return dispersed
}
