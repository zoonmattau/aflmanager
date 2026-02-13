import type { SeededRNG } from '@/engine/core/rng'
import type { Player, PlayerAttributes } from '@/types/player'
import { MIN_ATTRIBUTE, MAX_ATTRIBUTE } from '@/engine/core/constants'

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
 * Applies age-based attribute growth, peak fluctuation, or decline depending
 * on the player's current age relative to their hidden peak window.
 */
export function developPlayer(player: Player, rng: SeededRNG): void {
  const { age, hiddenAttributes } = player
  const { peakAgeStart, peakAgeEnd, developmentRate, declineRate, potentialCeiling } = hiddenAttributes

  if (age < peakAgeStart) {
    // ── Growing phase ──────────────────────────────────────────────────
    const ageFactor = getGrowthAgeFactor(age)

    for (const key of ALL_ATTRIBUTE_KEYS) {
      const isPhysical = PHYSICAL_ATTRIBUTES.includes(key)
      const isMental = MENTAL_ATTRIBUTES.includes(key)

      // Young players get a physical bonus, slight mental penalty
      let typeMultiplier = 1.0
      if (age <= 21) {
        if (isPhysical) typeMultiplier = 1.3
        else if (isMental) typeMultiplier = 0.8
      }

      const growth = rng.nextFloat(0, 3) * developmentRate * ageFactor * typeMultiplier
      const currentValue = player.attributes[key]

      // Cap growth so attributes don't exceed the potential ceiling
      const newValue = clamp(
        currentValue + growth,
        MIN_ATTRIBUTE,
        Math.min(MAX_ATTRIBUTE, potentialCeiling),
      )
      player.attributes[key] = Math.round(newValue * 10) / 10
    }
  } else if (age >= peakAgeStart && age <= peakAgeEnd) {
    // ── Peak phase ─────────────────────────────────────────────────────
    // Small random fluctuations only
    for (const key of ALL_ATTRIBUTE_KEYS) {
      const fluctuation = rng.nextFloat(-2, 2)
      const currentValue = player.attributes[key]
      const newValue = clamp(currentValue + fluctuation, MIN_ATTRIBUTE, MAX_ATTRIBUTE)
      player.attributes[key] = Math.round(newValue * 10) / 10
    }
  } else {
    // ── Declining phase ────────────────────────────────────────────────
    const yearsPostPeak = age - peakAgeEnd
    const ageFactor = getDeclineAgeFactor(yearsPostPeak)

    for (const key of ALL_ATTRIBUTE_KEYS) {
      const isMental = MENTAL_ATTRIBUTES.includes(key)

      // Mental attributes decline at only 30% the rate of other attributes
      const typeMultiplier = isMental ? 0.3 : 1.0

      const loss = rng.nextFloat(0, 3) * declineRate * ageFactor * typeMultiplier
      const currentValue = player.attributes[key]
      const newValue = clamp(currentValue - loss, MIN_ATTRIBUTE, MAX_ATTRIBUTE)
      player.attributes[key] = Math.round(newValue * 10) / 10
    }
  }
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
