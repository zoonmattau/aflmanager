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
  PlayerJumperPreference,
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
import { auditAndNormalizeAttributes } from '@/engine/player/attributeAudit'
import { syncPlayerPositionRatings } from '@/engine/player/playerRating'

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

type AttributeBounds = { min: number; max: number }

const POSITION_ATTRIBUTE_BOUNDS: Record<PlayerPositionType, Partial<Record<keyof PlayerAttributes, AttributeBounds>>> = {
  BP: {
    kickingDistance: { min: 38, max: 82 },
    setShot: { min: 28, max: 72 },
    goalkicking: { min: 28, max: 72 },
    hitouts: { min: 5, max: 35 },
    ruckCreative: { min: 5, max: 34 },
    followUp: { min: 8, max: 44 },
  },
  FB: {
    kickingDistance: { min: 36, max: 80 },
    setShot: { min: 28, max: 72 },
    goalkicking: { min: 28, max: 70 },
    hitouts: { min: 5, max: 42 },
    ruckCreative: { min: 5, max: 38 },
    followUp: { min: 10, max: 46 },
  },
  HBF: {
    hitouts: { min: 5, max: 36 },
    ruckCreative: { min: 5, max: 34 },
    followUp: { min: 10, max: 44 },
  },
  CHB: {
    setShot: { min: 30, max: 76 },
    goalkicking: { min: 30, max: 76 },
    hitouts: { min: 5, max: 50 },
    ruckCreative: { min: 5, max: 42 },
    followUp: { min: 10, max: 52 },
  },
  W: {
    hitouts: { min: 5, max: 30 },
    ruckCreative: { min: 5, max: 28 },
    followUp: { min: 8, max: 36 },
    markingContested: { min: 28, max: 78 },
    setShot: { min: 34, max: 80 },
  },
  IM: {
    hitouts: { min: 5, max: 36 },
    ruckCreative: { min: 5, max: 34 },
    followUp: { min: 12, max: 48 },
  },
  OM: {
    hitouts: { min: 5, max: 30 },
    ruckCreative: { min: 5, max: 28 },
    followUp: { min: 10, max: 40 },
    centreBounce: { min: 30, max: 86 },
  },
  RK: {
    kickingEfficiency: { min: 30, max: 82 },
    kickingDistance: { min: 28, max: 78 },
    setShot: { min: 24, max: 74 },
    dropPunt: { min: 30, max: 80 },
    snap: { min: 20, max: 70 },
    fieldKicking: { min: 30, max: 78 },
    goalkicking: { min: 22, max: 72 },
    hitouts: { min: 60, max: 96 },
    ruckCreative: { min: 52, max: 94 },
    followUp: { min: 44, max: 90 },
    centreBounce: { min: 32, max: 84 },
    boundaryThrowIn: { min: 38, max: 90 },
    stoppage: { min: 40, max: 92 },
  },
  HFF: {
    hitouts: { min: 5, max: 34 },
    ruckCreative: { min: 5, max: 30 },
    followUp: { min: 8, max: 38 },
    oneOnOne: { min: 26, max: 82 },
    spoiling: { min: 22, max: 78 },
  },
  CHF: {
    hitouts: { min: 5, max: 58 },
    ruckCreative: { min: 5, max: 52 },
    followUp: { min: 10, max: 64 },
    intercept: { min: 24, max: 82 },
    spoiling: { min: 24, max: 80 },
  },
  FP: {
    hitouts: { min: 5, max: 24 },
    ruckCreative: { min: 5, max: 22 },
    followUp: { min: 8, max: 28 },
    markingOverhead: { min: 20, max: 76 },
    markingContested: { min: 22, max: 78 },
  },
  FF: {
    hitouts: { min: 5, max: 48 },
    ruckCreative: { min: 5, max: 42 },
    followUp: { min: 10, max: 56 },
    intercept: { min: 20, max: 78 },
    spoiling: { min: 20, max: 76 },
  },
}

function getOverall(attrs: PlayerAttributes): number {
  let total = 0
  for (const key of ALL_ATTRIBUTE_KEYS) total += attrs[key]
  return total / ALL_ATTRIBUTE_KEYS.length
}

function centeredNoise(rng: SeededRNG, amplitude: number): number {
  const tri = (rng.next() + rng.next() + rng.next()) / 3
  return (tri - 0.5) * 2 * amplitude
}

