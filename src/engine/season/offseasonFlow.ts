import type { Player, PlayerCareerStats, PlayerAttributes } from '@/types/player'
import type { Club } from '@/types/club'
import type { CompletedTrade, GameSettings, NewsItem } from '@/types/game'
import type { Season, LadderEntry } from '@/types/season'
import type { DraftProspect, DraftPick as DraftEnginePick } from '@/types/draft'
import type { StaffMember } from '@/types/staff'
import type { SeededRNG } from '@/engine/core/rng'
import type { GameHistory } from '@/types/history'
import { recordDraftPick } from '@/engine/history/historyEngine'

import {
  processEndOfSeasonContracts,
  delistPlayer,
} from '@/engine/contracts/freeAgency'
import {
  aiSelectProspect,
  convertProspectToPlayer,
} from '@/engine/draft/draftEngine'
import { generateFixture, createInitialLadder } from '@/engine/season/fixtureGenerator'
import { validateFixture } from '@/engine/season/fixtureValidator'
import { calculatePreseasonTraining } from '@/engine/training/trainingEngine'
import { developPlayer, agePlayer, shouldRetire } from '@/engine/players/development'
import { calculatePlayerValue } from '@/engine/contracts/negotiation'
import {
  MINIMUM_SALARY,
  DEFAULT_SALARY_CAP,
} from '@/engine/core/constants'
import {
  resolveListConstraints,
  validateClubList,
  canAddToSeniorList,
  mustDelist as mustDelistCount,
} from '@/engine/rules/listRules'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OffseasonPhase =
  | 'season-end' // Awards, stats finalization
  | 'retirements' // Player retirements
  | 'delistings' // Club delistings
  | 'trade-period' // Trade window
  | 'free-agency' // FA signings
  | 'national-draft' // National draft
  | 'rookie-draft' // Rookie draft
  | 'preseason' // Pre-season training
  | 'practice-matches' // Practice matches
  | 'ready' // Ready for new season

export interface OffseasonState {
  currentPhase: OffseasonPhase
  completedPhases: OffseasonPhase[]
  retiredPlayerIds: string[]
  delistedPlayerIds: string[]
  newDraftees: string[] // player IDs of newly drafted players
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The ordered progression of offseason phases. */
export const PHASE_ORDER: OffseasonPhase[] = [
  'season-end',
  'retirements',
  'delistings',
  'trade-period',
  'free-agency',
  'national-draft',
  'rookie-draft',
  'preseason',
  'practice-matches',
  'ready',
]

/** Preseason training duration in weeks. */
const PRESEASON_WEEKS = 8

/** All 52 attribute keys. */
const ALL_ATTRIBUTE_KEYS: (keyof PlayerAttributes)[] = [
  'kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap',
  'handballEfficiency', 'handballDistance', 'handballReceive',
  'markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested',
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
  'tackling', 'contested', 'clearance', 'hardness',
  'disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure',
  'goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct',
  'intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding',
  'hitouts', 'ruckCreative', 'followUp',
  'pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch',
  'centreBounce', 'boundaryThrowIn', 'stoppage',
]

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns a zeroed-out stats block. */
function emptyStats(): PlayerCareerStats {
  return {
    gamesPlayed: 0,
    goals: 0,
    behinds: 0,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    tackles: 0,
    hitouts: 0,
    contestedPossessions: 0,
    clearances: 0,
    insideFifties: 0,
    rebound50s: 0,
    contestedMarks: 0,
    scoreInvolvements: 0,
    metresGained: 0,
    turnovers: 0,
    intercepts: 0,
    onePercenters: 0,
    bounces: 0,
    clangers: 0,
    goalAssists: 0,
  }
}

/** Merge season stats into career stats additively. */
function mergeStats(career: PlayerCareerStats, season: PlayerCareerStats): PlayerCareerStats {
  return {
    gamesPlayed: career.gamesPlayed + season.gamesPlayed,
    goals: career.goals + season.goals,
    behinds: career.behinds + season.behinds,
    disposals: career.disposals + season.disposals,
    kicks: career.kicks + season.kicks,
    handballs: career.handballs + season.handballs,
    marks: career.marks + season.marks,
    tackles: career.tackles + season.tackles,
    hitouts: career.hitouts + season.hitouts,
    contestedPossessions: career.contestedPossessions + season.contestedPossessions,
    clearances: career.clearances + season.clearances,
    insideFifties: career.insideFifties + season.insideFifties,
    rebound50s: career.rebound50s + season.rebound50s,
    contestedMarks: career.contestedMarks + season.contestedMarks,
    scoreInvolvements: career.scoreInvolvements + season.scoreInvolvements,
    metresGained: career.metresGained + season.metresGained,
    turnovers: career.turnovers + season.turnovers,
    intercepts: career.intercepts + season.intercepts,
    onePercenters: career.onePercenters + season.onePercenters,
    bounces: career.bounces + season.bounces,
    clangers: career.clangers + season.clangers,
    goalAssists: career.goalAssists + season.goalAssists,
  }
}

/** Compute a player's overall attribute average (0-100). */
function getOverall(player: Player): number {
  let total = 0
  for (const key of ALL_ATTRIBUTE_KEYS) {
    total += player.attributes[key]
  }
  return total / ALL_ATTRIBUTE_KEYS.length
}

/** Get all players belonging to a specific club. */
function getClubPlayers(
  players: Record<string, Player>,
  clubId: string,
): Player[] {
  return Object.values(players).filter((p) => p.clubId === clubId)
}

/** Generate a simple unique ID using the RNG. */
function generateId(prefix: string, rng: SeededRNG): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = `${prefix}_`
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)]
  }
  return id
}

