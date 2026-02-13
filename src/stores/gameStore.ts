import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { get, set, del } from 'idb-keyval'

import type { GameState, GamePhase, GameMeta, GameSettings, NewsItem } from '@/types/game'
import type { Club } from '@/types/club'
import type { Player } from '@/types/player'
import type { Match } from '@/types/match'
import type { Season, LadderEntry } from '@/types/season'
import clubsJson from '@/data/clubs.json'
import { generatePlayers } from '@/data/players'
import { generateFixture, createInitialLadder } from '@/engine/season/fixtureGenerator'

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

  // Computed / derived
  getPlayersByClub: (clubId: string) => Player[]
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
