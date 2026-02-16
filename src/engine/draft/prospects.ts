import type { SeededRNG } from '@/engine/core/rng'
import type {
  DraftClassProfile,
  DraftProspect,
  DraftArchetype,
  DraftRole,
  DraftLinkedType,
  HomeState,
  ScoutingRegion,
  ScoutingReport,
} from '@/types/draft'
import type {
  PlayerAttributes,
  HiddenAttributes,
  PlayerPersonality,
  PlayerPositionType,
} from '@/types/player'
import { FIRST_NAMES, LAST_NAMES } from '@/data/names'
import u18RegionsJson from '@/data/u18Regions.json'
import sanflClubsJson from '@/data/sanflClubs.json'
import waflClubsJson from '@/data/waflClubs.json'
import tflClubsJson from '@/data/tflClubs.json'
import ntflClubsJson from '@/data/ntflClubs.json'
import clubsJson from '@/data/clubs.json'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Total number of prospects to generate per draft class. */
const DRAFT_CLASS_SIZE = 80

/** All 52 attribute keys on PlayerAttributes. */
const ALL_ATTRIBUTE_KEYS: (keyof PlayerAttributes)[] = [
  'kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap',
  'handballEfficiency', 'handballDistance', 'handballReceive',
  'markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested',
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
  'tackling', 'contested', 'clearance', 'hardness',
  'disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure',
  'goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct',
  'intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding',
  'hitouts', 'ruckCreative', 'followUp',
  'pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch',
  'centreBounce', 'boundaryThrowIn', 'stoppage',
]

/** The 18 AFL club IDs. */
const CLUB_IDS: string[] = [
  'adelaide', 'brisbane', 'carlton', 'collingwood', 'essendon', 'fremantle',
  'geelong', 'goldcoast', 'gws', 'hawthorn', 'melbourne', 'northmelbourne',
  'portadelaide', 'richmond', 'stjilda', 'sydney', 'westcoast', 'western-bulldogs',
]

type ProspectTier = DraftProspect['tier']

interface TierConfig {
  baseMin: number
  baseMax: number
  biasMax: number
  pickRangeMin: number
  pickRangeMax: number
  ceilingMin: number
  ceilingMax: number
}

const TIER_CONFIG: Record<ProspectTier, TierConfig> = {
  elite: {
    baseMin: 55, baseMax: 75, biasMax: 85,
    pickRangeMin: 1, pickRangeMax: 6,
    ceilingMin: 80, ceilingMax: 95,
  },
  'first-round': {
    baseMin: 45, baseMax: 65, biasMax: 75,
    pickRangeMin: 3, pickRangeMax: 20,
    ceilingMin: 65, ceilingMax: 85,
  },
  'second-round': {
    baseMin: 35, baseMax: 55, biasMax: 65,
    pickRangeMin: 16, pickRangeMax: 42,
    ceilingMin: 55, ceilingMax: 75,
  },
  late: {
    baseMin: 25, baseMax: 45, biasMax: 55,
    pickRangeMin: 32, pickRangeMax: 65,
    ceilingMin: 40, ceilingMax: 65,
  },
  'rookie-list': {
    baseMin: 20, baseMax: 40, biasMax: 45,
    pickRangeMin: 55, pickRangeMax: 80,
    ceilingMin: 30, ceilingMax: 55,
  },
}

interface ClassStrengthTuning {
  strength: DraftClassProfile['strength']
  weight: number
  scoreMin: number
  scoreMax: number
  topEndMin: number
  topEndMax: number
  depthMin: number
  depthMax: number
  attributeShift: number
  potentialShift: number
  tierDistribution: {
    elite: [number, number]
    firstRound: [number, number]
    secondRound: [number, number]
    late: [number, number]
  }
}

