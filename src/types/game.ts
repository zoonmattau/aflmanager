import type { Club } from './club'
import type { Player } from './player'
import type { Season, LadderEntry, MatchDay } from './season'
import type { Match } from './match'
import type { StaffMember } from './staff'
import type { DraftState, Scout } from './draft'
import type { LeagueConfig } from './expansion'
import type { GameHistory } from './history'
import type { GameCalendar, WeekSchedule } from './calendar'
import type { SeasonAwards, BrownlowRound } from './awards'
import type { StateLeague, StateLeagueId } from './stateLeague'
import type { OffseasonState } from '@/engine/season/offseasonFlow'
import type { FinalsFormat } from './finals'

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

// ---------------------------------------------------------------------------
// Game Settings sub-interfaces
// ---------------------------------------------------------------------------

export interface SeasonStructureSettings {
  regularSeasonRounds: number    // default 23, range: teamCount-1 to teamCount*2
  byeRounds: boolean             // default true for 18+ teams
  byeRoundCount: number          // default 2
}

export interface MatchRulesSettings {
  pointsPerGoal: number          // default 6
  pointsPerBehind: number        // default 1
  quartersPerMatch: number       // default 4
  possessionsMultiplier: number  // default 1.0, range 0.5–2.0 (base ~140 possessions)
  interchangePlayers: number     // default 5 (0-8, 2026 AFL rules)
}

export interface LadderPointsSettings {
  pointsForWin: number           // default 4
  pointsForDraw: number          // default 2
  pointsForLoss: number          // default 0
}

export interface ListRulesSettings {
  seniorListSize: number         // default 38
  rookieListSize: number         // default 6
}

export interface TeamSource {
  type: 'ladder' | 'winner' | 'loser'
  /** For 'ladder': seed number (1-based). For 'winner'/'loser': round index. */
  seed?: number
  round?: number
  matchup?: number
}

export interface CustomFinalsMatchup {
  homeSource: TeamSource
  awaySource: TeamSource
  winnerGoesTo: { round: number; matchup: number } | 'grand-final' | 'eliminated'
  loserGoesTo: { round: number; matchup: number } | 'eliminated'
}

export interface CustomFinalsRound {
  name: string                    // e.g. "Qualifying Finals"
  matchups: CustomFinalsMatchup[]
}

export interface CustomFinalsStructure {
  rounds: CustomFinalsRound[]
}

export interface FinalsSettings {
  finalsFormat: 'afl-top-8' | 'page-mcintyre-top-4' | 'top-6' | 'straight-knockout' | 'round-robin' | 'custom'
  finalsQualifyingTeams: number  // default 8
  grandFinalVenueMode: 'fixed' | 'random' | 'top-club'
  grandFinalVenue: string        // venue used when mode is 'fixed', default 'MCG'
  customFinalsStructure?: CustomFinalsStructure
  customFinalsFormat?: FinalsFormat  // Engine-compatible custom format from bracket builder
}

export interface MatchTimeSlot {
  id: string
  day: MatchDay
  time: string
  enabled: boolean
}

export interface FixtureScheduleSettings {
  matchSlots: MatchTimeSlot[]
}

export interface BlockbusterMatch {
  id: string
  name: string                   // e.g. "ANZAC Day"
  homeClubId: string
  awayClubId: string
  venue: string
  scheduledDay: MatchDay
  scheduledTime: string
  targetRound: 'auto' | number
  enabled: boolean
  /** 'event' = one-off named match, 'derby' = rivalry that occurs twice per season */
  type: 'event' | 'derby'
}

export interface RealismSettings {
  // Player Behavior
  playerLoyalty: boolean          // Loyalty affects contract discounts & trade reluctance
  tradeRequests: boolean          // Unhappy players nominate preferred clubs for trades
  playerRoleDisputes: boolean     // Players lose morale when played out of position

  // Trading & Contracts
  salaryDumpTrades: boolean       // Clubs offload big contracts with dead cap penalties
  softCapSpending: boolean        // Clubs can exceed salary cap with luxury tax

  // Draft & Development
  draftVariance: boolean          // Draft busts (top picks underperform) and late bloomers
  ngaAcademy: boolean             // NGA/Academy Father-Son matching bid system

  // League Operations
  fixtureBlockbusterBias: boolean // Named matches get prime scheduling priority
  coachingCarousel: boolean       // Poor-performing AI coaches get sacked
  boardPressure: boolean          // Board expectations affect job security
  aflHouseInterference: boolean   // AFL mandates priority picks & scheduling for struggling clubs
}

export interface GameSettings {
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
  simSpeed: 'instant' | 'fast' | 'normal'
  leagueMode: 'real' | 'fictional' | 'custom'
  teamCount: number
  seasonStructure: SeasonStructureSettings
  matchRules: MatchRulesSettings
  ladderPoints: LadderPointsSettings
  listRules: ListRulesSettings
  salaryCap: boolean
  salaryCapAmount: number
  realism: RealismSettings
  injuryFrequency: 'low' | 'medium' | 'high'
  developmentSpeed: 'slow' | 'normal' | 'fast'
  finals: FinalsSettings
  fixtureSchedule: FixtureScheduleSettings
  blockbusters: BlockbusterMatch[]
  seasonStartDate: string        // ISO date, default '2026-03-20'
  gameStartDate: string          // ISO date, day after previous GF, default computed from startingYear
}

export interface NewsItem {
  id: string
  date: string          // In-game date ISO
  headline: string
  body: string
  category: 'match' | 'trade' | 'injury' | 'draft' | 'contract' | 'general' | 'milestone'
  clubIds: string[]     // Related clubs
  playerIds: string[]   // Related players
  read?: boolean        // Undefined = unread (backward-compatible with old saves)
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

  // Historical tracking
  history: GameHistory

  // League configuration (expansion teams, custom clubs)
  leagueConfig: LeagueConfig

  // Calendar (event-driven time)
  calendar: GameCalendar

  // Weekly training schedule (user-managed via dashboard calendar)
  weekSchedule: WeekSchedule

  // Awards
  awards: SeasonAwards[]
  brownlowTracker: BrownlowRound[]

  // State leagues
  stateLeagues: Record<StateLeagueId, StateLeague> | null

  // Offseason pipeline
  offseasonState: OffseasonState | null
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
