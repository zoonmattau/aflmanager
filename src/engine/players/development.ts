import type { SeededRNG } from '@/engine/core/rng'
import type { TrainingFocus } from '@/engine/training/trainingEngine'
import { getPlayerTrainingFocusAttributeMultiplier } from '@/engine/players/trainingFocus'
import type { Player, PlayerAttributes, PlayerTrainingFocus } from '@/types/player'
import { MIN_ATTRIBUTE, MAX_ATTRIBUTE } from '@/engine/core/constants'
import { auditPlayerAttributesInPlace } from '@/engine/player/attributeAudit'

/**
 * Physical attribute keys -- these develop/decline faster in young/old players.
 */
const PHYSICAL_ATTRIBUTES: (keyof PlayerAttributes)[] = [
  'speed',
  'acceleration',
  'endurance',
  'strength',
  'agility',
  'leap',
  'recovery',
]

/**
 * Mental attribute keys -- these are more resilient to age-related decline.
 */
const MENTAL_ATTRIBUTES: (keyof PlayerAttributes)[] = [
  'pressure',
  'leadership',
  'workRate',
  'consistency',
  'determination',
  'teamPlayer',
  'clutch',
  'disposalDecision',
  'positioning',
  'creativity',
  'anticipation',
  'composure',
  'zonalAwareness',
]

/**
 * All attribute keys on PlayerAttributes.
 */
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

/** Clamp a value between min and max inclusive. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export interface OffseasonDevelopmentContext {
  speedMultiplier?: number
  coachingModifier?: number
  facilitiesModifier?: number
  cultureModifier?: number
  trainingFocus?: TrainingFocus | null
  playerTrainingFocus?: PlayerTrainingFocus | null
  randomness?: number // 0.5-1.5 where 1 is baseline
}

type DevelopmentPhase = 'growth' | 'peak' | 'decline'

const FOCUS_ATTRIBUTE_MAP: Partial<Record<TrainingFocus, (keyof PlayerAttributes)[]>> = {
  kicking: ['kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap'],
  handball: ['handballEfficiency', 'handballDistance', 'handballReceive'],
  marking: ['markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested'],
  physical: ['speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery'],
  contested: ['tackling', 'contested', 'clearance', 'hardness'],
  'game-sense': ['disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure'],
  offensive: ['goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct'],
  defensive: ['intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding'],
  ruck: ['hitouts', 'ruckCreative', 'followUp'],
  mental: ['pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch'],
  'set-pieces': ['centreBounce', 'boundaryThrowIn', 'stoppage'],
  'match-fitness': ['endurance', 'recovery', 'workRate', 'tackling'],
  recovery: ['recovery', 'composure', 'workRate'],
}

function getFocusedAttributeMultiplier(
  key: keyof PlayerAttributes,
  trainingFocus: TrainingFocus | null | undefined,
): number {
  if (!trainingFocus) return 1
  const focused = FOCUS_ATTRIBUTE_MAP[trainingFocus]
  if (!focused || focused.length === 0) return 1
  return focused.includes(key) ? 1.14 : 0.96
}

function getAttributeAverage(player: Player): number {
  const values = Object.values(player.attributes)
  const total = values.reduce((sum, v) => sum + v, 0)
  return total / values.length
}

function getAgePhase(
  age: number,
  peakAgeStart: number,
  peakAgeEnd: number,
): DevelopmentPhase {
  if (age < peakAgeStart) return 'growth'
  if (age <= peakAgeEnd) return 'peak'
  return 'decline'
}

function resolvePeakWindowVariance(player: Player, rng: SeededRNG): void {
  if (!rng.chance(0.16)) return

  const shift = rng.nextInt(-1, 1)
  const windowAdj = rng.nextInt(-1, 1)
  const h = player.hiddenAttributes

  const nextStart = clamp(h.peakAgeStart + shift, 22, 31)
  const minEnd = nextStart + 2
  const nextEnd = clamp(h.peakAgeEnd + shift + windowAdj, minEnd, 35)
  h.peakAgeStart = nextStart
  h.peakAgeEnd = nextEnd
}

function resolvePotentialVariance(player: Player, rng: SeededRNG): void {
  const h = player.hiddenAttributes
  const age = player.age
  if (age <= 23 && rng.chance(0.08)) {
    h.potentialCeiling = clamp(h.potentialCeiling + rng.nextInt(1, 4), 40, 99)
    h.developmentRate = clamp(h.developmentRate + rng.nextFloat(0.03, 0.12), 0.5, 2.0)
    return
  }
  if (age >= 29 && rng.chance(0.06)) {
    h.potentialCeiling = clamp(h.potentialCeiling - rng.nextInt(1, 3), 35, 99)
    h.declineRate = clamp(h.declineRate + rng.nextFloat(0.03, 0.12), 0.5, 2.0)
  }
}

/**
 * Get the age-based development factor for a growing player.
 * Younger players develop faster.
 */