/** Create a NewsItem. */
function createNews(
  headline: string,
  body: string,
  category: NewsItem['category'],
  clubIds: string[],
  playerIds: string[],
  date: string,
  rng: SeededRNG,
): NewsItem {
  return {
    id: generateId('news', rng),
    date,
    headline,
    body,
    category,
    clubIds,
    playerIds,
  }
}

/** Get the in-game date string for the offseason of a given year. */
function offseasonDate(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

/**
 * Compute positional counts for a club's roster.
 * Returns a map of position group to number of players.
 */
function getPositionalCounts(
  players: Record<string, Player>,
  clubId: string,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of Object.values(players)) {
    if (p.clubId !== clubId) continue
    const group = p.position.primary
    counts[group] = (counts[group] ?? 0) + 1
  }
  return counts
}

// ---------------------------------------------------------------------------
// 1. initOffseason
// ---------------------------------------------------------------------------

/**
 * Create the initial offseason state with the first phase set to 'season-end'
 * and all tracking arrays empty.
 */
export function initOffseason(): OffseasonState {
  return {
    currentPhase: 'season-end',
    completedPhases: [],
    retiredPlayerIds: [],
    delistedPlayerIds: [],
    newDraftees: [],
  }
}

// ---------------------------------------------------------------------------
// 1b. canAdvancePhase
// ---------------------------------------------------------------------------

export interface PhaseAdvanceResult {
  allowed: boolean
  reason: string | null
}

/**
 * Check whether the offseason can advance past the current phase.
 * Returns `{ allowed: false, reason }` when validation fails.
 */
export function canAdvancePhase(
  offseasonState: OffseasonState,
  players: Record<string, Player>,
  playerClubId: string,
  settings: GameSettings,
): PhaseAdvanceResult {
  if (offseasonState.currentPhase === 'delistings') {
    const constraints = resolveListConstraints(settings)
    const validation = validateClubList(players, playerClubId, constraints)
    if (!validation.valid) {
      const reason = validation.errors.map((e) => e.message).join(' ')
      return { allowed: false, reason }
    }
  }

  return { allowed: true, reason: null }
}

// ---------------------------------------------------------------------------
// 2. processSeasonEnd
// ---------------------------------------------------------------------------

/**
 * Finalize the completed season:
 * - Merge each player's season stats into their career stats
 * - Reset season stats to zero
 * - Age all players by 1 year
 * - Run development/decline for each player
 * - Check for retirements (age > 30, with probability scaling by age)
 * - Also force-retire players age > 28 whose overall is below 30
 *
 * Returns updated players, a list of retired player IDs, and retirement news.
 */
