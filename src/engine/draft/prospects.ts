import type { SeededRNG } from '@/engine/core/rng'
import type {
  DraftProspect,
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

// ── Constants ────────────────────────────────────────────────────────────────

/** Total number of prospects to generate per draft class. */
const DRAFT_CLASS_SIZE = 80

/** All 52 attribute keys on PlayerAttributes. */
const ALL_ATTRIBUTE_KEYS: (keyof PlayerAttributes)[] = [
  // Kicking (5)
  'kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap',
  // Handball (3)
  'handballEfficiency', 'handballDistance', 'handballReceive',
  // Marking (4)
  'markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested',
  // Physical (7)
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
  // Contested (4)
  'tackling', 'contested', 'clearance', 'hardness',
  // Game Sense (6)
  'disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure',
  // Offensive (5)
  'goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct',
  // Defensive (5)
  'intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding',
  // Ruck (3)
  'hitouts', 'ruckCreative', 'followUp',
  // Mental (7)
  'pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch',
  // Set Pieces (3)
  'centreBounce', 'boundaryThrowIn', 'stoppage',
]

/** The 18 AFL club IDs. */
const CLUB_IDS: string[] = [
  'adelaide', 'brisbane', 'carlton', 'collingwood', 'essendon', 'fremantle',
  'geelong', 'goldcoast', 'gws', 'hawthorn', 'melbourne', 'northmelbourne',
  'portadelaide', 'richmond', 'stjilda', 'sydney', 'westcoast', 'western-bulldogs',
]

// ── Tier configuration ───────────────────────────────────────────────────────

type ProspectTier = DraftProspect['tier']

interface TierConfig {
  baseMin: number
  baseMax: number
  biasMax: number
  /** Range for projectedPick within this tier (inclusive). */
  pickRangeMin: number
  pickRangeMax: number
  /** Range for hidden potentialCeiling. */
  ceilingMin: number
  ceilingMax: number
}

const TIER_CONFIG: Record<ProspectTier, TierConfig> = {
  elite: {
    baseMin: 55, baseMax: 75, biasMax: 85,
    pickRangeMin: 1, pickRangeMax: 5,
    ceilingMin: 80, ceilingMax: 95,
  },
  'first-round': {
    baseMin: 45, baseMax: 65, biasMax: 75,
    pickRangeMin: 3, pickRangeMax: 18,
    ceilingMin: 65, ceilingMax: 85,
  },
  'second-round': {
    baseMin: 35, baseMax: 55, biasMax: 65,
    pickRangeMin: 19, pickRangeMax: 40,
    ceilingMin: 55, ceilingMax: 75,
  },
  late: {
    baseMin: 25, baseMax: 45, biasMax: 55,
    pickRangeMin: 35, pickRangeMax: 65,
    ceilingMin: 40, ceilingMax: 65,
  },
  'rookie-list': {
    baseMin: 20, baseMax: 40, biasMax: 45,
    pickRangeMin: 55, pickRangeMax: 80,
    ceilingMin: 30, ceilingMax: 55,
  },
}

/**
 * Quality distribution targets.
 * Each entry is [tier, min, max] where min-max is the count range.
 */
const TIER_DISTRIBUTION: [ProspectTier, number, number][] = [
  ['elite', 3, 4],
  ['first-round', 10, 12],
  ['second-round', 20, 25],
  ['late', 25, 30],
  // Remainder fills rookie-list
]

// ── Region & position weighting ──────────────────────────────────────────────

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
  { value: 'TAS/NT', weight: 0.05 },
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

/** Attribute keys that receive a bias boost for each primary position. */
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

/** Secondary position affinities per primary position. */
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

// ── Height / weight ranges per position ──────────────────────────────────────

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

// ── Utilities ────────────────────────────────────────────────────────────────

/** Clamp a value between min and max inclusive. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Pick a value from a weighted array using the RNG. */
function pickWeighted<T>(entries: WeightedEntry<T>[], rng: SeededRNG): T {
  const roll = rng.nextFloat(0, 1)
  let cumulative = 0
  for (const entry of entries) {
    cumulative += entry.weight
    if (roll < cumulative) return entry.value
  }
  // Fallback to last entry (handles floating-point edge case)
  return entries[entries.length - 1].value
}

// ── Attribute generation ─────────────────────────────────────────────────────

/**
 * Generate the full 52-attribute set for a prospect based on tier and position.
 * Attributes in the position's bias set get a boost toward biasMax;
 * all other attributes are drawn from the tier's base range.
 */
function generateAttributes(
  tier: ProspectTier,
  primaryPosition: PlayerPositionType,
  rng: SeededRNG,
): PlayerAttributes {
  const config = TIER_CONFIG[tier]
  const biasKeys = new Set(POSITION_BIAS_KEYS[primaryPosition])

  const attrs = {} as Record<keyof PlayerAttributes, number>

  for (const key of ALL_ATTRIBUTE_KEYS) {
    if (biasKeys.has(key)) {
      // Biased attribute: draw from a wider range that reaches up to biasMax
      attrs[key] = rng.nextInt(config.baseMin, config.biasMax)
    } else {
      attrs[key] = rng.nextInt(config.baseMin, config.baseMax)
    }
  }

  return attrs as PlayerAttributes
}

// ── Hidden attributes ────────────────────────────────────────────────────────

function generateHiddenAttributes(
  tier: ProspectTier,
  rng: SeededRNG,
): HiddenAttributes {
  const config = TIER_CONFIG[tier]

  const potentialCeiling = rng.nextInt(config.ceilingMin, config.ceilingMax)
  const developmentRate = Math.round(rng.nextFloat(0.6, 1.8) * 100) / 100
  const peakAgeStart = rng.nextInt(24, 28)
  const peakAgeEnd = peakAgeStart + rng.nextInt(3, 6)
  const declineRate = Math.round(rng.nextFloat(0.5, 1.8) * 100) / 100
  const injuryProneness = rng.nextInt(5, 80)
  const bigGameModifier = rng.nextInt(-10, 10)

  return {
    potentialCeiling,
    developmentRate,
    peakAgeStart,
    peakAgeEnd,
    declineRate,
    injuryProneness,
    bigGameModifier,
  }
}

// ── Personality ──────────────────────────────────────────────────────────────

function generatePersonality(rng: SeededRNG): PlayerPersonality {
  return {
    ambition: rng.nextInt(20, 95),
    loyalty: rng.nextInt(20, 95),
    professionalism: rng.nextInt(20, 95),
    temperament: rng.nextInt(20, 95),
  }
}

// ── Pathway ──────────────────────────────────────────────────────────────────

function determinePathway(
  region: ScoutingRegion,
  rng: SeededRNG,
): DraftProspect['pathway'] {
  if (region === 'VIC') {
    // VIC is mainly Coates Talent League, small chance of APS
    return rng.chance(0.15) ? 'APS' : 'Coates Talent League'
  }
  if (region === 'SA' || region === 'WA') {
    // SA/WA are primarily State League pathways
    return rng.chance(0.1) ? 'Coates Talent League' : 'State League'
  }
  // NSW/ACT, QLD, TAS/NT: mixed pathways
  const roll = rng.nextFloat(0, 1)
  if (roll < 0.35) return 'Coates Talent League'
  if (roll < 0.65) return 'State League'
  if (roll < 0.95) return 'APS'
  return 'International'
}

// ── Secondary positions ──────────────────────────────────────────────────────

function pickSecondaryPositions(
  primary: PlayerPositionType,
  rng: SeededRNG,
): PlayerPositionType[] {
  const candidates = SECONDARY_POSITION_MAP[primary]
  if (candidates.length === 0) return []

  // 1-2 secondary positions
  const count = rng.chance(0.4) ? 2 : 1
  const shuffled = rng.shuffle(candidates)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

// ── U18 region assignment ────────────────────────────────────────────────

interface U18Region {
  id: string
  name: string
  state: string
}

const U18_REGIONS = u18RegionsJson as U18Region[]

function assignU18Club(
  region: ScoutingRegion,
  pathway: DraftProspect['pathway'],
  rng: SeededRNG,
): string | null {
  // Only Coates Talent League prospects get a U18 club assignment
  if (pathway !== 'Coates Talent League') return null

  // Map scouting region to state codes used in u18Regions.json
  const stateMap: Record<ScoutingRegion, string[]> = {
    'VIC': ['VIC'],
    'SA': ['VIC'],      // SA prospects in CTL play in VIC-based regions
    'WA': ['VIC'],      // Same
    'NSW/ACT': ['VIC'],
    'QLD': ['VIC'],
    'TAS/NT': ['TAS', 'VIC'],
  }

  const validStates = stateMap[region]
  const candidates = U18_REGIONS.filter((r) => validStates.includes(r.state))
  if (candidates.length === 0) return null

  return rng.pick(candidates).id
}

// ── Single prospect generation ───────────────────────────────────────────────

function generateProspect(
  index: number,
  year: number,
  tier: ProspectTier,
  rng: SeededRNG,
): DraftProspect {
  const firstName = rng.pick(FIRST_NAMES)
  const lastName = rng.pick(LAST_NAMES)
  const age = rng.nextInt(17, 19)
  const region = pickWeighted(REGION_WEIGHTS, rng)
  const primaryPosition = pickWeighted(POSITION_WEIGHTS, rng)
  const secondaryPositions = pickSecondaryPositions(primaryPosition, rng)

  const physicals = POSITION_PHYSICALS[primaryPosition]
  const height = rng.nextInt(physicals.heightMin, physicals.heightMax)
  const weight = rng.nextInt(physicals.weightMin, physicals.weightMax)

  const trueAttributes = generateAttributes(tier, primaryPosition, rng)
  const hiddenAttributes = generateHiddenAttributes(tier, rng)
  const personality = generatePersonality(rng)
  const pathway = determinePathway(region, rng)

  // Projected pick: based on tier range with a small jitter
  const config = TIER_CONFIG[tier]
  const basePick = rng.nextInt(config.pickRangeMin, config.pickRangeMax)
  const jitter = rng.nextInt(-2, 2)
  const projectedPick = clamp(basePick + jitter, 1, DRAFT_CLASS_SIZE)

  // ~5% chance of Father-Son / Academy link (gated by ngaAcademy realism setting at call site)
  const linkedClubId = rng.chance(0.05) ? rng.pick(CLUB_IDS) : null

  // Assign U18 talent league club based on region and pathway
  const u18ClubId = assignU18Club(region, pathway, rng)

  const scoutingReports: Record<string, ScoutingReport> = {}

  return {
    id: `draft-${year}-${String(index).padStart(3, '0')}`,
    firstName,
    lastName,
    age,
    region,
    position: {
      primary: primaryPosition,
      secondary: secondaryPositions,
    },
    height,
    weight,
    trueAttributes,
    hiddenAttributes,
    personality,
    scoutingReports,
    projectedPick,
    tier,
    linkedClubId,
    pathway,
    u18ClubId,
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a full draft class for the given year.
 *
 * Produces ~80 prospects spread across quality tiers:
 * - 3-4 elite
 * - 10-12 first-round
 * - 20-25 second-round
 * - 25-30 late
 * - Remainder as rookie-list
 *
 * @param year - The draft year (e.g. 2026)
 * @param rng  - The seeded random number generator
 * @returns An array of draft prospects sorted by projectedPick
 */
export function generateDraftClass(
  year: number,
  rng: SeededRNG,
): DraftProspect[] {
  const prospects: DraftProspect[] = []
  let index = 0

  // Generate prospects for each fixed-count tier
  let remaining = DRAFT_CLASS_SIZE
  for (const [tier, min, max] of TIER_DISTRIBUTION) {
    const count = rng.nextInt(min, max)
    for (let i = 0; i < count; i++) {
      prospects.push(generateProspect(index, year, tier, rng))
      index++
    }
    remaining -= count
  }

  // Fill the rest with rookie-list tier
  for (let i = 0; i < remaining; i++) {
    prospects.push(generateProspect(index, year, 'rookie-list', rng))
    index++
  }

  // Sort by projected pick ascending (consensus ranking order)
  prospects.sort((a, b) => a.projectedPick - b.projectedPick)

  return prospects
}

/**
 * Calculate a prospect's true overall rating as the average of all 52 attributes.
 *
 * @param prospect - The draft prospect to evaluate
 * @returns The arithmetic mean of all 52 attribute values (1-100 scale)
 */
export function getProspectOverall(prospect: DraftProspect): number {
  let total = 0
  for (const key of ALL_ATTRIBUTE_KEYS) {
    total += prospect.trueAttributes[key]
  }
  return Math.round((total / ALL_ATTRIBUTE_KEYS.length) * 10) / 10
}

/**
 * Get a club's estimated overall rating for a prospect based on their scouting report.
 *
 * Computes the average of the midpoints of all scouted attribute ranges. If the
 * club has no scouting report for this prospect, returns null.
 *
 * @param prospect - The draft prospect to evaluate
 * @param clubId   - The club ID whose scouting data to use
 * @returns The estimated overall, or null if the club has no report
 */
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
      const midpoint = (range[0] + range[1]) / 2
      total += midpoint
    }
  }

  return Math.round((total / rangeKeys.length) * 10) / 10
}

/**
 * Apply draft variance (busts and late bloomers) to a draft class.
 *
 * When enabled:
 * - ~8% of elite/first-round prospects get potentialCeiling reduced by 15-25 (bust)
 * - ~5% of late/rookie-list prospects get potentialCeiling boosted by 15-25 (bloom)
 *
 * When disabled, returns prospects unchanged.
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
      // Bust: reduce potential ceiling
      const reduction = rng.nextInt(15, 25)
      clone.hiddenAttributes.potentialCeiling = Math.max(30, clone.hiddenAttributes.potentialCeiling - reduction)
    } else if ((p.tier === 'late' || p.tier === 'rookie-list') && rng.chance(0.05)) {
      // Late bloomer: boost potential ceiling
      const boost = rng.nextInt(15, 25)
      clone.hiddenAttributes.potentialCeiling = Math.min(99, clone.hiddenAttributes.potentialCeiling + boost)
    }

    return clone
  })
}

/**
 * Strip NGA/Academy linked club IDs from all prospects.
 * Used when the ngaAcademy realism setting is disabled.
 */
export function stripLinkedClubs(prospects: DraftProspect[]): DraftProspect[] {
  return prospects.map((p) =>
    p.linkedClubId ? { ...p, linkedClubId: null } : p,
  )
}
