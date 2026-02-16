import type { DraftProspect, DraftPick, DraftState, DraftLinkedType } from '@/types/draft'
import type { Club, DraftPick as ClubDraftPick } from '@/types/club'
import type { Player, PlayerPositionType } from '@/types/player'
import type { LadderEntry } from '@/types/season'
import type { SeededRNG } from '@/engine/core/rng'
import type { ExpansionPlan } from '@/types/expansion'
import { MINIMUM_SALARY } from '@/engine/core/constants'
import {
  getRoleNeedBonus,
  mapDraftProspectToPreferredRole,
  roleNeedsByClub,
} from '@/engine/player/roles'
import { deriveAgentArchetype } from '@/engine/player/agentPersonality'
import { getTacticalDraftPreferences } from '@/engine/core/tacticalIdentity'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of rounds in the national draft. */
const NATIONAL_DRAFT_ROUNDS = 3
const DRAFT_LEDGER_ROUNDS: number[] = [1, 2, 3]

/** Draft-value points table (pick number -> point value). Loosely modelled
 *  on the AFL draft value index used for Father-Son / Academy bidding. */
const DRAFT_POINTS: Record<number, number> = buildDraftPointsTable()

/** Ideal number of players per position type on a roster. */
const IDEAL_POSITIONAL_COUNTS: Record<string, number> = {
  BP: 3,
  FB: 3,
  HBF: 4,
  CHB: 3,
  W: 3,
  IM: 6,
  OM: 5,
  RK: 3,
  HFF: 4,
  CHF: 3,
  FP: 3,
  FF: 3,
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a draft-value points table for picks 1-72.
 *
 * Uses a logarithmic decay: pick 1 = 3000 points, decaying steeply through
 * the first round and flattening for later picks. Broadly mirrors the real
 * AFL draft value index.
 */
function buildDraftPointsTable(): Record<number, number> {
  const table: Record<number, number> = {}
  for (let i = 1; i <= 72; i++) {
    // Logarithmic decay: 3000 * (1 / (1 + 0.12 * (i - 1)))
    table[i] = Math.round(3000 / (1 + 0.12 * (i - 1)))
  }
  return table
}

/**
 * Get the draft-value points for a given pick number.
 * Falls back to a minimum value for very late picks.
 */
function getPickPoints(pickNumber: number): number {
  return DRAFT_POINTS[pickNumber] ?? Math.max(40, Math.round(3000 / (1 + 0.12 * (pickNumber - 1))))
}

export function getDraftPickPoints(pickNumber: number): number {
  return getPickPoints(pickNumber)
}

function canLinkedClubMatchByType(
  linkedType: DraftLinkedType | null,
  options?: { ngaAcademyEnabled?: boolean; ngaAcademyZoneMatching?: boolean },
): boolean {
  if (!linkedType) return false
  if (options?.ngaAcademyEnabled === false) return false
  if (linkedType === 'father-son') return true
  if (options?.ngaAcademyZoneMatching === false) return true
  return linkedType === 'academy' || linkedType === 'nga'
}

/**
 * Get the position-group counts for a club's current roster.
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

/**
 * Identify positions where a club has fewer players than the ideal count.
 * Returns an array of position groups sorted by the severity of the need
 * (largest deficit first).
 */
function identifyPositionalNeeds(
  players: Record<string, Player>,
  clubId: string,
): PlayerPositionType[] {
  const counts = getPositionalCounts(players, clubId)
  const needs: { position: PlayerPositionType; deficit: number }[] = []

  for (const [pos, ideal] of Object.entries(IDEAL_POSITIONAL_COUNTS)) {
    const current = counts[pos] ?? 0
    const deficit = ideal - current
    if (deficit > 0) {
      needs.push({ position: pos as PlayerPositionType, deficit })
    }
  }

  // Sort by largest deficit first
  needs.sort((a, b) => b.deficit - a.deficit)
  return needs.map((n) => n.position)
}

function computeAgeProfile(players: Record<string, Player>, clubId: string): {
  avgAge: number
  under23Ratio: number
  over29Ratio: number
} {
  const roster = Object.values(players).filter((p) => p.clubId === clubId)
  if (roster.length === 0) {
    return { avgAge: 24, under23Ratio: 0.25, over29Ratio: 0.2 }
  }
  const totalAge = roster.reduce((sum, p) => sum + p.age, 0)
  const under23 = roster.filter((p) => p.age <= 22).length
  const over29 = roster.filter((p) => p.age >= 29).length
  return {
    avgAge: totalAge / roster.length,
    under23Ratio: under23 / roster.length,
    over29Ratio: over29 / roster.length,
  }
}

function estimateProspectValueForClub(
  prospect: DraftProspect,
  clubId: string,
  options?: {
    scoutingAccuracy?: number
    draftSuccess?: number
  },
): { overall: number; potential: number; confidence: number } {
  const scoutingAccuracy = Math.max(0.6, Math.min(1.35, options?.scoutingAccuracy ?? 1))
  const draftSuccess = Math.max(0.6, Math.min(1.35, options?.draftSuccess ?? 1))
  const report = prospect.scoutingReports[clubId]
  if (report) {
    const confidenceBoost = Math.max(0, (scoutingAccuracy - 1) * 0.22)
    return {
      overall: report.overallEstimate,
      potential: report.potentialEstimate ?? report.overallEstimate + 8,
      confidence: Math.max(0, Math.min(1, report.confidence + confidenceBoost)),
    }
  }

  // Unknown prospect: infer from projection/tier with heavy uncertainty penalty.
  const tierBase: Record<DraftProspect['tier'], number> = {
    elite: 70,
    'first-round': 61,
    'second-round': 54,
    late: 47,
    'rookie-list': 42,
  }
  const projectionAdj = Math.max(0, (80 - prospect.projectedPick) * 0.12)
  const overall = tierBase[prospect.tier] + projectionAdj + (draftSuccess - 1) * 1.8
  const potential = overall + (prospect.tier === 'elite' ? 16 : prospect.tier === 'first-round' ? 13 : 10)
  const inferredConfidence = Math.max(0.08, Math.min(0.45, 0.12 + (scoutingAccuracy - 1) * 0.2))
  return { overall, potential, confidence: inferredConfidence }
}

function identityArchetypeBonus(club: Club, prospect: DraftProspect): number {
  if (club.tacticalIdentity) {
    const prefs = getTacticalDraftPreferences(club.tacticalIdentity)
    let bonus = 0
    if (prefs.preferredRoles.includes(prospect.role)) bonus += 5
    if (prefs.preferredArchetypes.includes(prospect.archetype)) bonus += 3
    const inferredRole = mapDraftProspectToPreferredRole(prospect)
    if (prefs.preferredPlayerRoles.includes(inferredRole)) bonus += 2
    return Math.min(10, bonus)
  }
  // Fallback for saves without identity
  const style = club.gameplan.offensiveStyle
  if (style === 'attacking') {
    if (prospect.role === 'line-breaker' || prospect.role === 'aerial-threat') return 4
    if (prospect.archetype === 'outside-runner' || prospect.archetype === 'lead-up-forward') return 3
  }
  if (style === 'defensive') {
    if (prospect.role === 'shutdown' || prospect.role === 'ground-pressure') return 4
    if (prospect.archetype === 'lockdown-defender' || prospect.archetype === 'intercept-defender') return 3
  }
  if (style === 'balanced' && prospect.role === 'utility') return 2
  return 0
}

function getDraftPickLedgerOwner(
  clubs: Record<string, Club>,
  year: number,
  round: number,
  originalClubId: string,
): string {
  for (const club of Object.values(clubs)) {
    const found = club.draftPicks.find(
      (p) => p.year === year && p.round === round && p.originalClubId === originalClubId,
    )
    if (found) return found.currentClubId || club.id
  }
  return originalClubId
}

export function ensureDraftPickLedger(
  clubs: Record<string, Club>,
  currentYear: number,
  yearsAhead = 2,
): Record<string, Club> {
  const updated: Record<string, Club> = {}
  for (const [clubId, club] of Object.entries(clubs)) {
    updated[clubId] = {
      ...club,
      draftPicks: (club.draftPicks ?? []).map((p) => ({ ...p })),
    }
  }

  const clubIds = Object.keys(updated)
  for (let year = currentYear; year <= currentYear + yearsAhead; year++) {
    for (const originalClubId of clubIds) {
      for (const round of DRAFT_LEDGER_ROUNDS) {
        const exists = Object.values(updated).some((club) =>
          club.draftPicks.some(
            (p) =>
              p.year === year &&
              p.round === round &&
              p.originalClubId === originalClubId,
          ),
        )
        if (!exists && updated[originalClubId]) {
          updated[originalClubId].draftPicks.push({
            year,
            round,
            originalClubId,
            currentClubId: originalClubId,
          })
        }
      }
    }
  }

  return updated
}

export function pruneExpiredDraftPicks(
  clubs: Record<string, Club>,
  currentYear: number,
): Record<string, Club> {
  const updated: Record<string, Club> = {}
  for (const [clubId, club] of Object.entries(clubs)) {
    updated[clubId] = {
      ...club,
      draftPicks: (club.draftPicks ?? [])
        .filter((p) => p.year >= currentYear)
        .map((p) => ({ ...p })),
    }
  }
  return updated
}

/**
 * Score a prospect for a club using the "best-available" strategy.
 * Simply returns the prospect's overall rating.
 */
function scoreBestAvailable(overall: number): number {
  return overall
}

/**
 * Score a prospect for a club using the "positional-need" strategy.
 * Prospects whose primary or secondary positions match a club need get a
 * significant bonus.
 */
function scorePositionalNeed(
  prospect: DraftProspect,
  neededPositions: PlayerPositionType[],
  overall: number,
): number {
  // Check if the prospect fills a need
  const primaryNeedIndex = neededPositions.indexOf(prospect.position.primary)
  if (primaryNeedIndex !== -1) {
    // Primary position matches a need -- bonus scales with urgency
    const urgencyBonus = (neededPositions.length - primaryNeedIndex) * 3
    return overall + 15 + urgencyBonus
  }

  // Check secondary positions
  for (const sec of prospect.position.secondary) {
    const secIndex = neededPositions.indexOf(sec)
    if (secIndex !== -1) {
      const urgencyBonus = (neededPositions.length - secIndex) * 2
      return overall + 8 + urgencyBonus
    }
  }

  // No positional match -- slight penalty
  return overall - 5
}

/**
 * Apply a competitive-window modifier to a prospect's score.
 *
 * - 'win-now' clubs prefer prospects with higher current ratings (ready-made)
 * - 'rebuilding' clubs prefer younger prospects with higher potential
 * - 'balanced' clubs use a small blend
 */
function applyWindowModifier(
  score: number,
  age: number,
  overall: number,
  potential: number,
  competitiveWindow: 'win-now' | 'balanced' | 'rebuilding',
): number {
  switch (competitiveWindow) {
    case 'win-now': {
      const readinessBonus = (overall - 40) * 0.15
      const agePenalty = age < 18 ? -5 : 0
      return score + readinessBonus + agePenalty
    }
    case 'rebuilding': {
      const ceilingBonus = (potential - 50) * 0.2
      const youthBonus = age <= 18 ? 5 : 0
      return score + ceilingBonus + youthBonus
    }
    case 'balanced':
      return score
  }
}

/**
 * Create a zeroed-out career / season stats block.
 */
function emptyStats(): Player['careerStats'] {
  return {
    gamesPlayed: 0,
    aflFantasyPoints: 0,
    superCoachPoints: 0,
    goals: 0,
    behinds: 0,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    tackles: 0,
    hitouts: 0,
    contestedPossessions: 0,
    uncontestedPossessions: 0,
    clearances: 0,
    insideFifties: 0,
    rebound50s: 0,
    freesFor: 0,
    freesAgainst: 0,
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

// ---------------------------------------------------------------------------
// 1. generateDraftOrder
// ---------------------------------------------------------------------------

/**
 * Generate the national draft pick order from the final-season ladder.
 *
 * The draft runs in reverse-ladder order (last place picks first) for 3
 * rounds of 18 picks each, producing 54 total picks.
 *
 * @param ladder - The end-of-season ladder entries.
 * @param clubs  - All clubs in the league (keyed by club ID).
 * @returns An array of 54 DraftPick objects with pick numbers 1-54.
 */
export function generateDraftOrder(
  ladder: LadderEntry[],
  clubs: Record<string, Club>,
  expansionPlans?: ExpansionPlan[],
  currentYear?: number,
): DraftPick[] {
  const totalClubs = ladder.length
  // Sort ladder from worst to best (reverse finishing order)
  const sorted = [...ladder].sort((a, b) => {
    if (a.points !== b.points) return a.points - b.points
    return a.percentage - b.percentage
  })

  const picks: DraftPick[] = []
  let pickNumber = 1

  // Insert priority picks for expansion teams at the start of round 1
  if (expansionPlans && currentYear) {
    for (const plan of expansionPlans) {
      if (plan.status !== 'active') continue
      const yearsInAFL = currentYear - plan.aflEntryYear
      if (yearsInAFL >= 0 && yearsInAFL < plan.priorityPickYears) {
        for (let p = 0; p < plan.priorityPicksPerYear; p++) {
          const ownerId = getDraftPickLedgerOwner(clubs, currentYear, 1, plan.clubId)
          picks.push({
            pickNumber,
            round: 1,
            clubId: ownerId,
            originalClubId: plan.clubId,
            selectedProspectId: null,
            isBid: false,
          })
          pickNumber++
        }
      }
    }
  }

  for (let round = 1; round <= NATIONAL_DRAFT_ROUNDS; round++) {
    for (let i = 0; i < totalClubs; i++) {
      const originalClubId = sorted[i].clubId
      const ownerClubId = currentYear
        ? getDraftPickLedgerOwner(clubs, currentYear, round, originalClubId)
        : originalClubId
      picks.push({
        pickNumber,
        round,
        clubId: ownerClubId,
        originalClubId,
        selectedProspectId: null,
        isBid: false,
      })
      pickNumber++
    }
  }

  return picks
}

// ---------------------------------------------------------------------------
// 2. generateRookieDraftOrder
// ---------------------------------------------------------------------------

/**
 * Generate the rookie draft pick order.
 *
 * Same reverse-ladder order as the national draft, but only 1 round of 18
 * picks. Pick numbers start at 55 (immediately after the national draft).
 *
 * @param ladder - The end-of-season ladder entries.
 * @returns An array of 18 DraftPick objects with pick numbers 55-72.
 */
export function generateRookieDraftOrder(
  ladder: LadderEntry[],
  clubs: Record<string, Club>,
  currentYear?: number,
): DraftPick[] {
  const totalClubs = ladder.length
  const sorted = [...ladder].sort((a, b) => {
    if (a.points !== b.points) return a.points - b.points
    return a.percentage - b.percentage
  })

  const picks: DraftPick[] = []
  const startingPickNumber = NATIONAL_DRAFT_ROUNDS * totalClubs + 1

  for (let i = 0; i < totalClubs; i++) {
    const originalClubId = sorted[i].clubId
    const ownerClubId = currentYear
      ? getDraftPickLedgerOwner(clubs, currentYear, 4, originalClubId)
      : originalClubId
    picks.push({
      pickNumber: startingPickNumber + i,
      round: 1,
      clubId: ownerClubId,
      originalClubId,
      selectedProspectId: null,
      isBid: false,
    })
  }

  return picks
}

// ---------------------------------------------------------------------------
// 3. aiSelectProspect
// ---------------------------------------------------------------------------

/**
 * Have an AI-controlled club select a prospect with the current pick.
 *
 * The selection algorithm considers the club's `draftPhilosophy` and
 * `competitiveWindow` personality traits:
 *
 * - **best-available**: Picks the highest-overall prospect on the board.
 * - **positional-need**: Identifies weak roster positions and prefers
 *   prospects that fill those gaps.
 * - **high-upside**: Weights `potentialCeiling` heavily, accepting a lower
 *   current rating for a higher ceiling.
 *
 * Competitive window further modifies selection:
 * - **win-now**: Favours ready-made players with high current ratings.
 * - **rebuilding**: Favours youth and high potential.
 * - **balanced**: Neutral.
 *
 * Father-Son / Academy linked prospects are always selected if the linked
 * club matches the picking club.
 *
 * @returns The `id` of the selected DraftProspect.
 */
export function aiSelectProspect(
  club: Club,
  _pick: DraftPick,
  availableProspects: DraftProspect[],
  players: Record<string, Player>,
  rng: SeededRNG,
  context?: {
    scoutingAccuracy?: number
    draftSuccess?: number
  },
  options?: { ngaAcademyEnabled?: boolean; ngaAcademyZoneMatching?: boolean },
): string {
  if (availableProspects.length === 0) {
    throw new Error(`No available prospects for club ${club.id} to select`)
  }

  // --- Father-Son / Academy: always pick a linked prospect if available ---
  // Skipped when ngaAcademy realism setting is disabled
  const ngaEnabled = options?.ngaAcademyEnabled !== false
  if (ngaEnabled) {
    const linkedProspect = availableProspects.find(
      (p) => p.linkedClubId === club.id && canLinkedClubMatchByType(p.linkedType, options),
    )
    if (linkedProspect) {
      return linkedProspect.id
    }
  }

  // --- Score each prospect based on club philosophy ---
  const { draftPhilosophy, competitiveWindow } = club.aiPersonality
  const neededPositions =
    draftPhilosophy === 'positional-need'
      ? identifyPositionalNeeds(players, club.id)
      : []
  const roleNeeds = roleNeedsByClub(players, club.id)
  const ageProfile = computeAgeProfile(players, club.id)

  let bestId = availableProspects[0].id
  let bestScore = -Infinity

  for (const prospect of availableProspects) {
    const valuation = estimateProspectValueForClub(prospect, club.id, context)
    const uncertaintyPenaltyByRisk: Record<Club['aiPersonality']['riskTolerance'], number> = {
      aggressive: 0.25,
      moderate: 0.45,
      conservative: 0.7,
    }
    const scoutingPenalty = (1 - valuation.confidence) * 16 * uncertaintyPenaltyByRisk[club.aiPersonality.riskTolerance]

    const strategyBase = (() => {
      switch (draftPhilosophy) {
        case 'best-available':
          return scoreBestAvailable(valuation.overall)
        case 'positional-need':
          return scorePositionalNeed(prospect, neededPositions, valuation.overall)
        case 'high-upside':
          return valuation.overall * 0.35 + valuation.potential * 0.65
      }
    })()

    let score: number

    score = strategyBase
    score = applyWindowModifier(
      score,
      prospect.age,
      valuation.overall,
      valuation.potential,
      competitiveWindow,
    )

    // Age-profile balancing:
    // - if list is old, prioritize younger options
    // - if list is very young and in win-now, prefer mature-ready age
    if (ageProfile.over29Ratio > 0.28) {
      score += prospect.age <= 18 ? 3.5 : prospect.age === 19 ? 2 : 0
    }
    if (competitiveWindow === 'win-now' && ageProfile.under23Ratio > 0.45) {
      score += prospect.age === 19 ? 2.2 : 0
      score -= prospect.age <= 17 ? 2.5 : 0
    }

    // Club identity/style alignment (gameplan + archetype/role).
    score += identityArchetypeBonus(club, prospect)
    score += getRoleNeedBonus(mapDraftProspectToPreferredRole(prospect), roleNeeds)

    // Scouting confidence weighting.
    score -= scoutingPenalty

    // Gentle identity bias by club market size:
    // small clubs value two-way utility and character-read prospects.
    if (club.tier === 'small' && (prospect.role === 'utility' || prospect.role === 'ground-pressure')) {
      score += 1.8
    }

    // Conservative clubs avoid very uncertain prospects with extreme upside.
    if (
      club.aiPersonality.riskTolerance === 'conservative' &&
      valuation.confidence < 0.35 &&
      valuation.potential - valuation.overall >= 16
    ) {
      score -= 2.8
    }

    // Add a small random element to avoid perfectly deterministic picks
    score += rng.nextFloat(-1.5, 1.5)

    if (score > bestScore) {
      bestScore = score
      bestId = prospect.id
    }
  }

  return bestId
}

// ---------------------------------------------------------------------------
// 4. processFatherSonBid
// ---------------------------------------------------------------------------

/**
 * Process a Father-Son or Academy bid for a linked prospect.
 *
 * Under AFL rules the linked club must "match the bid" by spending draft
 * points equivalent to the projected pick slot. The cost is determined by
 * the draft-value index at the prospect's projected pick position.
 *
 * @param prospect       - The prospect being bid on.
 * @param biddingClubId  - The club exercising their Father-Son / Academy right.
 * @param picks          - The remaining national draft picks (to find the
 *                         club's next available picks for matching).
 * @returns An object containing the bid cost in draft points and whether
 *          a pick adjustment was applied.
 */
export function processFatherSonBid(
  prospect: DraftProspect,
  biddingClubId: string,
  picks: DraftPick[],
): { bidCost: number; pickAdjusted: boolean } {
  const projectedPick = prospect.projectedPick
  const bidCost = getPickPoints(projectedPick)

  // Find the club's remaining unselected picks
  const clubPicks = picks.filter(
    (p) => p.clubId === biddingClubId && p.selectedProspectId === null,
  )

  if (clubPicks.length === 0) {
    // Club has no remaining picks to offset -- they still get the player
    // but at full cost with no adjustment
    return { bidCost, pickAdjusted: false }
  }

  // Accumulate the club's picks until they meet or exceed the bid cost.
  // Each consumed pick is "spent" to offset the cost.
  let accumulatedPoints = 0
  let picksUsed = 0

  for (const clubPick of clubPicks) {
    accumulatedPoints += getPickPoints(clubPick.pickNumber)
    picksUsed++
    if (accumulatedPoints >= bidCost) break
  }

  return {
    bidCost,
    pickAdjusted: picksUsed > 0,
  }
}

export function getMatchBidCost(
  prospect: DraftProspect,
  bidPickNumber: number,
): number {
  const referencePick = Math.max(1, Math.min(bidPickNumber, prospect.projectedPick))
  return getPickPoints(referencePick)
}

export function getMatchingClubPickIndicesForBid(
  picks: DraftPick[],
  currentPickIndex: number,
  matchingClubId: string,
  bidCost: number,
): { canMatch: boolean; consumedPickIndices: number[]; consumedPoints: number } {
  const future = picks
    .map((pick, idx) => ({ pick, idx }))
    .filter(({ pick, idx }) =>
      idx > currentPickIndex &&
      pick.clubId === matchingClubId &&
      pick.selectedProspectId === null,
    )

  let points = 0
  const consumed: number[] = []
  for (const candidate of future) {
    consumed.push(candidate.idx)
    points += getPickPoints(candidate.pick.pickNumber)
    if (points >= bidCost) break
  }

  return {
    canMatch: points >= bidCost,
    consumedPickIndices: consumed,
    consumedPoints: points,
  }
}

export function applyBidPickSliding(
  picks: DraftPick[],
  consumedPickIndices: number[],
): DraftPick[] {
  if (consumedPickIndices.length === 0) return picks
  const consumedSet = new Set(consumedPickIndices)
  const consumed = picks.filter((_, idx) => consumedSet.has(idx))
  const remaining = picks.filter((_, idx) => !consumedSet.has(idx))
  const reordered = [...remaining, ...consumed]
  return reordered.map((pick, idx) => ({
    ...pick,
    pickNumber: idx + 1,
  }))
}

// ---------------------------------------------------------------------------
// 5. convertProspectToPlayer
// ---------------------------------------------------------------------------

/**
 * Convert a DraftProspect into a full Player object for a club's roster.
 *
 * The new player receives:
 * - A 2-year minimum-salary contract ($110k AAV, restricted free agent)
 * - Baseline fitness (85), morale (80), no fatigue, neutral form (50)
 * - Zeroed career and season statistics
 * - `isRookie` set to `true` only for 'rookie-list' tier prospects
 *
 * @param prospect   - The draft prospect being converted.
 * @param clubId     - The club that drafted the player.
 * @param draftYear  - The year of the draft.
 * @param draftPick  - The overall pick number at which the prospect was taken.
 * @returns A fully formed Player object ready for the club roster.
 */
export function convertProspectToPlayer(
  prospect: DraftProspect,
  clubId: string,
  draftYear: number,
  draftPick: number,
  rng?: SeededRNG,
): Player {
  const preferredRole = mapDraftProspectToPreferredRole(prospect)
  return {
    id: prospect.id,
    firstName: prospect.firstName,
    lastName: prospect.lastName,
    age: prospect.age,
    dateOfBirth: `${draftYear - prospect.age}-01-01`,
    clubId,
    jerseyNumber: 0, // To be assigned by the club
    height: prospect.height,
    weight: prospect.weight,
    position: {
      primary: prospect.position.primary,
      secondary: prospect.position.secondary,
      ratings: {
        [prospect.position.primary]: 70,
        ...Object.fromEntries(
          prospect.position.secondary.map((pos) => [pos, 50]),
        ),
      },
    },
    preferredRole,
    archetype: prospect.archetype,
    attributes: { ...prospect.trueAttributes },
    hiddenAttributes: { ...prospect.hiddenAttributes },
    personality: { ...prospect.personality },
    agentArchetype: rng ? deriveAgentArchetype(prospect.personality, rng) : undefined,
    homeState: prospect.homeState,
    contract: {
      yearsRemaining: 2,
      aav: MINIMUM_SALARY,
      yearByYear: [MINIMUM_SALARY, MINIMUM_SALARY],
      isRestricted: true,
    },
    morale: 80,
    fitness: 85,
    fatigue: 0,
    form: 50,
    injury: null,
    isRookie: prospect.tier === 'rookie-list',
    listStatus: 'senior',
    draftYear,
    draftPick,
    careerStats: emptyStats(),
    seasonStats: emptyStats(),
    injuryHistory: [],
  }
}

// ---------------------------------------------------------------------------
// 6. applyPriorityPicks (AFL House Interference)
// ---------------------------------------------------------------------------

/**
 * When AFL House interference is enabled, bottom-2 clubs on the ladder
 * receive an additional priority pick inserted at positions 1-2.
 * Existing picks shift down.
 *
 * When disabled, returns the draft order unchanged.
 */
export function applyPriorityPicks(
  draftOrder: DraftPick[],
  ladder: LadderEntry[],
  enabled: boolean,
): DraftPick[] {
  if (!enabled) return draftOrder

  // Sort ladder worst to best
  const sorted = [...ladder].sort((a, b) => {
    if (a.points !== b.points) return a.points - b.points
    return a.percentage - b.percentage
  })

  // Bottom 2 clubs
  const bottomClubs = sorted.slice(0, 2).map((e) => e.clubId)

  // Build priority picks
  const priorityPicks: DraftPick[] = bottomClubs.map((clubId, i) => ({
    pickNumber: i + 1,
    round: 1,
    clubId,
    originalClubId: clubId,
    selectedProspectId: null,
    isBid: false,
  }))

  // Shift existing pick numbers up
  const shifted = draftOrder.map((p) => ({
    ...p,
    pickNumber: p.pickNumber + priorityPicks.length,
  }))

  return [...priorityPicks, ...shifted]
}

// ---------------------------------------------------------------------------
// 7. advanceDraftPick
// ---------------------------------------------------------------------------

/**
 * Record a selection on the current draft pick and advance the draft state.
 *
 * This function does **not** mutate the incoming state -- it returns a new
 * `DraftState` object with the updated pick, the prospect recorded as
 * drafted, and the pick index incremented.
 *
 * If the new pick index exceeds the national draft pick array length the
 * `nationalDraftComplete` flag is set to `true`.
 *
 * @param draftState         - The current draft state.
 * @param selectedProspectId - The ID of the prospect selected with this pick.
 * @returns A new DraftState reflecting the completed pick.
 */
export function advanceDraftPick(
  draftState: DraftState,
  selectedProspectId: string,
): DraftState {
  const { currentPickIndex, nationalDraftPicks } = draftState

  // Clone the picks array and record the selection on the current pick
  const updatedPicks = nationalDraftPicks.map((pick, index) => {
    if (index === currentPickIndex) {
      return { ...pick, selectedProspectId }
    }
    return pick
  })

  const nextIndex = currentPickIndex + 1
  const isComplete = nextIndex >= updatedPicks.length

  return {
    ...draftState,
    nationalDraftPicks: updatedPicks,
    currentPickIndex: nextIndex,
    nationalDraftComplete: isComplete,
    draftedProspectIds: [...draftState.draftedProspectIds, selectedProspectId],
  }
}

export function swapDraftPickOwners(
  picks: DraftPick[],
  outgoingPickIndex: number,
  incomingPickIndex: number,
): DraftPick[] {
  if (
    outgoingPickIndex < 0 ||
    incomingPickIndex < 0 ||
    outgoingPickIndex >= picks.length ||
    incomingPickIndex >= picks.length
  ) {
    return picks
  }

  const outgoing = picks[outgoingPickIndex]
  const incoming = picks[incomingPickIndex]
  if (!outgoing || !incoming) return picks
  if (outgoing.selectedProspectId || incoming.selectedProspectId) return picks

  return picks.map((pick, idx) => {
    if (idx === outgoingPickIndex) return { ...pick, clubId: incoming.clubId }
    if (idx === incomingPickIndex) return { ...pick, clubId: outgoing.clubId }
    return pick
  })
}

export function transferFuturePickOwnership(
  clubs: Record<string, Club>,
  move: {
    pick: ClubDraftPick
    fromClubId: string
    toClubId: string
  },
): Record<string, Club> {
  const fromClub = clubs[move.fromClubId]
  const toClub = clubs[move.toClubId]
  if (!fromClub || !toClub) return clubs

  const updated: Record<string, Club> = {}
  for (const [clubId, club] of Object.entries(clubs)) {
    updated[clubId] = {
      ...club,
      draftPicks: (club.draftPicks ?? []).map((p) => ({ ...p })),
    }
  }

  const key = `${move.pick.year}-${move.pick.round}-${move.pick.originalClubId}`
  const idx = updated[move.fromClubId].draftPicks.findIndex(
    (p) => `${p.year}-${p.round}-${p.originalClubId}` === key,
  )
  if (idx < 0) return updated

  const [picked] = updated[move.fromClubId].draftPicks.splice(idx, 1)
  updated[move.toClubId].draftPicks.push({
    ...picked,
    currentClubId: move.toClubId,
  })

  return updated
}
