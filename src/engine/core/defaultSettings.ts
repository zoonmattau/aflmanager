import type {
  GameSettings,
  NotificationSettings,
  MatchTimeSlot,
  BlockbusterMatch,
  SeasonStructureSettings,
  MatchRulesSettings,
  LadderPointsSettings,
  ListRulesSettings,
  FinalsSettings,
  RealismSettings,
} from '@/types/game'
import type { SpecialEventsSettings, OriginConfig } from '@/types/specialEvents'
import { computeDefaultGameStartDate } from '@/engine/calendar/calendarEngine'
import { DEFAULT_INFLATION_SETTINGS } from '@/engine/inflation/inflationEngine'
import { DEFAULT_DISTRIBUTION_CONFIG } from '@/engine/clubs/distributionEngine'

// ---------------------------------------------------------------------------
// Default realistic match time slots (expanded AFL-style pool spanning Thu–Mon)
// ---------------------------------------------------------------------------

export const DEFAULT_MATCH_SLOTS: MatchTimeSlot[] = [
  { id: 'tue-night',          day: 'Tuesday',           time: '7:20pm', enabled: false },
  { id: 'wed-night',          day: 'Wednesday',         time: '7:20pm', enabled: false },
  { id: 'thu-night',          day: 'Thursday',          time: '7:20pm', enabled: true },
  { id: 'fri-night-early',    day: 'Friday',            time: '7:10pm', enabled: true },
  { id: 'fri-night-late',     day: 'Friday',            time: '8:10pm', enabled: true },
  { id: 'sat-early-1235',     day: 'Saturday-Early',    time: '12:35pm', enabled: true },
  { id: 'sat-early-110',      day: 'Saturday-Early',    time: '1:10pm', enabled: true },
  { id: 'sat-early-120',      day: 'Saturday-Early',    time: '1:20pm', enabled: true },
  { id: 'sat-twilight-320',   day: 'Saturday-Afternoon', time: '3:20pm', enabled: true },
  { id: 'sat-twilight-415',   day: 'Saturday-Twilight', time: '4:15pm', enabled: true },
  { id: 'sat-twilight-440',   day: 'Saturday-Twilight', time: '4:40pm', enabled: true },
  { id: 'sat-night-710',      day: 'Saturday-Night',    time: '7:10pm', enabled: true },
  { id: 'sat-night-735',      day: 'Saturday-Night',    time: '7:35pm', enabled: true },
  { id: 'sat-night-740',      day: 'Saturday-Night',    time: '7:40pm', enabled: true },
  { id: 'sat-night-750',      day: 'Saturday-Night',    time: '7:50pm', enabled: true },
  { id: 'sat-night-810',      day: 'Saturday-Night',    time: '8:10pm', enabled: true },
  { id: 'sun-early-1210',     day: 'Sunday-Early',      time: '12:10pm', enabled: true },
  { id: 'sun-early-110',      day: 'Sunday-Early',      time: '1:10pm', enabled: true },
  { id: 'sun-twilight-320',   day: 'Sunday-Afternoon',  time: '3:20pm', enabled: true },
  { id: 'sun-twilight-620',   day: 'Sunday-Twilight',   time: '6:20pm', enabled: true },
  { id: 'mon-afternoon',      day: 'Monday',            time: '3:20pm', enabled: true },
]

// ---------------------------------------------------------------------------
// Default blockbuster matches (real AFL)
// ---------------------------------------------------------------------------

