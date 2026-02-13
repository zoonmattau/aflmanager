import type { SeededRNG } from '@/engine/core/rng'
import type {
  DraftProspect,
  Scout,
  ScoutingRegion,
  ScoutingReport,
} from '@/types/draft'
import type { PlayerAttributes } from '@/types/player'
import { FIRST_NAMES, LAST_NAMES } from '@/data/names'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All 52 attribute keys on PlayerAttributes. */
const ALL_ATTRIBUTE_KEYS: (keyof PlayerAttributes)[] = [
  // Kicking
  'kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap',
  // Handball
  'handballEfficiency', 'handballDistance', 'handballReceive',
  // Marking
  'markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested',
  // Physical
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
  // Contested
  'tackling', 'contested', 'clearance', 'hardness',
  // Game Sense
  'disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure',
  // Offensive
  'goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct',
  // Defensive
  'intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding',
  // Ruck
  'hitouts', 'ruckCreative', 'followUp',
  // Mental
  'pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch',
  // Set Pieces
  'centreBounce', 'boundaryThrowIn', 'stoppage',
]

/** Initial half-width of the scouted range around the true value. */
const INITIAL_RANGE_HALF_WIDTH = 35

/** Minimum attribute value. */
const MIN_ATTR = 1

/** Maximum attribute value. */
const MAX_ATTR = 100

/** Scout salary range. */
const MIN_SALARY = 40_000
const MAX_SALARY = 120_000

/** Scout skill range for generated scouts. */
const MIN_SCOUT_SKILL = 30
const MAX_SCOUT_SKILL = 90

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a value between min and max inclusive. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Calculate a scout's salary based on skill level.
 * Linearly scaled from MIN_SALARY (at skill 30) to MAX_SALARY (at skill 90).
 */
function salaryFromSkill(skill: number): number {
  const t = (skill - MIN_SCOUT_SKILL) / (MAX_SCOUT_SKILL - MIN_SCOUT_SKILL)
  const salary = MIN_SALARY + t * (MAX_SALARY - MIN_SALARY)
  return Math.round(salary / 1_000) * 1_000
}

/**
 * Create a fresh scouting report with initial wide ranges for all attributes.
 */
function createInitialReport(trueAttributes: PlayerAttributes): ScoutingReport {
  const attributeRanges: Partial<Record<keyof PlayerAttributes, [number, number]>> = {}

  for (const key of ALL_ATTRIBUTE_KEYS) {
    const trueValue = trueAttributes[key]
    const low = Math.max(MIN_ATTR, trueValue - INITIAL_RANGE_HALF_WIDTH)
    const high = Math.min(MAX_ATTR, trueValue + INITIAL_RANGE_HALF_WIDTH)
    attributeRanges[key] = [low, high]
  }

  const overallEstimate = calculateOverallEstimate(attributeRanges)

  return {
    sessionsCompleted: 0,
    confidence: 0,
    attributeRanges,
    overallEstimate,
  }
}

/**
 * Calculate the overall estimate as the average midpoint of all attribute ranges.
 */
function calculateOverallEstimate(
  attributeRanges: Partial<Record<keyof PlayerAttributes, [number, number]>>,
): number {
  let sum = 0
  let count = 0

  for (const key of ALL_ATTRIBUTE_KEYS) {
    const range = attributeRanges[key]
    if (range) {
      const midpoint = (range[0] + range[1]) / 2
      sum += midpoint
      count++
    }
  }

  return count > 0 ? Math.round((sum / count) * 10) / 10 : 0
}

// ---------------------------------------------------------------------------
// 1. generateScoutPool
// ---------------------------------------------------------------------------

/**
 * Generate a pool of available scouts for hiring.
 *
 * Each scout has a random skill level (30-90), a salary scaled from $40k-$120k
 * based on skill, and is initially unassigned to any club or region.
 */
export function generateScoutPool(count: number, rng: SeededRNG): Scout[] {
  const scouts: Scout[] = []

  for (let i = 0; i < count; i++) {
    const skill = rng.nextInt(MIN_SCOUT_SKILL, MAX_SCOUT_SKILL)

    scouts.push({
      id: crypto.randomUUID(),
      firstName: rng.pick(FIRST_NAMES),
      lastName: rng.pick(LAST_NAMES),
      skill,
      salary: salaryFromSkill(skill),
      assignedRegion: null,
      clubId: '',
    })
  }

  return scouts
}

// ---------------------------------------------------------------------------
// 2. hireScout
// ---------------------------------------------------------------------------

/**
 * Hire a scout by assigning them to a club.
 * Returns a new Scout object with the clubId set (does not mutate the original).
 */
export function hireScout(scout: Scout, clubId: string): Scout {
  return { ...scout, clubId }
}

// ---------------------------------------------------------------------------
// 3. fireScout
// ---------------------------------------------------------------------------

/**
 * Fire a scout, removing their club assignment and region.
 * Returns a new Scout object (does not mutate the original).
 */
export function fireScout(scout: Scout): Scout {
  return { ...scout, clubId: '', assignedRegion: null }
}

// ---------------------------------------------------------------------------
// 4. assignScoutToRegion
// ---------------------------------------------------------------------------