const CLASS_STRENGTH_TUNINGS: ClassStrengthTuning[] = [
  {
    strength: 'weak',
    weight: 0.18,
    scoreMin: 30,
    scoreMax: 49,
    topEndMin: 2,
    topEndMax: 4,
    depthMin: 30,
    depthMax: 46,
    attributeShift: -4,
    potentialShift: -5,
    tierDistribution: {
      elite: [1, 2],
      firstRound: [7, 10],
      secondRound: [17, 22],
      late: [28, 34],
    },
  },
  {
    strength: 'average',
    weight: 0.44,
    scoreMin: 50,
    scoreMax: 67,
    topEndMin: 4,
    topEndMax: 7,
    depthMin: 47,
    depthMax: 61,
    attributeShift: 0,
    potentialShift: 0,
    tierDistribution: {
      elite: [3, 4],
      firstRound: [10, 12],
      secondRound: [20, 25],
      late: [25, 30],
    },
  },
  {
    strength: 'strong',
    weight: 0.28,
    scoreMin: 68,
    scoreMax: 86,
    topEndMin: 7,
    topEndMax: 11,
    depthMin: 62,
    depthMax: 78,
    attributeShift: 3,
    potentialShift: 4,
    tierDistribution: {
      elite: [4, 6],
      firstRound: [12, 15],
      secondRound: [22, 28],
      late: [21, 27],
    },
  },
  {
    strength: 'generational',
    weight: 0.10,
    scoreMin: 87,
    scoreMax: 99,
    topEndMin: 10,
    topEndMax: 15,
    depthMin: 72,
    depthMax: 90,
    attributeShift: 6,
    potentialShift: 8,
    tierDistribution: {
      elite: [6, 8],
      firstRound: [15, 19],
      secondRound: [24, 30],
      late: [16, 23],
    },
  },
]

interface WeightedEntry<T> {
  value: T
  weight: number
}

const REGION_WEIGHTS: WeightedEntry<ScoutingRegion>[] = [
  { value: 'VIC', weight: 0.35 },
  { value: 'SA', weight: 0.15 },
  { value: 'WA', weight: 0.20 },
  { value: 'NSW/ACT', weight: 0.15 },
  { value: 'QLD', weight: 0.10 },
  { value: 'TAS', weight: 0.03 },
  { value: 'NT', weight: 0.02 },
]

const POSITION_WEIGHTS: WeightedEntry<PlayerPositionType>[] = [
  { value: 'IM', weight: 0.16 },
  { value: 'OM', weight: 0.10 },
  { value: 'HBF', weight: 0.10 },
  { value: 'HFF', weight: 0.08 },
  { value: 'FB', weight: 0.07 },
  { value: 'BP', weight: 0.06 },
  { value: 'CHB', weight: 0.06 },
  { value: 'FF', weight: 0.07 },
  { value: 'FP', weight: 0.06 },
  { value: 'CHF', weight: 0.06 },
  { value: 'W', weight: 0.08 },
  { value: 'RK', weight: 0.10 },
]

const POSITION_BIAS_KEYS: Record<PlayerPositionType, (keyof PlayerAttributes)[]> = {
  BP: ['spoiling', 'oneOnOne', 'speed', 'zonalAwareness', 'intercept'],
  FB: ['intercept', 'spoiling', 'oneOnOne', 'markingContested', 'zonalAwareness'],
  HBF: ['rebounding', 'fieldKicking', 'intercept', 'kickingDistance', 'composure'],
  CHB: ['intercept', 'markingContested', 'markingOverhead', 'strength', 'oneOnOne'],
  W: ['speed', 'endurance', 'fieldKicking', 'kickingEfficiency', 'positioning'],
  IM: ['contested', 'clearance', 'groundBallGet', 'endurance', 'tackling', 'hardness'],
  OM: ['endurance', 'clearance', 'contested', 'centreBounce', 'disposalDecision'],
  RK: ['hitouts', 'ruckCreative', 'followUp', 'leap', 'strength'],
  HFF: ['goalkicking', 'leadingPatterns', 'creativity', 'insideForward', 'markingLeading'],
  CHF: ['goalkicking', 'markingContested', 'strength', 'insideForward', 'scoringInstinct'],
  FP: ['goalkicking', 'speed', 'agility', 'snap', 'pressure'],
  FF: ['goalkicking', 'scoringInstinct', 'insideForward', 'markingContested', 'snap'],
}

const SECONDARY_POSITION_MAP: Record<PlayerPositionType, PlayerPositionType[]> = {
  BP: ['FB', 'HBF'],
  FB: ['BP', 'CHB'],
  HBF: ['CHB', 'W', 'BP'],
  CHB: ['FB', 'HBF'],
  W: ['OM', 'HBF', 'HFF'],
  IM: ['OM', 'HFF'],
  OM: ['IM', 'W'],
  RK: ['FF', 'CHF'],
  HFF: ['CHF', 'OM', 'W'],
  CHF: ['FF', 'HFF'],
  FP: ['FF', 'HFF'],
  FF: ['CHF', 'FP'],
}