export const DEFAULT_BLOCKBUSTERS: BlockbusterMatch[] = [
  // Named Events
  {
    id: 'r1-opener',
    name: 'Round 1 Opener',
    homeClubId: 'carlton',
    awayClubId: 'richmond',
    venue: 'MCG',
    scheduledDay: 'Thursday',
    scheduledTime: '7:20pm',
    targetRound: 1,
    enabled: true,
    type: 'event',
  },
  {
    id: 'easter-thursday',
    name: 'Easter Thursday',
    homeClubId: 'brisbane',
    awayClubId: 'collingwood',
    venue: 'Gabba',
    scheduledDay: 'Thursday',
    scheduledTime: '7:20pm',
    targetRound: 'auto',
    enabled: true,
    type: 'event',
  },
  {
    id: 'good-friday',
    name: 'Good Friday',
    homeClubId: 'northmelbourne',
    awayClubId: 'carlton',
    venue: 'Marvel Stadium',
    scheduledDay: 'Friday',
    scheduledTime: '3:20pm',
    targetRound: 'auto',
    enabled: true,
    type: 'event',
  },
  {
    id: 'easter-monday',
    name: 'Easter Monday',
    homeClubId: 'hawthorn',
    awayClubId: 'geelong',
    venue: 'MCG',
    scheduledDay: 'Monday',
    scheduledTime: '3:20pm',
    targetRound: 'auto',
    enabled: true,
    type: 'event',
  },
  {
    id: 'anzac-day-eve',
    name: 'ANZAC Day Eve',
    homeClubId: 'richmond',
    awayClubId: 'melbourne',
    venue: 'MCG',
    scheduledDay: 'Friday',
    scheduledTime: '7:50pm',
    targetRound: 'auto',
    enabled: true,
    type: 'event',
  },
  {
    id: 'anzac-day',
    name: 'ANZAC Day',
    homeClubId: 'essendon',
    awayClubId: 'collingwood',
    venue: 'MCG',
    scheduledDay: 'Saturday-Twilight',
    scheduledTime: '2:20pm',
    targetRound: 'auto',
    enabled: true,
    type: 'event',
  },
  {
    id: 'dreamtime',
    name: 'Dreamtime at the G',
    homeClubId: 'richmond',
    awayClubId: 'essendon',
    venue: 'MCG',
    scheduledDay: 'Friday',
    scheduledTime: '7:50pm',
    targetRound: 'auto',
    enabled: true,
    type: 'event',
  },
  {
    id: 'kings-birthday-eve',
    name: "King's Birthday Eve",
    homeClubId: 'essendon',
    awayClubId: 'carlton',
    venue: 'MCG',
    scheduledDay: 'Saturday-Night',
    scheduledTime: '7:25pm',
    targetRound: 'auto',
    enabled: true,
    type: 'event',
  },
  {
    id: 'kings-birthday',
    name: "King's Birthday (Big Freeze)",
    homeClubId: 'collingwood',
    awayClubId: 'melbourne',
    venue: 'MCG',
    scheduledDay: 'Monday',
    scheduledTime: '3:20pm',
    targetRound: 'auto',
    enabled: true,
    type: 'event',
  },

  // Interstate Derbies (each appears twice for home/away swap)
  {
    id: 'western-derby-1',
    name: 'Western Derby',
    homeClubId: 'westcoast',
    awayClubId: 'fremantle',
    venue: 'Optus Stadium',
    scheduledDay: 'Saturday-Night',
    scheduledTime: '5:40pm',
    targetRound: 'auto',
    enabled: true,
    type: 'derby',
  },
  {
    id: 'western-derby-2',
    name: 'Western Derby',
    homeClubId: 'fremantle',
    awayClubId: 'westcoast',
    venue: 'Optus Stadium',
    scheduledDay: 'Saturday-Night',
    scheduledTime: '5:40pm',
    targetRound: 'auto',
    enabled: true,
    type: 'derby',
  },
  {
    id: 'qclash-1',
    name: 'QClash',
    homeClubId: 'brisbane',
    awayClubId: 'goldcoast',
    venue: 'Gabba',
    scheduledDay: 'Saturday-Twilight',
    scheduledTime: '4:35pm',
    targetRound: 'auto',
    enabled: true,
    type: 'derby',
  },
  {
    id: 'qclash-2',
    name: 'QClash',
    homeClubId: 'goldcoast',
    awayClubId: 'brisbane',
    venue: 'People First Stadium',
    scheduledDay: 'Saturday-Twilight',
    scheduledTime: '4:35pm',
    targetRound: 'auto',
    enabled: true,
    type: 'derby',
  },
  {
    id: 'sydney-derby-1',
    name: 'Sydney Derby',
    homeClubId: 'sydney',
    awayClubId: 'gws',
    venue: 'SCG',
    scheduledDay: 'Saturday-Twilight',
    scheduledTime: '4:35pm',
    targetRound: 'auto',
    enabled: true,
    type: 'derby',
  },
  {
    id: 'sydney-derby-2',
    name: 'Sydney Derby',
    homeClubId: 'gws',
    awayClubId: 'sydney',
    venue: 'ENGIE Stadium',
    scheduledDay: 'Saturday-Twilight',
    scheduledTime: '4:35pm',
    targetRound: 'auto',
    enabled: true,
    type: 'derby',
  },
  {
    id: 'showdown-1',
    name: 'Showdown',
    homeClubId: 'adelaide',
    awayClubId: 'portadelaide',
    venue: 'Adelaide Oval',
    scheduledDay: 'Saturday-Night',
    scheduledTime: '4:10pm',
    targetRound: 'auto',
    enabled: true,
    type: 'derby',
  },
  {
    id: 'showdown-2',
    name: 'Showdown',
    homeClubId: 'portadelaide',
    awayClubId: 'adelaide',
    venue: 'Adelaide Oval',
    scheduledDay: 'Saturday-Night',
    scheduledTime: '4:10pm',
    targetRound: 'auto',
    enabled: true,
    type: 'derby',
  },
]

