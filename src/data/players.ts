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
  PositionGroup,
  HiddenAttributes,
} from '@/types/player'
import { FIRST_NAMES, LAST_NAMES } from './names'

// ---------------------------------------------------------------------------
// Types internal to generation
// ---------------------------------------------------------------------------

/** Role template that drives how a player slot is generated. */
interface RoleTemplate {
  primary: PositionGroup
  secondary: PositionGroup[]
  heightRange: [number, number]
  weightRange: [number, number]
  /** Attribute biases – keys are PlayerAttributes fields, values 0-1 weight. */
  biases: Partial<Record<keyof PlayerAttributes, number>>
  isRookie?: boolean
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

  // ---- Defenders (7) ----
  // Key defenders / full-backs
  for (let i = 0; i < 3; i++) {
    templates.push({
      primary: 'FB',
      secondary: ['HB'],
      heightRange: [188, 200],
      weightRange: [88, 98],
      biases: {
        intercept: 0.9, spoiling: 0.85, oneOnOne: 0.9, markingContested: 0.8,
        markingOverhead: 0.85, positioning: 0.8, strength: 0.7,
      },
    })
  }
  // Half-backs / rebounding defenders
  for (let i = 0; i < 4; i++) {
    templates.push({
      primary: 'HB',
      secondary: ['FB', 'WING'],
      heightRange: [182, 195],
      weightRange: [82, 93],
      biases: {
        kickingEfficiency: 0.85, kickingDistance: 0.8, fieldKicking: 0.85,
        intercept: 0.75, speed: 0.75, disposalDecision: 0.8,
        markingLeading: 0.7, positioning: 0.75,
      },
    })
  }

  // ---- Midfielders (9) ----
  // Inside midfielders
  for (let i = 0; i < 5; i++) {
    templates.push({
      primary: 'MID',
      secondary: ['C'],
      heightRange: [182, 192],
      weightRange: [83, 93],
      biases: {
        contested: 0.9, groundBallGet: 0.9, tackling: 0.85, endurance: 0.9,
        handballEfficiency: 0.8, workRate: 0.85,
        disposalDecision: 0.8, pressure: 0.8, strength: 0.7,
      },
    })
  }
  // Outside midfielders / centre-line
  for (let i = 0; i < 4; i++) {
    templates.push({
      primary: 'C',
      secondary: ['MID', 'WING'],
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
      primary: 'WING',
      secondary: ['C', 'HB'],
      heightRange: [180, 190],
      weightRange: [78, 88],
      biases: {
        speed: 0.9, acceleration: 0.85, endurance: 0.85, agility: 0.85,
        kickingEfficiency: 0.8, disposalDecision: 0.75, workRate: 0.8,
        fieldKicking: 0.75,
      },
    })
  }

  // ---- Forwards (7) ----
  // Key forwards / full-forwards
  for (let i = 0; i < 3; i++) {
    templates.push({
      primary: 'FF',
      secondary: ['HF'],
      heightRange: [190, 202],
      weightRange: [92, 105],
      biases: {
        goalkicking: 0.9, markingContested: 0.85, markingOverhead: 0.85,
        setShot: 0.85, insideForward: 0.8, strength: 0.8,
        markingLeading: 0.8, positioning: 0.7,
      },
    })
  }
  // Half-forwards / crumbing forwards
  for (let i = 0; i < 4; i++) {
    templates.push({
      primary: 'HF',
      secondary: ['FF', 'MID'],
      heightRange: [178, 192],
      weightRange: [80, 93],
      biases: {
        goalkicking: 0.8, speed: 0.8, agility: 0.8, groundBallGet: 0.75,
        creativity: 0.75, pressure: 0.8, insideForward: 0.75,
        markingLeading: 0.75, acceleration: 0.75,
      },
    })
  }

  // ---- Rucks (3) ----
  for (let i = 0; i < 3; i++) {
    templates.push({
      primary: 'FOLL',
      secondary: ['FF'],
      heightRange: [198, 205],
      weightRange: [98, 108],
      biases: {
        hitouts: 0.95, ruckCreative: 0.85, strength: 0.85,
        markingOverhead: 0.8, endurance: 0.7, tackling: 0.7,
        contested: 0.75, positioning: 0.7,
      },
    })
  }