export function processSeasonEnd(
  players: Record<string, Player>,
  currentYear: number,
  rng: SeededRNG,
  developmentSpeedMultiplier?: number,
): {
  updatedPlayers: Record<string, Player>
  retiredIds: string[]
  news: NewsItem[]
} {
  const updatedPlayers: Record<string, Player> = {}
  const retiredIds: string[] = []
  const news: NewsItem[] = []
  const dateStr = offseasonDate(currentYear, 10, 1)

  for (const [id, original] of Object.entries(players)) {
    // Clone the player so we don't mutate the input
    const player: Player = {
      ...original,
      attributes: { ...original.attributes },
      hiddenAttributes: { ...original.hiddenAttributes },
      personality: { ...original.personality },
      contract: { ...original.contract, yearByYear: [...original.contract.yearByYear] },
      position: {
        ...original.position,
        secondary: [...original.position.secondary],
        ratings: { ...original.position.ratings },
      },
      careerStats: { ...original.careerStats },
      seasonStats: { ...original.seasonStats },
      injury: original.injury ? { ...original.injury } : null,
    }

    // Skip players who are already retired or delisted
    if (!player.clubId || player.clubId === 'retired') {
      updatedPlayers[id] = player
      continue
    }

    // Merge season stats into career stats
    player.careerStats = mergeStats(player.careerStats, player.seasonStats)

    // Reset season stats
    player.seasonStats = emptyStats()

    // Age player by 1 year
    agePlayer(player)

    // Run development (growth / peak fluctuation / decline)
    developPlayer(player, rng, developmentSpeedMultiplier)

    // Check for retirement
    const overall = getOverall(player)
    const shouldForceRetire = player.age > 28 && overall < 30
    const naturalRetirement = shouldRetire(player, rng)

    if (shouldForceRetire || naturalRetirement) {
      retiredIds.push(player.id)

      const fullName = `${player.firstName} ${player.lastName}`
      const gamesPlayed = player.careerStats.gamesPlayed
      const goals = player.careerStats.goals

      news.push(
        createNews(
          `${fullName} announces retirement`,
          `${fullName} has announced his retirement from AFL football after a career ` +
            `spanning ${gamesPlayed} games and ${goals} goals. The ${player.age}-year-old ` +
            `${player.position.primary} departs the game having made a significant ` +
            `contribution to the sport.`,
          'general',
          [player.clubId],
          [player.id],
          dateStr,
          rng,
        ),
      )
    }

    updatedPlayers[id] = player
  }

  return { updatedPlayers, retiredIds, news }
}

// ---------------------------------------------------------------------------
// 3. processRetirements
// ---------------------------------------------------------------------------

/**
 * Mark retired players by setting their clubId to 'retired'.
 * Returns the updated players record.
 */
export function processRetirements(
  players: Record<string, Player>,
  retiredIds: string[],
): Record<string, Player> {
  const retiredSet = new Set(retiredIds)
  const updatedPlayers: Record<string, Player> = {}

  for (const [id, player] of Object.entries(players)) {
    if (retiredSet.has(id)) {
      updatedPlayers[id] = {
        ...player,
        clubId: 'retired',
        contract: {
          yearsRemaining: 0,
          aav: 0,
          yearByYear: [],
          isRestricted: false,
        },
      }
    } else {
      updatedPlayers[id] = player
    }
  }

  return updatedPlayers
}

// ---------------------------------------------------------------------------
// 4. processAIDelistings
// ---------------------------------------------------------------------------

/**
 * For each AI club, delist players to bring the roster within list constraints.
 * Also delist players who are very low-rated and old (overall < 35 and age > 29).
 *
 * Uses the existing `delistPlayer` function to clear contracts and club assignments.
 * Returns delisted player IDs and generated news items.
 */
