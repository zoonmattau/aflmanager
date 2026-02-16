import type { Venue, VenueState } from '@/types/venue'

// ---------------------------------------------------------------------------
// Static venue registry
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
