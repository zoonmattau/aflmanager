import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { get, set, del } from 'idb-keyval'

import type { GameState, GamePhase, GameMeta, GameSettings, NewsItem } from '@/types/game'
import type { ScheduleSlot, WeekSchedule } from '@/types/calendar'
import type { TrainingFocus } from '@/engine/training/trainingEngine'
import type { GameHistory } from '@/types/history'
import type { Club } from '@/types/club'
import type { Player } from '@/types/player'
import type { Match } from '@/types/match'
import type { Season, LadderEntry } from '@/types/season'
import type { ClubGameplan } from '@/types/club'
import type { GameCalendar } from '@/types/calendar'
import clubsJson from '@/data/clubs.json'
import { generatePlayers } from '@/data/players'
import { generateFixture, createInitialLadder } from '@/engine/season/fixtureGenerator'
import { validateFixture } from '@/engine/season/fixtureValidator'
import { simulateRound, isRegularSeasonComplete, applyPostRoundEffects } from '@/engine/season/advanceRound'
import { processMatchResults } from '@/engine/season/processResults'
import { generateFinalsRound, isSeasonComplete, getPremier } from '@/engine/season/finals'
import { recordSeasonResult } from '@/engine/history/historyEngine'
import { getFinalsFormatById } from '@/engine/season/finalsFormats'
import { rollMatchInjuries, healInjuries } from '@/engine/players/injuries'
import { updateMoralePostMatch } from '@/engine/players/morale'
import { SeededRNG } from '@/engine/core/rng'
import { generateClubStaff, generateStaffPool } from '@/engine/staff/staffEngine'
import { awardBrownlowVotes, computeSeasonAwards } from '@/engine/awards/awardsEngine'
import { buildSeasonCalendar, computeDefaultGameStartDate, getYear } from '@/engine/calendar/calendarEngine'
import { initializeStateLeagues, simStateLeagueRound } from '@/engine/stateLeague/stateLeagueEngine'
import { createDefaultSettings, DEFAULT_REALISM } from '@/engine/core/defaultSettings'
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
const DEFAULT_SETTINGS: GameSettings = createDefaultSettings()

