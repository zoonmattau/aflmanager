import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { get, set, del } from 'idb-keyval'

import type { GameState, GamePhase, GameMeta, GameSettings, NewsItem } from '@/types/game'
import type { TradeInboxItem, TradeNegotiationOffer } from '@/types/trade'
import type { ScheduleSlot } from '@/types/calendar'
import type { TrainingFocus } from '@/engine/training/trainingEngine'
import type { GameHistory } from '@/types/history'
import type { Club } from '@/types/club'
import type { LineupSlot, Player } from '@/types/player'
import type { Match } from '@/types/match'
import type { Season, LadderEntry } from '@/types/season'
import type { ClubGameplan } from '@/types/club'
import type { GameCalendar } from '@/types/calendar'
import type { DraftPickTradeOffer, DraftProspect } from '@/types/draft'
import clubsJson from '@/data/clubs.json'
import { generatePlayers } from '@/data/players'
import { generateFixture, createInitialLadder } from '@/engine/season/fixtureGenerator'
import { validateFixture } from '@/engine/season/fixtureValidator'
import { simulateRound, isRegularSeasonComplete, applyPostRoundEffects } from '@/engine/season/advanceRound'
import { processMatchResults } from '@/engine/season/processResults'
import { generateFinalsRound, isSeasonComplete, getPremier } from '@/engine/season/finals'
import { recordSeasonResult } from '@/engine/history/historyEngine'
import { getFinalsFormatById } from '@/engine/season/finalsFormats'
import { applyInjuryEvent, rollMatchInjuries, healInjuries } from '@/engine/players/injuries'
import {
  applyTribunalOutcomeToPlayer,
  expirePendingUserTribunalCases,
  generateTribunalCasesFromMatches,
  resolveAITribunalCases,
  resolveUserTribunalCase,
  serveSuspensionWeeks,
} from '@/engine/players/tribunal'
import { isPlayerSuspended } from '@/engine/players/availability'
import { applyRoleDisputeMorale, updateMoralePostMatch } from '@/engine/players/morale'
import { selectBestLineup } from '@/engine/ai/lineupSelection'
import { SLOT_POSITION_COMPATIBILITY } from '@/engine/core/constants'
import { SeededRNG } from '@/engine/core/rng'
import { generateClubStaff, generateStaffPool, getCoachingImpact, getMedicalStaffImpact } from '@/engine/staff/staffEngine'
import { awardBrownlowVotes, computeSeasonAwards } from '@/engine/awards/awardsEngine'
import { buildSeasonCalendar, computeDefaultGameStartDate, getYear } from '@/engine/calendar/calendarEngine'
import { initializeStateLeagues, simStateLeagueRound } from '@/engine/stateLeague/stateLeagueEngine'
import { createDefaultSettings, DEFAULT_REALISM } from '@/engine/core/defaultSettings'
import { getDevelopmentSpeedMultiplier } from '@/engine/core/difficultyPresets'
import {
  getClubState,
  getTravelFatigue,
  generateDefaultAllocations,
  generateSoldGameOffers,
  applyVenueAllocationsToFixture,
  updateFanSatisfaction,
} from '@/engine/venues/venueEngine'
import { VENUES } from '@/data/venues'
import {
  initOffseason,
  advanceOffseasonPhase as advanceOffseasonPhaseEngine,
  canAdvancePhase,
  processSeasonEnd,
  processRetirements,
  processAIDelistings,
  processAITradePeriod,
  processPreseason,
  startNewSeason,
} from '@/engine/season/offseasonFlow'
import { mapPrimaryPositionToPreferredRole, pickArchetypeForRole } from '@/engine/player/roles'
import {
  generateDraftClassWithProfile,
  applyDraftVariance,
  stripLinkedClubs,
} from '@/engine/draft/prospects'
import {
  generateDraftOrder,
  generateRookieDraftOrder,
  applyPriorityPicks,
  aiSelectProspect,
  convertProspectToPlayer,
  ensureDraftPickLedger,
  pruneExpiredDraftPicks,
  swapDraftPickOwners,
  transferFuturePickOwnership,
  getMatchBidCost,
  getMatchingClubPickIndicesForBid,
  applyBidPickSliding,
} from '@/engine/draft/draftEngine'
import {
  generateScoutPool,
  hireScout,
  fireScout,
  assignScoutToRegion,
  runScoutingSessions,
  runDraftCombineEvent,
} from '@/engine/draft/scouting'
import type { ScoutingRegion } from '@/types/draft'
import { resolveListConstraints, canAddToSeniorList } from '@/engine/rules/listRules'
import { MINIMUM_SALARY } from '@/engine/core/constants'
import {
  initOffseasonCalendar,
  advanceHalfDay as advanceHalfDayEngine,
  advanceToNextMilestone as advanceToNextMilestoneEngine,
} from '@/engine/offseason/offseasonCalendar'
import { syncClubCurrentSpend, calculateSeasonEndFinancials } from '@/engine/salary/salaryCapEngine'
import type { NegotiationOffer } from '@/types/contract'
import {
  initNegotiationTracker,
  getPlayerNegotiationEligibility,
  startNegotiation,
  submitOffer as submitNegotiationOffer,
  tickNegotiations,
  withdrawNegotiation,
  acceptCounterOffer as acceptCounterOfferEngine,
  buildContractFromOffer,
  completeNegotiation,
} from '@/engine/contracts/negotiationEngine'
import { processAIReSignings } from '@/engine/contracts/aiNegotiations'
import {
  buildFreeAgentMarket,
  generateAIBids,
  submitUserBid,
  withdrawUserBid,
  resolveMarket,
} from '@/engine/contracts/freeAgencyMarket'
import {
  proposeUserTrade,
  evaluateIncomingUserOffer,
  executeTradeOffer,
  generateTradeInboxOffers,
  expireTradeInboxItems,
  validateTradeOfferForUser,
  generatePlayerTradeRequests,
  counterByUser,
  initTradeBlockState,
  setPlayerTradeBlockListing,
  removePlayerTradeBlockListing,
  generateTradeBlockEnquiries,
  getDemandByPlayerFromTradeBlock,
  validateTradeConsent,
} from '@/engine/trades/tradeNegotiationEngine'
import { applyGameplanAdjustment, buildCounterAdjustment } from '@/engine/coaching/tacticalAdjustments'

// ---------------------------------------------------------------------------
// IndexedDB storage adapter (via idb-keyval)
// ---------------------------------------------------------------------------
const idbStorage: {
  getItem: (name: string) => Promise<string | null>
  setItem: (name: string, value: string) => Promise<void>
  removeItem: (name: string) => Promise<void>
} = {
  getItem: async (name: string) => {
    const val = await get(name)
    return (val as string) ?? null
  },
  setItem: async (name: string, value: string) => {
    await set(name, value)
  },
  removeItem: async (name: string) => {
    await del(name)
  },
}

// ---------------------------------------------------------------------------
// Sensible defaults
// ---------------------------------------------------------------------------
const DEFAULT_HISTORY: GameHistory = {
  seasons: [],
  draftHistory: [],
  developmentReports: [],
}

const DEFAULT_META: GameMeta = {
  id: '',
  saveName: '',
  createdAt: '',
  lastSaved: '',
  version: '0.1.0',
}

const DEFAULT_SEASON: Season = {
  year: 2026,
  rounds: [],
  finalsRounds: [],
}

const DEFAULT_CALENDAR: GameCalendar = {
  events: [],
  currentDate: '2026-03-01',
}

const createDefaultState = (): GameState => ({
  meta: { ...DEFAULT_META },
  settings: createDefaultSettings(),
  phase: 'setup',
  playerClubId: '',
  currentYear: 2026,
  currentRound: 0,
  currentDate: '2026-03-01',
  clubs: {},
  players: {},
  staff: {},
  season: { ...DEFAULT_SEASON },
  ladder: [],
  matchResults: [],
  newsLog: [],
  rngSeed: Date.now(),
  selectedLineup: null,
  draft: null,
  scouts: [],
  tradeHistory: [],
  history: { ...DEFAULT_HISTORY },
  leagueConfig: {
    activeClubIds: [],
    expansionPlans: [],
    totalTeams: 18,
  },
  calendar: { ...DEFAULT_CALENDAR },
  weekSchedule: {},
  awards: [],
  brownlowTracker: [],
  brownlowRevealed: false,
  stateLeagues: null,
  offseasonState: null,
  venueState: null,
  negotiations: null,
  tradeInbox: [],
  tradeBlock: initTradeBlockState(),
  tribunalInbox: [],
  weeklyGameplans: {},
})

function getAvailableProspectsForDraft(
  prospects: DraftProspect[],
  draftedIds: string[],
): DraftProspect[] {
  const drafted = new Set(draftedIds)
  return prospects.filter((p) => !drafted.has(p.id))
}

function estimateDraftProspectBoardValue(
  prospect: DraftProspect,
  clubId: string,
): number {
  const report = prospect.scoutingReports[clubId]
  if (report) return report.overallEstimate * 0.7 + report.potentialEstimate * 0.3
  const tierBase: Record<DraftProspect['tier'], number> = {
    elite: 72,
    'first-round': 62,
    'second-round': 54,
    late: 47,
    'rookie-list': 41,
  }
  return tierBase[prospect.tier] + Math.max(0, (80 - prospect.projectedPick) * 0.14)
}

function canUseLinkedBidMatching(
  prospect: DraftProspect,
  settings: GameSettings,
): boolean {
  if (!prospect.linkedClubId || !prospect.linkedType) return false
  if (!settings.realism.ngaAcademy) return false
  if (prospect.linkedType === 'father-son') return true
  if (!settings.realism.ngaAcademyZoneMatching) return false
  return prospect.linkedType === 'academy' || prospect.linkedType === 'nga'
}

function resolveLinkedBidMatch(params: {
  draft: NonNullable<GameState['draft']>
  pickIndex: number
  selectingClubId: string
  selectedProspect: DraftProspect
  settings: GameSettings
}): {
  matched: boolean
  awardedClubId: string
  updatedPicks: import('@/types/draft').DraftPick[]
  bidCost: number
  consumedPickIndices: number[]
} {
  const { draft, pickIndex, selectingClubId, selectedProspect, settings } = params
  if (!selectedProspect.linkedClubId || selectedProspect.linkedClubId === selectingClubId) {
    return {
      matched: false,
      awardedClubId: selectingClubId,
      updatedPicks: draft.nationalDraftPicks,
      bidCost: 0,
      consumedPickIndices: [],
    }
  }
  if (!canUseLinkedBidMatching(selectedProspect, settings)) {
    return {
      matched: false,
      awardedClubId: selectingClubId,
      updatedPicks: draft.nationalDraftPicks,
      bidCost: 0,
      consumedPickIndices: [],
    }
  }

  const currentPick = draft.nationalDraftPicks[pickIndex]
  if (!currentPick) {
    return {
      matched: false,
      awardedClubId: selectingClubId,
      updatedPicks: draft.nationalDraftPicks,
      bidCost: 0,
      consumedPickIndices: [],
    }
  }

  const bidCost = getMatchBidCost(selectedProspect, currentPick.pickNumber)
  const match = getMatchingClubPickIndicesForBid(
    draft.nationalDraftPicks,
    pickIndex,
    selectedProspect.linkedClubId,
    bidCost,
  )
  if (!match.canMatch) {
    return {
      matched: false,
      awardedClubId: selectingClubId,
      updatedPicks: draft.nationalDraftPicks,
      bidCost,
      consumedPickIndices: [],
    }
  }

  const picksWithMatchedSelection = draft.nationalDraftPicks.map((p, idx) =>
    idx === pickIndex ? { ...p, clubId: selectedProspect.linkedClubId as string, isBid: true } : p,
  )
  const slid = applyBidPickSliding(picksWithMatchedSelection, match.consumedPickIndices)
  return {
    matched: true,
    awardedClubId: selectedProspect.linkedClubId,
    updatedPicks: slid,
    bidCost,
    consumedPickIndices: match.consumedPickIndices,
  }
}

function buildSimLineupForClub(
  state: GameState,
  clubId: string,
): Record<string, string> {
  if (clubId === state.playerClubId && state.selectedLineup) {
    const sanitized: Record<string, string> = {}
    for (const [slot, playerId] of Object.entries(state.selectedLineup)) {
      const p = state.players[playerId]
      if (!p || p.clubId !== clubId || p.injury || isPlayerSuspended(p)) continue
      sanitized[slot] = playerId
    }
    if (Object.keys(sanitized).length > 0) return sanitized
  }
  const lineup = selectBestLineup(Object.values(state.players), clubId).lineup
  return lineup
}

function applyRoleDisputesForFixtures(state: GameState, fixtureClubIds: Set<string>): void {
  if (!state.settings.realism.playerRoleDisputes) return

  for (const clubId of fixtureClubIds) {
    const lineup = buildSimLineupForClub(state, clubId)
    for (const [slotKey, playerId] of Object.entries(lineup)) {
      const player = state.players[playerId]
      if (!player || player.clubId !== clubId) continue
      const slot = slotKey as LineupSlot
      const assignedPosition = SLOT_POSITION_COMPATIBILITY[slot]?.[0] ?? player.position.primary
      applyRoleDisputeMorale(
        player,
        assignedPosition,
        state.settings.realism.playerRoleDisputes,
        slot,
      )
    }
  }
}

function buildStaffImpactMaps(state: GameState): {
  tacticalByClub: Record<string, { tacticalAdjustment: number; discipline: number }>
  scoutingByClub: Record<string, number>
  draftByClub: Record<string, number>
} {
  const staffList = Object.values(state.staff)
  const tacticalByClub: Record<string, { tacticalAdjustment: number; discipline: number }> = {}
  const scoutingByClub: Record<string, number> = {}
  const draftByClub: Record<string, number> = {}

  for (const clubId of Object.keys(state.clubs)) {
    const impact = getCoachingImpact(staffList, clubId)
    tacticalByClub[clubId] = {
      tacticalAdjustment: impact.tacticalAdjustment || 0.7,
      discipline: Math.round((impact.moraleBonus || 0) * 200),
    }
    scoutingByClub[clubId] = impact.scoutingAccuracy || 1
    draftByClub[clubId] = impact.draftSuccess || 1
  }

  return { tacticalByClub, scoutingByClub, draftByClub }
}

function createLiveDraftPickTradeOffers(params: {
  draft: NonNullable<GameState['draft']>
  clubs: Record<string, Club>
  players: Record<string, Player>
  staff: Record<string, import('@/types/staff').StaffMember>
  playerClubId: string
  settings: GameSettings
  currentDate: string
  currentYear: number
  rng: SeededRNG
}): DraftPickTradeOffer[] {
  const { draft, clubs, players, staff, playerClubId, settings, currentDate, currentYear, rng } = params
  const idx = draft.currentPickIndex
  if (idx < 0 || idx >= draft.nationalDraftPicks.length) return []

  const currentPick = draft.nationalDraftPicks[idx]
  if (!currentPick || currentPick.clubId !== playerClubId || currentPick.selectedProspectId) return []

  const existingPending = (draft.pickTradeOffers ?? []).some(
    (o) => o.status === 'pending' && o.currentPickIndex === idx,
  )
  if (existingPending) return []

  const available = getAvailableProspectsForDraft(draft.prospects, draft.draftedProspectIds)
  if (available.length < 3) return []

  const candidates = draft.nationalDraftPicks
    .map((pick, pickIndex) => ({ pick, pickIndex }))
    .filter(({ pick, pickIndex }) =>
      pickIndex > idx &&
      pickIndex <= idx + 18 &&
      pick.clubId !== playerClubId &&
      pick.selectedProspectId === null,
    )

  const offers: DraftPickTradeOffer[] = []
  for (const candidate of candidates) {
    if (offers.length >= 2) break
    const aiClub = clubs[candidate.pick.clubId]
    if (!aiClub) continue

    const aiStaffImpact = getCoachingImpact(Object.values(staff), aiClub.id)
    const targetNowId = aiSelectProspect(
      aiClub,
      currentPick,
      available,
      players,
      rng,
      {
        scoutingAccuracy: aiStaffImpact.scoutingAccuracy || 1,
        draftSuccess: aiStaffImpact.draftSuccess || 1,
      },
      {
        ngaAcademyEnabled: settings.realism.ngaAcademy,
        ngaAcademyZoneMatching: settings.realism.ngaAcademyZoneMatching,
      },
    )
    const targetNow = available.find((p) => p.id === targetNowId)
    if (!targetNow) continue

    const aiPick = candidate.pick
    const spotsToMove = candidate.pickIndex - idx
    const boardDelta = estimateDraftProspectBoardValue(targetNow, aiClub.id)
      - (aiPick.pickNumber * 0.35)
    const strategyBoost =
      aiClub.aiPersonality.competitiveWindow === 'win-now' ? 10
        : aiClub.aiPersonality.competitiveWindow === 'rebuilding' ? 6
          : 8
    const urgency = boardDelta + strategyBoost - spotsToMove * 1.8
    if (urgency < 12) continue

    const futurePickPool = (clubs[aiClub.id].draftPicks ?? [])
      .filter((p) => p.currentClubId === aiClub.id && p.year >= currentYear + 1)
      .sort((a, b) => a.year - b.year || a.round - b.round)
    const sweetener = futurePickPool.find((p) => p.round === 2) ?? futurePickPool.find((p) => p.round === 3)
    const offeredFuturePicks = sweetener ? [sweetener] : []

    offers.push({
      id: `draft_offer_${crypto.randomUUID()}`,
      createdAt: currentDate,
      status: 'pending',
      fromClubId: aiClub.id,
      toClubId: playerClubId,
      currentPickIndex: idx,
      incomingPickIndex: candidate.pickIndex,
      offeredFuturePicks,
      requestedFuturePicks: [],
      message:
        `${aiClub.abbreviation} want to move up from #${aiPick.pickNumber} to #${currentPick.pickNumber}` +
        ` for ${targetNow.firstName} ${targetNow.lastName}.`,
      targetProspectId: targetNow.id,
    })
  }

  return offers
}