export function processAIDelistings(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  rng: SeededRNG,
  playerClubId?: string,
  settings?: GameSettings,
  currentYear?: number,
): {
  delistedIds: string[]
  news: NewsItem[]
} {
  const delistedIds: string[] = []
  const news: NewsItem[] = []

  for (const club of Object.values(clubs)) {
    // Skip the user-controlled club
    if (playerClubId && club.id === playerClubId) continue

    const roster = getClubPlayers(players, club.id)

    // Score each player: lower score = worse player = first to delist
    const scored = roster.map((p) => ({
      player: p,
      score: getOverall(p) - (p.age > 29 ? (p.age - 29) * 3 : 0),
    }))
    scored.sort((a, b) => a.score - b.score)

    // Phase 1: Delist very low-rated older players
    for (const entry of scored) {
      const { player } = entry
      if (player.age > 29 && getOverall(player) < 35) {
        if (!delistedIds.includes(player.id)) {
          delistPlayer(player)
          delistedIds.push(player.id)

          const fullName = `${player.firstName} ${player.lastName}`
          news.push(
            createNews(
              `${club.name} delist ${fullName}`,
              `${club.name} have delisted ${fullName} as part of their end-of-season ` +
                `list management. The ${player.age}-year-old ${player.position.primary} ` +
                `has been released from his contract.`,
              'general',
              [club.id],
              [player.id],
              offseasonDate(currentYear ?? new Date().getFullYear(), 10, 15),
              rng,
            ),
          )
        }
      }
    }

    // Phase 2: Trim roster to max total list size
    const constraints = settings
      ? resolveListConstraints(settings)
      : { maxTotal: 44, maxSenior: 38, maxRookie: 6, minSenior: 0, minRookie: 0, minDraftSelections: 1 }
    const excessCount = mustDelistCount(players, club.id, constraints)
    if (excessCount > 0) {
      const currentRoster = getClubPlayers(players, club.id)
      // Re-score remaining roster
      const remaining = currentRoster.map((p) => ({
        player: p,
        score: getOverall(p) - (p.age > 29 ? (p.age - 29) * 3 : 0),
      }))
      remaining.sort((a, b) => a.score - b.score)
      for (let i = 0; i < excessCount && i < remaining.length; i++) {
        const { player } = remaining[i]
        if (delistedIds.includes(player.id)) continue

        delistPlayer(player)
        delistedIds.push(player.id)

        const fullName = `${player.firstName} ${player.lastName}`
        news.push(
          createNews(
            `${club.name} delist ${fullName}`,
            `${club.name} have delisted ${fullName} to meet list size requirements. ` +
              `The ${player.age}-year-old becomes a free agent.`,
            'general',
            [club.id],
            [player.id],
            offseasonDate(currentYear ?? new Date().getFullYear(), 10, 15),
            rng,
          ),
        )
      }
    }
  }

  return { delistedIds, news }
}

// ---------------------------------------------------------------------------
// 5. processAITradePeriod
// ---------------------------------------------------------------------------

/**
 * Simulate the AI trade period. Generates 3-8 trades between AI-controlled clubs.
 *
 * Trade logic:
 * - "win-now" clubs seek established players (age 24-30, high overall)
 * - "rebuilding" clubs trade away older players for younger talent / picks
 * - Each trade pairs two random AI clubs and finds suitable swap candidates
 *
 * Returns updated players, completed trade records, and news items.
 */
export function processAITradePeriod(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  _tradeHistory: CompletedTrade[],
  rng: SeededRNG,
  playerClubId?: string,
  currentYear?: number,
): {
  updatedPlayers: Record<string, Player>
  trades: CompletedTrade[]
  news: NewsItem[]
} {
  // Clone players record
  const updatedPlayers: Record<string, Player> = {}
  for (const [id, p] of Object.entries(players)) {
    updatedPlayers[id] = { ...p }
  }

  const trades: CompletedTrade[] = []
  const news: NewsItem[] = []

  // Get AI club IDs (exclude the user's club)
  const aiClubIds = Object.keys(clubs).filter(
    (id) => !playerClubId || id !== playerClubId,
  )

  if (aiClubIds.length < 2) {
    return { updatedPlayers, trades, news }
  }

  const numTrades = rng.nextInt(3, 8)

  for (let t = 0; t < numTrades; t++) {
    // Pick two different random AI clubs
    const shuffled = rng.shuffle(aiClubIds)
    const clubAId = shuffled[0]
    const clubBId = shuffled[1]
    const clubA = clubs[clubAId]
    const clubB = clubs[clubBId]

    if (!clubA || !clubB) continue

    // Get each club's roster
    const rosterA = getClubPlayers(updatedPlayers, clubAId)
    const rosterB = getClubPlayers(updatedPlayers, clubBId)

    if (rosterA.length < 5 || rosterB.length < 5) continue

    // Find a player Club A would trade away
    const playerFromA = findTradeCandidate(rosterA, clubA, rng)
    // Find a player Club B would trade away
    const playerFromB = findTradeCandidate(rosterB, clubB, rng)

    if (!playerFromA || !playerFromB) continue

    // Ensure the trade makes some sense: both clubs should want what they receive
    const valueA = calculatePlayerValue(playerFromA)
    const valueB = calculatePlayerValue(playerFromB)

    // Only proceed if values are within 40% of each other
    const ratio = Math.min(valueA, valueB) / Math.max(valueA, valueB)
    if (ratio < 0.6) continue

    // Execute the trade
    updatedPlayers[playerFromA.id] = {
      ...updatedPlayers[playerFromA.id],
      clubId: clubBId,
    }
    updatedPlayers[playerFromB.id] = {
      ...updatedPlayers[playerFromB.id],
      clubId: clubAId,
    }

    const trade: CompletedTrade = {
      id: generateId('trade', rng),
      date: offseasonDate(currentYear ?? new Date().getFullYear(), 10, 20),
      clubA: clubAId,
      clubB: clubBId,
      playersToA: [playerFromB.id],
      playersToB: [playerFromA.id],
      salaryRetainedByA: 0,
      salaryRetainedByB: 0,
    }
    trades.push(trade)

    const playerAName = `${playerFromA.firstName} ${playerFromA.lastName}`
    const playerBName = `${playerFromB.firstName} ${playerFromB.lastName}`

    news.push(
      createNews(
        `${clubA.name} and ${clubB.name} complete trade`,
        `${clubA.name} have traded ${playerAName} to ${clubB.name} in exchange ` +
          `for ${playerBName}. The swap sees the ${playerFromA.age}-year-old ` +
          `${playerFromA.position.primary} head to ${clubB.name}, while the ` +
          `${playerFromB.age}-year-old ${playerFromB.position.primary} moves ` +
          `to ${clubA.name}.`,
        'trade',
        [clubAId, clubBId],
        [playerFromA.id, playerFromB.id],
        offseasonDate(currentYear ?? new Date().getFullYear(), 10, 20),
        rng,
      ),
    )
  }

  return { updatedPlayers, trades, news }
}