function getBaseAttributeBounds(
  attr: keyof PlayerAttributes,
  age: number,
  isRookie: boolean,
  competitionStrength: CompetitionStrength,
): AttributeBounds {
  let min = 34
  let max = 90

  if (competitionStrength === 'state-strong') {
    min = 26
    max = 84
  } else if (competitionStrength === 'state-weak') {
    min = 18
    max = 78
  }

  if (isRookie) {
    min -= 4
    max -= 5
  }

  const cat = attrCategory(attr)
  if (cat === 'mental') {
    min += 2
    max += 2
    if (age <= 21) {
      max -= 4
    } else if (age >= 30) {
      min += 2
      max += 1
    }
  } else if (cat === 'physical') {
    if (age <= 21) {
      min -= 1
      max -= 1
    } else if (age >= 31) {
      max -= 4
    }
  }

  return { min: clamp(min, 5, 95), max: clamp(max, min + 6, 97) }
}

function resolveAttributeBounds(
  primary: PlayerPositionType,
  attr: keyof PlayerAttributes,
  age: number,
  isRookie: boolean,
  competitionStrength: CompetitionStrength,
): AttributeBounds {
  const base = getBaseAttributeBounds(attr, age, isRookie, competitionStrength)
  const posBounds = POSITION_ATTRIBUTE_BOUNDS[primary]?.[attr]
  if (!posBounds) return base
  return {
    min: Math.max(base.min, posBounds.min),
    max: Math.min(base.max, posBounds.max),
  }
}

function applyEliteRarity(
  value: number,
  attr: keyof PlayerAttributes,
  bias: number,
  targetOverall: number,
  primary: PlayerPositionType,
  rng: SeededRNG,
): number {
  let adjusted = value
  if (adjusted > 88) adjusted = 88 + (adjusted - 88) * 0.55
  if (adjusted > 93) adjusted = 93 + (adjusted - 93) * 0.35

  const isTrueSpecialist = bias >= 0.85
  const isElitePlayer = targetOverall >= 86
  const rare99Gate = isTrueSpecialist && isElitePlayer && rng.chance(primary === 'RK' && attr === 'hitouts' ? 0.02 : 0.01)
  const rare96Gate = (isTrueSpecialist || isElitePlayer) && rng.chance(0.08)

  if (adjusted > 95 && !rare96Gate) {
    adjusted = 95 - rng.nextFloat(0, 1.4)
  }
  const rounded = Math.round(adjusted)
  if (rounded >= 99 && !rare99Gate) {
    return 98
  }
  return rounded
}

