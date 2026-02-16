import type { SeededRNG } from '@/engine/core/rng'
import type {
  DraftProspect,
  Scout,
  ScoutSpecialtyRatings,
  ScoutingRegion,
  ScoutingReport,
} from '@/types/draft'
import type { PlayerAttributes, PlayerPositionType } from '@/types/player'
import { FIRST_NAMES, LAST_NAMES } from '@/data/names'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const SCOUTING_REGIONS: ScoutingRegion[] = ['VIC', 'SA', 'WA', 'NSW/ACT', 'QLD', 'TAS', 'NT']

const INITIAL_RANGE_HALF_WIDTH = 35
const INITIAL_POTENTIAL_HALF_WIDTH = 20
const MIN_ATTR = 1
const MAX_ATTR = 100

const MIN_SALARY = 40_000
const MAX_SALARY = 160_000

const MIN_SCOUT_SKILL = 30
const MAX_SCOUT_SKILL = 95

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function salaryFromSkill(skill: number, regionRatings: Record<ScoutingRegion, number>, specialtyRatings: ScoutSpecialtyRatings): number {
  const regionAvg = SCOUTING_REGIONS.reduce((sum, r) => sum + regionRatings[r], 0) / SCOUTING_REGIONS.length
  const specialtyAvg = (
    specialtyRatings.midfield + specialtyRatings.forward + specialtyRatings.defense + specialtyRatings.ruck + specialtyRatings.character
  ) / 5
  const blended = skill * 0.5 + regionAvg * 0.3 + specialtyAvg * 0.2
  const t = (blended - 30) / (95 - 30)
  const salary = MIN_SALARY + clamp(t, 0, 1) * (MAX_SALARY - MIN_SALARY)
  return Math.round(salary / 1_000) * 1_000
}

function calculateOverallEstimate(
  attributeRanges: Partial<Record<keyof PlayerAttributes, [number, number]>>,
): number {
  let sum = 0
  let count = 0
  for (const key of ALL_ATTRIBUTE_KEYS) {
    const range = attributeRanges[key]
    if (range) {
      sum += (range[0] + range[1]) / 2
      count++
    }
  }
  return count > 0 ? Math.round((sum / count) * 10) / 10 : 0
}

function calculatePotentialEstimate(range: [number, number]): number {
  return Math.round(((range[0] + range[1]) / 2) * 10) / 10
}

function createInitialReport(trueAttributes: PlayerAttributes, potentialCeiling: number): ScoutingReport {
  const attributeRanges: Partial<Record<keyof PlayerAttributes, [number, number]>> = {}

  for (const key of ALL_ATTRIBUTE_KEYS) {
    const trueValue = trueAttributes[key]
    const low = Math.max(MIN_ATTR, trueValue - INITIAL_RANGE_HALF_WIDTH)
    const high = Math.min(MAX_ATTR, trueValue + INITIAL_RANGE_HALF_WIDTH)
    attributeRanges[key] = [low, high]
  }

  const potLow = clamp(potentialCeiling - INITIAL_POTENTIAL_HALF_WIDTH, MIN_ATTR, MAX_ATTR)
  const potHigh = clamp(potentialCeiling + INITIAL_POTENTIAL_HALF_WIDTH, MIN_ATTR, MAX_ATTR)
  const potentialRange: [number, number] = [potLow, potHigh]

  return {
    sessionsCompleted: 0,
    confidence: 0,
    attributeRanges,
    overallEstimate: calculateOverallEstimate(attributeRanges),
    potentialRange,
    potentialEstimate: calculatePotentialEstimate(potentialRange),
  }
}

function randomSpecialtyRatings(rng: SeededRNG): ScoutSpecialtyRatings {
  return {
    midfield: rng.nextInt(35, 95),
    forward: rng.nextInt(35, 95),
    defense: rng.nextInt(35, 95),
    ruck: rng.nextInt(35, 95),
    character: rng.nextInt(35, 95),
  }
}

function randomRegionRatings(rng: SeededRNG): Record<ScoutingRegion, number> {
  const ratings = {} as Record<ScoutingRegion, number>
  for (const region of SCOUTING_REGIONS) {
    ratings[region] = rng.nextInt(30, 95)
  }
  return ratings
}

function getProspectSpecialtyKey(pos: PlayerPositionType): keyof ScoutSpecialtyRatings {
  if (pos === 'RK') return 'ruck'
  if (pos === 'BP' || pos === 'FB' || pos === 'HBF' || pos === 'CHB') return 'defense'
  if (pos === 'HFF' || pos === 'CHF' || pos === 'FP' || pos === 'FF') return 'forward'
  return 'midfield'
}