/**
 * Find a suitable trade candidate from a club's roster based on their
 * competitive window personality.
 */
function findTradeCandidate(
  roster: Player[],
  club: Club,
  rng: SeededRNG,
): Player | null {
  const { competitiveWindow } = club.aiPersonality

  // Filter eligible candidates (must have a contract, not injured, not on rookie list)
  const eligible = roster.filter(
    (p) => p.contract.yearsRemaining > 0 && !p.isRookie,
  )

  if (eligible.length === 0) return null

  let candidates: Player[]

  switch (competitiveWindow) {
    case 'win-now':
      // Win-now clubs trade away younger underperforming players or fringe veterans
      candidates = eligible.filter(
        (p) => (p.age < 23 && getOverall(p) < 50) || (p.age > 30 && getOverall(p) < 55),
      )
      break

    case 'rebuilding':
      // Rebuilding clubs trade away established veterans for future value
      candidates = eligible.filter(
        (p) => p.age >= 26 && getOverall(p) > 45,
      )
      break

    case 'balanced':
    default:
      // Balanced clubs trade players who don't fit positionally or aging fringe players
      candidates = eligible.filter(
        (p) => (p.age > 28 && getOverall(p) < 55) || (p.age < 24 && getOverall(p) < 45),
      )
      break
  }

  if (candidates.length === 0) {
    // Fallback: pick from the bottom quartile of the roster by overall
    const sorted = [...eligible].sort((a, b) => getOverall(a) - getOverall(b))
    const quartileSize = Math.max(1, Math.floor(sorted.length / 4))
    candidates = sorted.slice(0, quartileSize)
  }

  return rng.pick(candidates)
}

// ---------------------------------------------------------------------------
// 6. processAIFreeAgency
// ---------------------------------------------------------------------------

/**
 * Process AI free agency signings.
 *
 * Finds all players with expired contracts (yearsRemaining <= 0, still listed
 * with a club or unattached), then has AI clubs bid on them based on positional
 * need and available cap space.
 *
 * Returns updated players, list of signings, and news items.
 */
