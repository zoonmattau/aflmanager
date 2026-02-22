import type { UnlockedAchievement, CareerObjective } from './achievements'
import type { AICoachProfile, CoachKnowledgeEntry } from './coach'
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
import type { SeasonAwards, BrownlowRound, ClubBFRound } from './awards'
import type { StateLeague, StateLeagueId, StateLeagueAffiliationSettings } from './stateLeague'
import type { OffseasonState } from '@/engine/season/offseasonFlow'
import type { FinalsFormat } from './finals'
import type { SeasonVenueState } from './venue'
import type { NegotiationTracker } from './contract'
import type { TradeBlockState, TradeInboxItem, TradePlayerMove, TradeDramaState } from './trade'
import type { TribunalCase } from './discipline'
import type { ClubGameplan } from './club'
import type { LadderPrimarySort, LadderTieBreaker } from './customLeague'
import type { MultiTierState } from '@/engine/league/multiTierEngine'
import type { SpecialEventsSettings, SpecialEventsState } from './specialEvents'
import type { FacilityUpgradeTracker } from './facilityUpgrade'
import type { BoardApprovalTracker } from './boardApproval'
import type { AgentRelationship } from './agent'
import type { YouthPathwayState } from './youthPathway'
import type { AllAustralianState } from './allAustralian'
import type { LegacyState } from './legacy'
import type { NegotiationThread } from './negotiation'

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
  schemaVersion?: number // Save schema version (may be absent on old saves)
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
  finalsFormat: 'afl-top-8' | 'afl-top-10' | 'page-mcintyre-top-4' | 'top-6' | 'straight-knockout' | 'round-robin' | 'custom'
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

  // Finance
  allowLoans: boolean                 // Allow clubs to take out loans (default true)

  // Tampering
  contractTampering?: boolean         // Enable pre-FA tampering mechanics
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
  /** Annual CPI / inflation configuration */
  inflation?: import('@/engine/inflation/inflationEngine').InflationSettings
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
  /** AFL distribution rules: ladder prizes, finals bonuses, equalisation, travel comp */
  aflDistributions?: import('@/types/distributions').AflDistributionConfig
  /** Simulated in-game betting markets (no real money) */
  betting?: import('@/types/betting').BettingSettings
  /** Commissioner/cheat mode flags */
  commissionerMode?: boolean
  injuriesEnabled?: boolean
  /** Custom stadiums for League Customiser */
  customStadiums?: import('@/types/stadium').CustomStadium[]
  /**
   * Custom venue rule overrides (merged onto DEFAULT_AFL_VENUE_RULES at runtime).
   * Provide clubQuotaRules / matchupRules to add or replace individual entries.
   * Only set for fictional/custom leagues; real-league mode always uses defaults.
   */
  venueRules?: import('@/types/venue').VenueRuleSet
}

export interface SigningNotificationPreferences {
  starThreshold: number
  inApp: boolean
  email: boolean
  dailyDigest: boolean
}

/** Controls how the user's managed matches are handled by default */
export type LiveSimMode =
  | 'always-live'   // Always open Live Match view for user's games
  | 'finals-only'   // Live only for finals, Quick Sim otherwise
  | 'quick-sim'     // Always quick-simulate with full stats shown
  | 'delegate'      // Let the assistant auto-resolve silently

export interface NotificationSettings {
  signings: SigningNotificationPreferences
  autoResolveMatches: boolean
  liveSimMode: LiveSimMode
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
  category: 'match' | 'trade' | 'injury' | 'discipline' | 'draft' | 'contract' | 'general' | 'milestone' | 'leadership'
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

export interface TrainingWeekReport {
  round: number
  date: string
  sessionCount: number
  topImprovers: Array<{
    playerId: string
    name: string
    totalGain: number
    topAttr: string
    topGain: number
  }>
  avgFatigueChange: number
  avgFitnessChange: number
  injuryScarePlayers: string[]
  upskillCompletions: Array<{
    playerName: string
    targetLabel: string
    type: 'position' | 'skill'
  }>
  /** Players whose fatigue crossed the overtraining threshold after this week's sessions. */
  overtrained: Array<{
    playerId: string
    name: string
    fatigue: number
  }>
  /** Overall squad training load level for this week. */
  loadLevel: 'light' | 'moderate' | 'heavy' | 'excessive'
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

