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
  PositionGroup,
} from '@/types/player'
import { FIRST_NAMES, LAST_NAMES } from '@/data/names'

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

const POSITION_WEIGHTS: WeightedEntry<PositionGroup>[] = [
  { value: 'MID', weight: 0.22 },
  { value: 'HB', weight: 0.16 },
  { value: 'HF', weight: 0.12 },
  { value: 'FB', weight: 0.10 },
  { value: 'FF', weight: 0.10 },
  { value: 'WING', weight: 0.10 },
  { value: 'C', weight: 0.08 },
  { value: 'FOLL', weight: 0.06 },
  { value: 'INT', weight: 0.06 },
]

/** Attribute keys that receive a bias boost for each primary position. */
const POSITION_BIAS_KEYS: Record<PositionGroup, (keyof PlayerAttributes)[]> = {
  FB: ['intercept', 'spoiling', 'oneOnOne', 'markingContested', 'zonalAwareness'],
  HB: ['rebounding', 'fieldKicking', 'intercept', 'kickingDistance', 'composure'],
  C: ['endurance', 'clearance', 'contested', 'centreBounce', 'disposalDecision'],
  HF: ['goalkicking', 'leadingPatterns', 'creativity', 'insideForward', 'markingLeading'],
  FF: ['goalkicking', 'scoringInstinct', 'insideForward', 'markingContested', 'snap'],
  FOLL: ['hitouts', 'ruckCreative', 'followUp', 'leap', 'strength'],
  MID: ['contested', 'clearance', 'groundBallGet', 'endurance', 'tackling', 'hardness'],
  WING: ['speed', 'endurance', 'fieldKicking', 'kickingEfficiency', 'positioning'],
  INT: ['endurance', 'tackling', 'hardness', 'workRate', 'speed'],
}

/** Secondary position affinities per primary position. */
const SECONDARY_POSITION_MAP: Record<PositionGroup, PositionGroup[]> = {
  FB: ['HB'],
  HB: ['MID', 'WING', 'FB'],
  C: ['MID', 'WING'],
  HF: ['MID', 'FF', 'WING'],
  FF: ['HF'],
  FOLL: ['FF', 'HF'],
  MID: ['WING', 'HF', 'C'],
  WING: ['MID', 'HB', 'C'],
  INT: ['MID', 'WING'],
}

// ── Height / weight ranges per position ──────────────────────────────────────

interface PhysicalRange {
  heightMin: number
  heightMax: number
  weightMin: number
  weightMax: number
}

const POSITION_PHYSICALS: Record<PositionGroup, PhysicalRange> = {
  FB: { heightMin: 185, heightMax: 197, weightMin: 85, weightMax: 97 },
  HB: { heightMin: 180, heightMax: 193, weightMin: 80, weightMax: 92 },
  C: { heightMin: 178, heightMax: 190, weightMin: 78, weightMax: 90 },
  HF: { heightMin: 182, heightMax: 195, weightMin: 82, weightMax: 95 },
  FF: { heightMin: 185, heightMax: 200, weightMin: 86, weightMax: 100 },
  FOLL: { heightMin: 196, heightMax: 208, weightMin: 95, weightMax: 110 },
  MID: { heightMin: 178, heightMax: 192, weightMin: 78, weightMax: 92 },
  WING: { heightMin: 178, heightMax: 190, weightMin: 76, weightMax: 88 },
  INT: { heightMin: 178, heightMax: 192, weightMin: 78, weightMax: 92 },
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
  primaryPosition: PositionGroup,
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
  primary: PositionGroup,
  rng: SeededRNG,
): PositionGroup[] {
  const candidates = SECONDARY_POSITION_MAP[primary]
  if (candidates.length === 0) return []

  // 1-2 secondary positions
  const count = rng.chance(0.4) ? 2 : 1
  const shuffled = rng.shuffle(candidates)
  return shuffled.slice(0, Math.min(count, shuffled.length))
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

  // ~5% chance of Father-Son / Academy link
  const linkedClubId = rng.chance(0.05) ? rng.pick(CLUB_IDS) : null

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