// ---------------------------------------------------------------------------
// Default sub-settings
// ---------------------------------------------------------------------------

export const DEFAULT_SEASON_STRUCTURE: SeasonStructureSettings = {
  regularSeasonRounds: 23,
  byeRounds: true,
  byeRoundCount: 3,
}

export const DEFAULT_MATCH_RULES: MatchRulesSettings = {
  pointsPerGoal: 6,
  pointsPerBehind: 1,
  quartersPerMatch: 4,
  possessionsMultiplier: 1.0,
  interchangePlayers: 5,
  enableSubstitutes: false,
}

export const DEFAULT_LADDER_POINTS: LadderPointsSettings = {
  pointsForWin: 4,
  pointsForDraw: 2,
  pointsForLoss: 0,
}

export const DEFAULT_LIST_RULES: ListRulesSettings = {
  seniorListSize: 38,
  rookieListSize: 6,
}

export const DEFAULT_FINALS: FinalsSettings = {
  finalsFormat: 'afl-top-8',
  finalsQualifyingTeams: 8,
  grandFinalVenueMode: 'fixed',
  grandFinalVenue: 'MCG',
}

/** Major AFL venues available as Grand Final locations. */
export const GF_VENUES = [
  'MCG',
  'Optus Stadium',
  'Adelaide Oval',
  'Gabba',
  'Marvel Stadium',
  'SCG',
] as const

export const DEFAULT_FIXTURE_SCHEDULE = {
  matchSlots: DEFAULT_MATCH_SLOTS.map((s) => ({ ...s })),
}

// ---------------------------------------------------------------------------
// Default rivalry pairs (protected matchups that play twice per season)
// ---------------------------------------------------------------------------

export const DEFAULT_RIVALRY_PAIRS: [string, string][] = [
  ['carlton', 'collingwood'],
  ['carlton', 'essendon'],
  ['collingwood', 'essendon'],
  ['hawthorn', 'geelong'],
  ['richmond', 'carlton'],
  ['richmond', 'collingwood'],
  ['melbourne', 'collingwood'],
  ['richmond', 'essendon'],
  ['westernbulldogs', 'melbourne'],
  ['stkilda', 'melbourne'],
  ['hawthorn', 'essendon'],
]

// ---------------------------------------------------------------------------
// Default Origin configuration
// ---------------------------------------------------------------------------

