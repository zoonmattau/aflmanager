import type { Venue, VenueState } from '@/types/venue'

// ---------------------------------------------------------------------------
// Static venue registry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Ground characteristics reference
//   scoringCoefficient  : goal accuracy multiplier (0.7–1.3, 1.0 = neutral)
//   kickToHandballRatio : >1.0 = open/kick-dominant, <1.0 = compact/handball-heavy
//   disposalCoefficient : multiplier on total possessions — big grounds generate more
//   markCoefficient     : multiplier on marking chance — open space = more marks
//   contestedCoefficient: multiplier on contested / tackle rate — compact = more congestion
//   weatherBias         : additive to base weather weights (wind/wet/hot/humid)
//   dimensions          : oval length × width in metres
// ---------------------------------------------------------------------------

export const VENUES: Record<string, Venue> = {
  mcg: {
    id: 'mcg',
    name: 'MCG',
    city: 'Melbourne',
    state: 'VIC',
    capacity: 100024,
    revenueMultiplier: 1.3,
    hgaBonus: 4,
    isNeutral: false,
    ends: ['Punt Road End', 'Members End'],
    // Vast open arena — high disposal count, great marking ground, spread play
    scoringCoefficient: 0.97,
    kickToHandballRatio: 1.18,
    disposalCoefficient: 1.08,
    markCoefficient: 1.14,
    contestedCoefficient: 0.88,
    weatherBias: { wind: 0.02, wet: 0.04, hot: 0.01, humid: 0.00 },
    dimensions: { length: 171, width: 146 },
  },
  'marvel-stadium': {
    id: 'marvel-stadium',
    name: 'Marvel Stadium',
    city: 'Melbourne',
    state: 'VIC',
    capacity: 53359,
    revenueMultiplier: 1.0,
    hgaBonus: 3,
    isNeutral: false,
    hasRoof: true,
    ends: ['Northern End', 'Southern End'],
    // Compact rectangular indoor — handball game, congested, fewer disposals, never rains under the roof
    scoringCoefficient: 1.12,
    kickToHandballRatio: 0.88,
    disposalCoefficient: 0.90,
    markCoefficient: 0.82,
    contestedCoefficient: 1.18,
    // Indoor: no wind/wet possible; minimal heat/humid bias
    weatherBias: { wind: -0.15, wet: -0.12, hot: -0.05, humid: -0.04 },
    dimensions: { length: 160, width: 128 },
  },
  'adelaide-oval': {
    id: 'adelaide-oval',
    name: 'Adelaide Oval',
    city: 'Adelaide',
    state: 'SA',
    capacity: 53583,
    revenueMultiplier: 1.1,
    hgaBonus: 5,
    isNeutral: false,
    ends: ['River End', 'Cathedral End'],
    // Elongated oval, notorious wind exposure from hills — big marking game, spread play
    scoringCoefficient: 0.94,
    kickToHandballRatio: 1.12,
    disposalCoefficient: 1.05,
    markCoefficient: 1.10,
    contestedCoefficient: 0.92,
    weatherBias: { wind: 0.14, wet: 0.03, hot: 0.05, humid: 0.00 },
    dimensions: { length: 167, width: 124 },
  },
  'optus-stadium': {
    id: 'optus-stadium',
    name: 'Optus Stadium',
    city: 'Perth',
    state: 'WA',
    capacity: 60000,
    revenueMultiplier: 1.15,
    hgaBonus: 5,
    isNeutral: false,
    ends: ['City End', 'Matagarup End'],
    // Purpose-built, true oval, great surface, Perth Fremantle Doctor breeze
    scoringCoefficient: 1.10,
    kickToHandballRatio: 1.15,
    disposalCoefficient: 1.07,
    markCoefficient: 1.12,
    contestedCoefficient: 0.90,
    weatherBias: { wind: 0.10, wet: 0.02, hot: 0.05, humid: 0.00 },
    dimensions: { length: 165, width: 130 },
  },
  'gmhba-stadium': {
    id: 'gmhba-stadium',
    name: 'GMHBA Stadium',
    city: 'Geelong',
    state: 'VIC',
    capacity: 36000,
    revenueMultiplier: 0.85,
    hgaBonus: 5,
    isNeutral: false,
    ends: ['City End', 'Members End'],
    // Geelong exposed to Corio Bay winds — notoriously windy, affects mark counts
    scoringCoefficient: 1.05,
    kickToHandballRatio: 1.05,
    disposalCoefficient: 1.00,
    markCoefficient: 1.03,
    contestedCoefficient: 1.00,
    weatherBias: { wind: 0.12, wet: 0.04, hot: 0.00, humid: 0.00 },
    dimensions: { length: 155, width: 128 },
  },
  gabba: {
    id: 'gabba',
    name: 'The Gabba',
    city: 'Brisbane',
    state: 'QLD',
    capacity: 42000,
    revenueMultiplier: 0.9,
    hgaBonus: 5,
    isNeutral: false,
    ends: ['Vulture Street End', 'Stanley Street End'],
    // Compact QLD ground, notorious congestion and humidity, lowest marking rate in the comp
    scoringCoefficient: 0.92,
    kickToHandballRatio: 0.88,
    disposalCoefficient: 0.90,
    markCoefficient: 0.84,
    contestedCoefficient: 1.20,
    weatherBias: { wind: -0.02, wet: 0.04, hot: 0.08, humid: 0.12 },
    dimensions: { length: 154, width: 126 },
  },
  scg: {
    id: 'scg',
    name: 'SCG',
    city: 'Sydney',
    state: 'NSW',
    capacity: 46000,
    revenueMultiplier: 1.05,
    hgaBonus: 5,
    isNeutral: false,
    ends: ['Members End', 'Paddington End'],
    // Traditional oval, balanced conditions, moderate Sydney humidity
    scoringCoefficient: 1.00,
    kickToHandballRatio: 1.08,
    disposalCoefficient: 1.00,
    markCoefficient: 1.02,
    contestedCoefficient: 1.00,
    weatherBias: { wind: 0.02, wet: 0.02, hot: 0.04, humid: 0.03 },
    dimensions: { length: 155, width: 136 },
  },
  'engie-stadium': {
    id: 'engie-stadium',
    name: 'ENGIE Stadium',
    city: 'Sydney',
    state: 'NSW',
    capacity: 24000,
    revenueMultiplier: 0.65,
    hgaBonus: 4,
    isNeutral: false,
    ends: ['City End', 'Homebush End'],
    // Rectangular, compact — handball game, very congested, limited marking space
    scoringCoefficient: 1.08,
    kickToHandballRatio: 0.85,
    disposalCoefficient: 0.92,
    markCoefficient: 0.85,
    contestedCoefficient: 1.15,
    weatherBias: { wind: 0.04, wet: 0.03, hot: 0.03, humid: 0.02 },
    dimensions: { length: 158, width: 122 },
  },
  'people-first-stadium': {
    id: 'people-first-stadium',
    name: 'People First Stadium',
    city: 'Gold Coast',
    state: 'QLD',
    capacity: 25000,
    revenueMultiplier: 0.6,
    hgaBonus: 4,
    isNeutral: false,
    ends: ['Surfers Paradise End', 'Hinterland End'],
    // Compact, hot and sticky — saps energy, fewer disposals, most humid ground in comp
    scoringCoefficient: 0.95,
    kickToHandballRatio: 0.90,
    disposalCoefficient: 0.92,
    markCoefficient: 0.88,
    contestedCoefficient: 1.12,
    weatherBias: { wind: -0.02, wet: 0.04, hot: 0.10, humid: 0.14 },
    dimensions: { length: 152, width: 122 },
  },
  'utas-stadium': {
    id: 'utas-stadium',
    name: 'UTAS Stadium',
    city: 'Launceston',
    state: 'TAS',
    capacity: 22000,
    revenueMultiplier: 0.5,
    hgaBonus: 2,
    isNeutral: true,
    ends: ['Inveresk End', 'Tipperary End'],
    // Windy Launceston ground, open ends — blustery, affects marks and accuracy
    scoringCoefficient: 0.96,
    kickToHandballRatio: 1.10,
    disposalCoefficient: 1.00,
    markCoefficient: 1.00,
    contestedCoefficient: 1.00,
    weatherBias: { wind: 0.12, wet: 0.10, hot: -0.05, humid: 0.00 },
    dimensions: { length: 158, width: 130 },
  },
  'blundstone-arena': {
    id: 'blundstone-arena',
    name: 'Blundstone Arena',
    city: 'Hobart',
    state: 'TAS',
    capacity: 20000,
    revenueMultiplier: 0.5,
    hgaBonus: 2,
    isNeutral: true,
    ends: ['Derwent End', 'City End'],
    // Hobart's wet reputation — frequently soft/heavy ground, reduces marking, lowers scores
    scoringCoefficient: 0.94,
    kickToHandballRatio: 1.02,
    disposalCoefficient: 0.95,
    markCoefficient: 0.90,
    contestedCoefficient: 1.05,
    weatherBias: { wind: 0.08, wet: 0.14, hot: -0.05, humid: 0.00 },
    dimensions: { length: 150, width: 120 },
  },
  'manuka-oval': {
    id: 'manuka-oval',
    name: 'Manuka Oval',
    city: 'Canberra',
    state: 'ACT',
    capacity: 13000,
    revenueMultiplier: 0.4,
    hgaBonus: 1,
    isNeutral: true,
    ends: ['Parliamentary End', 'Telopea Park End'],
    // Small compact ground, short shots — high conversion, handball-friendly
    scoringCoefficient: 1.10,
    kickToHandballRatio: 0.92,
    disposalCoefficient: 0.95,
    markCoefficient: 0.95,
    contestedCoefficient: 1.05,
    weatherBias: { wind: 0.05, wet: 0.05, hot: 0.01, humid: 0.00 },
    dimensions: { length: 145, width: 118 },
  },
  'tio-stadium': {
    id: 'tio-stadium',
    name: 'TIO Stadium',
    city: 'Darwin',
    state: 'NT',
    capacity: 12500,
    revenueMultiplier: 0.45,
    hgaBonus: 0,
    isNeutral: true,
    ends: ['Tiger Brennan End', 'City End'],
    // Darwin's extreme heat and humidity — hardest conditions in the comp, low disposals
    scoringCoefficient: 1.06,
    kickToHandballRatio: 1.05,
    disposalCoefficient: 0.93,
    markCoefficient: 0.98,
    contestedCoefficient: 1.02,
    weatherBias: { wind: 0.00, wet: 0.06, hot: 0.14, humid: 0.16 },
    dimensions: { length: 148, width: 120 },
  },
  'mars-stadium': {
    id: 'mars-stadium',
    name: 'Mars Stadium',
    city: 'Ballarat',
    state: 'VIC',
    capacity: 11000,
    revenueMultiplier: 0.4,
    hgaBonus: 2,
    isNeutral: true,
    ends: ['Wendouree End', 'City End'],
    // Cold Ballarat ground, frequently wet/heavy — physical, lower scores and disposals
    scoringCoefficient: 0.93,
    kickToHandballRatio: 1.00,
    disposalCoefficient: 0.95,
    markCoefficient: 0.92,
    contestedCoefficient: 1.05,
    weatherBias: { wind: 0.05, wet: 0.10, hot: -0.05, humid: 0.00 },
    dimensions: { length: 148, width: 122 },
  },
  'norwood-oval': {
    id: 'norwood-oval',
    name: 'Norwood Oval',
    city: 'Adelaide',
    state: 'SA',
    capacity: 20000,
    revenueMultiplier: 0.5,
    hgaBonus: 2,
    isNeutral: true,
    ends: ['The Hill End', 'Members End'],
    // Suburban Adelaide oval — windy like Adelaide Oval but smaller, slightly handball-heavy
    scoringCoefficient: 1.02,
    kickToHandballRatio: 0.95,
    disposalCoefficient: 0.97,
    markCoefficient: 0.96,
    contestedCoefficient: 1.05,
    weatherBias: { wind: 0.10, wet: 0.02, hot: 0.05, humid: 0.00 },
    dimensions: { length: 150, width: 120 },
  },
}