export function processAIFreeAgency(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  rng: SeededRNG,
  playerClubId?: string,
  settings?: GameSettings,
  currentYear?: number,
): {
  updatedPlayers: Record<string, Player>
  signings: { playerId: string; newClubId: string }[]
  news: NewsItem[]
} {
  // Clone players
  const updatedPlayers: Record<string, Player> = {}
  for (const [id, p] of Object.entries(players)) {
    updatedPlayers[id] = { ...p }
  }

  // Process end-of-season contracts first to identify expired contracts
  processEndOfSeasonContracts(updatedPlayers)

  const signings: { playerId: string; newClubId: string }[] = []
  const newsItems: NewsItem[] = []

  // Find free agents: players with expired contracts who aren't retired
  const freeAgents = Object.values(updatedPlayers).filter(
    (p) =>
      p.contract.yearsRemaining <= 0 &&
      p.clubId !== 'retired' &&
      getOverall(p) >= 25,
  )

  // Get AI clubs
  const aiClubs = Object.values(clubs).filter(
    (c) => !playerClubId || c.id !== playerClubId,
  )

  for (const freeAgent of freeAgents) {
    // Determine market value
    const marketValue = calculatePlayerValue(freeAgent)

    // Collect bids from interested AI clubs
    const bids: { clubId: string; bidValue: number }[] = []

    for (const club of aiClubs) {
      // Check cap space
      const clubRoster = getClubPlayers(updatedPlayers, club.id)
      const currentSpend = clubRoster.reduce(
        (sum, p) => sum + (p.contract.yearByYear[0] ?? 0),
        0,
      )
      const availableCap = (club.finances.salaryCap || DEFAULT_SALARY_CAP) - currentSpend

      if (availableCap < MINIMUM_SALARY) continue

      // Check list space
      const faConstraints = settings
        ? resolveListConstraints(settings)
        : { maxTotal: 44, maxSenior: 38, maxRookie: 6, minSenior: 0, minRookie: 0, minDraftSelections: 1 }
      if (!canAddToSeniorList(updatedPlayers, club.id, faConstraints)) continue

      // Evaluate interest based on positional need
      const posCounts = getPositionalCounts(updatedPlayers, club.id)
      const primaryCount = posCounts[freeAgent.position.primary] ?? 0
      const hasPositionalNeed = primaryCount < 4

      // Base interest probability
      let interest = 0.15
      if (hasPositionalNeed) interest += 0.25

      // Competitive window alignment
      switch (club.aiPersonality.competitiveWindow) {
        case 'win-now':
          interest += freeAgent.age >= 24 && freeAgent.age <= 30 ? 0.2 : -0.1
          break
        case 'rebuilding':
          interest += freeAgent.age <= 25 ? 0.2 : -0.15
          break
        case 'balanced':
          interest += 0.05
          break
      }

      if (!rng.chance(Math.max(0.05, Math.min(0.9, interest)))) continue

      // Generate bid amount
      const bidMultiplier = 0.85 + rng.next() * 0.35 // 85% to 120% of market value
      const bidAmount = Math.max(MINIMUM_SALARY, Math.round(marketValue * bidMultiplier))

      if (bidAmount > availableCap) continue

      bids.push({ clubId: club.id, bidValue: bidAmount })
    }

    if (bids.length === 0) continue

    // Player signs with the highest bidder
    bids.sort((a, b) => b.bidValue - a.bidValue)
    const winningBid = bids[0]

    // Determine contract length based on age
    let contractYears: number
    if (freeAgent.age <= 24) contractYears = rng.nextInt(3, 4)
    else if (freeAgent.age <= 28) contractYears = rng.nextInt(2, 3)
    else if (freeAgent.age <= 31) contractYears = rng.nextInt(1, 2)
    else contractYears = 1

    // Build year-by-year salary
    const yearByYear: number[] = []
    for (let y = 0; y < contractYears; y++) {
      yearByYear.push(Math.round(winningBid.bidValue * (1 + y * 0.04)))
    }

    // Update the player
    updatedPlayers[freeAgent.id] = {
      ...updatedPlayers[freeAgent.id],
      clubId: winningBid.clubId,
      contract: {
        yearsRemaining: contractYears,
        aav: winningBid.bidValue,
        yearByYear,
        isRestricted: false,
      },
    }

    signings.push({ playerId: freeAgent.id, newClubId: winningBid.clubId })

    const clubName = clubs[winningBid.clubId]?.name ?? winningBid.clubId
    const fullName = `${freeAgent.firstName} ${freeAgent.lastName}`

    newsItems.push(
      createNews(
        `${fullName} signs with ${clubName}`,
        `Free agent ${fullName} has signed a ${contractYears}-year deal worth ` +
          `$${winningBid.bidValue.toLocaleString()} per year with ${clubName}. ` +
          `The ${freeAgent.age}-year-old ${freeAgent.position.primary} was one of the ` +
          `most sought-after players on the open market this off-season.`,
        'contract',
        [winningBid.clubId],
        [freeAgent.id],
        offseasonDate(currentYear ?? new Date().getFullYear(), 11, 1),
        rng,
      ),
    )
  }

  return { updatedPlayers, signings, news: newsItems }
}

// ---------------------------------------------------------------------------
// 7. processAIDraft
// ---------------------------------------------------------------------------

/**
 * Process the national draft for AI clubs. For each pick owned by an AI club,
 * the AI selects the best available prospect using `aiSelectProspect`, then
 * the prospect is converted to a player and added to the club's roster.
 *
 * The user's club picks are skipped (they select interactively).
 *
 * Returns updated players, IDs of drafted players, and news items.
 */