export const DEFAULT_ORIGIN_CONFIG: OriginConfig = {
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

// ---------------------------------------------------------------------------
// Default special events settings
// ---------------------------------------------------------------------------

export const DEFAULT_SPECIAL_EVENTS: SpecialEventsSettings = {
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
  originConfig: { ...DEFAULT_ORIGIN_CONFIG, participatingStates: [...DEFAULT_ORIGIN_CONFIG.participatingStates], alliesStates: [...DEFAULT_ORIGIN_CONFIG.alliesStates] },
  eventSchedules: {},
}

// ---------------------------------------------------------------------------
// Default realism settings
// ---------------------------------------------------------------------------

export const DEFAULT_REALISM: RealismSettings = {
  playerLoyalty: true,
  tradeRequests: true,
  nominatedTradeDestinations: true,
  reducedNominatedLeverage: true,
  playersRefuseTrades: true,
  playerRoleDisputes: true,
  salaryDumpTrades: true,
  softCapSpending: false,
  draftVariance: true,
  ngaAcademy: true,
  ngaAcademyZoneMatching: true,
  fixtureBlockbusterBias: true,
  fixtureRivalryScheduling: true,
  venueScheduling: true,
  coachingCarousel: true,
  boardPressure: true,
  boardPolitics: true,
  aflHouseInterference: false,
  aflHouseExpansionEvolution: true,
  aflHouseCompetitionEvolution: true,
  aflHouseFinalsEvolution: true,
  aflHouseListRulesEvolution: true,
  aflHouseSalaryCapEvolution: true,
  aflHouseFixtureEvolution: true,
  listSizeEnforcement: true,
  mediaLeaks: true,
  negotiationDelays: true,
  tacticalInjuryConsequences: true,
  tacticalSuspensionConsequences: true,
  brownlowNight: true,
  specialEventPlayerImpact: true,
  tribunalEarlyPleaDiscount: true,
  tribunalLegalRepresentation: true,
  tribunalPriorRecord: true,
  allowLoans: true,
}

// ---------------------------------------------------------------------------
// Full default GameSettings
// ---------------------------------------------------------------------------

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  difficulty: 'medium',
  simSpeed: 'normal',
  leagueMode: 'real',
  leagueNamingTemplate: 'real-life',
  includePathwayLeagues: true,
  teamCount: 18,
  seasonStructure: { ...DEFAULT_SEASON_STRUCTURE },
  matchRules: { ...DEFAULT_MATCH_RULES },
  ladderPoints: { ...DEFAULT_LADDER_POINTS },
  listRules: { ...DEFAULT_LIST_RULES },
  salaryCap: true,
  salaryCapAmount: 18_300_000,
  inflation: { ...DEFAULT_INFLATION_SETTINGS },
  realism: { ...DEFAULT_REALISM },
  injuryFrequency: 'medium',
  developmentSpeed: 'normal',
  finals: { ...DEFAULT_FINALS },
  fixtureSchedule: {
    matchSlots: DEFAULT_MATCH_SLOTS.map((s) => ({ ...s })),
  },
  blockbusters: DEFAULT_BLOCKBUSTERS.map((b) => ({ ...b })),
  ladderSorting: {
    primary: 'points',
    tieBreakers: ['percentage', 'wins', 'pointsFor', 'clubId'],
  },
  fixturePolicy: {
    homeAwayBalance: true,
    travelWeighting: 40,
    venueSharingRules: true,
  },
  customRivalryPairs: [],
  specialEvents: { ...DEFAULT_SPECIAL_EVENTS, events: { ...DEFAULT_SPECIAL_EVENTS.events } },
  notifications: {
    signings: {
      starThreshold: 4,
      inApp: true,
      email: true,
      dailyDigest: false,
    },
    autoResolveMatches: false,
    liveSimMode: 'always-live',
  },
  stateLeagueAffiliations: {
    allowCustomAffiliations: false,
    clubAffiliations: {},
  },
  seasonStartDate: '2026-03-20',
  gameStartDate: computeDefaultGameStartDate(2026),
  aflDistributions: { ...DEFAULT_DISTRIBUTION_CONFIG, ladderTiers: DEFAULT_DISTRIBUTION_CONFIG.ladderTiers.map((t) => ({ ...t })) },
}