function scoreScoutEffectiveness(scout: Scout, prospect: DraftProspect): number {
  const regionScore = scout.assignedRegion ? scout.regionRatings[scout.assignedRegion] : 40
  const specialtyKey = getProspectSpecialtyKey(prospect.position.primary)
  const specialtyScore = scout.specialtyRatings[specialtyKey]
  const characterScore = scout.specialtyRatings.character
  const raw = scout.skill * 0.45 + regionScore * 0.3 + specialtyScore * 0.2 + characterScore * 0.05
  return clamp(raw / 100, 0.3, 0.98)
}

function tightenReport(
  report: ScoutingReport,
  prospect: DraftProspect,
  confidenceGain: number,
  rng: SeededRNG,
): ScoutingReport {
  const newConfidence = Math.min(1.0, report.confidence + confidenceGain)

  const attributeRanges = { ...report.attributeRanges }
  const rangeReduction = newConfidence * 0.75

  for (const key of ALL_ATTRIBUTE_KEYS) {
    const trueValue = prospect.trueAttributes[key]
    const halfWidth = INITIAL_RANGE_HALF_WIDTH * (1 - rangeReduction)

    let low = trueValue - halfWidth + rng.nextFloat(-2.5, 2.5)
    let high = trueValue + halfWidth + rng.nextFloat(-2.5, 2.5)

    low = clamp(Math.round(low * 10) / 10, MIN_ATTR, MAX_ATTR)
    high = clamp(Math.round(high * 10) / 10, MIN_ATTR, MAX_ATTR)

    if (low > high) {
      const t = low
      low = high
      high = t
    }

    attributeRanges[key] = [low, high]
  }

  const truePot = prospect.hiddenAttributes.potentialCeiling
  const potHalfWidth = INITIAL_POTENTIAL_HALF_WIDTH * (1 - newConfidence * 0.7)
  let potLow = truePot - potHalfWidth + rng.nextFloat(-2, 2)
  let potHigh = truePot + potHalfWidth + rng.nextFloat(-2, 2)
  potLow = clamp(Math.round(potLow * 10) / 10, MIN_ATTR, MAX_ATTR)
  potHigh = clamp(Math.round(potHigh * 10) / 10, MIN_ATTR, MAX_ATTR)
  if (potLow > potHigh) {
    const t = potLow
    potLow = potHigh
    potHigh = t
  }
  const potentialRange: [number, number] = [potLow, potHigh]

  return {
    ...report,
    sessionsCompleted: report.sessionsCompleted + 1,
    confidence: newConfidence,
    attributeRanges,
    overallEstimate: calculateOverallEstimate(attributeRanges),
    potentialRange,
    potentialEstimate: calculatePotentialEstimate(potentialRange),
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateScoutPool(count: number, rng: SeededRNG): Scout[] {
  const scouts: Scout[] = []

  for (let i = 0; i < count; i++) {
    const skill = rng.nextInt(MIN_SCOUT_SKILL, MAX_SCOUT_SKILL)
    const regionRatings = randomRegionRatings(rng)
    const specialtyRatings = randomSpecialtyRatings(rng)

    scouts.push({
      id: crypto.randomUUID(),
      firstName: rng.pick(FIRST_NAMES),
      lastName: rng.pick(LAST_NAMES),
      skill,
      salary: salaryFromSkill(skill, regionRatings, specialtyRatings),
      regionRatings,
      specialtyRatings,
      assignedRegion: null,
      clubId: '',
    })
  }

  return scouts
}

export function hireScout(scout: Scout, clubId: string): Scout {
  return { ...scout, clubId }
}

export function fireScout(scout: Scout): Scout {
  return { ...scout, clubId: '', assignedRegion: null }
}

export function assignScoutToRegion(scout: Scout, region: ScoutingRegion | null): Scout {
  return { ...scout, assignedRegion: region }
}

export function runScoutingSessions(
  scouts: Scout[],
  prospects: DraftProspect[],
  clubId: string,
  rng: SeededRNG,
  options?: {
    scoutingAccuracyModifier?: number
  },
): DraftProspect[] {
  const activeScouts = scouts.filter(
    (s) => s.clubId === clubId && s.assignedRegion !== null,
  )

  if (activeScouts.length === 0) {
    return prospects
  }

  const scoutsByRegion = new Map<ScoutingRegion, Scout[]>()
  for (const scout of activeScouts) {
    const region = scout.assignedRegion!
    const existing = scoutsByRegion.get(region)
    if (existing) existing.push(scout)
    else scoutsByRegion.set(region, [scout])
  }

  return prospects.map((prospect) => {
    const regionScouts = scoutsByRegion.get(prospect.region)
    if (!regionScouts || regionScouts.length === 0) return prospect

    let updated: DraftProspect = {
      ...prospect,
      scoutingReports: { ...prospect.scoutingReports },
    }

    for (const scout of regionScouts) {
      const existingReport = updated.scoutingReports[clubId]
      const seededPotentialRange: [number, number] = [
        clamp(prospect.hiddenAttributes.potentialCeiling - INITIAL_POTENTIAL_HALF_WIDTH, MIN_ATTR, MAX_ATTR),
        clamp(prospect.hiddenAttributes.potentialCeiling + INITIAL_POTENTIAL_HALF_WIDTH, MIN_ATTR, MAX_ATTR),
      ]
      const safePotentialRange: [number, number] = existingReport?.potentialRange
        ? [existingReport.potentialRange[0], existingReport.potentialRange[1]]
        : seededPotentialRange
      const report = existingReport
        ? {
            ...existingReport,
            attributeRanges: { ...existingReport.attributeRanges },
            potentialRange: safePotentialRange,
            potentialEstimate: existingReport.potentialEstimate ?? prospect.hiddenAttributes.potentialCeiling,
          }
        : createInitialReport(prospect.trueAttributes, prospect.hiddenAttributes.potentialCeiling)

      const eff = scoreScoutEffectiveness(scout, prospect)
      const staffModifier = clamp(options?.scoutingAccuracyModifier ?? 1, 0.72, 1.35)
      const baseGain = (0.05 + eff * 0.14 + rng.nextFloat(-0.01, 0.02)) * staffModifier
      const next = tightenReport(report, prospect, clamp(baseGain, 0.03, 0.24), rng)

      updated = {
        ...updated,
        scoutingReports: {
          ...updated.scoutingReports,
          [clubId]: next,
        },
      }
    }

    return updated
  })
}

/**
 * Draft combine event: globally improves certainty, with larger gains for clubs
 * that have relevant scouting coverage.
 */
export function runDraftCombineEvent(
  prospects: DraftProspect[],
  scouts: Scout[],
  clubIds: string[],
  rng: SeededRNG,
  options?: {
    scoutingAccuracyByClub?: Record<string, number>
  },
): DraftProspect[] {
  return prospects.map((prospect) => {
    const updated: DraftProspect = {
      ...prospect,
      scoutingReports: { ...prospect.scoutingReports },
    }

    for (const clubId of clubIds) {
      const clubScouts = scouts.filter((s) => s.clubId === clubId)
      const relevant = clubScouts.filter((s) => s.assignedRegion === prospect.region)
      const weightedCoverage = relevant.length > 0
        ? relevant.reduce((sum, s) => sum + scoreScoutEffectiveness(s, prospect), 0) / relevant.length
        : 0

      const existingReport = updated.scoutingReports[clubId]
      const seededPotentialRange: [number, number] = [
        clamp(prospect.hiddenAttributes.potentialCeiling - INITIAL_POTENTIAL_HALF_WIDTH, MIN_ATTR, MAX_ATTR),
        clamp(prospect.hiddenAttributes.potentialCeiling + INITIAL_POTENTIAL_HALF_WIDTH, MIN_ATTR, MAX_ATTR),
      ]
      const safePotentialRange: [number, number] = existingReport?.potentialRange
        ? [existingReport.potentialRange[0], existingReport.potentialRange[1]]
        : seededPotentialRange
      const report = updated.scoutingReports[clubId]
        ? {
            ...existingReport,
            attributeRanges: { ...existingReport.attributeRanges },
            potentialRange: safePotentialRange,
            potentialEstimate: existingReport.potentialEstimate ?? prospect.hiddenAttributes.potentialCeiling,
          }
        : createInitialReport(prospect.trueAttributes, prospect.hiddenAttributes.potentialCeiling)

      const staffModifier = clamp(options?.scoutingAccuracyByClub?.[clubId] ?? 1, 0.72, 1.35)
      const combineGain = (0.08 + weightedCoverage * 0.12 + rng.nextFloat(-0.01, 0.015)) * staffModifier
      updated.scoutingReports[clubId] = tightenReport(report, prospect, clamp(combineGain, 0.06, 0.26), rng)
    }

    return updated
  })
}

export function getScoutedAttributeValue(
  prospect: DraftProspect,
  attr: keyof PlayerAttributes,
  clubId: string,
): { low: number; high: number; midpoint: number } | null {
  const report = prospect.scoutingReports[clubId]
  if (!report) return null

  const range = report.attributeRanges[attr]
  if (!range) return null

  const [low, high] = range
  const midpoint = Math.round(((low + high) / 2) * 10) / 10

  return { low, high, midpoint }
}

export function getScoutingConfidence(
  prospect: DraftProspect,
  clubId: string,
): number {
  const report = prospect.scoutingReports[clubId]
  if (!report) return 0
  return report.confidence
}