export function processAIDraft(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  draftClass: DraftProspect[],
  draftOrder: DraftEnginePick[],
  rng: SeededRNG,
  currentYear: number,
  playerClubId?: string,
  history?: GameHistory,
): {
  updatedPlayers: Record<string, Player>
  draftedPlayerIds: string[]
  news: NewsItem[]
  updatedHistory: GameHistory
} {
  // Clone players
  const updatedPlayers: Record<string, Player> = {}
  for (const [id, p] of Object.entries(players)) {
    updatedPlayers[id] = { ...p }
  }

  const draftedPlayerIds: string[] = []
  const newsItems: NewsItem[] = []
  let currentHistory: GameHistory = history ?? { seasons: [], draftHistory: [] }

  // Track which prospects have been drafted
  const draftedProspectIds = new Set<string>()

  for (const pick of draftOrder) {
    const club = clubs[pick.clubId]
    if (!club) continue

    // Skip the user's club picks (they draft interactively)
    if (playerClubId && pick.clubId === playerClubId) continue

    // Get available (undrafted) prospects
    const available = draftClass.filter(
      (prospect) => !draftedProspectIds.has(prospect.id),
    )

    if (available.length === 0) break

    // AI selects a prospect
    const selectedProspectId = aiSelectProspect(
      club,
      pick,
      available,
      updatedPlayers,
      rng,
    )

    draftedProspectIds.add(selectedProspectId)

    // Find the selected prospect
    const prospect = draftClass.find((p) => p.id === selectedProspectId)
    if (!prospect) continue

    // Convert prospect to player
    const newPlayer = convertProspectToPlayer(
      prospect,
      pick.clubId,
      currentYear,
      pick.pickNumber,
    )

    // Add player to the updated players record
    updatedPlayers[newPlayer.id] = newPlayer
    draftedPlayerIds.push(newPlayer.id)

    // Record draft pick in history
    currentHistory = recordDraftPick(currentHistory, {
      year: currentYear,
      pickNumber: pick.pickNumber,
      round: pick.round,
      clubId: pick.clubId,
      playerId: newPlayer.id,
      playerName: `${newPlayer.firstName} ${newPlayer.lastName}`,
      position: newPlayer.position.primary,
    })

    // Generate draft pick news
    const fullName = `${newPlayer.firstName} ${newPlayer.lastName}`
    const clubName = club.name

    newsItems.push(
      createNews(
        `Pick ${pick.pickNumber}: ${clubName} select ${fullName}`,
        `With pick ${pick.pickNumber} in the ${currentYear} National Draft, ` +
          `${clubName} have selected ${fullName}, a ${prospect.age}-year-old ` +
          `${prospect.position.primary} from ${prospect.region}. ` +
          `The ${prospect.height}cm, ${prospect.weight}kg prospect came through ` +
          `the ${prospect.pathway} pathway.`,
        'draft',
        [pick.clubId],
        [newPlayer.id],
        offseasonDate(currentYear, 11, 25),
        rng,
      ),
    )
  }

  return { updatedPlayers, draftedPlayerIds, news: newsItems, updatedHistory: currentHistory }
}

// ---------------------------------------------------------------------------
// 8. processPreseason
// ---------------------------------------------------------------------------

/**
 * Run preseason training for all clubs over PRESEASON_WEEKS weeks.
 *
 * For each club:
 * - Run calculatePreseasonTraining with the club's staff and facilities
 * - Reset fitness to 85-95
 * - Reset fatigue to 0-10
 * - Reset form to 40-60
 * - Heal all injuries
 *
 * Returns the updated players record.
 */
