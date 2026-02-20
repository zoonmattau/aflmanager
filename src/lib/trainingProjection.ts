/**
 * Training projection utility.
 *
 * Computes expected offseason attribute change ranges for a player under a
 * given player training focus, using the same multipliers as the actual
 * development engine but returning [min, max] bounds instead of a single
 * random roll — preserving uncertainty for the player.
 */

import type { Player, PlayerAttributes, PlayerTrainingFocus } from '@/types/player'
import type { TrainingFocus } from '@/engine/training/trainingEngine'
import {
  PLAYER_TRAINING_FOCUS_ATTRIBUTES,
  getPlayerTrainingFocusAttributeMultiplier,
} from '@/engine/players/trainingFocus'
import type { StaffMember } from '@/types/staff'
import type { Club } from '@/types/club'
import { getCoachingImpact } from '@/engine/staff/staffEngine'
import { getCultureDevelopmentModifier } from '@/engine/culture/cultureEngine'

// ---------------------------------------------------------------------------
// Re-implement the engine constants locally so we don't couple UI to internals
// ---------------------------------------------------------------------------

const PHYSICAL_ATTRIBUTES: (keyof PlayerAttributes)[] = [
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
]

const MENTAL_ATTRIBUTES: (keyof PlayerAttributes)[] = [
  'pressure', 'leadership', 'workRate', 'consistency', 'determination',
  'teamPlayer', 'clutch', 'disposalDecision', 'positioning', 'creativity',
  'anticipation', 'composure', 'zonalAwareness',
]

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

