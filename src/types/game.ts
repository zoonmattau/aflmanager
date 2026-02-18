import type { Club } from './club'
import type { LineupSlot, Player } from './player'
import type { Season, LadderEntry, MatchDay, PowerRankingSnapshot } from './season'
import type { Match } from './match'
import type { StaffMember } from './staff'
import type { DraftState, Scout } from './draft'
import type { LeagueConfig } from './expansion'
import type { GameHistory } from './history'
import type { GameCalendar, WeekSchedule } from './calendar'
import type { TrainingWeekPlan } from '@/engine/training/trainingEngine'
import type { SeasonAwards, BrownlowRound } from './awards'
import type { StateLeague, StateLeagueId, StateLeagueAffiliationSettings } from './stateLeague'
import type { OffseasonState } from '@/engine/season/offseasonFlow'
import type { FinalsFormat } from './finals'
import type { SeasonVenueState } from './venue'
import type { NegotiationTracker } from './contract'
import type { TradeBlockState, TradeInboxItem, TradePlayerMove } from './trade'
import type { TribunalCase } from './discipline'
import type { ClubGameplan } from './club'
import type { LadderPrimarySort, LadderTieBreaker } from './customLeague'
import type { MultiTierState } from '@/engine/league/multiTierEngine'
import type { SpecialEventsSettings, SpecialEventsState } from './specialEvents'

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
  enableSubstitutes: boolean     // default false (adds 1 tactical substitute per team)
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
  nominatedTradeDestinations: boolean // Trade requests include nominated destination clubs
  reducedNominatedLeverage: boolean // Nominated clubs can trade at a discount
  playersRefuseTrades: boolean      // Players can refuse trades to unsuitable clubs
  playerRoleDisputes: boolean     // Players lose morale when played out of position

  // Trading & Contracts
  salaryDumpTrades: boolean       // Clubs offload big contracts with dead cap penalties
  softCapSpending: boolean        // Clubs can exceed salary cap with luxury tax

  // Draft & Development
  draftVariance: boolean          // Draft busts (top picks underperform) and late bloomers
  ngaAcademy: boolean             // NGA/Academy Father-Son matching bid system
  ngaAcademyZoneMatching: boolean // Restrict academy/NGA matching to zone-linked prospects only

  // League Operations
  fixtureBlockbusterBias: boolean // Named matches get prime scheduling priority
  fixtureRivalryScheduling: boolean // Guarantee traditional rivalries play twice per season
  venueScheduling: boolean        // Shared venue allocation, sold games, dynamic home advantage
  coachingCarousel: boolean       // Poor-performing AI coaches get sacked
  boardPressure: boolean          // Board expectations affect job security
  boardPolitics: boolean          // Boardroom factions can amplify or soften pressure
  aflHouseInterference: boolean   // AFL mandates priority picks & scheduling for struggling clubs
  aflHouseExpansionEvolution: boolean // AFL House may introduce expansion clubs over time
  aflHouseCompetitionEvolution: boolean // AFL House may switch competition model (single table/conferences/divisions)
  aflHouseFinalsEvolution: boolean // AFL House may change finals system
  aflHouseListRulesEvolution: boolean // AFL House may adjust list-size rules
  aflHouseSalaryCapEvolution: boolean // AFL House may adjust salary cap policy/amount
  aflHouseFixtureEvolution: boolean // AFL House may alter fixture/season-structure policy
  listSizeEnforcement: boolean    // Enforce senior (38) and rookie (6) list limits
  mediaLeaks: boolean              // Player managers leak negotiations to media
  negotiationDelays: boolean       // Multi-round delays (false = instant resolution)
  tacticalInjuryConsequences: boolean // Matchup rough-up orders add extra injury risk
  tacticalSuspensionConsequences: boolean // Matchup rough-up orders increase suspension exposure

  // Awards
  brownlowNight: boolean          // Votes hidden until Brownlow Night ceremony (Monday before GF)

  // Special Events
  specialEventPlayerImpact: boolean // Exhibition matches affect fatigue/injury/form

  // Tribunal
  tribunalEarlyPleaDiscount: boolean  // Allow early guilty plea discount (default true)
  tribunalLegalRepresentation: boolean // Allow hiring lawyers (default true)
  tribunalPriorRecord: boolean        // Prior offences increase penalties (default true)
}

