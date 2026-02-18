// AFL game constants
export const QUARTERS_PER_MATCH = 4
export const POSSESSIONS_PER_QUARTER = 140  // ~120-160, averaged
export const POINTS_PER_GOAL = 6
export const POINTS_PER_BEHIND = 1

// Season structure
export const REGULAR_SEASON_ROUNDS = 23
export const TEAMS_IN_FINALS = 8
export const TOTAL_CLUBS = 18

// List sizes
export const SENIOR_LIST_SIZE = 38
export const ROOKIE_LIST_SIZE = 6
export const MATCH_DAY_SQUAD = 22
export const ON_FIELD_PLAYERS = 18
export const INTERCHANGE_PLAYERS = 5

// Salary cap
export const DEFAULT_SALARY_CAP = 18_300_000
export const MINIMUM_SALARY = 110_000
export const TPP_ALLOWANCE = 1_200_000  // Total Player Payments allowance above cap
export const LUXURY_TAX_RATE = 1.50           // 150% of overage (matches calculateLuxuryTax)
export const CAP_WARNING_THRESHOLD = 0.95      // warn at 95% of cap

// Attribute ranges
export const MIN_ATTRIBUTE = 1
export const MAX_ATTRIBUTE = 100

// Development
export const YOUNG_AGE_THRESHOLD = 22
export const PEAK_AGE_START_DEFAULT = 25
export const PEAK_AGE_END_DEFAULT = 30
export const RETIREMENT_AGE_MIN = 30
export const RETIREMENT_AGE_MAX = 38

// Match day lineup slots (22 positions on field)
import type { LineupSlot, PlayerPositionType } from '@/types/player'

export const LINEUP_SLOTS: LineupSlot[] = [
  'LBP', 'RBP', 'FB',        // Back line
  'LHB', 'RHB', 'CHB',       // Half-back line
  'LW', 'RW', 'C',           // Centre line
  'LHF', 'RHF', 'CHF',       // Half-forward line
  'LFP', 'RFP', 'FF',        // Forward line
  'RK', 'RR', 'ROV',         // Followers
  'I1', 'I2', 'I3', 'I4', 'I5',   // Interchange
]

/** All possible interchange slots */
const ALL_INTERCHANGE_SLOTS: LineupSlot[] = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8']

/** Get lineup slots for a given interchange count (0-8) */
export function getLineupSlots(interchangeCount: number): LineupSlot[] {
  const onField: LineupSlot[] = [
    'LBP', 'RBP', 'FB',
    'LHB', 'RHB', 'CHB',
    'LW', 'RW', 'C',
    'LHF', 'RHF', 'CHF',
    'LFP', 'RFP', 'FF',
    'RK', 'RR', 'ROV',
  ]
  return [...onField, ...ALL_INTERCHANGE_SLOTS.slice(0, interchangeCount)]
}

/** Get squad size for a given interchange count */
export function getSquadSize(interchangeCount: number): number {
  return ON_FIELD_PLAYERS + interchangeCount
}

/** @deprecated Use LINEUP_SLOTS */
export const POSITIONS = LINEUP_SLOTS

export type MatchPosition = LineupSlot

/** Base position compatibility for all interchange slots */
const INTERCHANGE_COMPAT: PlayerPositionType[] = [
  'IM', 'OM', 'W',
  'HBF', 'BP', 'FB', 'CHB',
  'HFF', 'FP', 'FF', 'CHF',
  'RK',
]

/** Which player position types fit each lineup slot (in priority order) */
export const SLOT_POSITION_COMPATIBILITY: Record<LineupSlot, PlayerPositionType[]> = {
  LBP: ['BP', 'FB', 'HBF'],
  RBP: ['BP', 'FB', 'HBF'],
  FB:  ['FB', 'BP', 'CHB'],
  LHB: ['HBF', 'CHB', 'W', 'BP'],
  RHB: ['HBF', 'CHB', 'W', 'BP'],
  CHB: ['CHB', 'HBF', 'FB'],
  LW:  ['W', 'OM', 'HBF', 'HFF'],
  RW:  ['W', 'OM', 'HBF', 'HFF'],
  C:   ['OM', 'IM', 'W'],
  LHF: ['HFF', 'CHF', 'W', 'FP'],
  RHF: ['HFF', 'CHF', 'W', 'FP'],
  CHF: ['CHF', 'HFF', 'FF'],
  LFP: ['FP', 'FF', 'HFF'],
  RFP: ['FP', 'FF', 'HFF'],
  FF:  ['FF', 'FP', 'CHF'],
  RK:  ['RK'],
  RR:  ['IM', 'OM'],
  ROV: ['IM', 'OM'],
  I1:  ['IM', 'OM', 'W', 'HBF', 'HFF'],
  I2:  ['IM', 'OM', 'W', 'HBF', 'HFF'],
  I3:  ['IM', 'OM', 'W', 'HFF', 'CHF'],
  I4:  ['IM', 'OM', 'HBF', 'W', 'FP'],
  I5:  INTERCHANGE_COMPAT,
  I6:  INTERCHANGE_COMPAT,
  I7:  INTERCHANGE_COMPAT,
  I8:  INTERCHANGE_COMPAT,
}

/** Which line a position belongs to */
export const POSITION_LINE: Record<PlayerPositionType, 'DEF' | 'MID' | 'FWD' | 'RK'> = {
  BP:  'DEF',
  FB:  'DEF',
  HBF: 'DEF',
  CHB: 'DEF',
  W:   'MID',
  IM:  'MID',
  OM:  'MID',
  RK:  'RK',
  HFF: 'FWD',
  CHF: 'FWD',
  FP:  'FWD',
  FF:  'FWD',
}

/** All 12 player position types */
export const ALL_POSITION_TYPES: PlayerPositionType[] = [
  'BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF',
]

// Negotiation system
export const MAX_NEGOTIATION_ROUNDS = 6
export const NEGOTIATION_COOLDOWN_BASE = 1
export const MEDIA_LEAK_BASE_PROBABILITY = 0.15
export const NEGOTIATION_CONVERGENCE_RATE = 0.06
export const INCENTIVE_CAP_RATE = 0.50
export const MAX_CONCURRENT_NEGOTIATIONS = 3
export const NEGOTIATION_ELIGIBLE_ROUND = 8