function getTeamFocusMul(key: keyof PlayerAttributes, trainingFocus: TrainingFocus | null | undefined): number {
  if (!trainingFocus) return 1
  const focused = FOCUS_ATTRIBUTE_MAP[trainingFocus]
  if (!focused) return 1
  return focused.includes(key) ? 1.14 : 0.96
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// ---------------------------------------------------------------------------
// Phase determination
// ---------------------------------------------------------------------------

export type DevelopmentPhase = 'growth' | 'peak' | 'decline'

export function getPlayerPhase(
  age: number,
  peakAgeStart: number,
  peakAgeEnd: number,
): DevelopmentPhase {
  if (age < peakAgeStart) return 'growth'
  if (age <= peakAgeEnd) return 'peak'
  return 'decline'
}

// ---------------------------------------------------------------------------
// Context modifiers from club/staff
// ---------------------------------------------------------------------------

export interface ProjectionContext {
  coachingModifier: number   // 0.78–1.28
  facilitiesModifier: number // 0.82–1.22
  cultureModifier: number   // 0.85–1.20
  teamTrainingFocus: TrainingFocus | null
  /** Display strings for the modifier panel */
  coachingPct: number  // e.g. +12 means +12%
  facilitiesPct: number
  culturePct: number
}

export function computeProjectionContext(
  club: Club,
  staff: StaffMember[],
): ProjectionContext {
  const coaching = getCoachingImpact(staff, club.id)
  const coachingModifier = clamp(
    0.82 + coaching.developmentBonus * 0.26 + coaching.moraleBonus * 0.12 + coaching.fitnessBonus * 0.08,
    0.78, 1.28,
  )
  const f = club.facilities
  const weighted = (
    f.trainingGround * 0.24 +
    f.gym * 0.24 +
    f.analysisSuite * 0.16 +
    f.recoveryPool * 0.12 +
    f.medicalCentre * 0.08 +
    f.youthAcademy * 0.16
  ) / 5
  const facilitiesModifier = clamp(0.78 + weighted * 0.28, 0.82, 1.22)
  const cultureModifier = clamp(getCultureDevelopmentModifier(club.culture), 0.85, 1.20)

  return {
    coachingModifier,
    facilitiesModifier,
    cultureModifier,
    teamTrainingFocus: null, // caller can set this if desired
    coachingPct: Math.round((coachingModifier - 1) * 100),
    facilitiesPct: Math.round((facilitiesModifier - 1) * 100),
    culturePct: Math.round((cultureModifier - 1) * 100),
  }
}

// ---------------------------------------------------------------------------
// Per-attribute projection
// ---------------------------------------------------------------------------

export interface AttributeProjection {
  key: keyof PlayerAttributes
  current: number
  minChange: number
  maxChange: number
  /** Positive = growth/boost, Negative = decline */
  direction: 'up' | 'down' | 'neutral'
  /** True if this attribute is in the player focus boost group */
  isFocused: boolean
  /** True if penalised (not in player focus) */
  isPenalised: boolean
}

export interface TrainingProjectionResult {
  phase: DevelopmentPhase
  topAttributes: AttributeProjection[]    // top 5 boosted
  penalisedAttributes: (keyof PlayerAttributes)[] // attrs that get 0.985x
  allProjections: AttributeProjection[]
  context: ProjectionContext
  playerFocusLabel: string | null
  phaseLabel: string
  devRateLabel: string | null  // only shown if scouted
  hasDevRateRevealed: boolean
}

/**
 * Compute the offseason projection for a player under a given focus.
 *
 * We use the min/max bounds of the random draws in the engine:
 *   - growth: rng(0.15, 1.7)  → use 0.15 for min, 1.7 for max
 *   - peak:   rng(-1.2, 1.2)  → drifts both ways
 *   - decline: rng(0.12, 1.65) → use 0.12 for min loss, 1.65 for max loss
 *
 * We apply all deterministic multipliers but use mid-range randomness (1.0)
 * so the range bands represent coaching/facilities conditions.
 */
export function computeTrainingProjection(
  player: Player,
  playerFocus: PlayerTrainingFocus | null,
  ctx: ProjectionContext,
): TrainingProjectionResult {
  const { hiddenAttributes, age } = player
  const { peakAgeStart, peakAgeEnd, developmentRate, declineRate, potentialCeiling } = hiddenAttributes

  const phase = getPlayerPhase(age, peakAgeStart, peakAgeEnd)

  const globalDevMul = ctx.coachingModifier * ctx.facilitiesModifier * ctx.cultureModifier
  // Use mid-range randomness (1.0) as baseline; min/max will be encoded in rng bounds
  const globalMin = ctx.coachingModifier * ctx.facilitiesModifier * ctx.cultureModifier * 0.88
  const globalMax = ctx.coachingModifier * ctx.facilitiesModifier * ctx.cultureModifier * 1.12

  const values = Object.values(player.attributes)
  const avgOverall = values.reduce((s, v) => s + v, 0) / values.length
  const capHeadroom = clamp((potentialCeiling - avgOverall) / 24, -0.4, 1.2)
  const capPressureMul = phase === 'growth' ? clamp(0.65 + capHeadroom, 0.2, 1.35) : 1

  const focusedKeys: (keyof PlayerAttributes)[] = playerFocus
    ? PLAYER_TRAINING_FOCUS_ATTRIBUTES[playerFocus]
    : []

  const allProjections: AttributeProjection[] = ALL_ATTRIBUTE_KEYS.map((key) => {
    const current = player.attributes[key]
    const isMental = MENTAL_ATTRIBUTES.includes(key)
    const isPhysical = PHYSICAL_ATTRIBUTES.includes(key)
    const isFocused = focusedKeys.includes(key)
    const isPenalised = playerFocus !== null && !isFocused

    const teamFocusMul = getTeamFocusMul(key, ctx.teamTrainingFocus)
    const playerFocusMul = getPlayerTrainingFocusAttributeMultiplier(playerFocus, key)

    let minChange = 0
    let maxChange = 0

    if (phase === 'growth') {
      let typeMultiplier = 1
      if (age <= 21) {
        if (isPhysical) typeMultiplier = 1.22
        else if (isMental) typeMultiplier = 0.9
      }
      const ageFactor = age <= 19 ? 1.5 : age <= 21 ? 1.2 : 0.8
      const cap = Math.min(99, potentialCeiling + (isMental ? 2 : 0))
      const headroom = cap - current

      const commonMul = developmentRate * ageFactor * typeMultiplier * teamFocusMul * playerFocusMul * capPressureMul

      minChange = Math.min(headroom, 0.15 * commonMul * globalMin)
      maxChange = Math.min(headroom, 1.7 * commonMul * globalMax)
      minChange = Math.max(0, minChange)
      maxChange = Math.max(0, maxChange)
    } else if (phase === 'peak') {
      const stability = clamp(1.15 - Math.abs(globalDevMul - 1) * 0.5, 0.75, 1.25)
      const swing = 1.2 * stability * teamFocusMul * playerFocusMul
      minChange = -swing
      maxChange = swing
    } else {
      // decline
      const yearsPostPeak = age - peakAgeEnd
      const ageFactor = yearsPostPeak <= 2 ? 0.5 : yearsPostPeak <= 4 ? 1.0 : 1.5
      const mentalProtection = isMental ? 0.4 : 1
      const physicalPenalty = isPhysical ? 1.15 : 1
      const trainingProtection = teamFocusMul * playerFocusMul > 1 ? 0.92 : 1.03
      const coachingProtect = clamp(2 - globalDevMul, 0.75, 1.35)

      const commonMul = declineRate * ageFactor * mentalProtection * physicalPenalty * trainingProtection * coachingProtect

      // decline is subtracted, so minChange (least loss) uses small rng, maxChange (most loss) uses large
      minChange = -(0.12 * commonMul * 0.88)
      maxChange = -(1.65 * commonMul * 1.12)
      // ensure maxChange <= minChange (more negative = larger decline)
      if (maxChange > minChange) [minChange, maxChange] = [maxChange, minChange]
    }

    const direction: AttributeProjection['direction'] =
      phase === 'growth' ? 'up'
        : phase === 'decline' ? 'down'
          : 'neutral'

    return {
      key,
      current,
      minChange,
      maxChange,
      direction,
      isFocused,
      isPenalised,
    }
  })

  // Top 5: for growth/peak → highest maxChange; for decline → smallest magnitude of decline (least negative maxChange)
  const topAttributes = [...allProjections]
    .filter((a) => phase === 'growth' ? a.maxChange > 0 : true)
    .sort((a, b) => {
      if (phase === 'decline') {
        // least decline first
        return b.maxChange - a.maxChange
      }
      return b.maxChange - a.maxChange
    })
    .slice(0, 5)

  // Penalised: attributes NOT in player focus (only relevant when a focus is set)
  const penalisedAttributes = playerFocus
    ? ALL_ATTRIBUTE_KEYS.filter((k) => !focusedKeys.includes(k))
    : []

  // Phase label
  const phaseLabel =
    phase === 'growth' ? 'Growth phase — strong development expected'
      : phase === 'peak' ? 'Peak phase — attributes stable, minor drift'
        : `Decline phase — attribute loss expected`

  // Dev rate label — always show for the user's own players (they're coaching them)
  const devRate = hiddenAttributes.developmentRate
  const hasDevRateRevealed = true
  let devRateLabel: string | null = null
  if (devRate >= 1.5) devRateLabel = 'Elite developer'
  else if (devRate >= 1.2) devRateLabel = 'Fast developer'
  else if (devRate >= 0.9) devRateLabel = 'Average developer'
  else devRateLabel = 'Slow developer'

  return {
    phase,
    topAttributes,
    penalisedAttributes,
    allProjections,
    context: ctx,
    playerFocusLabel: null,
    phaseLabel,
    devRateLabel,
    hasDevRateRevealed,
  }
}