// ---------------------------------------------------------------------------
// Club-to-venue default mapping
// ---------------------------------------------------------------------------

export const CLUB_DEFAULT_VENUES: Record<string, { primary: string; secondary?: string }> = {
  richmond: { primary: 'mcg' },
  collingwood: { primary: 'mcg' },
  melbourne: { primary: 'mcg' },
  hawthorn: { primary: 'mcg', secondary: 'utas-stadium' },
  carlton: { primary: 'marvel-stadium' },
  essendon: { primary: 'marvel-stadium' },
  northmelbourne: { primary: 'marvel-stadium' },
  stkilda: { primary: 'marvel-stadium' },
  westernbulldogs: { primary: 'marvel-stadium', secondary: 'mars-stadium' },
  adelaide: { primary: 'adelaide-oval' },
  portadelaide: { primary: 'adelaide-oval' },
  westcoast: { primary: 'optus-stadium' },
  fremantle: { primary: 'optus-stadium' },
  geelong: { primary: 'gmhba-stadium' },
  brisbane: { primary: 'gabba' },
  goldcoast: { primary: 'people-first-stadium' },
  sydney: { primary: 'scg' },
  gws: { primary: 'engie-stadium' },
}

// ---------------------------------------------------------------------------
// Venue name to ID mapping (backward compat bridge)
// ---------------------------------------------------------------------------

