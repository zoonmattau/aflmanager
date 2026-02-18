/**
 * Player data generation for AFL Manager.
 *
 * Generates a realistic ~40-player squad for a given club using seeded RNG
 * for full reproducibility.
 */

import { SeededRNG } from '@/engine/core/rng'
import type {
  Player,
  PlayerAttributes,
  PlayerCareerStats,
  PlayerContract,
  PlayerPersonality,
  PlayerPosition,
  PlayerPositionType,
  HiddenAttributes,
} from '@/types/player'
import { FIRST_NAMES, LAST_NAMES } from './names'
import {
  mapPrimaryPositionToPreferredRole,
  pickArchetypeForRole,
} from '@/engine/player/roles'
import { deriveAgentArchetype } from '@/engine/player/agentPersonality'
import { getClubState } from '@/engine/venues/venueEngine'
import { MINIMUM_SALARY } from '@/engine/core/constants'

// ---------------------------------------------------------------------------
// Types internal to generation
// ---------------------------------------------------------------------------

/** Role template that drives how a player slot is generated. */
interface RoleTemplate {
  primary: PlayerPositionType
  secondary: PlayerPositionType[]
  heightRange: [number, number]
  weightRange: [number, number]
  /** Attribute biases – keys are PlayerAttributes fields, values 0-1 weight. */
  biases: Partial<Record<keyof PlayerAttributes, number>>
  isRookie?: boolean
}

type CompetitionStrength = 'afl' | 'state-strong' | 'state-weak'

interface GeneratePlayersOptions {
  salaryCapAmount?: number
  enforceCapCompliance?: boolean
  competitionStrength?: CompetitionStrength
}

// ---------------------------------------------------------------------------
// Squad composition templates
// ---------------------------------------------------------------------------

/**
 * Each entry describes one player slot in the squad.  The order they appear
 * determines jersey-number hints (but numbers are ultimately assigned to
 * avoid duplicates).
 */