export function processPreseason(
  players: Record<string, Player>,
  staff: Record<string, StaffMember>,
  clubs: Record<string, Club>,
  rng: SeededRNG,
): Record<string, Player> {
  // Clone players (deep enough for mutation by calculatePreseasonTraining)
  const updatedPlayers: Record<string, Player> = {}
  for (const [id, original] of Object.entries(players)) {
    updatedPlayers[id] = {
      ...original,
      attributes: { ...original.attributes },
      hiddenAttributes: { ...original.hiddenAttributes },
      contract: { ...original.contract, yearByYear: [...original.contract.yearByYear] },
      position: {
        ...original.position,
        secondary: [...original.position.secondary],
        ratings: { ...original.position.ratings },
      },
      careerStats: { ...original.careerStats },
      seasonStats: { ...original.seasonStats },
      injury: null, // Heal all injuries for preseason
    }
  }

  // Run preseason training for each club
  for (const club of Object.values(clubs)) {
    // Get staff for this club
    const clubStaff: Record<string, StaffMember> = {}
    for (const [staffId, member] of Object.entries(staff)) {
      if (member.clubId === club.id) {
        clubStaff[staffId] = member
      }
    }

    // Build a sub-record of only this club's players for training
    const clubPlayers: Record<string, Player> = {}
    for (const [playerId, player] of Object.entries(updatedPlayers)) {
      if (player.clubId === club.id) {
        clubPlayers[playerId] = player
      }
    }

    if (Object.keys(clubPlayers).length === 0) continue
    if (Object.keys(clubStaff).length === 0) continue

    // Run preseason training (mutates players in place)
    calculatePreseasonTraining(
      clubPlayers,
      PRESEASON_WEEKS,
      clubStaff,
      club.facilities,
      rng,
    )

    // Write the trained players back to the main record
    for (const [playerId, player] of Object.entries(clubPlayers)) {
      updatedPlayers[playerId] = player
    }
  }

  // Final reset pass: normalize fitness, fatigue, form, and clear injuries
  for (const player of Object.values(updatedPlayers)) {
    if (!player.clubId || player.clubId === 'retired' || player.clubId === '') {
      continue
    }

    player.fitness = rng.nextInt(85, 95)
    player.fatigue = rng.nextInt(0, 10)
    player.form = rng.nextInt(40, 60)
    player.injury = null
  }

  return updatedPlayers
}

// ---------------------------------------------------------------------------
// 9. startNewSeason
// ---------------------------------------------------------------------------

/**
 * Initialize a new season:
 * - Increment the year
 * - Generate a new fixture using generateFixture (with settings)
 * - Create a fresh ladder using createInitialLadder
 *
 * Returns the new season data, ladder, and the incremented year.
 */
export function startNewSeason(
  clubs: Record<string, Club>,
  currentYear: number,
  rngSeed: number,
  playerClubId?: string,
  settings?: GameSettings,
): {
  season: Season
  ladder: LadderEntry[]
  newYear: number
} {
  const newYear = currentYear + 1

  // Generate fixture using settings-driven options
  const season = generateFixture({
    clubs,
    seed: rngSeed,
    playerClubId,
    settings,
  })
  // Override the year to the new year
  season.year = newYear

  // Validate fixture (warn-and-proceed on failure)
  const fixtureErrors = validateFixture(season.rounds, Object.keys(clubs))
  if (fixtureErrors.length > 0) {
    console.warn('[startNewSeason] Fixture validation errors:', fixtureErrors)
  }

  // Create fresh ladder
  const clubIds = Object.keys(clubs)
  const ladder = createInitialLadder(clubIds)

  return { season, ladder, newYear }
}

// ---------------------------------------------------------------------------
// 10. advanceOffseasonPhase
// ---------------------------------------------------------------------------

/**
 * Advance the offseason to the next phase in the sequence.
 * Adds the current phase to completedPhases and moves to the next one.
 *
 * If already at 'ready' (the final phase), returns the state unchanged.
 */
export function advanceOffseasonPhase(state: OffseasonState): OffseasonState {
  const currentIndex = PHASE_ORDER.indexOf(state.currentPhase)

  // If at the last phase, don't advance
  if (currentIndex >= PHASE_ORDER.length - 1) {
    return state
  }

  const nextPhase = PHASE_ORDER[currentIndex + 1]

  return {
    ...state,
    currentPhase: nextPhase,
    completedPhases: [...state.completedPhases, state.currentPhase],
  }
}

// ---------------------------------------------------------------------------
// 11. getOffseasonPhaseLabel
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable label for a given offseason phase.
 */
export function getOffseasonPhaseLabel(phase: OffseasonPhase): string {
  switch (phase) {
    case 'season-end':
      return 'Season End'
    case 'retirements':
      return 'Retirements'
    case 'delistings':
      return 'Delistings'
    case 'trade-period':
      return 'Trade Period'
    case 'free-agency':
      return 'Free Agency'
    case 'national-draft':
      return 'National Draft'
    case 'rookie-draft':
      return 'Rookie Draft'
    case 'preseason':
      return 'Pre-Season Training'
    case 'practice-matches':
      return 'Practice Matches'
    case 'ready':
      return 'Ready for New Season'
  }
}