function getGrowthAgeFactor(age: number): number {
  if (age <= 19) return 1.5
  if (age <= 21) return 1.2
  return 0.8 // age 22-24 (or older, if peakAgeStart is late)
}

/**
 * Get the age-based decline factor for a declining player.
 * More years past peak = faster decline.
 */
function getDeclineAgeFactor(yearsPostPeak: number): number {
  if (yearsPostPeak <= 2) return 0.5
  if (yearsPostPeak <= 4) return 1.0
  return 1.5 // 5+ years post-peak
}

/**
 * Develop a player for one offseason cycle, mutating the player in place.
 * Intended to be called inside an Immer draft.
 *
 * Applies age-curve growth/peak/decline with potential caps, plus club-context
 * multipliers from coaching/facilities/culture/training focus.
 */
export function developPlayer(
  player: Player,
  rng: SeededRNG,
  context?: OffseasonDevelopmentContext,
): void {
  const { hiddenAttributes } = player
  resolvePeakWindowVariance(player, rng)
  resolvePotentialVariance(player, rng)

  const { age } = player
  const {
    peakAgeStart,
    peakAgeEnd,
    developmentRate,
    declineRate,
    potentialCeiling,
  } = hiddenAttributes

  const phase = getAgePhase(age, peakAgeStart, peakAgeEnd)
  const speedMul = context?.speedMultiplier ?? 1
  const coachingMul = clamp(context?.coachingModifier ?? 1, 0.75, 1.3)
  const facilitiesMul = clamp(context?.facilitiesModifier ?? 1, 0.8, 1.25)
  const cultureMul = clamp(context?.cultureModifier ?? 1, 0.85, 1.2)
  const randomness = clamp(context?.randomness ?? 1, 0.5, 1.5)

  const avgOverall = getAttributeAverage(player)
  const capHeadroom = clamp((potentialCeiling - avgOverall) / 24, -0.4, 1.2)
  const capPressureMul = phase === 'growth'
    ? clamp(0.65 + capHeadroom, 0.2, 1.35)
    : 1

  const globalDevMultiplier = speedMul * coachingMul * facilitiesMul * cultureMul * randomness

  if (phase === 'growth') {
    const ageFactor = getGrowthAgeFactor(age)
    for (const key of ALL_ATTRIBUTE_KEYS) {
      const isPhysical = PHYSICAL_ATTRIBUTES.includes(key)
      const isMental = MENTAL_ATTRIBUTES.includes(key)
      let typeMultiplier = 1
      if (age <= 21) {
        if (isPhysical) typeMultiplier = 1.22
        else if (isMental) typeMultiplier = 0.9
      }

      const focusedMul = getFocusedAttributeMultiplier(key, context?.trainingFocus)
      const playerFocusedMul = getPlayerTrainingFocusAttributeMultiplier(context?.playerTrainingFocus, key)
      const growth = rng.nextFloat(0.15, 1.7) *
        developmentRate *
        ageFactor *
        typeMultiplier *
        focusedMul *
        playerFocusedMul *
        capPressureMul *
        globalDevMultiplier

      const cap = Math.min(MAX_ATTRIBUTE, potentialCeiling + (isMental ? 2 : 0))
      const next = clamp(player.attributes[key] + growth, MIN_ATTRIBUTE, cap)
      player.attributes[key] = Math.round(next * 10) / 10
    }
    auditPlayerAttributesInPlace(player, { stage: 'progression' })
    return
  }

  if (phase === 'peak') {
    const stability = clamp(1.15 - (Math.abs(globalDevMultiplier - 1) * 0.5), 0.75, 1.25)
    for (const key of ALL_ATTRIBUTE_KEYS) {
      const focusedMul = getFocusedAttributeMultiplier(key, context?.trainingFocus)
      const playerFocusedMul = getPlayerTrainingFocusAttributeMultiplier(context?.playerTrainingFocus, key)
      const drift = rng.nextFloat(-1.2, 1.2) * stability * focusedMul * playerFocusedMul
      const next = clamp(player.attributes[key] + drift, MIN_ATTRIBUTE, MAX_ATTRIBUTE)
      player.attributes[key] = Math.round(next * 10) / 10
    }
    auditPlayerAttributesInPlace(player, { stage: 'progression' })
    return
  }

  const yearsPostPeak = age - peakAgeEnd
  const ageFactor = getDeclineAgeFactor(yearsPostPeak)
  const declineVariance = clamp(rng.nextFloat(0.88, 1.24) * (2 - randomness), 0.7, 1.45)
  for (const key of ALL_ATTRIBUTE_KEYS) {
    const isMental = MENTAL_ATTRIBUTES.includes(key)
    const isPhysical = PHYSICAL_ATTRIBUTES.includes(key)
    const mentalProtection = isMental ? 0.4 : 1
    const physicalPenalty = isPhysical ? 1.15 : 1
    const focusedMul = getFocusedAttributeMultiplier(key, context?.trainingFocus)
    const playerFocusedMul = getPlayerTrainingFocusAttributeMultiplier(context?.playerTrainingFocus, key)
    const trainingProtection = focusedMul * playerFocusedMul > 1 ? 0.92 : 1.03
    const loss = rng.nextFloat(0.12, 1.65) *
      declineRate *
      ageFactor *
      declineVariance *
      mentalProtection *
      physicalPenalty *
      trainingProtection *
      clamp(2 - coachingMul * facilitiesMul * cultureMul, 0.75, 1.35)

    const next = clamp(player.attributes[key] - loss, MIN_ATTRIBUTE, MAX_ATTRIBUTE)
    player.attributes[key] = Math.round(next * 10) / 10
  }
  auditPlayerAttributesInPlace(player, { stage: 'progression' })
}