const ARCHETYPES_BY_POSITION: Record<PlayerPositionType, { archetype: DraftArchetype; role: DraftRole }[]> = {
  BP: [
    { archetype: 'lockdown-defender', role: 'shutdown' },
    { archetype: 'rebound-defender', role: 'line-breaker' },
  ],
  FB: [
    { archetype: 'lockdown-defender', role: 'shutdown' },
    { archetype: 'intercept-defender', role: 'aerial-threat' },
  ],
  HBF: [
    { archetype: 'rebound-defender', role: 'line-breaker' },
    { archetype: 'intercept-defender', role: 'utility' },
  ],
  CHB: [
    { archetype: 'intercept-defender', role: 'aerial-threat' },
    { archetype: 'swingman', role: 'utility' },
  ],
  W: [
    { archetype: 'two-way-wing', role: 'line-breaker' },
    { archetype: 'outside-runner', role: 'utility' },
  ],
  IM: [
    { archetype: 'inside-bull', role: 'ball-winner' },
    { archetype: 'outside-runner', role: 'line-breaker' },
  ],
  OM: [
    { archetype: 'outside-runner', role: 'line-breaker' },
    { archetype: 'two-way-wing', role: 'utility' },
  ],
  RK: [
    { archetype: 'tap-ruck', role: 'ruck-craft' },
    { archetype: 'mobile-ruck', role: 'utility' },
  ],
  HFF: [
    { archetype: 'lead-up-forward', role: 'ground-pressure' },
    { archetype: 'small-pressure-forward', role: 'ground-pressure' },
  ],
  CHF: [
    { archetype: 'lead-up-forward', role: 'contested-mark' },
    { archetype: 'power-forward', role: 'aerial-threat' },
  ],
  FP: [
    { archetype: 'small-pressure-forward', role: 'ground-pressure' },
    { archetype: 'lead-up-forward', role: 'line-breaker' },
  ],
  FF: [
    { archetype: 'power-forward', role: 'contested-mark' },
    { archetype: 'lead-up-forward', role: 'aerial-threat' },
  ],
}

interface PhysicalRange {
  heightMin: number
  heightMax: number
  weightMin: number
  weightMax: number
}

const POSITION_PHYSICALS: Record<PlayerPositionType, PhysicalRange> = {
  BP: { heightMin: 180, heightMax: 193, weightMin: 82, weightMax: 95 },
  FB: { heightMin: 185, heightMax: 197, weightMin: 85, weightMax: 97 },
  HBF: { heightMin: 180, heightMax: 193, weightMin: 80, weightMax: 92 },
  CHB: { heightMin: 188, heightMax: 198, weightMin: 88, weightMax: 98 },
  W: { heightMin: 178, heightMax: 190, weightMin: 76, weightMax: 88 },
  IM: { heightMin: 178, heightMax: 192, weightMin: 78, weightMax: 92 },
  OM: { heightMin: 178, heightMax: 190, weightMin: 78, weightMax: 90 },
  RK: { heightMin: 196, heightMax: 208, weightMin: 95, weightMax: 110 },
  HFF: { heightMin: 180, heightMax: 193, weightMin: 80, weightMax: 93 },
  CHF: { heightMin: 188, heightMax: 200, weightMin: 88, weightMax: 100 },
  FP: { heightMin: 175, heightMax: 188, weightMin: 76, weightMax: 88 },
  FF: { heightMin: 185, heightMax: 200, weightMin: 86, weightMax: 100 },
}

interface U18Region {
  id: string
  name: string
  state: string
}

const U18_REGIONS = u18RegionsJson as U18Region[]

const SANFL_CLUB_NAMES = (sanflClubsJson as Array<{ name: string }>).map((c) => c.name)
const WAFL_CLUB_NAMES = (waflClubsJson as Array<{ name: string }>).map((c) => c.name)
const TFL_CLUB_NAMES = (tflClubsJson as Array<{ name: string }>).map((c) => c.name)
const NTFL_CLUB_NAMES = (ntflClubsJson as Array<{ name: string }>).map((c) => c.name)
const VFL_CLUB_NAMES = (clubsJson as Array<{ name: string }>).map((c) => `${c.name} VFL`)