function normalizeAttributesToTarget(
  attrs: Record<keyof PlayerAttributes, number>,
  targetOverall: number,
  biases: Partial<Record<keyof PlayerAttributes, number>>,
  boundsByAttr: Record<keyof PlayerAttributes, AttributeBounds>,
): void {
  for (let pass = 0; pass < 8; pass++) {
    const currentOverall = getOverall(attrs as PlayerAttributes)
    const delta = targetOverall - currentOverall
    if (Math.abs(delta) <= 0.12) break

    const increasing = delta > 0
    let totalWeight = 0
    const weights = {} as Record<keyof PlayerAttributes, number>
    for (const key of ALL_ATTRIBUTE_KEYS) {
      const bounds = boundsByAttr[key]
      const room = increasing ? bounds.max - attrs[key] : attrs[key] - bounds.min
      if (room <= 0) {
        weights[key] = 0
        continue
      }
      const bias = biases[key] ?? 0
      const identityWeight = increasing ? (0.8 + bias * 1.5) : (1.0 + (1 - bias) * 0.8)
      const weight = identityWeight * (1 + room / 18)
      weights[key] = weight
      totalWeight += weight
    }

    if (totalWeight <= 0.001) break
    for (const key of ALL_ATTRIBUTE_KEYS) {
      const weight = weights[key]
      if (weight <= 0) continue
      const step = (delta * weight) / totalWeight * 1.45
      const bounds = boundsByAttr[key]
      attrs[key] = clamp(Math.round(attrs[key] + step), bounds.min, bounds.max)
    }
  }
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

  // AFL: centered around ~70 overall, with thin top-end tail.
  if (roll < 0.04) return isRookie ? rng.nextInt(72, 80) : rng.nextInt(84, 90)
  if (roll < 0.26) return isRookie ? rng.nextInt(64, 72) : rng.nextInt(74, 82)
  if (roll < 0.76) return isRookie ? rng.nextInt(56, 66) : rng.nextInt(66, 74)
  if (roll < 0.96) return isRookie ? rng.nextInt(48, 58) : rng.nextInt(58, 65)
  return isRookie ? rng.nextInt(38, 48) : rng.nextInt(48, 57)
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
  primary: PlayerPositionType,
  age: number,
  biases: Partial<Record<keyof PlayerAttributes, number>>,
  isRookie: boolean,
  competitionStrength: CompetitionStrength,
): PlayerAttributes {
  const baseTarget = pickTargetOverall(rng, isRookie, competitionStrength)
  const targetOverall = clamp(baseTarget + ageOverallAdjustment(age) + (isRookie ? -2 : 0), 20, 92)
  const attrs = {} as Record<keyof PlayerAttributes, number>
  const boundsByAttr = {} as Record<keyof PlayerAttributes, AttributeBounds>

  for (const attr of ALL_ATTRIBUTE_KEYS) {
    const bias = biases[attr] ?? 0
    const bounds = resolveAttributeBounds(primary, attr, age, isRookie, competitionStrength)
    boundsByAttr[attr] = bounds
    const cat = attrCategory(attr)
    const catMult = ageMultiplier(age, cat)
    const spread = cat === 'mental' ? 8 : cat === 'physical' ? 9 : 10
    const base = targetOverall + centeredNoise(rng, spread)
    const biasShift = bias * 10 - (1 - bias) * 3.5
    const ageShift = (catMult - 1) * 8
    const raw = base + biasShift + ageShift
    const bounded = clamp(raw, bounds.min, bounds.max)
    attrs[attr] = clamp(applyEliteRarity(bounded, attr, bias, targetOverall, primary, rng), bounds.min, bounds.max)
  }

  // Leadership scales heavily with age
  if (age >= 28) {
    const bounds = boundsByAttr.leadership
    attrs.leadership = clamp(attrs.leadership + rng.nextInt(4, 10), bounds.min, bounds.max)
  } else if (age <= 21) {
    const bounds = boundsByAttr.leadership
    attrs.leadership = clamp(attrs.leadership - rng.nextInt(3, 8), bounds.min, bounds.max)
  }

  // Bounded normalization preserves position identity while nudging toward target.
  normalizeAttributesToTarget(attrs, targetOverall, biases, boundsByAttr)

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

function generateJumperPreference(
  rng: SeededRNG,
  currentNumber: number,
): PlayerJumperPreference | undefined {
  const roll = rng.nextFloat(0, 1)
  if (roll >= 0.55) return undefined

  const level: PlayerJumperPreference['level'] = roll < 0.16 ? 'demand' : 'want'
  const preferredCount = level === 'demand' ? rng.nextInt(1, 2) : rng.nextInt(1, 3)
  const preferred = new Set<number>([currentNumber])
  while (preferred.size < preferredCount) {
    preferred.add(rng.nextInt(1, 50))
  }

  return {
    level,
    preferredNumbers: Array.from(preferred).sort((a, b) => a - b),
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

    // --- Hidden ---
    const hiddenAttributes = generateHiddenAttributes(rng, age)

    // --- Attributes ---
    const generatedAttributes = generateAttributes(rng, tmpl.primary, age, tmpl.biases, isRookie, competitionStrength)
    const { attributes } = auditAndNormalizeAttributes(tmpl.primary, generatedAttributes, {
      stage: 'generation',
      hiddenAttributes,
    })
    const overall = getOverall(attributes)

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
      jumperHistory: [{ year: 2026, clubId, jumperNumber: jersey }],
      jumperPreference: generateJumperPreference(rng, jersey),
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
      contractTier: 'afl-listed',
      stateLeagueContract: null,
      contractHistory: [],
    }
    syncPlayerPositionRatings(player)

    players.push(player)
  }

  if (options?.enforceCapCompliance !== false) {
    normalizeContractsToCap(players, options?.salaryCapAmount ?? 15_500_000)
  }

  return players
}

export function generateStateLeagueContractPlayers(
  clubId: string,
  seed: number,
  targetCount: number,
  signedDate = '2026-01-01',
): Player[] {
  const source = generatePlayers(`${clubId}-state`, seed, {
    competitionStrength: 'state-strong',
    enforceCapCompliance: false,
  })

  return source.slice(0, Math.max(0, targetCount)).map((player, idx) => {
    const yearsRemaining = (idx % 3 === 0) ? 2 : 1
    const annualValue = 55_000 + ((idx % 8) * 5_000)
    const contract = {
      ...player.contract,
      yearsRemaining: 0,
      aav: 0,
      yearByYear: [],
      isRestricted: false,
    }
    return {
      ...player,
      id: `${clubId}-state-player-${String(idx + 1).padStart(3, '0')}`,
      clubId,
      listStatus: 'reserves',
      isRookie: false,
      contract,
      jumperHistory: [{ year: Number(signedDate.slice(0, 4)), clubId, jumperNumber: player.jerseyNumber }],
      contractTier: 'state-league',
      stateLeagueContract: {
        yearsRemaining,
        annualValue,
        signedDate,
        source: 'affiliate',
      },
      contractHistory: [{
        date: signedDate,
        type: 'state-sign',
        note: 'Signed to affiliate state-league contract.',
      }],
      careerStats: emptyStats(),
      seasonStats: emptyStats(),
    } satisfies Player
  })
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
