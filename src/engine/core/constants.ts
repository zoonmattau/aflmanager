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
export const INTERCHANGE_PLAYERS = 4

// Salary cap
export const DEFAULT_SALARY_CAP = 15_500_000
export const MINIMUM_SALARY = 110_000
export const TPP_ALLOWANCE = 1_200_000  // Total Player Payments allowance above cap

// Attribute ranges
export const MIN_ATTRIBUTE = 1
export const MAX_ATTRIBUTE = 100

// Development
export const YOUNG_AGE_THRESHOLD = 22
export const PEAK_AGE_START_DEFAULT = 25
export const PEAK_AGE_END_DEFAULT = 30
export const RETIREMENT_AGE_MIN = 30
export const RETIREMENT_AGE_MAX = 38

// Match day positions
export const POSITIONS = [
  'FB', 'BPL', 'BPR',        // Back line
  'HBF', 'CHB', 'HBF2',     // Half-back line
  'W', 'C', 'W2',             // Centre line
  'HFF', 'CHF', 'HFF2',     // Half-forward line
  'FP', 'FF', 'FP2',         // Forward line
  'RK', 'RR', 'ROV',         // Followers
  'I1', 'I2', 'I3', 'I4',   // Interchange
] as const

export type MatchPosition = typeof POSITIONS[number]