// ---------------------------------------------------------------------------
// Store actions interface
// ---------------------------------------------------------------------------
interface GameActions {
  // Mutations
  initializeGame: (clubId: string, saveName: string, settings?: GameSettings, fictionalClubs?: Club[]) => void
  setPhase: (phase: GamePhase) => void
  advanceRound: () => void
  updatePlayer: (playerId: string, updates: Partial<Player>) => void
  updateClub: (clubId: string, updates: Partial<Club>) => void
  addMatchResult: (match: Match) => void
  updateLadder: (ladder: LadderEntry[]) => void
  setSelectedLineup: (lineup: Record<string, string> | null) => void
  addNewsItem: (item: NewsItem) => void
  markNewsRead: (newsId: string) => void
  markAllNewsRead: () => void
  resetGame: () => void
  updateGameplan: (gameplan: Partial<ClubGameplan>) => void
  updateWeeklyGameplanAdjustment: (gameplan: Partial<ClubGameplan>) => { success: boolean; error?: string }
  clearWeeklyGameplanAdjustment: () => void
  generateWeeklyCounterGameplanForUser: () => { success: boolean; error?: string }
  hireStaffMember: (staffId: string, contractYears: number) => void
  fireStaffMember: (staffId: string) => void
  saveGame: () => void
  sendToReserves: (playerId: string) => void
  recallFromReserves: (playerId: string) => void
  setDaySlot: (date: string, slot: ScheduleSlot, activity: TrainingFocus | 'rest' | null) => void
  clearWeekSchedule: () => void

  // History
  recordUserDraftPick: (entry: import('@/types/history').DraftHistoryEntry) => void

  // Season progression
  simCurrentRound: () => { userMatch: Match | null }
  simToEnd: () => void
  startFinals: () => void
  simFinalsRound: () => { userMatch: Match | null; seasonOver: boolean }

  // Offseason
  enterOffseason: () => void
  advanceOffseasonPhase: () => { success: boolean; error: string | null }
  delistPlayerOffseason: (playerId: string) => void
  signUnsignedPlayer: (playerId: string, years: number, aav: number) => { success: boolean; error?: string }
  startNewSeasonAction: () => void
  acceptVenueOffer: (offerId: string) => void
  rejectVenueOffer: (offerId: string) => void
  setSecondaryHomeGames: (count: number) => void

  // Offseason sim controls
  simOffseasonHalfDay: () => void
  simOffseasonFullDay: () => void
  simOffseasonToMilestone: () => void

  // Free agency market
  buildFreeAgencyMarketAction: () => void
  submitFreeAgencyBidAction: (playerId: string, aav: number, years: number) => { success: boolean; error?: string }
  withdrawFreeAgencyBidAction: (playerId: string) => void
  resolveFreeAgencyMarketAction: () => void
  signSupplementalPlayer: (playerId: string, years: number, aav: number) => { success: boolean; error?: string }

  // Contract negotiations
  startContractNegotiation: (playerId: string) => { success: boolean; error?: string; negotiationId?: string }
  submitContractOffer: (negotiationId: string, offer: NegotiationOffer) => { success: boolean; error?: string }
  withdrawContractNegotiation: (negotiationId: string) => void
  acceptContractCounterOffer: (negotiationId: string) => { success: boolean; error?: string }

  // Trade inbox / negotiation
  proposeTradeOffer: (partnerClubId: string, sendPlayerIds: string[], receivePlayerIds: string[]) => { success: boolean; error?: string; accepted?: boolean; counterOfferId?: string }
  respondToTradeOffer: (offerId: string, decision: 'accept' | 'reject' | 'counter') => { success: boolean; error?: string; counterOfferId?: string }
  generateTradeInboxOffersAction: () => number
  markTradeOfferRead: (offerId: string) => void
  setPlayerTradeAvailability: (playerId: string, availability: 'available' | 'reluctant' | 'salary-dump') => { success: boolean; error?: string }
  clearPlayerTradeAvailability: (playerId: string) => void
  respondToTribunalCase: (caseId: string, decision: 'accept' | 'challenge') => { success: boolean; error?: string }
  markTribunalCaseRead: (caseId: string) => void

  // Scouting
  hireScoutAction: (scoutId: string) => { success: boolean; error?: string }
  fireScoutAction: (scoutId: string) => { success: boolean; error?: string }
  assignScoutRegionAction: (scoutId: string, region: ScoutingRegion | null) => { success: boolean; error?: string }
  runScoutingSessionAction: () => { success: boolean; error?: string }
  runDraftCombineAction: () => { success: boolean; error?: string }
  startLiveDraftAction: () => { success: boolean; error?: string }
  advanceDraftToNextUserPickAction: () => { success: boolean; error?: string }
  makeUserDraftSelectionAction: (prospectId: string) => { success: boolean; error?: string }
  respondToDraftPickTradeOfferAction: (offerId: string, decision: 'accept' | 'reject') => { success: boolean; error?: string }

  // Brownlow
  revealBrownlow: () => void

  // Computed / derived
  getPlayersByClub: (clubId: string) => Player[]
  getCurrentRoundData: () => import('@/types/season').Round | null
  isUserInFinals: () => boolean
}