/**
 * Age a player by one year. Increments the age field and adjusts the
 * dateOfBirth year conceptually (the birth year shifts back by one relative
 * to the current season year).
 */
export function agePlayer(player: Player): void {
  player.age += 1

  // If dateOfBirth is stored, we don't change the actual birth date --
  // the age increment reflects a new season year. However, if the caller
  // relies on dateOfBirth for age derivation, we keep it consistent by
  // not modifying it (the season year is what advances, not the DOB).
}

/**
 * Determine whether a player should retire at the end of the season.
 *
 * Base retirement chance starts at age 30 and escalates steeply past 34.
 * Modified by form, morale, and hidden attribute modifiers.
 */
export function shouldRetire(player: Player, rng: SeededRNG): boolean {
  const { age, form, morale, hiddenAttributes } = player

  // Players under 30 never retire through this mechanism
  if (age < 30) return false

  // Base retirement probability by age
  let baseChance: number
  if (age < 32) {
    // 30-31: 2%
    baseChance = 0.02
  } else if (age < 34) {
    // 32-33: 5%
    baseChance = 0.05
  } else if (age < 36) {
    // 34-35: 15%
    baseChance = 0.15
  } else if (age < 38) {
    // 36-37: 40%
    baseChance = 0.40
  } else {
    // 38+: 80%
    baseChance = 0.80
  }

  // Low form increases retirement chance; high form reduces it
  // form is 1-100, normalise to a -0.05 .. +0.05 adjustment
  const formModifier = (50 - form) / 1000 // low form -> positive (more likely)

  // Low morale increases retirement chance
  const moraleModifier = (50 - morale) / 1000

  // Players past their peak window are more likely to retire
  const pastPeakYears = Math.max(0, age - hiddenAttributes.peakAgeEnd)
  const peakModifier = pastPeakYears * 0.02

  // High decline rate nudges toward retirement
  const declineModifier = (hiddenAttributes.declineRate - 1.0) * 0.03

  const finalChance = clamp(
    baseChance + formModifier + moraleModifier + peakModifier + declineModifier,
    0,
    1,
  )

  return rng.chance(finalChance)
}
