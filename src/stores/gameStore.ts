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
import { buildSeasonCalendar, computeDefaultGameStartDate } from '@/engine/calendar/calendarEngine'
import { initializeStateLeagues, simStateLeagueRound } from '@/engine/stateLeague/stateLeagueEngine'
import { createDefaultSettings, DEFAULT_REALISM } from '@/engine/core/defaultSettings'
import {
  initOffseason,
  advanceOffseasonPhase as advanceOffseasonPhaseEngine,
  canAdvancePhase,
  processSeasonEnd,
  processRetirements,
  processAIDelistings,
  processAITradePeriod,
  processAIFreeAgency,
  processPreseason,
  startNewSeason,
} from '@/engine/season/offseasonFlow'
import { resolveListConstraints } from '@/engine/rules/listRules'

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
  stateLeagues: null,
  offseasonState: null,
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
  startNewSeasonAction: () => void

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
          state.phase = 'regular-season'
          state.currentYear = 2026
          state.currentRound = 0
          state.currentDate = gameSettings.seasonStartDate ?? '2026-03-20'
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
          })
        } else if (leavingPhase === 'free-agency') {
          const freshState = get()
          const { updatedPlayers, news } = processAIFreeAgency(
            freshState.players,
            freshState.clubs,
            rng,
            freshState.playerClubId,
            freshState.settings,
            freshState.currentYear,
          )
          set((s) => {
            for (const [id, p] of Object.entries(updatedPlayers)) {
              s.players[id] = p
            }
            for (const n of news) {
              s.newsLog.push(n)
            }
          })
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
        }

        // Advance to next phase
        set((s) => {
          if (s.offseasonState) {
            s.offseasonState = advanceOffseasonPhaseEngine(s.offseasonState)
          }
        })

        return { success: true, error: null }
      },

      delistPlayerOffseason: (playerId: string) => {
        set((s) => {
          const player = s.players[playerId]
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
        })
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
          s.matchResults = []
          s.brownlowTracker = []
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
        })

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
          applyPostRoundEffects(s.players, playedIds)

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