  // ---- Utilities (5) ----
  for (let i = 0; i < 5; i++) {
    const utilPositions: PositionGroup[] = ['HB', 'HF', 'MID', 'WING', 'C']
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
    const rookiePositions: PositionGroup[] = ['MID', 'HB', 'HF', 'FF', 'FOLL']
    const primary = rookiePositions[i % rookiePositions.length]
    const heightRange: [number, number] = primary === 'FOLL'
      ? [196, 204]
      : primary === 'FF'
        ? [188, 200]
        : [178, 192]
    const weightRange: [number, number] = primary === 'FOLL'
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
  'speed', 'acceleration', 'endurance', 'strength', 'agility',
]

const MENTAL_ATTRS: (keyof PlayerAttributes)[] = [
  'disposalDecision', 'positioning', 'creativity', 'leadership', 'workRate', 'consistency',
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

/**
 * Build the full PlayerAttributes object for a player.
 */
function generateAttributes(
  rng: SeededRNG,
  age: number,
  biases: Partial<Record<keyof PlayerAttributes, number>>,
  isRookie: boolean,
): PlayerAttributes {
  const ALL_ATTRS: (keyof PlayerAttributes)[] = [
    'kickingEfficiency', 'kickingDistance', 'setShot',
    'handballEfficiency', 'handballDistance',
    'markingOverhead', 'markingLeading', 'markingContested',
    'speed', 'acceleration', 'endurance', 'strength', 'agility',
    'tackling', 'contested',
    'disposalDecision', 'fieldKicking', 'positioning', 'creativity',
    'goalkicking', 'groundBallGet', 'insideForward',
    'intercept', 'spoiling', 'oneOnOne',
    'hitouts', 'ruckCreative',
    'pressure', 'leadership', 'workRate', 'consistency',
  ]

  const rookieDebuff = isRookie ? 0.78 : 1.0

  const attrs = {} as Record<keyof PlayerAttributes, number>
  for (const attr of ALL_ATTRS) {
    const bias = biases[attr] ?? 0
    const cat = attrCategory(attr)
    const ageMul = ageMultiplier(age, cat)

    // Base range: 30-65 for unbiased, pushed up by bias
    const baseFloor = 30 + bias * 12
    const baseCeiling = 65 + bias * 20

    const raw = rng.nextFloat(baseFloor, Math.min(baseCeiling, 98))
    const scaled = raw * ageMul * rookieDebuff

    // Add a small random jitter so not every attribute for a position feels identical
    const jitter = rng.nextFloat(-3, 3)

    attrs[attr] = clamp(Math.round(scaled + jitter), 1, 100)
  }

  // Special: hitouts and ruckCreative should be very low for non-rucks
  if (!biases.hitouts || biases.hitouts < 0.3) {
    attrs.hitouts = clamp(rng.nextInt(5, 20), 1, 100)
    attrs.ruckCreative = clamp(rng.nextInt(5, 20), 1, 100)
  }

  // Leadership scales heavily with age
  if (age >= 28) {
    attrs.leadership = clamp(attrs.leadership + rng.nextInt(5, 15), 1, 100)
  } else if (age <= 21) {
    attrs.leadership = clamp(attrs.leadership - rng.nextInt(5, 15), 1, 100)
  }

  return attrs as PlayerAttributes
}

/**
 * Generate hidden attributes for a player.
 */
function generateHiddenAttributes(rng: SeededRNG, age: number, _isRookie: boolean): HiddenAttributes {
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
function generateContract(rng: SeededRNG, age: number, isRookie: boolean): PlayerContract {
  let yearsRemaining: number
  let aav: number

  if (isRookie) {
    yearsRemaining = rng.nextInt(2, 3)
    aav = rng.nextInt(110, 200) * 1000
  } else if (age <= 22) {
    yearsRemaining = rng.nextInt(2, 4)
    aav = rng.nextInt(150, 400) * 1000
  } else if (age <= 28) {
    yearsRemaining = rng.nextInt(1, 5)
    aav = rng.nextInt(300, 900) * 1000
  } else if (age <= 32) {
    yearsRemaining = rng.nextInt(1, 3)
    aav = rng.nextInt(350, 1200) * 1000
  } else {
    yearsRemaining = rng.nextInt(1, 2)
    aav = rng.nextInt(200, 600) * 1000
  }

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
  primary: PositionGroup,
  isRookie: boolean,
): PlayerCareerStats {
  if (isRookie || age <= 18) {
    return emptyStats()
  }

  // Estimate career games based on age
  const yearsInAFL = age - 18
  const avgGamesPerYear = rng.nextFloat(12, 20)
  const gamesPlayed = Math.round(yearsInAFL * avgGamesPerYear)

  // Goals depend on position
  let goalsPerGame: number
  if (primary === 'FF') goalsPerGame = rng.nextFloat(1.2, 2.5)
  else if (primary === 'HF') goalsPerGame = rng.nextFloat(0.5, 1.2)
  else if (primary === 'FOLL') goalsPerGame = rng.nextFloat(0.3, 0.8)
  else if (primary === 'MID' || primary === 'C') goalsPerGame = rng.nextFloat(0.2, 0.6)
  else if (primary === 'WING') goalsPerGame = rng.nextFloat(0.15, 0.45)
  else goalsPerGame = rng.nextFloat(0.05, 0.25) // defenders

  const goals = Math.round(gamesPlayed * goalsPerGame)
  const behinds = Math.round(goals * rng.nextFloat(0.5, 0.9))

  // Disposals per game
  let disposalsPerGame: number
  if (primary === 'MID' || primary === 'C') disposalsPerGame = rng.nextFloat(20, 28)
  else if (primary === 'WING') disposalsPerGame = rng.nextFloat(16, 24)
  else if (primary === 'HB') disposalsPerGame = rng.nextFloat(15, 22)
  else if (primary === 'HF') disposalsPerGame = rng.nextFloat(12, 18)
  else if (primary === 'FF') disposalsPerGame = rng.nextFloat(8, 14)
  else if (primary === 'FB') disposalsPerGame = rng.nextFloat(10, 16)
  else disposalsPerGame = rng.nextFloat(10, 18) // FOLL

  const disposals = Math.round(gamesPlayed * disposalsPerGame)
  const kickRatio = rng.nextFloat(0.5, 0.65)
  const kicks = Math.round(disposals * kickRatio)
  const handballs = disposals - kicks

  const marksPerGame = rng.nextFloat(3, 7)
  const marks = Math.round(gamesPlayed * marksPerGame)

  const tacklesPerGame = rng.nextFloat(2, 6)
  const tackles = Math.round(gamesPlayed * tacklesPerGame)

  const hitoutsTotal = primary === 'FOLL'
    ? Math.round(gamesPlayed * rng.nextFloat(20, 35))
    : Math.round(gamesPlayed * rng.nextFloat(0, 0.3))

  const contestedPerGame = rng.nextFloat(5, 12)
  const contestedPossessions = Math.round(gamesPlayed * contestedPerGame)

  const clearancesPerGame = primary === 'MID' || primary === 'C'
    ? rng.nextFloat(3, 7)
    : primary === 'FOLL'
      ? rng.nextFloat(2, 5)
      : rng.nextFloat(0.5, 2)
  const clearances = Math.round(gamesPlayed * clearancesPerGame)

  const insideFiftiesPerGame = rng.nextFloat(1, 5)
  const insideFifties = Math.round(gamesPlayed * insideFiftiesPerGame)

  const rebound50sPerGame = (primary === 'FB' || primary === 'HB')
    ? rng.nextFloat(2, 5)
    : rng.nextFloat(0.2, 1.5)
  const rebound50s = Math.round(gamesPlayed * rebound50sPerGame)

  return {
    gamesPlayed,
    goals,
    behinds,
    disposals,
    kicks,
    handballs,
    marks,
    tackles,
    hitouts: hitoutsTotal,
    contestedPossessions,
    clearances,
    insideFifties,
    rebound50s,
  }
}

function emptyStats(): PlayerCareerStats {
  return {
    gamesPlayed: 0,
    goals: 0,
    behinds: 0,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    tackles: 0,
    hitouts: 0,
    contestedPossessions: 0,
    clearances: 0,
    insideFifties: 0,
    rebound50s: 0,
  }
}

/**
 * Generate position object with ratings.
 */
function generatePosition(
  rng: SeededRNG,
  primary: PositionGroup,
  secondary: PositionGroup[],
): PlayerPosition {
  const ratings: Partial<Record<PositionGroup, number>> = {}
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
export function generatePlayers(clubId: string, seed?: number): Player[] {
  // Derive a deterministic seed from the clubId if none provided.
  const derivedSeed = seed ?? hashString(clubId)
  const rng = new SeededRNG(derivedSeed)

  const templates = buildSquadTemplates()
  const players: Player[] = []

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
    const attributes = generateAttributes(rng, age, tmpl.biases, isRookie)

    // --- Hidden ---
    const hiddenAttributes = generateHiddenAttributes(rng, age, isRookie)

    // --- Personality ---
    const personality = generatePersonality(rng)

    // --- Contract ---
    const contract = generateContract(rng, age, isRookie)

    // --- Draft info ---
    const draftYear = 2026 - (age - 18) + rng.nextInt(0, 1)
    const draftPick: number | null = isRookie ? null : rng.nextInt(1, 75)

    // --- Morale / fitness / fatigue / form ---
    const morale = rng.nextInt(60, 85)
    const fitness = rng.nextInt(80, 100)
    const fatigue = rng.nextInt(0, 20)
    const form = rng.nextInt(40, 70)

    // --- Stats ---
    const careerStats = generateCareerStats(rng, age, tmpl.primary, isRookie)
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
      attributes,
      hiddenAttributes,
      personality,
      contract,
      morale,
      fitness,
      fatigue,
      form,
      injury: null,
      isRookie,
      draftYear,
      draftPick,
      careerStats,
      seasonStats,
    }

    players.push(player)
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