const DEFAULT_HISTORY: GameHistory = {
  seasons: [],
  draftHistory: [],
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
})

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
          clubsRecord[c.id] = c
        }

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

        // Generate fixture using settings-driven options
        const season = generateFixture({
          clubs: clubsRecord,
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
        const ladder = createInitialLadder(Object.keys(clubsRecord))

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

          state.clubs = clubsRecord
          state.players = playersRecord
          state.staff = staffRecord
          state.season = season
          state.ladder = ladder
          state.history = { seasons: [], draftHistory: [] }
          state.leagueConfig = {
            activeClubIds: Object.keys(clubsRecord),
            expansionPlans: [],
            totalTeams: Object.keys(clubsRecord).length,
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
        const { updatedPlayers, retiredIds, news: retirementNews } = processSeasonEnd(
          state.players,
          state.currentYear,
          rng,
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
        set((s) => {
          if (!s.offseasonState?.calendarState) return
          s.offseasonState.calendarState = advanceHalfDayEngine(s.offseasonState.calendarState)
          s.currentDate = s.offseasonState.calendarState.currentDate
        })
      },

      simOffseasonFullDay: () => {
        set((s) => {
          if (!s.offseasonState?.calendarState) return
          let cal = advanceHalfDayEngine(s.offseasonState.calendarState)
          cal = advanceHalfDayEngine(cal)
          s.offseasonState.calendarState = cal
          s.currentDate = cal.currentDate
        })
      },

      simOffseasonToMilestone: () => {
        set((s) => {
          if (!s.offseasonState?.calendarState) return
          s.offseasonState.calendarState = advanceToNextMilestoneEngine(s.offseasonState.calendarState)
          s.currentDate = s.offseasonState.calendarState.currentDate
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
        const state = get()
        const round = state.season.rounds[state.currentRound]
        if (!round) return { userMatch: null }

        const result = simulateRound({
          round,
          roundIndex: state.currentRound,
          players: state.players,
          clubs: state.clubs,
          rngSeed: state.rngSeed,
          playerClubId: state.playerClubId,
          matchRules: state.settings.matchRules,
          venueState: state.venueState,
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
        const playedIds = new Set<string>()
        for (const m of result.matches) {
          if (!m.result) continue
          for (const ps of [...m.result.homePlayerStats, ...m.result.awayPlayerStats]) {
            playedIds.add(ps.playerId)
          }
        }
        // Roll for match injuries
        const injuryRng = new SeededRNG(state.rngSeed + state.currentRound * 997)
        const allInjuries = result.matches.flatMap((m) => {
          if (!m.result) return []
          const matchPlayerIds = [
            ...m.result.homePlayerStats.map((ps) => ps.playerId),
            ...m.result.awayPlayerStats.map((ps) => ps.playerId),
          ]
          return rollMatchInjuries(matchPlayerIds, state.players, injuryRng, 'medium', state.settings.injuryFrequency)
        })

        set((s) => {
          applyPostRoundEffects(s.players, playedIds, travelFatigueByClub)

          // Apply injuries from this round's matches
          for (const inj of allInjuries) {
            const p = s.players[inj.playerId]
            if (p) {
              p.injury = { type: inj.type, weeksRemaining: inj.weeksOut }
            }
          }

          // Heal existing injuries (decrement weeks)
          healInjuries(s.players)

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
        const state = get()
        const finalsWeek = state.season.finalsRounds.length + 1

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
          const result = simulateRound({
            round,
            roundIndex: 100 + finalsWeek, // Offset to avoid colliding with H&A round indices
            players: state.players,
            clubs: state.clubs,
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
          const playedIds = new Set<string>()
          for (const m of finalsResults) {
            if (!m.result) continue
            for (const ps of [...m.result.homePlayerStats, ...m.result.awayPlayerStats]) {
              playedIds.add(ps.playerId)
            }
          }

          // Roll for finals match injuries
          const finalsInjuryRng = new SeededRNG(state.rngSeed + finalsWeek * 1013)
          const finalsInjuries = finalsResults.flatMap((m) => {
            if (!m.result) return []
            const matchPlayerIds = [
              ...m.result.homePlayerStats.map((ps) => ps.playerId),
              ...m.result.awayPlayerStats.map((ps) => ps.playerId),
            ]
            return rollMatchInjuries(matchPlayerIds, state.players, finalsInjuryRng, 'high', state.settings.injuryFrequency)
          })

          set((s) => {
            applyPostRoundEffects(s.players, playedIds)

            // Apply finals injuries
            for (const inj of finalsInjuries) {
              const p = s.players[inj.playerId]
              if (p) {
                p.injury = { type: inj.type, weeksRemaining: inj.weeksOut }
              }
            }

            healInjuries(s.players)

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
          merged.history = { seasons: [], draftHistory: [] }
        }

        // --- Migrate flat settings to nested format ---
        const s = merged.settings as Record<string, unknown>
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
        const mr = merged.settings?.matchRules as Record<string, unknown> | undefined
        if (mr && 'possessionsPerQuarter' in mr && !('possessionsMultiplier' in mr)) {
          const oldVal = (mr.possessionsPerQuarter as number) ?? 140
          mr.possessionsMultiplier = Math.round((oldVal / 140) * 10) / 10
          delete mr.possessionsPerQuarter
        }

        // Migrate old playerPreferredSlot removal
        const fs = merged.settings?.fixtureSchedule as Record<string, unknown> | undefined
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
        const fin = merged.settings?.finals as Record<string, unknown> | undefined
        if (fin && !('grandFinalVenueMode' in fin)) {
          fin.grandFinalVenueMode = 'fixed'
        }

        // Migrate boardPressure into realism settings
        if (merged.settings && !(merged.settings as Record<string, unknown>).realism) {
          const oldBP = (merged.settings as Record<string, unknown>).boardPressure
          ;(merged.settings as Record<string, unknown>).realism = {
            ...DEFAULT_REALISM,
            boardPressure: oldBP !== undefined ? (oldBP as boolean) : true,
          }
          delete (merged.settings as Record<string, unknown>).boardPressure
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
        if (realismObj && !('brownlowNight' in realismObj)) {
          realismObj.brownlowNight = true
        }

        // Migrate brownlowRevealed
        if ((merged as Record<string, unknown>).brownlowRevealed === undefined) {
          (merged as Record<string, unknown>).brownlowRevealed = false
        }

        // Backfill optional contract fields on existing players
        if (merged.players) {
          for (const player of Object.values(merged.players)) {
            if (player.contract && !player.contract.clauses) player.contract.clauses = []
            if (player.contract && !player.contract.structure) player.contract.structure = 'escalating'
            if (player.contract && player.contract.incentiveTotal === undefined) player.contract.incentiveTotal = 0
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
