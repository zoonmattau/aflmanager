import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { get, set, del } from 'idb-keyval'

import type { GameState, GamePhase, GameMeta, GameSettings, NewsItem } from '@/types/game'
import type { Club } from '@/types/club'
import type { Player } from '@/types/player'
import type { Match } from '@/types/match'
import type { Season, LadderEntry } from '@/types/season'
import type { ClubGameplan } from '@/types/club'
import clubsJson from '@/data/clubs.json'
import { generatePlayers } from '@/data/players'
import { generateFixture, createInitialLadder } from '@/engine/season/fixtureGenerator'
import { simulateRound, isRegularSeasonComplete, applyPostRoundEffects } from '@/engine/season/advanceRound'
import { processMatchResults } from '@/engine/season/processResults'
import { generateFinalsRound, isSeasonComplete, getPremier } from '@/engine/season/finals'
import { rollMatchInjuries, healInjuries } from '@/engine/players/injuries'
import { updateMoralePostMatch } from '@/engine/players/morale'
import { SeededRNG } from '@/engine/core/rng'

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
const DEFAULT_SETTINGS: GameSettings = {
  salaryCap: true,
  salaryCapAmount: 15_500_000,
  boardPressure: true,
  injuryFrequency: 'medium',
  developmentSpeed: 'normal',
  simSpeed: 'normal',
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

const createDefaultState = (): GameState => ({
  meta: { ...DEFAULT_META },
  settings: { ...DEFAULT_SETTINGS },
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
})

// ---------------------------------------------------------------------------
// Store actions interface
// ---------------------------------------------------------------------------
interface GameActions {
  // Mutations
  initializeGame: (clubId: string, saveName: string) => void
  setPhase: (phase: GamePhase) => void
  advanceRound: () => void
  updatePlayer: (playerId: string, updates: Partial<Player>) => void
  updateClub: (clubId: string, updates: Partial<Club>) => void
  addMatchResult: (match: Match) => void
  updateLadder: (ladder: LadderEntry[]) => void
  setSelectedLineup: (lineup: Record<string, string> | null) => void
  addNewsItem: (item: NewsItem) => void
  resetGame: () => void
  updateGameplan: (gameplan: Partial<ClubGameplan>) => void

  // Season progression
  simCurrentRound: () => { userMatch: Match | null }
  simToEnd: () => void
  startFinals: () => void
  simFinalsRound: () => { userMatch: Match | null; seasonOver: boolean }

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

      initializeGame: (clubId: string, saveName: string) => {
        const now = new Date().toISOString()
        const gameId = crypto.randomUUID()
        const seed = Date.now()

        // Build clubs record from static JSON
        const clubsRecord: Record<string, Club> = {}
        for (const c of clubsJson as Club[]) {
          clubsRecord[c.id] = c
        }

        // Generate players for all 18 clubs
        const playersRecord: Record<string, Player> = {}
        for (const c of clubsJson as Club[]) {
          const clubPlayers = generatePlayers(c.id, seed + hashCode(c.id))
          for (const p of clubPlayers) {
            playersRecord[p.id] = p
          }
        }

        // Generate fixture
        const season = generateFixture(clubsRecord, seed)

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
          state.currentDate = '2026-03-20'
          state.rngSeed = seed
          state.selectedLineup = null

          state.clubs = clubsRecord
          state.players = playersRecord
          state.season = season
          state.ladder = ladder
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

      resetGame: () => {
        set((state) => {
          const defaults = createDefaultState()
          Object.assign(state, defaults)
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
        })

        // Commit results to store
        set((s) => {
          for (const m of result.matches) {
            s.matchResults.push(m)
          }
        })

        // Update ladder
        processMatchResults(result.matches, get as () => GameState, set as unknown as (fn: (state: GameState) => void) => void)

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
          return rollMatchInjuries(matchPlayerIds, state.players, injuryRng, 'medium')
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

          s.currentRound += 1
          s.meta.lastSaved = new Date().toISOString()
        })

        // Check if regular season is over
        if (isRegularSeasonComplete(get().currentRound)) {
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
          const round = generateFinalsRound(finalsWeek, state.ladder, finalsMatches, state.clubs)

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
            return rollMatchInjuries(matchPlayerIds, state.players, finalsInjuryRng, 'high')
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