function buildSquadTemplates(): RoleTemplate[] {
  const templates: RoleTemplate[] = []

  // ---- Back Pockets (2) ----
  for (let i = 0; i < 2; i++) {
    templates.push({
      primary: 'BP',
      secondary: ['FB', 'HBF'],
      heightRange: [183, 195],
      weightRange: [84, 95],
      biases: {
        intercept: 0.85, spoiling: 0.8, oneOnOne: 0.9, markingContested: 0.75,
        positioning: 0.8, zonalAwareness: 0.8, speed: 0.7,
      },
    })
  }

  // ---- Full Backs (2) ----
  for (let i = 0; i < 2; i++) {
    templates.push({
      primary: 'FB',
      secondary: ['BP', 'CHB'],
      heightRange: [190, 200],
      weightRange: [90, 100],
      biases: {
        intercept: 0.9, spoiling: 0.85, oneOnOne: 0.9, markingContested: 0.85,
        markingOverhead: 0.85, positioning: 0.8, strength: 0.8,
      },
    })
  }

  // ---- Half Back Flankers (3) ----
  for (let i = 0; i < 3; i++) {
    templates.push({
      primary: 'HBF',
      secondary: ['CHB', 'W', 'BP'],
      heightRange: [182, 195],
      weightRange: [82, 93],
      biases: {
        kickingEfficiency: 0.85, kickingDistance: 0.8, fieldKicking: 0.85,
        intercept: 0.75, speed: 0.75, disposalDecision: 0.8,
        markingLeading: 0.7, positioning: 0.75,
        zonalAwareness: 0.8, rebounding: 0.75,
      },
    })
  }

  // ---- Centre Half Backs (2) ----
  for (let i = 0; i < 2; i++) {
    templates.push({
      primary: 'CHB',
      secondary: ['FB', 'HBF'],
      heightRange: [190, 200],
      weightRange: [90, 100],
      biases: {
        intercept: 0.85, markingContested: 0.85, markingOverhead: 0.8,
        strength: 0.8, spoiling: 0.8, positioning: 0.8, oneOnOne: 0.85,
        rebounding: 0.7, kickingDistance: 0.75,
      },
    })
  }

  // ---- Inside Midfielders (5) ----
  for (let i = 0; i < 5; i++) {
    templates.push({
      primary: 'IM',
      secondary: ['OM'],
      heightRange: [182, 192],
      weightRange: [83, 93],
      biases: {
        contested: 0.9, groundBallGet: 0.9, tackling: 0.85, endurance: 0.9,
        handballEfficiency: 0.8, workRate: 0.85,
        disposalDecision: 0.8, pressure: 0.8, strength: 0.7,
        clearance: 0.85, hardness: 0.8, centreBounce: 0.75, stoppage: 0.8,
      },
    })
  }

  // ---- Outside Midfielders (4) ----
  for (let i = 0; i < 4; i++) {
    templates.push({
      primary: 'OM',
      secondary: ['IM', 'W'],
      heightRange: [180, 190],
      weightRange: [80, 90],
      biases: {
        kickingEfficiency: 0.85, disposalDecision: 0.9, creativity: 0.85,
        speed: 0.8, endurance: 0.8, fieldKicking: 0.85, handballEfficiency: 0.8,
        agility: 0.75, positioning: 0.8,
      },
    })
  }

  // ---- Wingers (3) ----
  for (let i = 0; i < 3; i++) {
    templates.push({
      primary: 'W',
      secondary: ['OM', 'HBF'],
      heightRange: [180, 190],
      weightRange: [78, 88],
      biases: {
        speed: 0.9, acceleration: 0.85, endurance: 0.85, agility: 0.85,
        kickingEfficiency: 0.8, disposalDecision: 0.75, workRate: 0.8,
        fieldKicking: 0.75,
      },
    })
  }

  // ---- Rucks (3) ----
  for (let i = 0; i < 3; i++) {
    templates.push({
      primary: 'RK',
      secondary: ['FF', 'CHF'],
      heightRange: [198, 205],
      weightRange: [98, 108],
      biases: {
        hitouts: 0.95, ruckCreative: 0.85, strength: 0.85,
        markingOverhead: 0.8, endurance: 0.7, tackling: 0.7,
        contested: 0.75, positioning: 0.7,
        followUp: 0.8, centreBounce: 0.7,
      },
    })
  }

  // ---- Half Forward Flankers (3) ----
  for (let i = 0; i < 3; i++) {
    templates.push({
      primary: 'HFF',
      secondary: ['CHF', 'OM'],
      heightRange: [178, 192],
      weightRange: [80, 93],
      biases: {
        goalkicking: 0.8, speed: 0.8, agility: 0.8, groundBallGet: 0.75,
        creativity: 0.75, pressure: 0.8, insideForward: 0.75,
        markingLeading: 0.75, acceleration: 0.75, snap: 0.8,
      },
    })
  }

  // ---- Centre Half Forwards (2) ----
  for (let i = 0; i < 2; i++) {
    templates.push({
      primary: 'CHF',
      secondary: ['FF', 'HFF'],
      heightRange: [190, 200],
      weightRange: [92, 102],
      biases: {
        goalkicking: 0.85, markingContested: 0.85, markingOverhead: 0.8,
        strength: 0.8, insideForward: 0.8, positioning: 0.75,
        leadingPatterns: 0.8, scoringInstinct: 0.8,
      },
    })
  }

  // ---- Forward Pockets (2) ----
  for (let i = 0; i < 2; i++) {
    templates.push({
      primary: 'FP',
      secondary: ['FF', 'HFF'],
      heightRange: [175, 188],
      weightRange: [76, 88],
      biases: {
        goalkicking: 0.85, speed: 0.85, agility: 0.85, snap: 0.85,
        groundBallGet: 0.8, pressure: 0.8, insideForward: 0.8,
        scoringInstinct: 0.85, acceleration: 0.8, creativity: 0.75,
      },
    })
  }

  // ---- Full Forwards (2) ----
  for (let i = 0; i < 2; i++) {
    templates.push({
      primary: 'FF',
      secondary: ['CHF', 'FP'],
      heightRange: [190, 202],
      weightRange: [92, 105],
      biases: {
        goalkicking: 0.9, markingContested: 0.85, markingOverhead: 0.85,
        setShot: 0.85, insideForward: 0.8, strength: 0.8,
        markingLeading: 0.8, positioning: 0.7,
        leadingPatterns: 0.8, scoringInstinct: 0.85,
      },
    })
  }

  // ---- Utilities (4) ----
  for (let i = 0; i < 4; i++) {
    const utilPositions: PlayerPositionType[] = ['HBF', 'HFF', 'IM', 'W']
    const primary = utilPositions[i % utilPositions.length]
    templates.push({
      primary,
      secondary: utilPositions.filter(p => p !== primary).slice(0, 2),
      heightRange: [182, 195],
      weightRange: [82, 95],
      biases: {
        workRate: 0.75, endurance: 0.75, disposalDecision: 0.7,
        kickingEfficiency: 0.7, tackling: 0.7, positioning: 0.7,
      },
    })
  }

  // ---- Rookies (5) ----
  for (let i = 0; i < 5; i++) {
    const rookiePositions: PlayerPositionType[] = ['IM', 'HBF', 'HFF', 'FF', 'RK']
    const primary = rookiePositions[i % rookiePositions.length]
    const heightRange: [number, number] = primary === 'RK'
      ? [196, 204]
      : primary === 'FF'
        ? [188, 200]
        : [178, 192]
    const weightRange: [number, number] = primary === 'RK'
      ? [94, 105]
      : primary === 'FF'
        ? [85, 98]
        : [78, 90]

    templates.push({
      primary,
      secondary: [],
      heightRange,
      weightRange,
      biases: {},
      isRookie: true,
    })
  }

  return templates
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a weighted-random age. Bell-curve centred around 24-26. */
function generateAge(rng: SeededRNG, isRookie: boolean): number {
  if (isRookie) {
    return rng.nextInt(18, 21)
  }

  // Weighted draw: combine two uniform draws to create a rough bell shape.
  const a = rng.nextInt(18, 35)
  const b = rng.nextInt(20, 32)
  const raw = Math.round((a + b) / 2)
  return Math.max(18, Math.min(35, raw))
}

/**
 * Compute an age-based multiplier for a given attribute category.
 * Physical attributes peak around 25-28 and decline after 30.
 * Mental attributes keep growing until ~32.
 */
function ageMultiplier(age: number, category: 'physical' | 'mental' | 'general'): number {
  if (category === 'physical') {
    if (age <= 19) return 0.65
    if (age <= 21) return 0.78
    if (age <= 23) return 0.88
    if (age <= 28) return 1.0
    if (age <= 30) return 0.95
    if (age <= 32) return 0.88
    return 0.80
  }
  if (category === 'mental') {
    if (age <= 19) return 0.55
    if (age <= 21) return 0.65
    if (age <= 23) return 0.78
    if (age <= 26) return 0.90
    if (age <= 30) return 1.0
    if (age <= 33) return 0.97
    return 0.93
  }
  // General
  if (age <= 19) return 0.62
  if (age <= 21) return 0.74
  if (age <= 23) return 0.85
  if (age <= 28) return 1.0
  if (age <= 30) return 0.96
  if (age <= 33) return 0.90
  return 0.82
}

const PHYSICAL_ATTRS: (keyof PlayerAttributes)[] = [
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
]

const MENTAL_ATTRS: (keyof PlayerAttributes)[] = [
  'disposalDecision', 'positioning', 'creativity', 'leadership', 'workRate', 'consistency',
  'anticipation', 'composure', 'determination', 'teamPlayer', 'clutch',
]

function attrCategory(attr: keyof PlayerAttributes): 'physical' | 'mental' | 'general' {
  if ((PHYSICAL_ATTRS as string[]).includes(attr)) return 'physical'
  if ((MENTAL_ATTRS as string[]).includes(attr)) return 'mental'
  return 'general'
}

/** Clamp helper */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

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

function getOverall(attrs: PlayerAttributes): number {
  let total = 0
  for (const key of ALL_ATTRIBUTE_KEYS) total += attrs[key]
  return total / ALL_ATTRIBUTE_KEYS.length
}

function pickTargetOverall(
  rng: SeededRNG,
  isRookie: boolean,
  competitionStrength: CompetitionStrength,
): number {
  const roll = rng.nextFloat(0, 1)

  if (competitionStrength === 'state-strong') {
    // Average ~55, some quality state-level standouts, with depth down to scrub tier.
    if (roll < 0.06) return rng.nextInt(75, 86)
    if (roll < 0.26) return rng.nextInt(60, 74)
    if (roll < 0.66) return rng.nextInt(50, 59)
    if (roll < 0.9) return rng.nextInt(35, 49)
    return rng.nextInt(22, 34)
  }
  if (competitionStrength === 'state-weak') {
    // Average ~40 with occasional solid contributors and many replacement-level players.
    if (roll < 0.03) return rng.nextInt(65, 76)
    if (roll < 0.15) return rng.nextInt(50, 64)
    if (roll < 0.55) return rng.nextInt(38, 49)
    if (roll < 0.88) return rng.nextInt(28, 37)
    return rng.nextInt(18, 27)
  }

  // AFL: average around 70 with clear star/good/depth spread.
  if (roll < 0.08) return isRookie ? rng.nextInt(74, 84) : rng.nextInt(90, 97) // stars
  if (roll < 0.30) return isRookie ? rng.nextInt(66, 76) : rng.nextInt(80, 89) // good players
  if (roll < 0.63) return isRookie ? rng.nextInt(58, 70) : rng.nextInt(68, 79) // regular AFL standard
  if (roll < 0.88) return isRookie ? rng.nextInt(46, 60) : rng.nextInt(55, 67) // lower-end AFL list
  return isRookie ? rng.nextInt(28, 48) : rng.nextInt(30, 54) // scrubbers / fringe
}

function ageOverallAdjustment(age: number): number {
  if (age <= 19) return -10
  if (age <= 21) return -7
  if (age <= 23) return -3
  if (age <= 28) return 0
  if (age <= 31) return -2
  if (age <= 34) return -5
  return -8
}

/**
 * Build the full PlayerAttributes object for a player.
 */
function generateAttributes(
  rng: SeededRNG,
  age: number,
  biases: Partial<Record<keyof PlayerAttributes, number>>,
  isRookie: boolean,
  competitionStrength: CompetitionStrength,
): PlayerAttributes {
  const baseTarget = pickTargetOverall(rng, isRookie, competitionStrength)
  const targetOverall = clamp(baseTarget + ageOverallAdjustment(age) + (isRookie ? -3 : 0), 18, 98)

  const attrs = {} as Record<keyof PlayerAttributes, number>
  for (const attr of ALL_ATTRIBUTE_KEYS) {
    const bias = biases[attr] ?? 0
    const cat = attrCategory(attr)
    const catWeight =
      cat === 'physical' ? ageMultiplier(age, 'physical') * 1.02
      : cat === 'mental' ? ageMultiplier(age, 'mental') * 0.98
      : ageMultiplier(age, 'general')

    const base = targetOverall + rng.nextFloat(-14, 14)
    const biasBoost = bias > 0 ? rng.nextFloat(3, 12) * bias : -rng.nextFloat(0, 5) * (1 - bias)
    attrs[attr] = clamp(Math.round(base + biasBoost + (catWeight - 1) * 10), 1, 99)
  }

  // Special: hitouts, ruckCreative, and followUp should be very low for non-rucks
  if (!biases.hitouts || biases.hitouts < 0.3) {
    attrs.hitouts = clamp(rng.nextInt(5, 20), 1, 100)
    attrs.ruckCreative = clamp(rng.nextInt(5, 20), 1, 100)
    attrs.followUp = clamp(rng.nextInt(5, 20), 1, 100)
  }

  // Leadership scales heavily with age
  if (age >= 28) {
    attrs.leadership = clamp(attrs.leadership + rng.nextInt(5, 15), 1, 100)
  } else if (age <= 21) {
    attrs.leadership = clamp(attrs.leadership - rng.nextInt(5, 15), 1, 100)
  }

  // Normalize final overall to keep generated distribution close to target.
  const overallBefore = getOverall(attrs as PlayerAttributes)
  const delta = targetOverall - overallBefore
  if (Math.abs(delta) > 0.4) {
    for (const key of ALL_ATTRIBUTE_KEYS) {
      attrs[key] = clamp(Math.round(attrs[key] + delta), 1, 99)
    }
  }

  return attrs as PlayerAttributes
}

/**
 * Generate hidden attributes for a player.
 */
function generateHiddenAttributes(rng: SeededRNG, age: number): HiddenAttributes {
  // Younger players tend to have higher potential ceilings
  const agePotentialBonus = age <= 21 ? rng.nextInt(10, 25) : age <= 24 ? rng.nextInt(0, 15) : 0
  const basePotential = rng.nextInt(45, 80) + agePotentialBonus

  const peakStart = rng.nextInt(24, 28)
  const peakEnd = peakStart + rng.nextInt(3, 6)

  return {
    potentialCeiling: clamp(basePotential, 1, 100),
    developmentRate: Math.round(rng.nextFloat(0.6, 1.8) * 100) / 100,
    peakAgeStart: peakStart,
    peakAgeEnd: peakEnd,
    declineRate: Math.round(rng.nextFloat(0.5, 1.8) * 100) / 100,
    injuryProneness: rng.nextInt(10, 65),
    durability: rng.nextInt(35, 95),
    bigGameModifier: rng.nextInt(-8, 8),
  }
}

/**
 * Generate personality traits.
 */
function generatePersonality(rng: SeededRNG): PlayerPersonality {
  return {
    ambition: rng.nextInt(30, 95),
    loyalty: rng.nextInt(25, 95),
    professionalism: rng.nextInt(35, 95),
    temperament: rng.nextInt(30, 95),
  }
}

/**
 * Generate a contract appropriate for the player's age and likely ability.
 */
function getBaseAavForOverall(overall: number, rng: SeededRNG): number {
  if (overall >= 92) return rng.nextInt(900, 1_250) * 1000
  if (overall >= 85) return rng.nextInt(650, 980) * 1000
  if (overall >= 78) return rng.nextInt(450, 760) * 1000
  if (overall >= 70) return rng.nextInt(290, 560) * 1000
  if (overall >= 60) return rng.nextInt(180, 360) * 1000
  if (overall >= 50) return rng.nextInt(120, 240) * 1000
  if (overall >= 40) return rng.nextInt(95, 180) * 1000
  return rng.nextInt(80, 140) * 1000
}

function generateContract(rng: SeededRNG, age: number, isRookie: boolean, overall: number): PlayerContract {
  let yearsRemaining: number
  let aav = getBaseAavForOverall(overall, rng)

  if (isRookie) {
    yearsRemaining = rng.nextInt(2, 3)
    aav = rng.nextInt(110, 200) * 1000
  } else if (age <= 22) {
    yearsRemaining = rng.nextInt(2, 4)
  } else if (age <= 28) {
    yearsRemaining = rng.nextInt(1, 5)
  } else if (age <= 32) {
    yearsRemaining = rng.nextInt(1, 3)
  } else {
    yearsRemaining = rng.nextInt(1, 2)
  }
  aav = Math.max(MINIMUM_SALARY, aav)

  // Build year-by-year with slight escalation
  const yearByYear: number[] = []
  for (let y = 0; y < yearsRemaining; y++) {
    const escalation = 1 + y * rng.nextFloat(0.02, 0.06)
    yearByYear.push(Math.round(aav * escalation / 1000) * 1000)
  }

  return {
    yearsRemaining,
    aav,
    yearByYear,
    isRestricted: age < 27,
  }
}

/**
 * Generate career stats plausible for a player of the given age and position.
 */
function generateCareerStats(
  rng: SeededRNG,
  age: number,
  primary: PlayerPositionType,
  isRookie: boolean,
  overall: number,
): PlayerCareerStats {
  if (isRookie || age <= 18) {
    return emptyStats()
  }

  // Estimate career games based on age
  const yearsInAFL = age - 18
  const avgGamesPerYear = rng.nextFloat(12, 20)
  const gamesPlayed = Math.round(yearsInAFL * avgGamesPerYear)

  const quality = clamp((overall - 35) / 55, 0.25, 1.25)
  const productionFactor = clamp(0.7 + quality * 0.55, 0.65, 1.4)

  // Goals depend on position
  let goalsPerGame: number
  if (primary === 'FF') goalsPerGame = rng.nextFloat(1.2, 2.5)
  else if (primary === 'FP' || primary === 'CHF' || primary === 'HFF') goalsPerGame = rng.nextFloat(0.5, 1.2)
  else if (primary === 'RK') goalsPerGame = rng.nextFloat(0.3, 0.8)
  else if (primary === 'IM' || primary === 'OM') goalsPerGame = rng.nextFloat(0.2, 0.6)
  else if (primary === 'W') goalsPerGame = rng.nextFloat(0.15, 0.45)
  else goalsPerGame = rng.nextFloat(0.05, 0.25) // defenders

  const goals = Math.round(gamesPlayed * goalsPerGame * productionFactor)
  const behinds = Math.round(goals * rng.nextFloat(0.5, 0.9))

  // Disposals per game
  let disposalsPerGame: number
  if (primary === 'IM' || primary === 'OM') disposalsPerGame = rng.nextFloat(20, 28)
  else if (primary === 'W') disposalsPerGame = rng.nextFloat(16, 24)
  else if (primary === 'HBF' || primary === 'CHB') disposalsPerGame = rng.nextFloat(15, 22)
  else if (primary === 'HFF' || primary === 'CHF' || primary === 'FP') disposalsPerGame = rng.nextFloat(12, 18)
  else if (primary === 'FF') disposalsPerGame = rng.nextFloat(8, 14)
  else if (primary === 'FB' || primary === 'BP') disposalsPerGame = rng.nextFloat(10, 16)
  else disposalsPerGame = rng.nextFloat(10, 18) // RK

  const disposals = Math.round(gamesPlayed * disposalsPerGame * productionFactor)
  const kickRatio = rng.nextFloat(0.5, 0.65)
  const kicks = Math.round(disposals * kickRatio)
  const handballs = disposals - kicks

  const marksPerGame = rng.nextFloat(3, 7)
  const marks = Math.round(gamesPlayed * marksPerGame * productionFactor)

  const tacklesPerGame = rng.nextFloat(2, 6)
  const tackles = Math.round(gamesPlayed * tacklesPerGame * productionFactor)

  const hitoutsTotal = primary === 'RK'
    ? Math.round(gamesPlayed * rng.nextFloat(20, 35) * productionFactor)
    : Math.round(gamesPlayed * rng.nextFloat(0, 0.3))

  const contestedPerGame = rng.nextFloat(5, 12)
  const contestedPossessions = Math.round(gamesPlayed * contestedPerGame * productionFactor)
  const uncontestedPossessions = Math.max(0, disposals - contestedPossessions)

  const clearancesPerGame = primary === 'IM' || primary === 'OM'
    ? rng.nextFloat(3, 7)
    : primary === 'RK'
      ? rng.nextFloat(2, 5)
      : rng.nextFloat(0.5, 2)
  const clearances = Math.round(gamesPlayed * clearancesPerGame * productionFactor)

  const insideFiftiesPerGame = rng.nextFloat(1, 5)
  const insideFifties = Math.round(gamesPlayed * insideFiftiesPerGame * productionFactor)

  const rebound50sPerGame = (primary === 'FB' || primary === 'HBF' || primary === 'BP' || primary === 'CHB')
    ? rng.nextFloat(2, 5)
    : rng.nextFloat(0.2, 1.5)
  const rebound50s = Math.round(gamesPlayed * rebound50sPerGame * productionFactor)
  const freesFor = Math.round(gamesPlayed * rng.nextFloat(0.8, 2.4) * productionFactor)
  const freesAgainst = Math.round(gamesPlayed * rng.nextFloat(0.6, 2.1))

  // Extended stats (derived from base stats)
  const contestedMarks = Math.round(marks * rng.nextFloat(0.15, 0.35))
  const scoreInvolvements = goals + Math.round(gamesPlayed * rng.nextFloat(1, 4) * productionFactor)
  const metresGained = Math.round(gamesPlayed * rng.nextFloat(200, 500) * productionFactor)
  const turnovers = Math.round(disposals * rng.nextFloat(0.1, 0.2))
  const intercepts = (primary === 'FB' || primary === 'HBF' || primary === 'BP' || primary === 'CHB')
    ? Math.round(gamesPlayed * rng.nextFloat(3, 7) * productionFactor)
    : Math.round(gamesPlayed * rng.nextFloat(0.5, 2))
  const onePercenters = Math.round(gamesPlayed * rng.nextFloat(1, 4) * productionFactor)
  const bounces = (primary === 'IM' || primary === 'OM' || primary === 'W')
    ? Math.round(gamesPlayed * rng.nextFloat(0.5, 2))
    : Math.round(gamesPlayed * rng.nextFloat(0, 0.5))
  const clangers = Math.round(disposals * rng.nextFloat(0.05, 0.12))
  const goalAssists = Math.round(gamesPlayed * rng.nextFloat(0.3, 1.5) * productionFactor)
  const aflFantasyPoints = Math.round(
    kicks * 3 +
    handballs * 2 +
    marks * 3 +
    tackles * 4 +
    hitoutsTotal +
    goals * 6 +
    behinds +
    freesFor -
    freesAgainst * 3,
  )
  const superCoachPoints = Math.round(gamesPlayed * rng.nextFloat(70, 102) * productionFactor)

  return {
    gamesPlayed,
    aflFantasyPoints,
    superCoachPoints,
    goals,
    behinds,
    disposals,
    kicks,
    handballs,
    marks,
    tackles,
    hitouts: hitoutsTotal,
    contestedPossessions,
    uncontestedPossessions,
    clearances,
    insideFifties,
    rebound50s,
    freesFor,
    freesAgainst,
    contestedMarks,
    scoreInvolvements,
    metresGained,
    turnovers,
    intercepts,
    onePercenters,
    bounces,
    clangers,
    goalAssists,
  }
}

function normalizeContractsToCap(
  players: Player[],
  salaryCapAmount: number,
): void {
  if (players.length === 0) return
  const capTarget = Math.max(1, Math.round(salaryCapAmount * 0.985))
  const total = players.reduce((sum, p) => sum + (p.contract.yearByYear[0] ?? p.contract.aav), 0)
  if (total <= capTarget) return

  const scalable = players
    .filter((p) => p.contract.yearByYear.length > 0)
    .sort((a, b) => (b.contract.yearByYear[0] ?? 0) - (a.contract.yearByYear[0] ?? 0))

  const reductionFactor = capTarget / Math.max(total, 1)
  for (const player of scalable) {
    const adjusted = player.contract.yearByYear.map((amount, idx) => {
      const floor = idx === 0 ? MINIMUM_SALARY : Math.round(MINIMUM_SALARY * (1 + idx * 0.03))
      return Math.max(floor, Math.round(amount * reductionFactor / 1000) * 1000)
    })
    player.contract.yearByYear = adjusted
    player.contract.aav = Math.round(adjusted.reduce((s, v) => s + v, 0) / adjusted.length)
  }

  // Final pass: if still over (minimum floors can cause this), trim highest first-years.
  let currentTotal = players.reduce((sum, p) => sum + (p.contract.yearByYear[0] ?? 0), 0)
  if (currentTotal > capTarget) {
    const bySalary = [...players].sort((a, b) => (b.contract.yearByYear[0] ?? 0) - (a.contract.yearByYear[0] ?? 0))
    for (const player of bySalary) {
      if (currentTotal <= capTarget) break
      if (player.contract.yearByYear.length === 0) continue
      const current = player.contract.yearByYear[0]
      const cut = Math.min(current - MINIMUM_SALARY, currentTotal - capTarget)
      if (cut <= 0) continue
      player.contract.yearByYear[0] = Math.max(MINIMUM_SALARY, current - cut)
      player.contract.aav = Math.round(player.contract.yearByYear.reduce((s, v) => s + v, 0) / player.contract.yearByYear.length)
      currentTotal -= cut
    }
  }
}

function emptyStats(): PlayerCareerStats {
  return {
    gamesPlayed: 0,
    aflFantasyPoints: 0,
    superCoachPoints: 0,
    goals: 0,
    behinds: 0,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    tackles: 0,
    hitouts: 0,
    contestedPossessions: 0,
    uncontestedPossessions: 0,
    clearances: 0,
    insideFifties: 0,
    rebound50s: 0,
    freesFor: 0,
    freesAgainst: 0,
    contestedMarks: 0,
    scoreInvolvements: 0,
    metresGained: 0,
    turnovers: 0,
    intercepts: 0,
    onePercenters: 0,
    bounces: 0,
    clangers: 0,
    goalAssists: 0,
  }
}

/**
 * Generate position object with ratings.
 */
function generatePosition(
  rng: SeededRNG,
  primary: PlayerPositionType,
  secondary: PlayerPositionType[],
): PlayerPosition {
  const ratings: Partial<Record<PlayerPositionType, number>> = {}
  ratings[primary] = rng.nextInt(75, 95)
  for (const sec of secondary) {
    ratings[sec] = rng.nextInt(50, 78)
  }
  return { primary, secondary, ratings }
}

/**
 * Generate a date of birth string for a player of a given age.
 * Uses 2026 as the "current year" reference.
 */
function generateDOB(rng: SeededRNG, age: number): string {
  const currentYear = 2026
  const birthYear = currentYear - age
  const month = rng.nextInt(1, 12)
  const maxDay = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  const day = rng.nextInt(1, maxDay)
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${birthYear}-${mm}-${dd}`
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a full squad of ~42 realistic AFL players for the given club.
 *
 * @param clubId - The club identifier to stamp on every player.
 * @param seed   - Optional numeric seed for the RNG. Defaults to a hash of
 *                 the clubId so each club always gets a deterministic roster.
 */
export function generatePlayers(
  clubId: string,
  seed?: number,
  options?: GeneratePlayersOptions,
): Player[] {
  // Derive a deterministic seed from the clubId if none provided.
  const derivedSeed = seed ?? hashString(clubId)
  const rng = new SeededRNG(derivedSeed)

  const templates = buildSquadTemplates()
  const players: Player[] = []
  const competitionStrength = options?.competitionStrength ?? 'afl'

  // Shuffle names to avoid repeating patterns across clubs
  const firstNames = rng.shuffle([...FIRST_NAMES])
  const lastNames = rng.shuffle([...LAST_NAMES])

  // Track used jersey numbers
  const usedNumbers = new Set<number>()

  for (let i = 0; i < templates.length; i++) {
    const tmpl = templates[i]
    const isRookie = tmpl.isRookie ?? false

    // --- Name ---
    const firstName = firstNames[i % firstNames.length]
    const lastName = lastNames[i % lastNames.length]

    // --- Age ---
    const age = generateAge(rng, isRookie)

    // --- Jersey number (1-50, avoid duplicates) ---
    let jersey: number
    do {
      jersey = rng.nextInt(1, 50)
    } while (usedNumbers.has(jersey))
    usedNumbers.add(jersey)

    // --- Physical ---
    const height = rng.nextInt(tmpl.heightRange[0], tmpl.heightRange[1])
    const weight = rng.nextInt(tmpl.weightRange[0], tmpl.weightRange[1])

    // --- Position ---
    const position = generatePosition(rng, tmpl.primary, tmpl.secondary)

    // --- Attributes ---
    const attributes = generateAttributes(rng, age, tmpl.biases, isRookie, competitionStrength)
    const overall = getOverall(attributes)

    // --- Hidden ---
    const hiddenAttributes = generateHiddenAttributes(rng, age)

    // --- Personality ---
    const personality = generatePersonality(rng)

    // --- Agent archetype & home state ---
    const agentArchetype = deriveAgentArchetype(personality, rng)
    const clubState = getClubState(clubId)
    const homeState = rng.chance(0.55) ? clubState : rng.pick(['VIC', 'SA', 'WA', 'NSW', 'QLD', 'TAS', 'NT'])

    // --- Contract ---
    const contract = generateContract(rng, age, isRookie, overall)

    // --- Draft info ---
    const draftYear = 2026 - (age - 18) + rng.nextInt(0, 1)
    const draftPick: number | null = isRookie ? null : rng.nextInt(1, 75)

    // --- Morale / fitness / fatigue / form ---
    const morale = rng.nextInt(60, 85)
    const fitness = rng.nextInt(80, 100)
    const fatigue = rng.nextInt(0, 20)
    const form = rng.nextInt(40, 70)

    // --- Stats ---
    const careerStats = generateCareerStats(rng, age, tmpl.primary, isRookie, overall)
    const seasonStats = emptyStats()

    const player: Player = {
      id: `${clubId}-player-${String(i + 1).padStart(3, '0')}`,
      firstName,
      lastName,
      age,
      dateOfBirth: generateDOB(rng, age),
      clubId,
      jerseyNumber: jersey,
      height,
      weight,
      position,
      preferredRole: mapPrimaryPositionToPreferredRole(position.primary),
      archetype: pickArchetypeForRole(
        mapPrimaryPositionToPreferredRole(position.primary),
        rng.next(),
      ),
      attributes,
      hiddenAttributes,
      personality,
      agentArchetype,
      homeState,
      contract,
      morale,
      fitness,
      fatigue,
      form,
      injury: null,
      isRookie,
      listStatus: 'senior',
      draftYear,
      draftPick,
      careerStats,
      seasonStats,
      injuryHistory: [],
      trainingFocus: null,
      upskillPlans: [],
    }

    players.push(player)
  }

  if (options?.enforceCapCompliance !== false) {
    normalizeContractsToCap(players, options?.salaryCapAmount ?? 15_500_000)
  }

  return players
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Simple djb2 hash to derive a numeric seed from a string. */
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}