/** Create a deep copy of default settings */
export function createDefaultSettings(): GameSettings {
  return {
    ...DEFAULT_GAME_SETTINGS,
    seasonStructure: { ...DEFAULT_GAME_SETTINGS.seasonStructure },
    matchRules: { ...DEFAULT_GAME_SETTINGS.matchRules },
    ladderPoints: { ...DEFAULT_GAME_SETTINGS.ladderPoints },
    listRules: { ...DEFAULT_GAME_SETTINGS.listRules },
    realism: { ...DEFAULT_REALISM },
    inflation: { ...DEFAULT_INFLATION_SETTINGS },
    finals: { ...DEFAULT_GAME_SETTINGS.finals },
    fixtureSchedule: {
      matchSlots: DEFAULT_MATCH_SLOTS.map((s) => ({ ...s })),
    },
    blockbusters: DEFAULT_BLOCKBUSTERS.map((b) => ({ ...b })),
    ladderSorting: {
      ...(DEFAULT_GAME_SETTINGS.ladderSorting ?? {
        primary: 'points',
        tieBreakers: ['percentage', 'wins', 'pointsFor', 'clubId'],
      }),
      tieBreakers: [...(DEFAULT_GAME_SETTINGS.ladderSorting?.tieBreakers ?? ['percentage', 'wins', 'pointsFor', 'clubId'])],
    },
    fixturePolicy: { ...(DEFAULT_GAME_SETTINGS.fixturePolicy ?? { homeAwayBalance: true, travelWeighting: 40, venueSharingRules: true }) },
    customRivalryPairs: [...(DEFAULT_GAME_SETTINGS.customRivalryPairs ?? [])],
    specialEvents: {
      ...DEFAULT_SPECIAL_EVENTS,
      events: { ...DEFAULT_SPECIAL_EVENTS.events },
      originConfig: {
        ...DEFAULT_ORIGIN_CONFIG,
        participatingStates: [...DEFAULT_ORIGIN_CONFIG.participatingStates],
        alliesStates: [...DEFAULT_ORIGIN_CONFIG.alliesStates],
      },
    },
    notifications: {
      signings: { ...DEFAULT_GAME_SETTINGS.notifications.signings },
      autoResolveMatches: DEFAULT_GAME_SETTINGS.notifications.autoResolveMatches,
      liveSimMode: DEFAULT_GAME_SETTINGS.notifications.liveSimMode,
    } satisfies NotificationSettings,
    stateLeagueAffiliations: {
      allowCustomAffiliations: DEFAULT_GAME_SETTINGS.stateLeagueAffiliations.allowCustomAffiliations,
      clubAffiliations: { ...DEFAULT_GAME_SETTINGS.stateLeagueAffiliations.clubAffiliations },
    },
    aflDistributions: { ...DEFAULT_DISTRIBUTION_CONFIG, ladderTiers: DEFAULT_DISTRIBUTION_CONFIG.ladderTiers.map((t) => ({ ...t })) },
  }
}

// ---------------------------------------------------------------------------
// Auto-round mapping for blockbusters (maps blockbuster id to target round)
// Used when targetRound is 'auto'
// ---------------------------------------------------------------------------

export const BLOCKBUSTER_AUTO_ROUNDS: Record<string, number> = {
  'r1-opener': 1,
  'easter-thursday': 5,
  'good-friday': 5,
  'easter-monday': 5,
  'anzac-day-eve': 7,
  'anzac-day': 7,
  'dreamtime': 11,
  'kings-birthday-eve': 13,
  'kings-birthday': 13,
  // Derby auto placement: first ~early, second ~late
  'western-derby-1': 3,
  'western-derby-2': 20,
  'qclash-1': 8,
  'qclash-2': 17,
  'sydney-derby-1': 6,
  'sydney-derby-2': 19,
  'showdown-1': 8,
  'showdown-2': 20,
}