export const VENUE_NAME_TO_ID: Record<string, string> = Object.fromEntries(
  Object.values(VENUES).map((v) => [v.name, v.id]),
)

// Also add common alternate names
VENUE_NAME_TO_ID['Gabba'] = 'gabba'
VENUE_NAME_TO_ID['The Gabba'] = 'gabba'

// ---------------------------------------------------------------------------
// Shared venue overflow mapping
// MCG clubs overflow to Marvel, Adelaide Oval clubs have no overflow needed
// ---------------------------------------------------------------------------

export const SHARED_VENUE_OVERFLOW: Record<string, string> = {
  mcg: 'marvel-stadium',
  'marvel-stadium': 'mcg',
  'adelaide-oval': 'norwood-oval',
  'optus-stadium': 'optus-stadium', // WA clubs have no overflow, stays at Optus
}

// ---------------------------------------------------------------------------
// State-to-state distance table for travel fatigue
// 0 = same state, 1 = adjacent, 2-3 = moderate, 4-5 = cross-country
// ---------------------------------------------------------------------------

const STATES: VenueState[] = ['VIC', 'SA', 'WA', 'QLD', 'NSW', 'TAS', 'NT', 'ACT']

const DISTANCE_MATRIX: number[][] = [
  // VIC  SA  WA  QLD NSW TAS  NT  ACT
  [  0,   2,  4,   3,  1,  1,  4,  1 ], // VIC
  [  2,   0,  3,   4,  2,  2,  3,  2 ], // SA
  [  4,   3,  0,   4,  4,  5,  3,  4 ], // WA
  [  3,   4,  4,   0,  2,  4,  3,  2 ], // QLD
  [  1,   2,  4,   2,  0,  2,  4,  1 ], // NSW
  [  1,   2,  5,   4,  2,  0,  5,  2 ], // TAS
  [  4,   3,  3,   3,  4,  5,  0,  4 ], // NT
  [  1,   2,  4,   2,  1,  2,  4,  0 ], // ACT
]