export interface ManagerCareer {
  name: string
  employmentStatus: 'employed' | 'unemployed'
  currentClubId: string | null
  reputation: number
  jobSecurity: number
  seasonExpectation: string
  unemployedSinceYear: number | null
}

export interface CoachingJobOpening {
  id: string
  clubId: string
  title: string
  reason: string
  postedDate: string
  urgency: 'low' | 'medium' | 'high'
  status: 'open' | 'filled' | 'withdrawn'
}

export interface ReservesPlayerSeasonStats {
  gamesPlayed: number
  aflFantasyPoints: number
  superCoachPoints: number
  disposals: number
  goals: number
  marks: number
  tackles: number
  hitouts: number
}

export interface ReservesPlayerPerformance {
  playerId: string
  clubId: string
  round: number
  rating: number
  aflFantasyPoints: number
  superCoachPoints: number
  disposals: number
  goals: number
  marks: number
  tackles: number
  hitouts: number
}

export interface ReservesSystemState {
  seasonStatsByPlayer: Record<string, ReservesPlayerSeasonStats>
  lastRoundPerformances: ReservesPlayerPerformance[]
  promotionWatchlist: string[]
  delegationEnabled: boolean
  managedLineupPlayerIds: string[]
  managedLineupSlotAssignments: Partial<Record<LineupSlot, string>>
  playerAvailabilityAssignments: Record<string, 'play' | 'rest'>
  lastSelectedLineupPlayerIds: string[]
  leadership: {
    captainId: string | null
    viceCaptainId: string | null
    leadershipGroupIds: string[]
  }
  tactics: {
    tempo: 'slow' | 'balanced' | 'fast'
    aggression: 'low' | 'balanced' | 'high'
    youthFocus: boolean
  }
  stateLeagueContractDelegationEnabled: boolean
  stateLeagueContractTargetCount: number
}

export interface SavedLineupMatchRulesMeta {
  interchangePlayers: number
  enableSubstitutes: boolean
  quartersPerMatch: number
}

export interface SavedLineupReservesSnapshot {
  managedLineupPlayerIds: string[]
  managedLineupSlotAssignments: Partial<Record<LineupSlot, string>>
  playerAvailabilityAssignments: Record<string, 'play' | 'rest'>
}

export interface SavedLineup {
  id: string
  name: string
  clubId: string
  savedAt: string
  seasonYear: number
  round: number
  opponentClubId: string | null
  matchRules: SavedLineupMatchRulesMeta
  lineup: Record<string, string>
  benchPlayerIds: string[]
  substitutePlayerId: string | null
  weeklyGameplanSnapshot: {
    overrides: Partial<ClubGameplan>
    matchupTactics: WeeklyMatchupTactics
    opponentClubId: string | null
  } | null
  reservesSnapshot: SavedLineupReservesSnapshot | null
}

export type ShortlistTargetType = 'player' | 'prospect'
export type ShortlistPriority = 'low' | 'medium' | 'high' | 'critical'

export interface ShortlistEntry {
  targetType: ShortlistTargetType
  targetId: string
  note: string
  priority: ShortlistPriority
  addedAt: string
  updatedAt: string
}

export interface Shortlist {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  entries: ShortlistEntry[]
}

export interface GameSettings {
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
  simSpeed: 'instant' | 'fast' | 'normal'
  leagueMode: 'real' | 'fictional' | 'custom'
  leagueNamingTemplate: 'real-life' | 'fictional'
  includePathwayLeagues: boolean
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
  ladderSorting?: {
    primary: LadderPrimarySort
    tieBreakers: LadderTieBreaker[]
  }
  fixturePolicy?: {
    homeAwayBalance: boolean
    travelWeighting: number // 0-100
    venueSharingRules: boolean
  }
  customRivalryPairs?: Array<[string, string]>
  specialEvents: SpecialEventsSettings
  notifications: NotificationSettings
  stateLeagueAffiliations: StateLeagueAffiliationSettings
  seasonStartDate: string        // ISO date, default '2026-03-20'
  gameStartDate: string          // ISO date, day after previous GF, default computed from startingYear
}

export interface SigningNotificationPreferences {
  starThreshold: number
  inApp: boolean
  email: boolean
  dailyDigest: boolean
}