const SCHOOL_SYSTEM_NAMES: Record<string, string[]> = {
  APS: ['Scotch College', 'Xavier College', 'Melbourne Grammar', 'Carey Grammar', 'Wesley College'],
  AGSV: ['Marcellin College', 'Penleigh and Essendon Grammar', "St Bernard's", "Assumption College", 'Ivanhoe Grammar'],
  'APS SA': ['Prince Alfred College', "St Peter's College", 'Pembroke School', 'Scotch College Adelaide', 'Westminster School'],
  'PSA WA': ['Hale School', 'Scotch College WA', 'Wesley College WA', 'Aquinas College WA', 'Christ Church Grammar'],
  'GPS QLD': ['Brisbane Grammar', 'Brisbane State High', 'Nudgee College', 'TSS', 'Anglican Church Grammar'],
  'GPS NSW': ['Scots College', 'Shore', 'Kings School', 'St Josephs College', 'Sydney Grammar'],
  CAS: ['Barker College', 'Knox Grammar', 'Cranbrook School', 'Waverley College', "Aloysius College"],
  CHS: ['Westfields Sports High', 'Matraville Sports High', 'Hunter Sports High', 'Illawarra Sports High', 'Narrabeen Sports High'],
  'ACT School Sport': ['Marist College Canberra', 'Daramalan College', 'Radford College', 'Canberra Grammar', 'St Edmunds College'],
  'Tasmanian Colleges': ['Guilford Young College', 'St Patricks College', 'The Hutchins School', 'Launceston College', 'Rosny College'],
  'NT Schools': ['Essington School', 'Darwin High School', 'Kormilda College', 'Palmerston College', 'Nightcliff Middle School'],
  'WA School Sport': ['Aquinas Academy', 'Swan Coastal College', 'Perth Central College', 'Joondalup Senior College', 'Rockingham Sports College'],
  'SANFL Schools': ['Sacred Heart College', 'Henley High School', 'Golden Grove High School', 'Glenunga International', 'Immanuel College'],
  AIC: ['St Peters Lutheran', 'Padua College', 'Marist College Ashgrove', 'St Edmunds College', 'Villanova College'],
  'Local Club': ['Local Junior League'],
}

const SCHOOL_SYSTEMS_BY_STATE: Record<HomeState, string[]> = {
  VIC: ['APS', 'AGSV', 'Local Club'],
  SA: ['APS SA', 'SANFL Schools', 'Local Club'],
  WA: ['PSA WA', 'WA School Sport', 'Local Club'],
  NSW: ['GPS NSW', 'CAS', 'CHS', 'Local Club'],
  ACT: ['ACT School Sport', 'GPS NSW', 'Local Club'],
  QLD: ['GPS QLD', 'AIC', 'Local Club'],
  TAS: ['Tasmanian Colleges', 'Local Club'],
  NT: ['NT Schools', 'Local Club'],
}

