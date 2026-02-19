import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { get, set, del } from 'idb-keyval'

import type {
  GameState,
  GamePhase,
  GameMeta,
  GameSettings,
  NewsItem,
  CoachingJobOpening,
  SimulationStatus,
  SavedLineup,
  Shortlist,
  ShortlistPriority,
  ShortlistTargetType,
  WeeklyMatchupTactics,
} from '@/types/game'
import type { TradeInboxItem, TradeNegotiationOffer } from '@/types/trade'
import type { ScheduleSlot } from '@/types/calendar'
import type { TrainingFocus } from '@/engine/training/trainingEngine'
import type { GameHistory } from '@/types/history'
import type { Club, ClubBudgetAllocation, ClubFacilities, MembershipTierId } from '@/types/club'
import {
  createInitialMembershipState,
  processSeasonEndMembership,
  getPlayerStarRatingCountForClub,
} from '@/engine/clubs/membershipEngine'
import type { LeagueConfig } from '@/types/expansion'
import type {
  LineupSlot,
  Player,
  PlayerPositionType,
  PlayerTrainingFocus,
} from '@/types/player'
import type { Match } from '@/types/match'
import type { Season, LadderEntry, Fixture, MatchDay } from '@/types/season'
import type { ClubGameplan } from '@/types/club'
import type { GameCalendar } from '@/types/calendar'
import type { DraftPickTradeOffer, DraftProspect } from '@/types/draft'
import clubsJson from '@/data/clubs.json'
import { generatePlayers, generateStateLeagueContractPlayers } from '@/data/players'
import { generateFixture, createInitialLadder } from '@/engine/season/fixtureGenerator'
import { validateFixture } from '@/engine/season/fixtureValidator'
import { simulateRound, isRegularSeasonComplete, applyPostRoundEffects } from '@/engine/season/advanceRound'
import { processMatchResults } from '@/engine/season/processResults'
import { computeWeeklyPowerRankings } from '@/engine/season/powerRankings'
import { buildSeasonCalibrationReport } from '@/engine/season/calibrationReport'
import { generateFinalsRound, isSeasonComplete, getPremier } from '@/engine/season/finals'
import { recordSeasonResult } from '@/engine/history/historyEngine'
import { createSeasonArchive } from '@/engine/history/seasonArchive'
import {
  createDefaultRecordsBook,
  normalizeRecordsBook,
  refreshRecordsBookLeaderboards,
  updateRecordsBookForMatches,
} from '@/engine/history/recordsBook'
import { getFinalsFormatById } from '@/engine/season/finalsFormats'
import { applyInjuryEvent, rollMatchInjuries, healInjuries } from '@/engine/players/injuries'
import {
  applyTribunalOutcomeToPlayer,
  expirePendingUserTribunalCases,
  generateTribunalCasesFromMatches,
  resolveAITribunalCases,
  resolveUserTribunalCase,
  serveSuspensionWeeks,
  getLegalRepByTier,
} from '@/engine/players/tribunal'
import type {
  TribunalPlea,
  TribunalLegalRep,
} from '@/types/discipline'
import { isPlayerSuspended } from '@/engine/players/availability'
import { canBeSelectedForAfl, hasActiveStateLeagueContract, isAflListedPlayer, isStateLeagueContracted } from '@/engine/players/contracts'
import { applyRoleDisputeMorale, updateMoralePostMatch } from '@/engine/players/morale'
import { applyBetweenRoundMorale, generateMoraleWarnings } from '@/engine/players/happiness'
import { selectBestLineup } from '@/engine/ai/lineupSelection'
import { getLineupSlots, SLOT_POSITION_COMPATIBILITY } from '@/engine/core/constants'
import { SeededRNG } from '@/engine/core/rng'
import {
  generateClubStaff,
  generateStaffPool,
  getCoachingImpact,
  getMedicalStaffImpact,
  processCoachingCarousel,
  getReservesStaffImpact,
} from '@/engine/staff/staffEngine'
import {
  awardBrownlowVotes,
  computeSeasonAwards,
  buildSeasonAwardRecord,
  detectCareerMilestones,
} from '@/engine/awards/awardsEngine'
import { awardClubBFVotes } from '@/engine/awards/clubBFEngine'
import { addDays, buildSeasonCalendar, computeDefaultGameStartDate, getYear } from '@/engine/calendar/calendarEngine'
import {
  initializeStateLeagues,
  rollStateLeaguesForNewSeason,
  simStateLeagueRound,
  applyStateLeagueAffiliationSettings,
} from '@/engine/stateLeague/stateLeagueEngine'
import {
  buildYouthCompetitions,
  generateAllYouthPlayers,
  buildInitialLadder,
  rollNewCohort,
} from '@/engine/youth/youthPlayerGenerator'
import { simYouthCompRound } from '@/engine/youth/youthCompSimulator'
import { selectStateTeams, simulateNationalTournaments } from '@/engine/youth/tournamentSimulator'
import { convertYouthPlayersToDraftProspects, processYouthScoutAssignment } from '@/engine/youth/draftConversion'
import type { YouthCompId } from '@/types/youthPathway'
import { simulateReservesRound } from '@/engine/stateLeague/reservesSimulation'
import { buildUserStateLeagueContext } from '@/engine/stateLeague/reservesManagement'
import { createDefaultSettings, DEFAULT_REALISM } from '@/engine/core/defaultSettings'
import { autoSelectLeadership, getTeamLeadershipRating, getLeadershipMoraleBonus } from '@/engine/leadership/leadershipEngine'
import { updateClubCulture, getCultureMoraleBuffer, createDefaultCulture } from '@/engine/culture/cultureEngine'
import { calculateMomentumModifier, processSeasonEndFinances } from '@/engine/clubs/financeEngine'
import { generateSponsorshipOffers, processYearlyRenewal, updateSponsorSatisfaction, resolveSponsorCounter } from '@/engine/clubs/sponsorshipEngine'
import { computePerformanceGrantRecipients, DEFAULT_DISTRIBUTION_CONFIG } from '@/engine/clubs/distributionEngine'
import type { FinancialSeasonRecord } from '@/types/historyArchive'
import { advanceInflationIndex, DEFAULT_INFLATION_SETTINGS } from '@/engine/inflation/inflationEngine'
import type { ClubLeadership } from '@/types/club'
import { getDevelopmentSpeedMultiplier } from '@/engine/core/difficultyPresets'
import {
  generateDefaultAllocations,
  generateSoldGameOffers,
  applyVenueAllocationsToFixture,
  resolveVenueId,
  updateFanSatisfaction,
  calculateMatchDayRevenue,
} from '@/engine/venues/venueEngine'
import { createInitialClubIdentity } from '@/engine/clubs/identity'
import {
  updateMediaPressure,
  generateRoundPressureStories,
  generateTradePressureStory,
  generatePlayerUnrestPressureStory,
  getMediaPressureMoraleEffect,
} from '@/engine/media/pressureEngine'
import {
  generateAIBudgetAllocation,
  getClubBudgetAllocation,
  getBudgetMultiplier,
  validateBudgetAllocation,
} from '@/engine/clubs/budgetEngine'
import { createLoan, processLoanRepayments } from '@/engine/clubs/financePlanningEngine'
import {
  assignRoundBroadcasts,
  getBroadcastRevenue,
  getBroadcastSatisfactionSwing,
} from '@/engine/season/broadcastEngine'
import {
  evaluateLeagueEvolution,
  buildExpansionClub,
  applyContraction,
  applyRelocation,
  applyMerger,
} from '@/engine/leagueEvolution/leagueEvolutionEngine'
import type {
  LeagueExpansionEvent,
  LeagueContractionEvent,
  LeagueRelocationEvent,
  LeagueMergerEvent,
} from '@/types/leagueEvolution'
import {
  computeApprovalProbability,
  canRequestUpgrade,
  requestFacilityUpgrade as requestFacilityUpgradeEngine,
  tickFacilityUpgrades,
  tickAIFacilityUpgrades,
} from '@/engine/clubs/facilityUpgradeEngine'
import {
  needsBoardApproval,
  computeBoardApproval,
  rollBoardApproval,
  isApprovalOnCooldown,
} from '@/engine/board/boardApprovalEngine'
import type { BoardApprovalResult } from '@/types/boardApproval'
import {
  computeInstabilityScore,
  shouldCheckForSpill,
  rollForSpillEvent,
  generateSpillEvent,
  resolveSpillEvent as resolveSpillEventEngine,
  updateConsecutiveLosses,
  createInitialBoardInstabilityState,
  resetSeasonInstability,
} from '@/engine/board/boardInstabilityEngine'
import { VENUES } from '@/data/venues'
import { rollTrainingInjuries } from '@/engine/players/trainingInjuries'
import {
  initOffseason,
  advanceOffseasonPhase as advanceOffseasonPhaseEngine,
  processSeasonEnd,
  processRetirements,
  processAIDelistings,
  processAITradePeriod,
  processPreseason,
  startNewSeason,
} from '@/engine/season/offseasonFlow'
import type { PracticeMatchState } from '@/engine/season/offseasonFlow'
import {
  buildPracticeMatchFixture,
  simulatePracticeMatch,
  applyPracticeMatchEffects,
} from '@/engine/season/preseasonEngine'
import type { PracticeMatchResult } from '@/engine/season/preseasonEngine'
import { mapPrimaryPositionToPreferredRole, pickArchetypeForRole } from '@/engine/player/roles'
import { getOverallRating, getPlayerStarRating, syncPlayerPositionRatings } from '@/engine/player/playerRating'
import {
  autoAssignClubJumperNumbers,
  isJumperNumberAvailable,
  isValidJumperNumber,
  upsertPlayerJumperHistory,
} from '@/engine/player/jumperNumbers'
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
  suggestNextPick,
  delegatedStaffPick,
} from '@/engine/draft/draftEngine'
import type { DelegatedPickRecord } from '@/engine/draft/draftEngine'
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
  computePhaseForDate,
  advanceHalfDay as advanceHalfDayEngine,
  advanceToNextMilestone as advanceToNextMilestoneEngine,
  validateOffseasonProgression,
} from '@/engine/offseason/offseasonCalendar'
import { averageAttributes } from '@/engine/contracts/negotiation'
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
import { assignAgentToPlayer } from '@/engine/contracts/agentRegistry'
import {
  getDefaultRelationship,
  getRelationshipModifiers,
  applyNegotiationOutcome,
  applyMoodBias,
} from '@/engine/contracts/agentRelationships'
import { processAIReSignings } from '@/engine/contracts/aiNegotiations'
import { evaluateAndUpdateAIStrategies } from '@/engine/clubs/strategyEvaluation'
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
import {
  generateBoardExpectation,
  evaluateBoardSatisfaction,
  applyFanSatisfactionToJobSecurity,
} from '@/engine/clubs/clubManagement'
import { runAflHouseEndOfYearEvolution } from '@/engine/league/aflHouseEvolution'
import {
  applyPromotionRelegation,
  initializeMultiTierState,
  simulateMultiTierRound,
} from '@/engine/league/multiTierEngine'
import { scheduleSpecialEvents as scheduleSpecialEventsEngine } from '@/engine/specialEvents/eventScheduler'
import { simulateSpecialMatch, applySpecialMatchImpact } from '@/engine/specialEvents/specialMatchSim'
import { getEventDefinition } from '@/engine/specialEvents/eventDefinitions'
import { injectSpecialEvents } from '@/engine/calendar/calendarEngine'
import {
  buildUpcomingMilestoneNotes,
  formatUpcomingMilestoneSummary,
} from '@/engine/narrative/upcomingMilestones'
import { applyMediaCoverage, deriveMediaStories } from '@/engine/media/mediaFeedEngine'
import { generateMatchReport } from '@/engine/match/matchReport'

const OFFSEASON_PHASE_START_OFFSETS: Record<import('@/engine/season/offseasonFlow').OffseasonPhase, number> = {
  'season-end': 0,
  retirements: 7,
  delistings: 10,
  'trade-period': 14,
  'free-agency': 35,
  'national-draft': 49,
  'rookie-draft': 52,
  'supplemental-signing': 54,
  preseason: 56,
  'venue-allocation': 70,
  'practice-matches': 77,
  ready: 84,
}

const LEGACY_SIGNING_WATCHLIST_ID = 'legacy-signing-watchlist'
const LEGACY_SIGNING_SHORTLIST_ID = 'legacy-signing-shortlist'
const LEGACY_SIGNING_WATCHLIST_NAME = 'Signing Watchlist'
const LEGACY_SIGNING_SHORTLIST_NAME = 'Signing Shortlist'

function findShortlistEntryIndex(shortlist: Shortlist, targetType: ShortlistTargetType, targetId: string): number {
  return shortlist.entries.findIndex((entry) => entry.targetType === targetType && entry.targetId === targetId)
}

function ensureShortlist(
  state: Pick<GameState, 'shortlists'>,
  shortlistId: string,
  fallbackName: string,
): Shortlist {
  const existing = state.shortlists.find((item) => item.id === shortlistId)
  if (existing) return existing
  const now = new Date().toISOString()
  const created: Shortlist = {
    id: shortlistId,
    name: fallbackName,
    createdAt: now,
    updatedAt: now,
    entries: [],
  }
  state.shortlists.push(created)
  return created
}

function syncLegacySigningArrays(state: Pick<GameState, 'shortlists' | 'signingWatchlistPlayerIds' | 'signingShortlistPlayerIds'>): void {
  const watchlist = state.shortlists.find((item) => item.id === LEGACY_SIGNING_WATCHLIST_ID)
  const shortlist = state.shortlists.find((item) => item.id === LEGACY_SIGNING_SHORTLIST_ID)
  state.signingWatchlistPlayerIds = (watchlist?.entries ?? [])
    .filter((entry) => entry.targetType === 'player')
    .map((entry) => entry.targetId)
  state.signingShortlistPlayerIds = (shortlist?.entries ?? [])
    .filter((entry) => entry.targetType === 'player')
    .map((entry) => entry.targetId)
}

function pushUpcomingMilestoneNews(state: GameState): void {
  if (state.phase !== 'regular-season') return
  const round = state.season.rounds[state.currentRound]
  if (!round) return
  if ((round.byeClubIds ?? []).includes(state.playerClubId)) return

  const fixture = round.fixtures.find(
    (f) => f.homeClubId === state.playerClubId || f.awayClubId === state.playerClubId,
  )
  if (!fixture) return

  const likelyHomeLineup = Object.values(
    selectBestLineup(
      Object.values(state.players),
      fixture.homeClubId,
      {
        interchangePlayers: state.settings.matchRules.interchangePlayers,
        club: state.clubs[fixture.homeClubId],
      },
    ).lineup,
  )
    .filter((id): id is string => Boolean(id))
  const likelyAwayLineup = Object.values(
    selectBestLineup(
      Object.values(state.players),
      fixture.awayClubId,
      {
        interchangePlayers: state.settings.matchRules.interchangePlayers,
        club: state.clubs[fixture.awayClubId],
      },
    ).lineup,
  )
    .filter((id): id is string => Boolean(id))
  const candidatePlayerIds = [...new Set([...likelyHomeLineup, ...likelyAwayLineup])]
  const notes = buildUpcomingMilestoneNotes(state.players, candidatePlayerIds).slice(0, 5)
  if (notes.length === 0) return

  const roundNumber = round.number ?? state.currentRound + 1
  const newsId = `milestone-watch-${state.currentYear}-${roundNumber}-${fixture.homeClubId}-${fixture.awayClubId}`
  if (state.newsLog.some((item) => item.id === newsId)) return

  const homeName = state.clubs[fixture.homeClubId]?.abbreviation ?? fixture.homeClubId
  const awayName = state.clubs[fixture.awayClubId]?.abbreviation ?? fixture.awayClubId
  const lines = notes.map((note) => `- ${formatUpcomingMilestoneSummary(note)}`)
  const involvedPlayers = new Set<string>()
  const involvedClubs = new Set<string>([fixture.homeClubId, fixture.awayClubId])
  for (const note of notes) {
    involvedPlayers.add(note.playerId)
    involvedClubs.add(note.clubId)
    if (note.targetPlayerId) involvedPlayers.add(note.targetPlayerId)
  }

  appendNewsItem(state, {
    id: newsId,
    date: state.currentDate,
    headline: `Round ${roundNumber} milestone watch: ${homeName} vs ${awayName}`,
    body: lines.join('\n'),
    category: 'milestone',
    clubIds: [...involvedClubs],
    playerIds: [...involvedPlayers],
  })
}

function trackSigningInteraction(state: GameState, playerId: string): void {
  if (!playerId) return
  if (!state.signingInteractionPlayerIds.includes(playerId)) {
    state.signingInteractionPlayerIds.push(playerId)
  }
}

function getUserFixtureForCurrentRound(state: Pick<GameState, 'season' | 'currentRound' | 'playerClubId'>): Fixture | null {
  const round = state.season.rounds[state.currentRound]
  if (!round) return null
  return round.fixtures.find(
    (f) => f.homeClubId === state.playerClubId || f.awayClubId === state.playerClubId,
  ) ?? null
}

function getUserOpponentClubId(state: Pick<GameState, 'season' | 'currentRound' | 'playerClubId'>): string | null {
  const fixture = getUserFixtureForCurrentRound(state)
  if (!fixture) return null
  return fixture.homeClubId === state.playerClubId ? fixture.awayClubId : fixture.homeClubId
}

function normalizeClubJumperNumbers(
  state: Pick<GameState, 'players' | 'clubs' | 'currentYear'>,
  clubId: string,
): number {
  if (!state.clubs[clubId]) return 0
  const result = autoAssignClubJumperNumbers(state.players, clubId, state.currentYear)
  return result.changedPlayerIds.length
}

function normalizeAllClubJumperNumbers(state: Pick<GameState, 'players' | 'clubs' | 'currentYear'>): number {
  let changed = 0
  for (const clubId of Object.keys(state.clubs)) {
    changed += normalizeClubJumperNumbers(state, clubId)
  }
  return changed
}

const DEFAULT_STATE_LEAGUE_CONTRACT_TARGET = 14

function getStateLeagueContractedCount(players: Record<string, Player>, clubId: string): number {
  return Object.values(players).filter((p) => p.clubId === clubId && isStateLeagueContracted(p)).length
}

function nextStateLeaguePlayerIndex(players: Record<string, Player>, clubId: string): number {
  const prefix = `${clubId}-state-player-`
  let max = 0
  for (const id of Object.keys(players)) {
    if (!id.startsWith(prefix)) continue
    const suffix = Number(id.slice(prefix.length))
    if (Number.isFinite(suffix)) max = Math.max(max, suffix)
  }
  return max + 1
}

function appendContractHistory(player: Player, date: string, type: 'state-sign' | 'state-renew' | 'state-delist' | 'afl-sign', note: string): void {
  if (!player.contractHistory) player.contractHistory = []
  player.contractHistory.push({ date, type, note })
}

function recruitStateLeagueDepthPlayers(
  state: GameState,
  clubId: string,
  count: number,
  source: 'affiliate' | 'recruitment' | 'renewal',
  delegated: boolean,
): string[] {
  if (count <= 0) return []
  const seed = state.rngSeed + state.currentRound * 431 + state.currentYear * 977 + count * 19
  const generated = generateStateLeagueContractPlayers(clubId, seed, count, state.currentDate)
  const startIndex = nextStateLeaguePlayerIndex(state.players, clubId)
  const addedIds: string[] = []
  for (let i = 0; i < generated.length; i++) {
    const p = generated[i]
    if (!p) continue
    const nextId = `${clubId}-state-player-${String(startIndex + i).padStart(3, '0')}`
    p.id = nextId
    p.contractTier = 'state-league'
    p.listStatus = 'reserves'
    p.stateLeagueContract = {
      yearsRemaining: source === 'renewal' ? 2 : 1,
      annualValue: p.stateLeagueContract?.annualValue ?? 70_000,
      signedDate: state.currentDate,
      source,
    }
    appendContractHistory(
      p,
      state.currentDate,
      'state-sign',
      delegated ? 'Signed on delegated state-league recommendation.' : 'Signed to state-league affiliate contract.',
    )
    state.players[nextId] = p
    addedIds.push(nextId)
  }
  return addedIds
}

function removeStateLeagueContractedPlayerFromReservesState(state: GameState, playerId: string): void {
  delete state.reserves.playerAvailabilityAssignments[playerId]
  delete state.reserves.seasonStatsByPlayer[playerId]
  state.reserves.lastRoundPerformances = state.reserves.lastRoundPerformances.filter((entry) => entry.playerId !== playerId)
  state.reserves.promotionWatchlist = state.reserves.promotionWatchlist.filter((id) => id !== playerId)
  state.reserves.managedLineupPlayerIds = state.reserves.managedLineupPlayerIds.filter((id) => id !== playerId)
  for (const [slot, id] of Object.entries(state.reserves.managedLineupSlotAssignments) as Array<[LineupSlot, string]>) {
    if (id === playerId) delete state.reserves.managedLineupSlotAssignments[slot]
  }
}

function processStateLeagueContractsForNewSeason(state: GameState): void {
  const rng = new SeededRNG(state.rngSeed + state.currentYear * 701 + 13)
  const clubIds = Object.keys(state.clubs)
  for (const clubId of clubIds) {
    const clubStaff = Object.values(state.staff).filter((member) => member.clubId === clubId)
    const reservesCoach = clubStaff.find((member) => member.role === 'reserves-coach') ?? null
    const recruitingLead = clubStaff.find((member) => member.role === 'recruiting-manager')
      ?? clubStaff.find((member) => member.role === 'head-coach')
      ?? null
    const developmentLift = ((reservesCoach?.ratings.development ?? 50) - 50) / 320
    const recruitmentLift = ((recruitingLead?.ratings.recruitment ?? 50) - 50) / 360

    const clubStatePlayers = Object.values(state.players)
      .filter((p) => p.clubId === clubId && isStateLeagueContracted(p))

    for (const player of clubStatePlayers) {
      if (!player.stateLeagueContract) continue
      player.stateLeagueContract.yearsRemaining = Math.max(0, player.stateLeagueContract.yearsRemaining - 1)
    }

    const delegated = clubId === state.playerClubId
      ? state.reserves.stateLeagueContractDelegationEnabled
      : true
    const targetCount = clubId === state.playerClubId
      ? state.reserves.stateLeagueContractTargetCount
      : DEFAULT_STATE_LEAGUE_CONTRACT_TARGET
    if (!delegated) continue

    const expiring = clubStatePlayers.filter((p) => (p.stateLeagueContract?.yearsRemaining ?? 0) <= 0)
    for (const player of expiring) {
      const perf = state.reserves.seasonStatsByPlayer[player.id]
      const avgRating = perf && perf.gamesPlayed > 0
        ? (state.reserves.lastRoundPerformances.find((x) => x.playerId === player.id)?.rating ?? 68)
        : 66
      const keepChance = Math.max(0.2, Math.min(0.85, 0.45 + (avgRating - 68) * 0.012 + (player.age <= 24 ? 0.08 : 0)))
      const finalKeepChance = Math.max(0.15, Math.min(0.92, keepChance + developmentLift + recruitmentLift))
      if (rng.chance(finalKeepChance)) {
        const years = rng.chance(0.28) ? 2 : 1
        player.stateLeagueContract = {
          yearsRemaining: years,
          annualValue: player.stateLeagueContract?.annualValue ?? 70_000,
          signedDate: state.currentDate,
          source: 'renewal',
        }
        appendContractHistory(player, state.currentDate, 'state-renew', `Auto-renewed for ${years} season${years === 1 ? '' : 's'}.`)
      } else {
        appendContractHistory(player, state.currentDate, 'state-delist', 'Auto-delisted by reserves program review.')
        player.clubId = ''
        player.listStatus = 'reserves'
        player.stateLeagueContract = null
        if (clubId === state.playerClubId) {
          removeStateLeagueContractedPlayerFromReservesState(state, player.id)
        }
      }
    }

    const activeCount = getStateLeagueContractedCount(state.players, clubId)
    if (activeCount < targetCount) {
      const toAdd = targetCount - activeCount
      const added = recruitStateLeagueDepthPlayers(state, clubId, toAdd, 'recruitment', true)
      if (clubId === state.playerClubId) {
        for (const playerId of added) {
          state.reserves.playerAvailabilityAssignments[playerId] = 'play'
        }
      }
    }
  }
}

function isSigningNewsItem(item: NewsItem): boolean {
  if (item.category !== 'contract') return false
  const headline = item.headline.toLowerCase()
  return (
    headline.includes(' signs with ') ||
    headline.includes(' re-signs with ') ||
    headline.includes(' commits to ')
  )
}

function upsertDigestItem(
  list: NewsItem[],
  date: string,
  line: string,
  clubIds: string[],
  playerIds: string[],
  channel: 'in-app' | 'email',
): void {
  const digestId = `signing-digest-${channel}-${date}`
  const existing = list.find((item) => item.id === digestId)
  if (!existing) {
    list.push(applyMediaCoverage({
      id: digestId,
      date,
      headline: `Daily Signing Digest (${channel === 'email' ? 'Email' : 'In-App'})`,
      body: line,
      category: 'contract',
      clubIds: [...clubIds],
      playerIds: [...playerIds],
      read: false,
    }))
    return
  }

  const existingLines = existing.body.split('\n').filter(Boolean)
  if (!existingLines.includes(line)) {
    existing.body = `${existing.body}\n${line}`
  }
  for (const clubId of clubIds) {
    if (!existing.clubIds.includes(clubId)) existing.clubIds.push(clubId)
  }
  for (const playerId of playerIds) {
    if (!existing.playerIds.includes(playerId)) existing.playerIds.push(playerId)
  }
  existing.read = false
  existing.media = applyMediaCoverage(existing).media
}

function pushNewsToList(list: NewsItem[], item: NewsItem): void {
  if (list.some((news) => news.id === item.id)) return
  list.push(item)
}

function appendNewsItem(
  state: GameState,
  item: NewsItem,
  options?: { includeDerived?: boolean; routeSigning?: boolean },
): boolean {
  const includeDerived = options?.includeDerived !== false
  const routeSigning = options?.routeSigning !== false
  const covered = applyMediaCoverage(item)

  const inserted = routeSigning
    ? pushSigningNotification(state, covered)
    : (pushNewsToList(state.newsLog, covered), true)

  if (!inserted) {
    return false
  }

  if (includeDerived) {
    for (const derived of deriveMediaStories(covered)) {
      appendNewsItem(state, derived, { includeDerived: false, routeSigning: false })
    }
  }

  return true
}

function pushSigningNotification(state: GameState, item: NewsItem): boolean {
  if (!isSigningNewsItem(item)) {
    pushNewsToList(state.newsLog, item)
    return true
  }

  const playerId = item.playerIds[0]
  const player = playerId ? state.players[playerId] : undefined
  const settings = state.settings.notifications.signings
  const starRating = player ? getPlayerStarRating(player) : 0
  const isMarquee = starRating >= settings.starThreshold
  const interacted =
    (playerId ? state.signingInteractionPlayerIds.includes(playerId) : false) ||
    (playerId ? state.signingWatchlistPlayerIds.includes(playerId) : false) ||
    (playerId ? state.signingShortlistPlayerIds.includes(playerId) : false) ||
    (playerId
      ? state.shortlists.some((list) =>
          list.entries.some((entry) => entry.targetType === 'player' && entry.targetId === playerId),
        )
      : false)

  if (!isMarquee && !interacted) {
    return false
  }

  if (!settings.inApp && !settings.email) {
    return false
  }

  const line = `${item.headline} - ${item.body}`
  if (settings.dailyDigest) {
    if (settings.inApp) {
      upsertDigestItem(state.newsLog, item.date, line, item.clubIds, item.playerIds, 'in-app')
    }
    if (settings.email) {
      upsertDigestItem(state.emailLog, item.date, line, item.clubIds, item.playerIds, 'email')
    }
    return true
  }

  if (settings.inApp) {
    pushNewsToList(state.newsLog, item)
  }
  if (settings.email) {
    pushNewsToList(state.emailLog, applyMediaCoverage({
      ...item,
      id: `${item.id}-email`,
      read: false,
    }))
  }
  return true
}

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
  playerSeasonStats: [],
  awards: [],
  milestones: [],
  retirementLegacies: [],
  originHistory: [],
  recordsBook: createDefaultRecordsBook(),
  seasonArchives: [],
  matchReports: [],
  financialHistory: [],
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

const DEFAULT_SIMULATION_STATUS: SimulationStatus = {
  active: false,
  title: '',
  detail: '',
  progress: null,
  currentStep: null,
  totalSteps: null,
  logs: [],
  startedAt: null,
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
  powerRankings: [],
  matchResults: [],
  newsLog: [],
  emailLog: [],
  rngSeed: Date.now(),
  signingInteractionPlayerIds: [],
  signingWatchlistPlayerIds: [],
  signingShortlistPlayerIds: [],
  shortlists: [],
  selectedLineup: null,
  selectedSubstituteId: null,
  savedLineups: [],
  draft: null,
  scouts: [],
  tradeHistory: [],
  history: { ...DEFAULT_HISTORY, recordsBook: createDefaultRecordsBook() },
  leagueConfig: {
    activeClubIds: [],
    expansionPlans: [],
    competitionModel: 'single-table',
    enablePromotionRelegation: false,
    tierCount: 1,
    promotionRelegationSpots: 1,
    clubTierMap: {},
    totalTeams: 18,
  },
  calendar: { ...DEFAULT_CALENDAR },
  weekSchedule: {},
  trainingWeekPlan: null,
  awards: [],
  brownlowTracker: [],
  bfTracker: [],
  brownlowRevealed: false,
  awardsNightCompleted: false,
  stateLeagues: null,
  youthPathway: null,
  offseasonState: null,
  venueState: null,
  negotiations: null,
  tradeInbox: [],
  tradeBlock: initTradeBlockState(),
  tribunalInbox: [],
  weeklyGameplans: {},
  reserves: {
    seasonStatsByPlayer: {},
    lastRoundPerformances: [],
    promotionWatchlist: [],
    delegationEnabled: true,
    managedLineupPlayerIds: [],
    managedLineupSlotAssignments: {},
    playerAvailabilityAssignments: {},
    lastSelectedLineupPlayerIds: [],
    leadership: {
      captainId: null,
      viceCaptainId: null,
      leadershipGroupIds: [],
    },
    tactics: {
      tempo: 'balanced',
      aggression: 'balanced',
      youthFocus: true,
    },
    stateLeagueContractDelegationEnabled: true,
    stateLeagueContractTargetCount: DEFAULT_STATE_LEAGUE_CONTRACT_TARGET,
  },
  specialEvents: null,
  multiTierState: null,
  facilityUpgrades: { requests: [], activeConstructionByClub: {}, denialCooldowns: {} },
  boardApprovals: { records: [], denialCooldowns: {} },
  boardInstability: createInitialBoardInstabilityState(),
  manager: {
    name: 'Manager',
    employmentStatus: 'employed',
    currentClubId: null,
    reputation: 50,
    jobSecurity: 65,
    seasonExpectation: 'Deliver consistent improvement.',
    unemployedSinceYear: null,
  },
  coachingJobMarket: [],
  simulation: { ...DEFAULT_SIMULATION_STATUS },
  jumperManagement: {
    pending: false,
    seasonYear: null,
    lastCompletedYear: null,
  },
  inflationIndex: 1.0,
  inflationHistory: [],
  agentRelationships: {},
  achievements: [],
  careerObjectives: [],
  sponsorshipOffers: [],
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
    const validSlots = new Set<string>(
      getLineupSlots(state.settings.matchRules.interchangePlayers),
    )
    const sanitized: Record<string, string> = {}
    for (const [slot, playerId] of Object.entries(state.selectedLineup)) {
      if (!validSlots.has(slot)) continue
      const p = state.players[playerId]
      if (!p || p.clubId !== clubId || !canBeSelectedForAfl(p) || p.injury || isPlayerSuspended(p)) continue
      sanitized[slot] = playerId
    }
    if (Object.keys(sanitized).length > 0) return sanitized
  }
  const lineup = selectBestLineup(
    Object.values(state.players),
    clubId,
    {
      interchangePlayers: state.settings.matchRules.interchangePlayers,
      club: state.clubs[clubId],
    },
  ).lineup
  return lineup
}

