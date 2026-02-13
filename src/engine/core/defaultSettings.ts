import type {
  GameSettings,
  MatchTimeSlot,
  BlockbusterMatch,
  SeasonStructureSettings,
  MatchRulesSettings,
  LadderPointsSettings,
  ListRulesSettings,
  FinalsSettings,
  RealismSettings,
} from '@/types/game'
import { computeDefaultGameStartDate } from '@/engine/calendar/calendarEngine'

// ---------------------------------------------------------------------------
// Default match time slots (9 slots spanning Thu–Mon)
// ---------------------------------------------------------------------------

export const DEFAULT_MATCH_SLOTS: MatchTimeSlot[] = [
  { id: 'thu-night',      day: 'Thursday',          time: '7:20pm', enabled: true },
  { id: 'fri-night',      day: 'Friday',            time: '7:50pm', enabled: true },
  { id: 'sat-early',      day: 'Saturday-Early',    time: '1:45pm', enabled: true },
  { id: 'sat-twilight',   day: 'Saturday-Twilight',  time: '4:35pm', enabled: true },
  { id: 'sat-night',      day: 'Saturday-Night',    time: '7:25pm', enabled: true },
  { id: 'sun-early',      day: 'Sunday-Early',      time: '1:10pm', enabled: true },
  { id: 'sun-twilight-1', day: 'Sunday-Twilight',    time: '3:20pm', enabled: true },
  { id: 'sun-twilight-2', day: 'Sunday-Twilight',    time: '4:40pm', enabled: true },
  { id: 'mon-arvo',       day: 'Monday',            time: '3:20pm', enabled: true },
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
// Default realism settings
// ---------------------------------------------------------------------------

export const DEFAULT_REALISM: RealismSettings = {
  playerLoyalty: true,
  tradeRequests: true,
  playerRoleDisputes: true,
  salaryDumpTrades: true,
  softCapSpending: false,
  draftVariance: true,
  ngaAcademy: true,
  fixtureBlockbusterBias: true,
  coachingCarousel: true,
  boardPressure: true,
  aflHouseInterference: false,
}

// ---------------------------------------------------------------------------
// Full default GameSettings
// ---------------------------------------------------------------------------

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  difficulty: 'medium',
  simSpeed: 'normal',
  leagueMode: 'real',
  teamCount: 18,
  seasonStructure: { ...DEFAULT_SEASON_STRUCTURE },
  matchRules: { ...DEFAULT_MATCH_RULES },
  ladderPoints: { ...DEFAULT_LADDER_POINTS },
  listRules: { ...DEFAULT_LIST_RULES },
  salaryCap: true,
  salaryCapAmount: 18_300_000,
  realism: { ...DEFAULT_REALISM },
  injuryFrequency: 'medium',
  developmentSpeed: 'normal',
  finals: { ...DEFAULT_FINALS },
  fixtureSchedule: {
    matchSlots: DEFAULT_MATCH_SLOTS.map((s) => ({ ...s })),
  },
  blockbusters: DEFAULT_BLOCKBUSTERS.map((b) => ({ ...b })),
  seasonStartDate: '2026-03-20',
  gameStartDate: computeDefaultGameStartDate(2026),
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
    finals: { ...DEFAULT_GAME_SETTINGS.finals },
    fixtureSchedule: {
      matchSlots: DEFAULT_MATCH_SLOTS.map((s) => ({ ...s })),
    },
    blockbusters: DEFAULT_BLOCKBUSTERS.map((b) => ({ ...b })),
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