const JUNIOR_CLUBS_BY_STATE: Record<HomeState, string[]> = {
  VIC: ['Oakleigh Chargers Juniors', 'Sandringham Dragons Juniors', 'Dandenong Stingrays Juniors', 'Gippsland Power Juniors', 'Western Jets Juniors'],
  SA: ['Norwood Juniors', 'Glenelg Juniors', 'Sturt Juniors', 'West Adelaide Juniors', 'Woodville-West Torrens Juniors'],
  WA: ['East Fremantle Juniors', 'Claremont Juniors', 'Subiaco Juniors', 'South Fremantle Juniors', 'Swan Districts Juniors'],
  NSW: ['Sydney Swans Academy', 'GWS Academy', 'Sydney University Juniors', 'East Coast Eagles Juniors', 'Northern Beaches Juniors'],
  ACT: ['Ainslie Juniors', 'Belconnen Juniors', 'Eastlake Juniors', 'Tuggeranong Juniors', 'Queanbeyan Juniors'],
  QLD: ['Brisbane Lions Academy', 'Gold Coast Suns Academy', 'Aspley Juniors', 'Morningside Juniors', 'Broadbeach Juniors'],
  TAS: ['North Hobart Juniors', 'Clarence Juniors', 'Launceston Juniors', 'Glenorchy Juniors', 'Burnie Dockers Juniors'],
  NT: ['Nightcliff Juniors', 'St Marys Juniors', 'Waratah Juniors', 'Darwin Buffaloes Juniors', 'Tiwi Bombers Juniors'],
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function pickWeighted<T>(entries: WeightedEntry<T>[], rng: SeededRNG): T {
  const roll = rng.nextFloat(0, 1)
  let cumulative = 0
  for (const entry of entries) {
    cumulative += entry.weight
    if (roll < cumulative) return entry.value
  }
  return entries[entries.length - 1].value
}

function pickClassStrengthTuning(rng: SeededRNG): ClassStrengthTuning {
  const weighted: WeightedEntry<ClassStrengthTuning>[] = CLASS_STRENGTH_TUNINGS.map((t) => ({ value: t, weight: t.weight }))
  return pickWeighted(weighted, rng)
}

function resolveClassProfile(year: number, rng: SeededRNG): { profile: DraftClassProfile; tuning: ClassStrengthTuning } {
  const tuning = pickClassStrengthTuning(rng)
  const topEnd = rng.nextInt(tuning.topEndMin, tuning.topEndMax)
  const depth = rng.nextInt(tuning.depthMin, tuning.depthMax)
  const profile: DraftClassProfile = {
    year,
    strength: tuning.strength,
    strengthScore: rng.nextInt(tuning.scoreMin, tuning.scoreMax),
    topEndTalent: topEnd,
    depthRating: depth,
  }
  return { profile, tuning }
}

function generateAttributes(
  tier: ProspectTier,
  primaryPosition: PlayerPositionType,
  rng: SeededRNG,
  classAttributeShift: number,
): PlayerAttributes {
  const config = TIER_CONFIG[tier]
  const biasKeys = new Set(POSITION_BIAS_KEYS[primaryPosition])
  const attrs = {} as Record<keyof PlayerAttributes, number>

  for (const key of ALL_ATTRIBUTE_KEYS) {
    if (biasKeys.has(key)) {
      attrs[key] = clamp(rng.nextInt(config.baseMin, config.biasMax) + classAttributeShift, 20, 99)
    } else {
      attrs[key] = clamp(rng.nextInt(config.baseMin, config.baseMax) + classAttributeShift, 15, 95)
    }
  }

  return attrs as PlayerAttributes
}

function generateHiddenAttributes(
  tier: ProspectTier,
  rng: SeededRNG,
  classPotentialShift: number,
): HiddenAttributes {
  const config = TIER_CONFIG[tier]

  const potentialCeiling = clamp(rng.nextInt(config.ceilingMin, config.ceilingMax) + classPotentialShift, 30, 99)
  const developmentRate = Math.round(rng.nextFloat(0.6, 1.8) * 100) / 100
  const peakAgeStart = rng.nextInt(24, 28)
  const peakAgeEnd = peakAgeStart + rng.nextInt(3, 6)
  const declineRate = Math.round(rng.nextFloat(0.5, 1.8) * 100) / 100
  const injuryProneness = rng.nextInt(5, 80)
  const durability = clamp(100 - injuryProneness + rng.nextInt(-12, 12), 20, 95)
  const bigGameModifier = rng.nextInt(-10, 10)

  return {
    potentialCeiling,
    developmentRate,
    peakAgeStart,
    peakAgeEnd,
    declineRate,
    injuryProneness,
    durability,
    bigGameModifier,
  }
}

function generatePersonality(rng: SeededRNG): PlayerPersonality {
  return {
    ambition: rng.nextInt(20, 95),
    loyalty: rng.nextInt(20, 95),
    professionalism: rng.nextInt(20, 95),
    temperament: rng.nextInt(20, 95),
  }
}

function determinePathway(region: ScoutingRegion, rng: SeededRNG): DraftProspect['pathway'] {
  if (region === 'VIC') {
    const roll = rng.nextFloat(0, 1)
    if (roll < 0.55) return 'Coates Talent League'
    if (roll < 0.85) return 'APS'
    return 'School Football'
  }

  if (region === 'SA' || region === 'WA') {
    const roll = rng.nextFloat(0, 1)
    if (roll < 0.55) return 'State League'
    if (roll < 0.8) return 'School Football'
    return 'Coates Talent League'
  }

  const roll = rng.nextFloat(0, 1)
  if (roll < 0.4) return 'State League'
  if (roll < 0.7) return 'School Football'
  if (roll < 0.9) return 'Coates Talent League'
  return 'International'
}

function determineHomeState(region: ScoutingRegion, rng: SeededRNG): HomeState {
  switch (region) {
    case 'VIC':
      return 'VIC'
    case 'SA':
      return 'SA'
    case 'WA':
      return 'WA'
    case 'QLD':
      return 'QLD'
    case 'NSW/ACT':
      return rng.chance(0.75) ? 'NSW' : 'ACT'
    case 'TAS':
      return 'TAS'
    case 'NT':
      return 'NT'
  }
}

function pickSecondaryPositions(primary: PlayerPositionType, rng: SeededRNG): PlayerPositionType[] {
  const candidates = SECONDARY_POSITION_MAP[primary]
  if (candidates.length === 0) return []
  const count = rng.chance(0.4) ? 2 : 1
  return rng.shuffle(candidates).slice(0, Math.min(count, candidates.length))
}

function pickArchetypeAndRole(primary: PlayerPositionType, rng: SeededRNG): { archetype: DraftArchetype; role: DraftRole } {
  const options = ARCHETYPES_BY_POSITION[primary]
  return rng.pick(options)
}

function assignU18Club(
  region: ScoutingRegion,
  pathway: DraftProspect['pathway'],
  rng: SeededRNG,
): string | null {
  if (pathway !== 'Coates Talent League') return null

  const stateMap: Record<ScoutingRegion, string[]> = {
    VIC: ['VIC'],
    SA: ['VIC'],
    WA: ['VIC'],
    'NSW/ACT': ['VIC'],
    QLD: ['VIC'],
    TAS: ['TAS', 'VIC'],
    NT: ['VIC'],
  }

  const validStates = stateMap[region]
  const candidates = U18_REGIONS.filter((r) => validStates.includes(r.state))
  if (candidates.length === 0) return null
  return rng.pick(candidates).id
}

function pickNationalU18Team(homeState: HomeState, rng: SeededRNG): DraftProspect['background']['nationalU18Team'] {
  switch (homeState) {
    case 'VIC':
      return rng.chance(0.55) ? 'VIC Metro' : 'VIC Country'
    case 'SA':
      return 'SA'
    case 'WA':
      return 'WA'
    case 'NSW':
    case 'ACT':
      return rng.chance(0.72) ? 'NSW/ACT' : 'Allies'
    case 'QLD':
      return rng.chance(0.72) ? 'QLD' : 'Allies'
    case 'TAS':
      return rng.chance(0.7) ? 'Tasmania' : 'Allies'
    case 'NT':
      return rng.chance(0.65) ? 'NT' : 'Allies'
  }
}

function pickSchoolSystem(homeState: HomeState, pathway: DraftProspect['pathway'], rng: SeededRNG): string {
  const systems = SCHOOL_SYSTEMS_BY_STATE[homeState]
  if (pathway === 'APS') {
    const apsLike = systems.filter((s) => s.includes('APS') || s === 'AGSV' || s === 'PSA WA' || s === 'GPS QLD' || s === 'GPS NSW' || s === 'CAS')
    if (apsLike.length > 0) return rng.pick(apsLike)
  }
  if (pathway === 'State League') {
    const nonSchool = systems.filter((s) => s !== 'APS' && s !== 'AGSV')
    return rng.pick(nonSchool.length > 0 ? nonSchool : systems)
  }
  return rng.pick(systems)
}

function pickSchoolName(schoolSystem: string, rng: SeededRNG): string {
  const candidates = SCHOOL_SYSTEM_NAMES[schoolSystem] ?? ['Regional Football Program']
  if (candidates.length === 1 && candidates[0] === 'Local Junior League') {
    return `${rng.pick(['North', 'South', 'East', 'West', 'Central'])} District Football College`
  }
  return rng.pick(candidates)
}

function pickStateLeagueClub(homeState: HomeState, pathway: DraftProspect['pathway'], rng: SeededRNG): { league: DraftProspect['background']['stateLeague']; club: string | null } {
  const prob =
    pathway === 'State League' ? 0.9 :
    pathway === 'Coates Talent League' ? 0.35 :
    pathway === 'APS' || pathway === 'School Football' ? 0.25 :
    0.12

  if (!rng.chance(prob)) return { league: null, club: null }

  switch (homeState) {
    case 'SA':
      return { league: 'SANFL', club: rng.pick(SANFL_CLUB_NAMES) }
    case 'WA':
      return { league: 'WAFL', club: rng.pick(WAFL_CLUB_NAMES) }
    case 'TAS':
      return { league: 'TFL', club: rng.pick(TFL_CLUB_NAMES) }
    case 'NT':
      return { league: 'NTFL', club: rng.pick(NTFL_CLUB_NAMES) }
    default:
      return { league: 'VFL', club: rng.pick(VFL_CLUB_NAMES) }
  }
}

function buildBackground(
  homeState: HomeState,
  pathway: DraftProspect['pathway'],
  region: ScoutingRegion,
  rng: SeededRNG,
): DraftProspect['background'] {
  const schoolSystem = pickSchoolSystem(homeState, pathway, rng)
  const schoolName = pickSchoolName(schoolSystem, rng)
  const juniorClub = rng.pick(JUNIOR_CLUBS_BY_STATE[homeState])
  const nationalU18Team = pickNationalU18Team(homeState, rng)
  const stateLeague = pickStateLeagueClub(homeState, pathway, rng)

  const matches = rng.nextInt(2, 5)
  const disposalsPerGame = Math.round(rng.nextFloat(11, 27) * 10) / 10
  const goalsPerGame = Math.round(rng.nextFloat(0, 2.4) * 10) / 10

  const stateLeagueSummary = stateLeague.club
    ? `and then played senior minutes with ${stateLeague.club} in the ${stateLeague.league}`
    : 'before focusing on school and U18 football'

  return {
    schoolSystem,
    schoolName,
    juniorClub,
    scoutingTournament: 'AFL National U18 Championships',
    nationalU18Team,
    nationalU18Stats: {
      matches,
      disposalsPerGame,
      goalsPerGame,
    },
    stateLeague: stateLeague.league,
    stateLeagueClub: stateLeague.club,
    pathwaySummary: `${region} prospect from ${schoolName} (${schoolSystem}), developed at ${juniorClub}, represented ${nationalU18Team} at the U18s ${stateLeagueSummary}.`,
  }
}

function buildTierPlan(tuning: ClassStrengthTuning, rng: SeededRNG): ProspectTier[] {
  const prospects: ProspectTier[] = []

  const eliteCount = rng.nextInt(tuning.tierDistribution.elite[0], tuning.tierDistribution.elite[1])
  const firstRoundCount = rng.nextInt(tuning.tierDistribution.firstRound[0], tuning.tierDistribution.firstRound[1])
  const secondRoundCount = rng.nextInt(tuning.tierDistribution.secondRound[0], tuning.tierDistribution.secondRound[1])
  const lateCount = rng.nextInt(tuning.tierDistribution.late[0], tuning.tierDistribution.late[1])

  for (let i = 0; i < eliteCount; i++) prospects.push('elite')
  for (let i = 0; i < firstRoundCount; i++) prospects.push('first-round')
  for (let i = 0; i < secondRoundCount; i++) prospects.push('second-round')
  for (let i = 0; i < lateCount; i++) prospects.push('late')

  while (prospects.length < DRAFT_CLASS_SIZE) {
    prospects.push('rookie-list')
  }

  if (prospects.length > DRAFT_CLASS_SIZE) {
    return prospects.slice(0, DRAFT_CLASS_SIZE)
  }

  return prospects
}

function generateProspect(
  index: number,
  year: number,
  tier: ProspectTier,
  tuning: ClassStrengthTuning,
  rng: SeededRNG,
): DraftProspect {
  const firstName = rng.pick(FIRST_NAMES)
  const lastName = rng.pick(LAST_NAMES)
  const age = rng.nextInt(17, 19)
  const region = pickWeighted(REGION_WEIGHTS, rng)
  const homeState = determineHomeState(region, rng)
  const primaryPosition = pickWeighted(POSITION_WEIGHTS, rng)
  const secondaryPositions = pickSecondaryPositions(primaryPosition, rng)
  const { archetype, role } = pickArchetypeAndRole(primaryPosition, rng)

  const physicals = POSITION_PHYSICALS[primaryPosition]
  const height = rng.nextInt(physicals.heightMin, physicals.heightMax)
  const weight = rng.nextInt(physicals.weightMin, physicals.weightMax)

  const trueAttributes = generateAttributes(tier, primaryPosition, rng, tuning.attributeShift)
  const hiddenAttributes = generateHiddenAttributes(tier, rng, tuning.potentialShift)
  const personality = generatePersonality(rng)
  const pathway = determinePathway(region, rng)

  const config = TIER_CONFIG[tier]
  const basePick = rng.nextInt(config.pickRangeMin, config.pickRangeMax)
  const jitter = rng.nextInt(-3, 3)
  const projectedPick = clamp(basePick + jitter, 1, DRAFT_CLASS_SIZE)

  const linkedClubId = rng.chance(0.05) ? rng.pick(CLUB_IDS) : null
  const linkedType: DraftLinkedType | null = linkedClubId
    ? pickWeighted<DraftLinkedType>([
      { value: 'father-son', weight: 0.45 },
      { value: 'academy', weight: 0.35 },
      { value: 'nga', weight: 0.20 },
    ], rng)
    : null
  const u18ClubId = assignU18Club(region, pathway, rng)
  const background = buildBackground(homeState, pathway, region, rng)

  const scoutingReports: Record<string, ScoutingReport> = {}

  return {
    id: `draft-${year}-${String(index).padStart(3, '0')}`,
    firstName,
    lastName,
    age,
    region,
    homeState,
    position: {
      primary: primaryPosition,
      secondary: secondaryPositions,
    },
    archetype,
    role,
    height,
    weight,
    trueAttributes,
    hiddenAttributes,
    personality,
    scoutingReports,
    projectedPick,
    tier,
    linkedClubId,
    linkedType,
    pathway,
    u18ClubId,
    background,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateDraftClassWithProfile(
  year: number,
  rng: SeededRNG,
): { prospects: DraftProspect[]; classProfile: DraftClassProfile } {
  const { profile, tuning } = resolveClassProfile(year, rng)
  const tierPlan = buildTierPlan(tuning, rng)

  const prospects = tierPlan.map((tier, index) =>
    generateProspect(index, year, tier, tuning, rng),
  )

  prospects.sort((a, b) => a.projectedPick - b.projectedPick)

  return { prospects, classProfile: profile }
}

/**
 * Backward-compatible helper that returns only the prospect list.
 */
export function generateDraftClass(
  year: number,
  rng: SeededRNG,
): DraftProspect[] {
  return generateDraftClassWithProfile(year, rng).prospects
}

export function getProspectOverall(prospect: DraftProspect): number {
  let total = 0
  for (const key of ALL_ATTRIBUTE_KEYS) {
    total += prospect.trueAttributes[key]
  }
  return Math.round((total / ALL_ATTRIBUTE_KEYS.length) * 10) / 10
}

export function getProspectEstimatedOverall(
  prospect: DraftProspect,
  clubId: string,
): number | null {
  const report = prospect.scoutingReports[clubId]
  if (!report) return null

  const ranges = report.attributeRanges
  const rangeKeys = Object.keys(ranges) as (keyof PlayerAttributes)[]
  if (rangeKeys.length === 0) return null

  let total = 0
  for (const key of rangeKeys) {
    const range = ranges[key]
    if (range) {
      total += (range[0] + range[1]) / 2
    }
  }

  return Math.round((total / rangeKeys.length) * 10) / 10
}

/**
 * Apply optional realism variance:
 * - Top-end busts: reduced potential and slower development
 * - Late bloomers: increased potential and faster development
 */
export function applyDraftVariance(
  prospects: DraftProspect[],
  rng: SeededRNG,
  enabled: boolean,
): DraftProspect[] {
  if (!enabled) return prospects

  return prospects.map((p) => {
    const clone = {
      ...p,
      hiddenAttributes: { ...p.hiddenAttributes },
    }

    if ((p.tier === 'elite' || p.tier === 'first-round') && rng.chance(0.08)) {
      const reduction = rng.nextInt(15, 25)
      clone.hiddenAttributes.potentialCeiling = Math.max(30, clone.hiddenAttributes.potentialCeiling - reduction)
      clone.hiddenAttributes.developmentRate = Math.max(0.55, Math.round((clone.hiddenAttributes.developmentRate - rng.nextFloat(0.1, 0.35)) * 100) / 100)
    } else if ((p.tier === 'late' || p.tier === 'rookie-list') && rng.chance(0.06)) {
      const boost = rng.nextInt(15, 25)
      clone.hiddenAttributes.potentialCeiling = Math.min(99, clone.hiddenAttributes.potentialCeiling + boost)
      clone.hiddenAttributes.developmentRate = Math.min(2.0, Math.round((clone.hiddenAttributes.developmentRate + rng.nextFloat(0.12, 0.4)) * 100) / 100)
    }

    return clone
  })
}

export function stripLinkedClubs(prospects: DraftProspect[]): DraftProspect[] {
  return prospects.map((p) =>
    p.linkedClubId ? { ...p, linkedClubId: null, linkedType: null } : p,
  )
}