function buildSimSubstituteForClub(
  state: GameState,
  clubId: string,
  lineup: Record<string, string>,
): string | null {
  if (!state.settings.matchRules.enableSubstitutes) return null
  const selectedLineupIds = new Set(Object.values(lineup).filter((id): id is string => Boolean(id)))
  const candidates = Object.values(state.players)
    .filter((p) => p.clubId === clubId && canBeSelectedForAfl(p) && !p.injury && !isPlayerSuspended(p) && p.fitness >= 50)
    .filter((p) => !selectedLineupIds.has(p.id))
    .sort((a, b) => averageAttributes(b.attributes) - averageAttributes(a.attributes))
  if (candidates.length === 0) return null
  if (clubId === state.playerClubId && state.selectedSubstituteId) {
    const selected = candidates.find((p) => p.id === state.selectedSubstituteId)
    if (selected) return selected.id
  }
  return candidates[0].id
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

function getOffseasonProgressionError(state: GameState): string | null {
  if (!state.offseasonState) return 'No offseason in progress'
  const validation = validateOffseasonProgression({
    players: state.players,
    playerClubId: state.playerClubId,
    offseasonState: state.offseasonState,
    negotiations: state.negotiations,
    settings: state.settings,
    draft: state.draft,
    tradeInbox: state.tradeInbox,
  })
  return validation.allowed ? null : validation.error ?? 'Required offseason tasks are incomplete.'
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

const COACHING_URGENCIES: CoachingJobOpening['urgency'][] = ['low', 'medium', 'high']

function buildCoachingOpening(params: {
  clubId: string
  reason: string
  postedDate: string
  urgency: CoachingJobOpening['urgency']
}): CoachingJobOpening {
  return {
    id: `job_${crypto.randomUUID()}`,
    clubId: params.clubId,
    title: 'Senior Coach',
    reason: params.reason,
    postedDate: params.postedDate,
    urgency: params.urgency,
    status: 'open',
  }
}

function startSimulationStatus(
  set: (fn: (state: GameState) => void) => void,
  title: string,
  detail: string,
  totalSteps: number | null = null,
): void {
  set((state) => {
    state.simulation.active = true
    state.simulation.title = title
    state.simulation.detail = detail
    state.simulation.progress = totalSteps && totalSteps > 0 ? 0 : null
    state.simulation.currentStep = totalSteps && totalSteps > 0 ? 0 : null
    state.simulation.totalSteps = totalSteps && totalSteps > 0 ? totalSteps : null
    state.simulation.logs = []
    state.simulation.startedAt = new Date().toISOString()
  })
}

function updateSimulationStatus(
  set: (fn: (state: GameState) => void) => void,
  detail: string,
  step?: number,
): void {
  set((state) => {
    state.simulation.detail = detail
    if (typeof step === 'number') {
      state.simulation.currentStep = step
      if (state.simulation.totalSteps && state.simulation.totalSteps > 0) {
        state.simulation.progress = Math.max(0, Math.min(100, Math.round((step / state.simulation.totalSteps) * 100)))
      }
    }
  })
}

function appendSimulationLog(
  set: (fn: (state: GameState) => void) => void,
  message: string,
): void {
  set((state) => {
    const timestamp = new Date().toLocaleTimeString()
    state.simulation.logs.push(`[${timestamp}] ${message}`)
    if (state.simulation.logs.length > 200) {
      state.simulation.logs.splice(0, state.simulation.logs.length - 200)
    }
  })
}

function finishSimulationStatus(
  set: (fn: (state: GameState) => void) => void,
): void {
  set((state) => {
    state.simulation = { ...DEFAULT_SIMULATION_STATUS }
  })
}

function seedInitialCoachingOpenings(
  clubs: Record<string, Club>,
  rng: SeededRNG,
  postedDate: string,
): CoachingJobOpening[] {
  const pool = Object.keys(clubs)
  if (pool.length === 0) return []
  const openingCount = Math.min(3, Math.max(1, Math.round(pool.length * 0.1)))
  const picked = new Set<string>()
  const openings: CoachingJobOpening[] = []
  for (let i = 0; i < openingCount && picked.size < pool.length; i++) {
    const clubId = rng.pick(pool)
    if (picked.has(clubId)) continue
    picked.add(clubId)
    openings.push(
      buildCoachingOpening({
        clubId,
        reason: rng.pick([
          'Board seeks a fresh direction after review.',
          'Current coach stepped down at end of contract.',
          'Club leadership initiating strategic reset.',
        ]),
        postedDate,
        urgency: rng.pick(COACHING_URGENCIES),
      }),
    )
  }
  return openings
}

function enforceSingleClubCareerInvariant(
  state: Pick<GameState, 'clubs' | 'playerClubId' | 'manager' | 'currentYear'>,
): void {
  const validPlayerClubId = state.playerClubId && state.clubs[state.playerClubId] ? state.playerClubId : ''
  const managerClubId = state.manager.currentClubId && state.clubs[state.manager.currentClubId]
    ? state.manager.currentClubId
    : null

  if (state.manager.employmentStatus === 'employed') {
    const managedClubId = managerClubId ?? (validPlayerClubId || '')
    if (!managedClubId) {
      state.playerClubId = ''
      state.manager.employmentStatus = 'unemployed'
      state.manager.currentClubId = null
      if (state.manager.unemployedSinceYear == null) state.manager.unemployedSinceYear = state.currentYear
      return
    }
    state.playerClubId = managedClubId
    state.manager.currentClubId = managedClubId
    state.manager.unemployedSinceYear = null
    return
  }

  state.playerClubId = ''
  state.manager.currentClubId = null
  if (state.manager.unemployedSinceYear == null) state.manager.unemployedSinceYear = state.currentYear
}

// ---------------------------------------------------------------------------
// Store actions interface
// ---------------------------------------------------------------------------
interface GameActions {
  // Mutations
  initializeGame: (
    clubId: string,
    saveName: string,
    settings?: GameSettings,
    fictionalClubs?: Club[],
    managerName?: string,
    startUnemployed?: boolean,
    leagueConfigOverride?: LeagueConfig,
  ) => void
  setPhase: (phase: GamePhase) => void
  updateGameSettings: (updates: Partial<GameSettings>) => void
  advanceRound: () => void
  updatePlayer: (playerId: string, updates: Partial<Player>) => void
  setPlayerJumperNumber: (playerId: string, jumperNumber: number) => { success: boolean; error?: string }
  applyUserClubJumperNumbers: (updates: Record<string, number>) => { success: boolean; error?: string }
  autoAssignUserClubJumperNumbers: () => { success: boolean; assignedCount: number; error?: string }
  completeJumperManagement: () => { success: boolean; error?: string }
  setPlayerTrainingFocus: (playerId: string, focus: PlayerTrainingFocus | null) => { success: boolean; error?: string }
  updateClub: (clubId: string, updates: Partial<Club>) => void
  updateBudgetAllocation: (allocation: ClubBudgetAllocation) => { success: boolean; error?: string }
  takeOutLoan: (
    lender: import('@/types/finance').LoanLenderType,
    lenderName: string,
    amount: number,
    annualInterestRate: number,
    termSeasons: number,
  ) => { success: boolean; error?: string }
  repayLoanEarly: (loanId: string) => { success: boolean; error?: string }
  requestFacilityUpgrade: (facility: keyof ClubFacilities) => {
    success: boolean; approved: boolean; reason: string; probability?: number
  }
  setClubLeadership: (clubId: string, leadership: ClubLeadership) => void
  addMatchResult: (match: Match) => void
  updateLadder: (ladder: LadderEntry[]) => void
  updateFixtureGame: (
    roundIndex: number,
    fixtureIndex: number,
    updates: Partial<Pick<Fixture, 'homeClubId' | 'awayClubId' | 'matchDay' | 'scheduledTime' | 'venue'>>,
  ) => { success: boolean; error?: string }
  moveFixtureInRound: (roundIndex: number, fromIndex: number, toIndex: number) => { success: boolean; error?: string }
  swapFixturesInRound: (roundIndex: number, firstIndex: number, secondIndex: number) => { success: boolean; error?: string }
  setSelectedLineup: (lineup: Record<string, string> | null) => void
  setSelectedSubstitute: (playerId: string | null) => void
  saveNamedLineup: (input: {
    name: string
    lineup: Record<string, string>
    substitutePlayerId: string | null
    benchPlayerIds: string[]
    includeReserves: boolean
    overwriteExisting?: boolean
  }) => { success: boolean; error?: string; existingId?: string; savedId?: string; overwritten?: boolean }
  loadSavedLineup: (lineupId: string, options?: { applyReserves?: boolean }) => { success: boolean; error?: string }
  renameSavedLineup: (lineupId: string, newName: string) => { success: boolean; error?: string; existingId?: string }
  deleteSavedLineup: (lineupId: string) => { success: boolean; error?: string }
  addNewsItem: (item: NewsItem) => void
  markNewsRead: (newsId: string) => void
  markAllNewsRead: () => void
  markEmailRead: (newsId: string) => void
  markAllEmailRead: () => void
  addSigningWatchlistPlayer: (playerId: string) => void
  removeSigningWatchlistPlayer: (playerId: string) => void
  addSigningShortlistPlayer: (playerId: string) => void
  removeSigningShortlistPlayer: (playerId: string) => void
  createShortlist: (name: string) => { success: boolean; error?: string; shortlistId?: string }
  renameShortlist: (shortlistId: string, name: string) => { success: boolean; error?: string; existingId?: string }
  deleteShortlist: (shortlistId: string) => { success: boolean; error?: string }
  addShortlistEntry: (params: {
    shortlistId: string
    targetType: ShortlistTargetType
    targetId: string
    note?: string
    priority?: ShortlistPriority
  }) => { success: boolean; error?: string }
  removeShortlistEntry: (params: { shortlistId: string; targetType: ShortlistTargetType; targetId: string }) => { success: boolean; error?: string }
  updateShortlistEntry: (params: {
    shortlistId: string
    targetType: ShortlistTargetType
    targetId: string
    note?: string
    priority?: ShortlistPriority
  }) => { success: boolean; error?: string }
  resetGame: () => void
  loadState: (state: GameState) => void
  updateGameplan: (gameplan: Partial<ClubGameplan>) => void
  updateWeeklyGameplanAdjustment: (gameplan: Partial<ClubGameplan>) => { success: boolean; error?: string }
  clearWeeklyGameplanAdjustment: () => void
  generateWeeklyCounterGameplanForUser: () => { success: boolean; error?: string }
  setWeeklyMatchupTactics: (tactics: WeeklyMatchupTactics) => { success: boolean; error?: string }
  clearWeeklyMatchupTactics: () => void
  hireStaffMember: (staffId: string, contractYears: number) => { success: boolean; error?: string }
  fireStaffMember: (staffId: string) => void
  previewApproachChance: (staffId: string, salaryMultiplier: number) => number
  approachStaffMember: (staffId: string, contractYears: number, salaryMultiplier: number) => { accepted: boolean; reason: string; acceptanceChance: number }
  previewBoardApproval: (category: 'contract' | 'trade' | 'staff-hire', params: { aav?: number; userSalaryRetention?: number; salary?: number }) => BoardApprovalResult
  saveGame: () => void
  sendToReserves: (playerId: string) => void
  recallFromReserves: (playerId: string) => void
  setReservesDelegation: (enabled: boolean) => void
  setManagedReservesLineup: (playerIds: string[]) => void
  setManagedReservesLineupSlots: (assignments: Partial<Record<LineupSlot, string>>) => void
  setReservesPlayerAvailability: (playerId: string, assignment: 'play' | 'rest') => void
  setReservesLeadership: (leadership: {
    captainId: string | null
    viceCaptainId: string | null
    leadershipGroupIds: string[]
  }) => void
  setReservesTactics: (updates: Partial<GameState['reserves']['tactics']>) => void
  applyReservesCoachTactics: () => void
  autoPickManagedReservesLineup: () => void
  setStateLeagueContractDelegation: (enabled: boolean) => void
  setStateLeagueContractTargetCount: (count: number) => void
  reSignStateLeagueContract: (playerId: string, years?: number) => { success: boolean; error?: string }
  delistStateLeagueContractedPlayer: (playerId: string) => { success: boolean; error?: string }
  recruitStateLeagueContractPlayer: (count?: number) => { success: boolean; addedIds: string[]; error?: string }
  signStateLeaguePlayerToAflContract: (playerId: string, years: number, aav: number) => { success: boolean; error?: string }
  setDaySlot: (date: string, slot: ScheduleSlot, activity: TrainingFocus | 'rest' | null) => void
  clearWeekSchedule: () => void
  setTrainingWeekPlan: (plan: import('@/engine/training/trainingEngine').TrainingWeekPlan) => void
  updateTrainingSlotGroups: (date: string, slot: 'morning' | 'afternoon', groups: import('@/engine/training/trainingEngine').TrainingGroup[]) => void
  clearTrainingWeekPlan: () => void
  startPlayerUpskill: (
    playerId: string,
    target:
      | { type: 'position'; targetPosition: PlayerPositionType }
      | { type: 'skill'; targetSkill: PlayerTrainingFocus },
  ) => { success: boolean; error?: string }
  cancelPlayerUpskill: (playerId: string, planId: string) => { success: boolean; error?: string }

  // History
  recordUserDraftPick: (entry: import('@/types/history').DraftHistoryEntry) => void

  // Special events
  scheduleSpecialEvents: () => void
  simSpecialEvent: (eventId: string) => { result: import('@/types/specialEvents').SpecialEventMatchResult | null }

  // Season progression
  simCurrentRound: (options?: { internal?: boolean; precomputedUserMatch?: Match }) => { userMatch: Match | null }
  simToEnd: () => void
  startFinals: () => void
  simFinalsRound: () => { userMatch: Match | null; seasonOver: boolean }

  // Membership management
  setMembershipTierPrice: (clubId: string, tierId: MembershipTierId, price: number) => void
  setMembershipCampaignBudget: (clubId: string, budget: number) => void
  setMembershipSeasonTarget: (clubId: string, target: number) => void

  // Offseason
  enterOffseason: () => void
  advanceOffseasonPhase: () => { success: boolean; error: string | null }
  delistPlayerOffseason: (playerId: string) => void
  signUnsignedPlayer: (playerId: string, years: number, aav: number) => { success: boolean; error?: string }
  startNewSeasonAction: () => { success: boolean; error?: string }
  acceptVenueOffer: (offerId: string) => void
  rejectVenueOffer: (offerId: string) => void
  setSecondaryHomeGames: (count: number) => void

  // Practice matches
  schedulePracticeMatch: (type: 'friendly' | 'intra-squad', opponentClubId?: string) => void
  simulatePracticeMatchAction: (fixtureId: string) => void
  delegatePracticeMatchesToAssistant: () => void
  cancelPracticeMatchFixture: (fixtureId: string) => void

  // Offseason sim controls
  simOffseasonHalfDay: () => { success: boolean; error?: string }
  simOffseasonFullDay: () => { success: boolean; error?: string }
  simOffseasonToMilestone: () => { success: boolean; error?: string }
  applyForCoachingJob: (jobId: string) => { success: boolean; error?: string }
  resignFromCurrentClub: () => { success: boolean; error?: string }

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
  submitTribunalPlea: (caseId: string, params: { plea: TribunalPlea; legalRepTier: TribunalLegalRep['tier']; attended: boolean }) => { success: boolean; error?: string }
  skipTribunal: (caseId: string) => { success: boolean; error?: string }
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
  suggestNextDraftPickAction: () => import('@/engine/draft/draftEngine').SuggestNextPickResult | null
  runDelegatedDraftAction: () => { success: boolean; error?: string; records: import('@/engine/draft/draftEngine').DelegatedPickRecord[] }

  // Youth Pathway
  assignScoutToYouthComp: (scoutId: string, compId: YouthCompId) => { success: boolean; error?: string }
  unassignScoutFromYouthComp: (scoutId: string) => { success: boolean; error?: string }

  // Awards Night
  revealBrownlow: () => void
  completeAwardsNight: () => void

  // Computed / derived
  getPlayersByClub: (clubId: string) => Player[]
  getCurrentRoundData: () => import('@/types/season').Round | null
  isUserInFinals: () => boolean
  dismissObjective: (objectiveId: string) => void
  acceptSponsorshipOffer: (offerId: string) => { success: boolean; error?: string }
  rejectSponsorshipOffer: (offerId: string) => void
  declineSponsorshipOffer: (offerId: string) => void
  counterSponsorshipOffer: (offerId: string, counterValue: number, counterYears: number) => { result: 'accepted' | 'rejected' }
  terminateSponsorshipDeal: (dealId: string) => void
  runMembershipCampaign: (budgetSpent: number) => { success: boolean; projectedMembersBoost: number }
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

      initializeGame: (
        clubId: string,
        saveName: string,
        settings?: GameSettings,
        fictionalClubs?: Club[],
        managerName?: string,
        startUnemployed?: boolean,
        leagueConfigOverride?: LeagueConfig,
      ) => {
        const now = new Date().toISOString()
        const gameId = crypto.randomUUID()
        const seed = Date.now()
        const unemployedStart = Boolean(startUnemployed)
        const initialClubId = unemployedStart ? '' : clubId

        const gameSettings = settings ?? createDefaultSettings()

        // Build clubs record from static JSON or fictional clubs
        const clubsRecord: Record<string, Club> = {}
        const clubSource = fictionalClubs && fictionalClubs.length > 0
          ? fictionalClubs
          : (clubsJson as unknown as Club[])
        for (const c of clubSource) {
          clubsRecord[c.id] = {
            ...c,
            finances: { ...(c as Club).finances },
            draftPicks: (c.draftPicks ?? []).map((p) => ({ ...p })),
          }
        }
        // Initialize default (empty) leadership for all clubs
        for (const club of Object.values(clubsRecord)) {
          if (!club.leadership) {
            (club as Club).leadership = { captainId: null, viceCaptainId: null, leadershipGroupIds: [] }
          }
          if (!club.identity) {
            club.identity = createInitialClubIdentity(club, 2026)
          }
        }

        const clubsWithPicks = ensureDraftPickLedger(clubsRecord, 2026, 2)

        // Generate players for all clubs
        const playersRecord: Record<string, Player> = {}
        for (const c of clubSource) {
          const clubPlayers = generatePlayers(c.id, seed + hashCode(c.id), {
            salaryCapAmount: gameSettings.salaryCapAmount,
            enforceCapCompliance: true,
            competitionStrength: 'afl',
          })
          for (const p of clubPlayers) {
            playersRecord[p.id] = p
          }
          const stateLeagueDepthPlayers = generateStateLeagueContractPlayers(
            c.id,
            seed + hashCode(`${c.id}-state-depth`),
            DEFAULT_STATE_LEAGUE_CONTRACT_TARGET,
            gameSettings.gameStartDate ?? '2026-01-01',
          )
          for (const p of stateLeagueDepthPlayers) {
            playersRecord[p.id] = p
          }
        }

        // Auto-select leadership for all clubs based on generated players
        for (const club of Object.values(clubsWithPicks)) {
          const aflListedPlayers = Object.fromEntries(
            Object.entries(playersRecord).filter(([, player]) => player.clubId === club.id && isAflListedPlayer(player)),
          )
          club.leadership = autoSelectLeadership(aflListedPlayers, club.id)
        }

        // Initialize culture for all clubs
        for (const club of Object.values(clubsWithPicks)) {
          club.culture = createDefaultCulture()
        }

        // Initialize AI budget allocations for non-player clubs
        for (const club of Object.values(clubsWithPicks)) {
          if (club.id !== initialClubId) {
            club.budgetAllocation = generateAIBudgetAllocation(club)
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
          if (c.id === initialClubId) continue
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
          playerClubId: initialClubId,
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
          // Ensure inbox starts completely empty for a new game
          state.newsLog = []
          state.emailLog = []

          state.meta = {
            id: gameId,
            saveName,
            createdAt: now,
            lastSaved: now,
            version: '0.1.0',
          }

          state.playerClubId = initialClubId
          state.currentYear = 2026
          state.currentRound = 0

          // Determine starting phase: if gameStartDate is before seasonStartDate, start in offseason
          const seasonStart = gameSettings.seasonStartDate ?? '2026-03-20'
          const gameStart = gameSettings.gameStartDate ?? seasonStart
          if (gameStart < seasonStart) {
            state.phase = 'offseason'
            state.currentDate = gameStart
            // Set year to previous season so startNewSeasonAction() increments correctly
            state.currentYear = parseInt(seasonStart.slice(0, 4)) - 1

            // Compute offseason start date (day after Grand Final)
            const offseasonStartDate = computeDefaultGameStartDate(parseInt(seasonStart.slice(0, 4)))

            // Determine correct phase based on where gameStart falls in the timeline
            const { phase: offseasonPhase, completedPhases } = computePhaseForDate(
              offseasonStartDate, gameStart,
            )

            // Build fully-initialized offseason state
            const offseason = initOffseason()
            offseason.currentPhase = offseasonPhase
            offseason.completedPhases = completedPhases
            offseason.calendarState = initOffseasonCalendar(offseasonStartDate)
            offseason.calendarState.currentDate = gameStart

            state.offseasonState = offseason
          } else {
            state.phase = 'regular-season'
            state.currentDate = seasonStart
          }
          state.rngSeed = seed
          state.selectedLineup = null
          state.selectedSubstituteId = null

          state.settings = gameSettings
          state.manager = {
            name: managerName?.trim() || 'Manager',
            employmentStatus: unemployedStart ? 'unemployed' : 'employed',
            currentClubId: unemployedStart ? null : initialClubId,
            reputation: 50,
            jobSecurity: unemployedStart ? 0 : 65,
            seasonExpectation: unemployedStart ? 'Secure a senior coaching appointment.' : 'Deliver consistent improvement.',
            unemployedSinceYear: unemployedStart ? state.currentYear : null,
          }
          state.coachingJobMarket = unemployedStart
            ? seedInitialCoachingOpenings(clubsWithPicks, new SeededRNG(seed + 1234), state.currentDate)
            : []

          state.clubs = clubsWithPicks

          // Seed membership state for all clubs based on approximate initial ladder position
          Object.keys(clubsWithPicks).forEach((clubId, idx) => {
            const pos = idx + 1  // approximate initial position
            const club = state.clubs[clubId]
            if (club) {
              club.finances.membershipState = createInitialMembershipState(club, pos)
            }
          })

          state.players = playersRecord
          normalizeAllClubJumperNumbers(state)
          // Auto-assign best lineup for the user's club at game start
          if (initialClubId) {
            const autoLineup = selectBestLineup(Object.values(playersRecord), initialClubId, {
              interchangePlayers: gameSettings.matchRules?.interchangePlayers ?? 4,
              club: clubsWithPicks[initialClubId],
            })
            state.selectedLineup = autoLineup.lineup
          }
          state.staff = staffRecord
          state.scouts = scoutPool
          state.season = season
          state.ladder = ladder
          state.history = {
            seasons: [],
            draftHistory: [],
            developmentReports: [],
            playerSeasonStats: [],
            awards: [],
            milestones: [],
            retirementLegacies: [],
            originHistory: [],
            recordsBook: createDefaultRecordsBook(),
            seasonArchives: [],
            matchReports: [],
          }
          state.jumperManagement = {
            pending: true,
            seasonYear: state.currentYear,
            lastCompletedYear: null,
          }
          state.leagueConfig = {
            activeClubIds: leagueConfigOverride?.activeClubIds?.length
              ? [...leagueConfigOverride.activeClubIds]
              : Object.keys(clubsWithPicks),
            expansionPlans: leagueConfigOverride?.expansionPlans
              ? leagueConfigOverride.expansionPlans.map((p) => ({ ...p }))
              : [],
            competitionModel: leagueConfigOverride?.competitionModel ?? 'single-table',
            conferenceCount: leagueConfigOverride?.conferenceCount,
            divisionCount: leagueConfigOverride?.divisionCount,
            enablePromotionRelegation: leagueConfigOverride?.enablePromotionRelegation ?? false,
            tierCount: leagueConfigOverride?.tierCount ?? 1,
            promotionRelegationSpots: leagueConfigOverride?.promotionRelegationSpots ?? 1,
            clubTierMap: leagueConfigOverride?.clubTierMap
              ? { ...leagueConfigOverride.clubTierMap }
              : {},
            totalTeams: leagueConfigOverride?.activeClubIds?.length
              ? leagueConfigOverride.activeClubIds.length
              : Object.keys(clubsWithPicks).length,
          }
          state.multiTierState = initializeMultiTierState({
            clubs: clubsWithPicks,
            leagueConfig: state.leagueConfig,
            settings: gameSettings,
            seed,
          })

          // Build season calendar (settings-driven finals weeks + start date + game start date for offseason)
          state.calendar = buildSeasonCalendar(2026, season, initialClubId, gameSettings.finals, gameSettings.seasonStartDate, gameSettings.gameStartDate)

          // Initialize state leagues + talent pathway (U16/U18)
          const initializedStateLeagues = initializeStateLeagues(clubsRecord, 2026, seed, {
            namingTemplate: gameSettings.leagueNamingTemplate,
            includePathways: gameSettings.includePathwayLeagues,
          })
          state.stateLeagues = applyStateLeagueAffiliationSettings(
            initializedStateLeagues,
            gameSettings.stateLeagueAffiliations,
          )

          // Initialize youth pathway (U16/U18 competitions)
          if (gameSettings.includePathwayLeagues) {
            const youthRng = new SeededRNG(seed + 77777)
            const youthComps = buildYouthCompetitions(2026)
            state.youthPathway = {
              competitions: Object.fromEntries(youthComps.map((c) => [c.id, c])),
              players: generateAllYouthPlayers(youthComps, 2026, youthRng),
              tournaments: { u16: null, u18: null },
              scoutAssignments: [],
              convertedProspectIds: {},
            }
          }

          // Initialize venue system for the first season
          if (gameSettings.realism.venueScheduling) {
            const venueRng = new SeededRNG(seed + 9999)
            const clubIds = Object.keys(clubsRecord)
            const allocations = generateDefaultAllocations(clubIds, clubsRecord, venueRng)

            // Auto-accept sold games for AI clubs
            for (const cid of clubIds) {
              if (cid === initialClubId) continue
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
          enforceSingleClubCareerInvariant(state)
        })

        const initialized = get()
        const initialPowerSnapshot = computeWeeklyPowerRankings({
          year: initialized.currentYear,
          round: 0,
          date: initialized.currentDate,
          clubs: initialized.clubs,
          players: initialized.players,
          ladder: initialized.ladder,
          season: initialized.season,
          matchResults: initialized.matchResults,
          previousSnapshot: null,
        })
        set((state) => {
          state.powerRankings = [initialPowerSnapshot]
          pushUpcomingMilestoneNews(state)
        })

        // Schedule special events for the initial season
        get().scheduleSpecialEvents()
      },

      setPhase: (phase: GamePhase) => {
        set((state) => {
          state.phase = phase
        })
      },

      updateGameSettings: (updates: Partial<GameSettings>) => {
        set((state) => {
          state.settings = {
            ...state.settings,
            ...updates,
            seasonStructure: {
              ...state.settings.seasonStructure,
              ...(updates.seasonStructure ?? {}),
            },
            matchRules: {
              ...state.settings.matchRules,
              ...(updates.matchRules ?? {}),
            },
            ladderPoints: {
              ...state.settings.ladderPoints,
              ...(updates.ladderPoints ?? {}),
            },
            listRules: {
              ...state.settings.listRules,
              ...(updates.listRules ?? {}),
            },
            realism: {
              ...state.settings.realism,
              ...(updates.realism ?? {}),
            },
            finals: {
              ...state.settings.finals,
              ...(updates.finals ?? {}),
            },
            fixtureSchedule: {
              ...state.settings.fixtureSchedule,
              ...(updates.fixtureSchedule ?? {}),
            },
            notifications: {
              ...state.settings.notifications,
              ...(updates.notifications ?? {}),
              signings: {
                ...state.settings.notifications.signings,
                ...(updates.notifications?.signings ?? {}),
              },
            },
            stateLeagueAffiliations: {
              ...state.settings.stateLeagueAffiliations,
              ...(updates.stateLeagueAffiliations ?? {}),
              clubAffiliations: {
                ...state.settings.stateLeagueAffiliations.clubAffiliations,
                ...(updates.stateLeagueAffiliations?.clubAffiliations ?? {}),
              },
            },
            ladderSorting: {
              ...(state.settings.ladderSorting ?? { primary: 'points', tieBreakers: ['percentage', 'wins', 'pointsFor', 'clubId'] }),
              ...(updates.ladderSorting ?? {}),
              tieBreakers: updates.ladderSorting?.tieBreakers
                ? [...updates.ladderSorting.tieBreakers]
                : [...(state.settings.ladderSorting?.tieBreakers ?? ['percentage', 'wins', 'pointsFor', 'clubId'])],
            },
            fixturePolicy: {
              ...(state.settings.fixturePolicy ?? { homeAwayBalance: true, travelWeighting: 40, venueSharingRules: true }),
              ...(updates.fixturePolicy ?? {}),
            },
            customRivalryPairs: updates.customRivalryPairs
              ? [...updates.customRivalryPairs]
              : [...(state.settings.customRivalryPairs ?? [])],
          }

          if (state.stateLeagues && updates.stateLeagueAffiliations) {
            state.stateLeagues = applyStateLeagueAffiliationSettings(
              state.stateLeagues,
              state.settings.stateLeagueAffiliations,
            )
          }
        })
      },

      advanceRound: () => {
        set((state) => {
          state.currentRound += 1
          pushUpcomingMilestoneNews(state)
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

      setPlayerJumperNumber: (playerId: string, jumperNumber: number) => {
        const state = get()
        const player = state.players[playerId]
        if (!player) return { success: false, error: 'Player not found.' }
        if (player.clubId !== state.playerClubId) {
          return { success: false, error: 'Can only edit jumper numbers for players at your club.' }
        }
        if (!isValidJumperNumber(jumperNumber)) {
          return { success: false, error: 'Jumper number must be between 1 and 99.' }
        }
        if (!isJumperNumberAvailable(state.players, player.clubId, jumperNumber, playerId)) {
          return { success: false, error: `Jumper #${jumperNumber} is already in use.` }
        }

        set((s) => {
          const target = s.players[playerId]
          if (!target) return
          target.jerseyNumber = jumperNumber
          upsertPlayerJumperHistory(target, s.currentYear)
        })
        return { success: true }
      },

      applyUserClubJumperNumbers: (updates: Record<string, number>) => {
        const state = get()
        const clubId = state.playerClubId
        if (!clubId) return { success: false, error: 'No managed club selected.' }
        const clubPlayers = Object.values(state.players).filter((player) => player.clubId === clubId)
        const byId = new Map(clubPlayers.map((player) => [player.id, player]))
        const finalById = new Map<string, number>()

        for (const player of clubPlayers) {
          finalById.set(player.id, player.jerseyNumber)
        }
        for (const [playerId, number] of Object.entries(updates)) {
          const player = byId.get(playerId)
          if (!player) return { success: false, error: 'One or more players are not at your club.' }
          if (!isValidJumperNumber(number)) {
            return { success: false, error: `Invalid jumper number for ${player.firstName} ${player.lastName}.` }
          }
          finalById.set(playerId, number)
        }

        const seen = new Set<number>()
        for (const [playerId, number] of finalById.entries()) {
          if (seen.has(number)) {
            const player = byId.get(playerId)
            return {
              success: false,
              error: `Duplicate jumper number #${number}${player ? ` (${player.firstName} ${player.lastName})` : ''}.`,
            }
          }
          seen.add(number)
        }

        set((s) => {
          for (const [playerId, number] of finalById.entries()) {
            const player = s.players[playerId]
            if (!player || player.clubId !== clubId) continue
            player.jerseyNumber = number
            upsertPlayerJumperHistory(player, s.currentYear)
          }
        })
        return { success: true }
      },

      autoAssignUserClubJumperNumbers: () => {
        const state = get()
        if (!state.playerClubId) {
          return { success: false, assignedCount: 0, error: 'No managed club selected.' }
        }
        let assignedCount = 0
        set((s) => {
          assignedCount = normalizeClubJumperNumbers(s, s.playerClubId)
        })
        return { success: true, assignedCount }
      },

      completeJumperManagement: () => {
        const state = get()
        if (!state.playerClubId) return { success: false, error: 'No managed club selected.' }
        const clubPlayers = Object.values(state.players).filter((player) => player.clubId === state.playerClubId)
        const seen = new Set<number>()
        for (const player of clubPlayers) {
          if (!isValidJumperNumber(player.jerseyNumber)) {
            return { success: false, error: `${player.firstName} ${player.lastName} has an invalid jumper number.` }
          }
          if (seen.has(player.jerseyNumber)) {
            const clashes = clubPlayers
              .filter((p) => p.jerseyNumber === player.jerseyNumber)
              .map((p) => `${p.firstName} ${p.lastName}`)
              .join(', ')
            return { success: false, error: `Duplicate jumper number #${player.jerseyNumber}: ${clashes}.` }
          }
          seen.add(player.jerseyNumber)
        }
        set((s) => {
          s.jumperManagement.pending = false
          s.jumperManagement.lastCompletedYear = s.currentYear
        })
        return { success: true }
      },

      setPlayerTrainingFocus: (playerId: string, focus: PlayerTrainingFocus | null) => {
        const state = get()
        const player = state.players[playerId]
        if (!player) {
          return { success: false, error: 'Player not found.' }
        }
        if (player.clubId !== state.playerClubId) {
          return { success: false, error: 'Can only set training focus for players at your club.' }
        }
        set((draft) => {
          const target = draft.players[playerId]
          if (!target) return
          target.trainingFocus = focus
        })
        return { success: true }
      },

      startPlayerUpskill: (playerId, target) => {
        const state = get()
        const player = state.players[playerId]
        if (!player) return { success: false, error: 'Player not found.' }
        if (player.clubId !== state.playerClubId) {
          return { success: false, error: 'Can only manage upskilling for players at your club.' }
        }
        if (target.type === 'position' && target.targetPosition === player.position.primary) {
          return { success: false, error: 'Target position cannot be the player primary position.' }
        }

        const plans = player.upskillPlans ?? []
        const hasActiveSameType = plans.some((p) => p.status === 'active' && p.type === target.type)
        if (hasActiveSameType) {
          return { success: false, error: `Player already has an active ${target.type} upskill plan.` }
        }
        const hasActiveSameTarget = plans.some((p) =>
          p.status === 'active' &&
          ((target.type === 'position' && p.targetPosition === target.targetPosition) ||
            (target.type === 'skill' && p.targetSkill === target.targetSkill)),
        )
        if (hasActiveSameTarget) {
          return { success: false, error: 'This upskill target is already active for the player.' }
        }

        const currentDate = state.currentDate
        const startedRound = state.currentRound
        set((draft) => {
          const next = draft.players[playerId]
          if (!next) return
          if (!next.upskillPlans) next.upskillPlans = []
          next.upskillPlans.push({
            id: crypto.randomUUID(),
            type: target.type,
            targetPosition: target.type === 'position' ? target.targetPosition : undefined,
            targetSkill: target.type === 'skill' ? target.targetSkill : undefined,
            progress: 0,
            status: 'active',
            startedRound,
            startedDate: currentDate,
            updatedDate: currentDate,
          })
        })
        return { success: true }
      },

      cancelPlayerUpskill: (playerId, planId) => {
        const state = get()
        const player = state.players[playerId]
        if (!player) return { success: false, error: 'Player not found.' }
        if (player.clubId !== state.playerClubId) {
          return { success: false, error: 'Can only manage upskilling for players at your club.' }
        }

        let found = false
        set((draft) => {
          const next = draft.players[playerId]
          if (!next?.upskillPlans) return
          const plan = next.upskillPlans.find((p) => p.id === planId)
          if (!plan) return
          found = true
          plan.status = 'cancelled'
          plan.updatedDate = draft.currentDate
        })
        if (!found) return { success: false, error: 'Upskill plan not found.' }
        return { success: true }
      },

      updateClub: (clubId: string, updates: Partial<Club>) => {
        set((state) => {
          const existing = state.clubs[clubId]
          if (existing) {
            Object.assign(existing, updates)
          }
        })
      },

      updateBudgetAllocation: (allocation: ClubBudgetAllocation) => {
        const state = get()
        const clubId = state.playerClubId
        if (!clubId) return { success: false, error: 'No club selected' }

        const validation = validateBudgetAllocation(allocation)
        if (!validation.valid) {
          return { success: false, error: validation.error }
        }

        set((s) => {
          const club = s.clubs[clubId]
          if (club) {
            club.budgetAllocation = { ...allocation }
          }
        })
        return { success: true }
      },

      takeOutLoan: (lender, lenderName, amount, annualInterestRate, termSeasons) => {
        const state = get()
        const clubId = state.playerClubId
        const club = state.clubs[clubId]
        if (!club) return { success: false, error: 'Club not found' }
        if (!(state.settings.realism.allowLoans ?? true)) {
          return { success: false, error: 'Loans are disabled in your realism settings' }
        }
        const newLoan = createLoan(lender, lenderName, amount, annualInterestRate, termSeasons, state.currentYear)
        set((s) => {
          const c = s.clubs[clubId]
          if (!c) return
          if (!c.finances.loans) c.finances.loans = []
          c.finances.loans.push(newLoan)
          c.finances.balance += amount
        })
        return { success: true }
      },

      repayLoanEarly: (loanId) => {
        const state = get()
        const clubId = state.playerClubId
        const club = state.clubs[clubId]
        if (!club) return { success: false, error: 'Club not found' }
        const loan = (club.finances.loans ?? []).find((l) => l.id === loanId)
        if (!loan) return { success: false, error: 'Loan not found' }
        if (loan.status !== 'active') return { success: false, error: 'Loan is not active' }
        if (club.finances.balance < loan.remainingBalance) {
          return { success: false, error: `Insufficient balance. Need ${loan.remainingBalance.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })} but only have ${club.finances.balance.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })}` }
        }
        set((s) => {
          const c = s.clubs[clubId]
          if (!c || !c.finances.loans) return
          const l = c.finances.loans.find((x) => x.id === loanId)
          if (!l) return
          c.finances.balance -= l.remainingBalance
          l.remainingBalance = 0
          l.seasonsRemaining = 0
          l.status = 'paid-off'
        })
        return { success: true }
      },

      requestFacilityUpgrade: (facility: keyof ClubFacilities) => {
        const state = get()
        const club = state.clubs[state.playerClubId]
        if (!club) return { success: false, approved: false, reason: 'Club not found' }

        const tracker = state.facilityUpgrades ?? { requests: [], activeConstructionByClub: {}, denialCooldowns: {} }

        // Check if upgrade is possible
        const check = canRequestUpgrade(tracker, club, facility, state.currentDate)
        if (!check.allowed) {
          return { success: false, approved: false, reason: check.reason }
        }

        // Compute approval probability
        const ladderIdx = state.ladder.findIndex((e) => e.clubId === state.playerClubId)
        const ladderPosition = ladderIdx >= 0 ? ladderIdx + 1 : 18
        const { probability } = computeApprovalProbability(
          club, facility, check.cost, state.manager.jobSecurity, ladderPosition,
        )

        // Build a deterministic seed for this request
        const facilityKeys: (keyof ClubFacilities)[] = [
          'trainingGround', 'gym', 'medicalCentre', 'recoveryPool', 'analysisSuite', 'youthAcademy',
        ]
        const facilityIndex = facilityKeys.indexOf(facility)
        const rng = new SeededRNG(state.rngSeed + state.currentRound * 9973 + facilityIndex)

        const { updatedTracker, request, approved } = requestFacilityUpgradeEngine(
          tracker, club, facility, probability, rng, state.currentDate,
        )

        set((s) => {
          s.facilityUpgrades = updatedTracker

          if (approved) {
            // Deduct cost from club balance
            const c = s.clubs[s.playerClubId]
            if (c) c.finances.balance -= request.cost
          }

          // Push news item
          const facilityLabel = facility.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
          appendNewsItem(s, {
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: approved
              ? `${club.name} begins ${facilityLabel} upgrade`
              : `${club.name} ${facilityLabel} upgrade denied by board`,
            body: approved
              ? `The board has approved the ${facilityLabel} upgrade from Level ${request.fromLevel} to Level ${request.toLevel}. Construction will take ${request.constructionWeeksTotal} weeks at a cost of $${request.cost.toLocaleString()}.`
              : `The board has denied the request to upgrade the ${facilityLabel}. ${request.denialReason ?? ''}`,
            category: 'general',
            clubIds: [club.id],
            playerIds: [],
          })
        })

        return {
          success: true,
          approved,
          reason: approved
            ? `Upgrade approved! Construction begins (${request.constructionWeeksTotal} weeks).`
            : request.denialReason ?? 'The board denied the upgrade.',
          probability,
        }
      },

      setClubLeadership: (clubId: string, leadership: ClubLeadership) => {
        set((state) => {
          const club = state.clubs[clubId]
          if (club) {
            club.leadership = leadership
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

      updateFixtureGame: (roundIndex, fixtureIndex, updates) => {
        const state = get()
        const round = state.season.rounds[roundIndex]
        const fixture = round?.fixtures?.[fixtureIndex]
        if (!round || !fixture) return { success: false, error: 'Fixture not found.' }
        if (state.currentRound > 0 || state.matchResults.some((m) => m.result !== null)) {
          return { success: false, error: 'Fixture can only be edited before the first game is played.' }
        }

        const nextHome = updates.homeClubId ?? fixture.homeClubId
        const nextAway = updates.awayClubId ?? fixture.awayClubId
        if (nextHome === nextAway) {
          return { success: false, error: 'Home and away clubs must be different.' }
        }

        const invalidClub =
          !state.clubs[nextHome] ||
          !state.clubs[nextAway]
        if (invalidClub) {
          return { success: false, error: 'Invalid club selection.' }
        }

        for (let i = 0; i < round.fixtures.length; i++) {
          if (i === fixtureIndex) continue
          const other = round.fixtures[i]
          if (
            other.homeClubId === nextHome ||
            other.awayClubId === nextHome ||
            other.homeClubId === nextAway ||
            other.awayClubId === nextAway
          ) {
            return { success: false, error: 'Each club can only appear once per round.' }
          }
        }

        const validDays: MatchDay[] = [
          'Thursday',
          'Friday',
          'Saturday-Early',
          'Saturday-Twilight',
          'Saturday-Night',
          'Sunday-Early',
          'Sunday-Twilight',
          'Monday',
        ]
        if (updates.matchDay && !validDays.includes(updates.matchDay)) {
          return { success: false, error: 'Invalid match day.' }
        }

        set((draft) => {
          const target = draft.season.rounds[roundIndex]?.fixtures?.[fixtureIndex]
          if (!target) return

          target.homeClubId = nextHome
          target.awayClubId = nextAway
          if (updates.matchDay !== undefined) target.matchDay = updates.matchDay
          if (updates.scheduledTime !== undefined) target.scheduledTime = updates.scheduledTime.trim()
          if (updates.venue !== undefined) {
            target.venue = updates.venue.trim()
            const resolved = resolveVenueId(target.venue)
            if (resolved) target.venueId = resolved
            const assignment = draft.venueState?.assignments.find(
              (a) => a.roundNumber === roundIndex + 1 && a.fixtureIndex === fixtureIndex,
            )
            if (assignment && resolved) assignment.venueId = resolved
          }
        })

        return { success: true }
      },

      moveFixtureInRound: (roundIndex, fromIndex, toIndex) => {
        const state = get()
        const round = state.season.rounds[roundIndex]
        if (!round) return { success: false, error: 'Round not found.' }
        if (state.currentRound > 0 || state.matchResults.some((m) => m.result !== null)) {
          return { success: false, error: 'Fixture can only be edited before the first game is played.' }
        }
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= round.fixtures.length ||
          toIndex >= round.fixtures.length
        ) {
          return { success: false, error: 'Invalid fixture index.' }
        }
        if (fromIndex === toIndex) return { success: true }

        set((draft) => {
          const fixtures = draft.season.rounds[roundIndex]?.fixtures
          if (!fixtures) return
          const [moved] = fixtures.splice(fromIndex, 1)
          fixtures.splice(toIndex, 0, moved)

          if (draft.venueState) {
            for (const assignment of draft.venueState.assignments) {
              if (assignment.roundNumber !== roundIndex + 1) continue
              if (assignment.fixtureIndex === fromIndex) {
                assignment.fixtureIndex = toIndex
              } else if (fromIndex < toIndex && assignment.fixtureIndex > fromIndex && assignment.fixtureIndex <= toIndex) {
                assignment.fixtureIndex -= 1
              } else if (toIndex < fromIndex && assignment.fixtureIndex >= toIndex && assignment.fixtureIndex < fromIndex) {
                assignment.fixtureIndex += 1
              }
            }
          }
        })
        return { success: true }
      },

      swapFixturesInRound: (roundIndex, firstIndex, secondIndex) => {
        const state = get()
        const round = state.season.rounds[roundIndex]
        if (!round) return { success: false, error: 'Round not found.' }
        if (state.currentRound > 0 || state.matchResults.some((m) => m.result !== null)) {
          return { success: false, error: 'Fixture can only be edited before the first game is played.' }
        }
        if (
          firstIndex < 0 ||
          secondIndex < 0 ||
          firstIndex >= round.fixtures.length ||
          secondIndex >= round.fixtures.length
        ) {
          return { success: false, error: 'Invalid fixture index.' }
        }
        if (firstIndex === secondIndex) return { success: true }

        set((draft) => {
          const fixtures = draft.season.rounds[roundIndex]?.fixtures
          if (!fixtures) return
          const temp = fixtures[firstIndex]
          fixtures[firstIndex] = fixtures[secondIndex]
          fixtures[secondIndex] = temp

          if (draft.venueState) {
            for (const assignment of draft.venueState.assignments) {
              if (assignment.roundNumber !== roundIndex + 1) continue
              if (assignment.fixtureIndex === firstIndex) assignment.fixtureIndex = secondIndex
              else if (assignment.fixtureIndex === secondIndex) assignment.fixtureIndex = firstIndex
            }
          }
        })
        return { success: true }
      },

      setSelectedLineup: (lineup: Record<string, string> | null) => {
        set((state) => {
          const sanitized: Record<string, string> = {}
          const used = new Set<string>()
          for (const [slot, playerId] of Object.entries(lineup ?? {})) {
            if (!playerId || used.has(playerId)) continue
            const player = state.players[playerId]
            if (!player) continue
            if (player.clubId !== state.playerClubId) continue
            if (!canBeSelectedForAfl(player)) continue
            if (player.injury || isPlayerSuspended(player) || player.fitness < 50) continue
            sanitized[slot] = playerId
            used.add(playerId)
          }
          state.selectedLineup = lineup === null ? null : sanitized
          const selectedIds = new Set(
            Object.values(state.selectedLineup ?? {}).filter((id): id is string => Boolean(id)),
          )
          state.reserves.managedLineupPlayerIds = state.reserves.managedLineupPlayerIds.filter((id) => !selectedIds.has(id))
          for (const [slot, playerId] of Object.entries(state.reserves.managedLineupSlotAssignments) as Array<[LineupSlot, string]>) {
            if (selectedIds.has(playerId)) delete state.reserves.managedLineupSlotAssignments[slot]
          }
          if (state.selectedSubstituteId && Object.values(state.selectedLineup ?? {}).includes(state.selectedSubstituteId)) {
            state.selectedSubstituteId = null
          }
        })
      },

      setSelectedSubstitute: (playerId: string | null) => {
        set((state) => {
          if (!playerId) {
            state.selectedSubstituteId = null
            return
          }
          const player = state.players[playerId]
          if (!player || player.clubId !== state.playerClubId || !canBeSelectedForAfl(player) || player.injury || isPlayerSuspended(player) || player.fitness < 50) {
            state.selectedSubstituteId = null
            return
          }
          const inLineup = new Set(Object.values(state.selectedLineup ?? {}).filter((id): id is string => Boolean(id)))
          if (inLineup.has(playerId)) {
            state.selectedSubstituteId = null
            return
          }
          state.selectedSubstituteId = playerId
        })
      },

      saveNamedLineup: ({
        name,
        lineup,
        substitutePlayerId,
        benchPlayerIds,
        includeReserves,
        overwriteExisting,
      }) => {
        const state = get()
        const trimmedName = name.trim()
        if (!trimmedName) return { success: false, error: 'Lineup name is required.' }
        if (!state.playerClubId) return { success: false, error: 'No active club selected.' }

        const lowerName = trimmedName.toLowerCase()
        const existing = state.savedLineups.find(
          (saved) => saved.clubId === state.playerClubId && saved.name.trim().toLowerCase() === lowerName,
        )
        if (existing && !overwriteExisting) {
          return { success: false, error: 'A lineup with this name already exists.', existingId: existing.id }
        }

        const lineupIds = new Set(Object.values(lineup).filter((id): id is string => Boolean(id)))
        const validSubstitute = substitutePlayerId && !lineupIds.has(substitutePlayerId) ? substitutePlayerId : null
        const uniqueBench = Array.from(new Set(benchPlayerIds.filter((id) => id && !lineupIds.has(id))))
        const weeklyEntry = state.weeklyGameplans[state.playerClubId]
        const savedId = existing?.id ?? `lineup-save-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`

        const snapshot: SavedLineup = {
          id: savedId,
          name: trimmedName,
          clubId: state.playerClubId,
          savedAt: new Date().toISOString(),
          seasonYear: state.currentYear,
          round: state.currentRound,
          opponentClubId: getUserOpponentClubId(state),
          matchRules: {
            interchangePlayers: state.settings.matchRules.interchangePlayers,
            enableSubstitutes: state.settings.matchRules.enableSubstitutes,
            quartersPerMatch: state.settings.matchRules.quartersPerMatch,
          },
          lineup: { ...lineup },
          benchPlayerIds: uniqueBench,
          substitutePlayerId: validSubstitute,
          weeklyGameplanSnapshot: weeklyEntry
            ? {
                overrides: { ...weeklyEntry.overrides },
                matchupTactics: weeklyEntry.matchupTactics
                  ? {
                      hardTags: [...weeklyEntry.matchupTactics.hardTags],
                      physicalAttention: [...weeklyEntry.matchupTactics.physicalAttention],
                      roleAssignments: [...weeklyEntry.matchupTactics.roleAssignments],
                    }
                  : {
                      hardTags: [],
                      physicalAttention: [],
                      roleAssignments: [],
                    },
                opponentClubId: weeklyEntry.opponentClubId,
              }
            : null,
          reservesSnapshot: includeReserves
            ? {
                managedLineupPlayerIds: [...state.reserves.managedLineupPlayerIds],
                managedLineupSlotAssignments: { ...state.reserves.managedLineupSlotAssignments },
                playerAvailabilityAssignments: { ...state.reserves.playerAvailabilityAssignments },
              }
            : null,
        }

        set((s) => {
          if (existing) {
            const idx = s.savedLineups.findIndex((saved) => saved.id === existing.id)
            if (idx >= 0) s.savedLineups[idx] = snapshot
            else s.savedLineups.unshift(snapshot)
          } else {
            s.savedLineups.unshift(snapshot)
          }
        })

        return { success: true, savedId, overwritten: Boolean(existing) }
      },

      loadSavedLineup: (lineupId, options) => {
        const state = get()
        const saved = state.savedLineups.find((entry) => entry.id === lineupId)
        if (!saved) return { success: false, error: 'Saved lineup not found.' }
        if (saved.clubId !== state.playerClubId) {
          return { success: false, error: 'This lineup belongs to another club.' }
        }

        set((s) => {
          s.selectedLineup = { ...saved.lineup }
          s.selectedSubstituteId = saved.substitutePlayerId
          if (s.selectedSubstituteId && Object.values(s.selectedLineup).includes(s.selectedSubstituteId)) {
            s.selectedSubstituteId = null
          }

          const baseWeekly = s.weeklyGameplans[s.playerClubId]
          const loadedOpponent = saved.opponentClubId ?? getUserOpponentClubId(s)
          if (saved.weeklyGameplanSnapshot) {
            s.weeklyGameplans[s.playerClubId] = {
              round: s.currentRound,
              opponentClubId: loadedOpponent ?? saved.weeklyGameplanSnapshot.opponentClubId ?? '',
              overrides: { ...saved.weeklyGameplanSnapshot.overrides },
              matchupTactics: {
                hardTags: [...saved.weeklyGameplanSnapshot.matchupTactics.hardTags],
                physicalAttention: [...saved.weeklyGameplanSnapshot.matchupTactics.physicalAttention],
                roleAssignments: [...saved.weeklyGameplanSnapshot.matchupTactics.roleAssignments],
              },
              source: 'user',
            }
          } else if (baseWeekly) {
            s.weeklyGameplans[s.playerClubId] = {
              ...baseWeekly,
              round: s.currentRound,
              opponentClubId: loadedOpponent ?? baseWeekly.opponentClubId,
            }
          }

          if (options?.applyReserves !== false && saved.reservesSnapshot) {
            s.reserves.managedLineupPlayerIds = [...saved.reservesSnapshot.managedLineupPlayerIds]
            s.reserves.managedLineupSlotAssignments = { ...saved.reservesSnapshot.managedLineupSlotAssignments }
            s.reserves.playerAvailabilityAssignments = { ...saved.reservesSnapshot.playerAvailabilityAssignments }
          }
        })

        return { success: true }
      },

      renameSavedLineup: (lineupId, newName) => {
        const state = get()
        const trimmedName = newName.trim()
        if (!trimmedName) return { success: false, error: 'Lineup name is required.' }
        const target = state.savedLineups.find((entry) => entry.id === lineupId)
        if (!target) return { success: false, error: 'Saved lineup not found.' }

        const lowerName = trimmedName.toLowerCase()
        const existing = state.savedLineups.find(
          (entry) =>
            entry.id !== lineupId &&
            entry.clubId === state.playerClubId &&
            entry.name.trim().toLowerCase() === lowerName,
        )
        if (existing) {
          return { success: false, error: 'A lineup with this name already exists.', existingId: existing.id }
        }

        set((s) => {
          const item = s.savedLineups.find((entry) => entry.id === lineupId)
          if (!item) return
          item.name = trimmedName
        })
        return { success: true }
      },

      deleteSavedLineup: (lineupId) => {
        const state = get()
        const exists = state.savedLineups.some((entry) => entry.id === lineupId)
        if (!exists) return { success: false, error: 'Saved lineup not found.' }
        set((s) => {
          s.savedLineups = s.savedLineups.filter((entry) => entry.id !== lineupId)
        })
        return { success: true }
      },

      addNewsItem: (item: NewsItem) => {
        set((state) => {
          appendNewsItem(state, item)
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

      markEmailRead: (newsId: string) => {
        set((state) => {
          const item = state.emailLog.find((n) => n.id === newsId)
          if (item) item.read = true
        })
      },

      markAllEmailRead: () => {
        set((state) => {
          for (const item of state.emailLog) {
            item.read = true
          }
        })
      },

      addSigningWatchlistPlayer: (playerId: string) => {
        set((state) => {
          const shortlist = ensureShortlist(state, LEGACY_SIGNING_WATCHLIST_ID, LEGACY_SIGNING_WATCHLIST_NAME)
          if (findShortlistEntryIndex(shortlist, 'player', playerId) === -1) {
            const now = new Date().toISOString()
            shortlist.entries.push({
              targetType: 'player',
              targetId: playerId,
              note: '',
              priority: 'medium',
              addedAt: now,
              updatedAt: now,
            })
            shortlist.updatedAt = now
          }
          syncLegacySigningArrays(state)
          trackSigningInteraction(state, playerId)
        })
      },

      removeSigningWatchlistPlayer: (playerId: string) => {
        set((state) => {
          const shortlist = state.shortlists.find((item) => item.id === LEGACY_SIGNING_WATCHLIST_ID)
          if (!shortlist) return
          shortlist.entries = shortlist.entries.filter((entry) => !(entry.targetType === 'player' && entry.targetId === playerId))
          shortlist.updatedAt = new Date().toISOString()
          syncLegacySigningArrays(state)
        })
      },

      addSigningShortlistPlayer: (playerId: string) => {
        set((state) => {
          const shortlist = ensureShortlist(state, LEGACY_SIGNING_SHORTLIST_ID, LEGACY_SIGNING_SHORTLIST_NAME)
          if (findShortlistEntryIndex(shortlist, 'player', playerId) === -1) {
            const now = new Date().toISOString()
            shortlist.entries.push({
              targetType: 'player',
              targetId: playerId,
              note: '',
              priority: 'medium',
              addedAt: now,
              updatedAt: now,
            })
            shortlist.updatedAt = now
          }
          syncLegacySigningArrays(state)
          trackSigningInteraction(state, playerId)
        })
      },

      removeSigningShortlistPlayer: (playerId: string) => {
        set((state) => {
          const shortlist = state.shortlists.find((item) => item.id === LEGACY_SIGNING_SHORTLIST_ID)
          if (!shortlist) return
          shortlist.entries = shortlist.entries.filter((entry) => !(entry.targetType === 'player' && entry.targetId === playerId))
          shortlist.updatedAt = new Date().toISOString()
          syncLegacySigningArrays(state)
        })
      },

      createShortlist: (name: string) => {
        const trimmed = name.trim()
        if (!trimmed) return { success: false, error: 'Shortlist name is required.' }
        const state = get()
        const existing = state.shortlists.find((item) => item.name.toLowerCase() === trimmed.toLowerCase())
        if (existing) return { success: false, error: 'A shortlist with this name already exists.', shortlistId: existing.id }
        const shortlistId = crypto.randomUUID()
        const now = new Date().toISOString()
        set((s) => {
          s.shortlists.push({
            id: shortlistId,
            name: trimmed,
            createdAt: now,
            updatedAt: now,
            entries: [],
          })
        })
        return { success: true, shortlistId }
      },

      renameShortlist: (shortlistId: string, name: string) => {
        const trimmed = name.trim()
        if (!trimmed) return { success: false, error: 'Shortlist name is required.' }
        const state = get()
        const shortlist = state.shortlists.find((item) => item.id === shortlistId)
        if (!shortlist) return { success: false, error: 'Shortlist not found.' }
        const existing = state.shortlists.find(
          (item) => item.id !== shortlistId && item.name.toLowerCase() === trimmed.toLowerCase(),
        )
        if (existing) return { success: false, error: 'A shortlist with this name already exists.', existingId: existing.id }
        set((s) => {
          const target = s.shortlists.find((item) => item.id === shortlistId)
          if (!target) return
          target.name = trimmed
          target.updatedAt = new Date().toISOString()
        })
        return { success: true }
      },

      deleteShortlist: (shortlistId: string) => {
        const state = get()
        const exists = state.shortlists.some((item) => item.id === shortlistId)
        if (!exists) return { success: false, error: 'Shortlist not found.' }
        set((s) => {
          s.shortlists = s.shortlists.filter((item) => item.id !== shortlistId)
          syncLegacySigningArrays(s)
        })
        return { success: true }
      },

      addShortlistEntry: ({ shortlistId, targetType, targetId, note, priority }) => {
        if (!targetId) return { success: false, error: 'Missing target.' }
        set((s) => {
          const shortlist = s.shortlists.find((item) => item.id === shortlistId)
          if (!shortlist) return
          const index = findShortlistEntryIndex(shortlist, targetType, targetId)
          const now = new Date().toISOString()
          if (index === -1) {
            shortlist.entries.push({
              targetType,
              targetId,
              note: note?.trim() ?? '',
              priority: priority ?? 'medium',
              addedAt: now,
              updatedAt: now,
            })
          } else {
            shortlist.entries[index].note = note?.trim() ?? shortlist.entries[index].note
            shortlist.entries[index].priority = priority ?? shortlist.entries[index].priority
            shortlist.entries[index].updatedAt = now
          }
          shortlist.updatedAt = now
          if (targetType === 'player') {
            trackSigningInteraction(s, targetId)
          }
          syncLegacySigningArrays(s)
        })
        const fresh = get()
        const shortlist = fresh.shortlists.find((item) => item.id === shortlistId)
        if (!shortlist) return { success: false, error: 'Shortlist not found.' }
        return { success: true }
      },

      removeShortlistEntry: ({ shortlistId, targetType, targetId }) => {
        const state = get()
        const shortlist = state.shortlists.find((item) => item.id === shortlistId)
        if (!shortlist) return { success: false, error: 'Shortlist not found.' }
        set((s) => {
          const target = s.shortlists.find((item) => item.id === shortlistId)
          if (!target) return
          target.entries = target.entries.filter((entry) => !(entry.targetType === targetType && entry.targetId === targetId))
          target.updatedAt = new Date().toISOString()
          syncLegacySigningArrays(s)
        })
        return { success: true }
      },

      updateShortlistEntry: ({ shortlistId, targetType, targetId, note, priority }) => {
        const state = get()
        const shortlist = state.shortlists.find((item) => item.id === shortlistId)
        if (!shortlist) return { success: false, error: 'Shortlist not found.' }
        const existing = shortlist.entries.find((entry) => entry.targetType === targetType && entry.targetId === targetId)
        if (!existing) return { success: false, error: 'Shortlist entry not found.' }
        set((s) => {
          const target = s.shortlists.find((item) => item.id === shortlistId)
          if (!target) return
          const entry = target.entries.find((item) => item.targetType === targetType && item.targetId === targetId)
          if (!entry) return
          if (note !== undefined) entry.note = note
          if (priority !== undefined) entry.priority = priority
          const now = new Date().toISOString()
          entry.updatedAt = now
          target.updatedAt = now
          syncLegacySigningArrays(s)
        })
        return { success: true }
      },

      proposeTradeOffer: (partnerClubId: string, sendPlayerIds: string[], receivePlayerIds: string[]) => {
        const state = get()
        if (!state.clubs[partnerClubId]) {
          return { success: false, error: 'Trade partner not found' }
        }
        if (sendPlayerIds.length === 0 || receivePlayerIds.length === 0) {
          return { success: false, error: 'Trade must include assets on both sides' }
        }
        set((s) => {
          for (const playerId of receivePlayerIds) {
            trackSigningInteraction(s, playerId)
          }
        })

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
        // Compute trade pressure before players move clubs
        const playerClubIdForTrade = state.playerClubId
        const playersLeavingUserClub = baseOffer.playerMoves
          .filter((mv) => mv.fromClubId === playerClubIdForTrade)
          .map((mv) => ({ id: mv.playerId, player: state.players[mv.playerId] }))
          .filter((p) => p.player != null)

        set((s) => {
          s.players = executed.updatedPlayers
          s.clubs = executed.updatedClubs
          s.tradeHistory.push(executed.completedTrade)
          appendNewsItem(s, executed.news)
          for (const moved of baseOffer.playerMoves) {
            s.tradeBlock = removePlayerTradeBlockListing(s.tradeBlock, moved.playerId)
          }
          const allPlayers = Object.values(s.players)
          for (const club of Object.values(s.clubs)) {
            club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
          }

          // Apply trade pressure for players leaving the user's club
          const userClub = s.clubs[playerClubIdForTrade]
          if (userClub) {
            const tradeStories = []
            for (const { player } of playersLeavingUserClub) {
              if (!player) continue
              const overallRating = getOverallRating(player)
              const story = generateTradePressureStory(
                overallRating,
                `${player.firstName} ${player.lastName}`,
                true,
                s.currentRound,
              )
              if (story) tradeStories.push(story)
            }
            if (tradeStories.length > 0) {
              userClub.mediaPressure = updateMediaPressure(
                userClub.mediaPressure,
                tradeStories,
                s.currentRound,
                false,
              )
              // Immediate morale hit from pressure spike
              const moraleHit = getMediaPressureMoraleEffect(userClub.mediaPressure.score)
              if (moraleHit !== 0) {
                for (const p of Object.values(s.players)) {
                  if (p.clubId === playerClubIdForTrade) {
                    p.morale = Math.max(1, Math.min(100, p.morale + moraleHit))
                  }
                }
              }
            }
          }
        })

        return { success: true, accepted: true }
      },

      respondToTradeOffer: (offerId: string, decision: 'accept' | 'reject' | 'counter') => {
        const state = get()
        const inboxItem = state.tradeInbox.find((item) => item.id === offerId)
        if (!inboxItem) return { success: false, error: 'Offer not found' }
        const offer = inboxItem.offer
        set((s) => {
          for (const move of offer.playerMoves) {
            if (move.toClubId === s.playerClubId) {
              trackSigningInteraction(s, move.playerId)
            }
          }
        })
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

          // Board approval check for salary retention trades
          const userRetention = offer.salaryRetentions
            .filter((r) => r.retainingClubId === state.playerClubId)
            .reduce((sum, r) => sum + r.amount, 0)
          if (needsBoardApproval({ category: 'trade', params: { userSalaryRetention: userRetention } }, state.settings)) {
            const club = state.clubs[state.playerClubId]
            if (club) {
              const tracker = state.boardApprovals ?? { records: [], denialCooldowns: {} }

              if (isApprovalOnCooldown(tracker, 'trade', offerId, state.currentDate)) {
                return { success: false, error: 'The board recently denied this trade. Please wait before trying again.' }
              }

              const ladderIdx = state.ladder.findIndex((e) => e.clubId === state.playerClubId)
              const ladderPosition = ladderIdx >= 0 ? ladderIdx + 1 : 18

              const approvalResult = computeBoardApproval({
                category: 'trade',
                club,
                jobSecurity: state.manager.jobSecurity,
                ladderPosition,
                settings: state.settings,
                tradeParams: { userSalaryRetention: userRetention },
              })

              const rng = new SeededRNG(state.rngSeed + offerId.length * 6131 + state.currentRound * 2909)
              const { updatedTracker, approved } = rollBoardApproval(
                tracker, approvalResult, rng, state.currentDate,
                `Trade with salary retention of $${userRetention.toLocaleString()}`,
                state.playerClubId, offerId,
              )

              set((s) => {
                s.boardApprovals = updatedTracker
              })

              if (!approved) {
                set((s) => {
                  appendNewsItem(s, {
                    id: crypto.randomUUID(),
                    date: s.currentDate,
                    headline: 'Board blocks trade with salary retention',
                    body: `The board has denied a proposed trade that would require the club to retain $${userRetention.toLocaleString()} in salary.`,
                    category: 'trade',
                    clubIds: [s.playerClubId],
                    playerIds: [],
                  })
                })
                return { success: false, error: 'The board has blocked this trade due to salary retention concerns.' }
              }
            }
          }

          const consent = validateTradeConsent(offer, state.players, state.clubs, state.settings, new SeededRNG(state.rngSeed + Date.now()))
          if (!consent.ok) {
            return { success: false, error: consent.reason ?? 'A player refused the trade' }
          }
          const executed = executeTradeOffer(offer, state.players, state.clubs, state.currentDate)
          // Pre-compute players leaving user's club before state mutation
          const playerClubIdForTrade2 = state.playerClubId
          const playersLeavingUserClub2 = offer.playerMoves
            .filter((mv) => mv.fromClubId === playerClubIdForTrade2)
            .map((mv) => ({ id: mv.playerId, player: state.players[mv.playerId] }))
            .filter((p) => p.player != null)

          set((s) => {
            const item = s.tradeInbox.find((i) => i.id === offerId)
            if (item) {
              item.offer.status = 'accepted'
              item.read = true
            }
            s.players = executed.updatedPlayers
            s.clubs = executed.updatedClubs
            s.tradeHistory.push(executed.completedTrade)
            appendNewsItem(s, executed.news)
            for (const moved of offer.playerMoves) {
              s.tradeBlock = removePlayerTradeBlockListing(s.tradeBlock, moved.playerId)
            }
            const allPlayers = Object.values(s.players)
            for (const club of Object.values(s.clubs)) {
              club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
            }

            // Trade pressure for players leaving user's club
            const userClub2 = s.clubs[playerClubIdForTrade2]
            if (userClub2) {
              const tradeStories2 = []
              for (const { id: _id, player } of playersLeavingUserClub2) {
                if (!player) continue
                const overallRating = getOverallRating(player)
                const story = generateTradePressureStory(
                  overallRating,
                  `${player.firstName} ${player.lastName}`,
                  true,
                  s.currentRound,
                )
                if (story) tradeStories2.push(story)
              }
              if (tradeStories2.length > 0) {
                userClub2.mediaPressure = updateMediaPressure(
                  userClub2.mediaPressure,
                  tradeStories2,
                  s.currentRound,
                  false,
                )
                const moraleHit2 = getMediaPressureMoraleEffect(userClub2.mediaPressure.score)
                if (moraleHit2 !== 0) {
                  for (const p of Object.values(s.players)) {
                    if (p.clubId === playerClubIdForTrade2) {
                      p.morale = Math.max(1, Math.min(100, p.morale + moraleHit2))
                    }
                  }
                }
              }
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
            appendNewsItem(s, executed.news)
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
              appendNewsItem(s, {
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
              appendNewsItem(s, {
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

      submitTribunalPlea: (caseId: string, params: { plea: TribunalPlea; legalRepTier: TribunalLegalRep['tier']; attended: boolean }) => {
        const state = get()
        const caseItem = state.tribunalInbox.find((c) => c.id === caseId)
        if (!caseItem) return { success: false, error: 'Tribunal case not found' }
        if (caseItem.status !== 'pending-user') return { success: false, error: 'Case is no longer pending' }
        if (caseItem.clubId !== state.playerClubId) return { success: false, error: 'Only user club cases can be actioned here' }

        const legalRep = getLegalRepByTier(params.legalRepTier)

        // Check if legal representation is allowed by realism settings
        if (!state.settings.realism.tribunalLegalRepresentation && legalRep.tier !== 'none' && legalRep.tier !== 'club-appointed') {
          return { success: false, error: 'Legal representation is disabled in realism settings' }
        }

        // Check early plea discount setting
        if (!state.settings.realism.tribunalEarlyPleaDiscount && params.plea === 'guilty-early') {
          return { success: false, error: 'Early plea discount is disabled in realism settings' }
        }

        const rng = new SeededRNG(state.rngSeed + Date.now())
        const resolved = resolveUserTribunalCase({
          caseItem,
          decision: params.plea === 'not-guilty' ? 'challenge' : 'accept',
          clubs: state.clubs,
          rng,
          plea: params.plea,
          legalRep,
          attended: params.attended,
        })

        set((s) => {
          const idx = s.tribunalInbox.findIndex((c) => c.id === caseId)
          if (idx < 0) return
          s.tribunalInbox[idx] = resolved

          // Resolve associated calendar event
          if (resolved.calendarEventId) {
            const calEvt = s.calendar.events.find((e) => e.id === resolved.calendarEventId)
            if (calEvt) calEvt.resolved = true
          }

          const player = s.players[resolved.playerId]
          if (player) {
            applyTribunalOutcomeToPlayer(player, resolved)
            if (resolved.finalWeeks && resolved.finalWeeks > 0) {
              appendNewsItem(s, {
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
              appendNewsItem(s, {
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

      skipTribunal: (caseId: string) => {
        const state = get()
        const caseItem = state.tribunalInbox.find((c) => c.id === caseId)
        if (!caseItem) return { success: false, error: 'Tribunal case not found' }
        if (caseItem.status !== 'pending-user') return { success: false, error: 'Case is no longer pending' }
        if (caseItem.clubId !== state.playerClubId) return { success: false, error: 'Only user club cases can be actioned here' }

        // Skip = auto-apply recommended weeks (equivalent to guilty-early plea, not attended)
        const rng = new SeededRNG(state.rngSeed + Date.now())
        const resolved = resolveUserTribunalCase({
          caseItem,
          decision: 'accept',
          clubs: state.clubs,
          rng,
          plea: 'guilty-early',
          legalRep: null,
          attended: false,
        })

        set((s) => {
          const idx = s.tribunalInbox.findIndex((c) => c.id === caseId)
          if (idx < 0) return
          s.tribunalInbox[idx] = resolved

          if (resolved.calendarEventId) {
            const calEvt = s.calendar.events.find((e) => e.id === resolved.calendarEventId)
            if (calEvt) calEvt.resolved = true
          }

          const player = s.players[resolved.playerId]
          if (player) {
            applyTribunalOutcomeToPlayer(player, resolved)
            if (resolved.finalWeeks && resolved.finalWeeks > 0) {
              appendNewsItem(s, {
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

      assignScoutToYouthComp: (scoutId: string, compId: YouthCompId) => {
        const state = get()
        if (!state.youthPathway) return { success: false, error: 'Youth pathway not enabled' }
        const scout = state.scouts.find((s) => s.id === scoutId)
        if (!scout) return { success: false, error: 'Scout not found' }
        if (scout.clubId !== state.playerClubId) return { success: false, error: 'Can only manage your own scouts' }
        const comp = state.youthPathway.competitions[compId]
        if (!comp) return { success: false, error: 'Competition not found' }

        set((s) => {
          if (!s.youthPathway) return
          // Remove any existing assignment for this scout
          s.youthPathway.scoutAssignments = s.youthPathway.scoutAssignments.filter(
            (a) => a.scoutId !== scoutId,
          )
          // Add new assignment
          s.youthPathway.scoutAssignments.push({
            scoutId,
            compId,
            assignedRound: s.currentRound + 1,
            discoveryCount: 0,
          })
        })
        return { success: true }
      },

      unassignScoutFromYouthComp: (scoutId: string) => {
        const state = get()
        if (!state.youthPathway) return { success: false, error: 'Youth pathway not enabled' }

        set((s) => {
          if (!s.youthPathway) return
          s.youthPathway.scoutAssignments = s.youthPathway.scoutAssignments.filter(
            (a) => a.scoutId !== scoutId,
          )
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
          appendNewsItem(s, {
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
        if (state.simulation.active) return { success: false, error: 'Simulation already in progress' }
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
        if (state.simulation.active) return { success: false, error: 'Simulation already in progress' }
        if (!state.draft) return { success: false, error: 'No active draft' }
        if (state.draft.nationalDraftComplete) return { success: false, error: 'National draft already complete' }

        startSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Live Draft', 'Advancing to your next selection...')
        appendSimulationLog(set as (fn: (state: GameState) => void) => void, 'Running AI draft decisions until your club is on the clock.')
        try {
          const rng = new SeededRNG(state.rngSeed + Date.now())
          let aiSelections = 0
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
                appendNewsItem(s, {
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
              rng,
            )
            aiSelections += 1
            s.players[newPlayer.id] = newPlayer
            normalizeClubJumperNumbers(s, bidResolution.awardedClubId)
            s.history.draftHistory.push({
              year: s.currentYear,
              pickNumber: activePick.pickNumber,
              round: activePick.round,
              clubId: bidResolution.awardedClubId,
              playerId: newPlayer.id,
              playerName: `${newPlayer.firstName} ${newPlayer.lastName}`,
              position: newPlayer.position.primary,
            })
            appendNewsItem(s, {
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
          appendSimulationLog(set as (fn: (state: GameState) => void) => void, `Processed ${aiSelections} AI draft selection${aiSelections === 1 ? '' : 's'}.`)
          updateSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Draft board updated.')
          return { success: true }
        } finally {
          finishSimulationStatus(set as (fn: (state: GameState) => void) => void)
        }
      },

      makeUserDraftSelectionAction: (prospectId: string) => {
        const state = get()
        if (state.simulation.active) return { success: false, error: 'Simulation already in progress' }
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

        const rng = new SeededRNG(state.rngSeed + Date.now())
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
            rng,
          )
          s.players[newPlayer.id] = newPlayer
          normalizeClubJumperNumbers(s, bidResolution.awardedClubId)
          s.history.draftHistory.push({
            year: s.currentYear,
            pickNumber: activePick.pickNumber,
            round: activePick.round,
            clubId: bidResolution.awardedClubId,
            playerId: newPlayer.id,
            playerName: `${newPlayer.firstName} ${newPlayer.lastName}`,
            position: newPlayer.position.primary,
          })
          appendNewsItem(s, {
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

          appendNewsItem(s, {
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

      suggestNextDraftPickAction: () => {
        const state = get()
        if (!state.draft) return null
        if (state.draft.nationalDraftComplete) return null
        const idx = state.draft.currentPickIndex
        if (idx < 0 || idx >= state.draft.nationalDraftPicks.length) return null
        const pick = state.draft.nationalDraftPicks[idx]
        if (!pick || pick.clubId !== state.playerClubId) return null

        const club = state.clubs[state.playerClubId]
        if (!club) return null

        const available = getAvailableProspectsForDraft(state.draft.prospects, state.draft.draftedProspectIds)
        if (available.length === 0) return null

        // Find the best recruiting staff member for the suggestion
        const clubStaff = Object.values(state.staff).filter((s) => s.clubId === state.playerClubId)
        const recruitingStaff = clubStaff
          .filter((s) => ['recruiting-manager', 'head-coach', 'assistant-coach'].includes(s.role))
          .sort((a, b) => b.ratings.recruitment - a.ratings.recruitment)
        const designatedStaff = recruitingStaff[0] ?? clubStaff[0]
        const staffName = designatedStaff
          ? `${designatedStaff.firstName} ${designatedStaff.lastName}`
          : 'Recruiting Department'
        const staffRole = designatedStaff
          ? designatedStaff.role.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          : 'Staff'
        const staffRecruitment = designatedStaff?.ratings.recruitment ?? 50

        const staffImpact = getCoachingImpact(Object.values(state.staff), state.playerClubId)

        return suggestNextPick(
          club, pick, available, state.players,
          [
            ...new Set(
              state.shortlists.flatMap((list) =>
                list.entries
                  .filter((entry) => entry.targetType === 'prospect')
                  .map((entry) => entry.targetId),
              ),
            ),
          ],
          staffName, staffRole, staffRecruitment,
          {
            scoutingAccuracy: staffImpact.scoutingAccuracy || 1,
            draftSuccess: staffImpact.draftSuccess || 1,
          },
          {
            ngaAcademyEnabled: state.settings.realism.ngaAcademy,
            ngaAcademyZoneMatching: state.settings.realism.ngaAcademyZoneMatching,
          },
        )
      },

      runDelegatedDraftAction: () => {
        const state = get()
        if (state.simulation.active) return { success: false, error: 'Simulation already in progress', records: [] }
        if (!state.draft) return { success: false, error: 'No active draft', records: [] }
        if (state.draft.nationalDraftComplete) return { success: false, error: 'National draft already complete', records: [] }

        startSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Delegated Draft', 'Your staff are running the draft on your behalf...')
        appendSimulationLog(set as (fn: (state: GameState) => void) => void, 'All picks delegated to club staff.')
        const allRecords: DelegatedPickRecord[] = []
        try {
          const rng = new SeededRNG(state.rngSeed + Date.now())
          set((s) => {
            if (!s.draft) return
            if (s.draft.currentPickIndex < 0) s.draft.currentPickIndex = 0
            s.draft.pickTradeOffers = s.draft.pickTradeOffers ?? []

            // Build staff lookup for rotating influencers
            const clubStaff = Object.values(s.staff).filter((st) => st.clubId === s.playerClubId)
            const recruitingStaff = clubStaff
              .filter((st) => ['recruiting-manager', 'head-coach', 'assistant-coach'].includes(st.role))
              .sort((a, b) => b.ratings.recruitment - a.ratings.recruitment)
            const allInfluencers = recruitingStaff.length > 0 ? recruitingStaff : clubStaff.length > 0 ? clubStaff : null

            while (!s.draft.nationalDraftComplete && s.draft.currentPickIndex < s.draft.nationalDraftPicks.length) {
              const idx = s.draft.currentPickIndex
              const pick = s.draft.nationalDraftPicks[idx]
              if (!pick) { s.draft.nationalDraftComplete = true; break }
              if (pick.selectedProspectId) { s.draft.currentPickIndex += 1; continue }

              const isUserPick = pick.clubId === s.playerClubId
              const club = s.clubs[pick.clubId]
              if (!club) { s.draft.currentPickIndex += 1; continue }

              const staffImpact = getCoachingImpact(Object.values(s.staff), club.id)
              const available = getAvailableProspectsForDraft(s.draft.prospects, s.draft.draftedProspectIds)
              if (available.length === 0) { s.draft.nationalDraftComplete = true; break }

              let selectedProspectId: string

              if (isUserPick && allInfluencers) {
                // Rotate through staff for variety in the recap
                const influencer = allInfluencers[allRecords.length % allInfluencers.length]
                const staffName = `${influencer.firstName} ${influencer.lastName}`
                const staffRole = influencer.role.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

                const { prospectId, record } = delegatedStaffPick(
                  club, pick, available, s.players, rng,
                  staffName, staffRole, influencer.ratings.recruitment,
                  {
                    scoutingAccuracy: staffImpact.scoutingAccuracy || 1,
                    draftSuccess: staffImpact.draftSuccess || 1,
                  },
                  {
                    ngaAcademyEnabled: s.settings.realism.ngaAcademy,
                    ngaAcademyZoneMatching: s.settings.realism.ngaAcademyZoneMatching,
                  },
                )
                selectedProspectId = prospectId
                allRecords.push(record)
              } else {
                selectedProspectId = aiSelectProspect(
                  club, pick, available, s.players, rng,
                  {
                    scoutingAccuracy: staffImpact.scoutingAccuracy || 1,
                    draftSuccess: staffImpact.draftSuccess || 1,
                  },
                  {
                    ngaAcademyEnabled: s.settings.realism.ngaAcademy,
                    ngaAcademyZoneMatching: s.settings.realism.ngaAcademyZoneMatching,
                  },
                )
              }

              const prospect = s.draft.prospects.find((p) => p.id === selectedProspectId)
              if (!prospect) { s.draft.currentPickIndex += 1; continue }

              const bidResolution = resolveLinkedBidMatch({
                draft: s.draft,
                pickIndex: idx,
                selectingClubId: pick.clubId,
                selectedProspect: prospect,
                settings: s.settings,
              })
              s.draft.nationalDraftPicks = bidResolution.updatedPicks
              const activePick = s.draft.nationalDraftPicks[idx]
              if (!activePick) { s.draft.currentPickIndex += 1; continue }
              activePick.selectedProspectId = selectedProspectId
              s.draft.draftedProspectIds.push(selectedProspectId)

              const newPlayer = convertProspectToPlayer(
                prospect, bidResolution.awardedClubId, s.currentYear, activePick.pickNumber, rng,
              )
              s.players[newPlayer.id] = newPlayer
              normalizeClubJumperNumbers(s, bidResolution.awardedClubId)
              s.history.draftHistory.push({
                year: s.currentYear,
                pickNumber: activePick.pickNumber,
                round: activePick.round,
                clubId: bidResolution.awardedClubId,
                playerId: newPlayer.id,
                playerName: `${newPlayer.firstName} ${newPlayer.lastName}`,
                position: newPlayer.position.primary,
              })
              appendNewsItem(s, {
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
          appendSimulationLog(set as (fn: (state: GameState) => void) => void, `Delegated draft complete. Your staff made ${allRecords.length} selection${allRecords.length === 1 ? '' : 's'}.`)
          updateSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Delegated draft complete.')
          return { success: true, records: allRecords }
        } finally {
          finishSimulationStatus(set as (fn: (state: GameState) => void) => void)
        }
      },

      resetGame: () => {
        set((state) => {
          const defaults = createDefaultState()
          Object.assign(state, defaults)
        })
      },

      loadState: (loaded: GameState) => {
        set((state) => {
          Object.assign(state, loaded)
          state.simulation = { ...DEFAULT_SIMULATION_STATUS }
          enforceSingleClubCareerInvariant(state)
        })
      },

      setMembershipTierPrice: (clubId, tierId, price) => {
        set((s) => {
          const club = s.clubs[clubId]
          if (!club?.finances.membershipState) return
          const tier = club.finances.membershipState.tiers.find((t) => t.tierId === tierId)
          if (tier) tier.price = price
        })
      },

      setMembershipCampaignBudget: (clubId, budget) => {
        set((s) => {
          const club = s.clubs[clubId]
          if (!club?.finances.membershipState) return
          club.finances.membershipState.campaignBudget = budget
        })
      },

      setMembershipSeasonTarget: (clubId, target) => {
        set((s) => {
          const club = s.clubs[clubId]
          if (!club?.finances.membershipState) return
          club.finances.membershipState.seasonTarget = target
        })
      },

      enterOffseason: () => {
        const state = get()
        if (state.simulation.active) return
        startSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Offseason Processing', 'Finalizing season and resolving offseason events...')
        appendSimulationLog(set as (fn: (state: GameState) => void) => void, 'Processing retirements, delistings, strategy updates, and board outcomes.')
        try {
        const rng = new SeededRNG(state.rngSeed + state.currentYear * 31337)
        const playerSeasonSnapshots = Object.values(state.players)
          .filter((player) => player.clubId !== 'retired')
          .map((player) => ({
            playerId: player.id,
            playerName: `${player.firstName} ${player.lastName}`,
            year: state.currentYear,
            clubId: player.clubId,
            age: player.age,
            position: player.position.primary,
            overall: getOverallRating(player),
            stats: { ...player.seasonStats },
          }))

        // 1. Process season end (stats merge, aging, development, retirements)
        const { updatedPlayers, retiredIds, news: retirementNews, developmentReport, retirementLegacies } = processSeasonEnd(
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
        const {
          updatedPlayers: postRetirePlayers,
          updatedClubs: hallOfFameUpdatedClubs,
          inductedHallOfFameIds,
        } = processRetirements(
          updatedPlayers,
          retiredIds,
          state.clubs,
          state.currentYear,
        )

        // 3. Evaluate and update AI club strategies (before delistings so updated competitiveWindow propagates)
        const { updatedClubs: strategyUpdatedClubs, news: strategyNews } = evaluateAndUpdateAIStrategies(
          hallOfFameUpdatedClubs,
          postRetirePlayers,
          state.ladder,
          rng,
          state.playerClubId,
          state.currentYear,
        )

        const ladderByClub = new Map(state.ladder.map((entry, idx) => [entry.clubId, idx + 1]))
        const userClub = state.playerClubId ? strategyUpdatedClubs[state.playerClubId] ?? state.clubs[state.playerClubId] : null
        const userLadderPosition = userClub ? (ladderByClub.get(userClub.id) ?? 18) : 18
        const userFinalist = userLadderPosition <= 8
        const expectation = userClub
          ? generateBoardExpectation(userClub, userLadderPosition, rng)
          : null
        const satisfaction = expectation
          ? evaluateBoardSatisfaction(expectation, userLadderPosition, userFinalist)
          : null
        const fanAdjustedSecurity = satisfaction && userClub
          ? applyFanSatisfactionToJobSecurity(satisfaction.jobSecurity, userClub.fanSatisfaction)
          : null
        const politicsModifier =
          state.settings.realism.boardPolitics
            ? rng.nextInt(-12, 12)
            : 0
        const finalJobSecurity = fanAdjustedSecurity == null
          ? null
          : Math.max(0, Math.min(100, fanAdjustedSecurity + politicsModifier))
        const firedByBoard =
          Boolean(state.settings.realism.boardPressure) &&
          finalJobSecurity != null &&
          finalJobSecurity < 28

        const carouselSacks = processCoachingCarousel(
          Object.values(state.staff),
          state.ladder,
          rng,
          state.playerClubId,
          state.settings.realism.coachingCarousel,
        )
        const aiOpeningsFromSacks = carouselSacks.map((sack) =>
          buildCoachingOpening({
            clubId: sack.clubId,
            reason: 'Head coach dismissed after underperformance.',
            postedDate: state.currentDate,
            urgency: 'high',
          }),
        )

        // 4. AI delistings (uses updated strategies from step 3)
        const { delistedIds: aiDelistedIds, news: delistNews } = processAIDelistings(
          postRetirePlayers,
          strategyUpdatedClubs,
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
          // Write strategy-updated clubs
          for (const [id, c] of Object.entries(strategyUpdatedClubs)) {
            s.clubs[id] = c
          }
          // Resolve coaching carousel (AI only)
          if (carouselSacks.length > 0) {
            for (const sack of carouselSacks) {
              delete s.staff[sack.sacked.id]
              s.staff[sack.replacement.id] = sack.replacement
              appendNewsItem(s, {
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: sack.headline,
                body: sack.body,
                category: 'general',
                clubIds: [sack.clubId],
                playerIds: [],
              })
            }
          }
          // Append news
          for (const n of [...retirementNews, ...strategyNews, ...delistNews]) {
            pushSigningNotification(s, n)
          }

          if (expectation && finalJobSecurity != null) {
            s.manager.jobSecurity = finalJobSecurity
            s.manager.seasonExpectation = expectation.description
          }

          if (firedByBoard) {
            const firedClubId = s.playerClubId
            const firedClub = s.clubs[firedClubId]
            s.playerClubId = ''
            s.manager.employmentStatus = 'unemployed'
            s.manager.currentClubId = null
            s.manager.unemployedSinceYear = s.currentYear
            s.coachingJobMarket.push(
              buildCoachingOpening({
                clubId: firedClubId,
                reason: 'Board terminated the senior coach after failing expectations.',
                postedDate: s.currentDate,
                urgency: 'high',
              }),
            )
            appendNewsItem(s, {
              id: crypto.randomUUID(),
              date: s.currentDate,
              headline: `${firedClub?.name ?? 'Your club'} sack ${s.manager.name}`,
              body: `Board review concluded with job security at ${finalJobSecurity}%. You are now unemployed and can apply for vacant roles.`,
              category: 'general',
              clubIds: firedClub ? [firedClub.id] : [],
              playerIds: [],
            })
          }
          if (aiOpeningsFromSacks.length > 0) {
            s.coachingJobMarket.push(...aiOpeningsFromSacks)
          }

          enforceSingleClubCareerInvariant(s)

          if (
            s.manager.employmentStatus === 'unemployed' &&
            s.coachingJobMarket.filter((job) => job.status === 'open').length === 0
          ) {
            s.coachingJobMarket.push(
              ...seedInitialCoachingOpenings(s.clubs, new SeededRNG(s.rngSeed + s.currentYear * 41), s.currentDate),
            )
          }

          s.history.developmentReports.push(developmentReport)
          if (!s.history.retirementLegacies) {
            s.history.retirementLegacies = []
          }
          if (!s.history.playerSeasonStats) {
            s.history.playerSeasonStats = []
          }
          for (const snapshot of playerSeasonSnapshots) {
            const existingIndex = s.history.playerSeasonStats.findIndex(
              (entry) => entry.playerId === snapshot.playerId && entry.year === snapshot.year,
            )
            if (existingIndex >= 0) {
              s.history.playerSeasonStats[existingIndex] = snapshot
            } else {
              s.history.playerSeasonStats.push(snapshot)
            }
          }
          const inductedSet = new Set(inductedHallOfFameIds)
          for (const legacy of retirementLegacies) {
            s.history.retirementLegacies.push({
              ...legacy,
              inductedClubHallOfFame: inductedSet.has(legacy.playerId),
            })
          }
          appendNewsItem(s, {
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${developmentReport.year} Player Development Report released`,
            body: 'Preseason development outcomes are in: review risers, fallers, breakout candidates, bust watch, and club summaries.',
            category: 'general',
            clubIds: [],
            playerIds: [],
          })

          // Season-end financial processing: full revenue/expense + luxury tax
          {
            const allPlayers = Object.values(s.players)
            const allStaff = Object.values(s.staff)
            const financeRng = new SeededRNG(s.rngSeed + s.currentYear * 31)

            // Pre-compute away games played per club from fixture
            const awayGamesByClub: Record<string, number> = {}
            for (const round of s.season.rounds) {
              for (const fixture of round.fixtures) {
                awayGamesByClub[fixture.awayClubId] = (awayGamesByClub[fixture.awayClubId] ?? 0) + 1
              }
            }

            // Pre-compute injury weeks total per club (rough: injured players * weeks remaining)
            const injuryWeeksByClub: Record<string, number> = {}
            for (const player of allPlayers) {
              if (player.clubId && player.injury && player.injury.weeksRemaining > 0) {
                injuryWeeksByClub[player.clubId] = (injuryWeeksByClub[player.clubId] ?? 0) + player.injury.weeksRemaining
              }
            }

            // Pre-compute AFL distribution inputs
            const totalTeams = Object.keys(s.clubs).length || 18

            // Finals wins per club from this season's match results
            const finalsWinsByClub: Record<string, number> = {}
            let premierClubId = ''
            let runnerUpClubId = ''
            for (const mr of s.matchResults) {
              if (mr.isFinal && mr.result) {
                const homeWon = mr.result.homeTotalScore > mr.result.awayTotalScore
                const winnerId = homeWon ? mr.homeClubId : mr.awayClubId
                const loserId = homeWon ? mr.awayClubId : mr.homeClubId
                finalsWinsByClub[winnerId] = (finalsWinsByClub[winnerId] ?? 0) + 1
                if (mr.finalType === 'GF') {
                  premierClubId = winnerId
                  runnerUpClubId = loserId
                }
              }
            }

            // Performance grant recipients (most-improved clubs by ladder position)
            const lastSeasonPositions: Record<string, number> = {}
            for (const archive of (s.history.seasonArchives ?? [])) {
              if (archive.year === s.currentYear - 1) {
                archive.ladder.forEach((entry, idx) => {
                  lastSeasonPositions[entry.clubId] = idx + 1
                })
              }
            }
            const currentLadderForGrant = s.ladder.map((e, i) => ({ clubId: e.clubId, position: i + 1 }))
            const distConfig = s.settings.aflDistributions ?? DEFAULT_DISTRIBUTION_CONFIG
            const performanceGrantRecipients = computePerformanceGrantRecipients(
              distConfig,
              currentLadderForGrant,
              lastSeasonPositions,
            )
            for (const club of Object.values(s.clubs)) {
              const ladderIdx = s.ladder.findIndex((e) => e.clubId === club.id)
              const ladderPos = ladderIdx >= 0 ? ladderIdx + 1 : 18
              const isTop4 = ladderPos <= 4

              const result = processSeasonEndFinances(
                club,
                allPlayers,
                allStaff,
                ladderPos,
                isTop4,
                financeRng,
                s.settings.salaryCapAmount,
                s.settings.realism.softCapSpending,
                awayGamesByClub[club.id] ?? 11,
                injuryWeeksByClub[club.id] ?? 0,
                club.finances.matchDayAccumulated,
                club.finances.broadcastAccumulated,
                club.finances.finalsRevenueAccumulated,
                club.finances.specialEventsAccumulated,
                s.inflationIndex ?? 1.0,
                totalTeams,
                finalsWinsByClub[club.id] ?? 0,
                club.id === premierClubId,
                club.id === runnerUpClubId,
                performanceGrantRecipients.has(club.id),
                distConfig,
              )

              // Update club finances
              club.finances.seasonRevenue = result.revenue
              club.finances.seasonExpenses = result.expenses
              club.finances.seasonPnL = result.pnl
              if (result.distributionBreakdown) {
                club.finances.distributionBreakdown = result.distributionBreakdown
              }
              club.finances.balance = result.newBalance
              club.finances.revenue = result.revenue.total
              club.finances.expenses = result.expenses.total

              // Process annual loan repayments (principal + interest deducted from balance)
              if (club.finances.loans && club.finances.loans.length > 0) {
                const loanOutflow = processLoanRepayments(club.finances.loans, s.currentYear)
                if (loanOutflow > 0) {
                  club.finances.balance -= loanOutflow
                  club.finances.seasonPnL = (club.finances.seasonPnL ?? 0) - loanOutflow
                }
              }

              // Sync currentSpend from cap engine if salary cap is enabled
              if (s.settings.salaryCap) {
                const capFinancials = calculateSeasonEndFinancials(
                  allPlayers,
                  club.id,
                  s.settings.salaryCapAmount,
                  s.settings.realism.softCapSpending,
                )
                club.finances.currentSpend = capFinancials.totalSpend

                if (capFinancials.isOverCap && !s.settings.realism.softCapSpending) {
                  appendNewsItem(s, {
                    id: crypto.randomUUID(),
                    date: `${s.currentYear}-10-01`,
                    headline: `${club.name} over salary cap`,
                    body: `${club.fullName} finished the ${s.currentYear} season over the salary cap with a total player spend of $${capFinancials.totalSpend.toLocaleString()} against a cap of $${s.settings.salaryCapAmount.toLocaleString()}.`,
                    category: 'general',
                    clubIds: [club.id],
                    playerIds: [],
                  })
                }
              }

              // Luxury tax news (already deducted via pnl)
              if (result.luxuryTax > 0) {
                appendNewsItem(s, {
                  id: crypto.randomUUID(),
                  date: `${s.currentYear}-10-01`,
                  headline: `${club.name} hit with $${result.luxuryTax.toLocaleString()} luxury tax`,
                  body: `${club.fullName} have been penalised $${result.luxuryTax.toLocaleString()} in luxury tax for exceeding the salary cap during the ${s.currentYear} season.`,
                  category: 'general',
                  clubIds: [club.id],
                  playerIds: [],
                })
              }

              // Financial report news for user's club
              if (club.id === s.playerClubId) {
                const pnlStr = result.pnl >= 0
                  ? `profit of ${result.pnl.toLocaleString()}`
                  : `loss of ${Math.abs(result.pnl).toLocaleString()}`
                appendNewsItem(s, {
                  id: crypto.randomUUID(),
                  date: `${s.currentYear}-10-01`,
                  headline: `${club.name} end-of-season financial report`,
                  body: `${club.fullName} recorded a ${pnlStr} for the ${s.currentYear} season. ` +
                    `Revenue: ${result.revenue.total.toLocaleString()} | Expenses: ${result.expenses.total.toLocaleString()}. ` +
                    `Club balance now stands at ${result.newBalance.toLocaleString()}.`,
                  category: 'general',
                  clubIds: [club.id],
                  playerIds: [],
                })
              }

              // Archive financial season record
              const finRecord: FinancialSeasonRecord = {
                year: s.currentYear,
                clubId: club.id,
                revenue: result.revenue,
                expenses: result.expenses,
                luxuryTax: result.luxuryTax,
                pnl: result.pnl,
                closingBalance: result.newBalance,
                membershipMembers: club.finances.membershipData?.totalMembers ?? 0,
                sponsorshipCount: club.sponsorshipDeals?.length ?? 0,
              }
              if (!s.history.financialHistory) s.history.financialHistory = []
              s.history.financialHistory.push(finRecord)

              // Renew/expire sponsorship deals + update satisfaction
              if (club.sponsorshipDeals && club.sponsorshipDeals.length > 0) {
                const ladderIdx = s.ladder.findIndex((e) => e.clubId === club.id)
                const finalLadderPos = ladderIdx >= 0 ? ladderIdx + 1 : 9
                const updatedDeals = processYearlyRenewal(club.sponsorshipDeals)
                club.sponsorshipDeals = updateSponsorSatisfaction(
                  updatedDeals,
                  finalLadderPos,
                  club.fanSatisfaction ?? 60,
                )
              }

              // Process season-end membership growth/churn
              if (club.finances.membershipState) {
                const ladderIdx = s.ladder.findIndex((e) => e.clubId === club.id)
                const ladderPos = ladderIdx >= 0 ? ladderIdx + 1 : 9
                const starCount = getPlayerStarRatingCountForClub(s.players, club.id)
                club.finances.membershipState = processSeasonEndMembership(
                  club.finances.membershipState,
                  s.currentYear,
                  ladderPos,
                  starCount,
                )
              }
            }

            // Generate sponsorship offers for player's club in offseason
            const playerClub = s.clubs[s.playerClubId]
            if (playerClub) {
              const offerRng = new SeededRNG(s.rngSeed + s.currentYear * 97)
              s.sponsorshipOffers = generateSponsorshipOffers(
                playerClub,
                playerClub.sponsorshipDeals ?? [],
                s.currentYear,
                offerRng,
              )
            }
          }

          // Initialize offseason calendar
          const offseasonStartDate = `${getYear(s.currentDate)}-10-01`
          offseason.calendarState = initOffseasonCalendar(offseasonStartDate)

          s.phase = 'offseason'
          s.offseasonState = offseason
        })
        updateSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Offseason initialized.')

        // Evaluate league evolution for next season (expansion / contraction / relocation)
        const postSeasonState = get()
        if (postSeasonState.settings.realism.aflHouseExpansionEvolution) {
          const evolutionRng = new SeededRNG(postSeasonState.rngSeed + postSeasonState.currentYear * 98341)
          const history = postSeasonState.leagueEvolutionHistory ?? { events: [] }
          const events = evaluateLeagueEvolution(
            postSeasonState.clubs,
            postSeasonState.ladder,
            postSeasonState.players,
            history,
            postSeasonState.currentYear,
            postSeasonState.playerClubId,
            evolutionRng,
            postSeasonState.settings,
          )
          if (events.length > 0) {
            set((s) => {
              if (!s.offseasonState) return
              s.offseasonState.pendingLeagueEvolution = events
              for (const ev of events) {
                const headline =
                  ev.type === 'expansion'
                    ? `AFL announces expansion: ${(ev as LeagueExpansionEvent).newClubFullName} join from ${ev.appliedYear}`
                    : ev.type === 'contraction'
                    ? `AFL folds ${(ev as LeagueContractionEvent).clubFullName}`
                    : `AFL approves ${(ev as LeagueRelocationEvent).oldName} relocation to ${(ev as LeagueRelocationEvent).newCity}`
                const affectedClubId =
                  ev.type === 'expansion'
                    ? null
                    : ev.type === 'contraction'
                    ? (ev as LeagueContractionEvent).clubId
                    : (ev as LeagueRelocationEvent).clubId
                appendNewsItem(s, {
                  id: crypto.randomUUID(),
                  date: s.currentDate,
                  headline,
                  body: ev.description,
                  category: 'general',
                  clubIds: affectedClubId ? [affectedClubId] : [],
                  playerIds: [],
                })
              }
            })
          }
        }

        } finally {
          finishSimulationStatus(set as (fn: (state: GameState) => void) => void)
        }
      },

      advanceOffseasonPhase: () => {
        const state = get()
        if (state.simulation.active) return { success: false, error: 'Simulation already in progress' }
        if (!state.offseasonState) return { success: false, error: 'No offseason in progress' }

        const progressionError = getOffseasonProgressionError(state)
        if (progressionError) {
          return { success: false, error: progressionError }
        }

        const leavingPhase = state.offseasonState.currentPhase
        startSimulationStatus(
          set as (fn: (state: GameState) => void) => void,
          'Advancing Offseason Phase',
          `Resolving ${leavingPhase.replace('-', ' ')}...`,
        )
        appendSimulationLog(set as (fn: (state: GameState) => void) => void, `Leaving phase: ${leavingPhase}.`)
        try {
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
              pushSigningNotification(s, n)
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
                pushSigningNotification(s, n)
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
                pushSigningNotification(s, n)
              }

              // Sync currentSpend for all clubs
              const allPlayers = Object.values(s.players)
              for (const club of Object.values(s.clubs)) {
                club.finances.currentSpend = syncClubCurrentSpend(allPlayers, club.id)
              }
            })
          }
        } else if (leavingPhase === 'supplemental-signing') {
          // Apply any pending league evolution events before preseason begins
          const freshState = get()
          const pending = freshState.offseasonState?.pendingLeagueEvolution ?? []
          if (pending.length > 0) {
            for (const event of pending) {
              if (event.type === 'contraction') {
                const ce = event as LeagueContractionEvent
                set((s) => {
                  // Disperse players — set clubId to '' so they enter the unsigned pool
                  const dispersed = applyContraction(s.players, ce.clubId)
                  // Remove club from the clubs map
                  delete s.clubs[ce.clubId]
                  // Remove from current-season ladder (new season will regenerate it)
                  s.ladder = s.ladder.filter((e) => e.clubId !== ce.clubId)
                  // Record in history
                  if (!s.leagueEvolutionHistory) s.leagueEvolutionHistory = { events: [] }
                  s.leagueEvolutionHistory.events.push({ ...ce, dispersedPlayerCount: dispersed.length })
                  appendNewsItem(s, {
                    id: crypto.randomUUID(),
                    date: s.currentDate,
                    headline: `${ce.clubFullName} officially wound up — ${dispersed.length} players enter the pool`,
                    body:
                      `The ${ce.clubFullName} have been formally folded. All ${dispersed.length} listed players ` +
                      `are now available for rival clubs to sign. The club will not compete in the ${ce.appliedYear} season.`,
                    category: 'general',
                    clubIds: [],
                    playerIds: [],
                  })
                })
              } else if (event.type === 'expansion') {
                const ee = event as LeagueExpansionEvent
                const newClub = buildExpansionClub(ee.newClubId, freshState.currentYear)
                if (newClub) {
                  const newPlayers = generatePlayers(
                    ee.newClubId,
                    freshState.rngSeed + freshState.currentYear * 13337,
                    {
                      salaryCapAmount: freshState.settings.salaryCapAmount,
                      enforceCapCompliance: true,
                    },
                  )
                  set((s) => {
                    s.clubs[newClub.id] = newClub
                    for (const p of newPlayers) {
                      s.players[p.id] = p
                    }
                    if (!s.leagueEvolutionHistory) s.leagueEvolutionHistory = { events: [] }
                    s.leagueEvolutionHistory.events.push(ee)
                    appendNewsItem(s, {
                      id: crypto.randomUUID(),
                      date: s.currentDate,
                      headline: `${ee.newClubFullName} set for debut in ${ee.appliedYear}`,
                      body:
                        `The ${ee.newClubFullName} have assembled their inaugural squad of ${newPlayers.length} players ` +
                        `and will take the field from Round 1 of the ${ee.appliedYear} season.`,
                      category: 'general',
                      clubIds: [newClub.id],
                      playerIds: [],
                    })
                  })
                }
              } else if (event.type === 'relocation') {
                const re = event as LeagueRelocationEvent
                set((s) => {
                  const club = s.clubs[re.clubId]
                  if (club) {
                    applyRelocation(club, re)
                  }
                  if (!s.leagueEvolutionHistory) s.leagueEvolutionHistory = { events: [] }
                  s.leagueEvolutionHistory.events.push(re)
                  appendNewsItem(s, {
                    id: crypto.randomUUID(),
                    date: s.currentDate,
                    headline: `${re.oldName} complete relocation to ${re.newCity}`,
                    body:
                      `The club officially rebrands as the ${re.newFullName}, playing out of ` +
                      `${re.newHomeGround} from ${re.appliedYear}.`,
                    category: 'general',
                    clubIds: [re.clubId],
                    playerIds: [],
                  })
                })
              } else if (event.type === 'merger') {
                const me = event as LeagueMergerEvent
                set((s) => {
                  const dispersed = applyMerger(s.players, me)
                  // Remove the dissolved club entirely
                  delete s.clubs[me.dissolvedClubId]
                  s.ladder = s.ladder.filter((e) => e.clubId !== me.dissolvedClubId)
                  // If the player was managing the dissolved club, transfer them to the surviving club
                  if (s.playerClubId === me.dissolvedClubId) {
                    s.playerClubId = me.survivingClubId
                  }
                  if (!s.leagueEvolutionHistory) s.leagueEvolutionHistory = { events: [] }
                  s.leagueEvolutionHistory.events.push({ ...me, dispersedPlayerCount: dispersed.length })
                  appendNewsItem(s, {
                    id: crypto.randomUUID(),
                    date: s.currentDate,
                    headline: `${me.club1FullName} and ${me.club2FullName} officially merge`,
                    body:
                      `The AFL-brokered merger is complete. The ${me.survivingClubFullName} absorb ` +
                      `${me.absorbedPlayerCount} players from the dissolved ${me.dissolvedClubId === me.club1Id ? me.club1FullName : me.club2FullName}. ` +
                      `${dispersed.length} players enter the unsigned pool ahead of the ${me.appliedYear} season.`,
                    category: 'general',
                    clubIds: [me.survivingClubId],
                    playerIds: [],
                  })
                })
              }
            }
            // Clear pending events now that they have been applied
            set((s) => {
              if (s.offseasonState) {
                s.offseasonState.pendingLeagueEvolution = []
              }
            })
          }
        } else if (leavingPhase === 'preseason') {
          const freshState = get()
          const { players: updatedPlayers, newsItems: injuryNewsItems } = processPreseason(
            freshState.players,
            freshState.staff,
            freshState.clubs,
            rng,
            freshState.currentYear,
          )
          set((s) => {
            for (const [id, p] of Object.entries(updatedPlayers)) {
              s.players[id] = p
            }
            for (const item of injuryNewsItems) {
              appendNewsItem(s, item)
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

        // Advance to next phase and move calendar to that phase start date.
        // Offseason progression is calendar-driven: phase/date must stay in sync.
        set((s) => {
          if (!s.offseasonState) return
          const advanced = advanceOffseasonPhaseEngine(s.offseasonState)
          const cal = advanced.calendarState
          if (!cal) {
            s.offseasonState = advanced
            return
          }

          const targetPhase = advanced.currentPhase
          const phaseOffset = OFFSEASON_PHASE_START_OFFSETS[targetPhase] ?? 0
          const targetDate = addDays(cal.startDate, phaseOffset)
          const { phase: syncedPhase, completedPhases: syncedCompleted } = computePhaseForDate(cal.startDate, targetDate)

          s.offseasonState = {
            ...advanced,
            currentPhase: syncedPhase,
            completedPhases: syncedCompleted,
            calendarState: {
              ...cal,
              currentDate: targetDate,
              halfDay: 'AM',
            },
          }
          s.currentDate = targetDate
        })

        // Auto-skip venue-allocation if venue scheduling is disabled
        const nextState = get()
        if (
          nextState.offseasonState?.currentPhase === 'venue-allocation' &&
          !nextState.settings.realism.venueScheduling
        ) {
          set((s) => {
            if (!s.offseasonState) return
            const advanced = advanceOffseasonPhaseEngine(s.offseasonState)
            const cal = advanced.calendarState
            if (!cal) {
              s.offseasonState = advanced
              return
            }
            const targetPhase = advanced.currentPhase
            const phaseOffset = OFFSEASON_PHASE_START_OFFSETS[targetPhase] ?? 0
            const targetDate = addDays(cal.startDate, phaseOffset)
            const { phase: syncedPhase, completedPhases: syncedCompleted } = computePhaseForDate(cal.startDate, targetDate)

            s.offseasonState = {
              ...advanced,
              currentPhase: syncedPhase,
              completedPhases: syncedCompleted,
              calendarState: {
                ...cal,
                currentDate: targetDate,
                halfDay: 'AM',
              },
            }
            s.currentDate = targetDate
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

              appendNewsItem(s, {
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

        updateSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Phase advanced successfully.')
        return { success: true, error: null }
        } finally {
          finishSimulationStatus(set as (fn: (state: GameState) => void) => void)
        }
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

      // ---- Practice Matches ----

      schedulePracticeMatch: (type: 'friendly' | 'intra-squad', opponentClubId?: string) => {
        const state = get()
        if (state.offseasonState?.currentPhase !== 'practice-matches') return
        const pmState = state.offseasonState.practiceMatchState
        if (!pmState) return
        const totalCount = pmState.scheduled.length + pmState.results.length
        if (totalCount >= 5) return
        const friendlyCount =
          pmState.scheduled.filter((x) => x.type === 'friendly').length +
          pmState.results.filter((x) => x.type === 'friendly').length
        const intraCount =
          pmState.scheduled.filter((x) => x.type === 'intra-squad').length +
          pmState.results.filter((x) => x.type === 'intra-squad').length
        if (type === 'friendly' && friendlyCount >= 3) return
        if (type === 'intra-squad' && intraCount >= 2) return

        const seed = state.rngSeed + state.currentYear * 97 + totalCount
        const rng = new SeededRNG(seed)
        const fixture = buildPracticeMatchFixture(
          type,
          state.playerClubId,
          state.clubs,
          rng,
          totalCount,
          opponentClubId,
        )
        set((s) => {
          if (!s.offseasonState?.practiceMatchState) return
          s.offseasonState.practiceMatchState.scheduled.push(fixture)
        })
      },

      simulatePracticeMatchAction: (fixtureId: string) => {
        const state = get()
        const pmState = state.offseasonState?.practiceMatchState
        if (!pmState) return
        const fixture = pmState.scheduled.find((f) => f.id === fixtureId)
        if (!fixture) return

        const seed = state.rngSeed + state.currentYear * 1337 + pmState.results.length * 113
        const rng = new SeededRNG(seed)

        // Clone players for mutation
        const playersCopy: Record<string, import('@/types/player').Player> = {}
        for (const [id, p] of Object.entries(state.players)) {
          playersCopy[id] = {
            ...p,
            attributes: { ...p.attributes },
            injury: p.injury ? { ...p.injury } : null,
            injuryHistory: [...(p.injuryHistory ?? [])],
          }
        }

        const result = simulatePracticeMatch(fixture, playersCopy, state.clubs, rng)
        applyPracticeMatchEffects(result, playersCopy, state.playerClubId)

        set((s) => {
          if (!s.offseasonState?.practiceMatchState) return
          // Move fixture from scheduled to results
          s.offseasonState.practiceMatchState.scheduled = s.offseasonState.practiceMatchState.scheduled.filter(
            (f) => f.id !== fixtureId,
          )
          s.offseasonState.practiceMatchState.results.push(result)
          // Write back mutated players
          for (const [id, p] of Object.entries(playersCopy)) {
            if (s.players[id]) {
              s.players[id].form = p.form
              s.players[id].fatigue = p.fatigue
              s.players[id].injury = p.injury
              s.players[id].injuryHistory = p.injuryHistory
              s.players[id].fitness = p.fitness
              s.players[id].morale = p.morale
            }
          }
          // News for injuries
          if (result.injuredPlayerIds.length > 0) {
            for (const playerId of result.injuredPlayerIds) {
              const player = s.players[playerId]
              if (!player) continue
              const fullName = `${player.firstName} ${player.lastName}`
              const weeks = player.injury?.weeksRemaining ?? 1
              appendNewsItem(s, {
                id: `pm-injury-${fixtureId}-${playerId}`,
                date: s.currentDate,
                headline: `Practice match injury: ${fullName} (${weeks} wks)`,
                body: `${fullName} suffered ${player.injury?.type ?? 'an injury'} during a practice match and is expected to miss ${weeks} week${weeks === 1 ? '' : 's'}.`,
                category: 'injury',
                clubIds: [player.clubId],
                playerIds: [playerId],
              })
            }
          }
        })
      },

      delegatePracticeMatchesToAssistant: () => {
        const state = get()
        const pmState = state.offseasonState?.practiceMatchState
        if (!pmState) return

        const scheduled = [...pmState.scheduled]
        const results: PracticeMatchResult[] = []
        const playersCopy: Record<string, import('@/types/player').Player> = {}
        for (const [id, p] of Object.entries(state.players)) {
          playersCopy[id] = {
            ...p,
            attributes: { ...p.attributes },
            injury: p.injury ? { ...p.injury } : null,
            injuryHistory: [...(p.injuryHistory ?? [])],
          }
        }

        let resultOffset = pmState.results.length
        for (const fixture of scheduled) {
          const seed = state.rngSeed + state.currentYear * 1337 + resultOffset * 113
          const rng = new SeededRNG(seed)
          const result = simulatePracticeMatch(fixture, playersCopy, state.clubs, rng)
          applyPracticeMatchEffects(result, playersCopy, state.playerClubId)
          results.push(result)
          resultOffset++
        }

        set((s) => {
          if (!s.offseasonState?.practiceMatchState) return
          s.offseasonState.practiceMatchState.delegated = true
          s.offseasonState.practiceMatchState.scheduled = []
          s.offseasonState.practiceMatchState.results = [
            ...s.offseasonState.practiceMatchState.results,
            ...results,
          ]
          // Write back mutated players
          for (const [id, p] of Object.entries(playersCopy)) {
            if (s.players[id]) {
              s.players[id].form = p.form
              s.players[id].fatigue = p.fatigue
              s.players[id].injury = p.injury
              s.players[id].injuryHistory = p.injuryHistory
              s.players[id].fitness = p.fitness
              s.players[id].morale = p.morale
            }
          }
          // News for injuries
          for (const result of results) {
            for (const playerId of result.injuredPlayerIds) {
              const player = s.players[playerId]
              if (!player) continue
              const fullName = `${player.firstName} ${player.lastName}`
              const weeks = player.injury?.weeksRemaining ?? 1
              appendNewsItem(s, {
                id: `pm-injury-${result.fixtureId}-${playerId}`,
                date: s.currentDate,
                headline: `Practice match injury: ${fullName} (${weeks} wks)`,
                body: `${fullName} suffered ${player.injury?.type ?? 'an injury'} during a practice match and is expected to miss ${weeks} week${weeks === 1 ? '' : 's'}.`,
                category: 'injury',
                clubIds: [player.clubId],
                playerIds: [playerId],
              })
            }
          }
        })
      },

      cancelPracticeMatchFixture: (fixtureId: string) => {
        set((s) => {
          if (!s.offseasonState?.practiceMatchState) return
          s.offseasonState.practiceMatchState.scheduled = s.offseasonState.practiceMatchState.scheduled.filter(
            (f) => f.id !== fixtureId,
          )
        })
      },

      // ---- Offseason Sim Controls ----

      simOffseasonHalfDay: () => {
        const state = get()
        if (state.simulation.active) return { success: false, error: 'Simulation already in progress' }
        if (!state.offseasonState?.calendarState) return { success: false, error: 'No offseason calendar in progress' }
        const progressionError = getOffseasonProgressionError(state)
        if (progressionError) return { success: false, error: progressionError }
        startSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Offseason Simulation', 'Simulating 12 hours...')
        appendSimulationLog(set as (fn: (state: GameState) => void) => void, `Advancing offseason calendar from ${state.offseasonState.calendarState.currentDate}.`)
        try {

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
            state.ladder,
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
          const phaseSync = computePhaseForDate(s.offseasonState.calendarState.startDate, nextDate)
          s.offseasonState.calendarState = nextCal
          s.offseasonState.currentPhase = phaseSync.phase
          s.offseasonState.completedPhases = phaseSync.completedPhases
          s.currentDate = nextDate
          s.players = nextPlayers
          s.tradeBlock = nextTradeBlock
          s.tradeInbox = [...expired, ...generatedInbox]
          if (s.draft && nextDraftProspects) {
            s.draft.prospects = nextDraftProspects
          }
          for (const news of generatedNews) {
            appendNewsItem(s, news)
          }

          // Tick facility construction (half-day = 0.5 days)
          if (s.facilityUpgrades) {
            const { updatedTracker, completedUpgrades } = tickFacilityUpgrades(s.facilityUpgrades, 0.5, s.currentDate)
            s.facilityUpgrades = updatedTracker
            for (const completed of completedUpgrades) {
              const club = s.clubs[completed.clubId]
              if (club) club.facilities[completed.facility] = completed.toLevel
              const facilityLabel = completed.facility.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
              appendNewsItem(s, {
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `${club?.name ?? completed.clubId} completes ${facilityLabel} upgrade`,
                body: `The ${facilityLabel} has been upgraded to Level ${completed.toLevel}. The new facilities are now operational.`,
                category: 'general',
                clubIds: [completed.clubId],
                playerIds: [],
              })
            }
          }
        })
        updateSimulationStatus(set as (fn: (state: GameState) => void) => void, `Simulation reached ${nextDate}.`)
        return { success: true }
        } finally {
          finishSimulationStatus(set as (fn: (state: GameState) => void) => void)
        }
      },

      simOffseasonFullDay: () => {
        const state = get()
        if (state.simulation.active) return { success: false, error: 'Simulation already in progress' }
        const first = get().simOffseasonHalfDay()
        if (!first.success) return first
        const second = get().simOffseasonHalfDay()
        if (!second.success) return second
        return { success: true }
      },

      simOffseasonToMilestone: () => {
        const state = get()
        if (state.simulation.active) return { success: false, error: 'Simulation already in progress' }
        if (!state.offseasonState?.calendarState) return { success: false, error: 'No offseason calendar in progress' }
        const progressionError = getOffseasonProgressionError(state)
        if (progressionError) return { success: false, error: progressionError }
        startSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Offseason Simulation', 'Advancing to next milestone...')
        try {
        const nextCal = advanceToNextMilestoneEngine(state.offseasonState.calendarState)
        const nextDate = nextCal.currentDate
        const expired = expireTradeInboxItems(state.tradeInbox, nextDate)
        set((s) => {
          if (!s.offseasonState?.calendarState) return
          const phaseSync = computePhaseForDate(s.offseasonState.calendarState.startDate, nextDate)
          s.offseasonState.calendarState = nextCal
          s.offseasonState.currentPhase = phaseSync.phase
          s.offseasonState.completedPhases = phaseSync.completedPhases
          s.currentDate = nextDate
          s.tradeInbox = expired
        })
        updateSimulationStatus(set as (fn: (state: GameState) => void) => void, `Reached milestone on ${nextDate}.`)
        return { success: true }
        } finally {
          finishSimulationStatus(set as (fn: (state: GameState) => void) => void)
        }
      },

      applyForCoachingJob: (jobId: string) => {
        const state = get()
        const opening = state.coachingJobMarket.find((job) => job.id === jobId && job.status === 'open')
        if (!opening) return { success: false, error: 'Job opening not found' }
        if (state.manager.employmentStatus !== 'unemployed' || state.playerClubId) {
          return { success: false, error: 'You are already employed' }
        }

        const club = state.clubs[opening.clubId]
        if (!club) return { success: false, error: 'Club not found' }

        const politicsBias =
          state.settings.realism.boardPolitics
            ? (opening.urgency === 'high' ? 0.08 : opening.urgency === 'low' ? -0.04 : 0)
            : 0
        const acceptanceChance = Math.max(
          0.25,
          Math.min(0.9, 0.45 + state.manager.reputation / 200 + politicsBias),
        )
        const rng = new SeededRNG(state.rngSeed + state.currentYear * 179 + jobId.length * 31)
        const accepted = rng.chance(acceptanceChance)

        set((s) => {
          const idx = s.coachingJobMarket.findIndex((job) => job.id === jobId)
          if (idx < 0) return
          const liveJob = s.coachingJobMarket[idx]
          if (liveJob.status !== 'open') return

          if (!accepted) {
            s.coachingJobMarket[idx] = {
              ...liveJob,
              status: 'withdrawn',
            }
            appendNewsItem(s, {
              id: crypto.randomUUID(),
              date: s.currentDate,
              headline: `${club.name} conclude coaching search`,
              body: `${club.fullName} interviewed ${s.manager.name} but appointed another candidate.`,
              category: 'general',
              clubIds: [club.id],
              playerIds: [],
            })
            if (s.coachingJobMarket.filter((job) => job.status === 'open').length === 0) {
              s.coachingJobMarket.push(
                ...seedInitialCoachingOpenings(
                  s.clubs,
                  new SeededRNG(s.rngSeed + s.currentYear * 97 + s.coachingJobMarket.length),
                  s.currentDate,
                ),
              )
            }
            return
          }

          s.playerClubId = club.id
          s.manager = {
            ...s.manager,
            employmentStatus: 'employed',
            currentClubId: club.id,
            jobSecurity: 68,
            seasonExpectation: 'Meet board expectations and stabilise results.',
            unemployedSinceYear: null,
          }

          s.coachingJobMarket = s.coachingJobMarket.map((job) =>
            job.id === jobId ? { ...job, status: 'filled' } : job,
          )

          appendNewsItem(s, {
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${club.name} appoint ${s.manager.name} as senior coach`,
            body: `${s.manager.name} has accepted the senior coaching role at ${club.fullName}.`,
            category: 'general',
            clubIds: [club.id],
            playerIds: [],
          })
          enforceSingleClubCareerInvariant(s)
        })

        return { success: accepted, error: accepted ? undefined : 'Application unsuccessful' }
      },

      resignFromCurrentClub: () => {
        const state = get()
        if (state.manager.employmentStatus !== 'employed' || !state.playerClubId) {
          return { success: false, error: 'No active club to resign from.' }
        }

        set((s) => {
          const resignedClubId = s.playerClubId
          const resignedClub = s.clubs[resignedClubId]
          s.playerClubId = ''
          s.manager.employmentStatus = 'unemployed'
          s.manager.currentClubId = null
          s.manager.unemployedSinceYear = s.currentYear
          s.manager.jobSecurity = 0

          s.coachingJobMarket.push(
            buildCoachingOpening({
              clubId: resignedClubId,
              reason: 'The senior coach resigned. Club leadership has opened the role.',
              postedDate: s.currentDate,
              urgency: 'high',
            }),
          )
          appendNewsItem(s, {
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${s.manager.name} resigns from ${resignedClub?.name ?? 'their club'}`,
            body: `${s.manager.name} has stepped down and is now available for other senior coaching roles.`,
            category: 'general',
            clubIds: resignedClub ? [resignedClub.id] : [],
            playerIds: [],
          })
          enforceSingleClubCareerInvariant(s)
        })

        return { success: true }
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
          trackSigningInteraction(s, playerId)
          normalizeClubJumperNumbers(s, s.playerClubId)

          // Sync currentSpend
          const allPlayers = Object.values(s.players)
          const club = s.clubs[s.playerClubId]
          if (club) {
            club.finances.currentSpend = syncClubCurrentSpend(allPlayers, s.playerClubId)
          }

          // Add signing news
          pushSigningNotification(s, {
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
        if (state.simulation.active) return { success: false, error: 'Simulation already in progress' }
        if (!state.offseasonState) return { success: false, error: 'No offseason in progress' }
        if (state.offseasonState.currentPhase !== 'ready') {
          return { success: false, error: 'You can only continue once offseason is in the Ready phase' }
        }
        startSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Season Generation', 'Generating fixture and season setup...')
        appendSimulationLog(set as (fn: (state: GameState) => void) => void, `Generating fixtures for ${state.currentYear + 1}.`)
        try {
          const promotion = applyPromotionRelegation({
            multiTierState: state.multiTierState,
            leagueConfig: state.leagueConfig,
            clubs: state.clubs,
            currentYear: state.currentYear,
            currentDate: state.currentDate,
          })
          const evolution = runAflHouseEndOfYearEvolution({
            currentYear: state.currentYear,
            currentDate: state.currentDate,
            rngSeed: state.rngSeed,
            settings: state.settings,
            leagueConfig: promotion.leagueConfig,
            clubs: state.clubs,
            players: state.players,
            stateLeagues: state.stateLeagues,
          })
          const { season, ladder, newYear } = startNewSeason(
            evolution.clubs,
            state.currentYear,
            state.rngSeed,
            state.playerClubId,
            evolution.settings,
          )
          const rolledStateLeagues = rollStateLeaguesForNewSeason(evolution.stateLeagues, newYear)

          set((s) => {
            const previousStateLeagueContractDelegation = s.reserves.stateLeagueContractDelegationEnabled
            const previousStateLeagueContractTargetCount = s.reserves.stateLeagueContractTargetCount
            const pruned = pruneExpiredDraftPicks(evolution.clubs, s.currentYear + 1)
            const ledgered = ensureDraftPickLedger(pruned, s.currentYear + 1, 2)
            s.currentYear = newYear
            s.season = season
            s.ladder = ladder
            s.currentRound = 0
            s.currentDate = s.settings.seasonStartDate
            s.phase = 'regular-season'
            s.offseasonState = null
            s.negotiations = null
            s.matchResults = []
            s.powerRankings = []
            s.brownlowTracker = []
            s.bfTracker = []
            s.brownlowRevealed = false
            s.awardsNightCompleted = false
            s.selectedLineup = null
            s.selectedSubstituteId = null
            s.reserves = {
              seasonStatsByPlayer: {},
              lastRoundPerformances: [],
              promotionWatchlist: [],
              delegationEnabled: true,
              managedLineupPlayerIds: [],
              managedLineupSlotAssignments: {},
              playerAvailabilityAssignments: {},
              lastSelectedLineupPlayerIds: [],
              leadership: {
                captainId: null,
                viceCaptainId: null,
                leadershipGroupIds: [],
              },
              tactics: {
                tempo: 'balanced',
                aggression: 'balanced',
                youthFocus: true,
              },
              stateLeagueContractDelegationEnabled: previousStateLeagueContractDelegation,
              stateLeagueContractTargetCount: previousStateLeagueContractTargetCount,
            }
            s.clubs = ledgered
            // Reset season finance tracking for all clubs
            for (const club of Object.values(s.clubs)) {
              club.finances.matchDayAccumulated = 0
              club.finances.broadcastAccumulated = 0
              club.finances.finalsRevenueAccumulated = 0
              club.finances.specialEventsAccumulated = 0
              club.finances.momentumModifier = 0
              club.finances.seasonRevenue = undefined
              club.finances.seasonExpenses = undefined
              club.finances.seasonPnL = undefined
            }
            // Advance inflation index for the new season
            {
              const inflSettings = s.settings.inflation ?? DEFAULT_INFLATION_SETTINGS
              const { newIndex, actualRate } = advanceInflationIndex(
                s.inflationIndex ?? 1.0,
                inflSettings,
                s.rngSeed + newYear,
              )
              s.inflationIndex = newIndex
              s.inflationHistory = [...(s.inflationHistory ?? []), { year: newYear, index: newIndex, rate: actualRate }]
            }
            s.players = evolution.players
            processStateLeagueContractsForNewSeason(s)
            normalizeAllClubJumperNumbers(s)
            s.settings = evolution.settings
            s.leagueConfig = {
              ...evolution.leagueConfig,
              activeClubIds: [...evolution.leagueConfig.activeClubIds],
              totalTeams: evolution.leagueConfig.activeClubIds.length,
            }
            s.stateLeagues = rolledStateLeagues
            s.jumperManagement = {
              pending: true,
              seasonYear: newYear,
              lastCompletedYear: s.jumperManagement.lastCompletedYear,
            }
            for (const item of evolution.news) {
              appendNewsItem(s, item)
            }
            for (const item of promotion.news) {
              appendNewsItem(s, item)
            }
            s.calendar = buildSeasonCalendar(
              newYear,
              season,
              s.playerClubId,
              s.settings.finals,
              s.settings.seasonStartDate,
            )
          })

          const refreshed = get()
          const initialPowerSnapshot = computeWeeklyPowerRankings({
            year: refreshed.currentYear,
            round: 0,
            date: refreshed.currentDate,
            clubs: refreshed.clubs,
            players: refreshed.players,
            ladder: refreshed.ladder,
            season: refreshed.season,
            matchResults: refreshed.matchResults,
            previousSnapshot: null,
          })
          set((s) => {
            s.powerRankings = [initialPowerSnapshot]
            s.history.recordsBook = refreshRecordsBookLeaderboards({
              recordsBook: s.history.recordsBook,
              players: s.players,
              clubs: s.clubs,
              currentYear: s.currentYear,
              history: s.history,
            })
            s.multiTierState = initializeMultiTierState({
              clubs: s.clubs,
              leagueConfig: s.leagueConfig,
              settings: s.settings,
              seed: s.rngSeed + s.currentYear * 31,
            })
            // Reset season-specific instability (keep history and chairman support)
            if (s.boardInstability) {
              s.boardInstability = resetSeasonInstability(s.boardInstability)
            } else {
              s.boardInstability = createInitialBoardInstabilityState()
            }
            pushUpcomingMilestoneNews(s)
          })

          // Schedule special events for the new season
          get().scheduleSpecialEvents()

          updateSimulationStatus(set as (fn: (state: GameState) => void) => void, 'New season ready.')
          return { success: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to start new season'
          console.error('[startNewSeasonAction] failed:', error)
          return { success: false, error: message }
        } finally {
          finishSimulationStatus(set as (fn: (state: GameState) => void) => void)
        }
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
        const teamCount = Object.keys(state.clubs).length

        // Resolve agent relationship modifiers
        const agentId = player.agentId ?? assignAgentToPlayer(player)
        const agentRel = (state.agentRelationships ?? {})[agentId]
          ?? getDefaultRelationship(agentId)
        const agentMods = getRelationshipModifiers(agentRel)

        const result = startNegotiation(
          player, state.playerClubId, isReSigning, state.currentRound,
          state.currentDate, rng, ladderPos || 9,
          {
            playerLoyaltyEnabled: state.settings.realism.playerLoyalty,
            inflationIndex: state.inflationIndex ?? 1.0,
            agentDemandMultiplier: agentMods.demandMultiplier,
            agentRefusalChanceDelta: agentMods.refusalChanceDelta,
          },
          teamCount,
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

        // Cache agent modifiers on the negotiation object and apply mood bias
        result.negotiation.agentId = agentId
        result.negotiation.agentRelBonus = agentMods.acceptanceProbBonus
        result.negotiation.agentCooldownAdjust = agentMods.cooldownAdjust
        if (agentMods.moodBias !== 'none') {
          result.negotiation.playerMood = applyMoodBias(result.negotiation.playerMood, agentMods.moodBias)
        }

        set((s) => {
          // Ensure agentId is stored on the player
          if (s.players[playerId] && !s.players[playerId].agentId) {
            s.players[playerId].agentId = agentId
          }
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
        set((s) => {
          trackSigningInteraction(s, negotiation.playerId)
        })

        // Board approval check for high-value contracts
        if (needsBoardApproval({ category: 'contract', params: { aav: offer.aav } }, state.settings)) {
          const club = state.clubs[state.playerClubId]
          if (club) {
            const tracker = state.boardApprovals ?? { records: [], denialCooldowns: {} }

            if (isApprovalOnCooldown(tracker, 'contract', negotiation.playerId, state.currentDate)) {
              return { success: false, error: 'The board recently denied this contract. Please wait before trying again.' }
            }

            const ladderIdx = state.ladder.findIndex((e) => e.clubId === state.playerClubId)
            const ladderPosition = ladderIdx >= 0 ? ladderIdx + 1 : 18
            const player = state.players[negotiation.playerId]

            const approvalResult = computeBoardApproval({
              category: 'contract',
              club,
              jobSecurity: state.manager.jobSecurity,
              ladderPosition,
              settings: state.settings,
              contractParams: { aav: offer.aav },
            })

            const rng = new SeededRNG(state.rngSeed + negotiationId.length * 7919 + state.currentRound * 3571)
            const { updatedTracker, approved } = rollBoardApproval(
              tracker, approvalResult, rng, state.currentDate,
              `Contract offer for ${player?.firstName ?? ''} ${player?.lastName ?? ''} ($${offer.aav.toLocaleString()}/yr × ${offer.years}yr)`,
              state.playerClubId, negotiation.playerId,
            )

            set((s) => {
              s.boardApprovals = updatedTracker
            })

            if (!approved) {
              set((s) => {
                const p = s.players[negotiation.playerId]
                appendNewsItem(s, {
                  id: crypto.randomUUID(),
                  date: s.currentDate,
                  headline: `Board blocks contract offer for ${p?.firstName ?? ''} ${p?.lastName ?? ''}`,
                  body: `The board has denied the $${offer.aav.toLocaleString()}/yr contract offer for ${p?.firstName ?? ''} ${p?.lastName ?? ''}. They feel the investment is too risky.`,
                  category: 'contract',
                  clubIds: [s.playerClubId],
                  playerIds: [negotiation.playerId],
                })
              })
              return { success: false, error: 'The board has denied this contract offer.' }
            }
          }
        }

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

            // Move completed negotiations + record agent relationship events
            const signedIds = new Set(tickResult.signings.map((sg) => sg.playerId))
            for (const completedId of tickResult.completedIds) {
              const completedNeg = s.negotiations!.active[completedId]
              if (completedNeg) {
                // Record agent relationship outcome
                const agId = completedNeg.agentId
                if (agId) {
                  const isSigning = signedIds.has(completedNeg.playerId)
                  const events: import('@/types/agent').AgentEventType[] = isSigning
                    ? ['signed-accepted']
                    : (() => {
                      // Check if the last club offer was a low-ball
                      const lastRound = completedNeg.rounds[completedNeg.rounds.length - 1]
                      const clubOffer = lastRound?.offeredBy === 'club' ? lastRound.offer : null
                      const playerAav = completedNeg.playerDemand.aav
                      if (clubOffer && clubOffer.aav < playerAav * 0.85) return ['low-ball-rejection'] as import('@/types/agent').AgentEventType[]
                      return ['fair-rejection'] as import('@/types/agent').AgentEventType[]
                    })()
                  if (!s.agentRelationships) s.agentRelationships = {}
                  const existing = s.agentRelationships[agId] ?? getDefaultRelationship(agId)
                  s.agentRelationships[agId] = applyNegotiationOutcome(existing, events, s.currentDate, completedNeg.playerId)
                }

                const completed = completeNegotiation(completedNeg, s.currentDate)
                s.negotiations!.completed.push(completed)
                delete s.negotiations!.active[completedId]
              }
            }

            // Append news
            for (const n of tickResult.news) {
              pushSigningNotification(s, n)
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

          // Record agent relationship event
          if (neg.agentId) {
            const agentId = neg.agentId
            const existing = (s.agentRelationships ?? {})[agentId] ?? getDefaultRelationship(agentId)
            const updated = applyNegotiationOutcome(existing, ['club-withdrew'], s.currentDate, neg.playerId)
            if (!s.agentRelationships) s.agentRelationships = {}
            s.agentRelationships[agentId] = updated
          }
        })
      },

      acceptContractCounterOffer: (negotiationId: string) => {
        const state = get()
        if (!state.negotiations) return { success: false, error: 'No negotiations active' }

        const negotiation = state.negotiations.active[negotiationId]
        if (!negotiation) return { success: false, error: 'Negotiation not found' }

        // Board approval check for accepting counter-offer
        const counterAav = negotiation.playerDemand.aav
        if (needsBoardApproval({ category: 'contract', params: { aav: counterAav } }, state.settings)) {
          const club = state.clubs[state.playerClubId]
          if (club) {
            const tracker = state.boardApprovals ?? { records: [], denialCooldowns: {} }

            if (isApprovalOnCooldown(tracker, 'contract', negotiation.playerId, state.currentDate)) {
              return { success: false, error: 'The board recently denied this contract. Please wait before trying again.' }
            }

            const ladderIdx = state.ladder.findIndex((e) => e.clubId === state.playerClubId)
            const ladderPosition = ladderIdx >= 0 ? ladderIdx + 1 : 18
            const player = state.players[negotiation.playerId]

            const approvalResult = computeBoardApproval({
              category: 'contract',
              club,
              jobSecurity: state.manager.jobSecurity,
              ladderPosition,
              settings: state.settings,
              contractParams: { aav: counterAav },
            })

            const rng = new SeededRNG(state.rngSeed + negotiationId.length * 8111 + state.currentRound * 4219)
            const { updatedTracker, approved } = rollBoardApproval(
              tracker, approvalResult, rng, state.currentDate,
              `Accept counter-offer from ${player?.firstName ?? ''} ${player?.lastName ?? ''} ($${counterAav.toLocaleString()}/yr)`,
              state.playerClubId, negotiation.playerId,
            )

            set((s) => {
              s.boardApprovals = updatedTracker
            })

            if (!approved) {
              set((s) => {
                const p = s.players[negotiation.playerId]
                appendNewsItem(s, {
                  id: crypto.randomUUID(),
                  date: s.currentDate,
                  headline: `Board blocks counter-offer acceptance for ${p?.firstName ?? ''} ${p?.lastName ?? ''}`,
                  body: `The board has refused to accept the $${counterAav.toLocaleString()}/yr counter-offer from ${p?.firstName ?? ''} ${p?.lastName ?? ''}.`,
                  category: 'contract',
                  clubIds: [s.playerClubId],
                  playerIds: [negotiation.playerId],
                })
              })
              return { success: false, error: 'The board has refused to accept this counter-offer.' }
            }
          }
        }

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
            pushSigningNotification(s, {
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

          // Record agent relationship event (counter-offer accepted)
          if (neg.agentId) {
            const agentId = neg.agentId
            const existing = (s.agentRelationships ?? {})[agentId] ?? getDefaultRelationship(agentId)
            const updated = applyNegotiationOutcome(existing, ['counter-accepted', 'signed-accepted'], s.currentDate, neg.playerId)
            if (!s.agentRelationships) s.agentRelationships = {}
            s.agentRelationships[agentId] = updated
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
            trackSigningInteraction(s, playerId)
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
        if (state.simulation.active) return
        if (!state.offseasonState?.freeAgencyMarket) return
        if (state.offseasonState.freeAgencyMarket.resolved) return
        startSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Free Agency', 'Resolving free agency bids...')
        appendSimulationLog(set as (fn: (state: GameState) => void) => void, 'Computing bid outcomes and compensation picks.')
        try {

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
          normalizeAllClubJumperNumbers(s)
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
              pushSigningNotification(s, n)
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
        updateSimulationStatus(set as (fn: (state: GameState) => void) => void, 'Free agency market resolved.')
        } finally {
          finishSimulationStatus(set as (fn: (state: GameState) => void) => void)
        }
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
          trackSigningInteraction(s, playerId)
          normalizeClubJumperNumbers(s, s.playerClubId)

          const allPlayers = Object.values(s.players)
          const club = s.clubs[s.playerClubId]
          if (club) {
            club.finances.currentSpend = syncClubCurrentSpend(allPlayers, s.playerClubId)
          }

          pushSigningNotification(s, {
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

      completeAwardsNight: () => {
        set((s) => {
          s.awardsNightCompleted = true
          s.brownlowRevealed = true
        })
      },

      getPlayersByClub: (clubId: string): Player[] => {
        const state = get()
        return Object.values(state.players).filter(
          (p) => p.clubId === clubId,
        )
      },

      acceptSponsorshipOffer: (offerId: string) => {
        const state = get()
        const offer = state.sponsorshipOffers.find((o) => o.id === offerId)
        if (!offer) return { success: false, error: 'Offer not found' }
        const club = state.clubs[state.playerClubId]
        if (!club) return { success: false, error: 'Club not found' }

        // Check reputation requirement
        if (offer.reputationRequirement !== undefined && (club.fanSatisfaction ?? 60) < offer.reputationRequirement) {
          return { success: false, error: `Fan satisfaction must be at least ${offer.reputationRequirement} to accept this deal` }
        }
        // Check exclusivity conflict
        if (offer.exclusiveCategory) {
          const conflict = (club.sponsorshipDeals ?? []).find(
            (d) => d.exclusiveCategory === offer.exclusiveCategory || d.category === offer.exclusiveCategory,
          )
          if (conflict) {
            return { success: false, error: `Exclusivity conflict: already have a ${offer.exclusiveCategory} deal` }
          }
        }

        set((s: GameState) => {
          const o = s.sponsorshipOffers.find((x) => x.id === offerId)
          if (!o) return
          const c = s.clubs[s.playerClubId]
          if (!c) return
          const deal: import('@/types/club').SponsorshipDeal = {
            id: crypto.randomUUID(),
            companyName: o.companyName,
            tier: o.tier,
            category: o.category,
            annualValue: o.annualValue,
            yearsRemaining: o.years,
            totalYears: o.years,
            performanceBonus: o.performanceBonus,
            signedYear: s.currentYear,
            slot: o.slot,
            satisfaction: 70,
            reputationRequirement: o.reputationRequirement,
            exclusiveCategory: o.exclusiveCategory,
          }
          // Replace any existing deal in same slot
          const existing = c.sponsorshipDeals ?? []
          c.sponsorshipDeals = [...existing.filter((d) => d.slot !== o.slot), deal]
          s.sponsorshipOffers = s.sponsorshipOffers.filter((x) => x.id !== offerId)

          const slotLabel = o.slot.charAt(0).toUpperCase() + o.slot.slice(1)
          appendNewsItem(s, {
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${o.companyName} signs as ${c.name}'s ${slotLabel} sponsor`,
            body: `${c.fullName} have secured a ${o.years}-year deal with ${o.companyName} worth $${(o.annualValue / 1_000_000).toFixed(1)}M per season.`,
            category: 'general',
            clubIds: [c.id],
            playerIds: [],
          })
        })
        return { success: true }
      },

      rejectSponsorshipOffer: (offerId: string) => {
        set((s: GameState) => {
          s.sponsorshipOffers = s.sponsorshipOffers.filter((o) => o.id !== offerId)
        })
      },

      declineSponsorshipOffer: (offerId: string) => {
        set((s: GameState) => {
          s.sponsorshipOffers = s.sponsorshipOffers.filter((o) => o.id !== offerId)
        })
      },

      counterSponsorshipOffer: (offerId: string, counterValue: number, counterYears: number) => {
        const state = get()
        const offer = state.sponsorshipOffers.find((o) => o.id === offerId)
        if (!offer) return { result: 'rejected' as const }

        const rng = new SeededRNG(state.rngSeed + state.currentYear * 113 + counterValue)
        const result = resolveSponsorCounter(offer, counterValue, counterYears, rng)

        if (result === 'accepted') {
          set((s: GameState) => {
            const o = s.sponsorshipOffers.find((x) => x.id === offerId)
            if (!o) return
            const c = s.clubs[s.playerClubId]
            if (!c) return
            const deal: import('@/types/club').SponsorshipDeal = {
              id: crypto.randomUUID(),
              companyName: o.companyName,
              tier: o.tier,
              category: o.category,
              annualValue: counterValue,
              yearsRemaining: counterYears,
              totalYears: counterYears,
              performanceBonus: o.performanceBonus,
              signedYear: s.currentYear,
              slot: o.slot,
              satisfaction: 70,
              reputationRequirement: o.reputationRequirement,
              exclusiveCategory: o.exclusiveCategory,
            }
            const existing = c.sponsorshipDeals ?? []
            c.sponsorshipDeals = [...existing.filter((d) => d.slot !== o.slot), deal]
            s.sponsorshipOffers = s.sponsorshipOffers.filter((x) => x.id !== offerId)

            const slotLabel = o.slot.charAt(0).toUpperCase() + o.slot.slice(1)
            appendNewsItem(s, {
              id: crypto.randomUUID(),
              date: s.currentDate,
              headline: `${o.companyName} accepts counter-offer as ${c.name}'s ${slotLabel} sponsor`,
              body: `${c.fullName} have negotiated a ${counterYears}-year deal with ${o.companyName} worth $${(counterValue / 1_000_000).toFixed(1)}M per season.`,
              category: 'general',
              clubIds: [c.id],
              playerIds: [],
            })
          })
        } else {
          set((s: GameState) => {
            const o = s.sponsorshipOffers.find((x) => x.id === offerId)
            if (o) {
              o.counterStatus = 'rejected'
              o.counterAnnualValue = counterValue
              o.counterYears = counterYears
            }
          })
        }
        return { result }
      },

      terminateSponsorshipDeal: (dealId: string) => {
        set((s: GameState) => {
          const club = s.clubs[s.playerClubId]
          if (!club?.sponsorshipDeals) return
          const deal = club.sponsorshipDeals.find((d) => d.id === dealId)
          if (!deal) return
          club.sponsorshipDeals = club.sponsorshipDeals.filter((d) => d.id !== dealId)
          appendNewsItem(s, {
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${club.name} ends deal with ${deal.companyName}`,
            body: `${club.fullName} have terminated their sponsorship agreement with ${deal.companyName}.`,
            category: 'general',
            clubIds: [club.id],
            playerIds: [],
          })
        })
      },

      runMembershipCampaign: (budgetSpent: number) => {
        const s = get()
        if (s.phase !== 'offseason') return { success: false, projectedMembersBoost: 0 }
        const club = s.clubs[s.playerClubId]
        if (!club) return { success: false, projectedMembersBoost: 0 }
        if (club.finances.balance < budgetSpent) return { success: false, projectedMembersBoost: 0 }
        const projectedMembersBoost = Math.round(budgetSpent / 300) * 1000
        set((s: GameState) => {
          const c = s.clubs[s.playerClubId]
          if (!c) return
          c.finances.balance -= budgetSpent
          if (!c.finances.membershipData) {
            c.finances.membershipData = { totalMembers: 50000, target: 60000, campaignBudgetSpent: 0, trendLastSeason: 0 }
          }
          c.finances.membershipData.campaignBudgetSpent = (c.finances.membershipData.campaignBudgetSpent ?? 0) + budgetSpent
          c.finances.membershipData.totalMembers = (c.finances.membershipData.totalMembers ?? 50000) + projectedMembersBoost
        })
        return { success: true, projectedMembersBoost }
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
            matchupTactics: current?.matchupTactics,
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
            matchupTactics: s.weeklyGameplans[s.playerClubId]?.matchupTactics,
            source: 'user',
          }
        })
        return { success: true }
      },

      setWeeklyMatchupTactics: (tactics: WeeklyMatchupTactics) => {
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
          s.weeklyGameplans[s.playerClubId] = {
            round: s.currentRound,
            opponentClubId,
            overrides: current?.overrides ?? {},
            matchupTactics: {
              hardTags: [...tactics.hardTags],
              physicalAttention: [...tactics.physicalAttention],
              roleAssignments: [...tactics.roleAssignments],
            },
            source: 'user',
          }
        })
        return { success: true }
      },

      clearWeeklyMatchupTactics: () => {
        set((s) => {
          const current = s.weeklyGameplans[s.playerClubId]
          if (!current) return
          s.weeklyGameplans[s.playerClubId] = {
            ...current,
            matchupTactics: {
              hardTags: [],
              physicalAttention: [],
              roleAssignments: [],
            },
            source: 'user',
          }
        })
      },

      hireStaffMember: (staffId: string, contractYears: number) => {
        const state = get()
        const member = state.staff[staffId]
        if (!member) return { success: false, error: 'Staff member not found' }

        // Board approval check
        if (needsBoardApproval({ category: 'staff-hire', params: { salary: member.salary } }, state.settings)) {
          const club = state.clubs[state.playerClubId]
          if (!club) return { success: false, error: 'Club not found' }

          const tracker = state.boardApprovals ?? { records: [], denialCooldowns: {} }

          // Check cooldown
          if (isApprovalOnCooldown(tracker, 'staff-hire', staffId, state.currentDate)) {
            return { success: false, error: 'The board recently denied this hire. Please wait before trying again.' }
          }

          const ladderIdx = state.ladder.findIndex((e) => e.clubId === state.playerClubId)
          const ladderPosition = ladderIdx >= 0 ? ladderIdx + 1 : 18

          const approvalResult = computeBoardApproval({
            category: 'staff-hire',
            club,
            jobSecurity: state.manager.jobSecurity,
            ladderPosition,
            settings: state.settings,
            staffParams: { salary: member.salary },
          })

          const rng = new SeededRNG(state.rngSeed + staffId.length * 7919 + state.currentRound * 3571)
          const { updatedTracker, approved } = rollBoardApproval(
            tracker, approvalResult, rng, state.currentDate,
            `Hire ${member.firstName} ${member.lastName} ($${member.salary.toLocaleString()}/yr)`,
            state.playerClubId, staffId,
          )

          set((s) => {
            s.boardApprovals = updatedTracker
          })

          if (!approved) {
            set((s) => {
              appendNewsItem(s, {
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `Board blocks hiring of ${member.firstName} ${member.lastName}`,
                body: `The board has denied the request to hire ${member.firstName} ${member.lastName} at $${member.salary.toLocaleString()} per year. They feel the salary is not justified at this time.`,
                category: 'general',
                clubIds: [s.playerClubId],
                playerIds: [],
              })
            })
            return { success: false, error: 'The board has denied this hire.' }
          }
        }

        set((s) => {
          const m = s.staff[staffId]
          if (m) {
            m.clubId = s.playerClubId
            m.contractYears = contractYears
          }
        })
        return { success: true }
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

      previewApproachChance: (staffId: string, salaryMultiplier: number) => {
        const state = get()
        const member = state.staff[staffId]
        if (!member || member.clubId === '' || member.clubId === state.playerClubId) return 0

        const userLadderPos = Math.max(1, state.ladder.findIndex((e) => e.clubId === state.playerClubId) + 1)
        const targetLadderPos = Math.max(1, state.ladder.findIndex((e) => e.clubId === member.clubId) + 1)

        let chance = 0.30
        // Manager reputation (+/- up to 0.25)
        chance += (state.manager.reputation - 50) / 200
        // Salary offer
        if (salaryMultiplier >= 0.30) chance += 0.20
        else if (salaryMultiplier >= 0.15) chance += 0.12
        // Ladder advantage: positive when user's club is higher (lower position number)
        chance += (targetLadderPos - userLadderPos) / 18 * 0.20
        // Contract vulnerability
        if (member.contractYears <= 0) chance += 0.22
        else if (member.contractYears === 1) chance += 0.12
        else if (member.contractYears >= 3) chance -= 0.10
        // Target club stability
        if (targetLadderPos <= 4) chance -= 0.10
        if (targetLadderPos >= 15) chance += 0.10

        return Math.max(0.08, Math.min(0.88, chance))
      },

      approachStaffMember: (staffId: string, contractYears: number, salaryMultiplier: number) => {
        const state = get()
        const member = state.staff[staffId]
        if (!member) return { accepted: false, reason: 'Staff member not found', acceptanceChance: 0 }
        if (member.clubId === state.playerClubId) return { accepted: false, reason: 'Already on your staff', acceptanceChance: 0 }
        if (member.clubId === '') return { accepted: false, reason: 'Use standard hiring for free agents', acceptanceChance: 0 }

        const userLadderPos = Math.max(1, state.ladder.findIndex((e) => e.clubId === state.playerClubId) + 1)
        const targetLadderPos = Math.max(1, state.ladder.findIndex((e) => e.clubId === member.clubId) + 1)

        let chance = 0.30
        chance += (state.manager.reputation - 50) / 200
        if (salaryMultiplier >= 0.30) chance += 0.20
        else if (salaryMultiplier >= 0.15) chance += 0.12
        chance += (targetLadderPos - userLadderPos) / 18 * 0.20
        if (member.contractYears <= 0) chance += 0.22
        else if (member.contractYears === 1) chance += 0.12
        else if (member.contractYears >= 3) chance -= 0.10
        if (targetLadderPos <= 4) chance -= 0.10
        if (targetLadderPos >= 15) chance += 0.10
        chance = Math.max(0.08, Math.min(0.88, chance))

        const rng = new SeededRNG(
          state.rngSeed + staffId.length * 7919 + state.currentRound * 3571 + Math.round(salaryMultiplier * 100),
        )
        const accepted = rng.chance(chance)

        if (!accepted) {
          const fromClubName = state.clubs[member.clubId]?.abbreviation ?? member.clubId
          let reason: string
          if (member.contractYears >= 2 && targetLadderPos <= 8) {
            reason = `${member.firstName} ${member.lastName} is settled and committed at ${fromClubName}.`
          } else if (chance < 0.35) {
            reason = `${member.firstName} ${member.lastName} has no interest in leaving ${fromClubName} at this time.`
          } else {
            reason = `${member.firstName} ${member.lastName} chose to remain with ${fromClubName}.`
          }
          return { accepted: false, reason, acceptanceChance: chance }
        }

        // Board approval check
        const offeredSalary = Math.round(member.salary * (1 + salaryMultiplier))
        if (needsBoardApproval({ category: 'staff-hire', params: { salary: offeredSalary } }, state.settings)) {
          const club = state.clubs[state.playerClubId]
          if (!club) return { accepted: false, reason: 'Club not found', acceptanceChance: chance }
          const tracker = state.boardApprovals ?? { records: [], denialCooldowns: {} }
          if (isApprovalOnCooldown(tracker, 'staff-hire', staffId, state.currentDate)) {
            return { accepted: false, reason: 'The board recently denied this hire. Please wait before trying again.', acceptanceChance: chance }
          }
          const approvalResult = computeBoardApproval({
            category: 'staff-hire',
            club,
            jobSecurity: state.manager.jobSecurity,
            ladderPosition: userLadderPos,
            settings: state.settings,
            staffParams: { salary: offeredSalary },
          })
          const boardRng = new SeededRNG(state.rngSeed + staffId.length * 7907 + state.currentRound * 3559)
          const { updatedTracker, approved } = rollBoardApproval(
            tracker, approvalResult, boardRng, state.currentDate,
            `Approach ${member.firstName} ${member.lastName} from ${state.clubs[member.clubId]?.abbreviation ?? member.clubId}`,
            state.playerClubId, staffId,
          )
          set((s) => { s.boardApprovals = updatedTracker })
          if (!approved) {
            set((s) => {
              appendNewsItem(s, {
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `Board blocks approach for ${member.firstName} ${member.lastName}`,
                body: `The board has blocked the approach for ${member.firstName} ${member.lastName}. The offered salary of $${offeredSalary.toLocaleString()} per year was not approved.`,
                category: 'general',
                clubIds: [s.playerClubId],
                playerIds: [],
              })
            })
            return { accepted: false, reason: 'The board has blocked this approach.', acceptanceChance: chance }
          }
        }

        const offeredSalaryFinal = Math.round(member.salary * (1 + salaryMultiplier))
        const fromClubId = member.clubId
        const fromClubAbbr = state.clubs[fromClubId]?.abbreviation ?? fromClubId

        set((s) => {
          const m = s.staff[staffId]
          if (m) {
            m.clubId = s.playerClubId
            m.contractYears = contractYears
            m.salary = offeredSalaryFinal
          }
          const userClubName = s.clubs[s.playerClubId]?.abbreviation ?? 'your club'
          appendNewsItem(s, {
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${member.firstName} ${member.lastName} joins ${userClubName}`,
            body: `${member.firstName} ${member.lastName} has left ${fromClubAbbr} to join ${userClubName} on a ${contractYears}-year contract worth $${offeredSalaryFinal.toLocaleString()} per year.`,
            category: 'general',
            clubIds: [s.playerClubId, fromClubId],
            playerIds: [],
          })
        })
        return { accepted: true, reason: `${member.firstName} ${member.lastName} has accepted your offer!`, acceptanceChance: chance }
      },

      previewBoardApproval: (category, params) => {
        const state = get()
        const club = state.clubs[state.playerClubId]
        if (!club) {
          return { category, probability: 100, factors: [], requiresApproval: false }
        }
        const ladderIdx = state.ladder.findIndex((e) => e.clubId === state.playerClubId)
        const ladderPosition = ladderIdx >= 0 ? ladderIdx + 1 : 18

        return computeBoardApproval({
          category,
          club,
          jobSecurity: state.manager.jobSecurity,
          ladderPosition,
          settings: state.settings,
          contractParams: params.aav != null ? { aav: params.aav } : undefined,
          tradeParams: params.userSalaryRetention != null ? { userSalaryRetention: params.userSalaryRetention } : undefined,
          staffParams: params.salary != null ? { salary: params.salary } : undefined,
        })
      },

      saveGame: () => {
        set((state) => {
          state.meta.lastSaved = new Date().toISOString()
        })
        // Also persist to save slot via saveManager (avoids circular dep with appStore)
        import('@/lib/saveManager').then(({ saveGameToSlot }) => {
          saveGameToSlot(get())
        })
      },

      sendToReserves: (playerId: string) => {
        set((state) => {
          const player = state.players[playerId]
          if (player && isAflListedPlayer(player)) {
            player.listStatus = 'reserves'
          }
        })
      },

      recallFromReserves: (playerId: string) => {
        set((state) => {
          const player = state.players[playerId]
          if (player && isAflListedPlayer(player)) {
            player.listStatus = 'senior'
          }
        })
      },

      setReservesDelegation: (enabled: boolean) => {
        set((state) => {
          state.reserves.delegationEnabled = enabled
        })
      },

      setManagedReservesLineup: (playerIds: string[]) => {
        set((state) => {
          const selectedLineupIds = new Set(
            Object.values(state.selectedLineup ?? {}).filter((id): id is string => Boolean(id)),
          )
          const valid = playerIds.filter((id) => {
            const p = state.players[id]
            if (!p) return false
            if (p.clubId !== state.playerClubId) return false
            if (p.injury || isPlayerSuspended(p)) return false
            if (isStateLeagueContracted(p) && !hasActiveStateLeagueContract(p)) return false
            if (selectedLineupIds.has(id)) return false
            return true
          })
          const ids = Array.from(new Set(valid)).slice(0, 23)
          state.reserves.managedLineupPlayerIds = ids
          const slots = getLineupSlots(state.settings.matchRules.interchangePlayers)
          const nextAssignments: Partial<Record<LineupSlot, string>> = {}
          for (let i = 0; i < slots.length && i < ids.length; i++) {
            nextAssignments[slots[i]] = ids[i]
          }
          state.reserves.managedLineupSlotAssignments = nextAssignments
        })
      },

      setManagedReservesLineupSlots: (assignments: Partial<Record<LineupSlot, string>>) => {
        set((state) => {
          const selectedLineupIds = new Set(
            Object.values(state.selectedLineup ?? {}).filter((id): id is string => Boolean(id)),
          )
          const validSlots = new Set<LineupSlot>(getLineupSlots(state.settings.matchRules.interchangePlayers))
          const used = new Set<string>()
          const nextAssignments: Partial<Record<LineupSlot, string>> = {}

          for (const [rawSlot, playerId] of Object.entries(assignments) as Array<[LineupSlot, string | undefined]>) {
            const slot = rawSlot as LineupSlot
            if (!validSlots.has(slot)) continue
            if (!playerId || used.has(playerId) || selectedLineupIds.has(playerId)) continue
            const p = state.players[playerId]
            if (!p) continue
            if (p.clubId !== state.playerClubId || p.injury || isPlayerSuspended(p)) continue
            if (isStateLeagueContracted(p) && !hasActiveStateLeagueContract(p)) continue
            nextAssignments[slot] = playerId
            used.add(playerId)
          }

          state.reserves.managedLineupSlotAssignments = nextAssignments
          state.reserves.managedLineupPlayerIds = Object.values(nextAssignments)
        })
      },

      setReservesPlayerAvailability: (playerId: string, assignment: 'play' | 'rest') => {
        set((state) => {
          const player = state.players[playerId]
          if (!player || player.clubId !== state.playerClubId) return
          if (assignment === 'play' && isStateLeagueContracted(player) && !hasActiveStateLeagueContract(player)) {
            state.reserves.playerAvailabilityAssignments[playerId] = 'rest'
            return
          }
          state.reserves.playerAvailabilityAssignments[playerId] = assignment
          if (assignment === 'rest') {
            state.reserves.managedLineupPlayerIds = state.reserves.managedLineupPlayerIds.filter((id) => id !== playerId)
            for (const [slot, id] of Object.entries(state.reserves.managedLineupSlotAssignments) as Array<[LineupSlot, string]>) {
              if (id === playerId) delete state.reserves.managedLineupSlotAssignments[slot]
            }
          }
        })
      },

      setReservesLeadership: (leadership: {
        captainId: string | null
        viceCaptainId: string | null
        leadershipGroupIds: string[]
      }) => {
        set((state) => {
          const clubPlayerIds = new Set(
            Object.values(state.players)
              .filter((p) => p.clubId === state.playerClubId)
              .map((p) => p.id),
          )
          const captainId = leadership.captainId && clubPlayerIds.has(leadership.captainId)
            ? leadership.captainId
            : null
          const viceCaptainId = leadership.viceCaptainId && clubPlayerIds.has(leadership.viceCaptainId)
            ? leadership.viceCaptainId
            : null
          const leadershipGroupIds = leadership.leadershipGroupIds
            .filter((id) => clubPlayerIds.has(id))
            .slice(0, 8)

          state.reserves.leadership = { captainId, viceCaptainId, leadershipGroupIds }
        })
      },

      setReservesTactics: (updates: Partial<GameState['reserves']['tactics']>) => {
        set((state) => {
          state.reserves.tactics = { ...state.reserves.tactics, ...updates }
        })
      },

      applyReservesCoachTactics: () => {
        const state = get()
        const impact = getReservesStaffImpact(Object.values(state.staff), state.playerClubId)
        if (!impact.philosophyDriven) return
        set((s) => {
          s.reserves.tactics = impact.suggestedTactics
        })
      },

      autoPickManagedReservesLineup: () => {
        set((state) => {
          const selectedLineupIds = new Set(
            Object.values(state.selectedLineup ?? {}).filter((id): id is string => Boolean(id)),
          )
          const candidates = Object.values(state.players)
            .filter((p) =>
              p.clubId === state.playerClubId &&
              !p.injury &&
              !isPlayerSuspended(p) &&
              (!isStateLeagueContracted(p) || hasActiveStateLeagueContract(p)) &&
              !selectedLineupIds.has(p.id),
            )
            .sort((a, b) => {
              const aScore = a.form * 0.45 + a.fitness * 0.2 + averageAttributes(a.attributes) * 0.35
              const bScore = b.form * 0.45 + b.fitness * 0.2 + averageAttributes(b.attributes) * 0.35
              return bScore - aScore
            })
          const ids = candidates.slice(0, 23).map((p) => p.id)
          state.reserves.managedLineupPlayerIds = ids
          const slots = getLineupSlots(state.settings.matchRules.interchangePlayers)
          const nextAssignments: Partial<Record<LineupSlot, string>> = {}
          for (let i = 0; i < slots.length && i < ids.length; i++) {
            nextAssignments[slots[i]] = ids[i]
          }
          state.reserves.managedLineupSlotAssignments = nextAssignments
        })
      },

      setStateLeagueContractDelegation: (enabled: boolean) => {
        set((state) => {
          state.reserves.stateLeagueContractDelegationEnabled = enabled
        })
      },

      setStateLeagueContractTargetCount: (count: number) => {
        set((state) => {
          state.reserves.stateLeagueContractTargetCount = Math.max(6, Math.min(28, Math.round(count)))
        })
      },

      reSignStateLeagueContract: (playerId: string, years = 1) => {
        const state = get()
        const player = state.players[playerId]
        if (!player || player.clubId !== state.playerClubId) return { success: false, error: 'Player not found at your club.' }
        if (!isStateLeagueContracted(player)) return { success: false, error: 'Player is not on a state-league contract.' }

        set((s) => {
          const p = s.players[playerId]
          if (!p || !isStateLeagueContracted(p)) return
          const nextYears = Math.max(1, Math.min(3, Math.round(years)))
          p.stateLeagueContract = {
            yearsRemaining: nextYears,
            annualValue: p.stateLeagueContract?.annualValue ?? 70_000,
            signedDate: s.currentDate,
            source: 'renewal',
          }
          appendContractHistory(p, s.currentDate, 'state-renew', `Re-signed on a ${nextYears}-year state-league deal.`)
          appendNewsItem(s, {
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${p.firstName} ${p.lastName} re-signs state-league deal`,
            body: `${p.firstName} ${p.lastName} has re-signed with the affiliate reserves program on a ${nextYears}-year contract.`,
            category: 'contract',
            clubIds: [s.playerClubId],
            playerIds: [p.id],
          }, { routeSigning: false })
        })
        return { success: true }
      },

      delistStateLeagueContractedPlayer: (playerId: string) => {
        const state = get()
        const player = state.players[playerId]
        if (!player || player.clubId !== state.playerClubId) return { success: false, error: 'Player not found at your club.' }
        if (!isStateLeagueContracted(player)) return { success: false, error: 'Player is not on a state-league contract.' }

        set((s) => {
          const p = s.players[playerId]
          if (!p) return
          appendContractHistory(p, s.currentDate, 'state-delist', 'Delisted from state-league contract.')
          p.clubId = ''
          p.stateLeagueContract = null
          p.listStatus = 'reserves'
          removeStateLeagueContractedPlayerFromReservesState(s, playerId)
          appendNewsItem(s, {
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${player.firstName} ${player.lastName} delisted from reserves contract`,
            body: `${player.firstName} ${player.lastName} has been released from the affiliate state-league list.`,
            category: 'contract',
            clubIds: [s.playerClubId],
            playerIds: [playerId],
          }, { routeSigning: false })
        })
        return { success: true }
      },

      recruitStateLeagueContractPlayer: (count = 1) => {
        const state = get()
        const addCount = Math.max(1, Math.min(6, Math.round(count)))
        if (!state.playerClubId || !state.clubs[state.playerClubId]) {
          return { success: false, addedIds: [], error: 'No managed club selected.' }
        }
        let addedIds: string[] = []
        set((s) => {
          addedIds = recruitStateLeagueDepthPlayers(
            s,
            s.playerClubId,
            addCount,
            'recruitment',
            s.reserves.stateLeagueContractDelegationEnabled,
          )
          for (const playerId of addedIds) {
            s.reserves.playerAvailabilityAssignments[playerId] = 'play'
          }
        })
        return { success: true, addedIds }
      },

      signStateLeaguePlayerToAflContract: (playerId: string, years: number, aav: number) => {
        const state = get()
        const player = state.players[playerId]
        if (!player || player.clubId !== state.playerClubId) return { success: false, error: 'Player not found at your club.' }
        if (!isStateLeagueContracted(player)) return { success: false, error: 'Player is not on a state-league contract.' }
        const constraints = resolveListConstraints(state.settings)
        if (!canAddToSeniorList(state.players, state.playerClubId, constraints)) {
          return { success: false, error: 'No room on the AFL senior list.' }
        }

        const clampedYears = Math.max(1, Math.min(4, Math.round(years)))
        const clampedAav = Math.max(MINIMUM_SALARY, Math.min(700_000, Math.round(aav)))

        set((s) => {
          const p = s.players[playerId]
          if (!p) return
          p.contractTier = 'afl-listed'
          p.stateLeagueContract = null
          p.contract = {
            yearsRemaining: clampedYears,
            aav: clampedAav,
            yearByYear: Array.from({ length: clampedYears }, (_, idx) =>
              Math.round((clampedAav * (1 + idx * 0.03)) / 1000) * 1000,
            ),
            isRestricted: p.age < 27,
          }
          p.listStatus = 'senior'
          appendContractHistory(
            p,
            s.currentDate,
            'afl-sign',
            `Upgraded from state-league contract to ${clampedYears}-year AFL contract.`,
          )
          appendNewsItem(s, {
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${p.firstName} ${p.lastName} signed to AFL list`,
            body: `${p.firstName} ${p.lastName} has been upgraded from the affiliate program to a ${clampedYears}-year AFL contract worth $${clampedAav.toLocaleString()} per season.`,
            category: 'contract',
            clubIds: [s.playerClubId],
            playerIds: [p.id],
          }, { routeSigning: false })

          const allPlayers = Object.values(s.players)
          const club = s.clubs[s.playerClubId]
          if (club) {
            club.finances.currentSpend = syncClubCurrentSpend(allPlayers, s.playerClubId)
          }
        })
        return { success: true }
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

      setTrainingWeekPlan: (plan) => {
        set((state) => {
          state.trainingWeekPlan = plan
        })
      },

      updateTrainingSlotGroups: (date, slot, groups) => {
        set((state) => {
          if (!state.trainingWeekPlan) return
          if (!state.trainingWeekPlan.slots[date]) {
            state.trainingWeekPlan.slots[date] = {
              morning: { groups: [] },
              afternoon: { groups: [] },
            }
          }
          state.trainingWeekPlan.slots[date][slot].groups = groups
        })
      },

      clearTrainingWeekPlan: () => {
        set((state) => {
          state.trainingWeekPlan = null
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

      dismissObjective: (objectiveId: string) => {
        set((s) => {
          s.careerObjectives = s.careerObjectives.filter((o) => o.id !== objectiveId)
        })
      },

      // ---- Special Events Actions ----

      scheduleSpecialEvents: () => {
        const state = get()
        if (!state.settings.specialEvents?.enabled) return

        const rng = new SeededRNG(state.rngSeed + state.currentYear * 3571)
        const byeRounds: number[] = []
        for (let i = 0; i < state.season.rounds.length; i++) {
          const round = state.season.rounds[i]
          if (round && (round.byeClubIds ?? []).length > 0) {
            byeRounds.push(i)
          }
        }

        const specialEventsState = scheduleSpecialEventsEngine(
          state.settings.specialEvents,
          state.currentYear,
          state.settings.seasonStartDate ?? '2026-03-20',
          state.season.rounds.length,
          state.players,
          rng,
          byeRounds,
        )

        set((s) => {
          s.specialEvents = specialEventsState
          injectSpecialEvents(s.calendar, specialEventsState)
        })
      },

      simSpecialEvent: (eventInstanceId: string) => {
        const state = get()
        if (!state.specialEvents) return { result: null }

        const idx = state.specialEvents.events.findIndex((e) => e.id === eventInstanceId)
        if (idx < 0) return { result: null }

        const instance = state.specialEvents.events[idx]!
        if (instance.status !== 'scheduled') return { result: null }

        const rng = new SeededRNG(state.rngSeed + eventInstanceId.length * 7919 + idx * 31)
        const result = simulateSpecialMatch(instance, state.players, rng, state.playerClubId)

        set((s) => {
          if (!s.specialEvents) return
          const evt = s.specialEvents.events[idx]
          if (!evt) return

          evt.result = result
          evt.status = 'completed'

          // Update series results
          const seriesKey = evt.eventId
          if (!s.specialEvents.seriesResults[seriesKey]) {
            s.specialEvents.seriesResults[seriesKey] = { teamAWins: 0, teamBWins: 0, draws: 0 }
          }
          const series = s.specialEvents.seriesResults[seriesKey]!
          if (result.teamAScore.total > result.teamBScore.total) {
            series.teamAWins++
          } else if (result.teamBScore.total > result.teamAScore.total) {
            series.teamBWins++
          } else {
            series.draws++
          }

          // Update origin standings for state-of-origin matches
          if (evt.eventId === 'state-of-origin') {
            if (!s.specialEvents.originStandings) s.specialEvents.originStandings = []
            const updateStanding = (team: string, ptsFor: number, ptsAgainst: number, won: boolean, drew: boolean) => {
              let standing = s.specialEvents!.originStandings.find((st) => st.team === team)
              if (!standing) {
                standing = { team, played: 0, wins: 0, losses: 0, draws: 0, pointsFor: 0, pointsAgainst: 0 }
                s.specialEvents!.originStandings.push(standing)
              }
              standing.played++
              standing.pointsFor += ptsFor
              standing.pointsAgainst += ptsAgainst
              if (drew) standing.draws++
              else if (won) standing.wins++
              else standing.losses++
            }
            const aWon = result.teamAScore.total > result.teamBScore.total
            const drew = result.teamAScore.total === result.teamBScore.total
            updateStanding(evt.teamA.name, result.teamAScore.total, result.teamBScore.total, aWon, drew)
            updateStanding(evt.teamB.name, result.teamBScore.total, result.teamAScore.total, !aWon && !drew, drew)
          }

          // Mark calendar event as resolved
          const calEvtId = `evt-spe-${evt.id}`
          const calEvt = s.calendar.events.find((e) => e.id === calEvtId)
          if (calEvt) calEvt.resolved = true

          // Apply player impact if enabled
          applySpecialMatchImpact(evt, s.players, rng, s.settings.realism)

          // Push news item
          const def = getEventDefinition(evt.eventId)
          const eventName = def?.name ?? evt.eventId
          appendNewsItem(s, {
            id: crypto.randomUUID(),
            date: s.currentDate,
            headline: `${evt.teamA.name} ${result.teamAScore.total} def. ${evt.teamB.name} ${result.teamBScore.total}`,
            body: `${eventName}: ${evt.teamA.name} ${result.teamAScore.goals}.${result.teamAScore.behinds} (${result.teamAScore.total}) vs ${evt.teamB.name} ${result.teamBScore.goals}.${result.teamBScore.behinds} (${result.teamBScore.total}) at ${evt.venue}.`,
            category: 'match',
            clubIds: [],
            playerIds: result.userClubParticipants,
          })
        })

        return { result }
      },

      simCurrentRound: (options?: { internal?: boolean; precomputedUserMatch?: Match }) => {
        const internal = options?.internal === true
        let state = get()
        if (state.simulation.active && !internal) return { userMatch: null }
        if (!internal) {
          startSimulationStatus(
            set as (fn: (state: GameState) => void) => void,
            'Match Simulation',
            `Simulating round ${state.currentRound + 1}...`,
          )
          appendSimulationLog(set as (fn: (state: GameState) => void) => void, 'Processing fixtures, injuries, morale, tribunal, and ladder updates.')
        }
        try {
        const round = state.season.rounds[state.currentRound]
        if (!round) return { userMatch: null }
        const preRoundCareerStats: Record<string, Pick<Player['careerStats'], 'gamesPlayed' | 'goals' | 'disposals' | 'marks' | 'tackles'>> = {}
        for (const player of Object.values(state.players)) {
          preRoundCareerStats[player.id] = {
            gamesPlayed: player.careerStats.gamesPlayed,
            goals: player.careerStats.goals,
            disposals: player.careerStats.disposals,
            marks: player.careerStats.marks,
            tackles: player.careerStats.tackles,
          }
        }

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
              appendNewsItem(s, {
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
        const matchupTacticsByClub: Record<string, WeeklyMatchupTactics | undefined> = {}
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
              matchupTacticsByClub[clubId] = userEntry.matchupTactics
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

        const lineupsByClub: Record<string, Record<string, string>> = {}
        const substitutesByClub: Record<string, string | null> = {}
        for (const fixture of round.fixtures) {
          const homeLineup = buildSimLineupForClub(state, fixture.homeClubId)
          const awayLineup = buildSimLineupForClub(state, fixture.awayClubId)
          lineupsByClub[fixture.homeClubId] = homeLineup
          lineupsByClub[fixture.awayClubId] = awayLineup
          substitutesByClub[fixture.homeClubId] = buildSimSubstituteForClub(state, fixture.homeClubId, homeLineup)
          substitutesByClub[fixture.awayClubId] = buildSimSubstituteForClub(state, fixture.awayClubId, awayLineup)
        }

        // Re-assign broadcast tiers using current ladder before simulating
        set((s) => {
          const currentRound = s.season.rounds[s.currentRound]
          if (currentRound) {
            currentRound.fixtures = assignRoundBroadcasts(currentRound.fixtures, s.clubs, s.ladder)
          }
        })
        state = get()

        const preLadderPositions: Record<string, number> = {}
        state.ladder.forEach((e, i) => { preLadderPositions[e.clubId] = i + 1 })

        const precomputed = options?.precomputedUserMatch
        const result = simulateRound({
          round: state.season.rounds[state.currentRound] ?? round,
          roundIndex: state.currentRound,
          players: state.players,
          clubs: state.clubs,
          rngSeed: state.rngSeed,
          playerClubId: state.playerClubId,
          matchRules: state.settings.matchRules,
          venueState: state.venueState,
          gameplanOverrides,
          matchupTacticsByClub,
          realism: state.settings.realism,
          injuryFrequency: state.settings.injuryFrequency,
          ladder: state.ladder,
          lineupsByClub,
          substitutesByClub,
          matchResults: state.matchResults,
          excludeClubIds: precomputed ? [state.playerClubId] : undefined,
        })

        // Replace the null placeholder with precomputed user match if provided
        if (precomputed) {
          const placeholderIdx = result.matches.findIndex((m) => m === null)
          if (placeholderIdx >= 0) {
            result.matches[placeholderIdx] = precomputed
          } else {
            result.matches.push(precomputed)
          }
          result.userMatch = precomputed
        }

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
          s.history.recordsBook = updateRecordsBookForMatches({
            recordsBook: s.history.recordsBook,
            matches: result.matches,
            clubs: s.clubs,
            currentYear: s.currentYear,
          })
          s.history.recordsBook = refreshRecordsBookLeaderboards({
            recordsBook: s.history.recordsBook,
            players: s.players,
            clubs: s.clubs,
            currentYear: s.currentYear,
            history: s.history,
          })
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
        for (const match of result.matches) {
          const travel = match.result?.simulationContext?.travelFatigue
          if (!travel) continue
          if (!travelFatigueByClub) travelFatigueByClub = {}
          travelFatigueByClub[match.homeClubId] = Math.max(travelFatigueByClub[match.homeClubId] ?? 0, travel.home)
          travelFatigueByClub[match.awayClubId] = Math.max(travelFatigueByClub[match.awayClubId] ?? 0, travel.away)
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
          const clubBudget = getClubBudgetAllocation(state.clubs[clubId])
          medicalImpactByClub[clubId] = getMedicalStaffImpact(staffListForMedical, clubId, getBudgetMultiplier(clubBudget, 'medical'))
        }
        // Collect mid-match injured player IDs from precomputed match to avoid double injuries
        const midMatchInjuredIds = new Set<string>(
          precomputed?.result?.midMatchInjuredPlayerIds ?? [],
        )
        const allInjuries = result.matches.flatMap((m) => {
          if (!m.result) return []
          // Use effectiveAggressionLevel from the match result if available (interactive mode)
          const aggressionLevel: 'high' | 'medium' | 'low' = m.result.effectiveAggressionLevel ?? 'medium'
          const matchPlayerIds = [
            ...m.result.homePlayerStats.filter((ps) => ps.participated || ps.minutesPlayed > 0).map((ps) => ps.playerId),
            ...m.result.awayPlayerStats.filter((ps) => ps.participated || ps.minutesPlayed > 0).map((ps) => ps.playerId),
          ].filter((id) => !midMatchInjuredIds.has(id))
          return rollMatchInjuries(
            matchPlayerIds,
            state.players,
            injuryRng,
            aggressionLevel,
            state.settings.injuryFrequency,
            state.currentDate,
            medicalImpactByClub,
          )
        })
        const tacticalInjuryEvents: import('@/engine/players/injuries').InjuryEvent[] = []
        if (state.settings.realism.tacticalInjuryConsequences) {
          const baseChanceByFreq: Record<GameSettings['injuryFrequency'], number> = {
            low: 0.03,
            medium: 0.055,
            high: 0.08,
          }
          for (const match of result.matches) {
            if (!match.result) continue
            const roundEntry = state.weeklyGameplans[state.playerClubId]
            if (
              !roundEntry ||
              roundEntry.round !== state.currentRound ||
              !roundEntry.matchupTactics ||
              !(
                (match.homeClubId === state.playerClubId && match.awayClubId === roundEntry.opponentClubId) ||
                (match.awayClubId === state.playerClubId && match.homeClubId === roundEntry.opponentClubId)
              )
            ) continue
            const played = new Set<string>([
              ...match.result.homePlayerStats.filter((ps) => ps.participated || ps.minutesPlayed > 0).map((ps) => ps.playerId),
              ...match.result.awayPlayerStats.filter((ps) => ps.participated || ps.minutesPlayed > 0).map((ps) => ps.playerId),
            ])
            for (const instruction of roundEntry.matchupTactics.physicalAttention) {
              if (!played.has(instruction.targetPlayerId)) continue
              const player = state.players[instruction.targetPlayerId]
              if (!player || player.injury) continue
              const intensityMult =
                instruction.intensity === 'hard' ? 1.5
                : instruction.intensity === 'light' ? 0.75
                : 1
              const chance = baseChanceByFreq[state.settings.injuryFrequency] * intensityMult
              if (!injuryRng.chance(chance)) continue
              const severe = injuryRng.chance(0.18 * intensityMult)
              tacticalInjuryEvents.push({
                playerId: player.id,
                type: severe ? 'Impact shoulder injury' : 'Heavy contact bruising',
                weeksOut: severe ? injuryRng.nextInt(2, 6) : injuryRng.nextInt(0, 2),
                severity: severe ? 'major' : 'minor',
                recurring: false,
                recurrenceRisk: 0.1,
                bodyRegion: 'impact',
                occurredOn: state.currentDate,
              })
            }
          }
        }

        const tribunalRng = new SeededRNG(state.rngSeed + state.currentRound * 1291)
        const newTribunalCases = generateTribunalCasesFromMatches({
          matches: result.matches,
          players: state.players,
          userClubId: state.playerClubId,
          date: state.currentDate,
          roundMarker: state.currentRound,
          phase: 'regular-season',
          rng: tribunalRng,
          tribunalInbox: state.tribunalInbox,
          enablePriorRecord: state.settings.realism.tribunalPriorRecord,
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
          for (const inj of [...allInjuries, ...tacticalInjuryEvents]) {
            const p = s.players[inj.playerId]
            if (p) {
              applyInjuryEvent(p, inj)
              appendNewsItem(s, {
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
          const medCentreLevels: Record<string, number> = {}
          for (const [cid, c] of Object.entries(s.clubs)) {
            medCentreLevels[cid] = c.facilities.medicalCentre
          }
          healInjuries(s.players, s.currentDate, medicalImpactByClub, medCentreLevels)
          serveSuspensionWeeks(s.players)

          // Roll weekly in-season training injuries (mid-week sessions before next round)
          {
            const freqMult: Record<GameSettings['injuryFrequency'], number> = {
              low: 0.5, medium: 1.0, high: 1.5,
            }
            const mult = freqMult[state.settings.injuryFrequency]
            const trainRng = new SeededRNG(state.rngSeed + state.currentRound * 1777)
            const trainingPlayersByClub: Record<string, Player[]> = {}
            for (const p of Object.values(s.players)) {
              if (!p.clubId || p.clubId === 'retired' || p.clubId === 'free-agent' || p.injury) continue
              if (!trainingPlayersByClub[p.clubId]) trainingPlayersByClub[p.clubId] = []
              trainingPlayersByClub[p.clubId].push(p as Player)
            }
            for (const [clubId, clubPlayers] of Object.entries(trainingPlayersByClub)) {
              const med = medicalImpactByClub[clubId] ?? null
              const effectiveMed = mult === 1.0 || !med
                ? med
                : { ...med, injuryRiskMultiplier: med.injuryRiskMultiplier * mult }
              const trainingEvents = rollTrainingInjuries(
                clubPlayers,
                'moderate',
                state.currentRound,
                effectiveMed,
                trainRng,
                s.currentDate,
                0,
                0,
              )
              for (const event of trainingEvents) {
                const player = s.players[event.playerId]
                if (!player || player.injury) continue
                player.injury = event.injury
                appendNewsItem(s, {
                  id: crypto.randomUUID(),
                  date: s.currentDate,
                  headline: `${event.playerName} training injury (${event.injury.weeksRemaining}w)`,
                  body: `${event.playerName} suffered ${event.injury.type} during training and is expected to miss ${event.injury.weeksRemaining} week${event.injury.weeksRemaining === 1 ? '' : 's'}.`,
                  category: 'injury',
                  clubIds: [event.clubId],
                  playerIds: [event.playerId],
                })
              }
            }
          }

          // Apply resolved AI tribunal outcomes immediately
          for (const tribunalCase of resolvedAICases) {
            s.tribunalInbox.push(tribunalCase)
            const player = s.players[tribunalCase.playerId]
            if (!player) continue
            applyTribunalOutcomeToPlayer(player, tribunalCase)
            appendNewsItem(s, {
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

            // Inject tribunal calendar event
            if (tribunalCase.calendarEventId && tribunalCase.hearingDate) {
              s.calendar.events.push({
                id: tribunalCase.calendarEventId,
                date: tribunalCase.hearingDate,
                type: 'tribunal',
                title: `Tribunal: ${player.firstName} ${player.lastName}`,
                description: tribunalCase.incidentSummary,
                data: { caseId: tribunalCase.id },
                resolved: false,
              })
            }

            appendNewsItem(s, {
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

          // Update club culture scores post-round
          for (const clubId of Object.keys(s.clubs)) {
            const club = s.clubs[clubId]
            if (!club) continue
            const clubMatches = s.matchResults
              .filter(m => m.homeClubId === clubId || m.awayClubId === clubId)
              .slice(-5)
            const recentResults: ('W' | 'L' | 'D')[] = clubMatches.map(m => {
              if (!m.result) return 'D' as const
              const isHome = m.homeClubId === clubId
              const won = isHome
                ? m.result.homeTotalScore > m.result.awayTotalScore
                : m.result.awayTotalScore > m.result.homeTotalScore
              if (won) return 'W' as const
              if (m.result.homeTotalScore === m.result.awayTotalScore) return 'D' as const
              return 'L' as const
            })
            const tradeCount = s.tradeHistory.filter(
              t => t.clubA === clubId || t.clubB === clubId,
            ).length
            updateClubCulture(club, s.players, s.ladder, tradeCount, s.currentRound, s.currentYear, Object.keys(s.clubs).length, recentResults)

            // Update financial momentum modifier from recent form
            club.finances.momentumModifier = calculateMomentumModifier(recentResults)

            // Media pressure update for the player's club only
            if (clubId === s.playerClubId) {
              const playerClubMatch = result.matches.find(
                (m) => m.homeClubId === clubId || m.awayClubId === clubId,
              )
              let matchResultForPressure: { won: boolean; draw: boolean; scoreDiff: number } | null = null
              let won = false
              if (playerClubMatch?.result) {
                const isHome = playerClubMatch.homeClubId === clubId
                const myScore = isHome ? playerClubMatch.result.homeTotalScore : playerClubMatch.result.awayTotalScore
                const oppScore = isHome ? playerClubMatch.result.awayTotalScore : playerClubMatch.result.homeTotalScore
                won = myScore > oppScore
                const draw = myScore === oppScore
                matchResultForPressure = { won, draw, scoreDiff: myScore - oppScore }
              }

              const pressureStories = generateRoundPressureStories(
                matchResultForPressure,
                recentResults,
                club.name,
                s.currentRound,
              )
              club.mediaPressure = updateMediaPressure(
                club.mediaPressure,
                pressureStories,
                s.currentRound,
                won,
              )

              // Apply pressure morale hit to all player club players this round
              const moraleHit = getMediaPressureMoraleEffect(club.mediaPressure.score)
              if (moraleHit !== 0) {
                for (const player of Object.values(s.players)) {
                  if (player.clubId === clubId) {
                    player.morale = Math.max(1, Math.min(100, player.morale + moraleHit))
                  }
                }
              }

              // Generate news for significant new stories
              for (const story of pressureStories) {
                if (story.severity !== 'minor') {
                  appendNewsItem(s, {
                    id: crypto.randomUUID(),
                    date: s.currentDate,
                    headline: story.headline,
                    body: `Media pressure continues to mount around ${club.name}. The club's current media pressure score is ${club.mediaPressure.score}/100.`,
                    category: 'general',
                    clubIds: [clubId],
                    playerIds: [],
                  })
                }
              }

              // ---- Board instability check (boardPolitics realism) ----
              if (s.settings.realism.boardPolitics && s.boardInstability) {
                // Update consecutive losses from this round's result
                if (matchResultForPressure) {
                  const wonOrDraw = matchResultForPressure.won || matchResultForPressure.draw
                  s.boardInstability.consecutiveLosses = updateConsecutiveLosses(
                    s.boardInstability.consecutiveLosses,
                    wonOrDraw,
                  )
                }

                // Compute new instability score
                const ladderPos = (s.ladder.findIndex((e) => e.clubId === clubId) + 1) || 1
                const teamCount = Object.keys(s.clubs).length
                const salaryCap = s.settings.salaryCapAmount || 15_500_000
                const newInstabilityScore = computeInstabilityScore({
                  jobSecurity: s.manager.jobSecurity,
                  consecutiveLosses: s.boardInstability.consecutiveLosses,
                  fanSatisfaction: club.fanSatisfaction ?? 60,
                  ladderPosition: ladderPos,
                  teamCount,
                  financeBalance: club.finances.balance,
                  salaryCap,
                  mediaPressureScore: club.mediaPressure?.score ?? 0,
                  chairmanSupportLevel: s.boardInstability.chairmanSupportLevel,
                })
                s.boardInstability.score = newInstabilityScore

                // Check if a spill event should trigger this round
                if (shouldCheckForSpill(s.boardInstability, s.currentRound, true)) {
                  const instRng = new SeededRNG(s.rngSeed + s.currentYear * 5483 + s.currentRound * 17)
                  if (rollForSpillEvent(newInstabilityScore, instRng)) {
                    const spill = generateSpillEvent({
                      instabilityScore: newInstabilityScore,
                      jobSecurity: s.manager.jobSecurity,
                      consecutiveLosses: s.boardInstability.consecutiveLosses,
                      currentRound: s.currentRound,
                      currentYear: s.currentYear,
                      currentDate: s.currentDate,
                      clubName: club.name,
                      managerName: s.manager.name,
                      rng: instRng,
                    })

                    const resolution = resolveSpillEventEngine({
                      event: spill,
                      jobSecurity: s.manager.jobSecurity,
                      chairmanSupportLevel: s.boardInstability.chairmanSupportLevel,
                      currentDate: s.currentDate,
                      clubId,
                      clubName: club.name,
                      managerName: s.manager.name,
                      rng: instRng,
                    })

                    // Apply job security delta
                    s.manager.jobSecurity = Math.max(0, Math.min(100,
                      s.manager.jobSecurity + resolution.jobSecurityDelta,
                    ))

                    // Shift season expectation if changed
                    if (resolution.newExpectation) {
                      s.manager.seasonExpectation = resolution.newExpectation
                    }

                    // New chairman support level
                    if (resolution.newChairmanSupportLevel !== null) {
                      s.boardInstability.chairmanSupportLevel = resolution.newChairmanSupportLevel
                    }

                    // Competitive window change (advisory for player club)
                    if (resolution.newCompetitiveWindow && s.clubs[clubId]) {
                      s.clubs[clubId].aiPersonality.competitiveWindow = resolution.newCompetitiveWindow
                    }

                    // Record event and update tracking
                    s.boardInstability.lastSpillRound = s.currentRound
                    s.boardInstability.spillHistory.push(resolution.resolvedEvent)

                    // Push news items
                    for (const item of resolution.newsItems) {
                      appendNewsItem(s, item)
                    }

                    // Rare: mid-season dismissal (outcome === 'dismissed')
                    if (resolution.outcome === 'dismissed') {
                      s.manager.jobSecurity = 0
                    }
                  }
                }
              }
            }
          }

          // Tick facility construction (1 round = ~7 days)
          if (s.facilityUpgrades) {
            const { updatedTracker, completedUpgrades } = tickFacilityUpgrades(s.facilityUpgrades, 7, s.currentDate)
            s.facilityUpgrades = updatedTracker
            for (const completed of completedUpgrades) {
              const club = s.clubs[completed.clubId]
              if (club) club.facilities[completed.facility] = completed.toLevel
              const facilityLabel = completed.facility.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
              appendNewsItem(s, {
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `${club?.name ?? completed.clubId} completes ${facilityLabel} upgrade`,
                body: `The ${facilityLabel} has been upgraded to Level ${completed.toLevel}. The new facilities are now operational.`,
                category: 'general',
                clubIds: [completed.clubId],
                playerIds: [],
              })
            }
            // AI facility upgrades
            const aiRng = new SeededRNG(s.rngSeed + s.currentRound * 1337 + 7)
            s.facilityUpgrades = tickAIFacilityUpgrades(
              s.facilityUpgrades, s.clubs, s.playerClubId, aiRng, s.currentDate,
            )
          }

          // Update morale post-match for each club
          for (const m of result.matches) {
            if (!m.result) continue
            const homeSelected = new Set(m.result.homePlayerStats.map((ps) => ps.playerId))
            const awaySelected = new Set(m.result.awayPlayerStats.map((ps) => ps.playerId))
            const homeWon = m.result.homeTotalScore > m.result.awayTotalScore
            const awayWon = m.result.awayTotalScore > m.result.homeTotalScore
            const draw = m.result.homeTotalScore === m.result.awayTotalScore

            // Compute leadership morale bonus
            const homeLeadershipRating = getTeamLeadershipRating(
              [...homeSelected].map(id => s.players[id]).filter(Boolean),
              s.clubs[m.homeClubId]?.leadership,
            )
            const homeMoraleBonus = getLeadershipMoraleBonus(homeLeadershipRating, homeWon)
            const awayLeadershipRating = getTeamLeadershipRating(
              [...awaySelected].map(id => s.players[id]).filter(Boolean),
              s.clubs[m.awayClubId]?.leadership,
            )
            const awayMoraleBonus = getLeadershipMoraleBonus(awayLeadershipRating, awayWon)

            const homeCultureBuf = getCultureMoraleBuffer(s.clubs[m.homeClubId]?.culture)
            const awayCultureBuf = getCultureMoraleBuffer(s.clubs[m.awayClubId]?.culture)
            updateMoralePostMatch(s.players, homeSelected, m.homeClubId, homeWon, draw, homeMoraleBonus, homeCultureBuf)
            updateMoralePostMatch(s.players, awaySelected, m.awayClubId, awayWon, draw, awayMoraleBonus, awayCultureBuf)
          }

          // Between-round morale adjustments (team success, contract, underpayment, etc.)
          const preMoraleSnapshot: Record<string, number> = {}
          for (const p of Object.values(s.players)) {
            if (p.clubId === s.playerClubId) {
              preMoraleSnapshot[p.id] = p.morale
            }
          }
          applyBetweenRoundMorale(s.players, s.clubs, s.ladder, s.currentRound, Object.keys(s.clubs).length)

          // Generate morale warning news for user's team; also add pressure story for unrest
          const userClubName = s.clubs[s.playerClubId]?.name ?? s.playerClubId
          for (const p of Object.values(s.players)) {
            if (p.clubId !== s.playerClubId) continue
            const prevMorale = preMoraleSnapshot[p.id]
            if (prevMorale === undefined) continue
            const warning = generateMoraleWarnings(p, prevMorale, userClubName, s.currentDate)
            if (warning) {
              appendNewsItem(s, warning)
              // Crossed below 30: add player unrest pressure story
              if (p.morale < 30 && prevMorale >= 30) {
                const userClub = s.clubs[s.playerClubId]
                if (userClub) {
                  const unrestStory = generatePlayerUnrestPressureStory(
                    `${p.firstName} ${p.lastName}`,
                    s.currentRound,
                  )
                  userClub.mediaPressure = updateMediaPressure(
                    userClub.mediaPressure,
                    [unrestStory],
                    s.currentRound,
                    false,
                  )
                }
              }
            }
          }

          // Award Brownlow and Club B&F votes for each match
          for (const m of result.matches) {
            if (!m.result) continue
            const allPlayerStats = [...m.result.homePlayerStats, ...m.result.awayPlayerStats]
            const brownlowRound = awardBrownlowVotes(m.id, s.currentRound, allPlayerStats)
            s.brownlowTracker.push(brownlowRound)
            const bfRounds = awardClubBFVotes(m.id, s.currentRound, allPlayerStats, s.players)
            for (const r of bfRounds) s.bfTracker.push(r)
          }

          // Record and announce career milestones reached this round.
          const newMilestones = detectCareerMilestones(
            preRoundCareerStats,
            s.players,
            s.currentYear,
            round.number,
            s.currentDate,
          )
          if (newMilestones.length > 0) {
            for (const milestone of newMilestones) {
              s.history.milestones.push(milestone)
              const milestoneLabel =
                milestone.type === 'games-played'
                  ? `${milestone.threshold} career games`
                  : milestone.type === 'career-goals'
                    ? `${milestone.threshold} career goals`
                    : milestone.type === 'career-disposals'
                      ? `${milestone.threshold} career disposals`
                      : milestone.type === 'career-marks'
                        ? `${milestone.threshold} career marks`
                        : `${milestone.threshold} career tackles`
              appendNewsItem(s, {
                id: crypto.randomUUID(),
                date: s.currentDate,
                headline: `${milestone.playerName} reaches ${milestoneLabel}`,
                body: `${milestone.playerName} hit ${milestone.value} total in ${milestone.type.replace('career-', '').replace('-', ' ')} this round.`,
                category: 'milestone',
                clubIds: [milestone.clubId],
                playerIds: [milestone.playerId],
              })
            }
          }

          // Generate match reports
          if (!s.history.matchReports) s.history.matchReports = []
          for (const m of result.matches) {
            if (!m.result) continue
            const matchPlayerIds = new Set([
              ...m.result.homePlayerStats.map((ps) => ps.playerId),
              ...m.result.awayPlayerStats.map((ps) => ps.playerId),
            ])
            s.history.matchReports.push(generateMatchReport({
              match: m,
              year: s.currentYear,
              round: round.number,
              isFinal: m.isFinal,
              finalType: m.finalType,
              players: s.players as unknown as Record<string, import('@/types/player').Player>,
              clubs: s.clubs as unknown as Record<string, import('@/types/club').Club>,
              ladder: s.ladder as unknown as import('@/types/season').LadderEntry[],
              preLadderPositions,
              injuries: [...allInjuries, ...tacticalInjuryEvents].filter((inj) => matchPlayerIds.has(inj.playerId)),
              tribunalCases: [...resolvedAICases, ...pendingUserCases].filter((c) => c.matchId === m.id),
            }))
          }

          // Accumulate match-day gate revenue and update fan satisfaction
          for (const m of result.matches) {
            if (!m.result) continue

            const homeWon = m.result.homeTotalScore > m.result.awayTotalScore
            const awayWon = m.result.awayTotalScore > m.result.homeTotalScore
            const homeClub = s.clubs[m.homeClubId]
            const awayClub = s.clubs[m.awayClubId]

            // Rivalry check: either club lists the other as a rival
            const isRivalry = !!(
              homeClub?.rivalryClubIds?.includes(m.awayClubId) ||
              awayClub?.rivalryClubIds?.includes(m.homeClubId)
            )

            // Accumulate gate revenue for the home club
            const simCtx = m.result.simulationContext
            if (homeClub && simCtx?.attendance && simCtx.venueId) {
              const gateRevenue = calculateMatchDayRevenue(simCtx.attendance, simCtx.venueId, s.inflationIndex ?? 1.0)
              homeClub.finances.matchDayAccumulated = (homeClub.finances.matchDayAccumulated ?? 0) + gateRevenue
              // Rivalry gate revenue bonus: 15% extra due to higher demand (already in attendance)
              // No additional bonus needed — rivalry attendance boost is built into calculateMatchAttendanceFull
            }

            // Broadcast rights revenue: both clubs benefit, home gets full, away gets 40%
            const matchFixture = s.season.rounds[s.currentRound]?.fixtures.find(
              (f) => f.homeClubId === m.homeClubId && f.awayClubId === m.awayClubId,
            )
            if (matchFixture?.broadcastTier) {
              const broadcastRev = getBroadcastRevenue(matchFixture.broadcastTier)
              if (broadcastRev > 0) {
                if (homeClub) {
                  homeClub.finances.broadcastAccumulated = (homeClub.finances.broadcastAccumulated ?? 0) + broadcastRev
                }
                if (awayClub) {
                  awayClub.finances.broadcastAccumulated = (awayClub.finances.broadcastAccumulated ?? 0) + Math.round(broadcastRev * 0.4)
                }
              }
            }

            // Fan satisfaction: rivalry swing = ±3, normal = ±1
            const swing = isRivalry ? 3 : 1

            // Broadcast satisfaction: marquee = +3, prime = +1, non-broadcast = -1
            const broadcastSatSwing = getBroadcastSatisfactionSwing(matchFixture?.broadcastTier)

            if (homeClub) {
              const current = homeClub.fanSatisfaction ?? 60
              let delta = homeWon ? swing : awayWon ? -swing : 0
              delta += broadcastSatSwing
              // Big crowd bonus (venueScheduling-only, keep existing behaviour)
              if (s.venueState && s.settings.realism.venueScheduling) {
                const assignment = s.venueState.assignments.find(
                  (a) => a.roundNumber === round.number &&
                    round.fixtures[a.fixtureIndex]?.homeClubId === m.homeClubId,
                )
                if (assignment) {
                  const venue = VENUES[assignment.venueId]
                  if (venue && assignment.expectedAttendance > venue.capacity * 0.8) delta += 1
                }
              }
              homeClub.fanSatisfaction = updateFanSatisfaction(current, delta)
            }

            if (awayClub) {
              const current = awayClub.fanSatisfaction ?? 60
              const delta = (awayWon ? swing : homeWon ? -swing : 0) + broadcastSatSwing
              awayClub.fanSatisfaction = updateFanSatisfaction(current, delta)
            }

            // Rivalry news for the user's club
            if (isRivalry && s.playerClubId) {
              const isUserHome = m.homeClubId === s.playerClubId
              const isUserAway = m.awayClubId === s.playerClubId
              if (isUserHome || isUserAway) {
                const userClub = s.clubs[s.playerClubId]
                const opponentId = isUserHome ? m.awayClubId : m.homeClubId
                const opponent = s.clubs[opponentId]
                const userScore = isUserHome ? m.result.homeTotalScore : m.result.awayTotalScore
                const oppScore = isUserHome ? m.result.awayTotalScore : m.result.homeTotalScore
                const userWon = userScore > oppScore
                const isDraw = userScore === oppScore

                const headline = userWon
                  ? `${userClub?.name ?? 'Your club'} defeat rivals ${opponent?.name ?? 'opponent'}`
                  : isDraw
                    ? `${userClub?.name ?? 'Your club'} draw with rivals ${opponent?.name ?? 'opponent'}`
                    : `${userClub?.name ?? 'Your club'} fall to rivals ${opponent?.name ?? 'opponent'}`

                const body = userWon
                  ? `A vital rivalry win for ${userClub?.fullName ?? 'your club'}. The ${userScore}-${oppScore} victory over ${opponent?.fullName ?? 'rivals'} energises supporters and lifts the entire club. Fan satisfaction surges.`
                  : isDraw
                    ? `${userClub?.fullName ?? 'Your club'} and ${opponent?.fullName ?? 'rivals'} played out an intense rivalry draw (${userScore}-${oppScore}). Honours even on the day.`
                    : `A stinging rivalry loss for ${userClub?.fullName ?? 'your club'}. The ${userScore}-${oppScore} defeat to ${opponent?.fullName ?? 'rivals'} weighs heavily on supporters. The board will be watching.`

                appendNewsItem(s, {
                  id: crypto.randomUUID(),
                  date: s.currentDate,
                  headline,
                  body,
                  category: 'match',
                  clubIds: [s.playerClubId, opponentId],
                  playerIds: [],
                })
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

          // Simulate reserves/VFL performances for non-selected players
          const reservesRng = new SeededRNG(s.rngSeed + s.currentRound * 1777 + 19)
          const slContext = buildUserStateLeagueContext(s)
          const reservesResult = simulateReservesRound({
            players: s.players,
            clubs: s.clubs,
            playedPlayerIds: new Set(Object.keys(playedStats)),
            currentRound: s.currentRound + 1,
            currentDate: s.currentDate,
            userClubId: s.playerClubId,
            reserves: s.reserves,
            rng: reservesRng,
            opponentAflClubId: slContext?.opponent?.aflAffiliateId ?? undefined,
            staffImpact: getReservesStaffImpact(Object.values(s.staff), s.playerClubId),
          })
          s.reserves = reservesResult.reserves
          for (const n of reservesResult.news) {
            pushSigningNotification(s, n)
          }
          if (s.reserves.stateLeagueContractDelegationEnabled) {
            const currentDepth = getStateLeagueContractedCount(s.players, s.playerClubId)
            if (currentDepth < s.reserves.stateLeagueContractTargetCount) {
              const toAdd = s.reserves.stateLeagueContractTargetCount - currentDepth
              const added = recruitStateLeagueDepthPlayers(s, s.playerClubId, toAdd, 'recruitment', true)
              for (const playerId of added) {
                s.reserves.playerAvailabilityAssignments[playerId] = 'play'
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
              pushSigningNotification(s, n)
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
              s.inflationIndex ?? 1.0,
            )
            for (const n of aiResult.news) {
              pushSigningNotification(s, n)
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

          const nextRound = s.currentRound + 1
          s.currentRound = nextRound
          const seasonStartDate = s.settings.seasonStartDate ?? '2026-03-20'
          s.currentDate = addDays(seasonStartDate, Math.max(0, nextRound) * 7)
          s.weeklyGameplans = {}
          s.meta.lastSaved = new Date().toISOString()
        })

        // Check if regular season is over (settings-driven round count)
        const updatedState = get()
        if (updatedState.multiTierState) {
          const nextMultiTier = simulateMultiTierRound({
            multiTierState: updatedState.multiTierState,
            clubs: updatedState.clubs,
            players: updatedState.players,
            settings: updatedState.settings,
            roundIndex: state.currentRound,
            rngSeed: updatedState.rngSeed + updatedState.currentYear * 17,
          })
          set((s) => {
            s.multiTierState = nextMultiTier
          })
        }
        const previousPowerSnapshot =
          updatedState.powerRankings.length > 0
            ? updatedState.powerRankings[updatedState.powerRankings.length - 1]
            : null
        const weeklyPowerSnapshot = computeWeeklyPowerRankings({
          year: updatedState.currentYear,
          round: round.number,
          date: updatedState.currentDate,
          clubs: updatedState.clubs,
          players: updatedState.players,
          ladder: updatedState.ladder,
          season: updatedState.season,
          matchResults: updatedState.matchResults,
          previousSnapshot: previousPowerSnapshot,
        })
        set((s) => {
          s.powerRankings.push(weeklyPowerSnapshot)
        })

        if (isRegularSeasonComplete(updatedState.currentRound, updatedState.season.rounds.length)) {
          const calibrationReport = buildSeasonCalibrationReport(updatedState.matchResults)
          set((s) => {
            if (calibrationReport) {
              appendNewsItem(s, {
                id: `season-calibration-${s.currentYear}`,
                date: s.currentDate,
                headline: calibrationReport.headline,
                body: calibrationReport.body,
                category: 'general',
                clubIds: [],
                playerIds: [],
              }, { routeSigning: false })
            }
            s.phase = 'finals'
          })
        }

        // Auto-sim any special events whose scheduled date has passed
        const postRoundState = get()
        if (postRoundState.specialEvents) {
          for (const spe of postRoundState.specialEvents.events) {
            if (spe.status === 'scheduled' && spe.scheduledDate <= postRoundState.currentDate) {
              get().simSpecialEvent(spe.id)
            }
          }
        }

        if (!internal) {
          updateSimulationStatus(set as (fn: (state: GameState) => void) => void, `Round ${round.number} complete.`)
        }
        return { userMatch: result.userMatch }
        } finally {
          if (!internal) {
            finishSimulationStatus(set as (fn: (state: GameState) => void) => void)
          }
        }
      },

      simToEnd: () => {
        const state = get()
        if (state.simulation.active) return
        const totalRounds = state.season.rounds.length
        const roundsRemaining = Math.max(0, totalRounds - state.currentRound)
        startSimulationStatus(
          set as (fn: (state: GameState) => void) => void,
          'Season Simulation',
          `Simulating ${roundsRemaining} round${roundsRemaining === 1 ? '' : 's'} to finals...`,
          roundsRemaining > 0 ? roundsRemaining : null,
        )
        try {
          let completed = 0
          while (get().currentRound < totalRounds && get().phase === 'regular-season') {
            completed += 1
            updateSimulationStatus(
              set as (fn: (state: GameState) => void) => void,
              `Simulating round ${get().currentRound + 1}...`,
              completed,
            )
            get().simCurrentRound({ internal: true })
          }
        } finally {
          finishSimulationStatus(set as (fn: (state: GameState) => void) => void)
        }
      },

      startFinals: () => {
        set((state) => {
          state.phase = 'finals'
        })
      },

      simFinalsRound: () => {
        const preState = get()
        if (preState.simulation.active) return { userMatch: null, seasonOver: false }
        startSimulationStatus(
          set as (fn: (state: GameState) => void) => void,
          'Finals Simulation',
          `Simulating finals week ${preState.season.finalsRounds.length + 1}...`,
        )
        try {
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
              appendNewsItem(s, {
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
          const preFinalsCareerStats: Record<string, Pick<Player['careerStats'], 'gamesPlayed' | 'goals' | 'disposals' | 'marks' | 'tackles'>> = {}
          for (const player of Object.values(state.players)) {
            preFinalsCareerStats[player.id] = {
              gamesPlayed: player.careerStats.gamesPlayed,
              goals: player.careerStats.goals,
              disposals: player.careerStats.disposals,
              marks: player.careerStats.marks,
              tackles: player.careerStats.tackles,
            }
          }
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

          const finalsLineupsByClub: Record<string, Record<string, string>> = {}
          const finalsSubstitutesByClub: Record<string, string | null> = {}
          for (const fixture of round.fixtures) {
            const homeLineup = buildSimLineupForClub(state, fixture.homeClubId)
            const awayLineup = buildSimLineupForClub(state, fixture.awayClubId)
            finalsLineupsByClub[fixture.homeClubId] = homeLineup
            finalsLineupsByClub[fixture.awayClubId] = awayLineup
            finalsSubstitutesByClub[fixture.homeClubId] = buildSimSubstituteForClub(state, fixture.homeClubId, homeLineup)
            finalsSubstitutesByClub[fixture.awayClubId] = buildSimSubstituteForClub(state, fixture.awayClubId, awayLineup)
          }

          const finalsPreLadderPositions: Record<string, number> = {}
          state.ladder.forEach((e, i) => { finalsPreLadderPositions[e.clubId] = i + 1 })

          const result = simulateRound({
            round,
            roundIndex: 100 + finalsWeek, // Offset to avoid colliding with H&A round indices
            players: state.players,
            clubs: state.clubs,
            gameplanOverrides: finalsGameplanOverrides,
            rngSeed: state.rngSeed,
            playerClubId: state.playerClubId,
            matchRules: state.settings.matchRules,
            realism: state.settings.realism,
            injuryFrequency: state.settings.injuryFrequency,
            ladder: state.ladder,
            lineupsByClub: finalsLineupsByClub,
            substitutesByClub: finalsSubstitutesByClub,
          })

          // Mark finals matches
          const finalsResults = result.matches.map((m) => ({ ...m, isFinal: true }))

          set((s) => {
            for (const m of finalsResults) {
              s.matchResults.push(m)
            }
            s.history.recordsBook = updateRecordsBookForMatches({
              recordsBook: s.history.recordsBook,
              matches: finalsResults,
              clubs: s.clubs,
              currentYear: s.currentYear,
            })
            s.history.recordsBook = refreshRecordsBookLeaderboards({
              recordsBook: s.history.recordsBook,
              players: s.players,
              clubs: s.clubs,
              currentYear: s.currentYear,
              history: s.history,
            })
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
            const clubBudget = getClubBudgetAllocation(state.clubs[clubId])
            finalsMedicalImpact[clubId] = getMedicalStaffImpact(staffListForMedical, clubId, getBudgetMultiplier(clubBudget, 'medical'))
          }
          const finalsInjuries = finalsResults.flatMap((m) => {
            if (!m.result) return []
            const matchPlayerIds = [
              ...m.result.homePlayerStats.filter((ps) => ps.participated || ps.minutesPlayed > 0).map((ps) => ps.playerId),
              ...m.result.awayPlayerStats.filter((ps) => ps.participated || ps.minutesPlayed > 0).map((ps) => ps.playerId),
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
            tribunalInbox: state.tribunalInbox,
            enablePriorRecord: state.settings.realism.tribunalPriorRecord,
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
                appendNewsItem(s, {
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

            const finalsmedCentreLevels: Record<string, number> = {}
            for (const [cid, c] of Object.entries(s.clubs)) {
              finalsmedCentreLevels[cid] = c.facilities.medicalCentre
            }
            healInjuries(s.players, s.currentDate, finalsMedicalImpact, finalsmedCentreLevels)
            serveSuspensionWeeks(s.players)

            for (const tribunalCase of resolvedAICases) {
              s.tribunalInbox.push(tribunalCase)
              const player = s.players[tribunalCase.playerId]
              if (!player) continue
              applyTribunalOutcomeToPlayer(player, tribunalCase)
              appendNewsItem(s, {
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

              // Inject tribunal calendar event
              if (tribunalCase.calendarEventId && tribunalCase.hearingDate) {
                s.calendar.events.push({
                  id: tribunalCase.calendarEventId,
                  date: tribunalCase.hearingDate,
                  type: 'tribunal',
                  title: `Tribunal: ${player.firstName} ${player.lastName}`,
                  description: tribunalCase.incidentSummary,
                  data: { caseId: tribunalCase.id },
                  resolved: false,
                })
              }

              appendNewsItem(s, {
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

              // Compute leadership morale bonus
              const homeLeadershipRating = getTeamLeadershipRating(
                [...homeSelected].map(id => s.players[id]).filter(Boolean),
                s.clubs[m.homeClubId]?.leadership,
              )
              const homeMoraleBonus = getLeadershipMoraleBonus(homeLeadershipRating, homeWon)
              const awayLeadershipRating = getTeamLeadershipRating(
                [...awaySelected].map(id => s.players[id]).filter(Boolean),
                s.clubs[m.awayClubId]?.leadership,
              )
              const awayMoraleBonus = getLeadershipMoraleBonus(awayLeadershipRating, awayWon)

              const homeCultureBuf = getCultureMoraleBuffer(s.clubs[m.homeClubId]?.culture)
              const awayCultureBuf = getCultureMoraleBuffer(s.clubs[m.awayClubId]?.culture)
              updateMoralePostMatch(s.players, homeSelected, m.homeClubId, homeWon, draw, homeMoraleBonus, homeCultureBuf)
              updateMoralePostMatch(s.players, awaySelected, m.awayClubId, awayWon, draw, awayMoraleBonus, awayCultureBuf)
            }

            const finalsMilestones = detectCareerMilestones(
              preFinalsCareerStats,
              s.players,
              s.currentYear,
              finalsRoundMarker,
              s.currentDate,
            )
            if (finalsMilestones.length > 0) {
              for (const milestone of finalsMilestones) {
                s.history.milestones.push(milestone)
                const milestoneLabel =
                  milestone.type === 'games-played'
                    ? `${milestone.threshold} career games`
                    : milestone.type === 'career-goals'
                      ? `${milestone.threshold} career goals`
                      : milestone.type === 'career-disposals'
                        ? `${milestone.threshold} career disposals`
                        : milestone.type === 'career-marks'
                          ? `${milestone.threshold} career marks`
                          : `${milestone.threshold} career tackles`
                appendNewsItem(s, {
                  id: crypto.randomUUID(),
                  date: s.currentDate,
                  headline: `${milestone.playerName} reaches ${milestoneLabel}`,
                  body: `${milestone.playerName} hit ${milestone.value} total in ${milestone.type.replace('career-', '').replace('-', ' ')} this finals match.`,
                  category: 'milestone',
                  clubIds: [milestone.clubId],
                  playerIds: [milestone.playerId],
                })
              }
            }

            // Generate finals match reports
            if (!s.history.matchReports) s.history.matchReports = []
            for (const m of finalsResults) {
              if (!m.result) continue
              const matchPlayerIds = new Set([
                ...m.result.homePlayerStats.map((ps) => ps.playerId),
                ...m.result.awayPlayerStats.map((ps) => ps.playerId),
              ])
              s.history.matchReports.push(generateMatchReport({
                match: m,
                year: s.currentYear,
                round: round.number,
                isFinal: true,
                finalType: m.finalType,
                players: s.players as unknown as Record<string, import('@/types/player').Player>,
                clubs: s.clubs as unknown as Record<string, import('@/types/club').Club>,
                ladder: s.ladder as unknown as import('@/types/season').LadderEntry[],
                preLadderPositions: finalsPreLadderPositions,
                injuries: finalsInjuries.filter((inj) => matchPlayerIds.has(inj.playerId)),
                tribunalCases: [...resolvedAICases, ...pendingUserCases].filter((c) => c.matchId === m.id),
              }))
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
              s.history.recordsBook = refreshRecordsBookLeaderboards({
                recordsBook: s.history.recordsBook,
                players: s.players,
                clubs: s.clubs,
                currentYear: s.currentYear,
                history: s.history,
              })

              // Archive origin history for this season
              if (s.specialEvents && s.specialEvents.originStandings && s.specialEvents.originStandings.length > 0) {
                if (!s.history.originHistory) s.history.originHistory = []
                const originMatches = s.specialEvents.events
                  .filter((e) => e.eventId === 'state-of-origin' && e.status === 'completed' && e.result)
                  .map((e) => ({
                    year: e.year,
                    date: e.scheduledDate,
                    teamA: e.teamA.name,
                    teamB: e.teamB.name,
                    scoreA: e.result!.teamAScore,
                    scoreB: e.result!.teamBScore,
                    venue: e.venue,
                    bestOnGround: e.result!.bestOnGround,
                    bestOnGroundName: e.result!.bestOnGround ? s.players[e.result!.bestOnGround]?.firstName + ' ' + s.players[e.result!.bestOnGround]?.lastName : undefined,
                  }))
                const standings = [...s.specialEvents.originStandings]
                // Determine champion: most wins, then highest percentage
                const sorted = [...standings].sort((a, b) => {
                  if (b.wins !== a.wins) return b.wins - a.wins
                  const pctA = a.pointsAgainst > 0 ? a.pointsFor / a.pointsAgainst : a.pointsFor
                  const pctB = b.pointsAgainst > 0 ? b.pointsFor / b.pointsAgainst : b.pointsFor
                  return pctB - pctA
                })
                const champion = sorted.length > 0 ? sorted[0]!.team : null
                s.history.originHistory.push({
                  year: s.currentYear,
                  format: s.settings.specialEvents?.originConfig?.format ?? 'best-of-3',
                  matches: originMatches,
                  champion,
                  standings,
                })
              }

              // Archive full ladder and finals results for history page
              if (!s.history.seasonArchives) s.history.seasonArchives = []
              s.history.seasonArchives.push(
                createSeasonArchive(s.currentYear, s.ladder, s.matchResults.filter(m => m.isFinal))
              )

              // Compute end-of-season awards
              const seasonAwards = computeSeasonAwards(
                s.currentYear,
                s.players,
                s.ladder,
                s.brownlowTracker,
                Object.keys(s.clubs),
                s.bfTracker,
              )
              s.awards.push(seasonAwards)
              s.history.awards.push(buildSeasonAwardRecord(seasonAwards, s.players, s.clubs))

              // News items for awards
              if (seasonAwards.brownlowMedal) {
                const bp = s.players[seasonAwards.brownlowMedal.playerId]
                if (bp) {
                  appendNewsItem(s, {
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
                  appendNewsItem(s, {
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

              if (seasonAwards.risingStar) {
                const rp = s.players[seasonAwards.risingStar.playerId]
                if (rp) {
                  appendNewsItem(s, {
                    id: crypto.randomUUID(),
                    date: s.currentDate,
                    headline: `${rp.firstName} ${rp.lastName} wins the ${s.currentYear} Rising Star`,
                    body: `${rp.firstName} ${rp.lastName} is named the Rising Star winner for ${s.currentYear}.`,
                    category: 'milestone',
                    clubIds: [rp.clubId],
                    playerIds: [rp.id],
                  })
                }
              }

              if (seasonAwards.allAustralian.length > 0) {
                const firstSelection = s.players[seasonAwards.allAustralian[0]]
                appendNewsItem(s, {
                  id: crypto.randomUUID(),
                  date: s.currentDate,
                  headline: `${s.currentYear} All-Australian team announced`,
                  body: firstSelection
                    ? `${seasonAwards.allAustralian.length} players were selected, led by ${firstSelection.firstName} ${firstSelection.lastName}.`
                    : `${seasonAwards.allAustralian.length} players were selected in this year's All-Australian team.`,
                  category: 'milestone',
                  clubIds: [],
                  playerIds: seasonAwards.allAustralian,
                })
              }

              // Club B&F nights are staggered across days 2-19 (never on the same night as the main Awards Night)
              const sortedClubBFEntries = Object.entries(seasonAwards.clubBestAndFairest).sort((a, b) => {
                const rankA = s.ladder.findIndex(e => e.clubId === a[0])
                const rankB = s.ladder.findIndex(e => e.clubId === b[0])
                // Worst-ranked club holds their night first (days 2+)
                return (rankB === -1 ? -1 : rankB) - (rankA === -1 ? -1 : rankA)
              })
              for (let i = 0; i < sortedClubBFEntries.length; i++) {
                const [clubId, winnerRaw] = sortedClubBFEntries[i]!
                const winnerId = typeof winnerRaw === 'string' ? winnerRaw : winnerRaw.winnerId
                const club = s.clubs[clubId]
                const player = s.players[winnerId]
                if (!club || !player) continue
                const clubNightDate = addDays(s.currentDate, 2 + i)
                appendNewsItem(s, {
                  id: crypto.randomUUID(),
                  date: clubNightDate,
                  headline: `${player.firstName} ${player.lastName} wins ${club.name}'s Best and Fairest`,
                  body: `${player.firstName} ${player.lastName} has been named ${club.fullName}'s Best and Fairest for ${s.currentYear}.`,
                  category: 'milestone',
                  clubIds: [clubId],
                  playerIds: [winnerId],
                })
              }

              if (premier) {
                appendNewsItem(s, {
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

          set((s) => {
            s.currentDate = addDays(s.currentDate, 7)
          })

          const postFinalsState = get()
          const previousPowerSnapshot =
            postFinalsState.powerRankings.length > 0
              ? postFinalsState.powerRankings[postFinalsState.powerRankings.length - 1]
              : null
          const finalsPowerSnapshot = computeWeeklyPowerRankings({
            year: postFinalsState.currentYear,
            round: finalsRoundMarker,
            date: postFinalsState.currentDate,
            clubs: postFinalsState.clubs,
            players: postFinalsState.players,
            ladder: postFinalsState.ladder,
            season: postFinalsState.season,
            matchResults: postFinalsState.matchResults,
            previousSnapshot: previousPowerSnapshot,
          })
          set((s) => {
            s.powerRankings.push(finalsPowerSnapshot)
          })

          return { userMatch: result.userMatch, seasonOver }
        } catch {
          // Finals module not available yet
          return { userMatch: null, seasonOver: false }
        }
        } finally {
          finishSimulationStatus(set as (fn: (state: GameState) => void) => void)
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
          merged.history = {
            seasons: [],
            draftHistory: [],
            developmentReports: [],
            playerSeasonStats: [],
            awards: [],
            milestones: [],
            retirementLegacies: [],
            originHistory: [],
            recordsBook: createDefaultRecordsBook(),
            seasonArchives: [],
            matchReports: [],
          }
        }
        if (merged.history && !(merged.history as { developmentReports?: unknown }).developmentReports) {
          ;(merged.history as import('@/types/history').GameHistory).developmentReports = []
        }
        if (merged.history && !(merged.history as { playerSeasonStats?: unknown }).playerSeasonStats) {
          ;(merged.history as import('@/types/history').GameHistory).playerSeasonStats = []
        }
        if (merged.history && !(merged.history as { awards?: unknown }).awards) {
          ;(merged.history as import('@/types/history').GameHistory).awards = []
        }
        if (merged.history && !(merged.history as { milestones?: unknown }).milestones) {
          ;(merged.history as import('@/types/history').GameHistory).milestones = []
        }
        if (merged.history && !(merged.history as { retirementLegacies?: unknown }).retirementLegacies) {
          ;(merged.history as import('@/types/history').GameHistory).retirementLegacies = []
        }
        if (merged.history && !(merged.history as { originHistory?: unknown }).originHistory) {
          ;(merged.history as import('@/types/history').GameHistory).originHistory = []
        }
        if (merged.history && !(merged.history as { recordsBook?: unknown }).recordsBook) {
          ;(merged.history as import('@/types/history').GameHistory).recordsBook = createDefaultRecordsBook()
        }
        if (merged.history && !(merged.history as { seasonArchives?: unknown }).seasonArchives) {
          ;(merged.history as import('@/types/history').GameHistory).seasonArchives = []
        }
        if (merged.history) {
          ;(merged.history as import('@/types/history').GameHistory).recordsBook = normalizeRecordsBook(
            (merged.history as import('@/types/history').GameHistory).recordsBook,
          )
        }

        // Backfill originConfig on old saves
        if (merged.settings?.specialEvents && !(merged.settings.specialEvents as { originConfig?: unknown }).originConfig) {
          ;(merged.settings.specialEvents as import('@/types/specialEvents').SpecialEventsSettings).originConfig = {
            format: 'best-of-3',
            matchCount: 3,
            participatingStates: ['VIC', 'SA', 'WA'],
            alliesEnabled: false,
            alliesStates: ['QLD', 'NSW', 'TAS', 'NT'],
            alliesName: 'Allies',
            scheduleMode: 'mid-season-block',
            matchDay: 'wednesday',
            includeShowdownFinal: false,
            showdownFinalTiming: 'before-gf',
            showdownFinalVenue: 'MCG',
          }
        }

        // Backfill originStandings on specialEvents state
        if (merged.specialEvents && !(merged.specialEvents as { originStandings?: unknown }).originStandings) {
          ;(merged.specialEvents as import('@/types/specialEvents').SpecialEventsState).originStandings = []
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

        if (merged.settings && !merged.settings.ladderSorting) {
          merged.settings.ladderSorting = {
            primary: 'points',
            tieBreakers: ['percentage', 'wins', 'pointsFor', 'clubId'],
          }
        }
        if (merged.settings && !merged.settings.fixturePolicy) {
          merged.settings.fixturePolicy = {
            homeAwayBalance: true,
            travelWeighting: 40,
            venueSharingRules: true,
          }
        }
        if (merged.settings && !merged.settings.customRivalryPairs) {
          merged.settings.customRivalryPairs = []
        }
        if (merged.settings && !merged.settings.leagueNamingTemplate) {
          merged.settings.leagueNamingTemplate = 'real-life'
        }
        if (merged.settings && merged.settings.includePathwayLeagues === undefined) {
          merged.settings.includePathwayLeagues = true
        }
        if ((merged as Record<string, unknown>).youthPathway === undefined) {
          ;(merged as Record<string, unknown>).youthPathway = null
        }
        const matchRulesSettingsObj = merged.settings?.matchRules as unknown as Record<string, unknown> | undefined
        if (matchRulesSettingsObj && matchRulesSettingsObj.enableSubstitutes === undefined) {
          matchRulesSettingsObj.enableSubstitutes = false
        }
        if ((merged as Record<string, unknown>).selectedSubstituteId === undefined) {
          ;(merged as Record<string, unknown>).selectedSubstituteId = null
        }
        if (merged.settings && !(merged.settings as { notifications?: unknown }).notifications) {
          merged.settings.notifications = {
            signings: {
              starThreshold: 4,
              inApp: true,
              email: true,
              dailyDigest: false,
            },
          }
        }
        const notificationSettings = merged.settings?.notifications as unknown as Record<string, unknown> | undefined
        if (notificationSettings) {
          if (!('signings' in notificationSettings) || typeof notificationSettings.signings !== 'object' || !notificationSettings.signings) {
            notificationSettings.signings = {
              starThreshold: 4,
              inApp: true,
              email: true,
              dailyDigest: false,
            }
          }
          const signingSettings = notificationSettings.signings as Record<string, unknown>
          if (!('starThreshold' in signingSettings)) signingSettings.starThreshold = 4
          if (!('inApp' in signingSettings)) signingSettings.inApp = true
          if (!('email' in signingSettings)) signingSettings.email = true
          if (!('dailyDigest' in signingSettings)) signingSettings.dailyDigest = false
        }
        if (merged.settings && !(merged.settings as { stateLeagueAffiliations?: unknown }).stateLeagueAffiliations) {
          merged.settings.stateLeagueAffiliations = {
            allowCustomAffiliations: false,
            clubAffiliations: {},
          }
        }
        const affiliationSettings = merged.settings?.stateLeagueAffiliations as unknown as Record<string, unknown> | undefined
        if (affiliationSettings) {
          if (!('allowCustomAffiliations' in affiliationSettings)) affiliationSettings.allowCustomAffiliations = false
          if (
            !('clubAffiliations' in affiliationSettings) ||
            typeof affiliationSettings.clubAffiliations !== 'object' ||
            !affiliationSettings.clubAffiliations
          ) {
            affiliationSettings.clubAffiliations = {}
          }
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
        if (merged.stateLeagues) {
          for (const league of Object.values(merged.stateLeagues)) {
            if (!league) continue
            if (!(league as import('@/types/stateLeague').StateLeague).branding) {
              ;(league as import('@/types/stateLeague').StateLeague).branding = {
                logoText: league.name,
                primaryColor: '#1f2937',
                secondaryColor: '#e5e7eb',
              }
            }
            if (!(league as import('@/types/stateLeague').StateLeague).divisions) {
              ;(league as import('@/types/stateLeague').StateLeague).divisions = [
                { id: 'overall', name: 'Overall', clubIds: league.clubs.map((c) => c.id) },
              ]
            }
            if (!(league as import('@/types/stateLeague').StateLeague).ladderRules) {
              ;(league as import('@/types/stateLeague').StateLeague).ladderRules = {
                pointsForWin: 4,
                pointsForDraw: 2,
                pointsForLoss: 0,
                primarySort: 'points',
                tieBreakers: ['percentage', 'wins', 'pointsFor', 'clubId'],
              }
            }
            if (!(league as import('@/types/stateLeague').StateLeague).fixtureRules) {
              ;(league as import('@/types/stateLeague').StateLeague).fixtureRules = {
                rounds: league.season.rounds.length > 0 ? league.season.rounds.length : 18,
                homeAwayBalance: true,
              }
            }
            if (!(league as import('@/types/stateLeague').StateLeague).finalsRules) {
              ;(league as import('@/types/stateLeague').StateLeague).finalsRules = {
                format: 'top-8',
                qualifyingTeams: Math.min(8, Math.max(2, league.clubs.length)),
              }
            }
            if (!(league as import('@/types/stateLeague').StateLeague).history) {
              ;(league as import('@/types/stateLeague').StateLeague).history = []
            }
          }
        }
        if ((merged as Record<string, unknown>).multiTierState === undefined) {
          ;(merged as Record<string, unknown>).multiTierState = null
        }
        if (!merged.weekSchedule) {
          merged.weekSchedule = {}
        }
        if (merged.offseasonState === undefined) {
          merged.offseasonState = null
        }
        if (merged.offseasonState && !(merged.offseasonState as { practiceMatchState?: unknown }).practiceMatchState) {
          ;(merged.offseasonState as { practiceMatchState: PracticeMatchState }).practiceMatchState =
            { scheduled: [], results: [], delegated: false }
        }
        if (!merged.trainingWeekPlan) {
          merged.trainingWeekPlan = null
        }

        // Sync currentSpend for all clubs on load (old saves may have stale values)
        if (merged.players && merged.clubs) {
          const allPlayers = Object.values(merged.players)
          for (const club of Object.values(merged.clubs)) {
            if (!club.identity) {
              club.identity = createInitialClubIdentity(club, merged.currentYear ?? 2026)
            }
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
        if (realismObj && !('tacticalInjuryConsequences' in realismObj)) {
          realismObj.tacticalInjuryConsequences = true
        }
        if (realismObj && !('tacticalSuspensionConsequences' in realismObj)) {
          realismObj.tacticalSuspensionConsequences = true
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
        if (realismObj && !('boardPolitics' in realismObj)) {
          realismObj.boardPolitics = true
        }
        if (realismObj && !('aflHouseExpansionEvolution' in realismObj)) {
          realismObj.aflHouseExpansionEvolution = true
        }
        if (realismObj && !('aflHouseCompetitionEvolution' in realismObj)) {
          realismObj.aflHouseCompetitionEvolution = true
        }
        if (realismObj && !('aflHouseFinalsEvolution' in realismObj)) {
          realismObj.aflHouseFinalsEvolution = true
        }
        if (realismObj && !('aflHouseListRulesEvolution' in realismObj)) {
          realismObj.aflHouseListRulesEvolution = true
        }
        if (realismObj && !('aflHouseSalaryCapEvolution' in realismObj)) {
          realismObj.aflHouseSalaryCapEvolution = true
        }
        if (realismObj && !('aflHouseFixtureEvolution' in realismObj)) {
          realismObj.aflHouseFixtureEvolution = true
        }

        if (merged.leagueConfig) {
          const leagueConfigObj = merged.leagueConfig as unknown as Record<string, unknown>
          if (!leagueConfigObj.competitionModel) {
            leagueConfigObj.competitionModel = 'single-table'
          }
          if (!('enablePromotionRelegation' in leagueConfigObj)) {
            leagueConfigObj.enablePromotionRelegation = false
          }
          if (!('tierCount' in leagueConfigObj)) {
            leagueConfigObj.tierCount = 1
          }
          if (!('promotionRelegationSpots' in leagueConfigObj)) {
            leagueConfigObj.promotionRelegationSpots = 1
          }
          if (!('clubTierMap' in leagueConfigObj)) {
            leagueConfigObj.clubTierMap = {}
          }
        }

        // Migrate brownlowRevealed
        if ((merged as Record<string, unknown>).brownlowRevealed === undefined) {
          (merged as Record<string, unknown>).brownlowRevealed = false
        }
        // Migrate awardsNightCompleted (treat old brownlowRevealed as equivalent)
        if ((merged as Record<string, unknown>).awardsNightCompleted === undefined) {
          (merged as Record<string, unknown>).awardsNightCompleted =
            (merged as Record<string, unknown>).brownlowRevealed ?? false
        }
        if ((merged as Record<string, unknown>).tradeInbox === undefined) {
          (merged as Record<string, unknown>).tradeInbox = []
        }
        if ((merged as Record<string, unknown>).emailLog === undefined) {
          (merged as Record<string, unknown>).emailLog = []
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
        if ((merged as Record<string, unknown>).savedLineups === undefined) {
          (merged as Record<string, unknown>).savedLineups = []
        }
        const savedLineupsObj = (merged as Record<string, unknown>).savedLineups
        if (Array.isArray(savedLineupsObj)) {
          ;(merged as Record<string, unknown>).savedLineups = savedLineupsObj.map((entryRaw, idx) => {
            const entry = (entryRaw as Record<string, unknown>) ?? {}
            const weeklyRaw = (entry.weeklyGameplanSnapshot as Record<string, unknown> | null) ?? null
            const reservesRaw = (entry.reservesSnapshot as Record<string, unknown> | null) ?? null
            return {
              id: String(entry.id ?? `lineup-save-${idx}`),
              name: String(entry.name ?? `Lineup ${idx + 1}`),
              clubId: String(entry.clubId ?? merged.playerClubId ?? ''),
              savedAt: String(entry.savedAt ?? new Date().toISOString()),
              seasonYear: Number(entry.seasonYear ?? merged.currentYear ?? 2026),
              round: Number(entry.round ?? merged.currentRound ?? 0),
              opponentClubId: entry.opponentClubId ? String(entry.opponentClubId) : null,
              matchRules: {
                interchangePlayers: Number((entry.matchRules as Record<string, unknown> | undefined)?.interchangePlayers ?? merged.settings?.matchRules?.interchangePlayers ?? 5),
                enableSubstitutes: Boolean((entry.matchRules as Record<string, unknown> | undefined)?.enableSubstitutes ?? merged.settings?.matchRules?.enableSubstitutes ?? false),
                quartersPerMatch: Number((entry.matchRules as Record<string, unknown> | undefined)?.quartersPerMatch ?? merged.settings?.matchRules?.quartersPerMatch ?? 4),
              },
              lineup: { ...((entry.lineup as Record<string, string> | undefined) ?? {}) },
              benchPlayerIds: Array.isArray(entry.benchPlayerIds) ? (entry.benchPlayerIds as string[]) : [],
              substitutePlayerId: entry.substitutePlayerId ? String(entry.substitutePlayerId) : null,
              weeklyGameplanSnapshot: weeklyRaw
                ? {
                    overrides: { ...((weeklyRaw.overrides as Record<string, unknown> | undefined) ?? {}) } as Partial<ClubGameplan>,
                    matchupTactics: {
                      hardTags: Array.isArray((weeklyRaw.matchupTactics as Record<string, unknown> | undefined)?.hardTags)
                        ? [ ...((weeklyRaw.matchupTactics as Record<string, unknown>).hardTags as WeeklyMatchupTactics['hardTags']) ]
                        : [],
                      physicalAttention: Array.isArray((weeklyRaw.matchupTactics as Record<string, unknown> | undefined)?.physicalAttention)
                        ? [ ...((weeklyRaw.matchupTactics as Record<string, unknown>).physicalAttention as WeeklyMatchupTactics['physicalAttention']) ]
                        : [],
                      roleAssignments: Array.isArray((weeklyRaw.matchupTactics as Record<string, unknown> | undefined)?.roleAssignments)
                        ? [ ...((weeklyRaw.matchupTactics as Record<string, unknown>).roleAssignments as WeeklyMatchupTactics['roleAssignments']) ]
                        : [],
                    },
                    opponentClubId: weeklyRaw.opponentClubId ? String(weeklyRaw.opponentClubId) : null,
                  }
                : null,
              reservesSnapshot: reservesRaw
                ? {
                    managedLineupPlayerIds: Array.isArray(reservesRaw.managedLineupPlayerIds)
                      ? (reservesRaw.managedLineupPlayerIds as string[])
                      : [],
                    managedLineupSlotAssignments: {
                      ...((reservesRaw.managedLineupSlotAssignments as Record<string, string> | undefined) ?? {}),
                    },
                    playerAvailabilityAssignments: {
                      ...((reservesRaw.playerAvailabilityAssignments as Record<string, 'play' | 'rest'> | undefined) ?? {}),
                    },
                  }
                : null,
            }
          })
        }
        if ((merged as Record<string, unknown>).powerRankings === undefined) {
          (merged as Record<string, unknown>).powerRankings = []
        }
        if ((merged as Record<string, unknown>).reserves === undefined) {
          ;(merged as Record<string, unknown>).reserves = {
            seasonStatsByPlayer: {},
            lastRoundPerformances: [],
            promotionWatchlist: [],
            delegationEnabled: true,
            managedLineupPlayerIds: [],
            managedLineupSlotAssignments: {},
            playerAvailabilityAssignments: {},
            lastSelectedLineupPlayerIds: [],
            leadership: {
              captainId: null,
              viceCaptainId: null,
              leadershipGroupIds: [],
            },
            tactics: {
              tempo: 'balanced',
              aggression: 'balanced',
              youthFocus: true,
            },
            stateLeagueContractDelegationEnabled: true,
            stateLeagueContractTargetCount: DEFAULT_STATE_LEAGUE_CONTRACT_TARGET,
          }
        }
        const reservesObj = (merged as Record<string, unknown>).reserves as Record<string, unknown> | undefined
        if (reservesObj) {
          if (!('seasonStatsByPlayer' in reservesObj)) reservesObj.seasonStatsByPlayer = {}
          if (!('lastRoundPerformances' in reservesObj)) reservesObj.lastRoundPerformances = []
          if (!('promotionWatchlist' in reservesObj)) reservesObj.promotionWatchlist = []
          if (!('delegationEnabled' in reservesObj)) reservesObj.delegationEnabled = true
          if (!('managedLineupPlayerIds' in reservesObj)) reservesObj.managedLineupPlayerIds = []
          if (!('managedLineupSlotAssignments' in reservesObj)) reservesObj.managedLineupSlotAssignments = {}
          if (!('playerAvailabilityAssignments' in reservesObj)) reservesObj.playerAvailabilityAssignments = {}
          if (!('lastSelectedLineupPlayerIds' in reservesObj)) reservesObj.lastSelectedLineupPlayerIds = []
          if (!('leadership' in reservesObj)) {
            reservesObj.leadership = {
              captainId: null,
              viceCaptainId: null,
              leadershipGroupIds: [],
            }
          }
          if (!('tactics' in reservesObj)) {
            reservesObj.tactics = {
              tempo: 'balanced',
              aggression: 'balanced',
              youthFocus: true,
            }
          }
          if (!('stateLeagueContractDelegationEnabled' in reservesObj)) {
            reservesObj.stateLeagueContractDelegationEnabled = true
          }
          if (!('stateLeagueContractTargetCount' in reservesObj)) {
            reservesObj.stateLeagueContractTargetCount = DEFAULT_STATE_LEAGUE_CONTRACT_TARGET
          }
          const leadershipObj = reservesObj.leadership as Record<string, unknown> | undefined
          if (leadershipObj) {
            if (!('captainId' in leadershipObj)) leadershipObj.captainId = null
            if (!('viceCaptainId' in leadershipObj)) leadershipObj.viceCaptainId = null
            if (!('leadershipGroupIds' in leadershipObj)) leadershipObj.leadershipGroupIds = []
          }
          const tacticsObj = reservesObj.tactics as Record<string, unknown> | undefined
          if (tacticsObj) {
            if (!('tempo' in tacticsObj)) tacticsObj.tempo = 'balanced'
            if (!('aggression' in tacticsObj)) tacticsObj.aggression = 'balanced'
            if (!('youthFocus' in tacticsObj)) tacticsObj.youthFocus = true
          }
        }
        if ((merged as Record<string, unknown>).manager === undefined) {
          ;(merged as Record<string, unknown>).manager = {
            name: 'Manager',
            employmentStatus: 'employed',
            currentClubId: merged.playerClubId || null,
            reputation: 50,
            jobSecurity: 65,
            seasonExpectation: 'Deliver consistent improvement.',
            unemployedSinceYear: null,
          }
        }
        if ((merged as Record<string, unknown>).coachingJobMarket === undefined) {
          ;(merged as Record<string, unknown>).coachingJobMarket = []
        }
        if ((merged as Record<string, unknown>).simulation === undefined) {
          ;(merged as Record<string, unknown>).simulation = { ...DEFAULT_SIMULATION_STATUS }
        }
        if ((merged as Record<string, unknown>).jumperManagement === undefined) {
          ;(merged as Record<string, unknown>).jumperManagement = {
            pending: false,
            seasonYear: null,
            lastCompletedYear: null,
          }
        }
        if ((merged as Record<string, unknown>).facilityUpgrades === undefined) {
          ;(merged as Record<string, unknown>).facilityUpgrades = {
            requests: [],
            activeConstructionByClub: {},
            denialCooldowns: {},
          }
        }
        if ((merged as Record<string, unknown>).boardApprovals === undefined) {
          ;(merged as Record<string, unknown>).boardApprovals = {
            records: [],
            denialCooldowns: {},
          }
        }
        if ((merged as Record<string, unknown>).boardInstability === undefined || (merged as Record<string, unknown>).boardInstability === null) {
          ;(merged as Record<string, unknown>).boardInstability = createInitialBoardInstabilityState()
        } else {
          // Backfill any missing fields on existing saves
          const bi = (merged as Record<string, unknown>).boardInstability as Record<string, unknown>
          if (!('spillHistory' in bi)) bi.spillHistory = []
          if (!('lastSpillRound' in bi)) bi.lastSpillRound = -1
          if (!('chairmanSupportLevel' in bi)) bi.chairmanSupportLevel = 50
          if (!('score' in bi)) bi.score = 0
          if (!('consecutiveLosses' in bi)) bi.consecutiveLosses = 0
        }
        if ((merged as Record<string, unknown>).signingInteractionPlayerIds === undefined) {
          ;(merged as Record<string, unknown>).signingInteractionPlayerIds = []
        }
        if ((merged as Record<string, unknown>).signingWatchlistPlayerIds === undefined) {
          ;(merged as Record<string, unknown>).signingWatchlistPlayerIds = []
        }
        if ((merged as Record<string, unknown>).signingShortlistPlayerIds === undefined) {
          ;(merged as Record<string, unknown>).signingShortlistPlayerIds = []
        }
        if ((merged as Record<string, unknown>).shortlists === undefined) {
          ;(merged as Record<string, unknown>).shortlists = []
        }
        const shortlistsRaw = (merged as Record<string, unknown>).shortlists
        if (Array.isArray(shortlistsRaw)) {
          ;(merged as Record<string, unknown>).shortlists = shortlistsRaw.map((rawItem, idx) => {
            const raw = (rawItem as Record<string, unknown>) ?? {}
            const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
            const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt
            const entriesRaw = Array.isArray(raw.entries) ? raw.entries : []
            return {
              id: String(raw.id ?? `shortlist-${idx}`),
              name: String(raw.name ?? `Shortlist ${idx + 1}`),
              createdAt,
              updatedAt,
              entries: entriesRaw
                .map((entryRaw) => {
                  const entry = (entryRaw as Record<string, unknown>) ?? {}
                  const targetType: ShortlistTargetType | null =
                    entry.targetType === 'prospect' ? 'prospect'
                    : entry.targetType === 'player' ? 'player'
                    : null
                  const targetId = typeof entry.targetId === 'string' ? entry.targetId : ''
                  if (!targetType || !targetId) return null
                  const priority: ShortlistPriority =
                    entry.priority === 'low' || entry.priority === 'high' || entry.priority === 'critical'
                      ? entry.priority
                      : 'medium'
                  return {
                    targetType,
                    targetId,
                    note: typeof entry.note === 'string' ? entry.note : '',
                    priority,
                    addedAt: typeof entry.addedAt === 'string' ? entry.addedAt : createdAt,
                    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : updatedAt,
                  }
                })
                .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
            } satisfies Shortlist
          })
        } else {
          ;(merged as Record<string, unknown>).shortlists = []
        }
        const mergedShortlists = (merged as Record<string, unknown>).shortlists as Shortlist[]
        const legacyWatchlist = ensureShortlist(
          merged as Pick<GameState, 'shortlists'>,
          LEGACY_SIGNING_WATCHLIST_ID,
          LEGACY_SIGNING_WATCHLIST_NAME,
        )
        const legacyShortlist = ensureShortlist(
          merged as Pick<GameState, 'shortlists'>,
          LEGACY_SIGNING_SHORTLIST_ID,
          LEGACY_SIGNING_SHORTLIST_NAME,
        )
        const watchIds = Array.isArray((merged as Record<string, unknown>).signingWatchlistPlayerIds)
          ? ((merged as Record<string, unknown>).signingWatchlistPlayerIds as string[])
          : []
        const shortIds = Array.isArray((merged as Record<string, unknown>).signingShortlistPlayerIds)
          ? ((merged as Record<string, unknown>).signingShortlistPlayerIds as string[])
          : []
        const migrationNow = new Date().toISOString()
        for (const playerId of watchIds) {
          if (!playerId || findShortlistEntryIndex(legacyWatchlist, 'player', playerId) !== -1) continue
          legacyWatchlist.entries.push({
            targetType: 'player',
            targetId: playerId,
            note: '',
            priority: 'medium',
            addedAt: migrationNow,
            updatedAt: migrationNow,
          })
        }
        for (const playerId of shortIds) {
          if (!playerId || findShortlistEntryIndex(legacyShortlist, 'player', playerId) !== -1) continue
          legacyShortlist.entries.push({
            targetType: 'player',
            targetId: playerId,
            note: '',
            priority: 'medium',
            addedAt: migrationNow,
            updatedAt: migrationNow,
          })
        }
        for (const list of mergedShortlists) {
          list.updatedAt = list.updatedAt || migrationNow
          list.createdAt = list.createdAt || list.updatedAt
        }
        syncLegacySigningArrays(merged as Pick<GameState, 'shortlists' | 'signingWatchlistPlayerIds' | 'signingShortlistPlayerIds'>)
        ;(merged as Record<string, unknown>).simulation = { ...DEFAULT_SIMULATION_STATUS }

        // Backfill specialEvents for old saves
        if ((merged as Record<string, unknown>).specialEvents === undefined) {
          ;(merged as Record<string, unknown>).specialEvents = null
        }
        if (merged.settings && !(merged.settings as unknown as Record<string, unknown>).specialEvents) {
          ;(merged.settings as unknown as Record<string, unknown>).specialEvents = {
            enabled: true,
            events: {
              'international-rules': true,
              'state-of-origin': true,
              'aboriginal-all-stars': true,
              'preseason-showcase': true,
              'all-australian-vs-rest': true,
            },
            autoSchedule: true,
            originEligibility: 'birthplace',
          }
        }
        if (realismObj && realismObj.specialEventPlayerImpact === undefined) {
          realismObj.specialEventPlayerImpact = true
        }
        // Backfill tribunal realism settings for old saves
        if (realismObj && realismObj.tribunalEarlyPleaDiscount === undefined) {
          realismObj.tribunalEarlyPleaDiscount = true
        }
        if (realismObj && realismObj.tribunalLegalRepresentation === undefined) {
          realismObj.tribunalLegalRepresentation = true
        }
        if (realismObj && realismObj.tribunalPriorRecord === undefined) {
          realismObj.tribunalPriorRecord = true
        }
        // Backfill originEligibility for saves that have specialEvents settings but lack the field
        const speSettingsObj = (merged.settings as unknown as Record<string, unknown>)?.specialEvents as Record<string, unknown> | undefined
        if (speSettingsObj && speSettingsObj.originEligibility === undefined) {
          speSettingsObj.originEligibility = 'birthplace'
        }

        const managerObj = (merged as Record<string, unknown>).manager as Record<string, unknown> | undefined
        if (managerObj) {
          if (!('name' in managerObj)) managerObj.name = 'Manager'
          if (!('employmentStatus' in managerObj)) managerObj.employmentStatus = merged.playerClubId ? 'employed' : 'unemployed'
          if (!('currentClubId' in managerObj)) managerObj.currentClubId = merged.playerClubId || null
          if (!('reputation' in managerObj)) managerObj.reputation = 50
          if (!('jobSecurity' in managerObj)) managerObj.jobSecurity = 65
          if (!('seasonExpectation' in managerObj)) managerObj.seasonExpectation = 'Deliver consistent improvement.'
          if (!('unemployedSinceYear' in managerObj)) managerObj.unemployedSinceYear = null
          if ((managerObj.employmentStatus as string) === 'employed' && !managerObj.currentClubId && merged.playerClubId) {
            managerObj.currentClubId = merged.playerClubId
          }
        }
        enforceSingleClubCareerInvariant(merged)

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
            // Backfill new scout specialization attributes added in this version
            const scoutObj = scout as unknown as Record<string, unknown>
            if (scoutObj.youthFocus === undefined) scoutObj.youthFocus = 50
            if (scoutObj.currentRatingAccuracy === undefined) scoutObj.currentRatingAccuracy = 60
            if (scoutObj.projectionAccuracy === undefined) scoutObj.projectionAccuracy = 60
            if (!scoutObj.preferenceWeights) {
              scoutObj.preferenceWeights = { physicality: 0, skill: 0, upside: 0 }
            } else {
              const pw = scoutObj.preferenceWeights as Record<string, unknown>
              if (pw.physicality === undefined) pw.physicality = 0
              if (pw.skill === undefined) pw.skill = 0
              if (pw.upside === undefined) pw.upside = 0
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
            if ((player as { trainingFocus?: unknown }).trainingFocus === undefined) {
              player.trainingFocus = null
            }
            if (!(player as { upskillPlans?: unknown }).upskillPlans) {
              player.upskillPlans = []
            }
            if (!(player as { contractTier?: unknown }).contractTier) {
              player.contractTier = 'afl-listed'
            }
            if ((player as { stateLeagueContract?: unknown }).stateLeagueContract === undefined) {
              player.stateLeagueContract = null
            }
            if (!(player as { contractHistory?: unknown }).contractHistory) {
              player.contractHistory = []
            }
            if (!(player as { jumperHistory?: unknown }).jumperHistory) {
              player.jumperHistory = []
            }
            if (player.clubId && isValidJumperNumber(player.jerseyNumber)) {
              upsertPlayerJumperHistory(player, merged.currentYear ?? 2026)
            }
            syncPlayerPositionRatings(player)
          }
        }

        if (merged.players && merged.clubs) {
          normalizeAllClubJumperNumbers({
            players: merged.players,
            clubs: merged.clubs,
            currentYear: merged.currentYear ?? 2026,
          })
        }

        if (merged.history && merged.clubs && merged.players) {
          const history = merged.history as import('@/types/history').GameHistory
          const playedMatches = (merged.matchResults ?? []).filter((m): m is Match => Boolean(m?.result))
          history.recordsBook = updateRecordsBookForMatches({
            recordsBook: history.recordsBook,
            matches: playedMatches,
            clubs: merged.clubs,
            currentYear: merged.currentYear ?? 2026,
          })
          history.recordsBook = refreshRecordsBookLeaderboards({
            recordsBook: history.recordsBook,
            players: merged.players,
            clubs: merged.clubs,
            currentYear: merged.currentYear ?? 2026,
            history,
          })
        }

        if (merged.newsLog) {
          merged.newsLog = merged.newsLog.map((item) => applyMediaCoverage(item))
        }
        if (merged.emailLog) {
          merged.emailLog = merged.emailLog.map((item) => applyMediaCoverage(item))
        }

        // Migrate inflation fields
        if ((merged as Record<string, unknown>).inflationIndex === undefined) {
          (merged as Record<string, unknown>).inflationIndex = 1.0
        }
        if ((merged as Record<string, unknown>).inflationHistory === undefined) {
          (merged as Record<string, unknown>).inflationHistory = []
        }
        if (merged.settings && !merged.settings.inflation) {
          merged.settings.inflation = { ...DEFAULT_INFLATION_SETTINGS }
        }

        // Migrate agent relationships
        if ((merged as Record<string, unknown>).agentRelationships === undefined) {
          (merged as Record<string, unknown>).agentRelationships = {}
        }

        // Migrate realism.allowLoans
        if (merged.settings?.realism && (merged.settings.realism as unknown as Record<string, unknown>).allowLoans === undefined) {
          (merged.settings.realism as unknown as Record<string, unknown>).allowLoans = true
        }

        // Migrate marketing budget field in club budget allocations
        if (merged.clubs) {
          for (const club of Object.values(merged.clubs)) {
            const c = club as import('@/types/club').Club
            if (c.budgetAllocation && (c.budgetAllocation as unknown as Record<string, unknown>).marketing === undefined) {
              // Will be auto-normalised by normaliseBudgetAllocation() on first access
              // Ensure the loans array is initialised
            }
            if (!c.finances.loans) {
              (c.finances as unknown as Record<string, unknown>).loans = []
            }
          }
        }

        // v6: Add slot + satisfaction to sponsorship deals; seed empty sponsorshipOffers
        if (merged.clubs) {
          for (const club of Object.values(merged.clubs)) {
            const c = club as unknown as Record<string, unknown>
            const deals = c['sponsorshipDeals'] as Record<string, unknown>[] | undefined
            if (Array.isArray(deals)) {
              for (const d of deals) {
                if (!d['slot']) d['slot'] = 'major'
                if (d['satisfaction'] == null) d['satisfaction'] = 70
              }
            }
          }
        }
        if (!Array.isArray((merged as Record<string, unknown>).sponsorshipOffers)) {
          (merged as Record<string, unknown>).sponsorshipOffers = []
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