  // League evolution (expansion / contraction / relocation history)
  leagueEvolutionHistory?: import('@/types/leagueEvolution').LeagueEvolutionHistory

  // League configuration (expansion teams, custom clubs)
  leagueConfig: LeagueConfig

  // Calendar (event-driven time)
  calendar: GameCalendar

  // Weekly training schedule (user-managed via dashboard calendar)
  weekSchedule: WeekSchedule

  // Enhanced training week plan (from Training Page week planner)
  trainingWeekPlan: TrainingWeekPlan | null

  // Report generated after each week's training is applied
  lastTrainingReport: TrainingWeekReport | null

  // Awards
  awards: SeasonAwards[]
  brownlowTracker: BrownlowRound[]
  bfTracker: ClubBFRound[]
  brownlowRevealed: boolean        // Whether Brownlow votes have been revealed this season
  awardsNightCompleted: boolean    // Whether the full Awards Night ceremony has been completed
  allAustralianNightCompleted: boolean // Whether the AA Selection Night ceremony has been viewed
  allAustralian?: AllAustralianState   // 40-man squad + final team (current season)

  // State leagues
  stateLeagues: Record<StateLeagueId, StateLeague> | null

  // Youth pathway (U16/U18 competitions, player generation, tournaments)
  youthPathway: YouthPathwayState | null

  // Tampering tracker (covert contacts + pre-FA expressions)
  tamperingTracker: {
    contacts: import('@/types/contract').TamperingContact[]
    preFAExpressions: import('@/types/contract').PreFAExpression[]
  } | null

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
  tradeDrama: TradeDramaState

  // Negotiation threads (poker-style multi-round trade negotiations)
  negotiationThreads: NegotiationThread[]

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

  // Facility upgrade tracking
  facilityUpgrades: FacilityUpgradeTracker

  // Board approval tracking
  boardApprovals: BoardApprovalTracker

  // Board instability & spill events
  boardInstability: import('@/types/boardApproval').BoardInstabilityState | null

  // Global blocking simulation/loading UX
  simulation: SimulationStatus
  jumperManagement: JumperManagementState

  /** Cumulative inflation index (1.0 = base year). Compounds annually. */
  inflationIndex: number
  /** Year-by-year history of inflation index and actual rate applied. */
  inflationHistory: import('@/engine/inflation/inflationEngine').InflationYearRecord[]

  /** AI coach profiles keyed by coachId */
  coaches: Record<string, AICoachProfile>
  /** Player's familiarity with each rival coach */
  coachKnowledge: Record<string, CoachKnowledgeEntry>

  /** Agent relationship scores keyed by agentId */
  agentRelationships?: Record<string, AgentRelationship>

  // Achievements & career objectives
  achievements: UnlockedAchievement[]
  careerObjectives: CareerObjective[]
  dynastyQuests: CareerObjective[]

  // Pending sponsorship offers for the player's club (generated at season end)
  sponsorshipOffers: import('@/types/club').SponsorshipOffer[]

  /** Simulated betting market state — null when feature is disabled */
  bettingMarkets: import('@/types/betting').BettingMarketsState | null

  // Injury replacement puzzles (triggered when a key user-club player is injured)
  injuryReplacementPuzzles: InjuryReplacementPuzzle[]
  /** Emergency position eligibility grants: playerId → extra allowed positions */
  emergencyEligibility: Record<string, import('@/types/player').PlayerPositionType[]>