export const STATE_DISTANCE: Record<string, Record<string, number>> = {}
for (let i = 0; i < STATES.length; i++) {
  STATE_DISTANCE[STATES[i]] = {}
  for (let j = 0; j < STATES.length; j++) {
    STATE_DISTANCE[STATES[i]][STATES[j]] = DISTANCE_MATRIX[i][j]
  }
}

// ---------------------------------------------------------------------------
// Neutral venue options for sold games
// ---------------------------------------------------------------------------

export const SOLD_GAME_VENUES = [
  'utas-stadium',
  'blundstone-arena',
  'manuka-oval',
  'tio-stadium',
  'mars-stadium',
  'norwood-oval',
] as const

// ---------------------------------------------------------------------------
// Roof resolver
// Returns true if the venue has a roof, respecting user overrides.
// overrides: settings.venueRoofOverrides (venueId → boolean), optional.
// venueName + customStadiums: fallback lookup for user-created custom stadiums
//   which aren't in the static VENUES registry.
// ---------------------------------------------------------------------------

export function venueHasRoof(
  venueId: string | undefined,
  overrides?: Record<string, boolean>,
  venueName?: string,
  customStadiums?: Array<{ name: string; hasRoof?: boolean }>,
): boolean {
  // Static venue — check overrides first, then the venue's own data
  if (venueId) {
    if (overrides && venueId in overrides) return overrides[venueId]
    if (VENUES[venueId]?.hasRoof) return true
  }
  // Custom stadium — match by venue name
  if (venueName && customStadiums) {
    const cs = customStadiums.find((s) => s.name === venueName)
    if (cs?.hasRoof) return true
  }
  return false
}