export type GameStore = GameState & GameActions

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export const useGameStore = create<GameStore>()(
  persist(
    immer((set, get) => ({
      // ---- State ----
      ...createDefaultState(),

      // ---- Actions ----

      initializeGame: (clubId: string, saveName: string, settings?: GameSettings, fictionalClubs?: Club[]) => {
        const now = new Date().toISOString()
        const gameId = crypto.randomUUID()
        const seed = Date.now()

        const gameSettings = settings ?? createDefaultSettings()

        // Build clubs record from static JSON or fictional clubs
        const clubsRecord: Record<string, Club> = {}
        const clubSource = fictionalClubs && fictionalClubs.length > 0
          ? fictionalClubs
          : (clubsJson as Club[])
        for (const c of clubSource) {
          clubsRecord[c.id] = {
            ...c,
            draftPicks: (c.draftPicks ?? []).map((p) => ({ ...p })),
          }
        }
        const clubsWithPicks = ensureDraftPickLedger(clubsRecord, 2026, 2)

        // Generate players for all clubs
        const playersRecord: Record<string, Player> = {}
        for (const c of clubSource) {
          const clubPlayers = generatePlayers(c.id, seed + hashCode(c.id))
          for (const p of clubPlayers) {
            playersRecord[p.id] = p
          }
        }

        // Generate staff for all clubs + a free agent pool
        const staffRecord: Record<string, import('@/types/staff').StaffMember> = {}
        const staffRng = new SeededRNG(seed + 7777)
        for (const c of clubSource) {
          const clubStaff = generateClubStaff(c.id, staffRng)
          for (const s of clubStaff) {
            staffRecord[s.id] = s
          }
        }
        // Generate a pool of available coaches for hiring
        const freeAgentStaff = generateStaffPool(20, staffRng)
        for (const s of freeAgentStaff) {
          staffRecord[s.id] = s
        }

        // Generate scouting pool and auto-staff AI clubs with baseline scouts
        const scoutRng = new SeededRNG(seed + 9191)
        const scoutPool = generateScoutPool(Math.max(72, clubSource.length * 5), scoutRng)
        const scoutRegions: ScoutingRegion[] = ['VIC', 'SA', 'WA', 'NSW/ACT', 'QLD', 'TAS', 'NT']
        for (const c of clubSource) {
          if (c.id === clubId) continue
          const available = scoutPool.filter((s) => s.clubId === '')
          const toHire = Math.min(2, available.length)
          for (let i = 0; i < toHire; i++) {
            const picked = available[i]
            if (!picked) continue
            picked.clubId = c.id
            picked.assignedRegion = scoutRng.pick(scoutRegions)
          }
        }

        // Generate fixture using settings-driven options
        const season = generateFixture({
          clubs: clubsWithPicks,
          seed,
          playerClubId: clubId,
          settings: gameSettings,
        })

        // Validate fixture (warn-and-proceed on failure)
        const fixtureErrors = validateFixture(season.rounds, Object.keys(clubsRecord))
        if (fixtureErrors.length > 0) {
          console.warn('[initializeGame] Fixture validation errors:', fixtureErrors)
        }

        // Create initial ladder
        const ladder = createInitialLadder(Object.keys(clubsWithPicks))

        set((state) => {
          const defaults = createDefaultState()
          Object.assign(state, defaults)

          state.meta = {
            id: gameId,
            saveName,
            createdAt: now,
            lastSaved: now,
            version: '0.1.0',
          }

          state.playerClubId = clubId
          state.currentYear = 2026
          state.currentRound = 0

          // Determine starting phase: if gameStartDate is before seasonStartDate, start in offseason
          const seasonStart = gameSettings.seasonStartDate ?? '2026-03-20'
          const gameStart = gameSettings.gameStartDate ?? seasonStart
          if (gameStart < seasonStart) {
            state.phase = 'offseason'
            state.currentDate = gameStart
            state.offseasonState = initOffseason()
          } else {
            state.phase = 'regular-season'
            state.currentDate = seasonStart
          }
          state.rngSeed = seed
          state.selectedLineup = null

          state.settings = gameSettings

          state.clubs = clubsWithPicks
          state.players = playersRecord
          state.staff = staffRecord
          state.scouts = scoutPool
          state.season = season
          state.ladder = ladder
          state.history = { seasons: [], draftHistory: [], developmentReports: [] }
          state.leagueConfig = {
            activeClubIds: Object.keys(clubsWithPicks),
            expansionPlans: [],
            totalTeams: Object.keys(clubsWithPicks).length,
          }

          // Build season calendar (settings-driven finals weeks + start date + game start date for offseason)
          state.calendar = buildSeasonCalendar(2026, season, clubId, gameSettings.finals, gameSettings.seasonStartDate, gameSettings.gameStartDate)

          // Initialize state leagues (VFL/SANFL/WAFL)
          if (gameSettings.leagueMode !== 'fictional') {
            state.stateLeagues = initializeStateLeagues(clubsRecord, 2026, seed)
          }

          // Initialize venue system for the first season
          if (gameSettings.realism.venueScheduling) {
            const venueRng = new SeededRNG(seed + 9999)
            const clubIds = Object.keys(clubsRecord)
            const allocations = generateDefaultAllocations(clubIds, clubsRecord, venueRng)

            // Auto-accept sold games for AI clubs
            for (const cid of clubIds) {
              if (cid === clubId) continue
              const club = clubsRecord[cid]
              if (!club) continue
              const config = allocations[cid]
              if (!config) continue
              const acceptChance = club.tier === 'small' ? 0.7 : club.tier === 'medium' ? 0.4 : 0.2
              const numOffers = venueRng.nextInt(0, 2)
              for (let i = 0; i < numOffers; i++) {
                if (venueRng.chance(acceptChance)) {
                  const neutralVenues = ['utas-stadium', 'blundstone-arena', 'manuka-oval', 'tio-stadium', 'mars-stadium']
                  const venueId = venueRng.pick(neutralVenues)
                  const payment = venueRng.nextInt(150, 400) * 1000
                  config.soldHomeGames.push({ venueId, payment })
                  config.homeGamesAtPrimary = Math.max(0, config.homeGamesAtPrimary - 1)
                }
              }
            }

            const assignments = applyVenueAllocationsToFixture(season, allocations, venueRng)
            state.venueState = {
              allocations,
              assignments,
              accumulatedRevenue: {},
            }
          }

          // Sync currentSpend for all clubs on initialization
          const allPlayers = Object.values(state.players)
          for (const club of Object.values(state.clubs)) {
            club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
          }
        })
      },

      setPhase: (phase: GamePhase) => {
        set((state) => {
          state.phase = phase
        })
      },

      advanceRound: () => {
        set((state) => {
          state.currentRound += 1
        })
      },

      updatePlayer: (playerId: string, updates: Partial<Player>) => {
        set((state) => {
          const existing = state.players[playerId]
          if (existing) {
            Object.assign(existing, updates)
          }
        })
      },

      updateClub: (clubId: string, updates: Partial<Club>) => {
        set((state) => {
          const existing = state.clubs[clubId]
          if (existing) {
            Object.assign(existing, updates)
          }
        })
      },

      addMatchResult: (match: Match) => {
        set((state) => {
          state.matchResults.push(match)
        })
      },

      updateLadder: (ladder: LadderEntry[]) => {
        set((state) => {
          state.ladder = ladder
        })
      },

      setSelectedLineup: (lineup: Record<string, string> | null) => {
        set((state) => {
          state.selectedLineup = lineup
        })
      },

      addNewsItem: (item: NewsItem) => {
        set((state) => {
          state.newsLog.push(item)
        })
      },

      markNewsRead: (newsId: string) => {
        set((state) => {
          const item = state.newsLog.find((n) => n.id === newsId)
          if (item) item.read = true
        })
      },

      markAllNewsRead: () => {
        set((state) => {
          for (const item of state.newsLog) {
            item.read = true
          }
        })
      },

      proposeTradeOffer: (partnerClubId: string, sendPlayerIds: string[], receivePlayerIds: string[]) => {
        const state = get()
        if (!state.clubs[partnerClubId]) {
          return { success: false, error: 'Trade partner not found' }
        }
        if (sendPlayerIds.length === 0 || receivePlayerIds.length === 0) {
          return { success: false, error: 'Trade must include assets on both sides' }
        }

        const rng = new SeededRNG(state.rngSeed + Date.now())
        const baseOffer = proposeUserTrade(
          state.playerClubId,
          partnerClubId,
          sendPlayerIds,
          receivePlayerIds,
          state.currentDate,
          rng,
        )

        const valid = validateTradeOfferForUser(baseOffer, state.players, state.clubs, state.settings)
        if (!valid.ok) {
          return { success: false, error: valid.error ?? 'Trade validation failed' }
        }

        const evalResult = evaluateIncomingUserOffer(
          baseOffer,
          state.players,
          state.clubs,
          state.settings,
          state.currentYear,
          state.currentDate,
          state.playerClubId,
          rng,
          getDemandByPlayerFromTradeBlock(state.tradeBlock),
        )

        if (!evalResult.accepted) {
          if (evalResult.aiCounter) {
            const counterInboxId = crypto.randomUUID()
            set((s) => {
              s.tradeInbox.push({
                id: counterInboxId,
                offer: evalResult.aiCounter as TradeNegotiationOffer,
                read: false,
              })
            })
            return { success: true, accepted: false, counterOfferId: counterInboxId }
          }
          return { success: false, error: evalResult.reason ?? 'Trade rejected' }
        }

        const consent = validateTradeConsent(baseOffer, state.players, state.clubs, state.settings, rng)
        if (!consent.ok) {
          return { success: false, error: consent.reason ?? 'A player refused the trade' }
        }
        const executed = executeTradeOffer(baseOffer, state.players, state.clubs, state.currentDate)
        set((s) => {
          s.players = executed.updatedPlayers
          s.clubs = executed.updatedClubs
          s.tradeHistory.push(executed.completedTrade)
          s.newsLog.push(executed.news)
          for (const moved of baseOffer.playerMoves) {
            s.tradeBlock = removePlayerTradeBlockListing(s.tradeBlock, moved.playerId)
          }
          const allPlayers = Object.values(s.players)
          for (const club of Object.values(s.clubs)) {
            club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
          }
        })

        return { success: true, accepted: true }
      },

      respondToTradeOffer: (offerId: string, decision: 'accept' | 'reject' | 'counter') => {
        const state = get()
        const inboxItem = state.tradeInbox.find((item) => item.id === offerId)
        if (!inboxItem) return { success: false, error: 'Offer not found' }
        const offer = inboxItem.offer
        if (offer.status !== 'pending-user') {
          return { success: false, error: 'Offer is no longer active' }
        }

        if (decision === 'reject') {
          set((s) => {
            const item = s.tradeInbox.find((i) => i.id === offerId)
            if (!item) return
            item.offer.status = 'rejected'
            item.read = true
          })
          return { success: true }
        }

        if (decision === 'accept') {
          const valid = validateTradeOfferForUser(offer, state.players, state.clubs, state.settings)
          if (!valid.ok) {
            return { success: false, error: valid.error ?? 'Trade cannot be executed' }
          }

          const consent = validateTradeConsent(offer, state.players, state.clubs, state.settings, new SeededRNG(state.rngSeed + Date.now()))
          if (!consent.ok) {
            return { success: false, error: consent.reason ?? 'A player refused the trade' }
          }
          const executed = executeTradeOffer(offer, state.players, state.clubs, state.currentDate)
          set((s) => {
            const item = s.tradeInbox.find((i) => i.id === offerId)
            if (item) {
              item.offer.status = 'accepted'
              item.read = true
            }
            s.players = executed.updatedPlayers
            s.clubs = executed.updatedClubs
            s.tradeHistory.push(executed.completedTrade)
            s.newsLog.push(executed.news)
            for (const moved of offer.playerMoves) {
              s.tradeBlock = removePlayerTradeBlockListing(s.tradeBlock, moved.playerId)
            }
            const allPlayers = Object.values(s.players)
            for (const club of Object.values(s.clubs)) {
              club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
            }
          })
          return { success: true }
        }

        const rng = new SeededRNG(state.rngSeed + Date.now())
        const userCounter = counterByUser(offer, state.playerClubId, state.players, rng, state.currentDate)
        if (!userCounter) {
          return { success: false, error: 'Counteroffers are only available for two-club offers with valid assets' }
        }

        const evalResult = evaluateIncomingUserOffer(
          userCounter,
          state.players,
          state.clubs,
          state.settings,
          state.currentYear,
          state.currentDate,
          state.playerClubId,
          rng,
          getDemandByPlayerFromTradeBlock(state.tradeBlock),
        )

        if (evalResult.accepted) {
          const consent = validateTradeConsent(userCounter, state.players, state.clubs, state.settings, rng)
          if (!consent.ok) {
            return { success: false, error: consent.reason ?? 'A player refused the trade' }
          }
          const executed = executeTradeOffer(userCounter, state.players, state.clubs, state.currentDate)
          set((s) => {
            const item = s.tradeInbox.find((i) => i.id === offerId)
            if (item) {
              item.offer.status = 'countered'
              item.read = true
            }
            s.players = executed.updatedPlayers
            s.clubs = executed.updatedClubs
            s.tradeHistory.push(executed.completedTrade)
            s.newsLog.push(executed.news)
            for (const moved of userCounter.playerMoves) {
              s.tradeBlock = removePlayerTradeBlockListing(s.tradeBlock, moved.playerId)
            }
            const allPlayers = Object.values(s.players)
            for (const club of Object.values(s.clubs)) {
              club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
            }
          })
          return { success: true }
        }

        if (evalResult.aiCounter) {
          const newInboxId = crypto.randomUUID()
          set((s) => {
            const item = s.tradeInbox.find((i) => i.id === offerId)
            if (item) {
              item.offer.status = 'countered'
              item.read = true
            }
            s.tradeInbox.push({
              id: newInboxId,
              offer: evalResult.aiCounter as TradeNegotiationOffer,
              read: false,
            })
          })
          return { success: true, counterOfferId: newInboxId }
        }

        set((s) => {
          const item = s.tradeInbox.find((i) => i.id === offerId)
          if (item) {
            item.offer.status = 'rejected'
            item.read = true
          }
        })
        return { success: false, error: evalResult.reason ?? 'Counteroffer rejected' }
      },

      generateTradeInboxOffersAction: () => {
        const state = get()
        const rng = new SeededRNG(state.rngSeed + Date.now())
        const generated = generateTradeInboxOffers(
          state.players,
          state.clubs,
          state.settings,
          state.playerClubId,
          state.currentDate,
          state.currentYear,
          state.tradeInbox,
          rng,
          getDemandByPlayerFromTradeBlock(state.tradeBlock),
        )
        if (generated.length > 0) {
          set((s) => {
            s.tradeInbox.push(...generated)
          })
        }
        return generated.length
      },

      markTradeOfferRead: (offerId: string) => {
        set((s) => {
          const item = s.tradeInbox.find((i) => i.id === offerId)
          if (item) item.read = true
        })
      },

      setPlayerTradeAvailability: (playerId: string, availability: 'available' | 'reluctant' | 'salary-dump') => {
        const state = get()
        const player = state.players[playerId]
        if (!player) return { success: false, error: 'Player not found' }
        if (player.clubId !== state.playerClubId) {
          return { success: false, error: 'Can only list players from your club' }
        }
        if (player.injury) {
          return { success: false, error: 'Cannot list injured players on trade block' }
        }
        if (isPlayerSuspended(player)) {
          return { success: false, error: 'Cannot list suspended players on trade block' }
        }

        set((s) => {
          s.tradeBlock = setPlayerTradeBlockListing(
            s.tradeBlock,
            playerId,
            s.playerClubId,
            s.currentDate,
            availability,
          )
        })
        return { success: true }
      },

      clearPlayerTradeAvailability: (playerId: string) => {
        set((s) => {
          s.tradeBlock = removePlayerTradeBlockListing(s.tradeBlock, playerId)
        })
      },

      respondToTribunalCase: (caseId: string, decision: 'accept' | 'challenge') => {
        const state = get()
        const caseItem = state.tribunalInbox.find((c) => c.id === caseId)
        if (!caseItem) return { success: false, error: 'Tribunal case not found' }
        if (caseItem.status !== 'pending-user') return { success: false, error: 'Case is no longer pending' }
        if (caseItem.clubId !== state.playerClubId) return { success: false, error: 'Only user club cases can be actioned here' }

        const rng = new SeededRNG(state.rngSeed + Date.now())
        const resolved = resolveUserTribunalCase({
          caseItem,
          decision,
          clubs: state.clubs,
          rng,
        })

        set((s) => {
          const idx = s.tribunalInbox.findIndex((c) => c.id === caseId)
          if (idx < 0) return
          s.tribunalInbox[idx] = resolved

          const player = s.players[resolved.playerId]
          if (player) {
            applyTribunalOutcomeToPlayer(player, resolved)
            if (resolved.finalWeeks && resolved.finalWeeks > 0) {
              s.newsLog.push({
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `${player.firstName} ${player.lastName} suspended (${resolved.finalWeeks}w)`,
                body:
                  `${player.firstName} ${player.lastName} received ${resolved.finalWeeks} week${resolved.finalWeeks === 1 ? '' : 's'} ` +
                  `for ${resolved.incidentSummary.toLowerCase()}. ${resolved.outcomeSummary ?? ''}`.trim(),
                category: 'discipline',
                clubIds: [player.clubId],
                playerIds: [player.id],
              })
            } else {
              s.newsLog.push({
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `${player.firstName} ${player.lastName} cleared at tribunal`,
                body:
                  `${player.firstName} ${player.lastName} was cleared after tribunal review. ` +
                  `${resolved.outcomeSummary ?? ''}`.trim(),
                category: 'discipline',
                clubIds: [player.clubId],
                playerIds: [player.id],
              })
            }
          }
        })

        return { success: true }
      },

      markTribunalCaseRead: (caseId: string) => {
        set((s) => {
          const caseItem = s.tribunalInbox.find((c) => c.id === caseId)
          if (caseItem) caseItem.read = true
        })
      },

      hireScoutAction: (scoutId: string) => {
        const state = get()
        const scout = state.scouts.find((s) => s.id === scoutId)
        if (!scout) return { success: false, error: 'Scout not found' }
        if (scout.clubId) return { success: false, error: 'Scout is already employed' }

        const myScouts = state.scouts.filter((s) => s.clubId === state.playerClubId)
        if (myScouts.length >= 6) return { success: false, error: 'Scout roster is full (max 6)' }

        set((s) => {
          const idx = s.scouts.findIndex((x) => x.id === scoutId)
          if (idx >= 0) {
            s.scouts[idx] = hireScout(s.scouts[idx], s.playerClubId)
          }
        })
        return { success: true }
      },

      fireScoutAction: (scoutId: string) => {
        const state = get()
        const scout = state.scouts.find((s) => s.id === scoutId)
        if (!scout) return { success: false, error: 'Scout not found' }
        if (scout.clubId !== state.playerClubId) return { success: false, error: 'Can only fire your own scouts' }

        set((s) => {
          const idx = s.scouts.findIndex((x) => x.id === scoutId)
          if (idx >= 0) {
            s.scouts[idx] = fireScout(s.scouts[idx])
          }
        })
        return { success: true }
      },

      assignScoutRegionAction: (scoutId: string, region: ScoutingRegion | null) => {
        const state = get()
        const scout = state.scouts.find((s) => s.id === scoutId)
        if (!scout) return { success: false, error: 'Scout not found' }
        if (scout.clubId !== state.playerClubId) return { success: false, error: 'Can only manage your own scouts' }

        set((s) => {
          const idx = s.scouts.findIndex((x) => x.id === scoutId)
          if (idx >= 0) {
            s.scouts[idx] = assignScoutToRegion(s.scouts[idx], region)
          }
        })
        return { success: true }
      },

      runScoutingSessionAction: () => {
        const state = get()
        if (!state.draft) return { success: false, error: 'No active draft class to scout' }
        const { scoutingByClub } = buildStaffImpactMaps(state)

        const rng = new SeededRNG(state.rngSeed + Date.now())
        const updatedProspects = runScoutingSessions(
          state.scouts,
          state.draft.prospects,
          state.playerClubId,
          rng,
          { scoutingAccuracyModifier: scoutingByClub[state.playerClubId] ?? 1 },
        )

        set((s) => {
          if (!s.draft) return
          s.draft.prospects = updatedProspects
        })
        return { success: true }
      },

      runDraftCombineAction: () => {
        const state = get()
        if (!state.draft) return { success: false, error: 'No active draft class' }
        if (state.draft.combineCompleted) return { success: false, error: 'Draft combine already completed' }
        const { scoutingByClub } = buildStaffImpactMaps(state)

        const rng = new SeededRNG(state.rngSeed + state.currentYear * 7717 + Date.now())
        const clubIds = Object.keys(state.clubs)
        const combinedProspects = runDraftCombineEvent(
          state.draft.prospects,
          state.scouts,
          clubIds,
          rng,
          { scoutingAccuracyByClub: scoutingByClub },
        )

        set((s) => {
          if (!s.draft) return
          s.draft.prospects = combinedProspects
          s.draft.combineCompleted = true
          s.draft.combineDate = s.currentDate
          s.newsLog.push({
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${s.currentYear} National Draft Combine completed`,
            body: 'Combine testing is complete. Athletic and upside information has sharpened across draft boards.',
            category: 'draft',
            clubIds: [],
            playerIds: [],
          })
        })
        return { success: true }
      },

      startLiveDraftAction: () => {
        const state = get()
        if (!state.draft) return { success: false, error: 'No active draft' }
        if (state.draft.nationalDraftComplete) return { success: false, error: 'National draft already complete' }

        set((s) => {
          if (!s.draft) return
          if (s.draft.currentPickIndex < 0) {
            s.draft.currentPickIndex = 0
          }
          s.draft.pickTradeOffers = s.draft.pickTradeOffers ?? []
        })

        return get().advanceDraftToNextUserPickAction()
      },

      advanceDraftToNextUserPickAction: () => {
        const state = get()
        if (!state.draft) return { success: false, error: 'No active draft' }
        if (state.draft.nationalDraftComplete) return { success: false, error: 'National draft already complete' }

        const rng = new SeededRNG(state.rngSeed + Date.now())
        set((s) => {
          if (!s.draft) return
          if (s.draft.currentPickIndex < 0) s.draft.currentPickIndex = 0
          s.draft.pickTradeOffers = s.draft.pickTradeOffers ?? []

          while (!s.draft.nationalDraftComplete && s.draft.currentPickIndex < s.draft.nationalDraftPicks.length) {
            const idx = s.draft.currentPickIndex
            const pick = s.draft.nationalDraftPicks[idx]
            if (!pick) {
              s.draft.nationalDraftComplete = true
              break
            }

            if (pick.selectedProspectId) {
              s.draft.currentPickIndex += 1
              continue
            }

            if (pick.clubId === s.playerClubId) {
              const offers = createLiveDraftPickTradeOffers({
                draft: s.draft,
                clubs: s.clubs,
                players: s.players,
                staff: s.staff,
                playerClubId: s.playerClubId,
                settings: s.settings,
                currentDate: s.currentDate,
                currentYear: s.currentYear,
                rng,
              })
              if (offers.length > 0) {
                s.draft.pickTradeOffers.push(...offers)
                s.newsLog.push({
                  id: crypto.randomUUID(),
                  date: s.currentDate,
                  headline: 'Live draft pick trade offers received',
                  body: `${offers.length} club(s) have offered pick-swap deals while you are on the clock.`,
                  category: 'trade',
                  clubIds: offers.map((o) => o.fromClubId),
                  playerIds: [],
                })
              }
              break
            }

            const club = s.clubs[pick.clubId]
            if (!club) {
              s.draft.currentPickIndex += 1
              continue
            }
            const staffImpact = getCoachingImpact(Object.values(s.staff), club.id)
            const available = getAvailableProspectsForDraft(s.draft.prospects, s.draft.draftedProspectIds)
            if (available.length === 0) {
              s.draft.nationalDraftComplete = true
              break
            }
            const selectedProspectId = aiSelectProspect(
              club,
              pick,
              available,
              s.players,
              rng,
              {
                scoutingAccuracy: staffImpact.scoutingAccuracy || 1,
                draftSuccess: staffImpact.draftSuccess || 1,
              },
              {
                ngaAcademyEnabled: s.settings.realism.ngaAcademy,
                ngaAcademyZoneMatching: s.settings.realism.ngaAcademyZoneMatching,
              },
            )
            const prospect = s.draft.prospects.find((p) => p.id === selectedProspectId)
            if (!prospect) {
              s.draft.currentPickIndex += 1
              continue
            }

            const bidResolution = resolveLinkedBidMatch({
              draft: s.draft,
              pickIndex: idx,
              selectingClubId: pick.clubId,
              selectedProspect: prospect,
              settings: s.settings,
            })
            s.draft.nationalDraftPicks = bidResolution.updatedPicks
            const activePick = s.draft.nationalDraftPicks[idx]
            if (!activePick) {
              s.draft.currentPickIndex += 1
              continue
            }
            activePick.selectedProspectId = selectedProspectId
            s.draft.draftedProspectIds.push(selectedProspectId)

            const newPlayer = convertProspectToPlayer(
              prospect,
              bidResolution.awardedClubId,
              s.currentYear,
              activePick.pickNumber,
            )
            s.players[newPlayer.id] = newPlayer
            s.history.draftHistory.push({
              year: s.currentYear,
              pickNumber: activePick.pickNumber,
              round: activePick.round,
              clubId: bidResolution.awardedClubId,
              playerId: newPlayer.id,
              playerName: `${newPlayer.firstName} ${newPlayer.lastName}`,
              position: newPlayer.position.primary,
            })
            s.newsLog.push({
              id: crypto.randomUUID(),
              date: s.currentDate,
              headline: `Pick ${activePick.pickNumber}: ${s.clubs[bidResolution.awardedClubId]?.name ?? bidResolution.awardedClubId} select ${newPlayer.firstName} ${newPlayer.lastName}`,
              body: bidResolution.matched
                ? `Bid matched: ${s.clubs[prospect.linkedClubId ?? '']?.name ?? prospect.linkedClubId} matched the bid at pick ${activePick.pickNumber} (${prospect.linkedType}) and spent ${bidResolution.bidCost} points.`
                : `${newPlayer.firstName} ${newPlayer.lastName} has been selected at pick ${activePick.pickNumber}.`,
              category: 'draft',
              clubIds: bidResolution.matched
                ? [pick.clubId, bidResolution.awardedClubId]
                : [bidResolution.awardedClubId],
              playerIds: [newPlayer.id],
            })

            s.draft.currentPickIndex += 1
            if (s.draft.currentPickIndex >= s.draft.nationalDraftPicks.length) {
              s.draft.nationalDraftComplete = true
              break
            }
          }
        })

        return { success: true }
      },

      makeUserDraftSelectionAction: (prospectId: string) => {
        const state = get()
        if (!state.draft) return { success: false, error: 'No active draft' }
        if (state.draft.currentPickIndex < 0) return { success: false, error: 'Draft has not started' }
        if (state.draft.nationalDraftComplete) return { success: false, error: 'National draft complete' }

        const idx = state.draft.currentPickIndex
        const pick = state.draft.nationalDraftPicks[idx]
        if (!pick) return { success: false, error: 'No pick on the clock' }
        if (pick.clubId !== state.playerClubId) return { success: false, error: 'It is not your pick' }
        if (pick.selectedProspectId) return { success: false, error: 'Pick already made' }
        if (state.draft.draftedProspectIds.includes(prospectId)) return { success: false, error: 'Prospect already drafted' }

        const prospect = state.draft.prospects.find((p) => p.id === prospectId)
        if (!prospect) return { success: false, error: 'Prospect not found' }

        set((s) => {
          if (!s.draft) return
          const currentIdx = s.draft.currentPickIndex
          const currentPick = s.draft.nationalDraftPicks[currentIdx]
          if (!currentPick) return

          const bidResolution = resolveLinkedBidMatch({
            draft: s.draft,
            pickIndex: currentIdx,
            selectingClubId: s.playerClubId,
            selectedProspect: prospect,
            settings: s.settings,
          })
          s.draft.nationalDraftPicks = bidResolution.updatedPicks
          const activePick = s.draft.nationalDraftPicks[currentIdx]
          if (!activePick) return

          activePick.selectedProspectId = prospectId
          s.draft.draftedProspectIds.push(prospectId)

          const newPlayer = convertProspectToPlayer(
            prospect,
            bidResolution.awardedClubId,
            s.currentYear,
            activePick.pickNumber,
          )
          s.players[newPlayer.id] = newPlayer
          s.history.draftHistory.push({
            year: s.currentYear,
            pickNumber: activePick.pickNumber,
            round: activePick.round,
            clubId: bidResolution.awardedClubId,
            playerId: newPlayer.id,
            playerName: `${newPlayer.firstName} ${newPlayer.lastName}`,
            position: newPlayer.position.primary,
          })
          s.newsLog.push({
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `Pick ${activePick.pickNumber}: ${s.clubs[bidResolution.awardedClubId]?.name ?? bidResolution.awardedClubId} select ${newPlayer.firstName} ${newPlayer.lastName}`,
            body: bidResolution.matched
              ? `Bid matched: ${s.clubs[prospect.linkedClubId ?? '']?.name ?? prospect.linkedClubId} matched your bid at pick ${activePick.pickNumber} (${prospect.linkedType}) using ${bidResolution.bidCost} points.`
              : `${newPlayer.firstName} ${newPlayer.lastName} joins ${s.clubs[s.playerClubId]?.name ?? s.playerClubId}.`,
            category: 'draft',
            clubIds: bidResolution.matched
              ? [s.playerClubId, bidResolution.awardedClubId]
              : [s.playerClubId],
            playerIds: [newPlayer.id],
          })

          s.draft.currentPickIndex += 1
          if (s.draft.currentPickIndex >= s.draft.nationalDraftPicks.length) {
            s.draft.nationalDraftComplete = true
          }
          if (s.draft.pickTradeOffers) {
            for (const offer of s.draft.pickTradeOffers) {
              if (offer.status === 'pending' && offer.currentPickIndex <= currentIdx) {
                offer.status = 'expired'
              }
            }
          }
        })

        if (!get().draft?.nationalDraftComplete) {
          return get().advanceDraftToNextUserPickAction()
        }
        return { success: true }
      },

      respondToDraftPickTradeOfferAction: (offerId: string, decision: 'accept' | 'reject') => {
        const state = get()
        if (!state.draft) return { success: false, error: 'No active draft' }
        const offers = state.draft.pickTradeOffers ?? []
        const offer = offers.find((o) => o.id === offerId)
        if (!offer) return { success: false, error: 'Offer not found' }
        if (offer.status !== 'pending') return { success: false, error: 'Offer is no longer pending' }

        set((s) => {
          if (!s.draft) return
          const targetOffer = (s.draft.pickTradeOffers ?? []).find((o) => o.id === offerId)
          if (!targetOffer) return

          if (decision === 'reject') {
            targetOffer.status = 'rejected'
            return
          }

          const onClock = s.draft.currentPickIndex
          if (onClock !== targetOffer.currentPickIndex) {
            targetOffer.status = 'expired'
            return
          }
          const currentPick = s.draft.nationalDraftPicks[targetOffer.currentPickIndex]
          if (!currentPick || currentPick.clubId !== s.playerClubId) {
            targetOffer.status = 'expired'
            return
          }

          s.draft.nationalDraftPicks = swapDraftPickOwners(
            s.draft.nationalDraftPicks,
            targetOffer.currentPickIndex,
            targetOffer.incomingPickIndex,
          )
          let updatedClubs = s.clubs
          for (const pick of targetOffer.offeredFuturePicks) {
            updatedClubs = transferFuturePickOwnership(updatedClubs, {
              pick,
              fromClubId: targetOffer.fromClubId,
              toClubId: s.playerClubId,
            })
          }
          for (const pick of targetOffer.requestedFuturePicks) {
            updatedClubs = transferFuturePickOwnership(updatedClubs, {
              pick,
              fromClubId: s.playerClubId,
              toClubId: targetOffer.fromClubId,
            })
          }
          s.clubs = updatedClubs

          targetOffer.status = 'accepted'
          for (const o of s.draft.pickTradeOffers ?? []) {
            if (
              o.id !== targetOffer.id &&
              o.status === 'pending' &&
              o.currentPickIndex === targetOffer.currentPickIndex
            ) {
              o.status = 'expired'
            }
          }

          s.newsLog.push({
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `Draft pick trade: ${s.clubs[targetOffer.fromClubId]?.abbreviation ?? targetOffer.fromClubId} move up`,
            body:
              `${s.clubs[targetOffer.fromClubId]?.name ?? targetOffer.fromClubId} acquired pick #${s.draft.nationalDraftPicks[targetOffer.currentPickIndex].pickNumber} ` +
              `for pick #${s.draft.nationalDraftPicks[targetOffer.incomingPickIndex].pickNumber}` +
              `${targetOffer.offeredFuturePicks.length > 0 ? ' plus future draft capital.' : '.'}`,
            category: 'trade',
            clubIds: [s.playerClubId, targetOffer.fromClubId],
            playerIds: [],
          })
        })

        if (decision === 'accept') {
          return get().advanceDraftToNextUserPickAction()
        }
        return { success: true }
      },

      resetGame: () => {
        set((state) => {
          const defaults = createDefaultState()
          Object.assign(state, defaults)
        })
      },

      enterOffseason: () => {
        const state = get()
        const rng = new SeededRNG(state.rngSeed + state.currentYear * 31337)

        // 1. Process season end (stats merge, aging, development, retirements)
        const { updatedPlayers, retiredIds, news: retirementNews, developmentReport } = processSeasonEnd(
          state.players,
          state.clubs,
          state.staff,
          state.playerClubId,
          state.weekSchedule,
          state.currentYear,
          rng,
          getDevelopmentSpeedMultiplier(state.settings.developmentSpeed),
        )

        // 2. Process retirements (set clubId to 'retired')
        const postRetirePlayers = processRetirements(updatedPlayers, retiredIds)

        // 3. AI delistings
        const { delistedIds: aiDelistedIds, news: delistNews } = processAIDelistings(
          postRetirePlayers,
          state.clubs,
          rng,
          state.playerClubId,
          state.settings,
          state.currentYear,
        )

        // Build initial offseason state
        const offseason = initOffseason()
        // Auto-complete season-end and retirements phases
        offseason.currentPhase = 'delistings'
        offseason.completedPhases = ['season-end', 'retirements']
        offseason.retiredPlayerIds = retiredIds
        offseason.delistedPlayerIds = aiDelistedIds

        set((s) => {
          // Write updated players
          for (const [id, p] of Object.entries(postRetirePlayers)) {
            s.players[id] = p
          }
          // Append news
          for (const n of [...retirementNews, ...delistNews]) {
            s.newsLog.push(n)
          }
          s.history.developmentReports.push(developmentReport)
          s.newsLog.push({
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${developmentReport.year} Player Development Report released`,
            body: 'Preseason development outcomes are in: review risers, fallers, breakout candidates, bust watch, and club summaries.',
            category: 'general',
            clubIds: [],
            playerIds: [],
          })

          // Season-end financial processing: luxury tax + cap breach warnings
          if (s.settings.salaryCap) {
            const allPlayers = Object.values(s.players)
            for (const club of Object.values(s.clubs)) {
              const financials = calculateSeasonEndFinancials(
                allPlayers,
                club.id,
                s.settings.salaryCapAmount,
                s.settings.realism.softCapSpending,
              )

              // Sync currentSpend
              club.finances.currentSpend = financials.totalSpend

              if (s.settings.realism.softCapSpending && financials.luxuryTax > 0) {
                // Deduct luxury tax from balance
                club.finances.balance -= financials.luxuryTax
                s.newsLog.push({
                  id: crypto.randomUUID(),
                  date: `${s.currentYear}-10-01`,
                  headline: `${club.name} hit with $${financials.luxuryTax.toLocaleString()} luxury tax`,
                  body: `${club.fullName} have been penalised $${financials.luxuryTax.toLocaleString()} in luxury tax for exceeding the salary cap of $${s.settings.salaryCapAmount.toLocaleString()} during the ${s.currentYear} season. Their total player spend was $${financials.totalSpend.toLocaleString()}.`,
                  category: 'general',
                  clubIds: [club.id],
                  playerIds: [],
                })
              } else if (financials.isOverCap && !s.settings.realism.softCapSpending) {
                s.newsLog.push({
                  id: crypto.randomUUID(),
                  date: `${s.currentYear}-10-01`,
                  headline: `${club.name} over salary cap`,
                  body: `${club.fullName} finished the ${s.currentYear} season over the salary cap with a total player spend of $${financials.totalSpend.toLocaleString()} against a cap of $${s.settings.salaryCapAmount.toLocaleString()}.`,
                  category: 'general',
                  clubIds: [club.id],
                  playerIds: [],
                })
              }
            }
          }

          // Initialize offseason calendar
          const offseasonStartDate = `${getYear(s.currentDate)}-10-01`
          offseason.calendarState = initOffseasonCalendar(offseasonStartDate)

          s.phase = 'offseason'
          s.offseasonState = offseason
        })
      },

      advanceOffseasonPhase: () => {
        const state = get()
        if (!state.offseasonState) return { success: false, error: 'No offseason in progress' }

        // Check if we can advance
        const check = canAdvancePhase(
          state.offseasonState,
          state.players,
          state.playerClubId,
          state.settings,
        )
        if (!check.allowed) {
          return { success: false, error: check.reason }
        }

        const leavingPhase = state.offseasonState.currentPhase
        const rng = new SeededRNG(state.rngSeed + state.currentYear * 31337 + state.offseasonState.completedPhases.length * 7)

        // Phase-specific processing when leaving a phase
        if (leavingPhase === 'trade-period') {
          const { updatedPlayers, trades, news } = processAITradePeriod(
            state.players,
            state.clubs,
            state.tradeHistory,
            rng,
            state.playerClubId,
            state.currentYear,
            state.settings,
          )
          set((s) => {
            for (const [id, p] of Object.entries(updatedPlayers)) {
              s.players[id] = p
            }
            for (const t of trades) {
              s.tradeHistory.push(t)
            }
            for (const n of news) {
              s.newsLog.push(n)
            }
            // Sync currentSpend for all clubs after trades
            const allPlayers = Object.values(s.players)
            for (const club of Object.values(s.clubs)) {
              club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
            }
          })

          // Build free agency market when entering free-agency phase
          const postTradeState = get()
          const resignedIds = new Set<string>()
          if (postTradeState.negotiations) {
            for (const cn of postTradeState.negotiations.completed) {
              if (cn.outcome === 'signed') resignedIds.add(cn.playerId)
            }
          }
          const faMarket = buildFreeAgentMarket(
            postTradeState.players,
            postTradeState.clubs,
            resignedIds,
            postTradeState.currentYear,
          )
          const marketWithBids = generateAIBids(
            faMarket,
            postTradeState.players,
            postTradeState.clubs,
            rng,
            postTradeState.playerClubId,
            postTradeState.settings,
          )
          set((s) => {
            if (s.offseasonState) {
              s.offseasonState.freeAgencyMarket = marketWithBids
            }
          })
        } else if (leavingPhase === 'free-agency') {
          const freshState = get()

          // If market not yet resolved, auto-resolve it
          if (freshState.offseasonState?.freeAgencyMarket && !freshState.offseasonState.freeAgencyMarket.resolved) {
            const marketResult = resolveMarket(
              freshState.offseasonState.freeAgencyMarket,
              freshState.players,
              freshState.clubs,
              freshState.ladder,
              rng,
              freshState.currentYear,
            )

            set((s) => {
              // Apply player signings
              for (const [id, p] of Object.entries(marketResult.updatedPlayers)) {
                s.players[id] = p
              }
              // Apply compensation picks
              for (const comp of marketResult.compensationPicks) {
                const club = s.clubs[comp.losingClubId]
                if (club) {
                  club.draftPicks.push({
                    year: comp.year,
                    round: comp.round,
                    originalClubId: comp.losingClubId,
                    currentClubId: comp.losingClubId,
                  })
                }
              }
              // Append news
              for (const n of marketResult.news) {
                s.newsLog.push(n)
              }
              // Update market state
              if (s.offseasonState) {
                s.offseasonState.freeAgencyMarket = marketResult.market
              }
              // Sync currentSpend for all clubs
              const allPlayers = Object.values(s.players)
              for (const club of Object.values(s.clubs)) {
                club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
              }
            })
          }

          // Also tick user's active negotiations
          const postResolveState = get()
          if (postResolveState.negotiations && Object.keys(postResolveState.negotiations.active).length > 0) {
            const negRng = new SeededRNG(postResolveState.rngSeed + postResolveState.currentYear * 8731)
            const tickResult = tickNegotiations(
              postResolveState.negotiations, postResolveState.players, postResolveState.clubs,
              postResolveState.currentRound, postResolveState.currentDate, negRng, postResolveState.settings,
            )

            set((s) => {
              for (const signing of tickResult.signings) {
                const p = s.players[signing.playerId]
                if (p) {
                  const contract = buildContractFromOffer(signing.offer)
                  p.contract = contract
                  if (p.clubId !== signing.clubId) p.clubId = signing.clubId
                }
              }

              if (s.negotiations) {
                for (const completedId of tickResult.completedIds) {
                  const completedNeg = s.negotiations.active[completedId]
                  if (completedNeg) {
                    const completed = completeNegotiation(completedNeg, s.currentDate)
                    s.negotiations.completed.push(completed)
                    delete s.negotiations.active[completedId]
                  }
                }
              }

              for (const n of tickResult.news) {
                s.newsLog.push(n)
              }

              // Sync currentSpend for all clubs
              const allPlayers = Object.values(s.players)
              for (const club of Object.values(s.clubs)) {
                club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
              }
            })
          }
        } else if (leavingPhase === 'preseason') {
          const freshState = get()
          const updatedPlayers = processPreseason(
            freshState.players,
            freshState.staff,
            freshState.clubs,
            rng,
          )
          set((s) => {
            for (const [id, p] of Object.entries(updatedPlayers)) {
              s.players[id] = p
            }
          })

          // Generate venue allocation data for the next phase
          if (get().settings.realism.venueScheduling) {
            const st = get()
            const clubIds = Object.keys(st.clubs)
            const allocations = generateDefaultAllocations(clubIds, st.clubs, rng)
            const playerClub = st.clubs[st.playerClubId]
            const offers = playerClub ? generateSoldGameOffers(playerClub, rng) : []
            set((s) => {
              if (s.offseasonState) {
                s.offseasonState.venueOffers = offers
                s.offseasonState.venueConfig = allocations[s.playerClubId] ?? null
              }
              // Store allocations temporarily in venueState
              s.venueState = {
                allocations,
                assignments: [],
                accumulatedRevenue: {},
              }
            })
          }
        } else if (leavingPhase === 'venue-allocation') {
          // Apply venue allocations to the fixture
          const freshState = get()
          if (freshState.settings.realism.venueScheduling && freshState.venueState) {
            // AI clubs: auto-decide sold game offers (poorer clubs more likely to accept)
            for (const clubId of Object.keys(freshState.clubs)) {
              if (clubId === freshState.playerClubId) continue
              const club = freshState.clubs[clubId]
              if (!club) continue
              const config = freshState.venueState.allocations[clubId]
              if (!config) continue

              // Poorer/smaller clubs accept sold games more readily
              const acceptChance = club.tier === 'small' ? 0.7 : club.tier === 'medium' ? 0.4 : 0.2
              const numOffers = rng.nextInt(0, 2)
              for (let i = 0; i < numOffers; i++) {
                if (rng.chance(acceptChance)) {
                  const neutralVenues = ['utas-stadium', 'blundstone-arena', 'manuka-oval', 'tio-stadium', 'mars-stadium']
                  const venueId = rng.pick(neutralVenues)
                  const payment = rng.nextInt(150, 400) * 1000
                  config.soldHomeGames.push({ venueId, payment })
                  config.homeGamesAtPrimary = Math.max(0, config.homeGamesAtPrimary - 1)
                }
              }
            }

            // Apply player's accepted offers to their config
            const playerConfig = freshState.venueState.allocations[freshState.playerClubId]
            if (playerConfig && freshState.offseasonState?.venueConfig) {
              freshState.venueState.allocations[freshState.playerClubId] = freshState.offseasonState.venueConfig
            }

            // Apply allocations to fixture
            const assignments = applyVenueAllocationsToFixture(
              freshState.season,
              freshState.venueState.allocations,
              rng,
            )

            set((s) => {
              if (s.venueState) {
                s.venueState.assignments = assignments
                s.venueState.accumulatedRevenue = {}
              }
              // Update fixture venue strings (already mutated by applyVenueAllocationsToFixture)
              s.season = { ...freshState.season }
            })
          }
        }

        // Advance to next phase
        set((s) => {
          if (s.offseasonState) {
            s.offseasonState = advanceOffseasonPhaseEngine(s.offseasonState)
          }
        })

        // Auto-skip venue-allocation if venue scheduling is disabled
        const nextState = get()
        if (
          nextState.offseasonState?.currentPhase === 'venue-allocation' &&
          !nextState.settings.realism.venueScheduling
        ) {
          set((s) => {
            if (s.offseasonState) {
              s.offseasonState = advanceOffseasonPhaseEngine(s.offseasonState)
            }
          })
        }

        const postAdvance = get()
        if (postAdvance.offseasonState?.currentPhase === 'national-draft') {
          const existingDraft = postAdvance.draft
          if (!existingDraft || existingDraft.year !== postAdvance.currentYear) {
            const clubsWithLedger = ensureDraftPickLedger(postAdvance.clubs, postAdvance.currentYear, 2)
            set((s) => {
              s.clubs = clubsWithLedger
            })
            const draftRng = new SeededRNG(postAdvance.rngSeed + postAdvance.currentYear * 5441)
            const generated = generateDraftClassWithProfile(postAdvance.currentYear, draftRng)

            let prospects = generated.prospects
            prospects = applyDraftVariance(prospects, draftRng, postAdvance.settings.realism.draftVariance)
            if (!postAdvance.settings.realism.ngaAcademy) {
              prospects = stripLinkedClubs(prospects)
            }

            let nationalDraftPicks = generateDraftOrder(
              postAdvance.ladder,
              clubsWithLedger,
              postAdvance.leagueConfig.expansionPlans,
              postAdvance.currentYear,
            )
            if (postAdvance.settings.realism.aflHouseInterference) {
              nationalDraftPicks = applyPriorityPicks(
                nationalDraftPicks,
                postAdvance.ladder,
                true,
              )
            }
            const rookieDraftPicks = generateRookieDraftOrder(
              postAdvance.ladder,
              clubsWithLedger,
              postAdvance.currentYear,
            )

            set((s) => {
              s.draft = {
                year: postAdvance.currentYear,
                classProfile: generated.classProfile,
                prospects,
                nationalDraftPicks,
                rookieDraftPicks,
                currentPickIndex: -1,
                nationalDraftComplete: false,
                rookieDraftComplete: false,
                draftedProspectIds: [],
                pickTradeOffers: [],
                combineCompleted: false,
                combineDate: null,
              }

              s.newsLog.push({
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `${postAdvance.currentYear} draft class announced (${generated.classProfile.strength})`,
                body:
                  `Scouting reports describe this class as ${generated.classProfile.strength}. ` +
                  `Top-end talent rating ${generated.classProfile.topEndTalent} and depth rating ${generated.classProfile.depthRating}. ` +
                  `Prospects now include school pathway, national U18s, and state-league background data.`,
                category: 'draft',
                clubIds: [],
                playerIds: [],
              })
            })
          }
        }

        if (postAdvance.offseasonState?.currentPhase === 'trade-period') {
          const rngOffers = new SeededRNG(postAdvance.rngSeed + Date.now())
          const initialOffers = generateTradeInboxOffers(
            postAdvance.players,
            postAdvance.clubs,
            postAdvance.settings,
            postAdvance.playerClubId,
            postAdvance.currentDate,
            postAdvance.currentYear,
            postAdvance.tradeInbox,
            rngOffers,
            getDemandByPlayerFromTradeBlock(postAdvance.tradeBlock),
          )
          if (initialOffers.length > 0) {
            set((s) => {
              s.tradeInbox.push(...initialOffers)
            })
          }
        }

        return { success: true, error: null }
      },

      acceptVenueOffer: (offerId: string) => {
        set((s) => {
          if (!s.offseasonState?.venueOffers || !s.offseasonState.venueConfig) return
          const offer = s.offseasonState.venueOffers.find((o) => o.id === offerId)
          if (!offer) return

          // Add to sold games
          s.offseasonState.venueConfig.soldHomeGames.push({
            venueId: offer.venueId,
            payment: offer.payment,
          })
          s.offseasonState.venueConfig.homeGamesAtPrimary = Math.max(
            0,
            s.offseasonState.venueConfig.homeGamesAtPrimary - 1,
          )

          // Apply fan penalty
          const club = s.clubs[s.playerClubId]
          if (club) {
            club.fanSatisfaction = Math.max(
              0,
              (club.fanSatisfaction ?? 60) + offer.fanPenalty,
            )
          }

          // Add payment to club balance
          if (club) {
            club.finances.balance += offer.payment
          }

          // Remove offer from list
          s.offseasonState.venueOffers = s.offseasonState.venueOffers.filter((o) => o.id !== offerId)
        })
      },

      rejectVenueOffer: (offerId: string) => {
        set((s) => {
          if (!s.offseasonState?.venueOffers) return
          s.offseasonState.venueOffers = s.offseasonState.venueOffers.filter((o) => o.id !== offerId)
        })
      },

      setSecondaryHomeGames: (count: number) => {
        set((s) => {
          if (!s.offseasonState?.venueConfig) return
          const config = s.offseasonState.venueConfig
          if (!config.secondaryVenueId) return
          const totalHome = 11
          const soldCount = config.soldHomeGames.length
          const maxSecondary = Math.min(4, totalHome - soldCount)
          config.homeGamesAtSecondary = Math.max(0, Math.min(maxSecondary, count))
          config.homeGamesAtPrimary = totalHome - config.homeGamesAtSecondary - soldCount
        })
      },

      // ---- Offseason Sim Controls ----

      simOffseasonHalfDay: () => {
        const state = get()
        if (!state.offseasonState?.calendarState) return

        const nextCal = advanceHalfDayEngine(state.offseasonState.calendarState)
        const nextDate = nextCal.currentDate
        const rng = new SeededRNG(state.rngSeed + Date.now())

        let nextPlayers = state.players
        let generatedNews: NewsItem[] = []
        let generatedInbox: TradeInboxItem[] = []
        let nextTradeBlock = state.tradeBlock
        let nextDraftProspects = state.draft?.prospects ?? null

        if (state.offseasonState.currentPhase === 'trade-period') {
          const tradeReqs = generatePlayerTradeRequests(
            nextPlayers,
            state.clubs,
            state.settings,
            nextDate,
            state.playerClubId,
            rng,
          )
          nextPlayers = tradeReqs.updatedPlayers
          generatedNews = [...generatedNews, ...tradeReqs.news]

          const enquiryResult = generateTradeBlockEnquiries(
            nextTradeBlock,
            nextPlayers,
            state.clubs,
            state.playerClubId,
            nextDate,
            rng,
          )
          nextTradeBlock = enquiryResult.tradeBlock
          generatedNews = [...generatedNews, ...enquiryResult.news]

          generatedInbox = generateTradeInboxOffers(
            nextPlayers,
            state.clubs,
            state.settings,
            state.playerClubId,
            nextDate,
            state.currentYear,
            state.tradeInbox,
            rng,
            getDemandByPlayerFromTradeBlock(nextTradeBlock),
          )
        }

        if (
          (state.offseasonState.currentPhase === 'national-draft' || state.offseasonState.currentPhase === 'rookie-draft') &&
          nextDraftProspects
        ) {
          const { scoutingByClub } = buildStaffImpactMaps(state)
          const scoutingClubIds = Array.from(
            new Set(
              state.scouts
                .map((s) => s.clubId)
                .filter((id): id is string => typeof id === 'string' && id.length > 0),
            ),
          )

          let rollingProspects = nextDraftProspects
          for (const clubId of scoutingClubIds) {
            rollingProspects = runScoutingSessions(
              state.scouts,
              rollingProspects,
              clubId,
              rng,
              { scoutingAccuracyModifier: scoutingByClub[clubId] ?? 1 },
            )
          }
          nextDraftProspects = rollingProspects
        }

        const expired = expireTradeInboxItems(state.tradeInbox, nextDate)
        set((s) => {
          if (!s.offseasonState?.calendarState) return
          s.offseasonState.calendarState = nextCal
          s.currentDate = nextDate
          s.players = nextPlayers
          s.tradeBlock = nextTradeBlock
          s.tradeInbox = [...expired, ...generatedInbox]
          if (s.draft && nextDraftProspects) {
            s.draft.prospects = nextDraftProspects
          }
          for (const news of generatedNews) {
            s.newsLog.push(news)
          }
        })
      },

      simOffseasonFullDay: () => {
        get().simOffseasonHalfDay()
        get().simOffseasonHalfDay()
      },

      simOffseasonToMilestone: () => {
        const state = get()
        if (!state.offseasonState?.calendarState) return
        const nextCal = advanceToNextMilestoneEngine(state.offseasonState.calendarState)
        const nextDate = nextCal.currentDate
        const expired = expireTradeInboxItems(state.tradeInbox, nextDate)
        set((s) => {
          if (!s.offseasonState?.calendarState) return
          s.offseasonState.calendarState = nextCal
          s.currentDate = nextDate
          s.tradeInbox = expired
        })
      },

      delistPlayerOffseason: (playerId: string) => {
        set((s) => {
          const player = s.players[playerId]
          const clubId = player?.clubId
          if (player) {
            player.contract = {
              yearsRemaining: 0,
              aav: 0,
              yearByYear: [],
              isRestricted: false,
            }
            player.clubId = ''
          }
          if (s.offseasonState) {
            s.offseasonState.delistedPlayerIds.push(playerId)
          }
          // Sync currentSpend for the affected club
          if (clubId && s.clubs[clubId]) {
            const allPlayers = Object.values(s.players)
            s.clubs[clubId].finances.currentSpend = syncClubCurrentSpend(allPlayers, clubId)
          }
        })
      },

      signUnsignedPlayer: (playerId: string, years: number, aav: number) => {
        const state = get()
        const player = state.players[playerId]
        if (!player) return { success: false, error: 'Player not found' }
        if (player.clubId !== '') return { success: false, error: 'Player is already on a club roster' }
        if (player.contract.yearsRemaining > 0) return { success: false, error: 'Player already has a contract' }

        // Must be in free-agency phase
        if (state.offseasonState?.currentPhase !== 'free-agency') {
          return { success: false, error: 'Can only sign unsigned players during free agency' }
        }

        // Validate list space
        const constraints = resolveListConstraints(state.settings)
        if (!canAddToSeniorList(state.players, state.playerClubId, constraints)) {
          return { success: false, error: 'No room on the senior list' }
        }

        // Validate salary
        const clampedAav = Math.max(MINIMUM_SALARY, aav)
        const clampedYears = Math.max(1, Math.min(5, years))

        // Build year-by-year (flat structure)
        const yearByYear: number[] = []
        for (let y = 0; y < clampedYears; y++) {
          yearByYear.push(Math.round(clampedAav * (1 + y * 0.04)))
        }

        set((s) => {
          const p = s.players[playerId]
          if (!p) return
          p.clubId = s.playerClubId
          p.contract = {
            yearsRemaining: clampedYears,
            aav: clampedAav,
            yearByYear,
            isRestricted: false,
          }
          p.isRookie = false
          p.morale = Math.min(100, p.morale + 15)

          // Sync currentSpend
          const allPlayers = Object.values(s.players)
          const club = s.clubs[s.playerClubId]
          if (club) {
            club.finances.currentSpend = syncClubCurrentSpend(allPlayers, s.playerClubId)
          }

          // Add signing news
          s.newsLog.push({
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${p.firstName} ${p.lastName} signs with ${club?.name ?? s.playerClubId}`,
            body: `Unsigned free agent ${p.firstName} ${p.lastName} has signed a ${clampedYears}-year deal worth $${clampedAav.toLocaleString()} per year. The ${p.age}-year-old ${p.position.primary} joins the senior list.`,
            category: 'contract',
            clubIds: [s.playerClubId],
            playerIds: [playerId],
          })
        })

        return { success: true }
      },

      startNewSeasonAction: () => {
        const state = get()
        const { season, ladder, newYear } = startNewSeason(
          state.clubs,
          state.currentYear,
          state.rngSeed,
          state.playerClubId,
          state.settings,
        )

        set((s) => {
          const pruned = pruneExpiredDraftPicks(s.clubs, s.currentYear + 1)
          const ledgered = ensureDraftPickLedger(pruned, s.currentYear + 1, 2)
          s.currentYear = newYear
          s.season = season
          s.ladder = ladder
          s.currentRound = 0
          s.phase = 'regular-season'
          s.offseasonState = null
          s.negotiations = null
          s.matchResults = []
          s.brownlowTracker = []
          s.brownlowRevealed = false
          s.selectedLineup = null
          s.clubs = ledgered
          s.calendar = buildSeasonCalendar(
            newYear,
            season,
            s.playerClubId,
            s.settings.finals,
            s.settings.seasonStartDate,
          )
        })
      },

      // ---- Contract Negotiation Actions ----

      startContractNegotiation: (playerId: string) => {
        const state = get()
        const player = state.players[playerId]
        if (!player) return { success: false, error: 'Player not found' }

        // Initialize tracker if needed
        if (!state.negotiations) {
          set((s) => { s.negotiations = initNegotiationTracker() })
        }

        const tracker = get().negotiations!
        const isReSigning = player.clubId === state.playerClubId
        const gamePhase = state.phase === 'offseason' ? 'offseason' : 'regular-season'

        // Check eligibility
        const eligibility = getPlayerNegotiationEligibility(
          player, state.playerClubId, tracker, gamePhase, state.currentRound,
        )
        if (!eligibility.eligible) {
          return { success: false, error: eligibility.reason ?? 'Not eligible' }
        }

        // Determine ladder position
        const ladderPos = state.ladder.findIndex((e) => e.clubId === state.playerClubId) + 1

        const rng = new SeededRNG(state.rngSeed + state.currentRound * 7919 + playerId.length * 13)
        const result = startNegotiation(
          player, state.playerClubId, isReSigning, state.currentRound,
          state.currentDate, rng, ladderPos || 9,
          { playerLoyaltyEnabled: state.settings.realism.playerLoyalty },
        )

        if (!result.success || !result.negotiation) {
          // Player refused — add to refused list
          set((s) => {
            if (s.negotiations) {
              s.negotiations.refusedPlayerIds.push(playerId)
            }
          })
          return { success: false, error: result.error }
        }

        set((s) => {
          if (s.negotiations) {
            s.negotiations.active[result.negotiation!.id] = result.negotiation!
          }
        })

        return { success: true, negotiationId: result.negotiation.id }
      },

      submitContractOffer: (negotiationId: string, offer: NegotiationOffer) => {
        const state = get()
        if (!state.negotiations) return { success: false, error: 'No negotiations active' }

        const negotiation = state.negotiations.active[negotiationId]
        if (!negotiation) return { success: false, error: 'Negotiation not found' }

        // Use a mutable copy via immer
        let submitResult: { success: boolean; error?: string } = { success: false }
        set((s) => {
          const neg = s.negotiations?.active[negotiationId]
          if (!neg) return
          const result = submitNegotiationOffer(
            neg, offer, s.currentRound, s.currentDate,
            s.players, s.playerClubId, s.settings,
          )
          submitResult = result

          // If delays are disabled, immediately tick to resolve
          if (result.success && !s.settings.realism.negotiationDelays) {
            const rng = new SeededRNG(s.rngSeed + s.currentRound * 3571 + negotiationId.length * 17)
            const tickResult = tickNegotiations(
              s.negotiations!, s.players, s.clubs,
              s.currentRound, s.currentDate, rng, s.settings,
            )

            // Apply signings
            for (const signing of tickResult.signings) {
              const p = s.players[signing.playerId]
              if (p) {
                const contract = buildContractFromOffer(signing.offer)
                p.contract = contract
                if (!neg.isReSigning) p.clubId = signing.clubId
              }
            }

            // Move completed negotiations
            for (const completedId of tickResult.completedIds) {
              const completedNeg = s.negotiations!.active[completedId]
              if (completedNeg) {
                const completed = completeNegotiation(completedNeg, s.currentDate)
                s.negotiations!.completed.push(completed)
                delete s.negotiations!.active[completedId]
              }
            }

            // Append news
            for (const n of tickResult.news) {
              s.newsLog.push(n)
            }

            // Sync cap for affected clubs
            const allPlayers = Object.values(s.players)
            for (const signing of tickResult.signings) {
              const club = s.clubs[signing.clubId]
              if (club) {
                club.finances.currentSpend = syncClubCurrentSpend(allPlayers, signing.clubId)
              }
            }
          }
        })

        return submitResult
      },

      withdrawContractNegotiation: (negotiationId: string) => {
        set((s) => {
          if (!s.negotiations) return
          const neg = s.negotiations.active[negotiationId]
          if (!neg) return

          const completed = withdrawNegotiation(neg, s.currentDate)
          s.negotiations.completed.push(completed)
          delete s.negotiations.active[negotiationId]
        })
      },

      acceptContractCounterOffer: (negotiationId: string) => {
        const state = get()
        if (!state.negotiations) return { success: false, error: 'No negotiations active' }

        const negotiation = state.negotiations.active[negotiationId]
        if (!negotiation) return { success: false, error: 'Negotiation not found' }

        let result: { success: boolean; error?: string } = { success: false }
        set((s) => {
          const neg = s.negotiations?.active[negotiationId]
          if (!neg) return

          const offer = acceptCounterOfferEngine(neg)
          if (!offer) {
            result = { success: false, error: 'No counter-offer to accept' }
            return
          }

          // Apply contract
          const player = s.players[neg.playerId]
          if (player) {
            const contract = buildContractFromOffer(offer)
            player.contract = contract
            if (!neg.isReSigning) player.clubId = neg.clubId
          }

          // Complete negotiation
          const completed = completeNegotiation(neg, s.currentDate)
          s.negotiations!.completed.push(completed)
          delete s.negotiations!.active[negotiationId]

          // News
          if (player) {
            const clubName = s.clubs[neg.clubId]?.name ?? neg.clubId
            s.newsLog.push({
              id: crypto.randomUUID(),
              date: s.currentDate,
              headline: `${player.firstName} ${player.lastName} ${neg.isReSigning ? 're-signs' : 'signs'} with ${clubName}`,
              body: `${player.firstName} ${player.lastName} has agreed to a ${offer.years}-year deal worth $${offer.aav.toLocaleString()} per year with ${clubName}.`,
              category: 'contract',
              clubIds: [neg.clubId],
              playerIds: [player.id],
            })
          }

          // Sync cap
          const allPlayers = Object.values(s.players)
          const club = s.clubs[neg.clubId]
          if (club) {
            club.finances.currentSpend = syncClubCurrentSpend(allPlayers, neg.clubId)
          }

          result = { success: true }
        })

        return result
      },

      // ---- Free Agency Market Actions ----

      buildFreeAgencyMarketAction: () => {
        const state = get()
        if (!state.offseasonState) return

        const resignedIds = new Set<string>()
        if (state.negotiations) {
          for (const cn of state.negotiations.completed) {
            if (cn.outcome === 'signed') resignedIds.add(cn.playerId)
          }
        }

        const rng = new SeededRNG(state.rngSeed + state.currentYear * 31337 + 42)
        const market = buildFreeAgentMarket(
          state.players, state.clubs, resignedIds, state.currentYear,
        )
        const marketWithBids = generateAIBids(
          market, state.players, state.clubs, rng, state.playerClubId, state.settings,
        )

        set((s) => {
          if (s.offseasonState) {
            s.offseasonState.freeAgencyMarket = marketWithBids
          }
        })
      },

      submitFreeAgencyBidAction: (playerId: string, aav: number, years: number) => {
        const state = get()
        if (!state.offseasonState?.freeAgencyMarket) {
          return { success: false, error: 'No free agency market active' }
        }

        const result = submitUserBid(
          state.offseasonState.freeAgencyMarket,
          playerId, aav, years,
          state.playerClubId, state.players, state.settings,
        )

        if (result.success) {
          set((s) => {
            if (s.offseasonState) {
              s.offseasonState.freeAgencyMarket = result.market
            }
          })
        }

        return { success: result.success, error: result.error }
      },

      withdrawFreeAgencyBidAction: (playerId: string) => {
        const state = get()
        if (!state.offseasonState?.freeAgencyMarket) return

        const updated = withdrawUserBid(state.offseasonState.freeAgencyMarket, playerId)
        set((s) => {
          if (s.offseasonState) {
            s.offseasonState.freeAgencyMarket = updated
          }
        })
      },

      resolveFreeAgencyMarketAction: () => {
        const state = get()
        if (!state.offseasonState?.freeAgencyMarket) return
        if (state.offseasonState.freeAgencyMarket.resolved) return

        const rng = new SeededRNG(state.rngSeed + state.currentYear * 31337 + 99)
        const result = resolveMarket(
          state.offseasonState.freeAgencyMarket,
          state.players, state.clubs, state.ladder,
          rng, state.currentYear,
        )

        set((s) => {
          // Apply player signings
          for (const [id, p] of Object.entries(result.updatedPlayers)) {
            s.players[id] = p
          }
          // Apply compensation picks
          for (const comp of result.compensationPicks) {
            const club = s.clubs[comp.losingClubId]
            if (club) {
              club.draftPicks.push({
                year: comp.year,
                round: comp.round,
                originalClubId: comp.losingClubId,
                currentClubId: comp.losingClubId,
              })
            }
          }
          // Append news
          for (const n of result.news) {
            s.newsLog.push(n)
          }
          // Update market state
          if (s.offseasonState) {
            s.offseasonState.freeAgencyMarket = result.market
          }
          // Sync currentSpend for all clubs
          const allPlayers = Object.values(s.players)
          for (const club of Object.values(s.clubs)) {
            club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
          }
        })
      },

      signSupplementalPlayer: (playerId: string, years: number, aav: number) => {
        const state = get()
        const player = state.players[playerId]
        if (!player) return { success: false, error: 'Player not found' }
        if (player.clubId !== '') return { success: false, error: 'Player is already on a club roster' }
        if (player.contract.yearsRemaining > 0) return { success: false, error: 'Player already has a contract' }

        // Must be in supplemental-signing phase
        if (state.offseasonState?.currentPhase !== 'supplemental-signing') {
          return { success: false, error: 'Can only sign supplemental players during the supplemental signing period' }
        }

        // Validate list space
        const constraints = resolveListConstraints(state.settings)
        if (!canAddToSeniorList(state.players, state.playerClubId, constraints)) {
          return { success: false, error: 'No room on the senior list' }
        }

        const clampedAav = Math.max(MINIMUM_SALARY, aav)
        const clampedYears = Math.max(1, Math.min(5, years))

        const yearByYear: number[] = []
        for (let y = 0; y < clampedYears; y++) {
          yearByYear.push(Math.round(clampedAav * (1 + y * 0.04)))
        }

        set((s) => {
          const p = s.players[playerId]
          if (!p) return
          p.clubId = s.playerClubId
          p.contract = {
            yearsRemaining: clampedYears,
            aav: clampedAav,
            yearByYear,
            isRestricted: false,
          }
          p.isRookie = false
          p.morale = Math.min(100, p.morale + 15)

          const allPlayers = Object.values(s.players)
          const club = s.clubs[s.playerClubId]
          if (club) {
            club.finances.currentSpend = syncClubCurrentSpend(allPlayers, s.playerClubId)
          }

          s.newsLog.push({
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${p.firstName} ${p.lastName} signs with ${club?.name ?? s.playerClubId}`,
            body: `Supplemental signing: ${p.firstName} ${p.lastName} has signed a ${clampedYears}-year deal worth $${clampedAav.toLocaleString()} per year. The ${p.age}-year-old ${p.position.primary} joins the senior list.`,
            category: 'contract',
            clubIds: [s.playerClubId],
            playerIds: [playerId],
          })
        })

        return { success: true }
      },

      revealBrownlow: () => {
        set((s) => {
          s.brownlowRevealed = true
        })
      },

      getPlayersByClub: (clubId: string): Player[] => {
        const state = get()
        return Object.values(state.players).filter(
          (p) => p.clubId === clubId,
        )
      },

      updateGameplan: (gameplan: Partial<ClubGameplan>) => {
        set((state) => {
          const club = state.clubs[state.playerClubId]
          if (club) {
            Object.assign(club.gameplan, gameplan)
          }
        })
      },

      updateWeeklyGameplanAdjustment: (gameplan: Partial<ClubGameplan>) => {
        const state = get()
        const round = state.season.rounds[state.currentRound]
        if (!round) return { success: false, error: 'No current round available' }
        const fixture = round.fixtures.find(
          (f) => f.homeClubId === state.playerClubId || f.awayClubId === state.playerClubId,
        )
        if (!fixture) return { success: false, error: 'No upcoming opponent this round' }
        const opponentClubId = fixture.homeClubId === state.playerClubId ? fixture.awayClubId : fixture.homeClubId

        set((s) => {
          const current = s.weeklyGameplans[s.playerClubId]
          const currentOverrides = current?.overrides ?? {}
          s.weeklyGameplans[s.playerClubId] = {
            round: s.currentRound,
            opponentClubId,
            overrides: {
              ...currentOverrides,
              ...gameplan,
              ruckNomination: gameplan.ruckNomination
                ? { ...(currentOverrides.ruckNomination ?? {}), ...gameplan.ruckNomination }
                : currentOverrides.ruckNomination,
            },
            source: 'user',
          }
        })
        return { success: true }
      },

      clearWeeklyGameplanAdjustment: () => {
        set((s) => {
          delete s.weeklyGameplans[s.playerClubId]
        })
      },

      generateWeeklyCounterGameplanForUser: () => {
        const state = get()
        const round = state.season.rounds[state.currentRound]
        const userClub = state.clubs[state.playerClubId]
        if (!round || !userClub) return { success: false, error: 'No current round available' }
        const fixture = round.fixtures.find(
          (f) => f.homeClubId === state.playerClubId || f.awayClubId === state.playerClubId,
        )
        if (!fixture) return { success: false, error: 'No upcoming opponent this round' }
        const opponentClubId = fixture.homeClubId === state.playerClubId ? fixture.awayClubId : fixture.homeClubId
        const opponent = state.clubs[opponentClubId]
        if (!opponent) return { success: false, error: 'Opponent not found' }
        const rng = new SeededRNG(state.rngSeed + state.currentRound * 643 + state.playerClubId.length * 11)
        const userImpact = getCoachingImpact(Object.values(state.staff), state.playerClubId)
        const overrides = buildCounterAdjustment(userClub, opponent.gameplan, rng, {
          tacticalAdjustment: userImpact.tacticalAdjustment || 0.7,
          discipline: Math.round((userImpact.moraleBonus || 0) * 200),
        })
        set((s) => {
          s.weeklyGameplans[s.playerClubId] = {
            round: s.currentRound,
            opponentClubId,
            overrides,
            source: 'user',
          }
        })
        return { success: true }
      },

      hireStaffMember: (staffId: string, contractYears: number) => {
        set((state) => {
          const member = state.staff[staffId]
          if (member) {
            member.clubId = state.playerClubId
            member.contractYears = contractYears
          }
        })
      },

      fireStaffMember: (staffId: string) => {
        set((state) => {
          const member = state.staff[staffId]
          if (member) {
            member.clubId = ''
            member.contractYears = 0
          }
        })
      },

      saveGame: () => {
        set((state) => {
          state.meta.lastSaved = new Date().toISOString()
        })
      },

      sendToReserves: (playerId: string) => {
        set((state) => {
          const player = state.players[playerId]
          if (player) {
            player.listStatus = 'reserves'
          }
        })
      },

      recallFromReserves: (playerId: string) => {
        set((state) => {
          const player = state.players[playerId]
          if (player) {
            player.listStatus = 'senior'
          }
        })
      },

      setDaySlot: (date: string, slot: ScheduleSlot, activity: TrainingFocus | 'rest' | null) => {
        set((state) => {
          if (!state.weekSchedule[date]) {
            state.weekSchedule[date] = { morning: null, afternoon: null }
          }
          state.weekSchedule[date][slot] = activity
        })
      },

      clearWeekSchedule: () => {
        set((state) => {
          state.weekSchedule = {}
        })
      },

      recordUserDraftPick: (entry: import('@/types/history').DraftHistoryEntry) => {
        set((state) => {
          state.history.draftHistory.push(entry)
        })
      },

      getCurrentRoundData: () => {
        const state = get()
        if (state.phase === 'finals') {
          return state.season.finalsRounds[state.season.finalsRounds.length - 1] ?? null
        }
        return state.season.rounds[state.currentRound] ?? null
      },

      isUserInFinals: () => {
        const state = get()
        const pos = state.ladder.findIndex((e) => e.clubId === state.playerClubId)
        return pos >= 0 && pos < 8
      },

      simCurrentRound: () => {
        let state = get()
        const round = state.season.rounds[state.currentRound]
        if (!round) return { userMatch: null }

        const expiredCases = expirePendingUserTribunalCases(state.tribunalInbox, state.currentRound)
          .filter((c, idx) =>
            state.tribunalInbox[idx] &&
            state.tribunalInbox[idx].status === 'pending-user' &&
            c.status === 'expired',
          )
        if (expiredCases.length > 0) {
          set((s) => {
            for (const expired of expiredCases) {
              const idx = s.tribunalInbox.findIndex((c) => c.id === expired.id)
              if (idx >= 0) s.tribunalInbox[idx] = expired
              const player = s.players[expired.playerId]
              if (!player) continue
              applyTribunalOutcomeToPlayer(player, expired)
              s.newsLog.push({
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `Tribunal deadline missed: ${player.firstName} ${player.lastName}`,
                body:
                  `No club response was lodged for ${player.firstName} ${player.lastName}. ` +
                  `${expired.outcomeSummary ?? 'Automatic sanction applied.'}`,
                category: 'discipline',
                clubIds: [player.clubId],
                playerIds: [player.id],
              })
            }
          })
          state = get()
        }

        const fixtureClubIds = new Set<string>()
        for (const f of round.fixtures) {
          fixtureClubIds.add(f.homeClubId)
          fixtureClubIds.add(f.awayClubId)
        }
        set((s) => {
          applyRoleDisputesForFixtures(s, fixtureClubIds)
        })
        state = get()

        const gameplanOverrides: Record<string, ClubGameplan> = {}
        const weeklyEntriesNext: Record<string, import('@/types/game').WeeklyGameplan | undefined> = {
          ...state.weeklyGameplans,
        }
        const { tacticalByClub } = buildStaffImpactMaps(state)
        const tacticalRng = new SeededRNG(state.rngSeed + state.currentRound * 4591)
        for (const fixture of round.fixtures) {
          const pair: [string, string][] = [
            [fixture.homeClubId, fixture.awayClubId],
            [fixture.awayClubId, fixture.homeClubId],
          ]
          for (const [clubId, opponentId] of pair) {
            const club = state.clubs[clubId]
            const opponent = state.clubs[opponentId]
            if (!club || !opponent) continue

            const userEntry = state.weeklyGameplans[clubId]
            if (clubId === state.playerClubId && userEntry && userEntry.round === state.currentRound && userEntry.opponentClubId === opponentId) {
              gameplanOverrides[clubId] = applyGameplanAdjustment(club.gameplan, userEntry.overrides)
              weeklyEntriesNext[clubId] = userEntry
              continue
            }

            const tacticalContext = tacticalByClub[club.id] ?? { tacticalAdjustment: 0.7, discipline: 60 }
            const autoOverride = buildCounterAdjustment(club, opponent.gameplan, tacticalRng, tacticalContext)
            gameplanOverrides[clubId] = applyGameplanAdjustment(club.gameplan, autoOverride)
            if (clubId !== state.playerClubId) {
              weeklyEntriesNext[clubId] = {
                round: state.currentRound,
                opponentClubId: opponentId,
                overrides: autoOverride,
                source: 'ai-auto',
              }
            }
          }
        }
        set((s) => {
          s.weeklyGameplans = weeklyEntriesNext
        })
        state = get()

        const result = simulateRound({
          round,
          roundIndex: state.currentRound,
          players: state.players,
          clubs: state.clubs,
          rngSeed: state.rngSeed,
          playerClubId: state.playerClubId,
          matchRules: state.settings.matchRules,
          venueState: state.venueState,
          gameplanOverrides,
        })

        // Accumulate venue revenue
        if (state.venueState) {
          set((s) => {
            if (!s.venueState) return
            for (let fi = 0; fi < round.fixtures.length; fi++) {
              const fixture = round.fixtures[fi]
              const assignment = s.venueState!.assignments.find(
                (a) => a.roundNumber === round.number && a.fixtureIndex === fi,
              )
              if (assignment) {
                // Home team gets primary share
                s.venueState!.accumulatedRevenue[fixture.homeClubId] =
                  (s.venueState!.accumulatedRevenue[fixture.homeClubId] ?? 0) + assignment.matchRevenue
                // Away team gets 20% share
                const awayShare = Math.round(assignment.matchRevenue * 0.2)
                s.venueState!.accumulatedRevenue[fixture.awayClubId] =
                  (s.venueState!.accumulatedRevenue[fixture.awayClubId] ?? 0) + awayShare
              }
            }
          })
        }

        // Commit results to store
        set((s) => {
          for (const m of result.matches) {
            s.matchResults.push(m)
          }
        })

        // Update ladder with settings-driven points
        processMatchResults(
          result.matches,
          get as () => GameState,
          set as unknown as (fn: (state: GameState) => void) => void,
          state.settings.ladderPoints,
        )

        // Build travel fatigue map for post-round effects
        let travelFatigueByClub: Record<string, number> | undefined
        if (state.venueState) {
          travelFatigueByClub = {}
          for (let fi = 0; fi < round.fixtures.length; fi++) {
            const fixture = round.fixtures[fi]
            const assignment = state.venueState.assignments.find(
              (a) => a.roundNumber === round.number && a.fixtureIndex === fi,
            )
            if (assignment) {
              const venueObj = VENUES[assignment.venueId]
              if (venueObj) {
                const homeFatigue = getTravelFatigue(getClubState(fixture.homeClubId), venueObj.state)
                const awayFatigue = getTravelFatigue(getClubState(fixture.awayClubId), venueObj.state)
                if (homeFatigue > 0) travelFatigueByClub[fixture.homeClubId] = homeFatigue
                if (awayFatigue > 0) travelFatigueByClub[fixture.awayClubId] = awayFatigue
              }
            }
          }
        }

        // Apply post-round effects (fatigue, fitness, form)
        const playedStats: Record<string, import('@/types/match').MatchPlayerStats> = {}
        for (const m of result.matches) {
          if (!m.result) continue
          for (const ps of [...m.result.homePlayerStats, ...m.result.awayPlayerStats]) {
            playedStats[ps.playerId] = ps
          }
        }
        // Roll for match injuries
        const injuryRng = new SeededRNG(state.rngSeed + state.currentRound * 997)
        const staffListForMedical = Object.values(state.staff)
        const medicalImpactByClub: Record<string, import('@/engine/staff/staffEngine').MedicalStaffImpact> = {}
        for (const clubId of fixtureClubIds) {
          medicalImpactByClub[clubId] = getMedicalStaffImpact(staffListForMedical, clubId)
        }
        const allInjuries = result.matches.flatMap((m) => {
          if (!m.result) return []
          const matchPlayerIds = [
            ...m.result.homePlayerStats.map((ps) => ps.playerId),
            ...m.result.awayPlayerStats.map((ps) => ps.playerId),
          ]
          return rollMatchInjuries(
            matchPlayerIds,
            state.players,
            injuryRng,
            'medium',
            state.settings.injuryFrequency,
            state.currentDate,
            medicalImpactByClub,
          )
        })

        const tribunalRng = new SeededRNG(state.rngSeed + state.currentRound * 1291)
        const newTribunalCases = generateTribunalCasesFromMatches({
          matches: result.matches,
          players: state.players,
          userClubId: state.playerClubId,
          date: state.currentDate,
          roundMarker: state.currentRound,
          phase: 'regular-season',
          rng: tribunalRng,
        })
        const resolvedAICases = resolveAITribunalCases({
          caseItems: newTribunalCases.filter((c) => c.status === 'pending-ai'),
          clubs: state.clubs,
          rng: tribunalRng,
        })
        const pendingUserCases = newTribunalCases.filter((c) => c.status === 'pending-user')

        set((s) => {
          applyPostRoundEffects(s.players, playedStats, travelFatigueByClub)

          // Apply injuries from this round's matches
          for (const inj of allInjuries) {
            const p = s.players[inj.playerId]
            if (p) {
              applyInjuryEvent(p, inj)
              s.newsLog.push({
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `${p.firstName} ${p.lastName} injured (${inj.weeksOut}w)`,
                body:
                  `${p.firstName} ${p.lastName} suffered ${inj.type} and is expected to miss ` +
                  `${inj.weeksOut} week${inj.weeksOut === 1 ? '' : 's'} (${inj.severity}).`,
                category: 'injury',
                clubIds: [p.clubId],
                playerIds: [p.id],
              })
            }
          }

          // Heal existing injuries (decrement weeks)
          healInjuries(s.players, s.currentDate, medicalImpactByClub)
          serveSuspensionWeeks(s.players)

          // Apply resolved AI tribunal outcomes immediately
          for (const tribunalCase of resolvedAICases) {
            s.tribunalInbox.push(tribunalCase)
            const player = s.players[tribunalCase.playerId]
            if (!player) continue
            applyTribunalOutcomeToPlayer(player, tribunalCase)
            s.newsLog.push({
              id: crypto.randomUUID(),
              date: s.currentDate,
              headline:
                tribunalCase.finalWeeks && tribunalCase.finalWeeks > 0
                  ? `${player.firstName} ${player.lastName} suspended (${tribunalCase.finalWeeks}w)`
                  : `${player.firstName} ${player.lastName} cleared by tribunal`,
              body:
                `${player.firstName} ${player.lastName}: ${tribunalCase.incidentSummary}. ` +
                `${tribunalCase.outcomeSummary ?? ''}`.trim(),
              category: 'discipline',
              clubIds: [player.clubId],
              playerIds: [player.id],
            })
          }

          // User club tribunal matters go to inbox and wait for action.
          for (const tribunalCase of pendingUserCases) {
            s.tribunalInbox.push(tribunalCase)
            const player = s.players[tribunalCase.playerId]
            if (!player) continue
            s.newsLog.push({
              id: crypto.randomUUID(),
              date: s.currentDate,
              headline: `Tribunal hearing: ${player.firstName} ${player.lastName}`,
              body:
                `${tribunalCase.incidentSummary}. Recommended sanction: ` +
                `${tribunalCase.recommendedWeeks} week${tribunalCase.recommendedWeeks === 1 ? '' : 's'}. ` +
                `Decision due before next round.`,
              category: 'discipline',
              clubIds: [player.clubId],
              playerIds: [player.id],
            })
          }

          // Update morale post-match for each club
          for (const m of result.matches) {
            if (!m.result) continue
            const homeSelected = new Set(m.result.homePlayerStats.map((ps) => ps.playerId))
            const awaySelected = new Set(m.result.awayPlayerStats.map((ps) => ps.playerId))
            const homeWon = m.result.homeTotalScore > m.result.awayTotalScore
            const awayWon = m.result.awayTotalScore > m.result.homeTotalScore
            const draw = m.result.homeTotalScore === m.result.awayTotalScore
            updateMoralePostMatch(s.players, homeSelected, m.homeClubId, homeWon, draw)
            updateMoralePostMatch(s.players, awaySelected, m.awayClubId, awayWon, draw)
          }

          // Award Brownlow votes for each match
          for (const m of result.matches) {
            if (!m.result) continue
            const allPlayerStats = [...m.result.homePlayerStats, ...m.result.awayPlayerStats]
            const brownlowRound = awardBrownlowVotes(m.id, s.currentRound, allPlayerStats)
            s.brownlowTracker.push(brownlowRound)
          }

          // Update fan satisfaction based on match results
          if (s.venueState && s.settings.realism.venueScheduling) {
            for (const m of result.matches) {
              if (!m.result) continue
              const homeWon = m.result.homeTotalScore > m.result.awayTotalScore
              const homeClub = s.clubs[m.homeClubId]
              if (homeClub) {
                const current = homeClub.fanSatisfaction ?? 60
                let delta = 0
                if (homeWon) delta += 1
                else delta -= 1
                // Big crowd bonus
                const assignment = s.venueState.assignments.find(
                  (a) => a.roundNumber === round.number &&
                    round.fixtures[a.fixtureIndex]?.homeClubId === m.homeClubId,
                )
                if (assignment) {
                  const venue = VENUES[assignment.venueId]
                  if (venue && assignment.expectedAttendance > venue.capacity * 0.8) {
                    delta += 1
                  }
                }
                homeClub.fanSatisfaction = updateFanSatisfaction(current, delta)
              }
            }
          }

          // Bye recovery: players on bye get fitness/fatigue boost
          const byeClubIds = new Set(round.byeClubIds ?? [])
          if (byeClubIds.size > 0) {
            const byeRng = new SeededRNG(s.rngSeed + s.currentRound * 883)
            for (const player of Object.values(s.players)) {
              if (player.clubId && byeClubIds.has(player.clubId)) {
                player.fitness = Math.min(100, player.fitness + 5 + byeRng.nextInt(0, 4))
                player.fatigue = Math.max(0, player.fatigue - 8 + byeRng.nextInt(0, 6))
              }
            }
          }

          // Simulate state league rounds in parallel
          if (s.stateLeagues) {
            const slRng = new SeededRNG(s.rngSeed + s.currentRound * 1337)
            for (const leagueId of Object.keys(s.stateLeagues) as Array<keyof typeof s.stateLeagues>) {
              const league = s.stateLeagues[leagueId]
              if (league) {
                simStateLeagueRound(league, s.currentRound + 1, slRng)
              }
            }
          }

          // --- Negotiation tick ---
          if (!s.negotiations) {
            s.negotiations = initNegotiationTracker()
          }

          if (Object.keys(s.negotiations.active).length > 0) {
            const negRng = new SeededRNG(s.rngSeed + s.currentRound * 4219)
            const tickResult = tickNegotiations(
              s.negotiations, s.players, s.clubs,
              s.currentRound, s.currentDate, negRng, s.settings,
            )

            // Apply signings
            for (const signing of tickResult.signings) {
              const p = s.players[signing.playerId]
              if (p) {
                const contract = buildContractFromOffer(signing.offer)
                p.contract = contract
                if (p.clubId !== signing.clubId) p.clubId = signing.clubId
              }
            }

            // Move completed negotiations
            for (const completedId of tickResult.completedIds) {
              const completedNeg = s.negotiations.active[completedId]
              if (completedNeg) {
                const completed = completeNegotiation(completedNeg, s.currentDate)
                s.negotiations.completed.push(completed)
                delete s.negotiations.active[completedId]
              }
            }

            // Append news
            for (const n of tickResult.news) {
              s.newsLog.push(n)
            }

            // Sync cap for affected clubs
            if (tickResult.signings.length > 0) {
              const allPlayers = Object.values(s.players)
              for (const signing of tickResult.signings) {
                const club = s.clubs[signing.clubId]
                if (club) {
                  club.finances.currentSpend = syncClubCurrentSpend(allPlayers, signing.clubId)
                }
              }
            }
          }

          // --- Mid-season AI re-signing trigger at round 12 ---
          if (s.currentRound === 12) {
            const aiRng = new SeededRNG(s.rngSeed + s.currentYear * 6173)
            const aiResult = processAIReSignings(
              s.players, s.clubs, aiRng, s.playerClubId,
              s.currentRound, s.currentDate, s.settings,
            )
            for (const n of aiResult.news) {
              s.newsLog.push(n)
            }
            // Sync cap for AI clubs that re-signed players
            if (aiResult.signings.length > 0) {
              const allPlayers = Object.values(s.players)
              for (const signing of aiResult.signings) {
                const club = s.clubs[signing.clubId]
                if (club) {
                  club.finances.currentSpend = syncClubCurrentSpend(allPlayers, signing.clubId)
                }
              }
            }
          }

          s.currentRound += 1
          s.weeklyGameplans = {}
          s.meta.lastSaved = new Date().toISOString()
        })

        // Check if regular season is over (settings-driven round count)
        const updatedState = get()
        if (isRegularSeasonComplete(updatedState.currentRound, updatedState.season.rounds.length)) {
          set((s) => {
            s.phase = 'finals'
          })
        }

        return { userMatch: result.userMatch }
      },

      simToEnd: () => {
        const state = get()
        const totalRounds = state.season.rounds.length
        while (get().currentRound < totalRounds && get().phase === 'regular-season') {
          get().simCurrentRound()
        }
      },

      startFinals: () => {
        set((state) => {
          state.phase = 'finals'
        })
      },

      simFinalsRound: () => {
        // Dynamic import to avoid circular deps - finals module will be loaded
        // We'll call generateFinalsRound inline
        let state = get()
        const finalsWeek = state.season.finalsRounds.length + 1
        const finalsRoundMarker = 100 + finalsWeek

        const expiredCases = expirePendingUserTribunalCases(state.tribunalInbox, finalsRoundMarker)
          .filter((c, idx) =>
            state.tribunalInbox[idx] &&
            state.tribunalInbox[idx].status === 'pending-user' &&
            c.status === 'expired',
          )
        if (expiredCases.length > 0) {
          set((s) => {
            for (const expired of expiredCases) {
              const idx = s.tribunalInbox.findIndex((c) => c.id === expired.id)
              if (idx >= 0) s.tribunalInbox[idx] = expired
              const player = s.players[expired.playerId]
              if (!player) continue
              applyTribunalOutcomeToPlayer(player, expired)
              s.newsLog.push({
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `Tribunal deadline missed: ${player.firstName} ${player.lastName}`,
                body:
                  `No club response was lodged for ${player.firstName} ${player.lastName}. ` +
                  `${expired.outcomeSummary ?? 'Automatic sanction applied.'}`,
                category: 'discipline',
                clubIds: [player.clubId],
                playerIds: [player.id],
              })
            }
          })
          state = get()
        }

        // Get only finals match results
        const finalsMatches = state.matchResults.filter((m) => m.isFinal)

        // We need to dynamically generate the next finals round
        // Import is static but the module may not exist yet - handle gracefully
        try {
          const format = getFinalsFormatById(state.settings.finals.finalsFormat, state.settings.finals.customFinalsFormat)
          const round = generateFinalsRound(finalsWeek, state.ladder, finalsMatches, state.clubs, format, state.season.finalsRounds, state.settings.finals, state.currentYear)

          if (!round || round.fixtures.length === 0) {
            return { userMatch: null, seasonOver: true }
          }

          // Add round to season
          set((s) => {
            s.season.finalsRounds.push(round)
          })

          // Simulate the round
          const finalsClubIds = new Set<string>()
          for (const f of round.fixtures) {
            finalsClubIds.add(f.homeClubId)
            finalsClubIds.add(f.awayClubId)
          }
          set((s) => {
            applyRoleDisputesForFixtures(s, finalsClubIds)
          })
          state = get()

          const finalsGameplanOverrides: Record<string, ClubGameplan> = {}
          const { tacticalByClub: finalsTacticalByClub } = buildStaffImpactMaps(state)
          const finalsTacticalRng = new SeededRNG(state.rngSeed + finalsWeek * 5023)
          for (const fixture of round.fixtures) {
            for (const [clubId, opponentId] of [[fixture.homeClubId, fixture.awayClubId], [fixture.awayClubId, fixture.homeClubId]] as const) {
              const club = state.clubs[clubId]
              const opponent = state.clubs[opponentId]
              if (!club || !opponent) continue
              if (clubId === state.playerClubId) continue
              const tacticalContext = finalsTacticalByClub[club.id] ?? { tacticalAdjustment: 0.7, discipline: 60 }
              const override = buildCounterAdjustment(club, opponent.gameplan, finalsTacticalRng, tacticalContext)
              finalsGameplanOverrides[clubId] = applyGameplanAdjustment(club.gameplan, override)
            }
          }

          const result = simulateRound({
            round,
            roundIndex: 100 + finalsWeek, // Offset to avoid colliding with H&A round indices
            players: state.players,
            clubs: state.clubs,
            gameplanOverrides: finalsGameplanOverrides,
            rngSeed: state.rngSeed,
            playerClubId: state.playerClubId,
            matchRules: state.settings.matchRules,
          })

          // Mark finals matches
          const finalsResults = result.matches.map((m) => ({ ...m, isFinal: true }))

          set((s) => {
            for (const m of finalsResults) {
              s.matchResults.push(m)
            }
            s.meta.lastSaved = new Date().toISOString()
          })

          // Apply effects
          const playedStats: Record<string, import('@/types/match').MatchPlayerStats> = {}
          for (const m of finalsResults) {
            if (!m.result) continue
            for (const ps of [...m.result.homePlayerStats, ...m.result.awayPlayerStats]) {
              playedStats[ps.playerId] = ps
            }
          }

          // Roll for finals match injuries
          const finalsInjuryRng = new SeededRNG(state.rngSeed + finalsWeek * 1013)
          const staffListForMedical = Object.values(state.staff)
          const finalsMedicalImpact: Record<string, import('@/engine/staff/staffEngine').MedicalStaffImpact> = {}
          for (const clubId of finalsClubIds) {
            finalsMedicalImpact[clubId] = getMedicalStaffImpact(staffListForMedical, clubId)
          }
          const finalsInjuries = finalsResults.flatMap((m) => {
            if (!m.result) return []
            const matchPlayerIds = [
              ...m.result.homePlayerStats.map((ps) => ps.playerId),
              ...m.result.awayPlayerStats.map((ps) => ps.playerId),
            ]
            return rollMatchInjuries(
              matchPlayerIds,
              state.players,
              finalsInjuryRng,
              'high',
              state.settings.injuryFrequency,
              state.currentDate,
              finalsMedicalImpact,
            )
          })
          const finalsTribunalRng = new SeededRNG(state.rngSeed + finalsWeek * 1877)
          const newTribunalCases = generateTribunalCasesFromMatches({
            matches: finalsResults,
            players: state.players,
            userClubId: state.playerClubId,
            date: state.currentDate,
            roundMarker: finalsRoundMarker,
            phase: 'finals',
            rng: finalsTribunalRng,
          })
          const resolvedAICases = resolveAITribunalCases({
            caseItems: newTribunalCases.filter((c) => c.status === 'pending-ai'),
            clubs: state.clubs,
            rng: finalsTribunalRng,
          })
          const pendingUserCases = newTribunalCases.filter((c) => c.status === 'pending-user')

          set((s) => {
            applyPostRoundEffects(s.players, playedStats)

            // Apply finals injuries
            for (const inj of finalsInjuries) {
              const p = s.players[inj.playerId]
              if (p) {
                applyInjuryEvent(p, inj)
                s.newsLog.push({
                  id: crypto.randomUUID(),
                  date: s.currentDate,
                  headline: `${p.firstName} ${p.lastName} injured in finals (${inj.weeksOut}w)`,
                  body:
                    `${p.firstName} ${p.lastName} picked up ${inj.type} in finals and is expected to miss ` +
                    `${inj.weeksOut} week${inj.weeksOut === 1 ? '' : 's'} (${inj.severity}).`,
                  category: 'injury',
                  clubIds: [p.clubId],
                  playerIds: [p.id],
                })
              }
            }

            healInjuries(s.players, s.currentDate, finalsMedicalImpact)
            serveSuspensionWeeks(s.players)

            for (const tribunalCase of resolvedAICases) {
              s.tribunalInbox.push(tribunalCase)
              const player = s.players[tribunalCase.playerId]
              if (!player) continue
              applyTribunalOutcomeToPlayer(player, tribunalCase)
              s.newsLog.push({
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline:
                  tribunalCase.finalWeeks && tribunalCase.finalWeeks > 0
                    ? `${player.firstName} ${player.lastName} suspended (${tribunalCase.finalWeeks}w)`
                    : `${player.firstName} ${player.lastName} cleared by tribunal`,
                body:
                  `${player.firstName} ${player.lastName}: ${tribunalCase.incidentSummary}. ` +
                  `${tribunalCase.outcomeSummary ?? ''}`.trim(),
                category: 'discipline',
                clubIds: [player.clubId],
                playerIds: [player.id],
              })
            }

            for (const tribunalCase of pendingUserCases) {
              s.tribunalInbox.push(tribunalCase)
              const player = s.players[tribunalCase.playerId]
              if (!player) continue
              s.newsLog.push({
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `Tribunal hearing: ${player.firstName} ${player.lastName}`,
                body:
                  `${tribunalCase.incidentSummary}. Recommended sanction: ` +
                  `${tribunalCase.recommendedWeeks} week${tribunalCase.recommendedWeeks === 1 ? '' : 's'}. ` +
                  `Decision due before next finals match.`,
                category: 'discipline',
                clubIds: [player.clubId],
                playerIds: [player.id],
              })
            }

            // Update morale post-match for finals
            for (const m of finalsResults) {
              if (!m.result) continue
              const homeSelected = new Set(m.result.homePlayerStats.map((ps) => ps.playerId))
              const awaySelected = new Set(m.result.awayPlayerStats.map((ps) => ps.playerId))
              const homeWon = m.result.homeTotalScore > m.result.awayTotalScore
              const awayWon = m.result.awayTotalScore > m.result.homeTotalScore
              const draw = m.result.homeTotalScore === m.result.awayTotalScore
              updateMoralePostMatch(s.players, homeSelected, m.homeClubId, homeWon, draw)
              updateMoralePostMatch(s.players, awaySelected, m.awayClubId, awayWon, draw)
            }
          })

          const allFinals = [...finalsMatches, ...finalsResults]
          const seasonOver = isSeasonComplete(allFinals)
          if (seasonOver) {
            const premier = getPremier(allFinals)
            set((s) => {
              s.phase = 'post-season'

              // Record season result in history
              const updatedHistory = recordSeasonResult(
                s.history,
                s.currentYear,
                allFinals,
                s.ladder,
              )
              s.history = updatedHistory

              // Compute end-of-season awards
              const seasonAwards = computeSeasonAwards(
                s.currentYear,
                s.players,
                s.ladder,
                s.brownlowTracker,
                Object.keys(s.clubs),
              )
              s.awards.push(seasonAwards)

              // News items for awards
              if (seasonAwards.brownlowMedal) {
                const bp = s.players[seasonAwards.brownlowMedal.playerId]
                if (bp) {
                  s.newsLog.push({
                    id: crypto.randomUUID(),
                    date: s.currentDate,
                    headline: `${bp.firstName} ${bp.lastName} wins the ${s.currentYear} Brownlow Medal`,
                    body: `${bp.firstName} ${bp.lastName} polled ${seasonAwards.brownlowMedal.votes} votes to win the Brownlow Medal.`,
                    category: 'milestone',
                    clubIds: [bp.clubId],
                    playerIds: [bp.id],
                  })
                }
              }

              if (seasonAwards.colemanMedal) {
                const cp = s.players[seasonAwards.colemanMedal.playerId]
                if (cp) {
                  s.newsLog.push({
                    id: crypto.randomUUID(),
                    date: s.currentDate,
                    headline: `${cp.firstName} ${cp.lastName} wins the ${s.currentYear} Coleman Medal`,
                    body: `${cp.firstName} ${cp.lastName} kicked ${seasonAwards.colemanMedal.goals} goals to win the Coleman Medal.`,
                    category: 'milestone',
                    clubIds: [cp.clubId],
                    playerIds: [cp.id],
                  })
                }
              }

              if (premier) {
                s.newsLog.push({
                  id: crypto.randomUUID(),
                  date: s.currentDate,
                  headline: `${s.clubs[premier]?.fullName ?? premier} wins the ${s.currentYear} Premiership!`,
                  body: `Congratulations to ${s.clubs[premier]?.fullName ?? premier} on winning the Grand Final.`,
                  category: 'match',
                  clubIds: [premier],
                  playerIds: [],
                })
              }
            })
          }

          return { userMatch: result.userMatch, seasonOver }
        } catch {
          // Finals module not available yet
          return { userMatch: null, seasonOver: false }
        }
      },
    })),
    {
      name: 'afl-manager-save',
      storage: createJSONStorage(() => idbStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<GameState> | undefined
        if (!persisted) return currentState

        // Ensure new fields exist on old saves
        const merged = { ...currentState, ...persisted }
        if (!merged.history) {
          merged.history = { seasons: [], draftHistory: [], developmentReports: [] }
        }
        if (merged.history && !(merged.history as { developmentReports?: unknown }).developmentReports) {
          ;(merged.history as import('@/types/history').GameHistory).developmentReports = []
        }

        // --- Migrate flat settings to nested format ---
        const s = merged.settings as unknown as Record<string, unknown>
        if (!s.seasonStructure) {
          // Old flat format detected — migrate to nested
          const defaults = createDefaultSettings()
          merged.settings = {
            ...defaults,
            difficulty: (s.difficulty as GameSettings['difficulty']) ?? 'medium',
            simSpeed: (s.simSpeed as GameSettings['simSpeed']) ?? 'normal',
            leagueMode: (s.leagueMode as GameSettings['leagueMode']) ?? 'real',
            teamCount: (s.teamCount as number) ?? 18,
            salaryCap: s.salaryCap !== undefined ? (s.salaryCap as boolean) : true,
            salaryCapAmount: (s.salaryCapAmount as number) ?? 15_500_000,
            realism: { ...DEFAULT_REALISM, boardPressure: s.boardPressure !== undefined ? (s.boardPressure as boolean) : true },
            injuryFrequency: (s.injuryFrequency as GameSettings['injuryFrequency']) ?? 'medium',
            developmentSpeed: (s.developmentSpeed as GameSettings['developmentSpeed']) ?? 'normal',
            // Migrate finalsFormat from flat to nested finals
            finals: {
              ...defaults.finals,
              finalsFormat: (s.finalsFormat as GameSettings['finals']['finalsFormat']) ?? 'afl-top-8',
            },
            // Migrate interchangePlayers from flat to nested matchRules
            matchRules: {
              ...defaults.matchRules,
              interchangePlayers: (s.interchangePlayers as number) ?? 4,
            },
          }
        }

        // Migrate old possessionsPerQuarter to possessionsMultiplier
        const mr = merged.settings?.matchRules as unknown as Record<string, unknown> | undefined
        if (mr && 'possessionsPerQuarter' in mr && !('possessionsMultiplier' in mr)) {
          const oldVal = (mr.possessionsPerQuarter as number) ?? 140
          mr.possessionsMultiplier = Math.round((oldVal / 140) * 10) / 10
          delete mr.possessionsPerQuarter
        }

        // Migrate old playerPreferredSlot removal
        const fs = merged.settings?.fixtureSchedule as unknown as Record<string, unknown> | undefined
        if (fs && 'playerPreferredSlot' in fs) {
          delete fs.playerPreferredSlot
        }

        // Add seasonStartDate if missing
        if (merged.settings && !merged.settings.seasonStartDate) {
          merged.settings.seasonStartDate = '2026-03-20'
        }

        // Add gameStartDate if missing
        if (merged.settings && !merged.settings.gameStartDate) {
          merged.settings.gameStartDate = computeDefaultGameStartDate(merged.currentYear ?? 2026)
        }

        // Migrate grandFinalVenueMode
        const fin = merged.settings?.finals as unknown as Record<string, unknown> | undefined
        if (fin && !('grandFinalVenueMode' in fin)) {
          fin.grandFinalVenueMode = 'fixed'
        }

        // Migrate boardPressure into realism settings
        if (merged.settings && !(merged.settings as unknown as Record<string, unknown>).realism) {
          const oldBP = (merged.settings as unknown as Record<string, unknown>).boardPressure
          ;(merged.settings as unknown as Record<string, unknown>).realism = {
            ...DEFAULT_REALISM,
            boardPressure: oldBP !== undefined ? (oldBP as boolean) : true,
          }
          delete (merged.settings as unknown as Record<string, unknown>).boardPressure
        }

        if (!merged.calendar) {
          merged.calendar = { events: [], currentDate: merged.currentDate || '2026-03-01' }
        }
        if (!merged.awards) {
          merged.awards = []
        }
        if (!merged.brownlowTracker) {
          merged.brownlowTracker = []
        }
        if (merged.stateLeagues === undefined) {
          merged.stateLeagues = null
        }
        if (!merged.weekSchedule) {
          merged.weekSchedule = {}
        }
        if (merged.offseasonState === undefined) {
          merged.offseasonState = null
        }

        // Sync currentSpend for all clubs on load (old saves may have stale values)
        if (merged.players && merged.clubs) {
          const allPlayers = Object.values(merged.players)
          for (const club of Object.values(merged.clubs)) {
            club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
          }
        }

        // Migrate listSizeEnforcement into realism settings
        const realismObj = merged.settings?.realism as unknown as Record<string, unknown> | undefined
        if (realismObj && !('listSizeEnforcement' in realismObj)) {
          realismObj.listSizeEnforcement = true
        }

        // Migrate negotiation system fields
        if ((merged as Record<string, unknown>).negotiations === undefined) {
          (merged as Record<string, unknown>).negotiations = null
        }
        if (realismObj && !('mediaLeaks' in realismObj)) {
          realismObj.mediaLeaks = true
        }
        if (realismObj && !('negotiationDelays' in realismObj)) {
          realismObj.negotiationDelays = true
        }
        if (realismObj && !('nominatedTradeDestinations' in realismObj)) {
          realismObj.nominatedTradeDestinations = true
        }
        if (realismObj && !('reducedNominatedLeverage' in realismObj)) {
          realismObj.reducedNominatedLeverage = true
        }
        if (realismObj && !('playersRefuseTrades' in realismObj)) {
          realismObj.playersRefuseTrades = true
        }
        if (realismObj && !('ngaAcademyZoneMatching' in realismObj)) {
          realismObj.ngaAcademyZoneMatching = true
        }
        if (realismObj && !('playerRoleDisputes' in realismObj)) {
          realismObj.playerRoleDisputes = true
        }
        if (realismObj && !('brownlowNight' in realismObj)) {
          realismObj.brownlowNight = true
        }

        // Migrate brownlowRevealed
        if ((merged as Record<string, unknown>).brownlowRevealed === undefined) {
          (merged as Record<string, unknown>).brownlowRevealed = false
        }
        if ((merged as Record<string, unknown>).tradeInbox === undefined) {
          (merged as Record<string, unknown>).tradeInbox = []
        }
        if ((merged as Record<string, unknown>).tradeBlock === undefined) {
          (merged as Record<string, unknown>).tradeBlock = initTradeBlockState()
        }
        if ((merged as Record<string, unknown>).tribunalInbox === undefined) {
          (merged as Record<string, unknown>).tribunalInbox = []
        }
        if ((merged as Record<string, unknown>).weeklyGameplans === undefined) {
          (merged as Record<string, unknown>).weeklyGameplans = {}
        }

        // Backfill draft class profile for old saves
        if (merged.draft && !(merged.draft as { classProfile?: unknown }).classProfile) {
          merged.draft.classProfile = {
            year: merged.draft.year,
            strength: 'average',
            strengthScore: 60,
            topEndTalent: 6,
            depthRating: 55,
          }
        }
        if (merged.draft && merged.draft.combineCompleted === undefined) {
          merged.draft.combineCompleted = false
          merged.draft.combineDate = null
        }
        if (merged.draft && (merged.draft as { pickTradeOffers?: unknown }).pickTradeOffers === undefined) {
          ;(merged.draft as { pickTradeOffers: DraftPickTradeOffer[] }).pickTradeOffers = []
        }
        if (merged.draft?.prospects) {
          for (const prospect of merged.draft.prospects) {
            if ((prospect as { linkedType?: unknown }).linkedType === undefined) {
              ;(prospect as DraftProspect).linkedType = prospect.linkedClubId ? 'father-son' : null
            }
            if (prospect.hiddenAttributes && prospect.hiddenAttributes.durability === undefined) {
              prospect.hiddenAttributes.durability = Math.max(
                20,
                Math.min(95, 100 - prospect.hiddenAttributes.injuryProneness),
              )
            }
          }
        }

        // Backfill scout specialization fields for old saves
        if (merged.scouts) {
          const regionDefaults: Record<ScoutingRegion, number> = {
            VIC: 50,
            SA: 50,
            WA: 50,
            'NSW/ACT': 50,
            QLD: 50,
            TAS: 50,
            NT: 50,
          }
          for (const scout of merged.scouts) {
            if (!(scout as unknown as { regionRatings?: unknown }).regionRatings) {
              ;(scout as unknown as { regionRatings: Record<ScoutingRegion, number> }).regionRatings = { ...regionDefaults }
            }
            if (!(scout as unknown as { specialtyRatings?: unknown }).specialtyRatings) {
              ;(scout as unknown as { specialtyRatings: import('@/types/draft').ScoutSpecialtyRatings }).specialtyRatings = {
                midfield: 50,
                forward: 50,
                defense: 50,
                ruck: 50,
                character: 50,
              }
            }
          }
        }

        // Backfill optional contract fields on existing players
        if (merged.players) {
          for (const player of Object.values(merged.players)) {
            if (player.contract && !player.contract.clauses) player.contract.clauses = []
            if (player.contract && !player.contract.structure) player.contract.structure = 'escalating'
            if (player.contract && player.contract.incentiveTotal === undefined) player.contract.incentiveTotal = 0
            if (player.hiddenAttributes && player.hiddenAttributes.durability === undefined) {
              player.hiddenAttributes.durability = Math.max(
                20,
                Math.min(95, 100 - player.hiddenAttributes.injuryProneness),
              )
            }
            if (!(player as { injuryHistory?: unknown }).injuryHistory) {
              ;(player as Player).injuryHistory = []
            }
            if ((player as { suspension?: unknown }).suspension === undefined) {
              ;(player as Player).suspension = null
            }
            if (!(player as { suspensionHistory?: unknown }).suspensionHistory) {
              ;(player as Player).suspensionHistory = []
            }
            if (player.injury) {
              if (player.injury.initialWeeks === undefined) {
                player.injury.initialWeeks = Math.max(1, player.injury.weeksRemaining)
              }
              if (player.injury.severity === undefined) {
                player.injury.severity =
                  player.injury.weeksRemaining >= 10 ? 'severe'
                  : player.injury.weeksRemaining >= 6 ? 'major'
                  : player.injury.weeksRemaining >= 3 ? 'moderate'
                  : 'minor'
              }
              if (player.injury.recoveryProgress === undefined) player.injury.recoveryProgress = 0
              if (player.injury.gamesMissed === undefined) player.injury.gamesMissed = 0
              if (player.injury.recurring === undefined) player.injury.recurring = false
              if (player.injury.recurrenceRisk === undefined) player.injury.recurrenceRisk = 0
              if (player.injury.bodyRegion === undefined) player.injury.bodyRegion = 'soft-tissue'
            }
            if (player.seasonStats.uncontestedPossessions === undefined) {
              player.seasonStats.uncontestedPossessions = 0
            }
            if (player.seasonStats.freesFor === undefined) {
              player.seasonStats.freesFor = 0
              player.seasonStats.freesAgainst = 0
            }
            if (player.seasonStats.aflFantasyPoints === undefined) {
              player.seasonStats.aflFantasyPoints = 0
              player.seasonStats.superCoachPoints = 0
            }
            if (player.careerStats.uncontestedPossessions === undefined) {
              player.careerStats.uncontestedPossessions = 0
            }
            if (player.careerStats.freesFor === undefined) {
              player.careerStats.freesFor = 0
              player.careerStats.freesAgainst = 0
            }
            if (player.careerStats.aflFantasyPoints === undefined) {
              player.careerStats.aflFantasyPoints = 0
              player.careerStats.superCoachPoints = 0
            }
            if (!(player as { preferredRole?: unknown }).preferredRole) {
              player.preferredRole = mapPrimaryPositionToPreferredRole(player.position.primary)
            }
            if (!(player as { archetype?: unknown }).archetype) {
              const seed = (hashCode(player.id) % 10_000) / 10_000
              player.archetype = pickArchetypeForRole(player.preferredRole, seed)
            }
          }
        }

        return merged as GameStore
      },
    },
  ),
)

function hashCode(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}