  // Legacy & dynasty tracking
  legacyState: LegacyState

  /**
   * Active leadership disruptions keyed by clubId.
   * Cleared when roundsRemaining reaches 0.
   */
  leadershipDisruptions: Record<string, LeadershipDisruption>

  /** True when the player's club must appoint leadership before Round 1. */
  leadershipPending: boolean
}

// ── Leadership Disruption ────────────────────────────────────────────────────

/**
 * Tracks an active leadership change disruption for a club.
 * Decays one round per advance; when roundsRemaining reaches 0 the disruption
 * is cleared and on-field penalties no longer apply.
 */
export interface LeadershipDisruption {
  id: string
  clubId: string
  date: string
  round: number
  changeType: 'captain' | 'vice-captain' | 'both' | 'group-only'
  disruptionLevel: number       // 0-100, initial severity
  roundsRemaining: number       // decrements each round; 0 = fully recovered
  roundsToRecover: number       // total recovery duration (for % calculation)
  wasPreseason: boolean
  outgoingCaptainName: string | null
  incomingCaptainName: string | null
}

// ── Injury Replacement Puzzle ─────────────────────────────────────────────────

export type ReplacementPathwayType =
  | 'like-for-like'      // Most attribute-similar available player
  | 'structure-shift'    // Move a player from a different role
  | 'youth-promotion'    // Bring in a developing player for experience
  | 'emergency-coverage' // Grant a player emergency position eligibility

export interface ReplacementPathwayConsequences {
  /** Form delta applied immediately to the replacement player on resolve */
  formDelta: number
  /** Fatigue delta applied to the replacement player */
  fatigueDelta: number
  /** Performance cohesion penalty (0.0 = none, 0.15 = heavy disruption) */
  cohesionPenalty: number
  /** For youth pathway: upside boost to their availability modifier */
  upsidePotential: number
  /** Short readable note shown in the UI */
  roleNote: string
}

export interface ReplacementPathway {
  type: ReplacementPathwayType
  label: string
  description: string
  /** Suggested replacement player (null if no suitable candidate found) */
  suggestedPlayerId: string | null
  consequences: ReplacementPathwayConsequences
  /** For emergency-coverage: positions to grant the suggested player */
  emergencyPositions?: import('@/types/player').PlayerPositionType[]
}

export interface InjuryReplacementPuzzle {
  id: string
  round: number
  date: string
  injuredPlayerId: string
  injuredPlayerName: string
  injuredPlayerPosition: import('@/types/player').PlayerPositionType
  injuredPlayerRole: string
  weeksOut: number
  roleImpact: {
    positionGroup: string
    keyAttributes: Array<{ attr: string; label: string; value: number }>
    matchupValue: number   // 0–100
    statusLabel: string    // e.g. "First-choice CHF"
  }
  pathways: ReplacementPathway[]
  chosenPathwayType: ReplacementPathwayType | null
  resolved: boolean
  dismissed: boolean
}

// ─────────────────────────────────────────────────────────────────────────────

export interface RotationEvent {
  id: string
  quarter: 1 | 2 | 3 | 4
  minute: number        // 1–29 (within the quarter)
  playerOffId: string   // on-field player to rest
  playerOnId: string    // bench/interchange player to bring on
}

export interface WeeklyGameplan {
  round: number
  opponentClubId: string
  overrides: Partial<ClubGameplan>
  matchupTactics?: WeeklyMatchupTactics
  rotationPlan?: RotationEvent[]
  /** Selected rival scout counter ID — applied to the match sim when set */
  scoutCounterId?: string | null
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

export type PositionGroupKey = 'DEF' | 'MID' | 'FWD' | 'RK'

export interface PositionGroupBenchmark {
  group: PositionGroupKey
  sampleSize: number
  disposals: number
  goals: number
  marks: number
  tackles: number
  clearances: number
  hitouts: number
  contestedPossessions: number
  rating: number
}