export interface NotificationSettings {
  signings: SigningNotificationPreferences
}

export interface JumperManagementState {
  pending: boolean
  seasonYear: number | null
  lastCompletedYear: number | null
}

export interface SimulationStatus {
  active: boolean
  title: string
  detail: string
  progress: number | null        // 0-100
  currentStep: number | null
  totalSteps: number | null
  logs: string[]
  startedAt: string | null
}

export interface NewsItem {
  id: string
  date: string          // In-game date ISO
  headline: string
  body: string
  category: 'match' | 'trade' | 'injury' | 'discipline' | 'draft' | 'contract' | 'general' | 'milestone'
  clubIds: string[]     // Related clubs
  playerIds: string[]   // Related players
  read?: boolean        // Undefined = unread (backward-compatible with old saves)
  media?: {
    reporterName: string
    outletName: string
    outletType: 'tv' | 'radio' | 'newspaper' | 'internet'
    tone: 'straight' | 'rumour' | 'controversy' | 'analysis' | 'match-report'
    factBasis: string
    sourceNewsId?: string
  }
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
  powerRankings: PowerRankingSnapshot[]
  matchResults: Match[]

  // News & history
  newsLog: NewsItem[]
  emailLog: NewsItem[]
  rngSeed: number                // Seeded PRNG state
  signingInteractionPlayerIds: string[]
  signingWatchlistPlayerIds: string[]
  signingShortlistPlayerIds: string[]
  shortlists: Shortlist[]

  // Lineup for user's club (player IDs assigned to positions)
  selectedLineup: Record<string, string> | null
  selectedSubstituteId: string | null
  savedLineups: SavedLineup[]

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

  // Enhanced training week plan (from Training Page week planner)
  trainingWeekPlan: TrainingWeekPlan | null

  // Awards
  awards: SeasonAwards[]
  brownlowTracker: BrownlowRound[]
  brownlowRevealed: boolean        // Whether Brownlow votes have been revealed this season

  // State leagues
  stateLeagues: Record<StateLeagueId, StateLeague> | null

  // Offseason pipeline
  offseasonState: OffseasonState | null

  // Venue scheduling
  venueState: SeasonVenueState | null

  // Special events (exhibition matches)
  specialEvents: SpecialEventsState | null

  // Negotiation tracker
  negotiations: NegotiationTracker | null

  // Trade inbox / negotiation
  tradeInbox: TradeInboxItem[]
  tradeBlock: TradeBlockState

  // Tribunal / suspensions
  tribunalInbox: TribunalCase[]

  // Weekly tactical adjustments (opponent-specific, round-scoped)
  weeklyGameplans: Record<string, WeeklyGameplan | undefined>

  // Manager career
  manager: ManagerCareer
  coachingJobMarket: CoachingJobOpening[]

  // Reserves / VFL tracking
  reserves: ReservesSystemState

  // Multi-tier custom league tracking
  multiTierState: MultiTierState | null

  // Global blocking simulation/loading UX
  simulation: SimulationStatus
  jumperManagement: JumperManagementState
}

export interface WeeklyGameplan {
  round: number
  opponentClubId: string
  overrides: Partial<ClubGameplan>
  matchupTactics?: WeeklyMatchupTactics
  source: 'user' | 'ai-auto'
}

export type MatchupInstructionIntensity = 'light' | 'standard' | 'hard'

export interface HardTagInstruction {
  id: string
  taggerPlayerId: string
  targetPlayerId: string
  intensity: MatchupInstructionIntensity
}

export interface PhysicalAttentionInstruction {
  id: string
  enforcerPlayerId: string
  targetPlayerId: string
  intensity: MatchupInstructionIntensity
}

export type MatchupRoleAssignmentType = 'run-with' | 'loose-interceptor' | 'defensive-forward'

export interface RoleAssignmentInstruction {
  id: string
  playerId: string
  assignment: MatchupRoleAssignmentType
  targetPlayerId?: string
  intensity: MatchupInstructionIntensity
}

export interface WeeklyMatchupTactics {
  hardTags: HardTagInstruction[]
  physicalAttention: PhysicalAttentionInstruction[]
  roleAssignments: RoleAssignmentInstruction[]
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
  clubsInvolved?: string[]
  multiClubMoves?: TradePlayerMove[]
}
