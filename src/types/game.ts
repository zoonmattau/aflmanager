import type { Club } from './club'
import type { Player } from './player'
import type { Season, LadderEntry } from './season'
import type { Match } from './match'
import type { StaffMember } from './staff'
import type { DraftState, Scout } from './draft'

export type GamePhase =
  | 'setup'           // Choosing club
  | 'preseason'       // Pre-season training and practice matches
  | 'regular-season'  // Regular H&A rounds
  | 'finals'          // Finals series
  | 'post-season'     // Delistings, trade period, FA, draft
  | 'offseason'       // Between seasons

export interface GameMeta {
  id: string
  saveName: string
  createdAt: string     // ISO timestamp
  lastSaved: string     // ISO timestamp
  version: string       // Game version for save compatibility
}

export interface GameSettings {
  salaryCap: boolean
  salaryCapAmount: number
  boardPressure: boolean
  injuryFrequency: 'low' | 'medium' | 'high'
  developmentSpeed: 'slow' | 'normal' | 'fast'
  simSpeed: 'instant' | 'fast' | 'normal'
}

export interface NewsItem {
  id: string
  date: string          // In-game date ISO
  headline: string
  body: string
  category: 'match' | 'trade' | 'injury' | 'draft' | 'contract' | 'general'
  clubIds: string[]     // Related clubs
  playerIds: string[]   // Related players
}

export interface GameState {
  meta: GameMeta
  settings: GameSettings
  phase: GamePhase
  playerClubId: string           // The club the user manages
  currentYear: number
  currentRound: number           // 0-based round index, -1 for off-season
  currentDate: string            // ISO date string

  // World data
  clubs: Record<string, Club>
  players: Record<string, Player>
  staff: Record<string, StaffMember>

  // Season data
  season: Season
  ladder: LadderEntry[]
  matchResults: Match[]

  // News & history
  newsLog: NewsItem[]
  rngSeed: number                // Seeded PRNG state

  // Lineup for user's club (player IDs assigned to positions)
  selectedLineup: Record<string, string> | null

  // Draft data
  draft: DraftState | null
  scouts: Scout[]

  // Trade history
  tradeHistory: CompletedTrade[]
}

export interface CompletedTrade {
  id: string
  date: string
  clubA: string
  clubB: string
  playersToA: string[]
  playersToB: string[]
  salaryRetainedByA: number
  salaryRetainedByB: number
}