/**
 * Assign a scout to a specific scouting region.
 * Returns a new Scout object with the assignedRegion set (does not mutate).
 */
export function assignScoutToRegion(scout: Scout, region: ScoutingRegion): Scout {
  return { ...scout, assignedRegion: region }
}

// ---------------------------------------------------------------------------
// 5. runScoutingSessions
// ---------------------------------------------------------------------------

/**
 * Run a round of scouting sessions for all of a club's scouts.
 *
 * For each scout assigned to a region, every prospect in that region receives
 * an updated scouting report. Confidence grows each session based on scout
 * skill, and attribute ranges narrow toward the true values.
 *
 * Returns a new array of updated prospect objects (originals are not mutated).
 */
export function runScoutingSessions(
  scouts: Scout[],
  prospects: DraftProspect[],
  clubId: string,
  rng: SeededRNG,
): DraftProspect[] {
  // Filter to only this club's scouts that have an assigned region
  const activeScouts = scouts.filter(
    (s) => s.clubId === clubId && s.assignedRegion !== null,
  )

  if (activeScouts.length === 0) {
    return prospects
  }

  // Build a set of regions covered by this club's scouts, and track the
  // best scout skill per region (if multiple scouts cover the same region,
  // each scout runs an independent session)
  const scoutsByRegion = new Map<ScoutingRegion, Scout[]>()
  for (const scout of activeScouts) {
    const region = scout.assignedRegion!
    const existing = scoutsByRegion.get(region)
    if (existing) {
      existing.push(scout)
    } else {
      scoutsByRegion.set(region, [scout])
    }
  }

  // Process each prospect
  const updatedProspects = prospects.map((prospect) => {
    const regionScouts = scoutsByRegion.get(prospect.region)
    if (!regionScouts || regionScouts.length === 0) {
      return prospect
    }

    // Deep-clone the prospect to avoid mutation
    let updatedProspect: DraftProspect = {
      ...prospect,
      scoutingReports: { ...prospect.scoutingReports },
    }

    // Each scout assigned to this region runs one session
    for (const scout of regionScouts) {
      // Get or create the scouting report for this club
      const existingReport = updatedProspect.scoutingReports[clubId]
      const report: ScoutingReport = existingReport
        ? {
            ...existingReport,
            attributeRanges: { ...existingReport.attributeRanges },
          }
        : createInitialReport(prospect.trueAttributes)

      // Calculate confidence gain: 0.08 to 0.20 based on scout skill
      const baseGain = 0.08 + (scout.skill / 100) * 0.12
      const newConfidence = Math.min(1.0, report.confidence + baseGain)
      report.confidence = newConfidence

      // Narrow attribute ranges based on new confidence
      const rangeReduction = newConfidence * 0.7

      for (const key of ALL_ATTRIBUTE_KEYS) {
        const trueValue = prospect.trueAttributes[key]

        // Calculate the narrowed range
        const halfWidth = INITIAL_RANGE_HALF_WIDTH * (1 - rangeReduction)
        let low = trueValue - halfWidth
        let high = trueValue + halfWidth

        // Add slight scout error
        low += rng.nextFloat(-3, 3)
        high += rng.nextFloat(-3, 3)

        // Clamp to valid attribute range
        low = clamp(Math.round(low * 10) / 10, MIN_ATTR, MAX_ATTR)
        high = clamp(Math.round(high * 10) / 10, MIN_ATTR, MAX_ATTR)

        // Ensure low <= high
        if (low > high) {
          const temp = low
          low = high
          high = temp
        }

        report.attributeRanges[key] = [low, high]
      }

      // Recalculate overall estimate
      report.overallEstimate = calculateOverallEstimate(report.attributeRanges)

      // Increment sessions
      report.sessionsCompleted += 1

      // Assign the updated report back
      updatedProspect = {
        ...updatedProspect,
        scoutingReports: {
          ...updatedProspect.scoutingReports,
          [clubId]: report,
        },
      }
    }

    return updatedProspect
  })

  return updatedProspects
}

// ---------------------------------------------------------------------------
// 6. getScoutedAttributeValue
// ---------------------------------------------------------------------------

/**
 * Returns the scouted range for a specific attribute from a club's scouting
 * report on a prospect.
 *
 * Returns `null` if no scouting report exists for the club or if the
 * attribute has not been scouted.
 */
export function getScoutedAttributeValue(
  prospect: DraftProspect,
  attr: keyof PlayerAttributes,
  clubId: string,
): { low: number; high: number; midpoint: number } | null {
  const report = prospect.scoutingReports[clubId]
  if (!report) {
    return null
  }

  const range = report.attributeRanges[attr]
  if (!range) {
    return null
  }

  const [low, high] = range
  const midpoint = Math.round(((low + high) / 2) * 10) / 10

  return { low, high, midpoint }
}

// ---------------------------------------------------------------------------
// 7. getScoutingConfidence
// ---------------------------------------------------------------------------

/**
 * Returns the confidence level (0-1) for a club's scouting of a prospect.
 * Returns 0 if no scouting report exists.
 */
export function getScoutingConfidence(
  prospect: DraftProspect,
  clubId: string,
): number {
  const report = prospect.scoutingReports[clubId]
  if (!report) {
    return 0
  }
  return report.confidence
}
